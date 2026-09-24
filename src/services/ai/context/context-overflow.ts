import { getErrorMessage } from 'src/utils/error-message';

const CONTEXT_OVERFLOW_MESSAGES = [
  'context_length_exceeded',
  'context_too_large',
  'maximum context length',
  'context length exceeded',
  'context window',
  'too many tokens',
  'input is too long',
  'prompt is too long',
  'exceeds the maximum number of tokens',
  'token limit exceeded',
];

/** 仅识别明确的上下文错误；不能靠 HTTP 400 或缺失的厂商错误正文猜测。 */
export function isContextOverflowError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase();
  if (/rate[ _-]?limit|quota/.test(message)) return false;
  return CONTEXT_OVERFLOW_MESSAGES.some((keyword) => message.includes(keyword));
}
