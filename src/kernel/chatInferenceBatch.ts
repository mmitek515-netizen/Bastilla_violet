/**
 * Run independent agent inference requests without overloading a single local Ollama model.
 * Stop scheduling additional serial requests after a failure, and let callers propagate
 * cancellation through their own AbortSignal to the underlying provider.
 */
export async function runChatInferenceBatch<T>(
  jobs: Array<() => Promise<T>>,
  options: { sequential: boolean; shouldStop?: (result: T) => boolean },
): Promise<T[]> {
  if (!options.sequential) return Promise.all(jobs.map((job) => job()));
  const results: T[] = [];
  for (const job of jobs) {
    const result = await job();
    results.push(result);
    if (options.shouldStop?.(result)) break;
  }
  return results;
}
