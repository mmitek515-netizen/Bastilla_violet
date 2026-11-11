import type { DataStore } from './svlKernel';

/** Only a complete kernel snapshot may replace the current UI state. */
export function isKernelSnapshot(value: unknown): value is { store: DataStore } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const store = (value as Record<string, unknown>).store;
  if (!store || typeof store !== 'object' || Array.isArray(store)) return false;
  const record = store as Record<string, unknown>;
  return Boolean(
    record.config && typeof record.config === 'object' && !Array.isArray(record.config) &&
    Array.isArray(record.chat_history) &&
    Array.isArray(record.update_history)
  );
}

/** A response started before a local write must not overwrite its newer result. */
export function canApplyPolledState(
  startedGeneration: number,
  currentGeneration: number,
  operationInProgress: boolean,
): boolean {
  return startedGeneration === currentGeneration && !operationInProgress;
}
