import { describe, expect, it } from 'vitest';
import { modelRejectsTemperature } from 'src/services/ai/core/temperature-support';

describe('modelRejectsTemperature', () => {
  it.each([
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5',
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-mythos-5-1',
    // 路由 / 云平台常见写法
    'anthropic/claude-opus-4.7',
    'anthropic/claude-sonnet-5.5',
    'anthropic.claude-opus-5-5',
    'Claude-Opus-5-5',
    'claude-opus-4-7-20260416',
  ])('%s 拒绝温度参数', (id) => {
    expect(modelRejectsTemperature(id)).toBe(true);
  });

  it.each([
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-1',
    'claude-opus-4-20250514',
    'claude-3-7-sonnet-latest',
    'anthropic/claude-sonnet-4.6',
    '~anthropic/claude-opus-latest',
    'gpt-6-luna',
    'deepseek-v4-pro',
    'gemini-3-pro',
    '',
  ])('%s 仍可发送温度', (id) => {
    expect(modelRejectsTemperature(id)).toBe(false);
  });
});
