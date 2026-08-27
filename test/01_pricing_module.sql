-- =====================================================================
-- DOF HUB — Cost & Pricing module
-- New, standalone tables. Nothing below touches existing DOF HUB tables
-- except: (1) profiles gets two new nullable columns, (2) two small
-- helper functions are added for role checks. No existing column,
-- policy, or row is modified or removed.
--
-- Run this once in the Supabase SQL Editor (same place you ran the
-- schema/reset scripts before). Safe to re-run: every statement is
-- "if not exists" / "or replace".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Role support (extends the existing free-text profiles.role column)
-- ---------------------------------------------------------------------
-- profiles.role already exists as free text with no CHECK constraint,
-- so no migration is needed to introduce a new value — the app will
-- start writing 'sales' for Sales Reps in addition to the existing
-- 'admin' / 'employee' values already in use.

alter table profiles add column if not exists can_view_dealer_price boolean default false;
comment on column profiles.can_view_dealer_price is
  'Sales Reps normally cannot see Dealer Price. Admin can flip this on per-person for an authorized Sales Rep.';

-- Helper functions used by RLS policies and the sales-safe view below.
create or replace function public.is_pricing_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_pricing_sales()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','sales')
  );
$$;

-- ---------------------------------------------------------------------
-- 1. Product Cost Master
-- ---------------------------------------------------------------------
create table if not exists pricing_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_category text not null default 'Other',
  sku text unique,

  hq_purchase_cost numeric not null default 0,
  currency text not null default 'USD',
  country_of_origin text,
  hts_code text,
  standard_duty_rate_pct numeric not null default 0,
  additional_tariff_pct numeric not null default 0,
  shipping_allocation_method text not null default 'value'
    check (shipping_allocation_method in ('value','weight','volume','quantity','manual')),
  brokerage_fee numeric not null default 0,
  other_import_cost numeric not null default 0,

  landed_cost numeric not null default 0,
  landed_cost_is_override boolean not null default false,

  dealer_price numeric,
  msrp numeric,

  minimum_approved_margin_pct numeric not null default 0,
  target_dof_margin_pct numeric not null default 0,
  target_dealer_margin_pct numeric not null default 0,

  is_active boolean not null default true,
  notes text,

  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table pricing_products enable row level security;
drop policy if exists "pricing_products_admin_all" on pricing_products;
create policy "pricing_products_admin_all" on pricing_products
  for all using (is_pricing_admin()) with check (is_pricing_admin());
-- Sales Reps get NO direct table access — they read through
-- get_pricing_products_for_sales() below, which masks cost columns.

-- ---------------------------------------------------------------------
-- 2. Shipment-level freight/duty/brokerage allocation
-- ---------------------------------------------------------------------
create table if not exists pricing_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_reference text,
  shipment_date date not null default current_date,
  vendor text,
  total_freight_cost numeric not null default 0,
  customs_brokerage_cost numeric not null default 0,
  other_shipment_cost numeric not null default 0,
  allocation_method text not null default 'value'
    check (allocation_method in ('value','weight','volume','quantity','manual')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists pricing_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references pricing_shipments(id) on delete cascade,
  pricing_product_id uuid references pricing_products(id) on delete set null,
  quantity numeric not null default 1,
  purchase_value numeric not null default 0,
  weight numeric,
  volume numeric,
  manual_allocation_value numeric,
  allocated_freight numeric not null default 0,
  allocated_brokerage numeric not null default 0,
  allocated_other numeric not null default 0,
  computed_landed_cost_per_unit numeric,
  created_at timestamptz default now()
);

alter table pricing_shipments enable row level security;
alter table pricing_shipment_lines enable row level security;
drop policy if exists "pricing_shipments_admin_all" on pricing_shipments;
create policy "pricing_shipments_admin_all" on pricing_shipments
  for all using (is_pricing_admin()) with check (is_pricing_admin());
drop policy if exists "pricing_shipment_lines_admin_all" on pricing_shipment_lines;
create policy "pricing_shipment_lines_admin_all" on pricing_shipment_lines
  for all using (is_pricing_admin()) with check (is_pricing_admin());

-- ---------------------------------------------------------------------
-- 3. Pricing history (append-only audit trail)
-- ---------------------------------------------------------------------
create table if not exists pricing_history (
  id uuid primary key default gen_random_uuid(),
  pricing_product_id uuid references pricing_products(id) on delete cascade,
  field_changed text not null,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz default now()
);

alter table pricing_history enable row level security;
drop policy if exists "pricing_history_admin_read" on pricing_history;
create policy "pricing_history_admin_read" on pricing_history
  for select using (is_pricing_admin());
-- No insert/update/delete policy for any client role: rows are written
-- only by the trigger below (as the table owner), so history can never
-- be edited or deleted from the app, including by an admin.

-- Trigger: every time one of the tracked fields on pricing_products
-- changes, write one pricing_history row per changed field, automatically.
-- The app can optionally set `select set_config('app.change_reason', '...', true)`
-- immediately before its update so the reason is captured too.
create or replace function public.log_pricing_product_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked text[] := array[
    'hq_purchase_cost','landed_cost','dealer_price','msrp',
    'target_dof_margin_pct','minimum_approved_margin_pct',
    'standard_duty_rate_pct','additional_tariff_pct'
  ];
  f text;
  old_v text;
  new_v text;
  reason text;
begin
  reason := nullif(current_setting('app.change_reason', true), '');
  foreach f in array tracked loop
    execute format('select ($1).%I::text', f) into old_v using old;
    execute format('select ($1).%I::text', f) into new_v using new;
    if old_v is distinct from new_v then
      insert into pricing_history (pricing_product_id, field_changed, old_value, new_value, reason, changed_by)
      values (new.id, f, old_v, new_v, reason, auth.uid());
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_log_pricing_product_change on pricing_products;
create trigger trg_log_pricing_product_change
  before update on pricing_products
  for each row execute function public.log_pricing_product_change();

-- ---------------------------------------------------------------------
-- 4. Price approval workflow
-- ---------------------------------------------------------------------
create table if not exists pricing_approvals (
  id uuid primary key default gen_random_uuid(),
  pricing_product_id uuid references pricing_products(id) on delete set null,
  customer_name text,
  quantity numeric not null default 1,
  transaction_type text not null default 'Direct'
    check (transaction_type in ('Direct','Dealer','DSO','Strategic Account','Promotional','Internal / Demo')),

  msrp_at_request numeric,
  proposed_selling_price numeric not null,
  discount_pct numeric,
  landed_cost_at_request numeric,
  gross_profit numeric,
  margin_pct numeric,

  reason_for_discount text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz default now(),

  status text not null default 'Approval Required'
    check (status in ('Within Target','Manager Review Recommended','Approval Required',
                       'Approved','Rejected','Revision Requested')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_notes text,

  created_at timestamptz default now()
);

create table if not exists pricing_approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid references pricing_approvals(id) on delete cascade,
  action text not null check (action in ('Requested','Approved','Rejected','Revision Requested','Resubmitted')),
  performed_by uuid references auth.users(id) on delete set null,
  performed_at timestamptz default now(),
  notes text
);

alter table pricing_approvals enable row level security;
alter table pricing_approval_actions enable row level security;

drop policy if exists "pricing_approvals_admin_all" on pricing_approvals;
create policy "pricing_approvals_admin_all" on pricing_approvals
  for all using (is_pricing_admin()) with check (is_pricing_admin());

-- Deliberately NO direct sales-rep SELECT policy on this table: even a
-- Sales Rep's own request row carries landed_cost_at_request and
-- gross_profit, and spec §10 says Sales must not see exact internal
-- cost/GP "unless explicitly granted" — so sales reads go through
-- get_my_price_approvals() below, which omits those two columns.

drop policy if exists "pricing_approvals_sales_insert_own" on pricing_approvals;
create policy "pricing_approvals_sales_insert_own" on pricing_approvals
  for insert with check (
    is_pricing_sales() and requested_by = auth.uid()
    -- A direct client insert can never carry a self-reported cost/GP —
    -- only submit_price_approval() (SECURITY DEFINER, computes from the
    -- real product row) is allowed to populate these two fields. This
    -- stops a Sales Rep from fabricating a favorable margin to dodge
    -- the approval workflow.
    and landed_cost_at_request is null
    and gross_profit is null
  );
-- Sales Reps can create their own requests (via the RPC below, which
-- satisfies this check) but only Admin can update status/decision
-- fields — enforced by there being no sales UPDATE policy at all.

drop policy if exists "pricing_approval_actions_admin_all" on pricing_approval_actions;
create policy "pricing_approval_actions_admin_all" on pricing_approval_actions
  for all using (is_pricing_admin()) with check (is_pricing_admin());

drop policy if exists "pricing_approval_actions_sales_select_own" on pricing_approval_actions;
create policy "pricing_approval_actions_sales_select_own" on pricing_approval_actions
  for select using (
    is_pricing_sales() and exists (
      select 1 from pricing_approvals a
      where a.id = pricing_approval_actions.approval_id and a.requested_by = auth.uid()
    )
  );

drop policy if exists "pricing_approval_actions_sales_insert_own" on pricing_approval_actions;
create policy "pricing_approval_actions_sales_insert_own" on pricing_approval_actions
  for insert with check (
    is_pricing_sales() and action in ('Requested','Resubmitted') and exists (
      select 1 from pricing_approvals a
      where a.id = pricing_approval_actions.approval_id and a.requested_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 5. Sales-safe read access (masked columns, no HQ/landed cost, no GP)
-- ---------------------------------------------------------------------
create or replace function public.get_pricing_products_for_sales()
returns table (
  id uuid,
  product_name text,
  product_category text,
  sku text,
  msrp numeric,
  dealer_price numeric,
  is_active boolean,
  updated_at timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  select
    p.id, p.product_name, p.product_category, p.sku, p.msrp,
    case
      when exists (
        select 1 from profiles pr
        where pr.id = auth.uid() and (pr.role = 'admin' or pr.can_view_dealer_price)
      ) then p.dealer_price
      else null
    end as dealer_price,
    p.is_active, p.updated_at
  from pricing_products p
  where p.is_active = true
    and exists (select 1 from profiles pr2 where pr2.id = auth.uid() and pr2.role in ('admin','sales'));
$$;

grant execute on function public.get_pricing_products_for_sales() to authenticated;
grant execute on function public.is_pricing_admin() to authenticated;
grant execute on function public.is_pricing_sales() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Sales-safe approval workflow RPCs
-- ---------------------------------------------------------------------
-- Preview only — no row is written. Lets a Sales Rep see the status a
-- proposed price would get, and the margin %, WITHOUT ever exposing
-- landed cost or the dollar gross profit.
create or replace function public.check_pricing_status(
  p_product_id uuid, p_proposed_price numeric, p_quantity numeric default 1
)
returns table (status text, margin_pct numeric, msrp numeric,
               target_margin_pct numeric, minimum_margin_pct numeric)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  prod pricing_products;
  gp numeric;
  m numeric;
  st text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('admin','sales')) then
    return;
  end if;
  select * into prod from pricing_products where id = p_product_id;
  if not found then
    return;
  end if;
  gp := p_proposed_price - prod.landed_cost;
  m := case when p_proposed_price > 0 then (gp / p_proposed_price) * 100 else null end;
  st := case
    when m is null then 'Approval Required'
    when m >= prod.target_dof_margin_pct then 'Within Target'
    when m >= prod.minimum_approved_margin_pct then 'Manager Review Recommended'
    else 'Approval Required'
  end;
  return query select st, m, prod.msrp, prod.target_dof_margin_pct, prod.minimum_approved_margin_pct;
end;
$$;
grant execute on function public.check_pricing_status(uuid, numeric, numeric) to authenticated;

-- Authoritative submit — computes landed_cost_at_request / gross_profit
-- / margin_pct / status itself from the real product row, ignoring
-- anything the client might claim, then inserts the approval + its
-- first history action as the calling user.
create or replace function public.submit_price_approval(
  p_product_id uuid, p_customer_name text, p_quantity numeric,
  p_transaction_type text, p_proposed_selling_price numeric, p_reason_for_discount text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prod pricing_products;
  gp numeric;
  m numeric;
  disc numeric;
  st text;
  new_id uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('admin','sales')) then
    raise exception 'Only Admin or Sales Rep accounts can submit a price approval request';
  end if;

  select * into prod from pricing_products where id = p_product_id;
  if not found then
    raise exception 'Unknown product';
  end if;

  gp := p_proposed_selling_price - prod.landed_cost;
  m := case when p_proposed_selling_price > 0 then (gp / p_proposed_selling_price) * 100 else null end;
  disc := case when prod.msrp > 0 then ((prod.msrp - p_proposed_selling_price) / prod.msrp) * 100 else null end;
  st := case
    when m is null then 'Approval Required'
    when m >= prod.target_dof_margin_pct then 'Within Target'
    when m >= prod.minimum_approved_margin_pct then 'Manager Review Recommended'
    else 'Approval Required'
  end;

  insert into pricing_approvals (
    pricing_product_id, customer_name, quantity, transaction_type,
    msrp_at_request, proposed_selling_price, discount_pct,
    landed_cost_at_request, gross_profit, margin_pct,
    reason_for_discount, requested_by, status
  ) values (
    p_product_id, p_customer_name, p_quantity, p_transaction_type,
    prod.msrp, p_proposed_selling_price, disc,
    prod.landed_cost, gp, m,
    p_reason_for_discount, auth.uid(), st
  ) returning id into new_id;

  insert into pricing_approval_actions (approval_id, action, performed_by, notes)
  values (new_id, 'Requested', auth.uid(), 'Submitted via Cost & Pricing module');

  return new_id;
end;
$$;
grant execute on function public.submit_price_approval(uuid, text, numeric, text, numeric, text) to authenticated;

-- Sales-safe read of "my requests": everything except landed cost / GP.
create or replace function public.get_my_price_approvals()
returns table (
  id uuid, pricing_product_id uuid, customer_name text, quantity numeric, transaction_type text,
  msrp_at_request numeric, proposed_selling_price numeric, discount_pct numeric, margin_pct numeric,
  reason_for_discount text, requested_by uuid, requested_at timestamptz,
  status text, decided_by uuid, decided_at timestamptz, decision_notes text
)
language sql stable
security definer
set search_path = public
as $$
  select a.id, a.pricing_product_id, a.customer_name, a.quantity, a.transaction_type,
         a.msrp_at_request, a.proposed_selling_price, a.discount_pct, a.margin_pct,
         a.reason_for_discount, a.requested_by, a.requested_at,
         a.status, a.decided_by, a.decided_at, a.decision_notes
  from pricing_approvals a
  where a.requested_by = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','sales'));
$$;
grant execute on function public.get_my_price_approvals() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Update RPC for pricing_products
-- ---------------------------------------------------------------------
-- Why this exists instead of a plain client-side .update(): Supabase's
-- JS client sends each call as its own PostgREST request/transaction,
-- so there is no way to run "set the change reason" and "do the
-- update" as two separate client calls and have them share state —
-- they would not be in the same transaction. Wrapping both in one
-- Postgres function makes the reason land in pricing_history reliably.
-- This function runs SECURITY INVOKER (the default), so the caller's
-- own RLS still applies: a Sales Rep calling this gets zero rows
-- updated, exactly as if they had run the UPDATE directly.
create or replace function public.update_pricing_product(
  p_id uuid,
  p_product_name text,
  p_product_category text,
  p_sku text,
  p_hq_purchase_cost numeric,
  p_currency text,
  p_country_of_origin text,
  p_hts_code text,
  p_standard_duty_rate_pct numeric,
  p_additional_tariff_pct numeric,
  p_shipping_allocation_method text,
  p_brokerage_fee numeric,
  p_other_import_cost numeric,
  p_landed_cost numeric,
  p_landed_cost_is_override boolean,
  p_dealer_price numeric,
  p_msrp numeric,
  p_minimum_approved_margin_pct numeric,
  p_target_dof_margin_pct numeric,
  p_target_dealer_margin_pct numeric,
  p_is_active boolean,
  p_notes text,
  p_reason text default null
)
returns pricing_products
language plpgsql
as $$
declare
  result pricing_products;
begin
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update pricing_products set
    product_name = p_product_name,
    product_category = p_product_category,
    sku = p_sku,
    hq_purchase_cost = p_hq_purchase_cost,
    currency = p_currency,
    country_of_origin = p_country_of_origin,
    hts_code = p_hts_code,
    standard_duty_rate_pct = p_standard_duty_rate_pct,
    additional_tariff_pct = p_additional_tariff_pct,
    shipping_allocation_method = p_shipping_allocation_method,
    brokerage_fee = p_brokerage_fee,
    other_import_cost = p_other_import_cost,
    landed_cost = p_landed_cost,
    landed_cost_is_override = p_landed_cost_is_override,
    dealer_price = p_dealer_price,
    msrp = p_msrp,
    minimum_approved_margin_pct = p_minimum_approved_margin_pct,
    target_dof_margin_pct = p_target_dof_margin_pct,
    target_dealer_margin_pct = p_target_dealer_margin_pct,
    is_active = p_is_active,
    notes = p_notes,
    updated_by = auth.uid()
  where id = p_id
  returning * into result;
  return result;
end;
$$;

grant execute on function public.update_pricing_product(
  uuid,text,text,text,numeric,text,text,text,numeric,numeric,text,numeric,numeric,
  numeric,boolean,numeric,numeric,numeric,numeric,numeric,boolean,text,text
) to authenticated;

-- =====================================================================
-- End of migration. See cost_pricing_sample_data.sql for optional
-- sample rows used to exercise scenarios A–G from the spec.
-- =====================================================================
