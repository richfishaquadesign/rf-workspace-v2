/**
 * ==============================================================================
 * MODULE: ReconciliationMatcher.js
 * MÔ TẢ: Engine so khớp dữ liệu đối soát tài chính (Deterministic Financial Matcher)
 *        - Đọc dữ liệu từ staging (Recon_Rows) và snapshot giả lập của production
 *        - TUYỆT ĐỐI KHÔNG GHI VÀO PRODUCTION TABLES (Orders, Transactions, Accounts...)
 *        - So khớp theo thứ tự ưu tiên nghiêm ngặt (Cascade Hierarchy):
 *            1. Mã đơn hàng khớp chính xác (EXACT_ORDER_CODE)
 *            2. Mã giao dịch khớp chính xác (EXACT_TX_ID)
 *            3. Mã quyết toán khớp chính xác (EXACT_SETTLEMENT_ID)
 *            4. Mã chi trả khớp chính xác (EXACT_PAYOUT_ID)
 *            5. Khớp ứng viên theo kênh + số tiền + ngày (HEURISTIC_AMT_DATE_CHAN)
 *        - Quy tắc:
 *            + Không dùng substring matching
 *            + Một dòng có nhiều ứng viên -> AMBIGUOUS_MATCH
 *            + Không có ứng viên -> UNMATCHED
 *            + Khớp số tiền/ngày chỉ là candidate discovery và luôn requires_manual_approval = true
 *            + match_confidence là điểm quy tắc tất định, không phải xác suất AI
 *            + Lưu match_evidence rõ ràng, chi tiết để kiểm tra lại được
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp cấu hình & normalizer nếu chạy trong môi trường Node.js
if (typeof RECON_CONFIG === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_MATCH_METHOD = _cfg.RECON_MATCH_METHOD;
  var RECON_MATCH_RESULT = _cfg.RECON_MATCH_RESULT;
  var RECON_ROW_STATUS = _cfg.RECON_ROW_STATUS;
}

if (typeof ReconciliationNormalizer === 'undefined' && typeof require !== 'undefined') {
  var _norm = require('./ReconciliationNormalizer.js');
  var ReconciliationNormalizer = _norm.ReconciliationNormalizer;
}

var ReconciliationMatcher = {
  /**
   * Trọng số điểm quy tắc tất định (Deterministic Rule Weights)
   * Không phải xác suất thống kê hay AI, mà là điểm số cộng dồn dựa trên các thuộc tính khớp.
   */
  RULE_WEIGHTS: {
    EXACT_ORDER_CODE: 1.0,
    EXACT_TX_ID: 1.0,
    EXACT_SETTLEMENT_ID: 0.95,
    EXACT_PAYOUT_ID: 0.95,
    HEURISTIC_BASE: 0.40,
    HEURISTIC_AMOUNT_MATCH: 0.20,
    HEURISTIC_DATE_MATCH: 0.15,
    HEURISTIC_CHANNEL_MATCH: 0.10
  },

  /**
   * So khớp một dòng Recon_Rows với snapshot production (Orders & Transactions)
   * 
   * @param {Object} reconRow - Bản ghi từ Recon_Rows
   * @param {Object} prodSnapshot - Snapshot dữ liệu sản xuất (Read-only):
   *        {
   *          orders: Array<Object>,        // Dữ liệu bảng Orders
   *          transactions: Array<Object>   // Dữ liệu bảng Transactions
   *        }
   * @param {Object} [options] - Tuỳ chọn cấu hình:
   *        {
   *          amountToleranceVnd: number,
   *          dateWindowDays: number
   *        }
   * @returns {Object} Kết quả so khớp có cấu trúc
   */
  matchRow: function(reconRow, prodSnapshot, options) {
    if (!reconRow) {
      throw new Error('[ReconciliationMatcher.matchRow] reconRow is required.');
    }
    prodSnapshot = prodSnapshot || { orders: [], transactions: [] };
    var orders = Array.isArray(prodSnapshot.orders) ? prodSnapshot.orders : [];
    var transactions = Array.isArray(prodSnapshot.transactions) ? prodSnapshot.transactions : [];

    options = options || {};
    var amountTolerance = (options.amountToleranceVnd !== undefined)
      ? options.amountToleranceVnd
      : (typeof RECON_CONFIG !== 'undefined' ? RECON_CONFIG.AMOUNT_TOLERANCE_VND : 0);
    var dateWindowDays = (options.dateWindowDays !== undefined)
      ? options.dateWindowDays
      : (typeof RECON_CONFIG !== 'undefined' ? RECON_CONFIG.DATE_MATCH_WINDOW_DAYS : 3);

    // Chuẩn hóa đầu vào của dòng đệm
    var extOrderCode = ReconciliationNormalizer.canonicalizeOrderCode(reconRow.external_order_id);
    var extTxId = ReconciliationNormalizer.canonicalizeTxId(reconRow.external_tx_id);
    var extSettlementId = reconRow.external_settlement_id ? String(reconRow.external_settlement_id).trim() : '';
    var extPayoutId = reconRow.external_payout_id ? String(reconRow.external_payout_id).trim() : '';
    var rowAmountVnd = Number(reconRow.amount_vnd) || 0;
    var rowDate = reconRow.external_date ? String(reconRow.external_date).trim() : '';
    var rowChannel = reconRow.channel ? String(reconRow.channel).trim().toUpperCase() : '';

    // =========================================================================
    // CẤP 1: SO KHỚP CHÍNH XÁC MÃ ĐƠN HÀNG (EXACT_ORDER_CODE)
    // Tuyệt đối không dùng substring match! Phải so khớp chính xác sau canonicalize.
    // =========================================================================
    if (extOrderCode) {
      var matchedOrders = [];
      for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        var oCode = ReconciliationNormalizer.canonicalizeOrderCode(o.orderCode || o.id);
        if (oCode && oCode === extOrderCode) {
          matchedOrders.push(o);
        }
      }

      if (matchedOrders.length === 1) {
        var targetOrder = matchedOrders[0];
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.EXACT_MATCH : 'EXACT_MATCH',
          targetTable: 'Orders',
          targetId: String(targetOrder.id || targetOrder.orderCode),
          targetRecord: targetOrder,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_ORDER_CODE : 'EXACT_ORDER_CODE',
          matchConfidence: this.RULE_WEIGHTS.EXACT_ORDER_CODE,
          requiresManualApproval: false,
          candidateCount: 1,
          evidence: {
            field: 'external_order_id',
            sourceValue: extOrderCode,
            targetValue: ReconciliationNormalizer.canonicalizeOrderCode(targetOrder.orderCode || targetOrder.id),
            matchedAt: new Date().toISOString(),
            criteria: 'EXACT_ORDER_CODE_MATCH'
          }
        };
      } else if (matchedOrders.length > 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          targetTable: 'Orders',
          targetId: null,
          targetRecord: null,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_ORDER_CODE : 'EXACT_ORDER_CODE',
          matchConfidence: 0.50,
          requiresManualApproval: true,
          candidateCount: matchedOrders.length,
          evidence: {
            field: 'external_order_id',
            sourceValue: extOrderCode,
            candidateIds: matchedOrders.map(function(m) { return String(m.id || m.orderCode); }),
            matchedAt: new Date().toISOString(),
            criteria: 'MULTIPLE_ORDERS_MATCHED_SAME_CODE'
          }
        };
      }
    }

    // =========================================================================
    // CẤP 2: SO KHỚP CHÍNH XÁC MÃ GIAO DỊCH (EXACT_TX_ID)
    // Tìm trong bảng Transactions theo id hoặc title/note có chứa mã giao dịch chuẩn xác
    // =========================================================================
    if (extTxId) {
      var matchedTxs = [];
      for (var j = 0; j < transactions.length; j++) {
        var tx = transactions[j];
        var txId = ReconciliationNormalizer.canonicalizeTxId(tx.id);
        if (txId && txId === extTxId) {
          matchedTxs.push(tx);
        }
      }

      if (matchedTxs.length === 1) {
        var targetTx = matchedTxs[0];
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.EXACT_MATCH : 'EXACT_MATCH',
          targetTable: 'Transactions',
          targetId: String(targetTx.id),
          targetRecord: targetTx,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_TX_ID : 'EXACT_TX_ID',
          matchConfidence: this.RULE_WEIGHTS.EXACT_TX_ID,
          requiresManualApproval: false,
          candidateCount: 1,
          evidence: {
            field: 'external_tx_id',
            sourceValue: extTxId,
            targetValue: ReconciliationNormalizer.canonicalizeTxId(targetTx.id),
            matchedAt: new Date().toISOString(),
            criteria: 'EXACT_TRANSACTION_ID_MATCH'
          }
        };
      } else if (matchedTxs.length > 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          targetTable: 'Transactions',
          targetId: null,
          targetRecord: null,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_TX_ID : 'EXACT_TX_ID',
          matchConfidence: 0.50,
          requiresManualApproval: true,
          candidateCount: matchedTxs.length,
          evidence: {
            field: 'external_tx_id',
            sourceValue: extTxId,
            candidateIds: matchedTxs.map(function(m) { return String(m.id); }),
            matchedAt: new Date().toISOString(),
            criteria: 'MULTIPLE_TRANSACTIONS_MATCHED_SAME_TX_ID'
          }
        };
      }
    }

    // =========================================================================
    // CẤP 3: SO KHỚP CHÍNH XÁC MÃ QUYẾT TOÁN (EXACT_SETTLEMENT_ID)
    // Kiểm tra trong Transactions.note hoặc Orders.reconciledAt/note nếu có lưu settlement code
    // =========================================================================
    if (extSettlementId) {
      var matchedSettlements = [];
      for (var k = 0; k < transactions.length; k++) {
        var sTx = transactions[k];
        // So khớp chính xác với trường ghi chú hoặc thuộc tính settlement nếu có
        var sNote = sTx.note ? String(sTx.note).trim() : '';
        if (sNote === extSettlementId || String(sTx.id).trim() === extSettlementId) {
          matchedSettlements.push(sTx);
        }
      }

      if (matchedSettlements.length === 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.EXACT_MATCH : 'EXACT_MATCH',
          targetTable: 'Transactions',
          targetId: String(matchedSettlements[0].id),
          targetRecord: matchedSettlements[0],
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_SETTLEMENT_ID : 'EXACT_SETTLEMENT_ID',
          matchConfidence: this.RULE_WEIGHTS.EXACT_SETTLEMENT_ID,
          requiresManualApproval: false,
          candidateCount: 1,
          evidence: {
            field: 'external_settlement_id',
            sourceValue: extSettlementId,
            targetValue: String(matchedSettlements[0].id),
            matchedAt: new Date().toISOString(),
            criteria: 'EXACT_SETTLEMENT_ID_MATCH'
          }
        };
      } else if (matchedSettlements.length > 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          targetTable: 'Transactions',
          targetId: null,
          targetRecord: null,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_SETTLEMENT_ID : 'EXACT_SETTLEMENT_ID',
          matchConfidence: 0.50,
          requiresManualApproval: true,
          candidateCount: matchedSettlements.length,
          evidence: {
            field: 'external_settlement_id',
            sourceValue: extSettlementId,
            candidateIds: matchedSettlements.map(function(m) { return String(m.id); }),
            matchedAt: new Date().toISOString(),
            criteria: 'MULTIPLE_SETTLEMENTS_MATCHED'
          }
        };
      }
    }

    // =========================================================================
    // CẤP 4: SO KHỚP CHÍNH XÁC MÃ CHI TRẢ (EXACT_PAYOUT_ID)
    // =========================================================================
    if (extPayoutId) {
      var matchedPayouts = [];
      for (var p = 0; p < transactions.length; p++) {
        var pTx = transactions[p];
        var pNote = pTx.note ? String(pTx.note).trim() : '';
        if (pNote === extPayoutId || String(pTx.id).trim() === extPayoutId) {
          matchedPayouts.push(pTx);
        }
      }

      if (matchedPayouts.length === 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.EXACT_MATCH : 'EXACT_MATCH',
          targetTable: 'Transactions',
          targetId: String(matchedPayouts[0].id),
          targetRecord: matchedPayouts[0],
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_PAYOUT_ID : 'EXACT_PAYOUT_ID',
          matchConfidence: this.RULE_WEIGHTS.EXACT_PAYOUT_ID,
          requiresManualApproval: false,
          candidateCount: 1,
          evidence: {
            field: 'external_payout_id',
            sourceValue: extPayoutId,
            targetValue: String(matchedPayouts[0].id),
            matchedAt: new Date().toISOString(),
            criteria: 'EXACT_PAYOUT_ID_MATCH'
          }
        };
      } else if (matchedPayouts.length > 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          targetTable: 'Transactions',
          targetId: null,
          targetRecord: null,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.EXACT_PAYOUT_ID : 'EXACT_PAYOUT_ID',
          matchConfidence: 0.50,
          requiresManualApproval: true,
          candidateCount: matchedPayouts.length,
          evidence: {
            field: 'external_payout_id',
            sourceValue: extPayoutId,
            candidateIds: matchedPayouts.map(function(m) { return String(m.id); }),
            matchedAt: new Date().toISOString(),
            criteria: 'MULTIPLE_PAYOUTS_MATCHED'
          }
        };
      }
    }

    // =========================================================================
    // CẤP 5: TÌM ỨNG VIÊN THEO KÊNH + SỐ TIỀN + NGÀY (HEURISTIC_AMT_DATE_CHAN)
    // CHỈ DÙNG CHO CANDIDATE DISCOVERY - LUÔN YÊU CẦU DUYỆT TAY (requiresManualApproval: true)
    // =========================================================================
    if (rowAmountVnd > 0 && rowDate) {
      var candidateOrders = [];

      for (var c = 0; c < orders.length; c++) {
        var ord = orders[c];
        var ordChan = ord.channel ? String(ord.channel).trim().toUpperCase() : '';
        var ordRevenue = Number(ord.revenue) || 0;
        var ordDate = ord.date || ord.createdAt;

        var channelMatch = (!rowChannel || !ordChan || rowChannel === ordChan);
        var amountMatch = ReconciliationNormalizer.isReconMatchWithinTolerance('amount', ordRevenue, rowAmountVnd, {
          amountTolerance: amountTolerance
        });
        var dateMatch = ReconciliationNormalizer.isReconMatchWithinTolerance('date', ordDate, rowDate, {
          windowDays: dateWindowDays
        });

        if (channelMatch && amountMatch && dateMatch) {
          candidateOrders.push({
            record: ord,
            channelMatch: channelMatch,
            amountMatch: amountMatch,
            dateMatch: dateMatch,
            diffAmount: Math.abs(ordRevenue - rowAmountVnd)
          });
        }
      }

      if (candidateOrders.length === 1) {
        var singleCandidate = candidateOrders[0];
        // Tính match_confidence bằng tổng trọng số quy tắc tất định
        var conf = this.RULE_WEIGHTS.HEURISTIC_BASE;
        if (singleCandidate.channelMatch) conf += this.RULE_WEIGHTS.HEURISTIC_CHANNEL_MATCH;
        if (singleCandidate.amountMatch) conf += this.RULE_WEIGHTS.HEURISTIC_AMOUNT_MATCH;
        if (singleCandidate.dateMatch) conf += this.RULE_WEIGHTS.HEURISTIC_DATE_MATCH;
        conf = Math.round(conf * 100) / 100;

        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.CANDIDATE_MATCH : 'CANDIDATE_MATCH',
          targetTable: 'Orders',
          targetId: String(singleCandidate.record.id || singleCandidate.record.orderCode),
          targetRecord: singleCandidate.record,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.HEURISTIC_AMT_DATE_CHAN : 'HEURISTIC_AMT_DATE_CHAN',
          matchConfidence: conf,
          // BẮT BUỘC: Khớp mờ theo tiền/ngày luôn cần duyệt tay
          requiresManualApproval: true,
          candidateCount: 1,
          evidence: {
            channel: rowChannel,
            amountVnd: rowAmountVnd,
            targetRevenue: Number(singleCandidate.record.revenue) || 0,
            date: rowDate,
            targetDate: singleCandidate.record.date || singleCandidate.record.createdAt,
            matchedAt: new Date().toISOString(),
            criteria: 'HEURISTIC_CANDIDATE_DISCOVERY_REQUIRES_APPROVAL'
          }
        };
      } else if (candidateOrders.length > 1) {
        return {
          status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.AMBIGUOUS_MATCH : 'AMBIGUOUS_MATCH',
          targetTable: 'Orders',
          targetId: null,
          targetRecord: null,
          matchMethod: (typeof RECON_MATCH_METHOD !== 'undefined') ? RECON_MATCH_METHOD.HEURISTIC_AMT_DATE_CHAN : 'HEURISTIC_AMT_DATE_CHAN',
          matchConfidence: 0.40,
          requiresManualApproval: true,
          candidateCount: candidateOrders.length,
          evidence: {
            channel: rowChannel,
            amountVnd: rowAmountVnd,
            candidateIds: candidateOrders.map(function(c) { return String(c.record.id || c.record.orderCode); }),
            matchedAt: new Date().toISOString(),
            criteria: 'MULTIPLE_CANDIDATES_MATCHED_AMOUNT_DATE_WINDOW'
          }
        };
      }
    }

    // =========================================================================
    // KHÔNG TÌM THẤY ỨNG VIÊN NÀO (UNMATCHED)
    // =========================================================================
    return {
      status: (typeof RECON_MATCH_RESULT !== 'undefined') ? RECON_MATCH_RESULT.UNMATCHED : 'UNMATCHED',
      targetTable: null,
      targetId: null,
      targetRecord: null,
      matchMethod: null,
      matchConfidence: 0.0,
      requiresManualApproval: true,
      candidateCount: 0,
      evidence: {
        searchedOrderCode: extOrderCode || null,
        searchedTxId: extTxId || null,
        searchedSettlementId: extSettlementId || null,
        searchedPayoutId: extPayoutId || null,
        searchedAmount: rowAmountVnd,
        searchedDate: rowDate,
        matchedAt: new Date().toISOString(),
        criteria: 'NO_CANDIDATE_FOUND_IN_PRODUCTION'
      }
    };
  }
};

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationMatcher: ReconciliationMatcher
  };
}
