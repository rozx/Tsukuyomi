# 📚 Chapter Management {#book-details-chapters-section-1}

This guide describes volumes and chapters in book details.

## 📖 Structure {#book-details-chapters-section-2}

- **Volumes** organize chapters.
- **Chapters** must belong to a volume.

The contents panel supports create, edit, delete, expand/collapse, and chapter dragging.

## ➕ Create a volume {#book-details-chapters-section-3}

1. Choose New volume in Contents.
2. Enter the title.
3. Add it.

The volume is appended. Creation asks only for source title; add a translated title later through Edit volume.

## ➕ Create a chapter {#book-details-chapters-section-4}

1. Choose New chapter.
2. Select a volume and enter a title.
3. Add it.

- Create a volume first if none exists.
- The chapter is appended to the selected volume.
- Creation contains volume/title only, not body or translated title.

## ✏️ Edit a volume {#book-details-chapters-section-5}

Use its edit button to change:

- Source title
- Optional translated title

Display follows current title rules. Volume/chapter translations are stored by book target; missing target titles show source. Changing source title invalidates all its language translations. Editing one translation preserves other slots. Reopen the form if target changes while editing.

## ✏️ Edit a chapter {#book-details-chapters-section-6}

- Source title
- Optional translated title
- Volume
- Chapter translation/polishing/proofreading instructions

Changing volume through the dialog moves the chapter to the destination's end. Chapter instructions override same-type book instructions for this chapter.

## 🗑️ Delete a volume {#book-details-chapters-section-7}

Choose Delete and confirm. All chapters in it are deleted too. This operation cannot be undone; the dialog explains the effect.

## 🗑️ Delete a chapter {#book-details-chapters-section-8}

Choose Delete and confirm. It is removed from its volume and cannot be undone.

## 🔄 Drag chapters {#book-details-chapters-section-9}

- Reorder within a volume.
- Move to a position in another volume.

The dragged chapter becomes translucent; destination rows/lists highlight.

## 📂 Expand/collapse volumes {#book-details-chapters-section-10}

Use the arrow beside a volume title. Expansion state is saved locally per book.

## 👀 List indicators {#book-details-chapters-section-11}

- Selected chapter highlights.
- Hover reveals edit/delete.
- Legacy summaries, if present, have an info icon with a preview.

## 🔄 Check updates and website import {#book-details-chapters-section-12}

Both use the same **sync workspace**. It replays the book's source recipe, lists changes, and writes only after your confirmation.

Entries:

- **Desktop/tablet update**: sidebar Settings → Check updates, route `/books/:id/settings/update`.
- **Mobile update**: Check updates in the book overview, displayed full-screen with a Back control.
- **New book**: Import from website on Home/Books, or Fetch from website in the new-book dialog, opens `/books/new/web`. Enter a contents URL and Check; `?url=` starts checking automatically. Fetch from website while editing opens the current book's update workspace.

Workspace:

- **Source**: site and contents URL, with Recheck. Recipe details show extraction/cleanup. Legacy built-in books without a recipe can use site rules.
- **Conclusion**: Up to date or counts of new/revised chapters, plus imported/unchanged-by-date/uncompared/skipped counts. No changes means no chapter list or apply bar.
- **New chapters**: checked initially and grouped by destination volume. Change destination volume to an existing/new volume; preview each body.
- **Revisions**: added/changed/deleted paragraph counts and all-language translation versions to clear. Inspect differences. Revised chapters are never checked automatically. Changed source clears all language versions/selections; unchanged paragraphs retain them.
- **Quick check**: reads contents only, without fetching existing bodies. Built-in update dates classify unchanged, possibly revised, or uncompared chapters.
- **Compare bodies**: check chapters individually with progress and cancellation. Completed comparisons remain. An unchanged result records the site's date for future checks. Firecrawl throttling shows an approximate wait. Blank-line-only differences are not revisions.
- **Manual chapters**: title or position between linked chapters can match a contents entry and record its URL; unmatched entries remain new.
- **Widespread differences**: when at least five chapters are compared and more than half changed, a warning suggests site changes or a stale recipe. Inspect samples first.
- **Skip**: unwanted chapters remain Skipped in future checks. Expand that group to undo a skip.

Apply:

1. Choose Apply to book or Apply and create book. Review added/updated chapter counts, cleared versions, and new volumes.
2. Busy books reject application with a reason. Book changes after confirmation require recalculation and another confirmation.
3. Failed fetches are listed separately; successful chapters are written and failed ones can be retried.
4. Undo is available within the session or notification, unless the book has subsequent changes. Creation opens the new book.

When replay is unavailable:

- **Unsupported website**: Hand over to AI importer creates a task with the URL and opens the workspace without starting it.
- **Missing/invalid recipe**: inspect the reason and choose Build/Repair recipe with AI importer. It opens an unfinished repair task or creates one, prefilled but not running. After self-test and confirmed import, updates work again. No apply/list appears while the recipe is unusable.
- AI website imports save a recipe for later checks. See [AI import](/help/import-guide).
- If AI import is disabled in the current build, its entries are hidden; built-in site creation/checking still works.

---

## ❓ Frequently asked questions {#book-details-chapters-section-13}

### Why can't I add a chapter? {#book-details-chapters-section-14}

Create at least one volume first.

### What happens when I delete a volume? {#book-details-chapters-section-15}

Its chapters are deleted too, without undo.

### Can I drag volumes? {#book-details-chapters-section-16}

Only chapter dragging is supported.
