export interface IndRule { fullDocs?: boolean; authOnly?: boolean; noAlt?: boolean; priceAdj?: number; lateX?: number; text: string[] }
/** Industry-specific buying rules applied to every customer in that industry. */
export const RULES: Record<string, IndRule> = {
  oilgas: { fullDocs: true, lateX: 1.5, text: ["Material test certificates and full OEM documentation required on every line", "Plant shutdowns make late delivery extra costly"] },
  petrochem: { fullDocs: true, lateX: 1.3, text: ["Full documentation required", "Shutdown-driven deadlines"] },
  offshore: { fullDocs: true, lateX: 1.5, text: ["Full documentation required", "Offshore logistics make late delivery very costly"] },
  power: { fullDocs: true, text: ["Full documentation and test reports required"] },
  aviation: { fullDocs: true, authOnly: true, noAlt: true, text: ["Authorized OEM / distributor sources only", "No alternative or generic parts", "Full traceability documents"] },
  aerospace: { fullDocs: true, authOnly: true, noAlt: true, text: ["Authorized OEM sources only", "No generic alternatives", "Full traceability documents"] },
  defence: { fullDocs: true, authOnly: true, noAlt: true, text: ["Authorized sources only", "No generic alternatives", "Strict documentation"] },
  rail: { fullDocs: true, authOnly: true, text: ["Authorized sources only", "Full certificates"] },
  medical: { fullDocs: true, authOnly: true, noAlt: true, text: ["Authorized distributors only", "No alternatives", "Complete conformity documents"] },
  healthcare: { fullDocs: true, authOnly: true, text: ["Authorized sources only", "Complete conformity documents"] },
  construction: { priceAdj: 0.03, text: ["Very price sensitive: expect hard bargaining"] },
  infra: { priceAdj: 0.02, text: ["Price sensitive public projects"] },
  mining: { priceAdj: 0.02, lateX: 1.3, text: ["Price sensitive", "Remote sites: late delivery hurts"] },
  automotive: { priceAdj: 0.02, lateX: 1.3, text: ["Tight margins and just-in-time deliveries"] },
  datacenter: { lateX: 1.5, text: ["Deadline-driven projects: late delivery is heavily penalised"] },
  telecom: { lateX: 1.3, text: ["Roll-out schedules make deadlines strict"] },
};
