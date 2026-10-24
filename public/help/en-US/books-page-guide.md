# 📚 Book Library Guide {#books-page-guide-section-1}

The book library manages all your projects, with search, sorting, import, editing, deletion, and favorites.

---

## 📖 Overview {#books-page-guide-section-2}

- **Search**: filter by title, alternate title, author, description, or tag.
- **Sort**: several options, with your previous choice remembered.
- **Add book**: manually, from a website, or from JSON.
- **Card actions**: favorite, check for updates, edit, and delete.
- **Check all for updates**: check every checkable book in the library for new chapters at once.
- **Pagination**: 10/20/50/100 books per page.

---

## 🔍 Search {#books-page-guide-section-3}

Search includes:

- Title
- Alternate titles (`alternateTitles`)
- Author
- Description
- Tags

Results update as you type. Use the clear button to reset the query.

---

## 🔄 Sort {#books-page-guide-section-4}

Available options:

- Default
- Title (A–Z)
- Title (Z–A)
- Created (newest)
- Created (oldest)
- Updated (newest)
- Updated (oldest)
- Chapters (most first)
- Chapters (fewest first)
- Word count (highest first)
- Word count (lowest first)
- Favorites first

> Your choice is saved in settings and restored when you return.

---

## ➕ Add and import {#books-page-guide-section-5}

### 1) Add manually {#books-page-guide-section-6}

Choose **Add book** to open the form.

Fields include title (required), alternate titles, author, description, tags, cover, website URL, and volume/chapter structure. Book instructions for translation, polishing, and proofreading are set in the book's Translation settings.

The target language is the interface language when the new book is actually saved. Website and AI imports follow the same rule. Change it later in the book's translation settings; switching the interface does not change existing books.

### 2) Import from a website {#books-page-guide-section-7}

Choose **Import from website** from the split-button menu to open `/books/new/web`. Enter a novel's contents URL (a chapter URL also works for built-in sites), check it, review the title, author, and description under New book details, and select chapters. You can skip chapters, move them to a new volume, or preview their source. Confirm to fetch the chapters with progress, create the book, and open it. See the website import/update section in [Chapter management](/help/book-details-chapters).

Built-in sites:

- `ncode.syosetu.com`
- `novel18.syosetu.com` (R18; age confirmation is handled automatically. Desktop injects the cookie and connects directly; Web uses an external proxy. Requires v0.15.0+.)
- `kakuyomu.jp`
- `syosetu.org`

Use **Hand off to the AI importer** in the workspace for other sites.

### 3) Import JSON {#books-page-guide-section-8}

Choose **Import JSON** and select a `.json` or `.txt` file.

Accepted structures:

- A single book object
- An array of books
- An object with a `novels` field
- An object with a `novel` field

The result shows success/failure counts and supports undo.

JSON import preserves the file's target and all language versions. Older files without language labels are restored as Simplified Chinese rather than reassigned to the current interface language.

---

## 🧱 Book cards {#books-page-guide-section-9}

Each card shows:

- Cover (click to open details)
- Title and author
- Chapter count, word count, creation time, and update time

Actions at the bottom:

- ⭐ Add/remove favorite
- 🔄 Check for updates (shown only for books from built-in sites or with a recorded update recipe)
- ✏️ Edit
- 🗑️ Delete

When updates are pending, the cover shows a "+N new" or "N changed" badge. See "Check for updates" below.

---

## 🔄 Check for updates {#books-page-guide-section-16}

You can check books for new chapters from the library without opening book details. Only books from built-in sites (see "Import from a website" above) or with a recorded update recipe can be checked.

### Check one book {#books-page-guide-section-17}

- Desktop: choose the 🔄 **Check for updates** button at the bottom of the card. Mobile: tap the 🔄 button on the card. Tablet: choose **Check for updates** in the book details on the right.
- Checking reads only the contents, not chapter bodies, and shows "Checking for updates…" while running. When it finishes, a notification shows "Updates found" (for example, "New chapters in “Title”: 3") or "Up to date". If the contents cannot be read with the saved rules, the notification asks you to fix it on the update page.
- With updates, the cover shows "+N new", or "N changed" (chapters updated on the site more recently than the local copy). Click the badge ("View updates") to open the book's update page, which reuses the check result you just got; select and apply chapters there.

### Check all for updates {#books-page-guide-section-18}

- **Check all for updates** in the library toolbar (a 🔄 icon button in the toolbar on mobile and tablet) checks every checkable book in turn (regardless of the search filter), up to 2 books at a time.
- While running, the button shows "Checked N / M"; click it again to cancel. When everything finishes, a single summary notification appears, such as "Updates found in 2 book(s)" or "Checked 8 book(s), no new chapters"; each book's badge updates as usual.
- The button is unavailable when the library has no checkable books.

### Saved results and repeated checks {#books-page-guide-section-19}

- Check results are stored on this device (not synced to the cloud), so badges remain after a page reload. After you import new chapters, skip chapters, or compare chapter bodies, badges shrink or disappear automatically based on the book's current content.
- To avoid triggering site rate limits, checking the same book again within 1 minute, or running **Check all for updates** again within 10 minutes, reuses the previous result. To force a fresh check, open the book's update page and choose **Check again**.
- Checks follow the same per-site queuing and pause rules; see "Website mappings" in [Settings](/help/settings-guide#settings-guide-section-12).

---

## ✏️ Edit a book {#books-page-guide-section-10}

Choose **Edit** to change book information and configuration.

Saving updates `lastEdited`; the notification provides undo.

---

## 🗑️ Delete a book {#books-page-guide-section-11}

Enter the book title to confirm deletion.

- The copy button copies the title and fills the confirmation field.

Since v0.14.4, both the input and title are normalized before comparison. These differences do not prevent a match:

- Leading/trailing whitespace
- Full-width (`U+3000`) and ordinary spaces
- Zero-width characters (BOM / ZWSP / ZWNJ / ZWJ), often found in scraped titles
- Equivalent Unicode NFC/NFD forms, such as decomposed Japanese voiced kana

Typing or copying works when these are the only differences. An empty book title never passes confirmation.

Deletion can be undone while the success notification remains visible.

---

## ⭐ Favorites {#books-page-guide-section-12}

Toggle the star to mark a favorite. Combine this with **Favorites first** to keep active projects at the top.

---

## 📋 View and pagination {#books-page-guide-section-13}

- A responsive grid adjusts its column count to the screen.
- The default page size is 20; choose 10/20/50/100.

---

## ❓ Frequently asked questions {#books-page-guide-section-14}

**Q: Why can't I find a book?**

A: Clear the search, then try a title, author, or tag keyword.

**Q: Why is the word count delayed?**

A: Counts are calculated asynchronously. Initial loading and data changes can cause a short delay.

**Q: Can I restore a deleted book?**

A: Use **Undo** before the deletion notification disappears.

**Q: Why doesn't a book card have a "Check for updates" button?**

A: Only books from built-in sites, or with an update recipe recorded by the AI importer, can be checked for updates. Books created manually or imported from JSON without a recipe do not show the button.

**Q: What should I check if import fails?**

A: Check the JSON/TXT structure, or whether the website URL is accessible.

---

## 🎯 Suggestions {#books-page-guide-section-15}

1. Favorite active projects.
2. Combine search and sorting for a large library.
3. Import long works in smaller website batches.
4. Export backups regularly from settings.
