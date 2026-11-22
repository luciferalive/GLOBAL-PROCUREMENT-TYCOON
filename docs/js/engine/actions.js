import { COUNTRY } from "../data/countries.js";
import { CAT, IND } from "../data/lists.js";
import { DB } from "../data/db.js";
import { SITE } from "../data/sites.js";
import { exportOpt } from "./pricing.js";
import { workforceAction } from "./workflow.js";
import { LC_STEP, lcOf, stockUsed } from "./core.js";
import { cashIn } from "./core.js";
import { CERT_COST, R, cashOut, inspectLot, isOpen, money, netWorth, news, nid, plOf, registrationCheck, stepDay, whCap, whRentMonth, WH_STEP_RENT } from "./core.js";
import { FREIGHT_INCLUDED, MONTHLY, eligible, freightQuote, landedCost, makeQuote, supplierStaffDelay, toC } from "./pricing.js";
const ok = (msg) => ({ ok: true, msg }), bad = (msg) => ({ ok: false, msg });
const rfqOf = (s, id) => s.rfqs.find((r) => r.id === id);
const inFlow = (r) => ["new", "sourcing", "quoted", "negotiating"].includes(r.status);
export function dispatch(s, a) {
    if (s.over && a.type !== "noop")
        return bad("The game is over.");
    const rng = R(s);
    switch (a.type) {
        case "setPaused":
            s.paused = !!a.value;
            return ok();
        case "setSpeed":
            s.speed = a.value;
            s.paused = false;
            return ok();
        case "advance": {
            const n = Math.max(1, Math.min(60, a.days | 0));
            for (let i = 0; i < n && !s.over; i++)
                stepDay(s);
            return ok();
        }
        case "openRfq": {
            const r = rfqOf(s, a.id);
            if (r) {
                r.seen = true;
                s.flags.rfq_opened = true;
            }
            return ok();
        }
        case "viewSupplier":
            s.flags.supplier_viewed = true;
            return ok();
        case "viewFreight": {
            const l = DB.logiById[a.logi];
            if (l) {
                s.flags["fr_" + l.id] = true;
                if (/^DHL/.test(l.name))
                    s.flags.fr_dhl = true;
                if (/^Kuehne/.test(l.name))
                    s.flags.fr_kn = true;
            }
            return ok();
        }
        case "fixCustomsDocs": {
            const sh = s.ships.find((x) => x.id === a.ship);
            if (!sh || sh.status !== "held")
                return bad("This shipment is not held.");
            if (sh.docsOk)
                return bad("The documents are already in order. Only an inspection delay remains.");
            const fee = toC(120);
            if (s.cash < fee)
                return bad("Not enough cash.");
            cashOut(s, "customs", `Customs documentation fix ${sh.no}`, fee);
            plOf(s).customs += fee;
            sh.docsOk = true;
            sh.heldUntil = Math.max(s.day + 1, Math.floor((s.day + sh.heldUntil) / 2));
            s.flags.customs_fixed = true;
            return ok(`Corrected documents filed. ${sh.no} should be released on day ${sh.heldUntil}.`);
        }
        case "expediteCustoms": {
            const sh = s.ships.find((x) => x.id === a.ship);
            if (!sh || (sh.status !== "held" && sh.status !== "customs"))
                return bad("This shipment is not at customs.");
            if (sh.heldUntil <= s.day)
                return bad("It is already being released.");
            const fee = toC(sh.status === "held" ? 450 : 250);
            if (s.cash < fee)
                return bad("Not enough cash.");
            cashOut(s, "customs", `Priority customs processing ${sh.no}`, fee);
            plOf(s).customs += fee;
            sh.heldUntil = s.day;
            return ok(`Priority clearance paid. ${sh.no} is released tomorrow.`);
        }
        case "lcIncrease": {
            const lc = lcOf(s);
            const steps = Math.round((lc.limit / 100 - 60000) / LC_STEP);
            if (steps >= 5)
                return bad("The bank will not go above $260,000 for a company of your size.");
            const needRep = 20 + steps * 12;
            if (s.rep < needRep)
                return bad(`The bank wants reputation ${needRep} before raising your limit. You have ${Math.round(s.rep)}.`);
            if (s.loans.reduce((t, l) => t + l.left, 0) > lc.limit * 0.8)
                return bad("Too much existing debt. Repay some loans first.");
            const fee = toC(300);
            if (s.cash < fee)
                return bad("Not enough cash for the $300 review fee.");
            cashOut(s, "bank", "LC limit review fee", fee);
            plOf(s).bank += fee;
            lc.limit += toC(LC_STEP);
            return ok(`Letter of credit limit raised to ${money(lc.limit)}.`);
        }
        case "openSite": {
            const st = SITE[a.id];
            if (!st)
                return bad("Unknown site.");
            s.sites ??= [];
            if (s.sites.includes(st.id))
                return bad("Already open.");
            const dep = toC(st.setup);
            if (s.cash < dep)
                return bad(`Setup costs ${money(dep)}.`);
            cashOut(s, "storage", `Warehouse setup ${st.city}`, dep);
            plOf(s).other += dep;
            s.sites.push(st.id);
            news(s, `New warehouse opened in ${st.city}: +${st.cap} m3, ${money(toC(st.rent))}/month.`, "good");
            return ok(`${st.city} warehouse is open.`);
        }
        case "closeSite": {
            const st = SITE[a.id];
            if (!st || !(s.sites ?? []).includes(st.id))
                return bad("That site is not open.");
            if (stockUsed(s) > whCap(s) - st.cap)
                return bad("Your stock would not fit without it. Deliver or sell stock first.");
            s.sites = s.sites.filter((x) => x !== st.id);
            return ok(`${st.city} warehouse closed.`);
        }
        case "viewLanded":
            s.flags.landed_viewed = true;
            return ok();
        case "requestQuotes": {
            const r = rfqOf(s, a.rfq);
            if (!r || !inFlow(r))
                return bad("RFQ is closed.");
            const l = r.lines[a.line];
            if (!l)
                return bad("No such line.");
            const part = DB.partsById[l.partId], elig = eligible(s, part);
            let n = 0;
            for (const sid of a.suppliers) {
                const e = elig.find((x) => x.sup.id === sid);
                if (!e)
                    continue;
                if (s.quotes.some((q) => q.rfq === r.id && q.line === a.line && q.supplier === sid && (q.status === "pending" || q.status === "received" || q.status === "ordered")))
                    continue;
                s.quotes.push(makeQuote(s, r, a.line, e.sup, e.alt, rng, `Q${nid(s, "q")}`));
                n++;
            }
            if (!n)
                return bad("No new supplier requests were sent (already asked or not eligible).");
            if (r.status === "new")
                r.status = "sourcing";
            return ok(`Supplier inquiry sent to ${n} supplier(s). Replies arrive in 1 to 6 days.`);
        }
        case "autoQuotes": {
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            const l = r.lines[a.line];
            const part = DB.partsById[l.partId];
            const elig = eligible(s, part).filter((e) => !s.quotes.some((q) => q.rfq === r.id && q.line === a.line && q.supplier === e.sup.id && ["pending", "received", "ordered"].includes(q.status)));
            // balanced shortlist: the brand holder, the best-looking distributor, a trader, and a local stockist when available
            const pick = [];
            const by = (t, auth) => elig.filter((e) => e.sup.type === t && (auth === undefined || e.sup.auth === auth) && !e.alt).sort((x, y) => x.sup.priceF - y.sup.priceF);
            const oem = by("oem")[0], dist = by("distributor", true).concat(by("distributor", false)), tr = by("trader")[0], loc = elig.filter((e) => e.alt)[0];
            if (oem)
                pick.push(oem.sup.id);
            for (const d of dist.slice(0, 2))
                pick.push(d.sup.id);
            if (tr)
                pick.push(tr.sup.id);
            if (loc)
                pick.push(loc.sup.id);
            return dispatch(s, { type: "requestQuotes", rfq: a.rfq, line: a.line, suppliers: pick.slice(0, a.max ?? 4) });
        }
        case "negotiateQuote": {
            const q = s.quotes.find((x) => x.id === a.id);
            if (!q)
                return bad("No quote.");
            if (q.status !== "received")
                return bad("You can only negotiate a received quote.");
            if (q.round >= 3)
                return bad("This supplier will not move further.");
            const sup = DB.supplierById[q.supplier];
            const t = Math.min(25, Math.max(1, +a.pct)) / 100;
            const rel = s.rel[sup.id] ?? 30;
            const p = Math.max(0.05, Math.min(0.9, 0.62 - t * 2.6 + rel / 400 + 0.03 * (s.staff.proc - 1) + (sup.type === "trader" ? 0.12 : sup.type === "oem" ? -0.08 : 0) + (s.rep / 800)));
            const win = rng.chance(p);
            const gave = win ? t * rng.range(0.55, 1) : 0;
            const msg = win ? `Revised offer: ${(gave * 100).toFixed(1)}% lower.` : "No movement on price: supplier holds its offer.";
            q.rev = { ok: win, unit: win ? Math.round(q.unit * (1 - gave)) : undefined, msg };
            q.status = "pending";
            q.replyDay = s.day + supplierStaffDelay(s, sup.respD);
            s.rel[sup.id] = Math.max(0, Math.min(100, rel + (win ? 2 : t > 0.12 ? -4 : -1)));
            s.flags.negotiated = true;
            if (win && gave >= 0.15)
                s.flags.disc15 = true;
            return ok("Negotiation sent. The supplier will respond in a few days.");
        }
        case "negotiateTerms": {
            const q = s.quotes.find((x) => x.id === a.id);
            if (!q || q.status !== "received")
                return bad("Quote not available.");
            if (q.round >= 3)
                return bad("No more rounds.");
            const sup = DB.supplierById[q.supplier];
            const rel = s.rel[sup.id] ?? 30;
            const order = { prepay: 0, lc: 1, net30: 2, net60: 3 };
            if (q.terms === "net60")
                return bad("Already on the best terms.");
            const next = q.terms === "prepay" || q.terms === "lc" ? "net30" : "net60";
            const p = Math.max(0.05, Math.min(0.8, 0.25 + rel / 250 + s.rep / 400 - (sup.type === "trader" ? 0.15 : 0) - (order[next] - order[q.terms]) * 0.05 + 0.04 * Math.min(2, s.staff.finance)));
            const win = rng.chance(p);
            q.rev = { ok: win, terms: win ? next : undefined, msg: win ? `Supplier grants ${next === "net30" ? "30" : "60"}-day credit terms.` : "Supplier insists on current payment terms." };
            q.status = "pending";
            q.replyDay = s.day + supplierStaffDelay(s, sup.respD);
            return ok("Credit request sent.");
        }
        case "setAlloc": {
            const r = rfqOf(s, a.rfq);
            if (!r || !inFlow(r))
                return bad("RFQ is closed.");
            const l = r.lines[a.line];
            if (!l)
                return bad("No line.");
            const key = a.quote ? { quote: a.quote } : { stockLot: a.lot };
            l.alloc = l.alloc.filter((x) => (x.quote ?? x.stockLot) !== (key.quote ?? key.stockLot));
            let qty = Math.max(0, Math.floor(+a.qty || 0));
            if (qty > 0) {
                if (a.quote) {
                    const q = s.quotes.find((x) => x.id === a.quote);
                    if (!q || q.status !== "received")
                        return bad("Quote is not available.");
                    if (q.expiry < s.day)
                        return bad("Quote expired.");
                    if (q.inStock)
                        qty = Math.min(qty, q.qtyAvail);
                    if (qty < q.moq)
                        return bad(`Minimum order quantity is ${q.moq}.`);
                }
                else {
                    const lot = s.lots.find((x) => x.id === a.lot);
                    if (!lot || lot.so || lot.status !== "ok")
                        return bad("Stock lot not available.");
                    qty = Math.min(qty, lot.qty);
                }
                const rest = l.qty - l.alloc.reduce((t, x) => t + x.qty, 0);
                qty = Math.min(qty, rest);
                if (qty <= 0)
                    return bad("This line is already fully allocated.");
                l.alloc.push({ ...key, qty });
            }
            return ok();
        }
        case "selectQuote": { // choose ONE supplier for the whole line (replaces any earlier choice)
            const r = rfqOf(s, a.rfq);
            if (!r || !inFlow(r))
                return bad("RFQ is closed.");
            const l = r.lines[a.line];
            if (!l)
                return bad("No line.");
            const q = s.quotes.find((x) => x.id === a.quote);
            if (!q || q.status !== "received")
                return bad("That quote is not available.");
            if (q.expiry < s.day)
                return bad("That quote has expired.");
            const qty = q.inStock ? Math.min(l.qty, q.qtyAvail) : l.qty;
            if (qty < q.moq)
                return bad(`Minimum order quantity is ${q.moq}.`);
            l.alloc = [{ quote: q.id, qty }];
            const sp = DB.supplierById[q.supplier];
            if (qty < l.qty)
                return ok(`${sp.name} can supply only ${qty} of ${l.qty}. Pick a second supplier (or your stock) for the remaining ${l.qty - qty}.`);
            return ok(`Selected ${sp.name} for line ${a.line + 1}. Now choose shipping below if the delivery terms need it.`);
        }
        case "clearAlloc": {
            const r = rfqOf(s, a.rfq);
            if (r)
                r.lines[a.line].alloc = [];
            return ok();
        }
        case "autoAlloc": { // cheapest single supplier per line that can cover the quantity
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            let n = 0;
            r.lines.forEach((l, li) => {
                l.alloc = [];
                const lots = s.lots.filter((x) => x.partId === l.partId && !x.so && x.status === "ok");
                let need = l.qty;
                for (const lot of lots) {
                    if (need <= 0)
                        break;
                    const t = Math.min(need, lot.qty);
                    l.alloc.push({ stockLot: lot.id, qty: t });
                    need -= t;
                }
                const qs = s.quotes.filter((q) => q.rfq === r.id && q.line === li && q.status === "received" && q.expiry >= s.day && (!q.inStock || q.qtyAvail >= need) && q.moq <= need).sort((x, y) => x.unit - y.unit);
                if (need > 0 && qs.length) {
                    l.alloc.push({ quote: qs[0].id, qty: need });
                    n++;
                }
            });
            return ok("Allocated the cheapest quote per line where possible.");
        }
        case "setShip": {
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            r.ship[a.supplier] = { logi: a.logi, mode: a.mode, insure: !!a.insure };
            const lg = DB.logiById[a.logi];
            if (lg) {
                s.flags["fr_" + lg.id] = true;
                if (/^DHL/.test(lg.name))
                    s.flags.fr_dhl = true;
                if (/^Kuehne/.test(lg.name))
                    s.flags.fr_kn = true;
            }
            return ok();
        }
        case "setMargin": {
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            r.lines[a.line].margin = Math.max(-20, Math.min(80, +a.pct || 0));
            return ok();
        }
        case "setCq": {
            const r = rfqOf(s, a.rfq);
            if (!r)
                return bad("No RFQ.");
            r.ship;
            r.opt = { ...(r.opt ?? {}), ...a.opt };
            return ok();
        }
        case "sendQuote": return sendQuote(s, a, rng);
        case "replyCustomer": return replyCustomer(s, a, rng);
        case "placeOrders": return placeOrders(s, a, rng);
        case "inspect": {
            const lot = s.lots.find((l) => l.id === a.id);
            if (!lot)
                return bad("No lot.");
            inspectLot(s, a.id, rng);
            return ok();
        }
        case "deliver": {
            const so = s.sos.find((x) => x.id === a.id);
            if (!so)
                return bad("No order.");
            if (so.status === "delivering")
                return bad("Already being delivered.");
            const rfq = s.rfqs.find((r) => r.id === so.rfq);
            const partialOk = rfq?.opt?.partialOk;
            let avail = 0, need = 0;
            so.lines.forEach((l, i) => { need += l.qty - l.delivered; avail += Math.min(l.qty - l.delivered, s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "ok").reduce((t, x) => t + x.qty, 0)); });
            if (avail <= 0)
                return bad("No inspected stock reserved for this order yet.");
            if (avail < need && !partialOk)
                return bad("Stock is not complete. Offer partial shipment in the quotation, or wait for all items.");
            const cl = DB.clientById[so.client];
            let extra = 0;
            if (cl.country !== "QA") {
                let kg = 0, vol = 0, val = 0;
                so.lines.forEach((l, i) => { const t = Math.min(l.qty - l.delivered, s.lots.filter((x) => x.so === so.id && x.soLine === i && x.status === "ok").reduce((q, x) => q + x.qty, 0)); const p = DB.partsById[l.partId]; kg += t * p.kg; vol += t * p.vol; val += t * toC(p.list); });
                const ex = exportOpt(s, cl.country, kg, vol, val);
                if (!ex)
                    return bad(`No carrier can ship this cargo to ${COUNTRY[cl.country].name} right now.`);
                if (s.cash < ex.cost)
                    return bad(`Export freight and clearance cost ${money(ex.cost)}. Not enough cash.`);
                cashOut(s, "freight", `Export freight & clearance ${so.no} to ${COUNTRY[cl.country].name}`, ex.cost);
                plOf(s).freight += ex.cost;
                so.exp = ex;
                extra = ex.days;
                s.flags.exported = true;
                news(s, `Export shipment for ${so.no} leaves Doha for ${COUNTRY[cl.country].name} by ${ex.mode} (${ex.days} days). Export declaration filed.`, "info");
            }
            so.status = "delivering";
            so.deliveryDay = s.day + 1 + extra + (s.staff.warehouse === 0 ? 1 : 0);
            return ok("Picked and packed. Delivery note issued. Arrives at the customer tomorrow.");
        }
        case "topUp": { // quick local purchase to cover a shortage
            const so = s.sos.find((x) => x.id === a.so);
            if (!so)
                return bad("No order.");
            const l = so.lines[a.line];
            if (!l)
                return bad("No line.");
            if (s.pos.some((p) => p.so === so.id && (p.status === "placed" || p.status === "shipped")))
                return bad("Goods are still on the way. Wait for them before buying locally.");
            const have = s.lots.filter((x) => x.so === so.id && x.soLine === a.line).reduce((t, x) => t + x.qty, 0);
            const miss = l.qty - l.delivered - have;
            if (miss <= 0)
                return bad("Nothing missing.");
            const part = DB.partsById[l.partId];
            const unit = toC(part.list * 1.12);
            const cost = unit * miss;
            if (s.cash < cost)
                return bad("Not enough cash.");
            cashOut(s, "supplier", `Emergency local purchase ${part.pn} x${miss}`, cost);
            s.lots.push({ id: `LOT-${nid(s, "lot")}`, partId: part.id, qty: miss, unitCost: unit, so: so.id, soLine: a.line, day: s.day, batch: "LOCAL-" + s.day, serial: "LCL", status: "ok", damaged: 0, po: 0, inspectDay: s.day });
            return ok(`Bought ${miss} locally at a premium. Stock reserved.`);
        }
        case "contactClient": {
            const c = DB.clientById[a.id];
            if (!c)
                return bad("No client.");
            const g = s.reg[c.id];
            if (g)
                return bad("Application already in progress or approved.");
            if (!s.industries.includes(c.industry))
                return bad(`Unlock the ${IND[c.industry].name} industry first.`);
            const reg = { stage: 1, since: s.day, wait: Math.max(1, rng.int(2, 6) - s.staff.bd), result: "", reason: "", retryDay: 0 };
            s.reg[c.id] = reg;
            return ok("Introduction email and company profile sent.");
        }
        case "submitDocs": {
            const g = s.reg[a.id];
            if (!g || g.stage !== 2)
                return bad("Not at the document stage.");
            if (s.cash < toC(300))
                return bad("Not enough cash for notarising documents ($300).");
            cashOut(s, "admin", "Vendor registration documents", toC(300));
            plOf(s).other += toC(300);
            g.stage = 3;
            g.since = s.day;
            g.wait = Math.max(3, rng.int(5, 12) - s.staff.bd);
            return ok("Documents submitted. Compliance review started.");
        }
        case "unlockIndustry": {
            const i = IND[a.id];
            if (!i || s.industries.includes(i.id))
                return bad("Not available.");
            if (s.rep < i.rep)
                return bad(`Needs reputation ${i.rep}.`);
            if (i.cert && !s.certs.includes(i.cert))
                return bad(`Needs certification: ${i.cert}.`);
            const cost = toC(i.cost);
            if (s.cash < cost)
                return bad("Not enough cash.");
            cashOut(s, "industry", `Unlock industry: ${i.name}`, cost);
            plOf(s).other += cost;
            s.industries.push(i.id);
            news(s, `${i.name} unlocked: new clients, suppliers, products and RFQs become available.`, "good");
            return ok();
        }
        case "buyCert": {
            const c = CERT_COST[a.name];
            if (!c)
                return bad("Unknown certification.");
            if (s.certs.includes(a.name) || s.certPending[a.name])
                return bad("Already held or in progress.");
            if (s.cash < toC(c.cost))
                return bad("Not enough cash.");
            cashOut(s, "admin", `Certification: ${a.name}`, toC(c.cost));
            plOf(s).other += toC(c.cost);
            s.certPending[a.name] = s.day + c.days;
            return ok(`Audit started. Ready in ${c.days} days.`);
        }
        case "hire": {
            const k = a.role;
            if (!(k in MONTHLY))
                return bad("Unknown role.");
            if (s.staff[k] >= 8)
                return bad("Department is full.");
            const fee = toC(MONTHLY[k]);
            if (s.cash < fee)
                return bad("Not enough cash for the hiring fee.");
            cashOut(s, "salaries", `Hiring fee: ${k}`, fee);
            plOf(s).salaries += fee;
            s.staff[k]++;
            return ok();
        }
        case "fire": {
            const k = a.role;
            if (!(k in MONTHLY) || s.staff[k] <= 0)
                return bad("Nobody to release.");
            s.staff[k]--;
            return ok();
        }
        case "borrow": {
            const max = Math.max(0, toC(40_000 + s.rep * 2500) - s.loans.reduce((t, l) => t + l.left, 0));
            const amt = toC(Math.max(1000, +a.amount || 0));
            if (amt > max)
                return bad(`Your bank will lend at most ${money(max)} more.`);
            const rate = 0.07 + (s.difficulty === "hard" ? 0.02 : 0) - s.rep / 2000;
            s.loans.push({ id: nid(s, "loan"), principal: amt, left: amt, rate, day: s.day });
            cashIn(s, "loan", "Bank loan drawn", amt);
            return ok(`Loan approved at ${(rate * 100).toFixed(1)}%. Repaid in 12 monthly instalments.`);
        }
        case "repay": {
            const l = s.loans.find((x) => x.id === a.id);
            if (!l)
                return bad("No loan.");
            if (s.cash < l.left)
                return bad("Not enough cash to repay in full.");
            cashOut(s, "loan", "Loan repaid early", l.left);
            s.loans = s.loans.filter((x) => x !== l);
            return ok();
        }
        case "expandWh": {
            if (s.whSize >= 6)
                return bad("Largest warehouse already.");
            const dep = toC(5000);
            if (s.cash < dep)
                return bad("Not enough cash for the fit-out deposit ($5,000).");
            cashOut(s, "rent", "Warehouse expansion fit-out", dep);
            plOf(s).other += dep;
            s.whSize++;
            return ok(`Capacity now ${whCap(s)} m3. Rent rises by ${money(toC(WH_STEP_RENT))} per month.`);
        }
        case "rename":
            s.name = String(a.name).slice(0, 40) || s.name;
            return ok();
        default: {
            const w = workforceAction(s, a);
            return w ?? bad("Unknown action " + a.type);
        }
    }
}
function sendQuote(s, a, rng) {
    const r = rfqOf(s, a.rfq);
    if (!r || !inFlow(r))
        return bad("This RFQ is no longer open.");
    if (r.status !== "negotiating" && s.day > r.due)
        return bad("The quotation deadline has passed.");
    for (const [i, l] of r.lines.entries()) {
        const t = l.alloc.reduce((x, y) => x + y.qty, 0);
        if (t < l.qty)
            return bad(`Line ${i + 1} is not fully sourced (${t}/${l.qty}). Allocate quotes or stock first.`);
        for (const al of l.alloc)
            if (al.quote) {
                const q = s.quotes.find((x) => x.id === al.quote);
                if (!q || q.status !== "received" || q.expiry < s.day)
                    return bad(`A supplier quotation on line ${i + 1} expired. Ask again or choose another.`);
            }
    }
    const land = landedCost(s, r);
    if (land.issues.length)
        return bad(land.issues[0]);
    const opt = r.opt ?? {};
    const prev = r.cq;
    const lineUnits = r.lines.map((l, i) => Math.round(land.byLine[i].unit * (1 + l.margin / 100)));
    if (a.keepPrices && prev) { /* keep the discounted unit prices from a customer-accepted ask */ }
    const promise = Math.max(opt.promiseDays ?? 0, land.eta + 2);
    const round = prev ? prev.round + 1 : 1;
    const ccur = DB.clientById[r.client] && COUNTRY[DB.clientById[r.client].country]?.cur;
    const qcur = opt.cur && opt.cur !== "USD" && opt.cur === ccur && s.fx[opt.cur] ? opt.cur : undefined;
    const cq = { cur: qcur, fxAt: qcur ? s.fx[qcur] : undefined, termsDays: opt.termsDays ?? 30, promiseDays: a.promiseDays ?? promise, warrantyM: opt.warrantyM ?? 12, partialOk: !!opt.partialOk, sentDay: s.day, replyDay: s.day + Math.max(1, rng.int(2, 5) - (s.staff.sales > 2 ? 1 : 0)), round, status: "sent", clarified: prev?.clarified ?? false, total: lineUnits.reduce((t, u, i) => t + u * r.lines[i].qty, 0), lineUnits };
    r.cq = cq;
    r.status = "quoted";
    return ok(`Quotation ${round > 1 ? "revision " + round + " " : ""}sent. The customer will reply in a few days.`);
}
function replyCustomer(s, a, rng) {
    const r = rfqOf(s, a.rfq);
    if (!r || !r.cq || r.cq.status !== "replied")
        return bad("Nothing to reply to.");
    const cq = r.cq, resp = cq.resp, land = landedCost(s, r);
    if (a.act === "walk") {
        r.status = "lost";
        cq.status = "rejected";
        s.stats.lost++;
        return ok("You declined. RFQ closed.");
    }
    if (a.act === "clarify") {
        cq.clarified = true;
        cq.round = cq.round;
        cq.status = "sent";
        cq.replyDay = s.day + (s.staff.tech > 0 ? 1 : 2);
        if (s.staff.tech === 0 && rng.chance(0.15))
            cq.clarified = false;
        return ok("Datasheets and certificates sent.");
    }
    if (a.act === "accept_ask") {
        if (resp.type === "discount" && resp.discount) {
            cq.lineUnits = cq.lineUnits.map((u) => Math.round(u * (1 - resp.discount / 100)));
        }
        else if (resp.type === "delivery" && resp.days) {
            if (land.eta + 1 > resp.days)
                return bad(`Your current sourcing needs ${land.eta + 1} days. Use stock, a faster freight mode or a faster supplier to promise ${resp.days}.`);
            cq.promiseDays = resp.days;
        }
        else if (resp.type === "warranty" && resp.warrantyM) {
            cq.warrantyM = resp.warrantyM;
            cq.lineUnits = cq.lineUnits.map((u) => Math.round(u * 0.985));
        }
        else
            return bad("Use Counter / revise for this reply.");
        cq.total = cq.lineUnits.reduce((t, u, i) => t + u * r.lines[i].qty, 0);
        cq.round++;
        cq.status = "sent";
        cq.replyDay = s.day + 1;
        return ok("Customer's request accepted. They will confirm tomorrow.");
    }
    return bad("Unknown reply.");
}
function placeOrders(s, a, rng) {
    const so = s.sos.find((x) => x.id === a.so);
    if (!so)
        return bad("No sales order.");
    if (so.purchased)
        return bad("Purchase orders already placed.");
    const r = s.rfqs.find((x) => x.id === so.rfq);
    const groups = {};
    for (const [i, l] of r.lines.entries()) {
        if (!so.lines.some((x) => x.rfqLine === i))
            continue;
        for (const al of l.alloc)
            if (al.quote) {
                const q = s.quotes.find((x) => x.id === al.quote);
                if (q.status !== "received")
                    return bad("A supplier quotation is no longer valid.");
                if (q.expiry < s.day) {
                    q.unit = Math.round(q.unit * 1.04);
                    q.expiry = s.day + 3;
                    news(s, `Supplier quotation ${q.id} had expired: ${DB.supplierById[q.supplier].name} re-priced +4% to honour the order.`, "warn");
                }
                (groups[q.supplier] ??= []).push({ q, qty: al.qty, soLine: i });
            }
    }
    if (!Object.keys(groups).length) {
        so.purchased = true;
        return ok("Everything for this order comes from your own stock. No purchase needed.");
    }
    // cash needed for prepay
    const need = Object.entries(groups).reduce((t, [sid, g]) => t + (g[0].q.terms === "prepay" ? g.reduce((x, y) => x + y.qty * y.q.unit, 0) : 0), 0);
    const lcVal = Object.values(groups).reduce((t, g) => t + (g[0].q.terms === "lc" ? g.reduce((x, y) => x + y.qty * y.q.unit, 0) : 0), 0);
    if (lcVal) {
        const lc = lcOf(s);
        if (lc.used + lcVal > lc.limit)
            return bad(`Letter of credit limit exceeded: this order needs ${money(lcVal)} but only ${money(lc.limit - lc.used)} of your ${money(lc.limit)} bank limit is free. Pay a supplier first or ask the bank for a higher limit (Banking page).`);
        if (Math.round(lcVal * 0.1) + need > s.cash)
            return bad(`The bank wants a 10% cash margin deposit (${money(Math.round(lcVal * 0.1))}) to open the letter(s) of credit.`);
    }
    if (need > s.cash)
        return bad(`Prepayment needed: ${money(need)}. You have ${money(s.cash)}. Take a loan or negotiate credit terms.`);
    for (const [sid, g] of Object.entries(groups)) {
        const sup = DB.supplierById[sid];
        const inc = g[0].q.incoterm;
        const value = g.reduce((t, x) => t + x.qty * x.q.unit, 0);
        const kg = g.reduce((t, x) => t + x.qty * DB.partsById[x.q.partId].kg, 0), vol = g.reduce((t, x) => t + x.qty * DB.partsById[x.q.partId].vol, 0);
        const lead = Math.max(...g.map((x) => x.q.leadD));
        const pick = r.ship[sid];
        const arranged = FREIGHT_INCLUDED.has(inc) || sup.country === "QA";
        let fr = 0, ins = 0, days = sup.country === "QA" ? 1 : Math.round(8 + (COUNTRY[sup.country] ? Math.abs(COUNTRY[sup.country].lon - 51.5) / 12 : 8)), logi = pick?.logi ?? "", mode = (pick?.mode ?? "road");
        if (!arranged) {
            const lg = DB.logiById[pick.logi];
            const fq = freightQuote(s, lg, pick.mode, sup.country, kg, vol, value, pick.insure, g.some((x) => CAT[DB.partsById[x.q.partId].cat].dg));
            if (!fq.ok)
                return bad(fq.why ?? "Freight not possible");
            fr = fq.cost;
            ins = fq.ins;
            days = fq.days;
            const m = s.mods.freight[lg.id];
            if (m && m.until > s.day && m.f < 1)
                s.flags.disc_freight = true;
        }
        if (arranged && !FREIGHT_INCLUDED.has(inc))
            mode = "road";
        if (arranged && sup.country !== "QA")
            mode = kg > 150 ? "sea" : "airfreight";
        const lg2 = logi ? DB.logiById[logi] : undefined;
        const delayP = (1 - sup.reliab) + (lg2 ? (1 - lg2.reliab) * 0.5 : 0.04);
        const delay = rng.chance(delayP) ? rng.int(2, 9) : 0;
        const poId = nid(s, "po"), shId = nid(s, "sh");
        const dutyC = inc === "DDP" || sup.country === "QA" ? 0 : g.reduce((t, x) => t + Math.round((x.qty * x.q.unit + (fr + ins) * ((x.qty * DB.partsById[x.q.partId].kg) / Math.max(0.0001, kg))) * (CAT[DB.partsById[x.q.partId].cat].group === "med" ? 0 : COUNTRY[sup.country].duty / 100)), 0);
        const po = { id: poId, no: `PO-${String(3000 + poId)}`, so: so.id, supplier: sid, lines: g.map((x) => ({ partId: x.q.partId, qty: x.qty, unit: x.q.unit, soLine: x.soLine })), day: s.day, readyDay: s.day + lead + delay, incoterm: inc, terms: g[0].q.terms, status: "placed", ship: shId, value, delayed: delay, wrongItem: rng.chance(sup.risk * 0.6), prepaid: g[0].q.terms === "prepay", docs: g[0].q.docs };
        const sh = { id: shId, no: `SHP-${String(8000 + shId)}`, po: poId, logi: logi || "supplier", mode, from: sup.country, day: s.day, depart: s.day + lead + delay, arrive: s.day + lead + delay + days + (lg2 && rng.chance(1 - lg2.reliab) ? rng.int(1, 5) : 0), status: "booked", kg, vol, freight: fr + ins, insured: !!pick?.insure, duty: dutyC, clearance: sup.country === "QA" ? 0 : toC(85), local: sup.country === "QA" ? 0 : toC(Math.max(45, kg * 0.12)), heldUntil: 0, supplierArranged: arranged, inspect: false, docsOk: true, dutyPaid: false, cleared: false };
        if (po.terms === "lc") {
            po.lcMargin = Math.round(value * 0.1);
            cashOut(s, "supplier", `LC margin deposit ${po.no}`, po.lcMargin);
            lcOf(s).used += value;
        }
        s.pos.push(po);
        s.ships.push(sh);
        for (const x of g)
            x.q.status = "ordered";
        if (po.prepaid) {
            cashOut(s, "supplier", `Prepayment ${po.no} to ${sup.name}`, value);
        }
        const bank = Math.max(Math.round(value * (po.terms === "lc" ? 0.012 : 0.0035)), toC(8));
        cashOut(s, "bank", `Bank charges ${po.no}`, bank);
        plOf(s).bank += bank;
        s.docs.push({ id: po.no, kind: "po", ref: String(po.id), day: s.day });
    }
    so.purchased = true;
    s.flags.po_placed = true;
    return ok(`${Object.keys(groups).length} purchase order(s) placed and freight booked.`);
}
export { netWorth, isOpen, whRentMonth, registrationCheck };
