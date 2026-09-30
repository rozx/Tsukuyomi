import importErrors from './import-errors';
import helpFeedback from './help-feedback';
import paragraphFeedback from './paragraph-feedback';
import batchFeedback from './batch-feedback';
export default {
  ...importErrors,
  ...helpFeedback,
  ...paragraphFeedback,
  ...batchFeedback,
  aiToolFeedback: {
    toolPairIdentity: 'Tool result identity does not match',
    toolPairMissing: 'The tool returned neither a result nor a pause reason',
    toolNotAllowed: 'The tool is not allowed in this execution profile',
    incompleteCallJson: 'Tool arguments are not complete JSON',
    incompleteCallObject: 'Tool arguments must be an object',
    unknownTool: 'Unknown tool: {tool}',
    unknownError: 'Unknown error',
    truncated:
      'Tool arguments appear truncated, possibly by the output token limit. Reduce the content submitted in one call, such as the batch paragraph count, and retry.',
    parseFailed: 'Cannot parse tool arguments: {detail}',
  },
};
