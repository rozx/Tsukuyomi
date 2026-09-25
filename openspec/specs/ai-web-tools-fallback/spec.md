# ai-web-tools-fallback Specification

## Purpose

定义 AI 助手 `search_web` 与 `fetch_webpage` 工具在 Tavily 与 Firecrawl 之间的选择顺序、回退条件、可用性与结果归一化，使未配置 Tavily 的用户在启用 Firecrawl 回退时也能使用网络搜索与网页读取。

## Requirements

### Requirement: Tool availability

In the assistant chat, `search_web` and `fetch_webpage` SHALL be offered when a Tavily key is configured or when the Firecrawl fallback is enabled. In translate, polish, and proofread tasks (including single-paragraph polish/proofread), they SHALL be offered only when a Tavily key is configured, as before this change. When neither holds they SHALL NOT be offered. The import agent's `search_web` availability is unchanged (always offered).

#### Scenario: No Tavily key, fallback on

- **WHEN** no Tavily key is configured and `firecrawlFallbackEnabled` is `true`
- **THEN** both tools SHALL be included in the assistant chat's tool list
- **AND** neither tool SHALL be included in a translation task's tool list

#### Scenario: Tavily key configured

- **WHEN** a Tavily key is configured
- **THEN** both tools SHALL be included in the assistant chat and in translate, polish, and proofread task tool lists

#### Scenario: Nothing available

- **WHEN** no Tavily key is configured and `firecrawlFallbackEnabled` is `false`
- **THEN** neither tool SHALL be included in any tool list

### Requirement: Provider order

With a Tavily key configured, each tool call SHALL use Tavily first and SHALL fall back to Firecrawl only when Tavily fails with a network error, a timeout, HTTP 429, HTTP 432/433 or other quota errors, or HTTP 5xx, and only if the Firecrawl fallback is enabled. A Tavily 401 (invalid key) SHALL also fall back when enabled. Without a Tavily key and with the fallback enabled, calls SHALL go to Firecrawl directly. Tavily responses that succeed with zero results SHALL NOT trigger a fallback.

#### Scenario: Tavily quota exhausted

- **WHEN** Tavily search returns 432 and the fallback is enabled
- **THEN** the same query SHALL be sent to Firecrawl search and its results returned

#### Scenario: Tavily succeeds

- **WHEN** Tavily search returns results
- **THEN** Firecrawl SHALL NOT be called

#### Scenario: Fallback disabled

- **WHEN** Tavily returns 500 and the fallback is disabled
- **THEN** the tool SHALL return the Tavily error

### Requirement: Import agent metadata search uses the same order

The import agent's `search_web` (metadata-only search) SHALL use the same provider order and fallback conditions as the assistant's `search_web`, SHALL honor the import run's abort signal on both providers, and SHALL keep its existing metadata-only result handling.

#### Scenario: Import search without Tavily

- **WHEN** no Tavily key is configured, the fallback is enabled, and the import agent calls `search_web` with query "無職転生 作者"
- **THEN** the query SHALL be sent to Firecrawl search and its results SHALL be recorded as metadata-only sources

#### Scenario: Import search aborted

- **WHEN** the import run is cancelled while a Firecrawl search is queued or in flight
- **THEN** the search SHALL reject with an abort error and no results SHALL be recorded

### Requirement: Result normalization

Results SHALL keep the existing tool result shapes regardless of provider. `search_web` SHALL return `results: [{ title, snippet, url }]` (with `answer` only when the provider supplies one). `fetch_webpage` SHALL return `title` and `text` (plain text, capped at the existing length limit); via Firecrawl, `text` SHALL come from the scrape's markdown of the main content and `title` from its page metadata. Each result SHALL indicate which provider served it.

#### Scenario: Firecrawl search shape

- **WHEN** `search_web` is served by Firecrawl
- **THEN** the result SHALL contain `results` items with `title`, `snippet`, `url`, SHALL omit `answer`, and SHALL name Firecrawl as the provider

#### Scenario: Firecrawl page reading

- **WHEN** `fetch_webpage` is served by Firecrawl for a URL whose metadata title is "Example Domain"
- **THEN** the result SHALL have `success: true`, `title: "Example Domain"`, and non-empty `text` no longer than the existing limit

### Requirement: Firecrawl failures reported to the AI

When the Firecrawl path fails, the tool SHALL return `success: false` with a message that distinguishes quota exhaustion (with key vs keyless daily limit), rate limiting, and target-page errors, so the AI can explain the failure to the user.

#### Scenario: Keyless limit reached

- **WHEN** `fetch_webpage` falls back to keyless Firecrawl and the daily limit is exhausted
- **THEN** the tool result SHALL be `success: false` with a message stating the Firecrawl free daily limit was reached and that a Firecrawl or Tavily key can be configured in settings
