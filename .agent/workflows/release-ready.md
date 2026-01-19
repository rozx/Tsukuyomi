---
description: Prepare the project for a new release
---

1. Check if the current version in `package.json` matches the branch name (expected format: `vx.xx-xxxxx`).
   - If the version does not match, run `bun bump (major|minor|patch|x.xx)` to update the version to match the branch or intended release version.
2. Create a new release note file under `docs/ReleaseNotes`.
   - File naming convention: `docs/ReleaseNotes/RELEASE_NOTES_vx.xx.md` (replace `x.xx` with the actual version).
   - Use other files in `docs/ReleaseNotes/` as a reference for the format.
   - **Important**: The content of the release note MUST be in **Chinese**.

3. Perform a final quality check to ensure deployment readiness.
   - Run type checking: `bun run type-check` (or equivalent command for the project).
   - Run linting: `bun run lint` (or equivalent command for the project).
   - Fix any errors reported by these checks before proceeding.
