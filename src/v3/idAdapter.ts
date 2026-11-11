/**
 * V3 kit examples use UN/LOCODE port codes (`SGSIN`, `NLRTM`); the canonical fixture uses `PRT-…` IDs. This adapter
 * maps kit records onto canonical IDs at the boundary so the app never stores two identities for one port (plan
 * decision: canonical IDs stay). The codes are reference labels for adaptation only, not a port registry.
 */
export const LOCODE_BY_PORT: Readonly<Record<string, string>> = Object.freeze({
  'PRT-SIN': 'SGSIN', 'PRT-RTM': 'NLRTM', 'PRT-SHA': 'CNSHA', 'PRT-SZX': 'CNSZX', 'PRT-NGB': 'CNNGB', 'PRT-BUS': 'KRPUS', 'PRT-HKG': 'HKHKG',
  'PRT-JEA': 'AEJEA', 'PRT-LAX': 'USLAX', 'PRT-LGB': 'USLGB', 'PRT-NYC': 'USNYC', 'PRT-HAM': 'DEHAM', 'PRT-ANR': 'BEANR', 'PRT-VLC': 'ESVLC',
  'PRT-ALG': 'ESALG', 'PRT-FLX': 'GBFXT', 'PRT-SOU': 'GBSOU', 'PRT-LHV': 'FRLEH', 'PRT-MRS': 'FRMRS', 'PRT-PIR': 'GRPIR', 'PRT-IST': 'TRIST',
  'PRT-GOA': 'ITGOA', 'PRT-BCN': 'ESBCN', 'PRT-ALX': 'EGALY', 'PRT-PSD': 'EGPSD', 'PRT-DUR': 'ZADUR', 'PRT-CPT': 'ZACPT', 'PRT-LAG': 'NGLOS',
  'PRT-MBA': 'KEMBA', 'PRT-DJB': 'DJJIB', 'PRT-CMB': 'LKCMB', 'PRT-MUM': 'INBOM', 'PRT-MAA': 'INMAA', 'PRT-MUN': 'INMUN', 'PRT-KHI': 'PKKHI',
  'PRT-CGP': 'BDCGP', 'PRT-RGN': 'MMRGN', 'PRT-BKK': 'THBKK', 'PRT-LCH': 'THLCH', 'PRT-PKG': 'MYPKG', 'PRT-TPP': 'MYTPP', 'PRT-JKT': 'IDJKT',
  'PRT-SBY': 'IDSUB', 'PRT-MNL': 'PHMNL', 'PRT-HCM': 'VNSGN', 'PRT-HPH': 'VNHPH', 'PRT-TAO': 'CNTAO', 'PRT-TSN': 'CNTSN', 'PRT-DLC': 'CNDLC',
  'PRT-XMN': 'CNXMN', 'PRT-KHH': 'TWKHH', 'PRT-TYO': 'JPTYO', 'PRT-YOK': 'JPYOK', 'PRT-UKB': 'JPUKB', 'PRT-OSA': 'JPOSA', 'PRT-NGO': 'JPNGO',
  'PRT-MEL': 'AUMEL', 'PRT-SYD': 'AUSYD', 'PRT-BNE': 'AUBNE', 'PRT-FRE': 'AUFRE', 'PRT-AKL': 'NZAKL', 'PRT-TRG': 'NZTRG', 'PRT-WLG': 'NZWLG',
  'PRT-YVR': 'CAVAN', 'PRT-PRR': 'CAPRR', 'PRT-SEA': 'USSEA', 'PRT-TAC': 'USTIW', 'PRT-OAK': 'USOAK', 'PRT-SFO': 'USSFO', 'PRT-HOU': 'USHOU',
  'PRT-MSY': 'USMSY', 'PRT-MIA': 'USMIA', 'PRT-SAV': 'USSAV', 'PRT-CHS': 'USCHS', 'PRT-ORF': 'USORF', 'PRT-BAL': 'USBAL', 'PRT-HFX': 'CAHAL',
  'PRT-YMQ': 'CAMTR', 'PRT-SSZ': 'BRSSZ', 'PRT-RIO': 'BRRIO', 'PRT-BUE': 'ARBUE', 'PRT-MVD': 'UYMVD', 'PRT-VAP': 'CLVAP', 'PRT-SAI': 'CLSAI',
  'PRT-CLL': 'PECLL', 'PRT-GYE': 'ECGYE', 'PRT-CTG': 'COCTG', 'PRT-BALB': 'PABLB', 'PRT-CRB': 'PACTB', 'PRT-KIN': 'JMKIN', 'PRT-VER': 'MXVER',
  'PRT-MAN': 'MXZLO', 'PRT-ENS': 'MXESE', 'PRT-LZC': 'MXLZC', 'PRT-COL': 'PAONX', 'PRT-TNG': 'MAPTM', 'PRT-CAS': 'MACAS', 'PRT-ABJ': 'CIABJ',
  'PRT-TEM': 'GHTEM', 'PRT-LAD': 'AOLAD',
});

const PORT_BY_LOCODE: ReadonlyMap<string, string> = new Map(Object.entries(LOCODE_BY_PORT).map(([p, l]) => [l, p]));

/** Canonical port ID for a kit code (UN/LOCODE) or an ID that is already canonical; null when unknown. */
export function toCanonicalPortId(code: string): string | null {
  if (code in LOCODE_BY_PORT) return code;
  return PORT_BY_LOCODE.get(code.toUpperCase()) ?? null;
}

export function toLocode(portId: string): string | null {
  return LOCODE_BY_PORT[portId] ?? null;
}

/** Shape of `examples/stowed-container-example.json` in the V3 kit. */
export interface KitStowedContainer {
  containerId: string;
  vesselId: string;
  shipmentId: string;
  slot: { bay: number; row: number; tier: number; sizeFt: 20 | 40 };
  cargo: { category: string; netMassKg: number; detailsVisibility: string };
  movement: { originPortId: string; destinationPortId: string; status: string };
  provenance: string;
}

export interface AdaptedContainer {
  vesselId: string;
  slotId: string;
  sizeFt: 20 | 40;
  originPortId: string;
  destinationPortId: string;
  status: string;
  category: string;
  netMassKg: number;
  kitIds: { containerId: string; shipmentId: string };
}

export type AdaptResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Adapts the kit's stowed-container example. Ports are remapped; the vessel must be a container ship in the
 * canonical fixture (the kit places its example on VSL-0047, which the canonical data keeps as an LNG carrier).
 */
export function adaptKitStowedContainer(rec: KitStowedContainer, vesselTypeOf: (vesselId: string) => string | null): AdaptResult<AdaptedContainer> {
  const origin = toCanonicalPortId(rec.movement.originPortId);
  const dest = toCanonicalPortId(rec.movement.destinationPortId);
  if (!origin || !dest) return { ok: false, reason: `Unknown port code ${!origin ? rec.movement.originPortId : rec.movement.destinationPortId}` };
  const type = vesselTypeOf(rec.vesselId);
  if (!type) return { ok: false, reason: `${rec.vesselId} is not in the canonical fixture` };
  if (type !== 'Container ship') return { ok: false, reason: `${rec.vesselId} is a ${type} in the canonical fixture; container slots are only shown on container ships` };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ok: true,
    value: {
      vesselId: rec.vesselId,
      slotId: `${pad(rec.slot.bay)}${pad(rec.slot.row)}${pad(rec.slot.tier)}`,
      sizeFt: rec.slot.sizeFt,
      originPortId: origin,
      destinationPortId: dest,
      status: rec.movement.status,
      category: rec.cargo.category,
      netMassKg: rec.cargo.netMassKg,
      kitIds: { containerId: rec.containerId, shipmentId: rec.shipmentId },
    },
  };
}

/** Shape of `examples/operational-flow-example.json`. */
export interface KitFlow {
  id: string;
  period: { from: string; to: string };
  sourcePortId: string;
  targetPortId: string;
  commodity: string;
  quantity: number;
  unit: string;
  shipmentIds: string[];
  dataQuality: string;
}

export function adaptKitFlow(rec: KitFlow): AdaptResult<KitFlow> {
  const source = toCanonicalPortId(rec.sourcePortId);
  const target = toCanonicalPortId(rec.targetPortId);
  if (!source || !target) return { ok: false, reason: `Unknown port code ${!source ? rec.sourcePortId : rec.targetPortId}` };
  return { ok: true, value: { ...rec, sourcePortId: source, targetPortId: target } };
}
