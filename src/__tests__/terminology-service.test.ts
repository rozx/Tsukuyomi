import './setup';
import { TerminologyService } from 'src/services/terminology-service';
import { describe, test, expect } from 'bun:test';

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

      await (expect(TerminologyService.importTerminologiesFromFile(file)).rejects.toThrow(
        '文件格式错误：术语数据不完整',
      ) as unknown as Promise<void>);
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
        Excalibur: '誓约胜利之剑',
        Avalon: '远离尘世的理想乡',
      };
      const file = new File([JSON.stringify(kvData)], 'test.json', {
        type: 'application/json',
      });

      const imported = await TerminologyService.importTerminologiesFromFile(file);

      expect(imported).toHaveLength(2);

      const excalibur = imported.find((t) => t.name === 'Excalibur');
      expect(excalibur?.translation.translation).toBe('誓约胜利之剑');
      // Using regex match on ID since it's generated
      // expect(excalibur?.id).toMatch(/^import-/);
      expect(excalibur?.id.startsWith('import-')).toBe(true);
      expect(excalibur?.description).toBe(undefined);

      const avalon = imported.find((t) => t.name === 'Avalon');
      expect(avalon?.translation.translation).toBe('远离尘世的理想乡');
    });
  });
});
