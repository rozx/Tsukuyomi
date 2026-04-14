import './setup';
import { describe, expect, it } from 'bun:test';
import { SettingsService } from 'src/services/settings-service';

const makeNovel = (id = 'n1', title = '测试书籍') => ({
  id,
  title,
  createdAt: '2024-01-01',
  lastEdited: '2024-01-01',
});

const makeMemory = (id = 'm1', bookId = 'n1') => ({
  id,
  bookId,
  content: '记忆内容',
  summary: '摘要',
  createdAt: 1700000000000,
  lastAccessedAt: 1700000000000,
});

describe('SettingsService.parseBookImportData', () => {
  it('should parse a plain Novel array', () => {
    const result = SettingsService.parseBookImportData([makeNovel(), makeNovel('n2', '第二本')]);
    expect(result.novels.length).toBe(2);
    expect(result.memoriesByBookId.size).toBe(0);
  });

  it('should parse a single Novel object (has title)', () => {
    const result = SettingsService.parseBookImportData(makeNovel());
    expect(result.novels.length).toBe(1);
    expect(result.novels[0]?.title).toBe('测试书籍');
  });

  it('should parse settings format { novels, memories }', () => {
    const input = {
      novels: [makeNovel()],
      memories: [makeMemory()],
      aiModels: [],
      sync: [],
    };
    const result = SettingsService.parseBookImportData(input);
    expect(result.novels.length).toBe(1);
    expect(result.memoriesByBookId.size).toBe(1);
    expect(result.memoriesByBookId.get('n1')?.length).toBe(1);
  });

  it('should parse single book export format { novel, memories }', () => {
    const input = {
      novel: makeNovel('abc'),
      memories: [makeMemory('m1', 'abc'), makeMemory('m2', 'abc')],
    };
    const result = SettingsService.parseBookImportData(input);
    expect(result.novels.length).toBe(1);
    expect(result.novels[0]?.id).toBe('abc');
    expect(result.memoriesByBookId.get('abc')?.length).toBe(2);
  });

  it('should group memories by bookId in settings format with multiple books', () => {
    const input = {
      novels: [makeNovel('a'), makeNovel('b')],
      memories: [makeMemory('m1', 'a'), makeMemory('m2', 'b'), makeMemory('m3', 'a')],
    };
    const result = SettingsService.parseBookImportData(input);
    expect(result.memoriesByBookId.get('a')?.length).toBe(2);
    expect(result.memoriesByBookId.get('b')?.length).toBe(1);
  });

  it('should return empty memoriesByBookId when no memories present', () => {
    const result = SettingsService.parseBookImportData({ novels: [makeNovel()] });
    expect(result.memoriesByBookId.size).toBe(0);
  });

  it('should throw on null', () => {
    expect(() => SettingsService.parseBookImportData(null)).toThrow('无法识别的文件格式');
  });

  it('should throw on unrecognised object', () => {
    expect(() => SettingsService.parseBookImportData({ foo: 'bar' })).toThrow('无法识别的文件格式');
  });

  it('should throw on empty array', () => {
    expect(() => SettingsService.parseBookImportData([])).toThrow('文件中没有找到有效的书籍数据');
  });

  it('should prefer novels/novel branches over title fallback', () => {
    const input = {
      title: '我是一个包裹',
      novels: [makeNovel('inner1')],
    };
    const result = SettingsService.parseBookImportData(input);
    expect(result.novels.length).toBe(1);
    expect(result.novels[0]?.id).toBe('inner1');
  });
});
