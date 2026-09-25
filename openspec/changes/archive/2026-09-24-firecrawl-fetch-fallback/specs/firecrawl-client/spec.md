# Spec Delta

## Purpose

定义应用访问 Firecrawl API 的统一契约：有无 API Key 时的认证选择、网页抓取 / 搜索 / 额度查询的请求与结果形状、缓存策略、全局限速，以及 429、402、目标站状态码等错误语义，供网页抓取回退与 AI 网络工具共用。

## ADDED Requirements

### Requirement: Key and keyless authentication

When a Firecrawl API key is configured, every Firecrawl request SHALL send it as `Authorization: Bearer <key>`. When no key is configured, requests SHALL be sent without an `Authorization` header (keyless mode). A request made with a configured key MUST NOT be retried in keyless mode on any error.

#### Scenario: Configured key is sent

- **WHEN** `firecrawlApiKey` is `fc-abc` and a scrape is requested
- **THEN** the request SHALL carry `Authorization: Bearer fc-abc`

#### Scenario: Keyless request

- **WHEN** no `firecrawlApiKey` is configured and a scrape is requested
- **THEN** the request SHALL be sent without an `Authorization` header

#### Scenario: No silent downgrade to keyless

- **WHEN** a key is configured and Firecrawl responds with 402
- **THEN** the client SHALL NOT repeat the request without the key

### Requirement: Scrape request shape

A scrape SHALL POST to `https://api.firecrawl.dev/v2/scrape` with the target `url`, exactly one requested format (`rawHtml` for page fetching, `markdown` for AI page reading), and `maxAge: 0` so that no cached copy is ever returned. Page-fetch scrapes SHALL set `onlyMainContent: false`; AI page-reading scrapes SHALL set `onlyMainContent: true`. Caller-supplied request headers (e.g. `Cookie`) SHALL be forwarded through the scrape `headers` option. The request SHALL honor the caller's abort signal.

#### Scenario: Raw HTML for scrapers

- **WHEN** the page-fetch path scrapes `https://syosetu.org/novel/375522/6.html`
- **THEN** the body SHALL contain `formats: ["rawHtml"]`, `maxAge: 0`, and `onlyMainContent: false`
- **AND** the client SHALL return the `data.rawHtml` string as the page HTML

#### Scenario: Forwarded headers

- **WHEN** a scrape is requested with headers `{ Cookie: "over18=yes" }`
- **THEN** the request body SHALL contain `headers: { Cookie: "over18=yes" }`

#### Scenario: Abort

- **WHEN** the caller's signal aborts while a scrape is in flight or queued
- **THEN** the client SHALL reject with an abort error and SHALL NOT issue the request if it had not started

### Requirement: Target status and empty content are errors

A scrape that returns HTTP 200 SHALL still be treated as failed when `data.metadata.statusCode` is 400 or greater, or when the requested format field is missing or empty. The failure SHALL expose the target status code so callers can classify it.

#### Scenario: Target page missing

- **WHEN** Firecrawl returns 200 with `data.metadata.statusCode: 404`
- **THEN** the scrape SHALL fail with an error that carries target status 404

#### Scenario: Empty content

- **WHEN** Firecrawl returns 200 with `data.metadata.statusCode: 200` and an empty `data.rawHtml`
- **THEN** the scrape SHALL fail with an empty-content error

### Requirement: Global rate limiting and 429 handling

All Firecrawl requests in the app SHALL pass through a single shared queue that bounds concurrency (2 in flight) regardless of which caller issued them. The queue MUST NOT impose a fixed per-minute cap, so higher Firecrawl plans are not slowed to the Free plan's rate. On HTTP 429 the client SHALL pause the whole queue (not only the failing request) for the wait Firecrawl gives — the `Retry-After` header, else the body's `retry_after_seconds`, else 20 seconds, capped at 60 seconds — and retry, up to a bounded number of retries, after which it SHALL fail with a rate-limit error. The remaining pause time SHALL be observable so the UI can show that it is waiting.

#### Scenario: Concurrent imports share one limit

- **WHEN** two import batches each request 10 scrapes at the same time
- **THEN** the number of in-flight Firecrawl requests SHALL never exceed the shared concurrency bound

#### Scenario: No fixed per-minute cap

- **WHEN** 11 scrapes are requested with an API key and Firecrawl answers each with 200
- **THEN** all 11 SHALL be sent without waiting for a per-minute window

#### Scenario: 429 pauses the whole queue

- **WHEN** one scrape receives 429 with `Retry-After: 3` while another scrape is queued
- **THEN** neither request SHALL be sent again before 3 seconds have elapsed

#### Scenario: Retries exhausted

- **WHEN** every retry of a request receives 429
- **THEN** the client SHALL fail with a rate-limit error after the bounded retry count

### Requirement: Quota exhaustion is a distinguishable, batch-stopping error

HTTP 402 responses, and keyless 429 responses indicating the per-IP daily limit is exhausted (body `reason: "credits"`, a message explicitly mentioning a daily limit, or a wait longer than 2 minutes — the words "keyless" or "free" alone MUST NOT count, since short-term rate-limit messages contain them too), SHALL fail with a dedicated quota-exhausted error type distinct from other failures. Batch callers (chapter import, book-sync update check, and book-sync apply) SHALL stop processing the remaining items of that batch when they receive it, SHALL keep results already fetched, SHALL NOT mark the site recipe invalid because of it, and SHALL surface a message stating that Firecrawl quota is exhausted (with key: pointing to the credit check; keyless: mentioning the per-IP daily limit).

#### Scenario: Key out of credits mid-import

- **WHEN** chapter 41 of a 300-chapter import receives 402 from Firecrawl
- **THEN** chapters 1–40 SHALL remain saved
- **AND** no further Firecrawl scrapes SHALL be issued for that batch
- **AND** the batch SHALL end with a "Firecrawl 额度已用尽" error

#### Scenario: Keyless daily limit

- **WHEN** keyless mode is in use and Firecrawl reports the daily limit is exhausted
- **THEN** the error SHALL be the quota-exhausted type and its message SHALL mention the per-IP daily limit

#### Scenario: Book sync stops on quota

- **WHEN** a book-sync update check over 50 chapters receives a quota-exhausted error on chapter 10
- **THEN** no further chapters SHALL be fetched in that check, chapters already compared SHALL keep their results, and the sync recipe SHALL NOT be marked invalid

### Requirement: Quota latch

After a quota-exhausted error, the client SHALL fail every subsequent Firecrawl request immediately with the same error type, without sending a network request, until the configured key changes, a credit-usage query with the current key reports remaining credits greater than zero, or the latch expires. The latch SHALL last for the wait Firecrawl gives (e.g. `retry_after_seconds`), and 60 minutes when none is given.

#### Scenario: Fail fast after exhaustion

- **WHEN** a scrape has failed with a quota-exhausted error and another scrape is requested 5 minutes later with the same key
- **THEN** that scrape SHALL fail with the quota-exhausted error without any HTTP request

#### Scenario: New key clears latch

- **WHEN** the latch is set and the user saves a different key
- **THEN** the next scrape SHALL be sent to Firecrawl

### Requirement: Client timeout exceeds Firecrawl timeout

The HTTP timeout the client applies to a Firecrawl request SHALL be longer than the scrape timeout Firecrawl itself applies, and time spent waiting in the shared queue SHALL NOT count toward that HTTP timeout.

#### Scenario: Slow render

- **WHEN** Firecrawl takes 58 seconds to return a scrape
- **THEN** the client SHALL receive the response rather than time out first

### Requirement: Credit usage query

With a configured key the client SHALL query `GET https://api.firecrawl.dev/v2/team/credit-usage` and return `remainingCredits`, `planCredits`, and `billingPeriodEnd`. HTTP 401 SHALL be reported as an invalid-key result. Without a key the query SHALL NOT be sent.

#### Scenario: Valid key

- **WHEN** credit-usage returns `{ remainingCredits: 480, planCredits: 500, billingPeriodEnd: "2026-10-01T00:00:00Z" }`
- **THEN** the client SHALL return those three values

#### Scenario: Invalid key

- **WHEN** credit-usage returns 401
- **THEN** the client SHALL return an invalid-key result rather than throwing a generic error

### Requirement: Search request shape

A search SHALL POST to `https://api.firecrawl.dev/v2/search` with the query and a result limit, and SHALL return an array of `{ title, url, snippet }` built from the web results. Search requests SHALL use the same authentication, queue, 429, and quota-exhausted semantics as scrapes.

#### Scenario: Web results mapped

- **WHEN** Firecrawl search returns web results with `title`, `url`, and `description`
- **THEN** the client SHALL return items whose `snippet` equals the result `description`
