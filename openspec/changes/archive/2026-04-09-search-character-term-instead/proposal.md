# Proposal: search-character-term-instead

## Problem

The `get_character` and `get_term` AI tools currently use exact matching (`c.name === name`) to retrieve dictionary entries. This leads to failures when the AI queries slightly varied names or partial names since exact matching will return "Character/Term not found". While there are separate `search_characters_by_keywords` and `search_terms_by_keywords` tools, standard queries using `get_character`/`get_term` are failing due to this strictness.

## Proposed Solution

Modify the internal handler logic of `get_character` and `get_term` tools to perform a broad search rather than an exact match. Specifically:

- `get_character` should search through character names, translations, and explicitly search through all registered **aliases**.
- `get_term` should search through term keywords, translations, and explicitly search through all registered **aliases**.

If an exact match is not found, it should fall back to searching if the requested `name` is a partial match for the main name, translation, or **aliases**, and return the best matches (or a list of matching entries up to a reasonable limit) to the AI, functioning essentially as a wrapper around the existing keyword search logic. We should also update the `description` of these tools in the prompt so the AI knows it can use them flexibly to find related entities.

## Capabilities

- `relax-character-query`: Update `get_character` logic to perform substring/keyword search when an exact match fails. Update its AI description to reflect this.
- `relax-term-query`: Update `get_term` logic to perform substring/keyword search when an exact match fails. Update its AI description to reflect this.

## Impact

- Tools descriptions sent to AI models for `get_character` and `get_term` will be updated to indicate they perform a robust search.
- The `handler` functions in `character-tools.ts` and `terminology-tools.ts` will be updated. They will likely reuse the core filtering logic from their `search_*_by_keywords` counterparts or call them directly.

<success_criteria>

- AI is able to query partial character/term names using `get_character` and `get_term` and successfully receive correct entry results instead of an "X 不存在" error.
  </success_criteria>

<unlocks>
Completing this artifact enables: design, specs
</unlocks>
