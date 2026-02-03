/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
}
