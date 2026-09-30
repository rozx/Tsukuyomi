# 💬 Tsukuyomi Chat Assistant {#chat-assistant-guide-section-1}

The assistant is named **Tsukuyomi (月詠)**, the moonlit scholar who represents this application. She answers questions and manages data within the current book's context. In Chinese, she refers to herself as 月詠 or 妾身 and addresses you politely as 您.

This persona applies to Simplified and Traditional Chinese conversations. English uses neutral professional language. Each new execution generates explanations and tool feedback in the interface language captured at startup, and book translations in its captured target. Changes during execution affect the next execution; pausing and continuing within a session retains the original languages.

---

## ✨ About Tsukuyomi {#chat-assistant-guide-section-2}

Tsukuyomi is a calm, learned priestess of the moon. Her normally composed tone occasionally gives way to a brief appreciation of a subtle source passage or an elegant translation.

**Chinese persona details**

- A chapter may end with a brief statement that proofreading is complete.
- Thoughtful remarks may trail off with an ellipsis.
- Praise receives a short, modest response.
- Very occasionally (about 2%), surprise or excitement produces a brief 喵, immediately followed by a self-correction. This is her cat-eared bookworm trait.
- Mentions of her cat ears receive a shy deflection.

**Translation constraint**: saved text is a clean translation in the book's target language, without the assistant's persona. The persona affects conversation, explanations, tool feedback, thinking messages, and greetings. Tasks can reference source text and translations/names in their target language. User instructions, character descriptions, and memories are shared across targets and are not automatically translated.

---

## 🚀 Quick start {#chat-assistant-guide-section-3}

### Open or close {#chat-assistant-guide-section-4}

- Use the right-panel button in the toolbar (column icon / ✕).
- The panel initially shows Tsukuyomi. Select Translation progress to change panels.
- Drag the left edge to resize.

### Send a message {#chat-assistant-guide-section-5}

- Press `Enter` to send.
- `Shift + Enter` inserts a line break.
- Without an assistant default, the input area reports that no assistant model is configured.

---

## 🧠 Context and sessions {#chat-assistant-guide-section-6}

- The assistant reads the current book, chapter, and paragraph context.
- Sessions are saved independently. Create, clear, or switch recent sessions.
- Near the context limit, older conversation is compressed into a structured summary: goals, constraints/preferences, progress, decisions, questions/answers, next steps, and identifiers. Recent conversation remains intact. Compression is checked before sending, between tool steps, and after a provider context-limit error (one automatic retry). If summarization fails, the full history is retained and an error is shown.
- Context usage uses measured tokens returned by the provider, estimating only later additions. With no configured context window, proactive compression is disabled; recovery happens after a limit error.

The panel displays:

- Current context
- A collapsible todo area
- Context usage: `percentage · tokens / context window`. `≈` means an estimate without measured usage yet. Without a window, only tokens are shown.
- Random thinking messages, localized to the interface language

---

## ✨ Capabilities {#chat-assistant-guide-section-7}

### 1) Translation and language questions {#chat-assistant-guide-section-8}

- Explain vocabulary, syntax, tone, and honorific levels where applicable.
- Compare translations and styles.
- Explain puns, wordplay, and allusions.

### 2) Book data management {#chat-assistant-guide-section-9}

Available tools can read or modify data in the current book:

- Terms
- Character settings
- Memories
- Paragraphs and book information

### 3) Help documents {#chat-assistant-guide-section-10}

The assistant can:

- List help documents
- Search help documents
- Read a full document
- Navigate to a help page, optionally to a section

> Questions about application features can therefore be answered from the built-in guides.

---

## ✅ Asking useful questions {#chat-assistant-guide-section-11}

1. Ask directly; you need not repeat the book context.
2. Describe your goal, for example:
   - “Which translation fits this term better?”
   - “Help complete character A's speech-style description.”
   - “How do I configure Gist sync?”
3. For alternatives, ask for two or three versions and an explanation of the differences.

---

## ⚠️ Things to keep in mind {#chat-assistant-guide-section-12}

1. You decide the final translation.
2. Chat consumes provider usage.
3. Very long sessions can reduce response quality; start a new one when needed.
4. Review data changes after the assistant makes them.

---

## ❓ Frequently asked questions {#chat-assistant-guide-section-13}

**Q: Why is Send disabled?**

A: The input may be empty, or no assistant default is configured.

**Q: Why doesn't the assistant know the chapter?**

A: Select the book, chapter, or paragraph in the workspace first.

**Q: Can the assistant open a help document?**

A: Yes, through its help navigation tool.

**Q: Can the persona appear in saved translations?**

A: No. Saved translations use the book's target language without the assistant's voice.

**Q: How can I get more direct answers?**

A: Chinese uses the Tsukuyomi persona; English uses neutral professional wording. Ask for a brief answer when you want less explanation.

---

## Related guides {#chat-assistant-guide-section-14}

- [System bar](/help/toolbar-guide)
- [AI models](/help/ai-models-guide)
- [Settings](/help/settings-guide)
