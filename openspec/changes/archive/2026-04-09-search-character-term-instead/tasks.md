# Implementation Tasks

## 1. Update `get_character` Tool (`src/services/ai/tools/character-tools.ts`)

- [x] 1.1 Update the tool `description` for `get_character` to inform the AI model that if an exact character is not found, it will automatically perform a partial search across character names, translations, and all registered aliases.
- [x] 1.2 In `get_character` handler, if `!character` (exact match fails), do NOT immediately return false. Instead, fallback to filtering `book.characterSettings` based on the requested `name` using case-insensitive partial substring match against the character's name, translation, and registered aliases.
- [x] 1.3 If the fallback search yields results, return `{ success: true, characters: [...], message: "Exact match not found. Returning related matches." }` or similar structure. If still no results, return the original `success: false` message.

## 2. Update `get_term` Tool (`src/services/ai/tools/terminology-tools.ts`)

- [x] 2.1 Update the tool `description` for `get_term` to inform the AI model that if an exact term is not found, it will automatically perform a partial search across term names, translations, and aliases.
- [x] 2.2 In `get_term` handler, if `!term` (exact match fails), do NOT immediately return false. Instead, fallback to filtering `book.terminologies` based on the requested `name` using case-insensitive substring match against the term's name or translation.
- [x] 2.3 If the fallback search yields results, return `{ success: true, terms: [...], message: "Exact match not found. Returning related matches." }` or similar structure. If still no results, return the original `success: false` message.
