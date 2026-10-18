export function parsePort(value: string | undefined): number {
  if (value === undefined) return 3001;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return Number(value);
}

export function parseGithubTimeout(value: string | undefined): number {
  if (value === undefined) return 5000;
  if (!/^\d+$/.test(value) || Number(value) < 100 || Number(value) > 30000) {
    throw new Error(
      'GITHUB_TIMEOUT_MS must be an integer between 100 and 30000.',
    );
  }
  return Number(value);
}
