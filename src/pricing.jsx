// DOF HUB — Cost & Pricing module.
// Self-contained on purpose: keeps this large module out of main.jsx so
// the existing, already-tested pages there are untouched. main.jsx only
// needs to import CostPricingModule and render it for one nav item.
//
// Data access pattern:
//  - Admin reads/writes pricing_products, pricing_shipments/lines,
//    pricing_history and pricing_approvals directly (RLS restricts all
//    of these to the 'admin' profile role — see cost_pricing_module.sql).
//  - Sales Reps never touch those tables directly. They go through
//    SECURITY DEFINER RPCs (get_pricing_products_for_sales,
//    check_pricing_status, submit_price_approval, get_my_price_approvals)
//    that compute/mask server-side, so HQ cost / landed cost / exact GP
//    never reach the browser for that role, even via devtools.
import React, { useEffect, useMemo, useState } from 'react';
import {
  round2, computeLandedCost, computeMarginFromPrice, computeDiscountFromMsrp,
  computeSellingPriceFromMargin, computeMsrpFromDealerPrice, computeFloorPrice,
  computeDealerMargin, classifyApprovalStatus, allocateShipmentCosts,
  simulateMargin, computeDealEconomics,
} from './pricingCalc.js';

const PRICING_CATEGORIES = ['Milling Machine','Scanner','Accessory','Consumable','Part','Software','Other'];
const TRANSACTION_TYPES = ['Direct','Dealer','DSO','Strategic Account','Promotional','Internal / Demo'];
const ALLOCATION_METHODS = [['value','By Purchase Value'],['weight','By Weight'],['volume','By Volume'],['quantity','By Quantity'],['manual','Manual Allocation']];
const TABS_ADMIN = ['Dashboard','Product Cost Master','Landed Cost Calculator','Dealer Price Calculator','MSRP Calculator','Margin Simulator','Price Approval','Pricing History'];
const TABS_SALES = ['Price Approval','Product List'];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function orNull(v) { return v === '' || v === null || v === undefined ? null : v; }
function money(n) { return (n===null||n===undefined||Number.isNaN(Number(n))) ? '-' : '$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pctFmt(n) { return (n===null||n===undefined||Number.isNaN(Number(n))) ? '-' : Number(n).toFixed(2)+'%'; }

function Card({title,action,children}) { return <section className="card"><div className="head"><h2>{title}</h2>{action}</div>{children}</section>; }
function Table({headers,rows}) { return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table>; }
function Empty({text}) { return <div className="empty">{text}</div>; }
function KPI({title,value,icon}) { return <div className="kpi"><div><span>{title}</span><strong>{value}</strong></div><em>{icon}</em></div>; }

function StatusBadge({status}) {
  const cls = (status==='Within Target'||status==='Approved') ? 'pxBadge pxOk'
    : status==='Manager Review Recommended' ? 'pxBadge pxWarn'
    : (status==='Approval Required'||status==='Rejected') ? 'pxBadge pxDanger'
    : 'pxBadge';
  return <span className={cls}>{status || '-'}</span>;
}

function emptyProductForm() {
  return {
    product_name:'', product_category:'Milling Machine', sku:'',
    hq_purchase_cost:'', currency:'USD', country_of_origin:'', hts_code:'',
    standard_duty_rate_pct:'', additional_tariff_pct:'', shipping_allocation_method:'value',
    brokerage_fee:'', other_import_cost:'',
    landed_cost:'', landed_cost_is_override:false,
    dealer_price:'', msrp:'',
    minimum_approved_margin_pct:'', target_dof_margin_pct:'', target_dealer_margin_pct:'',
    is_active:true, notes:'', reason:'',
  };
}
function emptyShipmentForm() {
  return { shipment_reference:'', shipment_date:'', vendor:'', total_freight_cost:'', customs_brokerage_cost:'', other_shipment_cost:'', allocation_method:'value', notes:'' };
}
function emptyApprovalForm() {
  return { pricing_product_id:'', customer_name:'', quantity:1, transaction_type:'Direct', proposed_selling_price:'', reason_for_discount:'' };
}

export default function CostPricingModule({ supabase, session, profile }) {
  const isAdmin = profile?.role === 'admin';
  const isSales = profile?.role === 'sales';
  const hasAccess = isAdmin || isSales;
  const canSeeCost = isAdmin;

  const [tab, setTab] = useState(isAdmin ? 'Dashboard' : 'Price Approval');
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [approvalActions, setApprovalActions] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [productForm, setProductForm] = useState(emptyProductForm());
  const [editingProductId, setEditingProductId] = useState(null);
  const [productSearch, setProductSearch] = useState('');

  const [shipmentForm, setShipmentForm] = useState(emptyShipmentForm());
  const [shipmentLines, setShipmentLines] = useState([]);
  const [landedCalcProductId, setLandedCalcProductId] = useState('');

  const [dealerCalcProductId, setDealerCalcProductId] = useState('');
  const [dealerCalcInput, setDealerCalcInput] = useState({ landed_cost:'', dealer_price:'' });

  const [msrpCalcProductId, setMsrpCalcProductId] = useState('');
  const [msrpCalcInput, setMsrpCalcInput] = useState({ landed_cost:'', target_dof_margin_pct:'', target_dealer_margin_pct:'', minimum_approved_margin_pct:'' });

  const [simProductId, setSimProductId] = useState('');
  const [simInput, setSimInput] = useState({ sellingPrice:'', cost:'', freightCost:0, dutyPct:0, tariffPct:0, commission:0, financing:0, installation:0, freeAccessories:0, other:0, quantity:1 });

  const [approvalForm, setApprovalForm] = useState(emptyApprovalForm());
  const [approvalPreview, setApprovalPreview] = useState(null);

  const [historyProductFilter, setHistoryProductFilter] = useState('All');

  useEffect(() => { if (hasAccess) loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() {
    setError('');
    try {
      const pr = await supabase.from('profiles').select('id, full_name, email');
      setProfiles(pr.data || []);

      if (isAdmin) {
        const [p, h, ap, aa, sh] = await Promise.all([
          supabase.from('pricing_products').select('*').order('product_name', { ascending: true }),
          supabase.from('pricing_history').select('*').order('changed_at', { ascending: false }).limit(300),
          supabase.from('pricing_approvals').select('*').order('requested_at', { ascending: false }),
          supabase.from('pricing_approval_actions').select('*').order('performed_at', { ascending: false }),
          supabase.from('pricing_shipments').select('*, pricing_shipment_lines(*)').order('created_at', { ascending: false }),
        ]);
        if (p.error) setError('Product load error: ' + p.error.message);
        setProducts(p.data || []);
        setHistory(h.data || []);
        setApprovals(ap.data || []);
        setApprovalActions(aa.data || []);
        setShipments(sh.data || []);
      } else if (isSales) {
        const { data, error: rpcErr } = await supabase.rpc('get_pricing_products_for_sales');
        if (rpcErr) setError('Product load error: ' + rpcErr.message);
        setProducts(data || []);
        const ap = await supabase.rpc('get_my_price_approvals');
        if (ap.error) setError('Approvals load error: ' + ap.error.message);
        setApprovals(ap.data || []);
      }
    } catch (e) {
      setError('Load error: ' + e.message);
    }
  }

  function productLookup(id) { return products.find(p => p.id === id) || null; }
  function profileName(id) { const p = profiles.find(x => x.id === id); return p?.full_name || p?.email || '-'; }

  // ---------------------------------------------------------------
  // Product Cost Master
  // ---------------------------------------------------------------
  function editProduct(row) {
    setEditingProductId(row.id);
    setProductForm({
      product_name: row.product_name || '', product_category: row.product_category || 'Other', sku: row.sku || '',
      hq_purchase_cost: row.hq_purchase_cost ?? '', currency: row.currency || 'USD',
      country_of_origin: row.country_of_origin || '', hts_code: row.hts_code || '',
      standard_duty_rate_pct: row.standard_duty_rate_pct ?? '', additional_tariff_pct: row.additional_tariff_pct ?? '',
      shipping_allocation_method: row.shipping_allocation_method || 'value',
      brokerage_fee: row.brokerage_fee ?? '', other_import_cost: row.other_import_cost ?? '',
      landed_cost: row.landed_cost ?? '', landed_cost_is_override: !!row.landed_cost_is_override,
      dealer_price: row.dealer_price ?? '', msrp: row.msrp ?? '',
      minimum_approved_margin_pct: row.minimum_approved_margin_pct ?? '', target_dof_margin_pct: row.target_dof_margin_pct ?? '',
      target_dealer_margin_pct: row.target_dealer_margin_pct ?? '', is_active: row.is_active !== false, notes: row.notes || '', reason: '',
    });
    setTab('Product Cost Master');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelProductEdit() { setEditingProductId(null); setProductForm(emptyProductForm()); }

  const productFormLandedPreview = useMemo(() => computeLandedCost({
    hqCost: num(productForm.hq_purchase_cost), allocatedShipping: 0,
    dutyRatePct: num(productForm.standard_duty_rate_pct), additionalTariffPct: num(productForm.additional_tariff_pct),
    brokerageFee: num(productForm.brokerage_fee), otherImportCost: num(productForm.other_import_cost),
  }), [productForm]);

  async function saveProduct(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!productForm.product_name.trim()) return setError('Product Name is required.');
    const landedCostToSave = productForm.landed_cost_is_override ? num(productForm.landed_cost) : round2(productFormLandedPreview.landedCost);

    if (editingProductId) {
      const { data, error: rpcErr } = await supabase.rpc('update_pricing_product', {
        p_id: editingProductId,
        p_product_name: productForm.product_name, p_product_category: productForm.product_category, p_sku: orNull(productForm.sku),
        p_hq_purchase_cost: num(productForm.hq_purchase_cost), p_currency: productForm.currency || 'USD',
        p_country_of_origin: orNull(productForm.country_of_origin), p_hts_code: orNull(productForm.hts_code),
        p_standard_duty_rate_pct: num(productForm.standard_duty_rate_pct), p_additional_tariff_pct: num(productForm.additional_tariff_pct),
        p_shipping_allocation_method: productForm.shipping_allocation_method,
        p_brokerage_fee: num(productForm.brokerage_fee), p_other_import_cost: num(productForm.other_import_cost),
        p_landed_cost: landedCostToSave, p_landed_cost_is_override: !!productForm.landed_cost_is_override,
        p_dealer_price: productForm.dealer_price === '' ? null : num(productForm.dealer_price),
        p_msrp: productForm.msrp === '' ? null : num(productForm.msrp),
        p_minimum_approved_margin_pct: num(productForm.minimum_approved_margin_pct),
        p_target_dof_margin_pct: num(productForm.target_dof_margin_pct), p_target_dealer_margin_pct: num(productForm.target_dealer_margin_pct),
        p_is_active: !!productForm.is_active, p_notes: orNull(productForm.notes), p_reason: orNull(productForm.reason),
      });
      if (rpcErr) return setError('Save error: ' + rpcErr.message);
      if (!data) return setError('Update did not apply — you may not have permission.');
      setNotice('Product updated.');
    } else {
      const { error: insErr } = await supabase.from('pricing_products').insert({
        product_name: productForm.product_name, product_category: productForm.product_category, sku: orNull(productForm.sku),
        hq_purchase_cost: num(productForm.hq_purchase_cost), currency: productForm.currency || 'USD',
        country_of_origin: orNull(productForm.country_of_origin), hts_code: orNull(productForm.hts_code),
        standard_duty_rate_pct: num(productForm.standard_duty_rate_pct), additional_tariff_pct: num(productForm.additional_tariff_pct),
        shipping_allocation_method: productForm.shipping_allocation_method,
        brokerage_fee: num(productForm.brokerage_fee), other_import_cost: num(productForm.other_import_cost),
        landed_cost: landedCostToSave, landed_cost_is_override: !!productForm.landed_cost_is_override,
        dealer_price: productForm.dealer_price === '' ? null : num(productForm.dealer_price),
        msrp: productForm.msrp === '' ? null : num(productForm.msrp),
        minimum_approved_margin_pct: num(productForm.minimum_approved_margin_pct),
        target_dof_margin_pct: num(productForm.target_dof_margin_pct), target_dealer_margin_pct: num(productForm.target_dealer_margin_pct),
        is_active: !!productForm.is_active, notes: orNull(productForm.notes), created_by: session.user.id,
      });
      if (insErr) return setError('Create error: ' + insErr.message);
      setNotice('Product created.');
    }
    setEditingProductId(null);
    setProductForm(emptyProductForm());
    await loadAll();
  }

  const productMargins = useMemo(() => products.filter(p => p.is_active !== false).map(p => {
    const { grossProfit, marginPct } = computeMarginFromPrice({ cost: p.landed_cost, price: p.dealer_price });
    return { ...p, grossProfit, marginPct };
  }), [products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => [p.product_name, p.sku, p.product_category].some(v => String(v || '').toLowerCase().includes(q)));
  }, [products, productSearch]);

  // ---------------------------------------------------------------
  // Landed Cost Calculator + Shipment Freight Allocation
  // ---------------------------------------------------------------
  function addShipmentLine() { setShipmentLines(prev => [...prev, { pricing_product_id: '', quantity: 1, purchase_value: '', weight: '', volume: '', manual_allocation_value: '' }]); }
  function updateShipmentLine(idx, patch) { setShipmentLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l)); }
  function removeShipmentLine(idx) { setShipmentLines(prev => prev.filter((_, i) => i !== idx)); }

  const allocationPreview = useMemo(() => {
    if (!shipmentLines.length) return [];
    return allocateShipmentCosts({
      lines: shipmentLines.map(l => ({
        id: l.pricing_product_id, quantity: num(l.quantity), purchaseValue: num(l.purchase_value),
        weight: num(l.weight), volume: num(l.volume), manualAllocationValue: num(l.manual_allocation_value),
      })),
      totalFreight: num(shipmentForm.total_freight_cost), brokerage: num(shipmentForm.customs_brokerage_cost),
      otherCost: num(shipmentForm.other_shipment_cost), method: shipmentForm.allocation_method,
    });
  }, [shipmentLines, shipmentForm]);

  async function submitShipmentAllocation(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!shipmentLines.length) return setError('Add at least one product line.');
    const { data: shipmentRow, error: shErr } = await supabase.from('pricing_shipments').insert({
      shipment_reference: orNull(shipmentForm.shipment_reference), shipment_date: orNull(shipmentForm.shipment_date),
      vendor: orNull(shipmentForm.vendor), total_freight_cost: num(shipmentForm.total_freight_cost),
      customs_brokerage_cost: num(shipmentForm.customs_brokerage_cost), other_shipment_cost: num(shipmentForm.other_shipment_cost),
      allocation_method: shipmentForm.allocation_method, notes: orNull(shipmentForm.notes), created_by: session.user.id,
    }).select().single();
    if (shErr) return setError('Shipment save error: ' + shErr.message);

    const linesToInsert = allocationPreview.map(l => ({
      shipment_id: shipmentRow.id, pricing_product_id: l.id || null,
      quantity: num(l.quantity), purchase_value: num(l.purchaseValue),
      weight: l.weight || null, volume: l.volume || null, manual_allocation_value: l.manualAllocationValue || null,
      allocated_freight: round2(l.allocatedFreight), allocated_brokerage: round2(l.allocatedBrokerage),
      allocated_other: round2(l.allocatedOther), computed_landed_cost_per_unit: round2(l.computedLandedCostPerUnit),
    }));
    const { error: linesErr } = await supabase.from('pricing_shipment_lines').insert(linesToInsert);
    if (linesErr) return setError('Shipment lines save error: ' + linesErr.message);

    for (const l of allocationPreview) {
      if (!l.id) continue;
      const product = productLookup(l.id);
      if (!product || product.landed_cost_is_override) continue;
      await supabase.rpc('update_pricing_product', {
        p_id: product.id,
        p_product_name: product.product_name, p_product_category: product.product_category, p_sku: product.sku,
        p_hq_purchase_cost: product.hq_purchase_cost, p_currency: product.currency,
        p_country_of_origin: product.country_of_origin, p_hts_code: product.hts_code,
        p_standard_duty_rate_pct: product.standard_duty_rate_pct, p_additional_tariff_pct: product.additional_tariff_pct,
        p_shipping_allocation_method: product.shipping_allocation_method,
        p_brokerage_fee: product.brokerage_fee, p_other_import_cost: product.other_import_cost,
        p_landed_cost: round2(l.computedLandedCostPerUnit), p_landed_cost_is_override: false,
        p_dealer_price: product.dealer_price, p_msrp: product.msrp,
        p_minimum_approved_margin_pct: product.minimum_approved_margin_pct,
        p_target_dof_margin_pct: product.target_dof_margin_pct, p_target_dealer_margin_pct: product.target_dealer_margin_pct,
        p_is_active: product.is_active, p_notes: product.notes,
        p_reason: `Shipment allocation ${shipmentForm.shipment_reference || shipmentRow.id}`,
      });
    }
    setNotice('Shipment allocated — linked products\' landed cost updated (unless manually overridden).');
    setShipmentForm(emptyShipmentForm());
    setShipmentLines([]);
    await loadAll();
  }

  const landedCalcProduct = productLookup(landedCalcProductId);
  const landedCalcBreakdown = useMemo(() => {
    if (!landedCalcProduct) return null;
    return computeLandedCost({
      hqCost: num(landedCalcProduct.hq_purchase_cost), allocatedShipping: 0,
      dutyRatePct: num(landedCalcProduct.standard_duty_rate_pct), additionalTariffPct: num(landedCalcProduct.additional_tariff_pct),
      brokerageFee: num(landedCalcProduct.brokerage_fee), otherImportCost: num(landedCalcProduct.other_import_cost),
    });
  }, [landedCalcProduct]);

  // ---------------------------------------------------------------
  // Dealer Price Calculator (existing product mode + dealer margin)
  // ---------------------------------------------------------------
  const dealerCalcProduct = productLookup(dealerCalcProductId);
  const dealerCalcLandedCost = dealerCalcProduct ? num(dealerCalcProduct.landed_cost) : num(dealerCalcInput.landed_cost);
  const dealerCalcPrice = dealerCalcProduct ? num(dealerCalcProduct.dealer_price) : num(dealerCalcInput.dealer_price);
  const dealerCalcMsrp = dealerCalcProduct ? num(dealerCalcProduct.msrp) : null;
  const dealerCalcResult = useMemo(() => computeMarginFromPrice({ cost: dealerCalcLandedCost, price: dealerCalcPrice }), [dealerCalcLandedCost, dealerCalcPrice]);
  const dealerCalcDiscount = dealerCalcMsrp ? computeDiscountFromMsrp({ msrp: dealerCalcMsrp, price: dealerCalcPrice }) : null;
  const dealerCalcDealerMargin = dealerCalcMsrp ? computeDealerMargin({ dealerPrice: dealerCalcPrice, msrp: dealerCalcMsrp }) : null;

  // ---------------------------------------------------------------
  // MSRP Calculator (new product mode + floor price)
  // ---------------------------------------------------------------
  const msrpCalcProduct = productLookup(msrpCalcProductId);
  const msrpCalcLandedCost = msrpCalcProduct ? num(msrpCalcProduct.landed_cost) : num(msrpCalcInput.landed_cost);
  const msrpCalcTargetDof = msrpCalcProduct ? num(msrpCalcProduct.target_dof_margin_pct) : num(msrpCalcInput.target_dof_margin_pct);
  const msrpCalcTargetDealer = msrpCalcProduct ? num(msrpCalcProduct.target_dealer_margin_pct) : num(msrpCalcInput.target_dealer_margin_pct);
  const msrpCalcMinimum = msrpCalcProduct ? num(msrpCalcProduct.minimum_approved_margin_pct) : num(msrpCalcInput.minimum_approved_margin_pct);
  const msrpRecommendedDealer = useMemo(() => computeSellingPriceFromMargin({ cost: msrpCalcLandedCost, targetMarginPct: msrpCalcTargetDof }), [msrpCalcLandedCost, msrpCalcTargetDof]);
  const msrpRecommendedMsrp = useMemo(() => msrpRecommendedDealer === null ? null : computeMsrpFromDealerPrice({ dealerPrice: msrpRecommendedDealer, targetDealerMarginPct: msrpCalcTargetDealer }), [msrpRecommendedDealer, msrpCalcTargetDealer]);
  const msrpDofGp = msrpRecommendedDealer === null ? null : computeMarginFromPrice({ cost: msrpCalcLandedCost, price: msrpRecommendedDealer });
  const msrpDealerGp = (msrpRecommendedDealer === null || msrpRecommendedMsrp === null) ? null : computeDealerMargin({ dealerPrice: msrpRecommendedDealer, msrp: msrpRecommendedMsrp });
  const floorPrice = useMemo(() => computeFloorPrice({ cost: msrpCalcLandedCost, minimumMarginPct: msrpCalcMinimum }), [msrpCalcLandedCost, msrpCalcMinimum]);

  // ---------------------------------------------------------------
  // Margin Simulator (admin only)
  // ---------------------------------------------------------------
  const simProduct = productLookup(simProductId);
  useEffect(() => {
    if (simProduct) {
      setSimInput(prev => ({ ...prev, sellingPrice: simProduct.dealer_price ?? '', cost: simProduct.landed_cost ?? '' }));
    }
    // eslint-disable-next-line
  }, [simProductId]);
  const simResult = useMemo(() => simulateMargin({
    sellingPrice: num(simInput.sellingPrice), cost: num(simInput.cost), freightCost: num(simInput.freightCost),
    dutyPct: num(simInput.dutyPct), tariffPct: num(simInput.tariffPct), commission: num(simInput.commission),
    financing: num(simInput.financing), installation: num(simInput.installation), freeAccessories: num(simInput.freeAccessories), other: num(simInput.other),
  }), [simInput]);
  const simDeal = useMemo(() => computeDealEconomics({ quantity: num(simInput.quantity) || 1, unitSellingPrice: num(simInput.sellingPrice), unitCost: num(simInput.cost) }), [simInput]);

  // ---------------------------------------------------------------
  // Price Approval workflow
  // ---------------------------------------------------------------
  async function previewApprovalStatus() {
    setError('');
    if (!approvalForm.pricing_product_id || approvalForm.proposed_selling_price === '') { setApprovalPreview(null); return; }
    const { data, error: rpcErr } = await supabase.rpc('check_pricing_status', {
      p_product_id: approvalForm.pricing_product_id, p_proposed_price: num(approvalForm.proposed_selling_price), p_quantity: num(approvalForm.quantity) || 1,
    });
    if (rpcErr) return setError('Preview error: ' + rpcErr.message);
    setApprovalPreview((data && data[0]) || null);
  }
  useEffect(() => { previewApprovalStatus(); /* eslint-disable-next-line */ }, [approvalForm.pricing_product_id, approvalForm.proposed_selling_price]);

  async function submitApproval(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!approvalForm.pricing_product_id) return setError('Select a product.');
    if (approvalForm.proposed_selling_price === '') return setError('Enter a proposed selling price.');
    const { error: rpcErr } = await supabase.rpc('submit_price_approval', {
      p_product_id: approvalForm.pricing_product_id, p_customer_name: orNull(approvalForm.customer_name),
      p_quantity: num(approvalForm.quantity) || 1, p_transaction_type: approvalForm.transaction_type,
      p_proposed_selling_price: num(approvalForm.proposed_selling_price), p_reason_for_discount: orNull(approvalForm.reason_for_discount),
    });
    if (rpcErr) return setError('Submit error: ' + rpcErr.message);
    setNotice('Approval request submitted.');
    setApprovalForm(emptyApprovalForm());
    setApprovalPreview(null);
    await loadAll();
  }

  async function decideApproval(row, action) {
    setError(''); setNotice('');
    const statusMap = { Approve: 'Approved', Reject: 'Rejected', 'Request Revision': 'Revision Requested' };
    const nextStatus = statusMap[action];
    const { error: updErr } = await supabase.from('pricing_approvals').update({
      status: nextStatus, decided_by: session.user.id, decided_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (updErr) return setError('Decision error: ' + updErr.message);
    await supabase.from('pricing_approval_actions').insert({ approval_id: row.id, action: nextStatus, performed_by: session.user.id });
    setNotice('Decision recorded.');
    await loadAll();
  }

  // ---------------------------------------------------------------
  // Dashboard derived data (admin only)
  // ---------------------------------------------------------------
  const belowTarget = useMemo(() => productMargins.filter(p => p.marginPct !== null && p.marginPct < p.target_dof_margin_pct), [productMargins]);
  const avgDofMargin = useMemo(() => { const w = productMargins.filter(p => p.marginPct !== null); return w.length ? w.reduce((s, p) => s + p.marginPct, 0) / w.length : null; }, [productMargins]);
  const pendingApprovals = useMemo(() => approvals.filter(a => ['Approval Required', 'Manager Review Recommended'].includes(a.status)), [approvals]);
  const tariffImpactTotal = useMemo(() => products.filter(p => p.is_active !== false).reduce((s, p) => s + (num(p.hq_purchase_cost) * num(p.additional_tariff_pct) / 100), 0), [products]);
  const dealVsDirectRows = useMemo(() => {
    const approved = approvals.filter(a => a.status === 'Approved' && a.margin_pct !== null && a.margin_pct !== undefined);
    const groups = {};
    approved.forEach(a => { (groups[a.transaction_type] = groups[a.transaction_type] || []).push(Number(a.margin_pct)); });
    return Object.entries(groups).map(([type, arr]) => [type, pctFmt(arr.reduce((s, v) => s + v, 0) / arr.length), String(arr.length)]);
  }, [approvals]);

  if (!hasAccess) {
    return <Card title="Cost & Pricing"><Empty text="You don't have access to this module. Ask an administrator to grant Sales or Admin access." /></Card>;
  }

  const tabs = isAdmin ? TABS_ADMIN : TABS_SALES;

  return (
    <>
      <nav className="pxTabs">
        {tabs.map(t => <button key={t} className={tab === t ? 'active' : 'light'} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}

      {tab === 'Dashboard' && isAdmin &&
        <>
          <div className="kpis">
            <KPI title="Active Products" value={products.filter(p => p.is_active !== false).length} icon="💰" />
            <KPI title="Below Target Margin" value={belowTarget.length} icon="⚠️" />
            <KPI title="Pending Approvals" value={pendingApprovals.length} icon="🕒" />
            <KPI title="Avg DOF Margin" value={pctFmt(avgDofMargin)} icon="📈" />
          </div>
          <div className="two">
            <Card title="Lowest Margin Products">
              <Table headers={['Product', 'Category', 'Margin', 'Status']}
                rows={[...productMargins].filter(p => p.marginPct !== null).sort((a, b) => a.marginPct - b.marginPct).slice(0, 6)
                  .map(p => [p.product_name, p.product_category, pctFmt(p.marginPct),
                    <StatusBadge key={p.id} status={classifyApprovalStatus({ marginPct: p.marginPct, targetMarginPct: p.target_dof_margin_pct, minimumMarginPct: p.minimum_approved_margin_pct })} />])} />
            </Card>
            <Card title="Top Products by Gross Profit">
              <Table headers={['Product', 'Gross Profit', 'Margin']}
                rows={[...productMargins].filter(p => p.grossProfit !== null).sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 6)
                  .map(p => [p.product_name, money(p.grossProfit), pctFmt(p.marginPct)])} />
            </Card>
          </div>
          <div className="two">
            <Card title="Recently Changed Cost">
              <Table headers={['Product', 'Field', 'Old → New', 'Changed By', 'When']}
                rows={history.filter(h => ['hq_purchase_cost', 'landed_cost'].includes(h.field_changed)).slice(0, 8)
                  .map(h => [productLookup(h.pricing_product_id)?.product_name || '-', h.field_changed, `${h.old_value ?? '-'} → ${h.new_value ?? '-'}`, profileName(h.changed_by), new Date(h.changed_at).toLocaleString()])} />
            </Card>
            <Card title="Pending Price Approvals">
              <Table headers={['Customer', 'Product', 'Proposed Price', 'Margin', 'Status']}
                rows={pendingApprovals.slice(0, 8).map(a => [a.customer_name || '-', productLookup(a.pricing_product_id)?.product_name || '-', money(a.proposed_selling_price), pctFmt(a.margin_pct), <StatusBadge key={a.id} status={a.status} />])} />
            </Card>
          </div>
          <div className="two">
            <Card title="Dealer vs Direct Margin (Approved requests, by transaction type)">
              <Table headers={['Transaction Type', 'Avg Margin %', 'Count']} rows={dealVsDirectRows} />
            </Card>
            <Card title="Current Tariff Impact (estimate)">
              <p className="hint">Sum of Additional Tariff % × HQ Cost across active products — a rough exposure figure, not a substitute for the per-shipment landed cost calculation.</p>
              <div className="clock"><strong>{money(tariffImpactTotal)}</strong><span>Estimated tariff exposure across active catalog</span></div>
            </Card>
          </div>
        </>
      }

      {(tab === 'Product Cost Master' && isAdmin) &&
        <>
          <Card title={editingProductId ? 'Edit Product' : 'Add Product'}>
            <form onSubmit={saveProduct} className="labeledOpsForm opsForm">
              <label>Product Name<input value={productForm.product_name} onChange={e => setProductForm({ ...productForm, product_name: e.target.value })} /></label>
              <label>Product Category
                <select value={productForm.product_category} onChange={e => setProductForm({ ...productForm, product_category: e.target.value })}>
                  {PRICING_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>SKU / Item Code<input value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} /></label>
              <label>HQ Purchase Cost<input type="number" step="0.01" value={productForm.hq_purchase_cost} onChange={e => setProductForm({ ...productForm, hq_purchase_cost: e.target.value })} /></label>
              <label>Currency<input value={productForm.currency} onChange={e => setProductForm({ ...productForm, currency: e.target.value })} /></label>
              <label>Country of Origin<input value={productForm.country_of_origin} onChange={e => setProductForm({ ...productForm, country_of_origin: e.target.value })} /></label>
              <label>HTS Code<input value={productForm.hts_code} onChange={e => setProductForm({ ...productForm, hts_code: e.target.value })} /></label>
              <label>Standard Duty Rate %<input type="number" step="0.01" value={productForm.standard_duty_rate_pct} onChange={e => setProductForm({ ...productForm, standard_duty_rate_pct: e.target.value })} /></label>
              <label>Additional Tariff %<input type="number" step="0.01" value={productForm.additional_tariff_pct} onChange={e => setProductForm({ ...productForm, additional_tariff_pct: e.target.value })} /></label>
              <label>Shipping Allocation Method
                <select value={productForm.shipping_allocation_method} onChange={e => setProductForm({ ...productForm, shipping_allocation_method: e.target.value })}>
                  {ALLOCATION_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label>Brokerage / Customs Fee<input type="number" step="0.01" value={productForm.brokerage_fee} onChange={e => setProductForm({ ...productForm, brokerage_fee: e.target.value })} /></label>
              <label>Other Import Cost<input type="number" step="0.01" value={productForm.other_import_cost} onChange={e => setProductForm({ ...productForm, other_import_cost: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={productForm.landed_cost_is_override} onChange={e => setProductForm({ ...productForm, landed_cost_is_override: e.target.checked })} /> Manually override Landed Cost</label>
              <label>Current Landed Cost {productForm.landed_cost_is_override ? '' : '(auto-calculated)'}
                <input type="number" step="0.01" disabled={!productForm.landed_cost_is_override}
                  value={productForm.landed_cost_is_override ? productForm.landed_cost : round2(productFormLandedPreview.landedCost)}
                  onChange={e => setProductForm({ ...productForm, landed_cost: e.target.value })} />
              </label>
              <label>Current Dealer Price<input type="number" step="0.01" value={productForm.dealer_price} onChange={e => setProductForm({ ...productForm, dealer_price: e.target.value })} /></label>
              <label>Current MSRP<input type="number" step="0.01" value={productForm.msrp} onChange={e => setProductForm({ ...productForm, msrp: e.target.value })} /></label>
              <label>Minimum Approved Margin %<input type="number" step="0.01" value={productForm.minimum_approved_margin_pct} onChange={e => setProductForm({ ...productForm, minimum_approved_margin_pct: e.target.value })} /></label>
              <label>Target DOF Margin %<input type="number" step="0.01" value={productForm.target_dof_margin_pct} onChange={e => setProductForm({ ...productForm, target_dof_margin_pct: e.target.value })} /></label>
              <label>Target Dealer Margin %<input type="number" step="0.01" value={productForm.target_dealer_margin_pct} onChange={e => setProductForm({ ...productForm, target_dealer_margin_pct: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={productForm.is_active} onChange={e => setProductForm({ ...productForm, is_active: e.target.checked })} /> Active</label>
              <label>Notes<input value={productForm.notes} onChange={e => setProductForm({ ...productForm, notes: e.target.value })} /></label>
              {editingProductId && <label>Reason for this change (recorded in Pricing History)<input value={productForm.reason} onChange={e => setProductForm({ ...productForm, reason: e.target.value })} /></label>}
              <div className="formButtonGroup">
                <button>{editingProductId ? 'Update Product' : 'Add Product'}</button>
                {editingProductId && <button type="button" className="light" onClick={cancelProductEdit}>Cancel</button>}
              </div>
            </form>
            <p className="hint">Landed Cost preview (this product's own duty/tariff rates only — use Landed Cost Calculator to fold in a shipment's allocated freight): HQ {money(productFormLandedPreview.hqCost)} + Duty {money(productFormLandedPreview.duty)} + Tariff {money(productFormLandedPreview.tariff)} + Brokerage {money(productFormLandedPreview.brokerageFee)} + Other {money(productFormLandedPreview.otherImportCost)} = <b>{money(productFormLandedPreview.landedCost)}</b></p>
          </Card>

          <Card title="Product Cost Master" action={<label>Search<input placeholder="Name, SKU, category..." value={productSearch} onChange={e => setProductSearch(e.target.value)} /></label>}>
            <Table
              headers={['Product', 'Category', 'SKU', 'HQ Cost', 'Landed Cost', 'Dealer Price', 'MSRP', 'Margin', 'Active', 'Action']}
              rows={filteredProducts.map(p => {
                const { marginPct } = computeMarginFromPrice({ cost: p.landed_cost, price: p.dealer_price });
                return [p.product_name, p.product_category, p.sku || '-', money(p.hq_purchase_cost), money(p.landed_cost), money(p.dealer_price), money(p.msrp),
                <StatusBadge key={p.id + 'm'} status={classifyApprovalStatus({ marginPct, targetMarginPct: p.target_dof_margin_pct, minimumMarginPct: p.minimum_approved_margin_pct })} />,
                p.is_active !== false ? 'Yes' : 'No',
                <button key={p.id} className="light" onClick={() => editProduct(p)}>Edit</button>];
              })} />
          </Card>
        </>
      }

      {(tab === 'Product List' && isSales) &&
        <Card title="Product List" action={<label>Search<input placeholder="Name, SKU, category..." value={productSearch} onChange={e => setProductSearch(e.target.value)} /></label>}>
          <p className="hint">Cost and internal gross profit are not shown to Sales accounts. Dealer Price is shown only if your account has been authorized to view it.</p>
          <Table headers={['Product', 'Category', 'SKU', 'MSRP', 'Dealer Price']}
            rows={filteredProducts.map(p => [p.product_name, p.product_category, p.sku || '-', money(p.msrp), p.dealer_price !== null && p.dealer_price !== undefined ? money(p.dealer_price) : 'Not authorized'])} />
        </Card>
      }

      {(tab === 'Landed Cost Calculator' && isAdmin) &&
        <>
          <Card title="Landed Cost Breakdown" action={<label>Product<select value={landedCalcProductId} onChange={e => setLandedCalcProductId(e.target.value)}><option value="">Select a product</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select></label>}>
            {landedCalcBreakdown
              ? <div className="summaryCards">
                  <div className="kpi"><div><span>HQ Purchase Cost</span><strong>{money(landedCalcBreakdown.hqCost)}</strong></div></div>
                  <div className="kpi"><div><span>Duty</span><strong>{money(landedCalcBreakdown.duty)}</strong></div></div>
                  <div className="kpi"><div><span>Additional Tariff</span><strong>{money(landedCalcBreakdown.tariff)}</strong></div></div>
                  <div className="kpi"><div><span>Brokerage / Customs</span><strong>{money(landedCalcBreakdown.brokerageFee)}</strong></div></div>
                  <div className="kpi"><div><span>Other Import Cost</span><strong>{money(landedCalcBreakdown.otherImportCost)}</strong></div></div>
                  <div className="kpi"><div><span>Landed Cost</span><strong>{money(landedCalcBreakdown.landedCost)}</strong></div></div>
                </div>
              : <Empty text="Select a product to see its landed cost breakdown." />}
          </Card>

          <Card title="Shipment Freight / Duty / Brokerage Allocation">
            <form onSubmit={submitShipmentAllocation} className="labeledOpsForm opsForm">
              <label>Shipment Reference<input value={shipmentForm.shipment_reference} onChange={e => setShipmentForm({ ...shipmentForm, shipment_reference: e.target.value })} /></label>
              <label>Shipment Date<input type="date" value={shipmentForm.shipment_date} onChange={e => setShipmentForm({ ...shipmentForm, shipment_date: e.target.value })} /></label>
              <label>Vendor / HQ<input value={shipmentForm.vendor} onChange={e => setShipmentForm({ ...shipmentForm, vendor: e.target.value })} /></label>
              <label>Total Freight Cost<input type="number" step="0.01" value={shipmentForm.total_freight_cost} onChange={e => setShipmentForm({ ...shipmentForm, total_freight_cost: e.target.value })} /></label>
              <label>Customs / Brokerage Cost<input type="number" step="0.01" value={shipmentForm.customs_brokerage_cost} onChange={e => setShipmentForm({ ...shipmentForm, customs_brokerage_cost: e.target.value })} /></label>
              <label>Other Shipment Cost<input type="number" step="0.01" value={shipmentForm.other_shipment_cost} onChange={e => setShipmentForm({ ...shipmentForm, other_shipment_cost: e.target.value })} /></label>
              <label>Allocation Method
                <select value={shipmentForm.allocation_method} onChange={e => setShipmentForm({ ...shipmentForm, allocation_method: e.target.value })}>
                  {ALLOCATION_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label>Notes<input value={shipmentForm.notes} onChange={e => setShipmentForm({ ...shipmentForm, notes: e.target.value })} /></label>
              <div className="formButtonGroup"><button type="button" className="light" onClick={addShipmentLine}>+ Add Product Line</button></div>
            </form>

            {shipmentLines.length > 0 &&
              <Table
                headers={['Product', 'Qty', 'Purchase Value', 'Weight', 'Volume', 'Manual Alloc.', 'Allocated Freight', 'Landed Cost / Unit', '']}
                rows={shipmentLines.map((l, idx) => {
                  const preview = allocationPreview[idx];
                  return [
                    <select key="p" value={l.pricing_product_id} onChange={e => updateShipmentLine(idx, { pricing_product_id: e.target.value })}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select>,
                    <input key="q" type="number" style={{ width: '70px' }} value={l.quantity} onChange={e => updateShipmentLine(idx, { quantity: e.target.value })} />,
                    <input key="v" type="number" step="0.01" style={{ width: '100px' }} value={l.purchase_value} onChange={e => updateShipmentLine(idx, { purchase_value: e.target.value })} />,
                    <input key="w" type="number" step="0.01" style={{ width: '80px' }} value={l.weight} onChange={e => updateShipmentLine(idx, { weight: e.target.value })} />,
                    <input key="vol" type="number" step="0.01" style={{ width: '80px' }} value={l.volume} onChange={e => updateShipmentLine(idx, { volume: e.target.value })} />,
                    <input key="m" type="number" step="0.01" style={{ width: '90px' }} value={l.manual_allocation_value} onChange={e => updateShipmentLine(idx, { manual_allocation_value: e.target.value })} />,
                    money(preview?.allocatedFreight),
                    money(preview?.computedLandedCostPerUnit),
                    <button key="x" className="miniDelete" onClick={() => removeShipmentLine(idx)}>×</button>,
                  ];
                })} />
            }
            {shipmentLines.length > 0 && <div className="formButtonGroup" style={{ marginTop: '12px' }}><button onClick={submitShipmentAllocation}>Apply Allocation &amp; Update Landed Costs</button></div>}
          </Card>

          <Card title="Shipment History">
            <Table headers={['Reference', 'Date', 'Vendor', 'Method', 'Freight', 'Brokerage', 'Lines']}
              rows={shipments.map(s => [s.shipment_reference || '-', s.shipment_date || '-', s.vendor || '-', s.allocation_method, money(s.total_freight_cost), money(s.customs_brokerage_cost), String((s.pricing_shipment_lines || []).length)])} />
          </Card>
        </>
      }

      {(tab === 'Dealer Price Calculator' && isAdmin) &&
        <Card title="Dealer Price Calculator — Existing Product Mode" action={
          <label>Product<select value={dealerCalcProductId} onChange={e => setDealerCalcProductId(e.target.value)}><option value="">Manual entry</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select></label>
        }>
          {!dealerCalcProduct &&
            <div className="labeledOpsForm opsForm" style={{ marginBottom: '16px' }}>
              <label>Landed Cost<input type="number" step="0.01" value={dealerCalcInput.landed_cost} onChange={e => setDealerCalcInput({ ...dealerCalcInput, landed_cost: e.target.value })} /></label>
              <label>Dealer Price<input type="number" step="0.01" value={dealerCalcInput.dealer_price} onChange={e => setDealerCalcInput({ ...dealerCalcInput, dealer_price: e.target.value })} /></label>
            </div>}
          <div className="summaryCards">
            <div className="kpi"><div><span>Landed Cost</span><strong>{money(dealerCalcLandedCost)}</strong></div></div>
            <div className="kpi"><div><span>Dealer Price</span><strong>{money(dealerCalcPrice)}</strong></div></div>
            <div className="kpi"><div><span>Gross Profit</span><strong>{money(dealerCalcResult.grossProfit)}</strong></div></div>
            <div className="kpi"><div><span>DOF Margin %</span><strong>{pctFmt(dealerCalcResult.marginPct)}</strong></div></div>
            {dealerCalcMsrp ? <>
              <div className="kpi"><div><span>MSRP</span><strong>{money(dealerCalcMsrp)}</strong></div></div>
              <div className="kpi"><div><span>Dealer Discount from MSRP</span><strong>{pctFmt(dealerCalcDiscount)}</strong></div></div>
              <div className="kpi"><div><span>Dealer Gross Profit at MSRP</span><strong>{money(dealerCalcDealerMargin?.dealerGrossProfit)}</strong></div></div>
              <div className="kpi"><div><span>Dealer Margin % at MSRP</span><strong>{pctFmt(dealerCalcDealerMargin?.dealerMarginPct)}</strong></div></div>
            </> : null}
          </div>
        </Card>
      }

      {(tab === 'MSRP Calculator' && isAdmin) &&
        <>
          <Card title="MSRP Calculator — New Product / Part Pricing Mode" action={
            <label>Product<select value={msrpCalcProductId} onChange={e => setMsrpCalcProductId(e.target.value)}><option value="">Manual entry</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select></label>
          }>
            {!msrpCalcProduct &&
              <div className="labeledOpsForm opsForm" style={{ marginBottom: '16px' }}>
                <label>Landed Cost<input type="number" step="0.01" value={msrpCalcInput.landed_cost} onChange={e => setMsrpCalcInput({ ...msrpCalcInput, landed_cost: e.target.value })} /></label>
                <label>Target DOF Margin %<input type="number" step="0.01" value={msrpCalcInput.target_dof_margin_pct} onChange={e => setMsrpCalcInput({ ...msrpCalcInput, target_dof_margin_pct: e.target.value })} /></label>
                <label>Target Dealer Margin %<input type="number" step="0.01" value={msrpCalcInput.target_dealer_margin_pct} onChange={e => setMsrpCalcInput({ ...msrpCalcInput, target_dealer_margin_pct: e.target.value })} /></label>
                <label>Minimum Approved Margin %<input type="number" step="0.01" value={msrpCalcInput.minimum_approved_margin_pct} onChange={e => setMsrpCalcInput({ ...msrpCalcInput, minimum_approved_margin_pct: e.target.value })} /></label>
              </div>}
            <div className="summaryCards">
              <div className="kpi"><div><span>Landed Cost</span><strong>{money(msrpCalcLandedCost)}</strong></div></div>
              <div className="kpi"><div><span>Target DOF Margin</span><strong>{pctFmt(msrpCalcTargetDof)}</strong></div></div>
              <div className="kpi"><div><span>Recommended Dealer Price</span><strong>{money(msrpRecommendedDealer)}</strong></div></div>
              <div className="kpi"><div><span>Target Dealer Margin</span><strong>{pctFmt(msrpCalcTargetDealer)}</strong></div></div>
              <div className="kpi"><div><span>Recommended MSRP</span><strong>{money(msrpRecommendedMsrp)}</strong></div></div>
              <div className="kpi"><div><span>DOF Gross Profit</span><strong>{money(msrpDofGp?.grossProfit)}</strong></div></div>
              <div className="kpi"><div><span>Dealer Gross Profit</span><strong>{money(msrpDealerGp?.dealerGrossProfit)}</strong></div></div>
              <div className="kpi"><div><span>DOF Margin %</span><strong>{pctFmt(msrpDofGp?.marginPct)}</strong></div></div>
              <div className="kpi"><div><span>Dealer Margin %</span><strong>{pctFmt(msrpDealerGp?.dealerMarginPct)}</strong></div></div>
            </div>
          </Card>
          <Card title="Minimum / Floor Price">
            <p className="hint">Floor Price = Landed Cost / (1 − Minimum Margin). Any deal proposed below this triggers Approval Required in the Price Approval workflow.</p>
            <div className="summaryCards">
              <div className="kpi"><div><span>Landed Cost</span><strong>{money(msrpCalcLandedCost)}</strong></div></div>
              <div className="kpi"><div><span>Minimum Margin</span><strong>{pctFmt(msrpCalcMinimum)}</strong></div></div>
              <div className="kpi"><div><span>Floor Price</span><strong>{money(floorPrice)}</strong></div></div>
            </div>
          </Card>
        </>
      }

      {(tab === 'Margin Simulator' && isAdmin) &&
        <Card title="Margin Simulator" action={<label>Load from Product<select value={simProductId} onChange={e => setSimProductId(e.target.value)}><option value="">Manual entry</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select></label>}>
          <div className="labeledOpsForm opsForm">
            <label>Selling Price<input type="number" step="0.01" value={simInput.sellingPrice} onChange={e => setSimInput({ ...simInput, sellingPrice: e.target.value })} /></label>
            <label>Landed Cost<input type="number" step="0.01" value={simInput.cost} onChange={e => setSimInput({ ...simInput, cost: e.target.value })} /></label>
            <label>Quantity (deal size)<input type="number" step="1" value={simInput.quantity} onChange={e => setSimInput({ ...simInput, quantity: e.target.value })} /></label>
            <label>Freight Cost<input type="number" step="0.01" value={simInput.freightCost} onChange={e => setSimInput({ ...simInput, freightCost: e.target.value })} /></label>
            <label>Duty %<input type="number" step="0.01" value={simInput.dutyPct} onChange={e => setSimInput({ ...simInput, dutyPct: e.target.value })} /></label>
            <label>Tariff %<input type="number" step="0.01" value={simInput.tariffPct} onChange={e => setSimInput({ ...simInput, tariffPct: e.target.value })} /></label>
            <label>Commission Cost<input type="number" step="0.01" value={simInput.commission} onChange={e => setSimInput({ ...simInput, commission: e.target.value })} /></label>
            <label>Financing Cost<input type="number" step="0.01" value={simInput.financing} onChange={e => setSimInput({ ...simInput, financing: e.target.value })} /></label>
            <label>Installation Cost<input type="number" step="0.01" value={simInput.installation} onChange={e => setSimInput({ ...simInput, installation: e.target.value })} /></label>
            <label>Free Accessories Cost<input type="number" step="0.01" value={simInput.freeAccessories} onChange={e => setSimInput({ ...simInput, freeAccessories: e.target.value })} /></label>
            <label>Other Cost<input type="number" step="0.01" value={simInput.other} onChange={e => setSimInput({ ...simInput, other: e.target.value })} /></label>
          </div>
          <div className="summaryCards">
            <div className="kpi"><div><span>Total Cost</span><strong>{money(simResult.totalCost)}</strong></div></div>
            <div className="kpi"><div><span>Gross Profit</span><strong>{money(simResult.grossProfit)}</strong></div></div>
            <div className="kpi"><div><span>Gross Margin %</span><strong>{pctFmt(simResult.grossMarginPct)}</strong></div></div>
            <div className="kpi"><div><span>Margin After Commission</span><strong>{pctFmt(simResult.marginAfterCommissionPct)}</strong></div></div>
            <div className="kpi"><div><span>Margin After Financing</span><strong>{pctFmt(simResult.marginAfterFinancingPct)}</strong></div></div>
            <div className="kpi"><div><span>Net Contribution</span><strong>{money(simResult.netContribution)}</strong></div></div>
            <div className="kpi"><div><span>Net Deal Margin %</span><strong>{pctFmt(simResult.netDealMarginPct)}</strong></div></div>
          </div>
          {num(simInput.quantity) > 1 &&
            <>
              <p className="hint">Multi-unit deal economics (Dealer / DSO / Strategic Account):</p>
              <div className="summaryCards">
                <div className="kpi"><div><span>Total Deal Revenue</span><strong>{money(simDeal.totalRevenue)}</strong></div></div>
                <div className="kpi"><div><span>Total Deal Cost</span><strong>{money(simDeal.totalCost)}</strong></div></div>
                <div className="kpi"><div><span>Total Deal Gross Profit</span><strong>{money(simDeal.grossProfit)}</strong></div></div>
                <div className="kpi"><div><span>Total Deal Margin %</span><strong>{pctFmt(simDeal.grossMarginPct)}</strong></div></div>
              </div>
            </>}
        </Card>
      }

      {tab === 'Price Approval' &&
        <>
          <Card title="Request Approval">
            <form onSubmit={submitApproval} className="form">
              <select value={approvalForm.pricing_product_id} onChange={e => setApprovalForm({ ...approvalForm, pricing_product_id: e.target.value })}>
                <option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
              </select>
              <input placeholder="Customer Name" value={approvalForm.customer_name} onChange={e => setApprovalForm({ ...approvalForm, customer_name: e.target.value })} />
              <input type="number" placeholder="Quantity" value={approvalForm.quantity} onChange={e => setApprovalForm({ ...approvalForm, quantity: e.target.value })} />
              <select value={approvalForm.transaction_type} onChange={e => setApprovalForm({ ...approvalForm, transaction_type: e.target.value })}>
                {TRANSACTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Proposed Selling Price" value={approvalForm.proposed_selling_price} onChange={e => setApprovalForm({ ...approvalForm, proposed_selling_price: e.target.value })} />
              <textarea placeholder="Reason for Discount" value={approvalForm.reason_for_discount} onChange={e => setApprovalForm({ ...approvalForm, reason_for_discount: e.target.value })} />
              {approvalPreview &&
                <p className="hint">MSRP {money(approvalPreview.msrp)} · Margin {pctFmt(approvalPreview.margin_pct)} · <StatusBadge status={approvalPreview.status} />{canSeeCost ? '' : ' (cost figures are visible to Admin only)'}</p>}
              <button>Request Approval</button>
            </form>
          </Card>

          <Card title={isAdmin ? 'All Requests' : 'My Requests'}>
            <Table
              headers={isAdmin
                ? ['Customer', 'Product', 'Type', 'Qty', 'Proposed Price', 'Landed Cost', 'Gross Profit', 'Margin', 'Status', 'Requested By', 'Action']
                : ['Customer', 'Product', 'Type', 'Qty', 'Proposed Price', 'Margin', 'Status']}
              rows={approvals.map(a => {
                const base = [a.customer_name || '-', productLookup(a.pricing_product_id)?.product_name || '-', a.transaction_type, a.quantity,
                  money(a.proposed_selling_price)];
                if (isAdmin) {
                  return [...base, money(a.landed_cost_at_request), money(a.gross_profit), pctFmt(a.margin_pct), <StatusBadge key={a.id} status={a.status} />, profileName(a.requested_by),
                    ['Approval Required', 'Manager Review Recommended'].includes(a.status)
                      ? <div className="actions" key={a.id + 'act'}><button onClick={() => decideApproval(a, 'Approve')}>Approve</button><button className="dark" onClick={() => decideApproval(a, 'Reject')}>Reject</button><button className="light" onClick={() => decideApproval(a, 'Request Revision')}>Revise</button></div>
                      : '-'];
                }
                return [...base, pctFmt(a.margin_pct), <StatusBadge key={a.id} status={a.status} />];
              })} />
          </Card>
        </>
      }

      {(tab === 'Pricing History' && isAdmin) &&
        <Card title="Pricing History" action={<label>Product<select value={historyProductFilter} onChange={e => setHistoryProductFilter(e.target.value)}><option value="All">All Products</option>{products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}</select></label>}>
          <Table headers={['Product', 'Field', 'Old Value', 'New Value', 'Reason', 'Changed By', 'When']}
            rows={history.filter(h => historyProductFilter === 'All' || h.pricing_product_id === historyProductFilter)
              .map(h => [productLookup(h.pricing_product_id)?.product_name || '-', h.field_changed, h.old_value ?? '-', h.new_value ?? '-', h.reason || '-', profileName(h.changed_by), new Date(h.changed_at).toLocaleString()])} />
        </Card>
      }
    </>
  );
}
