// Optional, manually invoked live check. Makes at most two GitHub requests; never retries.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../backend/dist/app.js';
import { createGithubClient } from '../backend/dist/github/client.js';
import { createRepositoryService } from '../backend/dist/repositories/service.js';

const observations = [];
const client = createGithubClient({
  fetch: async (url, options) => {
    assert.equal(new Headers(options.headers).has('authorization'), false);
    const response = await fetch(url, options);
    observations.push({
      path: url.pathname,
      status: response.status,
      resource: response.headers.get('x-ratelimit-resource'),
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
      reset: response.headers.get('x-ratelimit-reset'),
    });
    return response;
  },
});
const server = createApp(createRepositoryService(client)).listen(
  0,
  '127.0.0.1',
);
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const path of [
    '/api/health',
    '/api/repositories/octocat/Hello-World',
    '/api/repositories?q=Hello-World&per_page=1&sort=stars',
    '/api/repositories/octocat/hello-world',
  ]) {
    const response = await fetch(origin + path);
    const body = await response.json();
    console.log(
      JSON.stringify({
        path,
        status: response.status,
        ...(body.error ? { error: body.error } : {}),
        ...(body.repository
          ? { repository: `${body.repository.owner}/${body.repository.name}` }
          : {}),
        ...(body.pagination
          ? { pagination: body.pagination, returned: body.repositories.length }
          : {}),
      }),
    );
    assert.equal(response.status, 200);
    if (body.repository) assert.equal(body.repository.name, 'Hello-World');
    if (body.repositories) assert.equal(body.repositories.length, 1);
  }
  assert.equal(observations.length, 2);
  console.log(
    JSON.stringify({
      upstreamObservations: observations,
      cachedDetailAvoidedRequest: true,
      applicationAuthorizationHeader: false,
    }),
  );
} finally {
  server.close();
}
