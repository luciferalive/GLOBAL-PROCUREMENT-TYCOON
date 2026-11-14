import { DB } from "../data/db.js";
import { IND } from "../data/lists.js";
import { emptyPl, money, netWorth } from "../engine/core.js";
import { toC } from "../engine/pricing.js";
import { bar, esc, kpi, table } from "./dom.js";
const staffN = (s) => Object.values(s.staff).reduce((a, b) => a + b, 0);
const beaten = (s) => (s.rivals ?? []).reduce((a, r) => a + r.losses, 0);
const TROPHIES = [
    { id: "w1", icon: "🥉", title: "First Blood", text: "Win 1 customer order", cur: (s) => s.stats.won, goal: 1 },
    { id: "w10", icon: "🥈", title: "Dealmaker", text: "Win 10 orders", cur: (s) => s.stats.won, goal: 10 },
    { id: "w25", icon: "🥇", title: "Rainmaker", text: "Win 25 orders", cur: (s) => s.stats.won, goal: 25 },
    { id: "w50", icon: "👑", title: "Trading House", text: "Win 50 orders", cur: (s) => s.stats.won, goal: 50 },
    { id: "d5", icon: "📦", title: "Reliable", text: "Complete 5 deliveries", cur: (s) => s.stats.delivered, goal: 5 },
    { id: "d25", icon: "🚚", title: "Logistics Pro", text: "Complete 25 deliveries", cur: (s) => s.stats.delivered, goal: 25 },
    { id: "r100", icon: "💵", title: "Six Figures", text: "Reach $100,000 revenue", cur: (s) => s.stats.revenue, goal: toC(100_000), fmt: money },
    { id: "r500", icon: "💰", title: "Half a Million", text: "Reach $500,000 revenue", cur: (s) => s.stats.revenue, goal: toC(500_000), fmt: money },
    { id: "r1m", icon: "🏦", title: "Millionaire Desk", text: "Reach $1,000,000 revenue", cur: (s) => s.stats.revenue, goal: toC(1_000_000), fmt: money },
    { id: "nw250", icon: "📈", title: "Growing", text: "Net worth $250,000", cur: (s) => netWorth(s).total, goal: toC(250_000), fmt: money },
    { id: "nw500", icon: "🚀", title: "Scale-up", text: "Net worth $500,000", cur: (s) => netWorth(s).total, goal: toC(500_000), fmt: money },
    { id: "c5", icon: "🌍", title: "Globetrotter", text: "Import from 5 countries", cur: (s) => s.stats.countries.length, goal: 5 },
    { id: "c12", icon: "🗺️", title: "World Supply Chain", text: "Import from 12 countries", cur: (s) => s.stats.countries.length, goal: 12 },
    { id: "ind3", icon: "🏭", title: "Diversified", text: "Unlock 3 more industries", cur: (s) => Math.max(0, s.industries.length - 7), goal: 3 },
    { id: "ind8", icon: "🧪", title: "Conglomerate", text: "Unlock 8 more industries", cur: (s) => Math.max(0, s.industries.length - 7), goal: 8 },
    { id: "cert2", icon: "🎖️", title: "Certified", text: "Hold 2 certifications", cur: (s) => s.certs.length, goal: 2 },
    { id: "cl10", icon: "🤝", title: "Vendor List", text: "Become an approved vendor for 10 customers", cur: (s) => DB.clients.filter((c) => s.reg[c.id]?.result === "approved").length, goal: 10 },
    { id: "riv", icon: "⚔️", title: "Rival Slayer", text: "Beat rivals on 10 orders", cur: beaten, goal: 10 },
    { id: "team", icon: "👥", title: "Real Company", text: "Employ 8 people", cur: staffN, goal: 8 },
    { id: "rep60", icon: "⭐", title: "Trusted Name", text: "Reach reputation 60", cur: (s) => s.rep, goal: 60 },
    { id: "y1", icon: "🎂", title: "Survivor", text: "Survive 365 days", cur: (s) => s.day, goal: 365 },
    { id: "clean", icon: "✨", title: "Perfect Record", text: "10+ deliveries with zero late", cur: (s) => (s.stats.late === 0 ? s.stats.delivered : 0), goal: 10 },
];
export const achievements = { id: "achievements", title: "Achievements", icon: "🏆", group: "Company", render(s) {
        const done = TROPHIES.filter((t) => t.cur(s) >= t.goal).length;
        return `<div class="ph"><h1>Achievements</h1><p class="sub">${done} of ${TROPHIES.length} earned. Computed live from your company record.</p></div>${bar(done, TROPHIES.length)}
<div class="cards">${TROPHIES.map((t) => { const c = t.cur(s), ok = c >= t.goal, f = t.fmt ?? ((n) => String(Math.round(n))); return `<div class="card ${ok ? "ok" : ""}"><div class="big-i" style="${ok ? "" : "filter:grayscale(1);opacity:.5"}">${t.icon}</div><b>${esc(t.title)}</b><p class="sm">${esc(t.text)}</p>${bar(Math.min(c, t.goal), t.goal)}<span class="sm">${ok ? "✅ Earned" : `${f(Math.min(c, t.goal))} / ${f(t.goal)}`}</span></div>`; }).join("")}</div>`;
    } };
export const reports = { id: "reports", title: "Reports", icon: "📊", group: "Company", render(s) {
        const months = Object.keys(s.pl).map(Number).sort((a, b) => a - b).slice(-6);
        const prof = (m) => { const p = s.pl[String(m)] ?? emptyPl(); return { rev: p.rev, cost: p.cogs + p.salaries + p.rent + p.bank + p.interest + p.other + p.tax + p.freight + p.customs }; };
        const max = Math.max(1, ...months.flatMap((m) => [prof(m).rev, prof(m).cost]));
        const byCus = {}, bySup = {}, byInd = {};
        for (const i of s.invoices) {
            byCus[i.client] = (byCus[i.client] ?? 0) + i.amount;
            const ind = DB.clientById[i.client]?.industry;
            if (ind)
                byInd[ind] = (byInd[ind] ?? 0) + i.amount;
        }
        for (const p of s.pos)
            bySup[p.supplier] = (bySup[p.supplier] ?? 0) + p.value;
        const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
        const rate = s.stats.won + s.stats.lost ? Math.round((s.stats.won / (s.stats.won + s.stats.lost)) * 100) : 0;
        const ontime = s.stats.delivered ? Math.round(((s.stats.delivered - s.stats.late) / s.stats.delivered) * 100) : 100;
        const gp = s.invoices.reduce((a, i) => a + i.amount - i.cogs, 0), rev = s.invoices.reduce((a, i) => a + i.amount, 0);
        return `<div class="ph"><h1>Reports</h1><p class="sub">How the business is really performing.</p></div>
<div class="kgrid">${kpi("Win rate", rate + "%", `${s.stats.won} won · ${s.stats.lost} lost`, rate >= 35 ? "good" : "warn", "🎯")}${kpi("On-time delivery", ontime + "%", `${s.stats.late} late`, ontime >= 90 ? "good" : "warn", "⏱")}${kpi("Gross margin", rev ? (gp / rev * 100).toFixed(1) + "%" : "-", "invoiced sales vs landed cost", "", "📐")}${kpi("Countries sourced", String(s.stats.countries.length), "", "", "🌍")}</div>
<div class="panel"><h2>Revenue vs total costs (last 6 months)</h2><div class="bars2">${months.map((m) => { const p = prof(m); return `<div class="b2"><div class="cols"><i class="r" style="height:${(p.rev / max) * 100}%" title="Revenue ${money(p.rev)}"></i><i class="c" style="height:${(p.cost / max) * 100}%" title="Costs ${money(p.cost)}"></i></div><span>M${m}</span><small>${money(p.rev - p.cost)}</small></div>`; }).join("") || '<p class="empty">Reports appear after your first month.</p>'}</div><p class="sm"><span class="good">■</span> revenue &nbsp; <span class="bad">■</span> costs</p></div>
<div class="g2"><div class="panel"><h2>Top customers (invoiced)</h2>${table(["Customer", "Sales"], top(byCus).map(([id, v]) => [esc(DB.clientById[id]?.name ?? id), money(v)]))}</div>
<div class="panel"><h2>Top suppliers (purchased)</h2>${table(["Supplier", "Purchases"], top(bySup).map(([id, v]) => [esc(DB.supplierById[id]?.name ?? id), money(v)]))}</div></div>
<div class="panel"><h2>Sales by industry</h2>${table(["Industry", "Sales"], top(byInd, 10).map(([id, v]) => [`${IND[id]?.icon ?? ""} ${esc(IND[id]?.name ?? id)}`, money(v)]))}</div>`;
    } };
