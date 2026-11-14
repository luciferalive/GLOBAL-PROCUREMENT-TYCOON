import { SITES } from "../data/sites.js";
import { DB } from "../data/db.js";
import { COUNTRY } from "../data/countries.js";
import { LC_STEP, lcOf, money, stockUsed, whCap, whRentMonth } from "../engine/core.js";
import { toC } from "../engine/pricing.js";
import { bar, btn, esc, flag, kpi, pill, table } from "./dom.js";
import type { Page } from "./pages1.js";

export const banking: Page = { id: "banking", title: "Banking & LC", icon: "🏦", group: "Company", render(s) {
  const lc = lcOf(s); const steps = Math.round((lc.limit / 100 - 60000) / LC_STEP); const needRep = 20 + steps * 12;
  const open = s.pos.filter((p) => p.terms === "lc" && (p.status === "placed" || p.status === "ready"));
  const debt = s.loans.reduce((t, l) => t + l.left, 0);
  return `<div class="ph"><h1>Banking & Letters of Credit</h1><p class="sub">A letter of credit (LC) is your bank promising to pay a supplier once the shipping documents are right. It lets you buy without paying the full price up front: you put down a 10% margin and the rest is paid when the goods ship. The bank charges for it, limits how much you can have open, and checks the paperwork.</p></div>
<div class="kgrid">${kpi("LC limit", money(lc.limit), "bank facility", "", "🏦")}${kpi("In use", money(lc.used), `${open.length} open LC(s)`, lc.used > lc.limit * 0.8 ? "warn" : "", "📑")}${kpi("Available", money(lc.limit - lc.used), "", "good", "✅")}${kpi("Loans outstanding", money(debt), "", debt ? "warn" : "", "💳")}</div>
<div class="panel"><h2>Facility usage</h2>${bar(lc.used, lc.limit)}<div class="row">${steps >= 5 ? pill("Maximum limit reached", "ok") : btn(`Request higher limit +${money(toC(LC_STEP))} (fee $300)`, { type: "lcIncrease" }, "pri")}<span class="sm">${steps >= 5 ? "" : `The bank wants reputation ${needRep} (yours ${Math.round(s.rep)}) and modest debt.`}</span></div></div>
<div class="panel"><h2>How an LC works in this game</h2><div class="cards"><div class="card"><b>1. Open</b><p class="sm">Placing a purchase order on LC terms uses part of your limit and takes a <b>10% cash margin deposit</b>. Bank fee is 1.2% of value.</p></div><div class="card"><b>2. Documents</b><p class="sm">When goods ship, the bank checks the documents. Suppliers with <b>basic or no documents</b> often cause discrepancies: 3 days lost and a $150 fee.</p></div><div class="card"><b>3. Payment</b><p class="sm">If the documents are clean the bank pays the supplier from your margin plus the balance in cash. Your limit is freed.</p></div></div></div>
<div class="panel"><h2>Open letters of credit</h2>${table(["PO", "Supplier", "Value", "Margin paid", "Documents", "Status"], open.map((p) => { const sup = DB.supplierById[p.supplier]; return [`<b>${esc(p.no)}</b>`, `${flag(sup.country)} ${esc(sup.name)}`, money(p.value), money(p.lcMargin ?? 0), pill(sup.docs, sup.docs === "full" ? "ok" : "warn"), p.lcChecked ? pill("checked", "info") : pill("pending", "info")]; }))}</div>`;
} };

export const network: Page = { id: "network", title: "Warehouse Network", icon: "🏭", group: "Operations", render(s) {
  const open = s.sites ?? [];
  return `<div class="ph"><h1>Warehouse Network</h1><p class="sub">Your main warehouse is in Doha. Satellite hubs abroad add stock capacity and consolidate supplier cargo, which cuts transit time on shipments from the regions they serve. They cost setup money and monthly rent whether you use them or not.</p></div>
<div class="kgrid">${kpi("Total capacity", whCap(s) + " m³", `${stockUsed(s).toFixed(1)} m³ used`, "", "📦")}${kpi("Monthly rent (all sites)", money(toC(whRentMonth(s))), "", "", "🏷")}${kpi("Satellite sites", String(open.length), `of ${SITES.length}`, "", "🌐")}</div>
${bar(stockUsed(s), whCap(s))}
<div class="cards">${SITES.map((x) => { const on = open.includes(x.id); return `<div class="card ${on ? "ok" : ""}"><div class="big-i">${on ? "🏭" : "🏗"}</div><b>${flag(x.country)} ${esc(x.city)}</b><p class="sm">${esc(x.note)}</p><p class="sm">+${x.cap} m³ · rent ${money(toC(x.rent))}/mo · setup ${money(toC(x.setup))}<br>Serves: ${x.regions.join(", ")} · <b>−${x.bonus} days</b> transit</p>${on ? btn("Close site", { type: "closeSite", id: x.id }, "ghost sm") + " " + pill("open", "ok") : btn("Open warehouse", { type: "openSite", id: x.id }, "pri sm")}</div>`; }).join("")}</div>
<p class="sm">Expanding the Doha warehouse itself is on the Warehouse page.</p>`;
} };
