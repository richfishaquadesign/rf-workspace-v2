create or replace function public.rf_shop_checkout(request_id uuid, customer_name text, phone_number text, delivery_address text, customer_note text, fulfillment text, items jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
 buyer uuid := auth.uid();
 order_id text := 'WEB-' || request_id::text;
 line record;
 product record;
 lines jsonb := '[]'::jsonb;
 total numeric := 0;
 stamp timestamptz := now();
begin
 if buyer is null or request_id is null then raise exception 'Đăng nhập để đặt hàng'; end if;
 perform pg_advisory_xact_lock(hashtextextended(order_id,0));
 if exists(select 1 from public."Orders" where id=order_id and customer_auth_id=buyer) then return order_id; end if;
 if coalesce(length(trim(customer_name)),0) not between 1 and 150 or coalesce(phone_number,'') !~ '^[+0-9 ()-]{8,22}$' or coalesce(fulfillment,'') not in ('giao-hang','nhan-xuong','thi-cong') or length(delivery_address)>600 or length(customer_note)>2000 or (fulfillment='giao-hang' and coalesce(length(trim(delivery_address)),0)=0) then raise exception 'Kiểm tra lại thông tin người nhận'; end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Giỏ hàng không hợp lệ'; end if;
 if jsonb_array_length(items) not between 1 and 100 then raise exception 'Giỏ hàng không hợp lệ'; end if;
 for line in select x.sku,sum(x.qty) qty,min(x.qty) min_qty,count(*) entries from jsonb_to_recordset(items) as x(sku text,qty numeric) group by x.sku order by x.sku loop
  if line.entries<>1 or line.qty is null or line.qty<>floor(line.qty) or line.qty not between 1 and 999 then raise exception 'Số lượng không hợp lệ'; end if;
  select c.*,p.id into product from public.rf_shop_catalog() c join public."Products" p on p.sku=c.sku where c.sku=line.sku;
  if not found or product.quantity<line.qty then raise exception 'Sản phẩm hết hàng hoặc không đủ số lượng'; end if;
  lines := lines || jsonb_build_array(jsonb_build_object('productId',product.id,'sku',product.sku,'name',product.name,'quantity',line.qty,'qty',line.qty,'price',product.price,'unitPrice',product.price));
  total := total+line.qty*product.price;
 end loop;
 insert into public."Orders"(id,"orderCode",channel,customer,phone,address,note,date,"createdAt",status,accessories,revenue,customer_auth_id)
 values(order_id,order_id,'Website',trim(customer_name),phone_number,delivery_address,concat_ws(E'\n',fulfillment, nullif(customer_note,'')),(stamp at time zone 'Asia/Ho_Chi_Minh')::date::text,stamp::text,'Chờ xác nhận',lines::text,total,buyer);
 return order_id;
end $$;
revoke all on function public.rf_shop_checkout(uuid,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.rf_shop_checkout(uuid,text,text,text,text,text,jsonb) to authenticated;
