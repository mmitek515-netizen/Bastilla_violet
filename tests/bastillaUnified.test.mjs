import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactifyAlgebra97,
  calculateTopologicalMetricC,
  isAriaConnectCommand,
  runPythonSvlCoreReport,
} from '../src/lib/svlAriaBridge';
import { hasValidOperatorSession } from '../src/lib/operatorAuth';
import { parseCodexDeviceAuthOutput } from '../src/lib/codexCliBridge';

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

test('operator authentication requires an unexpired session', () => {
  const now = Date.now();
  assert.equal(hasValidOperatorSession(now + 1, now), true);
  assert.equal(hasValidOperatorSession(now, now), false);
  assert.equal(hasValidOperatorSession(undefined, now), false);
  assert.equal(hasValidOperatorSession(Number.NaN, now), false);
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
