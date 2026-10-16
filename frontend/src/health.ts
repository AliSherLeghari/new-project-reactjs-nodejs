export async function checkHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error('Health request failed.');
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    body.status !== 'ok' ||
    !('service' in body) ||
    body.service !== 'opensource-explorer-api'
  ) {
    throw new Error('Unexpected health response.');
  }
}
