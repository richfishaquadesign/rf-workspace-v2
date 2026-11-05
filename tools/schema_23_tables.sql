-- =============================================================================
-- RICH FISH AQUARIUM - RF_WORKSPACE_PRO CƠ SỞ DỮ LIỆU POSTGRESQL (23 BẢNG LÕI)
-- Chạy đoạn script này tại Supabase -> SQL Editor -> New Query -> Run
-- =============================================================================

-- 1. Orders
CREATE TABLE IF NOT EXISTS public."Orders" (
    id TEXT PRIMARY KEY,
    "orderCode" TEXT,
    channel TEXT,
    customer TEXT,
    "createdAt" TEXT,
    deadline TEXT,
    date TEXT,
    status TEXT,
    accessories TEXT,
    "hasProduction" BOOLEAN DEFAULT false,
    "isCarriedToWH" BOOLEAN DEFAULT false,
    "updatedBy" TEXT,
    revenue NUMERIC DEFAULT 0,
    phone TEXT,
    address TEXT,
    note TEXT,
    "prePaid" NUMERIC DEFAULT 0,
    cod NUMERIC DEFAULT 0,
    "costTotal" NUMERIC DEFAULT 0,
    "responsibleUser" TEXT,
    discount NUMERIC DEFAULT 0,
    "shippingMethod" TEXT,
    "sizeCoefficient" NUMERIC DEFAULT 1,
    cogs NUMERIC DEFAULT 0,
    "feeFixed" NUMERIC DEFAULT 0,
    "feeService" NUMERIC DEFAULT 0,
    "feePayment" NUMERIC DEFAULT 0,
    "feeAffiliate" NUMERIC DEFAULT 0,
    "shopVoucher" NUMERIC DEFAULT 0,
    tax NUMERIC DEFAULT 0,
    "reconciledAt" TEXT,
    "isReconciled" BOOLEAN DEFAULT false
);

-- 2. Production
CREATE TABLE IF NOT EXISTS public."Production" (
    id TEXT PRIMARY KEY,
    "orderId" TEXT,
    type TEXT,
    name TEXT,
    note TEXT,
    status TEXT,
    deadline TEXT,
    "fulfilledFromStock" BOOLEAN DEFAULT false,
    p1_name TEXT,
    p1_status TEXT,
    p1_user TEXT,
    p1_start TEXT,
    "p1_endTime" TEXT,
    p1_photo TEXT,
    p1_reward_vnd NUMERIC DEFAULT 0,
    p2_name TEXT,
    p2_status TEXT,
    p2_user TEXT,
    p2_start TEXT,
    "p2_endTime" TEXT,
    p2_photo TEXT,
    p2_reward_vnd NUMERIC DEFAULT 0,
    qc_front_photo TEXT,
    qc_side_photo TEXT,
    qc_status TEXT,
    qc_note TEXT
);

-- 3. Packings
CREATE TABLE IF NOT EXISTS public."Packings" (
    id TEXT PRIMARY KEY,
    "orderId" TEXT,
    "user" TEXT,
    start TEXT,
    "end" TEXT,
    "endTime" TEXT,
    status TEXT,
    photo TEXT,
    reward_vnd NUMERIC DEFAULT 0,
    "photoBefore" TEXT
);

-- 4. Products
CREATE TABLE IF NOT EXISTS public."Products" (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT,
    unit TEXT,
    image TEXT,
    category TEXT,
    sub_category TEXT,
    "costPrice" NUMERIC DEFAULT 0,
    price NUMERIC DEFAULT 0,
    quantity NUMERIC DEFAULT 0,
    "minStock" NUMERIC DEFAULT 0,
    "maxStock" NUMERIC DEFAULT 0,
    "realImage" TEXT,
    "importUnit" TEXT,
    "conversionRate" NUMERIC DEFAULT 1,
    "model3D" TEXT
);

-- 5. Config_NhanSu
CREATE TABLE IF NOT EXISTS public."Config_NhanSu" (
    id TEXT PRIMARY KEY,
    "Tên Nhân Sự" TEXT,
    "ID Ảnh" TEXT,
    "Chức Danh" TEXT,
    "Chức Danh Phụ" TEXT,
    "Phân Quyền" TEXT,
    "Mã PIN" TEXT,
    "Lương Cơ Bản" NUMERIC DEFAULT 0,
    "Lương Chức Vụ" NUMERIC DEFAULT 0,
    "Phụ Cấp Xăng Xe" NUMERIC DEFAULT 0,
    "Khoản Trừ Vi Phạm" NUMERIC DEFAULT 0,
    "Gmail" TEXT,
    "Số Điện Thoại" TEXT,
    "Địa Chỉ" TEXT,
    "Ngày Sinh" TEXT,
    "Số CCCD" TEXT,
    "Trạng Thái" TEXT DEFAULT 'Hoạt Động'
);

-- 6. Attendance
CREATE TABLE IF NOT EXISTS public."Attendance" (
    id TEXT PRIMARY KEY,
    "user" TEXT,
    date TEXT,
    "morningIn" TEXT,
    "morningOut" TEXT,
    "afternoonIn" TEXT,
    "afternoonOut" TEXT,
    "leaveType" TEXT,
    "leaveReportAt" TEXT,
    shift TEXT,
    "timeIn" TEXT,
    "timeOut" TEXT,
    "totalHours" NUMERIC DEFAULT 0,
    status TEXT,
    penalty NUMERIC DEFAULT 0,
    "isEdited" BOOLEAN DEFAULT false,
    "leaveStart" TEXT,
    "leaveEnd" TEXT,
    note TEXT
);

-- 7. KPI_Progress
CREATE TABLE IF NOT EXISTS public."KPI_Progress" (
    id TEXT PRIMARY KEY,
    "user" TEXT,
    "kpiName" TEXT,
    current NUMERIC DEFAULT 0,
    target NUMERIC DEFAULT 0,
    unit TEXT,
    "lastUpdated" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    reward NUMERIC DEFAULT 0,
    "isClaimed" BOOLEAN DEFAULT false,
    guide TEXT
);

-- 8. Config_KPI
CREATE TABLE IF NOT EXISTS public."Config_KPI" (
    id TEXT PRIMARY KEY,
    "Nhóm Hàng" TEXT,
    "Từ Khoá" TEXT,
    "Tên Hàng" TEXT,
    "Thời gian Khâu 1" NUMERIC DEFAULT 0,
    "Tiền Khâu 1" NUMERIC DEFAULT 0,
    "Thời gian Khâu 2" NUMERIC DEFAULT 0,
    "Tiền Khâu 2" NUMERIC DEFAULT 0,
    "Thời gian Đóng Gói" NUMERIC DEFAULT 0,
    "Thưởng Đóng Gói" NUMERIC DEFAULT 0,
    "Thưởng Chở Kho" NUMERIC DEFAULT 0
);

-- 9. BOM_Config
CREATE TABLE IF NOT EXISTS public."BOM_Config" (
    id TEXT PRIMARY KEY,
    "layoutCode" TEXT,
    "materialSku" TEXT,
    "defaultQty" NUMERIC DEFAULT 0,
    unit TEXT
);

-- 10. Transactions
CREATE TABLE IF NOT EXISTS public."Transactions" (
    id TEXT PRIMARY KEY,
    type TEXT,
    category TEXT,
    amount NUMERIC DEFAULT 0,
    "fromAccount" TEXT,
    "toAccount" TEXT,
    title TEXT,
    date TEXT,
    note TEXT,
    "isAuto" BOOLEAN DEFAULT false
);

-- 11. ImportExport
CREATE TABLE IF NOT EXISTS public."ImportExport" (
    id TEXT PRIMARY KEY,
    type TEXT,
    target TEXT,
    "totalAmount" NUMERIC DEFAULT 0,
    date TEXT,
    note TEXT,
    "itemsData" TEXT
);

-- 12. Accounts
CREATE TABLE IF NOT EXISTS public."Accounts" (
    id TEXT PRIMARY KEY,
    "accountName" TEXT,
    balance NUMERIC DEFAULT 0,
    type TEXT,
    "accountNumber" TEXT,
    "accountOwner" TEXT
);

-- 13. BonusPenalty
CREATE TABLE IF NOT EXISTS public."BonusPenalty" (
    id TEXT PRIMARY KEY,
    "user" TEXT,
    amount NUMERIC DEFAULT 0,
    type TEXT,
    note TEXT,
    date TEXT,
    "orderCode" TEXT
);

-- 14. CTV_Finance
CREATE TABLE IF NOT EXISTS public."CTV_Finance" (
    id TEXT PRIMARY KEY,
    date TEXT,
    type TEXT,
    amount NUMERIC DEFAULT 0,
    note TEXT,
    "user" TEXT,
    status TEXT
);

-- 15. Config_GiaLayout
CREATE TABLE IF NOT EXISTS public."Config_GiaLayout" (
    id TEXT PRIMARY KEY,
    "Size_Max" NUMERIC DEFAULT 0,
    "Do_Chi_Tiet" TEXT,
    "He_So_Gia" NUMERIC DEFAULT 1,
    "Phi_Gui_Xuong" NUMERIC DEFAULT 0,
    "Phi_Gan_Reu" NUMERIC DEFAULT 0
);

-- 16. Documents
CREATE TABLE IF NOT EXISTS public."Documents" (
    id TEXT PRIMARY KEY,
    category TEXT,
    title TEXT,
    description TEXT,
    link TEXT,
    "createdAt" TEXT,
    "createdBy" TEXT,
    attachments TEXT,
    "testLink" TEXT,
    "readBy" TEXT
);

-- 17. Trainings
CREATE TABLE IF NOT EXISTS public."Trainings" (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    "targetRole" TEXT,
    "createdAt" TEXT,
    "createdBy" TEXT,
    "readUsers" TEXT
);

-- 18. Models3D
CREATE TABLE IF NOT EXISTS public."Models3D" (
    id TEXT PRIMARY KEY,
    name TEXT,
    url TEXT,
    "createdAt" TEXT,
    "createdBy" TEXT,
    "productId" TEXT,
    materials TEXT
);

-- 19. Monthly_Snapshots
CREATE TABLE IF NOT EXISTS public."Monthly_Snapshots" (
    id TEXT PRIMARY KEY,
    month TEXT,
    "user" TEXT,
    "totalSalary" NUMERIC DEFAULT 0,
    "totalHours" NUMERIC DEFAULT 0,
    "totalAdvance" NUMERIC DEFAULT 0,
    "totalDebt" NUMERIC DEFAULT 0,
    "createdAt" TEXT,
    "snapshotData" TEXT
);

-- 20. ProfitReports
CREATE TABLE IF NOT EXISTS public."ProfitReports" (
    id TEXT PRIMARY KEY,
    period TEXT,
    channel TEXT,
    revenue NUMERIC DEFAULT 0,
    "orderCount" NUMERIC DEFAULT 0,
    "platformFee" NUMERIC DEFAULT 0,
    returns NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    ads NUMERIC DEFAULT 0,
    cogs NUMERIC DEFAULT 0,
    salary NUMERIC DEFAULT 0,
    operation NUMERIC DEFAULT 0
);

-- 21. Reimbursements
CREATE TABLE IF NOT EXISTS public."Reimbursements" (
    id TEXT PRIMARY KEY,
    "staffName" TEXT,
    reason TEXT,
    amount NUMERIC DEFAULT 0,
    "qrCodeUrl" TEXT,
    status TEXT,
    "createdAt" TEXT
);

-- 22. Suppliers
CREATE TABLE IF NOT EXISTS public."Suppliers" (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    "totalDebt" NUMERIC DEFAULT 0,
    category TEXT,
    note TEXT
);

-- 23. Tracking_Log
CREATE TABLE IF NOT EXISTS public."Tracking_Log" (
    id TEXT PRIMARY KEY,
    "Thời gian" TEXT,
    "Tên nhân sự" TEXT,
    "Hoàn thành" TEXT,
    "Hỏi AI" TEXT,
    "Ghi chú thêm" TEXT
);

-- Bật quyền truy cập công khai (RLS Bypass) cho Data API của ứng dụng
ALTER TABLE public."Orders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Orders" ON public."Orders" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Production" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Production" ON public."Production" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Packings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Packings" ON public."Packings" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Products" ON public."Products" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Config_NhanSu" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Config_NhanSu" ON public."Config_NhanSu" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Attendance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Attendance" ON public."Attendance" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."KPI_Progress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write KPI_Progress" ON public."KPI_Progress" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Config_KPI" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Config_KPI" ON public."Config_KPI" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."BOM_Config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write BOM_Config" ON public."BOM_Config" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Transactions" ON public."Transactions" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."ImportExport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write ImportExport" ON public."ImportExport" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Accounts" ON public."Accounts" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."BonusPenalty" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write BonusPenalty" ON public."BonusPenalty" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."CTV_Finance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write CTV_Finance" ON public."CTV_Finance" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Config_GiaLayout" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Config_GiaLayout" ON public."Config_GiaLayout" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Documents" ON public."Documents" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Trainings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Trainings" ON public."Trainings" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Models3D" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Models3D" ON public."Models3D" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Monthly_Snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Monthly_Snapshots" ON public."Monthly_Snapshots" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."ProfitReports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write ProfitReports" ON public."ProfitReports" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Reimbursements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Reimbursements" ON public."Reimbursements" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Suppliers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Suppliers" ON public."Suppliers" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public."Tracking_Log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read-write Tracking_Log" ON public."Tracking_Log" FOR ALL USING (true) WITH CHECK (true);
