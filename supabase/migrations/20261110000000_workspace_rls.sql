alter table public."Orders" add column customer_auth_id uuid references auth.users(id);
create index orders_customer_auth_id_idx on public."Orders"(customer_auth_id);
do $$
declare t record;
begin
 if (select count(*) from pg_policies where schemaname='public' and (policyname='rf_full_access' or policyname='Allow public read-write ' || tablename) and qual='true' and with_check='true') <> 23 then raise exception 'Unexpected baseline'; end if;
 for t in select tablename, policyname from pg_policies where schemaname='public' and (policyname='rf_full_access' or policyname='Allow public read-write ' || tablename) loop
 execute format('drop policy %I on public.%I', t.policyname, t.tablename);
 execute format('revoke all on public.%I from public, anon, authenticated', t.tablename);
 execute format('grant select, insert, update, delete on public.%I to authenticated', t.tablename);
 execute format('create policy rf_owner on public.%I for all to authenticated using ((select auth.jwt())->''app_metadata''->>''rf_role'' = ''TỐI CAO'')',t.tablename);
 execute format('create policy rf_manager on public.%I for all to authenticated using ((select auth.jwt())->''app_metadata''->>''rf_role'' = ''Quản trị'' and ((select auth.jwt())->''app_metadata''->''rf_tables'') ? %L)',t.tablename,t.tablename);
 if t.tablename in ('Production','Packings','Orders') then
 execute format('create policy rf_assigned on public.%I for select to authenticated using ((select auth.jwt())->''app_metadata''->>''rf_role'' = ''Nhân viên'' and ((select auth.jwt())->''app_metadata''->''rf_assignments''->%L) ? id::text)',t.tablename,t.tablename);
 end if;
 end loop;
end $$;
create policy rf_customer_orders on public."Orders" for select to authenticated using (customer_auth_id = (select auth.uid()));
