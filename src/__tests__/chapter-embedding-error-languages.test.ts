import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ChapterEmbeddingService } from '../services/chapter-embedding-service';
import { EmbeddingService } from '../services/embedding-service';
import { localizedErrorMessage, localizedErrorCode } from '../utils/localized-error';
afterEach(() => vi.restoreAllMocks());
describe('章节向量查询的自有错误语言', () => {
  it('必填书籍和查询错误三语化且不尝试嵌入', async () => {
    const embed = vi.spyOn(EmbeddingService, 'embed');
    let failure: unknown;
    try {
      await ChapterEmbeddingService.queryChapters('', '用户查询', 5);
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'embeddingUi.queryFailed')).toBe(
      'Book ID is required',
    );
    try {
      await ChapterEmbeddingService.queryChapters('book', '', 5);
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'embeddingUi.queryFailed')).toBe(
      'Query is required',
    );
    expect(embed).not.toHaveBeenCalled();
  });

  it('真实查询向量为空时使用固定身份并保留语言投影', async () => {
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    vi.spyOn(EmbeddingService, 'embed').mockResolvedValue(null);
    let failure: unknown;
    try {
      await ChapterEmbeddingService.queryChapters('book', '用户查询', 5);
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'zh-TW', 'embeddingUi.queryFailed')).toBe(
      '無法計算查詢向量',
    );
    expect(localizedErrorCode(failure)).toBe('QUERY_EMBEDDING_FAILED');
  });

  it('真实未就绪入口保留机器身份，英文UI不显示简中自有说明', async () => {
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
    let failure: unknown;
    try {
      await ChapterEmbeddingService.queryChapters('book', '用户查询', 5);
    } catch (error) {
      failure = error;
    }
    expect(localizedErrorMessage(failure, 'en-US', 'embeddingUi.queryFailed')).toBe(
      'The embedding service is not ready',
    );
    expect(localizedErrorCode(failure)).toBe('EMBEDDING_NOT_READY');
  });
});
