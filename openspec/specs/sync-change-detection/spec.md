# sync-change-detection Specification

## Purpose
Define how the sync subsystem detects whether the local or remote Gist has changes before transferring data, so that sync cycles can short-circuit when nothing has moved. Remote change detection uses HTTP conditional GET (`If-None-Match: <ETag>`) integrated into `downloadFromGist`; local change detection compares the current local manifest's hashes against the cached `knownRemoteHashes`. A pre-upload pseudo-CAS check guards against concurrent remote writes. Auto and manual sync paths share a single executor parameterised by UI/reporting behaviour.

## Requirements

### Requirement: Remote change detection via Gist metadata

The system SHALL check whether the remote Gist has been updated since the last successful sync before applying remote data. The check SHALL use HTTP conditional GET: `gists.get` is called with an `If-None-Match: <lastRemoteETag>` header. A `304 Not Modified` response indicates no remote changes; this response SHALL consume no rate-limit quota. A `200 OK` response indicates remote changes and SHALL be followed by a manifest-driven selective download (see capability `sync-manifest`).

#### Scenario: Remote has no changes since last sync

- **WHEN** a sync cycle begins (manual or auto) and the conditional GET returns `304 Not Modified`
- **THEN** the system SHALL skip the download and apply phases, and proceed directly to the local change detection phase

#### Scenario: Remote has changes since last sync

- **WHEN** a sync cycle begins and the conditional GET returns `200 OK`
- **THEN** the system SHALL proceed with the manifest-driven selective download flow

#### Scenario: First sync with no stored ETag

- **WHEN** a sync cycle begins and `lastRemoteETag` is not set (undefined or empty string)
- **THEN** the system SHALL issue a plain `gists.get` (no `If-None-Match`) and treat the response as "remote has changes", executing the full download and apply flow

#### Scenario: Remote check API failure

- **WHEN** the Gist API call within `downloadFromGist` fails (network error, auth error, etc.)
- **THEN** the system SHALL report the error as a failed download (existing behavior), and the caller SHALL handle retry or fallback

### Requirement: Integrated remote change detection in downloadFromGist

The `GistSyncService.downloadFromGist` method SHALL accept an optional `lastRemoteETag` parameter. When provided, the method SHALL issue `gists.get` with an `If-None-Match: <lastRemoteETag>` header. If the server returns `304 Not Modified`, the method SHALL return early without parsing file contents. If the server returns `200 OK`, the method SHALL proceed with manifest-driven parsing. The return type SHALL include `skipped: boolean` and `remoteETag: string` fields.

#### Scenario: Remote unchanged — download skipped via conditional GET

- **WHEN** `downloadFromGist` is called with a `lastRemoteETag` that matches the remote
- **THEN** the method SHALL return `{ success: true, skipped: true, remoteETag: <value> }` without any file parsing, and the 304 response SHALL NOT count against the rate limit

#### Scenario: Remote changed — manifest-driven download proceeds

- **WHEN** `downloadFromGist` is called with a `lastRemoteETag` that no longer matches the remote
- **THEN** the method SHALL parse `manifest.json`, compare entries against `knownRemoteHashes`, and return only the changed entries' deserialized content along with `skipped: false` and the new `remoteETag`

#### Scenario: No lastRemoteETag provided — plain full download

- **WHEN** `downloadFromGist` is called without the `lastRemoteETag` parameter
- **THEN** the method SHALL issue a plain `gists.get` and return the full `GistSyncData`, still honoring manifest-driven selection when a manifest is present

#### Scenario: Gist API call fails

- **WHEN** `downloadFromGist` is called and the Gist API call throws an error
- **THEN** the method SHALL return `{ success: false, error: <message> }` as before

### Requirement: Upload-phase pseudo-CAS concurrency check

Because `PATCH /gists/{id}` does not honor `If-Match` headers (confirmed unresolved bug: [github/community #50084](https://github.com/orgs/community/discussions/50084)), the system SHALL implement a pseudo compare-and-swap check immediately before each upload PATCH. The check SHALL issue a conditional `gists.get` with `If-None-Match: <lastRemoteETag>`. A `304` response indicates the remote has not moved since this sync cycle began and upload is safe. A `200` response indicates concurrent remote modification and the upload SHALL be aborted, triggering a fresh sync cycle (re-download, re-merge, retry upload up to 2 times).

#### Scenario: Remote unchanged during this sync cycle

- **WHEN** the pre-PATCH conditional GET returns `304 Not Modified`
- **THEN** the system SHALL proceed with the PATCH immediately

#### Scenario: Remote changed during this sync cycle

- **WHEN** the pre-PATCH conditional GET returns `200 OK` (indicating another device wrote between our initial download and this upload)
- **THEN** the system SHALL abort the current PATCH, restart the sync cycle from the download phase, and retry up to 2 more times before reporting a conflict to the user

#### Scenario: Conflict retry budget exhausted

- **WHEN** three consecutive sync cycles detect concurrent remote writes during pseudo-CAS
- **THEN** the system SHALL surface a user-facing error ("同步冲突：其他设备正在频繁写入，请稍后再试") and leave the local state unchanged

#### Scenario: First upload without a prior ETag

- **WHEN** the system is about to PATCH but `lastRemoteETag` is not set (first-ever sync or Gist just created)
- **THEN** the pseudo-CAS check SHALL be skipped and the PATCH SHALL proceed directly

### Requirement: Persist last remote ETag in SyncConfig

The `SyncConfig` interface SHALL include a `lastRemoteETag: string` field storing the ETag from the most recent successful Gist API response (download or upload). The field SHALL default to an empty string for backward compatibility with configs created before this change.

#### Scenario: ETag updated after successful download

- **WHEN** a sync cycle successfully downloads and applies remote data
- **THEN** the system SHALL persist the response's `ETag` header value to `SyncConfig.lastRemoteETag`

#### Scenario: ETag updated after successful upload

- **WHEN** a sync cycle successfully uploads local data
- **THEN** the system SHALL persist the PATCH response's `ETag` header value to `SyncConfig.lastRemoteETag`

#### Scenario: ETag updated after 304 short-circuit

- **WHEN** a conditional GET returns 304 Not Modified
- **THEN** `SyncConfig.lastRemoteETag` SHALL remain unchanged (the ETag is already current by definition)

#### Scenario: Existing configs without the field

- **WHEN** the app loads a `SyncConfig` that does not have `lastRemoteETag`
- **THEN** the missing field SHALL be treated as an empty string, triggering a plain (non-conditional) GET on the next sync which then populates the field

### Requirement: Skip upload when local has no changes

The system SHALL check for local changes before preparing and uploading data. Local changes SHALL be detected by computing the current local manifest (content hashes of every entry) and comparing it to `SyncConfig.knownRemoteHashes`. If every entry's hash matches, the system SHALL skip the entire upload phase including pseudo-CAS, data serialization, and PATCH API calls. This check SHALL be performed regardless of whether the download phase was executed or skipped.

#### Scenario: No local changes after download was skipped

- **WHEN** remote change detection returned 304 and the manifest hash comparison shows all entries match `knownRemoteHashes`
- **THEN** the system SHALL skip the upload phase and complete the sync cycle with a "no changes" status message

#### Scenario: No local changes after download was applied

- **WHEN** remote data was downloaded and applied, and after applying, the local manifest hashes match the updated `knownRemoteHashes`
- **THEN** the system SHALL skip the upload phase and complete the sync cycle

#### Scenario: Local changes detected via hash diff

- **WHEN** any entry's local hash differs from its value in `knownRemoteHashes` (or an entry is locally present but absent from `knownRemoteHashes`)
- **THEN** the system SHALL proceed with the full upload flow (including pseudo-CAS)

### Requirement: Shared sync execution logic

The system SHALL extract the common sync execution flow (conditional GET → manifest-driven selective download → apply → local hash diff → pseudo-CAS → incremental upload) into a shared function or composable that both `useAutoSync` and `useGistSync` (manual sync) can reuse. The shared logic SHALL accept parameters for behavioral differences between auto and manual sync, including: progress message prefix, whether to return restorable deleted items, and error handling strategy (toast vs silent log).

#### Scenario: Auto sync uses shared executor

- **WHEN** an auto sync cycle triggers
- **THEN** the system SHALL delegate to the shared sync executor with auto-sync-specific parameters (prefix `[自动同步]`, no restorable items, errors logged silently)

#### Scenario: Manual sync uses shared executor

- **WHEN** a user triggers manual sync
- **THEN** the system SHALL delegate to the shared sync executor with manual-sync-specific parameters (no prefix, restorable items returned, errors shown as toast notifications)

#### Scenario: Both paths produce identical sync results

- **WHEN** auto sync and manual sync are given the same initial state
- **THEN** both paths SHALL produce the same final data state (same conditional GET behavior, same manifest diff, same upload set), differing only in UI feedback and error presentation
