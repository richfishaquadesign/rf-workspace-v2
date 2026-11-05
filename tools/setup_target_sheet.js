/**
 * ==============================================================================
 * RICH FISH AQUARIUM - KHỞI TẠO 23 BẢNG CSDL CHUẨN CỘT & 1 DÒNG DỮ LIỆU MẪU
 * Target Spreadsheet ID: 1VGGL53xlS55dJNXYmz9GmqLjbhKh73wjEa1Hq7Holsw
 * ==============================================================================
 */

function setupAll23Sheets() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var TARGET_SPREADSHEET_ID = "1VGGL53xlS55dJNXYmz9GmqLjbhKh73wjEa1Hq7Holsw";
    var ss;
    try {
      ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (e) {
      // Nếu chạy trực tiếp gắn với file mới thì dùng getActiveSpreadsheet()
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    var SCHEMA_23 = [
      {
        name: "Orders",
        headers: [
          "id", "orderCode", "channel", "customer", "createdAt", "deadline", "date", "status",
          "accessories", "hasProduction", "isCarriedToWH", "updatedBy", "revenue", "phone",
          "address", "note", "prePaid", "cod", "costTotal", "responsibleUser", "discount",
          "shippingMethod", "sizeCoefficient", "cogs", "feeFixed", "feeService", "feePayment",
          "feeAffiliate", "shopVoucher", "tax", "reconciledAt", "isReconciled"
        ],
        sample: [
          "ORD_20261105_001", "261105SHOPEE01", "Shopee VN", "Nguyễn Văn An", "2026-11-05 08:30:00",
          "2026-11-05 16:00:00", "2026-11-05", "Đang Sản Xuất", '[{"name":"Đèn Thủy Sinh Chihiros C2","quantity":1}]',
          true, false, "Nguyễn Thị Diệu Hương", 650000, "0912345678", "123 Đường Láng, Đống Đa, Hà Nội",
          "Khách dặn đóng gói kỹ tán rêu", 650000, 0, 320000, "Nguyễn Thị Diệu Hương", 0, "SPX Express",
          1.0, 320000, 26000, 19500, 16250, 0, 0, 0, "", false
        ]
      },
      {
        name: "Production",
        headers: [
          "id", "orderId", "type", "name", "note", "status", "deadline", "fulfilledFromStock",
          "p1_name", "p1_status", "p1_user", "p1_start", "p1_endTime", "p1_photo", "p1_reward_vnd",
          "p2_name", "p2_status", "p2_user", "p2_start", "p2_endTime", "p2_photo", "p2_reward_vnd",
          "qc_front_photo", "qc_side_photo", "qc_status", "qc_note"
        ],
        sample: [
          "PROD_20261105_001", "ORD_20261105_001", "Layout", "Bonsai ver.1", "Size 30x20x20", "In_Progress",
          "2026-11-05 14:00:00", false, "Dựng cốt thô Bonsai", "Done", "Nguyễn Hoàng Dương",
          "2026-11-05 08:45:00", "2026-11-05 10:15:00", "https://drive.google.com/p1_photo_sample.jpg", 35000,
          "Đi rễ & Gia cố bột đá", "In_Progress", "Lại Trường Tâm", "2026-11-05 10:20:00", "", "", 45000,
          "https://drive.google.com/qc_front_sample.jpg", "https://drive.google.com/qc_side_sample.jpg",
          "Pending", "Chờ hoàn thiện Khâu 2 để KCS"
        ]
      },
      {
        name: "Packings",
        headers: [
          "id", "orderId", "user", "start", "end", "endTime", "status", "photo", "reward_vnd", "photoBefore"
        ],
        sample: [
          "PACK_20261105_001", "ORD_20261105_001", "Nguyễn Thị Diệu Hương", "2026-11-05 14:30:00",
          "2026-11-05 14:50:00", "2026-11-05 14:50:00", "Done",
          "https://drive.google.com/photo_packed_4layer.jpg", 15000, "https://drive.google.com/photo_before_pack.jpg"
        ]
      },
      {
        name: "Products",
        headers: [
          "id", "sku", "name", "unit", "image", "category", "sub_category", "costPrice", "price",
          "quantity", "minStock", "maxStock", "realImage", "importUnit", "conversionRate", "model3D"
        ],
        sample: [
          "PRD_BS3020", "LO_BONSAI_302020", "Layout Bonsai 30x20x20 Nghệ Thuật", "Bộ",
          "https://drive.google.com/layout_bonsai_thumb.jpg", "DANH MỤC SẢN XUẤT", "Bonsai",
          320000, 650000, 5, 2, 20, "https://drive.google.com/layout_bonsai_real.jpg", "Bộ", 1, "M3D_001"
        ]
      },
      {
        name: "Config_NhanSu",
        headers: [
          "Tên Nhân Sự", "ID Ảnh", "Chức Danh", "Chức Danh Phụ", "Phân Quyền", "Mã PIN",
          "Lương Cơ Bản", "Lương Chức Vụ", "Phụ Cấp Xăng Xe", "Khoản Trừ Vi Phạm", "id"
        ],
        sample: [
          "Nguyễn Thị Diệu Hương", "IMG_HUONG_007", "Quản Lý Bán Hàng", "NV Đóng Gói", "QUẢN LÝ BÁN HÀNG",
          "246357", 6500000, 1500000, 500000, 0, "USR_007"
        ]
      },
      {
        name: "Attendance",
        headers: [
          "id", "user", "date", "morningIn", "morningOut", "afternoonIn", "afternoonOut", "leaveType",
          "leaveReportAt", "shift", "timeIn", "timeOut", "totalHours", "status", "penalty", "isEdited",
          "leaveStart", "leaveEnd", "note"
        ],
        sample: [
          "ATT_20261105_001", "Nguyễn Thị Diệu Hương", "2026-11-05", "07:55:00", "12:00:00", "13:30:00",
          "17:35:00", "", "", "Cả ngày", "07:55:00", "17:35:00", 8.0, "Đúng giờ", 0, false, "", "", "Chấm công đầy đủ"
        ]
      },
      {
        name: "KPI_Progress",
        headers: [
          "id", "user", "kpiName", "current", "target", "unit", "lastUpdated", "startTime",
          "endTime", "reward", "isClaimed", "guide"
        ],
        sample: [
          "KPI_202611_001", "Nguyễn Thị Diệu Hương", "Đóng gói đơn hàng chuẩn 4 lớp & Không vỡ",
          120, 150, "Đơn", "2026-11-05 17:00:00", "2026-11-01 00:00:00", "2026-11-30 23:59:59",
          1500000, false, "Bọc màng PE + 4-6 lớp bóng khí + Đệm Fomex đáy + Thùng carton 5 lớp"
        ]
      },
      {
        name: "Config_KPI",
        headers: [
          "id", "Nhóm Hàng", "Từ Khoá", "Tên Hàng", "Thời gian Khâu 1", "Tiền Khâu 1",
          "Thời gian Khâu 2", "Tiền Khâu 2", "Thời gian Đóng Gói", "Thưởng Đóng Gói", "Thưởng Chở Kho"
        ],
        sample: [
          "CKPI_001", "Layout", "Bonsai", "Bonsai 30x20x20", "90 phút", 35000, "90 phút", 45000,
          "20 phút", 15000, 5000
        ]
      },
      {
        name: "BOM_Config",
        headers: [
          "id", "layoutCode", "materialSku", "defaultQty", "unit"
        ],
        sample: [
          "BOM_202611_001", "LO_BONSAI_302020", "LUA_SAN_CANH", 1.5, "kg"
        ]
      },
      {
        name: "Transactions",
        headers: [
          "id", "type", "category", "amount", "fromAccount", "toAccount", "title", "date", "note", "isAuto"
        ],
        sample: [
          "TRX_20261105_001", "Thu", "Doanh thu bán hàng", 650000, "Ví Shopee Chính", "Quỹ Tiền Mặt Xưởng",
          "Thu tiền đơn 261105SHOPEE01", "2026-11-05", "Tiền về ví sàn", true
        ]
      },
      {
        name: "ImportExport",
        headers: [
          "id", "type", "target", "totalAmount", "date", "note", "itemsData"
        ],
        sample: [
          "IE_20261105_001", "Xuất", "Xuất bán đơn ORD_20261105_001", 320000, "2026-11-05",
          "Xuất vật tư theo BOM sản xuất",
          '[{"sku":"LUA_SAN_CANH","name":"Lũa San Cành","qty":1.5,"unit":"kg"},{"sku":"REU_SX","name":"Rêu Sản Xuất","qty":0.1,"unit":"kg"}]'
        ]
      },
      {
        name: "Accounts",
        headers: [
          "id", "accountName", "balance", "type", "accountNumber", "accountOwner"
        ],
        sample: [
          "ACC_001", "Ví Shopee Chính", 18500000, "Ví Điện Tử / Sàn", "SHP_RF_VN", "Rich Fish Aquarium"
        ]
      },
      {
        name: "BonusPenalty",
        headers: [
          "id", "user", "amount", "type", "note", "date", "orderCode"
        ],
        sample: [
          "BP_20261105_001", "Nguyễn Thị Diệu Hương", 15000, "Thưởng Đóng Gói",
          "Thưởng đóng gói chuẩn đơn 261105SHOPEE01", "2026-11-05", "261105SHOPEE01"
        ]
      },
      {
        name: "CTV_Finance",
        headers: [
          "id", "date", "type", "amount", "note", "user", "status"
        ],
        sample: [
          "CTV_20261105_001", "2026-11-05", "Hoa hồng", 50000,
          "Hoa hồng giới thiệu đơn bể đúc 60", "Trần Văn B", "Đã duyệt"
        ]
      },
      {
        name: "Config_GiaLayout",
        headers: [
          "Size_Max", "Do_Chi_Tiet", "He_So_Gia", "Phi_Gui_Xuong", "Phi_Gan_Reu"
        ],
        sample: [
          30, "Chi tiết cao", 1.25, 30000, 45000
        ]
      },
      {
        name: "Documents",
        headers: [
          "id", "category", "title", "description", "link", "createdAt", "createdBy",
          "attachments", "testLink", "readBy"
        ],
        sample: [
          "DOC_001", "Quy trình", "SOP Đóng Gói 4 Lớp Xuất Xưởng RF",
          "Quy chuẩn chống sốc 4 lớp cho layout và bể kính", "https://drive.google.com/sop_pack_4layer.pdf",
          "2026-11-01 09:00:00", "Nguyễn Ngọc Tiến", "sop_pack_4layer.pdf", "", "USR_007, USR_003"
        ]
      },
      {
        name: "Trainings",
        headers: [
          "id", "title", "content", "targetRole", "createdAt", "createdBy", "readUsers"
        ],
        sample: [
          "TRN_001", "Kỹ thuật Khâu 2: Khóa chết mối nối bột đá + bột lũa",
          "Hướng dẫn thợ phủ hỗn hợp keo 502 và bột đá mặt trước/sau", "THỢ SẢN XUẤT",
          "2026-11-01 10:00:00", "Nguyễn Ngọc Tiến", "USR_004, USR_016"
        ]
      },
      {
        name: "Models3D",
        headers: [
          "id", "name", "url", "createdAt", "createdBy", "productId", "materials"
        ],
        sample: [
          "M3D_001", "Mô hình 3D Bonsai 30x20x20", "https://model3d.richfish.vn/bonsai3020.glb",
          "2026-11-01 14:00:00", "Nguyễn Ngọc Tiến", "PRD_BS3020",
          '[{"name":"Lũa San Cành","color":"#5c4033"},{"name":"Rêu Sản Xuất","color":"#2e8b57"}]'
        ]
      },
      {
        name: "Monthly_Snapshots",
        headers: [
          "id", "month", "user", "totalSalary", "totalHours", "totalAdvance", "totalDebt",
          "createdAt", "snapshotData"
        ],
        sample: [
          "SNP_2026_10_HUONG", "2026-10", "Nguyễn Thị Diệu Hương", 9850000, 208, 2000000, 0,
          "2026-11-01 00:05:00", '{"baseSalary":6500000,"allowance":2000000,"packingReward":1350000}'
        ]
      },
      {
        name: "ProfitReports",
        headers: [
          "id", "period", "channel", "revenue", "orderCount", "platformFee", "returns",
          "discount", "ads", "cogs", "salary", "operation"
        ],
        sample: [
          "PFR_2026_10_SHOPEE", "2026-10", "Shopee VN", 145000000, 310, 18850000, 2400000,
          5000000, 12000000, 68000000, 22000000, 6500000
        ]
      },
      {
        name: "Reimbursements",
        headers: [
          "id", "staffName", "reason", "amount", "qrCodeUrl", "status", "createdAt"
        ],
        sample: [
          "RMB_20261105_001", "Nguyễn Hoàng Dương", "Mua thêm 10 chai keo 502 công nghiệp dán đá",
          180000, "https://qr.vietcombank.com.vn/rmb180k.png", "Đã duyệt chi", "2026-11-05 11:30:00"
        ]
      },
      {
        name: "Suppliers",
        headers: [
          "id", "name", "phone", "totalDebt", "category", "note"
        ],
        sample: [
          "SUP_001", "Xưởng Kính Siêu Trong Miền Bắc", "0988776655", 14500000, "Phôi kính siêu trong",
          "Đơn giá kính dải 1.8m: 175k/m2; mài vi tính: 25k/m"
        ]
      },
      {
        name: "Tracking_Log",
        headers: [
          "Thời gian", "Tên nhân sự", "Hoàn thành", "Hỏi AI", "Ghi chú thêm"
        ],
        sample: [
          "2026-11-05 15:00:00", "Nguyễn Thị Diệu Hương", "Đã đóng gói xong 5 đơn Shopee buổi chiều",
          "Bonsai 30x20x20 quấn mấy lớp xốp nổ", "AI trả lời: bọc màng PE + 4-6 lớp xốp nổ + đệm Fomex đáy"
        ]
      }
    ];

    SCHEMA_23.forEach(function(tableDef) {
      var sheet = ss.getSheetByName(tableDef.name);
      if (!sheet) {
        sheet = ss.insertSheet(tableDef.name);
      } else {
        sheet.clear();
      }

      // Ghi headers (Hàng 1) và dữ liệu mẫu (Hàng 2)
      sheet.getRange(1, 1, 1, tableDef.headers.length).setValues([tableDef.headers]);
      sheet.getRange(2, 1, 1, tableDef.sample.length).setValues([tableDef.sample]);

      // Định dạng thẩm mỹ tiêu chuẩn: Nền tối slate #1F2937, chữ trắng, in đậm, căn giữa
      var headerRange = sheet.getRange(1, 1, 1, tableDef.headers.length);
      headerRange.setBackground("#1F2937")
                 .setFontColor("#FFFFFF")
                 .setFontWeight("bold")
                 .setFontFamily("Roboto")
                 .setFontSize(10)
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle");

      // Cố định dòng 1
      sheet.setFrozenRows(1);

      // Định dạng hàng dữ liệu mẫu
      var dataRange = sheet.getRange(2, 1, 1, tableDef.sample.length);
      dataRange.setFontFamily("Roboto")
               .setFontSize(10)
               .setVerticalAlignment("middle");

      sheet.setRowHeight(1, 32);
      sheet.setRowHeight(2, 28);
    });

    // Xóa sheet mặc định "Sheet1" hoặc "Trang tính1" nếu tồn tại và thừa
    var defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Trang tính1");
    if (defaultSheet && ss.getSheets().length > 1) {
      try { ss.deleteSheet(defaultSheet); } catch(err) {}
    }

    Logger.log("Đã khởi tạo thành công toàn bộ 23 bảng CSDL chuẩn 100% tên cột!");
  } finally {
    lock.releaseLock();
  }
}

