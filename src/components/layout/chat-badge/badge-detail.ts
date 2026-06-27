import type { MessageAction } from 'src/stores/chat-sessions';

/**
 * 带扩展属性的 MessageAction —— 部分 action 在运行时携带这些字段，
 * 原 ChatActionBadge 通过类型断言访问。子组件复用同一份断言类型。
 */
export type MessageActionExt = MessageAction & {
  replaced_paragraph_count?: number;
  replaced_translation_count?: number;
  old_translation?: string;
  new_translation?: string;
  old_title?: string;
  new_title?: string;
  translation_keywords?: string[];
};

/**
 * 各 ChatBadge* 子组件共享的 props 契约。父级 ChatActionBadge 按分派结果
 * 把 kind、原始 action、断言后的 extAction 及三个工具函数透传下来。
 */
export interface BadgeDetailProps {
  kind: string;
  action: MessageAction;
  extAction: MessageActionExt;
  getShortId: (value: string | undefined, length?: number) => string;
  getTextPreview: (value: string | undefined, maxLength?: number) => string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
}
