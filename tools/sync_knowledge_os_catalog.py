#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
RF_WORKSPACE_PRO — KNOWLEDGE OS CATALOG SYNCHRONIZER
Đồng bộ hóa 100% dữ liệu hàng hóa, vật tư, định mức BOM và KPI từ kho tri thức nguồn:
C:\Users\ADMIN\Desktop\RF_KNOWLEDGE_OS

Ánh xạ chính xác vào 23 bảng CSDL:
- Products (Bể Kính 6 dòng, Layout 13 danh mục, Vật Tư kho)
- BOM_Config (Định mức chi tiết từng SKU sản phẩm)
- Config_KPI (Định mức tiền công 2 khâu & đóng gói)
"""

import os
import glob
import re
import yaml
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

KNOWLEDGE_OS_DIR = r"C:\Users\ADMIN\Desktop\RF_KNOWLEDGE_OS"
TEMPLATE_EXCEL_PATH = r"C:\Users\ADMIN\RF_Workspace_Pro\RF_Workspace_Pro_Template_23_Sheets.xlsx"

def clean_txt(val):
    if val is None:
        return ""
    return str(val).strip()

def parse_md_frontmatter_and_body(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        raw = f.read().lstrip("\ufeff")
    parts = raw.split("---", 2)
    if len(parts) >= 3:
        try:
            front = yaml.safe_load(parts[1]) or {}
        except Exception:
            front = {}
        body = parts[2]
        return front, body
    return {}, raw

def extract_all_vat_tu():
    items = []
    search_path = os.path.join(KNOWLEDGE_OS_DIR, "03_KHO_VAT_TU", "Danh_Muc_Vat_Tu", "**", "*.md")
    for f in glob.glob(search_path, recursive=True):
        front, _ = parse_md_frontmatter_and_body(f)
        sku = front.get("sku")
        if not sku:
            continue
        title = front.get("title", sku)
        category = front.get("category", "DANH MỤC SẢN XUẤT")
        sub_category = front.get("sub_category", "VẬT TƯ NGUYÊN LIỆU")
        unit = front.get("stock_unit") or front.get("purchase_unit") or "Cái"
        import_unit = front.get("purchase_unit") or unit
        conv_rate = front.get("conversion_rate", 1)
        cost_price = front.get("purchase_price_vnd") or front.get("production_unit_price_vnd") or 0
        
        items.append({
            "id": f"VT_{sku}",
            "sku": sku,
            "name": title,
            "unit": unit,
            "image": "",
            "category": category,
            "sub_category": sub_category,
            "costPrice": cost_price,
            "price": 0,
            "quantity": 100,
            "minStock": 10,
            "maxStock": 500,
            "realImage": "",
            "importUnit": import_unit,
            "conversionRate": conv_rate,
            "model3D": ""
        })
    return items

def extract_all_be_kinh():
    items = []
    search_path = os.path.join(KNOWLEDGE_OS_DIR, "01_SAN_PHAM", "02_BE_KINH", "**", "*.md")
    for f in glob.glob(search_path, recursive=True):
        front, body = parse_md_frontmatter_and_body(f)
        sku = front.get("sku")
        if not sku:
            continue
        title = front.get("title", f"Bể kính {sku}")
        sub_cat = front.get("sub_category", "01_BE_MINI")
        dims = front.get("dimensions") or {}
        length = dims.get("length_cm", 30)
        width = dims.get("width_cm", 20)
        height = dims.get("height_cm", 20)
        
        # Công thức tính COGS chuẩn bể kính tử diện:
        # S = (L*W + 2*L*H + 2*W*H)*1.1 / 10000 m2
        # P = (L + W)*2 / 100 m
        # COGS = S*175.000 + P*25.000 + Keo(9.000) + Khau1 + Khau2 + DongGoi(6.000) + BaoBi(15.000)
        s_m2 = ((length * width) + 2 * (length * height) + 2 * (width * height)) * 1.1 / 10000.0
        p_m = ((length + width) * 2) / 100.0
        
        glass_cost = s_m2 * 175000.0
        polish_cost = p_m * 25000.0
        silicon_cost = 9000.0
        
        # Tiền công khoán theo kích thước từ Bang_Cong_Khoan_San_Xuat.md
        if length <= 15:
            k1, k2, dg = 6000, 8000, 4000
        elif length <= 20:
            k1, k2, dg = 10000, 12000, 5000
        elif length <= 30:
            k1, k2, dg = 14000, 16000, 6000
        elif length <= 40:
            k1, k2, dg = 18000, 22000, 8000
        else:
            k1, k2, dg = 50000, 70000, 15000
            
        packing_box = 15000.0
        cogs = round(glass_cost + polish_cost + silicon_cost + k1 + k2 + dg + packing_box)
        
        price = front.get("price_shopee_vnd") or (cogs * 2.2)
        
        img_folder = front.get("image_folder", "")
        img_url = f"https://drive.google.com/rf_media/{sku}_thumb.jpg"
        real_img = f"https://drive.google.com/rf_media/{sku}_real.jpg"
        
        items.append({
            "id": f"BE_{sku}",
            "sku": sku,
            "name": title,
            "unit": "Bể",
            "image": img_url,
            "category": "BỂ KÍNH",
            "sub_category": sub_cat,
            "costPrice": cogs,
            "price": int(price),
            "quantity": 10,
            "minStock": 2,
            "maxStock": 20,
            "realImage": real_img,
            "importUnit": "Bể",
            "conversionRate": 1,
            "model3D": f"M3D_{sku}"
        })
    return items

def extract_all_layouts():
    items = []
    search_path = os.path.join(KNOWLEDGE_OS_DIR, "01_SAN_PHAM", "LAYOUT", "**", "*.md")
    for f in glob.glob(search_path, recursive=True):
        if "Lien_Ket_Anh" in f:
            continue
        front, _ = parse_md_frontmatter_and_body(f)
        sku = front.get("sku") or front.get("id")
        if not sku:
            continue
        title = front.get("title", f"Layout {sku}")
        design_group = front.get("design_group", "LAYOUT")
        size = front.get("size", "S")
        dims_str = front.get("dimensions_cm", "20x20x20")
        
        # Chi phí công và đóng gói theo 13 danh mục chuẩn
        # Siêu nhanh: Cuội Biotop, Đảo Bay, Vách
        # Nhanh: Cầu Vồng, Cổng Vòm, Nature, Nhất Trụ
        # Bình thường: Hang Động, Hẻm Núi, Rừng
        # Lâu: Bonsai
        # Siêu Lâu: Linh Thú
        dg_upper = design_group.upper()
        if any(k in dg_upper for k in ["CUỘI", "ĐẢO", "VÁCH"]):
            k1, k2, dg = (12000, 13000, 5000) if size == "S" else ((16000, 17000, 6000) if size == "M" else (22000, 23000, 8000))
        elif any(k in dg_upper for k in ["CẦU VỒNG", "CỔNG VÒM", "NATURE", "NHẤT TRỤ"]):
            k1, k2, dg = (18000, 17000, 5000) if size == "S" else ((25000, 25000, 6000) if size == "M" else (35000, 35000, 8000))
        elif any(k in dg_upper for k in ["HANG ĐỘNG", "HẺM NÚI", "RỪNG"]):
            k1, k2, dg = (25000, 25000, 5000) if size == "S" else ((38000, 37000, 6000) if size == "M" else (50000, 50000, 8000))
        elif "BONSAI" in dg_upper:
            k1, k2, dg = (32000, 33000, 5000) if size == "S" else ((48000, 47000, 6000) if size == "M" else (65000, 65000, 8000))
        elif "LINH THÚ" in dg_upper:
            k1, k2, dg = 120000, 110000, 12000
        else:
            k1, k2, dg = 25000, 25000, 6000
            
        packing_box = 15000
        mat_cost = front.get("material_cost_vnd") or 45000
        cogs = int(mat_cost + k1 + k2 + dg + packing_box)
        
        price = front.get("listed_price_vnd") or (cogs * 2.5)
        
        items.append({
            "id": f"LAY_{sku}",
            "sku": sku,
            "name": title,
            "unit": "Bộ",
            "image": f"https://drive.google.com/rf_media/{sku}_thumb.jpg",
            "category": "DANH MỤC SẢN XUẤT",
            "sub_category": design_group,
            "costPrice": cogs,
            "price": int(price),
            "quantity": 5,
            "minStock": 2,
            "maxStock": 20,
            "realImage": f"https://drive.google.com/rf_media/{sku}_real.jpg",
            "importUnit": "Bộ",
            "conversionRate": 1,
            "model3D": f"M3D_{sku}"
        })
    return items

def extract_all_boms():
    bom_rows = []
    idx = 1
    search_path = os.path.join(KNOWLEDGE_OS_DIR, "02_SAN_XUAT", "BOM_Dinh_Muc", "**", "*.md")
    for f in glob.glob(search_path, recursive=True):
        front, body = parse_md_frontmatter_and_body(f)
        layout_code = front.get("sku") or front.get("sku_audit_sku") or front.get("layout_code") or front.get("id")
        if not layout_code:
            continue
            
        # Parse Markdown Table
        lines = body.split("\n")
        in_table = False
        for l in lines:
            if "| SKU vật tư" in l or "| Thành phần chi phí" in l:
                in_table = True
                continue
            if in_table:
                if not l.strip() or not l.startswith("|") or "Kiểm soát" in l or "##" in l:
                    in_table = False
                    continue
                if "---" in l:
                    continue
                cols = [c.strip() for c in l.split("|")[1:-1]]
                if len(cols) >= 3:
                    mat_sku = cols[0].replace("[[", "").replace("]]", "").replace("`", "").strip()
                    qty_str = cols[1].replace(",", "").strip()
                    unit = cols[2].strip()
                    
                    # Trích xuất số thực sạch từ chuỗi định mức (ví dụ "0.205 m² x 175.000đ" -> 0.205)
                    match_num = re.search(r"([0-9]+(?:\.[0-9]+)?)", qty_str)
                    if match_num:
                        try:
                            qty = float(match_num.group(1))
                        except Exception:
                            qty = 1.0
                    else:
                        qty = 1.0
                        
                    # Bỏ qua các dòng chi phí công khoán và bao bì (đã quản lý tại Config_KPI)
                    if any(kw in mat_sku for kw in ["Công Khâu", "Thưởng", "Bao bì", "TỔNG", "COGS", "Cách tính"]):
                        continue
                        
                    # Chuẩn hóa tên SKU vật tư bể kính nếu là text tự do
                    if "Kính phôi" in mat_sku:
                        mat_sku = "NL-BE-KINH4LI-DAI18"
                        unit = "m²"
                    elif "Keo Silicon" in mat_sku:
                        mat_sku = "NL-BE-VTSX-A300"
                        unit = "Chai"
                    elif "Mài vi tính" in mat_sku:
                        mat_sku = "DV-MAI-VI-TINH"
                        unit = "Mét"
                        
                    bom_rows.append({
                        "id": f"BOM_{idx:05d}",
                        "layoutCode": layout_code,
                        "materialSku": mat_sku,
                        "defaultQty": qty,
                        "unit": unit
                    })
                    idx += 1
    return bom_rows

def get_config_kpi_rows():
    return [
        {
            "id": "CKPI_001",
            "Nhóm Hàng": "Layout Siêu nhanh",
            "Từ Khoá": "Cuội Biotop, Đảo Bay, Vách",
            "Tên Hàng": "Layout Siêu nhanh (20x20x20 - 40x23x25)",
            "Thời gian Khâu 1": "15 - 30 phút",
            "Tiền Khâu 1": 16000,
            "Thời gian Khâu 2": "15 - 25 phút",
            "Tiền Khâu 2": 17000,
            "Thời gian Đóng Gói": "10 - 15 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_002",
            "Nhóm Hàng": "Layout Nhanh",
            "Từ Khoá": "Cầu Vồng, Cổng Vòm, Nature, Nhất Trụ",
            "Tên Hàng": "Layout Nhanh (20x20x20 - 40x23x25)",
            "Thời gian Khâu 1": "25 - 45 phút",
            "Tiền Khâu 1": 25000,
            "Thời gian Khâu 2": "20 - 40 phút",
            "Tiền Khâu 2": 25000,
            "Thời gian Đóng Gói": "10 - 15 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_003",
            "Nhóm Hàng": "Layout Bình thường",
            "Từ Khoá": "Hang Động, Hẻm Núi, Rừng",
            "Tên Hàng": "Layout Bình thường (20x20x20 - 40x23x25)",
            "Thời gian Khâu 1": "35 - 70 phút",
            "Tiền Khâu 1": 38000,
            "Thời gian Khâu 2": "30 - 60 phút",
            "Tiền Khâu 2": 37000,
            "Thời gian Đóng Gói": "10 - 15 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_004",
            "Nhóm Hàng": "Layout Lâu",
            "Từ Khoá": "Bonsai",
            "Tên Hàng": "Layout Bonsai (20x20x20 - 40x23x25)",
            "Thời gian Khâu 1": "45 - 90 phút",
            "Tiền Khâu 1": 48000,
            "Thời gian Khâu 2": "40 - 80 phút",
            "Tiền Khâu 2": 47000,
            "Thời gian Đóng Gói": "10 - 15 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_005",
            "Nhóm Hàng": "Layout Siêu Lâu",
            "Từ Khoá": "Linh Thú, Cá Voi, Khủng Long, Phượng Hoàng, Rồng, Đại Bàng",
            "Tên Hàng": "Layout Linh Thú Cao Cấp",
            "Thời gian Khâu 1": "120 - 180 phút",
            "Tiền Khâu 1": 120000,
            "Thời gian Khâu 2": "120 - 150 phút",
            "Tiền Khâu 2": 110000,
            "Thời gian Đóng Gói": "20 - 30 phút",
            "Thưởng Đóng Gói": 12000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_006",
            "Nhóm Hàng": "Bể Kính Mini",
            "Từ Khoá": "01_BE_MINI",
            "Tên Hàng": "Bể Kính Mini (10x10x10 đến 40x23x25)",
            "Thời gian Khâu 1": "8 - 20 phút",
            "Tiền Khâu 1": 14000,
            "Thời gian Khâu 2": "10 - 25 phút",
            "Tiền Khâu 2": 16000,
            "Thời gian Đóng Gói": "8 - 15 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_007",
            "Nhóm Hàng": "Bể Nâng Đáy",
            "Từ Khoá": "02_BE_NANG_DAY",
            "Tên Hàng": "Bể Nâng Đáy (20x20x20 NĐ, 30x18x12 NĐ)",
            "Thời gian Khâu 1": "15 - 18 phút",
            "Tiền Khâu 1": 16000,
            "Thời gian Khâu 2": "20 - 22 phút",
            "Tiền Khâu 2": 19000,
            "Thời gian Đóng Gói": "10 - 12 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_008",
            "Nhóm Hàng": "Bể Betta Ngăn",
            "Từ Khoá": "03_BE_BETTA",
            "Tên Hàng": "Bể Cá Betta 2 - 3 ngăn",
            "Thời gian Khâu 1": "18 - 25 phút",
            "Tiền Khâu 1": 22000,
            "Thời gian Khâu 2": "25 - 35 phút",
            "Tiền Khâu 2": 28000,
            "Thời gian Đóng Gói": "10 - 12 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_009",
            "Nhóm Hàng": "Bán Cạn",
            "Từ Khoá": "04_BAN_CAN",
            "Tên Hàng": "Bể Bán Cạn Giật Cấp",
            "Thời gian Khâu 1": "22 phút",
            "Tiền Khâu 1": 20000,
            "Thời gian Khâu 2": "30 phút",
            "Tiền Khâu 2": 25000,
            "Thời gian Đóng Gói": "15 phút",
            "Thưởng Đóng Gói": 7000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_010",
            "Nhóm Hàng": "Terrarium",
            "Từ Khoá": "05_TERRARIUM",
            "Tên Hàng": "Bể Thủy Sinh Terrarium",
            "Thời gian Khâu 1": "20 phút",
            "Tiền Khâu 1": 18000,
            "Thời gian Khâu 2": "25 phút",
            "Tiền Khâu 2": 22000,
            "Thời gian Đóng Gói": "12 phút",
            "Thưởng Đóng Gói": 6000,
            "Thưởng Chở Kho": 3000
        },
        {
            "id": "CKPI_011",
            "Nhóm Hàng": "Bể Show Đất",
            "Từ Khoá": "06_BE_SHOW_DAT",
            "Tên Hàng": "Bể Show Đất & Bể Kích Thước Lớn",
            "Thời gian Khâu 1": "45 - 90 phút",
            "Tiền Khâu 1": 50000,
            "Thời gian Khâu 2": "60 - 120 phút",
            "Tiền Khâu 2": 70000,
            "Thời gian Đóng Gói": "25 - 40 phút",
            "Thưởng Đóng Gói": 15000,
            "Thưởng Chở Kho": 3000
        }
    ]

def main():
    print("🚀 BẮT ĐẦU ĐỒNG BỘ DỮ LIỆU TỪ RF_KNOWLEDGE_OS VÀO RF_WORKSPACE_PRO...")
    
    # 1. Trích xuất
    vat_tu = extract_all_vat_tu()
    be_kinh = extract_all_be_kinh()
    layouts = extract_all_layouts()
    all_products = vat_tu + be_kinh + layouts
    print(f"📦 Tổng sản phẩm & vật tư: {len(all_products)} (Vật tư: {len(vat_tu)}, Bể kính: {len(be_kinh)}, Layout: {len(layouts)})")
    
    boms = extract_all_boms()
    print(f"📐 Tổng định mức BOM: {len(boms)} dòng")
    
    kpis = get_config_kpi_rows()
    print(f"⏱️ Tổng định mức KPI: {len(kpis)} nhóm quy chuẩn")
    
    # 2. Ghi vào file Excel Template
    wb = openpyxl.load_workbook(TEMPLATE_EXCEL_PATH)
    
    # Header styles
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Segoe UI", size=10)
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )
    fill_row_alt = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    
    # Ghi Products
    ws_prod = wb["Products"]
    # Xóa dữ liệu cũ từ dòng 2
    for r in range(ws_prod.max_row, 1, -1):
        ws_prod.delete_rows(r)
    
    prod_headers = ["id", "sku", "name", "unit", "image", "category", "sub_category", "costPrice", "price", "quantity", "minStock", "maxStock", "realImage", "importUnit", "conversionRate", "model3D"]
    for row_idx, item in enumerate(all_products, start=2):
        for col_idx, col_name in enumerate(prod_headers, start=1):
            cell = ws_prod.cell(row=row_idx, column=col_idx, value=item[col_name])
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 1:
                cell.fill = fill_row_alt
    print(f"✅ Đã cập nhật sheet Products: {len(all_products)} dòng.")
    
    # Ghi BOM_Config
    ws_bom = wb["BOM_Config"]
    for r in range(ws_bom.max_row, 1, -1):
        ws_bom.delete_rows(r)
        
    bom_headers = ["id", "layoutCode", "materialSku", "defaultQty", "unit"]
    for row_idx, item in enumerate(boms, start=2):
        for col_idx, col_name in enumerate(bom_headers, start=1):
            cell = ws_bom.cell(row=row_idx, column=col_idx, value=item[col_name])
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 1:
                cell.fill = fill_row_alt
    print(f"✅ Đã cập nhật sheet BOM_Config: {len(boms)} dòng.")
    
    # Ghi Config_KPI
    ws_kpi = wb["Config_KPI"]
    for r in range(ws_kpi.max_row, 1, -1):
        ws_kpi.delete_rows(r)
        
    kpi_headers = ["id", "Nhóm Hàng", "Từ Khoá", "Tên Hàng", "Thời gian Khâu 1", "Tiền Khâu 1", "Thời gian Khâu 2", "Tiền Khâu 2", "Thời gian Đóng Gói", "Thưởng Đóng Gói", "Thưởng Chở Kho"]
    for row_idx, item in enumerate(kpis, start=2):
        for col_idx, col_name in enumerate(kpi_headers, start=1):
            cell = ws_kpi.cell(row=row_idx, column=col_idx, value=item[col_name])
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 1:
                cell.fill = fill_row_alt
    print(f"✅ Đã cập nhật sheet Config_KPI: {len(kpis)} dòng.")
    
    wb.save(TEMPLATE_EXCEL_PATH)
    print(f"🎉 HOÀN THÀNH LƯU BẢN TÍNH CSDL CHUẨN: {TEMPLATE_EXCEL_PATH}")

if __name__ == "__main__":
    main()
