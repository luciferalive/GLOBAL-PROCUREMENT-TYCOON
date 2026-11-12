/** Real-world company names are used ONLY as references inside a fictional simulation. No partnership, price, stock or relationship is real. */
export const DISCLAIMER = "SIMULATED: all companies, prices, quotations, stock, lead times and documents in this game are fictional and generated. Real company names are used only as references. No real partnership, quotation or customer relationship exists.";
export const INDUSTRIES = [
    { id: "general", name: "General trading", start: true, cost: 0, rep: 0, icon: "🧰", cert: "" },
    { id: "electrical", name: "Electrical supplies", start: true, cost: 0, rep: 0, icon: "⚡", cert: "" },
    { id: "mechanical", name: "Mechanical supplies", start: true, cost: 0, rep: 0, icon: "⚙️", cert: "" },
    { id: "consumables", name: "Industrial consumables", start: true, cost: 0, rep: 0, icon: "📦", cert: "" },
    { id: "safety", name: "Safety products", start: true, cost: 0, rep: 0, icon: "🦺", cert: "" },
    { id: "mro", name: "MRO", start: true, cost: 0, rep: 0, icon: "🔧", cert: "" },
    { id: "tools", name: "Tools and equipment", start: true, cost: 0, rep: 0, icon: "🛠️", cert: "" },
    { id: "oilgas", name: "Oil and gas", start: false, cost: 40_000, rep: 15, icon: "🛢️", cert: "ISO 9001" },
    { id: "petrochem", name: "Petrochemical", start: false, cost: 50_000, rep: 20, icon: "🧪", cert: "ISO 9001" },
    { id: "power", name: "Power generation", start: false, cost: 60_000, rep: 25, icon: "🏭", cert: "ISO 9001" },
    { id: "construction", name: "Construction", start: false, cost: 30_000, rep: 10, icon: "🏗️", cert: "" },
    { id: "infra", name: "Infrastructure", start: false, cost: 55_000, rep: 22, icon: "🌉", cert: "ISO 9001" },
    { id: "aviation", name: "Aviation", start: false, cost: 90_000, rep: 35, icon: "✈️", cert: "AS9120" },
    { id: "aerospace", name: "Aerospace", start: false, cost: 140_000, rep: 50, icon: "🚀", cert: "AS9120" },
    { id: "marine", name: "Marine", start: false, cost: 50_000, rep: 20, icon: "🚢", cert: "ISO 9001" },
    { id: "offshore", name: "Offshore", start: false, cost: 80_000, rep: 30, icon: "🛟", cert: "ISO 9001" },
    { id: "medical", name: "Medical", start: false, cost: 70_000, rep: 30, icon: "🩺", cert: "ISO 13485" },
    { id: "healthcare", name: "Healthcare", start: false, cost: 60_000, rep: 25, icon: "🏥", cert: "ISO 13485" },
    { id: "mining", name: "Mining", start: false, cost: 45_000, rep: 18, icon: "⛏️", cert: "" },
    { id: "automotive", name: "Automotive", start: false, cost: 50_000, rep: 22, icon: "🚗", cert: "IATF 16949" },
    { id: "telecom", name: "Telecommunications", start: false, cost: 45_000, rep: 18, icon: "📡", cert: "" },
    { id: "datacenter", name: "Data centers", start: false, cost: 75_000, rep: 28, icon: "🖥️", cert: "ISO 27001" },
    { id: "renewable", name: "Renewable energy", start: false, cost: 55_000, rep: 22, icon: "🌞", cert: "" },
    { id: "rail", name: "Railways", start: false, cost: 65_000, rep: 26, icon: "🚆", cert: "ISO 9001" },
    { id: "defence", name: "Defence", start: false, cost: 160_000, rep: 55, icon: "🛡️", cert: "Defence vendor clearance" },
    { id: "water", name: "Water treatment", start: false, cost: 35_000, rep: 12, icon: "💧", cert: "" },
    { id: "automation", name: "Industrial automation", start: false, cost: 45_000, rep: 16, icon: "🤖", cert: "" },
];
export const IND = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));
export const CATS = [
    // electrical
    { id: "breaker", name: "Circuit breaker", inds: ["electrical", "power", "construction", "datacenter"], lo: 180, hi: 4800, kg: 3, group: "elec" },
    { id: "contactor", name: "Contactor", inds: ["electrical", "automation", "mro"], lo: 40, hi: 900, kg: 1, group: "elec" },
    { id: "plc", name: "PLC controller", inds: ["automation", "oilgas", "power"], lo: 300, hi: 6500, kg: 2, group: "elec" },
    { id: "vfd", name: "Variable frequency drive", inds: ["automation", "oilgas", "water", "mining"], lo: 450, hi: 18000, kg: 8, group: "elec" },
    { id: "cable", name: "Power cable (per 100 m reel)", inds: ["electrical", "construction", "infra", "power"], lo: 250, hi: 7500, kg: 45, group: "elec" },
    { id: "terminal", name: "Terminal blocks & connectors", inds: ["electrical", "automation", "rail"], lo: 8, hi: 220, kg: 0.3, group: "elec" },
    { id: "transformer", name: "Distribution transformer", inds: ["power", "infra", "renewable", "datacenter"], lo: 4000, hi: 95000, kg: 700, group: "elec" },
    { id: "relay", name: "Protection relay", inds: ["power", "oilgas", "rail"], lo: 500, hi: 7500, kg: 2, group: "elec" },
    { id: "ups", name: "UPS battery system", inds: ["datacenter", "telecom", "healthcare", "electrical"], lo: 800, hi: 60000, kg: 60, group: "batt" },
    { id: "battery", name: "Industrial battery bank", inds: ["telecom", "rail", "renewable", "datacenter"], lo: 400, hi: 28000, kg: 120, group: "batt", dg: true },
    { id: "lighting", name: "Industrial LED lighting", inds: ["electrical", "construction", "infra", "general"], lo: 30, hi: 900, kg: 3, group: "elec" },
    { id: "switchgear", name: "Switchgear panel", inds: ["power", "infra", "oilgas", "datacenter"], lo: 6000, hi: 120000, kg: 900, group: "elec" },
    // mechanical
    { id: "bearing", name: "Industrial bearing", inds: ["mechanical", "mining", "automotive", "mro"], lo: 12, hi: 1800, kg: 1.2, group: "mech" },
    { id: "pneumvalve", name: "Pneumatic valve", inds: ["mechanical", "automation", "mro"], lo: 35, hi: 1100, kg: 0.8, group: "mech" },
    { id: "cylinder", name: "Pneumatic cylinder", inds: ["mechanical", "automation"], lo: 25, hi: 700, kg: 1.5, group: "mech" },
    { id: "pump", name: "Centrifugal pump", inds: ["mechanical", "water", "oilgas", "petrochem"], lo: 700, hi: 38000, kg: 90, group: "mech" },
    { id: "compressor", name: "Air compressor", inds: ["mechanical", "mining", "oilgas", "automotive"], lo: 2500, hi: 90000, kg: 400, group: "mech" },
    { id: "gearbox", name: "Gearbox / gear motor", inds: ["mechanical", "mining", "automation"], lo: 400, hi: 14000, kg: 70, group: "mech" },
    { id: "hose", name: "Industrial hose & fittings", inds: ["mro", "mechanical", "oilgas", "marine"], lo: 10, hi: 450, kg: 2, group: "mech" },
    { id: "steamtrap", name: "Steam trap / valve", inds: ["petrochem", "oilgas", "power", "mechanical"], lo: 90, hi: 3800, kg: 4, group: "mech" },
    { id: "ballvalve", name: "Ball valve / process valve", inds: ["oilgas", "petrochem", "water", "mechanical"], lo: 60, hi: 12000, kg: 8, group: "mech" },
    { id: "seal", name: "Mechanical seal / gasket set", inds: ["mro", "oilgas", "petrochem", "mechanical"], lo: 15, hi: 1500, kg: 0.6, group: "mech" },
    { id: "heatex", name: "Plate heat exchanger", inds: ["petrochem", "marine", "power", "water"], lo: 1800, hi: 52000, kg: 150, group: "mech" },
    { id: "engine", name: "Diesel / gas engine spare", inds: ["marine", "power", "mining", "construction"], lo: 1200, hi: 85000, kg: 300, group: "marine" },
    // instrumentation
    { id: "ptx", name: "Pressure transmitter", inds: ["oilgas", "petrochem", "water", "power", "automation"], lo: 400, hi: 3800, kg: 1.2, group: "inst" },
    { id: "flowmeter", name: "Flow meter", inds: ["oilgas", "water", "petrochem", "healthcare"], lo: 800, hi: 16000, kg: 6, group: "inst" },
    { id: "levelsensor", name: "Level sensor / radar", inds: ["oilgas", "water", "petrochem", "mining"], lo: 500, hi: 6200, kg: 2.5, group: "inst" },
    { id: "multimeter", name: "Digital multimeter", inds: ["electrical", "tools", "mro", "telecom"], lo: 60, hi: 1100, kg: 0.5, group: "inst" },
    { id: "thermo", name: "Temperature sensor / thermometer", inds: ["mro", "oilgas", "healthcare", "automation"], lo: 20, hi: 900, kg: 0.3, group: "inst" },
    { id: "gasdet", name: "Gas detector", inds: ["safety", "oilgas", "petrochem", "mining"], lo: 250, hi: 3200, kg: 1.0, group: "inst", cert: "ATEX" },
    { id: "analyser", name: "Water / process analyser", inds: ["water", "petrochem", "healthcare"], lo: 1200, hi: 24000, kg: 12, group: "inst" },
    { id: "enclosure", name: "Control enclosure / cabinet", inds: ["electrical", "automation", "datacenter", "power"], lo: 150, hi: 4200, kg: 35, group: "inst" },
    // tools
    { id: "drill", name: "Cordless drill / driver", inds: ["tools", "construction", "mro"], lo: 70, hi: 700, kg: 2, group: "tools" },
    { id: "anchor", name: "Anchors & fixings (box)", inds: ["construction", "infra", "tools"], lo: 25, hi: 600, kg: 6, group: "tools" },
    { id: "handtools", name: "Hand tool set", inds: ["tools", "mro", "automotive"], lo: 40, hi: 1800, kg: 8, group: "tools" },
    { id: "torque", name: "Torque wrench", inds: ["tools", "automotive", "marine", "aviation"], lo: 90, hi: 2200, kg: 2.5, group: "tools" },
    { id: "grinder", name: "Angle grinder / power tool", inds: ["tools", "construction", "mining"], lo: 60, hi: 600, kg: 2.5, group: "tools" },
    // safety / consumables
    { id: "ppe", name: "PPE kit (helmet, glasses, gloves)", inds: ["safety", "construction", "oilgas", "mining", "general"], lo: 12, hi: 260, kg: 2, group: "tools" },
    { id: "harness", name: "Fall-arrest harness", inds: ["safety", "construction", "oilgas"], lo: 60, hi: 420, kg: 2, group: "tools", cert: "EN 361" },
    { id: "respirator", name: "Respirator & filters", inds: ["safety", "petrochem", "healthcare", "mining"], lo: 25, hi: 380, kg: 0.8, group: "inst" },
    { id: "extinguisher", name: "Fire extinguisher / fire safety", inds: ["safety", "construction", "aviation", "marine"], lo: 35, hi: 900, kg: 9, group: "tools" },
    { id: "lubricant", name: "Industrial lubricant (drum)", inds: ["consumables", "mro", "mining", "marine"], lo: 120, hi: 900, kg: 190, group: "mech", dg: true },
    { id: "welding", name: "Welding consumables", inds: ["consumables", "construction", "oilgas", "marine"], lo: 40, hi: 800, kg: 20, group: "tools" },
    { id: "abrasive", name: "Abrasives & cutting discs", inds: ["consumables", "construction", "mro"], lo: 10, hi: 400, kg: 8, group: "tools" },
    { id: "packaging", name: "Industrial packaging & tape", inds: ["consumables", "general"], lo: 15, hi: 300, kg: 12, group: "tools" },
    { id: "cleaning", name: "Industrial cleaning chemicals", inds: ["consumables", "healthcare", "general"], lo: 20, hi: 500, kg: 25, group: "mech", dg: true },
    // IT
    { id: "server", name: "Rack server", inds: ["datacenter", "telecom", "general"], lo: 2500, hi: 48000, kg: 20, group: "it" },
    { id: "switch", name: "Network switch", inds: ["datacenter", "telecom", "infra"], lo: 400, hi: 25000, kg: 6, group: "it" },
    { id: "firewall", name: "Firewall appliance", inds: ["datacenter", "telecom", "defence"], lo: 700, hi: 30000, kg: 5, group: "it" },
    { id: "laptop", name: "Business laptop / workstation", inds: ["general", "datacenter"], lo: 600, hi: 5500, kg: 2.5, group: "it" },
    { id: "pdu", name: "Rack PDU / cooling unit", inds: ["datacenter", "telecom"], lo: 300, hi: 22000, kg: 40, group: "batt" },
    // oil & gas
    { id: "wellhead", name: "Wellhead / valve tree component", inds: ["oilgas", "offshore"], lo: 3500, hi: 140000, kg: 500, group: "oilgas" },
    { id: "drillbit", name: "Drill bit / downhole tool", inds: ["oilgas", "offshore", "mining"], lo: 2500, hi: 90000, kg: 120, group: "oilgas" },
    { id: "pipe", name: "OCTG pipe / line pipe (per 10 m)", inds: ["oilgas", "petrochem", "infra"], lo: 800, hi: 14000, kg: 400, group: "oilgas" },
    { id: "riser", name: "Subsea / riser hose component", inds: ["offshore", "oilgas"], lo: 2000, hi: 60000, kg: 250, group: "oilgas" },
    // aviation / aerospace
    { id: "avionics", name: "Avionics unit", inds: ["aviation", "aerospace", "defence"], lo: 2500, hi: 85000, kg: 6, group: "aero", cert: "EASA Form 1" },
    { id: "actuator", name: "Aircraft actuator / hydraulic part", inds: ["aviation", "aerospace"], lo: 1800, hi: 70000, kg: 14, group: "aero", cert: "EASA Form 1" },
    { id: "gse", name: "Ground support equipment part", inds: ["aviation"], lo: 200, hi: 18000, kg: 40, group: "aero" },
    { id: "fastener", name: "Aerospace fasteners (lot)", inds: ["aerospace", "aviation", "defence"], lo: 120, hi: 6500, kg: 4, group: "aero", cert: "Cert of Conformity" },
    // marine
    { id: "marineeng", name: "Marine engine part", inds: ["marine", "offshore"], lo: 800, hi: 60000, kg: 150, group: "marine" },
    { id: "navigation", name: "Navigation / bridge system", inds: ["marine"], lo: 1500, hi: 45000, kg: 15, group: "marine" },
    { id: "propeller", name: "Propulsion / thruster component", inds: ["marine", "offshore"], lo: 3000, hi: 110000, kg: 600, group: "marine" },
    // construction / heavy
    { id: "cat_part", name: "Heavy equipment wear part", inds: ["construction", "mining", "infra"], lo: 150, hi: 24000, kg: 90, group: "constr" },
    { id: "hydraulic", name: "Hydraulic pump / cylinder", inds: ["construction", "mining", "marine"], lo: 600, hi: 30000, kg: 80, group: "constr" },
    { id: "rockdrill", name: "Rock drill / mining tool", inds: ["mining", "construction"], lo: 400, hi: 36000, kg: 70, group: "constr" },
    // medical
    { id: "monitor", name: "Patient monitor", inds: ["medical", "healthcare"], lo: 1200, hi: 18000, kg: 7, group: "med", cert: "CE / ISO 13485" },
    { id: "infusion", name: "Infusion pump", inds: ["medical", "healthcare"], lo: 700, hi: 6500, kg: 4, group: "med", cert: "CE / ISO 13485" },
    { id: "imaging", name: "Imaging equipment spare", inds: ["medical", "healthcare"], lo: 3000, hi: 150000, kg: 120, group: "med", cert: "CE / ISO 13485" },
    { id: "syringe", name: "Medical disposables (case)", inds: ["medical", "healthcare"], lo: 40, hi: 1200, kg: 12, group: "med", cert: "CE / ISO 13485" },
    { id: "diagnostic", name: "Diagnostic reagent kit", inds: ["medical", "healthcare"], lo: 200, hi: 8000, kg: 5, group: "med", cert: "CE / ISO 13485" },
    // renewable / rail / telecom / defence-ish
    { id: "pvinverter", name: "Solar inverter", inds: ["renewable", "power"], lo: 700, hi: 28000, kg: 40, group: "elec" },
    { id: "railpart", name: "Rail signalling / track part", inds: ["rail", "infra"], lo: 300, hi: 40000, kg: 80, group: "elec" },
    { id: "antenna", name: "Telecom antenna / radio unit", inds: ["telecom"], lo: 400, hi: 22000, kg: 20, group: "it" },
    { id: "pwatertreat", name: "Water treatment membrane / filter", inds: ["water", "healthcare"], lo: 90, hi: 14000, kg: 25, group: "mech" },
    { id: "autoparts", name: "Automotive component lot", inds: ["automotive"], lo: 80, hi: 12000, kg: 30, group: "tools", cert: "IATF 16949" },
    { id: "defkit", name: "Tactical communications / defence kit", inds: ["defence"], lo: 1500, hi: 60000, kg: 15, group: "aero", cert: "End-user certificate" },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
/** OEMs: name | country | group | industries(extra). Group maps to the categories the OEM can supply. */
const OEM_RAW = `Siemens|DE|elec,inst,med|electrical,automation,power;ABB|CH|elec,marine|electrical,automation,power,marine;Schneider Electric|FR|elec,batt|electrical,datacenter,power;Eaton|US|elec,batt|electrical,datacenter,power;Rockwell Automation|US|elec|automation,oilgas;Emerson|US|inst,mech|oilgas,petrochem,automation;Honeywell|US|inst,elec|automation,oilgas,aviation;Phoenix Contact|DE|elec|electrical,automation,rail;WAGO|DE|elec|electrical,automation;Weidmuller|DE|elec|electrical,automation;Legrand|FR|elec,batt|electrical,datacenter;Mitsubishi Electric|JP|elec|automation,electrical;Omron|JP|elec,inst|automation,electrical;Yokogawa|JP|inst|oilgas,petrochem,automation;Danfoss|DK|elec,mech|water,automation,mechanical;Fuji Electric|JP|elec|electrical,power;Hitachi Energy|SE|elec|power,infra,renewable;GE Vernova|US|elec|power,renewable;Bosch Rexroth|DE|mech|mechanical,mining,automation;SKF|SE|mech|mechanical,mining,automotive;Schaeffler|DE|mech|mechanical,automotive;Festo|DE|mech|mechanical,automation;SMC|JP|mech|mechanical,automation;Parker Hannifin|US|mech,aero|mechanical,aviation;Norgren|GB|mech|mechanical,automation;Swagelok|US|mech|oilgas,petrochem;Spirax Sarco|GB|mech|petrochem,power;Grundfos|DK|mech|water,mechanical;KSB|DE|mech|water,oilgas,power;Sulzer|CH|mech|oilgas,water;Flowserve|US|mech|oilgas,petrochem;Alfa Laval|SE|mech,marine|petrochem,marine,water;Atlas Copco|SE|mech|mining,mechanical;Ingersoll Rand|US|mech|mechanical,mining;Kaeser Compressors|DE|mech|mechanical;Wilo|DE|mech|water,mechanical;Endress+Hauser|CH|inst|oilgas,water,petrochem;VEGA|DE|inst|oilgas,water,mining;WIKA|DE|inst|oilgas,mro,petrochem;Fluke|US|inst|electrical,tools,telecom;Megger|GB|inst|electrical,power;Testo|DE|inst|mro,healthcare;Rittal|DE|inst,elec|electrical,datacenter,automation;Rosemount|US|inst|oilgas,petrochem;Mettler Toledo|CH|inst|healthcare,petrochem;Drager|DE|inst,med|safety,healthcare,mining;Hach|US|inst|water;Krohne|DE|inst|oilgas,water;Hilti|CH|tools|construction,tools;Milwaukee Tool|US|tools|tools,construction;DeWalt|US|tools|tools,construction;Bosch Professional|DE|tools|tools,construction;Makita|JP|tools|tools,construction;Stanley|US|tools|tools,mro;Facom|FR|tools|tools,automotive;Gedore|DE|tools|tools,automotive;Snap-on|US|tools|tools,automotive,aviation;Bahco|SE|tools|tools;Proto|US|tools|tools,mro;Knipex|DE|tools|tools,electrical;Dell Technologies|US|it|datacenter,general;HP|US|it|general;Lenovo|CN|it|general,datacenter;Cisco|US|it|datacenter,telecom;HPE|US|it|datacenter;Microsoft|US|it|datacenter,general;Fortinet|US|it|datacenter,defence;Palo Alto Networks|US|it|datacenter,defence;APC|FR|batt|datacenter,telecom;Vertiv|US|batt|datacenter,telecom;NVIDIA|US|it|datacenter;Intel|US|it|datacenter;SLB|US|oilgas|oilgas,offshore;Baker Hughes|US|oilgas|oilgas,offshore;Halliburton|US|oilgas|oilgas;NOV|US|oilgas|oilgas,offshore;TechnipFMC|GB|oilgas|oilgas,offshore;Weatherford|US|oilgas|oilgas;Aker Solutions|NO|oilgas|oilgas,offshore;Tenaris|IT|oilgas|oilgas,petrochem;Vallourec|FR|oilgas|oilgas,petrochem;Cameron|US|oilgas|oilgas,offshore;Trelleborg|SE|oilgas,mech|offshore,marine,oilgas;Boeing|US|aero|aviation,aerospace;Airbus|FR|aero|aviation,aerospace;Safran|FR|aero|aviation,aerospace;Collins Aerospace|US|aero|aviation,aerospace;Honeywell Aerospace|US|aero|aviation,aerospace;RTX|US|aero|aviation,aerospace,defence;Parker Aerospace|US|aero|aviation,aerospace;Liebherr Aerospace|DE|aero|aviation,aerospace;Rolls-Royce|GB|aero,marine|aviation,aerospace,marine;GE Aerospace|US|aero|aviation,aerospace;MTU Aero Engines|DE|aero|aviation,aerospace;Wartsila|FI|marine|marine,offshore,power;MAN Energy Solutions|DE|marine|marine,power;Kongsberg Maritime|NO|marine|marine,offshore;Rolls-Royce Marine|GB|marine|marine;Caterpillar Marine|US|marine,constr|marine,construction;Yanmar|JP|marine|marine;Caterpillar|US|constr|construction,mining,infra;Komatsu|JP|constr|construction,mining;Volvo Construction Equipment|SE|constr|construction,infra;JCB|GB|constr|construction;Liebherr|DE|constr|construction,mining;Hitachi Construction Machinery|JP|constr|construction,mining;Sandvik|SE|constr|mining,construction;Epiroc|SE|constr|mining,construction;Doosan|KR|constr|construction;Bobcat|US|constr|construction;Siemens Healthineers|DE|med|medical,healthcare;GE HealthCare|US|med|medical,healthcare;Philips|NL|med|medical,healthcare;Stryker|US|med|medical,healthcare;Medtronic|US|med|medical,healthcare;Baxter|US|med|medical,healthcare;BD|US|med|medical,healthcare;Roche Diagnostics|CH|med|medical,healthcare;Exide|US|batt|telecom,rail,datacenter;EnerSys|US|batt|telecom,rail,datacenter;Saft|FR|batt|rail,renewable,aviation;GS Yuasa|JP|batt|rail,telecom;Rolls Battery|CA|batt|renewable,telecom;BYD|CN|batt|renewable,telecom,automotive;CATL|CN|batt|renewable,automotive;3M|US|tools|safety,consumables,healthcare;Honeywell Safety|US|tools|safety,oilgas;MSA Safety|US|tools,inst|safety,mining;Kimberly-Clark Professional|US|tools|safety,consumables;Mobil Industrial|US|mech|consumables,mining,marine;Shell Lubricants|GB|mech|consumables,marine;Castrol Industrial|GB|mech|consumables,mining;Lincoln Electric|US|tools|consumables,construction;ESAB|SE|tools|consumables,marine;Huawei|CN|it|telecom;Ericsson|SE|it|telecom;Nokia|FI|it|telecom;Alstom|FR|elec|rail;Wabtec|US|elec|rail;Siemens Mobility|DE|elec|rail;Sungrow|CN|elec|renewable;SMA Solar|DE|elec|renewable;Vestas|DK|elec|renewable;Veolia Water Tech|FR|mech|water;Xylem|US|mech|water;Pentair|US|mech|water;DuPont Water|US|mech|water;Denso|JP|tools|automotive;Bosch Automotive|DE|tools|automotive;Continental|DE|tools|automotive`;
export const OEMS = OEM_RAW.split(";").map((r, i) => { const [name, country, groups, inds] = r.split("|"); return { id: "oem" + i, name, country, groups: groups.split(","), inds: inds.split(",") }; });
export const DISTRIBUTORS_RAW = [["RS Group", "GB"], ["Rexel", "FR"], ["Sonepar", "FR"], ["Wesco", "US"], ["Graybar", "US"], ["Motion", "US"], ["Grainger", "US"], ["Fastenal", "US"], ["Wurth", "DE"], ["Distrelec", "CH"], ["Farnell", "GB"], ["element14", "SG"], ["Mouser Electronics", "US"], ["DigiKey", "US"], ["TME", "DE"], ["Conrad Electronic", "DE"], ["Allied Electronics", "US"], ["MISUMI", "JP"], ["Rubix", "GB"], ["ERIKS", "NL"]];
/** Clients: name | country | industry | kind */
export const CLIENTS_RAW = `QatarEnergy|QA|oilgas;QatarEnergy LNG|QA|oilgas;QAFAC|QA|petrochem;QAPCO|QA|petrochem;Qatar Steel|QA|mechanical;OQ|OM|oilgas;ADNOC|AE|oilgas;Saudi Aramco|SA|oilgas;SABIC|SA|petrochem;PDO|OM|oilgas;Kuwait Oil Company|KW|oilgas;KNPC|KW|oilgas;SLB|US|oilgas;Shell|GB|oilgas;BP|GB|oilgas;TotalEnergies|FR|oilgas;ExxonMobil|US|oilgas;Chevron|US|oilgas;Equinor|NO|oilgas;ENI|IT|oilgas;Qatar Airways|QA|aviation;Emirates|AE|aviation;Etihad Airways|AE|aviation;Lufthansa|DE|aviation;British Airways|GB|aviation;Turkish Airlines|TR|aviation;Singapore Airlines|SG|aviation;Air India|IN|aviation;IndiGo|IN|aviation;Saudia|SA|aviation;Qatar Aviation Services|QA|aviation;dnata|AE|aviation;Menzies Aviation|GB|aviation;Swissport|CH|aviation;Airbus|FR|aerospace;Boeing|US|aerospace;Hamad International Airport|QA|aviation;Dubai Airports|AE|aviation;Abu Dhabi Airports|AE|aviation;Heathrow Airport|GB|aviation;Changi Airport|SG|aviation;Frankfurt Airport|DE|aviation;Munich Airport|DE|aviation;Bechtel|US|construction;Fluor|US|construction;KBR|US|construction;Technip Energies|FR|oilgas;Worley|AU|oilgas;Wood|GB|oilgas;Larsen & Toubro|IN|construction;Vinci|FR|infra;Bouygues|FR|infra;ACS Group|ES|infra;Hyundai Engineering|KR|construction;Samsung C&T|KR|construction;Consolidated Contractors Company|GR|construction;Maersk|DK|marine;MSC|CH|marine;CMA CGM|FR|marine;Hapag-Lloyd|DE|marine;COSCO Shipping|CN|marine;ONE|SG|marine;Evergreen|CN|marine;Qatar Navigation|QA|marine;DP World|AE|marine;AD Ports Group|AE|marine;Siemens|DE|automation;Bosch|DE|automotive;ABB|CH|automation;Schneider Electric|FR|automation;Honeywell|US|automation;GE Vernova|US|power;Mitsubishi Electric|JP|automation;Hitachi|JP|automation;Hyundai|KR|automotive;Samsung|KR|automation;Hamad Medical Corporation|QA|healthcare;Sidra Medicine|QA|healthcare;Apollo Hospitals|IN|healthcare;Fortis Healthcare|IN|healthcare;Cleveland Clinic|US|healthcare;Mayo Clinic|US|healthcare;Mediclinic|AE|healthcare`;
export const LOGI_RAW = [["DHL Express", "DE", "express"], ["DHL Global Forwarding", "DE", "forwarder"], ["Kuehne+Nagel", "CH", "forwarder"], ["FedEx", "US", "express"], ["UPS", "US", "express"], ["DSV", "DK", "forwarder"], ["DB Schenker", "DE", "forwarder"], ["CEVA Logistics", "FR", "forwarder"], ["Rhenus Logistics", "DE", "forwarder"], ["Expeditors", "US", "forwarder"], ["Hellmann Worldwide Logistics", "DE", "forwarder"], ["Nippon Express", "JP", "forwarder"], ["GEODIS", "FR", "forwarder"], ["Yusen Logistics", "JP", "forwarder"], ["Agility Logistics", "KW", "forwarder"], ["Aramex", "AE", "express"], ["Qatar Airways Cargo", "QA", "aircargo"], ["Emirates SkyCargo", "AE", "aircargo"], ["Turkish Cargo", "TR", "aircargo"], ["Lufthansa Cargo", "DE", "aircargo"], ["Maersk", "DK", "ocean"], ["MSC", "CH", "ocean"], ["CMA CGM", "FR", "ocean"]];
