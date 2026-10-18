import assert from 'node:assert/strict';
const origin = process.argv[2] ?? 'http://127.0.0.1:8080';
const deadline = Date.now() + 10_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL('/api/ready', origin), {
      signal: AbortSignal.timeout(1000),
    });
    ready = response.ok && (await response.json()).status === 'ready';
  } catch {
    /* bounded startup wait */
  }
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert(
  ready,
  'Production service did not become ready within the startup deadline.',
);

for (const [path, status, type] of [
  ['/api/health', 200, 'json'],
  ['/api/ready', 200, 'json'],
  ['/', 200, 'html'],
  ['/repositories/octocat/Hello-World', 200, 'html'],
  ['/api/unknown', 404, 'json'],
  ['/assets/missing.js', 404, 'json'],
]) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'text/html' },
  });
  assert.equal(response.status, status);
  assert(response.headers.get('content-type')?.includes(type));
  assert(
    response.headers
      .get('content-security-policy')
      ?.includes("script-src 'self'"),
  );
  const body = await response.text();
  if (type === 'html') assert(body.includes('id="root"'));
  if (path === '/api/ready') assert.equal(JSON.parse(body).status, 'ready');
  if (path === '/') {
    const src = body.match(/src="([^"]+\.js)"/)?.[1];
    assert(src);
    const asset = await fetch(new URL(src, origin));
    assert.equal(asset.status, 200);
    assert(asset.headers.get('cache-control')?.includes('immutable'));
  }
  console.log(
    JSON.stringify({
      check: path,
      status: response.status,
      type,
      securityHeaders: true,
    }),
  );
}
