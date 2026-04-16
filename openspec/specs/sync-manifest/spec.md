# sync-manifest Specification

## Purpose
Define the manifest-driven Gist sync layout: a top-level `manifest.json` indexes per-entry content hashes and metadata so uploads and downloads can be incremental (only transmitting files whose hashes changed). This capability covers the file layout, hash computation, per-entry splitting (memories, ai-models, cover-history), schema versioning, and the one-time migration from the legacy single-settings layout.

## Requirements

### Requirement: Gist manifest file as authoritative index

The system SHALL maintain a top-level `manifest.json` file in the Gist that serves as the authoritative index of synced content. The manifest SHALL include a `schemaVersion` number, a client-reported `updatedAt` timestamp, and an `entries` map keyed by entry identifier (e.g., `settings`, `ai-models`, `cover-history`, `novel:<bookId>`, `memories:<bookId>`). Each entry SHALL record at minimum a content `hash` (SHA-256 of the pre-compression JSON string) and a `lastEdited` timestamp. Novel entries SHALL additionally record `chunks` (chunk count; 0 for single-file novels).

#### Scenario: Manifest generated on upload

- **WHEN** the system uploads to a Gist with the new layout
- **THEN** `manifest.json` SHALL be written as part of the same PATCH, containing entries for every file present in the upload

#### Scenario: Manifest read on download

- **WHEN** the system downloads from a Gist with `schemaVersion >= 2`
- **THEN** the system SHALL parse `manifest.json` before any other file and use its entries to determine which remaining files to read

#### Scenario: Manifest and actual files disagree

- **WHEN** `manifest.json` lists an entry whose expected file(s) are missing from the Gist, or the actual file content does not match the recorded hash
- **THEN** the system SHALL log a warning and fall back to rebuilding the manifest from actual file contents during this sync cycle

### Requirement: Content hash computation

The system SHALL compute content hashes using SHA-256 over the JSON string produced by `serializeDates(entry)` before any compression. The hash SHALL be stored as a lowercase hexadecimal string. Hashes SHALL be recomputed on every upload from the pre-compression payload (not cached in the data model) so that manifest entries always reflect the exact bytes uploaded.

#### Scenario: Deterministic hash for unchanged entry

- **WHEN** a novel is uploaded twice with no modification in between
- **THEN** the hash computed in both uploads SHALL be identical, and the second upload SHALL recognize the entry as unchanged and skip transmitting its file

#### Scenario: Hash differs when content changes

- **WHEN** any field inside a novel (paragraph text, translation, chapter metadata, etc.) is modified locally
- **THEN** the recomputed hash SHALL differ from the stored remote hash, marking the novel for upload

### Requirement: Per-book memory files

The system SHALL store each book's memories in a dedicated file `memories-<bookId>.json` rather than embedding them in `settings.json`. Large memory collections SHALL be chunked using the same `>1MB` rule used for novels, producing `memories-chunk-<bookId>_N.json` files with a companion `memories-<bookId>.meta.json` metadata file.

#### Scenario: Upload memories for single book

- **WHEN** the user adds or edits memories for one book and triggers sync
- **THEN** only `memories-<bookId>.json` for that book plus `manifest.json` SHALL be transmitted; other books' memory files SHALL NOT be touched

#### Scenario: Download book with >1MB of memories

- **WHEN** downloading a book whose memories file exceeds 1 MB and is thus chunked
- **THEN** the system SHALL read all `memories-chunk-<bookId>_N.json` files based on the count recorded in `memories-<bookId>.meta.json` and reassemble them before deserializing

#### Scenario: Delete book removes memory file

- **WHEN** a book is deleted locally (and the deletion propagates via existing deletion-record mechanism)
- **THEN** the next sync SHALL include `memories-<bookId>.json` (and its chunks/meta if present) as `{ content: null }` in the PATCH payload to remove them from the Gist

### Requirement: Split ai-models and cover-history files

The system SHALL store AI models in `ai-models.json` and cover history in `cover-history.json` as independent top-level files. `settings.json` SHALL contain only the `appSettings` object, not `aiModels`, `coverHistory`, or `memories`.

#### Scenario: Edit only AI model

- **WHEN** the user edits an AI model and triggers sync
- **THEN** only `ai-models.json` and `manifest.json` SHALL be in the PATCH payload; `settings.json`, `cover-history.json`, and all novel/memories files SHALL be skipped

#### Scenario: Edit only app setting

- **WHEN** the user changes an app setting (theme, language, etc.) and triggers sync
- **THEN** only `settings.json` and `manifest.json` SHALL be in the PATCH payload

### Requirement: Incremental upload based on manifest diff

The system SHALL compute, before each upload, the set of entries whose local hash differs from the hash recorded in the locally cached remote manifest (`knownRemoteHashes` in `SyncConfig`). The PATCH payload SHALL include `manifest.json` always, plus only the files corresponding to changed or newly-added entries, plus `{ content: null }` entries for deleted-locally items. Unchanged files SHALL NOT be part of the PATCH payload.

#### Scenario: Edit one book out of 50

- **WHEN** the user edits 1 book out of 50 locally and triggers sync
- **THEN** the PATCH payload SHALL contain exactly 2 files: `manifest.json` and `novel-<editedId>.json` (or its chunks if chunked)

#### Scenario: No local changes detected via hash diff

- **WHEN** the local manifest has identical hashes to `knownRemoteHashes` for every entry
- **THEN** the system SHALL skip the upload phase entirely, bypassing all PATCH API calls

#### Scenario: First upload after migration

- **WHEN** `knownRemoteHashes` is empty or the remote Gist has no `manifest.json`
- **THEN** the system SHALL treat every local entry as "new" and upload all files, establishing the initial remote state

### Requirement: Selective download based on manifest diff

When downloading from a Gist with `schemaVersion >= 2`, the system SHALL parse `manifest.json` first and compare each remote entry's hash against `knownRemoteHashes`. Only entries with differing hashes or entries not present locally SHALL have their corresponding files parsed and merged. Files whose hash matches the locally cached value SHALL be skipped without parsing.

#### Scenario: Remote book unchanged since last sync

- **WHEN** a remote novel's manifest hash equals the hash in `knownRemoteHashes`
- **THEN** the system SHALL NOT parse or merge that novel's file, even though its content is present in the `gists.get` response

#### Scenario: Remote book modified since last sync

- **WHEN** a remote novel's manifest hash differs from `knownRemoteHashes`
- **THEN** the system SHALL parse that novel's file and merge it using the existing `mergeNovelWithLocalContent` / `mergeRemoteTranslationsIntoLocalNovel` logic

#### Scenario: Remote entry deleted

- **WHEN** a manifest entry present in `knownRemoteHashes` is absent from the remote manifest
- **THEN** the system SHALL apply the deletion, honoring existing local deletion-record precedence rules (if local deletedAt > lastSyncTime, the local state wins)

### Requirement: Schema version gating

The manifest SHALL include a numeric `schemaVersion` field. The current version introduced by this change SHALL be `2`. When the system reads a remote manifest with `schemaVersion` greater than the version known to this client, the system SHALL abort the sync and surface an error indicating the remote was written by a newer client that must be matched.

#### Scenario: Client knows the manifest version

- **WHEN** the remote `manifest.schemaVersion` equals the client's known version
- **THEN** the sync SHALL proceed normally using the new path

#### Scenario: Client sees a newer manifest version

- **WHEN** the remote `manifest.schemaVersion` exceeds the client's known version
- **THEN** the sync SHALL abort with a user-facing message: "远程数据由较新版本的应用写入，请升级后再同步"

#### Scenario: Client sees a Gist with no manifest

- **WHEN** the remote Gist has no `manifest.json` (indicating a legacy layout or first sync)
- **THEN** the system SHALL trigger the one-time migration path (see migration requirement)

### Requirement: One-time migration from legacy layout

When the system detects a non-empty remote Gist that lacks `manifest.json`, the system SHALL execute a one-time migration: (1) download remote data using the legacy path, (2) merge with local data using existing merge logic, (3) re-serialize to the new layout (split files + manifest), (4) upload as a single atomic PATCH that writes new files and deletes legacy-only files. Subsequent syncs SHALL use the new path.

#### Scenario: First sync after upgrade with existing data

- **WHEN** the user upgrades and triggers a sync against a pre-existing Gist with legacy layout
- **THEN** the system SHALL perform a legacy-style download, regenerate the layout, and produce a single PATCH that both writes the new files and removes legacy `settings.json` fields now moved out (memories, aiModels, coverHistory) plus any files no longer in the new layout

#### Scenario: Migration PATCH fails midway

- **WHEN** the migration PATCH fails (network error, API error)
- **THEN** the local state SHALL be preserved unchanged, the remote Gist SHALL be reported as "migration pending" via error message, and the next sync attempt SHALL retry the migration

#### Scenario: Migration succeeds

- **WHEN** the migration PATCH completes successfully
- **THEN** `SyncConfig.lastRemoteETag` and `SyncConfig.knownRemoteHashes` SHALL be populated from the PATCH response, and future sync cycles SHALL bypass the legacy code paths

### Requirement: Persist known remote hashes in SyncConfig

The `SyncConfig` interface SHALL include a `knownRemoteHashes: Record<string, string>` field mapping manifest entry keys to their last-known remote hash. This field SHALL be updated after every successful sync (upload or download) to reflect the remote manifest state. A missing or empty map SHALL be treated as "no known remote state" and trigger a full upload or full download.

#### Scenario: Hash map updated after upload

- **WHEN** an upload completes successfully
- **THEN** `knownRemoteHashes` SHALL be replaced with the hashes from the just-uploaded manifest

#### Scenario: Hash map updated after partial download

- **WHEN** a download successfully applies changes for a subset of entries
- **THEN** `knownRemoteHashes` SHALL be updated only for those entries that were successfully parsed and merged, leaving untouched entries' hashes as they were

#### Scenario: Legacy config upgrade

- **WHEN** the app loads a `SyncConfig` created by a pre-manifest version
- **THEN** the absent `knownRemoteHashes` SHALL default to an empty object, triggering full sync on the next cycle
