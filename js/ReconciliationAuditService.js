/**
 * ==============================================================================
 * MODULE: ReconciliationAuditService.js
 * MÔ TẢ: Dịch vụ ghi nhật ký kiểm toán bất biến (Immutable Audit Journal Service)
 *        - Quan hệ 1:N giữa Recon_Proposals và Recon_Audit.
 *        - Ghi nhận đầy đủ các sự kiện:
 *            + PROPOSAL_APPROVED (Duyệt đề xuất)
 *            + PROPOSAL_REJECTED (Từ chối đề xuất)
 *            + APPLY_ATTEMPT (Nhật ký bắt đầu cập nhật - Write-Ahead Journal)
 *            + APPLY_SUCCESS (Cập nhật thành công)
 *            + APPLY_FAILED (Cập nhật thất bại do lỗi hệ thống/ngoại lệ)
 *            + CONFLICT_DETECTED (Xung đột CAS do dữ liệu đã bị sửa)
 *            + ROLLBACK_ATTEMPT (Bắt đầu hoàn tác)
 *            + ROLLBACK_SUCCESS (Hoàn tác thành công)
 *            + ROLLBACK_FAILED (Hoàn tác thất bại do xung đột)
 *            + RECOVERY_ACTION (Hành động khôi phục sau crash)
 *        - BẢO MẬT TUYỆT ĐỐI: Chỉ lưu ID, tên, vai trò của người thực hiện;
 *          TUYỆT ĐỐI KHÔNG LƯU MÃ PIN trong proposal, audit hay bất kỳ trường nào.
 *        - Phân định rõ:
 *            + operation_id: Duy nhất cho mỗi lần thực thi vật lý (new operation_id per attempt).
 *            + idempotency_key: Bất biến cho cùng một thay đổi logic (giữ nguyên từ M1-B).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp cấu hình & DAO nếu chạy trong môi trường Node.js
if (typeof RECON_CONFIG === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_AUDIT_ACTION = _cfg.RECON_AUDIT_ACTION;
}

if (typeof ReconciliationDbService === 'undefined' && typeof require !== 'undefined') {
  var _db = require('./ReconciliationDbService.js');
  var ReconciliationDbService = _db.ReconciliationDbService;
}

if (typeof ReconciliationNormalizer === 'undefined' && typeof require !== 'undefined') {
  var _norm = require('./ReconciliationNormalizer.js');
  var ReconciliationNormalizer = _norm.ReconciliationNormalizer;
}

var ReconciliationAuditService = {
  /**
   * Sinh mã operation_id duy nhất cho mỗi lượt thực thi / retry vật lý
   * Định dạng: OP_YYYYMMDD_HHMMSS_<rand>
   * @returns {string}
   */
  generateOperationId: function() {
    var ts = (typeof Utilities !== 'undefined')
      ? Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss')
      : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    var rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return 'OP_' + ts + '_' + rand;
  },

  /**
   * Kiểm tra an toàn bảo mật: Tuyệt đối không lưu mã PIN
   * @param {any} userObj - Thông tin người thực hiện { id, name, role, [pin] }
   * @returns {string} Chuỗi thông tin người thực hiện an toàn "Name (Role) [ID]"
   */
  formatPerformedBy: function(userObj) {
    if (!userObj) return 'SYSTEM_AUTO';

    // Nếu người dùng truyền vào object có chứa PIN, phát hiện và loại bỏ ngay lập tức
    if (typeof userObj === 'object') {
      var uid = userObj.id || userObj.userId || userObj.user_id || 'UNKNOWN_ID';
      var uname = userObj.name || userObj.userName || userObj.user_name || 'UNKNOWN_NAME';
      var urole = userObj.role || userObj.userRole || userObj.user_role || 'STAFF';

      // Kiểm tra xem có trường PIN hay mã PIN lộ trong tên không
      if (userObj.pin || userObj.passcode || userObj.ma_pin || userObj.password) {
        // Cảnh báo an ninh nội bộ: Không ném lỗi làm dừng hệ thống nếu có thể làm sạch an toàn
        // nhưng TUYỆT ĐỐI KHÔNG đưa PIN vào chuỗi lưu trữ
      }

      return String(uname).trim() + ' (' + String(urole).trim() + ') [' + String(uid).trim() + ']';
    }

    // Nếu truyền string thô
    var s = String(userObj).trim();
    // Loại bỏ nếu người dùng truyền chuỗi dạng "226868" (dãy số 6 chữ số nghi ngờ là PIN)
    if (/^\d{4,8}$/.test(s)) {
      throw new Error('SECURITY_VIOLATION: Không được sử dụng mã PIN làm định danh người thực hiện.');
    }
    return s;
  },

  /**
   * Ghi nhận một bản ghi kiểm toán bất biến vào Recon_Audit
   * 
   * @param {Object} params
   *        {
   *          proposalId: string,
   *          action: string,                // Thuộc RECON_AUDIT_ACTION
   *          operationId: string,           // Unique per attempt
   *          idempotencyKey: string,        // Stable logical key
   *          targetTable: string,
   *          targetId: string,
   *          fieldName: string,
   *          beforeValue: any,
   *          afterValue: any,
   *          casVerified: boolean,
   *          performedBy: Object|string,    // User context (NO PIN)
   *          executionStatus: string,       // 'ATTEMPTING', 'SUCCESS', 'CONFLICT', 'FAILED', 'ROLLED_BACK'
   *          lockWaitMs: number,
   *          rawContext: Object|string
   *        }
   * @returns {Object} Bản ghi audit đã lưu
   */
  recordAudit: function(params) {
    params = params || {};
    if (!params.proposalId) {
      throw new Error('[ReconciliationAuditService.recordAudit] proposalId is required.');
    }
    if (!params.action) {
      throw new Error('[ReconciliationAuditService.recordAudit] action is required.');
    }

    var ts = (typeof Utilities !== 'undefined')
      ? Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss')
      : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    var auditId = 'AUD_' + ts + '_' + rand;
    var nowIso = new Date().toISOString();

    // Làm sạch người thực hiện, tuyệt đối không lưu PIN
    var safePerformedBy = this.formatPerformedBy(params.performedBy);

    // Làm sạch rawContext: Loại bỏ bất kỳ thuộc tính PIN nào
    var safeContext = {};
    if (params.rawContext && typeof params.rawContext === 'object') {
      Object.keys(params.rawContext).forEach(function(k) {
        var lowerK = k.toLowerCase();
        if (lowerK.indexOf('pin') === -1 && lowerK.indexOf('pass') === -1) {
          safeContext[k] = params.rawContext[k];
        }
      });
    } else if (typeof params.rawContext === 'string') {
      safeContext = { note: params.rawContext };
    }

    var auditRecord = {
      audit_id: auditId,
      proposal_id: String(params.proposalId),
      action: String(params.action),
      operation_id: params.operationId ? String(params.operationId) : '',
      idempotency_key: params.idempotencyKey ? String(params.idempotencyKey) : '',
      target_table: params.targetTable ? String(params.targetTable) : '',
      target_id: params.targetId ? String(params.targetId) : '',
      field_name: params.fieldName ? String(params.fieldName) : '',
      before_value: params.beforeValue !== undefined && params.beforeValue !== null ? String(params.beforeValue) : '',
      after_value: params.afterValue !== undefined && params.afterValue !== null ? String(params.afterValue) : '',
      cas_verified: params.casVerified === true,
      performed_by: safePerformedBy,
      timestamp: nowIso,
      execution_status: params.executionStatus || 'SUCCESS',
      lock_wait_ms: Number(params.lockWaitMs) || 0,
      raw_context: JSON.stringify(safeContext)
    };

    ReconciliationDbService.insert('Recon_Audit', auditRecord);
    return auditRecord;
  },

  /**
   * Lấy toàn bộ lịch sử kiểm toán của một Proposal (1:N)
   * @param {string} proposalId 
   * @returns {Array<Object>}
   */
  getAuditHistoryForProposal: function(proposalId) {
    if (!proposalId) return [];
    return ReconciliationDbService.find('Recon_Audit', function(a) {
      return a.proposal_id === proposalId;
    });
  },

  /**
   * Tìm bằng chứng thành công (APPLY_SUCCESS) cho một operation_id cụ thể
   * @param {string} operationId 
   * @returns {Object|null}
   */
  findApplySuccessAudit: function(operationId) {
    if (!operationId) return null;
    var list = ReconciliationDbService.find('Recon_Audit', function(a) {
      return a.operation_id === operationId && a.action === 'APPLY_SUCCESS';
    });
    return (list && list.length > 0) ? list[0] : null;
  }
};

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationAuditService: ReconciliationAuditService
  };
}
