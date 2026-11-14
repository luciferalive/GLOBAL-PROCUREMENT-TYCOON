import { COUNTRY } from "../data/countries.js";
import { CAT, IND, DISCLAIMER } from "../data/lists.js";
import { DB, MODE_LABEL, PERSONA_LABEL, type Mode } from "../data/db.js";
import type { GameState, Quote, Rfq } from "../engine/types.js";
import { dateStr, isOpen, money, money2, netWorth, stockUsed, whCap } from "../engine/core.js";
import { FREIGHT_INCLUDED, INCO_NOTE, eligible, freightQuote, landedCost, priceMod, toC } from "../engine/pricing.js";
import { assess } from "../engine/sales.js";
import { TRAINING } from "../engine/missions.js";
import { act, bar, btn, esc, flag, kpi, line, pill, table } from "./dom.js";
import { ui } from "./state.js";
import { RIVALS } from "../data/rivals.js";
import { RULES } from "../data/rules.js";

export interface Page { id: string; title: string; icon: string; group: string; render(s: GameState): string }
const stCls: Record<string, string> = { new: "info", sourcing: "warn", quoted: "acc", negotiating: "warn", awarded: "ok", lost: "bad", expired: "bad", cancelled: "bad", completed: "ok" };
export const clientName = (id: string) => DB.clientById[id]?.name ?? id;
const left = (s: GameState, d: number) => { const n = d - s.day; return n < 0 ? `<span class="bad">overdue ${-n}d</span>` : n <= 2 ? `<span class="warn">${n}d left</span>` : `${n}d left`; };
export const partLine = (id: string) => { const p = DB.partsById[id]; const o = DB.suppliers.find((x) => x.id === "s_" + p.oem); return `<b>${esc(p.desc)}</b><br><span class="sm">PN ${esc(p.pn)} · ${esc(CAT[p.cat].name)} · ${o ? flag(o.country) + " " + esc(o.country) : ""}</span>`; };

export function todo(s: GameState): { icon: string; text: string; page: string; rfq?: number; so?: number; tone: string }[] {
  const t: ReturnType<typeof todo> = [];
  for (const r of s.rfqs) {
    if (r.status === "new") t.push({ icon: "📨", text: `New ${r.urgent ? "URGENT " : ""}RFQ ${r.no} from ${clientName(r.client)}: reply by day ${r.due} (${r.due - s.day}d)`, page: "rfqs", rfq: r.id, tone: r.urgent ? "bad" : "info" });
    else if (r.status === "sourcing") { const rec = s.quotes.filter((q) => q.rfq === r.id && q.status === "received").length; const pend = s.quotes.filter((q) => q.rfq === r.id && q.status === "pending").length; if (rec) t.push({ icon: "💬", text: `${r.no}: ${rec} supplier quote(s) received${pend ? `, ${pend} pending` : ""}. Build your offer (deadline day ${r.due}).`, page: "rfqs", rfq: r.id, tone: "acc" }); }
    if (r.cq?.status === "replied" && r.status === "negotiating") t.push({ icon: "🤝", text: `${clientName(r.client)} replied on ${r.no}: ${r.cq.resp?.type}`, page: "rfqs", rfq: r.id, tone: "warn" });
  }
  for (const so of s.sos) { if (so.status === "open" && !so.purchased) t.push({ icon: "🛒", text: `${so.no} won. Place purchase orders.`, page: "orders", so: so.id, tone: "acc" }); const ready = so.status === "open" && so.purchased && so.lines.some((l, i) => s.lots.some((x) => x.so === so.id && x.soLine === i && x.status === "ok")); if (ready) t.push({ icon: "🚚", text: `${so.no} has stock in the warehouse: deliver to the customer.`, page: "orders", so: so.id, tone: "ok" }); }
  const insp = s.lots.filter((l) => l.status === "inspection").length; if (insp) t.push({ icon: "🔍", text: `${insp} delivery lot(s) waiting for inspection.`, page: "warehouse", tone: "warn" });
  for (const [cid, g] of Object.entries(s.reg)) if (g.stage === 2) t.push({ icon: "📝", text: `${clientName(cid)}: registration link received. Submit documents.`, page: "customers", tone: "acc" });
  const od = s.invoices.filter((i) => !i.paid && i.due < s.day).length; if (od) t.push({ icon: "⏰", text: `${od} invoice(s) past due. Customers are slow payers.`, page: "finance", tone: "warn" });
  if (s.cash < toC(15000)) t.push({ icon: "⚠️", text: `Cash is low (${money(s.cash)}). Use credit terms, collect receivables or borrow.`, page: "finance", tone: "bad" });
  if (stockUsed(s) > whCap(s)) t.push({ icon: "📦", text: "Warehouse over capacity: overflow fees apply.", page: "warehouse", tone: "bad" });
  return t;
}

export const dashboard: Page = { id: "dashboard", title: "Control Tower", icon: "◉", group: "Operations", render(s) {
  const nw = netWorth(s), open = s.rfqs.filter(isOpen).length, td = todo(s);
  const cnt = (f: (r: Rfq) => boolean) => s.rfqs.filter(f).length;
  const flow: [string, number, string][] = [["New RFQs", cnt((r) => r.status === "new"), "📨"], ["Sourcing", cnt((r) => r.status === "sourcing"), "🔎"], ["Quoted", cnt((r) => r.status === "quoted" || r.status === "negotiating"), "💬"], ["Orders won", s.sos.filter((x) => x.status === "open").length, "🏆"], ["In transit", s.ships.filter((x) => x.status !== "delivered").length, "🚢"], ["In warehouse", s.lots.filter((l) => l.qty > 0).length, "📦"], ["Invoiced", s.invoices.filter((i) => !i.paid).length, "🧾"], ["Paid", s.invoices.filter((i) => i.paid).length, "💰"]];
  const nxt = TRAINING.find((t) => !t.check(s));
  return `<div class="ph"><h1>Control Tower</h1><p class="sub">${esc(s.name)} · Doha, Qatar · Day ${s.day} (${dateStr(s.day)})</p></div>
${nxt && ui.guide ? `<div class="coach"><span class="cn">${TRAINING.indexOf(nxt) + 1}/14</span><div><b>Training: ${esc(nxt.title)}</b><br>${esc(nxt.text)}</div>${btn("Go there", { type: "ui", page: nxt.page })}${btn("Hide", { type: "ui", guide: false }, "ghost")}</div>` : ""}
<div class="kgrid">${kpi("Cash", money(s.cash), s.cash < 0 ? "overdraft" : "", s.cash < toC(15000) ? "bad" : "good", "💵")}${kpi("Net worth", money(nw.total), "start " + money(toC(180000)), nw.total > toC(180000) ? "good" : "", "🏦")}${kpi("Reputation", Math.round(s.rep) + " / 100", "", s.rep > 40 ? "good" : "", "⭐")}${kpi("Open RFQs", String(open), `${s.stats.won} won · ${s.stats.lost} lost`, "", "📨")}${kpi("Receivables", money(nw.receivables), "owed by customers", "", "🧾")}${kpi("Payables", money(nw.payables), "owed to suppliers", nw.payables > s.cash ? "warn" : "", "📑")}${kpi("Inventory", money(nw.inventory), `${stockUsed(s).toFixed(0)}/${whCap(s)} m³`, "", "📦")}${kpi("Delivered", String(s.stats.delivered), `${s.stats.late} late`, "", "🚚")}</div>
<div class="panel"><h2>Deal pipeline</h2><div class="flow">${flow.map(([l, n, i], k) => `<div class="fs ${n ? "on" : ""}"><div class="fi">${i}</div><b>${n}</b><span>${l}</span></div>${k < flow.length - 1 ? '<div class="fa">›</div>' : ""}`).join("")}</div></div>
<div class="g2"><div class="panel"><h2>Needs your attention</h2>${td.length ? `<div class="todo">${td.slice(0, 9).map((x) => `<a class="ti ${x.tone}" ${act({ type: "ui", page: x.page, rfq: x.rfq, so: x.so })}><span>${x.icon}</span><span>${esc(x.text)}</span></a>`).join("")}</div>` : `<p class="empty">All clear. Advance time or look for new clients.</p>`}</div>
<div class="panel"><h2>Cash and net worth</h2>${line(s.hist.map((h) => h.cash / 100), 520, 120, "#33d6a6", (n) => "$" + Math.round(n / 1000) + "k")}${line(s.hist.map((h) => h.nw / 100), 520, 120, "#f5b13d", (n) => "$" + Math.round(n / 1000) + "k")}<p class="sm">Green: cash. Amber: net worth (cash + stock + receivables − payables − loans).</p></div></div>
<div class="panel"><h2>Business news</h2><div class="news">${s.news.slice(0, 8).map((n) => `<div class="nw ${n.kind}"><span class="d">D${n.day}</span>${esc(n.text)}</div>`).join("")}</div></div>
<p class="sm disc">${esc(DISCLAIMER)}</p>`;
} };

export const rfqs: Page = { id: "rfqs", title: "RFQ Inbox", icon: "✉", group: "Operations", render(s) {
  if (ui.rfq !== null) { const r = s.rfqs.find((x) => x.id === ui.rfq); if (r) return workbench(s, r); }
  const f = ui.q.rfqf ?? "open"; const list = s.rfqs.filter((r) => f === "all" ? true : f === "open" ? (isOpen(r) || (r.status === "expired" && s.day - r.due <= 4)) : f === "won" ? r.status === "awarded" || r.status === "completed" : ["lost", "expired", "cancelled"].includes(r.status));
  return `<div class="ph"><h1>RFQ Inbox</h1><p class="sub">Customers ask for prices. Your job: find the best sources, add freight and duty, quote a price that wins and still makes profit.</p></div>
<div class="tabs">${[["open", "Open"], ["won", "Won"], ["lost", "Lost / expired"], ["all", "All"]].map(([k, l]) => `<button class="${f === k ? "on" : ""}" ${act({ type: "ui", q: { rfqf: k } })}>${l}</button>`).join("")}</div>
${table(["RFQ", "Customer", "Items", "List value", "Deadline", "Needed in", "Status", ""], list.map((r) => { const val = r.lines.reduce((a, l) => a + DB.partsById[l.partId].list * l.qty, 0); const c = DB.clientById[r.client]; return [`<b>${esc(r.no)}</b>${r.urgent ? " " + pill("URGENT", "bad") : ""}${!r.seen ? " " + pill("new", "info") : ""}`, `${flag(c.country)} ${esc(c.name)}<br><span class="sm">${PERSONA_LABEL[c.persona]}</span>`, String(r.lines.length), money(toC(val)), isOpen(r) && (r.status === "new" || r.status === "sourcing") ? left(s, r.due) : "-", `${r.needDays} days`, pill(r.status, stCls[r.status]), btn("Open", { type: "ui", rfq: r.id }, "pri sm")]; }))}`;
} };

const supTag = (q: Quote) => { const sp = DB.supplierById[q.supplier]; return `<b>${esc(sp.name)}</b><br><span class="sm">${flag(sp.country)} ${esc(COUNTRY[sp.country].name)} · ${pill(sp.type + (sp.auth ? " · authorized" : ""), sp.type === "trader" ? "warn" : sp.type === "oem" ? "ok" : "info")}</span>`; };
const TERMS: Record<string, string> = { prepay: "Advance payment", lc: "Letter of credit", net30: "Net 30", net60: "Net 60" };

function workbench(s: GameState, r: Rfq): string {
  const c = DB.clientById[r.client], land = landedCost(s, r), rel = s.rel[c.id] ?? 20; const open = ["new", "sourcing", "quoted", "negotiating"].includes(r.status);
  const opt = (r as any).opt ?? {}; const cq = r.cq;
  let html = `<div class="ph"><h1>${esc(r.no)} ${pill(r.status, stCls[r.status])}${r.urgent ? " " + pill("URGENT", "bad") : ""}</h1><p class="sub">${btn("← All RFQs", { type: "ui", rfq: null }, "ghost sm")} ${flag(c.country)} <b>${esc(c.name)}</b> · ${PERSONA_LABEL[c.persona]} · relationship ${Math.round(rel)}/100 · pays ${Math.round(c.payRel * 100)}% on time · usual terms ${c.terms} days</p>${RULES[c.industry] ? `<p class="sm">📋 <b>${esc(IND[c.industry]?.name ?? "")} rules:</b> ${RULES[c.industry].text.map(esc).join(" · ")}</p>` : ""}${r.rivals?.length ? `<p class="sm">⚔ Competing bidders: ${r.rivals.map((x) => esc(RIVALS.find((d) => d.id === x.id)?.name ?? "")).join(", ")}. Their prices are unknown to you.</p>` : ""}</div>
<div class="kgrid k4">${kpi("Quote deadline", r.status === "new" || r.status === "sourcing" ? `Day ${r.due}` : "-", r.status === "new" || r.status === "sourcing" ? left(s, r.due) : "", "")}${kpi("Customer needs", `${r.needDays} days`, "after award", "")}${kpi("Delivery terms", r.incoterm, INCO_NOTE[r.incoterm], "")}${kpi("Destination", r.dest, "", "")}</div>`;
  r.lines.forEach((l, li) => {
    const part = DB.partsById[l.partId]; const qs = s.quotes.filter((q) => q.rfq === r.id && q.line === li); const allocd = l.alloc.reduce((a, x) => a + x.qty, 0);
    const lots = s.lots.filter((x) => x.partId === l.partId && !x.so && x.status === "ok");
    html += `<div class="panel line"><h2>Line ${li + 1}: ${esc(part.desc)}</h2><div class="lh"><div><span class="sm">Part number</span><b>${esc(part.pn)}</b></div><div><span class="sm">Quantity</span><b>${l.qty}</b></div><div><span class="sm">Catalogue price</span><b>${money2(toC(part.list))}</b></div><div><span class="sm">Weight</span><b>${(part.kg * l.qty).toFixed(1)} kg</b></div><div><span class="sm">Certificates</span><b>${l.certs.length ? esc(l.certs.join(", ")) : "none"}</b></div><div><span class="sm">Allocated</span><b class="${allocd === l.qty ? "good" : "warn"}">${allocd} / ${l.qty}</b></div></div><p class="sm">Customer note: “${esc(l.note)}”${priceMod(s, part.oem) !== 1 ? ` · ${pill("market price " + (priceMod(s, part.oem) > 1 ? "up" : "down"), priceMod(s, part.oem) > 1 ? "bad" : "ok")}` : ""}</p>`;
    if (open && r.status !== "quoted" || (r.status === "quoted" && false)) html += `<div class="row">${btn("Ask 4 best suppliers", { type: "autoQuotes", rfq: r.id, line: li, max: 4 }, "pri sm")}${btn("Choose suppliers…", { type: "ui", modal: { kind: "suppliers", rfq: r.id, line: li } }, "sm")}${lots.length ? btn(`Use own stock (${lots.reduce((a, x) => a + x.qty, 0)} free)`, { type: "ui", modal: { kind: "stock", rfq: r.id, line: li } }, "sm") : ""}${l.alloc.length ? btn("Clear allocation", { type: "clearAlloc", rfq: r.id, line: li }, "ghost sm") : ""}</div>`;
    const stockRows = l.alloc.filter((a) => a.stockLot).map((a) => { const lot = s.lots.find((x) => x.id === a.stockLot); return [`<b>Own stock</b><br><span class="sm">${esc(a.stockLot!)}</span>`, "-", money2(lot?.unitCost ?? 0), "now", "-", "-", "-", "-", "-", `<b>${a.qty}</b>`]; });
    html += table(["Supplier", "Status", "Unit price", "Stock", "Lead", "Terms", "Incoterm", "Docs / warranty", "Valid until", "Allocate qty"], [...stockRows, ...qs.map((q) => {
      const a = l.alloc.find((x) => x.quote === q.id); const sp = DB.supplierById[q.supplier];
      const price = q.status === "pending" && !q.rev ? "…" : `<b>${money2(q.unit)}</b><br><span class="sm">${(q.unit / 100 * q.fx).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${q.cur}</span>`;
      const status = q.status === "pending" ? pill(q.rev ? "negotiating · reply day " + q.replyDay : "reply day " + q.replyDay, "warn") : q.status === "received" ? pill(q.round ? "revised " + q.round : "received", "ok") : pill(q.status, q.status === "ordered" ? "info" : "bad");
      const cell = q.status === "received" && open && r.status !== "quoted" ? `<input class="qty" type="number" min="0" max="${l.qty}" value="${a?.qty ?? 0}" data-chg='${esc(JSON.stringify({ type: "setAlloc", rfq: r.id, line: li, quote: q.id }))}' data-key="qty"><div class="mini">${btn("Negotiate", { type: "ui", modal: { kind: "neg", q: q.id } }, "xs")}</div>` : a ? `<b>${a.qty}</b>` : "-";
      return [supTag(q) + (q.alt ? `<br>${pill("generic equivalent: customer must approve", "warn")}` : ""), status + (q.note ? `<br><span class="sm">${esc(q.note)}</span>` : ""), price, q.status === "pending" ? "…" : q.inStock ? `<span class="good">${q.qtyAvail} in stock</span>` : `<span class="warn">to order</span>`, q.status === "pending" ? "…" : `${q.leadD} d`, TERMS[q.terms], q.incoterm, `${q.docs === "full" ? "Full OEM docs" : q.docs === "basic" ? "Basic docs" : "<span class='bad'>No docs</span>"}<br><span class="sm">${q.warrantyM} mo warranty</span>`, q.status === "received" ? `day ${q.expiry}` : "-", cell];
    })]);
    html += `</div>`;
  });
  // freight
  const sups = [...new Set(r.lines.flatMap((l) => l.alloc.map((a) => (a.quote ? s.quotes.find((q) => q.id === a.quote)?.supplier : undefined)).filter(Boolean) as string[]))];
  if (open && sups.length) {
    html += `<div class="panel"><h2>Freight and logistics</h2>`;
    for (const sid of sups) {
      const sp = DB.supplierById[sid]; const rs = r.lines.flatMap((l) => l.alloc.filter((a) => a.quote && s.quotes.find((q) => q.id === a.quote)?.supplier === sid).map((a) => ({ a, q: s.quotes.find((q) => q.id === a.quote)! })));
      const inc = rs[0].q.incoterm; const kg = rs.reduce((t, x) => t + x.a.qty * DB.partsById[x.q.partId].kg, 0), vol = rs.reduce((t, x) => t + x.a.qty * DB.partsById[x.q.partId].vol, 0), val = rs.reduce((t, x) => t + x.a.qty * x.q.unit, 0);
      html += `<h3>${flag(sp.country)} ${esc(sp.name)} → Doha · ${kg.toFixed(0)} kg · ${vol.toFixed(2)} m³ · goods ${money(val)}</h3>`;
      if (FREIGHT_INCLUDED.has(inc) || sp.country === "QA") { html += `<p class="sm">${inc}: ${INCO_NOTE[inc]} No freight booking needed.${inc === "DDP" ? " Duties are included in the price." : ""}</p>`; continue; }
      const sel = r.ship[sid]; const dg = rs.some((x) => CAT[DB.partsById[x.q.partId].cat].dg);
      const rows: string[][] = []; const pinned = ["DHL Express", "DHL Global Forwarding", "Kuehne+Nagel"];
      const all = DB.logistics.flatMap((lg) => lg.modes.map((m) => ({ lg, m, fq: freightQuote(s, lg, m, sp.country, kg, vol, val, !!sel?.insure, dg) }))).filter((x) => x.fq.ok);
      all.sort((x, y) => (pinned.includes(y.lg.name) ? 1 : 0) - (pinned.includes(x.lg.name) ? 1 : 0) || x.fq.cost - y.fq.cost);
      const show = [...all.filter((x) => pinned.includes(x.lg.name)), ...all.filter((x) => !pinned.includes(x.lg.name)).slice(0, 7)];
      for (const x of show) { const on = sel?.logi === x.lg.id && sel.mode === x.m; const mod = s.mods.freight[x.lg.id]; rows.push([`${on ? "✅ " : ""}<b>${esc(x.lg.name)}</b>${mod && mod.until > s.day ? " " + pill(mod.why, mod.f > 1 ? "bad" : "ok") : ""}`, MODE_LABEL[x.m], money2(x.fq.cost + x.fq.ins), `${x.fq.days} days`, `${Math.round(x.lg.reliab * 100)}%`, on ? pill("selected", "ok") : btn("Select", { type: "setShip", rfq: r.id, supplier: sid, logi: x.lg.id, mode: x.m, insure: !!sel?.insure }, "sm")]); }
      html += `<label class="chk"><input type="checkbox" ${sel?.insure ? "checked" : ""} data-chg='${esc(JSON.stringify({ type: "setShip", rfq: r.id, supplier: sid, logi: sel?.logi ?? show[0]?.lg.id, mode: sel?.mode ?? show[0]?.m }))}' data-key="insure" data-bool="1"> Insure this shipment (0.3 to 0.9% of value; 90% claim if damaged)</label>` + table(["Provider", "Mode", "Cost" + (sel?.insure ? " + insurance" : ""), "Transit", "Reliability", ""], rows);
      html += `<p class="sm">Terms ${inc}: ${INCO_NOTE[inc]}${dg ? " · dangerous goods: only DG-approved providers shown" : ""}. Prices are SIMULATED and change with events.</p>`;
    }
    html += `</div>`;
  }
  // landed cost + quotation
  const anyAlloc = r.lines.some((l) => l.alloc.length);
  if (anyAlloc) {
    const rows: string[][] = []; let tPur = 0, tLand = 0, tSell = 0;
    r.lines.forEach((l, li) => { const arr = land.lines[li] ?? []; const pur = arr.reduce((a, x) => a + x.purchase, 0), fr = arr.reduce((a, x) => a + x.freight, 0), ins = arr.reduce((a, x) => a + x.insurance, 0), du = arr.reduce((a, x) => a + x.duty, 0), cl = arr.reduce((a, x) => a + x.clearance, 0), lo = arr.reduce((a, x) => a + x.local, 0), bk = arr.reduce((a, x) => a + x.bank, 0), ex = arr.reduce((a, x) => a + (x.exp ?? 0), 0), tot = land.byLine[li].total; const sellUnit = Math.round(land.byLine[li].unit * (1 + l.margin / 100)), sell = sellUnit * l.qty; tPur += pur; tLand += tot; tSell += sell;
      const input = open && r.status !== "quoted" || r.status === "negotiating" ? `<input class="qty" type="number" step="0.5" value="${l.margin}" data-chg='${esc(JSON.stringify({ type: "setMargin", rfq: r.id, line: li }))}' data-key="pct">%` : `${l.margin}%`;
      rows.push([`Line ${li + 1}`, money(pur), money(fr), money(ins), money(du), money(cl + lo), money(bk), money(ex), `<b>${money(tot)}</b>`, land.byLine[li].qty ? money2(land.byLine[li].unit) : "-", input, `<b>${money2(sellUnit)}</b>`, money(sell), `<span class="${sell - tot > 0 ? "good" : "bad"}">${money(sell - tot)}</span>`]); });
    const gp = tSell - tLand, net = gp - Math.round(tSell * 0.015);
    html += `<div class="panel"><h2>Landed cost and customer quotation</h2>${table(["Item", "Goods", "Freight", "Insurance", "Duty", "Clearance + local", "Bank", "Export freight (to customer)", "Landed total", "Landed / unit", "Margin", "Sell / unit", "Sell total", "Gross profit"], rows)}
<div class="kgrid k4">${kpi("Purchase cost", money(tPur), "", "")}${kpi("Landed cost", money(tLand), tPur ? "+" + ((tLand / tPur - 1) * 100).toFixed(1) + "% over purchase" : "", "")}${kpi("Selling price", money(tSell), "", "")}${kpi("Gross profit", money(gp), tSell ? ((gp / tSell) * 100).toFixed(1) + "% · net estimate " + money(net) : "", gp > 0 ? "good" : "bad")}</div>
<p class="sm">All figures in one currency: USD, rounded to the cent. Supplier prices in foreign currency are converted at the rate locked when the quote was made (${Object.entries(s.fx).filter(([k]) => ["EUR", "GBP", "CNY", "INR"].includes(k)).map(([k, v]) => `1 USD = ${v.toFixed(3)} ${k}`).join(" · ")}). Bank charges 0.35% (LC 1.2%). Duty is computed on goods + freight + insurance.</p>${land.issues.map((i) => `<p class="warn sm">⚠ ${esc(i)}</p>`).join("")}${!land.complete ? `<p class="warn sm">⚠ Some lines are not fully allocated.</p>` : ""}
<div class="form" id="cqf">${(() => { const cc = COUNTRY[c.country]?.cur; return cc && cc !== "USD" ? `<label>Quote currency<select data-chg='${esc(JSON.stringify({ type: "setCq", rfq: r.id }))}' data-key="cur" data-opt="1"><option value="USD" ${!(opt.cur) || opt.cur === "USD" ? "selected" : ""}>USD (you carry no FX risk)</option><option value="${cc}" ${opt.cur === cc ? "selected" : ""}>${cc} (customer prefers it; you carry FX risk)</option></select></label>` : ""; })()}<label>Payment terms offered<select data-chg='{"type":"setCq","rfq":${r.id}}' data-key="termsDays" data-opt="1" data-n="1">${[30, 45, 60, 90].map((d) => `<option value="${d}" ${(opt.termsDays ?? 30) === d ? "selected" : ""}>${d} days</option>`).join("")}</select></label><label>Warranty<select data-chg='{"type":"setCq","rfq":${r.id}}' data-key="warrantyM" data-opt="1" data-n="1">${[6, 12, 24, 36].map((d) => `<option value="${d}" ${(opt.warrantyM ?? 12) === d ? "selected" : ""}>${d} months</option>`).join("")}</select></label><label>Promise delivery in (days)<input type="number" class="qty" min="1" value="${opt.promiseDays ?? land.eta + 2}" data-chg='{"type":"setCq","rfq":${r.id}}' data-key="promiseDays" data-opt="1" data-n="1"></label><label class="chk"><input type="checkbox" ${opt.partialOk ? "checked" : ""} data-chg='{"type":"setCq","rfq":${r.id}}' data-key="partialOk" data-opt="1" data-bool="1"> Offer partial shipment</label></div>
<p class="sm">Fastest realistic delivery with this sourcing: <b>${land.eta + 2} days</b> (supplier lead + transit + customs + local delivery). Customer wants ${r.needDays}.</p>`;
    const assessHtml = cq && cq.status !== "draft" ? "" : "";
    if (open && (r.status !== "quoted") ) html += `<div class="row">${btn(cq ? "Send revised quotation" : "Send quotation to customer", { type: "sendQuote", rfq: r.id }, "pri big")}${btn("Auto-allocate cheapest", { type: "autoAlloc", rfq: r.id }, "sm")}</div>${assessHtml}`;
    html += `</div>`;
  }
  // customer reply
  if (cq) {
    const resp = cq.resp; const a = cq.status === "replied" ? assess(s, r) : null;
    html += `<div class="panel ${cq.status === "replied" ? "hot" : ""}"><h2>Customer quotation: round ${cq.round} ${pill(cq.status, cq.status === "accepted" ? "ok" : cq.status === "rejected" ? "bad" : "warn")}</h2><p>Total offered <b>${money(cq.total)}</b> · terms ${cq.termsDays} days · delivery ${cq.promiseDays} days · warranty ${cq.warrantyM} months${cq.partialOk ? " · partial shipment OK" : ""}</p>`;
    if (cq.status === "sent") html += `<p class="warn">⏳ Waiting for the customer's reply (expected day ${cq.replyDay}).</p>`;
    if (resp && cq.status !== "sent") {
      html += `<div class="reply ${resp.type === "accept" || resp.type === "partial" ? "ok" : resp.type === "reject" || resp.type === "cancel" ? "bad" : "warn"}"><b>${esc(clientName(r.client))}:</b> “${esc(resp.msg)}”</div>`;
      if (cq.status === "replied") {
        const btns: string[] = [];
        if (resp.type === "discount") btns.push(btn(`Grant ${resp.discount}% discount`, { type: "replyCustomer", rfq: r.id, act: "accept_ask" }, "pri"));
        if (resp.type === "delivery") btns.push(btn(`Promise ${resp.days} days`, { type: "replyCustomer", rfq: r.id, act: "accept_ask" }, "pri"));
        if (resp.type === "warranty") btns.push(btn("Grant 24-month warranty (-1.5% price)", { type: "replyCustomer", rfq: r.id, act: "accept_ask" }, "pri"));
        if (resp.type === "clarify") btns.push(btn("Send datasheets and certificates", { type: "replyCustomer", rfq: r.id, act: "clarify" }, "pri"));
        if (["discount", "delivery", "warranty", "revise", "partial"].includes(resp.type)) btns.push(`<span class="sm">Or change margins, sources, freight or terms above and press “Send revised quotation”.</span>`);
        btns.push(btn("Walk away", { type: "replyCustomer", rfq: r.id, act: "walk" }, "danger sm"));
        html += `<div class="row">${btns.join("")}</div>`;
        if (a) html += `<p class="sm">Your offer is <b>${(a.q * 100).toFixed(0)}%</b> of what this customer expected to pay.${r.cq && r.cq.round >= 2 ? " Final round comes after round 3." : ""}</p>`;
      }
    }
    html += `</div>`;
  }
  if (r.so) html += `<div class="panel"><h2>Order won</h2><p>Sales order created. ${btn("Open sales order", { type: "ui", page: "orders", so: r.so }, "pri")}</p></div>`;
  return html;
}
