import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SvlCoreReport } from './types';

const execFileAsync = promisify(execFile);

/**
 * Pure TypeScript parity of TopologicalInfinityEngine & SVLProtectedVariable
 * from svl_core.py (v5.6.0-QuantumWheel).
 */
export function compactifyAlgebra97(x: number): number {
  if (x === Number.NEGATIVE_INFINITY) return -1.0;
  if (x === Number.POSITIVE_INFINITY) return 1.0;
  if (Number.isNaN(x)) return 0.0;
  return x / (1.0 + Math.abs(x));
}

export function calculateTopologicalMetricC(xStart: number, xEnd: number): number {
  const cStart = compactifyAlgebra97(xStart);
  const cEnd = compactifyAlgebra97(xEnd);
  const a = Math.abs(cEnd - cStart);
  const b = Math.abs(cStart * cEnd) + 0.5;
  return Math.sqrt(a ** 2 + b ** 2);
}

export function isAriaConnectCommand(input: string): boolean {
  const normalized = (input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return (
    normalized === 'podłącz moje ai aria' ||
    normalized === 'podlacz moje ai aria' ||
    normalized.includes('podłącz moje ai aria') ||
    normalized.includes('podlacz moje ai aria') ||
    normalized === '/aria connect' ||
    normalized === 'aria connect'
  );
}

export async function runPythonSvlCoreReport(cwd = process.cwd()): Promise<{
  report: SvlCoreReport;
  rawJson: string;
  pid: number;
}> {
  const scriptPath = path.resolve(cwd, 'svl_core.py');
  const childPromise = execFileAsync('python3', [scriptPath], {
    cwd,
    timeout: 6000,
  });
  const pid = (childPromise as any).child?.pid ?? process.pid;
  const { stdout } = await childPromise;
  const parsed = JSON.parse(stdout.trim());
  const report: SvlCoreReport = {
    Timestamp: String(parsed.Timestamp || new Date().toISOString()),
    System: String(parsed.System || '5.6.0-QuantumWheel'),
    Operator: String(parsed.Operator || 'Mateusz Mitek'),
    Performance: String(parsed.Performance || '+1456% (Wzorzec Kalibracji: 364)'),
    Compact_Metric_C: Number(parsed.Compact_Metric_C ?? 2.5),
    Config_Snapshot: {
      mode: String(parsed.Config_Snapshot?.mode || 'Reflective-Non-Greedy'),
      fourier_buffer: String(parsed.Config_Snapshot?.fourier_buffer || '0xFAAA'),
      acoustic_resonance_hz: Number(parsed.Config_Snapshot?.acoustic_resonance_hz ?? 880),
      milieu_therapy_active: Boolean(parsed.Config_Snapshot?.milieu_therapy_active ?? true),
      ip_rotation_gateway: String(parsed.Config_Snapshot?.ip_rotation_gateway || 'ENABLED_EXTERNAL_ONLY'),
    },
    Actual_SI_Updates_Count: Number(parsed.Actual_SI_Updates_Count ?? 3),
    ariaConnected: false,
    ariaPid: null,
    ariaConnectedAt: null,
  };
  return {
    report,
    rawJson: JSON.stringify(parsed, null, 4),
    pid,
  };
}
