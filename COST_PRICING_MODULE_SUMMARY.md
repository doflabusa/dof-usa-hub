# DOF HUB — Cost & Pricing Module: What Was Built

Standalone module, built and wired in per your 5-step process (inspect → identify patterns → propose → explain migration → implement). Nothing in the existing app was rebuilt — only three small, additive edits touch `src/main.jsx` (see §5).

## 1. Files changed / added

| File | Status | What |
|---|---|---|
| `cost_pricing_module.sql` | **new** | The full migration: 6 tables, 2 profile columns, 7 functions (RLS helpers + 2 masking RPCs + 2 approval-workflow RPCs + 1 update RPC), and every RLS policy. Run this once in the Supabase SQL Editor. |
| `cost_pricing_sample_data.sql` | **new**, optional | Seeds 3 products (incl. the exact CRAFT 2 numbers from your spec) so the module isn't empty on first open. Includes commented `UPDATE` snippets for granting the `sales` role and dealer-price visibility to a real user. |
| `src/pricingCalc.js` | **new** | Pure calculation functions (no React/Supabase) — landed cost, margin (not markup), floor price, freight allocation, margin simulator, deal economics. Unit tested standalone. |
| `src/pricing.jsx` | **new** | The entire module UI: `CostPricingModule` component, 8 tabs, all forms/tables. Imported by `main.jsx`, otherwise fully self-contained. |
| `src/main.jsx` | **edited** (+7 lines) | 1 import line, 1 `isSales` line, 1 new `pricingMenu` constant, 1 nav-array edit to include it for admin/sales, 1 new render block for the `Cost & Pricing` page. Nothing existing was touched. |
| `src/styles.css` | **edited** (+8 lines) | One new `/* v27 cost & pricing module */` block (tab bar, status badges), following the same versioned-comment convention already in the file. |

## 2. Schema (see `cost_pricing_module.sql` for the authoritative source)

- **`pricing_products`** — the Product Cost Master (spec §2): every cost/pricing field you listed, plus `landed_cost_is_override` so Admin can freeze the auto-calculated value.
- **`pricing_shipments`** + **`pricing_shipment_lines`** — shipment-level freight/duty/brokerage allocation (spec §4). Submitting one updates each linked product's `landed_cost` automatically (unless that product is override-locked), and the shipment + its lines stay on file permanently for audit.
- **`pricing_history`** — append-only audit trail. A **database trigger** (not app code) fires on every `UPDATE` to `pricing_products` and logs one row per changed field (HQ cost, landed cost, dealer price, MSRP, target/minimum margins, duty/tariff rates) — so it can't be skipped by forgetting to call a logging function. The app passes a `reason` through the update RPC and the trigger attaches it automatically.
- **`pricing_approvals`** + **`pricing_approval_actions`** — the approval workflow (spec §9) and its history.
- **`profiles`** gets two new nullable columns: `can_view_dealer_price` (bool) — no change to the existing `role` column, since it was already free text; the app now also writes `'sales'` there.

## 3. Role-based cost visibility — how it actually works

Your spec was explicit that Sales Reps must not see HQ cost, exact landed cost, or exact GP "unless explicitly granted." Because Supabase gives every logged-in user the same underlying Postgres role (`authenticated`) — the admin/sales distinction is only a value in your `profiles.role` column — plain row-level security can't mask *columns*. So:

- `pricing_products`, `pricing_shipments/lines`, and `pricing_history` all have RLS that allows **Admin only**, full stop. A Sales Rep querying these tables directly (e.g. from browser devtools) gets **zero rows**, not an error.
- Sales Reps read products through `get_pricing_products_for_sales()` — a `SECURITY DEFINER` function that returns only `product_name / category / sku / msrp` and *masks* `dealer_price` to `null` unless that specific user has `can_view_dealer_price = true`.
- Sales Reps submit approval requests through `submit_price_approval()` — the function itself looks up the real landed cost and computes GP/margin/status; it does **not** trust anything the client sends for those fields. A direct client `INSERT` that tries to fake a low cost / high GP is rejected by a `WITH CHECK` constraint that requires those two columns to be `null` on any non-RPC insert.
- Sales Reps read their own requests through `get_my_price_approvals()`, which omits `landed_cost_at_request` and `gross_profit` entirely — even on their own submitted deals.
- `check_pricing_status()` lets a Sales Rep preview the margin status (Within Target / Manager Review / Approval Required) and the margin %, MSRP, and thresholds for a proposed price — without ever returning cost or GP.

I found and closed one real gap while building this: my first draft let a Sales Rep insert an approval row with a self-reported cost/GP directly (RLS checked *who* was inserting, not whether the numbers were honest). Fixed via the `WITH CHECK` constraint above — verified with a test that deliberately tries the exploit (see §4).

## 4. Verification — not just reviewed, actually run

This sandbox has a real local Postgres 16, so I stood up a scratch database, applied the exact migration file, and ran it end-to-end rather than only reading the SQL:

- **35/35** pass in `test/pricingCalc.test.mjs` (`node test/pricingCalc.test.mjs`) — every worked example from your spec reproduces exactly: $28,900 landed cost, 31.11% / 28.90% margins, $142.86 / $219.78 new-product pricing, $41,285.71 floor price, the value-based freight allocation split, and the Gross vs. Net Deal Margin distinction.
- **22/22** pass across `test/02_rls_checks.sql`, `test/03_rpc_checks.sql`, `test/04_approval_rpc_checks.sql` — real Postgres sessions simulating an Admin, an unauthorized Sales Rep, an authorized Sales Rep, and a plain Employee, confirming: cost tables are invisible to non-admins, masked reads work correctly, direct writes are blocked, the audit trigger captures the reason, fabricated approval inserts are rejected, and the authoritative RPC computes real numbers.
- `src/main.jsx` and `src/pricing.jsx` both pass an `esbuild` JSX syntax check, and every state setter / calculation function referenced in `pricing.jsx` was cross-checked against its declaration — no orphaned calls.

What I could **not** run here: an actual `npm install && npm run build` (this sandbox's npm registry access is blocked — same limitation as last time). Please run that once locally before deploying.

## 5. Test scenarios A–G, where to see them

| Scenario | Where |
|---|---|
| A. Existing CRAFT 2 pricing | Product Cost Master (seeded) or Dealer Price Calculator tab |
| B. New accessory, cost + targets → dealer/MSRP | MSRP Calculator tab, pick "Standard Accessory Kit" |
| C. Shipment freight allocation, multi-product, by value | Landed Cost Calculator tab → Shipment Freight Allocation |
| D. Discount below minimum margin → Approval Required | Price Approval tab, propose a low price on any seeded product |
| E. Dealer transaction margin, separate from DOF margin | Dealer Price Calculator tab (shows both side by side) |
| F. DSO multi-unit deal economics | Margin Simulator tab, set Quantity > 1 |
| G. Cost visibility (Admin sees, Sales doesn't) | Verified in Postgres directly (§4) — to see it in the app, set a test user's `profiles.role = 'sales'` and log in as them |

## 6. Deploying this

1. Run `cost_pricing_module.sql` in the Supabase SQL Editor (idempotent — safe to re-run).
2. Optionally run `cost_pricing_sample_data.sql`.
3. `npm install && npm run build` locally to confirm the build, then deploy as usual (Vercel config unchanged).
4. To let someone use the Sales side, run the commented `UPDATE profiles SET role = 'sales', ...` snippet at the bottom of the sample-data file with their real email.

## 7. Deliberately out of scope / left for follow-up

- A separate **Finance** role — your spec's Cost & Pricing section only names Admin/Managing Director and Sales Rep, so I gated strictly to `role in ('admin','sales')`. Adding a `'finance'` read-only role is a small follow-up if you want it.
- `pricing_approval_actions` (the action-by-action history) is fully captured in the database but not yet rendered in the UI — currently you only see current status, not the full "Requested → Revision Requested → Resubmitted → Approved" trail. Easy to add as a detail view.
- The Dashboard's "Current Tariff Impact" is an estimate (Additional Tariff % × HQ Cost per active product) — it doesn't yet fold in a per-shipment allocated freight, since that's shipment-specific, not product-specific.
- Per your §18, nothing here reaches into Quote Builder / CRM / Commission Calculator — this is intentionally the standalone first step.
