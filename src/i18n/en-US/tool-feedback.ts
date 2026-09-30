import helpFeedback from './help-feedback';
import paragraphFeedback from './paragraph-feedback';
import batchFeedback from './batch-feedback';
export default {
  ...helpFeedback,
  ...paragraphFeedback,
  ...batchFeedback,
  aiToolFeedback: {
    unknownTool: 'Unknown tool: {tool}',
    unknownError: 'Unknown error',
    truncated:
      'Tool arguments appear truncated, possibly by the output token limit. Reduce the content submitted in one call, such as the batch paragraph count, and retry.',
    parseFailed: 'Cannot parse tool arguments: {detail}',
  },
};
