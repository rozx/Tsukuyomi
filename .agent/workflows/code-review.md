---
description: Perform a comprehensive code review on active or specified files.
---

1. **Identify Target Files**:
   - Focus on currently active files or files specified by the user.
   - If no specific files are mentioned, look for recent changes.

2. **Automated Checks**:
   - Run `npm run lint` (if available) to catch static analysis errors.
   - Check for any 'TODO' or 'FIXME' comments that should be addressed.

3. **Manual Logic Review**:
   - **Correctness**: Verify the code achieves its intended purpose. Check for off-by-one errors, null/undefined handling, and race conditions.
   - **Error Handling**: Ensure operations (especially async/network) are wrapped in try-catch blocks and errors are logged/handled gracefully.
   - **Performance**: Look for redundant loops, expensive operations inside loops, or memory leaks.

4. **Code Quality & Style**:
   - **DRY (Don't Repeat Yourself)**: Identify duplicate logic that can be extracted into helper functions.
   - **Readability**: Check variable naming, comment clarity, and function length.
   - **Type Safety**: Ensure strict typing is used where possible; avoid `any`.

5. **Report**:
   - Summarize findings in a structured format:
     - 🔴 **Critical**: Bugs or likely runtime errors.
     - 🟡 **Major**: Logic flaws or significant performance issues.
     - 🔵 **Minor**: Style, naming, or minor refactoring suggestions.
   - Provide concrete code snippets for fixes.
