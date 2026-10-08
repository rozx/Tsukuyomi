import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from 'bun:test';
import './setup';
import { ImageUploadService } from '../services/image-upload-service';
import { useSettingsStore } from '../stores/settings';

beforeEach(() => {
  const settings = useSettingsStore();
  settings.settings.proxyEnabled = true;
  settings.settings.proxyUrl = 'https://cors.rozx.moe/?{url}';
});

afterEach(() => mock.restore());

describe('图片上传请求路由', () => {
  it('图床支持跨域上传，全局代理开启时也直接上传到图床', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { url: 'https://p.sda1.dev/cover.png' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const file = new File(['image'], 'cover 1.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(5)),
    });

    expect(await ImageUploadService.uploadImage(file)).toEqual({
      url: 'https://p.sda1.dev/cover.png',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://p.sda1.dev/api/v1/upload_external_noform?filename=cover%201.png',
      {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(5),
      },
    );
  });

  it('没有确认支持跨域 DELETE 的外部删除接口仍使用配置的代理', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await ImageUploadService.deleteImage('https://images.example.com/delete/token');
    expect(fetch).toHaveBeenCalledWith(
      'https://cors.rozx.moe/?https%3A%2F%2Fimages.example.com%2Fdelete%2Ftoken',
      { method: 'DELETE' },
    );
  });
});
