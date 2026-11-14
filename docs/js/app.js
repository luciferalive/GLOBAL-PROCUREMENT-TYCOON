import { COUNTRY } from "./data/countries.js";
import { DB } from "./data/db.js";
import { createGame, dateStr, money, netWorth, stepDay } from "./engine/core.js";
import { dispatch } from "./engine/actions.js";
import { eligible } from "./engine/pricing.js";
import { TRAINING } from "./engine/missions.js";
import { $, btn, esc, flag, morph, pill } from "./ui/dom.js";
import { ui } from "./ui/state.js";
import { docHtml } from "./ui/docs.js";
import { dashboard, partLine, rfqs } from "./ui/pages1.js";
import { finance, orders, shipments, warehouse } from "./ui/pages2.js";
import { company, customers, documents, industries, logisticsPage, newsPage, settings, suppliers, training } from "./ui/pages3.js";
const PAGES = [dashboard, rfqs, orders, shipments, warehouse, suppliers, customers, logisticsPage, industries, company, finance, documents, training, newsPage, settings];
const GROUPS = ["Operations", "Network", "Company", "Help"];
let S = createGame();
S.paused = true;
let toastMsg = "", toastBad = false, toastT = 0;
const root = $("#app");
function toast(msg, bad = false) { toastMsg = msg; toastBad = bad; clearTimeout(toastT); toastT = window.setTimeout(() => { toastMsg = ""; render(); }, 4200); }
/* ---------- saves (IndexedDB) ---------- */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open("gpt-saves", 1); r.onupgradeneeded = () => r.result.createObjectStore("saves"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function putSave(slot) { try {
    const d = await idb();
    await new Promise((res, rej) => { const t = d.transaction("saves", "readwrite"); t.objectStore("saves").put({ at: Date.now(), day: S.day, name: S.name, nw: netWorth(S).total, state: S }, slot); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    return true;
}
catch {
    return false;
} }
async function getSave(slot) { try {
    const d = await idb();
    return await new Promise((res, rej) => { const r = d.transaction("saves").objectStore("saves").get(slot); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
catch {
    return undefined;
} }
async function slotList() {
    const out = [];
    for (const k of ["auto", "1", "2", "3", "4", "5"]) {
        const v = await getSave(k);
        out.push(`<div class="slot ${v ? "" : "empty"}"><b>${k === "auto" ? "Autosave" : "Slot " + k}</b>${v ? `<span>${esc(v.name)} · day ${v.day} · net worth ${money(v.nw)}</span><small>${new Date(v.at).toLocaleString()}</small>` : "<span>empty</span>"}</div>`);
    }
    const h = $("#slots");
    if (h)
        h.innerHTML = out.join("");
}
/* ---------- actions ---------- */
function applyUi(a) {
    if ("page" in a) {
        ui.page = a.page;
        if (a.page !== "rfqs")
            ui.rfq = a.rfq ?? ui.rfq;
    }
    if ("rfq" in a) {
        ui.rfq = a.rfq;
        if (a.rfq !== null)
            ui.page = "rfqs";
    }
    if ("so" in a) {
        ui.so = a.so;
        if (a.so !== null && !("page" in a))
            ui.page = "orders";
    }
    if ("modal" in a)
        ui.modal = a.modal;
    if ("guide" in a)
        ui.guide = a.guide;
    if (a.q)
        Object.assign(ui.q, a.q);
    if (a.print) {
        const w = window.open("", "_blank");
        if (w) {
            w.document.write(`<html><head><title>Document</title><link rel="stylesheet" href="style.css"></head><body class="printbody">${docHtml(S, a.print)}</body></html>`);
            w.document.close();
            setTimeout(() => w.print(), 400);
        }
    }
    if (a.saveDoc) {
        const blob = new Blob([`<html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body class="printbody">${docHtml(S, a.saveDoc)}</body></html>`], { type: "text/html" });
        const l = document.createElement("a");
        l.href = URL.createObjectURL(blob);
        l.download = a.saveDoc.replace(":", "-") + ".html";
        l.click();
    }
    if (a.save)
        putSave(a.save).then((ok) => { toast(ok ? `Saved to slot ${a.save}.` : "Could not save (browser storage blocked).", !ok); render(); slotList(); });
    if (a.load)
        getSave(a.load).then((v) => { if (!v)
            return toast("That slot is empty.", true); S = v.state; S.paused = true; ui.rfq = null; ui.so = null; ui.modal = null; toast(`Loaded ${a.load === "auto" ? "autosave" : "slot " + a.load}.`); render(); });
}
function run(a) {
    if (a.type === "ui") {
        applyUi(a);
        render();
        return;
    }
    if (a.type === "newgame") {
        S = createGame({ name: a.name || "Gulf Star Trading", difficulty: a.difficulty });
        S.paused = true;
        ui.page = "dashboard";
        ui.rfq = null;
        ui.so = null;
        ui.modal = null;
        ui.guide = true;
        toast("New game started. Follow the training banner!");
        render();
        return;
    }
    const r = dispatch(S, a);
    if (a.ui)
        applyUi({ type: "ui", ...a.ui });
    if (a.type === "requestQuotes" || a.type === "autoQuotes" || a.type === "negotiateQuote" || a.type === "negotiateTerms")
        ui.modal = null;
    if (r.msg)
        toast(r.msg, !r.ok);
    else if (!r.ok)
        toast("That did not work.", true);
    render();
}
document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) {
        if (e.target.classList?.contains("overlay")) {
            ui.modal = null;
            render();
        }
        return;
    }
    let a = JSON.parse(t.getAttribute("data-act"));
    const f = t.getAttribute("data-form");
    if (f) {
        const h = $(f);
        h?.querySelectorAll("[data-f]").forEach((i) => { a[i.dataset.f] = i.type === "number" ? +i.value : i.value; });
    }
    const sup = t.getAttribute("data-collect");
    if (sup)
        a.suppliers = Array.from(document.querySelectorAll(".modal input[data-sup]:checked")).map((i) => i.dataset.sup);
    const pc = t.getAttribute("data-pct");
    if (pc)
        a.pct = +($(pc).value);
    run(a);
});
function onChange(e) {
    const el = e.target;
    if (!el.dataset)
        return;
    if (el.dataset.chg) {
        const a = JSON.parse(el.dataset.chg);
        const v = el.type === "checkbox" ? el.checked : el.dataset.n ? +el.value : el.value;
        if (el.dataset.opt)
            a.opt = { [el.dataset.key]: v };
        else if (el.dataset.key)
            a[el.dataset.key] = v;
        run(a);
        return;
    }
    if (el.dataset.ui) {
        ui.q[el.dataset.ui] = el.value;
        render();
    }
}
document.addEventListener("change", onChange);
document.addEventListener("input", (e) => { const el = e.target; if (el.dataset?.ui && (el.type === "search" || el.type === "number")) {
    ui.q[el.dataset.ui] = el.value;
    render();
} });
/* ---------- modals ---------- */
function modal() {
    const m = ui.modal;
    if (!m)
        return "";
    let body = "";
    if (m.kind === "suppliers") {
        const r = S.rfqs.find((x) => x.id === m.rfq);
        const l = r?.lines[m.line];
        if (!r || !l)
            return "";
        const part = DB.partsById[l.partId];
        const el = eligible(S, part);
        body = `<h2>Choose suppliers to ask</h2><p class="sm">${partLine(l.partId)}</p><div class="tw short"><table class="tbl"><tbody>${el.slice(0, 60).map((e) => `<tr><td><input type="checkbox" data-sup="${e.sup.id}"></td><td><b>${esc(e.sup.name)}</b>${e.alt ? " " + pill("alternative", "warn") : ""}</td><td>${flag(e.sup.country)} ${esc(COUNTRY[e.sup.country].name)}</td><td>${pill(e.sup.type, e.sup.type === "oem" ? "ok" : e.sup.type === "trader" ? "warn" : "info")}</td><td>${e.sup.leadD} d</td><td>${e.sup.terms}</td></tr>`).join("")}</tbody></table></div><div class="row">${btn("Send inquiries", { type: "requestQuotes", rfq: m.rfq, line: m.line }, "pri", "data-collect='1'")}${btn("Cancel", { type: "ui", modal: null }, "ghost")}</div>`;
    }
    else if (m.kind === "stock") {
        const r = S.rfqs.find((x) => x.id === m.rfq);
        const l = r?.lines[m.line];
        if (!r || !l)
            return "";
        const lots = S.lots.filter((x) => x.partId === l.partId && !x.so && x.status === "ok");
        body = `<h2>Use your own stock</h2><p class="sm">${partLine(l.partId)}</p>${lots.map((x) => `<div class="row" id="lot${x.id}row"><span>Lot ${x.id}: ${x.qty} pcs @ ${money(x.unitCost)}</span><input class="qty" type="number" data-f="qty" min="0" max="${Math.min(x.qty, l.qty)}" value="${Math.min(x.qty, l.qty)}">${btn("Allocate", { type: "setAlloc", rfq: m.rfq, line: m.line, lot: x.id }, "pri sm", `data-form="#lot${x.id}row"`)}</div>`).join("") || "<p>No free stock.</p>"}${btn("Close", { type: "ui", modal: null }, "ghost")}`;
    }
    else if (m.kind === "neg") {
        const q = S.quotes.find((x) => x.id === m.q);
        if (!q)
            return "";
        body = `<h2>Negotiate with ${esc(DB.supplierById[q.supplier].name)}</h2><p class="sm">Current price ${money(q.unit)} per unit · round ${q.round + 1} of 3. Bigger asks are less likely to be accepted. A good relationship, reputation and an OEM-friendly attitude help.</p><div class="row"><label>Ask for a discount of <select id="negpct">${[3, 5, 8, 10, 15, 20].map((p) => `<option value="${p}">${p}%</option>`).join("")}</select></label>${btn("Ask for discount", { type: "negotiateQuote", id: q.id }, "pri", "data-pct='#negpct'")}</div><div class="row">${btn("Ask for longer credit terms", { type: "negotiateTerms", id: q.id }, "")}${btn("Cancel", { type: "ui", modal: null }, "ghost")}</div>`;
    }
    else if (m.kind === "newgame") {
        body = `<h2>New game</h2><p class="sm">Starts a fresh company in Doha, Qatar. Your current game is replaced unless you saved it.</p><div class="form" id="ngf"><label>Company name<input data-f="name" value="Gulf Star Trading"></label><label>Difficulty<select data-f="difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label></div><div class="row">${btn("Start", { type: "newgame" }, "pri", 'data-form="#ngf"')}${btn("Cancel", { type: "ui", modal: null }, "ghost")}</div>`;
    }
    return `<div class="overlay"><div class="modal">${body}</div></div>`;
}
/* ---------- shell ---------- */
function coach() {
    if (!ui.guide || ui.page === "dashboard")
        return "";
    const i = TRAINING.findIndex((t) => !t.check(S));
    if (i < 0)
        return `<div class="coach done">🎓 Training complete! Keep growing: unlock industries, win bigger clients. <button class="x" ${`data-act='{"type":"ui","guide":false}'`}>×</button></div>`;
    const t = TRAINING[i];
    return `<div class="coach"><div class="cn">${i + 1}/${TRAINING.length}</div><div class="ct2"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></div>${btn("Go →", { type: "ui", page: t.page }, "pri sm")}<button class="x" data-act='{"type":"ui","guide":false}'>×</button></div>`;
}
let rendering = false, again = false;
function render() {
    if (rendering) {
        again = true;
        return;
    }
    rendering = true;
    try {
        draw();
    }
    finally {
        rendering = false;
    }
    if (again) {
        again = false;
        render();
    }
}
function draw() {
    const s = S, pg = PAGES.find((p) => p.id === ui.page) ?? dashboard;
    const badge = (id) => id === "rfqs" ? s.rfqs.filter((r) => !r.seen).length : id === "orders" ? s.sos.filter((o) => o.status === "open" || o.status === "delivering").length : 0;
    const nav = GROUPS.map((g) => `<div class="ng">${g}</div>${PAGES.filter((p) => p.group === g).map((p) => `<button class="ni ${p.id === ui.page ? "on" : ""}" data-act='${esc(JSON.stringify({ type: "ui", page: p.id, rfq: p.id === "rfqs" ? null : undefined, so: p.id === "orders" ? null : undefined }))}'><i>${p.icon}</i><span>${p.title}</span>${badge(p.id) ? `<em>${badge(p.id)}</em>` : ""}</button>`).join("")}`).join("");
    const sp = (n, l) => btn(l, { type: "setSpeed", value: n }, !s.paused && s.speed === n ? "on sm" : "sm");
    const html = `<div class="shell"><aside><div class="brand"><div class="logo">🌐</div><div><b>Global Procurement</b><span>TYCOON</span></div></div><nav>${nav}</nav><div class="aside-foot">Simulated data only</div></aside>
<div class="main"><header class="top"><div class="co"><b>${esc(s.name)}</b><span>${dateStr(s.day)} · day ${s.day}</span></div><div class="hk"><label>Cash</label><b class="${s.cash < 0 ? "bad" : ""}">${money(s.cash)}</b></div><div class="hk"><label>Net worth</label><b>${money(netWorth(s).total)}</b></div><div class="hk"><label>Reputation</label><b>${Math.round(s.rep)}</b></div>
<div class="clock">${btn(s.paused ? "▶ Paused" : "⏸ Pause", { type: "setPaused", value: !s.paused }, s.paused ? "warnb sm" : "sm")}${sp(1, "1×")}${sp(2, "2×")}${sp(3, "3×")}${btn("+1 day", { type: "advance", days: 1 }, "sm")}${btn("+7 days", { type: "advance", days: 7 }, "sm")}</div></header>
${coach()}${s.over ? `<div class="gameover">GAME OVER: ${esc(s.over)} ${btn("New game", { type: "ui", modal: { kind: "newgame" } }, "pri sm")}</div>` : ""}
<main id="page">${pg.render(s)}</main></div>${modal()}${toastMsg ? `<div class="toast ${toastBad ? "bad" : ""}">${esc(toastMsg)}</div>` : ""}</div>`;
    morph(root, html);
    if (ui.page === "settings")
        slotList();
}
let last = performance.now(), acc = 0;
setInterval(() => { const now = performance.now(), dt = now - last; last = now; if (S.paused || S.over)
    return; acc += dt; const ms = 3000 / S.speed; let ran = false; while (acc >= ms) {
    acc -= ms;
    stepDay(S);
    ran = true;
} if (ran)
    render(); }, 250);
setInterval(() => { if (!S.over && S.day > 0)
    putSave("auto"); }, 300000);
render();
window.__game = { get S() { return S; }, run, render, ui };
