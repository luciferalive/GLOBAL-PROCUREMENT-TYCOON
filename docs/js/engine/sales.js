import { DB, PERSONA_LABEL } from "../data/db.js";
import { landedCost } from "./pricing.js";
import { RIVALS } from "../data/rivals.js";
import { RULES } from "../data/rules.js";
import { COUNTRY } from "../data/countries.js";
const CURVE = [[0.9, 0.98], [1.0, 0.82], [1.05, 0.5], [1.1, 0.22], [1.2, 0.06], [1.35, 0]];
export const pAcceptAt = (qe) => { if (qe <= CURVE[0][0])
    return CURVE[0][1]; for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i], [x0, y0] = CURVE[i - 1];
    if (qe <= x1)
        return y0 + ((y1 - y0) * (qe - x0)) / (x1 - x0);
} return 0; };
/** How likely is the customer to accept right now, and why. Used by the UI as an honest hint and by the engine for the actual decision. */
export function assess(s, r) {
    const c = DB.clientById[r.client], cq = r.cq;
    const ref = r.lines.reduce((a, l) => a + l.ref * l.qty, 0) || 1, quoted = r.lines.reduce((a, l, i) => a + cq.lineUnits[i] * l.qty, 0), q = quoted / ref;
    const rel = s.rel[c.id] ?? 20;
    const why = [];
    let adj = 0 - 0.015 * (s.staff.sales - 1) - (s.rep - 30) / 1000 - (c.persona === "relationship" ? (rel / 100) * 0.08 : (rel / 100) * 0.03);
    const rule = RULES[c.industry];
    if (rule?.priceAdj) {
        adj += rule.priceAdj;
        why.push("industry is price sensitive");
    }
    if (cq.cur && cq.cur === COUNTRY[c.country]?.cur) {
        adj -= 0.01;
        why.push(`prefers a quotation in ${cq.cur}`);
    }
    if (c.persona === "price") {
        adj += 0.04;
        why.push("price-focused: hard on price");
    }
    if (c.persona === "contract" && cq.termsDays >= 60) {
        adj -= 0.02;
        why.push("likes long payment terms");
    }
    if (cq.termsDays > c.terms)
        adj -= 0.01 * Math.min(3, (cq.termsDays - c.terms) / 15);
    if (cq.termsDays < c.terms)
        adj += 0.01 * Math.min(3, (c.terms - cq.termsDays) / 15);
    if (c.persona === "quality" && cq.warrantyM >= 24)
        adj -= 0.015;
    const late = cq.promiseDays - r.needDays;
    if (late > 0)
        adj += Math.min(0.1, late * 0.006) * (c.persona === "delivery" || c.persona === "emergency" ? 2 : 1) * (rule?.lateX ?? 1);
    if (cq.promiseDays < r.needDays && (c.persona === "delivery" || c.persona === "emergency")) {
        adj -= 0.03;
        why.push("fast delivery valued");
    }
    const qe = q + adj;
    return { q, qe, p: pAcceptAt(qe), ref, quoted, late, adj, why };
}
export function decide(s, r, rng) {
    const c = DB.clientById[r.client], cq = r.cq;
    const a = assess(s, r);
    const land = landedCost(s, r);
    const altUsed = r.lines.some((_, i) => land.byLine[i]?.alt), nonOem = r.lines.some((_, i) => !land.byLine[i]?.oemSource);
    const rule = RULES[c.industry];
    const reqCert = rule?.fullDocs || r.lines.some((l) => l.certs.length > 0), docs = r.lines.some((_, i) => land.byLine[i]?.docs !== "full");
    if (cq.round >= 3)
        return rng.chance(a.p) ? { type: "accept", msg: "Final offer accepted." } : { type: "reject", msg: "We could not agree on commercial terms after several rounds." };
    if (!r.urgent && rng.chance(0.015))
        return { type: "cancel", msg: "Project postponed." };
    if (r.rivals?.length) {
        const best = r.rivals.slice().sort((x, y) => x.bid - y.bid)[0], rv = RIVALS.find((x) => x.id === best.id);
        const loyal = ((s.rel[c.id] ?? 20) / 100) * (c.persona === "relationship" ? 0.08 : 0.03);
        if (a.qe > best.bid + 0.02 + loyal) {
            const gap = Math.round((a.q / best.bid - 1) * 100);
            if (cq.round < 3 && rng.chance(0.4))
                return { type: "revise", msg: `${rv.name} has offered us a lower price (we estimate about ${Math.max(2, gap)}% below yours). Can you improve your offer?`, rival: rv.id };
            return { type: "reject", msg: `The order went to ${rv.name}, whose offer was about ${Math.max(2, gap)}% below yours.`, rival: rv.id };
        }
    }
    if (rule?.authOnly && nonOem)
        return { type: "revise", msg: "Our industry rules allow only the OEM or authorized distributors as the source. Please re-quote from an authorized source." };
    if (rule?.noAlt && altUsed)
        return { type: "revise", msg: "Alternative or generic parts are not permitted for this industry. Please quote the specified item." };
    if (c.persona === "oemonly" && nonOem)
        return { type: "revise", msg: "We only buy from the OEM or its authorized distributors. Please re-quote from an authorized source." };
    if (altUsed) {
        const ok = c.persona === "oemonly" ? false : c.persona === "quality" ? rng.chance(0.25) : c.persona === "cert" ? rng.chance(0.3) : c.persona === "price" ? rng.chance(0.85) : rng.chance(0.55);
        if (!ok)
            return { type: "revise", msg: "We cannot approve the alternative (non-OEM) product. Please quote the specified brand." };
    }
    if ((c.persona === "cert" || reqCert) && docs && !cq.clarified) {
        const none = r.lines.some((_, i) => land.byLine[i]?.docs === "none");
        if (none && (c.persona === "cert" || rule?.fullDocs))
            return { type: "reject", msg: "Your source cannot provide the required certification and documentation." };
        return { type: "clarify", msg: "Please confirm the technical specification and certificates (datasheets, conformity, origin)." };
    }
    if (a.late > (c.persona === "delivery" || c.persona === "emergency" ? 2 : 7))
        return { type: "delivery", msg: `We need delivery within ${r.needDays} days. You offered ${cq.promiseDays}.`, days: r.needDays };
    if (c.persona === "quality" && cq.warrantyM < 24 && rng.chance(0.6))
        return { type: "warranty", msg: "We require a 24-month warranty on this order.", warrantyM: 24 };
    if (rng.chance(a.p))
        return { type: "accept", msg: "Quotation accepted. Purchase order follows." };
    if (a.qe <= 1.12) {
        if (r.lines.length > 1 && rng.chance(0.3)) {
            const ok = r.lines.map((l, i) => ({ i, ratio: cq.lineUnits[i] / l.ref })).filter((x) => x.ratio <= 1.05).map((x) => x.i);
            if (ok.length && ok.length < r.lines.length)
                return { type: "partial", msg: `We will order ${ok.length} of ${r.lines.length} items only (the others are too expensive).`, lines: ok };
        }
        const d = Math.min(0.2, Math.max(0.01, (a.qe - 0.985) / a.qe));
        return { type: "discount", msg: `Your price is high. We can award the order at a ${(d * 100).toFixed(1)}% discount.`, discount: Math.round(d * 1000) / 10 };
    }
    if (a.qe <= 1.28)
        return { type: "revise", msg: "Your offer is well above our budget. Please send a revised offer." };
    return { type: "reject", msg: "Price far above our benchmark. " + PERSONA_LABEL[c.persona] + " buyer." };
}
