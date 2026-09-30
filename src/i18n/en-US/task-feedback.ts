export default {
  aiTaskFeedback: {
    idSummary: '{head}... ({count} total)',
    preparing: 'preparing is merged into planning; move directly to working',
    translationReview: 'Translation must enter review before ending',
    polishReview: 'Polishing does not support review',
    proofreadReview: 'Proofreading does not support review',
    invalidTransition: 'Invalid transition: {previous} → {next}',
    initial: 'The initial status must be planning',
    unknownType: 'Unknown task type: {type}',
    storeMissing: 'AI processing store is not initialized',
    taskMissingId: 'Task ID is required',
    taskMissing: 'Task not found: {id}',
    invalidStatus: 'Invalid task status "{status}"; valid values: {valid}',
    validationFailed: 'Status transition validation failed',
    missingChunk:
      'Cannot enter review: {count} nonempty chunk paragraphs lack translations (ID: {ids})',
    missingUninitialized:
      'Cannot enter review: local chapter content is uninitialized and {count} chunk paragraphs have not been submitted. They may include empty paragraphs; continue manually only if all are confirmed empty (ID: {ids})',
    missingDatabase:
      'Cannot enter review: {count} nonempty paragraphs in {scope} lack translations (ID: {ids})',
    chunk: 'the current chunk',
    chapter: 'the full chapter',
    missingScope:
      'Cannot enter review: the task has no {scope} association; translation completeness cannot be checked',
    bookAssociation: 'book',
    chapterAssociation: 'chapter',
    missingTitle: 'Cannot enter review: the chapter title has not been translated',
    reviewFailed: 'Completeness check failed: {detail}',
    initialLabel: 'initial',
    changed: 'Task status updated: {previous} → {next}',
    actionName: 'Task status change: {previous} → {next}',
    updateFailed: 'Status update failed: {detail}',
    unknownError: 'Unknown error',
  },
};
