---
name: git-commit
description: Commit all current changes in this repo with an auto-generated one-line commit message that follows the repository's existing style. Use when the user wants to commit their work and has not written the message themselves.
license: MIT
---

Commit all current changes with an automatically generated commit message.

**Steps**

1. **Check git status**

   Run `git status --short` to see untracked and modified files. If some changes clearly belong to unrelated work (for example another session's edits), ask the user before including them.

2. **Review changes**

   Run `git --no-pager diff` for unstaged changes and `git --no-pager diff --staged` for staged changes.

3. **Review recent commit history**

   Run `git --no-pager log --oneline -10` to match the repository's message style.

4. **Draft the commit message**

   - One line only, in the same style as recent commits: conventional-commit prefix (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:` …) followed by a short English summary.
   - Summarize the nature of the change and why, not a file list.

5. **Stage and commit**

   ```bash
   git add -A
   git commit -m "<commit-message>"
   ```

   The pre-commit hook bumps the build number in `src/constants/version.ts` and adds it to the commit. That is expected.

6. **Verify**

   Run `git status --short` and `git --no-pager log --oneline -1` to confirm the commit succeeded.

**Output on success**

```
✓ Committed: <commit-message>
```

**Guardrails**

- Never change git config.
- Never run destructive commands (`--force`, `reset --hard`, `stash`, etc.) unless explicitly requested.
- Never skip hooks (`--no-verify`) unless explicitly requested.
- Never commit files that likely contain secrets (`.env`, credentials, API keys).
- If there is nothing to commit, say so instead of creating an empty commit.
