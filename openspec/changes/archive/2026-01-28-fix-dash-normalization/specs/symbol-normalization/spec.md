## MODIFIED Requirements

### Requirement: Multiple consecutive dashes preservation
The system SHALL preserve multiple consecutive em dashes or en dashes (2 or more) during symbol normalization, only converting single dashes to double dashes.

#### Scenario: Three or more dashes are preserved
- **WHEN** the text contains "——————" (4 em dashes)
- **THEN** the normalized text SHALL be "——————" (4 em dashes preserved)

#### Scenario: Two dashes are preserved
- **WHEN** the text contains "——" (2 em dashes)
- **THEN** the normalized text SHALL be "——" (2 em dashes preserved)

#### Scenario: Single em dash is converted
- **WHEN** the text contains "—" (1 em dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Single en dash is converted
- **WHEN** the text contains "–" (1 en dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Three or more en dashes are preserved
- **WHEN** the text contains "––––" (4 en dashes)
- **THEN** the normalized text SHALL be "––––" (4 en dashes preserved)
