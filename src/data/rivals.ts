export interface RivalDef { id: string; name: string; country: string; aggr: number; style: string }
/** Fictional competing trading houses. `aggr` is their typical bid as a share of the customer's reference price. */
export const RIVALS: RivalDef[] = [
  { id: "rv1", name: "Al Mirqab Industrial Supplies", country: "QA", aggr: 0.97, style: "Local incumbent with long customer relationships" },
  { id: "rv2", name: "Gulf Horizon Trading", country: "AE", aggr: 0.93, style: "Aggressive on price, thin margins, often late" },
  { id: "rv3", name: "Meridian Procurement Partners", country: "SA", aggr: 1.02, style: "Premium service, authorized-source only" },
  { id: "rv4", name: "Bosphorus Sourcing Co.", country: "TR", aggr: 0.95, style: "Fast quoting, strong with mechanical goods" },
  { id: "rv5", name: "Indus Global Traders", country: "IN", aggr: 0.91, style: "Lowest prices, cheap sourcing, weak documents" },
  { id: "rv6", name: "Nordic Tech Distribution", country: "SE", aggr: 1.05, style: "High price, top documentation and warranty" },
];
