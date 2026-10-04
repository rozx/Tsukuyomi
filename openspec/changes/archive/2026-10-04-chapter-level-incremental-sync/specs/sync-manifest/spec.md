## MODIFIED Requirements

### Requirement: Gist manifest file as authoritative index

The system SHALL maintain a top-level `manifest.json` file in the Gist that serves as the authoritative index of synced content. The manifest SHALL include a `schemaVersion` number, a client-reported `updatedAt` timestamp, and an `entries` map keyed by entry identifier (e.g., `settings`, `ai-models`, `cover-history`, `novel:<bookId>`, `chapters:<bookId>:<groupId>`, `memories:<bookId>`). Each entry SHALL record at minimum a content `hash` (SHA-256 of the pre-compression JSON string) and a `lastEdited` timestamp. Novel entries SHALL additionally record `chunks` (chunk count; 0 for single-file novels).

#### Scenario: Manifest generated on upload

- **WHEN** the system uploads to a Gist with the new layout
- **THEN** `manifest.json` SHALL be written as part of the same PATCH, containing entries for every file present in the upload

#### Scenario: Manifest read on download

- **WHEN** the system downloads from a Gist with `schemaVersion >= 2`
- **THEN** the system SHALL parse `manifest.json` before any other file and use its entries to determine which remaining files to read

#### Scenario: Manifest and actual files disagree

- **WHEN** `manifest.json` lists an entry whose expected file(s) are missing from the Gist, or the actual file content does not match the recorded hash
- **THEN** the system SHALL abort the affected download and SHALL NOT apply an incomplete snapshot or advance known remote state

### Requirement: Content hash computation

The system SHALL compute content hashes using SHA-256 over the JSON string produced by `serializeDates(entry)` before any compression. The hash SHALL be stored as a lowercase hexadecimal string. Hashes SHALL be recomputed on every upload from the pre-compression payload (not cached in the data model) so that manifest entries always reflect the exact bytes uploaded.

#### Scenario: Deterministic hash for unchanged entry

- **WHEN** a novel is uploaded twice with no modification in between
- **THEN** the hash computed in both uploads SHALL be identical, and the second upload SHALL recognize the entry as unchanged and skip transmitting its file

#### Scenario: Hash differs when content changes

- **WHEN** any field inside a novel (paragraph text, translation, chapter metadata, etc.) is modified locally
- **THEN** the recomputed hash SHALL differ from the stored remote hash, marking the affected chapter group and/or novel metadata for upload

### Requirement: Incremental upload based on manifest diff

The system SHALL compute, before each upload, the set of entries whose local hash differs from the hash recorded in the locally cached remote manifest (`knownRemoteHashes` in `SyncConfig`). The PATCH payload SHALL include `manifest.json` always, plus only the files corresponding to changed or newly-added entries, plus `{ content: null }` entries for deleted-locally items. Unchanged files SHALL NOT be part of the PATCH payload except when required by a schema upgrade. A protocol upgrade SHALL publish the upgraded manifest and every file requiring migration together even if ordinary hash-based change detection reports no user edits.

#### Scenario: Edit one book out of 50

- **WHEN** the user edits 1 book out of 50 locally and triggers sync
- **THEN** the PATCH payload SHALL contain `manifest.json`, the changed chapter groups and/or `book-<editedId>.json` metadata (including chunks when needed); unchanged chapter groups SHALL be omitted

#### Scenario: No local changes detected via hash diff

- **WHEN** the local manifest has identical hashes to `knownRemoteHashes` for every entry and no schema migration is pending
- **THEN** the system SHALL skip the upload phase entirely, bypassing all PATCH API calls

#### Scenario: First upload after migration

- **WHEN** `knownRemoteHashes` is empty or the remote Gist has no `manifest.json`
- **THEN** the system SHALL treat every local entry as "new" and upload all files, establishing the initial remote state

### Requirement: Selective download based on manifest diff

When downloading from a Gist with `schemaVersion >= 2`, the system SHALL parse `manifest.json` first and compare each remote entry's hash against `knownRemoteHashes`. Only entries with differing hashes or entries not present locally SHALL have their corresponding files parsed and merged, except that changed chapter groups SHALL also load their owning book metadata to resolve chapter membership. Unchanged chapter group files SHALL be skipped during ordinary same-schema sync. During a required schema upgrade, all entries requiring migration SHALL be read and validated regardless of cached hashes.

#### Scenario: Remote book unchanged since last sync

- **WHEN** a remote novel's manifest hash equals the hash in `knownRemoteHashes` and no migration of that entry is required
- **THEN** the system SHALL NOT parse or merge that novel's file unless one of its chapter groups changed

#### Scenario: Remote book modified since last sync

- **WHEN** a remote novel's manifest hash differs from `knownRemoteHashes`
- **THEN** the system SHALL parse that novel's file and merge it using the existing `mergeNovelWithLocalContent` / `mergeRemoteTranslationsIntoLocalNovel` logic

#### Scenario: Remote entry deleted

- **WHEN** a manifest entry present in `knownRemoteHashes` is absent from the remote manifest
- **THEN** the system SHALL apply the deletion, honoring existing local deletion-record precedence rules (if local deletedAt > lastSyncTime, the local state wins)

### Requirement: Schema version gating

The manifest SHALL include a numeric `schemaVersion` field. The current version supported by this client SHALL be `6`. This version SHALL carry the book-entity identity, logical-version and tombstone contract inside novel payloads. When the system reads a remote manifest with `schemaVersion` greater than the version known to this client, the system SHALL abort the sync and surface an error indicating the remote was written by a newer client that must be matched.

#### Scenario: Client knows the manifest version

- **WHEN** the remote `manifest.schemaVersion` equals the client's known version
- **THEN** the sync SHALL proceed normally using the new path

#### Scenario: Client sees a newer manifest version

- **WHEN** the remote `manifest.schemaVersion` exceeds the client's known version
- **THEN** the sync SHALL abort with a user-facing message: "远程数据由较新版本的应用写入，请升级后再同步"

#### Scenario: Client sees a Gist with no manifest

- **WHEN** the remote Gist has no `manifest.json` (indicating a legacy layout or first sync)
- **THEN** the system SHALL trigger the one-time migration path (see migration requirement)

#### Scenario: Future schema on force upload or restore

- **WHEN** ordinary sync, forced upload or revision restore encounters an unsupported manifest or book entity protocol
- **THEN** the operation SHALL fail before applying or uploading data, without downgrading it through legacy parsing or manifest reconstruction

#### Scenario: Complete protocol migration

- **GIVEN** a supported schema 1–5 Gist contains old-format books
- **WHEN** the upgraded client first publishes schema 6
- **THEN** the manifest and all book files requiring migration SHALL be published in one PATCH when they fit within one PATCH byte budget; unchanged content hashes alone MUST NOT skip the protocol upgrade
- **AND** unreadable required books or a failed PATCH SHALL prevent the migration being marked complete

#### Scenario: Protocol migration larger than one PATCH

- **GIVEN** a schema 1–5 Gist whose migration payload exceeds one PATCH byte budget
- **WHEN** the upgraded client publishes schema 6
- **THEN** the first PATCH SHALL contain only a fence `manifest.json` with `schemaVersion: 6`, `pendingUpgradeFrom` set to the previous schema and the previous entries unchanged; content SHALL then be uploaded in budgeted batches, and the final batch SHALL write the complete schema 6 manifest without `pendingUpgradeFrom` together with deletions
- **AND** older clients SHALL stop on the fence as a newer schema, while schema 6 clients SHALL treat a manifest carrying `pendingUpgradeFrom` as still requiring the upgrade: read all entries regardless of cached hashes, record the previous schema as the known remote schema, and complete the upgrade on their next upload
- **AND** a Gist without any manifest (legacy layout or empty) whose payload exceeds one PATCH SHALL be uploaded in ordinary budgeted batches with the manifest in the final batch

#### Scenario: Local actor metadata is not exported

- **WHEN** generating the schema 6 payload
- **THEN** historical field revisions and tombstones SHALL be included, but the current installation's actor identity allocation record and local counter store SHALL NOT be copied as device configuration

### Requirement: Protocol 5 and upload concurrency checks

Protocol 5 SHALL separate Memory content modification time from device access time. Protocols 1–5 SHALL be upgraded to protocol 6 before being marked current. A pending upgrade SHALL use its previous effective protocol for content validation, even when its fence declares schema 6.

#### Scenario: Content does not match the current manifest

- **WHEN** a current-protocol entry is deserialized and its canonical content hash differs from the manifest
- **THEN** the entry SHALL be reported as unreadable and SHALL NOT be applied or marked known

#### Scenario: Upload batches and ETag drift

- **WHEN** ordinary sync uploads multiple batches
- **THEN** it SHALL check the remote ETag immediately before each batch and stop on concurrent change, without publishing a final manifest after detecting the conflict
- **AND** initial ETag drift MAY be ignored only when entries, chunk layout, tombstones, and protocol match the known remote state; forced overwrite SHALL explicitly bypass these checks
- **AND** this is a best-effort check: the Gist API does not provide atomic conditional PATCH, so simultaneous writes after a check remain possible

### Requirement: Per-book memory files

The system SHALL store each book's memories in a dedicated file `v6-memories-<bookId>.json` rather than embedding them in `v6-tsukuyomi-settings.json`. Large memory collections SHALL be chunked using the same `>1MB` rule used for novels, producing `v6-memories-chunk-<bookId>_N.json` files with a companion `v6-memories-<bookId>.meta.json` metadata file.

#### Scenario: Upload memories for single book

- **WHEN** the user adds or edits memories for one book and triggers sync
- **THEN** only `v6-memories-<bookId>.json` for that book plus `manifest.json` SHALL be transmitted; other books' memory files SHALL NOT be touched

#### Scenario: Download book with >1MB of memories

- **WHEN** downloading a book whose memories file exceeds 1 MB and is thus chunked
- **THEN** the system SHALL read all `v6-memories-chunk-<bookId>_N.json` files based on the count recorded in `v6-memories-<bookId>.meta.json` and reassemble them before deserializing

#### Scenario: Delete book removes memory file

- **WHEN** a book is deleted locally (and the deletion propagates via existing deletion-record mechanism)
- **THEN** the next sync SHALL include `v6-memories-<bookId>.json` (and its chunks/meta if present) as `{ content: null }` in the PATCH payload to remove them from the Gist

### Requirement: Split ai-models and cover-history files

The system SHALL store AI models in `v6-ai-models.json` and cover history in `v6-cover-history.json` as independent top-level files. `v6-tsukuyomi-settings.json` SHALL contain only the `appSettings` object, not `aiModels`, `coverHistory`, or `memories`.

#### Scenario: Edit only AI model

- **WHEN** the user edits an AI model and triggers sync
- **THEN** only `v6-ai-models.json` and `manifest.json` SHALL be in the PATCH payload; `v6-tsukuyomi-settings.json`, `v6-cover-history.json`, and all novel/memories files SHALL be skipped

#### Scenario: Edit only app setting

- **WHEN** the user changes an app setting (theme, language, etc.) and triggers sync
- **THEN** only `v6-tsukuyomi-settings.json` and `manifest.json` SHALL be in the PATCH payload

## ADDED Requirements

### Requirement: Stable chapter group storage

Protocol 6 SHALL separate novel metadata and chapter content. Chapters SHALL be assigned to 16 stable per-book groups by their IDs, independent of directory order or chapter count. Only nonempty groups SHALL have entries. Group payloads SHALL be independently canonicalized, compressed and chunked. File count SHALL be checked before any write, including intermediate migration states; a write exceeding 300 files SHALL fail with an actionable localized error.

#### Scenario: Append or insert one chapter

- **WHEN** a chapter is added to a previously synchronized book
- **THEN** only its group, the book metadata and manifest SHALL be uploaded, including chunks only for those changed entries
- **AND** existing chapters SHALL remain in their previous groups

#### Scenario: Modify translation or reorder chapters

- **WHEN** a chapter's translation is edited
- **THEN** only the affected group, changed metadata if any, and manifest SHALL upload
- **WHEN** chapter order alone changes
- **THEN** unchanged chapter groups SHALL NOT upload

#### Scenario: Remove chapter or book

- **WHEN** a chapter is deleted or moved between volumes
- **THEN** book metadata SHALL retain the authoritative chapter membership/order, the affected group SHALL update or be removed when empty, and unrelated groups SHALL remain unchanged
- **WHEN** a book is deleted
- **THEN** its metadata and every chapter group SHALL be removed

### Requirement: Complete and partial chapter assembly

Downloads SHALL validate group membership, duplicate IDs and hashes before application. Changes to a group SHALL be assembled with its book metadata; metadata references SHALL have corresponding manifest groups. Unchanged groups SHALL retain local content and local pending edits without being recorded as freshly downloaded structure baselines. New-device downloads and historical restores SHALL reconstruct complete books and abort on missing, corrupt, mismatched or unsupported entries. Empty content SHALL remain distinguishable from content omitted in a partial download.

#### Scenario: Concurrent edits in different groups

- **WHEN** a remote group changes while another group has local pending edits
- **THEN** the remote group SHALL merge normally and local edits in the untouched group SHALL survive and subsequently upload

#### Scenario: Local chapter removed while remote metadata changes

- **WHEN** a remote chapter group hash is unchanged but its metadata references a chapter no longer present locally
- **THEN** the client SHALL read and validate that chapter group before merging the chapter, preserving its original text and translations if the existing conflict rules retain it
- **AND** a failed supplemental read or a chapter disappearing locally before apply SHALL prevent confirming incomplete data or uploading an empty replacement

#### Scenario: Incomplete snapshot

- **WHEN** any required group is missing, corrupt, belongs to a different book/group, or omits a chapter referenced by metadata
- **THEN** synchronization or historical restore SHALL fail before applying partial data

### Requirement: Non-destructive migration to chapter groups

Migration SHALL read protocols 1–5 and publish protocol 6 only after its metadata and chapter groups are ready. All v6 payloads SHALL use filenames distinct from their legacy counterparts so interrupted migrations preserve every file referenced by the pending manifest, including locally edited settings, models, covers and memories. Legacy files SHALL be removed together with the final manifest. Existing integrity checks for protocol 5, memory semantics, deletion precedence and per-batch concurrency checks SHALL remain effective.

#### Scenario: Interrupted migration

- **WHEN** a multi-batch migration stops before publishing its final manifest
- **THEN** the pending manifest SHALL still describe readable old data and a later v6 client SHALL be able to retry migration

#### Scenario: Historical restore across versions

- **WHEN** a user restores either a pre-v6 revision or a v6 revision
- **THEN** the complete book contents, translations and metadata SHALL be reconstructed before local replacement
