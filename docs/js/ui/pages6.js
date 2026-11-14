import { SITES } from "../data/sites.js";
import { DB } from "../data/db.js";
import { LC_STEP, lcOf, money, stockUsed, whCap, whRentMonth } from "../engine/core.js";
import { toC } from "../engine/pricing.js";
import { bar, btn, esc, flag, kpi, pill, table } from "./dom.js";
export const banking = { id: "banking", title: "Banking & LC", icon: "🏦", group: "Company", render(s) {
        const lc = lcOf(s);
        const steps = Math.round((lc.limit / 100 - 60000) / LC_STEP);
        const needRep = 20 + steps * 12;
        const open = s.pos.filter((p) => p.terms === "lc" && (p.status === "placed" || p.status === "ready"));
        const debt = s.loans.reduce((t, l) => t + l.left, 0);
        return `<div class="ph"><h1>Banking & Letters of Credit</h1><p class="sub">A letter of credit (LC) is your bank promising to pay a supplier once the shipping documents are right. It lets you buy without paying the full price up front: you put down a 10% margin and the rest is paid when the goods ship. The bank charges for it, limits how much you can have open, and checks the paperwork.</p></div>
<div class="kgrid">${kpi("LC limit", money(lc.limit), "bank facility", "", "🏦")}${kpi("In use", money(lc.used), `${open.length} open LC(s)`, lc.used > lc.limit * 0.8 ? "warn" : "", "📑")}${kpi("Available", money(lc.limit - lc.used), "", "good", "✅")}${kpi("Loans outstanding", money(debt), "", debt ? "warn" : "", "💳")}</div>
<div class="panel"><h2>Facility usage</h2>${bar(lc.used, lc.limit)}<div class="row">${steps >= 5 ? pill("Maximum limit reached", "ok") : btn(`Request higher limit +${money(toC(LC_STEP))} (fee $300)`, { type: "lcIncrease" }, "pri")}<span class="sm">${steps >= 5 ? "" : `The bank wants reputation ${needRep} (yours ${Math.round(s.rep)}) and modest debt.`}</span></div></div>
<div class="panel"><h2>How an LC works in this game</h2><div class="cards"><div class="card"><b>1. Open</b><p class="sm">Placing a purchase order on LC terms uses part of your limit and takes a <b>10% cash margin deposit</b>. Bank fee is 1.2% of value.</p></div><div class="card"><b>2. Documents</b><p class="sm">When goods ship, the bank checks the documents. Suppliers with <b>basic or no documents</b> often cause discrepancies: 3 days lost and a $150 fee.</p></div><div class="card"><b>3. Payment</b><p class="sm">If the documents are clean the bank pays the supplier from your margin plus the balance in cash. Your limit is freed.</p></div></div></div>
<div class="panel"><h2>Open letters of credit</h2>${table(["PO", "Supplier", "Value", "Margin paid", "Documents", "Status"], open.map((p) => { const sup = DB.supplierById[p.supplier]; return [`<b>${esc(p.no)}</b>`, `${flag(sup.country)} ${esc(sup.name)}`, money(p.value), money(p.lcMargin ?? 0), pill(sup.docs, sup.docs === "full" ? "ok" : "warn"), p.lcChecked ? pill("checked", "info") : pill("pending", "info")]; }))}</div>`;
    } };
export const network = { id: "network", title: "Warehouse Network", icon: "🏭", group: "Operations", render(s) {
        const open = s.sites ?? [];
        return `<div class="ph"><h1>Warehouse Network</h1><p class="sub">Your main warehouse is in Doha. Satellite hubs abroad add stock capacity and consolidate supplier cargo, which cuts transit time on shipments from the regions they serve. They cost setup money and monthly rent whether you use them or not.</p></div>
<div class="kgrid">${kpi("Total capacity", whCap(s) + " m³", `${stockUsed(s).toFixed(1)} m³ used`, "", "📦")}${kpi("Monthly rent (all sites)", money(toC(whRentMonth(s))), "", "", "🏷")}${kpi("Satellite sites", String(open.length), `of ${SITES.length}`, "", "🌐")}</div>
${bar(stockUsed(s), whCap(s))}
<div class="cards">${SITES.map((x) => { const on = open.includes(x.id); return `<div class="card ${on ? "ok" : ""}"><div class="big-i">${on ? "🏭" : "🏗"}</div><b>${flag(x.country)} ${esc(x.city)}</b><p class="sm">${esc(x.note)}</p><p class="sm">+${x.cap} m³ · rent ${money(toC(x.rent))}/mo · setup ${money(toC(x.setup))}<br>Serves: ${x.regions.join(", ")} · <b>−${x.bonus} days</b> transit</p>${on ? btn("Close site", { type: "closeSite", id: x.id }, "ghost sm") + " " + pill("open", "ok") : btn("Open warehouse", { type: "openSite", id: x.id }, "pri sm")}</div>`; }).join("")}</div>
<p class="sm">Expanding the Doha warehouse itself is on the Warehouse page.</p>`;
    } };
import { dateStr } from "../engine/core.js";
import { ui } from "./state.js";
const KIND = { customer: "Customer payment", supplier: "Supplier payment", freight: "Freight", customs: "Customs & duty", bank: "Bank charges", loan: "Loan", salaries: "Salaries", rent: "Rent", storage: "Storage", tax: "Tax", industry: "Industry unlock", admin: "Admin / certificates", mission: "Mission reward", claim: "Claims" };
export const ledger = { id: "ledger", title: "Cash Ledger", icon: "💵", group: "Company", render(s) {
        const kind = ui.q.lk ?? "", dir = ui.q.ld ?? "";
        const run = [];
        let bal = s.cash;
        for (const l of s.ledger) {
            run.push(bal);
            bal -= l.amount;
        }
        const rows = s.ledger.map((l, i) => ({ l, bal: run[i] })).filter(({ l }) => (!kind || l.kind === kind) && (!dir || (dir === "in" ? l.amount > 0 : l.amount < 0)));
        const win = s.ledger.filter((l) => l.day > s.day - 30);
        const inn = win.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0), out = win.filter((l) => l.amount < 0).reduce((a, l) => a - l.amount, 0);
        const byKind = {};
        for (const l of win)
            byKind[l.kind] = (byKind[l.kind] ?? 0) + l.amount;
        const kinds = Object.entries(byKind).sort((a, b) => a[1] - b[1]);
        const mx = Math.max(1, ...kinds.map(([, v]) => Math.abs(v)));
        const dueIn = s.invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0), dueOut = s.payables.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0);
        return `<div class="ph"><h1>Cash Ledger</h1><p class="sub">Every cent that enters or leaves your bank account, with the running balance after each entry. If your cash moves, the reason is on this page.</p></div>
<div class="kgrid">${kpi("Cash now", money(s.cash), "", s.cash < 0 ? "bad" : "good", "💵")}${kpi("Money in (30 days)", money(inn), "", "good", "⬇")}${kpi("Money out (30 days)", money(out), "", "warn", "⬆")}${kpi("Net (30 days)", money(inn - out), "", inn - out >= 0 ? "good" : "bad", "⚖")}${kpi("Still to collect", money(dueIn), "unpaid customer invoices", "", "🧾")}${kpi("Still to pay", money(dueOut), "unpaid supplier / freight bills", dueOut ? "warn" : "", "📤")}</div>
<div class="panel"><h2>Where the money went (last 30 days)</h2>${kinds.map(([k, v]) => `<div class="lbar"><span>${esc(KIND[k] ?? k)}</span><div class="lb"><i class="${v >= 0 ? "in" : "out"}" style="width:${Math.abs(v) / mx * 100}%"></i></div><b class="${v >= 0 ? "good" : "bad"}">${v >= 0 ? "+" : "-"}${money(Math.abs(v))}</b></div>`).join("") || '<p class="empty">No money movement yet.</p>'}</div>
<div class="filters"><select data-ui="lk"><option value="">All types</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${kind === k ? "selected" : ""}>${v}</option>`).join("")}</select><select data-ui="ld"><option value="">In and out</option><option value="in" ${dir === "in" ? "selected" : ""}>Money in only</option><option value="out" ${dir === "out" ? "selected" : ""}>Money out only</option></select><span class="sm">${rows.length} entries (latest 2,000 kept)</span></div>
${table(["Day", "Date", "Type", "What happened", "Amount", "Balance after"], rows.slice(0, 120).map(({ l, bal: b }) => [String(l.day), dateStr(l.day), pill(KIND[l.kind] ?? l.kind, l.amount > 0 ? "ok" : "info"), esc(l.text), `<b class="${l.amount > 0 ? "good" : "bad"}">${l.amount > 0 ? "+" : "-"}${money(Math.abs(l.amount))}</b>`, money(b)]))}`;
    } };
