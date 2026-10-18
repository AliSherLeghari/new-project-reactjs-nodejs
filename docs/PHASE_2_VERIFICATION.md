# Phase 2 verification — Issue #2

Executed in Codex Cloud on 2026-10-16 using Node 24.19.0, npm 11.9.0, and system Chromium. Phase 2 starts from Phase 1 commit `29b819043c4b0527dca9b005a7ec02656654fa95`. PR #1 was confirmed OPEN and was not merged. The branch is `feat/phase-2-github-api`; its review base is `feat/phase-1-foundation`.

## Executed checks

| Command/check                                                                          | Actual result                                                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                        | Exit 0; Prettier, ESLint, both workspace type checks, all Vitest tests, both builds passed                             |
| Frontend Vitest (inside check)                                                         | 1 test file, 8 tests passed                                                                                            |
| Backend Vitest (inside check)                                                          | 2 test files, 101 tests passed (11 foundation + 90 new)                                                                |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`                                     | Exit 0; 3 passed; real health connectivity at 390px/1280px, axe checks, no overflow, keyboard skip link, failure/retry |
| `npm run build` (inside check)                                                         | Vite 8.3.4 built 18 modules; frontend JS 223.77 kB / gzip 70.09 kB; backend TypeScript compilation passed              |
| `NODE_USE_ENV_PROXY=1 PORT=3102 npm run start -w backend`                              | Compiled production server started on configured port 3102                                                             |
| Node HTTP assertion against production `/api/health`                                   | HTTP 200, exact `{ "status": "ok", "service": "opensource-explorer-api" }`                                             |
| `NODE_USE_ENV_PROXY=1 node scripts/smoke-github.mjs`                                   | Exit 0; health, live search, live details, and repeated cached detail passed                                           |
| `git diff --quiet -- frontend package.json package-lock.json tests/foundation.spec.ts` | Exit 0; frontend, dependencies/lockfile, and foundation browser test source unchanged                                  |

The final documentation/script formatting and lint checks were run separately after adding the lesson and reusable smoke script. No packages were added or upgraded, and no vulnerability-audit result from an earlier phase is represented as a new Phase 2 audit.

Representative executed suite output:

```text
frontend: Test Files 1 passed (1); Tests 8 passed (8)
backend:  Test Files 2 passed (2); Tests 101 passed (101)
browser:  3 passed (4.3s)
```

## Live API evidence, with authentication limits

The application passed only fixed User-Agent, Accept, and API-version headers. The smoke script asserts that the application request has no Authorization header. It makes at most two upstream requests, then verifies a repeated detail lookup uses cache.

Observed saved-script output (selected fields, not secret values):

```json
{
  "detail": { "status": 200, "repository": "octocat/Hello-World" },
  "search": {
    "status": 200,
    "returned": 1,
    "pagination": {
      "page": 1,
      "per_page": 1,
      "total_count": 1916746,
      "accessible_pages": 1000,
      "has_next_page": true,
      "search_limit": 1000,
      "truncated": true,
      "incomplete_results": false
    }
  },
  "upstreamObservations": [
    {
      "path": "/repos/octocat/hello-world",
      "status": 200,
      "resource": "core",
      "limit": "15000",
      "remaining": "14976",
      "reset": "1792156486"
    },
    {
      "path": "/search/repositories",
      "status": 200,
      "resource": "search",
      "limit": "30",
      "remaining": "30",
      "reset": "1792154548"
    }
  ],
  "cachedDetailAvoidedRequest": true,
  "applicationAuthorizationHeader": false
}
```

Counts, timestamps, and quotas are observations, not promises. The earlier harness saw a slightly different total, illustrating that search results change.

**Important distinction:** live integration is verified, and no application token is used. A 15,000 core quota is inconsistent with the normal public unauthenticated 60/hour/IP allowance and suggests proxy-injected platform authentication. Truly anonymous outbound GitHub access could not be independently established in this managed environment. No credentials were inspected/extracted, no proxy was bypassed, and no paid service was enabled. Tests verify token-free request construction regardless of infrastructure.

## Mocked failure and contract coverage

- Missing, repeated, unknown, malformed, oversized, control-character, and out-of-range inputs rejected before GitHub access.
- Encoded URL/path attacks, invalid owners, invalid repositories, and malformed URL escapes rejected.
- Successful search/detail mapped to exact small contracts; no results distinguished from missing details.
- Pagination caps, 1000-result window, truncation, and incomplete results preserved without inventing reachable pages.
- Upstream 404/422/401/403/429/500/502/503 classified; primary and secondary quotas, date/numeric/malformed Retry-After, and safe reset metadata tested.
- Network failure, request timeout, slow response body, malformed JSON, invalid field types/counts, private records, and unsafe/mismatched URLs tested.
- Cache reuse, normalization, key separation, TTL boundary, eviction, expired-entry pruning, and failure non-caching tested.
- Foundation tests still cover generic internal 500 behavior and health response headers/JSON.

## Problems and resolutions

1. A fetch of named branches did not create the expected remote-tracking Phase 1 reference in this checkout. An explicit refspec fetched it; Phase 2 was then branched from the correct remote Phase 1 commit.
2. ESLint rejected a literal control-character range in a validation regex. Replacing it with Unicode property `\p{Cc}` preserved intentional control-character rejection and passed lint.
3. Prettier needed a second pass on the new test file before its check stabilized. The subsequent formatting check passed.
4. Native Node fetch uses the managed proxy with `NODE_USE_ENV_PROXY=1`. README and reusable startup guidance capture that setting, retaining inherited proxy/CA trust.
5. GitHub REST and GraphQL access now succeeds, despite environment status still reporting unknown network-policy enforcement. Actual successful responses are the connectivity evidence; configuration metadata alone is not readiness proof.
6. Fetching the official documentation page at `docs.github.com` received a policy 403. The existing Issue #2 specifies the public allowance; the README links the official source without claiming that current documentation was fetched successfully. No extra service or quota upgrade was introduced.

## Limits and phase boundary

No frontend search integration, database, authentication, deployment, paid service, or Actions workflow. No merge is authorized. Rate limits remain; cache is process-local/FIFO, not a distributed quota controller, and simultaneous misses are not combined. Redirects fail closed, so repository moves may require the caller to use the new name. The timeout is configurable but not an automatic retry policy.

Browser checks are Linux Chromium automation, not physical Android or complete assistive-technology testing. No live rate exhaustion or induced GitHub outage was attempted; those behaviors are verified with mocks to avoid consuming public quota unnecessarily.

For Android review, open the stacked Phase 2 PR and read the lesson/diff. The Phase 1 PR must receive its own approval; after it is merged, retarget Phase 2 to `main`, verify the diff, and obtain separate approval. Do not start Phase 3 automatically.
