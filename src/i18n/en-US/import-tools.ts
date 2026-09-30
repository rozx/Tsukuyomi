export default {
  aiImportTools: {
    preview_text_structure:
      'Preview TXT/Markdown body ranges and batch volume/chapter splitting; save a plan without changing the draft. At most 500 chapters per batch, including unclassified content. regex uses standalone whole-line headings with a named title group. markdown uses chapter_level and optional shallower volume_level, ignoring headings inside code. single treats the range as one chapter. Return counts and five examples; read the full plan with paged get_text_structure.',
    preview_text_structure__parameters__properties__resource_id:
      'Saved TXT/Markdown extraction contentId, not a snapshot ID. Coordinates refer to its concatenated text.',
    preview_text_structure__parameters__properties__volume_id:
      'Existing volume for content without matched volume headings; omit to create an unassigned volume.',
    preview_text_structure__parameters__properties__replace_chapter_ids:
      'Existing draft chapters from this file to replace explicitly; preserve others. Required when ranges overlap.',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_text_structure__parameters__properties__rules__properties__include_headings:
      'Keep chapter headings in body text (default false); volume headings always become volume titles.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_text_structure__parameters__properties__rules__properties__selection:
      'Omit for all text. start/end must each match uniquely; keep content between them, excluding markers. body is mutually exclusive with start/end and must match uniquely with a named body capture group.',
    get_text_structure:
      'Read a saved text structure plan with pagination: volume/chapter titles, character counts, source ranges, boundary snippets, warnings, and exclusion reasons. Do not rescan.',
    apply_text_structure:
      'Apply a previewed text structure plan atomically to the draft, creating or explicitly replacing volumes/chapters. Preserve source references; do not write the library. Preview again after source/draft changes. Reapplying the same plan is idempotent.',
    preview_draft_batch:
      'Preview batch body cleanup or volume/chapter title replacement and save a version-bound plan without changing the draft. At most 500 items; return counts and at most five examples. Process each content reference independently: multiline matching is allowed within it, never across references. Body operations only delete matches/lines. Title replacement supports $1 and $<name>. Empty scope selects all; combine filters by intersection.',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_draft_batch__parameters__properties__pattern__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    preview_draft_batch__parameters__properties__pattern__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    preview_draft_batch__parameters__properties__replacement:
      'Only for title replace operations; body replacement or text addition is forbidden.',
    apply_draft_batch:
      'Apply a previewed draft batch atomically. Preview again after draft changes. Reapplying the same batch is idempotent; never write the library.',
    run_chapter_batch:
      'Extract pending chapters from a prepared plan and save each to the draft, with at most 3 concurrent operations. Return counts and a few exceptions, not body text. Resume after interruption; retry_failed retries failed items only.',
    get_chapter_batch:
      'Read chapter batch statuses, errors, and content references with pagination. Use read_source to spot-check body text.',
    prepare_chapter_batch:
      'After sampling, prepare a chapter batch with fixed sources/order/rules and create draft extraction placeholders without fetching bodies. Use exactly one of source_ids, discovery_ids, or catalog; at most 500 chapters per batch.',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    prepare_chapter_batch__parameters__properties__filter:
      'Filter only explicitly supplied sources/discoveries or the catalog window. name matches names; locator matches URL/file paths. Intersect all conditions; never expand source scope.',
    list_sources: 'List sources and statuses for the current task without reading bodies.',
    inspect_source:
      'Explicitly inspect one source for structure, metadata, and resource references. Do not automatically add or follow links.',
    read_source:
      'Page through saved snapshots or extraction results. blocks returns stable block IDs and previews; text reads complete text, excluded inspects exclusions, inspection reads metadata.',
    add_sources:
      'Append only observed discovery references. Preserve the parent source and purpose; do not fetch content.',
    add_sources__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    add_sources__parameters__properties__filter__properties__name__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    add_sources__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    add_sources__parameters__properties__filter__properties__locator__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    add_sources__parameters__properties__filter:
      'Filter only explicitly supplied sources/discoveries or the catalog window. name matches names; locator matches URL/file paths. Intersect all conditions; never expand source scope.',
    extract_novel_info:
      'Inspect novel metadata, catalog resources, and discovery references. Do not fetch chapter bodies outside the catalog.',
    extract_content:
      'Extract source text from explicitly selected sources/rules, save the complete result, and return content references. At most eight items per batch; never rewrite bodies.',
    extract_content__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    extract_content__parameters__properties__filter__properties__name__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    extract_content__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    extract_content__parameters__properties__filter__properties__locator__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    extract_content__parameters__properties__filter:
      'Filter only explicitly supplied sources/discoveries or the catalog window. name matches names; locator matches URL/file paths. Intersect all conditions; never expand source scope.',
    get_import_draft:
      'Read the current draft revision, target, and necessary questions. chapters pages chapter summaries; chapter reads a chapter’s content references by chapter_id.',
    edit_import_draft:
      'Edit the draft atomically by revision. Declare novel candidates and source ownership before building volumes/chapters. sourceIds may be empty for the host to derive from references. Reference source text only; never forge confirmation or write to the library.',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items__properties__excludeRanges:
      'UTF-16 exclusion ranges relative to this reference’s original parsed text, ascending and non-overlapping. Prefer batch tools to compute them.',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items:
      'extraction references saved extraction results with optional block ranges and within-block start/end. existing requires bookId, bookRevision, chapterId, and paragraphId of the current target.',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items__properties__excludeRanges:
      'UTF-16 exclusion ranges relative to this reference’s original parsed text, ascending and non-overlapping. Prefer batch tools to compute them.',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items:
      'extraction references saved extraction results with optional block ranges and within-block start/end. existing requires bookId, bookRevision, chapterId, and paragraphId of the current target.',
    search_books:
      'Search local novels by title, author, or source clues; return candidates and evidence only.',
    get_book_info:
      'Read basic information for an explicit novel ID; do not include model configuration, credentials, or memories.',
    list_chapters: 'Page volume/chapter structure for an explicit novel ID.',
    get_chapter_info:
      'Page source paragraphs for explicit novel/chapter IDs, with the revision needed for source references.',
    search_web:
      'Search metadata only: author, description, cover, or alternate titles. Results remain metadata-only and must not substitute for source body text.',
    rename_import_task:
      'Name the current import task so the user can identify it. Call after identifying book metadata, usually using the title with optional author/scope. Do not change a name manually set by the user.',
    record_update_recipe:
      'Declare an update recipe after selected webpage chapters correspond one-to-one with catalog links. The host replays saved snapshots offline and must reproduce draft paragraphs; pinned edited chapters may be at most 20%. Reject discrepancies and return examples, or save the valid recipe as one draft edit. Built-in sites use the built-in engine, ignoring catalog_selector/chapter_filter. When content rules are omitted, reuse the actual extraction rules.',
    record_update_recipe__parameters__properties__catalog_selector:
      'CSS selector limiting catalog links when they are outside standard containers such as nav or .toc.',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    record_update_recipe__parameters__properties__chapter_filter:
      'Filter only explicitly supplied sources/discoveries or the catalog window. name matches names; locator matches URL/file paths. Intersect all conditions; never expand source scope.',
    record_update_recipe__parameters__properties__content_rules:
      'Body extraction rules; if omitted, derive them from rules actually used to import draft chapters.',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__pattern:
      '1–1000 characters. regex has no / delimiters; escape backslashes inside JSON.',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__flags:
      'Supported flags: g, i, m, s, u; global/Unicode by default. For example, im means case-insensitive and multiline.',
    record_update_recipe__parameters__properties__cleanup:
      'Cleanup rules applied in order during replay; include batch cleanup used in the draft.',
    record_update_recipe__parameters__properties__strip_heading:
      'Remove the first nonempty body line only when it exactly equals the catalog title.',
    record_update_recipe__parameters__properties__pinned_chapter_ids:
      'Deliberately edited draft chapters not reproducible by replay; at most 20% of corresponding chapters.',
    preview_import:
      'Generate real changes and translation impacts from the current draft revision and save a plan for user review. This does not apply changes.',
    ask_user:
      'Ask one necessary question for a key ambiguity not resolvable from sources. Save the question and pause the import execution; resume after the user answers in the import workspace and return the answer.',
    ask_user__parameters__properties__question: 'Question to show the user (required).',
    ask_user__parameters__properties__suggested_answers:
      'Optional suggested answers the user can select.',
    ask_user__parameters__properties__allow_free_text: 'Allow a custom text answer (default true).',
    ask_user__parameters__properties__placeholder: 'Custom text input placeholder (optional).',
    ask_user__parameters__properties__submit_label: 'Submit button label (optional).',
    ask_user__parameters__properties__cancel_label: 'Cancel button label (optional).',
    ask_user__parameters__properties__max_length: 'Maximum custom answer length (optional).',
    ask_user_batch:
      'Ask several necessary questions, save them, and pause import execution. Resume only after the user answers every question in the import workspace.',
    ask_user_batch__parameters__properties__questions: 'Question list (required, at least 1).',
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
    create_todo:
      'Create one todo with text or several with items. Write detailed, concrete, actionable tasks; create a separate todo for every step of a multi-step plan rather than a high-level summary.',
    create_todo__parameters__properties__text:
      'One detailed, concrete, actionable todo; use either text or items. Example: translate paragraphs 1–5 and check terminology, rather than merely "translate text".',
    create_todo__parameters__properties__items:
      'Several detailed actionable todos; use either items or text. Create an independent todo for each step. For example: ["Translate paragraphs 1-5 and check terminology consistency", "Translate paragraphs 6-10 and keep character names consistent"] rather than ["Translate text", "Check consistency"].',
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
  },
};
