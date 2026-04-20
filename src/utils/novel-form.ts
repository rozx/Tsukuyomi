import type { Novel } from 'src/models/novel';

/**
 * 从 BookDialog 的 `Partial<Novel>` 表单数据构造书籍更新对象。
 * - 仅传入非空的可选字段（空字符串/空数组视为"未填"，不写回）
 * - `title` 来自表单，调用方负责校验非空
 * - `lastEdited` 总是刷新为当前时间
 */
export function buildNovelUpdatesFromFormData(formData: Partial<Novel>): Partial<Novel> {
  const updates: Partial<Novel> = {
    title: formData.title!,
    lastEdited: new Date(),
  };
  if (formData.alternateTitles && formData.alternateTitles.length > 0) {
    updates.alternateTitles = formData.alternateTitles;
  }
  if (formData.author?.trim()) updates.author = formData.author.trim();
  if (formData.description?.trim()) updates.description = formData.description.trim();
  if (formData.tags && formData.tags.length > 0) updates.tags = formData.tags;
  if (formData.webUrl && formData.webUrl.length > 0) updates.webUrl = formData.webUrl;
  if (formData.cover !== undefined) updates.cover = formData.cover;
  if (formData.volumes !== undefined) updates.volumes = formData.volumes;
  if (formData.translationInstructions !== undefined) {
    updates.translationInstructions = formData.translationInstructions;
  }
  if (formData.polishInstructions !== undefined) {
    updates.polishInstructions = formData.polishInstructions;
  }
  if (formData.proofreadingInstructions !== undefined) {
    updates.proofreadingInstructions = formData.proofreadingInstructions;
  }
  return updates;
}
