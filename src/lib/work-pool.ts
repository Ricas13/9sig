// Runs `task` over `items` with at most `concurrency` in flight, in order, and stops handing out new
// items as soon as `shouldStop` is true. Items never started are reported as deferred so the
// caller can surface (and the next run can pick up) the backlog. `task` must handle its own errors.
export async function runBounded<T>(
  items: readonly T[],
  options: { concurrency: number; shouldStop?: () => boolean },
  task: (item: T) => Promise<void>
) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(Math.floor(options.concurrency) || 1, items.length)) }, async () => {
    for (;;) {
      if (options.shouldStop?.()) return;
      // The index is claimed before any await, so two workers can never take the same item.
      const index = next++;
      if (index >= items.length) return;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
  const started = Math.min(next, items.length);
  return { started, deferred: items.length - started };
}
