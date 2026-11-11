import { Router } from 'express';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fleetView, readFleet, writeFleet, registerFleetVessel, reportFleetPosition } from './fleetRegistry';

export interface FleetRoutesOptions {
  file?: string;
  adminToken?: string;
  ingestToken?: string;
  allowedSources?: string[];
}
const sameSecret = (given: string | undefined, expected: string | undefined): boolean => {
  if (!expected || expected.length < 32 || !given) return false;
  const actual = createHash('sha256').update(given).digest();
  const wanted = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actual, wanted);
};
export function createFleetRouter(options: FleetRoutesOptions = {}) {
  const router = Router();
  const file = options.file || process.env.FLEET_STORE_PATH || path.resolve('data/fleet-registry.json');
  const adminToken = options.adminToken ?? process.env.FLEET_ADMIN_TOKEN;
  const ingestToken = options.ingestToken ?? process.env.FLEET_INGEST_TOKEN;
  if (adminToken && ingestToken && adminToken === ingestToken) {
    throw new Error('FLEET_ADMIN_TOKEN and FLEET_INGEST_TOKEN must be different');
  }
  const allowedSources = new Set(options.allowedSources ??
    (process.env.FLEET_ALLOWED_SOURCES || '').split(',').map(v => v.trim()).filter(Boolean));
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!adminToken || adminToken.length < 32) {
      return res.status(503).json({ success: false, error: 'Fleet backend not configured: FLEET_ADMIN_TOKEN required' });
    }
    const isRead = req.method === 'GET';
    const isIngest = req.path === '/telemetry' && req.method === 'POST';
    const ok = isIngest ? sameSecret(secret, ingestToken)
      : sameSecret(secret, adminToken);
    if (!ok) return res.status(401).json({ success: false, error: 'Fleet authorization required' });
    if (!isRead && !isIngest && req.path !== '/ships') {
      return res.status(405).json({ success: false, error: 'Unsupported fleet operation' });
    }
    next();
  });
  router.get('/', (_req, res) => {
    try {
      return res.json({ success: true, ...fleetView(readFleet(file)) });
    } catch {
      return res.status(500).json({ success: false, error: 'Fleet storage unavailable or damaged' });
    }
  });
  // Compatibility with earlier AI Linux fleet data contract.
  router.get('/telemetry', (_req, res) => {
    try {
      const snapshot = fleetView(readFleet(file));
      return res.json({
        success: true, source: 'fleet-registry', observedAt: snapshot.timestamp,
        positions: snapshot.vessels.filter(v => v.position !== null),
      });
    } catch {
      return res.status(500).json({ success: false, error: 'Fleet telemetry registry unavailable' });
    }
  });
  router.get('/contacts', (_req, res) => {
    try {
      const snapshot = fleetView(readFleet(file));
      return res.json({
        success: true, contacts: snapshot.vessels.filter(v =>
          v.connection === 'recent-authenticated-report'),
      });
    } catch {
      return res.status(500).json({ success: false, error: 'Fleet contacts unavailable' });
    }
  });
  router.post('/ships', (req, res) => {
    try {
      const db = readFleet(file);
      const vessel = registerFleetVessel(db, req.body);
      writeFleet(file, db);
      return res.status(201).json({
        success: true, id: vessel.id, status: 'registered-unverified',
        message: 'Registered configuration only. No physical connection or telemetry verified.',
      });
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith('Invalid') || e.message === 'Fleet registry is full')) {
        return res.status(400).json({ success: false, error: e.message });
      }
      return res.status(500).json({ success: false, error: 'Fleet storage error' });
    }
  });
  router.post('/telemetry', (req, res) => {
    if (!ingestToken || ingestToken.length < 32 || allowedSources.size === 0) {
      return res.status(503).json({ success: false, error: 'Telemetry ingestion not configured: token and trusted source list required' });
    }
    if (typeof req.body?.sourceId !== 'string' || !allowedSources.has(req.body.sourceId)) {
      return res.status(403).json({ success: false, error: 'Untrusted telemetry source ID' });
    }
    try {
      const db = readFleet(file);
      const telemetry = reportFleetPosition(db, req.body);
      writeFleet(file, db);
      return res.status(201).json({
        success: true, receivedAt: telemetry.receivedAt,
        provenance: 'authenticated-feed',
      });
    } catch (e) {
      if (e instanceof Error && /^(Invalid|Unsupported|Out-of-range|Observation older|Unknown shipId|Synthetic)/.test(e.message)) {
        return res.status(400).json({ success: false, error: e.message });
      }
      return res.status(500).json({ success: false, error: 'Telemetry registry error' });
    }
  });
  return router;
}
