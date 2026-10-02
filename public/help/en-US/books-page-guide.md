# 📚 Book Library Guide {#books-page-guide-section-1}

The book library manages all your projects, with search, sorting, import, editing, deletion, and favorites.

---

## 📖 Overview {#books-page-guide-section-2}

- **Search**: filter by title, alternate title, author, description, or tag.
- **Sort**: several options, with your previous choice remembered.
- **Add book**: manually, from a website, or from JSON.
- **Card actions**: favorite, edit, and delete.
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

Fields include title (required), alternate titles, author, description, tags, cover, website URL, volume/chapter structure, and book instructions for translation, polishing, and proofreading.

The target language is the interface language when the new book is actually saved. Website and AI imports follow the same rule. Change it later in the book's translation settings; switching the interface does not change existing books.

### 2) Import from a website {#books-page-guide-section-7}

Choose **Import from website** from the split-button menu to open `/books/new/web`. Enter a novel's contents URL, check it, and select chapters. You can skip chapters, move them to a new volume, or preview their source. Confirm to create the book and open it. See the website import/update section in [Chapter management](/help/book-details-chapters).

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
- ✏️ Edit
- 🗑️ Delete

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

**Q: What should I check if import fails?**

A: Check the JSON/TXT structure, or whether the website URL is accessible.

---

## 🎯 Suggestions {#books-page-guide-section-15}

1. Favorite active projects.
2. Combine search and sorting for a large library.
3. Import long works in smaller website batches.
4. Export backups regularly from settings.
