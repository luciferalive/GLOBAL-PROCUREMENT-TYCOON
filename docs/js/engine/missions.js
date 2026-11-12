import { cashIn, news } from "./core.js";
import { toC } from "./pricing.js";
const act = (s, f) => s.rfqs.some(f);
/** The 14-step training campaign. Each step is checked against real game state. */
export const TRAINING = [
    { id: "t1", title: "Receive your first RFQ", page: "rfqs", text: "Open the RFQ inbox and click your first customer request.", why: "An RFQ (request for quotation) is a customer asking: what will you charge for these items?", check: (s) => s.flags.rfq_opened },
    { id: "t2", title: "Find the correct manufacturer", page: "rfqs", text: "In the RFQ, look at each line: the part number shows which manufacturer (OEM) makes it. Open the Suppliers page and find that brand.", why: "Only the brand owner and its authorized distributors can sell genuine parts.", check: (s) => s.flags.supplier_viewed },
    { id: "t3", title: "Request supplier quotations", page: "rfqs", text: "Inside the RFQ, press 'Ask 3 best suppliers' on a line.", why: "You never quote a customer before you know your cost.", check: (s) => s.quotes.length > 0 },
    { id: "t4", title: "Compare three suppliers", page: "rfqs", text: "Wait for replies (a few days). Get at least 3 received quotes for one line.", why: "Prices, stock, lead time and payment terms differ. Cheapest is not always best.", check: (s) => { const m = {}; for (const q of s.quotes)
            if (q.status === "received" || q.status === "ordered")
                m[q.rfq + "-" + q.line] = (m[q.rfq + "-" + q.line] ?? 0) + 1; return Object.values(m).some((n) => n >= 3); } },
    { id: "t5", title: "Negotiate the OEM price", page: "rfqs", text: "Press Negotiate on a received quote and ask for a few percent off.", why: "Suppliers often give a little. Asking too much hurts the relationship.", check: (s) => s.flags.negotiated },
    { id: "t6", title: "Request freight prices (DHL, Kuehne+Nagel)", page: "rfqs", text: "In the freight table, select a DHL option, then a Kuehne+Nagel option, and compare the price and days.", why: "Freight is a big part of the cost; modes trade speed against price.", check: (s) => s.flags.fr_dhl && s.flags.fr_kn },
    { id: "t7", title: "Calculate landed cost", page: "rfqs", text: "Allocate quotes to the lines and choose a freight option. Read the landed cost table.", why: "Landed cost = what the goods really cost you at your door, including freight, duty and bank charges.", check: (s) => s.flags.landed_viewed },
    { id: "t8", title: "Prepare your customer quotation", page: "rfqs", text: "Set your margin on each line and press 'Send quotation'.", why: "Selling price = landed cost + margin. Too high and you lose; too low and you lose money.", check: (s) => act(s, (r) => !!r.cq) },
    { id: "t9", title: "Negotiate with the customer", page: "rfqs", text: "Read the customer's reply. Counter, accept their ask, or send documents.", why: "Customers push back. Know your minimum margin.", check: (s) => act(s, (r) => !!r.cq?.resp) },
    { id: "t10", title: "Receive the purchase order", page: "orders", text: "When a customer accepts you get a sales order.", why: "This is the real, binding customer commitment.", check: (s) => s.sos.length > 0 },
    { id: "t11", title: "Arrange procurement and logistics", page: "orders", text: "Open the sales order and press 'Place purchase orders'.", why: "This buys from your suppliers and books the freight.", check: (s) => s.pos.length > 0 },
    { id: "t12", title: "Receive the shipment", page: "shipments", text: "Watch the shipment travel, clear customs and arrive. Speed up time to wait.", why: "Customs holds and supplier delays are normal. Plan buffer time.", check: (s) => s.flags.received },
    { id: "t13", title: "Inspect and deliver the goods", page: "warehouse", text: "Inspect the delivery in the warehouse, then press Deliver on the sales order.", why: "Inspect before you ship so you do not deliver broken goods.", check: (s) => s.flags.delivered },
    { id: "t14", title: "Receive payment and calculate profit", page: "finance", text: "Wait for the customer to pay the invoice, then check Finance.", why: "Profit is only real when cash arrives.", check: (s) => s.flags.paid },
];
export const MISSIONS = [
    { id: "m_first", title: "FIRST RFQ", text: "Send your first customer quotation.", reward: 500, rep: 1, check: (s) => s.rfqs.some((r) => !!r.cq) },
    { id: "m_won", title: "FIRST WIN", text: "Win your first order.", reward: 1000, rep: 2, check: (s) => s.stats.won >= 1 },
    { id: "m_de", title: "GERMAN OEM CONNECTION", text: "Receive goods sourced from Germany.", reward: 1000, rep: 2, check: (s) => s.stats.countries.includes("DE") },
    { id: "m_cn", title: "EAST MEETS GULF", text: "Receive goods sourced from China.", reward: 1000, rep: 2, check: (s) => s.stats.countries.includes("CN") },
    { id: "m_freight", title: "FREIGHT MASTER", text: "Book a shipment while a freight discount is running.", reward: 1500, rep: 2, check: (s) => s.flags.disc_freight },
    { id: "m_deliver5", title: "RELIABLE SUPPLIER", text: "Deliver 5 orders.", reward: 3000, rep: 3, check: (s) => s.stats.delivered >= 5 },
    { id: "m_deliver20", title: "TRUSTED PARTNER", text: "Deliver 20 orders.", reward: 10000, rep: 5, check: (s) => s.stats.delivered >= 20 },
    { id: "m_vendor", title: "APPROVED VENDOR", text: "Get approved by a new client.", reward: 2000, rep: 3, check: (s) => !!s.flags.vendor },
    { id: "m_oil", title: "OIL AND GAS ENTRY", text: "Unlock the oil and gas industry.", reward: 5000, rep: 4, check: (s) => s.industries.includes("oilgas") },
    { id: "m_aviation", title: "AVIATION ENTRY", text: "Unlock the aviation industry.", reward: 8000, rep: 5, check: (s) => s.industries.includes("aviation") },
    { id: "m_global", title: "GLOBAL SOURCING", text: "Receive goods from 5 countries.", reward: 6000, rep: 4, check: (s) => s.stats.countries.length >= 5 },
    { id: "m_global10", title: "GLOBAL EMPIRE", text: "Receive goods from 10 countries.", reward: 20000, rep: 8, check: (s) => s.stats.countries.length >= 10 },
    { id: "m_100k", title: "SIX-FIGURE REVENUE", text: "Collect 100,000 USD in total sales.", reward: 4000, rep: 3, check: (s) => s.stats.revenue >= toC(100_000) },
    { id: "m_million", title: "MILLIONAIRE COMPANY", text: "Collect 1,000,000 USD in total sales.", reward: 50000, rep: 10, check: (s) => s.stats.revenue >= toC(1_000_000) },
    { id: "m_wh", title: "WAREHOUSE EXPANSION", text: "Hold 500 inventory items.", reward: 3000, rep: 2, check: (s) => s.lots.reduce((a, l) => a + l.qty, 0) >= 500 },
    { id: "m_cert", title: "CERTIFIED", text: "Earn your first certification.", reward: 1500, rep: 2, check: (s) => s.certs.length >= 1 },
];
export function checkMissions(s) { for (const m of MISSIONS)
    if (!s.missions.includes(m.id) && m.check(s)) {
        s.missions.push(m.id);
        cashIn(s, "mission", `Mission reward: ${m.title}`, toC(m.reward));
        s.rep = Math.min(100, s.rep + m.rep);
        news(s, `Mission complete: ${m.title} (+$${m.reward.toLocaleString()}).`, "good");
    } }
