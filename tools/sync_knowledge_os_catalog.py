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
import hashlib
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

SHORT_NAME_MAP = {
    # PHỤ KIỆN (Chuẩn tên ngắn gọn từ Google Sheet Products)
    "10LUAMINI": "Combo 10 Miếng Lũa Mini",
    "595471_mod595471": "Đèn Led Xima 7w",
    "595471_MOD595471": "Đèn Led Xima 7w",
    "595496_mod595496": "Lọc Váng Sunsun JY-02",
    "595496_MOD595496": "Lọc Váng Sunsun JY-02",
    "AKADAMA": "500g Phân nền Akadama",
    "BONGLOCTRANG": "Bông Lọc Trắng 12x60cm",
    "CAMCA": "Gói Cám Cá 18g",
    "CATTRANG": "500g Cát Trắng",
    "CATVANG": "500g Cát Nắng Vàng",
    "CERAMIC": "500g Gốm Ceramic",
    "CIDEX14": "Dung Dịch Cidex 14 (60ml)",
    "CLEARWATER": "Dung Dịch Clearwater",
    "DACUOI": "1kg Đá Cuội",
    "DADAVOI": "1kg Đá Da Voi",
    "DADEN": "1kg Đá Đen Gia Lai",
    "DAKEPKEM": "1kg Đá Kẹp Kem",
    "DALONGVU": "100g Đá Lông Vũ",
    "DANHAMXANH": "1kg Đá Nham Xanh",
    "DATAIMEO": "1kg Đá Tai Mèo",
    "DAVIA": "1kg Đá Vỉa",
    "DECAN": "Decan Dán Bể Cá",
    "DENCF02": "Đèn CF-02",
    "DENROI7W": "Đèn Rọi Đổi Màu 7w",
    "DENS3PLUS": "Đèn S3 Plus",
    "DENUFO": "Đèn UFO Mini 5w",
    "DENX5": "Đèn Led X5",
    "DENXML": "Đèn Led XML",
    "DIETREUNUPHAR": "Dung Dịch Diệt Rêu Nuphar 100ml",
    "EXTRABIO125ML": "Vi Sinh Extrabio 125ml",
    "FOMEX": "Tấm Fomex 8mm",
    "GACDEN": "Chân Gác Đèn",
    "GIATHEUOMBUCEP": "Giá Thể Ươm Bucep",
    "KEODANREU": "Keo Dán Rêu",
    "KHAYTEP883": "Khay Kính Tép 8x8x3cm",
    "KHUCLO": "Dung Dịch Khử Clo",
    "LABANG": "10 Lá Bàng Khô",
    "LOCTHAC-SOBO303H": "Lọc Thác Sobo 303H",
    "LOCTHAC303H": "Lọc Thác Vipsun AP303H",
    "LOCTHACHF600": "Lọc Thác HF-600",
    "LOCTHUNG603B": "Lọc Thùng HW-603B",
    "LOCTHUNG604B": "Lọc Thùng HW-604B",
    "LOCVANGYJ03": "Lọc Váng Sunsun JY-03",
    "LOCXBL": "Lọc Treo XBL",
    "LUAMINI": "Lũa Mini",
    "MUTIBIO125ML": "Vi Sinh Multibio 125ml",
    "NENSENDA": "Phân Nền Senda (Bao 2kg)",
    "NHAMTHACH": "100g Đá Nham Thạch",
    "NHIETKE": "Nhiệt Kế Thuỷ Sinh",
    "NHONOI": "Lũa Nhọ Nồi",
    "QUATHONG": "Quả Thông Khô",
    "RERUNG": "100g Rễ Rừng",
    "REUBOT": "10g Rêu Giả",
    "REUSOI": "10g Rêu Sợi",
    "REUSOIGAI": "10g Rêu Sợi Gai",
    "SAN": "1kg Sạn Suối",
    "SANFREESIZE": "1kg Sạn suối Freesize",
    "VLLPURIGEN": "Vật Liệu Lọc Purigen 220ml",
    "VOTMINI3CM": "Vợt Nano",
    "VUNNHAM": "1kg Vụn Nham Xanh",
    # DANH MỤC SẢN XUẤT (Chuẩn tên ngắn gọn từ Google Sheet Products)
    "NL-BE-K4LI-12": "Kính 4li (MVT) - 12x180cm",
    "NL-BE-K4LI-15": "Kính 4li (MVT) - 15x180cm",
    "NL-BE-K4LI-20": "Kính 4li (MVT) - 20x180cm",
    "NL-BE-K4LI-25": "Kính 4li (MVT) - 25x180cm",
    "NL-BE-K4LI-DAY-141": "Kính 4li (Đáy) - 14.1x180cm",
    "NL-BE-K4LI-DAY-191": "Kính 4li (Đáy) - 19.1x180cm",
    "NL-BE-K4LI-DAY-91": "Kính 4li (Đáy) - 9.1x180cm",
    "NL-BE-KINH3LI-DAI18": "Kính 3li (Terra) - 60x100cm",
    "NL-BE-KINH4LI-DAI18": "Kính 4li (Cắt đáy) - 60x100cm",
    "NL-BE-VTSX-A300": "Keo Sillicon A300 (Trong)",
    "NL-BE-VTSX-A500-DEN": "Keo Sillicon A500 (Đen)",
    "NL-LAY-SX-502-1CHAI": "Keo 502",
    "NL-LAY-SX-CUOI": "Đá Cuội",
    "NL-LAY-SX-DOQUYEN": "Lũa Đỗ Quyên",
    "NL-LAY-SX-FOMEX-8LI": "Fomex 8li (m²)",
    "NL-LAY-SX-FOMEX10-54": "Fomex 10li (m²)",
    "NL-LAY-SX-RE": "Rễ Rừng",
    "NL-LAY-SX-REU-A04": "Rêu Bột Màu Xanh",
    "NL-LAY-SX-REU-A11": "Rêu Bột Màu Đỏ",
}

LINH_THU_DRIVE_ANGLES = {
    "THU-001": [
        "https://lh3.googleusercontent.com/d/1I9fiirKw9HdjQe8f1N5HiwG75MFcv-v7=w1600",
        "https://lh3.googleusercontent.com/d/15Pphyi4oQwlt1mQm68IQlk2NXhSaYq6W=w1600",
        "https://lh3.googleusercontent.com/d/12f_g9jV3psn-MRdC7tEZU_DIohmNMlRF=w1600",
        "https://lh3.googleusercontent.com/d/1lv2s20dMVBvG8hbuFJwpitD1W19kaUvz=w1600",
        "https://lh3.googleusercontent.com/d/12BWK27qdOWZbw-Zs39c0TBGqx-9kL1SI=w1600",
    ],
    "THU-002": [
        "https://lh3.googleusercontent.com/d/1xg9VTf1Eve4XIm3JauRlse--I7jlVSrj=w1600",
        "https://lh3.googleusercontent.com/d/1kyWP67AHrlqBbfjGC9TnLHTZlqvMTnN_=w1600",
        "https://lh3.googleusercontent.com/d/1we7pmqMIHZiASNJhm0My8vCFaRlH8QKO=w1600",
        "https://lh3.googleusercontent.com/d/19wy7asXjaxmfqCyD9UIRKTg2AViLQvQX=w1600",
        "https://lh3.googleusercontent.com/d/1LGc7uP4h6nKsUMJwNUK7-rkag6eNidDL=w1600",
    ],
    "THU-003": [
        "https://lh3.googleusercontent.com/d/1DmBBpXJx4wDG_Rgjk-OEZ2ApmPHg8Evl=w1600",
        "https://lh3.googleusercontent.com/d/13YsvZ06E4okTS6mMVbjSERKwjAaAGVJv=w1600",
        "https://lh3.googleusercontent.com/d/1QM-LZLfpgdUGVat136qxTFiocbjMVjGW=w1600",
        "https://lh3.googleusercontent.com/d/1vRUX-5uHuXZU_WophbVPo-NASqaJhkwh=w1600",
        "https://lh3.googleusercontent.com/d/1VVdYeFXYWItfNbjpXqxd33aTAHZxeJ0w=w1600",
    ],
    "THU-004": [
        "https://lh3.googleusercontent.com/d/1tg16I81lqnaRCsB4rJH_VfcMcgj0EAoo=w1600",
        "https://lh3.googleusercontent.com/d/1rvc5rfmV0lXc5sXCf626P0gcW0J9iI6j=w1600",
        "https://lh3.googleusercontent.com/d/1crtqJF713q5Zx-Td0aq2lcouCBLrg--z=w1600",
        "https://lh3.googleusercontent.com/d/1hSOgIOmJzNKoPUy3uPHpe2Ks0483q40U=w1600",
        "https://lh3.googleusercontent.com/d/11D6Tl_u3RGQGK23LqM-xpT2589_Ts97W=w1600",
    ],
    "THU-005": [
        "https://lh3.googleusercontent.com/d/1UJMrCnnJzo_VNw9UzZwz6wgwqMBcgixw=w1600",
        "https://lh3.googleusercontent.com/d/139mvT_T9L6qvtagSNe34QcUEALm11CNt=w1600",
        "https://lh3.googleusercontent.com/d/1OB09MGolKHxdalOE6s0RsBOTRDPL9fTR=w1600",
        "https://lh3.googleusercontent.com/d/1RRSRHLoD71yJp1H-zJ-Wjj_CClTk3tPw=w1600",
        "https://lh3.googleusercontent.com/d/14xDpF3SvB9W2yxB0hX2pj6qmzUBb4GlP=w1600",
    ],
    "THU-006": [
        "https://lh3.googleusercontent.com/d/1C_9V3HU4oj-InJ3NDX6Y0f1nkK9hDYGz=w1600",
        "https://lh3.googleusercontent.com/d/1MFiChwe8QZZ_ctAbgwaOaxHM8rkO6G_3=w1600",
        "https://lh3.googleusercontent.com/d/1yZIi5kIAo9wBEwsdUscG9JhboFoAny62=w1600",
        "https://lh3.googleusercontent.com/d/1ZbZhVCxCbjQWlrpqlYsEQdxO2OpDtp1k=w1600",
        "https://lh3.googleusercontent.com/d/1-IBffEj4pDniqej7Ee-P0-eIZxl-UNsa=w1600",
    ],
    "THU-007": [
        "https://lh3.googleusercontent.com/d/18Nf4B1pv3ErSGuatAhC6yIUMrAYdmwoQ=w1600",
        "https://lh3.googleusercontent.com/d/18lDRZpmtbDnj2DBCTLx6HTheQ_U_1bda=w1600",
        "https://lh3.googleusercontent.com/d/1C35k-iV_yp9cVZ_fV7Cj2kDmThgEhplZ=w1600",
        "https://lh3.googleusercontent.com/d/1M5AlhEhN8lRV5y-BCC76Kq0u3pj3UVgB=w1600",
        "https://lh3.googleusercontent.com/d/1bmtgegn76yhZBCKZiZPgLyOodnkw9kfv=w1600",
    ],
    "THU-008": [
        "https://lh3.googleusercontent.com/d/14v_x3n-DFqTWrFPvfhyDwjQk1vVkHwAD=w1600",
        "https://lh3.googleusercontent.com/d/1rZS5B7fGC1M0ATDMDxqCqC96ApDcbGYb=w1600",
        "https://lh3.googleusercontent.com/d/1qqMXpsrGpUci4REtKQ-7A6I4ub3h70ly=w1600",
        "https://lh3.googleusercontent.com/d/1L38j6uRjCjQwE0kCy7q9PmIBcrt3EkO1=w1600",
        "https://lh3.googleusercontent.com/d/1Dk6t6O--hgmlysZ-xF2pV7mpqyxs7e2f=w1600",
    ],
    "THU-009": [
        "https://lh3.googleusercontent.com/d/1k_gkFjnmTgs9R5E5ZnHbiYLf3UKRh5e7=w1600",
        "https://lh3.googleusercontent.com/d/1PCxpNNYIfwA3scD2dkx-hdXU83iscWWM=w1600",
        "https://lh3.googleusercontent.com/d/1hgJt0_RuP3erB6J6AUhoimzfHeRzd3rB=w1600",
        "https://lh3.googleusercontent.com/d/1rN80EJncYQGQfBKAWWSinE0d3m46uIPN=w1600",
        "https://lh3.googleusercontent.com/d/1TZsfsVF30PhADUlHx3TJfYBSGoq-t4vS=w1600",
    ],
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
    gallery_map = {}
    desc_map = {}

    def normalize_img(raw_u):
        s = str(raw_u or "").strip()
        if not s:
            return ""
        if s.startswith("/"):
            return MEDIA_BASE_URL + s
        return s

    if CATALOG_PUBLIC_JSON.exists():
        try:
            data = json.loads(CATALOG_PUBLIC_JSON.read_text(encoding="utf-8"))
            for p in data.get("products", []):
                sku = str(p.get("sku") or "").strip()
                if not sku:
                    continue
                imgs = [u for u in (normalize_img(x) for x in (p.get("images") or [])) if u]
                if imgs:
                    img_map[sku] = imgs[0]
                    gallery_map[sku] = imgs
                wdesc = str(p.get("web_description") or p.get("meta_description") or "").strip()
                if wdesc:
                    desc_map[sku] = wdesc
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
                if not sku:
                    continue
                raw_imgs = list(p.get("images") or [])
                if p.get("image"):
                    raw_imgs.insert(0, p.get("image"))
                clean_imgs = []
                for x in raw_imgs:
                    u = normalize_img(x)
                    if u and ("/images/black-covers/" in u or "/images/five-angle/" in u or "/media-vault/" in u or "/images/catalog/" in u or u.startswith("http")):
                        if u not in clean_imgs:
                            clean_imgs.append(u)
                if clean_imgs:
                    if sku not in img_map:
                        img_map[sku] = clean_imgs[0]
                    existing = gallery_map.setdefault(sku, [])
                    for u in clean_imgs:
                        if u not in existing:
                            existing.append(u)
        except Exception as e:
            print("Warning loading catalog.json:", e)
    return img_map, gallery_map, desc_map


def extract_md_gallery_and_desc(front: dict, body: str, media_vault_dir: Path):
    imgs = []
    for m in re.finditer(r"\[\[(07_MEDIA_BAN_VE/[^\]|#]+)", body or ""):
        rel = m.group(1).strip()
        if rel.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            key = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:12]
            dst = media_vault_dir / f"{key}.webp"
            if dst.exists():
                url = f"{MEDIA_BASE_URL}/media-vault/{key}.webp"
                if url not in imgs:
                    imgs.append(url)

    m_seo = re.search(r"##\s*(?:2\.\s*)?Mô tả chuẩn Web \(SEO\)\s*\n+([\s\S]*?)(?=\n<details>|\n##\s|\Z)", body or "")
    desc = m_seo.group(1).strip() if m_seo else ""
    if not desc:
        desc = str(front.get("meta_description") or "").strip()
    if not desc and body:
        # Clean fallback summary from body (skip details/tables/headings if short)
        clean_lines = []
        in_details = False
        for line in body.splitlines():
            st = line.strip()
            if st.startswith("<details"):
                in_details = True
                continue
            if st.startswith("</details"):
                in_details = False
                continue
            if in_details or st.startswith("#") or st.startswith("|") or st.startswith("![") or st == "---":
                continue
            if st:
                clean_lines.append(st)
            if len("\n".join(clean_lines)) > 800:
                break
        desc = "\n".join(clean_lines).strip()
    return imgs, desc


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


def extract_products(img_map, gallery_map, desc_map, glass_bom_meta, layout_bom_meta):
    products = []
    product_details = {}
    media_vault_dir = WORKSPACE_V2_DIR / "Wedsite RF" / "public" / "media-vault"

    def register_detail(sku, front, body, fallback_img=""):
        md_imgs, md_desc = extract_md_gallery_and_desc(front, body, media_vault_dir)
        merged_imgs = []
        # Ưu tiên tuyệt đối ảnh studio thực tế từ Kho tri thức (media-vault)
        for u in md_imgs + list(gallery_map.get(sku) or []) + ([fallback_img] if fallback_img else []):
            if u and u not in merged_imgs:
                merged_imgs.append(u)
        final_desc = desc_map.get(sku) or md_desc
        dims = ""
        raw_dim = front.get("dimensions") or front.get("dimensions_cm")
        if isinstance(raw_dim, dict):
            l, w, h = raw_dim.get("length_cm"), raw_dim.get("width_cm"), raw_dim.get("height_cm")
            if l and w and h:
                dims = f"{l}x{w}x{h}cm"
        elif raw_dim:
            dims = str(raw_dim).strip()
        product_details[sku] = {
            "images": merged_imgs,
            "description": final_desc,
            "dimensions": dims,
            "status": str(front.get("status") or "").strip(),
        }
        return md_imgs[0] if md_imgs else ""

    # 1. BỂ KÍNH (01_SAN_PHAM/02_BE_KINH)
    for f in sorted((KNOWLEDGE_OS_DIR / "01_SAN_PHAM" / "02_BE_KINH").rglob("*.md")):
        front, body = parse_md(f)
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
        real_os_img = register_detail(sku, front, body, img)
        img = real_os_img or img
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
        front, body = parse_md(f)
        sku = str(front.get("sku") or front.get("id") or f.stem).strip()
        if not sku:
            continue
        raw_title = str(front.get("title") or f"Layout {sku}").strip()
        design_group = str(front.get("design_group") or f.parent.parent.parent.name).strip()
        size = str(front.get("size") or "S").strip()

        # Chuẩn hóa tên Layout: "<Tên Ver> - <Kích thước>" (bỏ chữ Layout và Size S/M/L)
        m_dim = re.search(r"(\d{2,3})\s*[xX×*]\s*(\d{2,3})\s*[xX×*]\s*(\d{2,3})", raw_title)
        dim_str = ""
        if m_dim:
            dim_str = f"{m_dim.group(1)}x{m_dim.group(2)}x{m_dim.group(3)}cm"
        else:
            m_sku_dim = re.search(r"-(\d{2})(\d{2})(\d{2})$", sku.upper())
            if m_sku_dim:
                dim_str = f"{m_sku_dim.group(1)}x{m_sku_dim.group(2)}x{m_sku_dim.group(3)}cm"
            elif sku.upper().endswith("-S") or sku.upper() == "TRA-001":
                dim_str = "20x20x20cm"
            elif sku.upper().endswith("-M"):
                dim_str = "30x20x20cm"
            elif sku.upper().endswith("-L"):
                dim_str = "40x23x25cm"

        base_l = re.sub(r"^Layout\s+", "", raw_title, flags=re.IGNORECASE)
        base_l = re.sub(r"\s*[—–\-]\s*(?:Size\s*)?[SML]\s*(?:\([^\)]*\))?$", "", base_l, flags=re.IGNORECASE)
        base_l = re.sub(r"\s*[—–\-]\s*\d{2,3}\s*[xX×*]\s*\d{2,3}\s*[xX×*]\s*\d{2,3}\s*(?:cm)?$", "", base_l, flags=re.IGNORECASE)
        base_l = re.sub(r"\s*\([A-Z0-9\-]+\)$", "", base_l)
        base_l = re.sub(r"\bver\.?\s*(\d+)", r"Ver.\1", base_l, flags=re.IGNORECASE).strip()
        title = f"{base_l} - {dim_str}" if dim_str else base_l

        bom_info = layout_bom_meta.get(sku, {})
        mat_cost = int(bom_info.get("material_cost_vnd") or front.get("material_cost_vnd") or 45000)
        labor_and_pack = calc_layout_labor(design_group, size)
        cost = mat_cost + labor_and_pack
        price = int(front.get("listed_price_vnd") or front.get("price_shopee_vnd") or 0)
        if price <= 0:
            dg_up = design_group.upper()
            if "BONSAI" in dg_up or "HANG ĐỘNG" in dg_up or "HẺM NÚI" in dg_up or "RỪNG" in dg_up:
                price = 685000 if dim_str == "20x20x20cm" else (945000 if dim_str == "30x20x20cm" else 1250000)
            else:
                price = 545000 if dim_str == "20x20x20cm" else (785000 if dim_str == "30x20x20cm" else 1050000)

        parent_prefix = sku.upper()[:7]
        if parent_prefix in LINH_THU_DRIVE_ANGLES:
            drive_imgs = LINH_THU_DRIVE_ANGLES[parent_prefix]
            img_map[sku] = drive_imgs[0]
            gallery_map[sku] = list(drive_imgs)

        img = img_map.get(sku, "")
        real_os_img = register_detail(sku, front, body, img)
        img = real_os_img or img
        min_s = 1 if dim_str == "30x20x20cm" else 0
        max_s = 1 if dim_str == "30x20x20cm" else 0
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
            "minStock": min_s,
            "maxStock": max_s,
            "realImage": img,
            "importUnit": "Bộ",
            "conversionRate": 1,
            "model3D": "",
        })

    # 3. PHỤ KIỆN (01_SAN_PHAM/03_PHU_KIEN)
    for f in sorted((KNOWLEDGE_OS_DIR / "01_SAN_PHAM" / "03_PHU_KIEN").rglob("*.md")):
        front, body = parse_md(f)
        sku = str(front.get("sku") or front.get("id") or f.stem).strip()
        if not sku:
            continue
        raw_title = str(front.get("title") or sku).strip()
        title = SHORT_NAME_MAP.get(sku) or SHORT_NAME_MAP.get(sku.upper()) or raw_title
        raw_sub = str(front.get("sub_category") or f.parent.name).strip()
        sub_cat = SUB_CAT_MAP_ACC.get(raw_sub, raw_sub)
        price = int(front.get("price_shopee_vnd") or front.get("listed_price_vnd") or 0)
        cost = int(front.get("cost_vnd") or front.get("purchase_price_vnd") or round(price * 0.45))
        img = img_map.get(sku, "")
        real_os_img = register_detail(sku, front, body, img)
        img = real_os_img or img
        if not product_details[sku].get("description") and raw_title != title:
            product_details[sku]["description"] = raw_title
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
        front, body = parse_md(f)
        sku = str(front.get("sku") or f.stem).strip()
        if not sku:
            continue
        raw_title = str(front.get("title") or sku).strip()
        title = SHORT_NAME_MAP.get(sku) or SHORT_NAME_MAP.get(sku.upper()) or raw_title
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
        register_detail(sku, front, body, "")
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

    return products, product_details


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
    img_map, gallery_map, desc_map = load_image_map()
    glass_bom_meta, layout_bom_meta, bom_rows = extract_boms()
    products, product_details = extract_products(img_map, gallery_map, desc_map, glass_bom_meta, layout_bom_meta)
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
        "ProductDetails": product_details,
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
