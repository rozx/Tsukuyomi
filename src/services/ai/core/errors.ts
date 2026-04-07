/**
 * AI 返回空响应时抛出的错误
 */
export class AIEmptyResponseError extends Error {
  constructor() {
    super('AI 返回的文本为空');
    this.name = 'AIEmptyResponseError';
  }
}
