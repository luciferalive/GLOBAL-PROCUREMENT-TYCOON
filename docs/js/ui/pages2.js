import { COUNTRY } from "../data/countries.js";
import { DB, MODE_LABEL } from "../data/db.js";
import { money, money2, netWorth, stockUsed, whCap, whRentMonth, WH_STEP_RENT, emptyPl } from "../engine/core.js";
import { toC } from "../engine/pricing.js";
import { act, bar, btn, esc, flag, kpi, line, pill, table } from "./dom.js";
import { worldMap, MODE_COLOR } from "./map.js";
import { clientName, partLine } from "./pages1.js";
import { ui } from "./state.js";
export const orders = { id: "orders", title: "Sales & Purchase Orders", icon: "▤", group: "Operations", render(s) {
        if (!s.sos.length)
            return `<div class="ph"><h1>Orders</h1><p class="sub">When a customer accepts your quotation, the sales order appears here with everything you must buy, ship and deliver.</p></div><div class="panel"><p class="empty">No orders yet. Win your first RFQ.</p></div>`;
        const list = s.sos.slice().reverse();
        const sel = ui.so !== null ? s.sos.find((x) => x.id === ui.so) : undefined;
        const so = sel ?? list.find((x) => x.status === "open" || x.status === "delivering") ?? list[0];
        const r = s.rfqs.find((x) => x.id === so.rfq);
        const c = DB.clientById[so.client];
        const pos = s.pos.filter((p) => p.so === so.id);
        const rows = so.lines.map((l, i) => {
            const have = s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "ok").reduce((a, x) => a + x.qty, 0), insp = s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "inspection").reduce((a, x) => a + x.qty, 0);
            const miss = l.qty - l.delivered - have - insp;
            const onway = pos.some((p) => (p.status === "placed" || p.status === "shipped") && p.lines.some((x) => x.soLine === l.rfqLine));
            return [partLine(l.partId), String(l.qty), money2(l.unit), money(l.unit * l.qty), `${l.delivered}`, `${have}${insp ? ` <span class="sm">(+${insp} in inspection)</span>` : ""}`, miss > 0 && so.purchased && !onway ? `<span class="bad">short ${miss}</span> ${btn("Buy locally", { type: "topUp", so: so.id, line: i }, "xs")}` : miss > 0 ? `<span class="warn">${onway ? "on the way" : "to buy"}</span>` : `<span class="good">covered</span>`];
        });
        const reqs = {};
        if (!so.purchased)
            for (const l of r.lines.keys()) {
                if (!so.lines.some((x) => x.rfqLine === l))
                    continue;
                for (const a of r.lines[l].alloc)
                    if (a.quote) {
                        const q = s.quotes.find((x) => x.id === a.quote);
                        const sp = DB.supplierById[q.supplier];
                        (reqs[sp.id] ??= { name: sp.name, value: 0, items: [] }).value += a.qty * q.unit;
                        reqs[sp.id].items.push(`${a.qty}× ${DB.partsById[q.partId].pn} @ ${money2(q.unit)} (${q.terms === "prepay" ? "advance payment" : q.terms})`);
                    }
            }
        const cost = so.lines.reduce((a, l, i) => a + l.qty * l.unit, 0);
        return `<div class="ph"><h1>Orders</h1><p class="sub">Sales orders and the purchase orders behind them.</p></div>
<div class="tabs">${list.slice(0, 12).map((x) => `<button class="${x.id === so.id ? "on" : ""}" ${act({ type: "ui", so: x.id })}>${esc(x.no)} ${x.status === "closed" ? "✓" : x.status === "cancelled" ? "✗" : ""}</button>`).join("")}</div>
<div class="panel"><h2>${esc(so.no)} · ${flag(c.country)} ${esc(c.name)} ${pill(so.status, so.status === "closed" ? "ok" : so.status === "cancelled" ? "bad" : "info")}</h2>
<div class="kgrid k4">${kpi("Order value", money(cost), "", "")}${kpi("Needed by", `Day ${so.needBy}`, so.needBy - s.day >= 0 ? so.needBy - s.day + " days left" : "<span class='bad'>LATE " + (s.day - so.needBy) + " days</span>", so.needBy < s.day ? "bad" : "")}${kpi("Payment terms", so.termsDays + " days", "after delivery", "")}${kpi("Warranty", so.warrantyM + " months", "", "")}</div>
${table(["Item", "Qty", "Unit price", "Total", "Delivered", "In warehouse", "Supply"], rows)}
<div class="row">${!so.purchased ? btn("Place purchase orders", { type: "placeOrders", so: so.id }, "pri big") : ""}${so.status === "open" ? btn("Pick, pack and deliver", { type: "deliver", id: so.id }, "pri") : ""}${btn("Documents", { type: "ui", page: "documents", q: { doc: "so:" + so.id } }, "ghost")}</div>
${!so.purchased && Object.keys(reqs).length ? `<h3>Purchasing requirements</h3>${table(["Supplier", "Items", "Value"], Object.values(reqs).map((q) => [esc(q.name), q.items.map(esc).join("<br>"), `<b>${money(q.value)}</b>`]))}<p class="sm">Cash after prepayments: advance-payment suppliers are paid today, letters of credit when goods ship, credit suppliers (net 30/60) after shipment.</p>` : ""}
${pos.length ? `<h3>Purchase orders</h3>${table(["PO", "Supplier", "Value", "Terms", "Status", "Ready / ETA"], pos.map((p) => { const sh = s.ships.find((x) => x.id === p.ship); return [`<b>${esc(p.no)}</b>`, esc(DB.supplierById[p.supplier].name), money(p.value), p.terms, pill(p.status, p.status === "inspected" ? "ok" : "info"), `day ${p.readyDay} → ${sh.arrive}`]; }))}` : ""}</div>
${list.length > 1 ? `<div class="panel"><h2>All sales orders</h2>${table(["Order", "Customer", "Value", "Status", ""], list.map((x) => [esc(x.no), esc(clientName(x.client)), money(x.lines.reduce((a, l) => a + l.qty * l.unit, 0)), pill(x.status, "info"), btn("Open", { type: "ui", so: x.id }, "sm")]))}</div>` : ""}`;
    } };
export const shipments = { id: "shipments", title: "Shipments & Map", icon: "⛴", group: "Operations", render(s) {
        const act2 = s.ships.filter((x) => x.status !== "delivered"), done = s.ships.filter((x) => x.status === "delivered").slice(-6).reverse();
        const row = (sh) => {
            const po = s.pos.find((p) => p.id === sh.po);
            const sp = DB.supplierById[po.supplier];
            const lg = DB.logiById[sh.logi];
            const eta = sh.arrive - s.day;
            return [`<b>${esc(sh.no)}</b><br><span class="sm">${esc(po.no)}</span>`, `${flag(sh.from)} ${esc(sp.name)}`, `<span class="dot" style="background:${MODE_COLOR[sh.mode]}"></span>${MODE_LABEL[sh.mode]}<br><span class="sm">${esc(lg?.name ?? "Supplier arranged")}</span>`, pill(sh.status.replace("_", " "), sh.status === "held" ? "bad" : sh.status === "in_transit" ? "info" : sh.status === "cleared" ? "ok" : "warn"), sh.status === "booked" ? `ships day ${sh.depart}` : eta >= 0 ? `${eta} days` : `<span class="warn">late</span>`, `${sh.kg.toFixed(0)} kg`, btn("Track", { type: "ui", q: { ship: String(sh.id) } }, "xs")];
        };
        const sel = ui.q.ship ? s.ships.find((x) => x.id === +ui.q.ship) : undefined;
        return `<div class="ph"><h1>Shipments & World Map</h1><p class="sub">Every purchase order creates a shipment. Delays, customs holds and weather are simulated.</p></div>
<div class="panel nopad">${worldMap(s, sel?.id)}<div class="legend">${Object.entries(MODE_LABEL).map(([k, v]) => `<span><i style="background:${MODE_COLOR[k]}"></i>${v}</span>`).join("")}<span><i class="hq"></i>Your HQ</span></div></div>
${sel ? `<div class="panel"><h2>Tracking ${esc(sel.no)}</h2><p>From ${flag(sel.from)} ${esc(COUNTRY[sel.from]?.name ?? sel.from)} (${esc(COUNTRY[sel.from]?.hub ?? "")}) to Doha · ${MODE_LABEL[sel.mode]} · status <b>${sel.status.replace("_", " ")}</b> · departs day ${sel.depart} · arrives day ${sel.arrive} · ${sel.insured ? "insured" : "not insured"} · freight ${money(sel.freight)} · duty ${money(sel.duty)}</p>${bar(Math.max(0, Math.min(sel.arrive - sel.day, s.day - sel.day)), Math.max(1, sel.arrive - sel.day))}</div>` : ""}
<div class="panel"><h2>On the move (${act2.length})</h2>${table(["Shipment", "Supplier", "Mode / carrier", "Status", "ETA", "Weight", ""], act2.map(row))}</div>
<div class="panel"><h2>Recently arrived</h2>${table(["Shipment", "Supplier", "Mode / carrier", "Status", "ETA", "Weight", ""], done.map(row))}</div>`;
    } };
export const warehouse = { id: "warehouse", title: "Warehouse", icon: "▦", group: "Operations", render(s) {
        const used = stockUsed(s), cap = whCap(s);
        const lots = s.lots.slice().sort((a, b) => b.day - a.day);
        const agg = {};
        for (const l of s.lots) {
            const a = (agg[l.partId] ??= { qty: 0, value: 0 });
            a.qty += l.qty;
            a.value += l.qty * l.unitCost;
        }
        const insp = s.lots.filter((l) => l.status === "inspection");
        return `<div class="ph"><h1>Warehouse · Doha</h1><p class="sub">Receive, inspect, reserve and dispatch. Stock costs rent: do not buy more than you can sell.</p></div>
<div class="kgrid k4">${kpi("Capacity used", `${used.toFixed(1)} / ${cap} m³`, "", used > cap ? "bad" : "")}${kpi("Stock value", money(netWorth(s).inventory), "at landed cost", "")}${kpi("Rent", money(toC(whRentMonth(s))) + " / month", "", "")}${kpi("Awaiting inspection", String(insp.length), "", insp.length ? "warn" : "")}</div>
<div class="panel"><h2>Capacity</h2>${bar(used, cap, used > cap ? "bad" : used > cap * 0.8 ? "warn" : "")}<div class="row">${btn(`Expand +100 m³ (${money(toC(5000))} fit-out, +${money(toC(WH_STEP_RENT))}/month)`, { type: "expandWh" }, "pri sm")}</div></div>
${insp.length ? `<div class="panel hot"><h2>Goods inspection</h2><p class="sm">Check goods before they go to a customer. Damaged units are removed; insured shipments recover 90% of their value.</p>${table(["Lot", "Item", "Qty", "Received", "Batch / serial", ""], insp.map((l) => [esc(l.id), partLine(l.partId), String(l.qty), `day ${l.day}`, `${esc(l.batch)}<br><span class="sm">${esc(l.serial)}</span>`, btn("Inspect now", { type: "inspect", id: l.id }, "pri sm")]))}</div>` : ""}
<div class="panel"><h2>Stock register</h2>${table(["Lot", "Item", "Qty", "Unit cost (landed)", "Value", "Reserved for", "Batch / serial", "Status"], lots.map((l) => [esc(l.id), partLine(l.partId), String(l.qty) + (l.damaged ? `<br><span class="bad sm">${l.damaged} damaged</span>` : ""), money2(l.unitCost), money(l.qty * l.unitCost), l.so ? `<b>${esc(s.sos.find((x) => x.id === l.so)?.no ?? "")}</b>` : "free stock", `<span class="barcode">▌▎▍▌▎▌▍▎▌▍</span><br><span class="sm">${esc(l.batch)} · ${esc(l.serial)}</span>`, pill(l.status, l.status === "ok" ? "ok" : l.status === "inspection" ? "warn" : "bad")]))}</div>
<p class="sm">Planned for later stages: multiple warehouses, automation, returns processing, expiry tracking and reorder points.</p>`;
    } };
export const finance = { id: "finance", title: "Finance", icon: "$", group: "Company", render(s) {
        const nw = netWorth(s);
        const months = Object.keys(s.pl).map(Number).sort((a, b) => a - b).slice(-6);
        const tot = emptyPl();
        const prow = (k, label, neg = false) => [label, ...months.map((m) => { const v = s.pl[String(m)]?.[k] ?? 0; return neg && v ? `-${money(v)}` : money(v); })];
        const profit = (m) => { const p = s.pl[String(m)] ?? emptyPl(); return p.rev - p.cogs - p.salaries - p.rent - p.bank - p.interest - p.other - p.tax; };
        const od = s.invoices.filter((i) => !i.paid);
        return `<div class="ph"><h1>Finance</h1><p class="sub">High revenue with poor cash flow still kills a trading company. Watch cash, receivables and payables together.</p></div>
<div class="kgrid">${kpi("Cash", money(s.cash), "", s.cash < 0 ? "bad" : "good", "💵")}${kpi("Receivables", money(nw.receivables), "", "", "🧾")}${kpi("Payables", money(nw.payables), "", "", "📑")}${kpi("Inventory", money(nw.inventory), "", "", "📦")}${kpi("Goods in transit", money(nw.transit), "", "", "🚢")}${kpi("Loans", money(nw.loans), "", nw.loans ? "warn" : "", "🏦")}${kpi("Working capital", money(s.cash + nw.receivables + nw.inventory + nw.transit - nw.payables), "cash + receivables + stock − payables", "", "⚖️")}${kpi("Net worth", money(nw.total), "", nw.total > toC(180000) ? "good" : "", "📈")}</div>
<div class="panel"><h2>Profit and loss by month (30-day periods)</h2>${table(["", ...months.map((m) => `M${m + 1}`)], [prow("rev", "Revenue"), prow("cogs", "Cost of goods sold (landed)", true), prow("salaries", "Salaries", true), prow("rent", "Warehouse rent", true), prow("bank", "Bank charges", true), prow("interest", "Interest", true), prow("other", "Other (write-offs, fees, certs)", true), prow("tax", "Corporate tax (10%)", true), ["<b>Net profit</b>", ...months.map((m) => { const p = profit(m); return `<b class="${p >= 0 ? "good" : "bad"}">${money(p)}</b>`; })]])}<p class="sm">Freight, insurance, duty and clearance are part of the landed cost of goods, so they appear inside cost of goods sold when the goods are delivered.</p></div>
<div class="g2"><div class="panel"><h2>Receivables (customers owe you)</h2>${table(["Invoice", "Customer", "Amount", "Due", "Expected"], od.map((i) => [esc(i.no), esc(clientName(i.client)), money(i.amount), `day ${i.due}`, `<span class="${i.payDay > i.due ? "warn" : ""}">day ${i.payDay}</span>`]))}</div>
<div class="panel"><h2>Payables (you owe)</h2>${table(["To", "Ref", "Amount", "Due"], s.payables.filter((p) => !p.paid && p.kind !== "claim").map((p) => [esc(p.to), esc(p.ref), money(p.amount), `day ${p.due}`]))}</div></div>
<div class="g2"><div class="panel"><h2>Bank financing</h2>${s.loans.length ? table(["Loan", "Left", "Rate", ""], s.loans.map((l) => [`#${l.id}`, money(l.left), (l.rate * 100).toFixed(1) + "%", btn("Repay", { type: "repay", id: l.id }, "sm")])) : `<p class="sm">No loans.</p>`}<div class="form" id="loanf"><label>Borrow (USD)<input type="number" class="qty wide" data-f="amount" value="20000" min="1000" step="1000"></label>${btn("Request loan", { type: "borrow" }, "pri", 'data-form="#loanf"')}</div><p class="sm">Limit grows with reputation. 12 monthly instalments plus interest.</p></div>
<div class="panel"><h2>Cash flow</h2>${line(s.hist.map((h) => h.cash / 100), 520, 140, "#33d6a6", (n) => "$" + Math.round(n / 1000) + "k")}</div></div>
<div class="panel"><h2>Cash ledger (latest)</h2>${table(["Day", "Type", "Description", "Amount"], s.ledger.slice(0, 25).map((l) => [String(l.day), esc(l.kind), esc(l.text), `<span class="${l.amount >= 0 ? "good" : "bad"}">${money2(l.amount)}</span>`]))}</div>`;
    } };
