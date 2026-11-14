import { COUNTRY } from "../data/countries.js";
import { DB } from "../data/db.js";
import type { GameState } from "../engine/types.js";
import { esc } from "./dom.js";

const W = 1000, H = 440, LAT0 = 72, LAT1 = -50;
const px = (lon: number) => ((lon + 180) / 360) * W, py = (lat: number) => ((LAT0 - lat) / (LAT0 - LAT1)) * H;
const LAND: [number, number][][] = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 63], [-60, 50], [-67, 45], [-80, 32], [-97, 26], [-105, 22], [-117, 32], [-125, 42], [-130, 55], [-150, 60]],
  [[-80, 10], [-60, 10], [-35, -6], [-40, -22], [-58, -38], [-70, -50], [-75, -40], [-72, -18], [-81, -5]],
  [[-10, 36], [-9, 43], [0, 50], [-5, 58], [10, 63], [28, 70], [40, 66], [40, 50], [28, 41], [15, 38]],
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 11], [40, -15], [33, -27], [20, -35], [12, -17], [9, 4], [-8, 5]],
  [[40, 66], [70, 72], [110, 74], [150, 70], [175, 66], [140, 52], [130, 34], [122, 25], [108, 10], [100, 2], [93, 17], [80, 8], [72, 20], [60, 25], [50, 30], [36, 36], [28, 41], [40, 50]],
  [[35, 30], [48, 30], [56, 26], [59, 22], [52, 13], [43, 13], [39, 20]],
  [[114, -22], [130, -12], [142, -11], [153, -27], [148, -38], [135, -35], [115, -34]],
  [[-5, 50], [1, 52], [-2, 58], [-6, 56]], [[130, 32], [141, 36], [141, 44], [136, 36]], [[-52, 60], [-20, 72], [-20, 82], [-55, 78]],
];
const MCOL: Record<string, string> = { express: "#ffb02e", airfreight: "#ff7a45", economy: "#f5d142", sea: "#45a6ff", road: "#7bd88f", rail: "#c28bff" };
export function worldMap(s: GameState, sel?: number): string {
  const doha = COUNTRY.QA, d: [number, number] = [px(doha.lon), py(doha.lat)];
  const act = s.ships.filter((x) => x.status !== "delivered");
  const lines = act.map((sh) => { const o = COUNTRY[sh.from]; if (!o || sh.from === "QA") return ""; const a: [number, number] = [px(o.lon), py(o.lat)], mx = (a[0] + d[0]) / 2, my = Math.min(a[1], d[1]) - 40 - Math.abs(a[0] - d[0]) * 0.08;
    const total = Math.max(1, sh.arrive - sh.day), prog = Math.max(0, Math.min(1, (s.day - sh.day) / total)); const t = prog, bx = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * d[0], by = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * d[1];
    const col = MCOL[sh.mode] ?? "#ccc"; const on = sel === sh.id;
    return `<path d="M${a[0]} ${a[1]} Q${mx} ${my} ${d[0]} ${d[1]}" fill="none" stroke="${col}" stroke-width="${on ? 3.4 : 1.8}" stroke-opacity="${sh.status === "booked" ? 0.3 : 0.9}" class="${sh.status === "in_transit" ? "route" : ""}" ${sh.status === "booked" ? 'stroke-dasharray="3 5"' : ""}/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${on ? 6 : 4}" fill="${col}" stroke="#0b1220" stroke-width="1.5"><title>${esc(sh.no)} ${sh.status}</title></circle>`; }).join("");
  const origins = new Set(DB.suppliers.map((x) => x.country)); const dots = [...origins].map((c) => { const co = COUNTRY[c]; if (!co) return ""; const used = act.some((x) => x.from === c); return `<circle cx="${px(co.lon)}" cy="${py(co.lat)}" r="${used ? 5 : 2.6}" fill="${used ? "#fff" : "#6f86a8"}" opacity="${used ? 1 : 0.7}"><title>${esc(co.name)} · ${esc(co.hub)}</title></circle>${used ? `<text x="${px(co.lon) + 7}" y="${py(co.lat) + 3}" class="mc">${c}</text>` : ""}`; }).join("");
  const grid = [-60, -30, 0, 30, 60].map((la) => `<line x1="0" x2="${W}" y1="${py(la)}" y2="${py(la)}" class="gl"/>`).join("") + [-120, -60, 0, 60, 120].map((lo) => `<line y1="0" y2="${H}" x1="${px(lo)}" x2="${px(lo)}" class="gl"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="wmap"><rect width="${W}" height="${H}" fill="#0c1a2e"/>${grid}${LAND.map((p) => `<polygon points="${p.map(([lo, la]) => px(lo).toFixed(0) + "," + py(la).toFixed(0)).join(" ")}" class="land"/>`).join("")}${lines}${dots}<g><circle cx="${d[0]}" cy="${d[1]}" r="9" fill="#ffb02e" opacity=".25" class="pulse"/><circle cx="${d[0]}" cy="${d[1]}" r="5.5" fill="#ffb02e" stroke="#fff" stroke-width="1.5"/><text x="${d[0] + 9}" y="${d[1] + 14}" class="mc hq">HQ Doha</text></g></svg>`;
}
export const MODE_COLOR = MCOL;
