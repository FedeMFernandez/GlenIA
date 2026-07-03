import { createHash, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

export const newCorrelationId = (): string => `corr_${randomUUID()}`;

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
};

export const deriveIdempotencyKey = (
  namespace: string,
  payload: unknown,
): string => {
  const hash = createHash('sha256')
    .update(`${namespace}:${stableStringify(payload)}`)
    .digest('hex');
  return `${namespace}_${hash.slice(0, 32)}`;
};
