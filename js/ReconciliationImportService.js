/**
 * ==============================================================================
 * MODULE: ReconciliationImportService.js
 * MÔ TẢ: Dịch vụ tiếp nhận, chống trùng lặp và ghi dữ liệu đối soát vào các bảng
 *        đệm Staging (Recon_Imports, Recon_Rows) - Milestone M1-A.
 * DOANH NGHIỆP: Rich Fish Aquarium
 * NGUYÊN TẮC:
 * 1. Chỉ tương tác CSDL thông qua DAO ReconciliationDbService.
 * 2. Tuyệt đối không ghi vào bất kỳ bảng sản xuất nào (Orders, Transactions, Accounts...).
 * 3. Chống nạp lặp tệp (File Deduplication bằng SHA-256) và lặp dòng (Row Fingerprint).
 * 4. Không lưu trữ mã PIN trong cơ sở dữ liệu (chỉ lưu User ID/Name).
 * ==============================================================================
 */

// Nạp các module phụ thuộc nếu chạy trong môi trường Node.js
if (typeof ReconciliationConfig === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_IMPORT_STATUS = _cfg.RECON_IMPORT_STATUS;
  var RECON_ROW_STATUS = _cfg.RECON_ROW_STATUS;
}
if (typeof ReconciliationDbService === 'undefined' && typeof require !== 'undefined') {
  var _db = require('./ReconciliationDbService.js');
  var ReconciliationDbService = _db.ReconciliationDbService;
}
if (typeof ReconciliationNormalizer === 'undefined' && typeof require !== 'undefined') {
  var _norm = require('./ReconciliationNormalizer.js');
  var ReconciliationNormalizer = _norm.ReconciliationNormalizer;
}

var ReconciliationImportService = {
  /**
   * Tạo mã định danh duy nhất cho đợt nhập tệp (Import ID)
   * @returns {string}
   */
  generateImportId: function() {
    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    var dStr = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    var rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return 'IMP_' + dStr + '_' + rand;
  },

  /**
   * Tạo mã định danh duy nhất cho từng dòng đệm (Row ID)
   * @param {string} importId 
   * @param {number} rowIndex 
   * @returns {string}
   */
  generateRowId: function(importId, rowIndex) {
    var idxStr = ('00000' + rowIndex).slice(-5);
    return 'ROW_' + importId.replace('IMP_', '') + '_' + idxStr;
  },

  /**
   * Kiểm tra tệp đã từng được nạp thành công trước đó hay chưa (File Deduplication)
   * @param {string} fileHashSha256 
   * @returns {Object|null} Bản ghi import trùng nếu tìm thấy
   */
  checkDuplicateFile: function(fileHashSha256) {
    if (!fileHashSha256) return null;
    return ReconciliationDbService.findOne('Recon_Imports', 'file_hash_sha256', fileHashSha256);
  },

  /**
   * Kiểm tra dòng giao dịch đã từng tồn tại trong hệ thống hay chưa (Row Deduplication)
   * @param {string} rowFingerprint 
   * @returns {Object|null}
   */
  checkDuplicateRow: function(rowFingerprint) {
    if (!rowFingerprint) return null;
    return ReconciliationDbService.findOne('Recon_Rows', 'row_fingerprint', rowFingerprint);
  },

  /**
   * Tiếp nhận và nạp tệp sao kê vào các bảng đệm Staging
   * 
   * @param {Object} params
   * @param {string} params.sourceType - 'BANK_STATEMENT', 'SHOPEE_ESCROW', 'TIKTOK_SETTLEMENT'...
   * @param {string} params.sourceName - Tên file gốc (e.g. 'SaoKe_MB_082026.xlsx')
   * @param {string|ArrayBuffer} params.fileContent - Nội dung tệp để tính mã băm SHA-256
   * @param {number} [params.fileSize=0] - Dung lượng tệp (bytes)
   * @param {string} params.sourceFileDriveId - ID tệp lưu trữ trên Google Drive bảo mật
   * @param {string} [params.accountId=''] - ID tài khoản liên kết (Accounts.id)
   * @param {Array<Object>} params.parsedRows - Mảng các dòng dữ liệu đã phân tích sơ bộ
   * @param {Object} params.authenticatedUser - Thông tin người dùng đã xác thực { id, name, role } (KHÔNG CÓ PIN)
   * @param {Object} [params.rawMetadata={}] - Metadata đính kèm
   * 
   * @returns {Object} Kết quả nạp đệm
   */
  importStagingData: function(params) {
    if (!params) throw new Error('Tham số importStagingData không được để trống.');

    var authUser = params.authenticatedUser || {};
    var userId = authUser.id || 'ANONYMOUS';
    var userName = authUser.name || 'Anonymous User';

    // RÀNG BUỘC BẢO MẬT: Tuyệt đối không chấp nhận mã PIN
    if (authUser.pin || params.pin) {
      throw new Error('SECURITY_VIOLATION: Tuyệt đối không truyền hoặc lưu trữ mã PIN trong tham số đối soát.');
    }

    var sourceType = ReconciliationNormalizer.canonicalizeSourceType(params.sourceType);
    var sourceName = String(params.sourceName || 'UNNAMED_FILE').trim();
    var sourceDriveId = String(params.sourceFileDriveId || '').trim();
    var accountId = String(params.accountId || '').trim();

    // 1. Tính toán mã băm SHA-256 của tệp và kiểm tra trùng lặp tệp
    var fileContentStr = typeof params.fileContent === 'string' ? params.fileContent : JSON.stringify(params.fileContent || '');
    var fileHash = ReconciliationNormalizer.computeFileHashSha256(fileContentStr);
    var fileSize = Number(params.fileSize) || fileContentStr.length;

    var existingImport = this.checkDuplicateFile(fileHash);
    if (existingImport) {
      return {
        success: false,
        isDuplicateFile: true,
        error: 'DUPLICATE_FILE_IMPORT',
        message: 'Tệp đối soát này đã từng được nạp vào hệ thống!',
        existingImportId: existingImport.import_id,
        existingImportedAt: existingImport.imported_at,
        fileHash: fileHash
      };
    }

    var importId = this.generateImportId();
    var nowStr = ReconciliationNormalizer.canonicalizeDate(new Date());

    var rawRows = Array.isArray(params.parsedRows) ? params.parsedRows : [];
    var totalSourceRows = rawRows.length;

    var stagingRows = [];
    var validRowCount = 0;
    var warningRowCount = 0;
    var invalidRowCount = 0;
    var seenFingerprintsInBatch = {};

    // 2. Chuẩn hóa từng dòng dữ liệu và gắn bằng chứng cấp dòng
    for (var i = 0; i < rawRows.length; i++) {
      var r = rawRows[i];
      var rowIndex = i + 1;
      var rowId = this.generateRowId(importId, rowIndex);

      var channel = String(r.channel || r.kenh || sourceType.split('_')[0] || 'DIRECT').trim().toUpperCase();
      var extOrderId = ReconciliationNormalizer.canonicalizeOrderCode(r.orderCode || r.order_sn || r.ma_don || r.external_order_id || '');
      var extTxId = ReconciliationNormalizer.canonicalizeTransactionId(r.txId || r.ma_gd || r.external_tx_id || r.id || '');
      var extSettlementId = String(r.settlementId || r.external_settlement_id || '').trim();
      var extPayoutId = String(r.payoutId || r.external_payout_id || '').trim();
      var extDate = ReconciliationNormalizer.canonicalizeDate(r.date || r.ngay || r.external_date || new Date());

      var currency = String(r.currency || 'VND').trim().toUpperCase();
      var exchangeRate = Number(r.exchangeRate || 1);
      var rawAmount = r.amount !== undefined ? r.amount : (r.so_tien !== undefined ? r.so_tien : r.raw_amount);

      var moneyRes = ReconciliationNormalizer.canonicalizeMoney(rawAmount, currency, exchangeRate);
      var amountVnd = moneyRes.amountVnd;
      var isMoneyValid = moneyRes.success;

      var rawStatus = r.status || r.trang_thai || r.source_status || '';
      var normStatus = ReconciliationNormalizer.canonicalizeStatus(rawStatus);

      // Tính vân tay dòng để kiểm tra trùng lặp
      var rowFp = ReconciliationNormalizer.computeRowFingerprint(channel, extTxId, extOrderId, extDate, amountVnd);

      var rowReconStatus = (typeof RECON_ROW_STATUS !== 'undefined' && RECON_ROW_STATUS.UNMATCHED)
        ? RECON_ROW_STATUS.UNMATCHED
        : 'UNMATCHED';

      // Kiểm tra trùng lặp dòng trong cùng đợt hoặc đã có trong CSDL
      var isDuplicateRow = false;
      if (seenFingerprintsInBatch[rowFp] || this.checkDuplicateRow(rowFp)) {
        isDuplicateRow = true;
        rowReconStatus = 'DUPLICATE_ROW';
        warningRowCount++;
      } else {
        seenFingerprintsInBatch[rowFp] = true;
      }

      if (!isMoneyValid) {
        invalidRowCount++;
      } else if (!isDuplicateRow) {
        validRowCount++;
      }

      var rowRecord = {
        row_id: rowId,
        import_id: importId,
        row_index: rowIndex,
        channel: channel,
        external_order_id: extOrderId,
        external_tx_id: extTxId,
        external_settlement_id: extSettlementId,
        external_payout_id: extPayoutId,
        external_date: extDate,
        raw_amount: String(rawAmount !== undefined ? rawAmount : ''),
        amount_vnd: amountVnd,
        currency: currency,
        exchange_rate: exchangeRate,
        fee_breakdown: typeof r.feeBreakdown === 'object' ? JSON.stringify(r.feeBreakdown) : String(r.feeBreakdown || '{}'),
        source_status: String(rawStatus),
        normalized_status: normStatus,
        row_fingerprint: rowFp,
        recon_status: rowReconStatus,
        // Các trường so khớp để trống ở Milestone M1-A
        matched_target_table: '',
        matched_target_id: '',
        match_method: '',
        match_confidence: '',
        match_evidence: '',
        // Bảo toàn 100% bằng chứng cấp dòng
        raw_payload: ReconciliationNormalizer.serializeRawPayload(r)
      };

      stagingRows.push(rowRecord);
    }

    // 3. Chuẩn bị bản ghi tệp tổng hợp Recon_Imports
    var importStatus = (typeof RECON_IMPORT_STATUS !== 'undefined' && RECON_IMPORT_STATUS.PARSED)
      ? RECON_IMPORT_STATUS.PARSED
      : 'PARSED';

    if (invalidRowCount > 0 && validRowCount === 0) {
      importStatus = 'FAILED';
    }

    var importRecord = {
      import_id: importId,
      source_type: sourceType,
      source_name: sourceName,
      account_id: accountId,
      file_hash_sha256: fileHash,
      file_size: fileSize,
      source_file_drive_id: sourceDriveId,
      parser_version: (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.PARSER_VERSION) ? RECON_CONFIG.PARSER_VERSION : '1.0.0',
      mapping_version: (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.MAPPING_VERSION) ? RECON_CONFIG.MAPPING_VERSION : '2026.09',
      source_row_count: totalSourceRows,
      parsed_row_count: stagingRows.length,
      valid_row_count: validRowCount,
      warning_row_count: warningRowCount,
      invalid_row_count: invalidRowCount,
      imported_at: nowStr,
      imported_by_user_id: userId,
      imported_by_name: userName,
      status: importStatus,
      raw_metadata: JSON.stringify(params.rawMetadata || {})
    };

    // 4. Batch Insert an toàn có LockService vào CSDL đối soát qua DAO ReconciliationDbService
    ReconciliationDbService.insert('Recon_Imports', importRecord);
    if (stagingRows.length > 0) {
      ReconciliationDbService.insertBatch('Recon_Rows', stagingRows);
    }

    return {
      success: true,
      importId: importId,
      status: importStatus,
      fileHash: fileHash,
      totalRows: totalSourceRows,
      validRows: validRowCount,
      warningRows: warningRowCount,
      invalidRows: invalidRowCount,
      message: 'Đã tiếp nhận và lưu ' + stagingRows.length + ' dòng vào bảng đệm Staging thành công!'
    };
  }
};

// Xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationImportService: ReconciliationImportService
  };
}
