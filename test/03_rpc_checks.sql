\set ON_ERROR_STOP off

-- Admin calls the RPC with a reason -> should update + log with reason.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select '== T13: admin RPC update with reason ==' as check;
select (update_pricing_product(
  '99999999-9999-9999-9999-999999999999',
  'CRAFT 2 (test)','Milling Machine','CRAFT2-TEST',
  25000,'USD',null,null,0,0,'value',0,0,
  29900,true, 43000, 59000, 25, 30, 35, true, null,
  'Supplier price increase Q4'
)).*;

select '== T14: history row carries the RPC reason ==' as check;
select field_changed, old_value, new_value, reason from pricing_history
where pricing_product_id = '99999999-9999-9999-9999-999999999999'
order by changed_at desc limit 3;

reset role;

-- Sales rep calls the same RPC -> should silently affect 0 rows (RLS),
-- returning NULL, not an error and not a successful write.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select '== T15: sales RPC call should return NULL (blocked by RLS on the underlying UPDATE) ==' as check;
select update_pricing_product(
  '99999999-9999-9999-9999-999999999999',
  'HACKED','Other','X',1,'USD',null,null,0,0,'value',0,0,
  1,true,1,1,0,0,0,true,null,'should not apply'
) is null as correctly_blocked;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select '== T16: (checked as admin) product row is unchanged after the blocked sales attempt ==' as check;
select product_name, hq_purchase_cost from pricing_products where id = '99999999-9999-9999-9999-999999999999';
reset role;
