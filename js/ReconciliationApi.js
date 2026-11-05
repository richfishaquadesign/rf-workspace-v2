/**
 * ==============================================================================
 * MODULE: ReconciliationApi.js
 * MÔ TẢ: API Gateway cho phân hệ đối soát tài chính (Generic Financial Reconciliation API)
 *        - Cung cấp các hàm gọi từ hệ thống hiện có (Client / Backend Controllers):
 *            1. api_getReconProposals(filter)           // Lấy danh sách proposal
 *            2. api_getReconAuditHistory(proposalId)    // Xem lịch sử kiểm toán của đề xuất
 *            3. api_approveReconProposal(proposalId)    // Duyệt một proposal
 *            4. api_rejectReconProposal(proposalId, reason) // Từ chối một proposal
 *            5. api_applyReconProposal(proposalId)      // Áp dụng MỘT proposal đã duyệt
 *            6. api_rollbackReconProposal(proposalId)   // Hoàn tác MỘT proposal đã áp dụng
 *            7. api_recoverReconProposals()             // Quét & khôi phục các proposal kẹt APPLYING
 *        - BẢO TOÀN AN TOÀN TUYỆT ĐỐI:
 *            + Tái sử dụng xác thực và phân quyền hiện có (getCurrentUserSession / KẾ TOÁN / TỐI CAO).
 *            + Tuyệt đối không sửa Code.js.
 *            + TUYỆT ĐỐI KHÔNG CÓ HÀM ÁP DỤNG HÀNG LOẠT (NO BATCH APPLY).
 *            + TUYỆT ĐỐI KHÔNG CÓ HÀM TỰ ĐỘNG ÁP DỤNG (NO AUTO-APPLY).
 *            + Chỉ áp dụng từng đề xuất một (Single Proposal Execution).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp các service phụ thuộc nếu chạy trong môi trường Node.js
if (typeof ReconciliationDbService === 'undefined' && typeof require !== 'undefined') {
  var _db = require('./ReconciliationDbService.js');
  var ReconciliationDbService = _db.ReconciliationDbService;
}

if (typeof ReconciliationCorrectionService === 'undefined' && typeof require !== 'undefined') {
  var _corr = require('./ReconciliationCorrectionService.js');
  var ReconciliationCorrectionService = _corr.ReconciliationCorrectionService;
}

if (typeof ReconciliationAuditService === 'undefined' && typeof require !== 'undefined') {
  var _aud = require('./ReconciliationAuditService.js');
  var ReconciliationAuditService = _aud.ReconciliationAuditService;
}

if (typeof ReconciliationImportService === 'undefined' && typeof require !== 'undefined') {
  var _imp = require('./ReconciliationImportService.js');
  var ReconciliationImportService = _imp.ReconciliationImportService;
}

if (typeof ReconciliationEngine === 'undefined' && typeof require !== 'undefined') {
  var _eng = require('./ReconciliationEngine.js');
  var ReconciliationEngine = _eng.ReconciliationEngine;
}

var ReconciliationApi = {
  /**
   * Adapter cho phép giả lập hoặc tích hợp hàm validatePin khi chạy trong test runner
   */
  _validatePinFn: null,

  setValidatePinAdapter: function(fn) {
    this._validatePinFn = fn;
  },

  clearValidatePinAdapter: function() {
    this._validatePinFn = null;
  },

  /**
   * Xác thực mã PIN ở phía server và trích xuất danh tính nhân sự an toàn.
   * Tuyệt đối không nhận user, role hay id từ client làm căn cứ cấp quyền.
   * 
   * @param {string} pin - Mã PIN xác thực
   * @param {boolean} [requireAdminOrBoss=true] - Yêu cầu vai trò KẾ TOÁN hoặc TỐI CAO
   * @returns {Object} Thông tin người dùng an toàn đã được server xác thực: { id, name, role, title }
   */
  _authenticatePin: function(pin, requireAdminOrBoss) {
    if (requireAdminOrBoss === undefined) requireAdminOrBoss = true;

    if (!pin) {
      throw new Error('AUTH_REQUIRED: Yêu cầu cung cấp mã PIN để thực hiện thao tác.');
    }

    var authResult = null;
    if (typeof this._validatePinFn === 'function') {
      authResult = this._validatePinFn(pin);
    } else if (typeof validatePin === 'function') {
      authResult = validatePin(pin);
    } else {
      throw new Error('SERVER_ERROR: Hàm xác thực validatePin() không khả dụng trên môi trường server.');
    }

    if (!authResult || !authResult.valid) {
      throw new Error('AUTH_FAILED: Mã PIN không tồn tại hoặc không hợp lệ.');
    }

    var role = String(authResult.role || authResult.title || '').trim().toUpperCase();
    var normRole = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');

    if (requireAdminOrBoss) {
      var isAllowedRole = (normRole === 'TOI CAO' || normRole === 'KE TOAN' || authResult.isBoss === true);
      if (!isAllowedRole) {
        throw new Error('PERMISSION_DENIED: Từ chối quyền. Chỉ Kế Toán hoặc tài khoản Tối Cao mới được phép thao tác đối soát.');
      }
    }

    // Trả về thông tin danh tính an toàn đã được server trích xuất (KHÔNG LƯU PIN)
    return {
      id: authResult.id || authResult.userId || authResult.user || 'USR_VERIFIED',
      name: authResult.user || authResult.name || 'Nhân sự đã xác thực',
      role: role,
      title: authResult.title || ''
    };
  },

  /**
   * 1. Lấy danh sách đề xuất đối soát (Recon Proposals)
   * Yêu cầu xác thực PIN
   * @param {string} pin 
   * @param {Object} [filter] - { status, targetTable, runId }
   * @returns {Array<Object>}
   */
  getProposals: function(pin, filter) {
    this._authenticatePin(pin, true);
    filter = filter || {};
    return ReconciliationDbService.find('Recon_Proposals', function(p) {
      if (filter.status && p.proposal_status !== filter.status) return false;
      if (filter.targetTable && p.target_table !== filter.targetTable) return false;
      if (filter.runId && p.run_id !== filter.runId) return false;
      return true;
    });
  },

  /**
   * 2. Lấy lịch sử kiểm toán của một đề xuất (1:N)
   * Yêu cầu xác thực PIN
   * @param {string} pin 
   * @param {string} proposalId 
   * @returns {Array<Object>}
   */
  getAuditHistory: function(pin, proposalId) {
    this._authenticatePin(pin, true);
    return ReconciliationAuditService.getAuditHistoryForProposal(proposalId);
  },

  /**
   * 3. Duyệt một đề xuất (Chỉ Kế toán hoặc Tối cao qua xác thực PIN)
   * @param {string} proposalId 
   * @param {string} pin 
   * @returns {Object}
   */
  approveProposal: function(proposalId, pin) {
    var authenticatedUser = this._authenticatePin(pin, true);
    return ReconciliationCorrectionService.approveProposal(proposalId, authenticatedUser);
  },

  /**
   * 4. Từ chối một đề xuất (Chỉ Kế toán hoặc Tối cao qua xác thực PIN)
   * @param {string} proposalId 
   * @param {string} pin 
   * @param {string} [reason] 
   * @returns {Object}
   */
  rejectProposal: function(proposalId, pin, reason) {
    var authenticatedUser = this._authenticatePin(pin, true);
    return ReconciliationCorrectionService.rejectProposal(proposalId, authenticatedUser, reason);
  },

  /**
   * 5. Áp dụng MỘT đề xuất đã duyệt (Single Proposal Execution Only)
   * Yêu cầu xác thực PIN của Kế toán hoặc Tối cao
   * TUYỆT ĐỐI KHÔNG HỖ TRỢ BATCH APPLY HOẶC AUTO APPLY
   * @param {string} proposalId 
   * @param {string} pin 
   * @returns {Object}
   */
  applySingleProposal: function(proposalId, pin) {
    var authenticatedUser = this._authenticatePin(pin, true);
    return ReconciliationCorrectionService.applySingleProposal(proposalId, authenticatedUser);
  },

  /**
   * 6. Hoàn tác MỘT đề xuất đã áp dụng (Rollback Single Proposal)
   * Yêu cầu xác thực PIN của Kế toán hoặc Tối cao
   * @param {string} proposalId 
   * @param {string} pin 
   * @returns {Object}
   */
  rollbackSingleProposal: function(proposalId, pin) {
    var authenticatedUser = this._authenticatePin(pin, true);
    return ReconciliationCorrectionService.rollbackSingleProposal(proposalId, authenticatedUser);
  },

  /**
   * 7. Quét & Khôi phục các đề xuất bị kẹt ở trạng thái APPLYING (Crash Recovery)
   * Yêu cầu xác thực PIN của Kế toán hoặc Tối cao
   * @param {string} pin 
   * @returns {Object}
   */
  recoverStaleProposals: function(pin) {
    var authenticatedUser = this._authenticatePin(pin, true);
    return ReconciliationCorrectionService.recoverStaleApplyingProposals(authenticatedUser);
  },

  /**
   * 8. Khởi tạo cơ sở dữ liệu đối soát độc lập (RF_Workspace_Reconciliation_DB)
   * @param {string} pin 
   * @param {string} [customSpreadsheetId] 
   * @returns {Object}
   */
  initDatabase: function(pin, customSpreadsheetId) {
    this._authenticatePin(pin, true);
    return ReconciliationDbService.initReconciliationDatabase(customSpreadsheetId);
  },

  /**
   * 9. Lấy dữ liệu tổng quan đối soát cho Dashboard
   * @param {string} pin 
   * @returns {Object}
   */
  getSummary: function(pin) {
    this._authenticatePin(pin, true);
    var isDbReady = ReconciliationDbService.isInitialized();
    if (!isDbReady) {
      return {
        isInitialized: false,
        pendingProposalsCount: 0,
        approvedProposalsCount: 0,
        appliedProposalsCount: 0,
        openIssuesCount: 0,
        recentImports: [],
        recentRuns: []
      };
    }
    var proposals = ReconciliationDbService.getAll('Recon_Proposals') || [];
    var pendingCount = 0;
    var approvedCount = 0;
    var appliedCount = 0;
    for (var i = 0; i < proposals.length; i++) {
      var s = proposals[i].proposal_status;
      if (s === 'PENDING') pendingCount++;
      else if (s === 'APPROVED') approvedCount++;
      else if (s === 'APPLIED') appliedCount++;
    }
    var issues = ReconciliationDbService.getAll('Recon_Issues') || [];
    var openIssues = 0;
    for (var j = 0; j < issues.length; j++) {
      if (issues[j].issue_status === 'OPEN') openIssues++;
    }
    var imports = ReconciliationDbService.getAll('Recon_Imports') || [];
    var runs = ReconciliationDbService.getAll('Recon_Runs') || [];
    return {
      isInitialized: true,
      pendingProposalsCount: pendingCount,
      approvedProposalsCount: approvedCount,
      appliedProposalsCount: appliedCount,
      openIssuesCount: openIssues,
      recentImports: imports.slice(-5).reverse(),
      recentRuns: runs.slice(-5).reverse()
    };
  },

  /**
   * 10. Lấy danh sách sai lệch (Recon Issues)
   * @param {string} pin 
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  getIssues: function(pin, filter) {
    this._authenticatePin(pin, true);
    filter = filter || {};
    return ReconciliationDbService.find('Recon_Issues', function(item) {
      if (filter.runId && item.run_id !== filter.runId) return false;
      if (filter.status && item.issue_status !== filter.status) return false;
      if (filter.issueType && item.issue_type !== filter.issueType) return false;
      return true;
    });
  },

  /**
   * 11. Lấy danh sách đợt nạp tệp (Recon Imports)
   * @param {string} pin 
   * @returns {Array<Object>}
   */
  getImports: function(pin) {
    this._authenticatePin(pin, true);
    var isDbReady = ReconciliationDbService.isInitialized();
    if (!isDbReady) return [];
    return ReconciliationDbService.getAll('Recon_Imports') || [];
  },

  /**
   * 12. Tiếp nhận và nạp tệp sao kê vào bảng đệm Staging
   * @param {string} pin 
   * @param {Object} payload 
   * @returns {Object}
   */
  importFile: function(pin, payload) {
    var authenticatedUser = this._authenticatePin(pin, true);
    if (!payload) throw new Error('Dữ liệu tải lên (payload) không được để trống.');
    payload.authenticatedUser = authenticatedUser;
    return ReconciliationImportService.importStagingData(payload);
  },

  /**
   * 13. Kích hoạt phiên đối soát (Reconciliation Run)
   * @param {string} pin 
   * @param {string} importId 
   * @param {Object} [options]
   * @returns {Object}
   */
  runReconciliation: function(pin, importId, options) {
    var authenticatedUser = this._authenticatePin(pin, true);
    options = options || {};

    var orders = (options.prodSnapshot && options.prodSnapshot.orders) ? options.prodSnapshot.orders : [];
    var transactions = (options.prodSnapshot && options.prodSnapshot.transactions) ? options.prodSnapshot.transactions : [];

    if (orders.length === 0 && typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getActiveSpreadsheet) {
      try {
        var activeSs = SpreadsheetApp.getActiveSpreadsheet();
        var ordSheet = activeSs.getSheetByName('Orders');
        if (ordSheet && ordSheet.getLastRow() > 1) {
          var ordData = ordSheet.getRange(1, 1, ordSheet.getLastRow(), ordSheet.getLastColumn()).getValues();
          var ordHeaders = ordData[0].map(function(h) { return String(h).trim(); });
          for (var r = 1; r < ordData.length; r++) {
            var ordObj = {};
            for (var c = 0; c < ordHeaders.length; c++) {
              ordObj[ordHeaders[c]] = ordData[r][c];
            }
            orders.push(ordObj);
          }
        }
        var txSheet = activeSs.getSheetByName('Transactions');
        if (txSheet && txSheet.getLastRow() > 1) {
          var txData = txSheet.getRange(1, 1, txSheet.getLastRow(), txSheet.getLastColumn()).getValues();
          var txHeaders = txData[0].map(function(h) { return String(h).trim(); });
          for (var tr = 1; tr < txData.length; tr++) {
            var txObj = {};
            for (var tc = 0; tc < txHeaders.length; tc++) {
              txObj[txHeaders[tc]] = txData[tr][tc];
            }
            transactions.push(txObj);
          }
        }
      } catch (err) {
        // Tiếp tục với snapshot rỗng nếu gặp lỗi đọc
      }
    }

    return ReconciliationEngine.executeRun({
      importId: importId,
      runType: options.runType || 'BATCH_IMPORT',
      dryRun: false,
      prodSnapshot: { orders: orders, transactions: transactions },
      options: options
    });
  }
};

/**
 * Global API entrypoints cho Google Apps Script frontend / remote calls
 */
function api_getReconProposals(pin, filter) {
  return ReconciliationApi.getProposals(pin, filter);
}

function api_getReconAuditHistory(pin, proposalId) {
  return ReconciliationApi.getAuditHistory(pin, proposalId);
}

function api_approveReconProposal(proposalId, pin) {
  return ReconciliationApi.approveProposal(proposalId, pin);
}

function api_rejectReconProposal(proposalId, pin, reason) {
  return ReconciliationApi.rejectProposal(proposalId, pin, reason);
}

function api_applyReconProposal(proposalId, pin) {
  return ReconciliationApi.applySingleProposal(proposalId, pin);
}

function api_rollbackReconProposal(proposalId, pin) {
  return ReconciliationApi.rollbackSingleProposal(proposalId, pin);
}

function api_recoverReconProposals(pin) {
  return ReconciliationApi.recoverStaleProposals(pin);
}

function api_initReconDatabase(pin, customSpreadsheetId) {
  return ReconciliationApi.initDatabase(pin, customSpreadsheetId);
}

function api_getReconSummary(pin) {
  return ReconciliationApi.getSummary(pin);
}

function api_getReconIssues(pin, filter) {
  return ReconciliationApi.getIssues(pin, filter);
}

function api_getReconImports(pin) {
  return ReconciliationApi.getImports(pin);
}

function api_importReconFile(pin, payload) {
  return ReconciliationApi.importFile(pin, payload);
}

function api_runReconMatching(pin, importId, options) {
  return ReconciliationApi.runReconciliation(pin, importId, options);
}

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationApi: ReconciliationApi,
    api_getReconProposals: api_getReconProposals,
    api_getReconAuditHistory: api_getReconAuditHistory,
    api_approveReconProposal: api_approveReconProposal,
    api_rejectReconProposal: api_rejectReconProposal,
    api_applyReconProposal: api_applyReconProposal,
    api_rollbackReconProposal: api_rollbackReconProposal,
    api_recoverReconProposals: api_recoverReconProposals,
    api_initReconDatabase: api_initReconDatabase,
    api_getReconSummary: api_getReconSummary,
    api_getReconIssues: api_getReconIssues,
    api_getReconImports: api_getReconImports,
    api_importReconFile: api_importReconFile,
    api_runReconMatching: api_runReconMatching
  };
}
