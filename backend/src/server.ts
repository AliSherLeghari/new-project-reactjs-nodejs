import { createApp } from './app.js';
import { parsePort } from './config.js';

const port = parsePort(process.env.PORT);
const server = createApp().listen(port, () => {
  console.log(`OpenSource Explorer API listening on port ${port}`);
});
server.on('error', (error) => {
  console.error('Server could not start:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close());
}
