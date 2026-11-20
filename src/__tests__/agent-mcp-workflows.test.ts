import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_VERSION } from 'src/constants/version';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { buildAgentQuickStartGuide } from 'src/services/agent-mcp/agent-quick-start';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { getAgentMcpPrompt } from 'src/services/agent-mcp/prompts';
import { agentMcpContextTools } from 'src/services/agent-mcp/tools/context';
import {
  arrangeWorkflowSteps,
  renderWorkflowSteps,
  taskPhases,
} from 'src/services/agent-mcp/workflows';
import { getValidTransitionsForTaskType } from 'src/services/ai/tasks/utils/task-types';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

const guide = (channel: 'desktop-mcp' | 'webmcp' = 'desktop-mcp') =>
  buildAgentQuickStartGuide({
    locale: 'zh-CN',
    channel,
    tools: ALL_AGENT_MCP_TOOLS,
    connection:
      channel === 'webmcp'
        ? { kind: 'relay', pageOrigin: 'https://app.example' }
        : { kind: 'desktop', endpointUrl: 'http://127.0.0.1:48321/mcp', token: 'tok' },
  });
const promptText = (name: string, args: Record<string, string> = {}) =>
  getAgentMcpPrompt(name, args)!.messages[0]!.content.text;

describe('外部 Agent 的工作流：指南、MCP 模板与站内流程是同一份', () => {
  it('指南里的步骤和 MCP 工作流模板是同一份文字，Agent 不需要两边各读一遍', () => {
    for (const [prompt, workflows] of [
      ['translate-chapter', ['translate-chapter']],
      ['polish-chapter', ['polish-chapter']],
      ['import-and-translate', ['import-book', 'translate-chapter']],
    ] as const) {
      const text = promptText(prompt);
      for (const workflow of workflows) {
        const steps = renderWorkflowSteps(workflow, 'zh-CN');
        expect(steps.length).toBeGreaterThan(2);
        for (const line of steps) {
          expect(text).toContain(line);
          expect(guide()).toContain(line);
        }
      }
    }
  });

  it('模板仍然带上这次任务的参数', () => {
    const translate = promptText('translate-chapter', {
      book_id: 'book-42',
      chapter_id: 'ch-7',
      model_label: 'my-model',
    });
    for (const part of ['book-42', 'ch-7', 'my-model']) expect(translate).toContain(part);
    expect(promptText('polish-chapter', { write_mode: 'overwrite' })).toContain(
      'write_mode: "overwrite"',
    );
    expect(promptText('import-and-translate', { source: 'https://example.com/n/1' })).toContain(
      'https://example.com/n/1',
    );
  });

  it('阶段顺序取自站内任务的状态机，不另外维护一份', () => {
    expect(taskPhases('translation')).toEqual(['planning', 'working', 'review']);
    expect(taskPhases('polish')).toEqual(['planning', 'working']);
    expect(taskPhases('proofreading')).toEqual(['planning', 'working']);
    // 与状态机逐步对得上：每个阶段的下一个阶段就是状态机给出的第一个去向
    for (const taskType of ['translation', 'polish', 'proofreading'] as const) {
      const transitions = getValidTransitionsForTaskType(taskType);
      const phases = taskPhases(taskType);
      phases.forEach((phase, index) => {
        expect(transitions[phase][0]).toBe(phases[index + 1] ?? 'end');
      });
    }
  });

  it('站内流程多出一个指南没有写步骤的阶段时直接报错，而不是悄悄漏掉', () => {
    const planned = { key: 'agentMcp.guide.wfPolishPlan', checklist: 'planning' } as const;
    const workflow = {
      before: ['agentMcp.guide.wfPolish1'],
      phases: { planning: [planned], working: ['agentMcp.guide.wfPolish2'] },
      after: ['agentMcp.guide.wfPolish4'],
    } as const;
    expect(arrangeWorkflowSteps(workflow, ['planning', 'working'])).toEqual([
      'agentMcp.guide.wfPolish1',
      planned,
      'agentMcp.guide.wfPolish2',
      'agentMcp.guide.wfPolish4',
    ]);
    // 假如站内给润色加上了复核阶段
    expect(() => arrangeWorkflowSteps(workflow, ['planning', 'working', 'review'])).toThrow(
      /review/,
    );
  });

  describe('指南过期', () => {
    beforeEach(async () => {
      await useSettingsStore().loadSettings();
      await useBooksStore().loadBooks();
    });

    it('指南带有应用版本，get_app_context 返回当前版本，Agent 可以发现保存的指南已经过期', async () => {
      for (const channel of ['desktop-mcp', 'webmcp'] as const) {
        expect(guide(channel)).toContain(APP_VERSION);
        expect(guide(channel)).toContain('app_version');
      }
      const kernel = createAgentMcpKernel({ tools: agentMcpContextTools });
      const res = await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' });
      expect((res.data as { app_version: string }).app_version).toBe(APP_VERSION);
    });

    it('get_quick_start_guide 返回当前版本的指南，Agent 可以自己替换保存的副本', async () => {
      await useSettingsStore().updateAgentMcpSettings({
        permissionMode: 'read_only',
        desktopPort: 48321,
        desktopAuthToken: 'real-secret-token',
      });
      const kernel = createAgentMcpKernel({ tools: agentMcpContextTools });
      // 只读权限、两个通道都可以用
      for (const channel of ['desktop-mcp', 'webmcp'] as const) {
        expect(kernel.listTools(channel).map((tool) => tool.name)).toContain(
          'get_quick_start_guide',
        );
      }

      const desktop = await kernel.callTool(
        'get_quick_start_guide',
        {},
        { channel: 'desktop-mcp' },
      );
      const data = desktop.data as { app_version: string; locale: string; guide: string };
      expect(data.app_version).toBe(APP_VERSION);
      // 与界面上复制的是同一份：连接地址来自当前设置，但令牌不经工具返回
      expect(data.guide).toBe(
        buildAgentQuickStartGuide({
          locale: useSettingsStore().uiLocale,
          channel: 'desktop-mcp',
          tools: agentMcpContextTools,
          connection: { kind: 'desktop', endpointUrl: 'http://127.0.0.1:48321/mcp', token: '' },
        }),
      );
      expect(data.guide).not.toContain('real-secret-token');
      expect(desktop.text).not.toContain('real-secret-token');

      const web = await kernel.callTool('get_quick_start_guide', {}, { channel: 'webmcp' });
      expect((web.data as { guide: string }).guide).toBe(
        buildAgentQuickStartGuide({
          locale: useSettingsStore().uiLocale,
          channel: 'webmcp',
          tools: agentMcpContextTools,
          connection: { kind: 'relay', pageOrigin: window.location.origin },
        }),
      );
      // 指南开头告诉 Agent 版本不一致时用这个工具更新
      expect(guide()).toMatch(/app_version[\s\S]{0,80}get_quick_start_guide/);
    });

    it('指南不再要求开工前把工作流再读一遍', () => {
      for (const channel of ['desktop-mcp', 'webmcp'] as const) {
        expect(guide(channel)).not.toMatch(/开工前|开始之前按/);
        expect(guide(channel)).toContain('不需要另外读取');
      }
    });
  });
});
