## Purpose

本规格定义翻译、润色和校对任务共享的段落级分块规则，包括模型输入文本的大小计量、段落完整性、小尾块合并及重试重建行为，从而让三类 AI 任务使用一致且可预测的请求边界。

## Requirements

### Requirement: AI text tasks share paragraph-aligned chunk construction

The system SHALL construct translation, polish, and proofreading task chunks through the same paragraph-aligned chunking behavior. It SHALL measure chunk size using the formatted text sent to the model and SHALL NOT split an individual paragraph between chunks.

#### Scenario: Task types use the shared chunking behavior

- **WHEN** equivalent chapter content and `chunkSize` are processed by translation, polish, or proofreading
- **THEN** each task SHALL apply the same chunk boundary and final-chunk merge rules
- **AND** task-specific paragraph formatting MAY produce different concrete boundaries because formatted text lengths differ

#### Scenario: Oversized paragraph remains intact

- **WHEN** one formatted paragraph exceeds `chunkSize`
- **THEN** the system SHALL keep that paragraph intact in a single chunk

### Requirement: Small final task chunk is merged into its predecessor

When task chunk construction produces at least two chunks, the system SHALL merge the final chunk into the immediately preceding chunk if the final chunk's formatted text length is strictly less than one third of the configured `chunkSize`. The merged chunk SHALL preserve text order and paragraph ID order, and SHALL NOT be split again merely because the merged size exceeds `chunkSize`.

#### Scenario: Final chunk is smaller than one third

- **GIVEN** initial chunk construction produces multiple chunks
- **AND** the final chunk's formatted text length multiplied by three is less than `chunkSize`
- **WHEN** chunk construction completes
- **THEN** the final chunk SHALL be appended to the preceding chunk
- **AND** the final chunk SHALL NOT remain as a separate AI request

#### Scenario: Final chunk is exactly one third

- **GIVEN** initial chunk construction produces multiple chunks
- **AND** the final chunk's formatted text length multiplied by three equals `chunkSize`
- **WHEN** chunk construction completes
- **THEN** the final chunk SHALL remain separate

#### Scenario: Final chunk is larger than one third

- **GIVEN** initial chunk construction produces multiple chunks
- **AND** the final chunk's formatted text length multiplied by three is greater than `chunkSize`
- **WHEN** chunk construction completes
- **THEN** the final chunk SHALL remain separate

#### Scenario: Chapter produces at most one chunk

- **WHEN** a chapter produces zero or one task chunk
- **THEN** the system SHALL return that result unchanged

#### Scenario: Retry rebuilds remaining task chunks

- **WHEN** a translation, polish, or proofreading retry rebuilds chunks from remaining paragraph IDs
- **THEN** the rebuilt chunks SHALL apply the same small-final-chunk merge rule
