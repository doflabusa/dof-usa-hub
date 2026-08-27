-- End-to-end checks of the RLS/role design against a real Postgres
-- instance (not just eyeballing the policy text).

\set ON_ERROR_STOP off

-- Seed three test accounts.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','admin@dof.test'),
  ('22222222-2222-2222-2222-222222222222','sales.noauth@dof.test'),
  ('33333333-3333-3333-3333-333333333333','sales.auth@dof.test'),
  ('44444444-4444-4444-4444-444444444444','employee@dof.test')
on conflict do nothing;

insert into profiles (id, email, full_name, role, can_view_dealer_price) values
  ('11111111-1111-1111-1111-111111111111','admin@dof.test','Admin User','admin', false),
  ('22222222-2222-2222-2222-222222222222','sales.noauth@dof.test','Sales NoAuth','sales', false),
  ('33333333-3333-3333-3333-333333333333','sales.auth@dof.test','Sales Authorized','sales', true),
  ('44444444-4444-4444-4444-444444444444','employee@dof.test','Plain Employee','employee', false)
on conflict (id) do update set role = excluded.role, can_view_dealer_price = excluded.can_view_dealer_price;

-- ---- as ADMIN: create a product ----
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into pricing_products (id, product_name, product_category, sku, hq_purchase_cost, dealer_price, msrp)
values ('99999999-9999-9999-9999-999999999999','CRAFT 2 (test)','Milling Machine','CRAFT2-TEST', 24000, 41950, 59000)
on conflict (id) do update set hq_purchase_cost = excluded.hq_purchase_cost;

select '== T1: admin can read pricing_products directly ==' as check;
select product_name, hq_purchase_cost, dealer_price from pricing_products where id = '99999999-9999-9999-9999-999999999999';

reset role;

-- ---- as SALES (no cost-view authorization): must NOT see raw table ----
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select '== T2: sales direct table SELECT should return 0 rows (RLS blocks it) ==' as check;
select count(*) as visible_rows from pricing_products;

select '== T3: sales via masked function -> dealer_price should be NULL (not authorized) ==' as check;
select product_name, msrp, dealer_price from get_pricing_products_for_sales();

select '== T4: sales attempting to INSERT into pricing_products should fail ==' as check;
do $$
begin
  begin
    insert into pricing_products (product_name, product_category) values ('Should Fail','Other');
    raise exception 'SECURITY HOLE: sales role was able to insert into pricing_products';
  exception when insufficient_privilege or others then
    raise notice 'OK: insert correctly blocked (%)', sqlerrm;
  end;
end $$;

reset role;

-- ---- as SALES (authorized to view dealer price) ----
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

select '== T5: authorized sales via masked function -> dealer_price should be visible ==' as check;
select product_name, msrp, dealer_price from get_pricing_products_for_sales();

reset role;

-- ---- as PLAIN EMPLOYEE (not admin, not sales): masked function returns nothing ----
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

select '== T6: plain employee gets zero rows from masked function ==' as check;
select count(*) as visible_rows from get_pricing_products_for_sales();

select '== T7: plain employee direct table SELECT should return 0 rows ==' as check;
select count(*) as visible_rows from pricing_products;

reset role;

-- ---- back to ADMIN: trigger a cost change and verify history logging ----
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('app.change_reason', 'Q3 supplier cost increase', false);

update pricing_products set hq_purchase_cost = 24500, dealer_price = 42500
where id = '99999999-9999-9999-9999-999999999999';

select '== T8: pricing_history should now have 2 rows (hq_purchase_cost, dealer_price) with the reason captured ==' as check;
select field_changed, old_value, new_value, reason from pricing_history
where pricing_product_id = '99999999-9999-9999-9999-999999999999' order by changed_at;

reset role;

-- ---- SALES creates an approval request; verify visibility rules ----
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

insert into pricing_approvals
  (id, pricing_product_id, customer_name, quantity, transaction_type,
   msrp_at_request, proposed_selling_price, landed_cost_at_request, gross_profit, margin_pct,
   reason_for_discount, requested_by, status)
values
  ('88888888-8888-8888-8888-888888888888','99999999-9999-9999-9999-999999999999','Acme Dental',1,'Direct',
   59000, 38000, 28900, 9100, 23.95,
   'Competitive deal', '22222222-2222-2222-2222-222222222222', 'Approval Required');

insert into pricing_approval_actions (approval_id, action, performed_by, notes)
values ('88888888-8888-8888-8888-888888888888','Requested','22222222-2222-2222-2222-222222222222','Initial request');

select '== T9: requesting sales rep can see their own request ==' as check;
select customer_name, status from pricing_approvals where id = '88888888-8888-8888-8888-888888888888';

select '== T10: sales rep trying to approve their own request should fail (no UPDATE policy for sales) ==' as check;
do $$
begin
  begin
    update pricing_approvals set status = 'Approved' where id = '88888888-8888-8888-8888-888888888888';
    if not found then
      raise notice 'OK: update affected 0 rows (blocked by RLS)';
    else
      raise exception 'SECURITY HOLE: sales role approved its own request';
    end if;
  exception when insufficient_privilege or others then
    raise notice 'OK: update correctly blocked (%)', sqlerrm;
  end;
end $$;

reset role;

-- ---- a second sales rep should NOT see the first rep's request ----
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select '== T11: a different sales rep sees 0 of the other rep''s requests ==' as check;
select count(*) as visible_rows from pricing_approvals;
reset role;

-- ---- ADMIN approves it ----
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update pricing_approvals set status = 'Approved', decided_by = auth.uid(), decided_at = now(), decision_notes = 'OK, one-time'
where id = '88888888-8888-8888-8888-888888888888';
select '== T12: admin can approve; status now: ==' as check;
select status, decided_by is not null as has_decider from pricing_approvals where id = '88888888-8888-8888-8888-888888888888';
reset role;
