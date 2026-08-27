// Pure, framework-free financial calculations for the Cost & Pricing
// module. No React/Supabase imports here on purpose: this file is unit
// tested standalone (see test/pricingCalc.test.mjs) and imported by
// src/pricing.jsx.
//
// Rounding rule (per spec §16): compute every intermediate value at
// full floating-point precision; round2() is applied only at the final
// display/storage step, never fed back into a further calculation.

export function round2(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function pct2(n) {
  return round2(n);
}

// ---------------------------------------------------------------------
// Landed cost (spec §3)
// ---------------------------------------------------------------------
// dutyBase defaults to HQ cost + allocated shipping (a CIF-style customs
// value), which is standard import-duty practice and reconciles with
// the worked example in the spec (24,000 + 1,000 base, 14.4% combined
// duty/tariff rate -> 3,600 duty+tariff, + 300 brokerage = 28,900).
export function computeLandedCost({
  hqCost = 0,
  allocatedShipping = 0,
  dutyRatePct = 0,
  additionalTariffPct = 0,
  dutyBase,
  brokerageFee = 0,
  otherImportCost = 0,
}) {
  const base = dutyBase ?? (hqCost + allocatedShipping);
  const duty = base * (dutyRatePct / 100);
  const tariff = base * (additionalTariffPct / 100);
  const landedCost = hqCost + allocatedShipping + duty + tariff + brokerageFee + otherImportCost;
  return {
    hqCost, allocatedShipping, dutyBase: base, duty, tariff, brokerageFee, otherImportCost,
    landedCost,
  };
}

// ---------------------------------------------------------------------
// Existing Product Mode (spec §5): landed cost + dealer price -> margin
// ---------------------------------------------------------------------
export function computeMarginFromPrice({ cost, price }) {
  if (!price) return { grossProfit: null, marginPct: null };
  const grossProfit = price - cost;
  const marginPct = (grossProfit / price) * 100;
  return { grossProfit, marginPct };
}

// Dealer discount from MSRP (spec §5 "also show")
export function computeDiscountFromMsrp({ msrp, price }) {
  if (!msrp) return null;
  return ((msrp - price) / msrp) * 100;
}

// ---------------------------------------------------------------------
// New Product / Part Pricing Mode (spec §6)
// Selling Price = Cost / (1 - Target Margin)   <-- margin, NOT markup
// ---------------------------------------------------------------------
export function computeSellingPriceFromMargin({ cost, targetMarginPct }) {
  const denom = 1 - targetMarginPct / 100;
  if (denom <= 0) return null; // 100%+ target margin is not mathematically solvable
  return cost / denom;
}

export function computeMsrpFromDealerPrice({ dealerPrice, targetDealerMarginPct }) {
  const denom = 1 - targetDealerMarginPct / 100;
  if (denom <= 0) return null;
  return dealerPrice / denom;
}

// ---------------------------------------------------------------------
// Floor / minimum price (spec §8)
// ---------------------------------------------------------------------
export function computeFloorPrice({ cost, minimumMarginPct }) {
  const denom = 1 - minimumMarginPct / 100;
  if (denom <= 0) return null;
  return cost / denom;
}

// ---------------------------------------------------------------------
// Dealer margin calculator (spec §12)
// ---------------------------------------------------------------------
export function computeDealerMargin({ dealerPrice, msrp }) {
  if (!msrp) return { dealerGrossProfit: null, dealerMarginPct: null };
  const dealerGrossProfit = msrp - dealerPrice;
  const dealerMarginPct = (dealerGrossProfit / msrp) * 100;
  return { dealerGrossProfit, dealerMarginPct };
}

// ---------------------------------------------------------------------
// Approval status classification (spec §9)
// ---------------------------------------------------------------------
export function classifyApprovalStatus({ marginPct, targetMarginPct, minimumMarginPct }) {
  if (marginPct === null || marginPct === undefined) return 'Approval Required';
  if (marginPct >= targetMarginPct) return 'Within Target';
  if (marginPct >= minimumMarginPct) return 'Manager Review Recommended';
  return 'Approval Required';
}

// ---------------------------------------------------------------------
// Shipment freight/brokerage/other-cost allocation (spec §4)
// lines: [{ id, quantity, purchaseValue, weight, volume, manualAllocationValue }]
// purchaseValue is the line's EXTENDED value (quantity x unit cost).
// method: 'value' | 'weight' | 'volume' | 'quantity' | 'manual'
// ---------------------------------------------------------------------
export function allocateShipmentCosts({ lines, totalFreight = 0, brokerage = 0, otherCost = 0, method = 'value' }) {
  const basisFor = (line) => {
    switch (method) {
      case 'weight': return (line.weight || 0) * (line.quantity || 1);
      case 'volume': return (line.volume || 0) * (line.quantity || 1);
      case 'quantity': return line.quantity || 0;
      case 'manual': return line.manualAllocationValue || 0;
      case 'value':
      default: return line.purchaseValue || 0;
    }
  };

  const totalBasis = lines.reduce((sum, l) => sum + basisFor(l), 0);

  return lines.map((line) => {
    const share = totalBasis > 0 ? basisFor(line) / totalBasis : (lines.length ? 1 / lines.length : 0);
    const allocatedFreight = totalFreight * share;
    const allocatedBrokerage = brokerage * share;
    const allocatedOther = otherCost * share;
    const qty = line.quantity || 1;
    const computedLandedCostPerUnit =
      (line.purchaseValue + allocatedFreight + allocatedBrokerage + allocatedOther) / qty;
    return {
      ...line,
      allocatedFreight,
      allocatedBrokerage,
      allocatedOther,
      computedLandedCostPerUnit,
    };
  });
}

// ---------------------------------------------------------------------
// Margin Simulator (spec §7) — cascading Gross Margin -> Net Deal Margin
// ---------------------------------------------------------------------
export function simulateMargin({
  sellingPrice = 0,
  cost = 0, // base landed cost of the unit(s) being simulated
  freightCost = 0,
  dutyPct = 0,
  tariffPct = 0,
  commission = 0,
  financing = 0,
  installation = 0,
  freeAccessories = 0,
  other = 0,
}) {
  const duty = sellingPrice * (dutyPct / 100);
  const tariff = sellingPrice * (tariffPct / 100);
  const totalCost = cost + freightCost + duty + tariff;

  const grossProfit = sellingPrice - totalCost;
  const grossMarginPct = sellingPrice ? (grossProfit / sellingPrice) * 100 : null;

  const afterCommission = grossProfit - commission;
  const afterFinancing = afterCommission - financing;
  const netContribution = afterFinancing - installation - freeAccessories - other;

  const marginAfterCommissionPct = sellingPrice ? (afterCommission / sellingPrice) * 100 : null;
  const marginAfterFinancingPct = sellingPrice ? (afterFinancing / sellingPrice) * 100 : null;
  const netDealMarginPct = sellingPrice ? (netContribution / sellingPrice) * 100 : null;

  return {
    totalCost, grossProfit, grossMarginPct,
    afterCommission, marginAfterCommissionPct,
    afterFinancing, marginAfterFinancingPct,
    netContribution, netDealMarginPct,
  };
}

// ---------------------------------------------------------------------
// Deal economics for Dealer / DSO / Strategic multi-unit deals (spec §11)
// ---------------------------------------------------------------------
export function computeDealEconomics({ quantity = 1, unitSellingPrice = 0, unitCost = 0 }) {
  const totalRevenue = quantity * unitSellingPrice;
  const totalCost = quantity * unitCost;
  const grossProfit = totalRevenue - totalCost;
  const grossMarginPct = totalRevenue ? (grossProfit / totalRevenue) * 100 : null;
  const unitMarginPct = unitSellingPrice ? ((unitSellingPrice - unitCost) / unitSellingPrice) * 100 : null;
  return { totalRevenue, totalCost, grossProfit, grossMarginPct, unitMarginPct, quantity };
}
