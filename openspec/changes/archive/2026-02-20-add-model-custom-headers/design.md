## Context

Currently, the `AIModel` configuration supports setting a custom `baseUrl` and an `apiKey`. However, many users route their AI requests through personal proxies, Cloudflare Workers, or corporate API gateways that enforce additional security or routing requirements (for instance, requiring a specific `User-Agent`, a custom `X-Auth-Token`, etc.). To better support these diverse endpoint environments, the application needs the capability to attach customized HTTP headers to the outgoing LLM API requests per model configuration.

## Goals / Non-Goals

**Goals:**

- Allow users to define a set of custom HTTP headers (Key-Value pairs) for each `AIModel` instance.
- Safely persist these headers alongside existing model data.
- Ensure the underlying LangChain/provider clients (such as OpenAI and Gemini) correctly attach these headers to every outgoing request.
- Provide an intuitive UI in `AIModelDialog.vue` for managing these custom headers without overwhelming the dialog layout.

**Non-Goals:**

- Intercepting and setting headers globally for the entire application. (Headers are strictly confined to their respective AI model).
- Generating dynamic/computed headers per request (only static headers configured in the model settings are supported).

## Decisions

**1. Data Model Definition**

- **Decision**: Add `customHeaders?: Record<string, string>` to the `AIModel` interface.
- **Rationale**: `Record<string, string>` elegantly maps to a standard HTTP Header dictionary and is directly serializable into IndexedDB/Pinia, requiring no complex serialization logic.

**2. UI Implementation in `AIModelDialog.vue`**

- **Decision**: Implement a collapsible "Advanced Options" (or explicitly "Custom Headers") section in `AIModelDialog.vue`. Users can add key-value pairs using dual `InputText` fields, with "Add" and "Delete" actions. We can also provide a small button to edit as raw JSON.
- **Rationale**: Keeps the primary UI clean for basic users, while catering to power users.

**3. API Client Integration**

- **Decision**: For the `OpenAI` client, instantiate it by passing these headers in the HTTP options (e.g., `defaultHeaders` or `configuration.baseOptions.headers`). For `Gemini`, pass them via the internal `customClient` / `fetch` function overrides or official options if supported.
- **Rationale**: Leveraging the official SDK tools to inject headers is safer than manually intercepting fetch requests globally.

## Risks / Trade-offs

- **[Risk] Conflicting default headers**: A user might define a custom `Authorization` header that conflicts with the standard API key instantiation.
  - **Mitigation**: Add a small tooltip or UI note reminding users that custom headers may override standard authentication headers if named identically. We will allow the override, prioritizing user intent.
- **[Risk] Security of sensitive headers**: Headers often contain secrets (like auth tokens).
  - **Mitigation**: Stored locally in browser storage similarly to the `apiKey`. They remain safely on the client machine and are only sent to the specified endpoint over HTTPS.
