## ADDED Requirements

### Requirement: Batch Summary UI Entry Point

The system MUST provide a prominent access point in the application header for initiating batch chapter summary generation.

#### Scenario: User accesses batch summary tool

- GIVEN the user is on any page
- WHEN the user looks at the top application header
- THEN they should see a button labelled "Batch Summary" or represented by a relevant icon (e.g. list/stack)
- AND clicking this button MUST open the Batch Summary configuration panel

### Requirement: Batch Summary Configuration

The system MUST allow users to configure the batch summary process before starting it.

#### Scenario: Configuring overwrite behavior

- GIVEN the Batch Summary panel is open
- WHEN the user is preparing to start the batch process
- THEN they MUST be able to toggle an "Overwrite existing summaries" option (default: OFF)
- AND if OFF, chapters with existing summaries will be skipped
- AND if ON, all chapters will be regenerated

### Requirement: Batch Execution and Concurrency

The system MUST execute summary generation for multiple chapters efficiently without overloading the system.

#### Scenario: Starting batch generation

- GIVEN the user has clicked "Start" in the Batch Summary panel
- THEN the system MUST iterate through all chapters of the current active book
- AND filtered chapters (based on overwrite setting) MUST be added to a processing queue
- AND the system MUST execute these tasks with a concurrency limit (e.g., max 3 simultaneous tasks)
- AND realized AI tasks MUST be visible in the global AI Thinking Process Panel

### Requirement: Progress Feedback

The system MUST provide real-time feedback on the progress of the batch operation.

#### Scenario: Monitoring progress

- GIVEN a batch summary process is running
- WHEN the user views the Batch Summary panel
- THEN they MUST see a progress indicator showing:
  - Total chapters to process
  - Number of chapters completed
  - Current status (Running/Stopped)
- AND they MUST be able to stop the batch process at any time
