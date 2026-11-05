/**
 * ==============================================================================
 * MODULE: ReconciliationEngine.js
 * MÔ TẢ: Engine điều phối phiên đối soát dữ liệu tài chính (Reconciliation Engine)
 *        - Tạo Recon_Run ở trạng thái RUNNING.
 *        - Chạy Matcher trên các Recon_Rows.
 *        - Phát hiện sai lệch và ghi vào Recon_Issues:
 *            + UNMATCHED_ROW (Không tìm thấy)
 *            + AMBIGUOUS_MATCH (Nhiều ứng viên)
 *            + DUPLICATE_PAYOUT (Dòng trùng lặp)
 *            + AMOUNT_MISMATCH (Lệch số tiền)
 *            + STATUS_CONFLICT (Lệch trạng thái)
 *            + DATE_MISMATCH (Lệch ngày giao dịch)
 *        - Tạo Recon_Proposals ở trạng thái PENDING với evidence và lý do giải thích rõ ràng.
 *        - Chống sinh proposal trùng lặp bằng idempotency_key tất định.
 *        - Hoàn tất phiên chạy với COMPLETED.
 *        - MẶC ĐỊNH LUÔN dry_run: true.
 *        - TUYỆT ĐỐI KHÔNG GHI VÀO BẢNG SẢN XUẤT (Orders, Transactions, Accounts...).
 *        - KHÔNG TẠO operation_id trong M1-B (Dành cho M1-C khi thực hiện apply).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp cấu hình & các service phụ thuộc nếu chạy trong môi trường Node.js
if (typeof RECON_CONFIG === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_RUN_STATUS = _cfg.RECON_RUN_STATUS;
  var RECON_ROW_STATUS = _cfg.RECON_ROW_STATUS;
  var RECON_ISSUE_TYPE = _cfg.RECON_ISSUE_TYPE;
  var RECON_ISSUE_STATUS = _cfg.RECON_ISSUE_STATUS;
  var RECON_SEVERITY = _cfg.RECON_SEVERITY;
  var RECON_ACTION_TYPE = _cfg.RECON_ACTION_TYPE;
  var RECON_PROPOSAL_STATUS = _cfg.RECON_PROPOSAL_STATUS;
  var RECON_MATCH_RESULT = _cfg.RECON_MATCH_RESULT;
  var RECON_CANONICAL_TYPES = _cfg.RECON_CANONICAL_TYPES;
}

if (typeof ReconciliationDbService === 'undefined' && typeof require !== 'undefined') {
  var _db = require('./ReconciliationDbService.js');
  var ReconciliationDbService = _db.ReconciliationDbService;
}

if (typeof ReconciliationNormalizer === 'undefined' && typeof require !== 'undefined') {
  var _norm = require('./ReconciliationNormalizer.js');
  var ReconciliationNormalizer = _norm.ReconciliationNormalizer;
}

if (typeof ReconciliationMatcher === 'undefined' && typeof require !== 'undefined') {
  var _mat = require('./ReconciliationMatcher.js');
  var ReconciliationMatcher = _mat.ReconciliationMatcher;
}

var ReconciliationEngine = {
  /**
   * Sinh mã khóa Idempotency tất định cho một đề xuất điều chỉnh logic.
   * Cùng một hành động logic trên cùng một bản ghi/trường sẽ luôn ra cùng một khóa.
   * 
   * @param {string} actionType - 'UPDATE_FIELD' | 'INSERT_TRANSACTION'
   * @param {string} targetTable - 'Orders' | 'Transactions' | 'Accounts'
   * @param {string} targetIdOrKey - ID bản ghi đích hoặc mã định danh duy nhất (VD: OrderCode/TxId)
   * @param {string} targetFieldOrSubtype - Tên trường cần update hoặc loại giao dịch
   * @param {any} newValue - Giá trị mới đề xuất
   * @returns {string} Khóa Idempotency tất định
   */
  generateIdempotencyKey: function(actionType, targetTable, targetIdOrKey, targetFieldOrSubtype, newValue) {
    var rawSig = [
      String(actionType || '').trim().toUpperCase(),
      String(targetTable || '').trim().toUpperCase(),
      String(targetIdOrKey || '').trim().toUpperCase(),
      String(targetFieldOrSubtype || '').trim().toUpperCase(),
      typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue || '').trim()
    ].join('::');

    var hashHex = ReconciliationNormalizer.computeFileHashSha256(rawSig);
    return 'IDEMP_' + hashHex.substring(0, 20);
  },

  /**
   * Sinh mã ID giao dịch tất định cho hành động INSERT_TRANSACTION từ logical idempotency key
   * Tuân thủ kiến trúc: TX_RECON_<short_hash(idempotency_key)>
   * 
   * @param {string} idempotencyKey 
   * @returns {string}
   */
  generateDeterministicTxId: function(idempotencyKey) {
    var shortHash = ReconciliationNormalizer.computeFileHashSha256(String(idempotencyKey || '')).substring(0, 12);
    return 'TX_RECON_' + shortHash.toUpperCase();
  },

  /**
   * Thực thi một phiên đối soát (Reconciliation Run) trên tập dữ liệu Recon_Rows
   * 
   * @param {Object} params
   *        {
   *          importId: string,                  // Mã đợt nạp tệp (Nullable)
   *          runType: string,                   // 'BATCH_IMPORT' | 'REVERIFICATION' | 'SIMULATION'
   *          dryRun: boolean,                   // Mặc định luôn true
   *          prodSnapshot: Object,              // { orders: [...], transactions: [...] } (Read-only)
   *          options: Object                    // { amountToleranceVnd, dateWindowDays }
   *        }
   * @returns {Object} Kết quả phiên đối soát
   */
  executeRun: function(params) {
    params = params || {};
    var importId = params.importId || null;
    var runType = params.runType || 'BATCH_IMPORT';
    var isDryRun = (params.dryRun !== undefined) ? !!params.dryRun : true;
    var prodSnapshot = params.prodSnapshot || { orders: [], transactions: [] };
    var options = params.options || {};

    // 1. Tạo phiên chạy Recon_Run ở trạng thái RUNNING
    var timestampStr = (typeof Utilities !== 'undefined')
      ? Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss')
      : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    var runId = 'RUN_' + timestampStr + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    var startedAt = new Date().toISOString();

    var runRecord = {
      run_id: runId,
      import_id: importId,
      run_type: runType,
      started_at: startedAt,
      completed_at: '',
      status: (typeof RECON_RUN_STATUS !== 'undefined') ? RECON_RUN_STATUS.RUNNING : 'RUNNING',
      matched_count: 0,
      issue_count: 0,
      proposal_count: 0,
      applied_count: 0,
      dry_run: isDryRun,
      summary: '{}'
    };

    ReconciliationDbService.insert('Recon_Runs', runRecord);

    // 2. Lấy danh sách các dòng cần đối soát từ Recon_Rows
    var rowsToProcess = [];
    if (importId) {
      rowsToProcess = ReconciliationDbService.find('Recon_Rows', function(row) {
        return row.import_id === importId;
      });
    } else {
      // Nếu không chỉ định importId, xử lý tất cả các dòng UNMATCHED hoặc DISCREPANCY
      rowsToProcess = ReconciliationDbService.find('Recon_Rows', function(row) {
        return row.recon_status === (typeof RECON_ROW_STATUS !== 'undefined' ? RECON_ROW_STATUS.UNMATCHED : 'UNMATCHED') ||
               !row.recon_status;
      });
    }

    // Tải danh sách đề xuất hiện có trong Recon_Proposals để chống tạo trùng lặp
    var existingProposals = ReconciliationDbService.getAll('Recon_Proposals');
    var existingIdempKeys = {};
    existingProposals.forEach(function(p) {
      if (p.idempotency_key) {
        existingIdempKeys[p.idempotency_key] = p;
      }
    });

    var matchedCount = 0;
    var issueCount = 0;
    var proposalCount = 0;

    var issuesToInsert = [];
    var proposalsToInsert = [];
    var rowsToUpdate = [];

    // 3. Quét từng dòng qua ReconciliationMatcher
    for (var idx = 0; idx < rowsToProcess.length; idx++) {
      var rRow = rowsToProcess[idx];

      // Xử lý dòng đã bị đánh dấu trùng lặp ở tầng nạp (DUPLICATE_ROW)
      if (rRow.recon_status === (typeof RECON_ROW_STATUS !== 'undefined' ? RECON_ROW_STATUS.DUPLICATE_ROW : 'DUPLICATE_ROW')) {
        issueCount++;
        issuesToInsert.push({
          issue_id: 'ISS_' + runId.replace('RUN_', '') + '_' + String(issueCount).padStart(4, '0'),
          run_id: runId,
          row_id: rRow.row_id,
          target_table: 'Recon_Rows',
          target_id: rRow.row_id,
          issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.DUPLICATE_PAYOUT : 'DUPLICATE_PAYOUT',
          severity: (typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.LOW : 'LOW',
          expected_value: '',
          actual_value: rRow.row_fingerprint,
          discrepancy_amount: 0,
          description: 'Dòng thanh toán trùng lặp mã vân tay (Row Fingerprint), đã tự động bỏ qua.',
          status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.RESOLVED : 'RESOLVED',
          created_at: new Date().toISOString()
        });
        continue;
      }

      var matchRes = ReconciliationMatcher.matchRow(rRow, prodSnapshot, options);

      // Cập nhật thông tin so khớp vào Recon_Rows (Staging)
      var updatedRowStatus = (typeof RECON_ROW_STATUS !== 'undefined') ? RECON_ROW_STATUS.UNMATCHED : 'UNMATCHED';
      var matchedTargetTable = matchRes.targetTable || '';
      var matchedTargetId = matchRes.targetId || '';

      if (matchRes.status === (typeof RECON_MATCH_RESULT !== 'undefined' ? RECON_MATCH_RESULT.EXACT_MATCH : 'EXACT_MATCH') ||
          matchRes.status === (typeof RECON_MATCH_RESULT !== 'undefined' ? RECON_MATCH_RESULT.CANDIDATE_MATCH : 'CANDIDATE_MATCH')) {
        matchedCount++;
        updatedRowStatus = (typeof RECON_ROW_STATUS !== 'undefined') ? RECON_ROW_STATUS.MATCHED : 'MATCHED';

        // Phân tích sai lệch giữa dòng đối soát và bản ghi sản xuất đích
        var issuesAndProps = this._analyzeDiscrepancies(rRow, matchRes, runId, existingIdempKeys);
        if (issuesAndProps.issues.length > 0) {
          updatedRowStatus = (typeof RECON_ROW_STATUS !== 'undefined') ? RECON_ROW_STATUS.DISCREPANCY : 'DISCREPANCY';
          for (var i = 0; i < issuesAndProps.issues.length; i++) {
            issueCount++;
            var iss = issuesAndProps.issues[i];
            iss.issue_id = 'ISS_' + runId.replace('RUN_', '') + '_' + String(issueCount).padStart(4, '0');
            issuesToInsert.push(iss);
          }
          for (var p = 0; p < issuesAndProps.proposals.length; p++) {
            proposalCount++;
            var prop = issuesAndProps.proposals[p];
            prop.proposal_id = 'PROP_' + runId.replace('RUN_', '') + '_' + String(proposalCount).padStart(4, '0');
            proposalsToInsert.push(prop);
            // Ghi nhớ key để chống tạo lặp ngay trong cùng phiên chạy
            existingIdempKeys[prop.idempotency_key] = prop;
          }
        }
      } else if (matchRes.status === (typeof RECON_MATCH_RESULT !== 'undefined' ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH')) {
        issueCount++;
        issuesToInsert.push({
          issue_id: 'ISS_' + runId.replace('RUN_', '') + '_' + String(issueCount).padStart(4, '0'),
          run_id: runId,
          row_id: rRow.row_id,
          target_table: matchRes.targetTable || 'Orders',
          target_id: '',
          issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          severity: (typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.HIGH : 'HIGH',
          expected_value: rRow.external_order_id || rRow.external_tx_id,
          actual_value: JSON.stringify(matchRes.evidence.candidateIds || []),
          discrepancy_amount: 0,
          description: 'Phát hiện nhiều hơn 1 ứng viên (' + matchRes.candidateCount + ' ứng viên) trùng khớp tiêu chí. Cần rà soát thủ công.',
          status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.OPEN : 'OPEN',
          created_at: new Date().toISOString()
        });
        updatedRowStatus = (typeof RECON_ROW_STATUS !== 'undefined') ? RECON_ROW_STATUS.DISCREPANCY : 'DISCREPANCY';
      } else {
        // UNMATCHED: Không tìm thấy ứng viên trong sản xuất
        issueCount++;
        issuesToInsert.push({
          issue_id: 'ISS_' + runId.replace('RUN_', '') + '_' + String(issueCount).padStart(4, '0'),
          run_id: runId,
          row_id: rRow.row_id,
          target_table: 'Orders',
          target_id: '',
          issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.UNMATCHED_ROW : 'UNMATCHED_ROW',
          severity: (typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.MEDIUM : 'MEDIUM',
          expected_value: rRow.external_order_id || rRow.external_tx_id || '',
          actual_value: 'NOT_FOUND_IN_ERP',
          discrepancy_amount: Number(rRow.amount_vnd) || 0,
          description: 'Dòng sao kê đối soát không tìm thấy đơn hàng hoặc giao dịch tương ứng trên hệ thống ERP.',
          status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.OPEN : 'OPEN',
          created_at: new Date().toISOString()
        });
        updatedRowStatus = (typeof RECON_ROW_STATUS !== 'undefined') ? RECON_ROW_STATUS.UNMATCHED : 'UNMATCHED';
      }

      // Lưu delta cập nhật cho Recon_Rows
      rowsToUpdate.push({
        row_id: rRow.row_id,
        recon_status: updatedRowStatus,
        matched_target_table: matchedTargetTable,
        matched_target_id: matchedTargetId,
        match_method: matchRes.matchMethod || '',
        match_confidence: matchRes.matchConfidence || 0,
        match_evidence: JSON.stringify(matchRes.evidence || {})
      });
    }

    // 4. Ghi các bản ghi Staging an toàn (Batch Inserts & Updates)
    if (issuesToInsert.length > 0) {
      ReconciliationDbService.insertBatch('Recon_Issues', issuesToInsert);
    }
    if (proposalsToInsert.length > 0) {
      ReconciliationDbService.insertBatch('Recon_Proposals', proposalsToInsert);
    }
    for (var u = 0; u < rowsToUpdate.length; u++) {
      var uRow = rowsToUpdate[u];
      ReconciliationDbService.updateWhere('Recon_Rows', 'row_id', uRow.row_id, {
        recon_status: uRow.recon_status,
        matched_target_table: uRow.matched_target_table,
        matched_target_id: uRow.matched_target_id,
        match_method: uRow.match_method,
        match_confidence: uRow.match_confidence,
        match_evidence: uRow.match_evidence
      });
    }

    // 5. Cập nhật Recon_Run sang trạng thái COMPLETED
    var completedAt = new Date().toISOString();
    var summaryData = {
      totalRowsProcessed: rowsToProcess.length,
      matchedCount: matchedCount,
      issueCount: issueCount,
      proposalCount: proposalCount,
      dryRun: isDryRun
    };

    ReconciliationDbService.updateWhere('Recon_Runs', 'run_id', runId, {
      status: (typeof RECON_RUN_STATUS !== 'undefined') ? RECON_RUN_STATUS.COMPLETED : 'COMPLETED',
      completed_at: completedAt,
      matched_count: matchedCount,
      issue_count: issueCount,
      proposal_count: proposalCount,
      applied_count: 0,
      summary: JSON.stringify(summaryData)
    });

    return {
      success: true,
      runId: runId,
      status: (typeof RECON_RUN_STATUS !== 'undefined') ? RECON_RUN_STATUS.COMPLETED : 'COMPLETED',
      matchedCount: matchedCount,
      issueCount: issueCount,
      proposalCount: proposalCount,
      dryRun: isDryRun,
      summary: summaryData
    };
  },

  /**
   * Phân tích sai lệch giữa dòng sao kê và bản ghi đích, sinh Issue và Proposal tương ứng
   * @private
   */
  _analyzeDiscrepancies: function(reconRow, matchRes, runId, existingIdempKeys) {
    var issues = [];
    var proposals = [];
    var target = matchRes.targetRecord;
    var targetTable = matchRes.targetTable;
    var targetId = matchRes.targetId;

    if (!target) return { issues: issues, proposals: proposals };

    var rowAmountVnd = Number(reconRow.amount_vnd) || 0;
    var rowStatusNorm = reconRow.normalized_status || '';
    var rowDate = reconRow.external_date || '';

    // =========================================================================
    // 1. KIỂM TRA SAI LỆCH SỐ TIỀN (AMOUNT_MISMATCH)
    // =========================================================================
    if (targetTable === 'Orders') {
      var ordRevenue = Number(target.revenue) || 0;
      var diffRevenue = Math.abs(ordRevenue - rowAmountVnd);
      if (diffRevenue > 0) {
        var issueAmount = {
          issue_id: '',
          run_id: runId,
          row_id: reconRow.row_id,
          target_table: 'Orders',
          target_id: targetId,
          issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.AMOUNT_MISMATCH : 'AMOUNT_MISMATCH',
          severity: diffRevenue > 100000 ? ((typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.HIGH : 'HIGH') : ((typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.MEDIUM : 'MEDIUM'),
          expected_value: String(rowAmountVnd),
          actual_value: String(ordRevenue),
          discrepancy_amount: diffRevenue,
          description: 'Lệch số tiền doanh thu đơn hàng: ERP=' + ordRevenue + ' VNĐ, Sao kê đối soát=' + rowAmountVnd + ' VNĐ (Lệch ' + diffRevenue + ' VNĐ).',
          status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.OPEN : 'OPEN',
          created_at: new Date().toISOString()
        };
        issues.push(issueAmount);

        // Sinh proposal UPDATE_FIELD cho doanh thu nếu chưa tồn tại đề xuất tương tự
        var idempKeyRev = this.generateIdempotencyKey(
          (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
          'Orders',
          targetId,
          'revenue',
          rowAmountVnd
        );

        if (!existingIdempKeys[idempKeyRev]) {
          proposals.push({
            proposal_id: '',
            issue_id: '',
            run_id: runId,
            operation_id: '', // M1-B: Không sinh operation_id, để trống
            idempotency_key: idempKeyRev,
            action_type: (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
            target_table: 'Orders',
            target_id: targetId,
            target_field: 'revenue',
            field_type: (typeof RECON_CANONICAL_TYPES !== 'undefined') ? RECON_CANONICAL_TYPES.VND_INTEGER : 'VND_INTEGER',
            old_value: String(ordRevenue),
            new_value: String(rowAmountVnd),
            proposal_status: (typeof RECON_PROPOSAL_STATUS !== 'undefined') ? RECON_PROPOSAL_STATUS.PENDING : 'PENDING',
            requires_manual_approval: matchRes.requiresManualApproval || true,
            created_at: new Date().toISOString(),
            reviewed_by: '',
            reviewed_at: '',
            applied_at: '',
            rejection_reason: ''
          });
        }
      }

      // =======================================================================
      // 2. KIỂM TRA SAI LỆCH TRẠNG THÁI (STATUS_CONFLICT)
      // =======================================================================
      var ordStatus = target.status ? String(target.status).trim() : '';
      if (rowStatusNorm && ordStatus && rowStatusNorm !== ordStatus) {
        // Chỉ tạo xung đột nếu trạng thái đích chưa phải là trạng thái cuối
        if (ordStatus !== 'Đối Soát Thành Công') {
          var issueStatus = {
            issue_id: '',
            run_id: runId,
            row_id: reconRow.row_id,
            target_table: 'Orders',
            target_id: targetId,
            issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.STATUS_CONFLICT : 'STATUS_CONFLICT',
            severity: (typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.MEDIUM : 'MEDIUM',
            expected_value: rowStatusNorm,
            actual_value: ordStatus,
            discrepancy_amount: 0,
            description: 'Xung đột trạng thái đơn hàng: ERP="' + ordStatus + '", Báo cáo đối soát="' + rowStatusNorm + '".',
            status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.OPEN : 'OPEN',
            created_at: new Date().toISOString()
          };
          issues.push(issueStatus);

          var idempKeyStatus = this.generateIdempotencyKey(
            (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
            'Orders',
            targetId,
            'status',
            rowStatusNorm
          );

          if (!existingIdempKeys[idempKeyStatus]) {
            proposals.push({
              proposal_id: '',
              issue_id: '',
              run_id: runId,
              operation_id: '',
              idempotency_key: idempKeyStatus,
              action_type: (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
              target_table: 'Orders',
              target_id: targetId,
              target_field: 'status',
              field_type: (typeof RECON_CANONICAL_TYPES !== 'undefined') ? RECON_CANONICAL_TYPES.STRING : 'STRING',
              old_value: ordStatus,
              new_value: rowStatusNorm,
              proposal_status: (typeof RECON_PROPOSAL_STATUS !== 'undefined') ? RECON_PROPOSAL_STATUS.PENDING : 'PENDING',
              requires_manual_approval: matchRes.requiresManualApproval || true,
              created_at: new Date().toISOString(),
              reviewed_by: '',
              reviewed_at: '',
              applied_at: '',
              rejection_reason: ''
            });
          }
        }
      }
    }

    // =========================================================================
    // 3. ĐỐI SOÁT VỚI BẢNG TRANSACTIONS (NẾU KHỚP TRANSACTIONS)
    // =========================================================================
    if (targetTable === 'Transactions') {
      var txAmount = Number(target.amount) || 0;
      var diffTx = Math.abs(txAmount - rowAmountVnd);
      if (diffTx > 0) {
        var issueTxAmount = {
          issue_id: '',
          run_id: runId,
          row_id: reconRow.row_id,
          target_table: 'Transactions',
          target_id: targetId,
          issue_type: (typeof RECON_ISSUE_TYPE !== 'undefined') ? RECON_ISSUE_TYPE.AMOUNT_MISMATCH : 'AMOUNT_MISMATCH',
          severity: (typeof RECON_SEVERITY !== 'undefined') ? RECON_SEVERITY.HIGH : 'HIGH',
          expected_value: String(rowAmountVnd),
          actual_value: String(txAmount),
          discrepancy_amount: diffTx,
          description: 'Lệch số tiền giao dịch: ERP=' + txAmount + ' VNĐ, Sao kê=' + rowAmountVnd + ' VNĐ (Lệch ' + diffTx + ' VNĐ).',
          status: (typeof RECON_ISSUE_STATUS !== 'undefined') ? RECON_ISSUE_STATUS.OPEN : 'OPEN',
          created_at: new Date().toISOString()
        };
        issues.push(issueTxAmount);

        var idempKeyTx = this.generateIdempotencyKey(
          (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
          'Transactions',
          targetId,
          'amount',
          rowAmountVnd
        );

        if (!existingIdempKeys[idempKeyTx]) {
          proposals.push({
            proposal_id: '',
            issue_id: '',
            run_id: runId,
            operation_id: '',
            idempotency_key: idempKeyTx,
            action_type: (typeof RECON_ACTION_TYPE !== 'undefined') ? RECON_ACTION_TYPE.UPDATE_FIELD : 'UPDATE_FIELD',
            target_table: 'Transactions',
            target_id: targetId,
            target_field: 'amount',
            field_type: (typeof RECON_CANONICAL_TYPES !== 'undefined') ? RECON_CANONICAL_TYPES.VND_INTEGER : 'VND_INTEGER',
            old_value: String(txAmount),
            new_value: String(rowAmountVnd),
            proposal_status: (typeof RECON_PROPOSAL_STATUS !== 'undefined') ? RECON_PROPOSAL_STATUS.PENDING : 'PENDING',
            requires_manual_approval: true,
            created_at: new Date().toISOString(),
            reviewed_by: '',
            reviewed_at: '',
            applied_at: '',
            rejection_reason: ''
          });
        }
      }
    }

    return { issues: issues, proposals: proposals };
  }
};

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationEngine: ReconciliationEngine
  };
}
