# assistant-context-management Specification

## Purpose

定义助手对话与导入 agent 的上下文管理：以厂商实测用量为锚点度量上下文占用，在接近窗口上限时用单一算法压缩历史（保留近期消息 + 更新结构化摘要），在超限报错时恢复一次，并保证压缩不丢失未摘要的历史、不拆开工具调用与结果。

## Requirements

### Requirement: Usage-anchored context measurement

The system SHALL measure a conversation's context size from the provider-reported input token count of the most recent request (the anchor), adding a local estimate only for content not covered by that anchor. A single measurement SHALL be used for compaction decisions, the assistant chat usage meter, and AI task panels.

#### Scenario: Anchor plus delta

- **GIVEN** the last request for a session reported 42,000 input tokens
- **WHEN** a tool result and a new user message have been appended since that request
- **THEN** the measured context SHALL be 42,000 plus the estimated tokens of only those appended messages, plus the estimated difference if the system prompt or tool set has changed since the anchor

#### Scenario: No anchor available

- **WHEN** a session has no anchor (new session, legacy session, or the provider did not report usage)
- **THEN** the measured context SHALL be a full local estimate of system prompt, tool definitions, and history
- **AND** the measurement SHALL be flagged as estimated

#### Scenario: Anchor invalidated

- **WHEN** the session's history is compacted, or the assistant model is switched to a different model
- **THEN** the previous anchor SHALL NOT be used until a new request reports usage

#### Scenario: Estimates self-calibrate

- **WHEN** a request reports its real input token count for a model
- **THEN** subsequent local estimates for that model SHALL be scaled by the observed ratio between the real count and the local estimate for the same request, bounded to the range [0.5, 3]
- **AND** before any observation, the default scaling factor SHALL be used

### Requirement: Compaction trigger

The system SHALL compact a conversation before a model request when the measured context exceeds the effective context window minus a reserve. The reserve SHALL be the model's effective maximum output tokens (16,384 when unknown), clamped to [4,096, 32,768] and to at most 25% of the window.

#### Scenario: Proactive compaction before sending

- **GIVEN** a model with a 128,000-token window and 8,192 max output tokens (reserve 8,192)
- **WHEN** the user sends a message and the measured context is 121,000 tokens
- **THEN** the conversation SHALL be compacted before the request is sent

#### Scenario: Compaction between tool-loop steps

- **WHEN** during a single assistant reply the tool loop is about to make its next model request and the measured context exceeds the threshold
- **THEN** the conversation SHALL be compacted before that request, and the reply SHALL continue after compaction

#### Scenario: Below threshold

- **WHEN** the measured context is at or below the threshold
- **THEN** no compaction SHALL occur

#### Scenario: Unknown window

- **WHEN** the model's effective context window is unknown
- **THEN** no proactive compaction SHALL occur; only overflow recovery applies

#### Scenario: No estimate-based hard stop

- **WHEN** an execution-mode conversation (e.g. an import run) is about to make a model request and its measured context exceeds the window
- **THEN** the conversation SHALL NOT be paused for context limit before attempting proactive compaction and overflow recovery
- **AND** a context-limit pause SHALL occur only when overflow recovery fails

#### Scenario: Message count does not trigger compaction

- **WHEN** a session accumulates many messages while the measured context stays below the threshold
- **THEN** no compaction SHALL occur based on message count

### Requirement: Keep-recent compaction

Compaction SHALL replace older messages with an updated summary while keeping the most recent messages verbatim, within a keep-recent budget of min(20,000 tokens, 25% of the window). Cut points MUST NOT separate a tool call from its results.

#### Scenario: Recent messages kept verbatim

- **WHEN** a conversation is compacted
- **THEN** messages are kept, walking back from the newest, until adding the next older message would exceed the keep-recent budget
- **AND** all kept messages SHALL be sent unchanged in subsequent requests

#### Scenario: Tool calls and results stay together

- **WHEN** the budget boundary falls between an assistant message with tool calls and its tool-result messages, or among those results
- **THEN** the cut SHALL move earlier so that the assistant message and all of its tool results are either all kept or all summarized

#### Scenario: Current request kept

- **WHEN** compaction happens during a reply (before sending or between tool-loop steps)
- **THEN** the user message that started the reply SHALL always be kept verbatim
- **AND** if the cut falls after that user message, the kept history SHALL be that user message followed by the kept later messages

#### Scenario: Kept history starts with a user message

- **WHEN** compaction completes
- **THEN** the first non-system message of the kept history SHALL be a user message

#### Scenario: Pending tool calls block compaction

- **WHEN** the history ends with tool calls that have not all received results
- **THEN** those tool calls and any results received so far SHALL be kept

#### Scenario: Nothing to compact

- **WHEN** every message already fits in the keep-recent budget, or the only candidates for summarizing are the kept messages
- **THEN** compaction SHALL be skipped and reported as not applicable

### Requirement: Structured summary

The summary SHALL be a structured document that is updated in place across compactions, covering: goal, user constraints and preferences, progress, key decisions, user Q&A (questions asked via `ask_user` / `ask_user_batch` and the answers), next steps, and key identifiers (book / chapter / paragraph ids, terms, character names). A new compaction MUST update the previous summary with the newly summarized messages, not append a second summary.

#### Scenario: First compaction

- **WHEN** a conversation without a summary is compacted
- **THEN** the summary SHALL be generated from the messages being removed, using the structured sections

#### Scenario: Subsequent compaction updates the summary

- **WHEN** a conversation that already has a summary is compacted again
- **THEN** the model SHALL be given the previous summary and the newly removed messages and SHALL return one updated summary
- **AND** the stored summary SHALL be replaced by that result, not concatenated

#### Scenario: User answers preserved

- **WHEN** removed messages include an `ask_user` or `ask_user_batch` call and its answers
- **THEN** the updated summary SHALL include the questions and the final answers

#### Scenario: Tool content clipped in summarizer input

- **WHEN** removed messages contain long tool arguments or tool results
- **THEN** the summarizer input SHALL include each tool call's name and clipped arguments and each clipped result, so identifiers remain available

#### Scenario: Oversized summarizer input

- **WHEN** the messages to summarize do not fit in one summarization request within the model's window
- **THEN** they SHALL be summarized in consecutive segments, each segment updating the summary produced by the previous one, so no removed message is skipped

#### Scenario: Summary size bounded

- **WHEN** a summary is generated
- **THEN** the summarization request SHALL cap its output to at most 2,048 tokens (or the model's max output if smaller)

### Requirement: Compaction failure never loses history

If summary generation fails, the system SHALL keep the full uncompacted history and SHALL NOT replace the summary with a fabricated fallback or silently drop messages.

#### Scenario: Summarization request fails during proactive compaction

- **WHEN** proactive compaction is triggered and the summarization request fails
- **THEN** history and the stored summary SHALL remain unchanged
- **AND** the original model request SHALL still be sent
- **AND** the user SHALL be notified that compaction failed

#### Scenario: Summary rejected as invalid

- **WHEN** the summarization response is empty or shorter than 20 characters
- **THEN** it SHALL be treated as a failed summarization

#### Scenario: Cancelled during compaction

- **WHEN** the user cancels while compaction is in progress
- **THEN** history and the stored summary SHALL remain unchanged

### Requirement: Context overflow recovery

When a provider rejects a request because the context is too long, the system SHALL compact and retry that request exactly once.

#### Scenario: Overflow error detected

- **WHEN** a request fails with an error whose message indicates the context is too long (e.g. contains `context_length_exceeded`, `maximum context length`, `context window`, `too many tokens`, `input is too long`, `prompt is too long`, or `exceeds the maximum number of tokens`, case-insensitive)
- **THEN** it SHALL be treated as a context overflow

#### Scenario: Recover once

- **WHEN** a context overflow occurs
- **THEN** the conversation SHALL be compacted with the keep-recent budget halved, and the failed request SHALL be retried once

#### Scenario: Recovery fails

- **WHEN** compaction is not applicable, the summarization fails, or the retried request overflows again
- **THEN** the reply SHALL fail with a message telling the user the conversation exceeds the model's context and suggesting a new session
- **AND** history SHALL NOT be truncated

### Requirement: Assistant session persistence after compaction

After a successful assistant compaction, the session SHALL store the updated summary and only the kept history for future requests, while the visible chat transcript stays intact.

#### Scenario: Stored state after compaction

- **WHEN** an assistant session is compacted
- **THEN** the session summary SHALL be the updated summary
- **AND** the stored request history SHALL be exactly the kept messages
- **AND** all visible chat messages SHALL remain displayed

#### Scenario: Summary injected into the system prompt

- **WHEN** a request is made for a session with a summary
- **THEN** the system prompt SHALL include the summary, marked as the summary of earlier conversation

#### Scenario: Large kept history is persisted together with its summary

- **WHEN** the serialized kept request history exceeds 512,000 characters
- **THEN** the system SHALL still attempt to persist the summary, kept history, visible-message indices, and anchor as one session state
- **AND** it SHALL NOT silently skip the history while saving the summary

#### Scenario: Session persistence fails

- **WHEN** saving the candidate session state fails, including a storage quota error
- **THEN** the previous stored and in-memory summary, request history, indices, and anchor SHALL remain unchanged
- **AND** the user SHALL be notified of the failure

#### Scenario: Active session changes during a reply

- **WHEN** the user switches to another session before the reply is saved
- **THEN** the result SHALL be saved only to the session that initiated the request

#### Scenario: Compaction shown in the transcript

- **WHEN** compaction starts and finishes during a reply
- **THEN** the transcript SHALL show an in-progress compaction notice that changes to a completed notice, and the reply SHALL continue in a new assistant message

#### Scenario: Legacy session without stored request history

- **WHEN** a session saved before this change has visible messages but no stored request history
- **THEN** its request history SHALL be rebuilt from visible messages after the last summarized index, as before

#### Scenario: Visible message cap unchanged

- **WHEN** a session reaches the visible message storage cap (200)
- **THEN** sending SHALL be blocked with the existing notice, and no compaction SHALL be triggered by the cap

### Requirement: Context usage display

The assistant chat meter and AI task panels SHALL show the measured context size against the effective context window.

#### Scenario: Measured value shown

- **WHEN** the session or task has an anchor
- **THEN** the meter SHALL show the measured token count and its percentage of the effective window

#### Scenario: Estimated value marked

- **WHEN** the measurement is flagged as estimated
- **THEN** the displayed token count SHALL be marked as approximate

#### Scenario: Unknown window

- **WHEN** the effective window is unknown
- **THEN** the meter SHALL show the token count without a percentage

### Requirement: Import agent uses the same context management

The import agent SHALL use the same measurement, trigger, keep-recent compaction, structured summary, and overflow recovery as the assistant, applied to its checkpoint history, while preserving import-specific constraints.

#### Scenario: Automatic compaction before a run step

- **WHEN** an import run is about to make a model request and the measured checkpoint context exceeds the threshold
- **THEN** the checkpoint history SHALL be compacted with the keep-recent rules and the run SHALL continue

#### Scenario: Manual compaction summarizes everything compactable

- **WHEN** the user manually compacts an import conversation that has at least one assistant reply and no remaining tool calls
- **THEN** all history SHALL be summarized except messages that must structurally be kept, regardless of the keep-recent budget, so manual compaction is never skipped as not applicable

#### Scenario: Pending calls block compaction

- **WHEN** the import checkpoint has remaining tool calls waiting to execute (e.g. waiting for the user's answer)
- **THEN** compaction SHALL NOT run, and manual compaction SHALL be rejected with the existing unavailable message

#### Scenario: Overflow during an import run

- **WHEN** an import run's model request fails with a context overflow
- **THEN** the checkpoint SHALL be compacted with the halved keep-recent budget and the request retried once
- **AND** if recovery fails, the run SHALL pause with the existing context-limit error instead of failing the reply

#### Scenario: Resume after context-limit pause

- **WHEN** an import run paused because of a context-limit error is compacted successfully
- **THEN** the run SHALL resume automatically, as before

#### Scenario: Non-history import state untouched

- **WHEN** an import checkpoint is compacted
- **THEN** sources, extraction results, drafts, user selections, and the event log SHALL be unchanged
