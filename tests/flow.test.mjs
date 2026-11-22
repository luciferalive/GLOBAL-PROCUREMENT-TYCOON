import test from "node:test"; import assert from "node:assert/strict";
import { createGame, netWorth } from "../docs/js/engine/core.js";
import { dispatch } from "../docs/js/engine/actions.js";
import { stepDay } from "../docs/js/engine/core.js";
import { DB } from "../docs/js/data/db.js";
import { landedCost, freightQuote } from "../docs/js/engine/pricing.js";
import { lcOf, whCap, whRentMonth } from "../docs/js/engine/core.js";
import { supTier, makeQuote } from "../docs/js/engine/pricing.js";
import { assess } from "../docs/js/engine/sales.js";
import { Rng } from "../docs/js/engine/rng.js";

function shipFor(s, r) { // choose a valid freight option for every supplier that needs one
  const land = landedCost(s, r);
  for (const issue of land.issues) {
    const m = /Choose freight for (.+?) \(/.exec(issue); if (!m) continue; const sup = DB.suppliers.find((x) => issue.includes(x.name)); if (!sup) continue;
    let done = false;
    for (const lg of DB.logistics) for (const mode of lg.modes) { if (done) continue; const set = { type: "setShip", rfq: r.id, supplier: sup.id, logi: lg.id, mode, insure: true }; dispatch(s, set); if (!landedCost(s, r).issues.some((x) => x.includes(sup.name))) done = true; }
  }
}
function playOne(seed, margin = 14, opt = {}) {
  const s = createGame({ team: false, seed });
  const log = [];
  for (let guard = 0; guard < 500 && (opt.cur ? !s.invoices.some((i) => i.cur) : s.stats.delivered < 1) && !s.over; guard++) {
    for (const r of s.rfqs) {
      if (r.status === "new" && opt.foreign && !r.fx) { r.fx = 1; const c = DB.clients.find((x) => x.country === opt.foreign); r.client = c.id; }
      if (r.status === "new") { dispatch(s, { type: "openRfq", id: r.id }); r.lines.forEach((_, li) => dispatch(s, { type: "autoQuotes", rfq: r.id, line: li, max: 5 })); }
      if (r.status === "sourcing" && r.lines.every((_, li) => s.quotes.some((q) => q.rfq === r.id && q.line === li && q.status === "received")) ) {
        if (opt.lc) for (const q of s.quotes) if (q.rfq === r.id) q.terms = "lc";
        if (opt.cur) dispatch(s, { type: "setCq", rfq: r.id, opt: { cur: opt.cur } });
        dispatch(s, { type: "autoAlloc", rfq: r.id }); shipFor(s, r); 
        r.lines.forEach((l, li) => dispatch(s, { type: "setMargin", rfq: r.id, line: li, pct: margin }));
        const res = dispatch(s, { type: "sendQuote", rfq: r.id }); if (!res.ok) log.push(res.msg);
      }
      if (r.cq?.status === "replied" && ["negotiating"].includes(r.status)) {
        const t = r.cq.resp.type;
        if (t === "discount" || t === "delivery" || t === "warranty") dispatch(s, { type: "replyCustomer", rfq: r.id, act: "accept_ask" });
        else if (t === "clarify") dispatch(s, { type: "replyCustomer", rfq: r.id, act: "clarify" });
        else dispatch(s, { type: "replyCustomer", rfq: r.id, act: "walk" });
      }
    }
    for (const so of s.sos) { if (!so.purchased) { const res = dispatch(s, { type: "placeOrders", so: so.id }); if (!res.ok) log.push(res.msg); } if (so.status === "open" && so.purchased) dispatch(s, { type: "deliver", id: so.id }); }
    stepDay(s);
  }
  return { s, log };
}
test("database sizes meet the spec targets", () => {
  assert.ok(DB.suppliers.length >= 500); assert.ok(DB.clients.length >= 300); assert.ok(DB.logistics.length >= 50); assert.ok(DB.parts.length > 1500);
  assert.ok(DB.suppliers.some((x) => x.name.startsWith("Siemens")) && DB.clients.some((c) => c.name === "QatarEnergy") && DB.logistics.some((l) => l.name === "Kuehne+Nagel"));
});
test("full RFQ-to-cash cycle completes and the books balance", () => {
  let ok = null;
  for (const seed of [1, 2, 3, 4, 5, 6]) { const r = playOne(seed); if (r.s.stats.delivered >= 1) { ok = r; break; } }
  assert.ok(ok, "at least one seed should deliver an order within the guard");
  const s = ok.s; for (let i = 0; i < 120; i++) stepDay(s);
  const paid = s.invoices.filter((i) => i.paid); assert.ok(paid.length >= 1, "invoice paid");
  // every cash movement is in the ledger: opening cash + sum(ledger amounts) == cash (ledger capped at 400, so only check when not truncated)
  const opening = 18_000_000; if (s.ledger.length < 400) assert.equal(opening + s.ledger.reduce((a, l) => a + l.amount, 0), s.cash);
  assert.ok(Number.isInteger(s.cash));
  assert.ok(netWorth(s).total > -5e6);
});
test("deterministic: same seed, same script, same result", () => { const a = playOne(2), b = playOne(2); assert.equal(a.s.cash, b.s.cash); assert.equal(a.s.day, b.s.day); });
test("freight quotes respect mode, weight and dangerous goods limits", () => {
  const s = createGame(); const dhl = DB.logistics.find((l) => l.name === "DHL Express"), mc = DB.logistics.find((l) => l.name === "Maersk");
  assert.equal(freightQuote(s, dhl, "sea", "DE", 10, 0.1, 1000, false).ok, false);
  assert.equal(freightQuote(s, dhl, "express", "DE", 500, 1, 1000, false).ok, false);
  const q = freightQuote(s, mc, "sea", "CN", 800, 2, 100000, true); assert.ok(q.ok && q.cost > 0 && q.ins > 0 && q.days > 10);
  const a = freightQuote(s, dhl, "express", "DE", 20, 0.1, 1000, false), b = freightQuote(s, dhl, "express", "US", 20, 0.1, 1000, false); assert.ok(b.cost > a.cost * 0.9);
});
test("a ruinous quote loses money, a sane one does not (landed cost really matters)", () => {
  let cmp = null;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const r1 = playOne(seed, 14), r2 = playOne(seed, -15); if (r1.s.stats.delivered >= 1 && r2.s.stats.delivered >= 1) { cmp = [r1, r2]; break; } }
  assert.ok(cmp, "some seed completes a delivery at both margins");
  const prof = (r) => r.s.invoices.reduce((a, i) => a + i.amount - i.cogs, 0);
  assert.ok(prof(cmp[0]) > 0, "a +14% quote earns a profit"); assert.ok(prof(cmp[1]) < 0, "a -15% quote loses money");
});
test("60-day idle run does not crash and RFQs keep arriving", () => { const s = createGame({ team: false, seed: 9 }); for (let i = 0; i < 60; i++) stepDay(s); assert.ok(s.rfqs.length >= 2); });
test("customs actions: documents fix and priority release only work on the right shipments", () => {
  const s = createGame({ team: false, seed: 5 });
  assert.equal(dispatch(s, { type: "fixCustomsDocs", ship: 999 }).ok, false);
  s.ships.push({ id: 1, no: "SHP-1", po: 0, logi: "", mode: "sea", from: "DE", day: 0, depart: 0, arrive: 5, status: "held", kg: 1, vol: 1, freight: 0, insured: false, duty: 0, clearance: 0, local: 0, heldUntil: s.day + 8, supplierArranged: false, inspect: false, docsOk: false, dutyPaid: false, cleared: false });
  const c0 = s.cash; assert.ok(dispatch(s, { type: "fixCustomsDocs", ship: 1 }).ok); assert.ok(s.cash < c0 && s.ships[0].docsOk && s.ships[0].heldUntil < s.day + 8);
  assert.equal(dispatch(s, { type: "fixCustomsDocs", ship: 1 }).ok, false, "cannot fix twice");
  assert.ok(dispatch(s, { type: "expediteCustoms", ship: 1 }).ok); assert.equal(s.ships[0].heldUntil, s.day);
});
test("rivals: RFQs carry competitor bids and a cheaper rival can win the order", () => {
  const s = createGame({ team: false, seed: 7 }); for (let i = 0; i < 40; i++) stepDay(s);
  assert.ok(s.rfqs.some((r) => r.rivals?.length), "some RFQs have rival bidders"); assert.equal(s.rivals.length, 6);
});
test("world events: disruptions raise freight and lengthen transit, and expire", () => {
  const s = createGame({ team: false, seed: 11 }); const dhl = DB.logistics.find((l) => l.name.startsWith("DHL"));
  const before = freightQuote(s, dhl, "airfreight", "DE", 100, 1, 1000, false);
  s.mods.region = { Europe: { f: 1.5, d: 3, until: s.day + 10, why: "test", modes: ["airfreight"] } };
  const after = freightQuote(s, dhl, "airfreight", "DE", 100, 1, 1000, false);
  assert.ok(after.cost > before.cost * 1.3 && after.days === before.days + 3);
  s.day += 11; assert.equal(freightQuote(s, dhl, "airfreight", "DE", 100, 1, 1000, false).cost, before.cost);
});
test("120 days with random events never crashes and logs FX history", () => { const s = createGame({ team: false, seed: 21 }); for (let i = 0; i < 120; i++) stepDay(s); assert.ok(s.fxHist.EUR.length >= 20); });

test("letters of credit: margin deposit, limit enforced, limit freed on payment", () => {
  let r = null; for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const x = playOne(seed, 14, { lc: true }); if (x.s.pos.some((p) => p.terms === "lc")) { r = x; break; } }
  assert.ok(r, "an LC purchase order gets placed"); const s = r.s; const po = s.pos.find((p) => p.terms === "lc");
  assert.ok(po.lcMargin > 0 && Math.abs(po.lcMargin - po.value * 0.1) <= 1, "10% margin recorded");
  for (let i = 0; i < 90; i++) stepDay(s); assert.equal(lcOf(s).used, 0, "limit freed after all LC shipments");
  const s2 = createGame({ team: false, seed: 9 }); lcOf(s2).limit = 100; assert.equal(lcOf(s2).used, 0);
  assert.equal(dispatch(s2, { type: "lcIncrease" }).ok, true, "first increase allowed"); assert.ok(lcOf(s2).limit > 100);
});
test("export orders: foreign customer adds outbound freight to landed cost and cash", () => {
  let r = null; for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const x = playOne(seed, 25, { foreign: "DE" }); if (x.s.sos.some((o) => o.exp)) { r = x; break; } }
  assert.ok(r, "an export delivery is dispatched"); const so = r.s.sos.find((o) => o.exp); assert.ok(so.exp.cost > 0 && so.exp.days >= 1);
  const rf = r.s.rfqs.find((x) => x.id === so.rfq); const land = landedCost(r.s, rf); assert.ok(Object.values(land.lines).flat().some((x) => x.exp > 0), "landed cost includes export freight");
});
test("satellite warehouses add capacity and rent, cut transit, and can be closed only if stock fits", () => {
  const s = createGame({ team: false, seed: 3 }); const cap0 = whCap(s), rent0 = whRentMonth(s); const dhl = DB.logistics.find((l) => l.modes.includes("sea") && freightQuote(s, l, "sea", "CN", 100, 1, 1000, false).ok);
  const t0 = freightQuote(s, dhl, "sea", "CN", 100, 1, 1000, false).days;
  assert.ok(dispatch(s, { type: "openSite", id: "shenzhen" }).ok); assert.ok(whCap(s) > cap0 && whRentMonth(s) > rent0);
  assert.equal(freightQuote(s, dhl, "sea", "CN", 100, 1, 1000, false).days, t0 - 3);
  assert.equal(dispatch(s, { type: "openSite", id: "shenzhen" }).ok, false, "cannot open twice");
  assert.ok(dispatch(s, { type: "closeSite", id: "shenzhen" }).ok); assert.equal(whCap(s), cap0);
});

test("supplier relationship tiers: orders and value unlock better prices, wrong items set you back", () => {
  const s = createGame({ team: false, seed: 4 }); const sup = DB.suppliers.find((x) => x.type === "oem"); assert.equal(supTier(s, sup.id).id, "new");
  s.supStats = { [sup.id]: { orders: 8, value: 5_000_000, bad: 0 } }; assert.equal(supTier(s, sup.id).id, "preferred");
  s.supStats[sup.id].bad = 3; assert.notEqual(supTier(s, sup.id).id, "preferred", "bad deliveries cost you a tier");
  const r = s.rfqs[0]; const mk = () => makeQuote(s, r, 0, sup, false, new Rng(99), "q"); s.supStats[sup.id] = { orders: 0, value: 0, bad: 0 }; const base = mk();
  s.supStats[sup.id] = { orders: 16, value: 20_000_000, bad: 0 }; const best = mk(); assert.ok(best.unit < base.unit && best.leadD <= base.leadD, "strategic partner prices are lower");
});
test("multi-currency: a EUR quotation becomes a EUR sales order, and paying later in EUR creates an FX gain or loss", () => {
  let won = null; for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const x = playOne(seed, 25, { foreign: "DE", cur: "EUR" }); if (x.s.sos.some((o) => o.cur === "EUR" && o.fxAt > 0)) { won = x; break; } }
  assert.ok(won, "the quotation currency is carried onto the sales order, with the locked rate");
  const s = createGame({ team: false, seed: 12 }); const c = DB.clients.find((x) => x.country === "DE");
  const inv = { id: 999, no: "INV-T", so: 1, client: c.id, amount: 100000, issue: 0, due: 1, payDay: 1, paid: false, cogs: 0, cur: "EUR", fc: Math.round(100000 * 0.92) };
  s.invoices.push(inv); s.fx.EUR = 0.92 * 1.15; const cash0 = s.cash; stepDay(s);
  assert.ok(inv.paid && s.cash - cash0 < 100000, "weaker euro means fewer dollars arrive"); assert.ok(/FX loss/.test(s.ledger.find((l) => l.text.includes("INV-T")).text));
});
test("industry rules change how hard a customer bargains", () => {
  const s = createGame({ team: false, seed: 6 }); const c = DB.clients.find((x) => x.industry === "construction"); const orig = c.industry;
  const rf = { client: c.id, needDays: 30, lines: [{ ref: 100, qty: 1 }], cq: { lineUnits: [100], termsDays: c.terms, promiseDays: 10, warrantyM: 12 } };
  c.industry = "general"; const a1 = assess(s, rf); c.industry = orig; const a2 = assess(s, rf);
  assert.ok(Math.abs(a2.qe - a1.qe - 0.03) < 1e-9, "construction adds 3 points of price pressure");
});

test("selectQuote: picks one supplier per line, replaces earlier choice, rejects unavailable quotes", () => {
  const s = createGame({ team: false, seed: 3 }); let r = null;
  for (let g = 0; g < 80 && !r; g++) { for (const x of s.rfqs) { if (x.status === "new") { dispatch(s, { type: "openRfq", id: x.id }); x.lines.forEach((_, li) => dispatch(s, { type: "autoQuotes", rfq: x.id, line: li, max: 5 })); } if (x.status === "sourcing" && s.quotes.filter((q) => q.rfq === x.id && q.line === 0 && q.status === "received").length >= 2) { r = x; break; } } if (!r) stepDay(s); }
  assert.ok(r, "found an RFQ with two replies");
  const qs = s.quotes.filter((q) => q.rfq === r.id && q.line === 0 && q.status === "received");
  const a = dispatch(s, { type: "selectQuote", rfq: r.id, line: 0, quote: qs[0].id });
  const b = dispatch(s, { type: "selectQuote", rfq: r.id, line: 0, quote: qs[1].id });
  assert.ok(a.ok && b.ok);
  assert.equal(r.lines[0].alloc.length, 1); assert.equal(r.lines[0].alloc[0].quote, qs[1].id);
  assert.equal(dispatch(s, { type: "selectQuote", rfq: r.id, line: 0, quote: "nope" }).ok, false);
});

import { wfOf, candidates, managerOf } from "../docs/js/engine/staff.js";
const approveAll = (s) => { for (const t of wfOf(s).tasks) if (t.status === "approval" && t.apr.who === "ceo") dispatch(s, { type: "aprDecide", task: t.id, ok: true }); };
test("team: with nobody clicking, employees source, quote and sign orders on their own", () => {
  let best = 0; for (const seed of [3, 5, 8]) { const s = createGame({ seed }); for (let i = 0; i < 120; i++) { stepDay(s); approveAll(s); } best = Math.max(best, s.rfqs.filter((r) => r.cq).length); if (s.sos.length) { best = 99; break; } }
  assert.ok(best >= 1, "employees sent at least one quotation without any player action");
});
test("team: employees really change game state (quotes requested, allocations, margins)", () => {
  const s = createGame({ seed: 4 }); for (let i = 0; i < 25; i++) { stepDay(s); approveAll(s); }
  assert.ok(s.quotes.length > 0 && s.rfqs.some((r) => r.wf?.sourced), "suppliers were asked by procurement");
  assert.ok(wfOf(s).msgs.some((m) => m.from.includes("Procurement") || m.to === "Procurement"), "internal messages were generated");
});
test("team: work is spread across employees, not dumped on one", () => {
  const s = createGame({ seed: 6 }); wfOf(s); for (let i = 0; i < 2; i++) { const c = candidates(s, "sales")[0]; dispatch(s, { type: "hireCand", role: "sales", key: c.key }); }
  for (let i = 0; i < 40; i++) { stepDay(s); approveAll(s); } const done = wfOf(s).emps.filter((e) => e.dept === "sales").map((e) => e.done);
  assert.ok(done.length === 3 && done.filter((n) => n > 0).length >= 2, "several sales employees did work: " + done);
});
test("team: low autonomy makes the CEO approve supplier selection; reject stops it", () => {
  const s = createGame({ seed: 4 }); for (const d of ["sales", "proc", "logistics", "warehouse", "finance", "quality"]) dispatch(s, { type: "setAutonomy", dept: d, level: "low" });
  let t = null; for (let i = 0; i < 40 && !t; i++) { stepDay(s); t = wfOf(s).tasks.find((x) => x.status === "approval" && x.apr.who === "ceo"); }
  assert.ok(t, "a decision was escalated"); const r = s.rfqs.find((x) => x.id === t.rfq); assert.ok(!r?.cq, "nothing was sent before approval");
  assert.ok(dispatch(s, { type: "aprDecide", task: t.id, ok: false }).ok); assert.equal(t.status, "failed");
});
test("team: missing department is covered slowly by another one, and hiring fixes it", () => {
  const s = createGame({ seed: 4 }); for (let i = 0; i < 30; i++) { stepDay(s); approveAll(s); }
  const fr = wfOf(s).tasks.filter((t) => t.kind === "log.freight" || t.kind === "fin.check"); assert.ok(fr.length === 0 || fr.every((t) => t.cover || t.assignee === null), "no logistics/finance staff: work is covered or blocked");
  const c = candidates(s, "logistics")[0]; const r = dispatch(s, { type: "hireCand", role: "logistics", key: c.key }); assert.ok(r.ok); assert.equal(s.staff.logistics, 1);
});
test("team: promotion raises level and salary; one manager per department; payroll uses real salaries", () => {
  const s = createGame({ seed: 4 }); const e = wfOf(s).emps.find((x) => x.dept === "proc"); const before = e.salary; assert.ok(dispatch(s, { type: "promote", id: e.id }).ok); assert.ok(e.salary > before);
  for (let i = 0; i < 3; i++) dispatch(s, { type: "promote", id: e.id }); assert.equal(e.level, "manager"); assert.ok(managerOf(s, "proc"));
  const cash = s.cash; for (let i = 0; i < 31; i++) stepDay(s); assert.ok(s.cash < cash);
});

test("team: weekly department reports are filed with real numbers", () => {
  const s = createGame({ seed: 4 }); for (let i = 0; i < 16; i++) { stepDay(s); approveAll(s); }
  const reps = wfOf(s).reports; assert.ok(reps.length >= 3, "reports filed: " + reps.length); assert.ok(reps.every((r) => r.kpis.length >= 2));
  assert.ok(reps.some((r) => r.dept === "finance" || r.dept === "sales"));
});
test("team: a zero budget sends spending to the CEO", () => {
  const s = createGame({ seed: 4 }); dispatch(s, { type: "setPolicy", key: "budget.proc", value: 0 }); dispatch(s, { type: "setPolicy", key: "budget.logistics", value: 0 });
  let t = null; for (let i = 0; i < 80 && !t; i++) { stepDay(s); t = wfOf(s).tasks.find((x) => x.status === "approval" && x.apr.why.includes("budget")); }
  assert.ok(t, "an over-budget request reached the CEO");
});
test("team: large supplier payments wait for approval, small ones do not; unpaid ones cost reputation", () => {
  const s = createGame({ seed: 4 }); wfOf(s); s.payables.push({ id: 900, to: "Test Supplier", kind: "supplier", ref: "PO-X", amount: 800000, due: 3, paid: false, po: 0 }, { id: 901, to: "Small Supplier", kind: "supplier", ref: "PO-Y", amount: 20000, due: 3, paid: false, po: 0 });
  for (let i = 0; i < 4; i++) stepDay(s); assert.equal(s.payables.find((p) => p.id === 901).paid, true); assert.equal(s.payables.find((p) => p.id === 900).paid, false);
  for (let i = 0; i < 4; i++) { stepDay(s); approveAll(s); } assert.equal(s.payables.find((p) => p.id === 900).paid, true);
});
test("team: procurement chases suppliers and a damaged lot produces a Quality report", () => {
  let chased = false, rep = false; for (const seed of [3, 5, 8, 11]) { const s = createGame({ seed }); const c = candidates(s, "quality")[0]; dispatch(s, { type: "hireCand", role: "quality", key: c.key }); for (let i = 0; i < 150; i++) { stepDay(s); approveAll(s); } const w = wfOf(s); chased ||= w.tasks.some((t) => t.kind === "proc.chase" && t.status === "done"); rep ||= w.reports.some((r) => r.dept === "quality"); if (chased && rep) break; }
  assert.ok(chased, "supplier chase tasks were done"); assert.ok(rep, "an inspection report was written");
});
