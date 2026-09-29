import { MANIFEST_SCHEMA_VERSION } from 'src/models/manifest';
import type { GistManifest } from 'src/models/manifest';

export class ManifestProtocolError extends Error {}

export class UnsupportedManifestVersionError extends ManifestProtocolError {
  constructor(readonly version: number) {
    super('远程数据由较新版本的应用写入，请升级后再同步');
    this.name = 'UnsupportedManifestVersionError';
  }
}

/** 在任何旧格式回退、恢复或上传前检查版本，不猜测未来布局。 */
export function parseGistManifest(content: string): GistManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new ManifestProtocolError('manifest.json 解析失败');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ManifestProtocolError('manifest.json 格式无效');
  const root = value as Record<string, unknown>;
  const version = root.schemaVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    throw new ManifestProtocolError('manifest.json 缺少有效的 schemaVersion');
  if (version > MANIFEST_SCHEMA_VERSION) throw new UnsupportedManifestVersionError(version);
  if (!root.entries || typeof root.entries !== 'object' || Array.isArray(root.entries))
    throw new ManifestProtocolError('manifest.json 缺少有效的 entries 字段');
  return value as GistManifest;
}
