import { Rng } from "./rng.js";
import { MONTHLY } from "./pricing.js";
import { nid } from "./core.js";
export const WORK_SCALE = 0.6;
export const DEPTS = ["sales", "proc", "logistics", "warehouse", "finance", "quality"];
export const DEPT_NAME = { sales: "Sales", proc: "Procurement", logistics: "Logistics", warehouse: "Warehouse", finance: "Finance", quality: "Quality & Technical" };
export const DEPT_ICON = { sales: "💼", proc: "🛒", logistics: "🚚", warehouse: "📦", finance: "💰", quality: "🔬" };
export const DEPT_OF = { sales: "sales", bd: "sales", proc: "procurement", logistics: "logistics", customs: "logistics", warehouse: "warehouse", finance: "finance", quality: "quality", tech: "quality" };
DEPT_OF.proc = "proc";
export const ROLES_OF = { sales: ["sales", "bd"], proc: ["proc"], logistics: ["logistics", "customs"], warehouse: ["warehouse"], finance: ["finance"], quality: ["quality", "tech"] };
export const ROLE_NAME = { sales: "Sales Executive", bd: "Business Development", proc: "Procurement Officer", logistics: "Logistics Coordinator", customs: "Customs Specialist", warehouse: "Warehouse Operative", finance: "Finance Officer", quality: "Quality Inspector", tech: "Technical Specialist" };
export const LEVELS = ["junior", "officer", "senior", "supervisor", "manager"];
export const LEVEL_MULT = { junior: 0.75, officer: 1, senior: 1.35, supervisor: 1.6, manager: 2 };
export const LEVEL_PROD = { junior: 0.88, officer: 1, senior: 1.1, supervisor: 1.15, manager: 1.2 };
export const PROMO_EXP = { junior: 12, officer: 40, senior: 90, supervisor: 160, manager: 1e9 };
export const TRAITS = [
    { id: "fast", label: "Fast but sometimes inaccurate", d: { speed: 22, acc: -18 }, sal: 1 },
    { id: "tech", label: "Slow, but excellent at technical work", d: { speed: -16, tech: 26, acc: 8 }, sal: 1.05 },
    { id: "neg", label: "Excellent negotiator", d: { neg: 26 }, sal: 1.1 },
    { id: "rel", label: "Very reliable coordinator", d: { rel: 22, acc: 10 }, sal: 1.05 },
    { id: "cust", label: "Strong relationship builder", d: { neg: 12, rel: 16 }, sal: 1.05 },
    { id: "vet", label: "Experienced but expensive", d: { speed: 14, acc: 14, rel: 14, neg: 14, tech: 14 }, sal: 1.45, level: "senior" },
    { id: "jr", label: "Junior who improves over time", d: { speed: -10, acc: -10, rel: -10, neg: -10, tech: -10 }, sal: 0.8, growth: 2.2, level: "junior" },
    { id: "all", label: "Solid all-rounder", d: {}, sal: 1 },
];
const FIRST = ["Ahmed", "Fatima", "Omar", "Layla", "Khalid", "Noor", "Yusuf", "Mariam", "Rashid", "Aisha", "Tariq", "Hana", "Sanjay", "Priya", "Arjun", "Anita", "Wei", "Mei", "Lars", "Elena", "Marco", "Sofia", "Daniel", "Chloe", "Ibrahim", "Salma", "Karim", "Dina", "Rohan", "Neha", "Hamad", "Reem"];
const LAST = ["Al-Thani", "Hassan", "Nair", "Sharma", "Khan", "Haddad", "Ortiz", "Novak", "Chen", "Silva", "Rahman", "Mansour", "Verma", "Petrov", "Costa", "Abbas", "Iyer", "Farouk", "Lindqvist", "Okafor"];
const AVATARS = ["🧑‍💼", "👩‍💼", "👨‍💼", "🧑‍🔧", "👩‍🔧", "👨‍🔧", "🧑‍💻", "👩‍💻", "👨‍💻", "🧑‍🏭"];
export const INDS_SPEC = ["oilgas", "power", "aviation", "medical", "marine", "construction", "mining", "rail", "telecom", "food"];
export const defaultPolicy = () => ({ baseMargin: 14, minMargin: 6, disc: { junior: 3, officer: 5, senior: 10, supervisor: 10, manager: 15 }, mgrDisc: 10, buyEmp: 5000, buyMgr: 25000, quoteCeo: 60000, urgentCeo: false, creditPerClient: 120000, cashReserve: 15000, freightPref: "balanced", notify: 2, negotiate: true, budget: { sales: 3000, proc: 150000, logistics: 12000, warehouse: 6000, finance: 4000, quality: 3000 }, payApprove: true, payLimit: 5000, profitTarget: 8000 });
const emptyKb = () => ({ sup: {}, cat: {}, freight: {}, neg: {}, lessons: [] });
const clamp = (n, a = 5, b = 98) => Math.max(a, Math.min(b, n));
export function salaryFor(role, level, sk, mult = 1) { const avg = (sk.speed + sk.acc + sk.rel + sk.neg + sk.tech) / 5; return Math.round((MONTHLY[role] * 0.55 * LEVEL_MULT[level] * (0.8 + avg / 160) * mult) / 50) * 50; }
export function makeEmp(s, rng, role, opt = {}) {
    const tr = TRAITS.find((x) => x.id === opt.trait) ?? rng.pick(TRAITS);
    const level = opt.level ?? tr.level ?? (rng.chance(0.18) ? "senior" : rng.chance(0.3) ? "junior" : "officer");
    const lv = LEVELS.indexOf(level) * 6;
    const sk = { speed: 50, acc: 50, rel: 50, neg: 50, tech: 50 };
    const key = { sales: ["neg", "rel"], bd: ["neg", "rel"], proc: ["neg", "tech"], logistics: ["acc", "rel"], customs: ["acc", "tech"], warehouse: ["acc", "speed"], finance: ["acc", "rel"], quality: ["tech", "acc"], tech: ["tech", "acc"] };
    for (const k of Object.keys(sk))
        sk[k] = clamp(sk[k] + rng.range(-8, 8) + lv + (key[role].includes(k) ? 8 : 0) + (tr.d[k] ?? 0));
    const first = rng.pick(FIRST), last = rng.pick(LAST);
    return { name: `${first} ${last}`, role, dept: DEPT_OF[role], level, salary: salaryFor(role, level, sk, tr.sal), exp: level === "junior" ? 0 : level === "officer" ? 12 : level === "senior" ? 40 : 90, sk, trait: tr.id, growth: tr.growth ?? 1, spec: rng.shuffle(INDS_SPEC).slice(0, 2), stress: 15, morale: 70, done: 0, hired: s.day, lowMorale: 0, mistakes: 0, avatar: rng.pick(AVATARS) };
}
/** Three applicants per role per month, the same every time you look (seeded). */
export function candidates(s, role) {
    const w = wfOf(s), m = Math.floor(s.day / 30);
    const rng = new Rng(s.seed * 7919 + Object.keys(MONTHLY).indexOf(role) * 131 + m * 17 + 3);
    return [0, 1, 2].map((i) => { const e = makeEmp(s, rng, role); return { ...e, key: `${m}-${role}-${i}` }; }).filter((c) => !w.hiredCand.includes(c.key));
}
export function wfOf(s) {
    if (s.wf) {
        const w0 = s.wf;
        w0.policy = { ...defaultPolicy(), ...w0.policy, budget: { ...defaultPolicy().budget, ...(w0.policy.budget ?? {}) } };
        w0.reports ??= [];
        w0.spend ??= {};
        return w0;
    }
    const w = { on: true, emps: [], tasks: [], msgs: [], autonomy: { sales: "balanced", proc: "balanced", logistics: "balanced", warehouse: "balanced", finance: "balanced", quality: "balanced" }, policy: defaultPolicy(), kb: emptyKb(), hiredCand: [], cap: {}, reports: [], spend: {} };
    s.wf = w;
    const rng = new Rng(s.seed * 31 + 7);
    for (const [role, n] of Object.entries(s.staff))
        for (let i = 0; i < n; i++)
            w.emps.push({ id: nid(s, "emp"), ...makeEmp(s, rng, role, { level: "officer", trait: i === 0 ? "all" : undefined }) });
    return w;
}
export function syncStaff(s) { const w = wfOf(s); for (const k of Object.keys(s.staff))
    s.staff[k] = w.emps.filter((e) => e.role === k).length; }
export const empName = (s, id) => { const e = wfOf(s).emps.find((x) => x.id === id); return e ? e.name : "Unassigned"; };
export const titleOf = (e) => (e.level === "manager" ? `${DEPT_NAME[e.dept]} Manager` : `${e.level === "officer" ? "" : e.level[0].toUpperCase() + e.level.slice(1) + " "}${ROLE_NAME[e.role]}`);
export const managerOf = (s, d) => wfOf(s).emps.find((e) => e.dept === d && e.level === "manager");
export const openTasks = (s) => wfOf(s).tasks.filter((t) => t.status !== "done" && t.status !== "failed");
export const loadOf = (s, e) => wfOf(s).tasks.filter((t) => t.assignee === e.id && (t.status === "pending" || t.status === "active")).reduce((a, t) => a + (t.pri === 3 ? 1.3 : 1), 0);
export const capTasks = (e) => 4.5 + LEVELS.indexOf(e.level) * 0.7 + (e.sk.speed - 50) / 40;
export function say(s, from, to, text, imp = 1, ref) {
    const w = wfOf(s);
    w.msgs.unshift({ id: nid(s, "msg"), day: s.day, from, to, text, imp, ref });
    if (w.msgs.length > 500)
        w.msgs.length = 500;
}
export const lesson = (s, text) => { const k = wfOf(s).kb; if (k.lessons.some((l) => l.text === text))
    return; k.lessons.unshift({ day: s.day, text }); if (k.lessons.length > 120)
    k.lessons.length = 120; };
export function newTask(s, t) {
    const w = wfOf(s);
    const work = Math.round(t.work * WORK_SCALE * 100) / 100;
    const task = { id: nid(s, "task"), assignee: null, status: "pending", pri: 2, created: s.day, total: work, next: "Waiting to be assigned", log: [`Day ${s.day}: created`], ...t, work };
    w.tasks.push(task);
    return task;
}
export const AUTONOMY_TEXT = { low: "Low: staff prepare, you approve nearly everything", balanced: "Balanced: routine work is theirs, bigger money needs approval", high: "High: staff approve up to 3× the limits", full: "Full: only major risks reach you (10× limits)" };
export const AUT_MULT = { low: 0, balanced: 1, high: 3, full: 10 };
