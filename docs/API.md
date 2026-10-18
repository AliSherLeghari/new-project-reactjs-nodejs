# HTTP contracts and limits

All read endpoints return JSON. Production UI/assets share the same origin. Responses carry a new X-Request-ID; it is server generated. API responses use Cache-Control:no-store, separate from server-side TTL caching. No PAT is read/required by this application.

## Health/readiness

`GET /api/health`200: `{"status":"ok","service":"opensource-explorer-api"}`. This is liveness, no external dependency probe.

`GET /api/ready`200: `{"status":"ready","service":"opensource-explorer-api"}`;503 changes status to `not_ready` while draining or missing built index. Startup checks the production index is readable. Readiness does not promise GitHub quota/availability or validate every asset; browser/smoke checks cover actual release assets.

## Search

`GET /api/repositories?q=react&language=TypeScript&sort=stars&order=desc&page=1&per_page=20`

| Parameter | Rules                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| q         | Required1–200 normalized characters; trimmed/whitespace collapsed; no control characters or qualifier colon |
| language  | Optional1–50 letters/digits/spaces/.+#-; lowercased                                                         |
| sort      | best-match(default), stars, forks, updated; best-match omits upstream sort                                  |
| order     | desc(default) or asc; GitHub relevance controls best-match                                                  |
| page      | Positive integer default1, bounded by floor(1000/effective per_page)                                        |
| per_page  | Positive safe integer default20, capped50                                                                   |

Unknown/repeated parameters reject400. Only public search is requested through a fixed-host encoded URL. Response:

```json
{
  "repositories": [
    {
      "name": "project",
      "owner": "example",
      "description": null,
      "language": null,
      "stars": 1,
      "forks": 0,
      "open_issues": 0,
      "url": "https://github.com/example/project"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_count": 1,
    "accessible_pages": 1,
    "has_next_page": false,
    "search_limit": 1000,
    "truncated": false,
    "incomplete_results": false
  }
}
```

Illustrative contract, not a live claim. Counts/order can change. `accessible_pages` is min(ceil(total/per_page),floor(1000/per_page)), not every reported result. At page size30 only33 full pages/990 slots are exposed by our conservative policy. `has_next_page` also requires a full current page. `truncated` and GitHub's incomplete flag are separate caveats.

## Repository and contribution issues

`GET /api/repositories/:owner/:repo` returns `{repository: <same small repository shape>}`. Names use GitHub username/repository validation and normalized case. Nullable values remain explicit. open_issues is GitHub's combined open issue/PR count. Nonpublic or unsafe records fail validation.

`GET /api/repositories/:owner/:repo/issues?label=good-first-issue` accepts only one label parameter: good-first-issue(default) or help-wanted, mapping to maintainer labels good first issue/help wanted. Returns:

```json
{
  "issues": [
    {
      "number": 42,
      "title": "Illustrative task",
      "state": "open",
      "labels": ["good first issue"],
      "url": "https://github.com/example/project/issues/42"
    }
  ],
  "label": "good-first-issue",
  "label_name": "good first issue",
  "limit": 10,
  "browse_url": "https://github.com/example/project/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"
}
```

Service confirms public metadata before a fixed state=open/page1/per_page10/sort=updated/direction=desc GitHub issue-list call. PR entries and no-longer-matching labels are omitted; visible results can be fewer than10. Positive issue numbers/open state/text labels and matching safe HTTPS issue URLs are validated. Titles/labels render as text. Empty list is a success, not a complete-list or easy-acceptance promise. A cold direct request can spend two upstream calls; cache usually reuses public metadata.

## Errors and HTTP boundary

Existing service errors use `{error:{code,message,retry_after_seconds?,rate_limit_reset?}}`. Validated Retry-After headers accompany known rate/maintenance guidance. No arbitrary upstream message/header is echoed.

| Status | Representative stable code / meaning                                          |
| ------ | ----------------------------------------------------------------------------- |
| 400    | INVALID_INPUT, SEARCH_REJECTED, BODY_NOT_ALLOWED                              |
| 404    | NOT_FOUND, REPOSITORY_NOT_FOUND; never API SPA HTML                           |
| 405    | METHOD_NOT_ALLOWED; Allow:GET, HEAD                                           |
| 413    | PAYLOAD_TOO_LARGE; declared request body over16KiB                            |
| 414    | URI_TOO_LONG; over4096 characters                                             |
| 429    | RATE_LIMITED (GitHub), REQUEST_LIMITED (local admission); respect Retry-After |
| 500    | INTERNAL_ERROR; safe generic client response/redacted diagnostic event        |
| 502    | INVALID_UPSTREAM_RESPONSE, GITHUB_ERROR, GITHUB_NETWORK_ERROR                 |
| 503    | GITHUB_UNAVAILABLE, SERVER_BUSY; readiness uses its explicit status contract  |
| 504    | GITHUB_TIMEOUT                                                                |

Read API allows GET/HEAD only and no bodies. No permissive CORS or arbitrary upstream host. Transport/parser-level failures may be handled by Node before Express and are not guaranteed the application JSON/correlation shape.

## Resource and quota behavior

- Client deadline10s. GitHub timeout5000ms(default),100–30000 configurable per call. Cold chained requests can take multiple upstream deadlines.
- Cache100 successful entries, TTL60s/FIFO/full-URL keys, shared across response types; no error caching, distributed state or miss coalescing.
- Ingress120 API reads/min/direct-IP, max1000 active keys,60s expiry; health/readiness exempt; trust proxy disabled. Local hygiene, not a global GitHub budget or DDoS guarantee.
- Anonymous public GitHub general allowance normally60/hour/IP, separate tighter search/secondary limits. No token/paid upgrade introduced. Cloud proxy may authenticate independently; observed larger quota is not anonymous proof.
- No automatic GitHub polling/retry. Search/detail cooldowns are in-memory UI guidance, not persistent cross-tab/session limits. Cache staleness and upstream repository/issue changes remain possible.
