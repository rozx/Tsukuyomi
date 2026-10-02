# 📥 AI Import Workspace {#import-guide-section-1}

Give Tsukuyomi novel URLs or files and explain what to import. The assistant reads source text and organizes volumes/chapters. You review the draft before putting the book in your library.

The workflow is **Add sources → Chat → Review draft → Confirm import**. Ready for preview means the novel is still outside the library; only final confirmation writes it.

## Before starting {#import-guide-section-2}

Set an **Assistant** default under [AI models](/help/ai-models-guide). The import workspace uses it for conversation and organization.

Open **AI import** (`/import`):

| Device  | Entry                                                                                                         |
| :------ | :------------------------------------------------------------------------------------------------------------ |
| Desktop | AI import in the left rail                                                                                    |
| Tablet  | AI import in the left rail; task list in the workspace's Tasks tab                                            |
| Mobile  | AI import in the side menu; opening a task starts in Chat, also reachable through the bottom Tsukuyomi button |

Desktop/tablet chat appears on the right, with Sources, Volume/chapter draft, and Import plan in the workspace. Mobile calls them Sources, Draft, and Plan. This guide uses the desktop names.

## First import: an EPUB {#import-guide-section-3}

Follow these steps with an EPUB. URL, TXT, and Markdown examples appear below.

### 1. Create a task and add the file {#import-guide-section-4}

Choose **New task** or **New import task** on an empty page. One task organizes one novel; several files from the same book can share a task.

Open Sources and choose **Choose files**, or drag the EPUB into the source area. A new source shows **Not read yet** until you send a request.

### 2. Explain the goal {#import-guide-section-5}

For example:

> Import this EPUB as a new novel. Use its contents to organize volumes and chapters, retaining the prologue and afterword. Tell me if any chapters are missing.

The conversation shows source reading, extraction, and draft operations. After identifying the book, the assistant names the task. You can rename it at the top; your manual name is retained.

If asked which book the files belong to or which work to choose, reply before processing continues. Use Pause at the top to stop temporarily.

### 3. Check metadata, contents, and source text {#import-guide-section-6}

When organization finishes, open Volume/chapter draft:

1. In Basic information, check title, author, description, and tags. Import to should be New novel. You can edit these fields.
2. Review Metadata candidates and choose Adopt only after checking them. These include author, description, cover, and tags.
3. Check volume/chapter names and order. Checkboxes control inclusion; edit names or move chapters up/down or between volumes.
4. Use the eye icon, Inspect source, on at least the first, middle, and last chapter. Check both ends and look for contents/navigation text mixed into the body. Use Show more for long chapters.

Report a problem with a clear scope:

> Chapter 3 of volume 2 starts with contents text. Remove that text while preserving the chapter body. Leave the other chapters alone for now.

The assistant reads your draft edits. If simultaneous changes conflict, reload the latest draft before continuing.

### 4. Generate a plan {#import-guide-section-7}

Open Import plan and choose Generate import plan, or inspect the plan already generated. Wait for the current run, pause it, or answer its question first.

Check:

- Whether it creates or updates the correct book
- Included chapter count, partial-import marker, and missing range
- Counts of added, revised, moved, and deleted paragraphs
- Whether an update clears translations and how many versions are affected

For Pending items, choose chapter matches or confirm replacement. Draft edits make a plan Outdated; regenerate and review it. Changes to the target book also require regeneration.

### 5. Confirm and open {#import-guide-section-8}

When the plan is Ready to import, choose Confirm import. The confirmation dialog repeats the target, chapter count, and translation impact. Review them and confirm again.

After Imported appears, choose Open novel to read or translate.

A new book's target is the interface language at the final write, not at task startup or preview. Updates retain the existing target. Change the target later in book translation settings. Source language is unrestricted and may vary within a book.

## Other source types {#import-guide-section-9}

### Novel websites {#import-guide-section-10}

Paste an HTTP/HTTPS contents URL in Sources and choose Add URL. Individual chapter URLs also work. For example:

> Import only volume 1 in website order. Leave volume 2 for later. List chapters whose source could not be retrieved.

The assistant checks the contents and samples chapters before batch extraction. A batch is limited to 500 chapters; longer works need several batches. Discovered chapter links appear as assistant-discovered sources without manual entry.

Login, CAPTCHA, or script-only sites may be unreadable. Save missing chapters as files and add them to the same task, identifying their chapters. Retrieved text is retained.

### Split a complete TXT {#import-guide-section-11}

Explain the actual heading format, for example:

> This TXT is one complete novel. Split at standalone headings such as “Chapter 1 Departure,” retaining the full heading. List the opening description and prologue separately so I can choose whether to include them.

The assistant previews the split before creating the draft. Check counts, repeated headings, empty chapters, and text before chapter 1. Unclassified text remains as an unchecked draft chapter; check it if you want the prologue.

Provide real heading examples for complex formats. Regular expressions are supported. Each split handles at most 500 chapters.

### Markdown heading levels {#import-guide-section-12}

For example:

> Level-one headings are volumes and level-two headings are chapters. Preserve the text and paragraph order within chapters.

Heading detection ignores code blocks. Volume headings must use a higher level than chapter headings.

### Several files or a folder {#import-guide-section-13}

Select several files at once, or use Select folder when available. Otherwise use multiple file selection. HTML files are supported too.

Explain their relationship:

> These files belong to one book. Leading filename numbers give chapter order. Combine them into a new novel and ask me about chapters whose order is uncertain.

If several works are mixed together, choose one before continuing. Other extensions are parsed by content where possible; the result determines whether they can be read.

## Refine the draft {#import-guide-section-14}

### Remove noise and standardize headings {#import-guide-section-15}

Specify the range and change:

> Remove standalone “Back to contents” lines in volume 1. Keep all other text.

> Remove the website name at the end of selected chapter titles, retaining numbers and titles.

Cleanup can remove matching fragments or whole lines; volume/chapter titles support batch replacement. The assistant previews hit counts and examples before applying, with a maximum of 500 items per batch. Review operation details in chat. Cleanup removes source noise rather than generating new novel text.

A changed draft requires a fresh cleanup preview. Regenerate the import plan after editing.

### Author, description, cover, and tags {#import-guide-section-16}

Edit title, author, description, and tags in Basic information. Press Enter to add a tag; duplicates and outer whitespace are removed. Website/EPUB tags can become candidates.

For online metadata, configure Tavily or keep keyless Firecrawl fallback enabled in [Settings](/help/settings-guide), then ask:

> Find the author, description, and cover, and list sources for me to review.

Found data appears as candidates; Adopt moves it into the draft. Fields with Write to library on import can be included or omitted. Import can proceed without search by entering metadata manually.

Search supplements metadata, not missing novel text. Add a URL to Sources when its body should be used.

### Deleting a source versus draft chapters {#import-guide-section-17}

Deleting a source also removes derived source entries, but generated draft chapters and saved body references remain. Re-add it to fetch again.

Uncheck an unwanted chapter to exclude it. Delete draft chapter removes it from the task; Clear volumes/chapters resets the draft structure. These actions operate on the task draft.

## Add chapters to an existing book {#import-guide-section-18}

Add URLs/files, select the existing book under Draft → Basic information → Import to, and explain:

> These are chapters 11–15 of the book in my library. Add them, check for duplicates, and retain existing chapters.

An assistant target suggestion requires Adopt suggestion. Check the target and matches when asked to confirm an update.

Review create/update status and translation impact:

- Unchanged source retains all language versions and selections, including when paragraphs move between chapters.
- Revised source clears all language versions and selections for that paragraph. The plan reports the full affected version count.
- Existing chapters absent from this source are retained.

Providing chapters 11–15 therefore keeps 1–10. Inspect revisions before deciding to apply.

### Import the successful portion {#import-guide-section-19}

For missing chapters:

> Organize the chapters already retrieved and list the missing ones. I will import only the successful portion now.

The plan marks Partial import, showing retrieved and missing ranges. If total contents are unverified, completeness remains unconfirmed. Review and confirm the intended portion.

Add missing files to the same task later and keep the same target. Matched unchanged chapters are not duplicated and retain translations.

## Update a serialized website novel {#import-guide-section-20}

An Update recipe records contents URL, body extraction, and cleanup. Once saved, use Check updates in book details instead of reorganizing the book.

For example, after importing chapters 1–20, use Check updates when chapter 21 appears. See [Chapter management](/help/book-details-chapters).

### Recipe status before import {#import-guide-section-21}

The assistant tests saved contents/chapter pages against the draft. Self-test uses saved pages rather than accessing the site again.

- **Add/Replace**: confirmation saves the recipe. Reproducible shows the verified chapter count.
- **Keep existing**: retain the book's prior recipe.
- **Stale**: inspect the reason, ask for repair, and regenerate. You may import chapters without saving the invalid recipe; the old recipe remains.

After cleaning navigation text, ask:

> Add the same cleanup to the update recipe, rerun its self-test, and regenerate the plan.

Draft chapters unchecked for a recipe are recorded as Skipped for future checks. Contents entries never added to the draft are not automatically skipped. Saving a recipe puts its contents URL first in book source URLs.

### Rebuild or repair {#import-guide-section-22}

Choose Build/Repair recipe with AI importer in Check updates. It opens an unfinished repair task for the book, or creates one, prefilled with target, contents source, and problem description.

Review and send the input to start. Check and confirm the resulting plan. A recipe-only update is possible without new chapters.

### Unsupported recipe structures {#import-guide-section-23}

A recipe requires one-to-one mapping between website entries and imported chapters. Splitting one page into several chapters, combining chapters, or a whole-volume page cannot produce this recipe type. Deliberate manual edits can remain as Fixed text, up to 20% of chapters.

Built-in sites such as Syosetu, Kakuyomu, and Hameln use their site contents rules while verifying body extraction from this import. Undo also restores the recipe and source URLs.

## Pause, continue, and undo {#import-guide-section-24}

### Continue later {#import-guide-section-25}

Choose Pause and wait for Paused. Completed extraction and draft changes remain. Open the original task later and choose Continue organizing/Continue execution, or send a new instruction.

Reloading or closing does not run or import automatically. Sources, draft, chat, and questions are stored on this device. The workspace must remain open to execute; tasks cannot continue on another device and are not cloud-synced. Applied books sync normally.

Checkpoints retain the execution's startup interface language through pause, restart, and compression. Legacy checkpoints use Simplified Chinese. Interface changes affect new executions; a newly created book still uses the interface language at the final write.

Only one import task runs at a time across tabs. Pause the active task before running another.

Long conversations compress older messages near the model window, retaining recent ones. Pending tool calls prevent compression. Use Compress conversation context to summarize manually. Saved sources/drafts do not depend on chat history.

### Undo an import {#import-guide-section-26}

In the original task's Plan → Import history, choose Undo and confirm:

- A newly created novel and its body are deleted.
- An updated novel restores prior metadata, volumes, chapters, source, all language translations, and selections.

Later translation, edits, sync downloads, or another import prevent whole-operation undo. Read-only viewing does not. Deleted books or already undone receipts are also unavailable; the UI explains why.

Deleting the task removes sources, chat, extraction, and undo records. Applied books remain, but task-based undo is no longer possible.

## Understanding messages {#import-guide-section-27}

| Situation                              | Next step                                                                                                                  |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| Unread                                 | Send an import request or Continue organizing; adding a source does not read it immediately                                |
| Inspected, no body                     | Continue organizing to extract chapters                                                                                    |
| Extracted                              | Check counts, order, and body in Draft, then generate a plan                                                               |
| Excluded                               | Specify the source if it should be used                                                                                    |
| Processing/extraction failed           | Read the reason. Retry only failed chapters for temporary errors; use files for login/verification pages                   |
| Waiting for answer                     | Reply in chat                                                                                                              |
| Ready for preview, absent from library | Inspect/generate the plan and Confirm import                                                                               |
| Completeness unconfirmed               | Verify contents further or review a partial import                                                                         |
| Confirm disabled                       | Wait/pause, answer questions, handle pending items, or regenerate an outdated plan. No changes means nothing needs writing |
| Target busy                            | Wait for translation, polishing, proofreading, or assistant writes, including final saves after stopping                   |
| Storage failure                        | Recover storage before closing; latest progress may be unsaved                                                             |
| Database upgrade blocked               | Close other app tabs and reload                                                                                            |

During apply/undo, new translation tasks for that book are temporarily blocked. Other books and read-only operations remain available.

Web Locks are required for execution, confirmation, and undo. Desktop allows one instance per data directory; launching again focuses the existing window.

Split oversized files into smaller ones. Environments without workers have lower limits. Exceeding a limit reports an error rather than presenting truncated text as complete.
