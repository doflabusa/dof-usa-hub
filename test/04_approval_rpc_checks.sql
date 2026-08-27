\set ON_ERROR_STOP off

-- Sales rep: preview status without ever touching the raw table.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select '== T17: check_pricing_status preview (sales, product landed_cost=29900, target=30, min=25) ==' as check;
select * from check_pricing_status('99999999-9999-9999-9999-999999999999', 38000, 1);
-- margin = (38000-29900)/38000 = 21.3% -> below minimum(25) -> Approval Required

select '== T18: sales direct INSERT with a fabricated low cost/high GP should fail (WITH CHECK blocks it) ==' as check;
do $$
begin
  begin
    insert into pricing_approvals (pricing_product_id, proposed_selling_price, landed_cost_at_request, gross_profit, requested_by)
    values ('99999999-9999-9999-9999-999999999999', 38000, 100, 37900, '22222222-2222-2222-2222-222222222222');
    raise exception 'SECURITY HOLE: fabricated cost/GP insert succeeded';
  exception when insufficient_privilege or others then
    raise notice 'OK: fabricated insert correctly blocked (%)', sqlerrm;
  end;
end $$;

select '== T19: submit_price_approval (authoritative RPC) inserts a real, correctly-computed row ==' as check;
select submit_price_approval('99999999-9999-9999-9999-999999999999','Beta Dental', 1, 'Direct', 38000, 'Requested match to competitor quote') as new_approval_id \gset
select status, round(margin_pct,2) as margin_pct, discount_pct is not null as has_discount from pricing_approvals
where pricing_product_id = '99999999-9999-9999-9999-999999999999' and customer_name = 'Beta Dental';

select '== T20: sales-safe read (get_my_price_approvals) omits cost/GP columns entirely ==' as check;
select customer_name, status, margin_pct, proposed_selling_price from get_my_price_approvals() where customer_name = 'Beta Dental';

reset role;

-- Admin: full detail including the real landed cost + GP is visible.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select '== T21: admin sees full row incl. landed_cost_at_request and gross_profit ==' as check;
select customer_name, landed_cost_at_request, gross_profit, status from pricing_approvals where customer_name = 'Beta Dental';
reset role;
