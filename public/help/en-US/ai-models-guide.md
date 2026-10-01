# 🤖 AI Model Configuration {#ai-models-guide-section-1}

This guide covers the current AI model page and model dialog.

---

## 📋 Page features {#ai-models-guide-section-2}

### Desktop {#ai-models-guide-section-3}

The **AI model workspace** has three areas:

- **Header**: search by name, provider, model ID, or default task; Add AI model; model counts below.
- **Model list**: grouped by OpenAI or Google Gemini, with total and enabled counts. Cards support **Duplicate** (disabled initially), **Edit**, and **Delete** (confirmation required, with undo).
- **Task routing**: defaults for translation, proofreading/polishing, terminology translation, and the assistant. These settings are included in import/export.

### Mobile {#ai-models-guide-section-4}

- AI models title and Add button.
- With no models, an introductory card explains the two steps: add a connection, then select default tasks.
- **My models**: provider groups with total/enabled counts. Tap a model to edit.
- **Default task models**: tap a task to select from a bottom sheet. Choose **Not set** to leave it without a default.
- The model dialog is a bottom sheet with the same fields as desktop.

---

## 🏢 Supported providers {#ai-models-guide-section-5}

Built-in providers:

- `OpenAI` (OpenAI-compatible APIs)
- `Gemini` (Google Gemini)

Both use the Vercel AI SDK: `@ai-sdk/openai-compatible` for OpenAI and `@ai-sdk/google` for Gemini.

> For DeepSeek, Moonshot, OpenRouter, Ollama, or another compatible service, choose OpenAI and enter its `baseUrl` and model ID. A domain-only URL automatically gains `/v1`; enter the full path if the service uses a different endpoint.

---

## ➕ Add a model {#ai-models-guide-section-6}

Choose **Add AI model** and fill in:

1. **Enable model**
2. **Use CORS proxy** (Web only; see below)
3. **Model name** (required)
4. **Temperature** (0–2)
5. **Provider** (OpenAI / Gemini)
6. **API key** (required)
7. **Base URL**:
   - OpenAI: required
   - Gemini: hidden; uses Google's endpoint
8. **Model ID** (required; select or type)
9. **Reasoning level** (optional)
10. **Model information**: context window and maximum output tokens
11. **Custom headers** (optional)
12. **Default tasks**

Once the API key and, for OpenAI, Base URL are valid, the model list loads automatically. Use **Refresh list** to reload it. You can also type a model ID absent from the list, including through an input method.

Closing with unsaved changes asks you to continue editing or discard the changes.

---

## ⚙️ Model information and connection testing {#ai-models-guide-section-7}

**Get model information** queries only the bundled [models.dev](https://models.dev) catalog. It works offline, does not generate model output, and needs no API key. For an unknown model, it asks you to enter limits manually without clearing existing values.

- **Context window**: input limit; 0 means unset.
- **Maximum output tokens**: response limit; 0 means unset.
- Catalog values are labeled models.dev; manually edited values are labeled manual and take priority for runtime budgets.
- Reasoning suffixes such as `gpt-6-sol(high)` are ignored only for catalog matching. Requests retain the original model ID.
- Values obtained by asking a model about itself in older versions are replaced at runtime by catalog values when available. Edit a value manually once to keep your own limit.

The context window determines when chat and import assistants compress older conversation. Without a configured window, proactive compression is disabled; one recovery attempt is made after a provider context-limit error. See [Chat assistant](./chat-assistant-guide.md).

**Test connection** sends a short request using the current unsaved URL, key, headers, proxy, and reasoning level. It reports success/failure and elapsed time. Enter the model ID and API key first, plus a Base URL for OpenAI. Testing waits up to 30 seconds, consumes a little API usage, and neither changes model limits nor saves configuration. Editing or closing cancels the test; old results do not apply to a new configuration.

---

## 🧠 Reasoning level {#ai-models-guide-section-8}

Options include Default (model behavior), Off/minimum, Very low, Low, Medium, High, and Very high. Default leaves provider settings untouched; older models without this field behave as before. Higher levels usually increase response time and token usage. Support varies by model; test the selected combination.

The setting is saved, imported/exported, and synced with the model. It applies to chat, translation, polishing, proofreading, terminology, and context summaries. OpenAI-compatible services use reasoning effort; the SDK converts Gemini settings to a level or budget appropriate to the model.

---

## 🌐 Network and proxy {#ai-models-guide-section-9}

These settings apply to both providers, including model listing, generation, and connection testing.

### CORS proxy {#ai-models-guide-section-10}

Each model controls its proxy independently:

- **Use CORS proxy** is on by default and forwards requests through the proxy server.
- Turn it off for local services such as Ollama, self-hosted services with CORS configured, or endpoints that do not need a proxy.
- The switch applies only to Web. Electron always connects directly.

### Custom HTTP headers {#ai-models-guide-section-11}

Headers can provide:

- Additional authentication, such as a bearer token or custom auth header
- API gateway routing
- Service-specific parameters

To configure:

- Choose **Add header**.
- Enter **Header name** and **Header value**.
- Add several pairs if needed. Rows with an empty name are not saved.
- Delete unused rows.

---

## 🎯 Default task settings {#ai-models-guide-section-12}

Mark a model as eligible for each task and set a separate temperature:

- Translation
- Proofreading/polishing (one shared task option)
- Terminology translation
- Assistant

> Eligibility controls whether the model appears in that task's default selector. The actual model is chosen under **Task routing**, called Default task models on mobile.

---

## 📚 Book model overrides {#ai-models-guide-section-13}

The AI model page sets global defaults. For a book needing a different style, capability, or cost, open **Book details → Settings → Translation settings** to override:

- Translation model
- Proofreading/polishing model

Priority: **valid enabled book override → global task default**. A disabled/deleted override silently falls back to the global default. Book settings retain an invalid-selection placeholder so you can replace it.

Overrides do not affect terminology, chat, or explanation tasks. See [AI translation](/help/book-details-translation#book-details-translation-section-18).

---

## 🔍 Search and display {#ai-models-guide-section-14}

Search filters:

- Model name
- Provider (OpenAI / Gemini)
- Model ID
- Default task labels

Desktop cards show:

- Provider and model ID
- Enabled/disabled status
- Temperature, context window, and maximum output
- Masked API key prefix
- Base URL
- Default task summary

API keys are stored in plaintext in local IndexedDB:

- With CORS proxy enabled, requests and keys pass through the proxy to the provider.
- Gist sync uploads keys with model configuration. See [Settings](./settings-guide.md).

---

## 💡 Suggestions {#ai-models-guide-section-15}

1. Set an assistant default before using chat.
2. Get model information, test the connection, then save a new model.
3. Use separate temperatures for translation and proofreading/polishing.
4. Test changes on a duplicate, such as a different reasoning level, before enabling it.
5. Remove unused models to keep selectors manageable.

---

## ❓ Frequently asked questions {#ai-models-guide-section-16}

**Q: Why does Gemini have no Base URL?**

A: It uses Google's default endpoint. Custom headers and the CORS switch still apply.

**Q: Why is there no catalog record?**

A: The model is absent from the bundled catalog, often for a self-hosted or newly released model. Enter limits from the provider's documentation; current values are retained.

**Q: What if testing fails?**

A: Check the URL, key, and model ID. On Web, try the CORS switch. For reasoning-parameter errors, reset reasoning to Default and test again.

**Q: Why can't I use a duplicate immediately?**

A: Duplicates are disabled initially. Edit and enable the copy.

**Q: Why is the assistant send button disabled?**

A: Usually no assistant default or usable assistant model is configured.

**Q: Can I undo deletion?**

A: Use Undo while the success notification is visible.
