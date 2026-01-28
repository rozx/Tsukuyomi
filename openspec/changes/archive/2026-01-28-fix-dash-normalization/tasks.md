## 1. Code Changes

- [x] 1.1 Modify `src/utils/translation-normalizer.ts`: Remove lines 480-481 that merge 3+ dashes into double dashes
- [x] 1.2 Keep the logic that converts single dashes (—, –) to double dash (——)

## 2. Test Updates

- [x] 2.1 Update `src/__tests__/translation-normalizer.test.ts`: Modify test at line 205-207 to expect 3+ dashes to be preserved
- [x] 2.2 Add new test case: Verify 4 dashes "————" remain as "————"
- [x] 2.3 Add new test case: Verify single "—" converts to "——"
- [x] 2.4 Run tests to ensure all pass

## 3. Verification

- [x] 3.1 Run `bun test translation-normalizer` to verify all tests pass
- [x] 3.2 Run `bun run lint` to ensure code style compliance
- [x] 3.3 Run `bun run type-check` to verify no TypeScript errors
