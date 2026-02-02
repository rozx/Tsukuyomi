# Memory 附件说明

本文档说明 Memory 附件（`attachedTo`）的用途、使用方式与迁移注意事项。

## 1. Memory 模型更新

Memory 现在支持显式关联实体（书籍/角色/术语/章节）：

```ts
export type MemoryAttachmentType = 'book' | 'character' | 'term' | 'chapter';

export interface MemoryAttachment {
  type: MemoryAttachmentType;
  id: string;
}

export interface Memory {
  id: string;
  bookId: string;
  content: string;
  summary: string;
  attachedTo: MemoryAttachment[];
  createdAt: number;
  lastAccessedAt: number;
}
```

## 2. MemoryService 新增能力

新增查询方法：

- `getMemoriesByAttachment(bookId, attachment)`：按单个附件查询
- `getMemoriesByAttachments(bookId, attachments)`：按多个附件 OR 查询并去重

创建/更新时支持 `attachedTo`，未提供时默认附加到 `{ type: 'book', id: bookId }`。

## 3. 迁移指南

- 旧数据没有 `attachedTo` 时会自动补默认书籍附件（兼容旧数据）。
- 若发现旧记忆缺少附件，可用 `update_memory` 替换附件并补齐关联。

## 4. AI 工具更新

### create_memory

新增可选参数 `attached_to`：

```json
{
  "content": "角色背景要点...",
  "summary": "田中太郎：贵族出身",
  "attached_to": [{ "type": "character", "id": "char_001" }]
}
```

### update_memory

可用 `attached_to` 修复缺失/错误附件：

```json
{
  "memory_id": "m1",
  "content": "更新后的内容...",
  "summary": "更新后的摘要",
  "attached_to": [{ "type": "term", "id": "term_001" }]
}
```

### 实体工具的混合检索

实体工具（如 `get_character`、`get_term`、`get_chapter_info`）会同时：

1. 查附件记忆（优先）
2. 查关键词记忆（兜底）

最终合并去重，避免旧记忆丢失。

## 5. 结构化记忆示例

### 角色背景

```json
{
  "summary": "田中太郎：贵族出身，擅长剑术",
  "content": "- 贵族长子\n- 对妹妹很保护\n- 主武器为长剑",
  "attached_to": [{ "type": "character", "id": "char_001" }]
}
```

### 术语定义

```json
{
  "summary": "魔导炉：为城镇供能的核心装置",
  "content": "- 位于中央塔\n- 每隔三年检修一次",
  "attached_to": [{ "type": "term", "id": "term_001" }]
}
```

### 章节摘要

```json
{
  "summary": "第5章：主角与师匠首次对决",
  "content": "- 战斗发生在训练场\n- 结果以平手告终",
  "attached_to": [{ "type": "chapter", "id": "chap_005" }]
}
```

### 书籍级设定

```json
{
  "summary": "世界观：魔法以契约为核心",
  "content": "- 魔力来源于契约\n- 违约会导致记忆消失",
  "attached_to": [{ "type": "book", "id": "book_001" }]
}
```
