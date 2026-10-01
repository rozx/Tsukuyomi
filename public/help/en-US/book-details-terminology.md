# Terminology {#book-details-terminology-section-1}

Terms keep names, places, and other specialized vocabulary consistent throughout a book.

## 📚 Terminology library {#book-details-terminology-section-2}

A book-specific source-to-translation reference for:

- 👤 Personal names
- 🗺️ Places, countries, and cities
- 📦 Organizations, skills, and objects
- 💡 World-specific concepts
- 🎌 Cultural vocabulary

## 📋 Fields {#book-details-terminology-section-3}

- **Name**: exact source term, required
- **Translation**: current book-target name
- **Description**: optional explanation

Simplified Chinese, Traditional Chinese, and English names are separate. Missing target names stay blank rather than borrowing source/another language. Source remains in Name. Saving a blank translation clears only that slot. Reopen an edit form if target changes. Descriptions are shared and not automatically translated.

## 🚪 Open the panel {#book-details-terminology-section-4}

1. Open book details.
2. Find Settings in the sidebar.
3. Choose Terms.
4. The workspace displays the panel.

It contains an add/batch/import/export/search toolbar, term cards, and an edit dialog opened by selecting a card.

## Add terms {#book-details-terminology-section-5}

### Manually {#book-details-terminology-section-6}

1. Open Terms.
2. Choose Add term.
3. Enter required source name, translation, and optional description.
4. Save.

Use exact source spelling, a consistent translation, and explanatory details such as pronunciation or meaning.

### Translate a name {#book-details-terminology-section-7}

Use the translation button beside Name. The suggestion fills Translation.

## Edit terms {#book-details-terminology-section-8}

### Change information {#book-details-terminology-section-9}

Find the card, open it, edit, and save.

### Effects {#book-details-terminology-section-10}

- Existing paragraph translations do not change automatically.
- New tasks use the updated term.
- Use chapter search/replace for old translations, or retranslate affected chapters.

## Delete terms {#book-details-terminology-section-11}

Find the term, choose Delete, and confirm.

- Undo is available briefly through the notification; afterward use explicit backup/revision restoration.
- Existing translations remain.
- AI no longer uses the term.

Entity deletion applies across languages. Long-lived book deletion records win over late offline edits. Explicit undo restores visible content under a new identity while retaining the old deletion record, protecting it during later sync.

## Batch operations {#book-details-terminology-section-12}

### Batch delete {#book-details-terminology-section-13}

1. Choose Batch.
2. Select terms or Select all.
3. Delete.
4. Confirm.
5. Cancel to leave batch mode.

## Import/export {#book-details-terminology-section-14}

### Export {#book-details-terminology-section-15}

Export the current library as JSON for backup/migration.

### Import {#book-details-terminology-section-16}

Choose a JSON or TXT file containing JSON:

1. Full exported term array.
2. A simple object such as `{"source term": "translation", "another term": "another translation"}`.

Imported and existing terms are merged.

## Search {#book-details-terminology-section-17}

### Find a term {#book-details-terminology-section-18}

Type in the panel search field. The list filters immediately across name, translation, and description. Partial queries, fuzzy matching, and case-insensitive search are supported.

## Use in translation {#book-details-terminology-section-19}

### Automatic use {#book-details-terminology-section-20}

AI detects source terms and uses configured translations for consistency.

- Name is required.
- Missing translations may be filled by AI during a translation task.
- Missing descriptions may be inferred from context.
- AI can create, update, or delete terms when needed; review changes.

Matching priority:

1. Exact matches
2. Longer terms to avoid overlap
3. Recently added terms

### Purpose {#book-details-terminology-section-21}

A consistent translated name prevents variations. Descriptions explain meaning and improve contextual interpretation.

## Recommended practices {#book-details-terminology-section-22}

### When to build the library {#book-details-terminology-section-23}

1. Create a basic library after import.
2. Refine it before chapter 1.
3. Add newly discovered terms while translating.
4. Review regularly.

### Naming conventions {#book-details-terminology-section-24}

Use a consistent style for personal names, official/transliterated place names, and skill names appropriate to the target language.

Avoid conflicts:

- Use one consistent name per source within each target.
- Avoid identical translations for distinct source terms where confusing.
- Explain similar terms in descriptions.
- Since v0.13.0, term names cannot equal a character's main name or alias in the same book. Create/edit rejects collisions.

### Priorities {#book-details-terminology-section-25}

1. Main/important characters
2. Key places
3. Core world concepts
4. Frequent skills/magic
5. Secondary names and objects

Complete important entries first; add minor ones during translation.

### Quality review {#book-details-terminology-section-26}

After each volume, check consistency and correct inappropriate translations.

### Terms versus characters {#book-details-terminology-section-27}

**Terms** store names, translations, and optional explanations.

**Characters** add gender, speech style, background, and aliases.

Put places, objects, and organizations in Terms. Put names requiring character details in Characters, without duplicating the same source name as a term. Characters provide richer context.

## Frequently asked questions {#book-details-terminology-section-28}

### Why wasn't a term used? {#book-details-terminology-section-29}

Check exact source spelling, saved state, and model/tool support; try retranslating the paragraph.

### How do I handle several meanings? {#book-details-terminology-section-30}

Explain the context in Description, use chapter instructions where needed, and choose manually according to the passage.

### Does a large library affect performance? {#book-details-terminology-section-31}

Usually little impact; common terms are cached. Keeping fewer than 1000 and removing unused entries helps manageability.

### Can I batch edit? {#book-details-terminology-section-32}

Batch deletion is available. For content edits, export a backup, edit JSON, and import the changes.

### Should Translation be blank? {#book-details-terminology-section-33}

Leave uncertain names blank for AI suggestions during translation, or fill a specific translation for consistency. Define important names explicitly and review AI-filled minor ones.
