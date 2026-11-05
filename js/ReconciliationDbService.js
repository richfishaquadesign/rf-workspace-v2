/**
 * ==============================================================================
 * MODULE: ReconciliationDbService.js
 * MÔ TẢ: Data Access Object (DAO) tầng truy xuất và thao tác CSDL đối soát tài chính
 *        độc lập trên Google Spreadsheet riêng (RF_Workspace_Reconciliation_DB).
 * DOANH NGHIỆP: Rich Fish Aquarium
 * NGUYÊN TẮC:
 * 1. Là module DUY NHẤT trong M1-A trực tiếp dùng SpreadsheetApp cho dữ liệu Recon_*.
 * 2. Tuyệt đối không tự động âm thầm tạo sheet khi chạy nghiệp vụ thông thường (Fail-Closed).
 * 3. Bắt buộc khởi tạo tường minh qua initReconciliationDatabase().
 * 4. Tất cả các thao tác ghi đều sử dụng LockService.
 * ==============================================================================
 */

// Nạp cấu hình nếu đang chạy trong môi trường Node.js
if (typeof RECON_CONFIG === 'undefined' && typeof require !== 'undefined') {
  var _cfg = require('./ReconciliationConfig.js');
  var RECON_CONFIG = _cfg.RECON_CONFIG;
  var RECON_SCHEMAS = _cfg.RECON_SCHEMAS;
}

var ReconciliationDbService = {
  /**
   * Bộ mock in-memory adapter phục vụ kiểm thử đơn vị độc lập không cần Google Drive
   */
  _mockDb: null,

  setMockAdapter: function(mock) {
    this._mockDb = mock;
  },

  clearMockAdapter: function() {
    this._mockDb = null;
  },

  /**
   * Lấy ID Spreadsheet đối soát từ Script Properties
   * @returns {string|null}
   */
  getSpreadsheetId: function() {
    if (this._mockDb && this._mockDb.spreadsheetId) {
      return this._mockDb.spreadsheetId;
    }
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      var propKey = (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.PROPERTY_KEY_SPREADSHEET_ID)
        ? RECON_CONFIG.PROPERTY_KEY_SPREADSHEET_ID
        : 'RECON_DB_SPREADSHEET_ID';
      var dbId = PropertiesService.getScriptProperties().getProperty(propKey);
      return dbId && dbId.trim() !== '' ? dbId.trim() : null;
    }
    return null;
  },

  /**
   * Mở đối tượng Google Spreadsheet đối soát độc lập
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  getSpreadsheet: function() {
    if (this._mockDb && this._mockDb.getSpreadsheet) {
      return this._mockDb.getSpreadsheet();
    }
    var dbId = this.getSpreadsheetId();
    if (!dbId) {
      throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Chưa cấu hình RECON_DB_SPREADSHEET_ID. Vui lòng chạy initReconciliationDatabase() trước.');
    }
    if (typeof SpreadsheetApp === 'undefined') {
      throw new Error('RECON_SCHEMA_NOT_INITIALIZED: SpreadsheetApp không khả dụng trong môi trường hiện tại.');
    }
    try {
      return SpreadsheetApp.openById(dbId);
    } catch (err) {
      throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Không thể mở Reconciliation Spreadsheet [' + dbId + ']: ' + err.message);
    }
  },

  /**
   * Kiểm tra tính hợp lệ của Schema cho một sheet staging (Fail-Closed).
   * Không tự ý tạo mới sheet nếu thiếu trong quá trình chạy bình thường.
   * @param {string} sheetName 
   * @returns {boolean}
   */
  validateSchema: function(sheetName) {
    if (this._mockDb && this._mockDb.validateSchema) {
      return this._mockDb.validateSchema(sheetName);
    }
    var ss = this.getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Bảng đệm "' + sheetName + '" chưa tồn tại trên CSDL đối soát. Vui lòng chạy initReconciliationDatabase() để khởi tạo.');
    }

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Bảng đệm "' + sheetName + '" chưa có hàng tiêu đề (Headers).');
    }

    var expectedHeaders = (typeof RECON_SCHEMAS !== 'undefined' && RECON_SCHEMAS[sheetName]) ? RECON_SCHEMAS[sheetName] : [];
    if (expectedHeaders.length > 0) {
      var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
      var missingHeaders = expectedHeaders.filter(function(h) { return actualHeaders.indexOf(h) === -1; });
      if (missingHeaders.length > 0) {
        throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Bảng đệm "' + sheetName + '" thiếu các cột bắt buộc: ' + missingHeaders.join(', '));
      }
    }
    return true;
  },

  /**
   * Kiểm tra xem CSDL đối soát đã được khởi tạo hoàn chỉnh hay chưa
   * @returns {boolean}
   */
  isInitialized: function() {
    try {
      var dbId = this.getSpreadsheetId();
      if (!dbId) return false;
      this.validateSchema('Recon_Imports');
      this.validateSchema('Recon_Rows');
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Lấy đối tượng Sheet theo tên có kiểm tra Schema nghiêm ngặt (Fail-Closed).
   * @param {string} sheetName 
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getSheet: function(sheetName) {
    this.validateSchema(sheetName);
    if (this._mockDb && this._mockDb.getSheet) {
      return this._mockDb.getSheet(sheetName);
    }
    var ss = this.getSpreadsheet();
    return ss.getSheetByName(sheetName);
  },

  /**
   * Lấy danh sách headers của một sheet
   * @param {string} sheetName 
   * @returns {string[]}
   */
  getHeaders: function(sheetName) {
    this.validateSchema(sheetName);
    if (this._mockDb && this._mockDb.getHeaders) {
      return this._mockDb.getHeaders(sheetName);
    }
    var sheet = this.getSheet(sheetName);
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  },

  /**
   * Đọc toàn bộ dữ liệu từ Sheet dưới dạng mảng Object
   * @param {string} sheetName 
   * @returns {Array<Object>}
   */
  getAll: function(sheetName) {
    if (this._mockDb && this._mockDb.getAll) {
      this.validateSchema(sheetName);
      return this._mockDb.getAll(sheetName);
    }
    var sheet = this.getSheet(sheetName);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol === 0) return [];

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var rows = data.slice(1);
    var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'Asia/Ho_Chi_Minh';

    return rows.map(function(row, idx) {
      var obj = { _rowIndex: idx + 2 };
      headers.forEach(function(header, colIdx) {
        if (header) {
          var val = row[colIdx];
          if (val instanceof Date && typeof Utilities !== 'undefined') {
            val = Utilities.formatDate(val, tz, 'yyyy-MM-dd HH:mm:ss');
          }
          obj[header] = (val !== undefined && val !== null) ? val : '';
        }
      });
      return obj;
    });
  },

  /**
   * Tìm kiếm các bản ghi thỏa mãn hàm lọc predicate
   * @param {string} sheetName 
   * @param {Function} predicateFn 
   * @returns {Array<Object>}
   */
  find: function(sheetName, predicateFn) {
    var records = this.getAll(sheetName);
    if (typeof predicateFn !== 'function') return records;
    return records.filter(predicateFn);
  },

  /**
   * Tìm 1 bản ghi theo cột khóa và giá trị cần tìm
   * @param {string} sheetName 
   * @param {string} keyColumn 
   * @param {any} keyValue 
   * @returns {Object|null}
   */
  findOne: function(sheetName, keyColumn, keyValue) {
    var records = this.getAll(sheetName);
    if (!records || records.length === 0) return null;
    var targetStr = String(keyValue).trim().toLowerCase();
    for (var i = 0; i < records.length; i++) {
      var cellVal = String(records[i][keyColumn] || '').trim().toLowerCase();
      if (cellVal === targetStr) {
        return records[i];
      }
    }
    return null;
  },

  /**
   * Thêm một bản ghi vào Sheet có LockService
   * @param {string} sheetName 
   * @param {Object} recordObject 
   * @returns {Object}
   */
  insert: function(sheetName, recordObject) {
    return this.insertBatch(sheetName, [recordObject])[0];
  },

  /**
   * Thêm hàng loạt bản ghi dạng Object vào Sheet (Batch Insert an toàn kèm LockService)
   * @param {string} sheetName 
   * @param {Array<Object>} recordObjects 
   * @returns {number} Số lượng bản ghi đã thêm
   */
  insertBatch: function(sheetName, recordObjects) {
    if (!Array.isArray(recordObjects) || recordObjects.length === 0) return 0;
    if (this._mockDb && this._mockDb.insertBatch) {
      this.validateSchema(sheetName);
      return this._mockDb.insertBatch(sheetName, recordObjects);
    }

    var lock = null;
    var hasLock = false;
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      var timeout = (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.LOCK_TIMEOUT_MS) ? RECON_CONFIG.LOCK_TIMEOUT_MS : 15000;
      if (!lock.hasLock()) {
        hasLock = lock.tryLock(timeout);
        if (!hasLock) {
          throw new Error('LOCK_TIMEOUT: Hệ thống đang bận ghi dữ liệu đối soát, vui lòng thử lại sau vài giây.');
        }
      }
    }

    try {
      var sheet = this.getSheet(sheetName);
      var headers = this.getHeaders(sheetName);
      if (headers.length === 0) {
        throw new Error('RECON_SCHEMA_NOT_INITIALIZED: Sheet "' + sheetName + '" chưa có header.');
      }

      var matrix = recordObjects.map(function(obj) {
        return headers.map(function(header) {
          var val = obj[header];
          return val !== undefined && val !== null ? val : '';
        });
      });

      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
      return matrix.length;
    } finally {
      if (lock && hasLock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
  },

  /**
   * Cập nhật bản ghi thỏa điều kiện cột khóa (Update Where có LockService)
   * @param {string} sheetName 
   * @param {string} keyColumn 
   * @param {any} keyValue 
   * @param {Object} updateObject 
   * @returns {number} Số dòng được cập nhật
   */
  updateWhere: function(sheetName, keyColumn, keyValue, updateObject) {
    if (!keyColumn || keyValue === undefined || !updateObject) {
      throw new Error('[ReconciliationDbService.updateWhere] Tham số không hợp lệ.');
    }
    if (this._mockDb && this._mockDb.updateWhere) {
      this.validateSchema(sheetName);
      return this._mockDb.updateWhere(sheetName, keyColumn, keyValue, updateObject);
    }

    var lock = null;
    var hasLock = false;
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      var timeout = (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.LOCK_TIMEOUT_MS) ? RECON_CONFIG.LOCK_TIMEOUT_MS : 15000;
      if (!lock.hasLock()) {
        hasLock = lock.tryLock(timeout);
        if (!hasLock) {
          throw new Error('LOCK_TIMEOUT: Hệ thống đang bận ghi dữ liệu đối soát, vui lòng thử lại sau vài giây.');
        }
      }
    }

    try {
      var sheet = this.getSheet(sheetName);
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol === 0) return 0;

      var fullData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      var headers = fullData[0].map(function(h) { return String(h).trim(); });
      var keyColIndex = headers.indexOf(keyColumn);

      if (keyColIndex === -1) {
        throw new Error('[ReconciliationDbService.updateWhere] Cột "' + keyColumn + '" không tồn tại trong sheet "' + sheetName + '".');
      }

      var targetStr = String(keyValue).trim().toLowerCase();
      var updatedCount = 0;

      for (var r = 1; r < fullData.length; r++) {
        var cellVal = String(fullData[r][keyColIndex] || '').trim().toLowerCase();
        if (cellVal === targetStr) {
          Object.keys(updateObject).forEach(function(updateKey) {
            var colIdx = headers.indexOf(updateKey);
            if (colIdx !== -1) {
              fullData[r][colIdx] = updateObject[updateKey];
            }
          });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        sheet.getRange(1, 1, lastRow, lastCol).setValues(fullData);
      }
      return updatedCount;
    } finally {
      if (lock && hasLock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
  },

  /**
   * Khởi tạo CSDL đối soát độc lập (Explicit Initialization).
   * Tạo bảng tính mới hoặc liên kết bảng tính chỉ định, khởi tạo Recon_Imports và Recon_Rows
   * kèm header chuẩn, đóng băng hàng 1 và tô màu nhận diện slate tối.
   * Lưu ID vào Script Properties.
   * 
   * @param {string} [customSpreadsheetId] - ID của Spreadsheet có sẵn nếu muốn liên kết
   * @returns {Object} Kết quả khởi tạo
   */
  initReconciliationDatabase: function(customSpreadsheetId) {
    if (this._mockDb && this._mockDb.initReconciliationDatabase) {
      return this._mockDb.initReconciliationDatabase(customSpreadsheetId);
    }

    var lock = null;
    var hasLock = false;
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      if (!lock.hasLock()) {
        hasLock = lock.tryLock(30000);
      }
    }

    try {
      var targetSs = null;
      var ssId = '';
      var ssUrl = '';

      if (customSpreadsheetId && customSpreadsheetId.trim() !== '') {
        targetSs = SpreadsheetApp.openById(customSpreadsheetId.trim());
        ssId = targetSs.getId();
        ssUrl = targetSs.getUrl();
      } else {
        var ssName = (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.DEFAULT_SPREADSHEET_NAME)
          ? RECON_CONFIG.DEFAULT_SPREADSHEET_NAME
          : 'RF_Workspace_Reconciliation_DB';
        targetSs = SpreadsheetApp.create(ssName);
        ssId = targetSs.getId();
        ssUrl = targetSs.getUrl();
      }

      // Lưu ID vào Script Properties
      if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
        var propKey = (typeof RECON_CONFIG !== 'undefined' && RECON_CONFIG.PROPERTY_KEY_SPREADSHEET_ID)
          ? RECON_CONFIG.PROPERTY_KEY_SPREADSHEET_ID
          : 'RECON_DB_SPREADSHEET_ID';
        PropertiesService.getScriptProperties().setProperty(propKey, ssId);
      }

      // Khởi tạo toàn bộ các bảng Staging của phân hệ đối soát theo RECON_SCHEMAS
      var schemas = (typeof RECON_SCHEMAS !== 'undefined') ? RECON_SCHEMAS : {};
      var tablesToInit = Object.keys(schemas);
      if (tablesToInit.length === 0) {
        tablesToInit = ['Recon_Imports', 'Recon_Rows', 'Recon_Runs', 'Recon_Issues', 'Recon_Proposals', 'Recon_Audit'];
      }

      tablesToInit.forEach(function(sheetName, index) {
        var headers = schemas[sheetName] || [];
        var sheet = targetSs.getSheetByName(sheetName);
        if (!sheet) {
          if (index === 0 && targetSs.getSheets().length === 1 && targetSs.getSheets()[0].getLastRow() === 0) {
            sheet = targetSs.getSheets()[0];
            sheet.setName(sheetName);
          } else {
            sheet = targetSs.insertSheet(sheetName);
          }
        }

        if (headers.length > 0) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          var headerRange = sheet.getRange(1, 1, 1, headers.length);
          headerRange.setFontWeight('bold');
          headerRange.setBackground('#1e293b'); // Slate-800
          headerRange.setFontColor('#f8fafc'); // Slate-50
          sheet.setFrozenRows(1);
        }
      });

      return {
        success: true,
        spreadsheetId: ssId,
        spreadsheetUrl: ssUrl,
        initializedTables: tablesToInit,
        message: 'Đã khởi tạo CSDL đối soát độc lập thành công!'
      };
    } finally {
      if (lock && hasLock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
  }
};

/**
 * Hàm entrypoint độc lập có thể chạy trực tiếp từ Apps Script editor để khởi tạo CSDL
 */
function initReconciliationDatabase(customSpreadsheetId) {
  return ReconciliationDbService.initReconciliationDatabase(customSpreadsheetId);
}

// Xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconciliationDbService: ReconciliationDbService,
    initReconciliationDatabase: initReconciliationDatabase
  };
}
