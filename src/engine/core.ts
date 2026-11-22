import { COUNTRIES, COUNTRY } from "../data/countries.js";
import { CAT, CATS, IND, INDUSTRIES } from "../data/lists.js";
import { DB, type Part } from "../data/db.js";
import type { Cents, GameState, Invoice, Lot, Payable, Pl, Po, Reg, Rfq, Shipment, So } from "./types.js";
import { Rng } from "./rng.js";
import { dutyRate, MONTHLY, toC } from "./pricing.js";
import { decide } from "./sales.js";
import { supTier } from "./pricing.js";
import { RIVALS } from "../data/rivals.js";
import { checkMissions } from "./missions.js";

export const SAVE_VERSION = 1;
export class SRng extends Rng { constructor(private st: { seed: number }) { super(st.seed); } next() { this.seed = this.st.seed; const v = super.next(); this.st.seed = this.seed; return v; } }
export const hooks: { day?: (s: GameState) => void } = {};
export const R = (s: GameState) => new SRng(s);
export const START_DATE = Date.UTC(2026, 0, 1);
export const dateStr = (day: number) => new Date(START_DATE + day * 86400000).toISOString().slice(0, 10);
export const money = (c: Cents) => (c < 0 ? "-" : "") + "$" + Math.abs(Math.round(c / 100)).toLocaleString("en-US");
export const money2 = (c: Cents) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monthKey = (day: number) => String(Math.floor(day / 30));
export const emptyPl = (): Pl => ({ rev: 0, cogs: 0, salaries: 0, rent: 0, freight: 0, customs: 0, bank: 0, interest: 0, tax: 0, other: 0 });
export const WH_BASE_M3 = 120, WH_STEP_M3 = 100, WH_RENT = 3000, WH_STEP_RENT = 1800;
import { SITE } from "../data/sites.js";
export const whCap = (s: GameState) => WH_BASE_M3 + (s.whSize - 1) * WH_STEP_M3 + (s.sites ?? []).reduce((a, id) => a + (SITE[id]?.cap ?? 0), 0);
export const whRentMonth = (s: GameState) => WH_RENT + (s.whSize - 1) * WH_STEP_RENT + (s.sites ?? []).reduce((a, id) => a + (SITE[id]?.rent ?? 0), 0);
export const LC_BASE = 60_000, LC_STEP = 40_000;
export const lcOf = (s: GameState) => (s.lc ??= { limit: Math.round(LC_BASE * 100), used: 0 });
export const CERT_COST: Record<string, { cost: number; days: number }> = { "ISO 9001": { cost: 8000, days: 30 }, "ISO 13485": { cost: 12000, days: 40 }, AS9120: { cost: 15000, days: 45 }, "IATF 16949": { cost: 12000, days: 40 }, "ISO 27001": { cost: 10000, days: 35 }, "Defence vendor clearance": { cost: 25000, days: 60 } };

export function createGame(o: { name?: string; difficulty?: "easy" | "normal" | "hard"; seed?: number; team?: boolean } = {}): GameState {
  const difficulty = o.difficulty ?? "normal";
  const fx: Record<string, number> = {}; for (const c of COUNTRIES) fx[c.cur] = c.fx;
  const s: GameState = { rivals: RIVALS.map((r) => ({ id: r.id, wins: 0, losses: 0, lastSeen: 0 })), version: SAVE_VERSION, day: 0, seed: o.seed ?? 4242, name: o.name || "Gulf Star Trading WLL", difficulty, over: "", cash: toC(difficulty === "easy" ? 250_000 : difficulty === "hard" ? 120_000 : 180_000), rep: 10, fx, industries: INDUSTRIES.filter((i) => i.start).map((i) => i.id), certs: [], certPending: {}, staff: { sales: 1, proc: 1, logistics: 0, warehouse: 1, finance: 0, quality: 0, customs: 0, bd: 0, tech: 0 }, whSize: 1, paused: true, speed: 1,
    rel: {}, reg: {}, rfqs: [], quotes: [], sos: [], pos: [], ships: [], lots: [], invoices: [], payables: [], loans: [], ledger: [], news: [], docs: [], pl: {}, counters: {}, flags: {}, mods: { price: {}, freight: {}, customsUntil: 0, payDelayUntil: 0 }, missions: [], hist: [], stats: { won: 0, lost: 0, delivered: 0, late: 0, revenue: 0, countries: [] } };
  for (const c of DB.clients) if (c.starter) s.reg[c.id] = { stage: 7, since: 0, wait: 0, result: "approved", reason: "Existing local customer", retryDay: 0 };
  news(s, "Welcome to " + s.name + ". Your first RFQs will arrive shortly. Open the Guide for the 14-step training campaign.", "info");
  // first RFQs right away so the player can start
  const rng = R(s); const starters = DB.clients.filter((c) => c.starter);
  for (let i = 0; i < 2; i++) genRfq(s, rng, starters[i % starters.length], false);
  if (o.team === false) s.flags.noTeam = true;
  return s;
}
export const nid = (s: GameState, k: string) => (s.counters[k] = (s.counters[k] ?? 0) + 1);
export function news(s: GameState, text: string, kind: "info" | "good" | "bad" | "warn" = "info") { s.news.unshift({ day: s.day, text, kind }); if (s.news.length > 120) s.news.length = 120; }
export function plOf(s: GameState, day = s.day): Pl { const k = monthKey(day); return (s.pl[k] ??= emptyPl()); }
export function cashIn(s: GameState, kind: string, text: string, amt: Cents) { s.cash += amt; s.ledger.unshift({ id: nid(s, "led"), day: s.day, kind, text, amount: amt }); if (s.ledger.length > 2000) s.ledger.length = 2000; }
export function cashOut(s: GameState, kind: string, text: string, amt: Cents) { s.cash -= amt; s.ledger.unshift({ id: nid(s, "led"), day: s.day, kind, text, amount: -amt }); if (s.ledger.length > 2000) s.ledger.length = 2000; }

const partsByCat: Record<string, Part[]> = {}; for (const p of DB.parts) (partsByCat[p.cat] ??= []).push(p);
export const isOpen = (r: Rfq) => ["new", "sourcing", "quoted", "negotiating"].includes(r.status);
const CERT_TEXT = ["Certificate of Conformity", "Manufacturer datasheet", "Material test certificate", "Certificate of Origin"];
export function genRfq(s: GameState, rng: Rng, client: (typeof DB.clients)[number], urgent: boolean): Rfq {
  const cats = CATS.filter((c) => c.inds.includes(client.industry)); const pool = cats.length ? cats : CATS.filter((c) => c.inds.includes("general"));
  const n = Math.min(5, Math.max(2, rng.int(2, 3 + Math.floor(client.volume / 2))));
  const lines = []; const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    const cat = rng.pick(pool); const ps = (partsByCat[cat.id] ?? []).filter((p) => !used.has(p.id)); if (!ps.length) continue; const part = rng.pick(ps); used.add(part.id);
    const scale = 1 + client.volume * 0.35; const qty = Math.max(1, Math.round((part.list > 8000 ? rng.int(1, 3) : part.list > 1500 ? rng.int(2, 6) : part.list > 300 ? rng.int(3, 20) : rng.int(10, 120)) * (part.list > 8000 ? 1 : scale * 0.8)));
    const certs: string[] = []; if (cat.cert) certs.push(cat.cert); if (client.persona === "cert" || rng.chance(0.2)) certs.push(rng.pick(CERT_TEXT));
    lines.push({ partId: part.id, qty, ref: toC(part.list * rng.range(1.02, 1.22) * (client.persona === "price" ? 0.97 : 1)), certs: [...new Set(certs)], note: rng.pick(["Genuine OEM only if possible.", "Standard industrial grade acceptable.", "Needed for planned shutdown.", "For maintenance stores replenishment.", "Project requirement, please quote best price.", "Include datasheets with offer."]), alloc: [], margin: 12 });
  }
  if (!lines.length) return genRfq(s, rng, client, urgent);
  const id = nid(s, "rfq");
  const r: Rfq = { id, no: `RFQ-${2026 + Math.floor(s.day / 365)}-${String(1200 + id).padStart(6, "0")}`, client: client.id, day: s.day, due: s.day + (urgent ? 7 : rng.int(14, 24)), needDays: urgent ? rng.int(8, 14) : rng.int(21, 60), dest: "Doha, Qatar", incoterm: "DAP", urgent, status: "new", lines, seen: false, cq: null, so: null, ship: {}, note: urgent ? "URGENT: customer needs a fast response." : "" };
  const nr = rng.chance(0.25) ? 0 : rng.chance(0.65) ? 1 : 2; if (nr) { const pool = RIVALS.slice().sort(() => rng.next() - 0.5).slice(0, nr); r.rivals = pool.map((v) => ({ id: v.id, bid: +(v.aggr * rng.range(0.94, 1.07)).toFixed(3) })); }
  s.rfqs.unshift(r); news(s, `${urgent ? "URGENT " : ""}${r.no} received from ${client.name}.`, urgent ? "warn" : "info"); return r;
}

export function registrationCheck(s: GameState, clientId: string): { ok: boolean; reasons: string[] } {
  const c = DB.clientById[clientId], reasons: string[] = [], ind = IND[c.industry];
  if (!s.industries.includes(c.industry)) reasons.push(`Industry "${ind.name}" is not unlocked`);
  if (s.rep < c.qual * 10) reasons.push(`Reputation ${Math.round(s.rep)} below ${c.qual * 10} required`);
  if (ind.cert && !s.certs.includes(ind.cert)) reasons.push(`Certification missing: ${ind.cert}`);
  if (c.qual >= 3 && s.stats.delivered < c.qual - 1) reasons.push(`Needs ${c.qual - 1} completed orders (you have ${s.stats.delivered})`);
  if (c.qual >= 2 && s.cash < toC(c.qual * 6000)) reasons.push(`Financial stability: keep cash above ${money(toC(c.qual * 6000))}`);
  return { ok: reasons.length === 0, reasons };
}

export function stockUsed(s: GameState) { return s.lots.reduce((a, l) => a + l.qty * (DB.partsById[l.partId]?.vol ?? 0), 0); }
export function netWorth(s: GameState) {
  const inv = s.lots.reduce((a, l) => a + l.qty * l.unitCost, 0), rec = s.invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0);
  const transit = s.pos.filter((p) => p.status !== "received" && p.status !== "inspected" && !p.fromStock).reduce((a, p) => a + p.value, 0);
  const pay = s.payables.filter((p) => !p.paid && p.kind !== "claim").reduce((a, p) => a + p.amount, 0), loans = s.loans.reduce((a, l) => a + l.left, 0);
  const claims = s.payables.filter((p) => !p.paid && p.kind === "claim").reduce((a, p) => a + p.amount, 0);
  return { cash: s.cash, inventory: inv, receivables: rec, transit, payables: pay, loans, claims, total: s.cash + inv + rec + transit + claims - pay - loans };
}

// ====================== the daily step ======================
export function stepDay(s: GameState) {
  if (s.over) return;
  s.day++; const rng = R(s);
  for (const c of Object.keys(s.fx)) { s.fx[c] = Math.max(0.01, s.fx[c] * (1 + rng.range(-0.0015, 0.0015))); }
  events(s, rng);
  // 1. new RFQs
  const open = s.rfqs.filter(isOpen).length, cap = 10 + s.staff.sales * 3;
  if (open < cap) {
    const mult = (1 + 0.1 * (s.staff.sales - 1)) * (0.7 + s.rep / 120) * (s.difficulty === "easy" ? 1.25 : s.difficulty === "hard" ? 0.8 : 1);
    for (const c of DB.clients) { const g = s.reg[c.id]; if (g?.result !== "approved" || !s.industries.includes(c.industry)) continue; if (rng.chance(c.rfqFreq * mult * 0.45 * ((s.mods.demand?.[c.industry] ?? 0) > s.day ? 1.9 : 1))) { genRfq(s, rng, c, false); if (s.rfqs.filter(isOpen).length >= cap) break; } }
  }
  // 2. RFQ expiry
  for (const r of s.rfqs) if ((r.status === "new" || r.status === "sourcing") && s.day > r.due) { r.status = "expired"; s.stats.lost++; s.rep = Math.max(0, s.rep - 0.4); news(s, `${r.no} expired: no quotation sent before the deadline.`, "warn"); }
  // 3. supplier quotes
  for (const q of s.quotes) {
    if (q.status === "pending" && q.replyDay <= s.day) {
      const sup = DB.supplierById[q.supplier];
      if (q.rev) { const rv = q.rev; q.rev = undefined; q.round++; q.status = "received"; q.expiry = s.day + rng.int(6, 12); if (rv.ok) { if (rv.unit) q.unit = rv.unit; if (rv.terms) q.terms = rv.terms; } q.note = rv.msg; q.negBusyUntil = 0; continue; }
      if (rng.chance(sup.type === "trader" ? 0.04 : 0.07)) { q.status = "declined"; q.note = "Supplier declined to quote (no capacity / not interested)."; continue; }
      q.status = "received";
    }
    if (q.status === "received" && q.expiry < s.day && !s.rfqs.some((r) => ["quoted", "negotiating", "awarded"].includes(r.status) && r.lines.some((l) => l.alloc.some((a) => a.quote === q.id)))) q.status = "expired";
  }
  // 4. customer replies
  for (const r of s.rfqs) { const cq = r.cq; if (cq && cq.status === "sent" && cq.replyDay <= s.day) customerReply(s, r, rng); }
  for (const r of s.rfqs) { const cq = r.cq; if (cq && cq.status === "replied" && s.day > cq.replyDay + 14 && (r.status === "negotiating" || r.status === "quoted")) { r.status = "lost"; cq.status = "rejected"; s.stats.lost++; news(s, `${r.no}: customer stopped waiting for your reply. Lost.`, "bad"); } }
  // 5. registration pipeline
  for (const [cid, g] of Object.entries(s.reg)) advanceReg(s, cid, g, rng);
  // 6. certifications
  for (const [n, d] of Object.entries(s.certPending)) if (d <= s.day) { delete s.certPending[n]; s.certs.push(n); s.rep += 2; news(s, `Certification granted: ${n}.`, "good"); }
  // 7. purchase orders and shipments
  logistics(s, rng);
  // 8. inspections
  for (const l of s.lots) if (l.status === "inspection" && l.inspectDay <= s.day) inspectLot(s, l.id, rng);
  // 9. deliveries to customers
  for (const so of s.sos) if (so.status === "delivering" && so.deliveryDay !== null && so.deliveryDay <= s.day) completeDelivery(s, so, rng);
  for (const so of s.sos) if ((so.status === "open") && s.day > so.needBy + 20) { so.status = "cancelled"; const r = s.rfqs.find((x) => x.id === so.rfq); if (r) r.status = "completed"; s.rep = Math.max(0, s.rep - 4); s.stats.late++; for (const l of s.lots) if (l.so === so.id) l.so = null; news(s, `${so.no} cancelled by ${DB.clientById[so.client].name}: delivery more than 20 days late. Reputation -4. Reserved stock released.`, "bad"); }
  // 10. money in / out
  for (const i of s.invoices) if (!i.paid && i.payDay <= s.day) { i.paid = true; let got = i.amount, fxNote = "";
    if (i.cur && i.fc && s.fx[i.cur]) { got = Math.round(i.fc / s.fx[i.cur]); const d = got - i.amount; plOf(s).other -= d; fxNote = ` · paid in ${i.cur} (FX ${d >= 0 ? "gain" : "loss"} ${money(Math.abs(d))})`; if (Math.abs(d) >= 5000) news(s, `FX ${d >= 0 ? "gain" : "loss"} of ${money(Math.abs(d))} on ${i.no} (${i.cur}).`, d >= 0 ? "good" : "warn"); }
    cashIn(s, "customer", `Payment received ${i.no} from ${DB.clientById[i.client].name}${fxNote}`, got); s.stats.revenue += i.amount; const k = DB.clientById[i.client]; s.rel[k.id] = Math.min(100, (s.rel[k.id] ?? 20) + 1); s.flags.paid = true; }
  for (const p of s.payables) if (!p.paid && p.due <= s.day) { const pw = s.wf; if (pw && pw.on && !s.flags.noTeam && pw.policy.payApprove && p.kind === "supplier" && p.amount >= pw.policy.payLimit * 100 && !p.ok) { if (s.day - p.due === 12) { s.rep = Math.max(0, s.rep - 0.5); news(s, `Payment to ${p.to} (${money(p.amount)}) is 12 days overdue: waiting for approval. Reputation suffers.`, "bad"); } continue; } p.paid = true; if (p.kind === "claim") cashIn(s, "claim", `Claim recovered: ${p.ref}`, p.amount); else cashOut(s, p.kind, `Paid ${p.to}: ${p.ref}`, p.amount); }
  // 11. costs
  const dailyRent = Math.round(toC(whRentMonth(s)) / 30); cashOut(s, "rent", "Warehouse rent (daily share)", dailyRent); plOf(s).rent += dailyRent;
  const over = stockUsed(s) - whCap(s); if (over > 0) { const f = Math.round(toC(over * 12)); cashOut(s, "storage", `Overflow storage ${over.toFixed(1)} m3`, f); plOf(s).other += f; if (s.day % 5 === 0) news(s, "Warehouse is over capacity: overflow storage fees are being charged. Expand or deliver stock.", "warn"); }
  if (s.cash < 0) { const f = Math.round(-s.cash * 0.0006); cashOut(s, "bank", "Overdraft interest", f); plOf(s).interest += f; }
  if (s.day % 30 === 0) monthEnd(s);
  if (s.day % 2 === 0) { const nw0 = netWorth(s).total; s.hist.push({ day: s.day, cash: s.cash, nw: nw0, rev: s.stats.revenue }); if (s.hist.length > 400) s.hist.shift(); }
  hooks.day?.(s);
  // 12. missions + game over
  checkMissions(s);
  const nw = netWorth(s).total; if (s.cash < toC(-150_000) || nw < toC(-100_000)) { s.over = "Bankrupt: your bank has frozen the accounts."; news(s, s.over, "bad"); }
}

function events(s: GameState, rng: Rng) {
  for (const k of Object.keys(s.mods.price)) if (s.mods.price[k].until <= s.day) delete s.mods.price[k];
  for (const k of Object.keys(s.mods.freight)) if (s.mods.freight[k].until <= s.day) delete s.mods.freight[k];
  for (const k of Object.keys(s.mods.region ?? {})) if (s.mods.region![k].until <= s.day) delete s.mods.region![k];
  for (const k of Object.keys(s.mods.demand ?? {})) if (s.mods.demand![k] <= s.day) delete s.mods.demand![k];
  if (s.day % 5 === 0) { s.fxHist ??= {}; for (const c of Object.keys(s.fx)) { const a = (s.fxHist[c] ??= []); a.push(s.fx[c]); if (a.length > 60) a.shift(); } }
  if (!rng.chance(0.16)) return;
  const e = rng.int(1, 15);
  if (e === 1) { const o = rng.pick(DB.parts).oem; const f = rng.range(1.04, 1.12); const sup = DB.oemSupplier[o]; s.mods.price[o] = { f, until: s.day + rng.int(25, 45), why: "price increase" }; news(s, `${sup.name.replace(" (OEM)", "")} announces a ${Math.round((f - 1) * 100)}% price increase. Quotes for its products will cost more.`, "warn"); }
  else if (e === 2) { const o = rng.pick(DB.parts).oem; const f = rng.range(0.86, 0.94); s.mods.price[o] = { f, until: s.day + 12, why: "clearance" }; news(s, `A Gulf distributor offers clearance stock on ${DB.oemSupplier[o].name.replace(" (OEM)", "")} items: about ${Math.round((1 - f) * 100)}% cheaper for 12 days.`, "good"); }
  else if (e === 3) { const l = rng.pick(DB.logistics); const f = rng.range(1.12, 1.35); s.mods.freight[l.id] = { f, until: s.day + 20, why: "surcharge" }; news(s, `${l.name} introduces a temporary surcharge (+${Math.round((f - 1) * 100)}%).`, "warn"); }
  else if (e === 4) { const l = rng.pick(DB.logistics.filter((x) => x.real)); const f = rng.range(0.84, 0.92); s.mods.freight[l.id] = { f, until: s.day + 15, why: "discount" }; news(s, `${l.name} offers a discounted freight contract: rates about ${Math.round((1 - f) * 100)}% lower for 15 days.`, "good"); }
  else if (e === 5) { const appr = DB.clients.filter((c) => s.reg[c.id]?.result === "approved" && s.industries.includes(c.industry)); if (appr.length) genRfq(s, rng, rng.pick(appr), true); }
  else if (e === 6) { const ps = s.pos.filter((p) => p.status === "placed"); if (ps.length) { const p = rng.pick(ps); const d = rng.int(4, 12); p.readyDay += d; p.delayed += d; const sh = s.ships.find((x) => x.id === p.ship); if (sh) { sh.depart += d; sh.arrive += d; } news(s, `${DB.supplierById[p.supplier].name} misses its ship date on ${p.no}: ${d} days late.`, "bad"); } }
  else if (e === 7) { s.mods.customsUntil = s.day + 10; news(s, "Customs authorities tighten inspections for 10 days. Expect more holds.", "warn"); }
  else if (e === 8) { const iv = s.invoices.filter((i) => !i.paid && i.payDay > s.day); if (iv.length) { const i = rng.pick(iv); const d = rng.int(7, 20); i.payDay += d; news(s, `${DB.clientById[i.client].name} delays payment of ${i.no} by ${d} days.`, "bad"); } }
  else if (e === 9) { const rs = s.rfqs.filter((r) => r.status === "quoted" || r.status === "negotiating"); if (rs.length) { const r = rng.pick(rs); r.status = "lost"; if (r.cq) r.cq.status = "rejected"; s.stats.lost++; const rv = r.rivals?.[0] ? RIVALS.find((x) => x.id === r.rivals![0].id) : rng.pick(RIVALS); const st = s.rivals?.find((x) => x.id === rv?.id); if (st) st.wins++; news(s, `${rv?.name ?? "A competitor"} wins ${r.no} with a faster offer.`, "bad"); } }
  else if (e === 10) { const c = rng.pick(Object.keys(s.fx)); const m = rng.range(-0.06, 0.06); s.fx[c] *= 1 + m; news(s, `${c} moves ${m > 0 ? "weaker" : "stronger"} against USD by ${Math.abs(m * 100).toFixed(1)}%.`, "info"); }
  else if (e === 12) { const rg = rng.pick(["Asia", "Europe", "Americas", "Africa"]); const sea = rng.chance(0.6); const d = rng.int(15, 30); s.mods.region ??= {}; s.mods.region[rg] = { f: +(sea ? rng.range(1.25, 1.6) : rng.range(1.2, 1.45)).toFixed(2), d: sea ? rng.int(5, 12) : rng.int(1, 3), until: s.day + d, why: sea ? "port strike / canal disruption" : "airspace restrictions", modes: sea ? ["sea"] : ["airfreight", "express", "economy"] }; news(s, `${sea ? "Port strikes and shipping disruption" : "Airspace restrictions"} hit ${rg} for about ${d} days: ${sea ? "sea freight" : "air freight"} from there costs more and takes longer.`, "bad"); }
  else if (e === 13) { const ind = rng.pick(s.industries); s.mods.demand ??= {}; s.mods.demand[ind] = s.day + rng.int(20, 35); news(s, `Demand boom in ${IND[ind]?.name ?? ind}: more RFQs arriving from those customers.`, "good"); }
  else if (e === 14) { const oems = Array.from(new Set(DB.parts.map((p) => p.oem))); const k = rng.int(3, 5); const names: string[] = []; for (let i = 0; i < k; i++) { const o = rng.pick(oems); const f = rng.range(1.06, 1.14); s.mods.price[o] = { f, until: s.day + rng.int(25, 40), why: "global shortage" }; names.push(DB.oemSupplier[o].name.replace(" (OEM)", "")); } news(s, `Component shortage: ${names.join(", ")} raise prices 6 to 14%.`, "warn"); }
  else if (e === 15) { s.mods.congestUntil = s.day + 12; let n = 0; for (const sh of s.ships) if (sh.status === "in_transit" && sh.mode === "sea") { sh.arrive += 3; n++; } news(s, `Port congestion at Hamad Port: ${n} sea shipment(s) delayed by 3 days.`, "warn"); }
  else if (e === 11) { const lot = s.lots.find((l) => l.status === "ok" && !l.so); if (lot && rng.chance(0.4)) { /* stock discrepancy */ const d = Math.min(lot.qty, 1); lot.qty -= d; news(s, `Stock count discrepancy: ${d} unit missing from ${DB.partsById[lot.partId].pn}. Written off.`, "warn"); plOf(s).other += d * lot.unitCost; } }
}

export function customerReply(s: GameState, r: Rfq, rng: Rng) {
  const cq = r.cq!; const resp = decide(s, r, rng); cq.resp = resp; cq.status = "replied"; cq.replyDay = s.day;
  const c = DB.clientById[r.client];
  if (resp.rival) { const st = s.rivals?.find((x) => x.id === resp.rival); if (st) { st.wins++; st.lastSeen = s.day; } }
  if ((resp.type === "accept" || resp.type === "partial") && r.rivals) for (const v of r.rivals) { const st = s.rivals?.find((x) => x.id === v.id); if (st) { st.losses++; st.lastSeen = s.day; } }
  if (resp.type === "accept" || resp.type === "partial") { cq.status = "accepted"; createSo(s, r, resp.type === "partial" ? resp.lines : undefined); news(s, `${c.name} awards ${r.no}${resp.type === "partial" ? " (partial order)" : ""}.`, "good"); }
  else if (resp.type === "reject") { r.status = "lost"; cq.status = "rejected"; s.stats.lost++; s.rel[c.id] = (s.rel[c.id] ?? 20) - 1; news(s, `${c.name} rejects ${r.no}: ${resp.msg}`, "bad"); }
  else if (resp.type === "cancel") { r.status = "cancelled"; cq.status = "rejected"; news(s, `${c.name} cancels ${r.no}.`, "bad"); }
  else { r.status = "negotiating"; news(s, `${c.name} replies on ${r.no}: ${resp.msg}`, "info"); }
}

export function createSo(s: GameState, r: Rfq, only?: number[]) {
  const cq = r.cq!; const id = nid(s, "so"); const lines = r.lines.map((l, i) => ({ l, i })).filter((x) => !only || only.includes(x.i));
  const so: So = { id, no: `SO-${String(5000 + id)}`, rfq: r.id, client: r.client, day: s.day, needBy: s.day + r.needDays, termsDays: cq.termsDays, warrantyM: cq.warrantyM, cur: cq.cur, fxAt: cq.fxAt, lines: lines.map(({ l, i }) => ({ partId: l.partId, qty: l.qty, unit: cq.lineUnits[i], delivered: 0, rfqLine: i })), status: "open", deliveryDay: null, purchased: false };
  for (const { l, i } of lines) for (const a of l.alloc) if (a.stockLot) { const lot = s.lots.find((x) => x.id === a.stockLot); if (lot && lot.qty >= a.qty) { if (lot.qty > a.qty) { const nl = { ...lot, id: `LOT-${nid(s, "lot")}`, qty: a.qty, so: id, soLine: so.lines.findIndex((x) => x.rfqLine === i) }; lot.qty -= a.qty; s.lots.push(nl); } else { lot.so = id; lot.soLine = so.lines.findIndex((x) => x.rfqLine === i); } } }
  if (only) for (let i = 0; i < r.lines.length; i++) if (!only.includes(i)) r.lines[i].alloc = r.lines[i].alloc.filter((a) => !a.quote);
  s.sos.push(so); r.so = id; r.status = "awarded"; s.stats.won++; s.rep = Math.min(100, s.rep + 1.2); s.rel[r.client] = Math.min(100, (s.rel[r.client] ?? 20) + 4); s.flags.so_created = true;
}

function advanceReg(s: GameState, cid: string, g: Reg, rng: Rng) {
  if (g.result === "approved") return;
  const c = DB.clientById[cid];
  if (g.stage === 1 && s.day >= g.since + g.wait) { g.stage = 2; g.since = s.day; news(s, `${c.name}: buyer replied. Registration link received. Submit your documents.`, "info"); }
  else if (g.stage === 3 && s.day >= g.since + g.wait) {
    g.stage = 4; g.since = s.day; const chk = registrationCheck(s, cid);
    const luck = rng.chance(0.08);
    if (chk.ok || (luck && chk.reasons.length === 1 && !chk.reasons[0].startsWith("Industry"))) { g.result = "approved"; g.stage = 7; news(s, `Vendor approved by ${c.name}. RFQs unlocked!`, "good"); s.flags.vendor = true; s.rep += 2; }
    else { g.result = "rejected"; g.reason = chk.reasons.join("; "); g.retryDay = s.day + 45; news(s, `${c.name} rejected your vendor application: ${g.reason}`, "bad"); }
  }
  if (g.result === "rejected" && s.day >= g.retryDay) { delete s.reg[cid]; }
}

// ---------- supply chain movement ----------
function logistics(s: GameState, rng: Rng) {
  for (const po of s.pos) {
    const sh = s.ships.find((x) => x.id === po.ship); if (!sh) continue; const sup = DB.supplierById[po.supplier];
    if (po.status === "placed" && s.day >= sh.depart) {
      if (po.terms === "lc" && sup.docs !== "full" && !po.lcChecked) { po.lcChecked = true; if (rng.chance(sup.docs === "none" ? 0.55 : 0.3)) { sh.depart += 3; sh.arrive += 3; const fee = Math.round(150 * 100); if (s.cash >= fee) { cashOut(s, "bank", `LC discrepancy fee ${po.no}`, fee); plOf(s).bank += fee; } news(s, `Bank found document discrepancies on the letter of credit for ${po.no} (${sup.name}). Shipment held 3 days, fee charged. Suppliers with full documents avoid this.`, "warn"); continue; } }
      po.status = "shipped"; sh.status = "in_transit";
      if (po.terms === "lc") { const lc = lcOf(s); cashOut(s, "supplier", `LC payment ${po.no} to ${sup.name}`, po.value - (po.lcMargin ?? 0)); lc.used = Math.max(0, lc.used - po.value); }
      else if (po.terms === "net30" || po.terms === "net60") s.payables.push({ id: nid(s, "pay"), to: sup.name, kind: "supplier", ref: po.no, amount: po.value, due: s.day + (po.terms === "net30" ? 30 : 60), paid: false, po: po.id });
      if (!sh.supplierArranged && sh.freight > 0) { s.payables.push({ id: nid(s, "pay"), to: DB.logiById[sh.logi]?.name ?? "Freight", kind: "freight", ref: sh.no, amount: sh.freight, due: s.day + 7, paid: false, po: po.id }); plOf(s).freight += sh.freight; }
      news(s, `${po.no} dispatched by ${sup.name} (${sh.no}). ETA ${sh.arrive - s.day} days.`, "info");
    }
    if (sh.status === "in_transit" && s.day >= sh.arrive) {
      if (sup.country === "QA") { sh.status = "cleared"; sh.cleared = true; }
      else {
        sh.status = "customs"; const pHold = (0.1 + (s.mods.customsUntil > s.day ? 0.18 : 0) + (po.docs === "none" ? 0.25 : po.docs === "basic" ? 0.07 : 0) + (1 - sup.reliab) * 0.2) * (1 - 0.15 * Math.min(3, s.staff.customs));
        if (rng.chance(pHold)) { sh.status = "held"; const d = rng.int(3, 8); sh.heldUntil = s.day + d; sh.docsOk = false; news(s, `${sh.no} held at customs for ${d} days (inspection / documentation query).`, "warn"); }
        else sh.heldUntil = s.day + rng.int(1, 2);
      }
    }
    if ((sh.status === "customs" || sh.status === "held") && s.day >= sh.heldUntil && !sh.cleared) {
      sh.cleared = true; sh.status = "cleared";
      if (sh.duty > 0 && !sh.dutyPaid) { sh.dutyPaid = true; cashOut(s, "customs", `Import duty ${sh.no}`, sh.duty); plOf(s).customs += sh.duty; }
      if (sh.clearance + sh.local > 0) { cashOut(s, "customs", `Clearance & local transport ${sh.no}`, sh.clearance + sh.local); plOf(s).customs += sh.clearance + sh.local; }
    }
    if (sh.status === "cleared" && s.day >= sh.heldUntil + 0) { receiveGoods(s, po, sh, rng); }
  }
}
function receiveGoods(s: GameState, po: Po, sh: Shipment, rng: Rng) {
  sh.status = "delivered"; po.status = "received"; s.flags.received = true;
  { const st = ((s.supStats ??= {})[po.supplier] ??= { orders: 0, value: 0, bad: 0 }); const before = supTier(s, po.supplier).id; st.orders++; st.value += po.value; if (po.wrongItem) st.bad++; const after = supTier(s, po.supplier); if (after.id !== before) news(s, `${DB.supplierById[po.supplier].name} is now a ${after.name} supplier: ${Math.round(after.disc * 100)}% better prices, ${Math.round((1 - after.lead) * 100)}% faster${after.terms ? ", better payment terms" : ""}.`, "good"); }
  const extra = sh.freight + (sh.insured ? 0 : 0) + sh.duty + sh.clearance + sh.local, valueSum = po.lines.reduce((a, l) => a + l.qty * l.unit, 0) || 1;
  const sup = DB.supplierById[po.supplier]; if (!s.stats.countries.includes(sup.country)) s.stats.countries.push(sup.country);
  for (const l of po.lines) {
    const lv = l.qty * l.unit; const share = lv / valueSum; const cost = Math.round((lv + extra * share + (sh.freight ? 0 : 0)) / l.qty);
    const so = s.sos.find((x) => x.id === po.so);
    const lot: Lot = { id: `LOT-${nid(s, "lot")}`, partId: l.partId, qty: l.qty, unitCost: cost, so: so ? so.id : null, soLine: so ? so.lines.findIndex((x) => x.rfqLine === l.soLine) : -1, day: s.day, batch: `B${String(s.day).padStart(4, "0")}-${po.id}`, serial: `SN${DB.partsById[l.partId].pn.slice(0, 3)}${String(po.id).padStart(3, "0")}`, status: "inspection", damaged: 0, po: po.id, inspectDay: s.day + Math.max(1, 3 - s.staff.warehouse) , };
    s.lots.push(lot);
  }
  news(s, `Goods received: ${po.no} from ${sup.name}. Inspect the delivery in the Warehouse.`, "info");
}
export function inspectLot(s: GameState, id: string, rng: Rng) {
  const lot = s.lots.find((l) => l.id === id); if (!lot || lot.status !== "inspection") return;
  const po = s.pos.find((p) => p.id === lot.po), sh = po ? s.ships.find((x) => x.id === po.ship) : undefined, sup = po ? DB.supplierById[po.supplier] : undefined;
  let dmg = 0;
  const p = (sup ? sup.risk * 0.22 : 0.01) + (sh && DB.logiById[sh.logi] ? (1 - DB.logiById[sh.logi].reliab) * 0.15 : 0.01) - 0.003 * s.staff.warehouse;
  for (let i = 0; i < lot.qty; i++) if (rng.chance(Math.max(0.005, p))) dmg++;
  if (po?.wrongItem && rng.chance(0.7)) dmg = lot.qty;
  if (s.staff.quality > 0 && dmg > 0 && rng.chance(0.3 * s.staff.quality)) dmg = Math.max(0, dmg - 1);
  lot.damaged = dmg; lot.qty -= dmg; lot.status = lot.qty > 0 ? "ok" : "damaged"; if (po) po.status = "inspected"; s.flags.inspected = true;
  if (dmg > 0) {
    const loss = dmg * lot.unitCost; plOf(s).other += 0; let rec = 0;
    if (sh?.insured) rec = Math.round(loss * 0.9); else if (po?.wrongItem) rec = Math.round(loss * 0.6);
    if (rec > 0) s.payables.push({ id: nid(s, "pay"), to: "Claim", kind: "claim", ref: `${po?.no} damaged ${dmg}`, amount: rec, due: s.day + 10, paid: false, po: po?.id ?? 0 });
    plOf(s).other += loss - rec;
    news(s, `Inspection ${lot.id}: ${dmg} unit(s) ${po?.wrongItem ? "wrong or non-conforming" : "damaged"}${rec ? `. Claim of ${money(rec)} filed.` : ". Not insured: loss absorbed."}`, "bad");
    if (lot.qty === 0) s.lots = s.lots.filter((l) => l.id !== lot.id);
  } else news(s, `Inspection ${lot.id} passed. Stock available.`, "good");
}
export function completeDelivery(s: GameState, so: So, rng: Rng) {
  let amount = 0, cogs = 0;
  for (const [i, l] of so.lines.entries()) { const need = l.qty - l.delivered; if (need <= 0) continue; const lots = s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "ok"); let take = need; for (const lot of lots) { const t = Math.min(take, lot.qty); if (t <= 0) continue; lot.qty -= t; take -= t; cogs += t * lot.unitCost; amount += t * l.unit; l.delivered += t; } }
  s.lots = s.lots.filter((l) => l.qty > 0 || l.status === "inspection");
  if (amount === 0) { so.status = "open"; so.deliveryDay = null; return; }
  const c = DB.clientById[so.client]; const late = s.day > so.needBy;
  if (late && c.persona === "delivery") amount = Math.round(amount * 0.97);
  const id = nid(s, "inv"); const delay = Math.round((1 - c.payRel) * 40 * rng.range(0.3, 1.2)) - (s.staff.finance > 0 ? 3 : 0) + (s.mods.payDelayUntil > s.day ? 5 : 0);
  const inv: Invoice = { cur: so.cur, fc: so.cur && so.fxAt ? Math.round(amount * so.fxAt) : undefined, id, no: `INV-${String(7000 + id)}`, so: so.id, client: so.client, amount, issue: s.day, due: s.day + so.termsDays, payDay: s.day + so.termsDays + Math.max(0, delay), paid: false, cogs };
  s.invoices.push(inv); plOf(s).rev += amount; plOf(s).cogs += cogs; s.stats.delivered++;
  const complete = so.lines.every((l) => l.delivered >= l.qty);
  if (complete) { so.status = "closed"; const r = s.rfqs.find((x) => x.id === so.rfq); if (r) r.status = "completed"; } else so.status = "open";
  so.deliveryDay = null; s.flags.delivered = true;
  if (late) { s.stats.late++; s.rep = Math.max(0, s.rep - 1.5); news(s, `${so.no} delivered LATE to ${c.name}. Invoice ${inv.no} issued. Reputation drops.`, "bad"); }
  else { s.rep = Math.min(100, s.rep + 1.5); news(s, `${so.no} delivered on time to ${c.name}. Invoice ${inv.no}: ${money(amount)}.`, "good"); }
}
function monthEnd(s: GameState) {
  const pl = plOf(s, s.day - 1);
  let sal = 0; if (s.wf) for (const e of s.wf.emps) sal += toC(e.salary); else for (const [k, n] of Object.entries(s.staff)) sal += toC(MONTHLY[k as keyof typeof MONTHLY]) * n;
  if (sal) { cashOut(s, "salaries", "Monthly salaries", sal); pl.salaries += sal; }
  for (const l of s.loans) { const interest = Math.round(l.left * l.rate / 12), prin = Math.round(l.principal / 12); const pay = Math.min(l.left, prin); l.left -= pay; cashOut(s, "loan", "Loan instalment + interest", pay + interest); pl.interest += interest; }
  s.loans = s.loans.filter((l) => l.left > 0);
  const profit = pl.rev - pl.cogs - pl.salaries - pl.rent - pl.bank - pl.interest - pl.other - pl.freight * 0 - 0;
  if (profit > 0) { const tax = Math.round(profit * 0.1); cashOut(s, "tax", "Corporate tax (10% of month profit)", tax); pl.tax += tax; }
  news(s, `Month closed. Revenue ${money(pl.rev)}, cost of goods ${money(pl.cogs)}.`, "info");
}
export { COUNTRY, CAT, dutyRate };
export type { Payable };
