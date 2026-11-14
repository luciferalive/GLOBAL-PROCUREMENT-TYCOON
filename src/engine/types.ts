import type { Mode, Terms } from "../data/db.js";
/** All money is integer US cents. Foreign-currency amounts are converted at the rate locked when the quote was made. */
export type Cents = number;
export interface Alloc { quote?: string; stockLot?: string; qty: number }
export interface RfqLine { partId: string; qty: number; ref: Cents; certs: string[]; note: string; alloc: Alloc[]; margin: number }
export type RfqStatus = "new" | "sourcing" | "quoted" | "negotiating" | "awarded" | "lost" | "expired" | "cancelled" | "completed";
export interface CustResp { type: "accept" | "partial" | "reject" | "discount" | "revise" | "delivery" | "warranty" | "clarify" | "cancel"; msg: string; discount?: number; days?: number; warrantyM?: number; lines?: number[]; rival?: string }
export interface CustQuote { termsDays: number; promiseDays: number; warrantyM: number; partialOk: boolean; sentDay: number; replyDay: number; round: number; status: "draft" | "sent" | "replied" | "accepted" | "rejected"; resp?: CustResp; clarified: boolean; total: Cents; lineUnits: Cents[] }
export interface Rfq { id: number; no: string; client: string; day: number; due: number; needDays: number; dest: string; incoterm: string; urgent: boolean; status: RfqStatus; lines: RfqLine[]; seen: boolean; cq: CustQuote | null; so: number | null; ship: Record<string, { logi: string; mode: Mode; insure: boolean }>; note: string; rivals?: { id: string; bid: number }[] }
export interface Quote { id: string; rfq: number; line: number; supplier: string; partId: string; status: "pending" | "received" | "declined" | "expired" | "ordered"; askedDay: number; replyDay: number; expiry: number; unit: Cents; cur: string; fx: number; qtyAvail: number; inStock: boolean; leadD: number; warrantyM: number; incoterm: string; terms: Terms; docs: "full" | "basic" | "none"; round: number; note: string; negBusyUntil: number; moq: number; alt?: boolean; rev?: { unit?: Cents; terms?: Terms; ok: boolean; msg: string } }
export interface SoLine { partId: string; qty: number; unit: Cents; delivered: number; rfqLine: number }
export interface So { id: number; no: string; rfq: number; client: string; day: number; needBy: number; termsDays: number; warrantyM: number; lines: SoLine[]; status: "open" | "delivering" | "delivered" | "closed" | "cancelled"; deliveryDay: number | null; purchased: boolean }
export interface PoLine { partId: string; qty: number; unit: Cents; soLine: number }
export interface Po { id: number; no: string; so: number; supplier: string; lines: PoLine[]; day: number; readyDay: number; incoterm: string; terms: Terms; status: "placed" | "ready" | "shipped" | "received" | "inspected" | "late"; ship: number | null; value: Cents; delayed: number; wrongItem: boolean; prepaid: boolean; docs: "full" | "basic" | "none"; fromStock?: boolean }
export interface Shipment { id: number; no: string; po: number; logi: string; mode: Mode; from: string; day: number; depart: number; arrive: number; status: "booked" | "in_transit" | "customs" | "held" | "cleared" | "delivered"; kg: number; vol: number; freight: Cents; insured: boolean; duty: Cents; clearance: Cents; local: Cents; heldUntil: number; supplierArranged: boolean; inspect: boolean; docsOk: boolean; dutyPaid: boolean; cleared: boolean }
export interface Lot { id: string; partId: string; qty: number; unitCost: Cents; so: number | null; soLine: number; day: number; batch: string; serial: string; status: "inspection" | "ok" | "damaged"; damaged: number; po: number; inspectDay: number }
export interface Invoice { id: number; no: string; so: number; client: string; amount: Cents; issue: number; due: number; payDay: number; paid: boolean; cogs: Cents }
export interface Payable { id: number; to: string; kind: "supplier" | "freight" | "customs" | "claim"; ref: string; amount: Cents; due: number; paid: boolean; po: number }
export interface Loan { id: number; principal: Cents; left: Cents; rate: number; day: number }
export interface Reg { stage: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; since: number; wait: number; result: "" | "approved" | "rejected"; reason: string; retryDay: number }
export interface Staff { sales: number; proc: number; logistics: number; warehouse: number; finance: number; quality: number; customs: number; bd: number; tech: number }
export interface News { day: number; text: string; kind: "info" | "good" | "bad" | "warn" }
export interface Ledger { day: number; kind: string; text: string; amount: Cents }
export interface Pl { rev: Cents; cogs: Cents; salaries: Cents; rent: Cents; freight: Cents; customs: Cents; bank: Cents; interest: Cents; tax: Cents; other: Cents }
export interface Doc { id: string; kind: string; ref: string; day: number }
export interface Rival { id: string; wins: number; losses: number; lastSeen: number }
export interface GameState {
  rivals?: Rival[];
  version: number; day: number; seed: number; name: string; difficulty: "easy" | "normal" | "hard"; over: string;
  cash: Cents; rep: number; fx: Record<string, number>; industries: string[]; certs: string[]; certPending: Record<string, number>; staff: Staff; whSize: number; paused: boolean; speed: number;
  rel: Record<string, number>; reg: Record<string, Reg>; rfqs: Rfq[]; quotes: Quote[]; sos: So[]; pos: Po[]; ships: Shipment[]; lots: Lot[]; invoices: Invoice[]; payables: Payable[]; loans: Loan[]; ledger: Ledger[]; news: News[]; docs: Doc[];
  pl: Record<string, Pl>; counters: Record<string, number>; flags: Record<string, boolean>; mods: { price: Record<string, { f: number; until: number; why: string }>; freight: Record<string, { f: number; until: number; why: string }>; customsUntil: number; payDelayUntil: number }; missions: string[]; hist: { day: number; cash: Cents; nw: Cents; rev: Cents }[]; stats: { won: number; lost: number; delivered: number; late: number; revenue: Cents; countries: string[] };
}
export type Action = { type: string; [k: string]: any };
export interface Result { ok: boolean; msg?: string }
