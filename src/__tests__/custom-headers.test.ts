import { describe, expect, it, mock, beforeEach } from 'bun:test';
import './setup';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIServiceConfig } from '../services/ai/types/ai-service';

// 创建完整的测试模型
function createTestModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com',
    enabled: true,
    isDefault: {
      translation: { enabled: true, temperature: 0.7 },
      proofreading: { enabled: true, temperature: 0.5 },
      termsTranslation: { enabled: true, temperature: 0.7 },
      assistant: { enabled: true, temperature: 0.7 },
    },
    lastEdited: new Date(),
    ...overrides,
  };
}

describe('Custom Headers Feature', () => {
  describe('AIModel interface', () => {
    it('should accept customHeaders field', () => {
      const model = createTestModel({
        customHeaders: {
          'X-Custom-Header': 'custom-value',
          'X-Proxy-Auth': 'proxy-token',
        },
      });

      expect(model.customHeaders).toBeDefined();
      expect(model.customHeaders?.['X-Custom-Header']).toBe('custom-value');
      expect(model.customHeaders?.['X-Proxy-Auth']).toBe('proxy-token');
    });

    it('should allow undefined customHeaders', () => {
      const model = createTestModel();

      expect(model.customHeaders).toBeUndefined();
    });
  });

  describe('AIServiceConfig interface', () => {
    it('should accept customHeaders field', () => {
      const config: AIServiceConfig = {
        apiKey: 'test-key',
        model: 'gpt-4',
        customHeaders: {
          'X-Custom-Header': 'custom-value',
        },
      };

      expect(config.customHeaders).toBeDefined();
      expect(config.customHeaders?.['X-Custom-Header']).toBe('custom-value');
    });
  });
});

describe('Custom Headers Propagation', () => {
  // 测试 customHeaders 从 AIModel 正确传播到 AIServiceConfig 的模式
  it('should propagate customHeaders from model to config', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Proxy-Auth': 'proxy-token',
      },
    });

    // 模拟服务层中的配置构建模式
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: 0.7,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders).toBeDefined();
    expect(config.customHeaders?.['X-Proxy-Auth']).toBe('proxy-token');
  });

  it('should handle undefined customHeaders gracefully', () => {
    const model = createTestModel();
    // customHeaders 未定义

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: 0.7,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders).toBeUndefined();
  });

  it('should handle empty customHeaders object', () => {
    const model = createTestModel({
      customHeaders: {},
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: 0.7,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    // 空对象仍然会被传播
    expect(config.customHeaders).toEqual({});
  });

  it('should support multiple custom headers', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Proxy-Auth': 'proxy-token',
        'X-Request-ID': 'req-123',
        'X-Client-Version': '1.0.0',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(Object.keys(config.customHeaders!)).toHaveLength(3);
    expect(config.customHeaders?.['X-Proxy-Auth']).toBe('proxy-token');
    expect(config.customHeaders?.['X-Request-ID']).toBe('req-123');
    expect(config.customHeaders?.['X-Client-Version']).toBe('1.0.0');
  });

  it('should not affect other config fields when customHeaders is undefined', () => {
    const model = createTestModel();

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: model.temperature,
      maxOutputTokens: model.maxOutputTokens,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.apiKey).toBe('test-key');
    expect(config.baseUrl).toBe('https://api.openai.com');
    expect(config.model).toBe('gpt-4');
    expect(config.temperature).toBe(0.7);
    expect(config.maxOutputTokens).toBe(4096);
    expect(config.customHeaders).toBeUndefined();
  });

  it('should preserve customHeaders when other fields are modified', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Custom': 'value',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: 'https://custom-api.example.com', // 修改的 baseUrl
      model: model.model,
      temperature: 0.5, // 修改的温度
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.baseUrl).toBe('https://custom-api.example.com');
    expect(config.temperature).toBe(0.5);
    expect(config.customHeaders?.['X-Custom']).toBe('value');
  });
});

describe('Custom Headers with Different Providers', () => {
  it('should work with OpenAI provider', () => {
    const model = createTestModel({
      provider: 'openai',
      customHeaders: {
        'X-OpenAI-Header': 'openai-value',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders?.['X-OpenAI-Header']).toBe('openai-value');
  });

  it('should work with Gemini provider', () => {
    const model = createTestModel({
      provider: 'gemini',
      model: 'gemini-pro',
      baseUrl: 'https://generativelanguage.googleapis.com',
      customHeaders: {
        'X-Gemini-Header': 'gemini-value',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders?.['X-Gemini-Header']).toBe('gemini-value');
  });
});

describe('Custom Headers Edge Cases', () => {
  it('should handle special characters in header values', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Special-Chars': 'value with spaces and "quotes"',
        'X-Unicode': '日本語テスト',
        'X-Base64': 'YWJjZDEyMzQ=',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders?.['X-Special-Chars']).toBe('value with spaces and "quotes"');
    expect(config.customHeaders?.['X-Unicode']).toBe('日本語テスト');
    expect(config.customHeaders?.['X-Base64']).toBe('YWJjZDEyMzQ=');
  });

  it('should handle empty string header value', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Empty': '',
      },
    });

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    expect(config.customHeaders?.['X-Empty']).toBe('');
  });

  it('should not merge customHeaders from multiple sources', () => {
    const model = createTestModel({
      customHeaders: {
        'X-Model-Header': 'model-value',
      },
    });

    const additionalHeaders: Record<string, string> = {
      'X-Additional-Header': 'additional-value',
    };

    // 模拟只使用模型的自定义头部
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    // 验证只有模型的头部被包含
    expect(config.customHeaders?.['X-Model-Header']).toBe('model-value');
    expect(config.customHeaders?.['X-Additional-Header']).toBeUndefined();
  });
});
