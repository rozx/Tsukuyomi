## Why

Users may need to communicate with AI model APIs through custom proxies or specific routing services (like Cloudflare Workers, customized OpenAI-compatible endpoints) that require passing additional customized HTTP headers, such as a custom `User-Agent`, `Authorization` overrides, or proprietary routing headers. This change allows users to configure these custom headers per AI model in the settings, offering greater flexibility and compatibility with diverse backend environments.

## What Changes

- Add a UI configuration section in `AIModelDialog.vue` to allow adding, editing, and deleting custom HTTP headers (key-value pairs) or entering them as JSON.
- Extend the `AIModel` type interface to include an optional `customHeaders?: Record<string, string>` field.
- Update the AI service factory and specifically the LangChain/OpenAI/Gemini clients to inject these headers into their respective HTTP requests when the model instance specifies them.

## Capabilities

### New Capabilities

- `model-custom-headers`: Configuration, storage, and application of user-defined HTTP headers when establishing connections to AI providers.

### Modified Capabilities

## Impact

- **UI Component**: `AIModelDialog.vue` will involve new layout additions.
- **Data Model**: `AIModel` interface in `src/services/ai/types/ai-model.ts` will receive the new `customHeaders` field.
- **HTTP Client**: AI provider constructors in `src/services/ai/providers/` (like OpenAI, Gemini) will consume `customHeaders` when configuring `fetch`/`axios` or official SDK request options.
