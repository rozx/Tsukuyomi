import { MANIFEST_SCHEMA_VERSION } from 'src/models/manifest';
import type { GistManifest } from 'src/models/manifest';
import type { MessageKey } from 'src/i18n/types';
import { LocalizedError } from './localized-error';

/** manifest 协议错误：带稳定错误码，说明按界面语言渲染（syncUi.manifest.*） */
export class ManifestProtocolError extends LocalizedError {
  constructor(code: string, key: string, values: Record<string, string | number> = {}) {
    super(code, `syncUi.manifest.${key}` as MessageKey, values);
    this.name = 'ManifestProtocolError';
  }
}

export class UnsupportedManifestVersionError extends ManifestProtocolError {
  constructor(readonly version: number) {
    super('MANIFEST_SCHEMA_TOO_NEW', 'schemaTooNew');
    this.name = 'UnsupportedManifestVersionError';
  }
}

/** 在任何旧格式回退、恢复或上传前检查版本，不猜测未来布局。 */
export function parseGistManifest(content: string): GistManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new ManifestProtocolError('MANIFEST_PARSE_FAILED', 'parseFailed');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ManifestProtocolError('MANIFEST_INVALID', 'invalid');
  const root = value as Record<string, unknown>;
  const version = root.schemaVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    throw new ManifestProtocolError('MANIFEST_SCHEMA_MISSING', 'schemaMissing');
  if (version > MANIFEST_SCHEMA_VERSION) throw new UnsupportedManifestVersionError(version);
  if (!root.entries || typeof root.entries !== 'object' || Array.isArray(root.entries))
    throw new ManifestProtocolError('MANIFEST_ENTRIES_MISSING', 'entriesMissing');
  return value as GistManifest;
}
