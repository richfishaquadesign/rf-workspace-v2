/**
 * ==============================================================================
 * MODULE: ReconciliationConfig.js
 * MÔ TẢ: Cấu hình, định nghĩa Schema và cờ tính năng cho phân hệ đối soát tài chính
 *        độc lập (Generic Financial Data Reconciliation Subsystem) - Milestone M1-A.
 * DOANH NGHIỆP: Rich Fish Aquarium
 * TƯƠNG THÍCH: Google Apps Script V8 Engine & Node.js Test Runners
 * ==============================================================================
 */

/**
 * Cấu hình tham số cốt lõi và cờ kiểm soát an toàn của phân hệ đối soát
 */
var RECON_CONFIG = {
  // Cờ an toàn Milestone 1: Tắt AI, tắt tự động sửa lỗi, mặc định chế độ Dry-Run
  ENABLE_RECON_AI: false,
  ENABLE_RECON_AUTO_CORRECTION: false,
  RECON_DRY_RUN: true,

  // Thông tin phiên bản chuẩn hóa và ánh xạ
  PARSER_VERSION: '1.0.0',
  MAPPING_VERSION: '2026.09',

  // Khóa Script Properties lưu ID Spreadsheet CSDL đối soát độc lập
  PROPERTY_KEY_SPREADSHEET_ID: 'RECON_DB_SPREADSHEET_ID',
  DEFAULT_SPREADSHEET_NAME: 'RF_Workspace_Reconciliation_DB',

  // Thời gian chờ khóa tương tranh (LockService)
  LOCK_TIMEOUT_MS: 15000,

  // Ngưỡng dung sai cho engine so khớp (Matching) - KHÔNG DÙNG CHO CAS
  AMOUNT_TOLERANCE_VND: 0,
  DATE_MATCH_WINDOW_DAYS: 3
};

/**
 * Danh mục Schema cột chuẩn cho các bảng Staging của phân hệ đối soát.
 * Milestone M1-A chỉ khởi tạo và thao tác trên Recon_Imports và Recon_Rows.
 */
var RECON_SCHEMAS = {
  // Bảng 1: Quản lý đợt nạp tệp đối soát (Milestone M1-A)
  'Recon_Imports': [
    'import_id',
    'source_type',
    'source_name',
    'account_id',
    'file_hash_sha256',
    'file_size',
    'source_file_drive_id',
    'parser_version',
    'mapping_version',
    'source_row_count',
    'parsed_row_count',
    'valid_row_count',
    'warning_row_count',
    'invalid_row_count',
    'imported_at',
    'imported_by_user_id',
    'imported_by_name',
    'status',
    'raw_metadata'
  ],

  // Bảng 2: Chi tiết từng dòng sao kê thô đã chuẩn hóa (Milestone M1-A)
  'Recon_Rows': [
    'row_id',
    'import_id',
    'row_index',
    'channel',
    'external_order_id',
    'external_tx_id',
    'external_settlement_id',
    'external_payout_id',
    'external_date',
    'raw_amount',
    'amount_vnd',
    'currency',
    'exchange_rate',
    'fee_breakdown',
    'source_status',
    'normalized_status',
    'row_fingerprint',
    'recon_status',
    'matched_target_table',
    'matched_target_id',
    'match_method',
    'match_confidence',
    'match_evidence',
    'raw_payload'
  ],

  // Bảng 3: Theo dõi phiên chạy đối soát (Milestone M1-B)
  'Recon_Runs': [
    'run_id',
    'import_id',
    'run_type',
    'started_at',
    'completed_at',
    'status',
    'matched_count',
    'issue_count',
    'proposal_count',
    'applied_count',
    'dry_run',
    'summary'
  ],

  // Bảng 4: Nhật ký sai lệch & bất thường (Milestone M1-B)
  'Recon_Issues': [
    'issue_id',
    'run_id',
    'row_id',
    'target_table',
    'target_id',
    'issue_type',
    'severity',
    'expected_value',
    'actual_value',
    'discrepancy_amount',
    'description',
    'status',
    'created_at'
  ],

  // Bảng 5: Đề xuất điều chỉnh kèm CAS, Idempotency & State Machine (Milestone M1-B)
  'Recon_Proposals': [
    'proposal_id',
    'issue_id',
    'run_id',
    'operation_id',
    'idempotency_key',
    'action_type',
    'target_table',
    'target_id',
    'target_field',
    'field_type',
    'old_value',
    'new_value',
    'proposal_status',
    'requires_manual_approval',
    'created_at',
    'reviewed_by',
    'reviewed_at',
    'applied_at',
    'rejection_reason'
  ],

  // Bảng 6: Nhật ký kiểm toán bất biến 1:N & Write-Ahead Journal (Milestone M1-B/C)
  'Recon_Audit': [
    'audit_id',
    'proposal_id',
    'action',
    'operation_id',
    'idempotency_key',
    'target_table',
    'target_id',
    'field_name',
    'before_value',
    'after_value',
    'cas_verified',
    'performed_by',
    'timestamp',
    'execution_status',
    'lock_wait_ms',
    'raw_context'
  ]
};

/**
 * Trạng thái chuẩn của đợt nạp tệp (Import Status)
 */
var RECON_IMPORT_STATUS = {
  UPLOADED: 'UPLOADED',
  PARSED: 'PARSED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DUPLICATE_REJECTED: 'DUPLICATE_REJECTED'
};

/**
 * Trạng thái chuẩn của dòng đối soát (Row Recon Status)
 */
var RECON_ROW_STATUS = {
  UNMATCHED: 'UNMATCHED',
  MATCHED: 'MATCHED',
  DISCREPANCY: 'DISCREPANCY',
  IGNORED: 'IGNORED',
  DUPLICATE_ROW: 'DUPLICATE_ROW'
};

/**
 * Phương thức so khớp dòng dữ liệu (Match Method)
 */
var RECON_MATCH_METHOD = {
  EXACT_ORDER_CODE: 'EXACT_ORDER_CODE',
  EXACT_TX_ID: 'EXACT_TX_ID',
  EXACT_SETTLEMENT_ID: 'EXACT_SETTLEMENT_ID',
  EXACT_PAYOUT_ID: 'EXACT_PAYOUT_ID',
  HEURISTIC_AMT_DATE_CHAN: 'HEURISTIC_AMT_DATE_CHAN'
};

/**
 * Kết quả khớp của Matcher (Match Result Status)
 */
var RECON_MATCH_RESULT = {
  EXACT_MATCH: 'EXACT_MATCH',
  AMBIGUOUS_MATCH: 'AMBIGUOUS_MATCH',
  UNMATCHED: 'UNMATCHED',
  CANDIDATE_MATCH: 'CANDIDATE_MATCH'
};

/**
 * Trạng thái phiên chạy đối soát (Run Status)
 */
var RECON_RUN_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

/**
 * Loại sai lệch đối soát (Issue Types)
 */
var RECON_ISSUE_TYPE = {
  UNMATCHED_ROW: 'UNMATCHED_ROW',
  AMBIGUOUS_MATCH: 'AMBIGUOUS_MATCH',
  DUPLICATE_PAYOUT: 'DUPLICATE_PAYOUT',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  STATUS_CONFLICT: 'STATUS_CONFLICT',
  DATE_MISMATCH: 'DATE_MISMATCH',
  MISSING_IN_ERP: 'MISSING_IN_ERP'
};

/**
 * Trạng thái sai lệch (Issue Status)
 */
var RECON_ISSUE_STATUS = {
  OPEN: 'OPEN',
  PROPOSED: 'PROPOSED',
  RESOLVED: 'RESOLVED',
  IGNORED: 'IGNORED'
};

/**
 * Mức độ nghiêm trọng của Issue (Severity)
 */
var RECON_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Loại hành động đề xuất (Proposal Action Types)
 */
var RECON_ACTION_TYPE = {
  UPDATE_FIELD: 'UPDATE_FIELD',
  INSERT_TRANSACTION: 'INSERT_TRANSACTION'
};

/**
 * Vòng đời trạng thái đề xuất (Proposal Status Lifecycle)
 * PENDING -> APPROVED -> APPLYING -> APPLIED
 * PENDING -> REJECTED
 * APPROVED/APPLYING -> CONFLICT
 * APPLYING -> FAILED / MANUAL_REVIEW_REQUIRED
 */
var RECON_PROPOSAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
  ROLLED_BACK: 'ROLLED_BACK'
};

/**
 * Các loại hành động kiểm toán (Recon Audit Actions) - 1:N bất biến
 */
var RECON_AUDIT_ACTION = {
  PROPOSAL_APPROVED: 'PROPOSAL_APPROVED',
  PROPOSAL_REJECTED: 'PROPOSAL_REJECTED',
  APPLY_ATTEMPT: 'APPLY_ATTEMPT',
  APPLY_SUCCESS: 'APPLY_SUCCESS',
  APPLY_FAILED: 'APPLY_FAILED',
  CONFLICT_DETECTED: 'CONFLICT_DETECTED',
  ROLLBACK_ATTEMPT: 'ROLLBACK_ATTEMPT',
  ROLLBACK_SUCCESS: 'ROLLBACK_SUCCESS',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
  RECOVERY_ACTION: 'RECOVERY_ACTION'
};

/**
 * Whitelist các bảng và trường sản xuất được phép can thiệp trong M1-C
 * Mọi bảng hoặc trường khác ngoài danh mục này đều bị từ chối tuyệt đối.
 */
var RECON_ALLOWED_MUTATIONS = {
  Orders: ['revenue', 'status'],
  Transactions: ['amount']
};

/**
 * Các kiểu dữ liệu canonical phục vụ so khớp CAS type-aware
 */
var RECON_CANONICAL_TYPES = {
  STRING: 'STRING',
  VND_INTEGER: 'VND_INTEGER',
  BOOLEAN: 'BOOLEAN',
  TIMESTAMP: 'TIMESTAMP'
};

// Hỗ trợ xuất module cho môi trường Node.js kiểm thử
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RECON_CONFIG: RECON_CONFIG,
    RECON_SCHEMAS: RECON_SCHEMAS,
    RECON_IMPORT_STATUS: RECON_IMPORT_STATUS,
    RECON_ROW_STATUS: RECON_ROW_STATUS,
    RECON_MATCH_METHOD: RECON_MATCH_METHOD,
    RECON_MATCH_RESULT: RECON_MATCH_RESULT,
    RECON_RUN_STATUS: RECON_RUN_STATUS,
    RECON_ISSUE_TYPE: RECON_ISSUE_TYPE,
    RECON_ISSUE_STATUS: RECON_ISSUE_STATUS,
    RECON_SEVERITY: RECON_SEVERITY,
    RECON_ACTION_TYPE: RECON_ACTION_TYPE,
    RECON_PROPOSAL_STATUS: RECON_PROPOSAL_STATUS,
    RECON_AUDIT_ACTION: RECON_AUDIT_ACTION,
    RECON_ALLOWED_MUTATIONS: RECON_ALLOWED_MUTATIONS,
    RECON_CANONICAL_TYPES: RECON_CANONICAL_TYPES
  };
}
