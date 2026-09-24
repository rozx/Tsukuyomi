import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import './setup';
import { releasePlan, validateReleaseAssets } from '../../scripts/desktop-release';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

describe('桌面发布包', () => {
  it('无 Apple 证书时明确使用 ad-hoc 签名且不生成安装器', () => {
    const plan = releasePlan('darwin', 'arm64', '0.16.1');
    expect(plan.channel).toBe('osx-arm64');
    expect(plan.args).toContain('--noInst');
    expect(
      plan.args.slice(
        plan.args.indexOf('--signAppIdentity'),
        plan.args.indexOf('--signAppIdentity') + 2,
      ),
    ).toEqual(['--signAppIdentity', '-']);
    expect(plan.args).not.toContain('--notaryProfile');
    expect(plan.args).not.toContain('--keychain');
    expect(() => releasePlan('darwin', 'arm64', '0.16.1.2')).toThrow();
  });

  it('阻止发布缺少文件、错误版本或校验和不匹配的更新清单', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'desktop-release-'));
    try {
      const data = Buffer.from('example update');
      const asset = {
        PackageId: 'tsukuyomi',
        Version: '0.16.1',
        Type: 'Full',
        FileName: 'update.nupkg',
        Size: data.length,
        SHA256: createHash('sha256').update(data).digest('hex'),
      };
      await writeFile(join(dir, 'releases.osx-arm64.json'), JSON.stringify({ Assets: [asset] }));
      await expect(validateReleaseAssets(dir, '0.16.1', ['osx-arm64'])).rejects.toThrow();
      await writeFile(join(dir, asset.FileName), data);
      await writeFile(join(dir, 'tsukuyomi-osx-arm64-Portable.zip'), 'portable');
      await expect(validateReleaseAssets(dir, '0.16.1', ['osx-arm64'])).resolves.toBeUndefined();
      await expect(validateReleaseAssets(dir, '0.16.2', ['osx-arm64'])).rejects.toThrow();
      await writeFile(join(dir, asset.FileName), 'broken');
      await expect(validateReleaseAssets(dir, '0.16.1', ['osx-arm64'])).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
