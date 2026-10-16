import { createApp } from './app.js';
import { parsePort, parseGithubTimeout } from './config.js';
import { createGithubClient } from './github/client.js';
import { createRepositoryService } from './repositories/service.js';

const port = parsePort(process.env.PORT);
const client = createGithubClient({
  timeoutMs: parseGithubTimeout(process.env.GITHUB_TIMEOUT_MS),
});
const server = createApp(createRepositoryService(client)).listen(port, () => {
  console.log(`OpenSource Explorer API listening on port ${port}`);
});
server.on('error', (error) => {
  console.error('Server could not start:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close());
}
