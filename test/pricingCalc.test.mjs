// Runnable test suite for src/pricingCalc.js, covering spec scenarios A-F.
// Run with: node test/pricingCalc.test.mjs
import {
  round2, computeLandedCost, computeMarginFromPrice, computeDiscountFromMsrp,
  computeSellingPriceFromMargin, computeMsrpFromDealerPrice, computeFloorPrice,
  computeDealerMargin, classifyApprovalStatus, allocateShipmentCosts,
  simulateMargin, computeDealEconomics,
} from '../src/pricingCalc.js';

let pass = 0, fail = 0;
function check(label, actual, expected, tolerance = 0.01) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  if (ok) { pass++; console.log(`  PASS  ${label} = ${actual}`); }
  else { fail++; console.log(`  FAIL  ${label} = ${actual}  (expected ${expected})`); }
}

console.log('\n--- Scenario A: Existing CRAFT 2 pricing ---');
{
  const landedCost = 28900; // given directly, as in the existing-product flow
  const dealerPrice = 41950;
  const { grossProfit, marginPct } = computeMarginFromPrice({ cost: landedCost, price: dealerPrice });
  check('Gross Profit', round2(grossProfit), 13050);
  check('Margin %', round2(marginPct), 31.11);

  const msrp = 59000;
  const discount = computeDiscountFromMsrp({ msrp, price: dealerPrice });
  check('Dealer discount from MSRP %', round2(discount), 28.90, 0.02);

  const dm = computeDealerMargin({ dealerPrice, msrp });
  check('Dealer Gross Profit (spec §12 example)', round2(dm.dealerGrossProfit), 17050);
  check('Dealer Margin % (spec §12 example)', round2(dm.dealerMarginPct), 28.90);
}

console.log('\n--- Section 3 worked example: Landed Cost breakdown ---');
{
  // HQ 24,000 + Shipping 1,000 + Duty/Tariff 3,600 (14.4% of the 25,000
  // customs base) + Brokerage 300 = 28,900
  const r = computeLandedCost({
    hqCost: 24000, allocatedShipping: 1000, dutyRatePct: 14.4, additionalTariffPct: 0, brokerageFee: 300,
  });
  check('Landed Cost (spec §3 example)', round2(r.landedCost), 28900);
}

console.log('\n--- Scenario B: New accessory pricing ---');
{
  const cost = 100;
  const dealerPrice = computeSellingPriceFromMargin({ cost, targetMarginPct: 30 });
  check('Recommended Dealer Price', round2(dealerPrice), 142.86);

  const msrp = computeMsrpFromDealerPrice({ dealerPrice, targetDealerMarginPct: 35 });
  check('Recommended MSRP', round2(msrp), 219.78);

  const dofGP = computeMarginFromPrice({ cost, price: dealerPrice });
  check('DOF Gross Profit', round2(dofGP.grossProfit), 42.86);
  check('DOF Margin % (should equal target)', round2(dofGP.marginPct), 30.00);

  const dealerGP = computeDealerMargin({ dealerPrice, msrp });
  check('Dealer Gross Profit', round2(dealerGP.dealerGrossProfit), 76.92, 0.02);
  check('Dealer Margin % (should equal target)', round2(dealerGP.dealerMarginPct), 35.00, 0.02);
}

console.log('\n--- Scenario C: Shipment freight allocation by value, multiple products ---');
{
  const lines = [
    { id: 'A', quantity: 2, purchaseValue: 20000 },
    { id: 'B', quantity: 1, purchaseValue: 5000 },
  ];
  const allocated = allocateShipmentCosts({ lines, totalFreight: 2500, brokerage: 0, otherCost: 0, method: 'value' });
  const a = allocated.find(l => l.id === 'A');
  const b = allocated.find(l => l.id === 'B');
  check('Product A allocated freight', round2(a.allocatedFreight), 2000);
  check('Product B allocated freight', round2(b.allocatedFreight), 500);
  check('Product A landed cost / unit', round2(a.computedLandedCostPerUnit), 11000);
  check('Product B landed cost / unit', round2(b.computedLandedCostPerUnit), 5500);
  const totalAllocated = round2(a.allocatedFreight + b.allocatedFreight);
  check('Allocated freight sums back to total', totalAllocated, 2500);
}

console.log('\n--- Scenario D: Discount below minimum margin -> Approval Required ---');
{
  check('Margin above target -> Within Target',
    classifyApprovalStatus({ marginPct: 32, targetMarginPct: 30, minimumMarginPct: 25 }), 'Within Target');
  check('Margin between minimum and target -> Manager Review Recommended',
    classifyApprovalStatus({ marginPct: 27, targetMarginPct: 30, minimumMarginPct: 25 }), 'Manager Review Recommended');
  check('Margin below minimum -> Approval Required',
    classifyApprovalStatus({ marginPct: 20, targetMarginPct: 30, minimumMarginPct: 25 }), 'Approval Required');

  // Minimum/floor price worked example from spec §8
  const floor = computeFloorPrice({ cost: 28900, minimumMarginPct: 30 });
  check('Floor Price (spec §8 example)', round2(floor), 41285.71);
}

console.log('\n--- Scenario E: Dealer transaction margin (separate from DOF margin) ---');
{
  const dealerPrice = 41950, msrp = 59000, landedCost = 28900;
  const dofMargin = computeMarginFromPrice({ cost: landedCost, price: dealerPrice });
  const dealerMargin = computeDealerMargin({ dealerPrice, msrp });
  check('DOF margin and Dealer margin are computed independently (not equal)',
    round2(dofMargin.marginPct) !== round2(dealerMargin.dealerMarginPct), true);
  check('DOF Margin %', round2(dofMargin.marginPct), 31.11);
  check('Dealer Margin %', round2(dealerMargin.dealerMarginPct), 28.90);
}

console.log('\n--- Scenario F: DSO multi-unit deal economics ---');
{
  const deal = computeDealEconomics({ quantity: 5, unitSellingPrice: 39000, unitCost: 28900 });
  check('Total Deal Revenue', deal.totalRevenue, 195000);
  check('Total Deal Cost', deal.totalCost, 144500);
  check('Total Deal Gross Profit', deal.grossProfit, 50500);
  check('Total Deal Margin %', round2(deal.grossMarginPct), 25.90, 0.02);
  check('Per-unit margin % matches single-unit formula', round2(deal.unitMarginPct), 25.90, 0.02);
}

console.log('\n--- Margin Simulator: Gross vs Net Deal Margin are distinct ---');
{
  const sim = simulateMargin({
    sellingPrice: 41950, cost: 28900, freightCost: 0, dutyPct: 0, tariffPct: 0,
    commission: 1500, financing: 400, installation: 600, freeAccessories: 300, other: 100,
  });
  check('Gross Profit', round2(sim.grossProfit), 13050);
  check('Gross Margin %', round2(sim.grossMarginPct), 31.11);
  check('Net Contribution (after all variable costs)', round2(sim.netContribution), 10150);
  check('Net Deal Margin % is lower than Gross Margin %', sim.netDealMarginPct < sim.grossMarginPct, true);
  check('Net Deal Margin %', round2(sim.netDealMarginPct), 24.20, 0.02);
}

console.log('\n--- Floating point safety: no drift from repeated cent-level operations ---');
{
  // 0.1 + 0.2 style traps; verifies round2 cleans up binary float noise.
  const r = computeMarginFromPrice({ cost: 10.10, price: 10.30 });
  check('Small decimal Gross Profit rounds cleanly', round2(r.grossProfit), 0.20);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
