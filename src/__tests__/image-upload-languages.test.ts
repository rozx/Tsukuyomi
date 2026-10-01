import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImageUploadService } from '../services/image-upload-service';
import { localizedErrorMessage } from '../utils/localized-error';
import type { AppLocale } from '../models/locale';

afterEach(() => vi.restoreAllMocks());
const upload = ImageUploadService.uploadImage.bind(ImageUploadService) as (
  file: File,
  locale?: AppLocale,
) => Promise<unknown>;
describe('封面上传说明语言', () => {
  it('网络包装保留原始fetch诊断', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch Original network detail'));
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(1)),
    });
    let failure: unknown;
    try {
      await upload(file, 'en-US');
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'failed')).toContain(
      'fetch Original network detail',
    );
  });
  it('删除说明保留错误身份及HTTP详情', async () => {
    let failure: unknown;
    try {
      await ImageUploadService.deleteImage('', 'zh-TW');
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'zh-TW', 'failed')).toBe('刪除 URL 不能為空');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502, statusText: 'Original delete detail' }),
    );
    try {
      await ImageUploadService.deleteImage('https://example.test/delete', 'en-US');
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'failed')).toBe(
      'Deletion failed: 502 Original delete detail',
    );
  });
  it('英文文件校验说明与原格式列表保持，校验失败不请求网络', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let failure: unknown;
    try {
      await upload(new File(['x'], '用户文件.txt', { type: 'text/plain' }), 'en-US');
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'failed')).toBe('Please select an image file');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('上传HTTP包装可重绘语言并保留原始状态详情', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 503, statusText: 'Original upstream detail' }),
    );
    const file = new File(['image'], '用户封面.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(1)),
    });
    let failure: unknown;
    try {
      await upload(file, 'en-US');
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'failed')).toBe(
      'Upload failed: 503 Original upstream detail',
    );
    expect(localizedErrorMessage(failure, 'zh-TW', 'failed')).toBe(
      '上傳失敗：503 Original upstream detail',
    );
  });
});
