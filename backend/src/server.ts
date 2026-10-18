import { fileURLToPath } from 'node:url';
import { parsePort, parseGithubTimeout } from './config.js';
import { startServer } from './runtime.js';

try {
  const production = process.env.NODE_ENV === 'production';
  const runtime = startServer({
    port: parsePort(process.env.PORT),
    production,
    frontendDir: production
      ? fileURLToPath(new URL('../../frontend/dist/', import.meta.url))
      : undefined,
    githubTimeoutMs: parseGithubTimeout(process.env.GITHUB_TIMEOUT_MS),
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void runtime.shutdown(signal);
    });
} catch {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message: 'Check build outputs and environment configuration.',
    }),
  );
  process.exitCode = 1;
}
