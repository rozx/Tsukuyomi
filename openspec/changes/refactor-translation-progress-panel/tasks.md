## 1. Pinia Store Preparation

- [ ] 1.1 Remove `autoTabSwitchingEnabled`, `activeTab`, and `taskFolded` states and their associated getters/actions from `src/stores/book-details.ts` (`setTranslationProgressAutoTabSwitching`, `setTranslationProgressActiveTab`, `clearTranslationProgressActiveTab`, `setTranslationProgressTaskFolded`).
- [ ] 1.2 Update `clearTaskTranslationProgress` to only clean up `autoScrollEnabled` (remove references to the deleted keys).
- [ ] 1.3 Introduce `focusedTaskId: string | null` state to `src/stores/book-details.ts` to track the globally focused chapter task in the UI layout, with a `setFocusedTaskId` action.

## 2. Component Core & Task Switcher

- [ ] 2.1 Refactor the top section of `src/components/novel/TranslationProgress.vue` to render a horizontal Task Switcher (pill group) displaying all active or pending translation tasks, each showing chapter name and macro progress percentage.
- [ ] 2.2 Wire the Task Switcher clicks to update `focusedTaskId` via the store action and visually highlight the active item. Auto-select when only one task exists.
- [ ] 2.3 Keep `recentAITasks` as the full filtered list (it feeds the Task Switcher). Add a `focusedTask` computed that derives the single task from `focusedTaskId`. Update `currentProgressTask` to prefer the focused task. Remove `isTaskThinking`/`isTaskOutputting` as standalone tab-switching helpers — their logic moves into the Activity Feed event parser.
- [ ] 2.4 Integrate `showOnlyCurrentChapter` to filter the Task Switcher pill list. When the filter leaves only one task, auto-set `focusedTaskId`.

## 3. Sticky Todo Tracker

- [ ] 3.1 Move the Todo list display into a sticky header directly below the new Task Switcher, rendering constraints mapped exclusively to the `focusedTaskId`.
- [ ] 3.2 Bind the scroll constraints properties to allow the secondary log view to scroll independently beneath the sticky Todo Tracker.

## 4. Activity Feed Integration

- [ ] 4.1 Remove all PrimeVue `Tabs`, `TabList`, `Tab`, `TabPanels`, and `TabPanel` imports, markup, and the legacy tab-switching logic (`getActiveTab`, `shouldAutoSwitchTab`, `detectStateChange`, `determineDefaultTab`, `setActiveTab`, `lastActiveState`).
- [ ] 4.2 Implement `parseActivityEvents(task)` — a function that splits `thinkingMessage` and `outputContent` into typed event segments (thinking-block, tool-call, tool-result, output-chunk) using the existing marker patterns. Memoize per task ID with a single unified throttle (~200ms).
- [ ] 4.3 Build the Activity Feed container that renders the parsed event list sequentially for the `focusedTask`. Bind auto-scroll to this single container.
- [ ] 4.4 Wrap thinking-block and tool-call/tool-result events in optionally collapsible cards. Render output-chunk events as plain text blocks appended inline.

## 5. Cleanup and Verification

- [ ] 5.1 Remove orphaned tab-tracking side effects, `watch` implementations, and the dual throttle maps (`formattedThinkingThrottles`, `displayedOutputThrottles`) — replaced by the unified per-task throttle in 4.2.
- [ ] 5.2 Remove `taskFolded`-related template logic (fold toggle buttons, conditional rendering).
- [ ] 5.3 Update `AppRightPanel.vue` if the `TranslationProgress` component interface changes (e.g., new props, removed events).
- [ ] 5.4 Run `bun run type-check` and `bun run lint` to enforce Vue and TS correctness.
- [ ] 5.5 Manually verify that the Activity Feed auto-scroll behavior (`toggleAutoScroll`) works as expected in the new unified container during active translation.
