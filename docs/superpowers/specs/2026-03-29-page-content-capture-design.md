# Page Content Capture — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Feature area:** URL / Page Import

---

## Problem

The existing "Import URL" feature passes URLs directly to NotebookLM, which fetches them server-side. This fails for any page requiring authentication — internal Confluence wikis, corporate intranets, staging environments, or any private site. NotebookLM's servers cannot access authenticated pages.

## Goal

Add an explicit "Import Page Content" button that captures the DOM of the currently open tab (as the user sees it), converts it to Markdown, and imports it into NotebookLM via the "Copied text" path — bypassing the authentication problem entirely.

---

## Architecture

### New Message Type

Add to `lib/types.ts` `MessageType` union:

```typescript
CAPTURE_PAGE_CONTENT: { tabId: number }
```

### Data Flow

```
User clicks "Import Page Content" (popup)
  → sends CAPTURE_PAGE_CONTENT { tabId } to background
  → background: chrome.scripting.executeScript() inline function on the tab
      returns: { html: document.body.innerHTML, title: document.title }
  → background: sends HTML to offscreen document via HTML_TO_MARKDOWN
      offscreen: smart selector extraction
        → if result < 200 chars → full body fallback
        → Turndown HTML→Markdown conversion
  → background: calls importTextToNotebookLM(markdown, title)
      via existing IMPORT_TEXT message path
  → returns { success, error? } to popup
```

### Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Add `CAPTURE_PAGE_CONTENT` to `MessageType` |
| `entrypoints/background.ts` | Handle `CAPTURE_PAGE_CONTENT`: inject inline script, call offscreen, call importText |
| `entrypoints/offscreen/main.ts` | Minor: expose full-body fallback when smart extraction yields < 200 chars |
| `components/SingleImport.tsx` | Add "Import Page Content" button with loading/error state |

No new content script files. No new service files.

---

## UI Changes

**Location:** More panel → `SingleImport` component (existing)

**Change:** Add a secondary "Import Page Content" button below the existing "Import" (URL) button.

- Displays the current tab URL as a read-only context label (shared with existing button)
- Disabled on non-`http/https` pages (chrome://, file://, etc.) with a tooltip: "Cannot capture browser internal pages"
- Shares the same loading/error state UI as the existing import button
- On success: same confirmation feedback as URL import

---

## Content Extraction

The offscreen document's `htmlToMarkdown()` already implements a two-stage approach that is reused here:

1. **Smart extraction:** Try known content CSS selectors (`article`, `main`, `.markdown-body`, `.doc-content`, etc.) in priority order; strip navs, footers, sidebars
2. **Full-body fallback:** If smart extraction yields < 200 characters, fall back to `document.body` — nothing gets missed

The page `<title>` is used as the NotebookLM source title, auto-populated with no user editing step.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `chrome://` or `file://` pages | Button disabled; tooltip: "Cannot capture browser internal pages" |
| `chrome.scripting.executeScript()` throws (PDF viewer, restricted tab) | Return error to popup: "Could not capture this page type" |
| Smart extraction + fallback both yield very short content | Import as-is; user can judge the result |
| Very long pages | No truncation; import full content. NotebookLM handles large "Copied text" inputs |
| Offscreen conversion failure | Bubble error back to popup with message |

---

## Out of Scope

- Batch capture of multiple tabs (existing batch import continues to use URL-only)
- Capturing pages from an arbitrary URL (only the currently active tab)
- Any modification to the Docs, Podcast, YouTube, or AI Chat import flows
