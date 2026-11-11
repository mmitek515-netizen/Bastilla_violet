/**
 * Bastilla fleet registry: no seeded ships, generated coordinates, autonomous
 * status transitions or demo telemetry. A signed incoming measurement is still
 * just a report from its source; it is not proof a physical spaceship exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export const FLEET_TELEMETRY_TTL_MS = 5 * 60 * 1000;
const MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1000;
export const FLEET_FRAME = 'heliocentric_ecliptic_J2000';
export type VesselKind = 'ship' | 'station' | 'outpost' | 'relay';
export interface FleetTelemetry {
  source: 'authenticated-feed';
  sourceId: string;
  sourceRef: string;
  observedAt: string;
  receivedAt: string;
  coordinateFrame: typeof FLEET_FRAME;
  xAu: number;
  yAu: number;
  zAu: number;
  reportedWanIp: string | null;
}
export interface FleetVessel {
  id: string;
  name: string;
  kind: VesselKind;
  missionPlan: string;
  createdAt: string;
  telemetry: FleetTelemetry | null;
}
export interface FleetDatabase {
  schemaVersion: 1;
  vessels: FleetVessel[];
}

function validateString(value: unknown, max: number, field: string, required = true): string {
  if (typeof value !== 'string' || value.length > max ||
      (required && !value.trim())) throw new Error('Invalid ' + field);
  return value.trim();
}
function parseDb(content: string): FleetDatabase {
  const data: unknown = JSON.parse(content);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid fleet file');
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== 1 || !Array.isArray(obj.vessels) || obj.vessels.length > 1000) {
    throw new Error('Invalid fleet database schema');
  }
  const ids = new Set<string>();
  const vessels = obj.vessels as FleetVessel[];
  for (const v of vessels) {
    if (!v || typeof v !== 'object' || !/^[a-z0-9-]{3,80}$/.test(v.id) ||
        ids.has(v.id) || !['ship', 'station', 'outpost', 'relay'].includes(v.kind) ||
        typeof v.name !== 'string' || !v.name.trim() || v.name.length > 120 ||
        typeof v.missionPlan !== 'string' || v.missionPlan.length > 1000 ||
        !Number.isFinite(Date.parse(v.createdAt))) throw new Error('Invalid stored fleet vessel');
    ids.add(v.id);
    if (v.telemetry !== null) {
      const m = v.telemetry;
      if (!m || m.source !== 'authenticated-feed' || m.coordinateFrame !== FLEET_FRAME ||
          !m.sourceId || !m.sourceRef || !Number.isFinite(Date.parse(m.observedAt)) ||
          !Number.isFinite(Date.parse(m.receivedAt)) ||
          ![m.xAu, m.yAu, m.zAu].every(x => typeof x === 'number' && Number.isFinite(x))) {
        throw new Error('Invalid stored telemetry');
      }
    }
  }
  return { schemaVersion: 1, vessels };
}
export function readFleet(file: string): FleetDatabase {
  if (!fs.existsSync(file)) return { schemaVersion: 1, vessels: [] };
  return parseDb(fs.readFileSync(file, 'utf8'));
}
export function writeFleet(file: string, database: FleetDatabase): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  // Validate *before* writing. Never overwrite a damaged registry with empty defaults.
  const safe = parseDb(JSON.stringify(database));
  const tempFile = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tempFile, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(tempFile, file);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}
export function registerFleetVessel(db: FleetDatabase, input: unknown, now = new Date()): FleetVessel {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid vessel');
  const record = input as Record<string, unknown>;
  const name = validateString(record.name, 120, 'name');
  const kind = record.kind;
  const missionPlan = validateString(record.missionPlan ?? '', 1000, 'missionPlan', false);
  if (typeof kind !== 'string' || !['ship', 'station', 'outpost', 'relay'].includes(kind)) {
    throw new Error('Invalid kind');
  }
  if (db.vessels.length >= 1000) throw new Error('Fleet registry is full');
  const vessel: FleetVessel = {
    id: randomUUID(),
    name,
    kind: kind as VesselKind,
    missionPlan,
    createdAt: now.toISOString(),
    telemetry: null,
  };
  db.vessels.push(vessel);
  return vessel;
}
export function reportFleetPosition(db: FleetDatabase, input: unknown, now = new Date()): FleetTelemetry {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid position');
  const record = input as Record<string, unknown>;
  const id = validateString(record.shipId, 80, 'shipId');
  const vessel = db.vessels.find(v => v.id === id);
  if (!vessel) throw new Error('Unknown shipId');
  const sourceId = validateString(record.sourceId, 120, 'sourceId');
  const sourceRef = validateString(record.sourceRef, 512, 'sourceRef');
  if (/^(demo|mock|fake|simulation|example|test):/i.test(sourceRef)) {
    throw new Error('Synthetic source references are prohibited');
  }
  if (record.coordinateFrame !== FLEET_FRAME) throw new Error('Unsupported coordinate frame');
  const stamp = validateString(record.observedAt, 40, 'observedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(stamp)) {
    throw new Error('observedAt must be ISO-8601 UTC (Z)');
  }
  const observed = Date.parse(stamp);
  if (!Number.isFinite(observed) || observed > now.getTime() + 60000 ||
      observed < now.getTime() - MAX_REPORT_AGE_MS) throw new Error('Out-of-range observation time');
  const coordinates = [record.xAu, record.yAu, record.zAu];
  if (!coordinates.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000)) {
    throw new Error('Invalid AU coordinates');
  }
  if (vessel.telemetry && Date.parse(vessel.telemetry.observedAt) > observed) {
    throw new Error('Observation older than current report');
  }
  const reportedWanIp = record.reportedWanIp == null ? null
    : validateString(record.reportedWanIp, 45, 'reportedWanIp');
  if (reportedWanIp !== null && !isIP(reportedWanIp)) throw new Error('Invalid reported IP');
  const telemetry: FleetTelemetry = {
    source: 'authenticated-feed',
    sourceId,
    sourceRef,
    observedAt: new Date(observed).toISOString(),
    receivedAt: now.toISOString(),
    coordinateFrame: FLEET_FRAME,
    xAu: record.xAu as number,
    yAu: record.yAu as number,
    zAu: record.zAu as number,
    reportedWanIp,
  };
  vessel.telemetry = telemetry;
  return telemetry;
}
export function fleetView(db: FleetDatabase, now = new Date()) {
  return {
    timestamp: now.toISOString(),
    source: 'fleet-registry',
    disclaimer: 'Reports from authenticated sources; physical existence is not independently verified.',
    vessels: db.vessels.map(({ telemetry, ...v }) => {
      const ageMs = telemetry ? Math.max(0, now.getTime() - Date.parse(telemetry.observedAt)) : null;
      const fresh = ageMs !== null && ageMs <= FLEET_TELEMETRY_TTL_MS;
      return {
        ...v,
        missionStatus: 'planned' as const,
        connection: fresh ? 'recent-authenticated-report' as const : 'unverified' as const,
        position: fresh ? {
          coordinateFrame: telemetry!.coordinateFrame,
          xAu: telemetry!.xAu, yAu: telemetry!.yAu, zAu: telemetry!.zAu,
        } : null,
        lastObservationAt: telemetry?.observedAt ?? null,
        positionAgeMs: ageMs,
        provenance: telemetry ? { source: telemetry.source, sourceId: telemetry.sourceId, sourceRef: telemetry.sourceRef,
          receivedAt: telemetry.receivedAt, reportedWanIp: telemetry.reportedWanIp } : null,
        eta: null,
      };
    }),
  };
}
