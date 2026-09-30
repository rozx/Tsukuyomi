import { describe, expect, it } from 'vitest';
import './setup';
import { SettingsService } from '../services/settings-service';
import { validateSettingsShape } from '../services/settings/settings-parsers';
import { LocalizedError } from '../utils/localized-error';
import type { Settings } from '../models/settings';

const CJK = /[一-鿿]/;
const model = { id: 'm1', name: 'M', provider: 'openai', model: 'gpt', apiKey: 'k' };

describe('备份导入导出说明跟随界面语言', () => {
  it('结构错误、空内容与成功摘要按界面语言生成', () => {
    expect(validateSettingsShape({} as Settings, 'en-US')).toBe(
      'The settings data has no valid aiModels array',
    );
    const empty = SettingsService.validateAndParseSettings({ aiModels: [] } as never, 'en-US');
    expect(empty.success).toBe(false);
    expect(empty.error).not.toMatch(CJK);
    const ok = SettingsService.validateAndParseSettings(
      { aiModels: [model], novels: [] } as never,
      'zh-TW',
    );
    expect(ok.message).toBe('成功匯入 1 個 AI 模型設定');
    const en = SettingsService.validateAndParseSettings(
      { aiModels: [model, model] } as never,
      'en-US',
    );
    expect(en.message).toBe('Imported 2 AI model settings');
  });

  it('文件类型与书籍数据错误带错误码，可按界面语言重新渲染', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const rejected = await SettingsService.readJsonFile(file).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(LocalizedError);
    expect((rejected as LocalizedError).messageFor('en-US')).toBe('Choose a JSON or TXT file');
    expect(() => SettingsService.parseBookImportData({ novels: [] })).toThrow(LocalizedError);
    const result = await SettingsService.importSettingsFromFile(file, 'en-US');
    expect(result.error).toBe('Choose a JSON or TXT file');
    expect(SettingsService.validateAndParseSettings({} as never).error).toBe(
      '设置数据中缺少有效的 aiModels 数组',
    );
  });
});
