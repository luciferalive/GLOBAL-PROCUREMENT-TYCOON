import { DB } from "../data/db.js";
import { INDUSTRIES } from "../data/lists.js";
import { COUNTRY } from "../data/countries.js";
import { dateStr, money } from "../engine/core.js";
import { AUTONOMY_TEXT, DEPTS, DEPT_ICON, DEPT_NAME, LEVELS, PROMO_EXP, ROLES_OF, ROLE_NAME, TRAITS, candidates, capTasks, empName, loadOf, managerOf, titleOf, wfOf } from "../engine/staff.js";
import { bar, btn, esc, kpi, pill, table } from "./dom.js";
import { ui } from "./state.js";
const sel = (key, opts, all = "All") => `<select data-ui="${key}"><option value="">${all}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${ui.q[key] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const skill = (l, v) => `<div class="sk"><span>${l}</span>${bar(v, 100, v >= 70 ? "ok" : v < 40 ? "bad" : "")}<b>${Math.round(v)}</b></div>`;
const stCls = { pending: "info", active: "ok", waiting: "", approval: "warn", blocked: "bad", done: "ok", failed: "bad" };
export const ceoMsgs = (s) => { const w = wfOf(s); return w.msgs.filter((m) => m.to === "CEO" && m.imp >= w.policy.notify); };
export const pendingApprovals = (s) => wfOf(s).tasks.filter((t) => t.status === "approval" && t.apr?.who === "ceo");
export const inboxBadge = (s) => pendingApprovals(s).length + ceoMsgs(s).filter((m) => !m.read).length;
function empCard(s, e) {
    const tk = wfOf(s).tasks.filter((t) => t.assignee === e.id && (t.status === "active" || t.status === "pending"));
    const load = loadOf(s, e), cap = capTasks(e), cur = tk.find((t) => t.status === "active") ?? tk[0];
    const tr = TRAITS.find((x) => x.id === e.trait);
    const next = LEVELS[LEVELS.indexOf(e.level) + 1];
    return `<div class="emp ${load > cap ? "over" : ""}"><div class="eh"><span class="av">${e.avatar}</span><div><b>${esc(e.name)}</b><small>${esc(titleOf(e))}</small></div>${pill(e.level, e.level === "manager" ? "ok" : "info")}</div>
<p class="sm trait">${esc(tr?.label ?? "")} · ${e.spec.map((x) => INDUSTRIES.find((i) => i.id === x)?.name ?? x).join(", ")}</p>
<div class="skg">${skill("Speed", e.sk.speed)}${skill("Accuracy", e.sk.acc)}${skill("Reliab.", e.sk.rel)}${skill("Negot.", e.sk.neg)}${skill("Technical", e.sk.tech)}</div>
<div class="skg">${skill("Morale", e.morale)}<div class="sk"><span>Stress</span>${bar(e.stress, 100, e.stress > 70 ? "bad" : e.stress > 50 ? "warn" : "ok")}<b>${Math.round(e.stress)}</b></div><div class="sk"><span>Workload</span>${bar(load, cap, load > cap ? "bad" : "")}<b>${load.toFixed(0)}/${cap.toFixed(0)}</b></div></div>
<p class="sm">${cur ? `<b>Now:</b> ${esc(cur.title)}` : "Idle, waiting for work"} · ${e.done} tasks done · ${money(e.salary * 100)}/month${e.mistakes ? ` · ${e.mistakes} mistakes` : ""}</p>
<div class="row">${next ? btn(`Promote to ${next}`, { type: "promote", id: e.id }, "pri xs") : ""}${btn("+8% raise", { type: "raise", id: e.id }, "ghost xs")}${btn("Release", { type: "fireEmp", id: e.id }, "danger xs")}${e.exp >= PROMO_EXP[e.level] && next ? pill("ready for promotion", "ok") : ""}</div></div>`;
}
export const team = { id: "team", title: "Team & Departments", icon: "👥", group: "Team", render(s) {
        const w = wfOf(s);
        const pay = w.emps.reduce((a, e) => a + e.salary, 0), open = w.tasks.filter((t) => ["pending", "active", "waiting", "approval", "blocked"].includes(t.status)).length;
        const hire = ui.q.hireDept || "sales";
        const role = ui.q.hireRole || ROLES_OF[hire][0];
        const hd = hire;
        const cands = candidates(s, ROLES_OF[hd].includes(role) ? role : ROLES_OF[hd][0]);
        return `<h1>Team & Departments</h1><p class="lead">You are the CEO. Your employees receive work automatically, do it over several days, talk to each other and change the real game: they ask suppliers, pick quotes, book freight, send quotations, place orders, inspect goods, dispatch and chase payments. Hire good people, set how much freedom each department gets, and approve the big decisions.</p>
<div class="kgrid k4">${kpi("People", String(w.emps.length), money(pay * 100) + " payroll / month", "", "👥")}${kpi("Open tasks", String(open), `${w.tasks.filter((t) => t.status === "done").length} completed`, "", "📋")}${kpi("Waiting for you", String(w.tasks.filter((t) => t.status === "approval" && t.apr?.who === "ceo").length), "approvals", w.tasks.some((t) => t.status === "approval" && t.apr?.who === "ceo") ? "warn" : "", "✋")}${kpi("Autopilot", w.on ? "ON" : "OFF", w.on ? "team is working" : "nobody picks up work", w.on ? "good" : "bad", "⚙️")}</div>
<div class="row">${btn(w.on ? "Switch autopilot OFF" : "Switch autopilot ON", { type: "autopilot", on: !w.on }, w.on ? "ghost" : "pri")}<span class="sm">Off = the old hands-on mode: you do everything yourself on the RFQ page. You can also take over a single RFQ from its page.</span></div>
${DEPTS.map((d) => {
            const em = w.emps.filter((e) => e.dept === d), mg = managerOf(s, d), tot = em.reduce((a, e) => a + loadOf(s, e), 0), cap = em.reduce((a, e) => a + capTasks(e), 0);
            return `<div class="panel dept"><div class="dh"><h2>${DEPT_ICON[d]} ${DEPT_NAME[d]}</h2><span class="sm">${em.length} staff${mg ? ` · manager ${esc(mg.name)}` : " · no manager (hire or promote one to get workload redistribution and approvals)"}</span><label class="sm aut">Autonomy <select data-chg='${esc(JSON.stringify({ type: "setAutonomy", dept: d }))}' data-key="level">${["low", "balanced", "high", "full"].map((l) => `<option value="${l}" ${w.autonomy[d] === l ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
<p class="sm">${esc(AUTONOMY_TEXT[w.autonomy[d]])}</p>${em.length ? `<div class="lbar2"><span class="sm">Department load ${tot.toFixed(0)} / ${cap.toFixed(0)}</span>${bar(tot, cap || 1, tot > cap ? "bad" : "")}</div><div class="emps">${em.map((e) => empCard(s, e)).join("")}</div>` : `<p class="empty">Nobody here. ${d === "sales" ? "" : "Another department covers this work, slower and less accurately. "}Hire someone below.</p>`}</div>`;
        }).join("")}
<div class="panel hot"><h2>Hire</h2><div class="filters">${sel("hireDept", DEPTS.map((d) => [d, DEPT_NAME[d]]), "").replace('<option value="">', '<option value="" hidden>')}${ROLES_OF[hd].length > 1 ? sel("hireRole", ROLES_OF[hd].map((r) => [r, ROLE_NAME[r]]), "").replace('<option value="">', '<option value="" hidden>') : ""}<span class="sm">Three applicants per role each month. Hiring fee = one month's salary. They start working immediately.</span></div>
<div class="emps">${cands.map((c) => `<div class="emp"><div class="eh"><span class="av">${c.avatar}</span><div><b>${esc(c.name)}</b><small>${esc(ROLE_NAME[c.role])}</small></div>${pill(c.level, "info")}</div><p class="sm trait">${esc(TRAITS.find((x) => x.id === c.trait)?.label ?? "")}</p><div class="skg">${skill("Speed", c.sk.speed)}${skill("Accuracy", c.sk.acc)}${skill("Reliab.", c.sk.rel)}${skill("Negot.", c.sk.neg)}${skill("Technical", c.sk.tech)}</div><div class="row"><b>${money(c.salary * 100)}/month</b>${btn("Hire", { type: "hireCand", role: c.role, key: c.key }, "pri sm")}</div></div>`).join("") || '<p class="empty">No applicants left this month.</p>'}</div></div>`;
    } };
export const tasks = { id: "tasks", title: "Task Board", icon: "📋", group: "Team", render(s) {
        const w = wfOf(s);
        const fd = ui.q.tkd, fs = ui.q.tks;
        const live = ["pending", "active", "waiting", "approval", "blocked"];
        let list = w.tasks.slice();
        if (fd)
            list = list.filter((t) => t.dept === fd);
        if (fs === "open")
            list = list.filter((t) => live.includes(t.status));
        else if (fs)
            list = list.filter((t) => t.status === fs);
        else
            list = list.filter((t) => live.includes(t.status) || s.day - (t.doneDay ?? 0) <= 6);
        list.sort((a, b) => (live.includes(a.status) ? 0 : 1) - (live.includes(b.status) ? 0 : 1) || b.pri - a.pri || a.due - b.due);
        const overdue = w.tasks.filter((t) => live.includes(t.status) && t.due < s.day).length;
        return `<h1>Task Board</h1><p class="lead">Everything the company is working on. You can open any task to see what the employee did, but you never have to finish one yourself.</p>
<div class="kgrid k4">${kpi("Active", String(w.tasks.filter((t) => t.status === "active").length), "being worked on now", "", "⚡")}${kpi("Pending / waiting", String(w.tasks.filter((t) => t.status === "pending" || t.status === "waiting").length), "queued or waiting for someone", "", "⏳")}${kpi("Completed", String(w.tasks.filter((t) => t.status === "done").length), "", "good", "✅")}${kpi("Overdue", String(overdue), "past their deadline", overdue ? "bad" : "", "🔥")}</div>
<div class="filters">${sel("tkd", DEPTS.map((d) => [d, DEPT_NAME[d]]), "All departments")}${sel("tks", [["open", "Open only"], ["pending", "Pending"], ["active", "Active"], ["waiting", "Waiting"], ["approval", "Needs approval"], ["blocked", "Blocked"], ["done", "Completed"], ["failed", "Failed / cancelled"]], "Open + recent")}<span class="sm">${list.length} shown</span></div>
${table(["Priority", "Task", "Dept", "Assigned", "Status", "Progress", "Next action", "Deadline", ""], list.slice(0, 80).map((t) => [pill(t.pri === 3 ? "URGENT" : t.pri === 2 ? "normal" : "low", t.pri === 3 ? "bad" : t.pri === 2 ? "info" : ""), `<b>${esc(t.title)}</b>`, DEPT_ICON[t.dept] + " " + DEPT_NAME[t.dept], esc(empName(s, t.assignee)) + (t.cover ? ' <span class="sm">(covering)</span>' : ""), pill(t.status, stCls[t.status]), bar(t.total - Math.max(0, t.work), t.total || 1, t.status === "done" ? "ok" : ""), `<span class="sm">${esc(t.next)}</span>`, `<span class="${t.due < s.day && live.includes(t.status) ? "bad" : ""}">${dateStr(t.due)}</span>`, btn("Inspect", { type: "ui", modal: { kind: "task", id: t.id } }, "xs")]))}`;
    } };
export function taskModal(s, id) {
    const t = wfOf(s).tasks.find((x) => x.id === id);
    if (!t)
        return "";
    const eta = t.status === "pending" || t.status === "active" ? `about ${Math.max(1, Math.ceil(t.work / 0.8))} working day(s)` : "—";
    return `<h2>${esc(t.title)}</h2><div class="kgrid k4">${kpi("Department", DEPT_NAME[t.dept])}${kpi("Assigned", esc(empName(s, t.assignee)))}${kpi("Status", t.status)}${kpi("Estimated completion", eta)}</div><p><b>Next action:</b> ${esc(t.next)}</p>${t.apr ? `<p class="panel warn">${t.apr.ok === undefined ? "Waiting for " + t.apr.who.toUpperCase() : t.apr.ok ? "Approved by " + esc(t.apr.by ?? "") : "Rejected"}: ${esc(t.apr.why)}</p>` : ""}<div class="tw short"><table class="tbl"><tbody>${t.log.map((l) => `<tr><td>${esc(l)}</td></tr>`).join("")}</tbody></table></div><div class="row">${t.rfq ? btn("Open RFQ", { type: "ui", rfq: t.rfq, modal: null }, "pri sm") : ""}${btn("Close", { type: "ui", modal: null }, "ghost")}</div>`;
}
export const inbox = { id: "inbox", title: "Inbox & Approvals", icon: "✉️", group: "Team", render(s) {
        const w = wfOf(s), ap = pendingApprovals(s), f = ui.q.inf || "ceo";
        let list = w.msgs.slice();
        if (f === "ceo")
            list = ceoMsgs(s);
        else if (f === "imp")
            list = list.filter((m) => m.imp >= 2);
        return `<h1>Inbox & Approvals</h1><p class="lead">Messages are generated by real events and tasks. Only items at or above your notification level reach the CEO list (change it on the Policies page).</p>
<div class="panel ${ap.length ? "hot" : ""}"><h2>Waiting for your approval (${ap.length})</h2>${ap.length ? table(["Request", "Why you", "Amount", "From", ""], ap.map((t) => [`<b>${esc(t.title)}</b>`, esc(t.apr.why), t.apr.amt ? money(t.apr.amt * 100) : "—", esc(empName(s, t.assignee)), `<div class="row">${btn("Approve", { type: "aprDecide", task: t.id, ok: true }, "pri xs")}${btn("Reject", { type: "aprDecide", task: t.id, ok: false }, "danger xs")}${t.rfq ? btn("Open", { type: "ui", rfq: t.rfq }, "ghost xs") : ""}</div>`])) : `<p class="empty">Nothing needs you. The team is working within its limits.</p>`}</div>
<div class="filters">${sel("inf", [["ceo", "To the CEO"], ["imp", "Important only"], ["all", "All internal messages"]], "").replace('<option value="">', '<option value="" hidden>')}${btn("Mark all read", { type: "markRead" }, "ghost sm")}<span class="sm">${list.length} messages</span></div>
<div class="msgs">${list.slice(0, 80).map((m) => `<div class="msg ${m.imp === 3 ? "m3" : m.imp === 2 ? "m2" : ""} ${m.read || m.to !== "CEO" ? "" : "unread"}"><div class="mh"><b>${esc(m.from)}</b> <span>→ ${esc(m.to)}</span><em>day ${m.day} · ${dateStr(m.day)}</em></div><p>${esc(m.text)}</p>${m.ref?.startsWith("rfq:") ? btn("Open RFQ", { type: "ui", rfq: +m.ref.slice(4) }, "ghost xs") : m.ref?.startsWith("so:") ? btn("Open order", { type: "ui", page: "orders", so: +m.ref.slice(3) }, "ghost xs") : ""}</div>`).join("") || '<p class="empty">No messages yet. Let a few days pass.</p>'}</div>`;
    } };
const num = (label, key, v, hint = "") => `<label class="pf">${label}<input type="number" class="qty" min="0" value="${v}" data-chg='${esc(JSON.stringify({ type: "setPolicy", key }))}' data-key="value" data-n="1">${hint ? `<small>${hint}</small>` : ""}</label>`;
export const policies = { id: "policies", title: "Policies & Authority", icon: "⚖️", group: "Team", render(s) {
        const p = wfOf(s).policy;
        return `<h1>Policies & Authority</h1><p class="lead">The rules your employees follow. They never silently commit the company above these limits. Anything over a limit is sent up to the manager (if you have one) or to you.</p>
<div class="panel"><h2>Pricing</h2><div class="pfg">${num("Standard margin %", "baseMargin", p.baseMargin, "starting point for every quotation")}${num("Minimum margin %", "minMargin", p.minMargin, "never quote or discount below this without you")}</div></div>
<div class="panel"><h2>Discount authority (% off a quotation)</h2><div class="pfg">${["junior", "officer", "senior", "supervisor", "manager"].map((l) => num(l[0].toUpperCase() + l.slice(1), "disc." + l, p.disc[l])).join("")}${num("Manager ceiling %", "mgrDisc", p.mgrDisc, "above this the CEO decides")}</div></div>
<div class="panel"><h2>Spending authority (USD)</h2><div class="pfg">${num("Employee limit", "buyEmp", p.buyEmp, "per purchase or freight decision")}${num("Manager limit", "buyMgr", p.buyMgr, "above this the CEO approves")}${num("Quotation value for CEO", "quoteCeo", p.quoteCeo, "contracts above this need you")}${num("Credit per customer", "creditPerClient", p.creditPerClient, "open orders plus unpaid invoices")}${num("Cash reserve", "cashReserve", p.cashReserve, "finance holds orders that would drop cash below this")}</div><p class="sm">Autonomy per department multiplies these limits: balanced ×1, high ×3, full ×10, low means you approve every key decision.</p></div>
<div class="panel"><h2>Behaviour</h2><div class="pfg"><label class="pf">Freight choice<select data-chg='{"type":"setPolicy","key":"freightPref"}' data-key="value">${["cheapest", "balanced", "fastest"].map((o) => `<option ${p.freightPref === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>
<label class="pf">Notify me about<select data-chg='{"type":"setPolicy","key":"notify"}' data-key="value" data-n="1"><option value="1" ${p.notify === 1 ? "selected" : ""}>everything</option><option value="2" ${p.notify === 2 ? "selected" : ""}>important events</option><option value="3" ${p.notify === 3 ? "selected" : ""}>only problems and approvals</option></select></label>
<label class="pf"><span><input type="checkbox" ${p.urgentCeo ? "checked" : ""} data-chg='{"type":"setPolicy","key":"urgentCeo"}' data-key="value"> Urgent orders always need CEO approval</span></label><label class="pf"><span><input type="checkbox" ${p.negotiate ? "checked" : ""} data-chg='{"type":"setPolicy","key":"negotiate"}' data-key="value"> Procurement may negotiate (slower, usually cheaper)</span></label></div></div>`;
    } };
export const kbPage = { id: "kb", title: "Knowledge Base", icon: "🧠", group: "Team", render(s) {
        const k = wfOf(s).kb;
        const sups = Object.entries(k.sup).sort((a, b) => b[1].asked - a[1].asked).slice(0, 25), lanes = Object.entries(k.freight).sort((a, b) => b[1].n - a[1].n).slice(0, 15), negs = Object.entries(k.neg).sort((a, b) => b[1].tries - a[1].tries).slice(0, 12);
        return `<h1>Knowledge Base</h1><p class="lead">What the company has learned. Procurement uses supplier history and known sources when choosing who to ask, logistics prefers carriers that already worked, and bad experiences count against a supplier next time.</p>
<div class="panel"><h2>Supplier history</h2>${table(["Supplier", "Asked", "Replied", "Chosen", "Late", "Damaged / wrong"], sups.map(([id, v]) => [esc(DB.supplierById[id]?.name ?? id), String(v.asked), String(v.replied), String(v.won), v.late ? `<span class="bad">${v.late}</span>` : "0", v.bad ? `<span class="bad">${v.bad}</span>` : "0"]))}</div>
<div class="panel"><h2>Known sources by part</h2>${table(["Part", "Suppliers that quoted well"], Object.entries(k.cat).slice(0, 15).map(([pid, ids]) => [esc(DB.partsById[pid]?.pn ?? pid), ids.map((i) => esc(DB.supplierById[i]?.name ?? i)).join(", ")]))}</div>
<div class="panel"><h2>Freight history</h2>${table(["Lane / carrier / mode", "Shipments booked", "Average cost", "Average days"], lanes.map(([key, v]) => { const [c, l, m] = key.split("|"); return [`${esc(COUNTRY[c]?.name ?? c)} · ${esc(DB.logiById[l]?.name ?? l)} · ${m}`, String(v.n), money(v.cost), v.days.toFixed(1)]; }))}</div>
<div class="panel"><h2>Negotiation history</h2>${table(["Supplier", "Tries", "Price cuts won"], negs.map(([id, v]) => [esc(DB.supplierById[id]?.name ?? id), String(v.tries), String(v.wins)]))}</div>
<div class="panel"><h2>Lessons learned</h2>${k.lessons.length ? `<ul>${k.lessons.slice(0, 30).map((l) => `<li><span class="sm">day ${l.day}</span> ${esc(l.text)}</li>`).join("")}</ul>` : '<p class="empty">Lessons appear when things go wrong (late or damaged deliveries, customs holds, lost bids).</p>'}</div>`;
    } };
