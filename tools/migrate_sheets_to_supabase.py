# -*- coding: utf-8 -*-
import urllib.request
import urllib.parse
import json
import csv
import io
import time

SHEET_ID_PRIMARY = "1HFdyh5a1sHUYnKvTrSUvLBukMmXV5lYNLmU9_deijys"
SHEET_ID_BACKUP = "1VGGL53xlS55dJNXYmz9GmqLjbhKh73wjEa1Hq7Holsw"

SUPABASE_URL = "https://oxtttywpelbyitgxspfm.supabase.co"
SUPABASE_KEY = "sb_publishable_Bi-hpAsVX5nS10wE_LugRA_RF8wnu0W"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

TABLE_COLUMNS = {
    "Orders": ["id", "orderCode", "channel", "customer", "createdAt", "deadline", "date", "status", "accessories", "hasProduction", "isCarriedToWH", "updatedBy", "revenue", "phone", "address", "note", "prePaid", "cod", "costTotal", "responsibleUser", "discount", "shippingMethod", "sizeCoefficient", "cogs", "feeFixed", "feeService", "feePayment", "feeAffiliate", "shopVoucher", "tax", "reconciledAt", "isReconciled", "isUrgent"],
    "Production": ["id", "orderId", "type", "name", "note", "status", "deadline", "fulfilledFromStock", "p1_name", "p1_status", "p1_user", "p1_start", "p1_endTime", "p1_photo", "p1_reward_vnd", "p2_name", "p2_status", "p2_user", "p2_start", "p2_endTime", "p2_photo", "p2_reward_vnd", "qc_front_photo", "qc_side_photo", "qc_status", "qc_note"],
    "Packings": ["id", "orderId", "user", "start", "end", "endTime", "status", "photo", "reward_vnd", "photoBefore"],
    "Products": ["id", "sku", "name", "unit", "image", "category", "sub_category", "costPrice", "price", "quantity", "minStock", "maxStock", "realImage", "importUnit", "conversionRate", "model3D"],
    "Config_NhanSu": ["id", "Tên Nhân Sự", "ID Ảnh", "Chức Danh", "Chức Danh Phụ", "Phân Quyền", "Mã PIN", "Lương Cơ Bản", "Lương Chức Vụ", "Phụ Cấp Xăng Xe", "Khoản Trừ Vi Phạm", "Gmail", "Số Điện Thoại", "Địa Chỉ", "Ngày Sinh", "Số CCCD", "Trạng Thái"],
    "Attendance": ["id", "user", "date", "morningIn", "morningOut", "afternoonIn", "afternoonOut", "leaveType", "leaveReportAt", "shift", "timeIn", "timeOut", "totalHours", "status", "penalty", "isEdited", "leaveStart", "leaveEnd", "note"],
    "KPI_Progress": ["id", "user", "kpiName", "current", "target", "unit", "lastUpdated", "startTime", "endTime", "reward", "isClaimed", "guide", "penalty"],
    "Config_KPI": ["id", "Nhóm Hàng", "Từ Khoá", "Tên Hàng", "Thời gian Khâu 1", "Tiền Khâu 1", "Thời gian Khâu 2", "Tiền Khâu 2", "Thời gian Đóng Gói", "Thưởng Đóng Gói", "Thưởng Chở Kho"],
    "BOM_Config": ["id", "layoutCode", "materialSku", "defaultQty", "unit"],
    "Transactions": ["id", "type", "category", "amount", "fromAccount", "toAccount", "title", "date", "note", "isAuto"],
    "ImportExport": ["id", "type", "target", "totalAmount", "date", "note", "itemsData"],
    "Accounts": ["id", "accountName", "balance", "type", "accountNumber", "accountOwner"],
    "BonusPenalty": ["id", "user", "amount", "type", "note", "date", "orderCode"],
    "CTV_Finance": ["id", "date", "type", "amount", "note", "user", "status"],
    "Config_GiaLayout": ["id", "Size_Max", "Do_Chi_Tiet", "He_So_Gia", "Phi_Gui_Xuong", "Phi_Gan_Reu"],
    "Documents": ["id", "category", "title", "description", "link", "createdAt", "createdBy", "attachments", "testLink", "readBy"],
    "Trainings": ["id", "title", "content", "targetRole", "createdAt", "createdBy", "readUsers"],
    "Models3D": ["id", "name", "url", "createdAt", "createdBy", "productId", "materials"],
    "Monthly_Snapshots": ["id", "month", "user", "totalSalary", "totalHours", "totalAdvance", "totalDebt", "createdAt", "snapshotData"],
    "Reimbursements": ["id", "staffName", "reason", "amount", "qrCodeUrl", "status", "createdAt"],
    "Suppliers": ["id", "name", "phone", "totalDebt", "category", "note"],
    "Tracking_Log": ["id", "Thời gian", "Tên nhân sự", "Hoàn thành", "Hỏi AI", "Ghi chú thêm"]
}

NUMERIC_COLUMNS = {
    "revenue", "prePaid", "cod", "costTotal", "discount", "sizeCoefficient", "cogs", 
    "feeFixed", "feeService", "feePayment", "feeAffiliate", "shopVoucher", "tax",
    "p1_reward_vnd", "p2_reward_vnd", "reward_vnd", "costPrice", "price", "quantity", 
    "minStock", "maxStock", "conversionRate", "Lương Cơ Bản", "Lương Chức Vụ", 
    "Phụ Cấp Xăng Xe", "Khoản Trừ Vi Phạm", "totalHours", "penalty", "current", 
    "target", "reward", "Thời gian Khâu 1", "Tiền Khâu 1", "Thời gian Khâu 2", 
    "Tiền Khâu 2", "Thời gian Đóng Gói", "Thưởng Đóng Gói", "Thưởng Chở Kho", 
    "defaultQty", "amount", "totalAmount", "balance", "Size_Max", "He_So_Gia", 
    "Phi_Gui_Xuong", "Phi_Gan_Reu", "totalSalary", "totalAdvance", "totalDebt", 
    "orderCount", "platformFee", "returns", "ads", "salary", "operation"
}

BOOLEAN_COLUMNS = {
    "hasProduction", "isCarriedToWH", "isReconciled", "isUrgent", "fulfilledFromStock",
    "isEdited", "isClaimed", "isAuto"
}

def clean_val(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.lower() == "null":
        return None
    return s

def to_num(v, default=0):
    if v is None:
        return default
    s = str(v).replace('đ', '').replace('VND', '').replace('vnd', '').replace(' ', '').strip()
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    elif '.' in s:
        parts = s.split('.')
        if len(parts) == 2 and len(parts[1]) == 3:
            try:
                if int(parts[0]) > 0:
                    s = s.replace('.', '')
            except:
                pass
    try:
        return float(s)
    except:
        return default

def to_bool(v):
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in ["true", "1", "yes", "đúng", "x"]

def fetch_csv(sheet_id, table_name):
    encoded_sheet = urllib.parse.quote(table_name)
    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={encoded_sheet}"
    try:
        req = urllib.request.Request(csv_url)
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None

def migrate_table(table_name):
    allowed_cols = set(TABLE_COLUMNS.get(table_name, []))
    if not allowed_cols:
        return 0

    csv_text = fetch_csv(SHEET_ID_PRIMARY, table_name)
    reader = csv.reader(io.StringIO(csv_text or ""))
    rows = list(reader)
    data_rows = rows[1:] if len(rows) > 1 else []
    
    if not data_rows:
        csv_text_bk = fetch_csv(SHEET_ID_BACKUP, table_name)
        if csv_text_bk:
            reader_bk = csv.reader(io.StringIO(csv_text_bk))
            rows_bk = list(reader_bk)
            if len(rows_bk) > 1 and any(rows_bk[1]):
                rows = rows_bk
                data_rows = rows[1:]
                print(f"[*] Sheet {table_name}: Lấy {len(data_rows)} dòng từ CSDL 1VGGL...")

    if not rows or not data_rows:
        print(f"[.] Sheet {table_name}: 0 dòng dữ liệu")
        return 0

    headers = [h.strip() for h in rows[0] if h.strip()]
    records = []
    
    for idx, r in enumerate(data_rows):
        if not any(r):
            continue
        record = {}
        for c_idx, h in enumerate(headers):
            if c_idx < len(r) and h in allowed_cols:
                val = clean_val(r[c_idx])
                if h in BOOLEAN_COLUMNS:
                    record[h] = to_bool(val)
                elif h in NUMERIC_COLUMNS:
                    record[h] = to_num(val)
                else:
                    record[h] = val
        
        # Ensure unique ID
        if not record.get("id"):
            record["id"] = f"{table_name.lower()}_{idx+1}"

        records.append(record)

    if not records:
        return 0

    chunk_size = 100
    inserted_count = 0
    endpoint = f"{SUPABASE_URL}/rest/v1/{table_name}"
    
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i+chunk_size]
        post_data = json.dumps(chunk).encode('utf-8')
        req = urllib.request.Request(endpoint, data=post_data, headers=HEADERS, method='POST')
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status in [200, 201]:
                    inserted_count += len(chunk)
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8', errors='ignore')
            print(f"[-] Lỗi {table_name} chunk {i}: {e.code} - {err_msg[:160]}")
        except Exception as e:
            print(f"[-] Lỗi {table_name}: {e}")

    print(f"[+] Sheet {table_name}: Đã chuyển thành công {inserted_count}/{len(records)} dòng vào Supabase!")
    return inserted_count

if __name__ == "__main__":
    print(f"⚡ Bắt đầu đồng bộ CSDL chuẩn hóa vào Supabase...")
    total = 0
    # Prioritize missing tables
    priority = ["Orders", "Production", "Products", "Attendance", "KPI_Progress", "Accounts", "Documents", "Monthly_Snapshots", "Tracking_Log"]
    for t in priority:
        total += migrate_table(t)
    print(f"\n🎉 HOÀN TẤT ĐỒNG BỘ! Đã nạp thêm {total} dòng vào Supabase!")
