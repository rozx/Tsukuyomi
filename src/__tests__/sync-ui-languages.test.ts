import { describe, expect, it } from 'vitest';
import './setup';
import { getGroupedFiles } from '../components/settings/sync-revision-display';
import { translateText } from '../i18n/translate';
import type { MessageKey } from '../i18n/types';

const files = [
  { filename: 'tsukuyomi-settings.json', status: 'modified' as const },
  { filename: 'novel-b1.json', status: 'added' as const },
  { filename: 'novel-gone.json', status: 'removed' as const },
  { filename: 'memories-b1.json', status: 'modified' as const },
];

describe('同步界面文案跟随界面语言', () => {
  it('修订文件显示名按界面语言生成，书名保持原文', () => {
    const names = getGroupedFiles(files, [{ id: 'b1', title: '月の本' }], 'en-US').map(
      (file) => file.displayName,
    );
    expect(names).toEqual(expect.arrayContaining(['App configuration', '月の本', 'Book gone']));
    expect(getGroupedFiles(files, [], 'zh-TW').map((file) => file.displayName)).toContain(
      '應用程式設定',
    );
  });

  it('待同步条目类型（含连字符 key）三语言均可解析', () => {
    const key = 'syncUi.panel.kind.ai-model' as MessageKey;
    expect(translateText('en-US', key)).toBe('AI model');
    expect(translateText('en-US', 'syncUi.panel.pendingCount', { count: 1 })).toBe('1 item');
    expect(translateText('en-US', 'syncUi.panel.inHours', { count: 3 })).toBe('in 3 hours');
  });
});
