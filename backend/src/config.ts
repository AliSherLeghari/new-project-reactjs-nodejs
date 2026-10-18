export function parsePort(value: string | undefined): number {
  if (value === undefined) return 3001;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return Number(value);
}
