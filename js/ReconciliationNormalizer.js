/**
 * ==============================================================================
 * MODULE: ReconciliationNormalizer.js
 * MÔ TẢ: Bộ chuẩn hóa dữ liệu xác định (Deterministic Normalizer) cho phân hệ đối soát:
 *        1. Chuẩn hóa tiêu đề cột (Headers).
 *        2. Chuẩn hóa tiền tệ số nguyên VNĐ (Integer VND) & xác thực Number.isInteger.
 *        3. Chuẩn hóa ngày giờ 24H (YYYY-MM-DD HH:mm:ss).
 *        4. Chuẩn hóa mã đơn hàng, mã giao dịch, kênh bán hàng.
 *        5. Tái sử dụng trực tiếp normalizeStatus() từ Code.js (Không tạo hàm cạnh tranh).
 *        6. Tính toán mã băm SHA-256 tệp và vân tay dòng (Row Fingerprint) chống trùng lặp.
 *        7. Hợp đồng so khớp CAS tuyệt đối compareReconValue().
 *        8. Bảo toàn 100% dòng thô gốc dưới dạng JSON (raw_payload).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * ==============================================================================
 */

// Nạp các hàm cần thiết nếu chạy trong Node.js test environment
if (typeof RECON_CANONICAL_TYPES === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CANONICAL_TYPES = _cfg.RECON_CANONICAL_TYPES;
}

var ReconciliationNormalizer = {
  /**
   * 1. Chuẩn hóa tiêu đề cột file nhập (Header Canonicalization)
   * Loại bỏ khoảng trắng, chuyển chữ thường, chuẩn hóa Unicode NFC, loại bỏ dấu tiếng Việt
   * @param {string} rawHeader 
   * @returns {string}
   */
  canonicalizeHeader: function(rawHeader) {
    if (!rawHeader) return '';
    var s = String(rawHeader).trim().toLowerCase();
    try { s = s.normalize('NFC'); } catch (e) {}
    // Loại bỏ dấu tiếng Việt để so khớp bí danh cột linh hoạt
    s = s.replace(/[\u0300-\u036f]/g, '')
         .replace(/đ/g, 'd')
         .replace(/[^a-z0-9_]/g, ' ')
         .replace(/\s+/g, '_')
         .replace(/^_+|_+$/g, '');
    return s;
  },

  /**
   * 2. Chuẩn hóa số tiền VNĐ (Canonical Integer VND)
   * Quy định an toàn:
   * - Phép tính Math.round(Number(raw) * rate) cho ra số nguyên, nhưng không loại trừ hành vi
   *   số thực dấu chấm động (IEEE-754) trong quá trình nhân trước đó.
   * - Bắt buộc làm sạch chuỗi, tính toán, làm tròn và kiểm định bằng Number.isInteger().
   * 
   * @param {any} rawAmount - Số tiền thô từ file
   * @param {string} [currency='VND'] - Loại tiền tệ ('VND', 'PHP', 'USD'...)
   * @param {number} [exchangeRate=1] - Tỷ giá quy đổi
   * @returns {{ success: boolean, amountVnd: number, rawCleaned: number, error: string|null }}
   */
  canonicalizeMoney: function(rawAmount, currency, exchangeRate) {
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return { success: false, amountVnd: 0, rawCleaned: 0, error: 'EMPTY_AMOUNT' };
    }

    var curr = String(currency || 'VND').trim().toUpperCase();
    var rate = Number(exchangeRate);
    if (isNaN(rate) || rate <= 0) rate = 1;

    var numVal = 0;
    if (typeof rawAmount === 'number') {
      if (isNaN(rawAmount)) {
        return { success: false, amountVnd: 0, rawCleaned: 0, error: 'NAN_AMOUNT' };
      }
      numVal = rawAmount;
    } else {
      var s = String(rawAmount).trim();
      // Làm sạch ký tự tiền tệ và khoảng trắng (VD: '₫', 'đ', 'VND', '$')
      s = s.replace(/[^0-9.,-]/g, '');
      if (!s || s === '-') {
        return { success: false, amountVnd: 0, rawCleaned: 0, error: 'INVALID_NUMERIC_STRING' };
      }

      // Xử lý dấu phân cách nghìn và thập phân
      if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
        if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
          // Chuẩn US: 1,000.50
          s = s.replace(/,/g, '');
        } else {
          // Chuẩn VN/EU: 1.000,50
          s = s.replace(/\./g, '').replace(/,/g, '.');
        }
      } else if (s.indexOf(',') !== -1) {
        // Chỉ có dấu phẩy: Kiểm tra nếu là phân cách hàng nghìn (1,000,000) hay số thập phân (10,5)
        if (/\,\d{3}$/.test(s) || /,\d{3},/.test(s)) {
          s = s.replace(/,/g, '');
        } else if (/,\d{1,2}$/.test(s)) {
          s = s.replace(/,/g, '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (s.indexOf('.') !== -1) {
        // Chỉ có dấu chấm: nếu có nhiều dấu chấm (1.500.000) hoặc kết thúc bằng .\d{3} thì là phân cách hàng nghìn VN
        var dotCount = (s.match(/\./g) || []).length;
        if (dotCount > 1 || /\.\d{3}$/.test(s) || /\.\d{3}\./.test(s)) {
          s = s.replace(/\./g, '');
        }
      }

      numVal = parseFloat(s);
      if (isNaN(numVal)) {
        return { success: false, amountVnd: 0, rawCleaned: 0, error: 'PARSE_FLOAT_FAILED' };
      }
    }

    // Quy đổi ra VNĐ và làm tròn thành số nguyên
    var computedVnd = Math.round(numVal * rate);

    // Xác thực nghiêm ngặt bằng Number.isInteger()
    if (!Number.isInteger(computedVnd)) {
      return { success: false, amountVnd: 0, rawCleaned: numVal, error: 'NOT_INTEGER_VND' };
    }

    return {
      success: true,
      amountVnd: computedVnd,
      rawCleaned: numVal,
      error: null
    };
  },

  /**
   * 3. Chuẩn hóa ngày giao dịch theo định dạng chuẩn 24H (YYYY-MM-DD HH:mm:ss)
   * @param {any} rawDate 
   * @returns {string}
   */
  canonicalizeDate: function(rawDate) {
    if (!rawDate) return '';
    var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'Asia/Ho_Chi_Minh';

    if (rawDate instanceof Date) {
      if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
        return Utilities.formatDate(rawDate, tz, 'yyyy-MM-dd HH:mm:ss');
      }
      var pad = function(n) { return n < 10 ? '0' + n : String(n); };
      return rawDate.getFullYear() + '-' + pad(rawDate.getMonth() + 1) + '-' + pad(rawDate.getDate()) + ' ' +
             pad(rawDate.getHours()) + ':' + pad(rawDate.getMinutes()) + ':' + pad(rawDate.getSeconds());
    }

    var str = String(rawDate).trim();
    if (!str) return '';

    // Xử lý chuỗi ISO (2026-09-05T18:51:09...)
    if (str.indexOf('T') !== -1) {
      var cleanIso = str.replace('T', ' ').split('.')[0].replace('Z', '');
      var matchIso = cleanIso.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (matchIso) {
        var iy = matchIso[1];
        var im = ('0' + matchIso[2]).slice(-2);
        var id = ('0' + matchIso[3]).slice(-2);
        var ih = matchIso[4] ? ('0' + matchIso[4]).slice(-2) : '00';
        var imi = matchIso[5] ? ('0' + matchIso[5]).slice(-2) : '00';
        var isec = matchIso[6] ? ('0' + matchIso[6]).slice(-2) : '00';
        return iy + '-' + im + '-' + id + ' ' + ih + ':' + imi + ':' + isec;
      }
    }

    // Xử lý định dạng DD/MM/YYYY hoặc DD-MM-YYYY
    var matchDate = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (matchDate) {
      var day = ('0' + matchDate[1]).slice(-2);
      var month = ('0' + matchDate[2]).slice(-2);
      var year = matchDate[3];
      var hour = matchDate[4] ? ('0' + matchDate[4]).slice(-2) : '00';
      var min = matchDate[5] ? ('0' + matchDate[5]).slice(-2) : '00';
      var sec = matchDate[6] ? ('0' + matchDate[6]).slice(-2) : '00';
      return year + '-' + month + '-' + day + ' ' + hour + ':' + min + ':' + sec;
    }

    // Xử lý định dạng YYYY-MM-DD
    var matchYMD = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (matchYMD) {
      var y = matchYMD[1];
      var m = ('0' + matchYMD[2]).slice(-2);
      var d = ('0' + matchYMD[3]).slice(-2);
      var h = matchYMD[4] ? ('0' + matchYMD[4]).slice(-2) : '00';
      var mi = matchYMD[5] ? ('0' + matchYMD[5]).slice(-2) : '00';
      var s = matchYMD[6] ? ('0' + matchYMD[6]).slice(-2) : '00';
      return y + '-' + m + '-' + d + ' ' + h + ':' + mi + ':' + s;
    }

    return str;
  },

  /**
   * 4. Chuẩn hóa mã đơn hàng (Order Code)
   * @param {string} rawCode 
   * @returns {string}
   */
  canonicalizeOrderCode: function(rawCode) {
    if (!rawCode) return '';
    var s = String(rawCode).trim().toUpperCase();
    return s.replace(/\s+/g, '');
  },

  /**
   * 5. Chuẩn hóa mã giao dịch (Transaction ID)
   * @param {string} rawTxId 
   * @returns {string}
   */
  canonicalizeTransactionId: function(rawTxId) {
    if (!rawTxId) return '';
    return String(rawTxId).trim();
  },
  canonicalizeTxId: function(rawTxId) {
    return this.canonicalizeTransactionId(rawTxId);
  },

  /**
   * 6. Chuẩn hóa loại nguồn dữ liệu (Source Type)
   * @param {string} sourceType 
   * @returns {string}
   */
  canonicalizeSourceType: function(sourceType) {
    if (!sourceType) return 'BANK_STATEMENT';
    var s = String(sourceType).trim().toUpperCase();
    if (s.indexOf('SHOPEE') !== -1) return 'SHOPEE_ESCROW';
    if (s.indexOf('TIKTOK') !== -1) return 'TIKTOK_SETTLEMENT';
    if (s.indexOf('GHN') !== -1 || s.indexOf('COD') !== -1) return 'CARRIER_COD';
    return 'BANK_STATEMENT';
  },

  /**
   * 7. Chuẩn hóa trạng thái đơn hàng: TÁI SỬ DỤNG normalizeStatus() TỪ Code.js
   * Tuyệt đối không tạo bộ ánh xạ trạng thái cạnh tranh.
   * @param {string} rawStatus 
   * @returns {string}
   */
  canonicalizeStatus: function(rawStatus) {
    if (typeof normalizeStatus === 'function') {
      return normalizeStatus(rawStatus);
    }
    // Fallback đồng bộ chính xác 100% với Code.js lines 188-225 cho môi trường test độc lập
    if (!rawStatus) return '';
    var s = String(rawStatus).trim();
    try { s = s.normalize('NFC'); } catch (e) {}
    var upper = s.toUpperCase().replace(/\s+/g, ' ');
    var STATUS_MAP = {
      'HOÀN THÀNH': 'Đối Soát Thành Công',
      'COMPLETED': 'Đối Soát Thành Công',
      'ĐỐI SOÁT THÀNH CÔNG': 'Đối Soát Thành Công',
      'ĐÃ GIAO': 'Đã Bàn Giao',
      'DELIVERED': 'Đã Bàn Giao',
      'ĐÃ BÀN GIAO': 'Đã Bàn Giao',
      'TRẢ HÀNG/HOÀN TIỀN': 'Hàng Hoàn',
      'RETURNED': 'Hàng Hoàn',
      'HÀNG HOÀN': 'Hàng Hoàn',
      'ĐÃ HỦY': 'Đơn Huỷ', 'ĐÃ HUỶ': 'Đơn Huỷ',
      'CANCELLED': 'Đơn Huỷ', 'ĐƠN HUỶ': 'Đơn Huỷ', 'ĐƠN HỦY': 'Đơn Huỷ',
      'HỦY': 'Đơn Huỷ', 'HUỶ': 'Đơn Huỷ',
      'HỦY/VỠ': 'Đơn Huỷ', 'HUỶ/VỠ': 'Đơn Huỷ',
      'HỦY / VỠ': 'Đơn Huỷ', 'HUỶ / VỠ': 'Đơn Huỷ',
      'DONE': 'Done', 'ĐÃ XONG': 'Done', 'HOÀN KHO ĐẠT': 'Done'
    };
    if (STATUS_MAP[upper]) return STATUS_MAP[upper];
    if (upper.indexOf('GIAO HÀNG THẤT BẠI') > -1 || upper.indexOf('GIAO HÀNG KHÔNG THÀNH CÔNG') > -1 || 
        upper.indexOf('GIAO THẤT BẠI') > -1 || upper.indexOf('HOÀN TRẢ') > -1 || 
        upper.indexOf('TRẢ HÀNG') > -1 || upper.indexOf('HOÀN TIỀN') > -1 || 
        upper.indexOf('HÀNG TRẢ VỀ') > -1 || upper.indexOf('TỪ CHỐI NHẬN') > -1) {
      return 'Hàng Hoàn';
    }
    if (upper.indexOf('HỦY') > -1 || upper.indexOf('HUỶ') > -1) return 'Đơn Huỷ';
    return s;
  },

  /**
   * 8. Tính mã băm SHA-256 của chuỗi nội dung tệp (File Hash)
   * Dùng Utilities.computeDigest trên Google Apps Script hoặc crypto trên Node.js
   * @param {string} content 
   * @returns {string}
   */
  computeFileHashSha256: function(content) {
    if (!content) return '';
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest && Utilities.DigestAlgorithm) {
      var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content, Utilities.Charset.UTF_8);
      var hex = '';
      for (var i = 0; i < digest.length; i++) {
        var byteVal = digest[i];
        if (byteVal < 0) byteVal += 256;
        var byteHex = byteVal.toString(16);
        if (byteHex.length === 1) byteHex = '0' + byteHex;
        hex += byteHex;
      }
      return hex;
    }
    if (typeof require !== 'undefined') {
      try {
        var crypto = require('crypto');
        return crypto.createHash('sha256').update(String(content)).digest('hex');
      } catch (e) {}
    }
    // Fallback đơn giản cho môi trường hạn chế
    var hash = 0;
    var str = String(content);
    for (var k = 0; k < str.length; k++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(k);
      hash |= 0;
    }
    return 'FALLBACK_HASH_' + Math.abs(hash).toString(16);
  },

  /**
   * 9. Tính toán mã vân tay dòng (Row Fingerprint) để chống nạp lặp dòng
   * Kết hợp: channel + external_tx_id + external_order_id + external_date + amount_vnd
   * @param {string} channel 
   * @param {string} extTxId 
   * @param {string} extOrderId 
   * @param {string} extDate 
   * @param {number} amountVnd 
   * @returns {string}
   */
  computeRowFingerprint: function(channel, extTxId, extOrderId, extDate, amountVnd) {
    var rawSig = [
      String(channel || '').trim().toUpperCase(),
      String(extTxId || '').trim(),
      String(extOrderId || '').trim().toUpperCase(),
      String(extDate || '').slice(0, 10), // So khớp theo ngày YYYY-MM-DD
      String(amountVnd || 0)
    ].join('|');
    return 'FP_' + this.computeFileHashSha256(rawSig).substring(0, 24);
  },

  /**
   * 10. Đóng gói bảo toàn 100% dòng dữ liệu nguồn thô (raw_payload JSON)
   * @param {any} rawRow 
   * @returns {string}
   */
  serializeRawPayload: function(rawRow) {
    if (rawRow === undefined || rawRow === null) return '{}';
    try {
      return JSON.stringify(rawRow);
    } catch (e) {
      return String(rawRow);
    }
  },

  /**
   * 11. Hợp đồng so khớp CAS tuyệt đối 100% (Exact Match CAS Contract)
   * TUYỆT ĐỐI KHÔNG DÙNG DUNG SAI CHO CAS!
   * @param {string} valueType - 'STRING' | 'VND_INTEGER' | 'BOOLEAN' | 'TIMESTAMP'
   * @param {any} currentValue - Giá trị nạp lại từ Sheets
   * @param {any} expectedValue - Giá trị kỳ vọng từ proposal.old_value
   * @returns {boolean}
   */
  compareReconValue: function(valueType, currentValue, expectedValue) {
    if (currentValue === null || currentValue === undefined) currentValue = '';
    if (expectedValue === null || expectedValue === undefined) expectedValue = '';

    switch (valueType) {
      case 'STRING': {
        var s1 = String(currentValue).trim();
        var s2 = String(expectedValue).trim();
        try { s1 = s1.normalize('NFC'); } catch (e) {}
        try { s2 = s2.normalize('NFC'); } catch (e) {}
        return s1 === s2;
      }

      case 'VND_INTEGER': {
        var clean1 = String(currentValue).replace(/[^0-9.-]+/g, '');
        var clean2 = String(expectedValue).replace(/[^0-9.-]+/g, '');
        var n1 = clean1 === '' ? 0 : Math.round(Number(clean1));
        var n2 = clean2 === '' ? 0 : Math.round(Number(clean2));
        return n1 === n2;
      }

      case 'BOOLEAN': {
        var b1 = (currentValue === true || String(currentValue).toUpperCase() === 'TRUE');
        var b2 = (expectedValue === true || String(expectedValue).toUpperCase() === 'TRUE');
        return b1 === b2;
      }

      case 'TIMESTAMP': {
        var d1 = new Date(currentValue);
        var d2 = new Date(expectedValue);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
          return String(currentValue).trim() === String(expectedValue).trim();
        }
        // So khớp tuyệt đối theo giây epoch
        return Math.floor(d1.getTime() / 1000) === Math.floor(d2.getTime() / 1000);
      }

      default:
        return String(currentValue).trim() === String(expectedValue).trim();
    }
  },

  /**
   * 12. Hàm so khớp dung sai (CHỈ DÙNG CHO SO KHỚP ĐỐI SOÁT - KHÔNG DÙNG CHO CAS)
   */
  isReconMatchWithinTolerance: function(field, actualVal, sourceVal, options) {
    options = options || {};
    if (field === 'amount') {
      var diff = Math.abs(Number(actualVal) - Number(sourceVal));
      return diff <= (options.amountTolerance || 0);
    }
    if (field === 'date') {
      var t1 = new Date(actualVal).getTime();
      var t2 = new Date(sourceVal).getTime();
      if (isNaN(t1) || isNaN(t2)) return false;
      var maxDiffMs = (options.windowDays || 3) * 24 * 3600 * 1000;
      return Math.abs(t1 - t2) <= maxDiffMs;
    }
    return false;
  }
};

// Xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationNormalizer: ReconciliationNormalizer
  };
}
