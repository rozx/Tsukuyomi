# Spec Delta

## Purpose

定义 AI 厂商适配层（OpenAI 兼容服务与 Gemini）对上层任务与助手的行为契约：流式输出、思考内容分离、工具调用、兼容性规则、错误与取消语义、请求路由，以及模型列表与配置探测，使上层逻辑与具体厂商和底层 SDK 解耦。

## ADDED Requirements

### Requirement: Streaming text generation contract

The adapter SHALL stream generated output to the caller-supplied chunk callback as it arrives, and SHALL resolve with the complete result after the stream ends. Visible answer text and reasoning ("thinking") text SHALL be delivered in separate fields; reasoning text MUST NOT appear in the visible text.

#### Scenario: Incremental visible text

- **WHEN** a model streams the answer "你好" in two deltas "你" and "好"
- **THEN** the callback SHALL receive two non-final chunks whose `text` fields are "你" and "好" in order
- **AND** the resolved result `text` SHALL be "你好" with surrounding whitespace trimmed

#### Scenario: Final chunk marks completion

- **WHEN** the stream ends
- **THEN** the callback SHALL receive exactly one chunk with `done: true`
- **AND** that chunk SHALL carry the final tool calls, if any

#### Scenario: Reasoning delivered separately

- **WHEN** a model streams reasoning deltas (e.g. OpenAI-compatible `reasoning_content` / `reasoning`, or Gemini thought parts) followed by answer text
- **THEN** reasoning SHALL be delivered only via the chunk `reasoningContent` field with an empty `text`
- **AND** the resolved result SHALL expose the concatenated reasoning as `reasoningContent`
- **AND** the resolved result `text` SHALL contain only the answer text

#### Scenario: Inline think tags are separated

- **WHEN** an OpenAI-compatible model emits `<think>…</think>` inside its content stream, including tags split across delta boundaries
- **THEN** text inside the tags SHALL be treated as reasoning
- **AND** text outside the tags SHALL be treated as visible answer text

#### Scenario: Model id reported

- **WHEN** the provider reports the serving model id in the stream
- **THEN** chunks and the resolved result SHALL report that id, falling back to the configured model name when absent

### Requirement: Tool call results

When tools are supplied, the adapter SHALL return every tool call the model made in a single response as `{ id, type: 'function', function: { name, arguments } }`, where `arguments` is the raw JSON argument string as produced by the model. The adapter MUST NOT validate, repair, or drop tool calls based on argument content; argument parsing, repair, and truncation detection remain the caller's responsibility.

#### Scenario: Argument deltas are concatenated

- **WHEN** a model streams one tool call whose arguments arrive in several deltas
- **THEN** the returned tool call `arguments` SHALL equal the exact concatenation of those deltas

#### Scenario: Truncated arguments are passed through unchanged

- **WHEN** a tool call's streamed arguments end mid-JSON (e.g. `{"items":[{"text":"半截`) because the output token limit was reached
- **THEN** the adapter SHALL return that tool call with the truncated string unchanged
- **AND** SHALL NOT throw or substitute a repaired value

#### Scenario: Parallel tool calls keep order

- **WHEN** a model makes several tool calls in one response
- **THEN** all of them SHALL be returned in the order the model emitted them

#### Scenario: Missing tool call id

- **WHEN** a provider returns a tool call without an id
- **THEN** the adapter SHALL assign an id that is non-empty and unique within the response

#### Scenario: Unnamed tool call fragments are discarded

- **WHEN** an accumulated tool call has an empty function name
- **THEN** it SHALL NOT appear in the returned tool calls

#### Scenario: Tool calls with no visible text

- **WHEN** a model returns tool calls but no visible text
- **THEN** the adapter SHALL resolve successfully with an empty `text` and the tool calls

### Requirement: Conversation history round-trip

The adapter SHALL accept the application's conversation history format (system / user / assistant-with-optional-tool-calls / tool-result messages) and SHALL faithfully convey it to every supported provider, including data the provider requires to be echoed back on later turns.

#### Scenario: Tool results are matched to calls

- **WHEN** history contains an assistant message with tool calls followed by tool-result messages referencing those call ids
- **THEN** the request SHALL present each tool result as the response to the matching call

#### Scenario: Reasoning echoed for OpenAI-compatible tool turns

- **WHEN** history contains an assistant message with tool calls sent to an OpenAI-compatible endpoint
- **THEN** the outgoing assistant message SHALL include a `reasoning_content` field, set to the recorded reasoning or `null` when none was recorded

#### Scenario: Gemini thought signatures round-trip

- **WHEN** a Gemini response includes a thought signature on a function call
- **THEN** the returned tool call SHALL carry that signature as provider metadata
- **AND** when that assistant message is sent back in later history, the signature SHALL be attached to the same function call

#### Scenario: Gemini history without recorded signatures

- **WHEN** history sent to Gemini contains assistant tool calls with no recorded thought signature (e.g. conversations saved before this change, or produced by another provider)
- **THEN** the request SHALL still be accepted by Gemini thinking models

#### Scenario: Legacy history remains readable

- **WHEN** stored conversation history lacks fields introduced by this capability
- **THEN** it SHALL be sent without error and without migration of stored data

#### Scenario: Prompt-only request

- **WHEN** a request provides a prompt string and no message list
- **THEN** it SHALL be sent as a single user message

### Requirement: Token usage reporting

The adapter SHALL report the token usage measured by the provider for each generation, so callers can base context-budget decisions on real counts instead of local estimates. Usage fields SHALL be optional; the adapter MUST NOT fabricate values the provider did not report.

#### Scenario: Provider reports usage

- **WHEN** a response completes and the provider reported token usage
- **THEN** the resolved result SHALL include `usage` with the provider's input token count and output token count
- **AND** SHALL include reasoning token count and cached input token count when the provider reported them

#### Scenario: OpenAI-compatible streaming requests usage

- **WHEN** a streaming request is sent to an OpenAI-compatible endpoint
- **THEN** the request SHALL ask the endpoint to include usage in the stream

#### Scenario: Provider omits usage

- **WHEN** the provider does not report usage (e.g. an endpoint that ignores the usage request)
- **THEN** the resolved result SHALL omit `usage` or the missing fields, and generation SHALL still succeed

### Requirement: OpenAI-compatible request compatibility

Requests to OpenAI-compatible endpoints SHALL apply the compatibility rules that third-party services (DeepSeek, Moonshot/Kimi, OpenRouter, local servers) depend on.

#### Scenario: Explicit auto tool choice

- **WHEN** a request includes tools
- **THEN** the outgoing request SHALL set `tool_choice` to `"auto"`

#### Scenario: Empty assistant content with tool calls

- **WHEN** an assistant history message has tool calls and empty or whitespace-only content
- **THEN** the outgoing message content SHALL be the tool-call placeholder text instead of empty

#### Scenario: Empty tool result

- **WHEN** a tool-result message has empty content
- **THEN** the outgoing tool message content SHALL be a non-empty placeholder

#### Scenario: Empty plain messages are dropped

- **WHEN** a system, user, or assistant message without tool calls has empty or whitespace-only content
- **THEN** it SHALL be omitted from the outgoing request

#### Scenario: Output token limit clamped

- **WHEN** a max-output-token value greater than 0 is configured or requested
- **THEN** the outgoing `max_tokens` SHALL be clamped to the range [1, 65536]
- **AND** when the value is absent or 0, no output token limit SHALL be sent

### Requirement: Gemini thinking mode

For Gemini models in the 2.x and 3.x families, the adapter SHALL request thought summaries and deliver them as reasoning; for other Gemini models it SHALL NOT request them.

#### Scenario: Thinking-capable model

- **WHEN** a request targets a model whose name contains `gemini-2` or `gemini-3`
- **THEN** the request SHALL ask the provider to include thoughts
- **AND** thought parts SHALL be delivered as reasoning, never as visible text

#### Scenario: Model name prefix normalized

- **WHEN** the configured Gemini model name starts with `models/`
- **THEN** the prefix SHALL be removed before the request is sent

### Requirement: Error, empty-response, and cancellation semantics

The adapter SHALL retry only transient failures a bounded number of times, SHALL distinguish an empty response, and SHALL stop promptly on cancellation.

#### Scenario: Empty response

- **WHEN** a response completes with no visible text and no tool calls
- **THEN** the adapter SHALL reject with the dedicated empty-response error type

#### Scenario: Transient failure retried

- **WHEN** a request fails with a rate limit (429), a 5xx status, or a connection error before any output was streamed
- **THEN** the adapter SHALL retry it at most 2 times with backoff
- **AND** if every attempt fails, SHALL reject with an error whose message includes the provider's error message

#### Scenario: Non-transient failure not retried

- **WHEN** a request fails with a 4xx status other than 429 (e.g. invalid key, context length exceeded)
- **THEN** the adapter SHALL NOT retry and SHALL reject with an error whose message includes the provider's error message, so callers' token-limit detection keeps working

#### Scenario: Cancellation

- **WHEN** the caller's abort signal fires while a response is streaming
- **THEN** the adapter SHALL stop consuming the stream, SHALL NOT deliver further chunks, and SHALL reject with an error recognizable as a cancellation (name `AbortError` or message containing `取消`)

#### Scenario: Gemini default timeout

- **WHEN** a Gemini request is made without a caller abort signal
- **THEN** the request SHALL be aborted after 100 seconds

#### Scenario: Missing credentials

- **WHEN** a generation request has an empty API key or empty model name, or has neither prompt nor messages
- **THEN** the adapter SHALL reject before sending any network request

### Requirement: Request routing

The adapter SHALL build request URLs and headers from the model configuration consistently for generation, config discovery, and model listing.

#### Scenario: OpenAI-compatible base URL normalization

- **WHEN** an OpenAI-compatible base URL has no path (e.g. `https://api.moonshot.cn` or `https://api.moonshot.cn/`)
- **THEN** requests SHALL use `<base>/v1`
- **AND** a base URL with an explicit path SHALL be used as given, minus trailing slashes

#### Scenario: Default OpenAI base URL

- **WHEN** an OpenAI-compatible model has no base URL
- **THEN** requests SHALL use `https://api.openai.com/v1`

#### Scenario: Local proxy path

- **WHEN** an OpenAI-compatible base URL starts with `/api/ai/`
- **THEN** requests SHALL be sent to that path on the current page origin

#### Scenario: Custom headers on every request

- **WHEN** a model configuration has custom headers
- **THEN** generation, config discovery, and model listing requests for either provider SHALL include them

#### Scenario: Gemini generation honors CORS toggle and base URL

- **WHEN** a Gemini generation request is made in SPA mode for a model with the CORS proxy enabled
- **THEN** the request URL SHALL be wrapped with the CORS proxy, as for OpenAI-compatible models
- **AND** a configured Gemini base URL SHALL replace the default Google endpoint

### Requirement: Model listing

The adapter SHALL list available models for a provider using the model's credentials and routing.

#### Scenario: OpenAI-compatible model list

- **WHEN** models are listed for an OpenAI-compatible endpoint
- **THEN** each model id from the endpoint's `/models` response SHALL be returned as id, name, and display name, with its owner when provided

#### Scenario: OpenAI-compatible listing failure

- **WHEN** the OpenAI-compatible `/models` request fails
- **THEN** the result SHALL have `success: false` and a message describing the error

#### Scenario: Gemini model list filtered to generation models

- **WHEN** models are listed for Gemini
- **THEN** only models supporting `generateContent` SHALL be returned, with the `models/` prefix removed and owner `Google`

#### Scenario: Gemini listing failure degrades to empty list

- **WHEN** the Gemini model list request fails
- **THEN** the result SHALL be successful with an empty model list so the user can still type a model name

### Requirement: Model config discovery

The adapter SHALL probe a configured model by asking it to report its token limits as JSON, and SHALL tolerate non-JSON replies.

#### Scenario: JSON reply

- **WHEN** the model replies with JSON containing `maxInputTokens` and `maxOutputTokens`
- **THEN** the result SHALL be successful and report those values

#### Scenario: Legacy field names

- **WHEN** the reply uses `contextWindow` or `maxTokens` instead
- **THEN** they SHALL be read as the input and output limits respectively

#### Scenario: Non-JSON reply

- **WHEN** the reply is prose containing e.g. `maxInputTokens: 128000`
- **THEN** positive integer limits SHALL be extracted from the text

#### Scenario: Probe failure

- **WHEN** the probe request fails
- **THEN** the result SHALL have `success: false` and a message describing the error
