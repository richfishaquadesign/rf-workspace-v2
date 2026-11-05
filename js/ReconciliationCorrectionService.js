/**
 * ==============================================================================
 * MODULE: ReconciliationCorrectionService.js
 * MÔ TẢ: Dịch vụ thực thi điều chỉnh có kiểm soát & Hoàn tác từng đề xuất (Milestone M1-C)
 *        - ÁP DỤNG MỘT PROPOSAL ĐÃ DUYỆT MỖI LẦN (Single Proposal Execution Only).
 *        - KIỂM TRA PHÂN QUYỀN NGHIÊM NGẶT: Chỉ Kế toán hoặc Tối cao mới có quyền duyệt/áp dụng.
 *        - QUY TRÌNH ÁP DỤNG CHUẨN (State Flow):
 *            1. Proposal phải ở trạng thái 'APPROVED'.
 *            2. Kiểm tra Whitelist bảng và trường được phép can thiệp:
 *               Orders.revenue, Orders.status, Transactions.amount.
 *            3. Kiểm tra CAS tuyệt đối: compareReconValue(field_type, currentValue, old_value).
 *            4. Nếu KHÔNG KHỚP:
 *               -> Chuyển proposal thành 'CONFLICT'.
 *               -> Ghi nhật ký 'CONFLICT_DETECTED' vào Recon_Audit.
 *               -> Dừng lại, TUYỆT ĐỐI KHÔNG SỬA PRODUCTION.
 *            5. Nếu KHỚP:
 *               -> Sinh operation_id mới.
 *               -> Ghi nhật ký bắt đầu cập nhật 'APPLY_ATTEMPT' (Write-Ahead Journal).
 *               -> Chuyển proposal thành 'APPLYING'.
 *               -> Cập nhật 1 bản ghi production dưới LockService.
 *               -> Ghi nhật ký thành công 'APPLY_SUCCESS'.
 *               -> Chuyển proposal thành 'APPLIED'.
 *        - HOÀN TÁC TỪNG PROPOSAL (Rollback):
 *            1. Chỉ áp dụng cho proposal 'APPLIED'.
 *            2. Kiểm tra giá trị hiện tại trên ERP vẫn đúng là new_value mà hệ thống đã ghi.
 *            3. Nếu khác: Dừng, chuyển 'CONFLICT', không đè thay đổi mới của nhân sự.
 *            4. Nếu khớp: Trả về old_value, ghi 'ROLLBACK_SUCCESS', chuyển 'ROLLED_BACK'.
 *        - KHÔI PHỤC SAU SỰ CỐ (Crash Recovery):
 *            1. Quét các proposal kẹt ở 'APPLYING'.
 *            2. Chỉ chuyển 'APPLIED' nếu tìm thấy bản ghi bằng chứng 'APPLY_SUCCESS' khớp operation_id.
 *            3. Nếu không có bằng chứng rõ ràng -> Chuyển 'MANUAL_REVIEW_REQUIRED' (Fail-Closed).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp cấu hình & các service phụ thuộc nếu chạy trong môi trường Node.js
if (typeof RECON_CONFIG === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_PROPOSAL_STATUS = _cfg.RECON_PROPOSAL_STATUS;
  var RECON_AUDIT_ACTION = _cfg.RECON_AUDIT_ACTION;
  var RECON_ALLOWED_MUTATIONS = _cfg.RECON_ALLOWED_MUTATIONS;
}

if (typeof ReconciliationDbService === 'undefined' && typeof require !== 'undefined') {
  var _db = require('./ReconciliationDbService.js');
  var ReconciliationDbService = _db.ReconciliationDbService;
}

if (typeof ReconciliationNormalizer === 'undefined' && typeof require !== 'undefined') {
  var _norm = require('./ReconciliationNormalizer.js');
  var ReconciliationNormalizer = _norm.ReconciliationNormalizer;
}

if (typeof ReconciliationAuditService === 'undefined' && typeof require !== 'undefined') {
  var _aud = require('./ReconciliationAuditService.js');
  var ReconciliationAuditService = _aud.ReconciliationAuditService;
}

var ReconciliationCorrectionService = {
  /**
   * Adapter cho phép giả lập/thao tác bảng sản xuất ERP phục vụ test hoặc chạy trên Sheets
   */
  _prodAdapter: null,

  setProdAdapter: function(adapter) {
    this._prodAdapter = adapter;
  },

  clearProdAdapter: function() {
    this._prodAdapter = null;
  },

  /**
   * Đọc giá trị hiện tại của một trường trong bản ghi sản xuất (Orders, Transactions...)
   * @param {string} targetTable 
   * @param {string} targetId 
   * @param {string} targetField 
   * @returns {any}
   */
  getProductionCurrentValue: function(targetTable, targetId, targetField) {
    if (this._prodAdapter && this._prodAdapter.getRecord) {
      var rec = this._prodAdapter.getRecord(targetTable, targetId);
      return rec ? rec[targetField] : null;
    }

    // Nếu chạy trong Google Apps Script, đọc từ Spreadsheet thực tế qua Lock/Range
    if (typeof SpreadsheetApp !== 'undefined') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(targetTable);
      if (!sheet) throw new Error('Không tìm thấy bảng sản xuất [' + targetTable + '].');
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow <= 1) return null;
      var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var idIdx = headers.indexOf('id');
      if (idIdx === -1 && targetTable === 'Orders') idIdx = headers.indexOf('orderCode');
      var fieldIdx = headers.indexOf(targetField);
      if (idIdx === -1 || fieldIdx === -1) return null;

      for (var r = 1; r < data.length; r++) {
        if (String(data[r][idIdx]).trim() === String(targetId).trim()) {
          return data[r][fieldIdx];
        }
      }
    }
    return null;
  },

  /**
   * Cập nhật một trường duy nhất trên bảng sản xuất (Orders, Transactions...)
   * @param {string} targetTable 
   * @param {string} targetId 
   * @param {string} targetField 
   * @param {any} newValue 
   * @returns {boolean}
   */
  updateProductionField: function(targetTable, targetId, targetField, newValue) {
    if (this._prodAdapter && this._prodAdapter.updateField) {
      return this._prodAdapter.updateField(targetTable, targetId, targetField, newValue);
    }

    if (typeof SpreadsheetApp !== 'undefined') {
      var lock = LockService.getScriptLock();
      var hasLock = lock.tryLock(15000);
      if (!hasLock) throw new Error('LOCK_TIMEOUT: Không thể khóa CSDL sản xuất để cập nhật.');
      try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(targetTable);
        if (!sheet) throw new Error('Bảng sản xuất ' + targetTable + ' không tồn tại.');
        var lastRow = sheet.getLastRow();
        var lastCol = sheet.getLastColumn();
        var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
        var headers = data[0].map(function(h) { return String(h).trim(); });
        var idIdx = headers.indexOf('id');
        if (idIdx === -1 && targetTable === 'Orders') idIdx = headers.indexOf('orderCode');
        var fieldIdx = headers.indexOf(targetField);
        if (idIdx === -1 || fieldIdx === -1) {
          throw new Error('Không tìm thấy cột ' + targetField + ' hoặc id trong bảng ' + targetTable);
        }

        for (var r = 1; r < data.length; r++) {
          if (String(data[r][idIdx]).trim() === String(targetId).trim()) {
            sheet.getRange(r + 1, fieldIdx + 1).setValue(newValue);
            return true;
          }
        }
        return false;
      } finally {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
    return false;
  },

  /**
   * Kiểm tra quyền của nhân sự: Chỉ KẾ TOÁN hoặc TỐI CAO
   * @param {Object} user 
   * @returns {boolean}
   */
  isAuthorizedToApproveOrApply: function(user) {
    if (!user) return false;
    var role = '';
    if (typeof user === 'object') {
      role = String(user.role || user.userRole || user.chucDanh || '').trim().toUpperCase();
      // Chuẩn hóa Unicode loại bỏ dấu tiếng Việt để so khớp an toàn
      var normRole = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
      if (normRole === 'TOI CAO' || normRole === 'KE TOAN') return true;
    } else if (typeof user === 'string') {
      var normStr = user.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
      if (normStr.indexOf('TOI CAO') !== -1 || normStr.indexOf('KE TOAN') !== -1) return true;
    }
    return false;
  },

  /**
   * 1. DUYỆT MỘT PROPOSAL (Approve Proposal)
   * 
   * @param {string} proposalId 
   * @param {Object} user - Người duyệt { id, name, role }
   * @returns {Object} Kết quả duyệt
   */
  approveProposal: function(proposalId, user) {
    if (!this.isAuthorizedToApproveOrApply(user)) {
      throw new Error('PERMISSION_DENIED: Chỉ Kế Toán hoặc tài khoản Tối Cao mới có quyền duyệt đề xuất đối soát.');
    }

    var proposal = ReconciliationDbService.findOne('Recon_Proposals', 'proposal_id', proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND: Không tìm thấy đề xuất [' + proposalId + '].');
    }

    if (proposal.proposal_status !== 'PENDING') {
      throw new Error('INVALID_PROPOSAL_STATUS: Đề xuất đang ở trạng thái [' + proposal.proposal_status + '], chỉ đề xuất PENDING mới được duyệt.');
    }

    var nowIso = new Date().toISOString();
    var safeUser = ReconciliationAuditService.formatPerformedBy(user);

    ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
      proposal_status: 'APPROVED',
      reviewed_by: safeUser,
      reviewed_at: nowIso
    });

    ReconciliationAuditService.recordAudit({
      proposalId: proposalId,
      action: 'PROPOSAL_APPROVED',
      operationId: '',
      idempotencyKey: proposal.idempotency_key,
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      fieldName: proposal.target_field,
      beforeValue: proposal.old_value,
      afterValue: proposal.new_value,
      casVerified: false,
      performedBy: user,
      executionStatus: 'SUCCESS',
      rawContext: { note: 'Duyệt đề xuất thành công, sẵn sàng áp dụng' }
    });

    return {
      success: true,
      proposalId: proposalId,
      status: 'APPROVED',
      reviewedBy: safeUser,
      reviewedAt: nowIso
    };
  },

  /**
   * 2. TỪ CHỐI MỘT PROPOSAL (Reject Proposal)
   * 
   * @param {string} proposalId 
   * @param {Object} user - Người từ chối { id, name, role }
   * @param {string} reason - Lý do từ chối
   * @returns {Object} Kết quả từ chối
   */
  rejectProposal: function(proposalId, user, reason) {
    if (!this.isAuthorizedToApproveOrApply(user)) {
      throw new Error('PERMISSION_DENIED: Chỉ Kế Toán hoặc tài khoản Tối Cao mới có quyền từ chối đề xuất đối soát.');
    }

    var proposal = ReconciliationDbService.findOne('Recon_Proposals', 'proposal_id', proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND: Không tìm thấy đề xuất [' + proposalId + '].');
    }

    if (proposal.proposal_status !== 'PENDING' && proposal.proposal_status !== 'APPROVED') {
      throw new Error('INVALID_PROPOSAL_STATUS: Đề xuất đang ở trạng thái [' + proposal.proposal_status + '], không thể từ chối.');
    }

    var nowIso = new Date().toISOString();
    var safeUser = ReconciliationAuditService.formatPerformedBy(user);

    ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
      proposal_status: 'REJECTED',
      reviewed_by: safeUser,
      reviewed_at: nowIso,
      rejection_reason: reason || 'Kế toán/Tối cao từ chối đề xuất'
    });

    ReconciliationAuditService.recordAudit({
      proposalId: proposalId,
      action: 'PROPOSAL_REJECTED',
      operationId: '',
      idempotencyKey: proposal.idempotency_key,
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      fieldName: proposal.target_field,
      beforeValue: proposal.old_value,
      afterValue: proposal.new_value,
      casVerified: false,
      performedBy: user,
      executionStatus: 'SUCCESS',
      rawContext: { reason: reason || 'Kế toán/Tối cao từ chối đề xuất' }
    });

    return {
      success: true,
      proposalId: proposalId,
      status: 'REJECTED',
      reviewedBy: safeUser,
      reviewedAt: nowIso,
      reason: reason
    };
  },

  /**
   * 3. ÁP DỤNG MỘT PROPOSAL ĐÃ DUYỆT (Apply Single Approved Proposal)
   * 
   * Quy trình bắt buộc:
   * - Chỉ 1 proposal mỗi lần.
   * - Kiểm tra quyền.
   * - Kiểm tra proposal_status === 'APPROVED'.
   * - Whitelist trường: Orders.revenue, Orders.status, Transactions.amount.
   * - Kiểm tra CAS tuyệt đối compareReconValue().
   * - Nếu lệch -> CONFLICT, dừng.
   * - Nếu khớp -> Ghi APPLY_ATTEMPT -> APPLYING -> update production -> APPLY_SUCCESS -> APPLIED.
   * 
   * @param {string} proposalId 
   * @param {Object} user 
   * @returns {Object} Kết quả áp dụng
   */
  applySingleProposal: function(proposalId, user) {
    if (!this.isAuthorizedToApproveOrApply(user)) {
      throw new Error('PERMISSION_DENIED: Chỉ Kế Toán hoặc tài khoản Tối Cao mới có quyền áp dụng đề xuất đối soát.');
    }

    var proposal = ReconciliationDbService.findOne('Recon_Proposals', 'proposal_id', proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND: Không tìm thấy đề xuất [' + proposalId + '].');
    }

    // Kiểm tra tính lũy kế (Idempotency check): Nếu đã APPLIED rồi thì không áp dụng lại
    if (proposal.proposal_status === 'APPLIED') {
      return {
        success: true,
        alreadyApplied: true,
        proposalId: proposalId,
        status: 'APPLIED',
        message: 'Đề xuất này đã được áp dụng thành công trước đó (Idempotent replay).'
      };
    }

    if (proposal.proposal_status !== 'APPROVED') {
      throw new Error('INVALID_PROPOSAL_STATUS: Đề xuất chưa được duyệt (trạng thái hiện tại: ' + proposal.proposal_status + '). Bắt buộc phải được APPROVED trước khi áp dụng.');
    }

    // Kiểm tra Whitelist can thiệp M1-C
    var allowedFields = RECON_ALLOWED_MUTATIONS[proposal.target_table];
    if (!allowedFields || allowedFields.indexOf(proposal.target_field) === -1) {
      throw new Error('MUTATION_NOT_ALLOWED: Bảng [' + proposal.target_table + '] hoặc trường [' + proposal.target_field + '] không nằm trong danh mục whitelist được phép cập nhật.');
    }

    // 1. Đọc giá trị hiện tại trên bảng sản xuất
    var currentVal = this.getProductionCurrentValue(proposal.target_table, proposal.target_id, proposal.target_field);
    var fieldType = proposal.field_type || 'STRING';

    // 2. Kiểm tra Compare-And-Set (CAS) TUYỆT ĐỐI 100%
    var isCasMatch = ReconciliationNormalizer.compareReconValue(fieldType, currentVal, proposal.old_value);

    // Sinh operation_id mới cho lần thực thi vật lý này
    var opId = ReconciliationAuditService.generateOperationId();

    if (!isCasMatch) {
      // DỮ LIỆU ĐÃ BỊ THAY ĐỔI -> CHUYỂN CONFLICT & GHI NHẬT KÝ
      ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
        proposal_status: 'CONFLICT'
      });

      ReconciliationAuditService.recordAudit({
        proposalId: proposalId,
        action: 'CONFLICT_DETECTED',
        operationId: opId,
        idempotencyKey: proposal.idempotency_key,
        targetTable: proposal.target_table,
        targetId: proposal.target_id,
        fieldName: proposal.target_field,
        beforeValue: currentVal,
        afterValue: proposal.new_value,
        casVerified: false,
        performedBy: user,
        executionStatus: 'CONFLICT',
        rawContext: {
          error: 'CAS_MISMATCH',
          expectedValue: proposal.old_value,
          actualCurrentValue: currentVal,
          reason: 'Dữ liệu trên ERP đã bị người dùng khác hoặc quy trình khác thay đổi trước khi áp dụng đề xuất.'
        }
      });

      return {
        success: false,
        conflict: true,
        proposalId: proposalId,
        status: 'CONFLICT',
        expectedValue: proposal.old_value,
        currentValue: currentVal,
        message: 'Xung đột dữ liệu (CAS Mismatch): Giá trị thực tế trên ERP hiện là [' + currentVal + '], không khớp với giá trị kỳ vọng ban đầu [' + proposal.old_value + ']. Đã hủy cập nhật.'
      };
    }

    // 3. CAS HỢP LỆ -> TIẾN HÀNH QUY TRÌNH GHI WRITE-AHEAD & MUTATION
    var startTime = new Date().toISOString();

    // Bước A: Ghi nhật ký Write-Ahead Journal 'APPLY_ATTEMPT'
    ReconciliationAuditService.recordAudit({
      proposalId: proposalId,
      action: 'APPLY_ATTEMPT',
      operationId: opId,
      idempotencyKey: proposal.idempotency_key,
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      fieldName: proposal.target_field,
      beforeValue: currentVal,
      afterValue: proposal.new_value,
      casVerified: true,
      performedBy: user,
      executionStatus: 'ATTEMPTING',
      rawContext: { startedAt: startTime }
    });

    // Bước B: Chuyển proposal thành APPLYING và gắn operation_id
    ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
      proposal_status: 'APPLYING',
      operation_id: opId
    });

    // Bước C: Thực thi ghi vào bảng sản xuất (1 bản ghi)
    var updateSuccess = false;
    try {
      var cleanNewValue = proposal.new_value;
      if (fieldType === 'VND_INTEGER') {
        cleanNewValue = Math.round(Number(proposal.new_value));
      }
      updateSuccess = this.updateProductionField(proposal.target_table, proposal.target_id, proposal.target_field, cleanNewValue);
    } catch (writeErr) {
      // Cập nhật thất bại do ngoại lệ
      ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
        proposal_status: 'FAILED'
      });
      ReconciliationAuditService.recordAudit({
        proposalId: proposalId,
        action: 'APPLY_FAILED',
        operationId: opId,
        idempotencyKey: proposal.idempotency_key,
        targetTable: proposal.target_table,
        targetId: proposal.target_id,
        fieldName: proposal.target_field,
        beforeValue: currentVal,
        afterValue: proposal.new_value,
        casVerified: true,
        performedBy: user,
        executionStatus: 'FAILED',
        rawContext: { error: writeErr.message }
      });
      throw writeErr;
    }

    if (!updateSuccess) {
      ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
        proposal_status: 'FAILED'
      });
      ReconciliationAuditService.recordAudit({
        proposalId: proposalId,
        action: 'APPLY_FAILED',
        operationId: opId,
        idempotencyKey: proposal.idempotency_key,
        targetTable: proposal.target_table,
        targetId: proposal.target_id,
        fieldName: proposal.target_field,
        beforeValue: currentVal,
        afterValue: proposal.new_value,
        casVerified: true,
        performedBy: user,
        executionStatus: 'FAILED',
        rawContext: { error: 'Không tìm thấy bản ghi sản xuất đích để cập nhật.' }
      });
      throw new Error('UPDATE_FAILED: Không tìm thấy bản ghi sản xuất [' + proposal.target_id + '] trong bảng [' + proposal.target_table + '].');
    }

    // Bước D: Ghi nhật ký thành công 'APPLY_SUCCESS'
    var completedTime = new Date().toISOString();
    ReconciliationAuditService.recordAudit({
      proposalId: proposalId,
      action: 'APPLY_SUCCESS',
      operationId: opId,
      idempotencyKey: proposal.idempotency_key,
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      fieldName: proposal.target_field,
      beforeValue: currentVal,
      afterValue: proposal.new_value,
      casVerified: true,
      performedBy: user,
      executionStatus: 'SUCCESS',
      rawContext: { completedAt: completedTime }
    });

    // Bước E: Chuyển proposal thành 'APPLIED'
    ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
      proposal_status: 'APPLIED',
      applied_at: completedTime
    });

    return {
      success: true,
      proposalId: proposalId,
      operationId: opId,
      status: 'APPLIED',
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      targetField: proposal.target_field,
      oldValue: proposal.old_value,
      newValue: proposal.new_value,
      appliedAt: completedTime
    };
  },

  /**
   * 4. HOÀN TÁC TỪNG PROPOSAL (Rollback Single Applied Proposal)
   * 
   * Quy trình:
   * - Chỉ áp dụng cho proposal 'APPLIED'.
   * - Đọc giá trị hiện tại trên ERP.
   * - Kiểm tra giá trị hiện tại có đúng bằng new_value (giá trị mà proposal này đã ghi) hay không.
   * - Nếu KHÔNG KHỚP: Dừng lại, chuyển trạng thái đề xuất thành CONFLICT, không ghi đè thay đổi của người khác.
   * - Nếu KHỚP: Trả về old_value, ghi ROLLBACK_SUCCESS, chuyển proposal thành 'ROLLED_BACK'.
   * 
   * @param {string} proposalId 
   * @param {Object} user 
   * @returns {Object} Kết quả hoàn tác
   */
  rollbackSingleProposal: function(proposalId, user) {
    if (!this.isAuthorizedToApproveOrApply(user)) {
      throw new Error('PERMISSION_DENIED: Chỉ Kế Toán hoặc tài khoản Tối Cao mới có quyền hoàn tác đề xuất.');
    }

    var proposal = ReconciliationDbService.findOne('Recon_Proposals', 'proposal_id', proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND: Không tìm thấy đề xuất [' + proposalId + '].');
    }

    if (proposal.proposal_status !== 'APPLIED') {
      throw new Error('INVALID_PROPOSAL_STATUS: Chỉ đề xuất đã ở trạng thái APPLIED mới có thể hoàn tác (Trạng thái hiện tại: ' + proposal.proposal_status + ').');
    }

    var currentVal = this.getProductionCurrentValue(proposal.target_table, proposal.target_id, proposal.target_field);
    var fieldType = proposal.field_type || 'STRING';

    // Kiểm tra CAS: Giá trị hiện tại bắt buộc phải khớp với new_value mà phân hệ đối soát đã từng ghi
    var isRollbackCasMatch = ReconciliationNormalizer.compareReconValue(fieldType, currentVal, proposal.new_value);
    var rollbackOpId = ReconciliationAuditService.generateOperationId();

    if (!isRollbackCasMatch) {
      // Dữ liệu đã bị người dùng/quy trình khác thay đổi sau thời điểm apply -> Dừng hoàn tác!
      ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
        proposal_status: 'CONFLICT'
      });

      ReconciliationAuditService.recordAudit({
        proposalId: proposalId,
        action: 'ROLLBACK_FAILED',
        operationId: rollbackOpId,
        idempotencyKey: proposal.idempotency_key,
        targetTable: proposal.target_table,
        targetId: proposal.target_id,
        fieldName: proposal.target_field,
        beforeValue: currentVal,
        afterValue: proposal.old_value,
        casVerified: false,
        performedBy: user,
        executionStatus: 'CONFLICT',
        rawContext: {
          error: 'ROLLBACK_CAS_MISMATCH',
          expectedAppliedValue: proposal.new_value,
          actualCurrentValue: currentVal,
          reason: 'Bản ghi ERP đã bị sửa đổi sau khi áp dụng đối soát, không thể hoàn tác an toàn.'
        }
      });

      return {
        success: false,
        conflict: true,
        proposalId: proposalId,
        status: 'CONFLICT',
        currentValue: currentVal,
        expectedValue: proposal.new_value,
        message: 'Không thể hoàn tác: Bản ghi trên ERP hiện có giá trị là [' + currentVal + '], đã bị thay đổi sau khi áp dụng đề xuất (kỳ vọng: [' + proposal.new_value + ']).'
      };
    }

    // Thực hiện trả về giá trị cũ (old_value)
    var rollbackVal = proposal.old_value;
    if (fieldType === 'VND_INTEGER') {
      rollbackVal = Math.round(Number(proposal.old_value));
    }

    this.updateProductionField(proposal.target_table, proposal.target_id, proposal.target_field, rollbackVal);

    var rollbackTime = new Date().toISOString();

    // Ghi nhật ký hoàn tác thành công
    ReconciliationAuditService.recordAudit({
      proposalId: proposalId,
      action: 'ROLLBACK_SUCCESS',
      operationId: rollbackOpId,
      idempotencyKey: proposal.idempotency_key,
      targetTable: proposal.target_table,
      targetId: proposal.target_id,
      fieldName: proposal.target_field,
      beforeValue: currentVal,
      afterValue: proposal.old_value,
      casVerified: true,
      performedBy: user,
      executionStatus: 'ROLLED_BACK',
      rawContext: { rollbackAt: rollbackTime }
    });

    ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', proposalId, {
      proposal_status: 'ROLLED_BACK'
    });

    return {
      success: true,
      proposalId: proposalId,
      operationId: rollbackOpId,
      status: 'ROLLED_BACK',
      restoredValue: proposal.old_value,
      rollbackAt: rollbackTime
    };
  },

  /**
   * 5. KHÔI PHỤC SAU SỰ CỐ (Crash Recovery for Stale APPLYING Proposals)
   * 
   * Nếu tiến trình bị crash hoặc timeout giữa chừng, đề xuất sẽ kẹt ở 'APPLYING'.
   * Hàm này quét các proposal kẹt:
   * - Tìm bản ghi Recon_Audit có action === 'APPLY_SUCCESS' khớp với operation_id.
   * - Nếu có bằng chứng xác nhận: Chuyển proposal thành 'APPLIED'.
   * - Nếu KHÔNG CÓ BẰNG CHỨNG RÕ RÀNG: Chuyển 'MANUAL_REVIEW_REQUIRED' (Fail-Closed).
   * 
   * @param {Object} user 
   * @returns {Object} Kết quả khôi phục
   */
  recoverStaleApplyingProposals: function(user) {
    var staleProposals = ReconciliationDbService.find('Recon_Proposals', function(p) {
      return p.proposal_status === 'APPLYING';
    });

    var recoveredCount = 0;
    var manualReviewCount = 0;
    var recoveryDetails = [];

    for (var i = 0; i < staleProposals.length; i++) {
      var prop = staleProposals[i];
      var opId = prop.operation_id;

      var successAudit = opId ? ReconciliationAuditService.findApplySuccessAudit(opId) : null;

      if (successAudit) {
        // Tìm thấy bằng chứng Apply thành công
        ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', prop.proposal_id, {
          proposal_status: 'APPLIED',
          applied_at: successAudit.timestamp
        });

        ReconciliationAuditService.recordAudit({
          proposalId: prop.proposal_id,
          action: 'RECOVERY_ACTION',
          operationId: opId,
          idempotencyKey: prop.idempotency_key,
          targetTable: prop.target_table,
          targetId: prop.target_id,
          fieldName: prop.target_field,
          beforeValue: prop.old_value,
          afterValue: prop.new_value,
          casVerified: true,
          performedBy: user,
          executionStatus: 'SUCCESS',
          rawContext: { result: 'RESOLVED_TO_APPLIED_WITH_EVIDENCE', auditRef: successAudit.audit_id }
        });

        recoveredCount++;
        recoveryDetails.push({ proposalId: prop.proposal_id, newStatus: 'APPLIED', reason: 'Found APPLY_SUCCESS audit proof' });
      } else {
        // Không thể chứng minh an toàn -> Chuyển sang MANUAL_REVIEW_REQUIRED (Fail-Closed)
        ReconciliationDbService.updateWhere('Recon_Proposals', 'proposal_id', prop.proposal_id, {
          proposal_status: 'MANUAL_REVIEW_REQUIRED'
        });

        ReconciliationAuditService.recordAudit({
          proposalId: prop.proposal_id,
          action: 'RECOVERY_ACTION',
          operationId: opId,
          idempotencyKey: prop.idempotency_key,
          targetTable: prop.target_table,
          targetId: prop.target_id,
          fieldName: prop.target_field,
          beforeValue: prop.old_value,
          afterValue: prop.new_value,
          casVerified: false,
          performedBy: user,
          executionStatus: 'FAILED',
          rawContext: { result: 'ESCALATED_TO_MANUAL_REVIEW', reason: 'No APPLY_SUCCESS evidence found for operation_id' }
        });

        manualReviewCount++;
        recoveryDetails.push({ proposalId: prop.proposal_id, newStatus: 'MANUAL_REVIEW_REQUIRED', reason: 'No unambiguous write proof' });
      }
    }

    return {
      success: true,
      staleCount: staleProposals.length,
      recoveredCount: recoveredCount,
      manualReviewCount: manualReviewCount,
      details: recoveryDetails
    };
  }
};

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationCorrectionService: ReconciliationCorrectionService
  };
}
