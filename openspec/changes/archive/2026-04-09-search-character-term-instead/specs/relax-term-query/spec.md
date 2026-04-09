# Specification: Relax Term Query

## Overview

This specification details the changes required to make the `get_term` AI tool more robust by allowing it to perform a fallback search when an exact name match fails.

## Requirements

### Update `get_term` Tool Description

- **Requirement:** Modify the prompt description for `get_term` in `terminology-tools.ts` to inform the AI that the tool will perform a partial search across names, translations, and any potential aliases if an exact match is not found.

### Fallback Search Logic

- **Requirement:** Update the `get_term` tool handler.
  - **Context:** Currently, it performs an exact name search (`name === name`).
  - **Action 1:** Retain the exact match as the first step.
  - **Action 2:** If the exact match fails to find a term, rather than immediately failing, fall back to a case-insensitive search over term names and translations (and aliases if applicable to terminology type).
  - **Result:** If one or more terms match during the fallback search, return them in a similar JSON structure to `search_terms_by_keywords`.
  - **Failure:** If the fallback search also returns 0 results, return a message indicating no exact or partial matches were found.

## BDD Scenarios

### Scenario 1: Exact Match Found

- **GIVEN** a term "魔法" exists in the database.
- **WHEN** the AI calls `get_term("魔法")`
- **THEN** it instantly returns the exact term definition.

### Scenario 2: Exact Match Fails, Fallback Search Succeeds

- **GIVEN** a term "魔力" with its translation exists.
- **WHEN** the AI calls `get_term("魔力回复")`
- **THEN** it checks if "魔力回复" contains the term logic or substrings and performs keyword searching. Or vice versa, using the query as the keyword against the term definitions.
- **AND** the fallback search returns the "魔力" term as a related suggestion.

### Scenario 3: No Match Found

- **GIVEN** a database with only "剑"
- **WHEN** the AI calls `get_term("魔法")`
- **THEN** it fails completely and returns a `{ success: false, ... }` message since no strings relate.
