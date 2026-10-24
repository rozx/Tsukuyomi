# 🤖 AI Model Configuration {#ai-models-guide-section-1}

This guide covers the current AI model page and model dialog.

---

## 📋 Page features {#ai-models-guide-section-2}

### Desktop {#ai-models-guide-section-3}

The **AI model workbench** has three areas:

- **Header**: search by name, provider, model ID, or default task; Add AI model; model counts below.
- **Model list**: grouped by OpenAI, Google Gemini, or Anthropic Claude, with total and enabled counts. Cards support **Duplicate** (disabled initially), **Edit**, and **Delete** (confirmation required, with undo).
- **Task routing**: defaults for translation, proofreading/polishing, terminology translation, and the assistant. "Select automatically" in the dropdown means no explicit choice. These settings are included in import/export.

Task defaults also sync through Gist with the app settings. Each task's choice merges by its own modification time, so editing other settings does not override it. If the chosen model has not synced to this device yet or was deleted, the choice is kept. Meanwhile the desktop dropdown shows "Select automatically", while the tablet/mobile picker shows the fallback model actually used (the first enabled model that supports the task), or "Unset" if there is none. The choice comes back once the model arrives. The choice is cleared only when that model is disabled or no longer used for the task.

### Mobile {#ai-models-guide-section-4}

- AI models title and Add button.
- With no models, an introductory card explains the two steps: add a connection, then select default tasks.
- **My models**: provider groups with total/enabled counts. Tap a model to edit.
- **Task defaults**: tap a task to select from a bottom sheet. Choose **Unset** to leave it without a default. Choices also sync through Gist; while the chosen model has not synced to this device, the task temporarily shows the fallback model (or **Unset** if no model is available). See the desktop notes above.
- The model dialog is a bottom sheet with the same fields as desktop.

---

## 🏢 Supported providers {#ai-models-guide-section-5}

Built-in providers:

- `OpenAI` (OpenAI-compatible APIs)
- `Gemini` (Google Gemini)
- `Anthropic` (Anthropic Claude, since v0.19.0)

All three use the Vercel AI SDK: `@ai-sdk/openai-compatible` for OpenAI, `@ai-sdk/google` for Gemini, and `@ai-sdk/anthropic` for Anthropic.

With Anthropic, tool definitions, the system prompt, and conversation history use Anthropic prompt caching, so content resent during long conversations and tool loops costs less.

> For DeepSeek, Moonshot, OpenRouter, Ollama, or another compatible service, choose OpenAI and enter its `baseUrl` and model ID. A domain-only URL automatically gains `/v1`; enter the full path if the service uses a different endpoint.

---

## ➕ Add a model {#ai-models-guide-section-6}

Choose **Add AI model** and fill in:

1. **Enable model**
2. **Use CORS proxy** (Web only; see below)
3. **Model name** (required)
4. **Send temperature** (switch, on by default; see below)
5. **Temperature** (0–2; hidden when "Send temperature" is off)
6. **Provider** (OpenAI / Gemini / Anthropic (Claude))
7. **API key** (required)
8. **Base URL**:
   - OpenAI: required
   - Gemini: hidden; uses Google's endpoint
   - Anthropic: optional; leave empty to use the official endpoint `https://api.anthropic.com/v1`
9. **Model ID** (required; select or type)
10. **Thinking level** (optional)
11. **Model information**: context window and maximum output tokens
12. **Custom headers** (optional)
13. **Default tasks**

Once the API key and, for OpenAI, Base URL are valid, the model list loads automatically. Use **Refresh list** to reload it. Toggling **Use CORS proxy** also reloads the list with the new setting and aborts any unfinished earlier request. The Anthropic model list also brings in the context window and maximum output. You can also type a model ID absent from the list, including through an input method.

### Send temperature {#ai-models-guide-section-17}

Some newer models (such as Claude 4.7 and later) no longer accept a temperature parameter and return an error when they receive one. With **Send temperature** off:

- No task sends a temperature for this model; the temperature slider and the per-task temperatures under **Default tasks** are hidden.
- The model card shows the temperature as "Not sent".

Changing the model ID in the dialog to Claude 4.7 or later (including Fable and Mythos, and the OpenRouter `anthropic/…` and Bedrock `anthropic.…` forms) turns this switch off automatically; opening a saved model does not change its existing setting. With the Anthropic provider, temperature is never sent to these models, even if the switch is still on. Models saved by older versions have no such setting and are treated as on.

Closing with unsaved changes asks you to continue editing or discard the changes.

---

## ⚙️ Model information and connection testing {#ai-models-guide-section-7}

**Fetch model information** queries only the bundled [models.dev](https://models.dev) catalog. It works offline, does not generate model output, and needs no API key. For an unknown model, it asks you to enter limits manually without clearing existing values.

- **Context window**: input limit; 0 means unset.
- **Maximum output tokens**: response limit; 0 means unset.
- Catalog values are labeled models.dev; manually edited values are labeled manual and take priority for runtime budgets.
- Reasoning suffixes such as `gpt-6-sol(high)` are ignored only for catalog matching. Requests retain the original model ID.
- Values obtained by asking a model about itself in older versions are replaced at runtime by catalog values when available. Edit a value manually once to keep your own limit.

The context window determines when chat and import assistants compress older conversation. Without a configured window, proactive compression is disabled; one recovery attempt is made after a provider context-limit error. See [Chat assistant](./chat-assistant-guide.md).

**Test availability** sends a short request using the current unsaved URL, key, headers, proxy, and thinking level. It reports success/failure and elapsed time. Enter the model ID and API key first, plus a Base URL for OpenAI. Testing waits up to 30 seconds, consumes a little API usage, and neither changes model limits nor saves configuration. Editing or closing cancels the test; old results do not apply to a new configuration.

---

## 🧠 Thinking level {#ai-models-guide-section-8}

Options include Default (model behavior), Off/minimum, Very low, Low, Medium, High, and Very high. Default leaves provider settings untouched; older models without this field behave as before. Higher levels usually increase response time and token usage. Support varies by model; test the selected combination.

The setting is saved, imported/exported, and synced with the model. It applies to chat, translation, polishing, proofreading, terminology, and context summaries. OpenAI-compatible services use reasoning effort; the SDK converts Gemini settings to a level or budget appropriate to the model. For Anthropic, Claude 4.6 and later use adaptive thinking with the effort set by level, while 4.5 and earlier convert the level to a thinking budget; thinking summaries appear in the thinking process.

---

## 🌐 Network and proxy {#ai-models-guide-section-9}

These settings apply to OpenAI, Gemini, and Anthropic, including model listing, generation, and connection testing.

### CORS proxy {#ai-models-guide-section-10}

Each model controls its proxy independently:

- **Use CORS proxy** is on by default and forwards public API requests through the configured proxy server.
- Same-origin URLs, local services such as Ollama (`localhost`, `127.x.x.x`), and LAN addresses (such as `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `*.local`) always connect directly, even with "Use CORS proxy" on.
- Turn it off for public self-hosted services with CORS configured or endpoints that do not need a proxy.
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

Mark a model as eligible for each task and set a separate temperature (task temperatures are hidden when "Send temperature" is off):

- Translation
- Proofreading/polishing (one shared task option)
- Terminology translation
- Assistant

> Eligibility controls whether the model appears in that task's default selector. The actual model is chosen under **Task routing**, called **Task defaults** on mobile.

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
- Provider (OpenAI / Gemini / Anthropic)
- Model ID
- Default task labels

Desktop cards show:

- Provider and model ID
- Enabled/disabled status
- Temperature ("Not sent" when "Send temperature" is off), context window, and maximum output
- Masked API key prefix
- Base URL
- Default task summary

API keys are stored in plaintext in local IndexedDB:

- With CORS proxy enabled for public API requests, requests and keys pass through the proxy to the provider.
- Gist sync uploads keys with model configuration. See [Settings](./settings-guide.md).

---

## 💡 Suggestions {#ai-models-guide-section-15}

1. Set an assistant default before using chat.
2. Use **Fetch model information** and **Test availability**, then save a new model.
3. Use separate temperatures for translation and proofreading/polishing.
4. Test changes on a duplicate, such as a different thinking level, before enabling it.
5. Remove unused models to keep selectors manageable.

---

## ❓ Frequently asked questions {#ai-models-guide-section-16}

**Q: Why does Gemini have no Base URL?**

A: It uses Google's default endpoint. Custom headers and the CORS switch still apply.

**Q: Does Anthropic need a Base URL?**

A: No. Leave it empty to use the official endpoint `https://api.anthropic.com/v1`; enter an address only when accessing through a gateway compatible with the Anthropic API.

**Q: A request fails saying temperature is not supported?**

A: That model does not accept a temperature parameter. Edit the model, turn off "Send temperature", and save.

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
