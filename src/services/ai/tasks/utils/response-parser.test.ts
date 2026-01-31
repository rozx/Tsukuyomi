import { describe, it, expect, spyOn } from 'bun:test';
import {
  parseStatusResponse,
  verifyParagraphCompleteness,
  type ParsedResponse,
} from './response-parser';

// Access private/internal functions for testing if exported, or test via public API.
// Since extractJsonObjects is not exported, we test it implicitly via parseStatusResponse
// or we can export it just for testing (but it's better to test the public API).
// We will focus on testing parseStatusResponse heavily as it covers the extractor.

describe('response-parser', () => {
  describe('parseStatusResponse', () => {
    it('should extract status from a simple JSON', () => {
      const input = 'Here is the result: {"status": "working"}';
      const result = parseStatusResponse(input);
      expect(result).toEqual<ParsedResponse>({
        status: 'working',
        content: undefined,
      });
    });

    it('should ignore invalid statuses', () => {
      const input = '{"status": "invalid_status"}';
      const result = parseStatusResponse(input);
      // Fallback behavior: if invalid status found, it reports error but defaults status to working if content exists,
      // or if no content, it returns error object.
      expect(result.status).toBe('working');
      expect(result.error).toContain('无效的状态值');
    });

    it('should extract simple paragraphs', () => {
      const input = '{"get": "p", "p": [{"id": "p1", "translation": "text1"}]}';
      const result = parseStatusResponse(input);
      expect(result.status).toBe('working'); // Default when no status provided but content exists
      expect(result.content?.paragraphs).toEqual([{ id: 'p1', translation: 'text1' }]);
    });

    it('should handle short keys (s, p, t)', () => {
      const input = '{"s": "review", "p": [{"id": "p1", "t": "t1"}]}';
      const result = parseStatusResponse(input);
      expect(result.status).toBe('review');
      expect(result.content?.paragraphs).toEqual([{ id: 'p1', translation: 't1' }]);
    });

    it('should handle multiple JSON objects in the stream', () => {
      const input =
        '{"status": "working"} some noise {"p": [{"id": "p1", "t": "t1"}]} more noise {"s": "review"}';
      const result = parseStatusResponse(input);
      expect(result.status).toBe('review');
      expect(result.content?.paragraphs).toHaveLength(1);
    });

    it('should handle standalone paragraph objects (no wrapper)', () => {
      const input = '{"id": "p1", "t": "translation1"}\n{"id": "p2", "t": "translation2"}';
      const result = parseStatusResponse(input);
      expect(result.content?.paragraphs).toHaveLength(2);
      expect(result.content?.paragraphs).toEqual([
        { id: 'p1', translation: 'translation1' },
        { id: 'p2', translation: 'translation2' },
      ]);
    });

    it('should use paragraph index mapping if provided', () => {
      const input = '{"i": 1, "t": "second paragraph"}';
      const mapping = ['p0', 'p1', 'p2'];
      const result = parseStatusResponse(input, mapping);
      const content = result.content;
      if (!content || !content.paragraphs) throw new Error('No content');
      expect(content.paragraphs![0]!.id).toBe('p1');
    });

    it('should handle escaped quotes inside JSON strings correctly', () => {
      const input = '{"id": "p1", "t": "He said \\"Hello\\""}';
      const result = parseStatusResponse(input);
      const content = result.content;
      if (!content || !content.paragraphs) throw new Error('No content');
      expect(content.paragraphs![0]!.translation).toBe('He said "Hello"');
    });

    it('should handle nested objects (braces counting)', () => {
      const input = '{"meta": {"info": "nested"}, "status": "planning"}';
      const result = parseStatusResponse(input);
      expect(result.status).toBe('planning');
    });

    it('should warn and skip invalid JSON chunks', () => {
      // Mocks console.warn to suppress output during test
      const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const input = '{"status": "work... incomplete';
      const result = parseStatusResponse(input);

      // Should result in error if no valid JSON found at all
      expect(result.error).toContain('未找到 JSON');

      consoleSpy.mockRestore();
    });

    it('should extract title translation', () => {
      const input = '{"tt": "My Book Title"}';
      const result = parseStatusResponse(input);
      expect(result.content?.titleTranslation).toBe('My Book Title');
    });
  });

  describe('verifyParagraphCompleteness', () => {
    it('should return true if all IDs are present', () => {
      const expected = ['p1', 'p2'];
      const received = new Map([
        ['p1', 't1'],
        ['p2', 't2'],
        ['p3', 't3'],
      ]);
      const result = verifyParagraphCompleteness(expected, received);
      expect(result.allComplete).toBe(true);
      expect(result.missingIds).toHaveLength(0);
    });

    it('should return missing IDs', () => {
      const expected = ['p1', 'p2', 'p3'];
      const received = new Map([
        ['p1', 't1'],
        ['p3', 't3'],
      ]);
      const result = verifyParagraphCompleteness(expected, received);
      expect(result.allComplete).toBe(false);
      expect(result.missingIds).toEqual(['p2']);
    });
  });
});
