import { COUNTRY, km } from "../data/countries.js";
import { CAT } from "../data/lists.js";
import { SITE } from "../data/sites.js";
import { DB, type Logistic, type Mode, type Part, type Supplier } from "../data/db.js";
import type { Cents, GameState, Quote, Rfq } from "./types.js";
import { Rng, hash } from "./rng.js";

export const usd = (cents: Cents) => cents / 100;
export const toC = (d: number) => Math.round(d * 100);
export const INCO_UP: Record<string, number> = { EXW: 1.0, FCA: 1.0, FOB: 1.012, CIF: 1.07, CPT: 1.06, CIP: 1.08, DAP: 1.11, DDP: 1.17 };
export const FREIGHT_INCLUDED = new Set(["CIF", "CPT", "CIP", "DAP", "DDP"]);
export const INCO_NOTE: Record<string, string> = { EXW: "You collect at the seller's door and arrange everything.", FCA: "Seller hands over to your carrier at origin.", FOB: "Seller loads on board; you pay main freight.", CIF: "Seller pays freight + insurance to Doha; you clear customs.", CPT: "Seller pays freight to Doha.", CIP: "Seller pays freight + insurance to Doha.", DAP: "Seller delivers to Doha; you pay duty.", DDP: "Seller delivers to Doha with duties paid." };

export function priceMod(s: GameState, oem: string): number { const m = s.mods.price[oem]; return m && m.until > s.day ? m.f : 1; }
export function fxOf(s: GameState, cur: string) { return s.fx[cur] ?? 1; }

/** Which suppliers can quote a part? (brand holders, authorized distributors, traders, and local stockists offering a generic alternative.) */
export function eligible(s: GameState, part: Part): { sup: Supplier; alt: boolean }[] {
  const cat = CAT[part.cat]; const out: { sup: Supplier; alt: boolean }[] = [];
  for (const sup of DB.suppliers) {
    if (!sup.inds.some((i) => s.industries.includes(i))) continue;
    if (sup.brands.includes(part.oem)) out.push({ sup, alt: false });
    else if (sup.type === "local" && sup.groups.includes(cat.group) && !cat.cert) out.push({ sup, alt: true });
  }
  return out;
}
export function supplierStaffDelay(s: GameState, base: number) { return Math.max(1, Math.round(base * (1 - 0.1 * Math.min(4, s.staff.proc - 1)))); }

export const TIERS = [
  { id: "new", name: "New", orders: 0, value: 0, disc: 0, lead: 1, terms: "" },
  { id: "trusted", name: "Trusted", orders: 3, value: 0, disc: 0.01, lead: 0.95, terms: "" },
  { id: "preferred", name: "Preferred", orders: 8, value: 40_000, disc: 0.025, lead: 0.9, terms: "net30" },
  { id: "strategic", name: "Strategic partner", orders: 15, value: 120_000, disc: 0.04, lead: 0.85, terms: "net60" },
];
export function supTier(s: GameState, sid: string) {
  const st = s.supStats?.[sid]; const eff = (st?.orders ?? 0) - 2 * (st?.bad ?? 0), val = (st?.value ?? 0) / 100; let t = TIERS[0];
  for (const x of TIERS) if (eff >= x.orders && val >= x.value) t = x; return t;
}
export function makeQuote(s: GameState, rfq: Rfq, line: number, sup: Supplier, alt: boolean, rng: Rng, id: string): Quote {
  const l = rfq.lines[line], part = DB.partsById[l.partId];
  const inco = sup.type === "local" ? (sup.country === "QA" ? "DAP" : "DAP") : sup.type === "oem" ? rng.pick(["EXW", "FCA", "FOB", "CIF", "DAP"]) : rng.pick(["EXW", "FOB", "CIF", "CIP", "DAP", "FCA", "DDP"]);
  const qdisc = l.qty >= 50 ? 0.94 : l.qty >= 10 ? 0.97 : 1;
  const tier = supTier(s, sup.id);
  const base = (1 - tier.disc) * part.list * (alt ? rng.range(0.6, 0.78) : sup.priceF) * priceMod(s, part.oem) * rng.range(0.965, 1.04) * qdisc * (INCO_UP[inco] ?? 1);
  const inStock = rng.chance(sup.stockP);
  const qtyAvail = inStock ? Math.max(1, Math.ceil(l.qty * rng.range(0.55, 1.6))) : 0;
  const lead = inStock ? Math.max(1, Math.round(sup.leadD / 3)) : Math.round(sup.leadD * rng.range(0.8, 1.4));
  const reply = s.day + supplierStaffDelay(s, sup.respD + rng.int(0, 2));
  return { id, rfq: rfq.id, line, supplier: sup.id, partId: l.partId, status: "pending", askedDay: s.day, replyDay: reply, expiry: reply + rng.int(14, 28), unit: toC(base), cur: COUNTRY[sup.country].cur, fx: fxOf(s, COUNTRY[sup.country].cur), qtyAvail, inStock, leadD: Math.max(1, Math.round(lead * tier.lead)), warrantyM: sup.type === "oem" ? 24 : sup.type === "trader" ? 6 : 12, incoterm: inco, terms: ((tier.terms === "net60" && sup.terms !== "net60") || (tier.terms === "net30" && (sup.terms === "prepay" || sup.terms === "lc")) ? tier.terms : sup.terms) as never, docs: alt ? "basic" : sup.docs, round: 0, note: alt ? "Generic equivalent: needs customer approval" : "", negBusyUntil: 0, moq: sup.type === "oem" ? Math.max(1, Math.min(l.qty, rng.int(1, 3))) : 1, alt };
}

// ---------------- freight
export interface FreightQuote { ok: boolean; why?: string; cost: Cents; days: number; ins: Cents; chargeable: number }
const ROAD_FROM = new Set(["AE", "SA", "KW", "OM", "TR", "EG"]), RAIL_FROM = new Set(["CN", "DE", "TR", "IN", "NL", "IT", "FR", "ES", "GB", "SE", "NO", "DK", "FI", "CH"]);
export function freightQuote(s: GameState, lg: Logistic, mode: Mode, origin: string, kg: number, vol: number, valueC: Cents, insure: boolean, dg = false): FreightQuote {
  const fail = (why: string): FreightQuote => ({ ok: false, why, cost: 0, days: 0, ins: 0, chargeable: 0 });
  if (!lg.modes.includes(mode)) return fail("Provider does not offer this mode");
  if (origin === "QA") return { ok: true, cost: 0, days: 1, ins: 0, chargeable: kg };
  if (kg > lg.maxKg) return fail("Over maximum weight");
  if (kg > 2000 && !lg.heavy) return fail("Heavy cargo not handled");
  if (dg && !lg.dg) return fail("Dangerous goods not handled");
  if (mode === "road" && !ROAD_FROM.has(origin)) return fail("No road route");
  if (mode === "rail" && !RAIL_FROM.has(origin)) return fail("No rail route");
  if (mode === "express" && kg > 300) return fail("Over courier limit");
  const o = COUNTRY[origin], d = km(o, COUNTRY.QA);
  const volF = mode === "sea" ? 400 : mode === "road" || mode === "rail" ? 300 : mode === "economy" ? 200 : mode === "express" ? 200 : 167;
  const ch = Math.max(kg, vol * volF);
  const factor = mode === "sea" ? 0.7 + d / 20000 : mode === "road" || mode === "rail" ? 0.6 + d / 6000 : 0.55 + d / 12000;
  const mod = s.mods.freight[lg.id]; const mm = mod && mod.until > s.day ? mod.f : 1;
  const rd = s.mods.region?.[o.region]; const rh = rd && rd.until > s.day && rd.modes.includes(mode) ? rd : null;
  const base = ch * (lg.rate[mode] ?? 1) * factor * o.freightIdx * mm * (rh ? rh.f : 1);
  const cost = (Math.max(lg.min, base) * (1 + lg.fuel * mm) + lg.docFee + lg.collect);
  const days0 = Math.round(mode === "express" ? 2 + d / 9000 : mode === "airfreight" ? 3 + d / 5000 : mode === "economy" ? 6 + d / 4000 : mode === "sea" ? 12 + d / 450 : mode === "road" ? 3 + d / 700 : 14 + d / 700);
  const hub = Math.max(0, ...(s.sites ?? []).map((id) => (SITE[id]?.regions.includes(o.region) ? SITE[id].bonus : 0)));
  const days = Math.max(1, days0 + (rh ? rh.d : 0) - hub);
  return { ok: true, cost: toC(cost), days, ins: insure ? Math.max(500, Math.round(valueC * lg.insPct)) : 0, chargeable: Math.round(ch) };
}

export function exportOpt(s: GameState, dest: string, kg: number, vol: number, valueC: number) {
  if (dest === "QA" || !COUNTRY[dest]) return null; type O = { cost: number; days: number; mode: string; logi: string }; let best: O | null = null, fast: O | null = null;
  for (const lg of DB.logistics) for (const mode of lg.modes) { if (mode === "rail") continue; const f = freightQuote(s, lg, mode, dest, kg, vol, valueC, false, false); if (!f.ok) continue; const o: O = { cost: f.cost + toC(60), days: f.days + 1, mode, logi: lg.id }; if (!fast || o.days < fast.days) fast = o; if (o.days <= 21 && (!best || o.cost < best.cost)) best = o; }
  return best ?? fast;
}
// ---------------- landed cost
export interface LandedLine { partId: string; qty: number; purchase: Cents; freight: Cents; insurance: Cents; duty: Cents; clearance: Cents; local: Cents; bank: Cents; total: Cents; unit: Cents; etaDays: number; kg: number; vol: number; supplier: string; fromStock: boolean; alt: boolean; docs: "full" | "basic" | "none"; sourceType: string; exp?: Cents }
export interface Landed { lines: Record<number, LandedLine[]>; byLine: Record<number, { qty: number; total: Cents; unit: Cents; eta: number; short: number; alt: boolean; docs: string; oemSource: boolean }>; complete: boolean; total: Cents; eta: number; issues: string[] }
export function dutyRate(part: Part, origin: string) { return CAT[part.cat].group === "med" ? 0 : COUNTRY[origin].duty / 100; }
export function landedCost(s: GameState, rfq: Rfq): Landed {
  const lines: Record<number, LandedLine[]> = {}, issues: string[] = [];
  type Row = { li: number; q: Quote | null; lot?: string; qty: number };
  const rows: Row[] = [];
  rfq.lines.forEach((l, li) => { for (const a of l.alloc) { if (a.quote) rows.push({ li, q: s.quotes.find((x) => x.id === a.quote) ?? null, qty: a.qty }); else if (a.stockLot) rows.push({ li, q: null, lot: a.stockLot, qty: a.qty }); } });
  // group by supplier shipment for freight allocation
  const groups: Record<string, Row[]> = {};
  for (const r of rows) if (r.q) (groups[r.q.supplier] ??= []).push(r);
  const lineRes: Record<string, { freight: Cents; ins: Cents; days: number }> = {};
  for (const [sid, rs] of Object.entries(groups)) {
    const sup = DB.supplierById[sid]; const inc = rs[0].q!.incoterm;
    const kg = rs.reduce((a, r) => a + r.qty * DB.partsById[r.q!.partId].kg, 0), vol = rs.reduce((a, r) => a + r.qty * DB.partsById[r.q!.partId].vol, 0);
    const value = rs.reduce((a, r) => a + r.qty * r.q!.unit, 0);
    const pick = rfq.ship[sid];
    let fr = 0, ins = 0, days = 0;
    if (FREIGHT_INCLUDED.has(inc) || sup.country === "QA") { days = sup.country === "QA" ? 1 : Math.round(8 + km(COUNTRY[sup.country], COUNTRY.QA) / 600); }
    else if (pick) { const lg = DB.logiById[pick.logi]; const fq = freightQuote(s, lg, pick.mode, sup.country, kg, vol, value, pick.insure, rs.some((r) => CAT[DB.partsById[r.q!.partId].cat].dg)); if (fq.ok) { fr = fq.cost; ins = fq.ins; days = fq.days; } else issues.push(`${sup.name}: ${fq.why}`); }
    else { issues.push(`Choose freight for ${sup.name} (${inc} terms: you arrange transport)`); }
    lineRes[sid] = { freight: fr, ins, days };
    const isDDP = inc === "DDP";
    for (const r of rs) {
      const part = DB.partsById[r.q!.partId], w = (r.qty * part.kg) / Math.max(0.0001, kg);
      const purchase = r.qty * r.q!.unit, freight = Math.round(fr * w), insurance = Math.round(ins * w) + (FREIGHT_INCLUDED.has(inc) ? 0 : 0);
      const duty = isDDP || sup.country === "QA" ? 0 : Math.round((purchase + freight + insurance) * dutyRate(part, sup.country));
      const clearance = sup.country === "QA" ? 0 : Math.round(toC(85) * w), local = sup.country === "QA" ? 0 : Math.round(toC(Math.max(45, kg * 0.12)) * w);
      const bank = Math.max(Math.round(purchase * (r.q!.terms === "lc" ? 0.012 : 0.0035)), toC(8));
      const total = purchase + freight + insurance + duty + clearance + local + bank;
      (lines[r.li] ??= []).push({ partId: part.id, qty: r.qty, purchase, freight, insurance, duty, clearance, local, bank, total, unit: Math.round(total / r.qty), etaDays: days + r.q!.leadD + (sup.country === "QA" ? 0 : 3) + 1, kg: r.qty * part.kg, vol: r.qty * part.vol, supplier: sid, fromStock: false, alt: !!r.q!.alt, docs: r.q!.docs, sourceType: sup.type + (sup.auth ? "+auth" : "") });
    }
  }
  for (const r of rows) if (!r.q && r.lot) {
    const lot = s.lots.find((x) => x.id === r.lot); if (!lot) continue;
    (lines[r.li] ??= []).push({ partId: lot.partId, qty: r.qty, purchase: r.qty * lot.unitCost, freight: 0, insurance: 0, duty: 0, clearance: 0, local: 0, bank: 0, total: r.qty * lot.unitCost, unit: lot.unitCost, etaDays: 1, kg: 0, vol: 0, supplier: "stock", fromStock: true, alt: false, docs: "full", sourceType: "stock" });
  }
  const dest = DB.clientById[rfq.client]?.country;
  if (dest && dest !== "QA") { const all = Object.values(lines).flat(); const wt = (x: LandedLine) => x.qty * DB.partsById[x.partId].kg; const kgT = all.reduce((a, x) => a + wt(x), 0), volT = all.reduce((a, x) => a + x.qty * DB.partsById[x.partId].vol, 0), valT = all.reduce((a, x) => a + x.purchase, 0);
    if (all.length) { const o = exportOpt(s, dest, kgT, volT, Math.round(valT * 1.2)); if (o) for (const x of all) { x.exp = Math.round(o.cost * (wt(x) / Math.max(0.0001, kgT))); x.total += x.exp; x.unit = Math.round(x.total / x.qty); x.etaDays += o.days; } else issues.push(`No carrier can ship this cargo to ${COUNTRY[dest].name}.`); } }
  const byLine: Landed["byLine"] = {}; let total = 0, eta = 0, complete = true;
  rfq.lines.forEach((l, li) => {
    const ls = lines[li] ?? []; const qty = ls.reduce((a, x) => a + x.qty, 0), t = ls.reduce((a, x) => a + x.total, 0), e = ls.reduce((a, x) => Math.max(a, x.etaDays), 0);
    const docs = ls.some((x) => x.docs === "none") ? "none" : ls.some((x) => x.docs === "basic") ? "basic" : "full";
    byLine[li] = { qty, total: t, unit: qty ? Math.round(t / qty) : 0, eta: e, short: Math.max(0, l.qty - qty), alt: ls.some((x) => x.alt), docs, oemSource: ls.length > 0 && ls.every((x) => x.sourceType === "stock" || x.sourceType.startsWith("oem") || x.sourceType.includes("auth")) };
    if (qty < l.qty) complete = false; total += t; eta = Math.max(eta, e);
  });
  return { lines, byLine, complete, total, eta, issues };
}
export const MONTHLY = { sales: 3500, proc: 3200, logistics: 2800, warehouse: 1800, finance: 3000, quality: 3000, customs: 3200, bd: 4500, tech: 4000 };
export const ROLE_LABEL: Record<string, string> = { sales: "Sales executive", proc: "Procurement officer", logistics: "Logistics coordinator", warehouse: "Warehouse employee", finance: "Finance officer", quality: "Quality inspector", customs: "Customs specialist", bd: "Business development manager", tech: "Technical specialist" };
export const ROLE_EFFECT: Record<string, string> = { sales: "+10% RFQ flow, +1.5% customer acceptance", proc: "Faster supplier replies, better negotiation", logistics: "Fewer shipping delays", warehouse: "Less handling damage, faster inspection", finance: "Lower bank charges, faster collections", quality: "Catches problems at inspection", customs: "Fewer customs holds", bd: "Faster vendor registration", tech: "Technical clarifications succeed more often" };
export { hash };
