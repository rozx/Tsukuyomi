export default {
  aiWorkflow: {
    postOutput:
      'Done. {reminder}To revise existing output, return to working and submit only changed paragraphs. Otherwise finish according to the workflow.',
    planning: {
      '1': 'Confirm characters, terminology, and memories already in context; query tools only for missing or inaccurate information.',
      '2': 'Check surrounding paragraphs, chapters, or earlier events when needed.',
      '3': 'Confirm character voices and forms of address for the actual source; Japanese honorific rules apply only to Japanese passages.',
      '4': 'Confirm the target language strategy, consistent proper names, formatting, and paragraph correspondence.',
      '5': 'Create or update terminology, characters, and memories when needed. Prefer updating an existing memory to creating another.',
    },
    brief: {
      '1': 'Confirm continuity with the preceding part; inspect nearby paragraphs when needed.',
      '2': 'Add new terminology, characters, or memories introduced here; mark done when there are no additions.',
    },
    review: {
      '1': 'Check fidelity and consistency of names, pronouns, tone, character voices, and applicable honorifics.',
      '2': 'Correct affected paragraphs directly with add_translation_batch.',
      '3': 'Update terminology, characters, and memories for new, missing, or inaccurate information.',
    },
    title: 'Translate chapter title: {title}',
    batch: 'Process paragraph batch {index}/{total} ({count} paragraphs):\n{lines}',
    all: 'Process all paragraphs ({count} paragraphs):\n{lines}',
    header: '\n[Todo list]\n',
    current: '\nCurrent task: {text} — call mark_todo_done when finished.\n',
    complete: '\nAll todos are complete. Proceed to the next stage.\n',
    incomplete: 'Complete all todos before proceeding to the next stage.\n',
    reminder: '\n[Todo reminder]\n',
    workingReminder: 'Current item: {text}\nCall mark_todo_done when finished.\n',
    pendingReminder:
      '{count} todos remain.\nCall mark_todo_done when finished; use ids for a batch.\n',
  },
};
