-- =============================================================================
-- RF WORKSPACE V2 - WAREHOUSE, PRODUCTION BOM, LAYOUT M & STOCK GUARD RPCS
-- Thay thế logic tự động từ GAS (Code.js & LayoutStockPolicy.js) bằng
-- PostgreSQL SECURITY DEFINER RPC + Trigger chống sửa tay tồn kho.
-- =============================================================================

-- 1. Helper chuẩn hóa chuỗi tiếng Việt để so khớp tên sản phẩm / danh mục
CREATE OR REPLACE FUNCTION public.rf_layout_key(p_val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          COALESCE(p_val, ''),
          'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- 2. Helper parse chuỗi accessories/itemsData (hỗ trợ double-encoded JSON hoặc CSV)
CREATE OR REPLACE FUNCTION public.rf_parse_jsonb_array(p_raw text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_trimmed text := btrim(COALESCE(p_raw, ''));
  v_json jsonb;
  v_i int := 0;
  v_part text;
  v_arr jsonb := '[]'::jsonb;
BEGIN
  IF v_trimmed = '' OR v_trimmed = 'null' OR v_trimmed = 'undefined' THEN
    RETURN '[]'::jsonb;
  END IF;

  BEGIN
    v_json := v_trimmed::jsonb;
    WHILE jsonb_typeof(v_json) = 'string' AND v_i < 3 LOOP
      v_json := (v_json #>> '{}')::jsonb;
      v_i := v_i + 1;
    END LOOP;

    IF jsonb_typeof(v_json) = 'array' THEN
      RETURN v_json;
    ELSIF jsonb_typeof(v_json) = 'object' THEN
      RETURN jsonb_build_array(v_json);
    END IF;
    RETURN '[]'::jsonb;
  EXCEPTION WHEN OTHERS THEN
    FOREACH v_part IN ARRAY string_to_array(v_trimmed, ',')
    LOOP
      v_part := btrim(v_part);
      IF v_part <> '' THEN
        v_arr := v_arr || jsonb_build_array(jsonb_build_object('name', v_part, 'quantity', 1));
      END IF;
    END LOOP;
    RETURN v_arr;
  END;
END;
$$;

-- 3. Helper xác thực PIN nhân sự dựa trên Config_NhanSu
CREATE OR REPLACE FUNCTION public.rf_verify_pin(p_pin text)
RETURNS TABLE(
  user_id text,
  user_name text,
  user_role text,
  is_boss boolean,
  is_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_pin text := btrim(COALESCE(p_pin, ''));
  v_staff record;
  v_role text;
  v_boss boolean := false;
  v_admin boolean := false;
BEGIN
  IF v_clean_pin = '' THEN
    RAISE EXCEPTION 'AUTH_FAILED: Thiếu mã PIN xác thực!';
  END IF;

  SELECT
    id,
    "Tên Nhân Sự" AS full_name,
    "Phân Quyền" AS role_name
  INTO v_staff
  FROM public."Config_NhanSu"
  WHERE btrim(COALESCE("Mã PIN", '')) = v_clean_pin
    AND COALESCE("Trạng Thái", '') NOT ILIKE '%nghỉ%'
  LIMIT 1;

  IF FOUND THEN
    v_role := upper(btrim(COALESCE(v_staff.role_name, 'THỢ')));
    v_boss := (v_role LIKE '%TỐI CAO%' OR v_clean_pin = '226868');
    v_admin := (v_boss OR v_role LIKE '%QUẢN LÝ%' OR v_role = 'KẾ TOÁN');
    RETURN QUERY SELECT v_staff.id, COALESCE(v_staff.full_name, 'Nhân viên'), v_role, v_boss, v_admin;
    RETURN;
  END IF;

  IF v_clean_pin = '226868' THEN
    RETURN QUERY SELECT 'USR_001'::text, 'Nguyễn Ngọc Tiến'::text, 'TỐI CAO'::text, true, true;
    RETURN;
  ELSIF v_clean_pin = '246357' THEN
    RETURN QUERY SELECT 'USR_007'::text, 'Nguyễn Thị Diệu Hương'::text, 'QUẢN LÝ BÁN HÀNG'::text, false, true;
    RETURN;
  END IF;

  RAISE EXCEPTION 'AUTH_FAILED: Mã PIN không hợp lệ hoặc phiên làm việc đã hết hạn!';
END;
$$;

REVOKE ALL ON FUNCTION public.rf_verify_pin(text) FROM PUBLIC, anon, authenticated;

-- 4. Helper nhận diện Layout M (30x20x20cm, không phải Cover) theo LayoutStockPolicy.js
CREATE OR REPLACE FUNCTION public.rf_is_layout_m(
  p_category text,
  p_sub_category text,
  p_name text,
  p_sku text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_cat text := public.rf_layout_key(p_category);
  v_sub text := public.rf_layout_key(p_sub_category);
  v_name text := public.rf_layout_key(p_name);
  v_sku text := upper(btrim(COALESCE(p_sku, '')));
  v_is_m boolean := false;
BEGIN
  IF v_cat NOT LIKE '%layout%' AND v_sub NOT LIKE '%layout%' THEN
    RETURN false;
  END IF;

  IF v_name ~ '(?:^|[^0-9])30(?:[.,]0+)?\s*(?:cm)?\s*[x×*]\s*20(?:[.,]0+)?\s*(?:cm)?\s*[x×*]\s*20(?:[.,]0+)?\s*(?:cm)?(?:$|[^0-9])' THEN
    v_is_m := true;
  ELSIF v_sku ~ '(?:^|[-_])302020$' THEN
    v_is_m := true;
  END IF;

  IF NOT v_is_m THEN
    RETURN false;
  END IF;

  IF v_name ~ '\mcover\M' OR v_sub ~ '\mcover\M' OR v_sku ~ '(?:^|[-_])COVER(?:[-_]|$)' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 5. Helper khớp sản phẩm trong Products theo productId -> sku -> name -> normalized name
CREATE OR REPLACE FUNCTION public.rf_match_product_id(
  p_prod_id text,
  p_sku text,
  p_name text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p.id
  FROM public."Products" p
  WHERE (NULLIF(btrim(p_prod_id), '') IS NOT NULL AND p.id = btrim(p_prod_id))
     OR (NULLIF(btrim(p_sku), '') IS NOT NULL AND upper(btrim(COALESCE(p.sku, ''))) = upper(btrim(p_sku)))
     OR (NULLIF(btrim(p_name), '') IS NOT NULL AND lower(btrim(COALESCE(p.name, ''))) = lower(btrim(p_name)))
     OR (NULLIF(btrim(p_name), '') IS NOT NULL AND public.rf_layout_key(p.name) = public.rf_layout_key(p_name))
  ORDER BY
    CASE
      WHEN NULLIF(btrim(p_prod_id), '') IS NOT NULL AND p.id = btrim(p_prod_id) THEN 1
      WHEN NULLIF(btrim(p_sku), '') IS NOT NULL AND upper(btrim(COALESCE(p.sku, ''))) = upper(btrim(p_sku)) THEN 2
      WHEN NULLIF(btrim(p_name), '') IS NOT NULL AND lower(btrim(COALESCE(p.name, ''))) = lower(btrim(p_name)) THEN 3
      ELSE 4
    END,
    p.id
  LIMIT 1;
$$;

-- 6. Trigger bảo vệ cột Products.quantity khỏi bị sửa tay trực tiếp
CREATE OR REPLACE FUNCTION public.guard_product_quantity_direct_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     AND current_setting('rf.allow_stock_mutation', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'STOCK_GUARD: Không được sửa trực tiếp số lượng tồn kho (%). Vui lòng tạo phiếu Xuất/Nhập, Kiểm kho hoặc Bàn giao.', COALESCE(NEW.sku, NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_product_quantity_direct_edit ON public."Products";
CREATE TRIGGER trg_guard_product_quantity_direct_edit
  BEFORE UPDATE OF quantity ON public."Products"
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_quantity_direct_edit();

-- =============================================================================
-- LUỒNG A: BÀN GIAO ĐƠN HÀNG -> TRỪ TỒN CHỐNG TRỪ KÉP -> TỰ ĐỘNG BÙ TỒN LAYOUT M
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rf_handover_orders(
  p_pin text,
  p_order_ids text[],
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth record;
  v_actor_name text;
  v_now_str text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS');
  v_order record;
  v_base_code text;
  v_ie_id text;
  v_prod record;
  v_acc jsonb;
  v_acc_name text;
  v_acc_qty numeric;
  v_acc_pid text;
  v_acc_sku text;
  v_stock_prod_counts jsonb;
  v_mto_names text[];
  v_covered numeric;
  v_rem_qty numeric;
  v_export_map jsonb;
  v_matched_pid text;
  v_prod_row record;
  v_items_data jsonb;
  v_total_amt numeric;
  v_deduct_qty numeric;
  v_kv record;
  v_processed_orders int := 0;
  v_created_m_orders text[] := ARRAY[]::text[];
  v_has_packed boolean;
  v_affected_m_ids text[];
  v_m_pid text;
  v_open_m_count int;
  v_missing_m int;
  v_token text;
  v_seq int;
  v_new_m_id text;
  v_new_m_note text;
BEGIN
  SELECT * INTO v_auth FROM public.rf_verify_pin(p_pin);
  IF NOT v_auth.is_boss AND v_auth.user_role NOT IN ('TỐI CAO', 'QUẢN LÝ KHO VẬN', 'QUẢN LÝ KHO', 'QUẢN LÝ BÁN HÀNG', 'KẾ TOÁN') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Bạn không có quyền bàn giao & xuất kho đơn hàng.';
  END IF;

  v_actor_name := COALESCE(NULLIF(btrim(p_actor), ''), v_auth.user_name);
  PERFORM set_config('rf.allow_stock_mutation', '1', true);

  FOR v_order IN
    SELECT *
    FROM public."Orders"
    WHERE id = ANY(COALESCE(p_order_ids, ARRAY[]::text[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    IF upper(btrim(COALESCE(v_order.status, ''))) IN ('ĐÃ BÀN GIAO', 'HÀNG HOÀN', 'ĐƠN HUỶ', 'ĐƠN HỦY', 'ĐỐI SOÁT THÀNH CÔNG', 'HOÀN THÀNH') THEN
      CONTINUE;
    END IF;

    v_base_code := btrim(split_part(COALESCE(v_order."orderCode", ''), '|', 1));

    UPDATE public."Orders"
    SET status = 'Đã Bàn Giao',
        "isCarriedToWH" = true,
        "updatedBy" = v_actor_name
    WHERE id = v_order.id;

    v_ie_id := 'IE_HANDOVER_' || v_order.id;

    IF NOT EXISTS (SELECT 1 FROM public."ImportExport" WHERE id = v_ie_id) THEN
      v_stock_prod_counts := '{}'::jsonb;
      v_mto_names := ARRAY[]::text[];
      v_export_map := '{}'::jsonb;

      -- 1. Đọc Production liên kết với đơn (chỉ xuất thành phẩm cho fulfilledFromStock = true)
      FOR v_prod IN
        SELECT *
        FROM public."Production" p
        WHERE (
          btrim(COALESCE(p."orderId", '')) = v_order.id
          OR (NULLIF(btrim(COALESCE(v_order."orderCode", '')), '') IS NOT NULL AND btrim(COALESCE(p."orderId", '')) = btrim(v_order."orderCode"))
          OR (v_base_code <> '' AND btrim(COALESCE(p."orderId", '')) = v_base_code)
        )
        AND public.rf_layout_key(p.status) !~ 'huy|cancel|vo|scrap'
      LOOP
        IF COALESCE(v_prod."fulfilledFromStock", false) = true THEN
          IF COALESCE(v_prod.name, '') <> '' AND public.rf_layout_key(v_prod.name) !~ '\mcover\M' THEN
            v_stock_prod_counts := jsonb_set(
              v_stock_prod_counts,
              ARRAY[public.rf_layout_key(v_prod.name)],
              to_jsonb(COALESCE((v_stock_prod_counts ->> public.rf_layout_key(v_prod.name))::numeric, 0) + 1),
              true
            );
            v_matched_pid := public.rf_match_product_id(NULL, NULL, v_prod.name);
            IF v_matched_pid IS NOT NULL THEN
              v_export_map := jsonb_set(
                v_export_map,
                ARRAY[v_matched_pid],
                to_jsonb(COALESCE((v_export_map ->> v_matched_pid)::numeric, 0) + 1),
                true
              );
            END IF;
          END IF;
        ELSE
          IF COALESCE(v_prod.name, '') <> '' THEN
            v_mto_names := array_append(v_mto_names, public.rf_layout_key(v_prod.name));
          END IF;
        END IF;
      END LOOP;

      -- 2. Phụ kiện đóng gói trong Orders.accessories (bỏ qua món đã trừ từ Production hoặc hàng MTO)
      FOR v_acc IN
        SELECT * FROM jsonb_array_elements(public.rf_parse_jsonb_array(v_order.accessories))
      LOOP
        v_acc_name := btrim(COALESCE(v_acc->>'name', v_acc->>'Name', v_acc->>'productName', ''));
        v_acc_pid := NULLIF(btrim(COALESCE(v_acc->>'productId', v_acc->>'id', '')), '');
        v_acc_sku := NULLIF(btrim(COALESCE(v_acc->>'sku', '')), '');
        v_acc_qty := COALESCE(NULLIF(v_acc->>'quantity', '')::numeric, NULLIF(v_acc->>'qty', '')::numeric, 1);

        IF v_acc_qty <= 0 OR (v_acc_name = '' AND v_acc_pid IS NULL AND v_acc_sku IS NULL) THEN
          CONTINUE;
        END IF;

        IF public.rf_layout_key(v_acc_name) ~ '\mcover\M' THEN
          CONTINUE;
        END IF;

        v_covered := COALESCE((v_stock_prod_counts ->> public.rf_layout_key(v_acc_name))::numeric, 0);
        IF v_covered > 0 THEN
          v_rem_qty := GREATEST(0, v_acc_qty - v_covered);
          v_stock_prod_counts := jsonb_set(
            v_stock_prod_counts,
            ARRAY[public.rf_layout_key(v_acc_name)],
            to_jsonb(GREATEST(0, v_covered - v_acc_qty)),
            true
          );
        ELSIF public.rf_layout_key(v_acc_name) = ANY(v_mto_names) THEN
          v_rem_qty := 0;
        ELSE
          v_rem_qty := v_acc_qty;
        END IF;

        IF v_rem_qty > 0 THEN
          v_matched_pid := public.rf_match_product_id(v_acc_pid, v_acc_sku, v_acc_name);
          IF v_matched_pid IS NOT NULL THEN
            v_export_map := jsonb_set(
              v_export_map,
              ARRAY[v_matched_pid],
              to_jsonb(COALESCE((v_export_map ->> v_matched_pid)::numeric, 0) + v_rem_qty),
              true
            );
          END IF;
        END IF;
      END LOOP;

      -- 3. Trừ kho Products và ghi 1 phiếu ImportExport duy nhất cho đơn bàn giao
      v_items_data := '[]'::jsonb;
      v_total_amt := 0;

      FOR v_kv IN SELECT key, value FROM jsonb_each_text(v_export_map) ORDER BY key
      LOOP
        v_deduct_qty := COALESCE(v_kv.value::numeric, 0);
        IF v_deduct_qty <= 0 THEN
          CONTINUE;
        END IF;

        SELECT * INTO v_prod_row
        FROM public."Products"
        WHERE id = v_kv.key
        FOR UPDATE;

        IF FOUND THEN
          IF public.rf_layout_key(v_prod_row.name) ~ '\mcover\M'
             OR public.rf_layout_key(v_prod_row.sub_category) = 'cover' THEN
            CONTINUE;
          END IF;

          UPDATE public."Products"
          SET quantity = ROUND((COALESCE(quantity, 0) - v_deduct_qty)::numeric, 3)
          WHERE id = v_prod_row.id;

          v_total_amt := v_total_amt + ROUND(v_deduct_qty * COALESCE(v_prod_row."costPrice", 0));
          v_items_data := v_items_data || jsonb_build_array(
            jsonb_build_object(
              'productId', v_prod_row.id,
              'sku', COALESCE(v_prod_row.sku, ''),
              'name', COALESCE(v_prod_row.name, ''),
              'qty', v_deduct_qty,
              'quantity', v_deduct_qty,
              'price', COALESCE(v_prod_row."costPrice", 0),
              'costPrice', COALESCE(v_prod_row."costPrice", 0),
              'amount', ROUND(v_deduct_qty * COALESCE(v_prod_row."costPrice", 0))
            )
          );
        END IF;
      END LOOP;

      IF jsonb_array_length(v_items_data) > 0 THEN
        INSERT INTO public."ImportExport" (id, type, target, "totalAmount", date, note, "itemsData")
        VALUES (
          v_ie_id,
          'Xuất',
          'Bàn Giao Khách Hàng',
          v_total_amt,
          v_now_str,
          'Xuất kho tự động bàn giao đơn: ' || COALESCE(NULLIF(v_base_code, ''), v_order.id),
          v_items_data::text
        );
      END IF;
    END IF;

    -- 4. Chính sách bù tồn Layout M (30x20x20cm, không phải Cover) sau khi đã đóng gói & bàn giao
    IF public.rf_layout_key(v_order.channel) NOT IN ('san xuat ton', 'san xuat bu kho') THEN
      SELECT EXISTS (
        SELECT 1
        FROM public."Packings" pk
        WHERE btrim(COALESCE(pk."orderId", '')) IN (
          v_order.id,
          COALESCE(v_order."orderCode", ''),
          v_base_code
        )
        AND public.rf_layout_key(pk.status) IN ('done', 'da dong goi', 'hoan thanh')
      ) INTO v_has_packed;

      IF v_has_packed THEN
        v_affected_m_ids := ARRAY[]::text[];

        FOR v_acc IN
          SELECT * FROM jsonb_array_elements(public.rf_parse_jsonb_array(v_order.accessories))
        LOOP
          v_matched_pid := public.rf_match_product_id(
            NULLIF(btrim(COALESCE(v_acc->>'productId', v_acc->>'id', '')), ''),
            NULLIF(btrim(COALESCE(v_acc->>'sku', '')), ''),
            btrim(COALESCE(v_acc->>'name', v_acc->>'Name', v_acc->>'productName', ''))
          );
          IF v_matched_pid IS NOT NULL AND NOT (v_matched_pid = ANY(v_affected_m_ids)) THEN
            v_affected_m_ids := array_append(v_affected_m_ids, v_matched_pid);
          END IF;
        END LOOP;

        FOR v_prod IN
          SELECT p.name
          FROM public."Production" p
          WHERE btrim(COALESCE(p."orderId", '')) IN (
            v_order.id,
            COALESCE(v_order."orderCode", ''),
            v_base_code
          )
          AND public.rf_layout_key(p.status) !~ 'huy|cancel|vo|scrap'
        LOOP
          v_matched_pid := public.rf_match_product_id(NULL, NULL, v_prod.name);
          IF v_matched_pid IS NOT NULL AND NOT (v_matched_pid = ANY(v_affected_m_ids)) THEN
            v_affected_m_ids := array_append(v_affected_m_ids, v_matched_pid);
          END IF;
        END LOOP;

        FOREACH v_m_pid IN ARRAY v_affected_m_ids
        LOOP
          SELECT * INTO v_prod_row
          FROM public."Products"
          WHERE id = v_m_pid
          FOR UPDATE;

          IF FOUND AND public.rf_is_layout_m(v_prod_row.category, v_prod_row.sub_category, v_prod_row.name, v_prod_row.sku) THEN
            IF COALESCE(v_prod_row."minStock", 0) <> 1 THEN
              UPDATE public."Products" SET "minStock" = 1 WHERE id = v_prod_row.id;
            END IF;

            SELECT COUNT(*) INTO v_open_m_count
            FROM public."Production" pr
            JOIN public."Orders" po ON (
              btrim(COALESCE(pr."orderId", '')) = po.id
              OR (NULLIF(btrim(COALESCE(po."orderCode", '')), '') IS NOT NULL AND btrim(COALESCE(pr."orderId", '')) = btrim(po."orderCode"))
            )
            WHERE public.rf_layout_key(po.channel) IN ('san xuat ton', 'san xuat bu kho')
              AND public.rf_layout_key(po.status) !~ 'huy|cancel|vo|scrap'
              AND public.rf_layout_key(pr.status) !~ 'huy|cancel|vo|scrap'
              AND COALESCE(pr."fulfilledFromStock", false) = false
              AND (
                public.rf_layout_key(pr.name) = public.rf_layout_key(v_prod_row.name)
                OR (NULLIF(btrim(COALESCE(v_prod_row.sku, '')), '') IS NOT NULL AND upper(btrim(COALESCE(pr.name, ''))) = upper(btrim(v_prod_row.sku)))
              )
              AND NOT EXISTS (
                SELECT 1 FROM public."ImportExport" ie WHERE ie.id = 'IE_TP_' || pr.id
              );

            v_missing_m := GREATEST(0, ceil(1 - COALESCE(v_prod_row.quantity, 0) - v_open_m_count)::int);

            IF v_missing_m > 0 THEN
              v_token := upper(encode(convert_to(v_prod_row.id, 'UTF8'), 'hex'));
              v_seq := 1;
              FOR i IN 1..v_missing_m
              LOOP
                LOOP
                  v_new_m_id := 'KHO_M_' || v_token || '_' || v_seq;
                  EXIT WHEN NOT EXISTS (SELECT 1 FROM public."Orders" WHERE id = v_new_m_id)
                        AND NOT EXISTS (SELECT 1 FROM public."Production" WHERE id = 'SX_' || v_new_m_id);
                  v_seq := v_seq + 1;
                END LOOP;
                v_seq := v_seq + 1;

                v_new_m_note := 'Bù tồn chuẩn layout M 30x20x20cm sau bàn giao ' || COALESCE(NULLIF(v_base_code, ''), v_order.id) || ' | SKU: ' || COALESCE(v_prod_row.sku, v_prod_row.id);

                INSERT INTO public."Orders" (
                  id, "orderCode", channel, customer, status, "createdAt", date, "hasProduction", revenue, note, accessories
                ) VALUES (
                  v_new_m_id,
                  v_new_m_id,
                  'Sản Xuất Bù Kho',
                  'Kho thành phẩm',
                  'Chờ Sản Xuất',
                  v_now_str,
                  v_now_str,
                  true,
                  0,
                  v_new_m_note,
                  jsonb_build_array(
                    jsonb_build_object(
                      'productId', v_prod_row.id,
                      'sku', COALESCE(v_prod_row.sku, ''),
                      'name', v_prod_row.name,
                      'quantity', 1,
                      'hasProduction', true
                    )
                  )::text
                );

                INSERT INTO public."Production" (
                  id, "orderId", type, name, status, "fulfilledFromStock", note,
                  p1_name, p1_status, p2_name, p2_status, qc_status
                ) VALUES (
                  'SX_' || v_new_m_id,
                  v_new_m_id,
                  'Layout',
                  v_prod_row.name,
                  'Pending',
                  false,
                  v_new_m_note,
                  'Dựng Khung',
                  'Pending',
                  'Gia Cố',
                  'Pending',
                  'Pending'
                );

                v_created_m_orders := array_append(v_created_m_orders, v_new_m_id);
              END LOOP;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;

    v_processed_orders := v_processed_orders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processedOrders', v_processed_orders,
    'createdReplenishOrders', v_created_m_orders
  );
END;
$$;

-- =============================================================================
-- LUỒNG B: DUYỆT KCS & TRỪ VẬT TƯ THEO BOM_Config + TỰ ĐẨY ĐƠN SANG ĐÓNG GÓI
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rf_approve_qc_and_deduct_bom(
  p_pin text,
  p_production_id text,
  p_actor text DEFAULT NULL,
  p_material_usage jsonb DEFAULT NULL,
  p_qc_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth record;
  v_actor_name text;
  v_now_str text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS');
  v_prod record;
  v_is_from_stock boolean;
  v_bom_ie_id text;
  v_tp_ie_id text;
  v_prod_name text;
  v_prod_name_lower text;
  v_prod_type_upper text;
  v_is_layout boolean;
  v_is_glass boolean;
  v_target_type text;
  v_finished_prod record;
  v_finished_prod_id text := NULL;
  v_finished_sku text := '';
  v_bom_lines jsonb := '[]'::jsonb;
  v_mu_item jsonb;
  v_bom_row record;
  v_dims text[];
  v_l numeric := 40;
  v_w numeric := 20;
  v_h numeric := 20;
  v_area_m2 numeric;
  v_perim_m numeric;
  v_glue_qty numeric;
  v_glass_thick text;
  v_mat_line jsonb;
  v_mat_sku text;
  v_mat_name text;
  v_raw_qty numeric;
  v_bom_unit text;
  v_mat_row record;
  v_deduct_qty numeric;
  v_unit_price numeric;
  v_display_unit text;
  v_line_amt numeric;
  v_total_cost numeric := 0;
  v_items_deducted jsonb := '[]'::jsonb;
  v_mat_unit_clean text;
  v_bom_unit_clean text;
  v_is_keo502 boolean;
  v_keo_grams numeric;
  v_conv_rate numeric;
  v_alias_candidates text[];
  v_order_row record;
  v_order_id text := NULL;
  v_order_channel text := '';
  v_order_status text := '';
  v_is_internal_stock boolean := false;
  v_all_ready boolean := false;
  v_new_qc_note text;
BEGIN
  SELECT * INTO v_auth FROM public.rf_verify_pin(p_pin);
  IF v_auth.user_role IN ('CỘNG TÁC VIÊN', 'CTV', 'KHÁCH') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Tài khoản không có quyền duyệt sản xuất/trừ BOM.';
  END IF;

  v_actor_name := COALESCE(NULLIF(btrim(p_actor), ''), v_auth.user_name);
  PERFORM set_config('rf.allow_stock_mutation', '1', true);

  SELECT * INTO v_prod
  FROM public."Production"
  WHERE id = btrim(COALESCE(p_production_id, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Không tìm thấy lệnh sản xuất: ' || COALESCE(p_production_id, ''));
  END IF;

  -- GUARD 1: Hàng lấy từ tồn kho có sẵn -> tuyệt đối không trừ BOM
  v_is_from_stock := COALESCE(v_prod."fulfilledFromStock", false) = true
    OR btrim(COALESCE(v_prod.status, '')) = 'Hoàn Kho Đạt'
    OR COALESCE(v_prod.note, '') ILIKE '%Lấy từ tồn kho%';

  IF v_is_from_stock THEN
    RETURN jsonb_build_object(
      'success', true,
      'isStockFulfillment', true,
      'message', 'Lệnh sản xuất ' || v_prod.id || ' lấy từ tồn kho có sẵn, không trừ vật tư BOM.'
    );
  END IF;

  -- GUARD 2: Sản phẩm 2 khâu phải hoàn tất Khâu 2 mới trừ BOM
  IF btrim(COALESCE(v_prod.p2_name, '')) <> ''
     AND upper(btrim(COALESCE(v_prod.p2_status, ''))) NOT IN ('DONE', 'ĐÃ XONG') THEN
    RETURN jsonb_build_object(
      'success', false,
      'isGuard2Block', true,
      'message', 'Lệnh ' || v_prod.id || ' chưa hoàn thành đủ 2 khâu sản xuất (Khâu 2: ' || COALESCE(NULLIF(v_prod.p2_status, ''), 'Pending') || ').'
    );
  END IF;

  -- Cập nhật trạng thái hoàn thành & KCS trên Production
  v_new_qc_note := COALESCE(v_prod.qc_note, '');
  IF position('[Duyệt bởi: ' || v_actor_name || ']' IN v_new_qc_note) = 0 THEN
    v_new_qc_note := CASE
      WHEN btrim(v_new_qc_note) = '' THEN '[Duyệt bởi: ' || v_actor_name || ']'
      ELSE v_new_qc_note || E'\n[Duyệt bởi: ' || v_actor_name || ']'
    END;
  END IF;

  UPDATE public."Production"
  SET status = 'Done',
      qc_status = COALESCE(NULLIF(btrim(p_qc_status), ''), NULLIF(btrim(qc_status), ''), 'Đã duyệt'),
      qc_note = v_new_qc_note
  WHERE id = v_prod.id;

  v_bom_ie_id := 'IE_BOM_' || v_prod.id;
  v_tp_ie_id := 'IE_TP_' || v_prod.id;
  v_prod_name := btrim(COALESCE(v_prod.name, ''));
  v_prod_name_lower := lower(v_prod_name);
  v_prod_type_upper := upper(btrim(COALESCE(v_prod.type, '')));

  -- Xác định Bể Kính vs Layout
  v_is_layout := (v_prod_type_upper LIKE '%LAYOUT%')
    OR (public.rf_layout_key(v_prod_name) ~ '(layout|rung|bonsai|cau vong|dao bay|cuoi|da|lua|biotop|cover|tieu canh|vach|hem|dao|nhat tru|nui|hang|cau|biotope)');
  v_is_glass := (NOT v_is_layout) AND (
    v_prod_type_upper LIKE '%BE%' OR v_prod_type_upper LIKE '%BỂ%' OR v_prod_type_upper LIKE '%HO%'
    OR public.rf_layout_key(v_prod_name) ~ '(be kinh|ho kinh|be sieu trong|dan be|ho ca|be ca|ho duc|be duc|\mbe\M|\mho\M|\mtank\M)'
  );
  IF NOT v_is_layout AND NOT v_is_glass THEN
    IF v_prod_name_lower ~ '\d+\s*[x*×]\s*\d+\s*[x*×]\s*\d+' THEN
      v_is_glass := true;
    ELSE
      v_is_layout := true;
    END IF;
  END IF;
  v_target_type := CASE WHEN v_is_glass THEN 'Sản Xuất Bể Kính' ELSE 'Sản Xuất Layout' END;

  -- Tìm sản phẩm thành phẩm tương ứng trong Products
  SELECT * INTO v_finished_prod
  FROM public."Products" p
  WHERE (
    (v_is_glass AND upper(COALESCE(p.category, '')) NOT LIKE '%LAYOUT%' AND upper(COALESCE(p.category, '')) <> 'THÀNH PHẨM')
    OR (v_is_layout AND upper(COALESCE(p.category, '')) NOT LIKE '%BỂ%')
    OR (NOT v_is_glass AND NOT v_is_layout)
  )
  AND (
    lower(btrim(COALESCE(p.name, ''))) = v_prod_name_lower
    OR lower(btrim(COALESCE(p.sku, ''))) = v_prod_name_lower
    OR public.rf_layout_key(p.name) = public.rf_layout_key(v_prod_name)
    OR public.rf_layout_key(p.sku) = public.rf_layout_key(v_prod_name)
  )
  LIMIT 1;

  IF FOUND THEN
    v_finished_prod_id := v_finished_prod.id;
    v_finished_sku := COALESCE(v_finished_prod.sku, '');
  END IF;

  -- Chỉ trừ BOM nếu chưa tồn tại phiếu IE_BOM_<prodId> (Idempotent)
  IF NOT EXISTS (SELECT 1 FROM public."ImportExport" WHERE id = v_bom_ie_id) THEN
    -- Ưu tiên 0: materialUsageData truyền từ UI
    IF p_material_usage IS NOT NULL AND jsonb_typeof(p_material_usage) = 'array' AND jsonb_array_length(p_material_usage) > 0 THEN
      FOR v_mu_item IN SELECT * FROM jsonb_array_elements(p_material_usage)
      LOOP
        v_raw_qty := COALESCE(
          NULLIF(v_mu_item->>'actualQty', '')::numeric,
          NULLIF(v_mu_item->>'qty', '')::numeric,
          GREATEST(0, COALESCE(NULLIF(v_mu_item->>'requestedQty', '')::numeric, 0) - COALESCE(NULLIF(v_mu_item->>'returnedQty', '')::numeric, 0))
        );
        IF v_raw_qty > 0 THEN
          v_bom_lines := v_bom_lines || jsonb_build_array(
            jsonb_build_object(
              'sku', btrim(COALESCE(v_mu_item->>'sku', v_mu_item->>'name', '')),
              'name', COALESCE(v_mu_item->>'name', v_mu_item->>'sku', ''),
              'qty', v_raw_qty,
              'unit', COALESCE(v_mu_item->>'unit', 'kg'),
              'defaultPrice', COALESCE(NULLIF(v_mu_item->>'costPrice', '')::numeric, NULLIF(v_mu_item->>'price', '')::numeric, 0)
            )
          );
        END IF;
      END LOOP;
    END IF;

    -- Ưu tiên 1: Quét BOM_Config
    IF jsonb_array_length(v_bom_lines) = 0 THEN
      FOR v_bom_row IN
        SELECT *
        FROM public."BOM_Config" b
        WHERE btrim(COALESCE(b."layoutCode", '')) <> ''
          AND (
            lower(btrim(b."layoutCode")) = v_prod_name_lower
            OR (v_finished_sku <> '' AND lower(btrim(b."layoutCode")) = lower(v_finished_sku))
            OR public.rf_layout_key(b."layoutCode") = public.rf_layout_key(v_prod_name)
            OR (v_finished_sku <> '' AND public.rf_layout_key(b."layoutCode") = public.rf_layout_key(v_finished_sku))
          )
          AND COALESCE(b."defaultQty", 0) > 0
      LOOP
        v_mat_sku := upper(btrim(COALESCE(v_bom_row."materialSku", '')));
        IF v_is_layout AND (v_mat_sku LIKE '%KINH%' OR v_mat_sku LIKE '%MAI-CNC%' OR v_mat_sku LIKE '%SILICON%' OR v_mat_sku LIKE '%WACKER%') THEN
          CONTINUE;
        END IF;
        IF v_is_glass AND (v_mat_sku LIKE '%CUOI%' OR v_mat_sku LIKE '%TAIMEO%' OR v_mat_sku LIKE '%NHAM%' OR v_mat_sku LIKE '%SANMIENG%' OR v_mat_sku LIKE '%DOQUYEN%' OR v_mat_sku LIKE '%FOMEX%' OR v_mat_sku LIKE '%502%') THEN
          CONTINUE;
        END IF;

        v_bom_lines := v_bom_lines || jsonb_build_array(
          jsonb_build_object(
            'sku', btrim(v_bom_row."materialSku"),
            'name', btrim(v_bom_row."materialSku"),
            'qty', v_bom_row."defaultQty",
            'unit', COALESCE(v_bom_row.unit, 'Gam'),
            'defaultPrice', 0
          )
        );
      END LOOP;
    END IF;

    -- Ưu tiên 2: Fallback Bể Kính theo kích thước LxWxH
    IF jsonb_array_length(v_bom_lines) = 0 AND v_is_glass THEN
      v_dims := regexp_match(v_prod_name_lower, '(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)');
      IF v_dims IS NOT NULL THEN
        v_l := v_dims[1]::numeric;
        v_w := v_dims[2]::numeric;
        v_h := v_dims[3]::numeric;
      END IF;
      v_area_m2 := round((((v_l * v_w + 2 * v_l * v_h + 2 * v_w * v_h) / 10000.0) * 1.1)::numeric, 4);
      v_perim_m := round(((2 * (v_l + v_w)) / 100.0)::numeric, 2);
      v_glue_qty := round((((v_l + v_w + v_h) / 100.0) * 0.15)::numeric, 2);
      v_glass_thick := CASE WHEN GREATEST(v_l, v_w, v_h) >= 60 THEN '8LI' ELSE '5LI' END;

      v_bom_lines := jsonb_build_array(
        jsonb_build_object('sku', 'NL-BE-KINH' || v_glass_thick, 'name', 'Kính Siêu Trong ' || lower(v_glass_thick), 'qty', v_area_m2, 'unit', 'm2', 'defaultPrice', CASE WHEN v_glass_thick = '8LI' THEN 240000 ELSE 150000 END),
        jsonb_build_object('sku', 'NL-BE-KEO-WACKER', 'name', 'Keo Silicone Wacker Chuyên Dụng', 'qty', v_glue_qty, 'unit', 'chai', 'defaultPrice', 55000),
        jsonb_build_object('sku', 'DICHVU-MAI-CNC', 'name', 'Mài CNC Cạnh Vi Tính (Gia công)', 'qty', v_perim_m, 'unit', 'mét', 'defaultPrice', 25000, 'isService', true)
      );
    END IF;

    -- Thực thi trừ từng vật tư
    FOR v_mat_line IN SELECT * FROM jsonb_array_elements(v_bom_lines)
    LOOP
      v_mat_sku := upper(btrim(COALESCE(v_mat_line->>'sku', '')));
      v_mat_name := btrim(COALESCE(v_mat_line->>'name', v_mat_sku));
      v_raw_qty := COALESCE(NULLIF(v_mat_line->>'qty', '')::numeric, 0);
      v_bom_unit := btrim(COALESCE(v_mat_line->>'unit', ''));

      IF v_raw_qty <= 0 THEN
        CONTINUE;
      END IF;

      IF COALESCE((v_mat_line->>'isService')::boolean, false) = true OR v_mat_sku = 'DICHVU-MAI-CNC' THEN
        v_unit_price := COALESCE(NULLIF(v_mat_line->>'defaultPrice', '')::numeric, 25000);
        v_line_amt := round(v_raw_qty * v_unit_price);
        v_total_cost := v_total_cost + v_line_amt;
        v_items_deducted := v_items_deducted || jsonb_build_array(
          jsonb_build_object(
            'sku', v_mat_sku,
            'name', v_mat_name,
            'qty', round(v_raw_qty, 3),
            'deductedQty', 0,
            'unit', COALESCE(NULLIF(v_bom_unit, ''), 'mét'),
            'price', v_unit_price,
            'costPrice', v_unit_price,
            'amount', v_line_amt,
            'isService', true
          )
        );
        CONTINUE;
      END IF;

      v_alias_candidates := CASE v_mat_sku
        WHEN 'NLSX-KINH-5LI' THEN ARRAY['NL-BE-KINH5LI', 'NL-BE-KINH-5LI', 'NL-BE-KINH5LI-6080', 'NL-BE-KINH5MM']
        WHEN 'NLSX-KINH-8LI' THEN ARRAY['NL-BE-KINH8LI', 'NL-BE-KINH-8LI', 'NL-BE-KINH8MM']
        WHEN 'NLSX-KINH-3LI' THEN ARRAY['NL-BE-KINH3LI', 'NL-BE-KINH3LI-100', 'NL-BE-KINH-3LI']
        WHEN 'NLSX-KINH-4LI' THEN ARRAY['NL-BE-KINH4LI', 'NL-BE-KINH4LI-6080', 'NL-BE-KINH-4LI']
        WHEN 'NL-BE-KINH5LI' THEN ARRAY['NL-BE-KINH5LI', 'NL-BE-KINH-5LI', 'NL-BE-KINH5LI-6080', 'NLSX-KINH-5LI']
        WHEN 'NL-BE-KINH8LI' THEN ARRAY['NL-BE-KINH8LI', 'NL-BE-KINH-8LI', 'NLSX-KINH-8LI']
        WHEN 'NLSX-KEO-WACKER' THEN ARRAY['NL-BE-KEO-WACKER', 'VT-KEO-WACKER', 'NL-BE-KEO-SILICONE', 'VT-KEO-SILICONE']
        WHEN 'NL-BE-KEO-WACKER' THEN ARRAY['NL-BE-KEO-WACKER', 'VT-KEO-WACKER', 'NLSX-KEO-WACKER']
        WHEN 'NLSX-LUASANMIENG' THEN ARRAY['NL-LAY-LUASANMIENG', 'NL-LAY-LUA-SANMIENG']
        WHEN 'NLSX-TAIMEO' THEN ARRAY['NL-LAY-TAIMEO', 'NL-LAY-DA-TAIMEO']
        WHEN 'NLSX-CUOI' THEN ARRAY['NL-LAY-CUOI', 'NL-LAY-DA-CUOI']
        WHEN 'NLSX-NHAM' THEN ARRAY['NL-LAY-NHAM', 'NL-LAY-NHAMTHACH']
        WHEN 'NLSX-DOQUYEN' THEN ARRAY['NL-LAY-DOQUYEN', 'NL-LAY-LUA-DOQUYEN']
        WHEN 'NLSX-RF' THEN ARRAY['NL-LAY-SX-RF', 'NL-LAY-RF']
        WHEN 'NLSX-REU-A04' THEN ARRAY['NL-LAY-REU-A04']
        WHEN 'NLSX-REU-A11' THEN ARRAY['NL-LAY-REU-A11']
        WHEN 'NLSX-502-1CHAI' THEN ARRAY['NL-LAY-KEO-502', 'VT-KEO-502', 'NLSX-KEO-502']
        WHEN 'NLSX-KEO-502' THEN ARRAY['NL-LAY-KEO-502', 'VT-KEO-502', 'NLSX-502-1CHAI']
        WHEN 'NLSX-FOMEX-8' THEN ARRAY['NL-LAY-FOMEX-8']
        WHEN 'NLSX-FOMEX-10' THEN ARRAY['NL-LAY-FOMEX-10']
        ELSE ARRAY[v_mat_sku]
      END;

      SELECT * INTO v_mat_row
      FROM public."Products" p
      WHERE upper(btrim(COALESCE(p.sku, ''))) = v_mat_sku
         OR upper(btrim(COALESCE(p.sku, ''))) = ANY(v_alias_candidates)
         OR lower(btrim(COALESCE(p.name, ''))) = lower(v_mat_name)
         OR public.rf_layout_key(p.name) = public.rf_layout_key(v_mat_name)
      ORDER BY
        CASE
          WHEN upper(btrim(COALESCE(p.sku, ''))) = v_mat_sku THEN 1
          WHEN upper(btrim(COALESCE(p.sku, ''))) = ANY(v_alias_candidates) THEN 2
          WHEN lower(btrim(COALESCE(p.name, ''))) = lower(v_mat_name) THEN 3
          ELSE 4
        END,
        p.id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_mat_unit_clean := regexp_replace(lower(COALESCE(v_mat_row.unit, '')), '[^a-z0-9]', '', 'g');
        v_bom_unit_clean := regexp_replace(lower(COALESCE(v_bom_unit, '')), '[^a-z0-9]', '', 'g');
        v_conv_rate := CASE WHEN COALESCE(v_mat_row."conversionRate", 1) > 0 THEN v_mat_row."conversionRate" ELSE 1 END;
        v_is_keo502 := (COALESCE(v_mat_row.sku, '') ILIKE '%502%' OR COALESCE(v_mat_row.name, '') ILIKE '%502%' OR COALESCE(v_mat_row.name, '') ILIKE '%keo%');
        v_unit_price := COALESCE(v_mat_row."costPrice", 0);
        v_deduct_qty := v_raw_qty;
        v_display_unit := COALESCE(NULLIF(v_mat_row.unit, ''), NULLIF(v_bom_unit, ''), 'kg');

        IF v_is_keo502 THEN
          v_keo_grams := CASE
            WHEN v_bom_unit_clean IN ('gam', 'g', 'gram', 'gr', '1g') THEN CASE WHEN v_raw_qty > 10 THEN v_raw_qty ELSE v_raw_qty * 100 END
            ELSE CASE WHEN v_raw_qty <= 10 THEN v_raw_qty * 100 ELSE v_raw_qty END
          END;
          IF v_mat_unit_clean = 'chai' OR COALESCE(v_mat_row.name, '') ILIKE '%chai%' THEN
            v_deduct_qty := round((v_keo_grams / 100.0)::numeric, 3);
            v_display_unit := 'Chai';
            v_unit_price := CASE WHEN v_unit_price > 0 THEN v_unit_price ELSE 22000 END;
          ELSE
            v_deduct_qty := round(v_keo_grams::numeric, 2);
            v_display_unit := 'gam';
            v_unit_price := 220;
          END IF;
        ELSIF v_mat_unit_clean IN ('kg', 'can', 'ki', 'kilogram', '1kg') AND v_bom_unit_clean IN ('gam', 'g', 'gram', 'gr', '1g') THEN
          v_deduct_qty := round((v_raw_qty / 1000.0)::numeric, 4);
          v_display_unit := 'kg';
        ELSIF v_mat_unit_clean IN ('gam', 'g', 'gram', 'gr', '1g') AND (v_conv_rate = 1000 OR lower(COALESCE(v_mat_row."importUnit", '')) IN ('kg', '1kg') OR v_unit_price >= 1000) THEN
          v_display_unit := 'gam';
          v_unit_price := round((v_unit_price / CASE WHEN v_conv_rate > 1 THEN v_conv_rate ELSE 1000 END)::numeric, 2);
        ELSIF v_bom_unit_clean IN ('m2', 'm') THEN
          v_deduct_qty := round(v_raw_qty::numeric, 4);
          v_display_unit := 'm²';
        ELSIF v_conv_rate > 1 THEN
          v_unit_price := round((v_unit_price / v_conv_rate)::numeric, 2);
        END IF;

        v_deduct_qty := round(v_deduct_qty::numeric, 3);
        UPDATE public."Products"
        SET quantity = round(GREATEST(0, COALESCE(quantity, 0) - v_deduct_qty)::numeric, 3)
        WHERE id = v_mat_row.id;

        v_line_amt := round(v_deduct_qty * v_unit_price);
        v_total_cost := v_total_cost + v_line_amt;

        v_items_deducted := v_items_deducted || jsonb_build_array(
          jsonb_build_object(
            'productId', v_mat_row.id,
            'sku', COALESCE(v_mat_row.sku, v_mat_sku),
            'name', COALESCE(v_mat_row.name, v_mat_name),
            'qty', v_deduct_qty,
            'deductedQty', v_deduct_qty,
            'unit', v_display_unit,
            'price', v_unit_price,
            'costPrice', v_unit_price,
            'amount', v_line_amt
          )
        );
      ELSE
        v_unit_price := COALESCE(NULLIF(v_mat_line->>'defaultPrice', '')::numeric, 0);
        v_line_amt := round(v_raw_qty * v_unit_price);
        v_total_cost := v_total_cost + v_line_amt;
        v_items_deducted := v_items_deducted || jsonb_build_array(
          jsonb_build_object(
            'sku', v_mat_sku,
            'name', v_mat_name,
            'qty', round(v_raw_qty, 3),
            'deductedQty', round(v_raw_qty, 3),
            'unit', COALESCE(NULLIF(v_bom_unit, ''), 'cái'),
            'price', v_unit_price,
            'costPrice', v_unit_price,
            'amount', v_line_amt
          )
        );
      END IF;
    END LOOP;

    -- Ghi phiếu xuất BOM & phiếu nhập thành phẩm xưởng nếu có vật tư phát sinh
    IF jsonb_array_length(v_items_deducted) > 0 THEN
      INSERT INTO public."ImportExport" (id, type, target, "totalAmount", date, note, "itemsData")
      VALUES (
        v_bom_ie_id,
        'Xuất',
        v_target_type,
        round(v_total_cost),
        v_now_str,
        'Trừ vật tư lệnh sản xuất ' || v_prod_name || CASE WHEN NULLIF(btrim(COALESCE(v_prod."orderId", '')), '') IS NOT NULL THEN ' đơn ' || v_prod."orderId" ELSE '' END,
        v_items_deducted::text
      );

      IF NOT EXISTS (SELECT 1 FROM public."ImportExport" WHERE id = v_tp_ie_id) THEN
        INSERT INTO public."ImportExport" (id, type, target, "totalAmount", date, note, "itemsData")
        VALUES (
          v_tp_ie_id,
          'Nhập',
          'Xưởng Sản Xuất',
          round(v_total_cost),
          v_now_str,
          'Nhập kho thành phẩm sản xuất: ' || v_prod_name || CASE WHEN NULLIF(btrim(COALESCE(v_prod."orderId", '')), '') IS NOT NULL THEN ' (Đơn ' || v_prod."orderId" || ')' ELSE ' (Sản xuất lưu kho)' END,
          jsonb_build_array(
            jsonb_build_object(
              'sku', v_prod.id,
              'name', v_prod_name,
              'qty', 1,
              'unit', CASE WHEN v_prod.type = 'Layout' THEN 'Cái' ELSE 'Bể' END,
              'price', round(v_total_cost),
              'costPrice', round(v_total_cost),
              'amount', round(v_total_cost)
            )
          )::text
        );
      END IF;

      -- Kiểm tra đơn gắn với lệnh sản xuất
      v_order_id := NULL;
      v_order_channel := '';
      v_order_status := '';
      IF NULLIF(btrim(COALESCE(v_prod."orderId", '')), '') IS NOT NULL THEN
        SELECT * INTO v_order_row
        FROM public."Orders" o
        WHERE o.id = btrim(v_prod."orderId")
           OR o."orderCode" = btrim(v_prod."orderId")
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN
          v_order_id := v_order_row.id;
          v_order_channel := COALESCE(v_order_row.channel, '');
          v_order_status := COALESCE(v_order_row.status, '');
        END IF;
      END IF;

      v_is_internal_stock := NULLIF(btrim(COALESCE(v_prod."orderId", '')), '') IS NULL
        OR upper(v_prod."orderId") LIKE '%INTERNAL%'
        OR upper(v_prod."orderId") LIKE '%KHO%'
        OR (v_order_id IS NOT NULL AND public.rf_layout_key(v_order_channel) IN ('san xuat ton', 'san xuat bu kho'));

      IF v_is_internal_stock THEN
        IF v_finished_prod_id IS NOT NULL THEN
          UPDATE public."Products"
          SET quantity = COALESCE(quantity, 0) + 1
          WHERE id = v_finished_prod_id;
        END IF;

        IF v_order_id IS NOT NULL THEN
          UPDATE public."Orders"
          SET status = 'Đã nhập kho'
          WHERE id = v_order_id
            AND public.rf_layout_key(status) NOT IN ('da nhap kho', 'hoan thanh kho', 'da ban giao', 'don huy');
        END IF;
      ELSIF v_order_id IS NOT NULL THEN
        UPDATE public."Orders"
        SET cogs = COALESCE(cogs, 0) + round(v_total_cost)
        WHERE id = v_order_id;
      END IF;
    END IF;
  END IF;

  -- Kiểm tra chuyển đơn khách sang 'Sẵn Sàng Đóng Gói' nếu mọi lệnh con đã xong & đạt KCS
  IF NULLIF(btrim(COALESCE(v_prod."orderId", '')), '') IS NOT NULL THEN
    v_order_id := NULL;
    SELECT * INTO v_order_row
    FROM public."Orders" o
    WHERE o.id = btrim(v_prod."orderId")
       OR o."orderCode" = btrim(v_prod."orderId")
    LIMIT 1
    FOR UPDATE;

    IF FOUND
       AND public.rf_layout_key(v_order_row.channel) NOT IN ('san xuat ton', 'san xuat bu kho')
       AND v_order_row.status IN ('Chờ Sản Xuất', 'Đang Sản Xuất', 'Quét Tự Động') THEN
      SELECT NOT EXISTS (
        SELECT 1
        FROM public."Production" sib
        WHERE btrim(COALESCE(sib."orderId", '')) IN (v_order_row.id, COALESCE(v_order_row."orderCode", ''))
          AND public.rf_layout_key(sib.status) !~ 'huy|cancel|vo|scrap'
          AND NOT (
            COALESCE(sib."fulfilledFromStock", false) = true
            OR (
              upper(btrim(COALESCE(sib.status, ''))) IN ('DONE', 'ĐÃ XONG', 'HOÀN KHO ĐẠT')
              AND public.rf_layout_key(sib.qc_status) IN ('passed', 'da duyet', 'dat', 'approved')
            )
          )
      ) INTO v_all_ready;

      IF v_all_ready THEN
        UPDATE public."Orders"
        SET status = 'Sẵn Sàng Đóng Gói'
        WHERE id = v_order_row.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'productionId', v_prod.id,
    'deductedMaterials', jsonb_array_length(v_items_deducted),
    'totalCost', round(v_total_cost),
    'deducted', v_items_deducted
  );
END;
$$;

-- =============================================================================
-- LUỒNG C: CHỨNG TỪ KHO CHÍNH THỨC (NHẬP / XUẤT / KIỂM KHO / XOÁ ĐẢO TỒN)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rf_apply_stock_voucher(
  p_pin text,
  p_ie_rows jsonb DEFAULT '[]'::jsonb,
  p_delete_ie_ids text[] DEFAULT ARRAY[]::text[],
  p_product_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth record;
  v_ie jsonb;
  v_prod jsonb;
  v_pid text;
  v_has_voucher boolean;
  v_updated_products int := 0;
BEGIN
  SELECT * INTO v_auth FROM public.rf_verify_pin(p_pin);
  IF NOT v_auth.is_boss AND v_auth.user_role NOT IN ('TỐI CAO', 'QUẢN LÝ KHO VẬN', 'QUẢN LÝ KHO', 'QUẢN LÝ BÁN HÀNG', 'KẾ TOÁN') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Bạn không có quyền thực hiện chứng từ xuất nhập / kiểm kho.';
  END IF;

  IF COALESCE(array_length(p_delete_ie_ids, 1), 0) > 0
     AND NOT v_auth.is_boss
     AND v_auth.user_role NOT IN ('TỐI CAO', 'QUẢN LÝ KHO VẬN', 'QUẢN LÝ KHO', 'KẾ TOÁN') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Bạn không có quyền xóa chứng từ kho.';
  END IF;

  v_has_voucher := (p_ie_rows IS NOT NULL AND jsonb_typeof(p_ie_rows) = 'array' AND jsonb_array_length(p_ie_rows) > 0)
    OR COALESCE(array_length(p_delete_ie_ids, 1), 0) > 0;

  IF NOT v_has_voucher THEN
    RAISE EXCEPTION 'STOCK_VOUCHER_REQUIRED: Mọi thay đổi tồn kho phải đi kèm chứng từ ImportExport.';
  END IF;

  PERFORM set_config('rf.allow_stock_mutation', '1', true);

  IF p_ie_rows IS NOT NULL AND jsonb_typeof(p_ie_rows) = 'array' THEN
    FOR v_ie IN SELECT * FROM jsonb_array_elements(p_ie_rows)
    LOOP
      INSERT INTO public."ImportExport" (id, type, target, "totalAmount", date, note, "itemsData")
      VALUES (
        COALESCE(NULLIF(btrim(v_ie->>'id'), ''), 'IE_' || to_char(now(), 'YYYYMMDDHH24MISSMS')),
        COALESCE(v_ie->>'type', ''),
        COALESCE(v_ie->>'target', ''),
        COALESCE(NULLIF(v_ie->>'totalAmount', '')::numeric, 0),
        COALESCE(v_ie->>'date', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')),
        COALESCE(v_ie->>'note', ''),
        CASE
          WHEN jsonb_typeof(v_ie->'itemsData') IN ('array', 'object') THEN (v_ie->'itemsData')::text
          ELSE COALESCE(v_ie->>'itemsData', '[]')
        END
      )
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        target = EXCLUDED.target,
        "totalAmount" = EXCLUDED."totalAmount",
        date = EXCLUDED.date,
        note = EXCLUDED.note,
        "itemsData" = EXCLUDED."itemsData";
    END LOOP;
  END IF;

  IF COALESCE(array_length(p_delete_ie_ids, 1), 0) > 0 THEN
    DELETE FROM public."ImportExport"
    WHERE id = ANY(p_delete_ie_ids);
  END IF;

  IF p_product_updates IS NOT NULL AND jsonb_typeof(p_product_updates) = 'array' THEN
    FOR v_prod IN SELECT * FROM jsonb_array_elements(p_product_updates)
    LOOP
      v_pid := NULLIF(btrim(COALESCE(v_prod->>'id', '')), '');
      IF v_pid IS NULL THEN
        CONTINUE;
      END IF;

      PERFORM 1 FROM public."Products" WHERE id = v_pid FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF v_prod ? '_diff' AND NULLIF(btrim(v_prod->>'_diff'), '') IS NOT NULL THEN
        UPDATE public."Products"
        SET quantity = round((COALESCE(quantity, 0) + (v_prod->>'_diff')::numeric)::numeric, 3),
            "costPrice" = COALESCE(NULLIF(v_prod->>'costPrice', '')::numeric, "costPrice")
        WHERE id = v_pid;
        v_updated_products := v_updated_products + 1;
      ELSIF v_prod ? 'quantity' AND NULLIF(btrim(v_prod->>'quantity'), '') IS NOT NULL THEN
        UPDATE public."Products"
        SET quantity = round((v_prod->>'quantity')::numeric, 3),
            "costPrice" = COALESCE(NULLIF(v_prod->>'costPrice', '')::numeric, "costPrice")
        WHERE id = v_pid;
        v_updated_products := v_updated_products + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'updatedProducts', v_updated_products
  );
END;
$$;

-- Cấp quyền thực thi cho client (bảo mật bằng p_pin nội bộ trong mỗi RPC)
REVOKE ALL ON FUNCTION public.rf_handover_orders(text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_handover_orders(text, text[], text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_approve_qc_and_deduct_bom(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_approve_qc_and_deduct_bom(text, text, text, jsonb, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_apply_stock_voucher(text, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_apply_stock_voucher(text, jsonb, text[], jsonb) TO anon, authenticated;
