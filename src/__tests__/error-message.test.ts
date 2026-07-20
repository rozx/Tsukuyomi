import { describe, expect, it } from 'bun:test';
import './setup';
import { getErrorMessage, toError } from '../utils/error-message';

describe('错误消息格式化', () => {
  it('保留 Error 与字符串消息', () => {
    expect(getErrorMessage(new Error('网络失败'))).toBe('网络失败');
    expect(getErrorMessage('请求取消')).toBe('请求取消');
  });

  it('安全提取对象中的 message 字段', () => {
    expect(getErrorMessage({ message: '服务不可用', code: 503 })).toBe('服务不可用');
    expect(getErrorMessage({ message: { code: 'E_PARSE' } })).toBe('{"code":"E_PARSE"}');
  });

  it('序列化普通对象且不产生默认的 Object 字符串', () => {
    expect(getErrorMessage({ code: 'E_TIMEOUT' })).toBe('{"code":"E_TIMEOUT"}');
  });

  it('对无法序列化或为空的值使用兜底消息', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(getErrorMessage(circular, '未知错误')).toBe('未知错误');
    expect(getErrorMessage(undefined, '未知错误')).toBe('未知错误');
  });

  it('将未知值规范化为 Error 实例', () => {
    const original = new Error('原始错误');

    expect(toError(original)).toBe(original);
    expect(toError({ message: '对象错误' }).message).toBe('对象错误');
  });
});
