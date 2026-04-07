---
description: Prepare the project for a new release
---

1. Check if the current version in `package.json` matches the branch name (expected format: `vx.xx-xxxxx`).
   - If the version does not match, run `bun bump (major|minor|patch|x.xx)` to update the version to match the branch or intended release version.

2. Create a new release note file under `public/releaseNotes`.
   - File naming convention: `public/releaseNotes/RELEASE_NOTES_vx.xx.md` (replace `x.xx` with the actual version).
   - Compare changes between the current version (current branch) and the last version (last release tag).
   - **Crucial**: Do NOT just summarize Git commit messages. You must analyze the actual code diffs/updates (e.g., using `git diff <last_tag>..HEAD --stat` and checking the specific logic changes in modified files) to write a detailed, technically accurate release note.
   - The change log should be based on these actual code changes.
   - Use other files in `public/releaseNotes/` as a reference for the format.
   - Update `public/help/index.json` to include the new release note.

   - **Important**: The content of the release note MUST be in **Chinese**.
3. Base on the analyzed changes, cross-check and update the existing help documents under `public/help/`.
   - Actively review the code updates you found in the previous step and identify which user guides or help chapters (like settings-guide.md, book-details-translation.md, etc.) need to be expanded.
   - Add or update the markdown docs to proactively document these new features, changed behaviors, or removed functionality.
   - If creating a brand new help document, make sure to update `public/help/index.json` to register it.
   - **Important**: All updates to help documents MUST be in **Chinese**.

4. Perform a final quality check to ensure deployment readiness.
   - Run type checking: `bun run type-check` (or equivalent command for the project).
   - Run linting: `bun run lint` (or equivalent command for the project).
   - Fix any errors reported by these checks before proceeding.