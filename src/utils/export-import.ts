import type { Terminology, CharacterSetting } from 'src/types/novel';

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
          if (!term.id || !term.name || !term.translation) {
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
          if (!char.id || !char.name || !char.translation) {
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
