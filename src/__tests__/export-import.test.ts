
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (actual: unknown) => {
  resolves: {
    toEqual: (expected: unknown) => Promise<void>;
  };
  rejects: {
    toThrow: (expected?: string | RegExp | Error) => Promise<void>;
  };
};

import { importTerminologiesFromFile, importCharacterSettingsFromFile } from '../utils/export-import';

// Mock FileReader
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

    await expect(importTerminologiesFromFile(file)).rejects.toThrow('文件格式错误：术语数据不完整');
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

    await expect(importTerminologiesFromFile(file)).resolves.toEqual(validData);
  });
});

describe('importCharacterSettingsFromFile', () => {
  test('should reject malformed translation object', async () => {
    const malformedData = [
      {
        id: '1',
        name: 'test',
        translation: {}, // Empty object
      },
    ];
    const file = new File([JSON.stringify(malformedData)], 'test.json', {
      type: 'application/json',
    });

    await expect(importCharacterSettingsFromFile(file)).rejects.toThrow(
      '文件格式错误：角色设定数据不完整',
    );
  });
});
