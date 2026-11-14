export interface Site { id: string; city: string; country: string; cap: number; rent: number; setup: number; regions: string[]; bonus: number; note: string }
/** Satellite consolidation warehouses. They add stock capacity and cut inbound transit for the regions they serve. */
export const SITES: Site[] = [
  { id: "jebel", city: "Dubai (Jebel Ali Free Zone)", country: "AE", cap: 120, rent: 3200, setup: 6000, regions: ["Asia", "Europe", "Africa", "Oceania"], bonus: 2, note: "Gulf transshipment hub: shipments are consolidated and trucked to Doha." },
  { id: "istanbul", city: "Istanbul", country: "TR", cap: 100, rent: 2400, setup: 4500, regions: ["Europe"], bonus: 3, note: "Cheap European consolidation point close to the Gulf." },
  { id: "shenzhen", city: "Shenzhen", country: "CN", cap: 100, rent: 2200, setup: 4500, regions: ["Asia"], bonus: 3, note: "Electronics and components from Asian factories, consolidated before air or sea." },
  { id: "rotterdam", city: "Rotterdam", country: "NL", cap: 100, rent: 3000, setup: 5500, regions: ["Europe", "Americas"], bonus: 3, note: "Europe's biggest port: sea consolidation for European and Atlantic suppliers." },
  { id: "singapore", city: "Singapore", country: "SG", cap: 90, rent: 3000, setup: 5500, regions: ["Asia", "Oceania"], bonus: 3, note: "Southeast Asia hub with fast, reliable forwarding." },
];
export const SITE = Object.fromEntries(SITES.map((s) => [s.id, s]));
