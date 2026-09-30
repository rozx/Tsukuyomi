export default {
  aiState: {
    labels: {
      translation: 'translation',
      polish: 'polishing',
      proofreading: 'proofreading',
      assistant: 'assistant',
      termsTranslation: 'term translation',
    },
    planning:
      'Current state: planning. Terminology, characters, and memories in context are current. Check the todos and query only missing information. This is the only data maintenance window before output: create or update terminology, characters, and memories here. Do not submit {task} results. Complete all todos, then call {transition}.',
    brief:
      'Current state: brief planning. Reuse the preceding planning context and add only currently needed information or data. Complete all todos, then call {transition}.',
    working:
      'Current state: {task} (working). {focus}Do not create or update terminology, characters, or memories here; maintain them in {maintenance}. Submit with add_translation_batch, at most {max} paragraphs per call. {changed}Complete each batch in todo order, mark done, then call {transition}.',
    focusTranslation:
      'Keep source and output paragraphs in a 1:1 correspondence. Handle forms of address and applicable honorifics according to the actual source. ',
    focusPolish: 'Improve tone, natural target language expression, and rhythm. ',
    focusProofread:
      'Check text, punctuation, grammar, content consistency, logic, and formatting. ',
    changed: 'Return only changed paragraphs. Polishing and proofreading have no review stage. ',
    review:
      'Current state: review. Check each todo and correct with add_translation_batch. You may update terminology, characters, and memories. Complete all todos, then call {transition}.',
    end: 'Current state: end. {next}The task is finished. Do not call tools or output further content; end this execution.',
    next: 'This chunk is complete; the system will provide the next chunk. ',
    last: 'All content is processed; this is the final chunk. ',
    planningLoop:
      'Planning has stalled. Enter the {task} output stage now by calling {transition}; do not remain in planning.',
    planningContinue:
      'When required information and data maintenance are ready, call {transition}. If information is still missing, query it first.',
    briefContinue:
      'Reuse preceding terminology, characters, and memories. Call only currently needed tools. Inspect adjacent paragraphs when necessary, handle forms of address for the actual source, then enter working.',
    workingLoop:
      'Working has stalled without output. Submit {task} results now with add_translation_batch and paragraph_id, at most {max} paragraphs per call. {changed}',
    noChanges:
      'If no paragraphs need changes, finish with {transition}; otherwise submit only changed paragraphs.',
    finished:
      'All paragraph {task} results are complete. If no further work is needed, call {transition}. {note}',
    noReview: 'Polishing and proofreading must finish with end, without review.',
    continue: 'Continue {task}, then finish with {transition}.',
    missing:
      '{count} paragraphs lack {task} results, paragraph_id: {ids}. Complete them with add_translation_batch, at most {max} paragraphs per call. Fix only missing items; never reorder paragraphs or guess IDs.',
    reviewLoop:
      'Review has stalled. Correct with add_translation_batch when necessary, or finish now with {transition}.',
    restricted:
      'State {status} forbids data writes with {tool}. Maintain terminology, characters, and memories only in {stages}; never write after end.',
    unauthorized:
      'Tool {tool} is absent from this tools list and must not be called. Continue {task} with available tools or context.',
    limit:
      'Tool {tool} reached its call limit of {limit}. Continue using the information already obtained.',
    repeated:
      'This tool result is already in the planning context. Do not repeat the call for later chunks.',
    gate: 'Cannot enter {status}: {count} todos remain incomplete.\n{items}\nComplete them before changing state.',
    invalidTransition: 'Transition {previous} → {next} is invalid. Follow the task workflow.',
  },
};
