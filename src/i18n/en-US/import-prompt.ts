export default {
  aiImportPrompt: {
    novelQuestion:
      'Several works were found or the novel scope changed. Choose the single novel for this import.',
    contextLimit:
      'The context limit was reached. Progress is saved; continue organizing or reduce the current scope.',
    toolLimit:
      'The tool turn limit was reached. Remaining calls are saved and execution can continue.',
    ownerStale: 'The import execution has been replaced',
    continue:
      'Continue organizing the current sources and draft, then produce an import plan the user can inspect.',
    taskMissing: 'Import task not found',
    lockUnavailable: 'This environment cannot coordinate import execution',
    modelUnavailable: 'Select an available assistant model first',
    busy: 'Another import task is running; pause it first',
    questionPending: "Complete the current task's necessary choices first",
    ownerBusy: 'The current task still has an unfinished execution',
    recovered:
      'The previous execution was interrupted by closing or refreshing the page. Saved progress can be resumed.',
    runStale: 'Execution has stopped',
    credentialsHidden: '[credentials hidden]',
    compactNoConversation: 'There is no conversation to compress, or tool calls remain unfinished',
    compactNoSafePart: 'The current history contains no part that can be compressed safely',
    compactStale: 'The conversation changed during compression. Please retry.',
    recipeMissingReason: 'This book does not have an update recipe yet',
    recipeReplayFailed: 'Recipe replay failed',
    recipeName: 'Repair update recipe: {title}',
    recipePrefill:
      "This book's update recipe needs repair: {reason}. Inspect catalog sources and chapter pages and build a recipe that passes replay self-tests. If there are no new chapters, submit recipe changes only.",
  },
};
