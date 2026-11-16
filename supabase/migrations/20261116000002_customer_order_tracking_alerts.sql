-- =============================================================================
-- RF WORKSPACE V2 - CUSTOMER ORDER TRACKING & PINNED CUSTOMER ALERTS
-- 1. Bảng Order_Customer_Alerts lưu ghi chú khách gửi từ Website (RLS chỉ đọc)
-- 2. rf_track_order(p_order_code, p_phone_last4) - Tra cứu đơn + ảnh SX/Đóng gói
-- 3. rf_add_customer_order_note(p_order_code, p_note) - Khách gửi ghi chú về xưởng
-- 4. rf_get_unread_customer_alerts(p_pin) & rf_acknowledge_customer_alert(p_pin, p_alert_id, p_actor)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public."Order_Customer_Alerts" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_code text,
  customer_name text,
  note_content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_acknowledged boolean DEFAULT false,
  acknowledged_by text,
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_customer_alerts_unread
  ON public."Order_Customer_Alerts"(is_acknowledged, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_order_customer_alerts_order_id
  ON public."Order_Customer_Alerts"(order_id, created_at DESC);

ALTER TABLE public."Order_Customer_Alerts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read customer alerts" ON public."Order_Customer_Alerts";
CREATE POLICY "Allow read customer alerts"
  ON public."Order_Customer_Alerts"
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public."Order_Customer_Alerts" FROM public;
GRANT SELECT ON public."Order_Customer_Alerts" TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."Order_Customer_Alerts";
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Helper lọc URL ảnh hợp lệ (loại bỏ '[object Object]' hoặc chuỗi rỗng)
CREATE OR REPLACE FUNCTION public.rf_clean_photo_url(p_val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_val IS NULL THEN NULL
    WHEN btrim(p_val) = '' OR btrim(p_val) = '[object Object]' THEN NULL
    WHEN btrim(p_val) ~* '^(https?://|/|data:image/)' THEN btrim(p_val)
    ELSE NULL
  END;
$$;

-- Helper tách chuỗi ảnh ngăn cách bằng '||' thành jsonb array sạch
CREATE OR REPLACE FUNCTION public.rf_split_photo_urls(p_val text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(clean_u)
      FROM (
        SELECT public.rf_clean_photo_url(part) AS clean_u
        FROM unnest(string_to_array(COALESCE(p_val, ''), '||')) AS part
      ) t
      WHERE clean_u IS NOT NULL
    ),
    '[]'::jsonb
  );
$$;

-- 2. RPC cho khách tra cứu đơn hàng (khớp schema thực tế Orders / Production / Packings)
CREATE OR REPLACE FUNCTION public.rf_track_order(
  p_order_code text,
  p_phone_last4 text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_order_code, '')));
  v_last4 text := right(regexp_replace(COALESCE(p_phone_last4, ''), '\D', '', 'g'), 4);
  v_order record;
  v_base_code text;
  v_tracking_code text;
  v_order_phone_digits text;
  v_productions jsonb := '[]'::jsonb;
  v_first_prod jsonb;
  v_packing record;
  v_packer_name text := '';
  v_packing_status text := '';
  v_packing_photos jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vui lòng nhập mã đơn hàng.');
  END IF;

  SELECT * INTO v_order
  FROM public."Orders"
  WHERE upper(btrim(id)) = v_code
     OR upper(btrim(COALESCE("orderCode", ''))) = v_code
     OR upper(btrim(split_part(COALESCE("orderCode", ''), '|', 1))) = v_code
  ORDER BY "createdAt" DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy mã đơn hàng này.');
  END IF;

  v_order_phone_digits := regexp_replace(COALESCE(v_order.phone, ''), '\D', '', 'g');
  IF v_last4 <> '' AND length(v_order_phone_digits) >= 4 AND right(v_order_phone_digits, 4) <> v_last4 THEN
    RETURN jsonb_build_object('success', false, 'error', '4 số cuối số điện thoại chưa khớp với đơn hàng.');
  END IF;

  v_base_code := btrim(split_part(COALESCE(v_order."orderCode", ''), '|', 1));
  v_tracking_code := COALESCE(substring(COALESCE(v_order."orderCode", '') FROM 'MVĐ:\s*([A-Za-z0-9_-]+)'), '');

  -- Lấy danh sách Production của đơn (p1_user, p2_user, p1_photo, p2_photo, qc_front_photo, qc_side_photo)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', COALESCE(p.name, ''),
        'type', COALESCE(p.type, ''),
        'status', COALESCE(p.status, ''),
        'qcStatus', COALESCE(p.qc_status, ''),
        'p1Worker', COALESCE(NULLIF(btrim(p.p1_user), ''), ''),
        'p2Worker', COALESCE(NULLIF(btrim(p.p2_user), ''), ''),
        'workerName', COALESCE(
          NULLIF(btrim(p.p2_user), ''),
          NULLIF(btrim(p.p1_user), ''),
          'Đội ngũ nghệ nhân RichFish'
        ),
        'stage1Photo', COALESCE(
          public.rf_clean_photo_url(p.p1_photo),
          public.rf_clean_photo_url(p.qc_front_photo),
          ''
        ),
        'stage2Photo', COALESCE(
          public.rf_clean_photo_url(p.p2_photo),
          public.rf_clean_photo_url(p.qc_side_photo),
          ''
        )
      )
      ORDER BY p.id ASC
    ),
    '[]'::jsonb
  ) INTO v_productions
  FROM public."Production" p
  WHERE btrim(COALESCE(p."orderId", '')) IN (
    v_order.id,
    btrim(COALESCE(v_order."orderCode", '')),
    v_base_code
  )
  AND public.rf_layout_key(p.status) !~ 'huy|cancel|vo|scrap';

  v_first_prod := COALESCE(v_productions -> 0, jsonb_build_object(
    'workerName', 'Đội ngũ nghệ nhân RichFish',
    'stage1Photo', '',
    'stage2Photo', ''
  ));

  -- Lấy thông tin đóng gói từ Packings (user, photo, photoBefore)
  SELECT * INTO v_packing
  FROM public."Packings" pk
  WHERE btrim(COALESCE(pk."orderId", '')) IN (
    v_order.id,
    btrim(COALESCE(v_order."orderCode", '')),
    v_base_code
  )
  ORDER BY COALESCE(NULLIF(pk."endTime", ''), NULLIF(pk."end", ''), pk.start, pk.id) DESC
  LIMIT 1;

  IF FOUND THEN
    v_packer_name := COALESCE(NULLIF(btrim(v_packing."user"), ''), '');
    v_packing_status := COALESCE(v_packing.status, '');
    v_packing_photos := public.rf_split_photo_urls(v_packing.photo);
    IF jsonb_array_length(v_packing_photos) = 0 THEN
      v_packing_photos := public.rf_split_photo_urls(v_packing."photoBefore");
    END IF;
  END IF;

  -- Lấy lịch sử ghi chú khách gửi cho đơn
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'content', note_content,
        'createdAt', created_at,
        'isRead', is_acknowledged,
        'readBy', acknowledged_by,
        'readAt', acknowledged_at
      )
      ORDER BY created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_notes
  FROM public."Order_Customer_Alerts"
  WHERE order_id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'orderId', v_order.id,
    'orderCode', COALESCE(NULLIF(v_base_code, ''), v_order.id),
    'channel', COALESCE(v_order.channel, ''),
    'createdAt', COALESCE(v_order."createdAt", v_order.date, ''),
    'customerName', COALESCE(NULLIF(btrim(v_order.customer), ''), 'Quý khách'),
    'status', COALESCE(NULLIF(btrim(v_order.status), ''), 'Đang xử lý'),
    'items', public.rf_parse_jsonb_array(v_order.accessories),
    'trackingCode', v_tracking_code,
    'production', v_first_prod,
    'productions', v_productions,
    'packing', jsonb_build_object(
      'packerName', v_packer_name,
      'status', v_packing_status,
      'packagePhotos', v_packing_photos
    ),
    'customerNotes', v_notes
  );
END;
$$;

-- 3. RPC cho khách gửi ghi chú mới về xưởng
CREATE OR REPLACE FUNCTION public.rf_add_customer_order_note(
  p_order_code text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_order_code, '')));
  v_clean_note text := btrim(COALESCE(p_note, ''));
  v_order record;
  v_base_code text;
BEGIN
  IF v_clean_note = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vui lòng nhập nội dung ghi chú.');
  END IF;

  IF length(v_clean_note) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nội dung ghi chú tối đa 1000 ký tự.');
  END IF;

  SELECT id, "orderCode", customer INTO v_order
  FROM public."Orders"
  WHERE upper(btrim(id)) = v_code
     OR upper(btrim(COALESCE("orderCode", ''))) = v_code
     OR upper(btrim(split_part(COALESCE("orderCode", ''), '|', 1))) = v_code
  ORDER BY "createdAt" DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mã đơn hàng không hợp lệ.');
  END IF;

  v_base_code := NULLIF(btrim(split_part(COALESCE(v_order."orderCode", ''), '|', 1)), '');

  INSERT INTO public."Order_Customer_Alerts" (order_id, order_code, customer_name, note_content)
  VALUES (
    v_order.id,
    COALESCE(v_base_code, v_order.id),
    COALESCE(NULLIF(btrim(v_order.customer), ''), 'Khách hàng'),
    v_clean_note
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. RPC cho nhân viên xưởng đọc và xác nhận đã đọc ghi chú khách hàng (xác thực PIN)
CREATE OR REPLACE FUNCTION public.rf_get_unread_customer_alerts(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth record;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_auth FROM public.rf_verify_pin(p_pin);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'order_id', order_id,
        'order_code', COALESCE(order_code, order_id),
        'customer_name', COALESCE(customer_name, 'Khách hàng'),
        'note_content', note_content,
        'created_at', created_at
      )
      ORDER BY created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM public."Order_Customer_Alerts"
  WHERE is_acknowledged = false;

  RETURN jsonb_build_object('success', true, 'alerts', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.rf_acknowledge_customer_alert(
  p_pin text,
  p_alert_id uuid,
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
BEGIN
  SELECT * INTO v_auth FROM public.rf_verify_pin(p_pin);
  v_actor_name := COALESCE(NULLIF(btrim(p_actor), ''), v_auth.user_name);

  UPDATE public."Order_Customer_Alerts"
  SET is_acknowledged = true,
      acknowledged_by = v_actor_name,
      acknowledged_at = now()
  WHERE id = p_alert_id
    AND is_acknowledged = false;

  RETURN jsonb_build_object('success', true, 'acknowledgedBy', v_actor_name);
END;
$$;

REVOKE ALL ON FUNCTION public.rf_track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_track_order(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_add_customer_order_note(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_add_customer_order_note(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_get_unread_customer_alerts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_get_unread_customer_alerts(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_acknowledge_customer_alert(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_acknowledge_customer_alert(text, uuid, text) TO anon, authenticated;
