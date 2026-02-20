## 1. Data Model Update

- [x] 1.1 Update `AIModel` interface in `src/services/ai/types/ai-model.ts` to include `customHeaders?: Record<string, string>`.

## 2. UI Updates (AIModelDialog.vue)

- [x] 2.1 Initialize `customHeaders` in the `formData` default state in `src/components/dialogs/AIModelDialog.vue` with an empty default object. Update the `watch` effect for `props.visible` to cleanly populate `formData.value.customHeaders` when editing.
- [x] 2.2 Add UI elements (inputs for Key/Value pairs, "Add" and "Delete" buttons) inside a new "Advanced Options" structure within the `AIModelDialog.vue` template.
- [x] 2.3 Ensure the `testModel` function captures and sends the `customHeaders` correctly via the temporary `AIModel` object it creates.
- [x] 2.4 Verify that form saving includes the updated `customHeaders` object properly in the emitted `save` event data.

## 3. Provider Integration

- [x] 3.1 Modify `src/services/ai/providers/openai-provider.ts` so that when instantiating `ChatOpenAI`, the `customHeaders` property is properly passed into the configuration (e.g., typically via `configuration.defaultHeaders` or `configuration.baseOptions.headers`).
- [x] 3.2 Modify `src/services/ai/providers/gemini-provider.ts` so that when initializing the `ChatGoogleGenerativeAI` client, `customHeaders` are attached to requests. If necessary, provide a customized `fetch` function that applies these headers manually to the underlying HTTP calls.
