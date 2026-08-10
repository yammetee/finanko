let modulePromise: ReturnType<typeof importTrendChart> | undefined;

function importTrendChart() {
  return import("./TrendChart");
}

export function loadTrendChart() {
  modulePromise ??= importTrendChart();
  return modulePromise;
}
