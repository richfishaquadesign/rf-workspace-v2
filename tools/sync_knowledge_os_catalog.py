#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
RF_WORKSPACE_V2 — KNOWLEDGE OS FULL DATABASE SYNCHRONIZER
Đồng bộ hóa 100% dữ liệu chuẩn từ Kho Tri Thức (C:\Users\ADMIN\Desktop\RF_KNOWLEDGE_OS)
vào RF Workspace V2 (Products, BOM_Config, Config_KPI, Suppliers, Documents, Trainings, Config_NhanSu).
"""

import os
import re
import json
import yaml
from pathlib import Path

KNOWLEDGE_OS_DIR = Path(r"C:\Users\ADMIN\Desktop\RF_KNOWLEDGE_OS")
WORKSPACE_V2_DIR = Path(r"C:\Users\ADMIN\RF_Workspace_V2")
CATALOG_PUBLIC_JSON = WORKSPACE_V2_DIR / "Wedsite RF" / "public" / "data" / "catalog_public.json"
SEED_JS_OUT = WORKSPACE_V2_DIR / "js" / "KnowledgeOsSeed.js"
MEDIA_BASE_URL = "https://rf-aquarium.vercel.app"

SUB_CAT_MAP_GLASS = {
    "01_BE_MINI": "BỂ MINI",
    "02_BE_NANG_DAY": "BỂ NÂNG ĐÁY",
    "03_BE_BETTA": "BỂ BETTA",
    "04_BAN_CAN": "BÁN CẠN",
    "05_TERRARIUM": "TERRARIUM",
    "06_BE_SHOW_DAT": "BỂ SHOW ĐẤT",
}

SUB_CAT_MAP_ACC = {
    "01_DEN_LED": "ĐÈN LED",
    "02_LOC_BOM": "LỌC & BƠM",
    "03_XU_LY_NUOC_VI_SINH": "XỬ LÝ NƯỚC & VI SINH",
    "04_CAT_SAN_PHAN_NEN": "CÁT SẠN & PHÂN NỀN",
    "05_DA_GO_LUA_REU": "ĐÁ LŨA & RÊU",
    "06_PHU_KIEN_KHAC": "PHỤ KIỆN KHÁC",
}


def parse_md(file_path: Path):
    raw = file_path.read_text(encoding="utf-8", errors="replace").lstrip("\ufeff")
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    try:
        front = yaml.safe_load(parts[1]) or {}
    except Exception:
        front = {}
    return front, parts[2].strip()


def load_image_map():
    img_map = {}
    if CATALOG_PUBLIC_JSON.exists():
        try:
            data = json.loads(CATALOG_PUBLIC_JSON.read_text(encoding="utf-8"))
            for p in data.get("products", []):
                sku = str(p.get("sku") or "").strip()
                imgs = p.get("images") or []
                if sku and imgs:
                    first = str(imgs[0]).strip()
                    if "shopee" in first.lower() or "/images/catalog/" in first:
                        continue
                    if first.startswith("/"):
                        first = MEDIA_BASE_URL + first
                    img_map[sku] = first
        except Exception as e:
            print("Warning loading catalog_public.json:", e)

    # Bo sung anh StudioDark sach tu catalog.json (loai bo hoan toan /images/catalog/ nen trang va cf.shopee.vn)
    wcat_path = WORKSPACE_V2_DIR / "Wedsite RF" / "public" / "catalog.json"
    if wcat_path.exists():
        try:
            wcat = json.loads(wcat_path.read_text(encoding="utf-8"))
            items = wcat if isinstance(wcat, list) else (wcat.get("products") or wcat.get("items") or [])
            for p in items:
                if not isinstance(p, dict):
                    continue
                sku = str(p.get("sku") or "").strip()
                im = str(p.get("image") or (p.get("images") or [""])[0] or "").strip()
                if not sku or not im or sku in img_map:
                    continue
                if "shopee" in im.lower() or "/images/catalog/" in im:
                    continue
                if im.startswith("/images/black-covers/") or im.startswith("/images/five-angle/") or im.startswith("/media-vault/"):
                    img_map[sku] = MEDIA_BASE_URL + im
        except Exception as e:
            print("Warning loading catalog.json:", e)
    return img_map


def extract_boms():
    glass_bom_meta = {}
    layout_bom_meta = {}
    bom_rows = []
    idx = 1

    # 1. BOM Bể Kính
    for f in sorted((KNOWLEDGE_OS_DIR / "02_SAN_XUAT" / "03_BOM_DINH_MUC" / "Be_Kinh").rglob("*.md")):
        front, body = parse_md(f)
        sku = str(front.get("sku") or f.stem.replace("BOM-BE-", "")).strip()
        if not sku:
            continue
        glass_bom_meta[sku] = {
            "cost_vnd": int(front.get("cost_vnd") or 0),
            "price_vnd": int(front.get("price_vnd") or 0),
        }
        glass_mat = str(front.get("glass_material") or "NL-BE-KINH4LI-DAI18").strip()
        seal_mat = str(front.get("sealant_material") or "NL-BE-VTSX-A300").strip()

        # Parse area & polish from markdown
        m_area = re.search(r"([0-9]+\.[0-9]+)\s*m²", body)
        area_val = float(m_area.group(1)) if m_area else 0.18
        bom_rows.append({
            "id": f"BOM_{idx:05d}",
            "layoutCode": sku,
            "materialSku": glass_mat,
            "defaultQty": area_val,
            "unit": "m²",
        })
        idx += 1

        bom_rows.append({
            "id": f"BOM_{idx:05d}",
            "layoutCode": sku,
            "materialSku": seal_mat,
            "defaultQty": 0.2,
            "unit": "Chai",
        })
        idx += 1

    # 2. BOM Layout
    for f in sorted((KNOWLEDGE_OS_DIR / "02_SAN_XUAT" / "03_BOM_DINH_MUC" / "Layout").rglob("*.md")):
        front, body = parse_md(f)
        audit_sku = str(front.get("sku_audit_sku") or "").strip()
        layout_code = str(front.get("layout_code") or f.stem).strip()
        target_sku = audit_sku or layout_code.replace("LAY-", "")
        mat_cost = int(round(float(front.get("material_cost_vnd") or front.get("known_material_subtotal_vnd") or 0)))
        layout_bom_meta[target_sku] = {"material_cost_vnd": mat_cost, "layout_code": layout_code}
        layout_bom_meta[layout_code] = {"material_cost_vnd": mat_cost, "layout_code": layout_code}

        in_first_table = False
        for line in body.splitlines():
            if "| SKU vật tư" in line and "Định mức nguồn" in line:
                in_first_table = True
                continue
            if in_first_table:
                if not line.strip() or not line.startswith("|"):
                    in_first_table = False
                    continue
                if "---" in line:
                    continue
                cols = [c.strip() for c in line.split("|")[1:-1]]
                if len(cols) >= 3:
                    mat_sku = cols[0].replace("[[", "").replace("]]", "").replace("`", "").strip()
                    if mat_sku.upper() == "NL-LAY-SX-NHỌ NỒI":
                        mat_sku = "NL-LAY-SX-NHONOI"
                    try:
                        qty = float(cols[1].replace(",", "").strip())
                    except Exception:
                        qty = 1.0
                    unit = cols[2].strip()
                    bom_rows.append({
                        "id": f"BOM_{idx:05d}",
                        "layoutCode": target_sku,
                        "materialSku": mat_sku,
                        "defaultQty": qty,
                        "unit": unit,
                    })
                    idx += 1

    return glass_bom_meta, layout_bom_meta, bom_rows


def calc_layout_labor(design_group: str, size: str):
    dg_upper = str(design_group or "").upper()
    s = str(size or "S").upper()
    if any(k in dg_upper for k in ["CUỘI", "ĐẢO", "VÁCH"]):
        k1, k2, dg = (12000, 13000, 5000) if s == "S" else ((16000, 17000, 6000) if s == "M" else (22000, 23000, 8000))
    elif any(k in dg_upper for k in ["CẦU VỒNG", "CỔNG VÒM", "NATURE", "NHẤT TRỤ", "THIÊN TƯỢNG"]):
        k1, k2, dg = (18000, 17000, 5000) if s == "S" else ((25000, 25000, 6000) if s == "M" else (35000, 35000, 8000))
    elif any(k in dg_upper for k in ["HANG ĐỘNG", "HẺM NÚI", "RỪNG"]):
        k1, k2, dg = (25000, 25000, 5000) if s == "S" else ((38000, 37000, 6000) if s == "M" else (50000, 50000, 8000))
    elif "BONSAI" in dg_upper:
        k1, k2, dg = (32000, 33000, 5000) if s == "S" else ((48000, 47000, 6000) if s == "M" else (65000, 65000, 8000))
    elif "LINH THÚ" in dg_upper:
        k1, k2, dg = 120000, 110000, 12000
    else:
        k1, k2, dg = 25000, 25000, 6000
    return k1 + k2 + dg + 15000  # +15k bao bì thùng hộp


def extract_products(img_map, glass_bom_meta, layout_bom_meta):
    products = []

    # 1. BỂ KÍNH (01_SAN_PHAM/02_BE_KINH)
    for f in sorted((KNOWLEDGE_OS_DIR / "01_SAN_PHAM" / "02_BE_KINH").rglob("*.md")):
        front, _ = parse_md(f)
        sku = str(front.get("sku") or f.stem).strip()
        if not sku:
            continue
        title = str(front.get("title") or f"Bể kính {sku}").strip()
        raw_sub = str(front.get("sub_category") or f.parent.name).strip()
        sub_cat = SUB_CAT_MAP_GLASS.get(raw_sub, raw_sub)
        bom_info = glass_bom_meta.get(sku, {})
        price = int(front.get("price_shopee_vnd") or bom_info.get("price_vnd") or 0)
        cost = int(bom_info.get("cost_vnd") or front.get("cost_vnd") or round(price * 0.42))
        img = img_map.get(sku, "")
        products.append({
            "id": f"BE_{sku}",
            "sku": sku,
            "name": title,
            "unit": "Bể",
            "image": img,
            "category": "BỂ KÍNH",
            "sub_category": sub_cat,
            "costPrice": cost,
            "price": price,
            "quantity": 10,
            "minStock": 2,
            "maxStock": 30,
            "realImage": img,
            "importUnit": "Bể",
            "conversionRate": 1,
            "model3D": "",
        })

    # 2. LAYOUT (01_SAN_PHAM/01_LAYOUT)
    for f in sorted((KNOWLEDGE_OS_DIR / "01_SAN_PHAM" / "01_LAYOUT").rglob("*.md")):
        front, _ = parse_md(f)
        sku = str(front.get("sku") or front.get("id") or f.stem).strip()
        if not sku:
            continue
        title = str(front.get("title") or f"Layout {sku}").strip()
        design_group = str(front.get("design_group") or f.parent.parent.parent.name).strip()
        size = str(front.get("size") or "S").strip()
        bom_info = layout_bom_meta.get(sku, {})
        mat_cost = int(bom_info.get("material_cost_vnd") or front.get("material_cost_vnd") or 45000)
        labor_and_pack = calc_layout_labor(design_group, size)
        cost = mat_cost + labor_and_pack
        price = int(front.get("listed_price_vnd") or front.get("price_shopee_vnd") or round(cost * 2.4))
        img = img_map.get(sku, "")
        products.append({
            "id": f"LAY_{sku}",
            "sku": sku,
            "name": title,
            "unit": "Bộ",
            "image": img,
            "category": "LAYOUT",
            "sub_category": design_group,
            "costPrice": cost,
            "price": price,
            "quantity": 5,
            "minStock": 2,
            "maxStock": 20,
            "realImage": img,
            "importUnit": "Bộ",
            "conversionRate": 1,
            "model3D": "",
        })

    # 3. PHỤ KIỆN (01_SAN_PHAM/03_PHU_KIEN)
    for f in sorted((KNOWLEDGE_OS_DIR / "01_SAN_PHAM" / "03_PHU_KIEN").rglob("*.md")):
        front, _ = parse_md(f)
        sku = str(front.get("sku") or front.get("id") or f.stem).strip()
        if not sku:
            continue
        title = str(front.get("title") or sku).strip()
        raw_sub = str(front.get("sub_category") or f.parent.name).strip()
        sub_cat = SUB_CAT_MAP_ACC.get(raw_sub, raw_sub)
        price = int(front.get("price_shopee_vnd") or front.get("listed_price_vnd") or 0)
        cost = int(front.get("cost_vnd") or front.get("purchase_price_vnd") or round(price * 0.45))
        img = img_map.get(sku, "")
        products.append({
            "id": f"PK_{sku}",
            "sku": sku,
            "name": title,
            "unit": "Cái",
            "image": img,
            "category": "PHỤ KIỆN",
            "sub_category": sub_cat,
            "costPrice": cost,
            "price": price,
            "quantity": 25,
            "minStock": 5,
            "maxStock": 100,
            "realImage": img,
            "importUnit": "Hộp",
            "conversionRate": 1,
            "model3D": "",
        })

    # 4. DANH MỤC SẢN XUẤT (03_KHO_VAT_TU/Danh_Muc_Vat_Tu)
    for f in sorted((KNOWLEDGE_OS_DIR / "03_KHO_VAT_TU" / "Danh_Muc_Vat_Tu").rglob("*.md")):
        front, _ = parse_md(f)
        sku = str(front.get("sku") or f.stem).strip()
        if not sku:
            continue
        title = str(front.get("title") or sku).strip()
        sub_cat = str(front.get("sub_category") or "VẬT TƯ NGUYÊN LIỆU").strip()
        unit = str(front.get("stock_unit") or front.get("production_unit") or "Kg").strip()
        import_unit = str(front.get("purchase_unit") or unit).strip()
        conv_rate = float(front.get("conversion_rate") or 1)
        cost = int(round(float(
            front.get("purchase_price_vnd")
            or front.get("unit_price_m2_vnd")
            or front.get("production_unit_price_vnd")
            or 0
        )))
        products.append({
            "id": f"VT_{sku}",
            "sku": sku,
            "name": title,
            "unit": unit,
            "image": "",
            "category": "DANH MỤC SẢN XUẤT",
            "sub_category": sub_cat,
            "costPrice": cost,
            "price": 0,
            "quantity": 120,
            "minStock": 15,
            "maxStock": 500,
            "realImage": "",
            "importUnit": import_unit,
            "conversionRate": conv_rate,
            "model3D": "",
        })

    return products


def extract_documents_and_trainings():
    docs = []
    trainings = []
    doc_idx = 1
    tr_idx = 1

    doc_folders = [
        (KNOWLEDGE_OS_DIR / "02_SAN_XUAT" / "01_QUY_TRINH_SOP", "QUY TRÌNH SOP SẢN XUẤT"),
        (KNOWLEDGE_OS_DIR / "02_SAN_XUAT" / "02_TIEU_CHUAN_QC", "TIÊU CHUẨN KCS & NGHIỆM THU"),
        (KNOWLEDGE_OS_DIR / "02_SAN_XUAT" / "04_DONG_GOI", "QUY CHUẨN ĐÓNG GÓI & BAO BÌ"),
        (KNOWLEDGE_OS_DIR / "04_GIA_THANH_GIA_BAN", "ĐỊNH MỨC GIÁ VỐN & CÔNG KHOÁN"),
        (KNOWLEDGE_OS_DIR / "05_BAN_HANG_CSKH", "CHÍNH SÁCH BÁN HÀNG & CSKH"),
    ]
    for folder, cat_label in doc_folders:
        if not folder.exists():
            continue
        for f in sorted(folder.rglob("*.md")):
            front, body = parse_md(f)
            title = str(front.get("title") or f.stem.replace("_", " ")).strip()
            docs.append({
                "id": f"DOC_{doc_idx:03d}",
                "category": cat_label,
                "title": title,
                "description": body[:2000],
                "link": f.relative_to(KNOWLEDGE_OS_DIR).as_posix(),
                "createdAt": "2026-11-15",
                "createdBy": "Nguyễn Ngọc Tiến",
                "attachments": "",
                "testLink": "",
                "readBy": "[]",
            })
            doc_idx += 1

    tr_folder = KNOWLEDGE_OS_DIR / "06_VAN_HANH_DAO_TAO"
    if tr_folder.exists():
        for f in sorted(tr_folder.rglob("*.md")):
            front, body = parse_md(f)
            title = str(front.get("title") or f.stem.replace("_", " ")).strip()
            trainings.append({
                "id": f"TRN_{tr_idx:03d}",
                "title": title,
                "content": body[:4000],
                "targetRole": "ALL",
                "createdAt": "2026-11-15",
                "createdBy": "Nguyễn Ngọc Tiến",
                "readUsers": "[]",
            })
            tr_idx += 1

    return docs, trainings


def get_suppliers():
    return [
        {"id": "SUP_001", "name": "NCC Kính Chuẩn Hà Nội", "phone": "0988123456", "totalDebt": 0, "category": "Kính phôi", "note": "Kính trắng 4li cắt dải 1,8m (Dải 12, 15, 20, 25; Đáy hụt 19.1, 14.1, 9.1) — 175.000đ/m²"},
        {"id": "SUP_002", "name": "Tổng Kho Lũa Miền Trung", "phone": "0977234567", "totalDebt": 0, "category": "Lũa cốt", "note": "San Miếng (40k/kg), San Cành (45k/kg), Rễ Rừng (35k/kg)"},
        {"id": "SUP_003", "name": "Mỏ Đá Cảnh Thủy Sinh", "phone": "0966345678", "totalDebt": 0, "category": "Đá cốt", "note": "Đá Cuội (8k/kg), Tai Mèo (12k/kg), Nham Xanh (10k/kg), Vỉa (15k/kg)"},
        {"id": "SUP_004", "name": "Đại lý Keo Thuận Phát", "phone": "0955456789", "totalDebt": 0, "category": "Chất kết dính", "note": "Keo 502 con voi 162g (28.000đ/chai), Silicon Apollo A300 (45.000đ/chai)"},
        {"id": "SUP_005", "name": "Cơ sở Sản xuất Rêu Nghệ Thuật", "phone": "0944567890", "totalDebt": 0, "category": "Decor hoàn thiện", "note": "Rêu sản xuất chuyên dụng — 450.000đ/kg (450đ/g)"},
        {"id": "SUP_006", "name": "Xưởng Thùng Carton & Xốp", "phone": "0933678901", "totalDebt": 0, "category": "Phụ trợ & Bao bì", "note": "Thùng carton 5 lớp sóng đôi, xốp tấm định hình 5cm, Fomex 8-10li"},
    ]


def get_config_kpi():
    return [
        {"id": "CKPI_001", "Nhóm Hàng": "Layout Siêu nhanh (S)", "Từ Khoá": "Cuội Biotop, Đảo Bay, Vách (20x20x20)", "Tên Hàng": "Layout Siêu nhanh Size S (20x20x20)", "Thời gian Khâu 1": 15, "Tiền Khâu 1": 12000, "Thời gian Khâu 2": 15, "Tiền Khâu 2": 13000, "Thời gian Đóng Gói": 10, "Thưởng Đóng Gói": 5000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_002", "Nhóm Hàng": "Layout Siêu nhanh (M)", "Từ Khoá": "Cuội Biotop, Đảo Bay, Vách (30x20x20)", "Tên Hàng": "Layout Siêu nhanh Size M (30x20x20)", "Thời gian Khâu 1": 20, "Tiền Khâu 1": 16000, "Thời gian Khâu 2": 20, "Tiền Khâu 2": 17000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_003", "Nhóm Hàng": "Layout Siêu nhanh (L)", "Từ Khoá": "Cuội Biotop, Đảo Bay, Vách (40x23x25)", "Tên Hàng": "Layout Siêu nhanh Size L (40x23x25)", "Thời gian Khâu 1": 30, "Tiền Khâu 1": 22000, "Thời gian Khâu 2": 25, "Tiền Khâu 2": 23000, "Thời gian Đóng Gói": 15, "Thưởng Đóng Gói": 8000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_004", "Nhóm Hàng": "Layout Nhanh (S)", "Từ Khoá": "Cầu Vồng, Cổng Vòm, Nature, Nhất Trụ (20x20x20)", "Tên Hàng": "Layout Nhanh Size S (20x20x20)", "Thời gian Khâu 1": 25, "Tiền Khâu 1": 18000, "Thời gian Khâu 2": 20, "Tiền Khâu 2": 17000, "Thời gian Đóng Gói": 10, "Thưởng Đóng Gói": 5000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_005", "Nhóm Hàng": "Layout Nhanh (M)", "Từ Khoá": "Cầu Vồng, Cổng Vòm, Nature, Nhất Trụ (30x20x20)", "Tên Hàng": "Layout Nhanh Size M (30x20x20)", "Thời gian Khâu 1": 35, "Tiền Khâu 1": 25000, "Thời gian Khâu 2": 30, "Tiền Khâu 2": 25000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_006", "Nhóm Hàng": "Layout Nhanh (L)", "Từ Khoá": "Cầu Vồng, Cổng Vòm, Nature, Nhất Trụ (40x23x25)", "Tên Hàng": "Layout Nhanh Size L (40x23x25)", "Thời gian Khâu 1": 45, "Tiền Khâu 1": 35000, "Thời gian Khâu 2": 40, "Tiền Khâu 2": 35000, "Thời gian Đóng Gói": 15, "Thưởng Đóng Gói": 8000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_007", "Nhóm Hàng": "Layout Bình thường (S)", "Từ Khoá": "Hang Động, Hẻm Núi, Rừng (20x20x20)", "Tên Hàng": "Layout Bình thường Size S (20x20x20)", "Thời gian Khâu 1": 35, "Tiền Khâu 1": 25000, "Thời gian Khâu 2": 30, "Tiền Khâu 2": 25000, "Thời gian Đóng Gói": 10, "Thưởng Đóng Gói": 5000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_008", "Nhóm Hàng": "Layout Bình thường (M)", "Từ Khoá": "Hang Động, Hẻm Núi, Rừng (30x20x20)", "Tên Hàng": "Layout Bình thường Size M (30x20x20)", "Thời gian Khâu 1": 50, "Tiền Khâu 1": 38000, "Thời gian Khâu 2": 45, "Tiền Khâu 2": 37000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_009", "Nhóm Hàng": "Layout Bình thường (L)", "Từ Khoá": "Hang Động, Hẻm Núi, Rừng (40x23x25)", "Tên Hàng": "Layout Bình thường Size L (40x23x25)", "Thời gian Khâu 1": 70, "Tiền Khâu 1": 50000, "Thời gian Khâu 2": 60, "Tiền Khâu 2": 50000, "Thời gian Đóng Gói": 15, "Thưởng Đóng Gói": 8000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_010", "Nhóm Hàng": "Layout Bonsai (S)", "Từ Khoá": "Bonsai (20x20x20)", "Tên Hàng": "Layout Bonsai Size S (20x20x20)", "Thời gian Khâu 1": 45, "Tiền Khâu 1": 32000, "Thời gian Khâu 2": 40, "Tiền Khâu 2": 33000, "Thời gian Đóng Gói": 10, "Thưởng Đóng Gói": 5000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_011", "Nhóm Hàng": "Layout Bonsai (M)", "Từ Khoá": "Bonsai (30x20x20)", "Tên Hàng": "Layout Bonsai Size M (30x20x20)", "Thời gian Khâu 1": 65, "Tiền Khâu 1": 48000, "Thời gian Khâu 2": 60, "Tiền Khâu 2": 47000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_012", "Nhóm Hàng": "Layout Bonsai (L)", "Từ Khoá": "Bonsai (40x23x25)", "Tên Hàng": "Layout Bonsai Size L (40x23x25)", "Thời gian Khâu 1": 90, "Tiền Khâu 1": 65000, "Thời gian Khâu 2": 80, "Tiền Khâu 2": 65000, "Thời gian Đóng Gói": 15, "Thưởng Đóng Gói": 8000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_013", "Nhóm Hàng": "Layout Siêu Lâu", "Từ Khoá": "Linh Thú, Cá Voi, Khủng Long, Phượng Hoàng, Rồng, Đại Bàng", "Tên Hàng": "Layout Linh Thú Cao Cấp", "Thời gian Khâu 1": 150, "Tiền Khâu 1": 120000, "Thời gian Khâu 2": 135, "Tiền Khâu 2": 110000, "Thời gian Đóng Gói": 20, "Thưởng Đóng Gói": 12000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_014", "Nhóm Hàng": "Bể Kính Mini", "Từ Khoá": "01_BE_MINI", "Tên Hàng": "Bể Kính Mini (10x10x10 - 40x23x25)", "Thời gian Khâu 1": 15, "Tiền Khâu 1": 14000, "Thời gian Khâu 2": 20, "Tiền Khâu 2": 16000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_015", "Nhóm Hàng": "Bể Nâng Đáy", "Từ Khoá": "02_BE_NANG_DAY", "Tên Hàng": "Bể Nâng Đáy (20x20x20 NĐ - 30x18x12 NĐ)", "Thời gian Khâu 1": 18, "Tiền Khâu 1": 16000, "Thời gian Khâu 2": 22, "Tiền Khâu 2": 19000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_016", "Nhóm Hàng": "Bể Betta Ngăn", "Từ Khoá": "03_BE_BETTA", "Tên Hàng": "Bể Cá Betta 2 - 3 ngăn", "Thời gian Khâu 1": 22, "Tiền Khâu 1": 22000, "Thời gian Khâu 2": 30, "Tiền Khâu 2": 28000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_017", "Nhóm Hàng": "Bán Cạn", "Từ Khoá": "04_BAN_CAN", "Tên Hàng": "Bể Bán Cạn Giật Cấp", "Thời gian Khâu 1": 22, "Tiền Khâu 1": 20000, "Thời gian Khâu 2": 30, "Tiền Khâu 2": 25000, "Thời gian Đóng Gói": 15, "Thưởng Đóng Gói": 7000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_018", "Nhóm Hàng": "Terrarium", "Từ Khoá": "05_TERRARIUM", "Tên Hàng": "Bể Thủy Sinh Terrarium", "Thời gian Khâu 1": 20, "Tiền Khâu 1": 18000, "Thời gian Khâu 2": 25, "Tiền Khâu 2": 22000, "Thời gian Đóng Gói": 12, "Thưởng Đóng Gói": 6000, "Thưởng Chở Kho": 3000},
        {"id": "CKPI_019", "Nhóm Hàng": "Bể Show Đất", "Từ Khoá": "06_BE_SHOW_DAT", "Tên Hàng": "Bể Show Đất & Bể Kích Thước Lớn", "Thời gian Khâu 1": 60, "Tiền Khâu 1": 50000, "Thời gian Khâu 2": 90, "Tiền Khâu 2": 70000, "Thời gian Đóng Gói": 30, "Thưởng Đóng Gói": 15000, "Thưởng Chở Kho": 3000},
    ]


def get_config_nhan_su():
    return [
        {"id": "NV_001", "Tên Nhân Sự": "Nguyễn Ngọc Tiến", "ID Ảnh": "", "Chức Danh": "Founder", "Chức Danh Phụ": "Giám Đốc Điều Hành", "Phân Quyền": "TỐI CAO", "Mã PIN": "226868", "Lương Cơ Bản": 0, "Lương Chức Vụ": 0, "Phụ Cấp Xăng Xe": 0, "Khoản Trừ Vi Phạm": 0, "Gmail": "richfishaquarium@gmail.com", "Số Điện Thoại": "0877445526", "Địa Chỉ": "Hà Nội", "Ngày Sinh": "", "Số CCCD": "", "Trạng Thái": "Đang làm việc"},
        {"id": "NV_002", "Tên Nhân Sự": "Nguyễn Thị Diệu Hương", "ID Ảnh": "", "Chức Danh": "Quản Lý Bán Hàng", "Chức Danh Phụ": "Đóng Gói & Vận Đơn", "Phân Quyền": "QUẢN LÝ BÁN HÀNG", "Mã PIN": "246357", "Lương Cơ Bản": 7000000, "Lương Chức Vụ": 1500000, "Phụ Cấp Xăng Xe": 500000, "Khoản Trừ Vi Phạm": 0, "Gmail": "", "Số Điện Thoại": "", "Địa Chỉ": "Hà Nội", "Ngày Sinh": "", "Số CCCD": "", "Trạng Thái": "Đang làm việc"},
        {"id": "NV_003", "Tên Nhân Sự": "Dương", "ID Ảnh": "", "Chức Danh": "Thợ Chính Bể Kính", "Chức Danh Phụ": "Cắt Mài & Dán Bể", "Phân Quyền": "THỢ", "Mã PIN": "111111", "Lương Cơ Bản": 6000000, "Lương Chức Vụ": 1000000, "Phụ Cấp Xăng Xe": 500000, "Khoản Trừ Vi Phạm": 0, "Gmail": "", "Số Điện Thoại": "", "Địa Chỉ": "Hà Nội", "Ngày Sinh": "", "Số CCCD": "", "Trạng Thái": "Đang làm việc"},
        {"id": "NV_004", "Tên Nhân Sự": "Tâm", "ID Ảnh": "", "Chức Danh": "Thợ Chính Layout", "Chức Danh Phụ": "Chế Tác Layout & Rêu", "Phân Quyền": "THỢ", "Mã PIN": "222222", "Lương Cơ Bản": 6000000, "Lương Chức Vụ": 1000000, "Phụ Cấp Xăng Xe": 500000, "Khoản Trừ Vi Phạm": 0, "Gmail": "", "Số Điện Thoại": "", "Địa Chỉ": "Hà Nội", "Ngày Sinh": "", "Số CCCD": "", "Trạng Thái": "Đang làm việc"},
    ]


def main():
    print("🚀 Đang trích xuất 100% CSDL chuẩn từ Kho Tri Thức (RF_KNOWLEDGE_OS)...")
    img_map = load_image_map()
    glass_bom_meta, layout_bom_meta, bom_rows = extract_boms()
    products = extract_products(img_map, glass_bom_meta, layout_bom_meta)
    docs, trainings = extract_documents_and_trainings()
    suppliers = get_suppliers()
    kpis = get_config_kpi()
    staff = get_config_nhan_su()

    cat_counts = {}
    for p in products:
        c = p["category"]
        cat_counts[c] = cat_counts.get(c, 0) + 1

    print(f"✅ Tổng SKU Hàng Hóa & Vật Tư: {len(products)} mã -> {cat_counts}")
    print(f"✅ Tổng dòng định mức BOM_Config: {len(bom_rows)} dòng")
    print(f"✅ Tổng định mức Config_KPI: {len(kpis)} nhóm")
    print(f"✅ Tổng Nhà cung cấp (Suppliers): {len(suppliers)} NCC")
    print(f"✅ Tổng Tài liệu SOP & Đào tạo: {len(docs)} SOP + {len(trainings)} bài đào tạo")

    seed_payload = {
        "Products": products,
        "BOM_Config": bom_rows,
        "Config_KPI": kpis,
        "Suppliers": suppliers,
        "Documents": docs,
        "Trainings": trainings,
        "Config_NhanSu": staff,
    }

    js_content = (
        "// AUTO-GENERATED FROM RF_KNOWLEDGE_OS — DO NOT EDIT MANUALLY\n"
        "window.__RF_KNOWLEDGE_OS_SEED__ = "
        + json.dumps(seed_payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    SEED_JS_OUT.write_text(js_content, encoding="utf-8")
    print(f"🎉 Đã xuất file seed chuẩn: {SEED_JS_OUT} ({len(js_content)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
