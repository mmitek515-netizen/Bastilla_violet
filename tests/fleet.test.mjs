import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import {
  readFleet, writeFleet, registerFleetVessel, fleetView, reportFleetPosition, FLEET_FRAME,
} from '../src/lib/fleetRegistry.ts';
import { createFleetRouter } from '../src/lib/fleetRoutes.ts';

const ADMIN = 'f9e2ac583af39d9b18a0fa0674475b6f';
const INGEST = 'f1ea903dbe2f675d7219743a80c14c2b';
const now = new Date('2026-11-10T12:00:00.000Z');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-fleet-'));
  return { file: path.join(dir, 'fleet.json'), dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
async function serve(file, fn) {
  const app = express(); app.use(express.json());
  app.use('/api/fleet', createFleetRouter({ file, adminToken: ADMIN, ingestToken: INGEST, allowedSources: ['device-01'] }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function api(base, endpoint, { method = 'GET', secret = ADMIN, payload } = {}) {
  return fetch(base + '/api/fleet' + endpoint, {
    method,
    headers: {
      ...(secret ? { Authorization: 'Bearer ' + secret } : {}),
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
test('empty registry never invents ships or celestial position reports', () => {
  const f = fixture();
  try {
    const db = readFleet(f.file);
    assert.deepEqual(db.vessels, []);
    const snapshot = fleetView(db, now);
    assert.equal(snapshot.vessels.length, 0);
    assert.match(snapshot.disclaimer, /not independently verified/);
  } finally { f.dispose(); }
});
test('registration is only an unverified plan with no ETA, IP, status or position', () => {
  const f = fixture();
  try {
    const db = readFleet(f.file);
    const vessel = registerFleetVessel(db, { name: 'Project A', kind: 'ship', missionPlan: 'Explore' }, now);
    writeFleet(f.file, db);
    const stored = readFleet(f.file);
    assert.equal(stored.vessels[0].id, vessel.id);
    const displayed = fleetView(stored, now).vessels[0];
    assert.equal(displayed.position, null);
    assert.equal(displayed.connection, 'unverified');
    assert.equal(displayed.eta, null);
    assert.equal(displayed.missionStatus, 'planned');
    assert.equal(displayed.provenance, null);
  } finally { f.dispose(); }
});
test('rejects synthetic feed IDs, invalid coordinate frame, future and stale timestamps', () => {
  const db = readFleet('/this/path/does/not/exist.json');
  const ship = registerFleetVessel(db, { name: 'Project A', kind: 'ship' }, now);
  const base = {
    shipId: ship.id, observedAt: '2026-11-10T12:00:00Z',
    coordinateFrame: FLEET_FRAME, xAu: 0.1, yAu: -0.2, zAu: 0.3, sourceRef: 'telemetry-device-1', sourceId: 'device-01',
  };
  assert.throws(() => reportFleetPosition(db, { ...base, sourceRef: 'demo://project-A' }, now), /Synthetic/);
  assert.throws(() => reportFleetPosition(db, { ...base, coordinateFrame: 'unknown' }, now), /Unsupported/);
  assert.throws(() => reportFleetPosition(db, { ...base, observedAt: '2030-01-01T12:00:00Z' }, now), /Out-of-range/);
  assert.throws(() => reportFleetPosition(db, { ...base, observedAt: '2020-01-01T12:00:00Z' }, now), /Out-of-range/);
  assert.throws(() => reportFleetPosition(db, { ...base, xAu: Infinity }, now), /Invalid AU/);
});
test('verified report expires after TTL; historical source stays identifiable', () => {
  const db = readFleet('/this/path/does/not/exist.json');
  const ship = registerFleetVessel(db, { name: 'Project A', kind: 'ship' }, now);
  reportFleetPosition(db, { shipId: ship.id, sourceRef: 'telemetry-device-1', sourceId: 'device-01',
    observedAt: '2026-11-10T12:00:00Z', coordinateFrame: FLEET_FRAME, xAu: 0.1, yAu: -0.2, zAu: 0.3 }, now);
  assert.deepEqual(fleetView(db, new Date(now.getTime() + 30_000)).vessels[0].position,
    { coordinateFrame: FLEET_FRAME, xAu: 0.1, yAu: -0.2, zAu: 0.3 });
  const stale = fleetView(db, new Date(now.getTime() + 6 * 60_000)).vessels[0];
  assert.equal(stale.position, null);
  assert.equal(stale.connection, 'unverified');
  assert.equal(stale.provenance.sourceRef, 'telemetry-device-1');
});
test('API requires role-appropriate credentials; cannot ingest with viewer token', async () => {
  const f = fixture();
  try {
    await serve(f.file, async base => {
      assert.equal((await api(base, '', { secret: null })).status, 401);
      assert.equal((await api(base, '')).status, 200);
      let create = await api(base, '/ships', { method: 'POST', payload: { name: 'Project B', kind: 'station' } });
      assert.equal(create.status, 201);
      const shipId = (await create.json()).id;
      const telemetry = { shipId, coordinateFrame: FLEET_FRAME, sourceId: 'device-01', sourceRef: 'real-feed-report-1',
        observedAt: new Date().toISOString(), xAu: 2, yAu: 1, zAu: -0.5 };
      assert.equal((await api(base, '/telemetry', { method: 'POST', payload: telemetry })).status, 401);
      assert.equal((await api(base, '/ships', { method: 'POST', secret: INGEST,
        payload: { name: 'Unauthorized', kind: 'ship' } })).status, 401);
      assert.equal((await api(base, '/telemetry', {
        method: 'POST', secret: INGEST, payload: { ...telemetry, sourceId: 'unauthorized-source' },
      })).status, 403);
      assert.equal((await api(base, '/telemetry', {
        method: 'POST', secret: INGEST, payload: telemetry,
      })).status, 201);
      const status = await (await api(base, '')).json();
      assert.equal(status.vessels.length, 1);
      assert.equal(status.vessels[0].position.xAu, 2);
      assert.equal(status.vessels[0].eta, null);
    });
  } finally { f.dispose(); }
});
