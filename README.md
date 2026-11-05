# 🌊 RF WORKSPACE PRO V2 — KIẾN TRÚC HIỆU NĂNG CAO (SUPABASE + VERCEL)

Chào mừng bạn đến với **RF Workspace Pro V2** của **Rich Fish Aquarium**.

---

## 📁 Cấu Trúc Thư Mục Dự Án (Project Architecture)

```
RF_Workspace_V2/
├── html/                     # Giao diện người dùng & các Component React
│   ├── Index.html            # Khung HTML gốc, nạp thư viện và CSS
│   ├── Compiled_Core.html    # Mã nguồn React UI chính (Dashboard, Đơn hàng, Kho, Tài chính)
│   ├── Compiled_Deferred.html# Các Tab phụ (Kế toán, Huấn luyện, Hồ sơ, Thiết lập)
│   ├── RF_Utilities.html     # Thư viện hàm phụ trợ (Định dạng tiền tệ, ngày tháng, helper)
│   ├── RF_V6_Styles.html     # Hệ thống Style & CSS Tailwind chuyên biệt
│   └── WorkspaceWebsite.html # Cổng thông tin nội bộ
├── js/                       # Bộ dịch vụ logic nghiệp vụ 23 bảng CSDL
│   ├── Code.js               # Logic điều phối chính (RBAC, API handler)
│   ├── DataLoading.js        # Logic tải và phân tách dữ liệu
│   ├── Operations.js         # Quản trị sản xuất & xưởng 2 khâu
│   └── ReconciliationEngine.js# Động cơ đối soát tự động Shopee/TikTok/GHN
├── tools/                    # Công cụ tự động hóa & Build
│   ├── build_vercel_standalone.py # Trình biên dịch tạo file index.html triển khai
│   └── migrate_sheets_to_supabase.py # Công cụ di chuyển 14.000 dòng dữ liệu sang Supabase
├── supabase/                 # Cấu hình CSDL Supabase PostgreSQL
├── index.html                # Bản build Production nạp trực tiếp trên Vercel CDN (<0.2s)
├── vercel.json               # Cấu hình định tuyến & Header Vercel
├── manifest.json             # Cấu hình Web App PWA di động
└── package.json              # Quản lý script dự án
```

---

## ⚡ Các Lệnh Thao Tác Nhanh (Commands)

* **Build lại app khi có thay đổi code:**
  ```bash
  python tools/build_vercel_standalone.py
  ```
* **Đẩy bản mới lên Vercel Production:**
  ```bash
  vercel --prod --yes
  ```
* **Đồng bộ lại toàn bộ dữ liệu từ Google Sheets sang Supabase:**
  ```bash
  python tools/migrate_sheets_to_supabase.py
  ```

---

## 🔗 Liên Kết Trực Tuyến
* **Production Web App:** [https://rf-workspace-v2-eight.vercel.app](https://rf-workspace-v2-eight.vercel.app)
* **Supabase Database Dashboard:** [https://supabase.com/dashboard/project/oxtttywpelbyitgxspfm](https://supabase.com/dashboard/project/oxtttywpelbyitgxspfm)
