import './setup';
import { describe, expect, it } from 'vitest';
import {
  buildExternalTranslationModelId,
  resolveTranslationModelLabel,
} from 'src/utils/translation-model-label';

describe('translation-model-label', () => {
  const models = [{ id: 'model-1', name: 'Gemini Pro' }];

  it('优先返回站内已配置 AI 模型的名称', () => {
    expect(resolveTranslationModelLabel('model-1', models, '未知模型')).toBe('Gemini Pro');
  });

  it('友好解析带模型标签的 mcp:* 与 webmcp:* 外部来源标识', () => {
    expect(buildExternalTranslationModelId('desktop-mcp', 'claude-opus-4')).toBe(
      'mcp:claude-opus-4',
    );
    expect(buildExternalTranslationModelId('webmcp', 'Gemini 2.5 Pro')).toBe(
      'webmcp:Gemini 2.5 Pro',
    );
    expect(resolveTranslationModelLabel('mcp:claude-opus-4', models, '未知模型')).toBe(
      'MCP · claude-opus-4',
    );
    expect(resolveTranslationModelLabel('webmcp:Gemini 2.5 Pro', models, '未知模型')).toBe(
      'WebMCP · Gemini 2.5 Pro',
    );
  });

  it('缺省或 external 标签时展示通道简称', () => {
    expect(buildExternalTranslationModelId('desktop-mcp')).toBe('mcp:external');
    expect(buildExternalTranslationModelId('webmcp', '   ')).toBe('webmcp:external');
    expect(resolveTranslationModelLabel('mcp:external', models, '未知模型')).toBe('MCP');
    expect(resolveTranslationModelLabel('webmcp:external', models, '未知模型')).toBe('WebMCP');
    expect(resolveTranslationModelLabel('mcp:', models, '未知模型')).toBe('MCP');
  });

  it('非站内且非外部前缀时回退到 unknownLabel 或 null', () => {
    expect(resolveTranslationModelLabel('deleted-model-id', models, '未知模型')).toBe('未知模型');
    expect(resolveTranslationModelLabel('deleted-model-id', models, null)).toBeNull();
    expect(resolveTranslationModelLabel('', models, '未知模型')).toBe('未知模型');
  });
});
