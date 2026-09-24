# translation-batch-save Specification

## Purpose
保证多个章节并发翻译时各自的保存互不覆盖，不因异步写入竞争丢失数据。

## Requirements

### Requirement: Concurrent multi-chapter translation saving

The system SHALL support multiple chapters translating concurrently without data loss due to asynchronous overwrites.

#### Scenario: Simultaneous translation completion

- **WHEN** multiple chapters finish translating chunks at the exact same time
- **THEN** all translations from all chapters are persisted safely into the database without silently overriding one another
