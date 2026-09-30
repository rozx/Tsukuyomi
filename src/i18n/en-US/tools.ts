export default {
  aiTools: {
    create_term:
      'Create a terminology record for a work-specific, contextual, or specially handled term. Do not create records for ordinary vocabulary or fixed dictionary translations. If the source and target spelling are identical, create a record only when the work gives it a special contextual meaning. Each term must have one target translation.',
    create_term__parameters__properties__name: 'Term source name in any language.',
    create_term__parameters__properties__translation:
      'One target language translation. Choose the most appropriate wording, not several alternatives.',
    create_term__parameters__properties__description:
      'Optional concise description; include important information only.',
    get_term:
      'Get a term by name. If exact matching fails, search source names and target translations with fuzzy/partial matching and return relevant candidates. Query get_term or search_terms_by_keywords before search_memories; consult memories only when no record is found.',
    get_term__parameters__properties__name: 'Term source name in any language.',
    get_term__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    update_term:
      'Update a term translation or description. When a translation needs correction, use this tool to fix the record rather than merely describing the problem. A target term has one translation, not several alternatives.',
    update_term__parameters__properties__term_id: 'Term ID from get_term or list_terms.',
    update_term__parameters__properties__translation:
      'New single target language translation (optional). Replace multiple alternatives with one choice; an empty string clears the target translation.',
    update_term__parameters__properties__description:
      'New concise description (optional); an empty string removes the description.',
    delete_term: 'Delete a term that is no longer needed.',
    delete_term__parameters__properties__term_id: 'Term ID from get_term or list_terms.',
    list_terms:
      'List terms used in chapter_id, or all terms when all_chapters=true. If chapter_id is absent and all_chapters=false, return all terms. all_chapters=true ignores chapter_id. Use the results to maintain translation consistency.',
    list_terms__parameters__properties__chapter_id:
      'Optional chapter ID; return terms appearing there. If omitted and all_chapters=false, return all terms.',
    list_terms__parameters__properties__all_chapters:
      'Return terms from all chapters (default false); when true, ignore chapter_id.',
    list_terms__parameters__properties__limit:
      'Optional maximum number of terms; by default return all.',
    search_terms_by_keywords:
      'Search source term names or target translations using keyword OR matching. translation_only returns only terms with a target translation. Query this database or get_term before searching memories for term information.',
    search_terms_by_keywords__parameters__properties__keywords:
      'Keyword array; return terms matching any keyword.',
    search_terms_by_keywords__parameters__properties__translation_only:
      'Return only terms with a target language translation (default false).',
    search_terms_by_keywords__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_occurrences_by_keywords:
      'Count the supplied keywords in each chapter of the book to inspect their distribution, frequency, and context.',
    get_occurrences_by_keywords__parameters__properties__keywords: 'One or more keywords.',
    create_character:
      'Create a character record. First use list_characters or get_character to check whether the name is already a character or an existing alias. For an existing character alias, use update_character rather than creating a duplicate. A name already used as another primary character name causes the operation to fail.',
    create_character__parameters__properties__name:
      'Character source name in any language. Use the known full name rather than surname/given name alone; do not invent unknown name parts.',
    create_character__parameters__properties__translation:
      'Translation of the full character name in the execution target language.',
    create_character__parameters__properties__sex: 'Character gender (optional).',
    create_character__parameters__properties__description:
      'Optional concise character description with important information only.',
    create_character__parameters__properties__speaking_style:
      'Optional speaking style, such as rough, archaic, or characteristic verbal habits.',
    create_character__parameters__properties__aliases__items__properties__id:
      'Stable ID of an existing alias; retain it when renaming. Omit for a new alias.',
    create_character__parameters__properties__aliases__items__properties__name:
      'Source alias in any language, usually a known surname or given name.',
    create_character__parameters__properties__aliases__items__properties__translation:
      'Alias translation in the execution target language; missing translations remain blank.',
    create_character__parameters__properties__aliases:
      'Optional aliases, including known surname/given-name parts of the full name. Honorific aliases must not be generated automatically.',
    get_character:
      'Get a character by name. If exact matching fails, search source names, target translations, and recorded aliases with fuzzy/partial matching. Query get_character or search_characters_by_keywords before searching memories for character information.',
    get_character__parameters__properties__name: 'Character source name in any language.',
    get_character__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    update_character:
      'Update character name, translation, description, gender, speaking style, or aliases. Correct the record when an error is found rather than merely describing it. Supply only aliases belonging to this character, and check list_characters/get_character before updating. Aliases that belong to another primary name or alias are silently skipped; they are not added and do not cause an exception.',
    update_character__parameters__properties__character_id:
      'Character ID from get_character or list_characters.',
    update_character__parameters__properties__name:
      'New source name (optional); use the known full name and do not invent unknown parts.',
    update_character__parameters__properties__translation:
      'New target translation (optional); an explicit empty string clears it.',
    update_character__parameters__properties__sex: 'New gender (optional).',
    update_character__parameters__properties__description:
      'New concise description (optional); an empty string removes it.',
    update_character__parameters__properties__speaking_style:
      'New speaking style (optional); an empty string clears it.',
    update_character__parameters__properties__aliases__items__properties__id:
      'Stable ID of an existing alias; retain it when renaming. Omit for a new alias.',
    update_character__parameters__properties__aliases__items__properties__name:
      'Source alias in any language.',
    update_character__parameters__properties__aliases__items__properties__translation:
      'Alias translation in the execution target language; missing translations remain blank.',
    update_character__parameters__properties__aliases:
      'Optional replacement alias array. Preserve stable IDs of existing aliases. Include only this character’s aliases and check list_characters for conflicts. Conflicting aliases are silently skipped and will not appear in the result.',
    delete_character: 'Delete a character record that is no longer needed.',
    delete_character__parameters__properties__character_id:
      'Character ID from get_character or list_characters.',
    search_characters_by_keywords:
      'Search character source names, aliases, or target translations using keyword OR matching. translation_only returns only characters with a target translation. Query this database or get_character before searching memories for character information.',
    search_characters_by_keywords__parameters__properties__keywords:
      'Keyword array; return characters matching any keyword.',
    search_characters_by_keywords__parameters__properties__translation_only:
      'Return only characters with a target language translation (default false).',
    search_characters_by_keywords__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    list_characters:
      'List characters appearing in chapter_id, or all characters when all_chapters=true. If chapter_id is absent and all_chapters=false, return all characters. all_chapters=true ignores chapter_id.',
    list_characters__parameters__properties__chapter_id:
      'Optional chapter ID; return characters appearing there. If omitted and all_chapters=false, return all.',
    list_characters__parameters__properties__all_chapters:
      'Return all characters (default false); when true, ignore chapter_id.',
    list_characters__parameters__properties__limit:
      'Optional maximum number of characters; by default return all.',
    get_paragraph_position:
      'Get a paragraph position, chapter paragraph count, and optionally preceding/following paragraphs for context.',
    get_paragraph_position__parameters__properties__paragraph_id: 'Paragraph ID.',
    get_paragraph_position__parameters__properties__include_previous:
      'Include preceding paragraphs (default false).',
    get_paragraph_position__parameters__properties__include_next:
      'Include following paragraphs (default false).',
    get_paragraph_position__parameters__properties__previous_count:
      'Number of preceding paragraphs (default 3).',
    get_paragraph_position__parameters__properties__next_count:
      'Number of following paragraphs (default 3).',
    get_paragraph_info:
      'Get a paragraph source, translation versions, and selected translation. paragraphIndex is one-based for display; chapterIndex and volumeIndex are zero-based array indexes.',
    get_paragraph_info__parameters__properties__paragraph_id: 'Paragraph ID.',
    get_paragraph_info__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_previous_paragraphs:
      'Get paragraphs preceding the supplied paragraph for reference. paragraph_index is one-based for display; chapter_index and volume_index are zero-based array indexes.',
    get_previous_paragraphs__parameters__properties__paragraph_id: 'Current paragraph ID.',
    get_previous_paragraphs__parameters__properties__count:
      'Number of paragraphs to return (default 3).',
    get_previous_paragraphs__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_next_paragraphs:
      'Get paragraphs following the supplied paragraph for reference. paragraph_index is one-based for display; chapter_index and volume_index are zero-based array indexes.',
    get_next_paragraphs__parameters__properties__paragraph_id: 'Current paragraph ID.',
    get_next_paragraphs__parameters__properties__count:
      'Number of paragraphs to return (default 3).',
    get_next_paragraphs__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    find_paragraph_by_keywords:
      'Find paragraphs with keyword OR matching in the source or target translation. When both source and translation keywords are supplied, require both conditions. For Japanese honorifics, first consult search_memories for established address rules, then search previous paragraph usage. chapter_id limits the search to that chapter; otherwise search the book. paragraph_index is one-based; chapter_index and volume_index are zero-based.',
    find_paragraph_by_keywords__parameters__properties__keywords:
      'Optional source keywords with OR matching. When translation_keywords are also supplied, both conditions must match.',
    find_paragraph_by_keywords__parameters__properties__translation_keywords:
      'Optional target translation keywords with OR matching. When source keywords are also supplied, both conditions must match.',
    find_paragraph_by_keywords__parameters__properties__chapter_id:
      'Optional chapter ID; restrict the search to this chapter.',
    find_paragraph_by_keywords__parameters__properties__max_paragraphs:
      'Maximum paragraphs to return (optional, default 1).',
    find_paragraph_by_keywords__parameters__properties__only_with_translation:
      'Return only paragraphs with a selected target language translation (default false).',
    find_paragraph_by_keywords__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    search_paragraphs_by_regex:
      'Search source or target translation text with a regular expression, including complex formats, number patterns, or character combinations. paragraph_index is one-based; chapter_index and volume_index are zero-based.',
    search_paragraphs_by_regex__parameters__properties__regex_pattern:
      'Regular expression string. Examples: "\\\\d+" matches numbers; "[あ-ん]+" matches hiragana.',
    search_paragraphs_by_regex__parameters__properties__chapter_id:
      'Optional chapter ID; restrict the search to this chapter.',
    search_paragraphs_by_regex__parameters__properties__max_paragraphs:
      'Maximum paragraphs to return (optional, default 1).',
    search_paragraphs_by_regex__parameters__properties__only_with_translation:
      'Return only paragraphs with a selected target language translation (default false).',
    search_paragraphs_by_regex__parameters__properties__search_in_translation:
      'Search target translations when true; otherwise search source text (default false).',
    get_translation_history:
      'Get translation history for a paragraph, including version IDs, text, and AI model information.',
    get_translation_history__parameters__properties__paragraph_id: 'Paragraph ID.',
    get_translation_history__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    update_translation:
      'Edit a specific translation version of the execution target language. Preserve its ID and AI model information. Versions of another language are rejected.',
    update_translation__parameters__properties__paragraph_id: 'Paragraph ID.',
    update_translation__parameters__properties__translation_id:
      'Existing target language version ID from this paragraph’s history.',
    update_translation__parameters__properties__new_translation:
      'New translation text for the execution target language.',
    select_translation:
      'Select a translation version for the execution target language. The version must belong to this paragraph and the same target language.',
    select_translation__parameters__properties__paragraph_id: 'Paragraph ID.',
    select_translation__parameters__properties__translation_id:
      'Existing target language version ID to select from this paragraph’s history.',
    add_translation:
      'Add a translation version for the execution target language. Keep at most five versions per language; evict the oldest target version when necessary while preserving other languages.',
    add_translation__parameters__properties__paragraph_id: 'Paragraph ID.',
    add_translation__parameters__properties__translation:
      'New translation text for the execution target language.',
    add_translation__parameters__properties__ai_model_id:
      'Optional AI model ID; otherwise use the current default model.',
    add_translation__parameters__properties__set_as_selected:
      'Select the new target language version (default true).',
    remove_translation:
      'Delete a target language translation version. When removing its selected version, choose another surviving version of that language, preferring the newest; never select another language.',
    remove_translation__parameters__properties__paragraph_id: 'Paragraph ID.',
    remove_translation__parameters__properties__translation_id:
      'Existing target language version ID to delete from this paragraph’s history.',
    batch_replace_translations:
      'Replace matching keywords only in selected target language translations, preserving the remaining text. Source and translation keyword conditions both apply when supplied together. With source keywords only, search for those keywords in the target translation and skip paragraphs without a match. This tool does not replace the whole paragraph or other language/history versions.',
    batch_replace_translations__parameters__properties__keywords:
      'Optional target translation keywords with OR matching. If original_keywords are supplied, both conditions must match.',
    batch_replace_translations__parameters__properties__original_keywords:
      'Optional source keywords with OR matching. If translation keywords are supplied, both conditions must match.',
    batch_replace_translations__parameters__properties__replacement_text:
      'Replacement for matching keywords only, not the entire translation. With source keywords only, search the translation for the corresponding keyword and skip paragraphs without a match.',
    batch_replace_translations__parameters__properties__chapter_id:
      'Optional chapter ID; restrict search and replacement to this chapter.',
    batch_replace_translations__parameters__properties__replace_all_translations:
      'Compatibility field; replacement always affects only selected target language versions, never all history.',
    batch_replace_translations__parameters__properties__max_replacements:
      'Maximum paragraphs to replace (optional, default 100) to bound the operation.',
    search_web:
      'Search the web for current facts or external knowledge. Read every result title/snippet and use the returned answer when present. Use internal knowledge only when search fails with success=false.',
    search_web__parameters__properties__query: 'Search keywords or question.',
    fetch_webpage:
      'Read a specific webpage URL and extract its title and main text. Read the returned text when answering. An error means the page could not be accessed.',
    fetch_webpage__parameters__properties__url:
      'Complete webpage URL, including http:// or https://.',
    get_book_info:
      'Get book metadata, title, author, description, tags, user notes, and volume/chapter structure for context.',
    get_book_info__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    list_chapters:
      'List chapter IDs, source titles, and target titles with offset/limit pagination. For semantic chapter discovery, use query_chapter.',
    list_chapters__parameters__properties__limit:
      'Optional maximum number of chapters; by default return all.',
    list_chapters__parameters__properties__offset: 'Chapters to skip for pagination (default 0).',
    list_chapters_by_volume:
      'List chapters grouped by the supplied volumes, including volume details and chapter IDs/titles.',
    list_chapters_by_volume__parameters__properties__volume_ids:
      'Volume IDs whose chapters should be listed.',
    query_chapter:
      'Search chapters using semantic similarity, title/body keywords, online rare-term IDF, and chapter/volume identifiers. Return chapter IDs, titles, scores, and 200-character previews; use get_chapter_info for full text. If local embeddings are not ready, return a structured error and retry later. Prefer source titles/series names; character identity plus concrete actions and distinctive details; or event anchors. Avoid abstract impressions, names without actions, and invented series names. When paraphrased titles differ from source titles, prefer source title words or stronger anchors. Treat results as candidates: inspect the top 3–5; use limit 8–10 when uncertain. Maintained source/target names may be normalized across languages; use source spellings when no record exists.',
    query_chapter__parameters__properties__query:
      'Natural language query in any language. Prefer source title/series words, character plus concrete actions/details, or event anchors. Avoid vague impressions or names without actions. Maintained names may be normalized across languages; source title words are usually stronger anchors.',
    query_chapter__parameters__properties__limit:
      'Default 5 candidates. Inspect the top 3–5 rather than assuming the first is best; use 8–10 when uncertain, then get_chapter_info to confirm.',
    get_chapter_info:
      'Get chapter details, title, paged paragraphs, and translation progress. Use a small limit to confirm relevance, then continue with offset; do not load a long chapter into context at once. Default 30 paragraphs, maximum 200.',
    get_chapter_info__parameters__properties__chapter_id: 'Chapter ID.',
    get_chapter_info__parameters__properties__limit:
      'Maximum paragraphs (default 30, maximum 200); page long chapters instead of loading all content.',
    get_chapter_info__parameters__properties__offset:
      'Starting paragraph index (zero-based, default 0); use with limit for pagination.',
    get_chapter_info__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_previous_chapter:
      'Get the preceding chapter for reference and translation consistency. Page content with limit/offset: default 30 paragraphs, maximum 200. Continue with offset when more content is needed.',
    get_previous_chapter__parameters__properties__chapter_id: 'Current chapter ID.',
    get_previous_chapter__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_previous_chapter__parameters__properties__summary_only:
      'If true, omit chapter body content and return available metadata only (default false).',
    get_previous_chapter__parameters__properties__limit:
      'Maximum paragraphs to return (default 30, maximum 200).',
    get_previous_chapter__parameters__properties__offset:
      'Starting paragraph index (zero-based, default 0); use with limit for pagination.',
    get_next_chapter:
      'Get the following chapter for reference and translation consistency. Page content with limit/offset: default 30 paragraphs, maximum 200. Continue with offset when more content is needed.',
    get_next_chapter__parameters__properties__chapter_id: 'Current chapter ID.',
    get_next_chapter__parameters__properties__include_memory:
      'Include related memories in the response (default true).',
    get_next_chapter__parameters__properties__summary_only:
      'If true, omit chapter body content and return available metadata only (default false).',
    get_next_chapter__parameters__properties__limit:
      'Maximum paragraphs to return (default 30, maximum 200).',
    get_next_chapter__parameters__properties__offset:
      'Starting paragraph index (zero-based, default 0); use with limit for pagination.',
    update_chapter_title:
      'Update a chapter source title (title_original) or its execution target translation (title_translation). Use this to correct titles.',
    update_chapter_title__parameters__properties__chapter_id: 'Chapter ID.',
    update_chapter_title__parameters__properties__title_original:
      'New source title (optional); omitted means unchanged.',
    update_chapter_title__parameters__properties__title_translation:
      'New execution target title translation (optional); omitted means unchanged.',
    update_book_info:
      'Update any supplied book metadata fields: description, tags, author, or alternate titles. Omitted fields remain unchanged.',
    update_book_info__parameters__properties__description:
      'New description (optional); an empty string clears it.',
    update_book_info__parameters__properties__tags:
      'New tag array (optional); omitted means unchanged.',
    update_book_info__parameters__properties__author:
      'New author name (optional); an empty string clears it.',
    update_book_info__parameters__properties__alternate_titles:
      'New alternate-title array (optional); omitted means unchanged.',
    list_memories:
      'List book memories for management or debugging, with pagination and sorting. By default return lightweight id/summary/createdAt/lastAccessedAt fields; set include_content=true for full text.',
    list_memories__parameters__properties__offset: 'Pagination offset (zero-based).',
    list_memories__parameters__properties__limit:
      'Number to return (default 20, recommended at most 50).',
    list_memories__parameters__properties__sort_by:
      'createdAt sorts newest first; lastAccessedAt sorts by last access (default).',
    list_memories__parameters__properties__include_content: 'Include full content (default false).',
    get_memory: 'Get a memory by ID to inspect previously saved reference content.',
    get_memory__parameters__properties__memory_id:
      'Memory ID from create_memory or search_memories.',
    search_memories:
      'Search shared memories with natural language queries using keywords and semantic similarity. For characters/terms, first query get_character/search_characters_by_keywords or get_term/search_terms_by_keywords; only use memories when no database record exists. Memories complement structured records. For Japanese honorific handling, search established address conventions before find_paragraph_by_keywords.',
    search_memories__parameters__properties__query:
      'Natural language query or keywords for hybrid keyword/semantic search.',
    create_memory:
      'Create a memory only when no relevant existing memory can be merged with update_memory. Prefer one reusable translation decision per record: address conventions, term choices, or style. summary is the high-weight retrieval title; include relevant source/target names, aliases, and synonymous expressions separated by /. Keep content to a few concise points. Do not duplicate related memories.',
    create_memory__parameters__properties__content: 'Memory content in a few concise points.',
    create_memory__parameters__properties__summary:
      'Retrieval title/summary. Include searchable source names, aliases, common names, and synonymous expressions separated by /. Summary matches have much higher weight than content.',
    update_memory:
      'Prefer merging old and new information into a shorter, clearer, reusable rule or convention. Avoid duplicate memories. Preserve searchable keywords in summary and keep content concise.',
    update_memory__parameters__properties__memory_id:
      'Memory ID from get_memory or search_memories.',
    update_memory__parameters__properties__content: 'Updated memory content.',
    update_memory__parameters__properties__summary: 'Updated searchable summary.',
    delete_memory: 'Delete a memory that is no longer needed.',
    delete_memory__parameters__properties__memory_id:
      'Memory ID from get_memory or search_memories.',
    navigate_to_chapter:
      'Navigate to book details and select the supplied chapter so the user can read or edit it.',
    navigate_to_chapter__parameters__properties__chapter_id: 'Chapter ID to open.',
    navigate_to_paragraph:
      'Navigate to the paragraph, select its chapter, and scroll to it so the user can read or edit it.',
    navigate_to_paragraph__parameters__properties__paragraph_id: 'Paragraph ID to open.',
    create_todo:
      'Create one todo with text or several with items. Write detailed, concrete, actionable tasks; create a separate todo for every step of a multi-step plan rather than a high-level summary.',
    create_todo__parameters__properties__text:
      'One detailed, concrete, actionable todo; use either text or items. Example: translate paragraphs 1–5 and check terminology, rather than merely "translate text".',
    create_todo__parameters__properties__items:
      'Several detailed actionable todos; use either items or text. Create an independent todo for each step.',
    update_todos:
      'Update one todo using id or multiple todos using items. Change text, status, or both; omitted fields remain unchanged.',
    update_todos__parameters__properties__id: 'Single todo ID; use either id or items.',
    update_todos__parameters__properties__text: 'New todo text (optional, only with id).',
    update_todos__parameters__properties__status: 'New todo status (optional, only with id).',
    update_todos__parameters__properties__items__items__properties__id: 'Todo ID.',
    update_todos__parameters__properties__items__items__properties__text:
      'New todo text (optional).',
    update_todos__parameters__properties__items__items__properties__status:
      'New todo status (optional).',
    update_todos__parameters__properties__items: 'Multiple todo updates; use either items or id.',
    mark_todo_done:
      'Mark a todo complete without first marking it working. Prefer ids for several items in one call. Completing items automatically advances the next pending todo to working.',
    mark_todo_done__parameters__properties__id: 'Single todo ID; use either id or ids.',
    mark_todo_done__parameters__properties__ids:
      'Multiple todo IDs; use either ids or id. Prefer ids for marking several items.',
    mark_todo_working:
      'Mark a todo working manually. Usually unnecessary: creation/completion automatically advances the next item. Use only when manually changing the current item.',
    mark_todo_working__parameters__properties__id: 'Single todo ID; use either id or ids.',
    mark_todo_working__parameters__properties__ids:
      'Multiple todo IDs; use either ids or id. Prefer ids for marking several items.',
    delete_todo: 'Delete a todo.',
    delete_todo__parameters__properties__id: 'Todo ID.',
    list_todos:
      'List todos belonging only to the current taskId, including id/text/completed fields. Filter all, active (incomplete), or completed. Do not return another task’s todos.',
    list_todos__parameters__properties__filter:
      'all returns every current-task todo; active returns incomplete todos; completed returns completed todos.',
    ask_user:
      'Ask the user a question and wait for an answer. Show choices and allow custom input when enabled. Use for key ambiguity, missing information, or preference decisions.',
    ask_user__parameters__properties__question: 'Question to show the user (required).',
    ask_user__parameters__properties__suggested_answers:
      'Optional suggested answers the user can select.',
    ask_user__parameters__properties__allow_free_text: 'Allow a custom text answer (default true).',
    ask_user__parameters__properties__placeholder: 'Custom text input placeholder (optional).',
    ask_user__parameters__properties__submit_label: 'Submit button label (optional).',
    ask_user__parameters__properties__cancel_label: 'Cancel button label (optional).',
    ask_user__parameters__properties__max_length: 'Maximum custom answer length (optional).',
    ask_user_batch:
      'Ask several questions together and wait for answers, one screen per question. Use for related preference decisions or ambiguities. Cancellation returns partial answers already provided.',
    ask_user_batch__parameters__properties__questions: 'Question list (required, at least one).',
    ask_user_batch__parameters__properties__questions__items__properties__question:
      'Question to show the user (required).',
    ask_user_batch__parameters__properties__questions__items__properties__suggested_answers:
      'Optional suggested answers the user can select.',
    ask_user_batch__parameters__properties__questions__items__properties__allow_free_text:
      'Allow a custom text answer (default true).',
    ask_user_batch__parameters__properties__questions__items__properties__placeholder:
      'Custom text input placeholder (optional).',
    ask_user_batch__parameters__properties__questions__items__properties__submit_label:
      'Submit button label (optional).',
    ask_user_batch__parameters__properties__questions__items__properties__cancel_label:
      'Cancel button label (optional).',
    ask_user_batch__parameters__properties__questions__items__properties__max_length:
      'Maximum custom answer length (optional).',
    update_task_status:
      'Update the current AI task status. Translation: planning → working → review → end, with review → working allowed for corrections. Polishing/proofreading: planning → working → end.',
    update_task_status__parameters__properties__status:
      'planning maintains terms/characters/memories; working performs translation/polishing/proofreading; review checks results (translation only); end finishes.',
    update_task_status__parameters__properties__reason: 'Reason for the status change (optional).',
    add_translation_batch:
      'Submit translation/polishing/proofreading results by paragraph_id. Translation allows working/review; polishing/proofreading allows working. Normally at most {max} paragraphs, with 10% tolerance up to {tolerance}. When at most {doubleMax} unsubmitted paragraphs remain in the chunk, allow up to {doubleMax} in one call.',
    add_translation_batch__parameters__properties__paragraphs:
      'Result array, normally at most {max} paragraphs with 10% tolerance up to {tolerance}. When at most {doubleMax} unsubmitted chunk paragraphs remain, allow up to {doubleMax}. Use paragraph_id, never index.',
    add_translation_batch__parameters__properties__paragraphs__items__properties__paragraph_id:
      'Unique paragraph ID from [ID: xxx] in the chunk.',
    add_translation_batch__parameters__properties__paragraphs__items__properties__translated_text:
      'Translated, polished, or proofread target text.',
    search_help_docs:
      'Search application help titles and descriptions by keyword. Use for questions about features and operating steps.',
    search_help_docs__parameters__properties__query:
      'Search keywords such as a feature name or operation.',
    get_help_doc:
      'Get a help document by doc_id from search_help_docs/list_help_docs, including its title, category, and full Markdown content.',
    get_help_doc__parameters__properties__doc_id:
      'Stable document ID, such as front-page or ai-models-guide.',
    navigate_to_help_doc:
      'Navigate to a help document and optionally a section anchor. Use when the user wants the complete guide or should open the relevant help page.',
    navigate_to_help_doc__parameters__properties__doc_id:
      'Stable document ID from search_help_docs or list_help_docs.',
    navigate_to_help_doc__parameters__properties__section_id:
      'Optional section anchor ID from the document resource; retain its identifier when the display language changes.',
    list_help_docs: 'List available help documents grouped by category.',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__enabled:
      'Source prefix anchor, preferably the first 5–10 characters. After trimming, minimum 3 and maximum 20 characters; verify that paragraph_id matches the source.',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__disabled:
      'Optional source prefix; validation is currently disabled.',
  },
};
