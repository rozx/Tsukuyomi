---
name: release-ready
description: Prepare a release by verifying version consistency, generating release notes, updating help docs, running quality checks, and (when asked) opening the release PR. Use when on a release branch (release/vX.X.X) and ready to finalize a version for deployment.
license: MIT
metadata:
  author: rozx
  version: '1.1'
---

Prepare the current branch for release. This is a multi-step workflow that ensures version consistency, generates documentation, and validates code quality.

**All generated content (release notes, help docs) MUST be written in Chinese (中文).** The release PR itself (title/body) is in English.

---

## Step 1: Version Consistency Check

1. Determine the **current branch name** using `git branch --show-current`.
   - Expected branch format: `release/vX.X.X` (e.g., `release/v0.16.2`). Older branches used `vX.X.X-release`; accept either.
   - Extract the target version from the branch name (e.g., `0.16.2`).

2. Read `package.json` and check the `version` field.

3. **If the version does NOT match** the branch target version:
   - Run `bun bump <version>` to update. For example: `bun bump 0.16.2`.
   - This updates both `package.json` and `src/constants/version.ts`.
   - Verify the update was successful by re-reading both files.
   - Note: the pre-commit hook appends a build number on commit (e.g. `version.ts` becomes `0.16.2.1`). That is expected — don't "fix" it.

4. **If the version already matches**, report success and move on.

---

## Step 2: Generate Release Notes

1. **Identify the previous release version** by finding the latest git tag:

   ```bash
   git tag --sort=-v:refname | head -5
   ```

   The previous version tag is typically `vX.X.X` (e.g., `v0.16.1`).

2. **Gather all changes** between the previous release and the current branch:

   ```bash
   git --no-pager log <previous-tag>..HEAD --no-merges --pretty=format:"=== %h %s%n%b"
   git --no-pager diff <previous-tag>..HEAD --stat=200 | grep -v '^ openspec/changes/archive'
   ```

   Commit bodies are often empty. When they are, get the substance from:
   - Archived OpenSpec changes in the range (`openspec/changes/archive/<date>-<name>/proposal.md`, `design.md`, `validation/*.md`) — these describe the user-facing behavior and intent.
   - Diffs of the UI files (`git diff <tag>..HEAD -- <file>`) for user-visible labels and layout changes.

3. **Verify every "new" claim against the previous tag.** Before writing that something was added, check it didn't already exist: `git show <previous-tag>:<path> | grep <thing>`. A redesign that renames or restyles an existing section is a change, not a new feature.

4. **Read the most recent release notes** in `public/releaseNotes/` (sort by mtime: `ls -t public/releaseNotes | head -3`) and follow the same structure and formatting.

5. **Create the new release notes file** at:

   ```
   public/releaseNotes/RELEASE_NOTES_v<VERSION>.md
   ```

   The release note MUST follow this structure:

   ```markdown
   # 发布说明 - vX.X.X

   ## 版本信息

   - **版本号**: X.X.X
   - **发布日期**: YYYY 年 M 月 D 日
   - **基于版本**: vX.X.X (previous version)

   <One-paragraph overview of the release in Chinese>

   ---

   ## <emoji> <Feature Category in Chinese> (<English subtitle>)

   - **<Point>**：<Detailed description in Chinese>

   ---

   ## 📝 问题修复

   - 修复：<description in Chinese>

   ---

   ## 📌 升级说明 (Upgrade Notes)

   - <Data compatibility, removed behaviors, dependency changes — omit section if nothing applies>

   ---

   ## 📚 相关文档

   - **<Doc Title>**: [`help/<filename>.md`](../help/<filename>.md)

   ---

   _本文档基于 git changes vX.X.X..vX.X.X_
   ```

   **Guidelines:**
   - Group related changes into logical categories with emoji headers.
   - Use descriptive Chinese text for all content.
   - Include English subtitles in parentheses for category headers.
   - Be specific about what changed and why it matters to users.
   - Quote UI labels exactly as they appear in source.
   - Reference related help docs at the bottom.

6. **Update `public/help/index.json`**:
   - Add a new entry for the release note at the **top of the release notes section** (after the help doc entries, before other release note entries):
     ```json
     {
       "id": "vX.X.X",
       "title": "vX.X.X",
       "file": "RELEASE_NOTES_vX.X.X.md",
       "path": "releaseNotes",
       "category": "更新日志",
       "description": "<Brief summary of key changes in Chinese>"
     }
     ```
   - The new entry should be inserted **before** the existing release note entries (newest first).

---

## Step 3: Update Help Documentation

1. **Find every help doc that touches the changed areas**, not just ones already edited on the branch:

   ```bash
   grep -rn -E '<old label>|<feature keyword>|<removed behavior>' public/help/*.md
   ```

   Search for old UI labels, removed behaviors, and feature keywords from Step 2. Getting-started pages (e.g. `front-page.md`) often repeat steps from feature guides.

2. **Audit each affected page end to end against the current UI.** A help doc already updated on the branch may only cover the new section while the rest of the page is stale (removed pagination, renamed fields, old card contents, missing mobile layout). For each page:
   - Read the whole file.
   - Read the corresponding page/dialog/variant components (Desktop / Tablet / Mobile) and compare section by section: fields, their order, labels, buttons, what cards display, which conditions show/hide fields.
   - Rewrite stale sections; add sections for new features; update FAQ.
   - Maintain the existing format and style. All content MUST be in Chinese.

3. **Verify quoted labels.** Every button/field label quoted in the docs must exist in source:

   ```bash
   grep -rn -E '<label1>|<label2>' src | grep -v __tests__
   ```

4. **If a new help doc is needed**:
   - Create it in `public/help/` following the naming convention of existing files.
   - Add a corresponding entry to `public/help/index.json` in the appropriate category:
     ```json
     {
       "id": "<kebab-case-id>",
       "title": "<Chinese title>",
       "file": "<filename>.md",
       "path": "help",
       "category": "<使用指南 or 书籍详情页>",
       "description": "<Brief description in Chinese>"
     }
     ```

5. **If no help doc changes are needed**, explicitly state so and explain why.

---

## Step 4: Quality Checks

1. **Run type checking**:

   ```bash
   bun run type-check
   ```
   - If errors are found, fix them before proceeding.
   - Report all errors and fixes applied.

2. **Run linting**:

   ```bash
   bun run lint
   ```
   - If errors are found, fix them.
   - Warnings should be reviewed but may be acceptable.

3. **Check formatting of changed docs** (also validates `index.json` parses):

   ```bash
   bunx prettier --check public/help/index.json public/releaseNotes/RELEASE_NOTES_vX.X.X.md <changed help docs>
   ```

4. **Report final status**:
   - Summarize all changes made during this release preparation.
   - List all files created or modified.
   - Confirm the release is ready (or report remaining issues).

---

## Step 5: Release PR (only when the user asks)

Do not commit or open a PR unless the user asks. When they do:

1. **Commit** the release-prep files with a one-line message (e.g. `chore(release): prepare vX.X.X release notes and help docs`) and push the branch.

2. **Match the previous release PR.** Check it first:

   ```bash
   gh pr list --repo rozx/Tsukuyomi --state all --limit 20 --json number,title,headRefName | grep -i release
   gh pr view <n> --repo rozx/Tsukuyomi --json title,body,labels
   ```

3. **Open the PR** against `main`:
   - **Title**: `Release vX.X.X: <short summary>` (e.g. `Release v0.16.1: release notes and desktop update help docs`). Not conventional-commit style.
   - **Body** (English): `## Summary` (version bump incl. hook build number, release notes coverage, each help doc change), `## Notes for reviewers` (no code changes, anything non-obvious), `## Test plan` (checked boxes for type-check / lint / prettier; unchecked box for rendering the Help page).
   - **Label**: `release` (triggers the Electron release build).
   ```bash
   gh pr create --repo rozx/Tsukuyomi --base main --head release/vX.X.X \
     --title "Release vX.X.X: <summary>" --label release --body-file <body.md>
   ```

---

## Summary Output

After completing Steps 1–4, provide a summary:

```
📋 Release Preparation Summary - vX.X.X
────────────────────────────────────────
✅ Version: package.json and version.ts updated to X.X.X
✅ Release Notes: public/releaseNotes/RELEASE_NOTES_vX.X.X.md created
✅ Help Docs: [updated/no changes needed]
✅ index.json: Updated with new entries
✅ Type Check: Passed
✅ Lint: Passed
✅ Prettier: Passed

Files changed:
  - <list of files>

Ready for release! 🚀
```
