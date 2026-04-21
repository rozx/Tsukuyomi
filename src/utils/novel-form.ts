import type { Novel } from 'src/models/novel';
import { v4 as uuidv4 } from 'uuid';

/**
 * 从 BookDialog 的 `Partial<Novel>` 表单数据构造新增书籍对象（含自生成 UUID 和时间戳）。
 * - 仅写入非空可选字段（空字符串/空数组视为"未填"）
 * - `title` 来自表单，调用方负责校验非空
 */
export function buildNovelFromFormData(formData: Partial<Novel>): Novel {
  const now = new Date();
  return {
    id: uuidv4(),
    title: formData.title!,
    ...(formData.alternateTitles && formData.alternateTitles.length > 0
      ? { alternateTitles: formData.alternateTitles }
      : {}),
    ...(formData.author?.trim() ? { author: formData.author.trim() } : {}),
    ...(formData.description?.trim() ? { description: formData.description.trim() } : {}),
    ...(formData.tags && formData.tags.length > 0 ? { tags: formData.tags } : {}),
    ...(formData.webUrl && formData.webUrl.length > 0 ? { webUrl: formData.webUrl } : {}),
    ...(formData.cover ? { cover: formData.cover } : {}),
    ...(formData.volumes && formData.volumes.length > 0 ? { volumes: formData.volumes } : {}),
    ...(formData.translationInstructions !== undefined
      ? { translationInstructions: formData.translationInstructions }
      : {}),
    ...(formData.polishInstructions !== undefined
      ? { polishInstructions: formData.polishInstructions }
      : {}),
    ...(formData.proofreadingInstructions !== undefined
      ? { proofreadingInstructions: formData.proofreadingInstructions }
      : {}),
    createdAt: now,
    lastEdited: now,
  };
}

/**
 * 从 BookDialog 的 `Partial<Novel>` 表单数据构造书籍更新对象。
 * 区分"未在表单里提供"（保持现状）与"用户显式清空"（写空值），
 * 后者允许用户在编辑时清除作者 / 描述 / 标签 / 网址 / 别名等字段。
 * - `title` 来自表单，调用方负责校验非空
 * - `lastEdited` 总是刷新为当前时间
 */
export function buildNovelUpdatesFromFormData(formData: Partial<Novel>): Partial<Novel> {
  const updates: Partial<Novel> = {
    title: formData.title!,
    lastEdited: new Date(),
  };
  if (formData.alternateTitles !== undefined) {
    updates.alternateTitles = formData.alternateTitles;
  }
  if (formData.author !== undefined) updates.author = formData.author.trim();
  if (formData.description !== undefined) updates.description = formData.description.trim();
  if (formData.tags !== undefined) updates.tags = formData.tags;
  if (formData.webUrl !== undefined) updates.webUrl = formData.webUrl;
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
