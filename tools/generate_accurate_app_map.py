import json
import os

map_data = {
  "schema": "rf-operations-map-v4",
  "version": 4,
  "exportedAt": "2026-11-05T13:42:00.000Z",
  "title": "BẢN ĐỒ VẬN HÀNH CHUẨN HỆ THỐNG RF_WORKSPACE_PRO (CHUẨN CHỨC DANH)",
  "root": {
    "nodes": [
      # === 1. TAB ORDERS (TIẾP NHẬN ĐƠN) ===
      {
        "id": "ORD_INPUT",
        "group": "orders",
        "x": 60,
        "y": 100,
        "title": "Tab Đơn Hàng: Tiếp nhận đơn",
        "desc": "Nút 'Import Đơn Sàn' (Shopee/TikTok/GHN) hoặc nút 'Tạo Đơn Bán Lẻ'",
        "owner": "Bộ phận Bán Hàng / Admin",
        "type": "step",
        "notes": "Lưu bản ghi vào bảng Orders. Tự động nhận diện channel.",
        "inputs": "File Excel / KiotViet / Form tạo đơn",
        "outputs": "Bản ghi Orders (id, orderCode, customer, revenue)",
        "action": "importOrders() / createOrder()"
      },
      {
        "id": "ORD_EVAL_PROD",
        "group": "orders",
        "x": 380,
        "y": 100,
        "title": "Phân loại món theo đơn",
        "desc": "Kiểm tra từng món: Có Layout/Bể kính cần làm hay chỉ có phụ kiện?",
        "owner": "Hệ thống Tự Động",
        "type": "decision",
        "notes": "hasProduction = true nếu có Layout 13 DM hoặc Bể kính 6 dòng",
        "inputs": "Orders.accessories, chi tiết sản phẩm",
        "outputs": "hasProduction = true | false",
        "action": "Tự động phân loại"
      },
      {
        "id": "STOCK_READY",
        "group": "packing",
        "x": 750,
        "y": -80,
        "title": "Đơn hàng sẵn / thuần phụ kiện",
        "desc": "hasProduction = false. Không cần qua xưởng sản xuất",
        "owner": "Thủ Kho",
        "type": "step",
        "notes": "Đèn, máy lọc, phân nền... có sẵn trong kho",
        "inputs": "Orders.hasProduction = false",
        "outputs": "Orders.status = 'Sẵn Sàng Đóng Gói'",
        "action": "Chuyển thẳng sang hàng đợi đóng gói"
      },

      # === 2. TAB PRODUCTION (CHUYỀN SẢN XUẤT) ===
      {
        "id": "PROD_DISPATCH",
        "group": "production",
        "x": 750,
        "y": 280,
        "title": "Tab Sản Xuất: Bơm việc vào Chuyền",
        "desc": "hasProduction = true. Tự động sinh các dòng lệnh Production",
        "owner": "Quản Đốc Xưởng",
        "type": "decision",
        "notes": "Phân chia món theo phân xưởng: Layout hoặc Bể kính",
        "inputs": "Orders.id",
        "outputs": "Production.id (status = 'Chờ Sản Xuất')",
        "action": "Tạo dòng Production"
      },
      {
        "id": "SUB_LAYOUT",
        "group": "production",
        "x": 1150,
        "y": 180,
        "title": "Xưởng Layout (13 Danh mục) ↗",
        "desc": "Chuyền 2 khâu: Khâu 1 dựng phom cốt thô ➔ Khâu 2 gia cố rễ/bột đá",
        "owner": "Thợ Chế Tác Layout",
        "type": "step",
        "notes": "Vật tư: San Miếng, San Cành, Rễ Rừng, Rêu 450k/kg",
        "subflow": "layout"
      },
      {
        "id": "SUB_GLASS",
        "group": "production",
        "x": 1150,
        "y": 380,
        "title": "Xưởng Bể Kính (6 Dòng chuẩn) ↗",
        "desc": "Chuyền 2 khâu: Khâu 1 mài/dán phôi dải 1.8m ➔ Khâu 2 vuốt keo chỉ giấu keo",
        "owner": "Thợ Chế Tác Bể Kính",
        "type": "step",
        "notes": "Quy cách DxRxC (cm), kính đáy hụt lòng, đơn giá kính 175k/m2",
        "subflow": "glass"
      },
      {
        "id": "AUTO_BOM_SLA",
        "group": "bom",
        "x": 1550,
        "y": 280,
        "title": "Hệ thống tự động chạy ngầm",
        "desc": "Khi duyệt KCS Passed: (1) Tự trừ kho BOM (2) Tự đổi Orders thành Sẵn Sàng Đóng Gói",
        "owner": "Hệ thống Tự Động",
        "type": "data",
        "notes": "Hàm processMaterialDeduction + checkAndAutoForwardOrder",
        "inputs": "Production.status = 'Done', qc_status = 'Passed'",
        "outputs": "Products.quantity trừ định mức; Orders.status = 'Sẵn Sàng Đóng Gói'",
        "action": "processMaterialDeduction() & checkAndAutoForwardOrder()"
      },

      # === 3. TAB ĐÓNG GÓI & BÀN GIAO ===
      {
        "id": "PACK_QUEUE",
        "group": "packing",
        "x": 1920,
        "y": 100,
        "title": "Tab Đóng Gói: Danh sách đơn chờ",
        "desc": "Chỉ lọc các đơn Orders.status = 'Sẵn Sàng Đóng Gói'. Gom hàng xưởng + phụ kiện",
        "owner": "Bộ Phận Đóng Gói",
        "type": "step",
        "notes": "Bảng Packings. Kiểm tra đủ phụ kiện theo cột accessories",
        "inputs": "Orders.status = 'Sẵn Sàng Đóng Gói'",
        "outputs": "Bắt đầu ca đóng gói",
        "action": "Xem danh sách"
      },
      {
        "id": "PACK_EXEC",
        "group": "packing",
        "x": 2280,
        "y": 100,
        "title": "Thao tác Đóng Thùng & Dán Tem",
        "desc": "Chụp ảnh trước đóng (photoBefore) ➔ Bọc xốp gỗ ➔ Dán mã vận đơn ➔ Chụp thành phẩm (photo)",
        "owner": "Bộ Phận Đóng Gói",
        "type": "step",
        "notes": "Nút 'Bắt đầu' ➔ Nút 'Hoàn thành'. Ghi nhận thưởng đóng gói vào Packings.reward_vnd",
        "inputs": "Ảnh chụp thực tế",
        "outputs": "Orders.status chuyển thành 'Chờ Bàn Giao'",
        "action": "savePacking()"
      },
      {
        "id": "CRON_PENALTY_1930",
        "group": "tower",
        "x": 2280,
        "y": -80,
        "title": "Cronbot Phạt Trễ SLA 19:30",
        "desc": "Quét lúc 19:30 hàng ngày: Nếu đơn Sẵn Sàng Đóng Gói chưa đóng xong ➔ Phạt 50.000đ",
        "owner": "Hệ thống Tự Động",
        "type": "decision",
        "notes": "Ghi phiếu phạt tự động vào bảng BonusPenalty",
        "inputs": "Orders.status = 'Sẵn Sàng Đóng Gói' sau 19:30",
        "outputs": "Phiếu phạt BonusPenalty",
        "action": "cronCheckUnpackedOrdersAt1930()"
      },
      {
        "id": "SHIP_HANDOVER",
        "group": "packing",
        "x": 2620,
        "y": 100,
        "title": "Chở Kho / Bàn Giao Bưu Cục",
        "desc": "Chở ra GHN/TikTok/ViettelPost. Bấm tick 'Đã Chở Ra Kho' (isCarriedToWH = 1)",
        "owner": "Nhân Sự Giao Nhận",
        "type": "step",
        "notes": "Tính thưởng chở kho từ Config_KPI. Trạng thái Orders thành 'Đã Bàn Giao'",
        "inputs": "Đơn 'Chờ Bàn Giao'",
        "outputs": "Orders.status = 'Đã Bàn Giao', isCarriedToWH = 1",
        "action": "updateDeliveryStatus()"
      },

      # === 4. ĐỐI SOÁT DÒNG TIỀN & XỬ LÝ SỰ CỐ ===
      {
        "id": "SHIP_GATE",
        "group": "finance",
        "x": 2980,
        "y": 100,
        "title": "Kết Quả Giao Hàng Bưu Cục",
        "desc": "Phân luồng thực tế theo thông báo của đơn vị vận chuyển",
        "owner": "Hệ thống Tự Động",
        "type": "decision",
        "notes": "90-95% Giao thành công; 5-10% Sự cố hoàn hàng",
        "inputs": "Trạng thái vận chuyển",
        "outputs": "Thành công | Hàng hoàn",
        "action": "Phân luồng"
      },
      {
        "id": "RECON_SUCCESS",
        "group": "finance",
        "x": 3340,
        "y": 0,
        "title": "Tab Đối Soát: Upload Sao Kê Sàn",
        "desc": "Sàn báo 'Hoàn thành' / 'Đã giao' ➔ Chạy ReconciliationEngine so khớp Exact Match",
        "owner": "Kế Toán / Admin",
        "type": "step",
        "notes": "Khấu trừ phí sàn (Cố định, DV, Payment, Voucher), tính COGS 5 thành tố, chốt Lợi nhuận ròng",
        "inputs": "File Excel sao kê ngân quỹ Shopee/TikTok",
        "outputs": "Orders.status = 'Đối Soát Thành Công', ghi Transactions, ProfitReports",
        "action": "ReconciliationEngine.run()"
      },
      {
        "id": "RETURN_HANDLE",
        "group": "returns",
        "x": 3340,
        "y": 280,
        "title": "Xử Lý Hàng Hoàn / Khiếu Nại",
        "desc": "Sàn báo 'Trả hàng/Hoàn tiền' ➔ Orders.status = 'Hàng Hoàn'. Phân theo 2 rào chắn CSKH",
        "owner": "Bộ Phận CSKH & QC",
        "type": "decision",
        "notes": "Đơn Sàn: bấm hoàn tiền trên App. Đơn Ngoài Sàn: thu hồi sửa lại",
        "inputs": "Kiện hoàn về kho",
        "outputs": "Nhập lại kho | Sửa chữa xưởng",
        "action": "Phân định luồng hoàn"
      },
      {
        "id": "RETURN_SHOP",
        "group": "returns",
        "x": 3720,
        "y": 200,
        "title": "Đơn Sàn (Shopee / TikTok)",
        "desc": "Kiểm tra kiện hoàn: Còn nguyên vẹn ➔ Nhập lại kho Products. Vỡ phế ➔ Hủy",
        "owner": "Bộ Phận CSKH & QC",
        "type": "step",
        "notes": "Khách nhận tiền hoàn từ sàn. CSKH đối soát tag [KN-THANG] tính KPI",
        "inputs": "Kiện hoàn",
        "outputs": "Cập nhật tồn kho hoặc ghi hủy phế",
        "action": "Nhập kho hoàn"
      },
      {
        "id": "RETURN_EXT",
        "group": "returns",
        "x": 3720,
        "y": 380,
        "title": "Đơn Ngoài Sàn (Bán lẻ / CTV)",
        "desc": "Richfish chịu 100% ship 2 chiều. Thu hồi về xưởng bấm 'Tạo Lệnh Sửa Chữa'",
        "owner": "Quản Đốc Xưởng",
        "type": "step",
        "notes": "Quay ngược lại Khâu 2 để thợ sửa hoàn thiện và gửi lại khách",
        "inputs": "Kiện lỗi ngoài sàn",
        "outputs": "Đưa lại vào chuyền Khâu 2",
        "action": "Tạo lệnh sửa chữa"
      },

      # === 5. CONTROL TOWER (GIÁM SÁT REAL-TIME) ===
      {
        "id": "TOWER_BOT",
        "group": "tower",
        "x": 1550,
        "y": -80,
        "title": "Control Tower: Cảnh Báo Điều Hành",
        "desc": "Giám sát nghẽn chuyền (Takt Time 2h), tồn kho minStock, doanh thu thời gian thực",
        "owner": "Hệ thống Tự Động",
        "type": "success",
        "notes": "Bắn thông báo Telegram/Push khi phôi kính, lũa sắp hết hoặc thợ chậm nhịp",
        "inputs": "Dữ liệu real-time",
        "outputs": "Cảnh báo nhân sự",
        "action": "Giám sát tự động"
      }
    ],
    "edges": [
      # Tiếp nhận & Phân loại
      {"id": "e_ord_eval", "from": "ORD_INPUT", "to": "ORD_EVAL_PROD", "label": "", "kind": "normal"},
      {"id": "e_has_prod", "from": "ORD_EVAL_PROD", "to": "PROD_DISPATCH", "label": "Cần chế tác (hasProduction=TRUE)", "kind": "normal"},
      {"id": "e_no_prod", "from": "ORD_EVAL_PROD", "to": "STOCK_READY", "label": "Hàng sẵn / Phụ kiện (hasProduction=FALSE)", "kind": "normal"},
      
      # Chuyền sản xuất
      {"id": "e_to_layout", "from": "PROD_DISPATCH", "to": "SUB_LAYOUT", "label": "Món Layout", "kind": "normal"},
      {"id": "e_to_glass", "from": "PROD_DISPATCH", "to": "SUB_GLASS", "label": "Món Bể Kính", "kind": "normal"},
      {"id": "e_layout_done", "from": "SUB_LAYOUT", "to": "AUTO_BOM_SLA", "label": "Duyệt QC Passed", "kind": "normal"},
      {"id": "e_glass_done", "from": "SUB_GLASS", "to": "AUTO_BOM_SLA", "label": "Duyệt QC Passed", "kind": "normal"},
      
      # Chuyển sang đóng gói
      {"id": "e_prod_to_pack", "from": "AUTO_BOM_SLA", "to": "PACK_QUEUE", "label": "Đổi Orders = 'Sẵn Sàng Đóng Gói'", "kind": "normal"},
      {"id": "e_stock_to_pack", "from": "STOCK_READY", "to": "PACK_QUEUE", "label": "Chờ gom phụ kiện", "kind": "normal"},
      
      # Quy trình đóng gói
      {"id": "e_pack_start", "from": "PACK_QUEUE", "to": "PACK_EXEC", "label": "Nhận đơn đóng gói", "kind": "normal"},
      {"id": "e_sla_check", "from": "PACK_QUEUE", "to": "CRON_PENALTY_1930", "label": "Quét phạt trễ 19:30", "kind": "monitor"},
      {"id": "e_pack_finish", "from": "PACK_EXEC", "to": "SHIP_HANDOVER", "label": "Đóng xong ➔ 'Chờ Bàn Giao'", "kind": "normal"},
      {"id": "e_ship_go", "from": "SHIP_HANDOVER", "to": "SHIP_GATE", "label": "Chở kho ➔ 'Đã Bàn Giao'", "kind": "normal"},
      
      # Kết quả & Đối soát / Hàng hoàn
      {"id": "e_ship_ok", "from": "SHIP_GATE", "to": "RECON_SUCCESS", "label": "Giao thành công (90-95%)", "kind": "normal"},
      {"id": "e_ship_fail", "from": "SHIP_GATE", "to": "RETURN_HANDLE", "label": "Sự cố / Boom / Vỡ (5-10%)", "kind": "exception"},
      
      # Xử lý hàng hoàn 2 luồng
      {"id": "e_ret_platform", "from": "RETURN_HANDLE", "to": "RETURN_SHOP", "label": "Đơn Sàn (Shopee/TikTok)", "kind": "normal"},
      {"id": "e_ret_ext", "from": "RETURN_HANDLE", "to": "RETURN_EXT", "label": "Đơn Ngoài Sàn (Bán lẻ/CTV)", "kind": "exception"},
      {"id": "e_ext_rework", "from": "RETURN_EXT", "to": "PROD_DISPATCH", "label": "Về xưởng đưa lại vào Khâu 2 sửa", "kind": "exception"},
      
      # Giám sát tháp
      {"id": "e_tower_bom", "from": "TOWER_BOT", "to": "AUTO_BOM_SLA", "label": "Cảnh báo tồn kho minStock", "kind": "monitor"},
      {"id": "e_tower_prod", "from": "TOWER_BOT", "to": "PROD_DISPATCH", "label": "Cảnh báo nghẽn nhịp Takt Time", "kind": "monitor"}
    ]
  },
  "subflows": {
    # === SUBFLOW 1: XƯỞNG LAYOUT ===
    "layout": {
      "title": "XƯỞNG CHẾ TÁC LAYOUT (13 DANH MỤC TIÊU CHUẨN)",
      "nodes": [
        {
          "id": "L1_ORDER",
          "group": "production",
          "x": 60,
          "y": 100,
          "title": "Nhận lệnh Layout",
          "desc": "Hiển thị mã layoutCode, danh mục (Cuội/Bonsai/Rừng/Nature...), kích thước",
          "owner": "Thợ Chế Tác",
          "type": "step"
        },
        {
          "id": "L1_K1",
          "group": "production",
          "x": 380,
          "y": 100,
          "title": "Khâu 1: Dựng cốt phom thô",
          "desc": "Bấm 'Bắt đầu' (p1_start) ➔ Dựng khung cốt ➔ Bấm 'Xong' (p1_endTime, ghi nhận thưởng KPI)",
          "owner": "Thợ Khâu 1 (Dựng Cốt)",
          "type": "step"
        },
        {
          "id": "L1_K2",
          "group": "production",
          "x": 720,
          "y": 100,
          "title": "Khâu 2: Đi rễ & Gia cố hoàn thiện",
          "desc": "Bấm 'Bắt đầu' (p2_start) ➔ Đi rễ chi tiết, gia cố bột đá + bột lũa mặt trước/sau ➔ Bấm 'Xong'",
          "owner": "Thợ Khâu 2 (Gia Cố)",
          "type": "step"
        },
        {
          "id": "L1_QC",
          "group": "production",
          "x": 1080,
          "y": 100,
          "title": "Kiểm định KCS / QC Layout",
          "desc": "Chụp 2 góc ảnh: mặt trước (qc_front_photo) + mặt cạnh (qc_side_photo)",
          "owner": "Quản Đốc / QC",
          "type": "decision"
        },
        {
          "id": "L1_REWORK",
          "group": "production",
          "x": 720,
          "y": 300,
          "title": "Không Đạt: Bấm 'Tạo Lệnh Sửa'",
          "desc": "Chuyển trạng thái 'Đã tạo lệnh sửa', thợ gia cố lại ngay để không làm chậm nhịp",
          "owner": "Thợ Khâu 2 (Gia Cố)",
          "type": "step"
        },
        {
          "id": "L1_DONE",
          "group": "production",
          "x": 1440,
          "y": 100,
          "title": "Duyệt Đạt: Bấm 'Duyệt KCS'",
          "desc": "qc_status = 'Passed', lệnh thành 'Done' ➔ Kích hoạt trừ kho BOM San Miếng, Rễ Rừng, Rêu 450k/kg",
          "owner": "Hệ thống Tự Động",
          "type": "success"
        }
      ],
      "edges": [
        {"id": "le_1", "from": "L1_ORDER", "to": "L1_K1", "label": "Bắt đầu Khâu 1", "kind": "normal"},
        {"id": "le_2", "from": "L1_K1", "to": "L1_K2", "label": "Bàn giao sang Khâu 2", "kind": "normal"},
        {"id": "le_3", "from": "L1_K2", "to": "L1_QC", "label": "Chụp ảnh gửi duyệt", "kind": "normal"},
        {"id": "le_qc_pass", "from": "L1_QC", "to": "L1_DONE", "label": "Duyệt Đạt (Passed)", "kind": "normal"},
        {"id": "le_qc_fail", "from": "L1_QC", "to": "L1_REWORK", "label": "Không Đạt KCS", "kind": "exception"},
        {"id": "le_rework_k2", "from": "L1_REWORK", "to": "L1_K2", "label": "Sửa xong gửi duyệt lại", "kind": "normal"}
      ]
    },

    # === SUBFLOW 2: XƯỞNG BỂ KÍNH ===
    "glass": {
      "title": "XƯỞNG CHẾ TÁC BỂ KÍNH (6 DÒNG CHUẨN ĐỊNH DANH CM)",
      "nodes": [
        {
          "id": "G1_ORDER",
          "group": "production",
          "x": 60,
          "y": 100,
          "title": "Nhận lệnh Bể Kính",
          "desc": "Kích thước hình học chuẩn DxRxC (cm), ví dụ 30x20x20. Cấm ký hiệu S,M,L. Đáy hụt lòng",
          "owner": "Thợ Chế Tác",
          "type": "step"
        },
        {
          "id": "G1_K1",
          "group": "production",
          "x": 380,
          "y": 100,
          "title": "Khâu 1: Cắt phôi 1.8m & Mài vi tính",
          "desc": "Cắt phôi từ dải kính 1.8m (đơn giá 175k/m2) ➔ Mài vi tính ➔ Dán định hình phom kính",
          "owner": "Thợ Khâu 1 (Kính/Mài)",
          "type": "step"
        },
        {
          "id": "G1_K2",
          "group": "production",
          "x": 720,
          "y": 100,
          "title": "Khâu 2: Dán kết cấu & Vuốt keo",
          "desc": "Vuốt keo chỉ giấu keo, xử lý đường keo không bọt khí, cố định góc vuông",
          "owner": "Thợ Khâu 2 (Dán/Keo)",
          "type": "step"
        },
        {
          "id": "G1_QC",
          "group": "production",
          "x": 1080,
          "y": 100,
          "title": "Kiểm định KCS / QC Bể Kính",
          "desc": "Kiểm tra độ kín nước, đường keo giấu, độ phẳng cạnh ốp quanh đáy",
          "owner": "Quản Đốc / QC",
          "type": "decision"
        },
        {
          "id": "G1_REWORK",
          "group": "production",
          "x": 720,
          "y": 300,
          "title": "Không Đạt: Vuốt keo lại",
          "desc": "Bấm 'Tạo Lệnh Sửa', xử lý lại đường keo bị bọt hoặc kênh đáy",
          "owner": "Thợ Khâu 2 (Dán/Keo)",
          "type": "step"
        },
        {
          "id": "G1_DONE",
          "group": "production",
          "x": 1440,
          "y": 100,
          "title": "Duyệt Đạt: Bấm 'Duyệt KCS'",
          "desc": "qc_status = 'Passed', lệnh thành 'Done' ➔ Kích hoạt trừ kho BOM dải phôi kính 1.8m và keo",
          "owner": "Hệ thống Tự Động",
          "type": "success"
        }
      ],
      "edges": [
        {"id": "ge_1", "from": "G1_ORDER", "to": "G1_K1", "label": "Bắt đầu Khâu 1", "kind": "normal"},
        {"id": "ge_2", "from": "G1_K1", "to": "G1_K2", "label": "Bàn giao sang Khâu 2", "kind": "normal"},
        {"id": "ge_3", "from": "G1_K2", "to": "G1_QC", "label": "Kiểm tra kín nước", "kind": "normal"},
        {"id": "ge_qc_pass", "from": "G1_QC", "to": "G1_DONE", "label": "Duyệt Đạt (Passed)", "kind": "normal"},
        {"id": "ge_qc_fail", "from": "G1_QC", "to": "G1_REWORK", "label": "Không Đạt (Xì bọt/Kênh)", "kind": "exception"},
        {"id": "ge_rework_k2", "from": "G1_REWORK", "to": "G1_K2", "label": "Vuốt keo lại rồi gửi KCS", "kind": "normal"}
      ]
    }
  }
}

destinations = [
    r"C:\Users\ADMIN\Desktop\RF_Operations_Map_Actual_App.json",
    r"C:\Users\ADMIN\Downloads\RF_Operations_Map_Actual_App.json",
    os.path.abspath("RF_Operations_Map_Actual_App.json")
]

for dst in destinations:
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(map_data, f, ensure_ascii=False, indent=2)
    print("Saved clean:", dst, "Size:", os.path.getsize(dst))
