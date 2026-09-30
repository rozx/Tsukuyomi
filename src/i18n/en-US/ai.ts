export default {
  aiValidation: {
    sourceKept:
      'Paragraph {id} was submitted unchanged. Content already in the target language may remain as written; no artificial rewriting is needed.',
  },
  aiTasks: {
    explain:
      'Briefly explain this text in English: its meaning, grammar, cultural context, and relationship to the current book. Detect its source language and handle mixed languages as needed:\n\n{text}',
    term: {
      base: 'You translate fiction. Detect the source language of each paragraph and translate terms into natural, accurate {targetLanguage}. Preserve content that already matches the target language. Treat Simplified and Traditional Chinese as distinct targets.\n\n',
      rules:
        'Rules:\n1. Use the target language terminology and character records to keep names consistent.\n2. Interpret terms using the book, chapter, and source context. Preserve the source format and structure.\n3. Translate every word that needs conversion. Content already in the target language, proper nouns, and symbols may remain unchanged. Handle mixed languages as needed.\n4. Return only JSON with t containing the translation. Add no explanation or code fence. Example: {example}\n\n',
      user: 'Translate these terms into {targetLanguage}. Detect the source language and preserve the format and structure. Return only JSON with t containing the translation; add no explanation or code fence. Example: {example}\n\nTerms to translate:\n\n{text}{relatedContextInfo}',
      retry:
        'The response format is invalid. Return only JSON with t containing the translation. Add no explanation or code fence. Example: {example}',
      example: 'Translated text',
      related: '\n\nRelated information matched from the current book:\n',
      characters: 'Characters:\n{details}\n',
      terms: 'Related terms:\n{details}\n',
      sex: 'Gender: {value}',
      description: 'Description: {value}',
      speakingStyle: 'Speaking style: {value}',
      male: 'Male',
      female: 'Female',
      other: 'Other',
      unset: 'Not set',
      none: 'None',
    },
    context: { aliases: 'Aliases: {aliases}' },
  },
};
