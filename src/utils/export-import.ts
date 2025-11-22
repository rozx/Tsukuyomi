import type { Terminology, CharacterSetting, Chapter, Paragraph } from 'src/types/novel';
import { getChapterDisplayTitle } from './novel-utils';

/**
 * 导出术语为 JSON 文件
 * @param terminologies 术语数组
 * @param filename 文件名（可选，默认包含日期）
 */
export function exportTerminologiesToJson(terminologies: Terminology[], filename?: string): void {
  try {
    const jsonString = JSON.stringify(terminologies, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `terminologies-${new Date().toISOString().split('T')[0]}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '导出术语时发生未知错误');
  }
}

/**
 * 导出角色设定为 JSON 文件
 * @param characterSettings 角色设定数组
 * @param filename 文件名（可选，默认包含日期）
 */
export function exportCharacterSettingsToJson(
  characterSettings: CharacterSetting[],
  filename?: string,
): void {
  try {
    const jsonString = JSON.stringify(characterSettings, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `characters-${new Date().toISOString().split('T')[0]}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '导出角色设定时发生未知错误');
  }
}

/**
 * 从文件导入术语
 * @param file 文件对象
 * @returns Promise<Terminology[]> 导入的术语数组
 */
export function importTerminologiesFromFile(file: File): Promise<Terminology[]> {
  return new Promise((resolve, reject) => {
    // 验证文件类型
    const isValidFile =
      file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');

    if (!isValidFile) {
      reject(new Error('请选择 JSON 或 TXT 格式的文件'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 验证数据格式
        if (!Array.isArray(data)) {
          reject(new Error('文件格式错误：应为术语数组'));
          return;
        }

        // 验证每个术语的基本结构
        for (const term of data) {
          if (
            !term.id ||
            !term.name ||
            !term.translation ||
            typeof term.translation.translation !== 'string'
          ) {
            reject(new Error('文件格式错误：术语数据不完整'));
            return;
          }
        }

        resolve(data as Terminology[]);
      } catch (error) {
        reject(
          new Error(
            error instanceof Error
              ? `解析文件时发生错误：${error.message}`
              : '解析文件时发生未知错误',
          ),
        );
      }
    };

    reader.onerror = () => {
      reject(new Error('读取文件时发生错误'));
    };

    reader.readAsText(file);
  });
}

/**
 * 从文件导入角色设定
 * @param file 文件对象
 * @returns Promise<CharacterSetting[]> 导入的角色设定数组
 */
export function importCharacterSettingsFromFile(file: File): Promise<CharacterSetting[]> {
  return new Promise((resolve, reject) => {
    // 验证文件类型
    const isValidFile =
      file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');

    if (!isValidFile) {
      reject(new Error('请选择 JSON 或 TXT 格式的文件'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 验证数据格式
        if (!Array.isArray(data)) {
          reject(new Error('文件格式错误：应为角色设定数组'));
          return;
        }

        // 验证每个角色的基本结构
        for (const char of data) {
          if (
            !char.id ||
            !char.name ||
            !char.translation ||
            typeof char.translation.translation !== 'string'
          ) {
            reject(new Error('文件格式错误：角色设定数据不完整'));
            return;
          }
        }

        resolve(data as CharacterSetting[]);
      } catch (error) {
        reject(
          new Error(
            error instanceof Error
              ? `解析文件时发生错误：${error.message}`
              : '解析文件时发生未知错误',
          ),
        );
      }
    };

    reader.onerror = () => {
      reject(new Error('读取文件时发生错误'));
    };

    reader.readAsText(file);
  });
}

/**
 * 获取段落的翻译文本
 * @param paragraph 段落对象
 * @returns 翻译文本，如果没有则返回空字符串
 */
function getParagraphTranslationText(paragraph: Paragraph): string {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
}

/**
 * 导出章节内容
 * @param chapter 章节对象
 * @param type 导出类型：'original' 原文、'translation' 翻译、'bilingual' 双语
 * @param format 导出格式：'txt' 文本文件、'json' JSON 文件、'clipboard' 剪贴板
 * @returns Promise，当 format 为 'clipboard' 时返回 Promise，否则返回 void
 */
export async function exportChapter(
  chapter: Chapter,
  type: 'original' | 'translation' | 'bilingual',
  format: 'txt' | 'json' | 'clipboard',
): Promise<void> {
  if (!chapter || !chapter.content || chapter.content.length === 0) {
    throw new Error('章节内容为空，无法导出');
  }

  const chapterTitle = getChapterDisplayTitle(chapter);
  let content = '';

  // 构建导出内容
  if (format === 'json') {
    const data = chapter.content.map((p) => ({
      original: p.text,
      translation: getParagraphTranslationText(p),
    }));
    content = JSON.stringify(
      {
        title: chapterTitle,
        content: data,
      },
      null,
      2,
    );
  } else {
    const lines = chapter.content.map((p) => {
      const original = p.text;
      const translation = getParagraphTranslationText(p);

      // 规范化换行符：确保翻译文本的换行符数量与原文一致
      // 如果原文没有换行符，翻译也不应有
      // 如果原文末尾有换行符，翻译也应有
      let normalizedTranslation = translation || original;

      // 检测原文末尾的换行符数量
      const originalTrailingNewlines = (original.match(/\n+$/) || [''])[0].length;
      // 移除翻译末尾的所有换行符
      normalizedTranslation = normalizedTranslation.replace(/\n+$/, '');
      // 添加与原文相同数量的换行符
      normalizedTranslation += '\n'.repeat(originalTrailingNewlines);

      switch (type) {
        case 'original':
          return original;
        case 'translation':
          // 规范化后的翻译文本已经包含了与原文一致的换行符
          return normalizedTranslation;
        case 'bilingual':
          return `${original}\n${normalizedTranslation}\n`;
        default:
          return '';
      }
    });
    content = `${chapterTitle}\n\n${lines.join('\n')}`;
  }

  // 执行导出动作
  if (format === 'clipboard') {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      throw new Error(
        err instanceof Error ? `复制到剪贴板失败：${err.message}` : '复制到剪贴板失败：请重试或检查权限',
      );
    }
  } else {
    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chapterTitle}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
