import { COUNTRIES, COUNTRY, km } from "./countries.js";
import { CATS, CAT, CLIENTS_RAW, DISTRIBUTORS_RAW, INDUSTRIES, LOGI_RAW, OEMS } from "./lists.js";
import { Rng, hash } from "../engine/rng.js";
export const MODES = ["express", "airfreight", "economy", "sea", "road", "rail"];
export const MODE_LABEL = { express: "Express courier", airfreight: "Air freight", economy: "Economy courier", sea: "Sea freight", road: "Road freight", rail: "Rail freight" };
export const PERSONA_LABEL = { price: "Price-focused", quality: "Quality-focused", delivery: "Delivery-focused", relationship: "Relationship-focused", oemonly: "OEM-only", cert: "Certification-focused", emergency: "Emergency buyer", contract: "Long-term contract buyer" };
const STEMS = {
    QA: ["Doha", "Lusail", "Al Rayyan", "Pearl", "Mesaieed", "Al Khor", "West Bay", "Wakra"], AE: ["Dubai", "Jebel Ali", "Sharjah", "Emirates", "Abu Dhabi", "Ajman"], SA: ["Riyadh", "Dammam", "Jubail", "Najd", "Red Sea"], KW: ["Kuwait", "Salmiya", "Gulf Bay"], OM: ["Muscat", "Sohar", "Salalah"],
    DE: ["Rhein", "Bavaria", "Hansa", "Nord", "Ruhr", "Saxon"], GB: ["Thames", "Midlands", "Albion", "Mersey", "Tyne"], US: ["Texas", "Gulf Coast", "Midwest", "Liberty", "Pacific"], CN: ["Shenzhen", "Pearl River", "Yangtze", "Dragon", "Shanghai"], IN: ["Mumbai", "Deccan", "Chennai", "Gujarat", "Pune"], JP: ["Osaka", "Nagoya", "Sakura", "Kanto"], KR: ["Busan", "Incheon", "Hanbit"], IT: ["Lombardia", "Torino", "Veneto", "Emilia"], FR: ["Lyon", "Rhone", "Normandie", "Provence"], NL: ["Rotterdam", "Brabant", "Delta"], ES: ["Iberia", "Valencia", "Catalunya"], TR: ["Anatolia", "Bosphorus", "Izmir"], SG: ["Straits", "Lion City", "Merlion"], MY: ["Penang", "Klang", "Johor"], TH: ["Siam", "Chao Phraya", "Rayong"], AU: ["Southern Cross", "Pilbara", "Coral"], CH: ["Helvetia", "Alpen"], SE: ["Nordic", "Gota"], NO: ["Fjord", "Nordsjo"], DK: ["Jutland", "Oresund"], FI: ["Baltic", "Suomi"], EG: ["Nile", "Delta Cairo", "Suez"], BR: ["Paulista", "Santos"], CA: ["Maple", "Great Lakes"],
};
const FORM = { QA: "WLL", AE: "LLC", SA: "Co.", KW: "WLL", OM: "LLC", DE: "GmbH", GB: "Ltd", US: "Inc.", CN: "Co., Ltd", IN: "Pvt Ltd", JP: "K.K.", KR: "Co., Ltd", IT: "S.p.A.", FR: "SARL", NL: "B.V.", ES: "S.L.", TR: "A.S.", SG: "Pte Ltd", MY: "Sdn Bhd", TH: "Co., Ltd", AU: "Pty Ltd", CH: "AG", SE: "AB", NO: "AS", DK: "A/S", FI: "Oy", EG: "S.A.E.", BR: "Ltda", CA: "Inc." };
const DIST_NOUN = ["Industrial Supply", "Electrical Wholesale", "Technical Trading", "Engineering Distribution", "Automation Supply", "Mechanical Components", "Tool & Safety Supply", "Process Equipment"];
const TRADER_NOUN = ["Trading Co", "Global Traders", "Sourcing", "Exports", "Industrial Brokers", "Surplus Traders", "Procurement Services"];
const LOCAL_NOUN = ["Industrial Solutions", "Engineering Works", "Technical Services", "Maintenance Supplies", "Contracting Supplies", "Workshop & Stores"];
const CLIENT_NOUN = {
    oilgas: ["Petroleum Services", "Drilling Company", "Energy Operations", "Gas Processing"], petrochem: ["Petrochemicals", "Chemical Industries", "Polymers"], power: ["Power & Water", "Generation Company", "Utilities"], construction: ["Contracting", "Construction Group", "Projects"], infra: ["Infrastructure Developers", "Civil Engineering", "Metro Projects"], aviation: ["Aviation Services", "Ground Handling", "Airline Technical"], aerospace: ["Aerostructures", "Aerospace Systems"], marine: ["Shipping Lines", "Marine Services", "Shipyard"], offshore: ["Offshore Services", "Subsea Engineering"], medical: ["Medical Supplies", "MedTech Distribution"], healthcare: ["Hospital Group", "Healthcare Network", "Medical Centre"], mining: ["Mining Company", "Minerals"], automotive: ["Motors Industries", "Auto Components"], telecom: ["Telecom", "Networks"], datacenter: ["Data Centres", "Cloud Infrastructure"], renewable: ["Renewables", "Solar Power"], rail: ["Rail Systems", "Railways Operations"], defence: ["Defence Systems", "Security Technologies"], water: ["Water Utilities", "Desalination"], automation: ["Automation Systems", "Controls & Instrumentation"], general: ["Facilities Management", "Industrial Services"], electrical: ["Electrical Contracting", "Power Installations"], mechanical: ["Mechanical Works", "Steel & Fabrication"], mro: ["Industrial Maintenance", "Plant Services"], safety: ["Safety Services", "Fire & Safety"], consumables: ["Industrial Services"], tools: ["Industrial Services"],
};
const STARTERS = [["Doha Facilities Management WLL", "general"], ["Lusail Electrical Contracting WLL", "electrical"], ["Al Khor Mechanical Works WLL", "mechanical"], ["Pearl Industrial Maintenance WLL", "mro"], ["West Bay Safety Services WLL", "safety"], ["Mesaieed Plant Services WLL", "tools"]];
const PERSONAS = ["price", "quality", "delivery", "relationship", "oemonly", "cert", "emergency", "contract"];
export function buildDb() {
    const r = new Rng(20260101);
    const codes = COUNTRIES.map((c) => c.code);
    // ---- parts
    const parts = [];
    for (const oem of OEMS) {
        const rr = new Rng(hash(oem.name));
        const cats = CATS.filter((c) => oem.groups.includes(c.group) && (c.inds.some((i) => oem.inds.includes(i)) || rr.chance(0.25)));
        const chosen = rr.shuffle(cats).slice(0, 6);
        const pre = oem.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
        for (const c of chosen)
            for (let v = 0; v < 3; v++) {
                const k = (v + rr.range(0.1, 0.9)) / 3; // 0..1 spread across variants
                const list = Math.round(c.lo * Math.pow(c.hi / c.lo, Math.min(1, k * rr.range(0.55, 1.0))) * 100) / 100;
                const kg = Math.max(0.1, Math.round(c.kg * (0.6 + v * 0.5) * 10) / 10);
                const spec = ["Standard", "Heavy-duty", "Premium"][v];
                parts.push({ id: `${oem.id}-${c.id}-${v}`, oem: oem.id, cat: c.id, pn: `${pre}-${String(hash(oem.name + c.id + v) % 90000 + 10000)}-${["A", "B", "C"][v]}`, desc: `${oem.name} ${c.name} (${spec})`, list, kg, vol: Math.round((kg / 250 + 0.002) * 1000) / 1000, cert: c.cert });
            }
    }
    const partsById = {}, partsByOem = {};
    for (const p of parts) {
        partsById[p.id] = p;
        (partsByOem[p.oem] ??= []).push(p);
    }
    // ---- suppliers
    const suppliers = [];
    const oemSupplier = {};
    const termsPick = (rr, t) => t === "oem" ? rr.pick(["prepay", "lc", "net30", "prepay"]) : t === "distributor" ? rr.pick(["net30", "net30", "net60", "prepay"]) : t === "trader" ? rr.pick(["prepay", "prepay", "lc"]) : rr.pick(["net30", "net30", "net60"]);
    for (const o of OEMS) {
        const rr = new Rng(hash("s" + o.name));
        const s = { id: "s_" + o.id, name: o.name + " (OEM)", type: "oem", country: o.country, brands: [o.id], groups: o.groups, inds: o.inds, priceF: round2(rr.range(0.78, 0.9)), stockP: rr.range(0.35, 0.7), leadD: rr.int(10, 30), terms: termsPick(rr, "oem"), reliab: rr.range(0.9, 0.99), docs: "full", respD: rr.int(2, 6), risk: 0.02, auth: true, blurb: "Manufacturer direct. Best documentation, strictest terms.", real: true };
        suppliers.push(s);
        oemSupplier[o.id] = s;
    }
    const mkDist = (name, country, real) => {
        const rr = new Rng(hash("d" + name + country));
        const grp = rr.shuffle(["elec", "mech", "inst", "tools", "it", "batt"]).slice(0, rr.int(2, 4));
        const brands = rr.shuffle(OEMS.filter((o) => o.groups.some((g) => grp.includes(g)))).slice(0, rr.int(8, 22)).map((o) => o.id);
        const auth = rr.chance(0.65), prof = rr.pick(["cheap", "fast", "balanced", "prepay"]);
        const priceF = prof === "cheap" ? rr.range(0.86, 0.95) : prof === "fast" ? rr.range(1.0, 1.15) : rr.range(0.93, 1.05);
        const s = { id: "s_d" + suppliers.length, name, type: "distributor", country, brands, groups: grp, inds: [...new Set(OEMS.filter((o) => brands.includes(o.id)).flatMap((o) => o.inds))], priceF: round2(priceF), stockP: prof === "fast" ? rr.range(0.8, 0.97) : prof === "cheap" ? rr.range(0.3, 0.55) : rr.range(0.55, 0.85), leadD: prof === "fast" ? rr.int(2, 7) : prof === "cheap" ? rr.int(18, 40) : rr.int(7, 21), terms: prof === "prepay" ? "prepay" : termsPick(rr, "distributor"), reliab: rr.range(0.82, 0.98), docs: auth ? "full" : "basic", respD: rr.int(1, 4), risk: auth ? 0.03 : 0.08, auth, blurb: prof === "cheap" ? "Excellent price, long delivery, limited stock." : prof === "fast" ? "Higher price, stock available, fast delivery." : prof === "prepay" ? "Competitive price but advance payment required." : auth ? "Authorized distributor: full OEM documentation." : "Reliable regional distributor.", real };
        suppliers.push(s);
    };
    for (const [n, c] of DISTRIBUTORS_RAW)
        mkDist(n, c, true);
    for (let i = 0; i < 110; i++) {
        const c = r.pick(codes), st = r.pick(STEMS[c] ?? ["Global"]);
        mkDist(`${st} ${r.pick(DIST_NOUN)} ${FORM[c] ?? "Ltd"}`, c, false);
    }
    for (let i = 0; i < 140; i++) {
        const c = r.pick(["AE", "CN", "IN", "TR", "SG", "MY", "TH", "DE", "GB", "US", "IT", "KR", "EG", "AE", "CN"]), rr = new Rng(hash("t" + i)), st = r.pick(STEMS[c] ?? ["Global"]);
        const grp = rr.shuffle(["elec", "mech", "inst", "tools", "it", "batt", "oilgas", "marine", "constr", "aero", "med"]).slice(0, rr.int(2, 5));
        const brands = rr.shuffle(OEMS.filter((o) => o.groups.some((g) => grp.includes(g)))).slice(0, rr.int(10, 30)).map((o) => o.id);
        suppliers.push({ id: "s_t" + i, name: `${st} ${r.pick(TRADER_NOUN)} ${FORM[c] ?? "Ltd"}`, type: "trader", country: c, brands, groups: grp, inds: INDUSTRIES.map((x) => x.id), priceF: round2(rr.range(0.7, 0.9)), stockP: rr.range(0.4, 0.9), leadD: rr.int(5, 28), terms: termsPick(rr, "trader"), reliab: rr.range(0.65, 0.9), docs: rr.pick(["basic", "none", "basic"]), respD: rr.int(1, 3), risk: rr.range(0.1, 0.28), auth: false, blurb: "Independent trader: attractive prices, higher commercial risk, weak paperwork.", real: false });
    }
    const LOCAL_CC = ["QA", "QA", "QA", "AE", "AE", "SA", "KW", "OM"];
    for (let i = 0; i < 95; i++) {
        const c = r.pick(LOCAL_CC), rr = new Rng(hash("l" + i)), st = r.pick(STEMS[c]), grp = rr.shuffle(["elec", "mech", "inst", "tools", "batt", "constr"]).slice(0, rr.int(1, 3));
        suppliers.push({ id: "s_l" + i, name: `${st} ${r.pick(LOCAL_NOUN)} ${FORM[c]}`, type: "local", country: c, brands: [], groups: grp, inds: ["general", "electrical", "mechanical", "mro", "safety", "tools", "consumables", "construction"], priceF: round2(rr.range(0.97, 1.14)), stockP: rr.range(0.6, 0.95), leadD: rr.int(1, 6), terms: termsPick(rr, "local"), reliab: rr.range(0.85, 0.98), docs: "basic", respD: 1, risk: 0.05, auth: false, blurb: "Local stockist: quick and convenient, higher price, generic or own-brand items.", real: false });
    }
    // ---- clients
    const clients = [];
    const mkClient = (name, country, industry, real, starter = false) => {
        const rr = new Rng(hash("c" + name));
        const big = real && !starter;
        const persona = starter ? rr.pick(["price", "relationship", "delivery", "emergency"]) : rr.pick(PERSONAS);
        const vol = starter ? rr.int(1, 2) : big ? rr.int(3, 5) : rr.int(1, 4);
        clients.push({ id: "c" + clients.length, name, country, industry, persona, volume: vol, payRel: round2(starter ? rr.range(0.8, 0.95) : rr.range(0.55, 0.99)), rfqFreq: round2((starter ? 0.22 : 0.05 + vol * 0.03) * rr.range(0.7, 1.3)), contract: Math.round(2000 * Math.pow(3.2, vol) * rr.range(0.7, 1.4)), qual: starter ? 0 : Math.min(5, Math.max(1, vol + rr.int(-1, 1) + (persona === "cert" ? 1 : 0))), terms: rr.pick([30, 30, 45, 60, 60, 90]), real, starter, note: real ? "Real-world name used only as a reference. Everything about this account is simulated." : "Fictional company." });
    };
    for (const [n, ind] of STARTERS)
        mkClient(n, "QA", ind, false, true);
    for (const row of CLIENTS_RAW.split(";")) {
        const [n, c, ind] = row.split("|");
        mkClient(n, c, ind, true);
    }
    const indIds = INDUSTRIES.map((i) => i.id);
    while (clients.length < 320) {
        const c = r.pick(codes), ind = r.pick(indIds), nn = r.pick(CLIENT_NOUN[ind] ?? ["Industrial Services"]), st = r.pick(STEMS[c] ?? ["Global"]);
        const name = `${st} ${nn} ${FORM[c] ?? "Ltd"}`;
        if (clients.some((x) => x.name === name))
            continue;
        mkClient(name, c, ind, false);
    }
    // ---- logistics
    const logistics = [];
    const baseRate = { express: 9.5, airfreight: 3.6, economy: 5.8, sea: 0.5, road: 0.9, rail: 0.7 };
    const mkLogi = (name, country, kind, real) => {
        const rr = new Rng(hash("L" + name));
        const modes = kind === "express" ? ["express", "economy", "airfreight"] : kind === "aircargo" ? ["airfreight"] : kind === "ocean" ? ["sea"] : kind === "road" ? ["road"] : kind === "rail" ? ["rail", "sea"] : ["airfreight", "sea", "road", ...(rr.chance(0.5) ? ["rail"] : [])];
        const prem = kind === "express" ? rr.range(1.0, 1.25) : rr.range(0.85, 1.15);
        const rate = {};
        for (const m of modes)
            rate[m] = round2(baseRate[m] * prem * rr.range(0.9, 1.1));
        logistics.push({ id: "l" + logistics.length, name, country, kind, modes, rate, min: Math.round(rr.range(35, 120)), fuel: round2(rr.range(0.06, 0.22)), docFee: Math.round(rr.range(25, 85)), collect: Math.round(rr.range(15, 70)), reliab: round2(kind === "express" ? rr.range(0.9, 0.99) : rr.range(0.78, 0.97)), maxKg: kind === "express" ? 300 : kind === "forwarder" ? 20000 : 50000, dg: rr.chance(kind === "express" ? 0.4 : 0.7), temp: rr.chance(0.45), heavy: kind !== "express" && rr.chance(0.8), project: kind === "forwarder" && rr.chance(0.7), customs: kind !== "ocean" && kind !== "aircargo" || rr.chance(0.3), insPct: round2(rr.range(0.003, 0.009)), real });
    };
    for (const [n, c, k] of LOGI_RAW)
        mkLogi(n, c, k, true);
    const L_NOUN = ["Cargo Lines", "Freight Services", "Logistics", "Express", "Forwarding", "Transport", "Shipping Agency", "Haulage"], L_KIND = ["forwarder", "forwarder", "express", "road", "rail", "ocean", "aircargo", "forwarder"];
    for (let i = 0; i < 32; i++) {
        const c = r.pick(["QA", "AE", "SA", "IN", "CN", "TR", "DE", "SG", "GB", "US", "EG", "KW", "OM", "IT", "NL"]), st = r.pick(STEMS[c] ?? ["Global"]);
        mkLogi(`${st} ${r.pick(L_NOUN)} ${FORM[c]}`, c, L_KIND[i % L_KIND.length], false);
    }
    const ix = (a) => Object.fromEntries(a.map((x) => [x.id, x]));
    return { suppliers, clients, logistics, parts, oemSupplier, partsById, partsByOem, supplierById: ix(suppliers), clientById: ix(clients), logiById: ix(logistics) };
}
export const round2 = (n) => Math.round(n * 100) / 100;
export const DB = buildDb();
export { COUNTRY, CAT, INDUSTRIES, OEMS, km };
