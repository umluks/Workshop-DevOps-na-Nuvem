export interface OrderLatency {
  samples: number;
  p95Ms: number;
  p99Ms: number;
}

/** Limites superiores em milissegundos, com resolução relativa de aproximadamente 5%. */
export function latencyBucket(milliseconds: number): number {
  const elapsed = Math.max(1, milliseconds);
  return Math.ceil(1.05 ** Math.ceil(Math.log(elapsed) / Math.log(1.05)));
}

export function summarizeLatency(histograms: Record<string, number>[]): OrderLatency | undefined {
  const counts = new Map<number, number>();
  let samples = 0;
  for (const histogram of histograms) {
    for (const [bucket, count] of Object.entries(histogram)) {
      const upperMs = Number(bucket);
      counts.set(upperMs, (counts.get(upperMs) || 0) + count);
      samples += count;
    }
  }
  if (!samples) return;
  let cumulative = 0;
  let p95Ms: number | undefined;
  for (const [upperMs, count] of [...counts].sort(([left], [right]) => left - right)) {
    cumulative += count;
    if (cumulative >= Math.ceil(samples * 0.95)) p95Ms ??= upperMs;
    if (p95Ms !== undefined && cumulative >= Math.ceil(samples * 0.99)) {
      return {samples, p95Ms, p99Ms: upperMs};
    }
  }
}
