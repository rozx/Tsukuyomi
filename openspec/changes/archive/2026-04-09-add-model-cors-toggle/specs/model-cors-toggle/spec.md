## ADDED Requirements

### Requirement: AI model has independent CORS proxy toggle

Each AI model configuration SHALL include a `useCorsProxy` boolean option that controls whether API requests for that model are routed through the CORS proxy server in SPA (browser) mode.

#### Scenario: New model created with default CORS proxy setting

- **WHEN** a user creates a new AI model
- **THEN** the `useCorsProxy` field SHALL default to `true` (CORS proxy enabled)

#### Scenario: Existing model without useCorsProxy field

- **WHEN** an AI model record from IndexedDB does not contain the `useCorsProxy` field (legacy data)
- **THEN** the system SHALL treat it as `true` (CORS proxy enabled), maintaining backward compatibility

### Requirement: CORS proxy toggle controls API request routing

The proxy service SHALL respect the per-model `useCorsProxy` setting when determining whether to wrap API request URLs with the CORS proxy.

#### Scenario: Model with CORS proxy enabled in SPA mode

- **WHEN** an AI API request is made for a model with `useCorsProxy` set to `true` (or `undefined`) in SPA mode
- **THEN** the request URL SHALL be wrapped with the default CORS proxy (`DEFAULT_CORS_PROXY_FOR_AI`)

#### Scenario: Model with CORS proxy disabled in SPA mode

- **WHEN** an AI API request is made for a model with `useCorsProxy` set to `false` in SPA mode
- **THEN** the request URL SHALL NOT be wrapped with the CORS proxy; the original URL SHALL be used directly

#### Scenario: Any model in Electron mode

- **WHEN** an AI API request is made in Electron mode regardless of `useCorsProxy` value
- **THEN** the request URL SHALL NOT be wrapped with the CORS proxy (existing Electron behavior preserved)

### Requirement: CORS proxy toggle hidden in Electron build

The CORS proxy toggle UI control SHALL only be visible in SPA (browser) builds, not in Electron desktop builds.

#### Scenario: Model editing in SPA mode

- **WHEN** a user opens the AI model edit dialog in SPA mode
- **THEN** the CORS proxy toggle switch SHALL be visible and editable

#### Scenario: Model editing in Electron mode

- **WHEN** a user opens the AI model edit dialog in Electron mode
- **THEN** the CORS proxy toggle switch SHALL NOT be rendered

### Requirement: CORS proxy setting persisted with model

The `useCorsProxy` setting SHALL be persisted as part of the AI model configuration in IndexedDB.

#### Scenario: User disables CORS proxy and saves model

- **WHEN** a user sets `useCorsProxy` to `false` and saves the model
- **THEN** the setting SHALL be persisted in the `ai-models` IndexedDB store
- **AND** subsequent API requests for that model SHALL skip the CORS proxy

#### Scenario: Setting survives app reload

- **WHEN** the user reloads the application after changing a model's CORS proxy setting
- **THEN** the persisted `useCorsProxy` value SHALL be loaded and applied correctly
