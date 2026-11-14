export const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const act = (a) => `data-act='${esc(JSON.stringify(a))}'`;
export const btn = (label, a, cls = "", extra = "") => `<button class="btn ${cls}" ${act(a)} ${extra}>${label}</button>`;
export const pill = (t, cls = "") => `<span class="pill ${cls}">${esc(t)}</span>`;
export const flag = (cc) => cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";
export const bar = (v, max, cls = "") => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / (max || 1)) * 100)).toFixed(0)}%"></i></div>`;
export const kpi = (label, value, sub = "", cls = "", icon = "") => `<div class="kpi ${cls}"><div class="ki">${icon}</div><div><label>${esc(label)}</label><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div></div>`;
export function table(head, rows, cls = "") { return `<div class="tw"><table class="tbl ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="empty">Nothing here yet.</td></tr>`}</tbody></table></div>`; }
export function download(name, text, mime = "text/plain") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
/** Make `host` match `html` while keeping existing elements (focus, scroll, animations and canvases survive). */
export function morph(host, html) { const t = document.createElement("template"); t.innerHTML = html; kids(host, t.content); }
function kids(a, b) {
    const A = Array.from(a.childNodes), B = Array.from(b.childNodes);
    for (let i = 0; i < B.length; i++) {
        const x = A[i], y = B[i];
        if (!x) {
            a.appendChild(y.cloneNode(true));
            continue;
        }
        if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) {
            a.replaceChild(y.cloneNode(true), x);
            continue;
        }
        if (x.nodeType === 3) {
            if (x.nodeValue !== y.nodeValue)
                x.nodeValue = y.nodeValue;
            continue;
        }
        if (x.nodeType !== 1)
            continue;
        const ex = x, ey = y;
        if (ex.hasAttribute("data-keep"))
            continue;
        for (const at of Array.from(ex.attributes))
            if (!ey.hasAttribute(at.name)) {
                if (at.name === "value" && ex instanceof HTMLInputElement)
                    continue;
                ex.removeAttribute(at.name);
            }
        for (const at of Array.from(ey.attributes))
            if (ex.getAttribute(at.name) !== at.value)
                ex.setAttribute(at.name, at.value);
        if (ex instanceof HTMLInputElement) {
            if (document.activeElement !== ex) {
                if (ey.hasAttribute("value") && ex.value !== ey.getAttribute("value"))
                    ex.value = ey.getAttribute("value");
                ex.checked = ey.hasAttribute("checked");
            }
        }
        else if (ex instanceof HTMLSelectElement) {
            kids(ex, ey);
            if (document.activeElement !== ex) {
                const sel = Array.from(ey.querySelectorAll("option")).findIndex((o) => o.hasAttribute("selected"));
                if (sel >= 0)
                    ex.selectedIndex = sel;
            }
            continue;
        }
        if (ex.nodeName !== "CANVAS")
            kids(ex, ey);
    }
    while (a.childNodes.length > B.length)
        a.removeChild(a.lastChild);
}
/** Tiny SVG line chart for time series. */
export function line(vals, w = 520, h = 140, color = "#33d6a6", fmtY = (n) => String(Math.round(n))) {
    if (vals.length < 2)
        return `<div class="empty">The chart fills in after a few days.</div>`;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, pad = 6;
    const pts = vals.map((v, i) => `${(pad + (i / (vals.length - 1)) * (w - pad * 2)).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`);
    return `<svg viewBox="0 0 ${w} ${h}" class="lc"><defs><linearGradient id="lg${color.slice(1)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}" fill="url(#lg${color.slice(1)})"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><text x="8" y="14" class="ct">${esc(fmtY(max))}</text><text x="8" y="${h - 8}" class="ct">${esc(fmtY(min))}</text></svg>`;
}
