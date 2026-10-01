import { describe, expect, it } from 'vitest';
import { effectiveSchemaVersion, parseGistManifest } from '../utils/manifest-protocol';

const base = { schemaVersion: 4, updatedAt: '', entries: {} };

describe('升级围栏 manifest', () => {
  it('有效协议版本取围栏记录的旧版本，正常 manifest 取 schemaVersion', () => {
    expect(effectiveSchemaVersion({ ...base, pendingUpgradeFrom: 3 })).toBe(3);
    expect(effectiveSchemaVersion(base)).toBe(4);
  });

  it('围栏旧版本必须是低于当前协议的正整数', () => {
    for (const pendingUpgradeFrom of [0, 4, 2.5, '3'])
      expect(() => parseGistManifest(JSON.stringify({ ...base, pendingUpgradeFrom }))).toThrow();
    expect(
      parseGistManifest(JSON.stringify({ ...base, pendingUpgradeFrom: 2 })).pendingUpgradeFrom,
    ).toBe(2);
  });
});
