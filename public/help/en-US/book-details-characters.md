# Character Settings {#book-details-characters-section-1}

Character settings record names and personalities so AI can translate character-related text consistently.

## 👤 What is a character setting? {#book-details-characters-section-2}

Basic information:

- **Name**: required source name
- **Translation**: current-target name
- **Gender**: male, female, other, or unknown

Details:

- **Description**: personality, appearance, and background
- **Speech style**: tone, register, verbal habits
- **Aliases**: other names and their translations

Character/alias names are stored separately in Simplified Chinese, Traditional Chinese, and English. Missing translations stay blank, without source or another-language fallback. Original names remain visible; gender, descriptions, and speech style are shared. Clearing a name affects only its current slot. Reopen a form if the target changes while editing.

## 🚪 Open the panel {#book-details-characters-section-3}

1. Open book details.
2. Find Settings in the sidebar.
3. Choose Characters.
4. The workspace shows the panel.

The toolbar provides Add, import/export, and search. Select a character card to view/edit details.

## Add characters {#book-details-characters-section-4}

### Manually {#book-details-characters-section-5}

1. Open Characters.
2. Choose Add character.
3. Fill in:
   - Required source name
   - Optional gender, translated name, description, speech style, and aliases
4. Save.

Use exact source spelling. Leave uncertain names blank for later AI suggestions. Add useful background and language habits, such as a formal register, a guarded tone, or actual source suffixes like desu/nya.

### Translate a name {#book-details-characters-section-6}

The translation button beside Name fills the Translation field with a suggestion.

## Edit characters {#book-details-characters-section-7}

### Change information {#book-details-characters-section-8}

Find and open a card, edit, and save. All basic/detail fields can be improved later.

### Manage aliases {#book-details-characters-section-9}

A character can have several nicknames or titles:

1. Choose Add alias in the dialog.
2. Enter its source name.
3. Enter an optional translation, or leave blank for a later AI suggestion.

Use the adjacent delete button to remove an alias.

Each alias has a stable identity retained through renaming. Deletion wins over old offline edits; deleting a character also prevents old child aliases returning. Explicit restoration creates new identities while retaining old deletion records. Saving a blank name keeps it blank until a real AI task or manual edit supplies a target translation.

Since v0.13.0:

- Different characters may share an alias, such as a family name. AI uses surrounding context to disambiguate.
- Character main names and aliases cannot equal term names in the same book. Create/edit rejects collisions.

## Delete characters {#book-details-characters-section-10}

Find the character, choose Delete, and confirm.

- Undo is available while the success notification remains actionable; later restoration requires a backup/revision.
- AI stops referencing that character.
- Existing paragraph translations remain unchanged.

## Import/export {#book-details-characters-section-11}

### Export {#book-details-characters-section-12}

Export character settings as JSON for backup/migration.

### Import {#book-details-characters-section-13}

Choose a character JSON file. Imported and existing records are merged.

## Field details {#book-details-characters-section-14}

### Name {#book-details-characters-section-15}

The name as written in the source. Exact matching is required; this is the only required field.

Examples:

- Harry Potter
- 田中太郎
- アリス

### Translation {#book-details-characters-section-16}

The name in the current target language. Leave it blank for an AI suggestion during translation, or fill it to use a specific name.

For example, in Chinese these source names might be 哈利·波特, 田中太郎, and 爱丽丝; in English, Harry Potter, Taro Tanaka, and Alice. Names are stored in their own language slots.

### Gender {#book-details-characters-section-17}

Options:

- Unknown (default)
- Male
- Female
- Other

Helps with pronouns, relationships, and gender-related text.

### Description {#book-details-characters-section-18}

Include relevant personality, appearance, background, relationships, and other translation context. A blank description may be filled by AI; entered details help it understand the character.

Example:

```
A brave, loyal young man with untidy black hair, green eyes, and a lightning-shaped scar.
He stands up against injustice and remains loyal to his friends.
```

### Speech style {#book-details-characters-section-19}

Describe:

- Recurring expressions
- Tone, such as aloof, warm, or guarded
- Register, such as archaic, modern, or online slang
- Sentence-ending habits actually present in the source

This keeps dialogue consistent across scenes.

Example:

```
Often ends sentences with a distinctive phrase.
Sounds defensive and refuses to admit how much they care about others.
```

### Aliases {#book-details-characters-section-20}

Each contains a source name and optional translation. Use them for nicknames/titles to keep all forms consistent.

Examples for a Chinese target:

- The Boy Who Lived → 大难不死的男孩
- 魔王様 → 魔王大人

## Search {#book-details-characters-section-21}

### Find a character {#book-details-characters-section-22}

Type in the top search field. Results filter across name, translation, description, speech style, and aliases.

## Use in translation {#book-details-characters-section-23}

### Recognition {#book-details-characters-section-24}

AI recognizes source names, uses configured translations, and considers personality/background to translate dialogue and descriptions.

### How fields are used {#book-details-characters-section-25}

- Names maintain consistent naming.
- Gender informs pronouns.
- Speech style informs dialogue tone.
- Background informs behavior and context.

### Automatic updates {#book-details-characters-section-26}

During translation, AI may fill missing names, descriptions, or alias translations. It may create/update/delete records where needed. Review these changes.

## Recommended practices {#book-details-characters-section-27}

### When to build settings {#book-details-characters-section-28}

1. Record main characters while reading.
2. Refine known characters before translation.
3. Add newly encountered characters.
4. Leave uncertain details blank for AI suggestions.

### Completeness {#book-details-characters-section-29}

For main characters, specify name, gender, speech style, background, and known aliases. For minor characters, at least enter the source name; other fields can be filled later.

### Use automatic filling {#book-details-characters-section-30}

Leave uncertain translations/descriptions blank, then review and revise the assistant's contextual suggestions.

### Avoid mistakes {#book-details-characters-section-31}

- Match source spelling exactly.
- Keep Speech style focused on language rather than unrelated background.
- Review automatic updates.
- Maintain consistent records.

## Frequently asked questions {#book-details-characters-section-32}

### Characters versus terms? {#book-details-characters-section-33}

Characters store personality, speech style, and aliases. Terms store names of places, skills, organizations, and other concepts. Important people belong in Characters; do not duplicate a character main name/alias as a term.

### Why wasn't the character information used? {#book-details-characters-section-34}

Check exact source matching, saved data, and model/tool support. Try retranslating the passage.

### What if the name changes in dialogue? {#book-details-characters-section-35}

Add the alternate source name as an alias, optionally translate it, and save. AI can then recognize it.

### Should I leave names/descriptions blank? {#book-details-characters-section-36}

Leave uncertain information blank for suggestions; fill known choices to maintain consistency.

### Do character settings use many tokens? {#book-details-characters-section-37}

Only relevant characters are selected for context. Keep individual descriptions concise; about 200 characters is a useful guideline.
