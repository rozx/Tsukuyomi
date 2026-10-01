import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { GistSyncService } from '../services/gist-sync-service';
import { SyncType } from '../models/sync';
import type { SyncConfig } from '../models/sync';
import type { AppSettings } from '../models/settings';

afterEach(() => vi.restoreAllMocks());

const config = {
  enabled: true,
  syncType: SyncType.Gist,
  syncInterval: 0,
  lastSyncTime: 0,
  syncParams: { username: 'user', token: 'token', gistId: 'existing-gist' },
  secret: 'token',
} as unknown as SyncConfig;

/** 以假 Octokit 替换真实客户端：get 返回空 Gist，update 按参数失败，create 记录调用。 */
function fakeOctokit(updateStatus: number, responseData: unknown = null) {
  const create = vi.fn(() => Promise.resolve({ data: { id: 'new-gist', html_url: 'x' } }));
  const octokit = {
    rest: {
      gists: {
        get: vi.fn(() => Promise.resolve({ data: { id: 'existing-gist', files: {} } })),
        update: vi.fn(() =>
          Promise.reject(
            Object.assign(new Error('request failed'), {
              response: { status: updateStatus, data: responseData },
            }),
          ),
        ),
        create,
      },
    },
  };
  vi.spyOn(
    GistSyncService.prototype as unknown as { initializeOctokit(): void },
    'initializeOctokit',
  ).mockImplementation(function (this: { octokit: unknown }) {
    this.octokit = octokit;
  });
  return { create };
}

const data = {
  aiModels: [],
  appSettings: {} as AppSettings,
  novels: [],
};

describe('Gist 同步错误按界面语言说明，识别依据错误码', () => {
  it('409 冲突以英文说明返回失败，不会被当成 Gist 不存在而新建 Gist', async () => {
    const { create } = fakeOctokit(409);
    const service = new GistSyncService(() => 'en-US');
    const result = await service.uploadToGist(config, data);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/conflict/i);
    expect(result.error).not.toMatch(/[一-鿿]/);
    expect(create).not.toHaveBeenCalled();
  });

  it('带响应体的更新失败以繁中说明返回，同样不会新建 Gist', async () => {
    const { create } = fakeOctokit(422, { message: 'Validation Failed' });
    const service = new GistSyncService(() => 'zh-TW');
    const result = await service.uploadToGist(config, data);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gist 更新失敗');
    expect(result.error).toContain('Validation Failed');
    expect(create).not.toHaveBeenCalled();
  });
});
