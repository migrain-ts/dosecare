/** Numeric env var: a missing or non-numeric value gives `fallback`; anything below `min` is raised to `min`. */
export function numberFromEnv(raw: string | undefined, fallback: number, min = 1): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}
