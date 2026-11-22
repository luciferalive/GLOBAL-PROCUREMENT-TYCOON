/** The autonomous company: scans the game for work, creates tasks, assigns them, lets employees work them
 *  over time, and performs the real game actions (the same ones the player has) when a task finishes. */
import { COUNTRY } from "../data/countries.js";
import { CAT } from "../data/lists.js";
import { DB } from "../data/db.js";
import { RULES } from "../data/rules.js";
import { hooks, isOpen, money, news, nid, R } from "./core.js";
import { dispatch } from "./actions.js";
import { FREIGHT_INCLUDED, eligible, freightQuote, landedCost } from "./pricing.js";
import { AUT_MULT, DEPTS, DEPT_NAME, LEVELS, LEVEL_PROD, PROMO_EXP, capTasks, empName, lesson, loadOf, managerOf, newTask, openTasks, say, syncStaff, titleOf, wfOf } from "./staff.js";
const usd = (c) => c / 100;
const who = (e) => `${e.name} (${titleOf(e)})`;
const rfqOf = (s, id) => s.rfqs.find((r) => r.id === id);
const COVER = { sales: [], proc: ["sales"], logistics: ["proc", "warehouse"], warehouse: ["logistics"], finance: ["sales", "proc"], quality: ["warehouse", "proc"] };
const has = (s, kind, ref) => wfOf(s).tasks.some((t) => t.kind === kind && t.ref === ref && t.status !== "done" && t.status !== "failed");
const ever = (s, kind, ref) => wfOf(s).tasks.some((t) => t.kind === kind && t.ref === ref);
const needAuth = (r) => { const c = DB.clientById[r.client]; return !!RULES[c.industry]?.authOnly || c.persona === "oemonly"; };
const noAlt = (r) => { const c = DB.clientById[r.client]; return !!RULES[c.industry]?.noAlt || c.persona === "oemonly"; };
const fullDocs = (r) => !!RULES[DB.clientById[r.client].industry]?.fullDocs;
const log = (t, s, text) => { t.log.push(`Day ${s.day}: ${text}`); if (t.log.length > 14)
    t.log.shift(); };
const toCeo = (s, from, text, imp, ref) => say(s, from, "CEO", text, imp, ref);
/* ---------------- approvals ---------------- */
function gate(s, t, e, amt, key, o = {}) {
    if (t.approved)
        return false;
    const w = wfOf(s), p = w.policy, aut = w.autonomy[t.dept], m = AUT_MULT[aut], mgr = managerOf(s, t.dept);
    let tier = "self", why = "";
    const mgrOk = !!mgr && mgr.id !== e.id && e.level !== "manager";
    const seniorSelf = ["senior", "supervisor", "manager"].includes(e.level);
    if (aut === "low") {
        tier = "ceo";
        why = "Low autonomy: the CEO approves this decision";
    }
    else if (key === "buy") {
        if (amt > p.buyMgr * m) {
            tier = "ceo";
            why = `Purchase ${money(amt * 100)} is above the manager limit`;
        }
        else if (amt > p.buyEmp * m) {
            tier = mgrOk ? "manager" : seniorSelf ? "self" : "ceo";
            why = `Purchase ${money(amt * 100)} is above the employee limit`;
        }
    }
    else if (key === "quote") {
        if (amt > p.quoteCeo * m) {
            tier = "ceo";
            why = `Contract value ${money(amt * 100)} is above the CEO threshold`;
        }
    }
    else if (key === "discount") {
        const lim = p.disc[e.level];
        const d = o.disc ?? 0;
        if (d > lim) {
            if (d <= p.mgrDisc && mgrOk) {
                tier = "manager";
                why = `Discount ${d.toFixed(1)}% is above ${e.level} authority (${lim}%)`;
            }
            else {
                tier = "ceo";
                why = `Discount ${d.toFixed(1)}% is above ${mgrOk || seniorSelf ? "manager" : "staff"} authority`;
            }
        }
    }
    if (o.credit && tier !== "ceo") {
        tier = "ceo";
        why = "Customer credit exposure would exceed the credit limit";
    }
    if (o.urgent && p.urgentCeo && aut !== "full" && tier !== "ceo") {
        tier = "ceo";
        why = "Urgent orders need the CEO (policy)";
    }
    if (tier === "self")
        return false;
    t.status = "approval";
    t.apr = { who: tier, why, amt, asked: s.day };
    t.next = tier === "ceo" ? "Waiting for CEO approval" : `Waiting for ${DEPT_NAME[t.dept]} manager approval`;
    log(t, s, `asked ${tier.toUpperCase()} approval: ${why}`);
    if (tier === "ceo")
        toCeo(s, who(e), `Approval needed: ${t.title}. ${why}.`, 3, t.rfq ? "rfq:" + t.rfq : undefined);
    else
        say(s, who(e), DEPT_NAME[t.dept] + " Manager", `Please approve: ${t.title}. ${why}.`, 1);
    return true;
}
function processApprovals(s) {
    for (const t of wfOf(s).tasks) {
        if (t.status !== "approval" || !t.apr || t.apr.who !== "manager" || s.day <= t.apr.asked)
            continue;
        const mgr = managerOf(s, t.dept);
        if (!mgr) {
            t.apr.who = "ceo";
            toCeo(s, DEPT_NAME[t.dept], `Approval needed: ${t.title} (the manager position is empty).`, 3, t.rfq ? "rfq:" + t.rfq : undefined);
            continue;
        }
        const p = wfOf(s).policy;
        if (t.kind === "sales.reply" && t.data?.margin !== undefined && t.data.margin < p.minMargin) {
            t.apr.who = "ceo";
            t.next = "Escalated to CEO";
            log(t, s, `${mgr.name} escalated: margin below policy`);
            toCeo(s, who(mgr), `Escalation: ${t.title}. Margin would fall below ${p.minMargin}%.`, 3, t.rfq ? "rfq:" + t.rfq : undefined);
            continue;
        }
        t.apr.ok = true;
        t.apr.by = mgr.name;
        t.approved = true;
        t.status = "pending";
        t.work = 0.15;
        t.next = "Approved by manager. Executing";
        log(t, s, `approved by ${mgr.name}`);
        say(s, who(mgr), t.assignee ? empName(s, t.assignee) : DEPT_NAME[t.dept], `Approved: ${t.title}.`, 1);
    }
}
/* ---------------- scanning: turn game state into tasks ---------------- */
function scan(s) {
    const w = wfOf(s);
    for (const r of s.rfqs) {
        if (!isOpen(r))
            continue;
        const wf = (r.wf ??= {});
        if (wf.manual || wf.stage === "declined" || wf.stage === "unsourceable")
            continue;
        const k = "rfq:" + r.id, urgent = r.urgent || r.due - s.day <= 3, pri = urgent ? 3 : 2, due = Math.max(s.day + 1, r.due - 1);
        const base = { rfq: r.id, ref: k, due, pri: pri }, ln = r.lines.length;
        if ((r.status === "new" || r.status === "sourcing") && !wf.reviewed) {
            if (!ever(s, "sales.review", k))
                newTask(s, { ...base, kind: "sales.review", dept: "sales", title: `Review ${r.no} from ${DB.clientById[r.client].name}`, work: 0.4 + 0.1 * ln });
            continue;
        }
        if ((r.status === "new" || r.status === "sourcing") && wf.reviewed && !wf.sourced && !has(s, "proc.source", k)) {
            newTask(s, { ...base, kind: "proc.source", dept: "proc", title: `Source ${r.no}: ask suppliers (${ln} line${ln > 1 ? "s" : ""})`, work: 0.3 + 0.2 * ln });
            continue;
        }
        if (wf.sourced && !wf.picked && !has(s, "proc.compare", k)) {
            const pend = s.quotes.some((q) => q.rfq === r.id && q.status === "pending");
            const lineOk = r.lines.every((_, li) => s.quotes.filter((q) => q.rfq === r.id && q.line === li && q.status === "received").length >= 2);
            if (!pend || s.day > wf.sourced + 8 || (lineOk && s.day >= wf.sourced + 3))
                newTask(s, { ...base, kind: "proc.compare", dept: "proc", title: `Compare quotes and select suppliers for ${r.no}`, work: 0.4 + 0.2 * ln });
            continue;
        }
        if (wf.picked && !wf.freight && !has(s, "log.freight", k)) {
            const l = landedCost(s, r);
            if (l.issues.some((x) => x.startsWith("Choose freight")))
                newTask(s, { ...base, kind: "log.freight", dept: "logistics", title: `Freight quotes and carrier for ${r.no}`, work: 0.4 + 0.15 * ln });
            else
                wf.freight = s.day;
            continue;
        }
        if (wf.freight && !wf.qa && !has(s, "qa.review", k)) {
            const need = r.lines.some((l) => l.certs.length) || fullDocs(r);
            if (need && w.emps.some((e) => e.dept === "quality"))
                newTask(s, { ...base, kind: "qa.review", dept: "quality", title: `Technical and documents check for ${r.no}`, work: 0.5 + 0.1 * ln });
            else
                wf.qa = s.day;
            continue;
        }
        if (wf.qa && ((!wf.quoted && !r.cq && r.status === "sourcing") || (wf.resend && r.status === "negotiating")) && !has(s, "sales.quote", k)) {
            newTask(s, { ...base, kind: "sales.quote", dept: "sales", title: `${wf.resend ? "Revise" : "Prepare"} quotation for ${r.no}`, work: 0.4 + 0.15 * ln });
            continue;
        }
        const cq = r.cq;
        if (cq?.status === "replied" && r.status === "negotiating" && !wf.resend) {
            const kk = `${k}:${cq.round}`;
            if (!ever(s, "sales.reply", kk))
                newTask(s, { ...base, ref: kk, kind: "sales.reply", dept: "sales", title: `Answer ${DB.clientById[r.client].name} on ${r.no}`, work: 0.4, pri: 3, due: s.day + 2 });
        }
        if (cq?.status === "sent" && s.day >= cq.sentDay + 3) {
            const kk = `${k}:${cq.round}`;
            if (!ever(s, "sales.followup", kk))
                newTask(s, { ...base, ref: kk, kind: "sales.followup", dept: "sales", title: `Follow up the quotation for ${r.no}`, work: 0.2, pri: 1, due: s.day + 2 });
        }
    }
    for (const so of s.sos) {
        const r = rfqOf(s, so.rfq), wf = r ? (r.wf ??= {}) : {};
        if (r?.wf?.stage === "po-declined")
            continue;
        if (so.status === "open" && !so.purchased) {
            const k = "so:" + so.id;
            if (!ever(s, "fin.check", k))
                newTask(s, { kind: "fin.check", dept: "finance", title: `Check cash and payment terms for ${so.no}`, so: so.id, rfq: so.rfq, ref: k, work: 0.3, due: s.day + 2, pri: 3 });
            else if (wf.finOk && !ever(s, "proc.po", k))
                newTask(s, { kind: "proc.po", dept: "proc", title: `Place purchase orders for ${so.no}`, so: so.id, rfq: so.rfq, ref: k, work: 0.5, due: s.day + 2, pri: 3 });
        }
        if (so.status === "open" && so.purchased) {
            const have = so.lines.map((l, i) => Math.min(l.qty - l.delivered, s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "ok").reduce((a, x) => a + x.qty, 0)));
            const need = so.lines.reduce((a, l) => a + l.qty - l.delivered, 0), got = have.reduce((a, b) => a + b, 0), partial = r?.opt?.partialOk;
            const k = `so:${so.id}:${so.lines.reduce((a, l) => a + l.delivered, 0)}`;
            if (got > 0 && (got >= need || partial) && !ever(s, "wh.dispatch", k))
                newTask(s, { kind: "wh.dispatch", dept: "warehouse", title: `Pick, pack and dispatch ${so.no}`, so: so.id, ref: k, work: 0.5, due: Math.max(s.day + 1, so.needBy - 3), pri: s.day > so.needBy - 5 ? 3 : 2 });
        }
    }
    for (const sh of s.ships) {
        const k = "sh:" + sh.id;
        if (sh.status !== "delivered" && !ever(s, "log.track", k)) {
            const t = newTask(s, { kind: "log.track", dept: "logistics", title: `Track ${sh.no} and clear customs`, ref: k, work: 0.3, due: sh.arrive + 2, pri: 1, data: { eta: sh.arrive } });
            log(t, s, "shipment booked");
        }
    }
    for (const lot of s.lots)
        if (lot.status === "inspection") {
            const k = "lot:" + lot.id;
            if (!ever(s, "wh.receive", k) && w.emps.some((e) => e.dept === "warehouse" || COVER.warehouse.includes(e.dept))) {
                newTask(s, { kind: "wh.receive", dept: "warehouse", title: `Receive and inspect ${DB.partsById[lot.partId].pn} ×${lot.qty}`, ref: k, work: 0.3 + lot.qty * 0.004, due: s.day + 2, pri: 2, so: lot.so ?? undefined });
                lot.inspectDay = Math.max(lot.inspectDay, s.day + 6);
            }
        }
    for (const inv of s.invoices)
        if (!inv.paid && s.day > inv.due) {
            const k = `inv:${inv.id}:${Math.floor((s.day - inv.due) / 7)}`;
            if (!ever(s, "fin.reminder", k))
                newTask(s, { kind: "fin.reminder", dept: "finance", title: `Payment reminder: ${inv.no} (${DB.clientById[inv.client].name})`, ref: k, work: 0.2, due: s.day + 2, pri: 1, data: { inv: inv.id } });
        }
    const wk = "week:" + Math.floor(s.day / 7);
    if (s.day >= 3 && !ever(s, "fin.forecast", wk))
        newTask(s, { kind: "fin.forecast", dept: "finance", title: "Weekly cash-flow forecast", ref: wk, work: 0.4, due: s.day + 3, pri: 1 });
    const pk = "p:" + Math.floor(s.day / 6);
    if (s.day >= 2 && !ever(s, "sales.prospect", pk))
        newTask(s, { kind: "sales.prospect", dept: "sales", title: "Find and register with new customers", ref: pk, work: 0.5, due: s.day + 5, pri: 1 });
}
/* ---------------- assignment and balancing ---------------- */
function candidatesFor(s, t) {
    const w = wfOf(s);
    const own = w.emps.filter((e) => e.dept === t.dept).map((e) => ({ e, cover: false }));
    if (own.length)
        return own;
    return w.emps.filter((e) => COVER[t.dept].includes(e.dept)).map((e) => ({ e, cover: true }));
}
function assign(s, t) {
    const r = rfqOf(s, t.rfq), cands = candidatesFor(s, t);
    if (!cands.length) {
        t.status = "blocked";
        t.assignee = null;
        t.next = `No ${DEPT_NAME[t.dept]} staff. Hire someone, or handle it yourself`;
        return;
    }
    const ind = r ? DB.clientById[r.client].industry : "";
    const wf = r?.wf;
    const prefer = t.dept === "sales" ? wf?.sales : t.dept === "proc" ? wf?.proc : undefined;
    let best = null, bs = -1e9;
    for (const c of cands) {
        const e = c.e, load = loadOf(s, e), over = load - capTasks(e);
        let sc = -load * 10 - (over > 0 ? over * 12 : 0) + (e.spec.includes(ind) ? 8 : 0) + (e.id === prefer ? 7 : 0) + (c.cover ? -25 : 0);
        if (t.pri === 3 || (r && r.lines.length >= 3))
            sc += LEVELS.indexOf(e.level) * 2 + e.sk.acc / 25;
        if (e.level === "manager")
            sc -= 12; // managers coach and approve; they take work only when needed
        if (sc > bs) {
            bs = sc;
            best = c;
        }
    }
    t.assignee = best.e.id;
    t.cover = best.cover;
    t.status = "pending";
    t.next = best.cover ? `Covered by ${best.e.name} (${DEPT_NAME[best.e.dept]}): not their department, slower` : "Queued";
    log(t, s, `assigned to ${best.e.name}${best.cover ? " (covering)" : ""}`);
    if (r?.wf) {
        if (t.dept === "sales" && !r.wf.sales)
            r.wf.sales = best.e.id;
        if (t.dept === "proc" && !r.wf.proc)
            r.wf.proc = best.e.id;
    }
}
function balance(s) {
    const w = wfOf(s);
    for (const d of DEPTS) {
        const staff = w.emps.filter((e) => e.dept === d);
        if (!staff.length)
            continue;
        const mgr = managerOf(s, d);
        const tot = staff.reduce((a, e) => a + loadOf(s, e), 0), capSum = staff.reduce((a, e) => a + capTasks(e), 0);
        if (mgr && w.autonomy[d] !== "low")
            for (let guard = 0; guard < 3; guard++) {
                const over = staff.filter((e) => loadOf(s, e) > capTasks(e)).sort((a, b) => loadOf(s, b) - loadOf(s, a))[0];
                const free = staff.filter((e) => loadOf(s, e) < capTasks(e) - 1.5).sort((a, b) => loadOf(s, a) - loadOf(s, b))[0];
                if (!over || !free || over.id === free.id)
                    break;
                const mv = w.tasks.filter((t) => t.assignee === over.id && t.status === "pending" && t.work >= t.total - 1e-6).sort((a, b) => a.pri - b.pri)[0];
                if (!mv)
                    break;
                mv.assignee = free.id;
                log(mv, s, `${mgr.name} moved it from ${over.name} to ${free.name}`);
                say(s, who(mgr), DEPT_NAME[d], `${over.name} is overloaded. Moved "${mv.title}" to ${free.name}.`, 1, mv.rfq ? "rfq:" + mv.rfq : undefined);
            }
        const ak = "alert:" + d;
        if (tot > capSum * 1.15 && s.day - (w.cap[ak] ?? -99) >= 10) {
            w.cap[ak] = s.day;
            toCeo(s, DEPT_NAME[d] + (mgr ? " Manager" : ""), `Staffing alert: ${DEPT_NAME[d]} has ${tot.toFixed(0)} open tasks for ${staff.length} ${staff.length > 1 ? "people" : "person"}. Deadlines will slip unless you hire more staff.`, 2);
        }
    }
}
/* ---------------- handlers ---------------- */
function prod(e, cover) { return (0.55 + (e.sk.speed / 100) * 0.9) * (0.75 + e.morale / 400) * (1 - Math.max(0, e.stress - 50) / 200) * LEVEL_PROD[e.level] * (e.level === "manager" ? 0.6 : 1) * (cover ? 0.6 : 1); }
const HANDLERS = {
    "sales.review"(s, t, e) {
        const r = rfqOf(s, t.rfq);
        if (!r || !isOpen(r))
            return "fail";
        const c = DB.clientById[r.client];
        const wf = (r.wf ??= {});
        dispatch(s, { type: "openRfq", id: r.id });
        wf.reviewed = s.day;
        wf.sales = wf.sales ?? e.id;
        const missing = Array.from(new Set(r.lines.flatMap((l) => l.certs))).filter((x) => !s.certs.includes(x));
        const value = r.lines.reduce((a, l) => a + l.ref * l.qty, 0);
        say(s, who(e), DEPT_NAME.proc, `${c.name} needs ${r.lines.length} line(s) within ${r.needDays} days after award${r.urgent ? " (URGENT)" : ""}. Please confirm available suppliers and pricing for ${r.no}.${missing.length ? ` Note: we lack ${missing.join(", ")}.` : ""}`, 1, "rfq:" + r.id);
        if (value > wfOf(s).policy.quoteCeo * 100 * 0.5)
            toCeo(s, who(e), `Big opportunity: ${r.no} from ${c.name}, about ${money(value)} at their reference prices.`, 2, "rfq:" + r.id);
        t.next = "Passed to Procurement";
        return "done";
    },
    "proc.source"(s, t, e, slip) {
        const r = rfqOf(s, t.rfq);
        if (!r)
            return "fail";
        const wf = (r.wf ??= {});
        let sent = 0;
        r.lines.forEach((l, li) => { const n = askSuppliers(s, r, li, e, slip, 0); sent += n; });
        if (!sent) {
            wf.stage = "unsourceable";
            toCeo(s, who(e), `${r.no}: no supplier can be asked for this request (eligibility rules). The RFQ will lapse.`, 2, "rfq:" + r.id);
            t.next = "No eligible suppliers";
            return "fail";
        }
        wf.sourced = s.day;
        wf.proc = wf.proc ?? e.id;
        wf.stage = "sourcing";
        t.next = `Asked ${sent} supplier(s); awaiting replies`;
        say(s, who(e), DEPT_NAME.sales, `Inquiries for ${r.no} sent to ${sent} suppliers. Replies expected within a week.`, 1, "rfq:" + r.id);
        return "done";
    },
    "proc.compare"(s, t, e, slip) {
        const r = rfqOf(s, t.rfq);
        if (!r || !isOpen(r))
            return "fail";
        const wf = (r.wf ??= {}), pol = wfOf(s).policy, kb = wfOf(s).kb;
        const recv = (li) => s.quotes.filter((q) => q.rfq === r.id && q.line === li && q.status === "received" && q.expiry >= s.day);
        for (const q of s.quotes)
            if (q.rfq === r.id && q.status !== "pending") {
                const k = (kb.sup[q.supplier] ??= { asked: 0, replied: 0, won: 0, late: 0, bad: 0 });
                const id = `rep:${q.id}`;
                if (!wfOf(s).cap[id]) {
                    wfOf(s).cap[id] = 1;
                    if (q.status === "received")
                        k.replied++;
                }
            }
        const missing = r.lines.map((_, li) => li).filter((li) => !recv(li).length);
        if (missing.length) { // nothing usable for some line: ask a second batch, then give up
            wf.rounds = (wf.rounds ?? 0) + 1;
            if (wf.rounds > 2) {
                wf.stage = "unsourceable";
                toCeo(s, who(e), `${r.no}: no usable supplier quotation for line ${missing[0] + 1} after ${wf.rounds - 1} rounds. We will let it lapse.`, 2, "rfq:" + r.id);
                lesson(s, `${DB.partsById[r.lines[missing[0]].partId].pn}: no supplier quoted it (${DB.clientById[r.client].name}).`);
                return "fail";
            }
            let n = 0;
            for (const li of missing)
                n += askSuppliers(s, r, li, e, slip, 1);
            wf.sourced = s.day;
            t.next = n ? `Second round: asked ${n} more supplier(s)` : "No more suppliers to ask";
            log(t, s, t.next);
            if (!n) {
                wf.stage = "unsourceable";
                return "fail";
            }
            return "done";
        }
        // optional negotiation round (done by employees with negotiation skill, if the CEO allows it)
        if (!t.data?.phase && pol.negotiate && e.sk.neg >= 45 && !r.urgent && r.due - s.day >= 11) {
            const asked = [];
            let latest = s.day;
            r.lines.forEach((_, li) => { const best = rank(s, r, recv(li), e, false)[0]; if (best && best.round === 0 && best.unit > 0) {
                const pct = Math.min(12, 3 + Math.floor((e.sk.neg - 40) / 8));
                const res = dispatch(s, { type: "negotiateQuote", id: best.id, pct });
                if (res.ok) {
                    asked.push(best.id);
                    (t.data ??= {}).before = { ...(t.data.before ?? {}), [best.id]: best.unit };
                    const nk = (kb.neg[best.supplier] ??= { tries: 0, wins: 0 });
                    nk.tries++;
                    latest = Math.max(latest, best.replyDay);
                }
            } });
            if (asked.length) {
                t.data = { ...(t.data ?? {}), phase: 1, asked };
                t.wake = latest;
                t.next = `Negotiating with ${asked.length} supplier(s)`;
                log(t, s, t.next);
                return "wait";
            }
        }
        for (const id of t.data?.asked ?? []) {
            const q = s.quotes.find((x) => x.id === id);
            const b = t.data?.before?.[id];
            if (q && b && q.unit < b) {
                const nk = kb.neg[q.supplier];
                if (nk && !wfOf(s).cap["nw" + q.id]) {
                    nk.wins++;
                    wfOf(s).cap["nw" + q.id] = 1;
                }
            }
        }
        // build the plan, line by line
        const plan = [];
        let value = 0;
        r.lines.forEach((l, li) => {
            let need = l.qty;
            for (const lot of s.lots.filter((x) => x.partId === l.partId && !x.so && x.status === "ok")) {
                if (need <= 0)
                    break;
                const q = Math.min(need, lot.qty);
                plan.push({ li, lot: lot.id, qty: q });
                need -= q;
            }
            const ranked = rank(s, r, recv(li), e, slip);
            for (const q of ranked) {
                if (need <= 0)
                    break;
                const cap = q.inStock ? Math.min(need, q.qtyAvail) : need;
                if (cap < q.moq)
                    continue;
                plan.push({ li, quote: q.id, qty: cap });
                value += cap * q.unit;
                need -= cap;
            }
        });
        if (r.lines.some((l, li) => plan.filter((p) => p.li === li).reduce((a, p) => a + p.qty, 0) < l.qty)) {
            wf.rounds = (wf.rounds ?? 0) + 1;
            if (wf.rounds <= 2) {
                let n = 0;
                r.lines.forEach((_, li) => { n += askSuppliers(s, r, li, e, slip, 1); });
                wf.sourced = s.day;
                if (n) {
                    t.next = "Quantities not covered: asked more suppliers";
                    return "done";
                }
            }
            wf.stage = "unsourceable";
            toCeo(s, who(e), `${r.no}: suppliers cannot cover the required quantity. We will let it lapse.`, 2, "rfq:" + r.id);
            return "fail";
        }
        if (gate(s, t, e, 0, "buy", { urgent: r.urgent }))
            return "approval"; // a recommendation commits no money: only low autonomy asks the CEO; the purchase order is gated by value
        for (const li of r.lines.keys())
            r.lines[li].alloc = [];
        const names = [];
        for (const p of plan) {
            dispatch(s, p.lot ? { type: "setAlloc", rfq: r.id, line: p.li, lot: p.lot, qty: p.qty } : { type: "setAlloc", rfq: r.id, line: p.li, quote: p.quote, qty: p.qty });
            if (p.quote) {
                const q = s.quotes.find((x) => x.id === p.quote);
                const sp = DB.supplierById[q.supplier];
                names.push(sp.name);
                (kb.sup[sp.id] ??= { asked: 0, replied: 0, won: 0, late: 0, bad: 0 }).won++;
                const arr = (kb.cat[q.partId] ??= []);
                if (!arr.includes(sp.id))
                    arr.unshift(sp.id);
                if (arr.length > 6)
                    arr.pop();
            }
        }
        wf.picked = s.day;
        wf.freight = undefined;
        wf.qa = undefined;
        wf.stage = "picked";
        wf.proc = wf.proc ?? e.id;
        t.next = `Recommended ${Array.from(new Set(names)).join(", ") || "own stock"}`;
        const kg = r.lines.reduce((a, l) => a + l.qty * DB.partsById[l.partId].kg, 0);
        const first = plan.find((p) => p.quote);
        const fsup = first ? DB.supplierById[s.quotes.find((x) => x.id === first.quote).supplier] : null;
        say(s, who(e), DEPT_NAME.sales, `For ${r.no} we recommend ${Array.from(new Set(names)).join(" and ") || "our own stock"}. Landed cost follows once logistics prices the freight.`, 1, "rfq:" + r.id);
        if (fsup && fsup.country !== "QA")
            say(s, who(e), DEPT_NAME.logistics, `Supplier quotation received from ${COUNTRY[fsup.country].name}. Shipment weighs about ${kg.toFixed(0)} kg. Please obtain freight quotations for ${r.no}.`, 1, "rfq:" + r.id);
        toCeo(s, who(e), `Supplier quotations received for ${r.no}. The team recommends ${Array.from(new Set(names)).join(", ") || "own stock"}.`, 1, "rfq:" + r.id);
        return "done";
    },
    "log.freight"(s, t, e, slip) {
        const r = rfqOf(s, t.rfq);
        if (!r || !isOpen(r))
            return "fail";
        const wf = (r.wf ??= {});
        const pol = wfOf(s).policy, kb = wfOf(s).kb;
        const groups = {};
        r.lines.forEach((l) => l.alloc.forEach((a) => { if (a.quote) {
            const q = s.quotes.find((x) => x.id === a.quote);
            if (q)
                (groups[q.supplier] ??= []).push({ q, qty: a.qty });
        } }));
        const picks = [];
        for (const [sid, g] of Object.entries(groups)) {
            const sup = DB.supplierById[sid];
            if (FREIGHT_INCLUDED.has(g[0].q.incoterm) || sup.country === "QA")
                continue;
            const kg = g.reduce((a, x) => a + x.qty * DB.partsById[x.q.partId].kg, 0), vol = g.reduce((a, x) => a + x.qty * DB.partsById[x.q.partId].vol, 0), value = g.reduce((a, x) => a + x.qty * x.q.unit, 0), dg = g.some((x) => CAT[DB.partsById[x.q.partId].cat].dg);
            const opts = [];
            const slack = Math.max(3, r.needDays - Math.max(...g.map((x) => x.q.leadD)) - 2);
            for (const lg of DB.logistics)
                for (const mode of lg.modes) {
                    const fq = freightQuote(s, lg, mode, sup.country, kg, vol, value, true, dg);
                    if (!fq.ok)
                        continue;
                    const cost = fq.cost + fq.ins;
                    const hist = kb.freight[`${sup.country}|${lg.id}|${mode}`];
                    let sc = pol.freightPref === "cheapest" ? cost : pol.freightPref === "fastest" ? fq.days * 1e6 + cost : cost + fq.days * value * 0.004;
                    sc *= 1 + (1 - lg.reliab) * 0.5;
                    if (hist)
                        sc *= 0.97;
                    if (fq.days > slack && pol.freightPref !== "fastest")
                        sc += (fq.days - slack) * value * 0.02 + 1e5;
                    if (r.urgent)
                        sc += fq.days * value * 0.01;
                    opts.push({ logi: lg.id, mode, cost, days: fq.days, sc, name: lg.name });
                }
            if (!opts.length) {
                toCeo(s, who(e), `${r.no}: no carrier can move the cargo from ${COUNTRY[sup.country].name}.`, 2, "rfq:" + r.id);
                return "fail";
            }
            opts.sort((a, b) => a.sc - b.sc);
            const pick = slip && opts[1] ? opts[1] : opts[0];
            const fastest = [...opts].sort((a, b) => a.days - b.days)[0], cheapest = [...opts].sort((a, b) => a.cost - b.cost)[0];
            picks.push({ sid, logi: pick.logi, mode: pick.mode, cost: pick.cost, days: pick.days, alt: `${fastest.name} ${fastest.mode} is fastest (${fastest.days} d, ${money(fastest.cost)}); ${cheapest.name} ${cheapest.mode} is cheapest (${cheapest.days} d, ${money(cheapest.cost)}). Recommendation: ${pick.name} ${pick.mode} (${pick.days} d, ${money(pick.cost)}).` });
        }
        if (gate(s, t, e, usd(picks.reduce((a, p) => a + p.cost, 0)), "buy", { urgent: r.urgent }))
            return "approval";
        for (const p of picks) {
            dispatch(s, { type: "setShip", rfq: r.id, supplier: p.sid, logi: p.logi, mode: p.mode, insure: true });
            const lg = DB.logiById[p.logi], sup = DB.supplierById[p.sid];
            const key = `${sup.country}|${p.logi}|${p.mode}`;
            const h = (kb.freight[key] ??= { n: 0, cost: 0, days: 0 });
            h.n++;
            h.cost = (h.cost * (h.n - 1) + p.cost) / h.n;
            h.days = (h.days * (h.n - 1) + p.days) / h.n;
            say(s, who(e), DEPT_NAME.proc, p.alt, 1, "rfq:" + r.id);
            t.next = `Booked ${lg.name} ${p.mode}`;
        }
        wf.freight = s.day;
        wf.stage = "freight";
        if (!picks.length)
            t.next = "No freight needed";
        return "done";
    },
    "qa.review"(s, t, e) {
        const r = rfqOf(s, t.rfq);
        if (!r || !isOpen(r))
            return "fail";
        const wf = (r.wf ??= {});
        let swapped = 0, flagged = 0;
        r.lines.forEach((l, li) => { for (const a of l.alloc) {
            const q = a.quote ? s.quotes.find((x) => x.id === a.quote) : null;
            if (!q)
                continue;
            if ((fullDocs(r) || l.certs.length) && q.docs !== "full") {
                const alt = s.quotes.filter((x) => x.rfq === r.id && x.line === li && x.status === "received" && x.docs === "full" && x.expiry >= s.day && (!x.inStock || x.qtyAvail >= l.qty) && x.unit <= q.unit * 1.2).sort((x, y) => x.unit - y.unit)[0];
                if (alt) {
                    dispatch(s, { type: "selectQuote", rfq: r.id, line: li, quote: alt.id });
                    swapped++;
                }
                else
                    flagged++;
            }
        } });
        wf.qa = s.day;
        if (swapped) {
            wf.freight = undefined;
            say(s, who(e), DEPT_NAME.proc, `${r.no}: ${swapped} line(s) switched to a supplier with full documentation. Freight must be re-checked.`, 1, "rfq:" + r.id);
        }
        else if (flagged)
            say(s, who(e), DEPT_NAME.sales, `${r.no}: ${flagged} line(s) have incomplete documents and no compliant alternative. The customer may object.`, 1, "rfq:" + r.id);
        else
            say(s, who(e), DEPT_NAME.sales, `${r.no}: technical and document check passed.`, 1, "rfq:" + r.id);
        t.next = swapped ? "Swapped supplier for documents" : flagged ? "Flagged document gaps" : "All good";
        return "done";
    },
    "sales.quote"(s, t, e, slip) {
        const r = rfqOf(s, t.rfq);
        if (!r || !isOpen(r))
            return "fail";
        const wf = (r.wf ??= {});
        const pol = wfOf(s).policy, c = DB.clientById[r.client];
        let land = landedCost(s, r);
        if (land.issues.length) {
            restart(s, r, "the plan has gaps: " + land.issues[0]);
            toCeo(s, who(e), `${r.no}: ${land.issues[0]}. Procurement will redo the sourcing.`, 1, "rfq:" + r.id);
            return "done";
        }
        let m = pol.baseMargin + (c.persona === "price" ? -2 : ["quality", "cert", "oemonly"].includes(c.persona) ? 2 : ["emergency", "delivery"].includes(c.persona) ? 3 : 0) + (r.urgent ? 3 : 0) - (s.rel[c.id] ?? 20 >= 60 ? 1 : 0) - Math.min(3, (r.rivals?.length ?? 0) * 1.2) + (e.sk.neg - 50) / 25 - (slip ? 2 : 0);
        m = Math.round(Math.max(pol.minMargin, Math.min(40, m)) * 10) / 10;
        if (wf.resend)
            m = Math.max(pol.minMargin, (t.data?.m ?? m) - 2);
        const lineVals = r.lines.map((l, i) => land.byLine[i].unit * (1 + m / 100) * l.qty);
        const value = usd(lineVals.reduce((a, b) => a + b, 0));
        const ar = s.invoices.filter((i) => i.client === c.id && !i.paid).reduce((a, i) => a + i.amount, 0) + s.sos.filter((o) => o.client === c.id && ["open", "delivering"].includes(o.status)).reduce((a, o) => a + o.lines.reduce((x, l) => x + l.unit * l.qty, 0), 0);
        if (gate(s, t, e, value, "quote", { credit: usd(ar) + value > pol.creditPerClient * Math.max(1, AUT_MULT[wfOf(s).autonomy.sales] / 3), urgent: r.urgent }))
            return "approval";
        r.lines.forEach((_, i) => dispatch(s, { type: "setMargin", rfq: r.id, line: i, pct: m }));
        dispatch(s, { type: "setCq", rfq: r.id, opt: { termsDays: Math.min(60, c.terms || 30), warrantyM: 12 } });
        const res = dispatch(s, { type: "sendQuote", rfq: r.id });
        if (!res.ok) {
            restart(s, r, res.msg ?? "quote failed");
            toCeo(s, who(e), `${r.no}: could not send the quotation (${res.msg}). Procurement will re-source.`, 1, "rfq:" + r.id);
            return "done";
        }
        wf.quoted = s.day;
        wf.resend = false;
        wf.stage = "quoted";
        t.data = { ...(t.data ?? {}), m };
        t.next = `Quotation sent at ${m}% margin`;
        toCeo(s, who(e), `Quotation sent for ${r.no} to ${c.name}: ${money(lineVals.reduce((a, b) => a + b, 0))} at ${m}% margin.`, 2, "rfq:" + r.id);
        return "done";
    },
    "sales.reply"(s, t, e) {
        const r = rfqOf(s, t.rfq);
        if (!r || !r.cq || r.cq.status !== "replied")
            return "done";
        const resp = r.cq.resp, wf = (r.wf ??= {}), pol = wfOf(s).policy, c = DB.clientById[r.client];
        const avgM = r.lines.reduce((a, l) => a + l.margin, 0) / r.lines.length;
        const walk = (why) => { dispatch(s, { type: "replyCustomer", rfq: r.id, act: "walk" }); wf.stage = "declined"; lesson(s, `${c.name} / ${r.no}: ${resp.msg}`); toCeo(s, who(e), `${r.no} closed: ${why}`, 2, "rfq:" + r.id); t.next = "Declined"; return "done"; };
        if (resp.type === "discount" && resp.discount) {
            const newM = (1 + avgM / 100) * (1 - resp.discount / 100) * 100 - 100;
            (t.data ??= {}).margin = newM;
            if (newM < pol.minMargin && !t.approved) {
                if (wfOf(s).autonomy.sales === "full" || newM < 0)
                    return walk(`the discount of ${resp.discount}% would take the margin to ${newM.toFixed(1)}%, below policy.`);
            }
            if (gate(s, t, e, 0, "discount", { disc: resp.discount }))
                return "approval";
            const res = dispatch(s, { type: "replyCustomer", rfq: r.id, act: "accept_ask" });
            t.next = res.ok ? `Granted ${resp.discount}% discount` : res.msg ?? "failed";
            toCeo(s, who(e), `${c.name} asked for ${resp.discount}% off ${r.no}. Granted (margin now about ${newM.toFixed(1)}%).`, 2, "rfq:" + r.id);
            return "done";
        }
        if (resp.type === "delivery") {
            const res = dispatch(s, { type: "replyCustomer", rfq: r.id, act: "accept_ask" });
            if (res.ok) {
                t.next = `Promised ${resp.days} days`;
                return "done";
            }
            return walk(`we cannot deliver in ${resp.days} days.`);
        }
        if (resp.type === "warranty") {
            dispatch(s, { type: "replyCustomer", rfq: r.id, act: "accept_ask" });
            t.next = "Granted 24-month warranty";
            return "done";
        }
        if (resp.type === "clarify") {
            dispatch(s, { type: "replyCustomer", rfq: r.id, act: "clarify" });
            t.next = "Sent datasheets and certificates";
            return "done";
        }
        if (resp.type === "revise") {
            const src = /authorized|alternative|re-quote|specified item/i.test(resp.msg);
            if ((wf.rounds ?? 0) > 3 || r.cq.round >= 3)
                return walk("too many revision rounds.");
            if (src) {
                wf.rounds = (wf.rounds ?? 0) + 1;
                wf.resend = true;
                restart(s, r, "customer wants an authorized / original source", true);
                t.next = "Re-sourcing from authorized suppliers";
                return "done";
            }
            const cur = avgM;
            if (cur - 2 < pol.minMargin)
                return walk(`we cannot go below our ${pol.minMargin}% minimum margin.`);
            wf.resend = true;
            (t.data ??= {}).m = cur;
            wf.qa = wf.qa ?? s.day;
            t.next = "Revising price";
            return "done";
        }
        return walk(resp.msg);
    },
    "sales.followup"(s, t, e) { const r = rfqOf(s, t.rfq); if (!r?.cq)
        return "done"; const c = DB.clientById[r.client]; s.rel[c.id] = Math.min(100, (s.rel[c.id] ?? 20) + 0.5); if (r.cq.status === "sent" && r.cq.replyDay > s.day + 1 && e.sk.rel >= 55)
        r.cq.replyDay--; say(s, who(e), "Customer", `Follow-up sent to ${c.name} on ${r.no}.`, 1, "rfq:" + r.id); t.next = "Follow-up sent"; return "done"; },
    "sales.prospect"(s, t, e) {
        const reg = Object.entries(s.reg).find(([, g]) => g.stage === 2 && !g.result);
        if (reg && s.cash >= 30000 + wfOf(s).policy.cashReserve * 100) {
            const res = dispatch(s, { type: "submitDocs", id: reg[0] });
            if (res.ok) {
                say(s, who(e), "CEO", `Registration documents submitted to ${DB.clientById[reg[0]].name} ($300 fee).`, 1);
                t.next = "Submitted vendor documents";
                return "done";
            }
        }
        const cand = DB.clients.filter((c) => !s.reg[c.id] && s.industries.includes(c.industry)).sort((a, b) => b.volume * (1 - (a.starter ? 0 : 0)) - a.volume).filter((c) => (c.starter || c.volume < 8e6 + e.sk.neg * 1e5 + (LEVELS.indexOf(e.level) * 2e6)))[0];
        if (!cand) {
            t.next = "No new targets";
            return "done";
        }
        const res = dispatch(s, { type: "contactClient", id: cand.id });
        if (res.ok) {
            say(s, who(e), "CEO", `Contacted ${cand.name}. Waiting for their buyer's reply.`, 1);
            t.next = `Contacted ${cand.name}`;
        }
        return "done";
    },
    "fin.check"(s, t, e) {
        const so = s.sos.find((x) => x.id === t.so);
        const r = so ? rfqOf(s, so.rfq) : undefined;
        if (!so || !r)
            return "fail";
        const pol = wfOf(s).policy;
        let prepay = 0, lc = 0;
        for (const l of r.lines)
            for (const a of l.alloc)
                if (a.quote) {
                    const q = s.quotes.find((x) => x.id === a.quote);
                    if (q?.terms === "prepay")
                        prepay += a.qty * q.unit;
                    if (q?.terms === "lc")
                        lc += a.qty * q.unit;
                }
        const need = prepay + Math.round(lc * 0.1), reserve = pol.cashReserve * 100;
        if (s.cash - need < reserve) {
            t.data = { ...(t.data ?? {}), tries: (t.data?.tries ?? 0) + 1 };
            t.wake = s.day + 2;
            t.next = `Cash short: need ${money(need)} plus reserve ${money(reserve)}, have ${money(s.cash)}`;
            if (t.data.tries === 1 || t.data.tries % 4 === 0) {
                say(s, who(e), DEPT_NAME.proc, `Cash constraint on ${so.no}: prepayments and LC margin need ${money(need)}, we have ${money(s.cash)}. Holding the purchase orders.`, 1, "so:" + so.id);
                toCeo(s, who(e), `Cash is too low to place the purchase orders for ${so.no} (needs ${money(need)}). Take a loan, or delay.`, 3, "so:" + so.id);
            }
            return "wait";
        }
        (r.wf ??= {}).finOk = s.day;
        t.next = need ? `Cash OK. ${money(need)} needed at order` : "No up-front cash needed";
        say(s, who(e), DEPT_NAME.proc, `${so.no}: cash and payment terms checked. Go ahead with purchase orders.`, 1, "so:" + so.id);
        return "done";
    },
    "proc.po"(s, t, e) {
        const so = s.sos.find((x) => x.id === t.so);
        const r = so ? rfqOf(s, so.rfq) : undefined;
        if (!so || !r)
            return "fail";
        if (so.purchased)
            return "done";
        let value = 0;
        for (const l of r.lines)
            for (const a of l.alloc)
                if (a.quote) {
                    const q = s.quotes.find((x) => x.id === a.quote);
                    if (q)
                        value += a.qty * q.unit;
                }
        if (gate(s, t, e, usd(value), "buy", { urgent: r.urgent }))
            return "approval";
        const res = dispatch(s, { type: "placeOrders", so: so.id });
        if (!res.ok) {
            t.data = { ...(t.data ?? {}), tries: (t.data?.tries ?? 0) + 1 };
            t.wake = s.day + 2;
            t.next = res.msg ?? "failed";
            if (t.data.tries === 1)
                toCeo(s, who(e), `${so.no}: cannot place orders yet. ${res.msg}`, 3, "so:" + so.id);
            if (t.data.tries > 8)
                return "fail";
            return "wait";
        }
        t.next = "Purchase orders placed";
        toCeo(s, who(e), `${so.no}: purchase orders placed (${money(value)}). Logistics takes over.`, 2, "so:" + so.id);
        say(s, who(e), DEPT_NAME.logistics, `Purchase orders placed for ${so.no}. Please follow collection and shipment.`, 1, "so:" + so.id);
        return "done";
    },
    "log.track"(s, t, e) {
        const sh = s.ships.find((x) => x.id === +String(t.ref).slice(3));
        if (!sh)
            return "done";
        const d = (t.data ??= {});
        if (sh.status === "delivered" || ["received", "inspected"].includes(s.pos.find((p) => p.id === sh.po)?.status ?? "")) {
            t.next = "Arrived. Handed to Warehouse";
            return "done";
        }
        const po = s.pos.find((p) => p.id === sh.po), so = po ? s.sos.find((x) => x.id === po.so) : undefined;
        if ((sh.status === "held") && !sh.docsOk) {
            const res = dispatch(s, { type: "fixCustomsDocs", ship: sh.id });
            if (res.ok) {
                say(s, who(e), DEPT_NAME.proc, `${sh.no} was held for paperwork. Corrected documents filed ($120).`, 1);
                lesson(s, `${DB.supplierById[po.supplier]?.name ?? "Supplier"} shipped ${sh.no} with weak documents: customs hold.`);
            }
        }
        if ((sh.status === "held" || sh.status === "customs") && so && s.day + (sh.heldUntil - s.day) > so.needBy - 4 && sh.heldUntil > s.day + 1 && !d.expedited) {
            const res = dispatch(s, { type: "expediteCustoms", ship: sh.id });
            if (res.ok) {
                d.expedited = 1;
                toCeo(s, who(e), `${sh.no} would make ${so.no} late. Paid priority customs processing.`, 2);
            }
        }
        if (sh.arrive > (d.eta ?? sh.arrive) && !d.delayNote) {
            d.delayNote = 1;
            if (so)
                say(s, who(e), DEPT_NAME.sales, `${sh.no} for ${so.no} is delayed: new arrival day ${sh.arrive} (promised delivery by day ${so.needBy}).`, 1, "so:" + so.id);
            if (so && sh.arrive + 2 > so.needBy)
                toCeo(s, who(e), `${so.no} is at risk of being late: shipment ${sh.no} now arrives on day ${sh.arrive}.`, 2, "so:" + so.id);
        }
        if (sh.arrive - s.day <= 1 && sh.status === "in_transit" && !d.notified) {
            d.notified = 1;
            say(s, who(e), DEPT_NAME.warehouse, `Shipment ${sh.no} is expected to arrive tomorrow. Please prepare receiving capacity.`, 1);
        }
        t.wake = s.day + 2;
        t.next = `${sh.status.replace("_", " ")}, ETA day ${sh.arrive}`;
        d.eta = Math.max(d.eta ?? 0, sh.arrive);
        return "wait";
    },
    "wh.receive"(s, t, e, slip) {
        const lot = s.lots.find((l) => l.id === String(t.ref).slice(4));
        if (!lot || lot.status !== "inspection")
            return "done";
        dispatch(s, { type: "inspect", id: lot.id });
        const after = s.lots.find((l) => l.id === lot.id);
        const po = s.pos.find((p) => p.id === lot.po);
        const sup = po ? DB.supplierById[po.supplier] : null;
        const kb = wfOf(s).kb;
        if (po && po.delayed > 2 && sup && !wfOf(s).cap["late" + po.id]) {
            wfOf(s).cap["late" + po.id] = 1;
            (kb.sup[sup.id] ??= { asked: 0, replied: 0, won: 0, late: 0, bad: 0 }).late++;
            lesson(s, `${sup.name} delivered ${po.no} ${po.delayed} days late.`);
        }
        if (!after || after.damaged > 0 || lot.damaged > 0) {
            if (sup)
                (kb.sup[sup.id] ??= { asked: 0, replied: 0, won: 0, late: 0, bad: 0 }).bad++;
            const so = lot.so ? s.sos.find((x) => x.id === lot.so) : null;
            toCeo(s, who(e), `Inspection of ${DB.partsById[lot.partId].pn}: ${lot.damaged} unit(s) damaged or non-conforming${so ? ` (affects ${so.no})` : ""}.`, 2);
            say(s, who(e), DEPT_NAME.quality, `Please review the inspection report for lot ${lot.id}: ${lot.damaged} unit(s) damaged. Claim and replacement may be needed.`, 1);
            if (sup)
                lesson(s, `${sup.name}: damaged or wrong goods on ${po?.no}.`);
            t.next = `${lot.damaged} damaged unit(s) recorded`;
        }
        else {
            t.next = "Inspection passed. Stock recorded";
            const so = lot.so ? s.sos.find((x) => x.id === lot.so) : null;
            say(s, who(e), DEPT_NAME.sales, `Items for ${so?.no ?? "stock"} have been inspected and are ready for dispatch.`, 1, so ? "so:" + so.id : undefined);
        }
        return "done";
    },
    "wh.dispatch"(s, t, e) {
        const so = s.sos.find((x) => x.id === t.so);
        if (!so || so.status !== "open")
            return "done";
        const res = dispatch(s, { type: "deliver", id: so.id });
        if (!res.ok) {
            t.data = { ...(t.data ?? {}), tries: (t.data?.tries ?? 0) + 1 };
            t.wake = s.day + 1;
            t.next = res.msg ?? "waiting";
            if (t.data.tries === 2)
                toCeo(s, who(e), `${so.no} cannot be dispatched: ${res.msg}`, 2, "so:" + so.id);
            return t.data.tries > 12 ? "fail" : "wait";
        }
        t.next = "Dispatched to customer";
        say(s, who(e), DEPT_NAME.sales, `${so.no} picked, packed and dispatched. Delivery note issued.`, 1, "so:" + so.id);
        return "done";
    },
    "fin.reminder"(s, t, e) {
        const inv = s.invoices.find((i) => i.id === t.data?.inv);
        if (!inv || inv.paid)
            return "done";
        const c = DB.clientById[inv.client];
        const late = s.day - inv.due;
        if (e.sk.rel + e.sk.acc > 90 && inv.payDay > s.day + 2)
            inv.payDay -= Math.min(3, inv.payDay - s.day - 1);
        say(s, who(e), DEPT_NAME.sales, `${c.name} is ${late} days past due on ${inv.no} (${money(inv.amount)}). Reminder sent.`, late > 10 ? 2 : 1, "inv:" + inv.id);
        if (late >= 8)
            toCeo(s, who(e), `Invoice ${inv.no} is overdue by ${late} days (${money(inv.amount)}) from ${c.name}.`, 2);
        t.next = "Reminder sent";
        return "done";
    },
    "fin.forecast"(s, t, e) {
        const in14 = s.invoices.filter((i) => !i.paid && i.payDay <= s.day + 14).reduce((a, i) => a + i.amount, 0), out14 = s.payables.filter((p) => !p.paid && p.kind !== "claim" && p.due <= s.day + 14).reduce((a, p) => a + p.amount, 0) + s.sos.filter((o) => o.status === "open" && !o.purchased).length * 0;
        const over = s.invoices.filter((i) => !i.paid && s.day > i.due).length, proj = s.cash + in14 - out14, reserve = wfOf(s).policy.cashReserve * 100;
        t.next = `Next 14 days: +${money(in14)} in, -${money(out14)} out`;
        if (proj < reserve)
            toCeo(s, who(e), `Cash-flow warning: projected cash in 14 days is ${money(proj)}, below the ${money(reserve)} reserve. Consider a loan or slowing purchases.`, 3);
        else
            toCeo(s, who(e), `Weekly forecast: ${money(s.cash)} now, ${money(proj)} projected in 14 days.${over ? ` ${over} invoice(s) overdue.` : ""}`, over ? 2 : 1);
        return "done";
    },
};
function restart(s, r, why, keepCq = false) { const wf = (r.wf ??= {}); wf.sourced = undefined; wf.picked = undefined; wf.freight = undefined; wf.qa = undefined; if (!keepCq)
    wf.quoted = undefined; r.lines.forEach((l) => (l.alloc = [])); wf.rounds = (wf.rounds ?? 0) + (keepCq ? 0 : 1); if (wf.rounds > 3) {
    wf.stage = "unsourceable";
    return;
} wf.stage = "re-sourcing"; for (const q of s.quotes)
    if (q.rfq === r.id && q.status === "received" && q.expiry < s.day)
        q.status = "expired"; wfOf(s).kb.lessons.length; void why; }
function rank(s, r, qs, e, slip) {
    const kb = wfOf(s).kb;
    const rules = RULES[DB.clientById[r.client].industry];
    const out = qs.map((q) => {
        const sup = DB.supplierById[q.supplier];
        let pen = 0;
        const slack = r.needDays - (q.leadD + (sup.country === "QA" ? 2 : 9));
        if (slack < 0)
            pen += Math.min(0.5, -slack * 0.03) * (r.urgent ? 1.5 : 1);
        pen += { prepay: 0.03, net30: -0.01, net60: -0.025, lc: 0.01 }[q.terms];
        pen += (1 - sup.reliab) * 0.4 + (kb.sup[sup.id]?.late ?? 0) * 0.03 + (kb.sup[sup.id]?.bad ?? 0) * 0.05 + (q.inStock ? 0 : 0.02);
        if ((rules?.fullDocs || r.lines.some((l) => l.certs.length)) && q.docs !== "full")
            pen += e.sk.tech >= 40 ? 0.35 : 0.15;
        if (needAuth(r) && !sup.auth && sup.type !== "oem")
            pen += 1;
        if (noAlt(r) && q.alt)
            pen += 1;
        pen += (s.supStats?.[sup.id]?.orders ?? 0) > 2 ? -0.01 : 0;
        return { q, sc: q.unit * (1 + pen) };
    }).sort((a, b) => a.sc - b.sc).map((x) => x.q);
    if (slip && out.length > 1)
        [out[0], out[1]] = [out[1], out[0]];
    return out;
}
function askSuppliers(s, r, li, e, slip, round) {
    const l = r.lines[li], part = DB.partsById[l.partId], kb = wfOf(s).kb;
    const busy = {};
    for (const q of s.quotes)
        if (q.rfq !== r.id && (q.status === "pending" || q.status === "received"))
            busy[q.supplier] = (busy[q.supplier] ?? 0) + 1;
    const already = new Set(s.quotes.filter((q) => q.rfq === r.id && q.line === li && ["pending", "received", "ordered"].includes(q.status)).map((q) => q.supplier));
    const rnd = new SRngLite(s.day * 977 + r.id * 31 + li * 7 + e.id);
    const cands = eligible(s, part).filter((x) => !already.has(x.sup.id) && (!needAuth(r) || x.sup.auth || x.sup.type === "oem") && (!noAlt(r) || !x.alt)).map((x) => { const k = kb.sup[x.sup.id]; const sc = x.sup.reliab * 30 + (x.sup.auth ? 8 : 0) * (e.sk.tech / 50) + (x.sup.type === "oem" ? 4 : 0) + (1.25 - x.sup.priceF) * 40 * (e.sk.neg / 50) - x.sup.leadD * 0.25 - x.sup.risk * 20 + (kb.cat[part.id]?.includes(x.sup.id) ? 10 : 0) - (k ? k.late * 3 + k.bad * 5 : 0) - Math.min(9, (busy[x.sup.id] ?? 0) * 3) + rnd.next() * (6 + (slip ? 10 : 0)) * (1.3 - e.sk.acc / 100); return { x, sc }; }).sort((a, b) => b.sc - a.sc);
    const n = Math.min(5, (round ? 4 : 3) + (e.sk.neg > 60 ? 1 : 0) + (r.urgent ? 1 : 0));
    const pick = cands.slice(0, n).map((c) => c.x.sup.id);
    const cheap = cands.find((c) => !pick.includes(c.x.sup.id) && c.x.sup.priceF <= 0.95 && c.x.sup.type !== "oem");
    if (cheap && pick.length >= 3)
        pick[pick.length - 1] = cheap.x.sup.id;
    if (!pick.length)
        return 0;
    const res = dispatch(s, { type: "requestQuotes", rfq: r.id, line: li, suppliers: pick });
    if (!res.ok)
        return 0;
    for (const id of pick)
        (kb.sup[id] ??= { asked: 0, replied: 0, won: 0, late: 0, bad: 0 }).asked++;
    return pick.length;
}
class SRngLite {
    a;
    constructor(a) {
        this.a = a;
    }
    next() { this.a = (this.a + 0x6d2b79f5) >>> 0; let t = this.a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
}
/* ---------------- the daily scheduler ---------------- */
export function workforceDay(s) {
    if (s.flags.noTeam)
        return;
    const w = wfOf(s);
    syncStaff(s);
    if (!w.on)
        return;
    const rng = R(s);
    for (const t of w.tasks)
        if ((t.status === "waiting" || t.status === "blocked") && (t.wake ?? 0) <= s.day && (t.status === "waiting" || !t.assignee)) {
            t.status = "pending";
            if (t.status === "pending" && t.assignee === null)
                t.next = "Queued";
            if (t.kind !== "log.track")
                t.work = Math.max(t.work, 0.3);
            else
                t.work = 0.15;
        }
    scan(s);
    processApprovals(s);
    for (const t of w.tasks)
        if (t.status === "pending" && (t.assignee === null || !w.emps.some((e) => e.id === t.assignee))) {
            t.assignee = null;
            assign(s, t);
        }
    balance(s);
    const RANK = { "sales.reply": 0, "sales.quote": 1, "log.freight": 2, "qa.review": 3, "proc.compare": 4, "proc.source": 6, "sales.review": 5 };
    const order = (a, b) => b.pri - a.pri || (RANK[a.kind] ?? 3) - (RANK[b.kind] ?? 3) || a.due - b.due || a.id - b.id;
    for (const e of w.emps.slice()) {
        if (!w.emps.includes(e))
            continue;
        const mine = w.tasks.filter((t) => t.assignee === e.id && (t.status === "pending" || t.status === "active")).sort(order);
        const load = loadOf(s, e), ratio = load / capTasks(e);
        const speedMult = ratio <= 1 ? 1 : 1 / Math.pow(ratio, 0.7);
        let cap = prod(e, false) * speedMult;
        for (const t of mine) {
            if (cap <= 0.001)
                break;
            const k = prod(e, !!t.cover) / Math.max(0.01, prod(e, false));
            const spend = Math.min(cap, t.work / Math.max(0.2, k));
            t.work -= spend * k;
            cap -= spend;
            t.status = "active";
            t.next = t.next === "Queued" ? "Working on it" : t.next;
            if (t.work > 1e-6)
                continue;
            const slipP = (1 - e.sk.acc / 100) * 0.35 + Math.max(0, e.stress - 60) / 300 + (t.cover ? 0.08 : 0);
            const slip = rng.chance(slipP);
            if (slip) {
                e.mistakes++;
                if (rng.chance(0.5)) {
                    t.work = 0.25;
                    t.status = "pending";
                    log(t, s, `${e.name} made a mistake and redid part of the work`);
                    t.next = "Redoing part of the work";
                    continue;
                }
            }
            let out;
            try {
                out = HANDLERS[t.kind](s, t, e, slip);
            }
            catch (err) {
                out = "fail";
                log(t, s, "error: " + err.message);
            }
            if (out === "done") {
                t.status = "done";
                t.doneDay = s.day;
                t.work = 0;
                log(t, s, `done: ${t.next}`);
                e.done++;
                e.exp += 1;
                e.morale = Math.min(100, e.morale + 0.4);
                const key = { "sales.quote": "neg", "sales.reply": "neg", "proc.compare": "neg", "proc.source": "tech", "log.freight": "acc", "qa.review": "tech", "wh.receive": "acc", "fin.check": "acc" }[t.kind] ?? "speed";
                e.sk[key] = Math.min(95, e.sk[key] + 0.12 * e.growth);
                e.sk.speed = Math.min(95, e.sk.speed + 0.04 * e.growth);
            }
            else if (out === "wait") {
                t.status = "waiting";
                t.wake = t.wake ?? s.day + 1;
                t.work = 0.15;
            }
            else if (out === "approval") { /* gate() already set the status */ }
            else if (out === "fail") {
                t.status = "failed";
                t.doneDay = s.day;
                log(t, s, `failed: ${t.next}`);
            }
            else {
                t.status = "blocked";
            }
        }
        // stress, morale, learning, promotion hints, resignation
        const tgt = Math.min(100, 20 + 42 * ratio);
        e.stress += (tgt - e.stress) * 0.15;
        e.stress = Math.max(5, Math.min(100, e.stress));
        e.morale += e.stress > 70 ? -0.9 : e.stress < 40 ? 0.35 : -0.1;
        e.morale = Math.max(0, Math.min(100, e.morale));
        e.lowMorale = e.morale < 15 ? e.lowMorale + 1 : 0;
        if (e.exp >= PROMO_EXP[e.level] && !w.cap[`promo:${e.id}:${e.level}`]) {
            w.cap[`promo:${e.id}:${e.level}`] = 1;
            toCeo(s, DEPT_NAME[e.dept], `${e.name} has completed ${e.exp} tasks and is ready for promotion to ${LEVELS[LEVELS.indexOf(e.level) + 1]}.`, 2);
        }
        if (e.lowMorale > 12) {
            w.emps = w.emps.filter((x) => x.id !== e.id);
            for (const t of w.tasks)
                if (t.assignee === e.id) {
                    t.assignee = null;
                    if (t.status === "active")
                        t.status = "pending";
                }
            toCeo(s, DEPT_NAME[e.dept], `${e.name} has resigned after months of stress and low morale. Their open tasks were redistributed.`, 3);
            syncStaff(s);
        }
    }
    // tidy: overdue marks and old finished tasks
    for (const t of w.tasks)
        if ((t.status === "pending" || t.status === "active") && t.due < s.day && !t.log.some((x) => x.includes("overdue"))) {
            log(t, s, "overdue");
        }
    if (w.tasks.length > 700)
        w.tasks = w.tasks.filter((t) => t.status !== "done" && t.status !== "failed" || s.day - (t.doneDay ?? 0) < 25);
    for (const t of w.tasks)
        if ((t.status === "pending" || t.status === "active" || t.status === "waiting" || t.status === "blocked" || t.status === "approval") && t.rfq) {
            const r = rfqOf(s, t.rfq);
            if (r && !isOpen(r) && !["awarded"].includes(r.status) && t.kind !== "log.track" && !t.so) {
                t.status = "failed";
                t.next = "RFQ closed";
                t.doneDay = s.day;
            }
        }
    void news;
    void nid;
    void openTasks;
}
hooks.day = workforceDay;
/* ---------------- CEO actions ---------------- */
import { candidates, makeEmp, salaryFor, ROLE_NAME } from "./staff.js";
import { Rng } from "./rng.js";
import { cashOut, plOf } from "./core.js";
const ok = (msg) => ({ ok: true, msg }), bad = (msg) => ({ ok: false, msg });
export function workforceAction(s, a) {
    const w = wfOf(s);
    switch (a.type) {
        case "hireCand": {
            const role = a.role;
            const c = candidates(s, role).find((x) => x.key === a.key);
            if (!c)
                return bad("That applicant is no longer available.");
            if (w.emps.filter((e) => e.role === role).length >= 8)
                return bad("This role already has 8 people.");
            const fee = Math.round(c.salary * 100);
            if (s.cash < fee)
                return bad("Not enough cash for the hiring fee (one month's salary).");
            cashOut(s, "salaries", `Hiring fee: ${c.name}`, fee);
            plOf(s).salaries += fee;
            const { key, ...emp } = c;
            w.hiredCand.push(key);
            w.emps.push({ id: nid(s, "emp"), ...emp, hired: s.day });
            syncStaff(s);
            say(s, "HR", "CEO", `${c.name} joined as ${ROLE_NAME[role]} (${c.level}). They start picking up tasks today.`, 1);
            return ok(`${c.name} hired. Tasks will be assigned to them automatically.`);
        }
        case "fireEmp": {
            const e = w.emps.find((x) => x.id === a.id);
            if (!e)
                return bad("No such employee.");
            const sev = Math.round(e.salary * 50);
            if (s.cash < sev)
                return bad("Not enough cash for severance.");
            cashOut(s, "salaries", `Severance: ${e.name}`, sev);
            w.emps = w.emps.filter((x) => x.id !== e.id);
            for (const t of w.tasks)
                if (t.assignee === e.id) {
                    t.assignee = null;
                    if (t.status === "active")
                        t.status = "pending";
                }
            for (const x of w.emps)
                if (x.dept === e.dept)
                    x.morale = Math.max(0, x.morale - 6);
            syncStaff(s);
            return ok(`${e.name} released. Their open tasks go back to the team.`);
        }
        case "promote": {
            const e = w.emps.find((x) => x.id === a.id);
            if (!e)
                return bad("No such employee.");
            const i = LEVELS.indexOf(e.level);
            if (i >= 4)
                return bad("Already a manager.");
            const next = LEVELS[i + 1];
            if (next === "manager" && managerOf(s, e.dept))
                return bad(`${DEPT_NAME[e.dept]} already has a manager.`);
            e.level = next;
            for (const k of Object.keys(e.sk))
                e.sk[k] = Math.min(95, e.sk[k] + 4);
            e.salary = salaryFor(e.role, next, e.sk, 1.05);
            e.morale = Math.min(100, e.morale + 15);
            say(s, "HR", DEPT_NAME[e.dept], `${e.name} was promoted to ${titleOf(e)}. Higher authority, skills and salary.`, 1);
            return ok(`${e.name} is now ${titleOf(e)}.`);
        }
        case "raise": {
            const e = w.emps.find((x) => x.id === a.id);
            if (!e)
                return bad("No such employee.");
            e.salary = Math.round((e.salary * 1.08) / 50) * 50;
            e.morale = Math.min(100, e.morale + 12);
            return ok(`${e.name} gets an 8% raise. Morale improves.`);
        }
        case "setAutonomy": {
            w.autonomy[a.dept] = a.level;
            return ok();
        }
        case "setPolicy": {
            const p = w.policy;
            const v = a.value;
            if (a.key.startsWith("disc."))
                p.disc[a.key.slice(5)] = +v;
            else
                p[a.key] = typeof p[a.key] === "boolean" ? !!v : typeof p[a.key] === "number" ? +v : v;
            return ok();
        }
        case "autopilot":
            w.on = !!a.on;
            return ok(w.on ? "Your team is working again." : "Autopilot off. Nobody picks up new work until you switch it back on.");
        case "rfqManual": {
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            const wf = (r.wf ??= {});
            wf.manual = !!a.on;
            if (!a.on) {
                wf.stage = undefined;
                for (const t of w.tasks)
                    if (t.rfq === r.id && (t.status === "pending" || t.status === "waiting"))
                        t.status = "pending";
            }
            for (const t of w.tasks)
                if (a.on && t.rfq === r.id && !t.so && t.kind !== "log.track" && ["pending", "active", "waiting", "approval", "blocked"].includes(t.status)) {
                    t.status = "failed";
                    t.next = "Taken over by the CEO";
                }
            return ok(a.on ? "You took over this RFQ. The team will not touch it." : "Handed back to the team.");
        }
        case "aprDecide": {
            const t = w.tasks.find((x) => x.id === a.task);
            if (!t || t.status !== "approval" || !t.apr)
                return bad("Nothing to approve.");
            if (a.ok) {
                t.apr.ok = true;
                t.apr.by = "CEO";
                t.approved = true;
                t.status = "pending";
                t.work = 0.15;
                t.next = "Approved by CEO";
                log(t, s, "approved by the CEO");
                return ok("Approved. The team continues.");
            }
            t.apr.ok = false;
            t.status = "failed";
            t.doneDay = s.day;
            t.next = "Rejected by the CEO";
            log(t, s, "rejected by the CEO");
            const r = rfqOf(s, t.rfq);
            if (r) {
                (r.wf ??= {}).stage = t.kind === "proc.po" ? "po-declined" : "declined";
            }
            if (t.kind === "sales.reply" && r?.cq?.status === "replied")
                dispatch(s, { type: "replyCustomer", rfq: r.id, act: "walk" });
            return ok("Rejected. The team stops working on this item.");
        }
        case "markRead": {
            for (const m of w.msgs)
                m.read = true;
            return ok();
        }
        case "assignTask": {
            const t = w.tasks.find((x) => x.id === a.task);
            const e = w.emps.find((x) => x.id === a.emp);
            if (!t || !e)
                return bad("No such task.");
            t.assignee = e.id;
            t.cover = e.dept !== t.dept;
            if (t.status === "blocked")
                t.status = "pending";
            log(t, s, `CEO assigned it to ${e.name}`);
            return ok();
        }
    }
    void makeEmp;
    void Rng;
    return null;
}
