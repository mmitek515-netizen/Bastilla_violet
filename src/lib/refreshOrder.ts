export function createRefreshOrder() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => { generation += 1; },
    isCurrent: (request: number) => request === generation,
  };
}
