## MODIFIED Requirements

### Requirement: Schema version gating

The manifest SHALL include a numeric `schemaVersion` field. The current version introduced by this change SHALL be `4`. This version SHALL carry the book-entity identity, logical-version and tombstone contract inside novel payloads. When the system reads a remote manifest with `schemaVersion` greater than the version known to this client, the system SHALL abort the sync and surface an error indicating the remote was written by a newer client that must be matched.

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

- **GIVEN** a supported schema 1–3 Gist contains old-format books
- **WHEN** the upgraded client first publishes schema 4
- **THEN** the manifest and all book files requiring migration SHALL be published in one PATCH; unchanged content hashes alone MUST NOT skip the protocol upgrade
- **AND** unreadable required books or a failed PATCH SHALL prevent the migration being marked complete

#### Scenario: Local actor metadata is not exported

- **WHEN** generating the schema 4 payload
- **THEN** historical field revisions and tombstones SHALL be included, but the current installation's actor identity allocation record and local counter store SHALL NOT be copied as device configuration

### Requirement: Incremental upload based on manifest diff

The system SHALL compute, before each upload, the set of entries whose local hash differs from the hash recorded in the locally cached remote manifest (`knownRemoteHashes` in `SyncConfig`). The PATCH payload SHALL include `manifest.json` always, plus only the files corresponding to changed or newly-added entries, plus `{ content: null }` entries for deleted-locally items. Unchanged files SHALL NOT be part of the PATCH payload except when required by a schema upgrade. A protocol upgrade SHALL publish the upgraded manifest and every file requiring migration together even if ordinary hash-based change detection reports no user edits.

#### Scenario: Edit one book out of 50

- **WHEN** the user edits 1 book out of 50 locally and triggers sync
- **THEN** the PATCH payload SHALL contain exactly 2 files: `manifest.json` and `novel-<editedId>.json` (or its chunks if chunked)

#### Scenario: No local changes detected via hash diff

- **WHEN** the local manifest has identical hashes to `knownRemoteHashes` for every entry and no schema migration is pending
- **THEN** the system SHALL skip the upload phase entirely, bypassing all PATCH API calls

#### Scenario: First upload after migration

- **WHEN** `knownRemoteHashes` is empty or the remote Gist has no `manifest.json`
- **THEN** the system SHALL treat every local entry as "new" and upload all files, establishing the initial remote state

### Requirement: Selective download based on manifest diff

When downloading from a Gist with `schemaVersion >= 2`, the system SHALL parse `manifest.json` first and compare each remote entry's hash against `knownRemoteHashes`. Only entries with differing hashes or entries not present locally SHALL have their corresponding files parsed and merged. Files whose hash matches the locally cached value SHALL be skipped without parsing during ordinary same-schema sync. During a required schema upgrade, all entries requiring migration SHALL be read and validated regardless of cached hashes.

#### Scenario: Remote book unchanged since last sync

- **WHEN** a remote novel's manifest hash equals the hash in `knownRemoteHashes` and no migration of that entry is required
- **THEN** the system SHALL NOT parse or merge that novel's file, even though its content is present in the `gists.get` response

#### Scenario: Remote book modified since last sync

- **WHEN** a remote novel's manifest hash differs from `knownRemoteHashes`
- **THEN** the system SHALL parse that novel's file and merge it using the existing `mergeNovelWithLocalContent` / `mergeRemoteTranslationsIntoLocalNovel` logic

#### Scenario: Remote entry deleted

- **WHEN** a manifest entry present in `knownRemoteHashes` is absent from the remote manifest
- **THEN** the system SHALL apply the deletion, honoring existing local deletion-record precedence rules (if local deletedAt > lastSyncTime, the local state wins)
