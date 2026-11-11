import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactifyAlgebra97,
  calculateTopologicalMetricC,
  isAriaConnectCommand,
  runPythonSvlCoreReport,
} from '../src/lib/svlAriaBridge';
import { parseCodexDeviceAuthOutput } from '../src/lib/codexCliBridge';
import {
  hasValidOperatorSession,
  isLoopbackAddress,
  isOperatorRequestAllowed,
  isSameOrigin,
} from '../src/lib/operatorAccess.mjs';

test('TopologicalInfinityEngine Algebra 97 compactifies [-inf, inf] to [-1, 1] and computes c = 2.5', () => {
  assert.equal(compactifyAlgebra97(Number.NEGATIVE_INFINITY), -1.0);
  assert.equal(compactifyAlgebra97(Number.POSITIVE_INFINITY), 1.0);
  assert.equal(compactifyAlgebra97(0), 0.0);
  const c = calculateTopologicalMetricC(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
  assert.equal(c, 2.5);
});

test('isAriaConnectCommand recognizes Polish command "podłącz moje ai aria"', () => {
  assert.equal(isAriaConnectCommand('podłącz moje ai aria'), true);
  assert.equal(isAriaConnectCommand('  PODŁĄCZ MOJE AI ARIA '), true);
  assert.equal(isAriaConnectCommand('podlacz moje ai aria'), true);
  assert.equal(isAriaConnectCommand('zwykłe pytanie'), false);
});

test('runPythonSvlCoreReport executes svl_core.py and returns SVLSystemKernel 5.6.0-QuantumWheel report', async () => {
  const { report, rawJson, pid } = await runPythonSvlCoreReport();
  assert.equal(report.System, '5.6.0-QuantumWheel');
  assert.equal(report.Operator, 'Mateusz Mitek');
  assert.equal(report.Performance, '+1456% (Wzorzec Kalibracji: 364)');
  assert.equal(report.Compact_Metric_C, 2.5);
  assert.equal(report.Config_Snapshot.mode, 'Reflective-Non-Greedy');
  assert.equal(report.Config_Snapshot.fourier_buffer, '0xFAAA');
  assert.equal(report.Config_Snapshot.acoustic_resonance_hz, 880);
  assert.equal(report.Actual_SI_Updates_Count, 3);
  assert.equal(report.ariaConnected, false);
  assert.equal(report.ariaPid, null);
  assert.equal(report.ariaConnectedAt, null);
  assert.ok(typeof pid === 'number');
  assert.ok(rawJson.includes('5.6.0-QuantumWheel'));
});

test('parseCodexDeviceAuthOutput extracts official OpenAI Codex CLI verification URL and one-time code', () => {
  const sample = `
Welcome to Codex [v0.167.1]
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device
2. Enter this one-time code (expires in 15 minutes)
   CVZA-62N1L
`;
  const parsed = parseCodexDeviceAuthOutput(sample);
  assert.equal(parsed.verificationUrl, 'https://auth.openai.com/codex/device');
  assert.equal(parsed.userCode, 'CVZA-62N1L');
});

test('operator access accepts only active sessions or genuine loopback addresses', () => {
  const sessions = new Map([['valid-ticket', 2000], ['expired-ticket', 999]]);
  assert.equal(hasValidOperatorSession('svl_session=valid-ticket', sessions, 1000), true);
  assert.equal(hasValidOperatorSession('svl_session=expired-ticket', sessions, 1000), false);
  assert.equal(hasValidOperatorSession('svl_session=valid-ticket-evil', sessions, 1000), false);
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('127.42.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.4'), false);
  assert.equal(isLoopbackAddress('127.999.0.1'), false);
  assert.equal(isLoopbackAddress(undefined), false);
  const allowed = (options) => isOperatorRequestAllowed({
    sessions,
    tokenRequired: false,
    remoteAddress: '127.0.0.1',
    now: 1000,
    ...options,
  });
  assert.equal(allowed({}), true);
  assert.equal(allowed({ remoteAddress: '192.168.1.4' }), false);
  assert.equal(allowed({ remoteAddress: '192.168.1.4', cookieHeader: 'svl_session=valid-ticket' }), true);
  assert.equal(allowed({ tokenRequired: true }), false);
  assert.equal(allowed({
    tokenRequired: true,
    remoteAddress: '192.168.1.4',
    cookieHeader: 'svl_session=valid-ticket',
  }), true);
});

test('terminal WebSocket origin must match the request host when supplied', () => {
  assert.equal(isSameOrigin('https://bastilla.example', 'bastilla.example'), true);
  assert.equal(isSameOrigin('https://other.example', 'bastilla.example'), false);
  assert.equal(isSameOrigin('not-an-origin', 'bastilla.example'), false);
  assert.equal(isSameOrigin(undefined, 'bastilla.example'), true);
});
