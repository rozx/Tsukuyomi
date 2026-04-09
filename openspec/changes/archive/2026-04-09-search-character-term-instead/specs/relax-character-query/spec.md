# Specification: Relax Character Query

## Overview

This specification details the changes required to make the `get_character` AI tool more robust by allowing it to perform a fallback search when an exact name match fails.

## Requirements

### Update `get_character` Tool Description

- **Requirement:** Modify the prompt description for `get_character` in `character-tools.ts` to inform the AI that the tool will perform a partial search across names, translations, and aliases if an exact match is not found.

### Fallback Search Logic

- **Requirement:** Update the `get_character` tool handler.
  - **Context:** Currently, it performs an exact name search (`name === name`).
  - **Action 1:** Retain the exact match as the first step.
  - **Action 2:** If the exact match fails to find a character, instead of returning `{ success: false, message: ... }`, fall back to a case-insensitive search.
  - **Action 3:** During the fallback search, check if the requested `name` string is contained within any of the character's `name`, `translation`, or its `aliases` (both `alias.name` and `alias.translation`).
  - **Result:** If one or more characters are matched during the fallback search, return them in a similar JSON structure to `search_characters_by_keywords`.
  - **Failure:** If the fallback search also returns 0 results, return a message indicating no exact or partial matches were found.

## BDD Scenarios

### Scenario 1: Exact Match Found

- **GIVEN** a character named "田中太郎" exists in the database.
- **WHEN** the AI calls `get_character("田中太郎")`
- **THEN** the exact character is returned as a single object `character: { ... }`.

### Scenario 2: Exact Match Fails, Fallback Search Succeeds

- **GIVEN** a character named "田中太郎" with an alias "田中" exists in the database.
- **WHEN** the AI calls `get_character("田中")`
- **THEN** the exact match fails (because "田中" !== "田中太郎").
- **AND** the fallback search finds the character because "田中" is an alias.
- **AND** the response contains `characters: [...]` or a suggestion indicating that the exact character wasn't found but partial matches were.

### Scenario 3: No Match Found

- **GIVEN** a database with only "田中太郎"
- **WHEN** the AI calls `get_character("佐藤")`
- **THEN** both exact match and fallback search fail.
- **AND** the tool returns `{ success: false, message: ... }`.
