export default {
  aiContext: {
    heading: '[{label}]',
    original: 'Original',
    translation: 'Translation',
    terms: 'Terms',
    characters: 'Characters',
    memories: 'Related memories',
    book: 'Book information',
    title: '**Title**',
    description: '**Description**',
    tags: '**Tags**',
    truncated: '...(truncated)',
    skipAsk: 'Skip AI questions enabled: yes; do not call ask_user or ask_user_batch.',
    chapter: 'Current chapter',
    chapterId: 'Chapter ID',
    chapterTitle: 'Chapter title',
    previousTitle: 'Previous chapter title',
    previous: 'Previous context',
    special: 'Special instructions (user content)',
    previousParagraphs: 'Previous paragraphs',
    nextParagraphs: 'Next paragraphs',
    chapterCharacters: 'Characters in this chapter',
    relatedTerms: 'Related terms',
    entities: 'Terms and characters in this chunk',
    fresh: 'These records are current; no need to fetch them again just to verify freshness.',
    contextReminder:
      'Reference context may be queried with tools. Never submit tool-returned context as {task} output.',
    start:
      '[Starting position]\nParagraph ID: {id}\nEarlier paragraphs exist. Query get_previous_paragraphs with this paragraph_id if needed, for reference only; never submit that context as {task} output.',
    first:
      'Start {task} in planning. Complete todos in order.\n\n{status}{title}{context}{start}\n\n[Chunk {index}/{total}]\n{count}\n\n{text}{maintenance}{reminder}',
    subsequent:
      'Continue {task}, chunk {index}/{total}, in planning.\n{context}{start}\n\n{status}\n{reference}\n\n[Task content]\n{count}\n\n{text}{maintenance}',
    reference: 'Use the target language names in the current records.',
    titleInstruction:
      '\n\nTranslate the current chapter title with update_chapter_title during working: {title}',
    count:
      'This chunk contains {count} paragraphs; empty paragraphs are excluded. [index] is the original one-based chapter position and may skip numbers. It is for reading only. Submit paragraph_id from [ID: ...].',
    maintenance: '\nEmpty paragraphs are excluded; do not output or restore them.',
    changedMaintenance:
      '\nEmpty paragraphs are excluded. Return only changed paragraphs; finish if none need changes.',
    paragraph: '[{index}] [ID: {id}] Original: {original}\nTranslation: {translation}\n\n',
    surrounding: '[ID: {id}] Original: {original}{translation}',
    translationLine: '\n  Translation: {translation}',
  },
};
