-- Expose only retail catalog fields. Internal product records remain behind RLS.
create or replace function public.rf_shop_catalog()
returns table(sku text, name text, category text, unit text, image text, price numeric, quantity numeric)
language sql stable security definer set search_path = ''
as $$
  select p.sku, p.name, p.category, p.unit, coalesce(nullif(p."realImage", ''), p.image),
         p.price, greatest(floor(p.quantity), 0)
  from public."Products" p
  where p.category in ('LAYOUT','BỂ KÍNH','PHỤ KIỆN','KHO LAYOUT')
    and nullif(btrim(p.sku),'') is not null and nullif(btrim(p.name),'') is not null
    and p.price > 0 and p.quantity >= 1
    and not exists (select 1 from public."Products" d where d.sku=p.sku and d.id<>p.id)
  order by p.name,p.sku
$$;
revoke all on function public.rf_shop_catalog() from public;
grant execute on function public.rf_shop_catalog() to anon, authenticated;
