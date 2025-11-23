<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Popover from 'primevue/popover';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useUiStore } from 'src/stores/ui';
import { useContextStore } from 'src/stores/context';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import {
  useChatSessionsStore,
  type ChatMessage,
  type MessageAction,
  MESSAGE_LIMIT_THRESHOLD,
  MAX_MESSAGES_PER_SESSION,
} from 'src/stores/chat-sessions';
import { AssistantService } from 'src/services/ai/tasks';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { ActionInfo } from 'src/services/ai/tools';
import type { ChatMessage as AIChatMessage } from 'src/services/ai/types/ai-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import type { CharacterSetting, Alias, Terminology } from 'src/models/novel';

const ui = useUiStore();
const contextStore = useContextStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const aiProcessingStore = useAIProcessingStore();
const chatSessionsStore = useChatSessionsStore();
const toast = useToastWithHistory();

// 配置 marked 以支持更好的 Markdown 渲染
marked.setOptions({
  breaks: true, // 支持换行
  gfm: true, // 支持 GitHub Flavored Markdown
});

// 渲染 Markdown 为 HTML（使用 DOMPurify 清理以防止 XSS）
const renderMarkdown = (text: string): string => {
  if (!text) return '';
  try {
    // 使用 marked 解析 Markdown
    const html = marked.parse(text) as string;
    // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
    // 允许常见的 Markdown HTML 标签，但阻止脚本执行
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'a',
        'hr',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      ALLOWED_ATTR: ['href', 'title', 'alt', 'class'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // 如果渲染失败，返回转义的原始文本
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }
};

const panelContainerRef = ref<HTMLElement | null>(null);
const messagesContainerRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof Textarea> | null>(null);
const resizeHandleRef = ref<HTMLElement | null>(null);

// 拖拽调整大小
const isResizing = ref(false);
const startX = ref(0);
const startWidth = ref(0);

const handleResizeStart = (event: MouseEvent) => {
  isResizing.value = true;
  startX.value = event.clientX;
  startWidth.value = ui.rightPanelWidth;
  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
  event.preventDefault();
};

const handleResizeMove = (event: MouseEvent) => {
  if (!isResizing.value) return;
  
  const deltaX = startX.value - event.clientX; // 向左拖拽时 deltaX 为正
  const newWidth = startWidth.value + deltaX;
  ui.setRightPanelWidth(newWidth);
};

const handleResizeEnd = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
});

const messages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
const isSending = ref(false);
const currentTaskId = ref<string | null>(null);
const currentMessageActions = ref<MessageAction[]>([]); // 当前消息的操作列表

// Popover refs for action details
const actionPopoverRefs = ref<Map<string, InstanceType<typeof Popover> | null>>(new Map());
const hoveredAction = ref<{ action: MessageAction; message: ChatMessage } | null>(null);

// 获取默认助手模型
const assistantModel = computed(() => {
  return aiModelsStore.getDefaultModelForTask('assistant');
});

// 获取当前上下文信息
const contextInfo = computed(() => {
  const context = contextStore.getContext;
  const info: string[] = [];
  
  if (context.currentBookId) {
    const book = booksStore.getBookById(context.currentBookId);
    if (book) {
      info.push(`书籍：${book.title}`);
    } else {
      info.push('当前书籍');
    }
  }
  if (context.currentChapterId) {
    info.push('当前章节');
  }
  if (context.hoveredParagraphId) {
    info.push('当前段落');
  }
  
  return info.length > 0 ? info.join(' | ') : '无上下文';
});

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
};

// 聚焦输入框
const focusInput = () => {
  // 使用 nextTick 确保 DOM 已更新，然后添加小延迟确保组件状态已更新
  nextTick(() => {
    // 添加小延迟确保 PrimeVue 组件状态已更新（特别是 disabled 状态）
    setTimeout(() => {
      if (inputRef.value) {
        // PrimeVue Textarea 组件的聚焦方法
        // 尝试多种方式访问 textarea 元素
        const component = inputRef.value as any;
        
        // 方法1: 直接调用 focus 方法（如果组件暴露了）
        if (typeof component.focus === 'function') {
          component.focus();
          return;
        }
        
        // 方法2: 通过 $el 访问（Vue 3 组件实例）
        if (component.$el) {
          const textarea = component.$el.querySelector?.('textarea') as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            return;
          }
          // 如果 $el 本身就是 textarea
          if (component.$el instanceof HTMLTextAreaElement) {
            component.$el.focus();
            return;
          }
        }
        
        // 方法3: 通过 el 属性访问（PrimeVue 可能使用）
        if (component.el) {
          const textarea = component.el.querySelector?.('textarea') as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            return;
          }
          if (component.el instanceof HTMLTextAreaElement) {
            component.el.focus();
            return;
          }
        }
        
        // 方法4: 直接通过 DOM 查询（最后手段）
        const textareaElement = document.querySelector('textarea[placeholder*="输入消息"]') as HTMLTextAreaElement | null;
        if (textareaElement && !textareaElement.disabled) {
          textareaElement.focus();
        }
      }
    }, 50); // 50ms 延迟，确保组件状态已更新
  });
};

// 发送消息
const sendMessage = async () => {
  const message = inputMessage.value.trim();
  if (!message || isSending.value) return;
  
  if (!assistantModel.value) {
    toast.add({
      severity: 'warn',
      summary: '未配置助手模型',
      detail: '请先在 AI 设置中配置默认助手模型',
      life: 3000,
    });
    return;
  }

  // 检查是否达到限制（在添加新消息之前）
  // 注意：这里检查的是添加新消息后的数量
  const willExceedLimit = messages.value.length + 1 >= MESSAGE_LIMIT_THRESHOLD;
  const willReachLimit = messages.value.length + 1 >= MAX_MESSAGES_PER_SESSION;

  if (willReachLimit) {
    toast.add({
      severity: 'warn',
      summary: '会话消息数已达上限',
      detail: '请先总结当前会话或创建新会话',
      life: 3000,
    });
    return;
  }

  // 如果接近限制，自动总结并重置
  let summarySucceeded = true;
  if (willExceedLimit && messages.value.length > 0) {
    try {
      isSending.value = true;
      // 不显示总结开始的 toast，静默进行

      // 构建要总结的消息（排除系统消息）
      const messagesToSummarize = messages.value.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // 调用总结功能
      const summary = await AssistantService.summarizeSession(
        assistantModel.value,
        messagesToSummarize,
        {
          onChunk: () => {
            // 总结过程中可以显示进度，但这里简化处理
          },
        },
      );

      // 保存总结并重置消息
      chatSessionsStore.summarizeAndReset(summary);

      // 更新本地消息列表（使用标记避免触发 watch）
      isUpdatingFromStore = true;
      const session = chatSessionsStore.currentSession;
      if (session) {
        messages.value = [...session.messages];
      }
      // 使用 nextTick 确保在下一个 tick 重置标记
      await nextTick();
      isUpdatingFromStore = false;

      // 不显示总结成功的 toast，静默完成
    } catch (error) {
      console.error('Failed to summarize session:', error);
      summarySucceeded = false;
      toast.add({
        severity: 'error',
        summary: '总结失败',
        detail: error instanceof Error ? error.message : '未知错误',
        life: 5000,
      });
      
      // 总结失败时，再次检查是否达到限制
      const currentMessageCount = messages.value.length + 1;
      if (currentMessageCount >= MAX_MESSAGES_PER_SESSION) {
        toast.add({
          severity: 'warn',
          summary: '无法发送消息',
          detail: '会话消息数已达上限，且自动总结失败。请手动创建新会话或清空当前会话。',
          life: 5000,
        });
        isSending.value = false;
        return; // 阻止发送消息
      }
    } finally {
      if (summarySucceeded) {
        isSending.value = false;
      }
      // 如果总结失败且未达到上限，继续发送消息
    }
  }

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };
  messages.value.push(userMessage);
  inputMessage.value = '';
  isSending.value = true;
  scrollToBottom();

  // 添加占位符助手消息
  const assistantMessageId = (Date.now() + 1).toString();
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };
  messages.value.push(assistantMessage);
  
  // 注意：不在这里重置操作列表，因为操作可能在消息发送过程中发生
  // 操作列表会在消息完成或失败时处理

  try {
      // 获取当前会话的总结（如果有）
      // 保存会话 ID，确保在异步操作期间即使会话切换，消息也会保存到正确的会话
      const currentSession = chatSessionsStore.currentSession;
      const sessionId = currentSession?.id ?? null;
      const sessionSummary = currentSession?.summary;

      // 将 store 中的消息转换为 AI ChatMessage 格式（用于连续对话）
      const messageHistory: AIChatMessage[] | undefined = currentSession?.messages
        ? currentSession.messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            }))
        : undefined;

      // 调用 AssistantService（内部会创建任务并获取 abortController signal）
      const result = await AssistantService.chat(assistantModel.value, message, {
        ...(sessionSummary ? { sessionSummary } : {}),
        ...(messageHistory ? { messageHistory } : {}),
      onChunk: (chunk) => {
        // 更新助手消息内容
        const msg = messages.value.find((m) => m.id === assistantMessageId);
        if (msg) {
          if (chunk.text) {
            msg.content += chunk.text;
            scrollToBottom();
          }
          // 如果消息内容仍然为空，至少显示一个提示
          if (!msg.content && !chunk.text) {
            msg.content = '正在思考...';
          }
        }
      },
      onAction: (action: ActionInfo) => {
        // 记录操作到当前消息
        const actionName = 'name' in action.data ? action.data.name : undefined;
        const messageAction: MessageAction = {
          type: action.type,
          entity: action.entity,
          ...(actionName ? { name: actionName } : {}),
          timestamp: Date.now(),
          // 网络操作相关信息
          ...(action.type === 'web_search' && 'query' in action.data
            ? { query: action.data.query }
            : {}),
          ...(action.type === 'web_fetch' && 'url' in action.data
            ? { url: action.data.url }
            : {}),
        };
        
        // 立即将操作添加到临时数组（用于后续保存）
        currentMessageActions.value.push(messageAction);
        
        // 立即将操作添加到当前助手消息，使其立即显示在 UI 中
        const assistantMsg = messages.value.find((m) => m.id === assistantMessageId);
        if (assistantMsg) {
          if (!assistantMsg.actions) {
            assistantMsg.actions = [];
          }
          // 检查是否已经添加过（避免重复）
          const existingAction = assistantMsg.actions.find(
            (a) => a.timestamp === messageAction.timestamp && a.type === messageAction.type,
          );
          if (!existingAction) {
            assistantMsg.actions.push(messageAction);
            // 触发响应式更新并滚动到底部
            nextTick(() => {
              scrollToBottom();
            });
          }
        }

        // 显示操作通知
        const actionLabels: Record<ActionInfo['type'], string> = {
          create: '创建',
          update: '更新',
          delete: '删除',
          web_search: '网络搜索',
          web_fetch: '网页获取',
        };
        const entityLabels: Record<ActionInfo['entity'], string> = {
          term: '术语',
          character: '角色',
          web: '网络',
        };

        // 处理网络搜索和网页获取操作
        if (action.type === 'web_search') {
          const query = 'query' in action.data ? action.data.query : undefined;
          if (query) {
            toast.add({
              severity: 'info',
              summary: actionLabels[action.type],
              detail: `搜索查询：${query}`,
              life: 3000,
            });
          }
          // 不继续处理其他逻辑，直接返回
          return;
        }

        if (action.type === 'web_fetch') {
          const url = 'url' in action.data ? action.data.url : undefined;
          if (url) {
            toast.add({
              severity: 'info',
              summary: actionLabels[action.type],
              detail: `获取网页：${url}`,
              life: 3000,
            });
          }
          // 不继续处理其他逻辑，直接返回
          return;
        }
        
        // 构建详细的 toast 消息
        let detail = '';
        let shouldShowRevertToast = false;
        
        if (action.type === 'create' && 'name' in action.data) {
          // 创建操作：显示详细信息
          if (action.entity === 'character' && 'id' in action.data) {
            const character = action.data as CharacterSetting;
            const parts: string[] = [];
            
            // 角色名称和翻译（主要信息）
            if (character.name) {
              const translation = character.translation?.translation;
              if (translation) {
                parts.push(`${character.name} → ${translation}`);
              } else {
                parts.push(character.name);
              }
            }
            
            // 其他详细信息
            const details: string[] = [];
            
            // 性别
            if (character.sex) {
              const sexLabels: Record<string, string> = {
                male: '男',
                female: '女',
                other: '其他',
              };
              details.push(`性别：${sexLabels[character.sex] || character.sex}`);
            }
            
            // 说话口吻
            if (character.speakingStyle) {
              details.push(`口吻：${character.speakingStyle}`);
            }
            
            // 别名数量
            if (character.aliases && character.aliases.length > 0) {
              details.push(`别名：${character.aliases.length} 个`);
            }
            
            // 出现次数
            if (character.occurrences && character.occurrences.length > 0) {
              const totalOccurrences = character.occurrences.reduce((sum, occ) => sum + occ.count, 0);
              details.push(`出现：${totalOccurrences} 次`);
            }
            
            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = mainInfo;
            } else if (details.length > 0) {
              detail = details.join(' | ');
            } else {
              detail = `角色 "${character.name}" 已创建`;
            }
            
            // 为创建操作添加 revert（删除）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (contextStore.getContext.currentBookId) {
                    await CharacterSettingService.deleteCharacterSetting(
                      contextStore.getContext.currentBookId,
                      character.id,
                    );
                  }
                },
              });
            }
          } else if (action.entity === 'term' && 'id' in action.data) {
            const term = action.data as Terminology;
            const parts: string[] = [];
            
            // 术语名称和翻译（主要信息）
            if (term.name) {
              const translation = term.translation?.translation;
              if (translation) {
                parts.push(`${term.name} → ${translation}`);
              } else {
                parts.push(term.name);
              }
            }
            
            // 其他详细信息
            const details: string[] = [];
            
            // 描述
            if (term.description) {
              details.push(`描述：${term.description}`);
            }
            
            // 出现次数
            if (term.occurrences && term.occurrences.length > 0) {
              const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
              details.push(`出现：${totalOccurrences} 次`);
            }
            
            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = mainInfo;
            } else if (details.length > 0) {
              detail = details.join(' | ');
            } else {
              detail = `术语 "${term.name}" 已创建`;
            }
            
            // 为创建操作添加 revert（删除）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (contextStore.getContext.currentBookId) {
                    await TerminologyService.deleteTerminology(
                      contextStore.getContext.currentBookId,
                      term.id,
                    );
                  }
                },
              });
            }
          } else {
            // 默认创建消息
            detail = `${entityLabels[action.entity]} "${action.data.name}" 已${actionLabels[action.type]}`;
          }
        } else if (action.type === 'update' && action.entity === 'character' && 'name' in action.data) {
          // 角色更新操作：显示详细信息
          const character = action.data as import('src/models/novel').CharacterSetting;
          const parts: string[] = [];
          
          // 角色名称和翻译（主要信息）
          if (character.name) {
            const translation = character.translation?.translation;
            if (translation) {
              parts.push(`${character.name} → ${translation}`);
            } else {
              parts.push(character.name);
            }
          }
          
          // 其他详细信息
          const details: string[] = [];
          
          // 性别
          if (character.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            details.push(`性别：${sexLabels[character.sex] || character.sex}`);
          }
          
          // 说话口吻
          if (character.speakingStyle) {
            details.push(`口吻：${character.speakingStyle}`);
          }
          
          // 别名数量
          if (character.aliases && character.aliases.length > 0) {
            details.push(`别名：${character.aliases.length} 个`);
          }
          
          // 出现次数
          if (character.occurrences && character.occurrences.length > 0) {
            const totalOccurrences = character.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push(`出现：${totalOccurrences} 次`);
          }
          
          // 组合消息
          const mainInfo = parts.join(' | ');
          if (mainInfo && details.length > 0) {
            detail = `${mainInfo} | ${details.join(' | ')}`;
          } else if (mainInfo) {
            detail = mainInfo;
          } else if (details.length > 0) {
            detail = details.join(' | ');
          } else {
            detail = '角色已更新';
          }
          
          // 添加 revert 功能
          const previousCharacter = action.previousData as CharacterSetting | undefined;
          
          if (previousCharacter && contextStore.getContext.currentBookId) {
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
              detail,
              life: 3000,
              onRevert: async () => {
                if (previousCharacter && contextStore.getContext.currentBookId) {
                  await CharacterSettingService.updateCharacterSetting(
                    contextStore.getContext.currentBookId,
                    previousCharacter.id,
                    {
                      name: previousCharacter.name,
                      sex: previousCharacter.sex,
                      translation: previousCharacter.translation.translation,
                      ...(previousCharacter.description !== undefined
                        ? { description: previousCharacter.description }
                        : {}),
                      ...(previousCharacter.speakingStyle !== undefined
                        ? { speakingStyle: previousCharacter.speakingStyle }
                        : {}),
                      ...(previousCharacter.aliases !== undefined
                        ? {
                            aliases: previousCharacter.aliases.map((a: Alias) => ({
                              name: a.name,
                              translation: a.translation.translation,
                            })),
                          }
                        : {}),
                    },
                  );
                }
              },
            });
          }
        } else if (action.type === 'update' && action.entity === 'term' && 'name' in action.data) {
          // 术语更新操作：显示详细信息
          const term = action.data as import('src/models/novel').Terminology;
          const parts: string[] = [];
          
          // 术语名称和翻译（主要信息）
          if (term.name) {
            const translation = term.translation?.translation;
            if (translation) {
              parts.push(`${term.name} → ${translation}`);
            } else {
              parts.push(term.name);
            }
          }
          
          // 其他详细信息
          const details: string[] = [];
          
          // 描述
          if (term.description) {
            details.push(`描述：${term.description}`);
          }
          
          // 出现次数
          if (term.occurrences && term.occurrences.length > 0) {
            const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push(`出现：${totalOccurrences} 次`);
          }
          
          // 组合消息
          const mainInfo = parts.join(' | ');
          if (mainInfo && details.length > 0) {
            detail = `${mainInfo} | ${details.join(' | ')}`;
          } else if (mainInfo) {
            detail = mainInfo;
          } else if (details.length > 0) {
            detail = details.join(' | ');
          } else {
            detail = `术语 "${term.name}" 已更新`;
          }
          
          // 添加 revert 功能
          const previousTerm = action.previousData as Terminology | undefined;
          
          if (previousTerm && contextStore.getContext.currentBookId) {
            shouldShowRevertToast = true;
            toast.add({
              severity: 'success',
              summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
              detail,
              life: 3000,
              onRevert: async () => {
                if (previousTerm && contextStore.getContext.currentBookId) {
                  await TerminologyService.updateTerminology(
                    contextStore.getContext.currentBookId,
                    previousTerm.id,
                    {
                      name: previousTerm.name,
                      translation: previousTerm.translation.translation,
                      ...(previousTerm.description !== undefined
                        ? { description: previousTerm.description }
                        : {}),
                    },
                  );
                }
              },
            });
          }
        } else if (action.type === 'delete' && 'name' in action.data) {
          // 删除操作：显示详细信息（从 previousData 获取）
          if (action.entity === 'character' && action.previousData) {
            const previousCharacter = action.previousData as CharacterSetting;
            const parts: string[] = [];
            
            // 角色名称和翻译（主要信息）
            if (previousCharacter.name) {
              const translation = previousCharacter.translation?.translation;
              if (translation) {
                parts.push(`${previousCharacter.name} → ${translation}`);
              } else {
                parts.push(previousCharacter.name);
              }
            }
            
            // 其他详细信息
            const details: string[] = [];
            
            // 性别
            if (previousCharacter.sex) {
              const sexLabels: Record<string, string> = {
                male: '男',
                female: '女',
                other: '其他',
              };
              details.push(`性别：${sexLabels[previousCharacter.sex] || previousCharacter.sex}`);
            }
            
            // 说话口吻
            if (previousCharacter.speakingStyle) {
              details.push(`口吻：${previousCharacter.speakingStyle}`);
            }
            
            // 别名数量
            if (previousCharacter.aliases && previousCharacter.aliases.length > 0) {
              details.push(`别名：${previousCharacter.aliases.length} 个`);
            }
            
            // 出现次数
            if (previousCharacter.occurrences && previousCharacter.occurrences.length > 0) {
              const totalOccurrences = previousCharacter.occurrences.reduce((sum, occ) => sum + occ.count, 0);
              details.push(`出现：${totalOccurrences} 次`);
            }
            
            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `已删除：${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = `已删除：${mainInfo}`;
            } else if (details.length > 0) {
              detail = `已删除角色 | ${details.join(' | ')}`;
            } else {
              detail = `角色 "${previousCharacter.name}" 已删除`;
            }
            
            // 为删除操作添加 revert（恢复）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (previousCharacter && contextStore.getContext.currentBookId) {
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(contextStore.getContext.currentBookId);
                    if (book) {
                      const current = book.characterSettings || [];
                      // 检查是否存在（避免重复）
                      if (!current.some((c) => c.id === previousCharacter.id)) {
                        await booksStore.updateBook(book.id, {
                          characterSettings: [...current, previousCharacter],
                          lastEdited: new Date(),
                        });
                      }
                    }
                  }
                },
              });
            }
          } else if (action.entity === 'term' && action.previousData) {
            const previousTerm = action.previousData as Terminology;
            const parts: string[] = [];
            
            // 术语名称和翻译（主要信息）
            if (previousTerm.name) {
              const translation = previousTerm.translation?.translation;
              if (translation) {
                parts.push(`${previousTerm.name} → ${translation}`);
              } else {
                parts.push(previousTerm.name);
              }
            }
            
            // 其他详细信息
            const details: string[] = [];
            
            // 描述
            if (previousTerm.description) {
              details.push(`描述：${previousTerm.description}`);
            }
            
            // 出现次数
            if (previousTerm.occurrences && previousTerm.occurrences.length > 0) {
              const totalOccurrences = previousTerm.occurrences.reduce((sum, occ) => sum + occ.count, 0);
              details.push(`出现：${totalOccurrences} 次`);
            }
            
            // 组合消息
            const mainInfo = parts.join(' | ');
            if (mainInfo && details.length > 0) {
              detail = `已删除：${mainInfo} | ${details.join(' | ')}`;
            } else if (mainInfo) {
              detail = `已删除：${mainInfo}`;
            } else if (details.length > 0) {
              detail = `已删除术语 | ${details.join(' | ')}`;
            } else {
              detail = `术语 "${previousTerm.name}" 已删除`;
            }
            
            // 为删除操作添加 revert（恢复）
            if (contextStore.getContext.currentBookId) {
              shouldShowRevertToast = true;
              toast.add({
                severity: 'success',
                summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
                detail,
                life: 3000,
                onRevert: async () => {
                  if (previousTerm && contextStore.getContext.currentBookId) {
                    const booksStore = useBooksStore();
                    const book = booksStore.getBookById(contextStore.getContext.currentBookId);
                    if (book) {
                      const current = book.terminologies || [];
                      // 检查是否存在（避免重复）
                      if (!current.some((t) => t.id === previousTerm.id)) {
                        await booksStore.updateBook(book.id, {
                          terminologies: [...current, previousTerm],
                          lastEdited: new Date(),
                        });
                      }
                    }
                  }
                },
              });
            }
          } else {
            // 默认删除消息
            detail = `${entityLabels[action.entity]} "${action.data.name}" 已${actionLabels[action.type]}`;
          }
        } else {
          // 默认消息
          detail = `${entityLabels[action.entity]}已${actionLabels[action.type]}`;
        }
        
        // 如果没有显示带 revert 的 toast，显示通用 toast
        if (!shouldShowRevertToast) {
          toast.add({
            severity: 'success',
            summary: `${actionLabels[action.type]}${entityLabels[action.entity]}`,
            detail,
            life: 3000,
          });
        }
      },
      aiProcessingStore: {
        addTask: async (task) => {
          // AssistantService 内部会调用此方法来创建任务
          const id = await aiProcessingStore.addTask(task);
          return id;
        },
        updateTask: async (id, updates) => {
          await aiProcessingStore.updateTask(id, updates);
        },
        appendThinkingMessage: async (id, text) => {
          await aiProcessingStore.appendThinkingMessage(id, text);
        },
        removeTask: async (id) => {
          await aiProcessingStore.removeTask(id);
        },
        activeTasks: aiProcessingStore.activeTasks,
      },
    });

    // 保存 taskId（从 result 中获取，因为任务是在 AssistantService 内部创建的）
    if (result.taskId) {
      currentTaskId.value = result.taskId;
    }

    // 检查是否需要重置（token 限制或错误导致）
    if (result.needsReset && result.summary) {
      // 保存总结并重置消息（使用保存的会话 ID，确保即使会话切换，总结也会保存到原始会话）
      if (sessionId) {
        chatSessionsStore.summarizeAndReset(result.summary, sessionId);
      }

      // 显示总结信息
      toast.add({
        severity: 'info',
        summary: '会话已总结',
        detail: '由于达到 token 限制或发生错误，会话历史已自动总结并重置。之前的对话内容已保存为总结。',
        life: 5000,
      });

      // 更新本地消息列表（使用标记避免触发 watch）
      isUpdatingFromStore = true;
      const session = chatSessionsStore.currentSession;
      if (session) {
        messages.value = [...session.messages];
      }
      // 使用 nextTick 确保在下一个 tick 重置标记
      await nextTick();
      isUpdatingFromStore = false;

      // 移除占位符助手消息（因为需要重置）
      const assistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageId);
      if (assistantMsgIndex >= 0) {
        messages.value.splice(assistantMsgIndex, 1);
      }

      // 重新发送用户消息（使用总结后的上下文）
      // 注意：这里不自动重新发送，让用户决定是否继续
      // 但我们可以显示一个提示消息
      const summaryMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `**会话已总结**\n\n由于达到 token 限制，之前的对话历史已自动总结。总结内容：\n\n${result.summary}\n\n您可以继续提问，我会基于总结内容继续对话。`,
        timestamp: Date.now(),
      };
      messages.value.push(summaryMessage);

      // 更新 store 中的消息历史
      // 使用保存的会话 ID，确保即使会话切换，消息也会保存到原始会话
      if (sessionId) {
        chatSessionsStore.updateSessionMessages(sessionId, messages.value);
      }

      // 清空操作列表
      currentMessageActions.value = [];
      return; // 提前返回，不继续处理
    }

    // 更新最终消息内容
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      // 如果 result.text 有内容，使用它（这会覆盖流式累积的内容，确保最终一致性）
      // 如果 result.text 为空但 msg.content 有内容（来自流式更新），保留流式内容
      // 如果两者都为空，显示错误提示
      if (result.text) {
        msg.content = result.text;
      } else if (!msg.content) {
        // 如果既没有流式内容也没有最终内容，可能是响应为空
        msg.content = '抱歉，我没有收到有效的回复。请重试。';
      }
      // 操作信息已经在 onAction 回调中立即添加了，这里不需要再次添加
      // 但我们需要确保操作数组存在（如果没有任何操作，保持为 undefined 或空数组）
      if (!msg.actions) {
        msg.actions = [];
      }
    }

      // 更新 store 中的消息历史（使用 UI 中的消息列表，它们已经包含了用户和助手消息）
      // 使用保存的会话 ID，确保即使会话切换，消息也会保存到原始会话
      if (sessionId) {
        chatSessionsStore.updateSessionMessages(sessionId, messages.value);
      }
    
    // 清空操作列表（消息完成后）
    currentMessageActions.value = [];
  } catch (error) {
    // 更新错误消息
    const msg = messages.value.find((m) => m.id === assistantMessageId);
    if (msg) {
      msg.content = `错误：${error instanceof Error ? error.message : '未知错误'}`;
      // 即使出错，也保存已记录的操作（如果有的话）
      if (currentMessageActions.value.length > 0) {
        msg.actions = [...currentMessageActions.value];
      }
    }
    
    // 保存错误消息到正确的会话（使用保存的会话 ID）
    if (sessionId && messages.value.length > 0) {
      chatSessionsStore.updateSessionMessages(sessionId, messages.value);
    }
    
    toast.add({
      severity: 'error',
      summary: '助手回复失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 5000,
    });
  } finally {
    isSending.value = false;
    currentTaskId.value = null;
    // 清空操作列表（无论成功还是失败）
    currentMessageActions.value = [];
    scrollToBottom();
    // 聚焦输入框
    focusInput();
  }
};

// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
};

// 清空聊天
const clearChat = () => {
  messages.value = [];
  chatSessionsStore.clearCurrentSession();
};

// 创建新会话
const createNewSession = () => {
  const context = contextStore.getContext;
  chatSessionsStore.createSession({
    bookId: context.currentBookId,
    chapterId: context.currentChapterId,
    paragraphId: context.hoveredParagraphId,
  });
  messages.value = [];
};

// 加载当前会话的消息
const loadCurrentSession = async () => {
  isUpdatingFromStore = true; // 标记正在从 store 更新
  const session = chatSessionsStore.currentSession;
  if (session) {
    messages.value = [...session.messages];
  } else {
    messages.value = [];
  }
  // 使用 nextTick 确保在下一个 tick 重置标记
  await nextTick();
  isUpdatingFromStore = false;
};

// 初始化会话
onMounted(() => {
  chatSessionsStore.loadSessions();
  if (!chatSessionsStore.currentSessionId) {
    // 如果没有当前会话，创建新会话
    createNewSession();
  } else {
    // 加载当前会话的消息
    loadCurrentSession();
  }
});

// 监听当前会话变化
watch(
  () => chatSessionsStore.currentSessionId,
  () => {
    loadCurrentSession();
  },
);

// 监听消息变化，同步到会话
// 使用 immediate: false 避免初始化时的同步
let isUpdatingFromStore = false; // 标记是否正在从 store 更新，避免循环
watch(
  () => messages.value,
  (newMessages) => {
    // 如果正在从 store 更新，跳过同步，避免循环
    if (isUpdatingFromStore) {
      return;
    }
    chatSessionsStore.updateCurrentSessionMessages(newMessages);
  },
  { deep: true },
);

// 监听上下文变化，更新会话上下文
watch(
  () => contextStore.getContext,
  (context) => {
    chatSessionsStore.updateCurrentSessionContext({
      bookId: context.currentBookId,
      chapterId: context.currentChapterId,
      paragraphId: context.hoveredParagraphId,
    });
  },
  { deep: true },
);

// 监听消息变化，自动滚动
watch(
  () => messages.value.length,
  () => {
    scrollToBottom();
  },
);

// 获取操作详细信息（用于 popover）
const getActionDetails = (action: MessageAction) => {
  const actionLabels: Record<MessageAction['type'], string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    web_search: '网络搜索',
    web_fetch: '网页获取',
  };
  const entityLabels: Record<MessageAction['entity'], string> = {
    term: '术语',
    character: '角色',
    web: '网络',
  };

  const details: {
    label: string;
    value: string;
  }[] = [
    {
      label: '操作类型',
      value: actionLabels[action.type],
    },
    {
      label: '实体类型',
      value: entityLabels[action.entity],
    },
  ];

  if (action.name) {
    details.push({
      label: '名称',
      value: action.name,
    });
  }

  // 尝试从当前书籍获取详细信息
  const currentBookId = contextStore.getContext.currentBookId;
  if (currentBookId && action.name) {
    const book = booksStore.getBookById(currentBookId);
    if (book) {
      if (action.entity === 'term') {
        const term = book.terminologies?.find((t) => t.name === action.name);
        if (term) {
          if (term.translation?.translation) {
            details.push({
              label: '翻译',
              value: term.translation.translation,
            });
          }
          if (term.description) {
            details.push({
              label: '描述',
              value: term.description,
            });
          }
          if (term.occurrences && term.occurrences.length > 0) {
            const totalOccurrences = term.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push({
              label: '出现次数',
              value: `${totalOccurrences} 次`,
            });
          }
        }
      } else if (action.entity === 'character') {
        const character = book.characterSettings?.find((c) => c.name === action.name);
        if (character) {
          if (character.translation?.translation) {
            details.push({
              label: '翻译',
              value: character.translation.translation,
            });
          }
          if (character.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            details.push({
              label: '性别',
              value: sexLabels[character.sex] || character.sex,
            });
          }
          if (character.description) {
            details.push({
              label: '描述',
              value: character.description,
            });
          }
          if (character.speakingStyle) {
            details.push({
              label: '说话口吻',
              value: character.speakingStyle,
            });
          }
          if (character.aliases && character.aliases.length > 0) {
            details.push({
              label: '别名',
              value: character.aliases.map((a) => a.name).join('、'),
            });
          }
          if (character.occurrences && character.occurrences.length > 0) {
            const totalOccurrences = character.occurrences.reduce((sum, occ) => sum + occ.count, 0);
            details.push({
              label: '出现次数',
              value: `${totalOccurrences} 次`,
            });
          }
        }
      }
    }
  }

  // 处理网络搜索操作
  if (action.type === 'web_search' && action.entity === 'web') {
    if (action.query) {
      details.push({
        label: '搜索查询',
        value: action.query,
      });
    }
  }

  // 处理网页获取操作
  if (action.type === 'web_fetch' && action.entity === 'web') {
    if (action.url) {
      details.push({
        label: '网页 URL',
        value: action.url,
      });
    }
  }

  details.push({
    label: '操作时间',
    value: new Date(action.timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  });

  return details;
};

// 切换操作详情 Popover
const toggleActionPopover = (event: Event, action: MessageAction, message: ChatMessage) => {
  const actionKey = `${message.id}-${action.timestamp}`;
  const popoverRef = actionPopoverRefs.value.get(actionKey);
  
  if (popoverRef) {
    hoveredAction.value = { action, message };
    popoverRef.toggle(event);
  }
};

// 处理 Popover 关闭
const handleActionPopoverHide = () => {
  hoveredAction.value = null;
};
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative overflow-hidden"
    :style="{ width: `${ui.rightPanelWidth}px` }"
  >
    <!-- Resize handle -->
    <div
      ref="resizeHandleRef"
      class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-500/30 transition-colors z-20"
      :class="{ 'bg-primary-500/50': isResizing }"
      @mousedown="handleResizeStart"
    />
    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-luna-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Header with new chat button -->
    <div class="shrink-0 px-4 pt-6 pb-4 relative z-10 flex items-center justify-between border-b border-white/10">
      <h2 class="text-sm font-semibold text-moon-100 uppercase tracking-wide">AI 助手</h2>
      <div class="flex items-center gap-2">
        <Button
          v-if="messages.length > 0"
          aria-label="清空聊天"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-trash"
          size="small"
          @click="clearChat"
        />
        <Button
          aria-label="新聊天"
          class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
          icon="pi pi-comments"
          size="small"
          @click="createNewSession"
        />
      </div>
    </div>

    <!-- Context info -->
    <div v-if="contextInfo !== '无上下文'" class="shrink-0 px-4 py-2 relative z-10 border-b border-white/10">
      <p class="text-xs text-moon-50">{{ contextInfo }}</p>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-2 min-h-0 min-w-0 relative z-10 messages-container"
    >
      <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-center">
        <i class="pi pi-comments text-4xl text-moon-40 mb-4" />
        <p class="text-sm text-moon-60 mb-2">开始与 AI 助手对话</p>
        <p class="text-xs text-moon-40">助手可以帮你管理术语、角色设定，并提供翻译建议</p>
      </div>
      <div v-else class="flex flex-col gap-4 w-full">
        <div
          v-for="message in messages"
          :key="message.id"
          class="flex flex-col gap-2 w-full"
          :class="message.role === 'user' ? 'items-end' : 'items-start'"
        >
          <div
            class="rounded-lg px-3 py-2 max-w-[85%] min-w-0"
            :class="
              message.role === 'user'
                ? 'bg-primary-500/20 text-primary-100'
                : 'bg-white/5 text-moon-90'
            "
          >
            <!-- 操作结果高亮显示 -->
            <div v-if="message.actions && message.actions.length > 0" class="mb-2 space-y-1 flex flex-wrap gap-1">
              <template v-for="(action, idx) in message.actions" :key="idx">
                <div
                  :id="`action-${message.id}-${action.timestamp}`"
                  class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help"
                  :class="{
                    'bg-green-500/25 text-green-200 border border-green-500/40 shadow-lg shadow-green-500/20 hover:bg-green-500/35': action.type === 'create',
                    'bg-blue-500/25 text-blue-200 border border-blue-500/40 shadow-lg shadow-blue-500/20 hover:bg-blue-500/35': action.type === 'update',
                    'bg-red-500/25 text-red-200 border border-red-500/40 shadow-lg shadow-red-500/20 hover:bg-red-500/35': action.type === 'delete',
                    'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-lg shadow-purple-500/20 hover:bg-purple-500/35': action.type === 'web_search',
                    'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 shadow-lg shadow-cyan-500/20 hover:bg-cyan-500/35': action.type === 'web_fetch',
                  }"
                  @mouseenter="(e) => toggleActionPopover(e, action, message)"
                >
                  <i
                    class="text-sm"
                    :class="{
                      'pi pi-plus-circle': action.type === 'create',
                      'pi pi-pencil': action.type === 'update',
                      'pi pi-trash': action.type === 'delete',
                      'pi pi-search': action.type === 'web_search',
                      'pi pi-link': action.type === 'web_fetch',
                    }"
                  />
                  <span>
                    {{
                      action.type === 'create'
                        ? '创建'
                        : action.type === 'update'
                          ? '更新'
                          : action.type === 'delete'
                            ? '删除'
                            : action.type === 'web_search'
                              ? '网络搜索'
                              : action.type === 'web_fetch'
                                ? '网页获取'
                                : ''
                    }}
                    {{
                      action.entity === 'term'
                        ? '术语'
                        : action.entity === 'character'
                          ? '角色'
                          : action.entity === 'web'
                            ? '网络'
                            : ''
                    }}
                    <span v-if="action.name" class="font-semibold">"{{ action.name }}"</span>
                    <span v-else-if="action.query" class="font-semibold">"{{ action.query }}"</span>
                    <span v-else-if="action.url" class="font-semibold text-xs">{{ action.url }}</span>
                  </span>
                </div>
                <!-- Action Details Popover -->
                <Popover
                  :ref="(el) => {
                    const actionKey = `${message.id}-${action.timestamp}`;
                    if (el) {
                      actionPopoverRefs.set(actionKey, el as InstanceType<typeof Popover>);
                    }
                  }"
                  :target="`action-${message.id}-${action.timestamp}`"
                  :dismissable="true"
                  :show-close-icon="false"
                  style="width: 18rem; max-width: 90vw"
                  class="action-popover"
                  @hide="handleActionPopoverHide"
                >
                  <div v-if="hoveredAction && hoveredAction.action.timestamp === action.timestamp && hoveredAction.message.id === message.id" class="action-popover-content">
                    <div class="popover-header">
                      <span class="popover-title">
                        {{
                          action.type === 'create'
                            ? '创建'
                            : action.type === 'update'
                              ? '更新'
                              : action.type === 'delete'
                                ? '删除'
                                : action.type === 'web_search'
                                  ? '网络搜索'
                                  : action.type === 'web_fetch'
                                    ? '网页获取'
                                    : ''
                        }}
                        {{
                          action.entity === 'term'
                            ? '术语'
                            : action.entity === 'character'
                              ? '角色'
                              : action.entity === 'web'
                                ? '网络'
                                : ''
                        }}
                      </span>
                    </div>
                    <div class="popover-details">
                      <div
                        v-for="(detail, detailIdx) in getActionDetails(action)"
                        :key="detailIdx"
                        class="popover-detail-item"
                      >
                        <span class="popover-detail-label">{{ detail.label }}：</span>
                        <span class="popover-detail-value">{{ detail.value }}</span>
                      </div>
                    </div>
                  </div>
                </Popover>
              </template>
            </div>
            <div
              class="text-sm break-words overflow-wrap-anywhere markdown-content"
              v-html="renderMarkdown(message.content || '思考中...')"
            ></div>
          </div>
          <span class="text-xs text-moon-40">
            {{ new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Input area -->
    <div class="shrink-0 px-4 py-3 border-t border-white/10 relative z-10 bg-night-950/50 min-w-0">
      <div class="flex flex-col gap-2 w-full min-w-0">
        <Textarea
          ref="inputRef"
          v-model="inputMessage"
          :disabled="isSending || !assistantModel"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          class="w-full resize-none min-w-0"
          :auto-resize="true"
          rows="3"
          @keydown="handleKeydown"
        />
        <div class="flex items-center justify-between">
          <span v-if="!assistantModel" class="text-xs text-moon-50">未配置助手模型</span>
          <span v-else class="text-xs text-moon-50">{{ assistantModel.name || assistantModel.id }}</span>
          <Button
            :disabled="!inputMessage.trim() || isSending || !assistantModel"
            label="发送"
            icon="pi pi-send"
            size="small"
            @click="sendMessage"
          />
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Resize handle styles */
.resize-handle {
  user-select: none;
  -webkit-user-select: none;
}

/* 消息容器样式 - 防止水平滚动 */
.messages-container {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 确保所有文本元素都能正确换行 */
.messages-container p {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

/* 消息气泡容器 */
.messages-container > div {
  width: 100%;
  min-width: 0;
}

/* 自定义滚动条样式 */
:deep(.p-textarea) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
}

:deep(.p-textarea:focus) {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.2rem rgba(var(--primary-rgb), 0.1);
}

:deep(.p-textarea::placeholder) {
  color: var(--moon-opacity-50);
}

/* 消息容器滚动条 */
.messages-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

/* Markdown 内容样式 */
.markdown-content {
  line-height: 1.6;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: inherit;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.125em 0.25em;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.75em;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.75em 0;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(li) {
  margin: 0.25em 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 1em;
  margin: 0.75em 0;
  opacity: 0.8;
}

.markdown-content :deep(a) {
  color: var(--primary-400);
  text-decoration: underline;
}

.markdown-content :deep(a:hover) {
  color: var(--primary-300);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-weight: 600;
  margin: 0.75em 0 0.5em 0;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child),
.markdown-content :deep(h4:first-child),
.markdown-content :deep(h5:first-child),
.markdown-content :deep(h6:first-child) {
  margin-top: 0;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 1em 0;
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Action Popover 样式 */
:deep(.action-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.action-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.popover-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.popover-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}

.popover-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.popover-detail-label {
  color: var(--moon-opacity-70);
  font-weight: 500;
}

.popover-detail-value {
  color: var(--moon-opacity-90);
  word-break: break-word;
  line-height: 1.5;
}
</style>

