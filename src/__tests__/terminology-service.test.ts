// Bun 测试框架提供全局函数，直接使用即可
// 这些函数在运行时由 Bun 提供，无需导入
// 使用函数签名类型避免 import() 类型注解（符合 ESLint 规范）

declare const describe: (name: string, fn: () => void) => void;

declare const test: (name: string, fn: () => void | Promise<void>) => void;

declare const expect: (actual: unknown) => {
  toBe: (expected: unknown) => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toEqual: (expected: unknown) => void;
  toThrow: (expected?: unknown) => void;
  toHaveLength: (expected: number) => void;
  toBeGreaterThanOrEqual: (expected: number) => void;
  rejects: {
    toThrow: (expected?: unknown) => Promise<void>;
  };
};

import { TerminologyService } from 'src/services/terminology-service';

// Mock FileReader for import tests
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsText(file: File) {
    file.text().then((text) => {
      if (this.onload) {
        this.onload({ target: { result: text } });
      }
    }).catch((e) => {
        if (this.onerror) {
            this.onerror(e);
        }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).FileReader = MockFileReader;

describe('TerminologyService', () => {
  describe('importTerminologiesFromFile', () => {
    test('should reject malformed translation object', async () => {
      const malformedData = [
        {
          id: '1',
          name: 'test',
          translation: {}, // Empty object, missing translation string
        },
      ];
      const file = new File([JSON.stringify(malformedData)], 'test.json', {
        type: 'application/json',
      });

      await expect(TerminologyService.importTerminologiesFromFile(file)).rejects.toThrow('文件格式错误：术语数据不完整');
    });

    test('should accept valid translation object', async () => {
      const validData = [
        {
          id: '1',
          name: 'test',
          translation: {
            id: 't1',
            translation: '测试',
            aiModelId: 'model1',
          },
        },
      ];
      const file = new File([JSON.stringify(validData)], 'test.json', {
        type: 'application/json',
      });

      const result = await TerminologyService.importTerminologiesFromFile(file);
      expect(result).toEqual(validData);
    });

    test('should accept key-value pair object', async () => {
      const kvData = {
        "Excalibur": "誓约胜利之剑",
        "Avalon": "远离尘世的理想乡"
      };
      const file = new File([JSON.stringify(kvData)], 'test.json', {
        type: 'application/json',
      });

      const imported = await TerminologyService.importTerminologiesFromFile(file);
      
      expect(imported).toHaveLength(2);
      
      const excalibur = imported.find(t => t.name === 'Excalibur');
      expect(excalibur?.translation.translation).toBe('誓约胜利之剑');
      // Using regex match on ID since it's generated
      // expect(excalibur?.id).toMatch(/^import-/); 
      expect(excalibur?.id.startsWith('import-')).toBe(true);
      expect(excalibur?.description).toBe(undefined);

      const avalon = imported.find(t => t.name === 'Avalon');
      expect(avalon?.translation.translation).toBe('远离尘世的理想乡');
    });
  });
});
