export interface RevisionRestoreGuardInput {
  gistId: string;
  gistEnabled: boolean;
  isSyncing: boolean;
  isRestoringRevision: boolean;
  revertingVersion: string | null;
  version: string;
}

export function isRevisionRestoreBlocked({
  gistId,
  gistEnabled,
  isSyncing,
  isRestoringRevision,
  revertingVersion,
  version,
}: RevisionRestoreGuardInput): boolean {
  return (
    !gistEnabled ||
    !gistId.trim() ||
    isSyncing ||
    isRestoringRevision ||
    revertingVersion === version
  );
}
