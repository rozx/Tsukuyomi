---
name: git-commit
description: Commit all current changes with an auto-generated commit message. Use when the user wants to commit their work with a meaningful message.
license: MIT
---

Commit all current changes with an automatically generated commit message.

**Steps**

1. **Check git status**

   Run `git status` to see all untracked and modified files.

2. **Review changes**

   Run `git diff` to see unstaged changes and `git diff --staged` to see staged changes.

3. **Review recent commit history**

   Run `git log --oneline -10` to understand the commit message style used in this repository.

4. **Analyze changes and draft commit message**

   Based on the changes, draft a concise commit message that:
   - Uses the same style as recent commits in the repository
   - Summarizes the nature of changes (feature, fix, refactor, docs, etc.)
   - Focuses on the "why" rather than the "what"
   - Is in the same language as the existing commits (typically Chinese for this project)

5. **Stage and commit**

   ```bash
   git add -A
   git commit -m "<commit-message>"
   ```

6. **Verify commit**

   Run `git status` after committing to verify success.

**Output On Success**

```
✓ Committed: <commit-message>
```

**Guardrails**

- NEVER update git config
- NEVER run destructive commands (--force, hard reset, etc.) unless explicitly requested
- NEVER skip hooks (--no-verify) unless explicitly requested
- NEVER commit files that likely contain secrets (.env, credentials, API keys)
- If there are no changes to commit, inform the user instead of creating an empty commit
- Always verify commit succeeded before reporting success
