# ✏️ Content Editing and Search/Replace {#book-details-editing-section-1}

This guide covers chapter editing, paragraph actions, and shortcuts.

> Long chapters use virtual scrolling and a custom scrollbar. Only visible paragraphs render, keeping large chapters responsive. Unsaved paragraph drafts survive scrolling out of view.

## 🧭 Three modes {#book-details-editing-section-2}

Choose from the chapter toolbar:

1. **Edit original** (pencil)
2. **Translation** (language icon)
3. **Translation preview** (eye)

Translation is the default.

## 📝 Source editing {#book-details-editing-section-3}

### Enter {#book-details-editing-section-4}

Choose **Edit original** to edit the whole chapter.

### Edit and save {#book-details-editing-section-5}

- Source appears in one text area.
- Save regenerates paragraphs by line breaks.

Rules:

- Each line becomes a paragraph.
- Compare with the old paragraph at the same index:
  - Unchanged text retains every language's translations and selections.
  - Changed text clears every language's translations and selections.
- Added lines create untranslated paragraphs.
- Removed old paragraphs are removed.

### Format blank lines {#book-details-editing-section-6}

Format cleans excess blank lines from pasted Web/PDF text:

- Each run loses one blank line: two become one, six become five. Relative spacing remains.
- Leading/trailing blank runs are removed.
- Lines containing only full-width spaces (`U+3000`) count as blank.
- Repeated clicks on the same result do not keep deleting lines.
- `Ctrl+Z` restores the pre-format text.

> Formatting changes blank lines only, retaining indentation and trailing spaces on body lines.

### Cancel {#book-details-editing-section-7}

- Cancel discards this source edit and returns to Translation.
- Changing chapters resets source editing state.

## 🌐 Translation mode {#book-details-editing-section-8}

### Interaction {#book-details-editing-section-9}

- Each paragraph shows source and the book's selected target-language translation. Missing translations fall back to source without borrowing another language.
- Edit the current target translation. If the book's target changes while a form is open, reopen it before saving.
- `Enter` saves, `Shift+Enter` inserts a line break, and `Esc` cancels.
- Terms and characters can be highlighted.

### Context menu {#book-details-editing-section-10}

Right-click for:

- Explain selected source text (only with a source selection)
- Proofread paragraph
- Polish paragraph
- Retranslate
- Copy source to assistant
- Translation history (when available)

### Translation history {#book-details-editing-section-11}

- The dialog shows up to five recent versions.
- Select a version to use it.

Versions have language ownership. Other-language history can be viewed but cannot be selected into the current target slot. Selection, editing, and deletion affect their own language. Returning to a target restores its selection. Copy, search/replace, and chapter export use current-target selections with source fallback. English text is not forced into Chinese punctuation; source fallback is not normalized as a translation.

## 👁️ Translation preview {#book-details-editing-section-12}

- Reading layout primarily shows translations.
- Untranslated paragraphs show an Untranslated marker and source.
- Useful for reading and review.

## 🔍 Search and replace {#book-details-editing-section-13}

### Open and close {#book-details-editing-section-14}

- `Ctrl+F`: toggle search.
- `Ctrl+H`: open/toggle replacement controls.
- `Esc`: close an open search bar.

### Search {#book-details-editing-section-15}

- Typing locates matching paragraphs.
- `F3` / `Shift+F3`, or buttons, move between matches.

### Replace {#book-details-editing-section-16}

- Replace the current match or all matches.
- Changes apply to raw translation text, before display formatting.
- Replace all creates an undo point.

## ↩️ Undo/redo {#book-details-editing-section-17}

- `Ctrl+Z`: undo outside input fields.
- `Ctrl+Y` or `Ctrl+Shift+Z`: redo outside input fields.

Limits:

- Up to 50 history entries.
- Changing chapters clears the chapter edit history.

## ⌨️ Shortcuts {#book-details-editing-section-18}

| Shortcut              | Action                                                         |
| :-------------------- | :------------------------------------------------------------- |
| `Ctrl+F`              | Toggle search                                                  |
| `Ctrl+H`              | Toggle replacement controls                                    |
| `F3`                  | Next match when search is open                                 |
| `Shift+F3`            | Previous match                                                 |
| `Esc`                 | Close search                                                   |
| `Ctrl+Shift+C`        | Copy current chapter translations                              |
| `Ctrl+Z`              | Undo outside inputs                                            |
| `Ctrl+Y/Ctrl+Shift+Z` | Redo outside inputs                                            |
| `↑/↓`                 | Paragraph navigation in Translation, skipping empty paragraphs |
| `Enter`               | Edit the selected paragraph in Translation                     |

- Arrow navigation works only in Translation mode.
- Most global shortcuts do not take over input fields.
- Menus, dropdowns, and dialogs can retain default arrow behavior.
