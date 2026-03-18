## ADDED Requirements

### Requirement: Remote change detection via Gist metadata

The system SHALL check whether the remote Gist has been updated since the last successful sync before applying remote data. The check SHALL be integrated into the `downloadFromGist` method, using the Gist's `updated_at` timestamp from the API response compared against a locally stored `lastRemoteUpdatedAt` value in `SyncConfig`. If the remote has not changed, the system SHALL skip file parsing and the apply phase entirely.

#### Scenario: Remote has no changes since last sync

- **WHEN** a sync cycle begins (manual or auto) and the remote Gist's `updated_at` equals the locally stored `lastRemoteUpdatedAt`
- **THEN** the system SHALL skip the download and apply phases, and proceed directly to the local change detection phase

#### Scenario: Remote has changes since last sync

- **WHEN** a sync cycle begins and the remote Gist's `updated_at` differs from (is newer than) the locally stored `lastRemoteUpdatedAt`
- **THEN** the system SHALL proceed with the full download and apply flow as before

#### Scenario: First sync with no stored remote timestamp

- **WHEN** a sync cycle begins and `lastRemoteUpdatedAt` is not set (undefined or 0)
- **THEN** the system SHALL treat this as "remote has changes" and execute the full download and apply flow

#### Scenario: Remote check API failure

- **WHEN** the Gist API call within `downloadFromGist` fails (network error, auth error, etc.)
- **THEN** the system SHALL report the error as a failed download (existing behavior), and the caller SHALL handle retry or fallback

### Requirement: Integrated remote change detection in downloadFromGist

The `GistSyncService.downloadFromGist` method SHALL accept an optional `lastRemoteUpdatedAt` parameter. After retrieving the Gist response, the method SHALL compare the Gist's `updated_at` with the provided `lastRemoteUpdatedAt`. If they match, the method SHALL return early without parsing file contents, indicating the download was skipped. If they differ (or `lastRemoteUpdatedAt` is not provided), the method SHALL proceed with the full download and parse flow as before. The return type SHALL include `skipped: boolean` and `remoteUpdatedAt: string` fields.

#### Scenario: Remote unchanged — download skipped within same API call

- **WHEN** `downloadFromGist` is called with a `lastRemoteUpdatedAt` value that matches the Gist's `updated_at`
- **THEN** the method SHALL return `{ success: true, skipped: true, remoteUpdatedAt: <value> }` without parsing any file contents, using only one API call

#### Scenario: Remote changed — full download proceeds

- **WHEN** `downloadFromGist` is called with a `lastRemoteUpdatedAt` value that differs from the Gist's `updated_at`
- **THEN** the method SHALL proceed to parse file contents and return the full `GistSyncData` as before, with `skipped: false` and `remoteUpdatedAt` set

#### Scenario: No lastRemoteUpdatedAt provided — backward compatible full download

- **WHEN** `downloadFromGist` is called without the `lastRemoteUpdatedAt` parameter
- **THEN** the method SHALL always proceed with the full download (equivalent to current behavior)

#### Scenario: Gist API call fails

- **WHEN** `downloadFromGist` is called and the Gist API call throws an error
- **THEN** the method SHALL return `{ success: false, error: <message> }` as before (fail-open: the caller can retry or fall back)

### Requirement: Persist remote updated_at timestamp in SyncConfig

The system SHALL add a `lastRemoteUpdatedAt` field to the `SyncConfig` interface. This field SHALL store the `updated_at` value from the Gist API response after each successful sync (both after download and after upload, since uploading also changes the remote `updated_at`). The field SHALL default to `undefined` for backward compatibility.

#### Scenario: Timestamp updated after successful download

- **WHEN** a sync cycle successfully downloads and applies remote data
- **THEN** the system SHALL persist the Gist's `updated_at` value to `SyncConfig.lastRemoteUpdatedAt`

#### Scenario: Timestamp updated after successful upload

- **WHEN** a sync cycle successfully uploads local data to the Gist
- **THEN** the system SHALL update `SyncConfig.lastRemoteUpdatedAt` with the upload response's `updated_at` value (since uploading changes the Gist's timestamp)

#### Scenario: Existing configs without the field

- **WHEN** the app loads a `SyncConfig` that does not have the `lastRemoteUpdatedAt` field
- **THEN** the system SHALL treat the missing field as if no remote timestamp is known, triggering a full sync on the next cycle

### Requirement: Skip upload when local has no changes

The system SHALL check for local changes before preparing and uploading data. If `SyncDataService.hasChangesToUpload` returns `false`, the system SHALL skip the entire upload phase including data serialization and API calls. This check SHALL be performed regardless of whether the download phase was executed or skipped.

#### Scenario: No local changes after download was skipped

- **WHEN** remote change detection determined no remote changes (download skipped) and `hasChangesToUpload` returns `false`
- **THEN** the system SHALL skip the upload phase and complete the sync cycle with a "no changes" status message

#### Scenario: No local changes after download was applied

- **WHEN** remote data was downloaded and applied, and after applying, `hasChangesToUpload` returns `false`
- **THEN** the system SHALL skip the upload phase and complete the sync cycle

#### Scenario: Local changes detected

- **WHEN** `hasChangesToUpload` returns `true` (regardless of whether download was skipped or executed)
- **THEN** the system SHALL proceed with the full upload flow

### Requirement: Shared sync execution logic

The system SHALL extract the common sync execution flow (remote check → download → apply → local change check → upload) into a shared function or composable that both `useAutoSync` and `useGistSync` (manual sync) can reuse. The shared logic SHALL accept parameters for behavioral differences between auto and manual sync, including: progress message prefix, whether to return restorable deleted items, and error handling strategy (toast vs silent log).

#### Scenario: Auto sync uses shared executor

- **WHEN** an auto sync cycle triggers
- **THEN** the system SHALL delegate to the shared sync executor with auto-sync-specific parameters (prefix `[自动同步]`, no restorable items, errors logged silently)

#### Scenario: Manual sync uses shared executor

- **WHEN** a user triggers manual sync
- **THEN** the system SHALL delegate to the shared sync executor with manual-sync-specific parameters (no prefix, restorable items returned, errors shown as toast notifications)

#### Scenario: Both paths produce identical sync results

- **WHEN** auto sync and manual sync are given the same initial state
- **THEN** both paths SHALL produce the same final data state (same download, apply, upload behavior), differing only in UI feedback and error presentation
