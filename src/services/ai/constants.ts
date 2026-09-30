export const MAX_TRANSLATION_BATCH_SIZE = 10;
/** 提交校验与工具描述共用上限，避免文案和实际允许数量漂移。 */
export const TRANSLATION_BATCH_LIMITS = Object.freeze({
  normal: MAX_TRANSLATION_BATCH_SIZE,
  withTolerance: Math.ceil(MAX_TRANSLATION_BATCH_SIZE * 1.1),
  remaining: MAX_TRANSLATION_BATCH_SIZE * 2,
});
