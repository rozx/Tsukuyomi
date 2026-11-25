import { describe, expect, it } from 'vitest';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { buildAgentQuickStartGuide } from 'src/services/agent-mcp/agent-quick-start';
import { translateText } from 'src/i18n/translate';
import { getPhaseChecklist } from 'src/services/ai/tasks/utils/todo-workflow';

const DESKTOP = {
  kind: 'desktop' as const,
  endpointUrl: 'http://127.0.0.1:48321/mcp',
  token: 'tok-abc123',
};
const WEB = { kind: 'relay' as const, pageOrigin: 'https://app.example' };

const desktopGuide = (locale: 'zh-CN' | 'zh-TW' | 'en-US' = 'zh-CN') =>
  buildAgentQuickStartGuide({
    locale,
    channel: 'desktop-mcp',
    tools: ALL_AGENT_MCP_TOOLS,
    connection: DESKTOP,
  });
const webGuide = (locale: 'zh-CN' | 'zh-TW' | 'en-US' = 'zh-CN') =>
  buildAgentQuickStartGuide({
    locale,
    channel: 'webmcp',
    tools: ALL_AGENT_MCP_TOOLS,
    connection: WEB,
  });
/** Agent 保存下来的版本：不带「首次设置」一节 */
const savedGuide = (
  locale: 'zh-CN' | 'zh-TW' | 'en-US' = 'zh-CN',
  channel: 'desktop-mcp' | 'webmcp' = 'desktop-mcp',
) => buildAgentQuickStartGuide({ locale, channel, tools: ALL_AGENT_MCP_TOOLS });

/**
 * 保存下来的指南的大小上限（UTF-8 字节）。Antigravity 自动注入单个规则文件时最多读 24,000 字节，
 * 超出的部分会被截掉（实际发生过：指南末尾的「出错时」被截断）；这里留出 500 字节余量。
 * 超限时请精简指南的文字，不要调高这个数。
 */
const SAVED_GUIDE_MAX_BYTES = 23_500;
const byteLength = (text: string) => new TextEncoder().encode(text).length;

describe('buildAgentQuickStartGuide', () => {
  it('是一份快速上手指南，开头让 Agent 替用户完成首次设置：建项目文件夹、配置 MCP、把指南存为 AGENTS.md', () => {
    const guide = desktopGuide();
    expect(guide).toMatch(/^# Tsukuyomi 快速上手指南/);
    // 首次设置是第一节，且是给 Agent 执行的编号步骤
    const setup = guide.slice(guide.indexOf('## 首次设置'), guide.indexOf('## 数据模型'));
    expect(setup).toMatch(/^1\. .*项目文件夹/m);
    expect(setup).toMatch(/^2\. .*MCP/m);
    expect(setup).toMatch(/^3\. .*AGENTS\.md/m);
    expect(setup).toMatch(/^4\. /m);
    // 询问用户放在哪里，并给出默认位置
    expect(setup).toMatch(/询问|问用户/);
    // 存好之后用户不用每次再粘贴
    expect(setup).toMatch(/不(用|需要)再粘贴/);
    // 「首次设置」只用一次，保存时不带它
    expect(setup).toMatch(/^3\. .*首次设置.*不用保存/m);
    // Claude Code 读取 CLAUDE.md；已有文件时追加而不是覆盖
    expect(setup).toContain('CLAUDE.md');
    expect(setup).toMatch(/追加/);
    // 已经设置过就跳过
    expect(setup).toMatch(/跳过/);
    expect(guide.indexOf('## 首次设置')).toBeLessThan(guide.indexOf('get_app_context'));
  });

  it('桌面通道的首次设置把 MCP 配置在项目文件夹里，并提醒令牌不要进公开仓库', () => {
    const guide = desktopGuide();
    expect(guide).toContain(
      'claude mcp add --scope project --transport http tsukuyomi http://127.0.0.1:48321/mcp',
    );
    expect(guide).toContain('Authorization: Bearer tok-abc123');
    // 列表项里的代码块每一行都缩进，Markdown 才能把它归在该步骤下
    expect(guide).toMatch(/^ {3}```bash\n {3}claude mcp add .*\n {5}--header .*\n {3}```$/m);
    expect(guide).toMatch(/开启本地 MCP 服务/);
    expect(guide).toMatch(/重启|重新加载/);
    expect(guide).toMatch(/令牌.*(公开|提交)/);
    expect(guide).not.toContain('webmcp-local-relay');
    expect(guide).toContain('prompts/get');
  });

  it('浏览器通道的首次设置添加本地中继并限定为本页来源，说明中继的管理工具', () => {
    const guide = webGuide();
    expect(guide).toContain('claude mcp add --scope project webmcp-local-relay');
    expect(guide).toContain('npx -y @mcp-b/webmcp-local-relay@latest');
    expect(guide).toContain('--widget-origin https://app.example');
    expect(guide).toContain('"mcpServers"');
    expect(guide).toMatch(/保持.*打开/);
    for (const tool of ['webmcp_list_sources', 'webmcp_list_tools', 'webmcp_call_tool'])
      expect(guide).toContain(tool);
    // 多个标签页同时连接时工具名会带后缀
    expect(guide).toMatch(/后缀/);
    expect(guide).toContain('get_workflow_guide');
    expect(guide).not.toContain('prompts/get');
    // 中继配置里没有令牌，不需要令牌提醒
    expect(guide).not.toMatch(/令牌/);
  });

  it('保存下来的指南不带「首次设置」一节，也就不带连接命令与访问令牌', () => {
    for (const channel of ['desktop-mcp', 'webmcp'] as const) {
      const saved = savedGuide('zh-CN', channel);
      expect(saved).toMatch(/^# Tsukuyomi 快速上手指南/);
      expect(saved).toMatch(/^本指南对应 Tsukuyomi /m);
      expect(saved).not.toContain('## 首次设置');
      expect(saved).not.toContain('claude mcp add');
      expect(saved).not.toContain('Authorization: Bearer');
      // 其余各节与完整的指南一字不差
      const full = channel === 'webmcp' ? webGuide() : desktopGuide();
      expect(saved.slice(saved.indexOf('## 数据模型'))).toBe(
        full.slice(full.indexOf('## 数据模型')),
      );
      expect(saved.slice(0, saved.indexOf('## 数据模型'))).toBe(
        full.slice(0, full.indexOf('## 首次设置')),
      );
    }
  });

  it('保存下来的指南在三种语言、两种通道下都不超过 Agent 规则文件的大小上限', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      for (const channel of ['desktop-mcp', 'webmcp'] as const) {
        expect(
          byteLength(savedGuide(locale, channel)),
          `${locale} / ${channel} 的指南过长`,
        ).toBeLessThanOrEqual(SAVED_GUIDE_MAX_BYTES);
      }
    }
  });

  it('工具一览按类别列出该通道的全部工具名，并标出会写入的工具', () => {
    const desktop = desktopGuide();
    const web = webGuide();
    for (const tool of ALL_AGENT_MCP_TOOLS) {
      if (tool.webMcpOnly) {
        expect(web).toContain(`\`${tool.name}\``);
        expect(desktop).not.toContain(`\`${tool.name}\``);
      } else {
        expect(desktop).toContain(`\`${tool.name}\``);
        expect(web).toContain(`\`${tool.name}\``);
      }
    }
    // 工具一览里的工具名都是真实注册的工具，每个只出现一次；每个类别一行
    const reference = desktop.slice(desktop.indexOf('## 工具一览'), desktop.indexOf('## 工作流'));
    const known = new Set(ALL_AGENT_MCP_TOOLS.map((tool) => tool.name));
    const listed = [...reference.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]!);
    expect(listed.length).toBe(ALL_AGENT_MCP_TOOLS.filter((tool) => !tool.webMcpOnly).length);
    expect(new Set(listed).size).toBe(listed.length);
    for (const name of listed) expect(known.has(name), `${name} 不是已注册的工具`).toBe(true);
    expect(reference.match(/^- \*\*/gm)).toHaveLength(4);
    expect(reference).toMatch(/^- \*\*翻译\*\*：`get_translation_chunk`、/m);
    // 写入类与危险类工具有标注，只读工具没有
    expect(reference).toContain('`submit_translations`（写入）');
    expect(reference).toContain('`delete_book`（危险）');
    expect(reference).toMatch(/`list_books`(、|$)/m);
    // 参数与完整说明在工具自带的描述里，指南不重复
    expect(reference).toMatch(/参数[^\n]*自带的(描述|说明)/);
  });

  it('翻译一章：一块对应一次提交，复核时就地改写自己的草稿，前文同文的句子沿用原来的译法', () => {
    const guide = desktopGuide();
    const translate = guide.slice(guide.indexOf('### 翻译一章'), guide.indexOf('### 润色校对'));
    // 一块最多 50 段，取到的一块一次提交完，不再另行分批
    expect(translate).toMatch(/最多 50 段[^\n]*max_paragraphs/);
    expect(translate).toMatch(/一块[^\n]*一次提交/);
    expect(guide).not.toMatch(/30\s*~\s*50/);
    // 续取同一章的后续块用 compact 省略重复的说明
    expect(translate).toContain('compact: true');
    // 与前文同文的段落带有当时的译法；更早或只是相近的句子自己去搜
    expect(translate).toMatch(/repeated_passages[^\n]*同文/);
    expect(translate).toMatch(/回忆[^\n]*search_paragraphs/);
    // 复核时修正自己刚提交的草稿：就地改写，不多留一个版本
    expect(translate).toMatch(/复核[^\n]*write_mode[^\n]*"overwrite"/);
    // 连续翻译多章时不能省略复核
    expect(translate).toMatch(/多章[^\n]*复核/);
    // 润色校对已有的译文仍然默认追加新版本
    const polish = guide.slice(guide.indexOf('### 润色校对'), guide.indexOf('### 导入新书'));
    expect(polish).toMatch(/默认[^\n]*新增[^\n]*只有用户明确要求[^\n]*"overwrite"/);
  });

  it('包含数据模型、分步骤的工作流与出错处理，细到参数与返回字段', () => {
    const guide = desktopGuide();
    // 数据模型
    expect(guide).toMatch(/最多保留 5 个版本/);
    // 翻译工作流的关键参数与返回字段
    for (const field of [
      'paragraph_id',
      'translated_text',
      'original_text_prefix',
      'chapter_title_translation',
      'context_before',
      'matched_terms',
      'failed_items',
      'remaining_untranslated_count',
    ])
      expect(guide).toContain(field);
    // 润色、导入、更新
    expect(guide).toContain('"overwrite"');
    expect(guide).toContain('has_more');
    expect(guide).toContain('IMPORT_IN_PROGRESS');
    expect(guide).toContain('include_updated');
    // 出错处理
    for (const code of ['PERMISSION_DENIED', 'NOT_READY', 'BOOK_ID_REQUIRED'])
      expect(guide).toContain(code);
    // 步骤带编号
    expect(guide).toMatch(/^1\. .+\n2\. .+\n3\. /m);
  });

  it('说明如何了解用户正在看什么、如何回答使用问题，以及统一修改译名的步骤', () => {
    const guide = desktopGuide();
    // 用户说「这一段」「这里」时先读上下文
    expect(guide).toMatch(/get_app_context[^\n]*页面[^\n]*选中/);
    expect(guide).toContain('selected_text');
    // 使用问题先查帮助文档
    expect(guide).toMatch(/怎么用[^\n]*search_help_docs[^\n]*get_help_doc/);
    // 统一译名：先统计、预览，再替换
    for (const field of [
      'search_paragraphs',
      'count_occurrences',
      'replace_in_translations',
      'dry_run',
      'original_contains',
    ])
      expect(guide).toContain(field);
    // 删除前要先向用户确认
    expect(guide).toMatch(/delete_terms[^\n]*确认/);
  });

  it('说明长篇如何省着读、新章节如何衔接上一章、翻译规范应写进特殊指令', () => {
    const guide = desktopGuide();
    for (const field of [
      'recent_chapters',
      'compact',
      'previous_chapter_tail',
      'recent_chapter_titles',
      'possible_terms',
      'text_in_source',
      'applied_chapters',
    ])
      expect(guide).toContain(field);
    // 模糊搜索是可选项
    expect(guide).toMatch(/默认都是精确匹配[^\n]*fuzzy: true/);
    // 用户的长期要求写进特殊指令；可复用的翻译决定放记忆，由相关性自动带出
    expect(guide).toMatch(/长期要求[^\n]*update_special_instructions/);
    expect(guide).toMatch(/翻译决定[^\n]*upsert_memory/);
  });

  it('浏览器通道说明来源数为 0 时怎么排查', () => {
    const guide = webGuide();
    expect(guide).toMatch(/0 个来源/);
    expect(guide).toContain('--widget-origin');
  });

  it('浏览器通道提醒：工具可能被客户端按需加载、中继刚启动要稍等、不必停留在「外部 Agent」页面', () => {
    const guide = webGuide();
    // 有的客户端不直接列出 MCP 工具：没看到工具不等于没连上
    expect(guide).toMatch(/按需加载/);
    expect(guide).toMatch(/稍等/);
    expect(guide).toMatch(/不必停留在「外部 Agent」页面/);
    expect(webGuide('zh-TW')).toMatch(/按需載入/);
    expect(webGuide('zh-TW')).toMatch(/不必停留在「外部 Agent」頁面/);
    expect(webGuide('en-US')).toMatch(/on demand/);
    expect(webGuide('en-US')).toMatch(/any Tsukuyomi page/);
    // 桌面通道不经中继，不需要这些说明
    expect(desktopGuide()).not.toMatch(/按需加载/);
  });

  it('复核时把查前文才确定的称呼、口吻回写到设定；没有本地嵌入时先浏览全部记忆摘要', () => {
    for (const guide of [desktopGuide(), webGuide()]) {
      // 查过前文才确定的东西说明设定里缺了它
      expect(guide).toMatch(/靠 search_paragraphs 查前文才确定的称呼、口吻/);
      expect(guide).toContain('speaking_style');
      expect(guide).toMatch(/带敬称的称呼记进记忆，不加进角色别名/);
      // 记忆只按关键词带出时，开翻前先看一遍摘要
      expect(guide).toMatch(/local_embedding_enabled: false 时.*list_memories/);
    }
    expect(desktopGuide('en-US')).toMatch(/had to confirm with search_paragraphs/);
    expect(desktopGuide('en-US')).toMatch(/local_embedding_enabled: false.*list_memories/);
    expect(desktopGuide('zh-TW')).toMatch(/local_embedding_enabled: false 時.*list_memories/);
  });

  it('包含与站内翻译相同的翻译规则：标点、格式、敬语、术语与角色、记忆', () => {
    const guide = desktopGuide();
    expect(guide).toMatch(/^## 翻译规则/m);
    for (const sentence of [
      '原文的「」『』在译文中原样保留',
      '原文中黑点・及重复中黑点必须原样保留',
      '严禁自动将带敬语姓名添加为角色别名',
      '术语表放概念、技能、地名、物品等非人名内容，禁止放人名',
      '每个术语只用一个目标译名',
      '严禁保存故事设定、背景、世界观、剧情及情节发展',
    ])
      expect(guide).toContain(sentence);
    // 指南不再让 Agent 把剧情记进记忆
    expect(guide).not.toMatch(/剧情转折[^\n]*upsert_memory/);
    expect(guide).not.toContain('剧情与世界观要点');
  });

  it('翻译流程与站内相同：先准备、再翻译、最后复核，清单取自站内的同一份文字', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      const guide = desktopGuide(locale);
      const planning = getPhaseChecklist('planning', locale, 'external');
      const brief = getPhaseChecklist('brief', locale, 'external');
      const review = getPhaseChecklist('review', locale, 'external');
      expect(planning).toHaveLength(5);
      for (const item of [...planning, ...brief, ...review]) expect(guide).toContain(item);

      const translate = guide.slice(
        guide.indexOf(`### ${translateText(locale, 'agentMcp.guide.wfTranslateTitle')}`),
        guide.indexOf(`### ${translateText(locale, 'agentMcp.guide.wfPolishTitle')}`),
      );
      // 准备在提交译文之前，复核在提交之后
      const submitStep = translate.indexOf(translateText(locale, 'agentMcp.guide.wfTranslate4'));
      expect(translate.indexOf(planning[0]!)).toBeGreaterThan(-1);
      expect(translate.indexOf(planning[4]!)).toBeLessThan(submitStep);
      expect(translate.indexOf(review[0]!)).toBeGreaterThan(submitStep);
      // 清单里的提交工具换成外部的名字
      expect(translate).not.toContain('add_translation_batch');
      expect(review[1]).toContain('submit_translations');
    }
    // 站内的待办文字不变
    expect(getPhaseChecklist('review', 'zh-CN')[1]).toBe(
      '修正发现的问题段落（直接使用 add_translation_batch 提交修正）',
    );
  });

  it('批量替换与导入更新的步骤写明续传位置和「没检查完」的状态', () => {
    const guide = desktopGuide();
    expect(guide).toContain('next_cursor');
    expect(guide).toMatch(/replace_in_translations[\s\S]*cursor/);
    expect(guide).toContain('partial');
  });

  it('是通用说明而不是具体任务：不包含书名或待填占位', () => {
    const guide = desktopGuide();
    expect(guide).not.toContain('《');
    expect(guide).not.toMatch(/<[^>]*(URL|填)/);
  });

  it('按界面语言输出，三种语言结构一致并保留工具名原文', () => {
    const sections = (text: string) => ({
      h2: text.match(/^## /gm)?.length,
      h3: text.match(/^### /gm)?.length,
    });
    const reference = sections(desktopGuide('zh-CN'));
    expect(reference.h2).toBe(8);
    expect(reference.h3).toBe(6);
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      expect(sections(desktopGuide(locale))).toEqual(reference);
      expect(sections(webGuide(locale))).toEqual(reference);
      // 保存的版本只少「首次设置」一节
      expect(sections(savedGuide(locale))).toEqual({ h2: 7, h3: 6 });
      expect(desktopGuide(locale)).toContain('get_translation_chunk');
      expect(desktopGuide(locale)).toContain('AGENTS.md');
    }
    expect(desktopGuide('en-US')).toMatch(/^# Tsukuyomi quick start guide/);
    expect(desktopGuide('en-US')).toMatch(/First-time setup/i);
  });
});
