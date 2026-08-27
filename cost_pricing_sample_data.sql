-- Optional sample data for the Cost & Pricing module.
-- Run AFTER cost_pricing_module.sql. Safe to skip entirely — the module
-- works with an empty pricing_products table (you'd just start by
-- adding your first product in Product Cost Master).
--
-- These rows reproduce the worked examples from the spec so you can
-- open the module and see real numbers immediately: CRAFT 2 (existing
-- product, §5), a new accessory (§6), and a couple more for the
-- Dashboard / Margin Simulator to have something to show.

insert into pricing_products (
  product_name, product_category, sku,
  hq_purchase_cost, currency, country_of_origin, hts_code,
  standard_duty_rate_pct, additional_tariff_pct, shipping_allocation_method,
  brokerage_fee, other_import_cost,
  landed_cost, landed_cost_is_override,
  dealer_price, msrp,
  minimum_approved_margin_pct, target_dof_margin_pct, target_dealer_margin_pct,
  is_active, notes
) values
  ('CRAFT 2','Milling Machine','CRAFT2-MILL',
   24000,'USD','South Korea','8459.61',
   14.4, 0,'value',
   300, 0,
   28900, true,        -- matches the spec's own worked example exactly
   41950, 59000,
   25, 30, 35,
   true, 'Seed data reproducing spec §3/§5 worked example.'),

  ('FREEDOM Air','Intraoral Scanner','FREEDOM-AIR',
   5000,'USD','South Korea','9018.19',
   0, 0,'value',
   0, 0,
   5000, true,
   9900, 12900,
   30, 30, 20,
   true, 'Seed data reproducing spec §COGS example (GP $4,900 / 49.49%).'),

  ('Standard Accessory Kit','Accessory','ACC-STD-100',
   100,'USD','USA', null,
   0, 0,'value',
   0, 0,
   100, false,          -- NOT overridden -> Product Cost Master will auto-calc = 100 (no duty/tariff/brokerage set)
   null, null,           -- dealer price / MSRP intentionally blank: use MSRP Calculator (spec §6) to generate them
   20, 30, 35,
   true, 'Seed data for spec §6 "new accessory" scenario — open MSRP Calculator and pick this product.')
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------
-- Granting the 'sales' role and (optionally) dealer-price visibility to
-- an existing DOF HUB user. Replace the email with a real one from
-- your `profiles` table.
-- ---------------------------------------------------------------------
-- update profiles set role = 'sales', can_view_dealer_price = false
--   where email = 'salesperson@doflab.com';
--
-- To let that specific Sales Rep also see Dealer Price (spec §10,
-- "unless explicitly granted permission"):
-- update profiles set can_view_dealer_price = true
--   where email = 'salesperson@doflab.com';
