import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hasAllowedWebSocketOrigin,
  hasValidOperatorSession,
  isLoopbackAddress,
  isLoopbackHost,
  isOperatorAccessAllowed,
} from '../src/lib/operatorAccess.mjs';

const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

test('only actual loopback addresses use unauthenticated local access', () => {
  for (const address of ['127.0.0.1', '127.23.4.5', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackAddress(address), true, address);
  }
  for (const address of ['192.168.1.2', '::ffff:192.168.1.2', undefined]) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

test('local access also requires a loopback Host header', () => {
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ['evil.example:3000', 'bastilla.localhost:3000']) {
    assert.equal(isLoopbackHost(host), false, host);
  }
  assert.equal(isLoopbackHost(undefined), false);
});

test('remote operator access requires a valid session even when no token is configured', () => {
  const sessions = new Map([['valid-ticket', 2000], ['expired-ticket', 1000]]);
  const access = (cookieHeader, remoteAddress, explicitTokenRequired, forwardedFor) =>
    isOperatorAccessAllowed({
      cookieHeader,
      remoteAddress,
      host: remoteAddress === '127.0.0.1' ? 'localhost:3000' : 'bastilla.example',
      operatorSessions: sessions,
      explicitTokenRequired,
      forwardedFor,
      now: 1500,
    });
  assert.equal(access('', '127.0.0.1', false), true);
  assert.equal(access('', '203.0.113.8', false), false);
  assert.equal(access('', '127.0.0.1', false, '203.0.113.8'), false);
  assert.equal(isOperatorAccessAllowed({
    cookieHeader: '',
    remoteAddress: '127.0.0.1',
    host: 'evil.example',
    operatorSessions: sessions,
    explicitTokenRequired: false,
    now: 1500,
  }), false);
  assert.equal(access('svl_session=valid-ticket', '203.0.113.8', true), true);
  assert.equal(access('svl_session=expired-ticket', '127.0.0.1', true), false);
  assert.equal(hasValidOperatorSession('svl_session=valid-ticket', sessions, 1500), true);
});

test('WebSocket connections reject browser origins from another host', () => {
  assert.equal(hasAllowedWebSocketOrigin('http://localhost:3000', 'localhost:3000'), true);
  assert.equal(hasAllowedWebSocketOrigin('https://evil.example', 'bastilla.example'), false);
  assert.equal(hasAllowedWebSocketOrigin('null', 'bastilla.example'), false);
  assert.equal(hasAllowedWebSocketOrigin(undefined, 'bastilla.example'), true);
});

test('HTTP auth and WebSocket PTY upgrades use the same operator access check', () => {
  assert.match(server, /!explicitTokenRequired &&\s+!req\.header\('x-forwarded-for'\) &&\s+isLoopbackAddress\(req\.socket\.remoteAddress\) &&\s+isLoopbackHost\(req\.header\('host'\)\)/);
  const upgradeHandler = server.slice(server.indexOf("httpServer.on('upgrade'"));
  const authCheck = upgradeHandler.indexOf('isOperatorAccessAllowed(');
  const upgrade = upgradeHandler.indexOf('wss.handleUpgrade(');
  assert.ok(authCheck >= 0 && authCheck < upgrade);
  assert.ok(upgradeHandler.indexOf('hasAllowedWebSocketOrigin(') < upgrade);
  assert.match(upgradeHandler, /forwardedFor: String\(request\.headers\['x-forwarded-for'\]/);
  assert.match(upgradeHandler, /HTTP\/1\.1 401 Unauthorized/);
});
