# Technical Design: Search Character/Term Instead

## Architecture

We are modifying the core tool handlers for `get_character` and `get_term` inside `src/services/ai/tools/character-tools.ts` and `src/services/ai/tools/terminology-tools.ts`.
Currently, they pull the character or term by doing a strict lookup: `book.characterSettings?.find((c) => c.name === name)`.
We will change this sequence to first attempt an exact match, and if that fails, perform a fallback fuzzy or keyword match against the character/term name, translations, and aliases.

## Component Details

### `character-tools.ts` (`get_character`)

- **Tool Description Update:** Modify the `description` string to clarify that `get_character` will also perform a partial search across names, translations, and aliases if an exact match is not found.
- **Handler Update:**
  1. Attempt the exact match: `book.characterSettings?.find((c) => c.name === name)`.
  2. If the exact match succeeds, proceed as before.
  3. If it fails, rather than immediately returning "Character not found", we will:
     - Treat the provided `name` as a search keyword.
     - Filter `book.characterSettings` based on whether `name`, `translation`, or any registered `aliases` matches the keyword (case-insensitive substring match).
     - If matches are found, return the top N matching characters and state that an exact match wasn't found but here are the closest matches.
     - If no matches are found even with substring logic, return the "Character not found" message.

### `terminology-tools.ts` (`get_term`)

- **Tool Description Update:** Modify the `description` string to clarify that `get_term` will perform a partial search across names, translations, and aliases if an exact match is not found. (Note: terms may not explicitly have aliases array in the same way characters do, but they have name and translation. We'll verify terminology fields and perform searches accordingly).
- **Handler Update:**
  1. Attempt the exact match: `book.terminologies?.find((t) => t.name === name)`.
  2. If fails, perform a case-insensitive substring search over terminology `name` and `translation`.
  3. If matches are found, return them. Else return "Term not found".

## Data & State

No database schema or core store state changes are needed. The changes are entirely confined to how the AI tool handlers interpret and respond to the request `name` parameter. The response JSON structure when returning search matches will be similar to `search_characters_by_keywords` but formatted as a fallback suggestion so the model understands exactly what was found.

## Trade-offs

- **Token Usage:** Returning a list of partial matches will consume slightly more tokens than a simple "not found" error message, but it drastically improves AI tool effectiveness and prevents "tool thrashing" where the AI fails and has to issue another search right after.
- **Response Shape:** `get_character` historically returns a single `character` object. To maintain backward compatibility with AI expectations, if we return multiple matches, we might need to alter the response to indicate it's a list. An alternative is just returning the closest single match, or modifying the prompt to tell the AI that it might receive an array of `characters` if a search was triggered. Returning a descriptive string with `characters: []` arrays is safe.
