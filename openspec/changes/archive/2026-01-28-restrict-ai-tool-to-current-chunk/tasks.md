## 1. ToolContext Interface Extension

- [x] 1.1 Add `ChunkBoundaries` interface to `src/services/ai/tools/types.ts`
- [x] 1.2 Add optional `chunkBoundaries` field to `ToolContext` interface

## 2. Tool Registry Signature Update

- [x] 2.1 Modify `ToolRegistry.handleToolCall()` to accept optional `paragraphIds` parameter and add `sessionId` parameter
- [x] 2.2 Build `chunkBoundaries` context from `paragraphIds` before calling tool handlers
- [x] 2.3 Update `ToolRegistry` type definitions if needed

## 3. Paragraph Tools - Boundary Enforcement

- [x] 3.1 Add boundary check helper function in `paragraph-tools.ts`
- [x] 3.2 Modify `get_next_paragraphs` handler to check chunk boundaries
- [x] 3.3 Modify `get_previous_paragraphs` handler to check chunk boundaries
- [x] 3.4 Modify `get_paragraph_position` handler to respect boundaries for `include_next`/`include_previous`
- [x] 3.5 Add unit tests for boundary enforcement in paragraph tools

## 4. Task Runner Integration

- [x] 4.1 Modify `executeToolCall` in `tool-executor.ts` to accept and forward `paragraphIds`
- [x] 4.2 Update `ToolCallLoopConfig` interface to ensure `paragraphIds` is required (already exists)
- [x] 4.3 Modify `TaskLoopSession.processToolCalls()` to pass `paragraphIds` to `ToolRegistry.handleToolCall()`

## 5. Translation Service Integration

- [x] 5.1 Verify `TranslationService.translate()` passes `paragraphIds` to `executeToolCallLoop()` (already exists in config)
- [x] 5.2 Update `executeToolCallLoop` call in translation-service to ensure paragraphIds flows correctly
- [x] 5.3 Test translation with multiple chunks to verify boundary enforcement

## 6. Polish Service Integration

- [x] 6.1 Update `PolishService.polish()` to pass `paragraphIds` to `executeToolCallLoop()` (already passes)
- [x] 6.2 Test polish task with chunk boundaries

## 7. Proofreading Service Integration

- [x] 7.1 Update `ProofreadingService.proofread()` to pass `paragraphIds` to `executeToolCallLoop()` (already passes)
- [x] 7.2 Test proofreading task with chunk boundaries

## 8. Error Messages and UX

- [x] 8.1 Create consistent boundary violation error message format
- [x] 8.2 Add first/last paragraph ID info to error messages
- [x] 8.3 Test error messages are helpful and actionable

## 9. Testing and Verification

- [x] 9.1 Test that AI cannot access paragraphs outside current chunk using `get_next_paragraphs`
- [x] 9.2 Test that AI cannot access paragraphs outside current chunk using `get_previous_paragraphs`
- [x] 9.3 Test that `get_paragraph_position` respects boundaries for optional includes
- [x] 9.4 Test that AI assistant chat (non-chunked context) can still access any paragraphs without boundaries
- [x] 9.5 Test that other non-translation contexts (explain service, term translation) remain unrestricted
- [x] 9.6 Test error handling when AI attempts boundary violation
- [x] 9.7 Run existing tests to ensure no regression (type-check and lint pass)

## 10. Documentation

- [x] 10.1 Update code comments explaining chunk boundary enforcement
- [x] 10.2 Add JSDoc to new `ChunkBoundaries` interface
- [x] 10.3 Document behavior in AI tool descriptions (optional) - skipped as implementation is self-documenting
