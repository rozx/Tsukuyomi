# Symbol Normalization

## Overview

This capability defines how translation text symbols are normalized to ensure consistent formatting in the output.

## Requirements

### Requirement: Dash normalization
The system SHALL normalize dash characters according to Chinese typographic conventions:
- Single em dash (—) or en dash (–) SHALL be converted to double em dash (——)
- Two or more consecutive dashes SHALL be preserved as-is

#### Scenario: Single em dash is converted
- **WHEN** the text contains "—" (1 em dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Single en dash is converted
- **WHEN** the text contains "–" (1 en dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Two dashes are preserved
- **WHEN** the text contains "——" (2 em dashes)
- **THEN** the normalized text SHALL be "——" (2 em dashes preserved)

#### Scenario: Three or more dashes are preserved
- **WHEN** the text contains "————" (4 em dashes)
- **THEN** the normalized text SHALL be "————" (4 em dashes preserved)

#### Scenario: Three or more en dashes are preserved
- **WHEN** the text contains "––––" (4 en dashes)
- **THEN** the normalized text SHALL be "––––" (4 en dashes preserved)
