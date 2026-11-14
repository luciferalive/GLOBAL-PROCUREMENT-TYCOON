import { COUNTRIES, COUNTRY } from "../data/countries.js";
import { CATS } from "../data/lists.js";
import { DB, MODE_LABEL } from "../data/db.js";
import { RIVALS } from "../data/rivals.js";
import { money } from "../engine/core.js";
import { INCO_NOTE } from "../engine/pricing.js";
import { hsCode } from "./docs.js";
import { btn, flag, kpi, pill, table, esc } from "./dom.js";
export const customs = { id: "customs", title: "Customs & Trade", icon: "⚖", group: "Operations", render(s) {
        const at = s.ships.filter((x) => x.status === "customs" || x.status === "held");
        const done = s.ships.filter((x) => x.cleared || x.status === "delivered" || x.status === "cleared");
        const spent = Object.values(s.pl).reduce((a, p) => a + p.customs, 0);
        const rows = at.map((sh) => {
            const po = s.pos.find((p) => p.id === sh.po), sp = DB.supplierById[po.supplier];
            return [`<b>${esc(sh.no)}</b><br><span class="sm">${esc(po.no)}</span>`, `${flag(sh.from)} ${esc(sp.name)}`, MODE_LABEL[sh.mode], sh.status === "held" ? pill("HELD", "bad") : pill("in clearance", "info"), sh.status === "held" ? `${sh.docsOk ? "Physical inspection" : "<span class='bad'>Document query</span>"}<br><span class="sm">release day ${sh.heldUntil}</span>` : `<span class="sm">release day ${sh.heldUntil}</span>`, money(sh.duty), (sh.status === "held" && !sh.docsOk ? btn("File documents ($120)", { type: "fixCustomsDocs", ship: sh.id }, "xs") : "") + (sh.heldUntil > s.day ? btn(sh.status === "held" ? "Priority release ($450)" : "Priority ($250)", { type: "expediteCustoms", ship: sh.id }, "pri xs") : "")];
        });
        const cats = CATS.slice(0, 14);
        return `<div class="ph"><h1>Customs & Trade</h1><p class="sub">Every import clears Qatar customs: duty on goods + freight + insurance, a clearance fee, and a chance of a hold. Holds are likelier with weak supplier documents, tightened inspections, and fewer customs staff. Duty rates and HS codes here are simulated.</p></div>
<div class="kgrid">${kpi("At customs now", String(at.length), "", at.length ? "warn" : "", "🛃")}${kpi("Held", String(at.filter((x) => x.status === "held").length), "", at.some((x) => x.status === "held") ? "bad" : "", "⛔")}${kpi("Cleared so far", String(done.length), "", "good", "✅")}${kpi("Customs spend", money(spent), "duty + fees", "", "💰")}${kpi("Customs staff", String(s.staff.customs), s.mods.customsUntil > s.day ? "inspections tightened until day " + s.mods.customsUntil : "each one cuts hold risk 15%", "", "👤")}</div>
<div class="panel"><h2>Shipments in customs</h2>${table(["Shipment", "Supplier", "Mode", "Status", "Reason", "Duty", ""], rows)}<p class="sm">Document fixes only help when the hold is a paperwork query. Priority processing releases any shipment the next day, for a fee.</p></div>
<div class="g2"><div class="panel"><h2>Incoterms: who pays what</h2>${table(["Term", "Meaning"], Object.entries(INCO_NOTE).map(([k, v]) => [`<b>${k}</b>`, esc(v)]))}</div>
<div class="panel"><h2>Sample HS codes (simulated)</h2>${table(["Product group", "HS code"], cats.map((c) => [esc(c.name), `<code>${hsCode(c.id)}</code>`]))}</div></div>
<div class="panel"><h2>Origin countries: duty and restrictions</h2>${table(["Country", "Duty", "Freight index", "Restrictions"], COUNTRIES.filter((c) => c.code !== "QA").map((c) => [`${flag(c.code)} ${esc(c.name)}`, c.duty + "%", String(c.freightIdx), esc(c.restrict)]))}</div>`;
    } };
export const competitors = { id: "competitors", title: "Competitors", icon: "⚔", group: "Network", render(s) {
        const rv = s.rivals ?? [];
        const open = s.rfqs.filter((r) => ["new", "sourcing", "quoted", "negotiating"].includes(r.status) && r.rivals?.length);
        return `<div class="ph"><h1>Competitors</h1><p class="sub">Rival trading houses bid on many of the same RFQs. You never see their exact prices, but customers sometimes tell you how far below you they were, and a good relationship lets you win at a slightly higher price.</p></div>
<div class="panel"><h2>Leaderboard vs you</h2>${table(["Rival", "Country", "Style", "Wins over you", "Beaten by you", "Last seen"], RIVALS.map((d) => { const st = rv.find((x) => x.id === d.id); return [`<b>${esc(d.name)}</b>`, `${flag(d.country)} ${esc(COUNTRY[d.country]?.name ?? d.country)}`, esc(d.style), `<b class="bad">${st?.wins ?? 0}</b>`, `<b class="good">${st?.losses ?? 0}</b>`, st?.lastSeen ? "day " + st.lastSeen : "-"]; }))}</div>
<div class="panel"><h2>Open RFQs with competition</h2>${table(["RFQ", "Customer", "Rivals invited", "Status"], open.map((r) => [`<b>${esc(r.no)}</b>`, esc(DB.clientById[r.client].name), r.rivals.map((x) => esc(RIVALS.find((d) => d.id === x.id).name)).join(", "), pill(r.status, "info")]))}<p class="sm">Tip: price-hungry rivals (Gulf Horizon, Indus Global) undercut you on plain goods. Premium rivals lose when you can deliver authorized-source documentation at a fair price.</p></div>`;
    } };
