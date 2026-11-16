-- =============================================================================
-- RF WORKSPACE V2 - BẢO MẬT TRA CỨU & CHỐNG SPAM GHI CHÚ KHÁCH HÀNG
-- 1. rf_track_order: Bắt buộc 4 số cuối SĐT đối với mọi đơn có lưu SĐT;
--    che một phần tên khách đối với đơn sàn không lưu SĐT.
-- 2. rf_add_customer_order_note: Bắt buộc xác thực chính chủ (4 số cuối SĐT
--    hoặc Tên tài khoản / 4 ký tự cuối MVĐ với đơn sàn), chặn đơn hủy,
--    và chống spam 3 lớp (tối đa 2 tin chưa đọc/đơn, giãn cách 3 phút, 5 tin/24h).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rf_mask_customer_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_clean text := btrim(COALESCE(p_name, ''));
  v_len int;
BEGIN
  IF v_clean = '' THEN
    RETURN 'Quý khách';
  END IF;
  v_len := char_length(v_clean);
  IF v_len <= 2 THEN
    RETURN substr(v_clean, 1, 1) || '*';
  ELSIF v_len <= 5 THEN
    RETURN substr(v_clean, 1, 2) || repeat('*', v_len - 2);
  END IF;
  RETURN substr(v_clean, 1, 2) || repeat('*', LEAST(4, v_len - 3)) || substr(v_clean, v_len, 1);
END;
$$;

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
  v_has_phone boolean := false;
  v_productions jsonb := '[]'::jsonb;
  v_first_prod jsonb;
  v_packing record;
  v_packer_name text := '';
  v_packing_status text := '';
  v_packing_photos jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
BEGIN
  IF v_code = '' OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vui lòng nhập đúng mã đơn hàng.');
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
  v_has_phone := length(v_order_phone_digits) >= 4;

  -- Nếu đơn có lưu SĐT -> BẮT BUỘC nhập đúng 4 số cuối SĐT để tránh gõ nhầm mã đơn xem trộm
  IF v_has_phone THEN
    IF length(v_last4) <> 4 THEN
      RETURN jsonb_build_object(
        'success', false,
        'requirePhone', true,
        'error', 'Đơn hàng này yêu cầu nhập thêm 4 số cuối số điện thoại đặt hàng.'
      );
    END IF;
    IF right(v_order_phone_digits, 4) <> v_last4 THEN
      RETURN jsonb_build_object(
        'success', false,
        'requirePhone', true,
        'error', '4 số cuối số điện thoại chưa khớp với đơn hàng.'
      );
    END IF;
  END IF;

  v_base_code := btrim(split_part(COALESCE(v_order."orderCode", ''), '|', 1));
  v_tracking_code := COALESCE(substring(COALESCE(v_order."orderCode", '') FROM 'MVĐ:\s*([A-Za-z0-9_-]+)'), '');

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
    'hasPhone', v_has_phone,
    'hasTrackingCode', (v_tracking_code <> ''),
    'customerName', CASE
      WHEN v_has_phone THEN COALESCE(NULLIF(btrim(v_order.customer), ''), 'Quý khách')
      ELSE public.rf_mask_customer_name(v_order.customer)
    END,
    'status', COALESCE(NULLIF(btrim(v_order.status), ''), 'Đang xử lý'),
    'items', public.rf_parse_jsonb_array(v_order.accessories),
    'trackingCode', CASE
      WHEN v_has_phone OR v_tracking_code = '' THEN v_tracking_code
      WHEN length(v_tracking_code) <= 6 THEN '******'
      ELSE substr(v_tracking_code, 1, 6) || '******'
    END,
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

-- Xóa bản cũ 2 tham số để tránh PostgREST PGRST203 overload ambiguity
DROP FUNCTION IF EXISTS public.rf_add_customer_order_note(text, text);

CREATE OR REPLACE FUNCTION public.rf_add_customer_order_note(
  p_order_code text,
  p_note text,
  p_verify_token text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_order_code, '')));
  v_clean_note text := regexp_replace(btrim(COALESCE(p_note, '')), '\s+', ' ', 'g');
  v_verify_raw text := btrim(COALESCE(p_verify_token, ''));
  v_verify_digits text := right(regexp_replace(COALESCE(p_verify_token, ''), '\D', '', 'g'), 4);
  v_order record;
  v_base_code text;
  v_phone_digits text;
  v_mvd text;
  v_verify_upper text;
  v_pending_count int;
  v_daily_count int;
BEGIN
  IF char_length(v_clean_note) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vui lòng nhập nội dung ghi chú tối thiểu 3 ký tự.');
  END IF;

  IF char_length(v_clean_note) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nội dung ghi chú tối đa 500 ký tự.');
  END IF;

  SELECT id, "orderCode", customer, phone, status INTO v_order
  FROM public."Orders"
  WHERE upper(btrim(id)) = v_code
     OR upper(btrim(COALESCE("orderCode", ''))) = v_code
     OR upper(btrim(split_part(COALESCE("orderCode", ''), '|', 1))) = v_code
  ORDER BY "createdAt" DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mã đơn hàng không hợp lệ.');
  END IF;

  -- Chặn gửi ghi chú vào đơn đã hủy
  IF COALESCE(v_order.status, '') ~* '(huỷ|hủy|cancel)' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã hủy, không thể gửi ghi chú.');
  END IF;

  -- Lớp 1: Khóa cứng mỗi dòng đơn hàng để tránh race-condition khi spam đồng thời
  PERFORM 1 FROM public."Orders" WHERE id = v_order.id FOR UPDATE;

  -- Lớp 2: Xác thực chính chủ bắt buộc (chống gõ nhầm mã đơn rồi nhắn bậy)
  v_phone_digits := regexp_replace(COALESCE(v_order.phone, ''), '\D', '', 'g');
  v_mvd := COALESCE(substring(COALESCE(v_order."orderCode", '') FROM 'MVĐ:\s*([A-Za-z0-9_-]+)'), '');

  IF length(v_phone_digits) >= 4 THEN
    IF length(v_verify_digits) <> 4 OR right(v_phone_digits, 4) <> v_verify_digits THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cần nhập đúng 4 số cuối SĐT đặt hàng để xác thực gửi ghi chú.');
    END IF;
  ELSE
    IF v_verify_raw = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vui lòng nhập Tên tài khoản đặt hàng hoặc 4 ký tự cuối Mã Vận Đơn để xác thực.');
    END IF;

    v_verify_upper := upper(regexp_replace(v_verify_raw, '\s+', '', 'g'));
    IF NOT (
      (btrim(COALESCE(v_order.customer, '')) <> '' AND lower(btrim(v_order.customer)) = lower(v_verify_raw))
      OR (v_mvd <> '' AND length(v_verify_upper) >= 4 AND right(upper(v_mvd), 4) = right(v_verify_upper, 4))
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Thông tin xác thực (Tên tài khoản hoặc 4 ký tự cuối MVĐ) chưa khớp với đơn hàng.');
    END IF;
  END IF;

  -- Lớp 3: Chống spam hàng loạt
  SELECT count(*) INTO v_pending_count
  FROM public."Order_Customer_Alerts"
  WHERE order_id = v_order.id
    AND is_acknowledged = false;

  IF v_pending_count >= 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đang có ghi chú chờ xưởng xác nhận. Vui lòng đợi nhân viên phản hồi trước khi gửi tiếp.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."Order_Customer_Alerts"
    WHERE order_id = v_order.id
      AND created_at > now() - interval '3 minutes'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bạn vừa gửi ghi chú gần đây. Vui lòng chờ 3 phút trước khi gửi tin tiếp theo.');
  END IF;

  SELECT count(*) INTO v_daily_count
  FROM public."Order_Customer_Alerts"
  WHERE order_id = v_order.id
    AND created_at > now() - interval '24 hours';

  IF v_daily_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã đạt giới hạn tối đa 5 ghi chú trong 24 giờ.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."Order_Customer_Alerts"
    WHERE order_id = v_order.id
      AND created_at > now() - interval '24 hours'
      AND lower(note_content) = lower(v_clean_note)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nội dung ghi chú này đã được gửi trước đó.');
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

REVOKE ALL ON FUNCTION public.rf_mask_customer_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rf_track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_track_order(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rf_add_customer_order_note(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_add_customer_order_note(text, text, text) TO anon, authenticated;
