// Optional manual live check: one public repository check + one issue-list request, no retries.
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(
      `${origin}/api/repositories/microsoft/vscode/issues?label=good-first-issue`,
    );
    const body = await response.json();
    console.log(
      JSON.stringify({
        attempt: attempt + 1,
        status: response.status,
        label: body.label,
        limit: body.limit,
        count: body.issues?.length,
        first: body.issues?.[0]
          ? {
              number: body.issues[0].number,
              state: body.issues[0].state,
              url: body.issues[0].url,
            }
          : null,
        error: body.error,
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(body.limit, 10);
    assert(body.issues.length <= 10);
    for (const issue of body.issues) {
      assert.equal(issue.state, 'open');
      assert.equal(
        new URL(issue.url).pathname,
        `/microsoft/vscode/issues/${issue.number}`,
      );
    }
  }
  assert.equal(observations.length, 2);
  console.log(
    JSON.stringify({
      upstreamObservations: observations,
      cachedRepeatAvoidedRequests: true,
      applicationAuthorizationHeader: false,
    }),
  );
} finally {
  server.close();
}
