import './setup';
import { expect, it } from 'vitest';
import { parseGistManifest, UnsupportedManifestVersionError } from '../utils/manifest-protocol';

it('统一门禁拒绝未来协议、缺失版本和损坏索引，支持旧版本供迁移', () => {
  expect(() => parseGistManifest('{"schemaVersion":99,"newLayout":{}}')).toThrow(
    UnsupportedManifestVersionError,
  );
  expect(() => parseGistManifest('{"entries":{}}')).toThrow('manifest.json');
  expect(() => parseGistManifest('{"schemaVersion":4,"entries":[]}')).toThrow('entries');
  expect(parseGistManifest('{"schemaVersion":3,"entries":{}}').schemaVersion).toBe(3);
});
