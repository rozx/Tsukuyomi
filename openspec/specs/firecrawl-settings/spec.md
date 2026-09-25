# firecrawl-settings Specification

## Purpose

定义 Firecrawl 相关设置项及其默认值与同步行为，API Keys 标签页中 Firecrawl Key 的保存校验、额度查询与回退总开关，以及从「代理设置」拆分出的独立「网站映射」标签页在 Web 与 Electron 上的呈现。

## Requirements

### Requirement: Firecrawl settings fields and defaults

App settings SHALL include `firecrawlApiKey` (optional string), `firecrawlFallbackEnabled` (boolean, default `true`), and `firecrawlAutoAddMapping` (boolean, default `true`). Settings loaded without these fields — including existing users' stored settings and older synced payloads — SHALL receive the defaults. All three SHALL be included in settings sync the same way `tavilyApiKey` is.

#### Scenario: Upgrading user

- **WHEN** stored settings from a previous version contain no Firecrawl fields
- **THEN** after load `firecrawlFallbackEnabled` and `firecrawlAutoAddMapping` SHALL both be `true` and `firecrawlApiKey` SHALL be undefined

#### Scenario: Synced values applied

- **WHEN** remote settings contain `firecrawlApiKey: "fc-abc"` and `firecrawlFallbackEnabled: false`
- **THEN** after applying remote settings both values SHALL be reflected locally

#### Scenario: Legacy proxy data untouched

- **WHEN** stored settings contain legacy default proxies (e.g. cors.lol, AllOrigins) in `proxyList` and in `proxySiteMapping`
- **THEN** loading settings SHALL leave those entries unchanged

### Requirement: Firecrawl card in API Keys tab

The API Keys settings tab SHALL show a Firecrawl card on both web and Electron containing: a masked key input with a save action, a credit-check action, and the master switch "启用 Firecrawl 回退". The switch's description SHALL state that it applies to web page fetching and to web search / page reading in the AI assistant chat and the import agent, and that URLs and search queries are sent to Firecrawl.

#### Scenario: Card visible on Electron

- **WHEN** the settings page is opened in Electron
- **THEN** the API Keys tab SHALL show the Firecrawl card with the master switch

#### Scenario: Master switch persists

- **WHEN** the user turns the master switch off
- **THEN** `firecrawlFallbackEnabled` SHALL be saved as `false`

### Requirement: Key validation on save

Saving a non-empty key SHALL first query credit usage with that key. On success the key SHALL be saved and the returned remaining credits, plan credits, and billing period end SHALL be displayed. On 401 the key SHALL NOT be saved and an "无效的 API Key" message SHALL be shown. On network or other errors the user SHALL be told the key could not be verified and the key SHALL NOT be saved. Saving an empty value SHALL remove the key without a network call.

#### Scenario: Valid key saved

- **WHEN** the user saves `fc-abc` and credit-usage succeeds with 480 remaining of 500
- **THEN** `firecrawlApiKey` SHALL be `fc-abc` and the card SHALL show 480 / 500 and the period end date

#### Scenario: Invalid key rejected

- **WHEN** the user saves `fc-wrong` and credit-usage returns 401
- **THEN** `firecrawlApiKey` SHALL be unchanged and "无效的 API Key" SHALL be shown

#### Scenario: Clearing the key

- **WHEN** the user clears the input and saves
- **THEN** `firecrawlApiKey` SHALL be removed and no request SHALL be sent

### Requirement: Manual credit check

With a saved key, the credit-check action SHALL query credit usage on demand and display the result. The app SHALL NOT poll credit usage in the background or on tab open. Without a key, the card SHALL show a static note that keyless mode is in use with an unpublished per-IP daily limit, and the credit-check action SHALL be unavailable.

#### Scenario: Refresh on demand

- **WHEN** a key is saved and the user clicks 检查额度
- **THEN** one credit-usage request SHALL be sent and its result displayed

#### Scenario: Keyless note

- **WHEN** no key is saved
- **THEN** the card SHALL show the keyless note and the credit-check action SHALL be disabled

### Requirement: Site mapping tab

Settings SHALL include a dedicated "网站映射" tab, shown on both web and Electron, containing the auto-add mapping switch and the site mapping table (add, edit, enable/disable, reorder or remove entries). Mapping entry choices SHALL include every proxy in the proxy list plus a "Firecrawl" option that stores the `firecrawl` token. The auto-add switch SHALL be disabled, with an explanatory note, while the master Firecrawl switch is off. On Electron, CORS proxy entries SHALL be shown as inactive with a note that Electron connects directly. The mapping section SHALL be removed from the "代理设置" tab.

#### Scenario: Electron shows mapping tab

- **WHEN** the settings page is opened in Electron
- **THEN** the tab list SHALL include 网站映射 and SHALL NOT include 代理设置

#### Scenario: Map a site to Firecrawl manually

- **WHEN** the user adds `syosetu.org` with the Firecrawl option
- **THEN** the stored mapping SHALL be `{ enabled: true, proxies: ["firecrawl"] }` and the table SHALL display it as "Firecrawl"

#### Scenario: Auto-add disabled by master switch

- **WHEN** `firecrawlFallbackEnabled` is `false`
- **THEN** the auto-add switch SHALL be disabled and a note SHALL explain it requires the Firecrawl fallback

### Requirement: Proxy settings tab without auto-switch

The "代理设置" tab (web only) SHALL keep the proxy enable switch, the default proxy selection, the proxy URL, and the proxy list management. It SHALL NOT show the "自动切换代理服务" switch or the auto-add mapping switch. Firecrawl SHALL NOT be offered as the default proxy.

#### Scenario: No auto-switch control

- **WHEN** the 代理设置 tab is rendered on the web
- **THEN** it SHALL NOT contain a "自动切换代理服务" control

#### Scenario: Default proxy options exclude Firecrawl

- **WHEN** the user opens the default proxy selector
- **THEN** the options SHALL be exactly the proxy list entries, without Firecrawl

### Requirement: Saved tab position survives the new tab

The persisted settings-tab position SHALL keep pointing at the same logical tab after the 网站映射 tab is introduced, on both web and Electron.

#### Scenario: User last on 同步设置

- **WHEN** a user whose saved tab was 同步设置 opens settings after upgrading
- **THEN** the 同步设置 tab SHALL be active
