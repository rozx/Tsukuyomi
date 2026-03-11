---
name: release-ready
description: Prepare a release by verifying version consistency, generating release notes, updating help docs, and running quality checks. Use when on a release branch (vX.X.X-release) and ready to finalize a version for deployment.
license: MIT
metadata:
  author: rozx
  version: "1.0"
---

Prepare the current branch for release. This is a multi-step workflow that ensures version consistency, generates documentation, and validates code quality.

**All generated content (release notes, help docs) MUST be written in Chinese (中文).**

---

## Step 1: Version Consistency Check

1. Determine the **current branch name** using `git branch --show-current`.
   - Expected branch format: `vX.X.X-release` (e.g., `v0.9.3-release`).
   - Extract the target version from the branch name (e.g., `0.9.3` from `v0.9.3-release`).

2. Read `package.json` and check the `version` field.

3. **If the version does NOT match** the branch target version:
   - Run `bun bump <version>` to update. For example: `bun bump 0.9.3`.
   - This updates both `package.json` and `src/constants/version.ts`.
   - Verify the update was successful by re-reading both files.

4. **If the version already matches**, report success and move on.

---

## Step 2: Generate Release Notes

1. **Identify the previous release version** by finding the latest git tag:
   ```bash
   git tag --sort=-v:refname | head -5
   ```
   The previous version tag is typically `vX.X.X` (e.g., `v0.9.2`).

2. **Gather all changes** between the previous release and the current branch:
   ```bash
   git log <previous-tag>..HEAD --oneline
   git diff <previous-tag>..HEAD --stat
   ```
   Also read individual commit messages for detail when needed:
   ```bash
   git log <previous-tag>..HEAD --pretty=format:"%h %s"
   ```

3. **Read existing release notes** for format reference:
   - Read at least one recent file from `public/releaseNotes/` (e.g., `RELEASE_NOTES_v0.9.2.md`).
   - Follow the same structure and formatting conventions.

4. **Create the new release notes file** at:
   ```
   public/releaseNotes/RELEASE_NOTES_v<VERSION>.md
   ```

   The release note MUST follow this structure:
   ```markdown
   # 发布说明 - vX.X.X

   ## 版本信息

   - **版本号**: X.X.X
   - **发布日期**: YYYY年M月D日
   - **基于版本**: vX.X.X (previous version)

   ---

   ## <emoji> <Feature Category in Chinese> (<English subtitle>)

   <Detailed description of changes in Chinese>

   ---

   ## 📝 问题修复

   - 修复：<description in Chinese>

   ---

   ## 📚 相关文档

   - **<Doc Title>**: `help/<filename>.md`

   ---

   _本文档基于 git changes vX.X.X..vX.X.X_
   ```

   **Guidelines:**
   - Group related changes into logical categories with emoji headers.
   - Use descriptive Chinese text for all content.
   - Include English subtitles in parentheses for category headers.
   - Be specific about what changed and why it matters to users.
   - Reference related help docs at the bottom.

5. **Update `public/help/index.json`**:
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

1. **Review the changes** identified in Step 2 and determine if any help docs need updating.
   - New features may require new help docs or updates to existing ones.
   - Read existing help docs in `public/help/` to understand current coverage.

2. **For each help doc that needs updating**:
   - Read the existing file first.
   - Add or update sections relevant to the new features.
   - Maintain the existing format and style.
   - All content MUST be in Chinese.

3. **If a new help doc is needed**:
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

4. **If no help doc changes are needed**, explicitly state so and explain why.

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

3. **Report final status**:
   - Summarize all changes made during this release preparation.
   - List all files created or modified.
   - Confirm the release is ready (or report remaining issues).

---

## Summary Output

After completing all steps, provide a summary:

```
📋 Release Preparation Summary - vX.X.X
────────────────────────────────────────
✅ Version: package.json and version.ts updated to X.X.X
✅ Release Notes: public/releaseNotes/RELEASE_NOTES_vX.X.X.md created
✅ Help Docs: [updated/no changes needed]
✅ index.json: Updated with new entries
✅ Type Check: Passed
✅ Lint: Passed

Files changed:
  - <list of files>

Ready for release! 🚀
```
