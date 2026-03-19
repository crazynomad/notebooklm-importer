// Content script for NotebookLM page automation
// Updated: 2026-02-22 — adapted to new NotebookLM UI

export default defineContentScript({
  matches: ['https://notebooklm.google.com/*'],
  runAt: 'document_idle',

  main() {
    // Prevent duplicate listener registration from multiple injections
    if ((window as unknown as Record<string, boolean>).__NLM_IMPORTER_LOADED__) return;
    (window as unknown as Record<string, boolean>).__NLM_IMPORTER_LOADED__ = true;

    console.log('NotebookLM Jetpack content script loaded');

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // Readiness check — returns true if the page has the "Add source" button
      if (message.type === 'PING') {
        const ready = !!findAddSourceButton();
        sendResponse({ ready });
        return true;
      }

      if (message.type === 'IMPORT_URL') {
        importUrlToNotebookLM(message.url)
          .then((success) => sendResponse({ success }))
          .catch((error) => {
            console.error('Import error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      if (message.type === 'IMPORT_TEXT') {
        importTextToNotebookLM(message.text, message.title)
          .then((success) => sendResponse({ success }))
          .catch((error) => {
            console.error('Import text error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      if (message.type === 'GET_FAILED_SOURCES') {
        const failedUrls = getFailedSourceUrls();
        sendResponse({ success: true, data: failedUrls });
        return true;
      }

      if (message.type === 'GET_WECHAT_SOURCES') {
        const urls = getWechatFakeSuccessSources();
        sendResponse({ success: true, data: urls });
        return true;
      }

      if (message.type === 'RESCUE_SOURCE_DONE') {
        // Update inline banner after rescue completes
        updateInlineBanner(message.results);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'GET_NOTEBOOK_INFO') {
        const info = getNotebookInfo();
        sendResponse({ success: true, data: info });
        return true;
      }
    });

    // Auto-inject banners if issues detected
    setTimeout(() => {
      injectRescueBanner();
      injectRepairBanner();
    }, 2000);

    // Keyboard shortcuts for selection mode
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl+Shift+S — toggle selection mode (S = Select)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        toggleSelectionMode();
        return;
      }

      if (!selectionModeActive) return;

      // Escape — exit selection mode
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        toggleSelectionMode();
        return;
      }

      // Cmd/Ctrl+A — select all (in selection mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        toggleSelectAll();
        return;
      }

      // Delete / Backspace — delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        confirmAndDelete();
      }
    });

    // Re-check when source list changes (new sources added, sources removed, error state applied, etc.)
    let lastSourceCount = document.querySelectorAll('.single-source-container').length;
    let lastErrorCount = document.querySelectorAll('.single-source-error-container').length;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let delayedRecheckTimer: ReturnType<typeof setTimeout> | null = null;

    function recheckBanners(): void {
      const rescueBanner = document.getElementById('nlm-rescue-banner');
      const repairBanner = document.getElementById('nlm-repair-banner');
      rescueBanner?.remove();
      repairBanner?.remove();
      injectRescueBanner();
      injectRepairBanner();
    }

    const observer = new MutationObserver(() => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const currentCount = document.querySelectorAll('.single-source-container').length;
        const currentErrorCount = document.querySelectorAll('.single-source-error-container').length;

        if (currentCount !== lastSourceCount || currentErrorCount !== lastErrorCount) {
          lastSourceCount = currentCount;
          lastErrorCount = currentErrorCount;
          recheckBanners();

          // Delayed re-checks: NotebookLM processes sources asynchronously.
          // Error sources get class change (caught by attributes observer),
          // but fake-success sources (WeChat/X.com) have NO DOM change after
          // the title stabilizes — we must poll to catch them.
          if (delayedRecheckTimer) clearTimeout(delayedRecheckTimer);
          const recheckDelays = [5000, 10000, 18000];
          let recheckIndex = 0;
          const scheduleRecheck = () => {
            if (recheckIndex >= recheckDelays.length) return;
            delayedRecheckTimer = setTimeout(() => {
              lastErrorCount = document.querySelectorAll('.single-source-error-container').length;
              recheckBanners();
              recheckIndex++;
              scheduleRecheck();
            }, recheckIndex === 0 ? recheckDelays[0] : recheckDelays[recheckIndex] - recheckDelays[recheckIndex - 1]);
          };
          scheduleRecheck();
        } else {
          // No change — just ensure banners exist
          if (!document.getElementById('nlm-rescue-banner')) injectRescueBanner();
          if (!document.getElementById('nlm-repair-banner')) injectRepairBanner();
        }
      }, 800);
    });
    const scrollArea = document.querySelector('.scroll-area-desktop');
    if (scrollArea) {
      observer.observe(scrollArea, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  },
});

// ─── Bulk Delete (Selection Mode) ───────────────────────────

let selectionModeActive = false;
let lastClickedIndex = -1;

function getSourceContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.single-source-container')) as HTMLElement[];
}

function getSelectedContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.single-source-container.nlm-selected')) as HTMLElement[];
}

function toggleSelectionMode(): void {
  selectionModeActive = !selectionModeActive;
  lastClickedIndex = -1;

  if (selectionModeActive) {
    injectSelectionUI();
  } else {
    exitSelectionMode();
  }
}

function injectSelectionUI(): void {
  // Inject CSS
  if (!document.getElementById('nlm-select-style')) {
    const style = document.createElement('style');
    style.id = 'nlm-select-style';
    style.textContent = `
      .nlm-selection-active .single-source-container {
        cursor: pointer !important;
        position: relative;
        transition: background 0.15s;
      }
      .nlm-selection-active .single-source-container::after {
        content: '';
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        border: 2.5px solid #f59e0b;
        border-radius: 50%;
        background: white;
        z-index: 10;
        transition: all 0.15s;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
      }
      .nlm-selection-active .single-source-container.nlm-selected::after {
        background: #f59e0b;
        border-color: #f59e0b;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6.5 11.5L3 8l1-1 2.5 2.5L12 4l1 1-6.5 6.5z'/%3E%3C/svg%3E");
        background-size: 14px;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
      }
      .nlm-selection-active .single-source-container.nlm-selected {
        background: #fffbeb !important;
      }
      #nlm-select-toolbar {
        margin: 8px 12px;
        padding: 8px 12px;
        background: #f0f9ff;
        border: 1px solid #7dd3fc;
        border-radius: 10px;
        font-family: 'Google Sans', Roboto, sans-serif;
        font-size: 13px;
        color: #0c4a6e;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        animation: nlm-fade-in 0.2s ease;
      }
      #nlm-select-toolbar .nlm-sel-count {
        font-weight: 500;
        min-width: 70px;
      }
      #nlm-select-toolbar .nlm-sel-sep {
        width: 1px;
        height: 16px;
        background: #bae6fd;
      }
      #nlm-select-toolbar button {
        padding: 3px 10px;
        border: 1px solid #bae6fd;
        border-radius: 6px;
        background: white;
        color: #0369a1;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      #nlm-select-toolbar button:hover {
        background: #e0f2fe;
        border-color: #7dd3fc;
      }
      #nlm-select-toolbar button.nlm-sel-delete {
        background: #fee2e2;
        color: #dc2626;
        border-color: #fca5a5;
      }
      #nlm-select-toolbar button.nlm-sel-delete:hover {
        background: #fecaca;
      }
      #nlm-select-toolbar button.nlm-sel-delete:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      #nlm-select-toolbar button.nlm-sel-exit {
        margin-left: auto;
        background: transparent;
        border-color: transparent;
        color: #64748b;
      }
      #nlm-select-toolbar button.nlm-sel-exit:hover {
        background: #e0f2fe;
      }
      #nlm-select-toolbar .nlm-sel-progress {
        flex-basis: 100%;
        margin-top: 4px;
        font-size: 12px;
        color: #0369a1;
      }
    `;
    document.head.appendChild(style);
  }

  // Add active class to scroll area
  const scrollArea = document.querySelector('.scroll-area-desktop');
  scrollArea?.classList.add('nlm-selection-active');

  // Inject toolbar
  if (!document.getElementById('nlm-select-toolbar')) {
    const toolbar = buildToolbarDOM();
    scrollArea?.prepend(toolbar);
    bindToolbarEvents(toolbar);
  }

  // Bind click on source containers
  document.addEventListener('click', onSourceClick, true);

  updateToolbar();
}

function buildToolbarDOM(): HTMLElement {
  const total = getSourceContainers().length;
  const toolbar = document.createElement('div');
  toolbar.id = 'nlm-select-toolbar';

  const count = document.createElement('span');
  count.className = 'nlm-sel-count';
  count.textContent = ct('select.toolbar', { n: 0, t: total });

  const sep1 = document.createElement('div');
  sep1.className = 'nlm-sel-sep';

  const allBtn = document.createElement('button');
  allBtn.dataset.action = 'all';
  allBtn.textContent = ct('select.all');

  const failedBtn = document.createElement('button');
  failedBtn.dataset.action = 'failed';
  failedBtn.textContent = ct('select.failed');

  const invertBtn = document.createElement('button');
  invertBtn.dataset.action = 'invert';
  invertBtn.textContent = ct('select.invert');

  const sep2 = document.createElement('div');
  sep2.className = 'nlm-sel-sep';

  const deleteBtn = document.createElement('button');
  deleteBtn.dataset.action = 'delete';
  deleteBtn.className = 'nlm-sel-delete';
  deleteBtn.disabled = true;
  deleteBtn.textContent = '🗑 ' + ct('select.delete');

  const exitBtn = document.createElement('button');
  exitBtn.dataset.action = 'exit';
  exitBtn.className = 'nlm-sel-exit';
  exitBtn.textContent = '✕';

  toolbar.append(count, sep1, allBtn, failedBtn, invertBtn, sep2, deleteBtn, exitBtn);
  return toolbar;
}

function bindToolbarEvents(toolbar: HTMLElement): void {
  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'all') toggleSelectAll();
    else if (action === 'failed') selectFailed();
    else if (action === 'invert') invertSelection();
    else if (action === 'delete') confirmAndDelete();
    else if (action === 'exit') toggleSelectionMode();
  });
}

function onSourceClick(e: MouseEvent): void {
  if (!selectionModeActive) return;

  const container = (e.target as HTMLElement).closest('.single-source-container') as HTMLElement;
  if (!container) return;

  // Prevent NotebookLM's native click handler (opening source detail)
  e.stopPropagation();
  e.preventDefault();

  const containers = getSourceContainers();
  const index = containers.indexOf(container);

  if (e.shiftKey && lastClickedIndex >= 0 && lastClickedIndex !== index) {
    // Range select
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
      containers[i].classList.add('nlm-selected');
    }
  } else {
    container.classList.toggle('nlm-selected');
  }

  lastClickedIndex = index;
  updateToolbar();
}

function toggleSelectAll(): void {
  const containers = getSourceContainers();
  const allSelected = getSelectedContainers().length === containers.length;
  containers.forEach(c => {
    if (allSelected) c.classList.remove('nlm-selected');
    else c.classList.add('nlm-selected');
  });
  updateToolbar();
}

function selectFailed(): void {
  getSelectedContainers().forEach(c => c.classList.remove('nlm-selected'));
  document.querySelectorAll('.single-source-error-container').forEach(c => {
    c.classList.add('nlm-selected');
  });
  updateToolbar();
}

function invertSelection(): void {
  getSourceContainers().forEach(c => c.classList.toggle('nlm-selected'));
  updateToolbar();
}

function updateToolbar(): void {
  const toolbar = document.getElementById('nlm-select-toolbar');
  if (!toolbar) return;

  const selected = getSelectedContainers().length;
  const total = getSourceContainers().length;

  const countEl = toolbar.querySelector('.nlm-sel-count');
  if (countEl) countEl.textContent = ct('select.toolbar', { n: selected, t: total });

  const deleteBtn = toolbar.querySelector('[data-action="delete"]') as HTMLButtonElement;
  if (deleteBtn) deleteBtn.disabled = selected === 0;

  const allBtn = toolbar.querySelector('[data-action="all"]') as HTMLButtonElement;
  if (allBtn) allBtn.textContent = selected === total ? ct('select.none') : ct('select.all');
}

async function confirmAndDelete(): Promise<void> {
  const selected = getSelectedContainers();
  if (selected.length === 0) return;

  if (!confirm(ct('select.confirm', { n: selected.length }))) return;

  const toolbar = document.getElementById('nlm-select-toolbar');
  toolbar?.querySelectorAll('button').forEach(b => (b as HTMLButtonElement).disabled = true);

  let progressEl = toolbar?.querySelector('.nlm-sel-progress') as HTMLElement | null;
  if (!progressEl && toolbar) {
    progressEl = document.createElement('div');
    progressEl.className = 'nlm-sel-progress';
    toolbar.appendChild(progressEl);
  }

  let deleted = 0;
  const total = selected.length;

  for (const container of selected) {
    if (progressEl) {
      progressEl.textContent = ct('select.deleting', { n: deleted + 1, t: total });
    }

    try {
      await removeSingleSource(container);
      deleted++;
    } catch (e) {
      console.warn('[bulkDelete] Failed to delete source, skipping:', e);
    }

    await delay(300);
  }

  if (progressEl) {
    progressEl.textContent = ct('select.done', { n: deleted });
  }

  await delay(1500);
  toggleSelectionMode();
}

async function removeSingleSource(container: HTMLElement): Promise<void> {
  const menuBtn = container.querySelector('.source-item-more-button')
    || container.querySelector('button[aria-label="更多"], button[aria-label="More"]')
    || container.querySelector('button') as HTMLElement;
  if (!menuBtn) throw new Error('Menu button not found');

  (menuBtn as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  await delay(200);
  (menuBtn as HTMLElement).click();
  await delay(500);

  // Stable class first, then text fallback
  const deleteItem = document.querySelector<HTMLElement>('.more-menu-delete-source-button')
    || Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], .mat-mdc-menu-item'))
      .find(item => {
        const text = item.textContent?.trim() || '';
        return text.includes('移除来源') || text.includes('Remove source') || text.includes('Delete source');
      });

  if (!deleteItem) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    throw new Error('Delete menu item not found');
  }

  deleteItem.click();
  await delay(800);

  // Confirm deletion — stable class first, then text fallback
  const confirmBtn = document.querySelector<HTMLElement>('mat-dialog-container .submit-button')
    || Array.from(document.querySelectorAll<HTMLElement>('button'))
      .find(btn => {
        const btnText = btn.textContent?.trim() || '';
        return btnText === 'Delete' || btnText === '删除' || btnText === '移除';
      });

  if (!confirmBtn) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    throw new Error('Delete confirm button not found');
  }

  confirmBtn.click();
  await delay(1000);
}

function exitSelectionMode(): void {
  selectionModeActive = false;
  lastClickedIndex = -1;

  document.querySelectorAll('.nlm-selected').forEach(el => el.classList.remove('nlm-selected'));
  document.getElementById('nlm-select-toolbar')?.remove();
  document.querySelector('.scroll-area-desktop')?.classList.remove('nlm-selection-active');
  document.removeEventListener('click', onSourceClick, true);
}

// ─── URL Import ─────────────────────────────────────────────

async function importUrlToNotebookLM(url: string): Promise<boolean> {
  try {
    // Step 1: Open the add source dialog
    await openAddSourceDialog();

    // Step 2: Check if we're already on the URL input step (dialog may already be at website sub-page)
    let urlTextarea = findDialogElement<HTMLTextAreaElement>('.urls-input-container textarea')
      || await findTextareaByPlaceholder(
        ['粘贴任何链接', '粘贴', 'Paste any link', 'Paste any links', 'Paste'],
        500
      );

    if (!urlTextarea) {
      // Not at URL input step yet — click "Websites" button
      // Stable class + icon-first (language-independent); fallback to text
      const websiteButton = findDialogElement<HTMLElement>('.drop-zone-icon-button', el =>
          !!el.querySelector('img')?.textContent?.trim()?.includes('link'))
        || await findDialogButtonByIcon(['link'], 500)
        || await findButtonByText(['网站', 'Website', 'Websites', 'Link'], 3000);
      if (!websiteButton) {
        throw new Error('Website button not found in dialog');
      }
      websiteButton.click();
      await delay(500);

      // Now find the URL textarea — stable class first, then placeholder fallback
      urlTextarea = findDialogElement<HTMLTextAreaElement>('.urls-input-container textarea')
        || await findTextareaByPlaceholder(
          ['粘贴任何链接', '粘贴', 'Paste any link', 'Paste any links', 'Paste'],
          3000
        );
    }
    if (!urlTextarea) {
      throw new Error('URL input textarea not found');
    }

    // Fill the URL
    await fillInput(urlTextarea, url);

    // Step 4: Click "插入" (Insert) button
    const insertButton = await findButtonByText(['插入', 'Insert'], 3000);
    if (!insertButton) {
      throw new Error('Insert button not found');
    }
    insertButton.click();

    await delay(1500);
    return true;
  } catch (error) {
    console.error('Failed to import URL:', error);
    return false;
  }
}

// ─── Text Import ────────────────────────────────────────────

async function importTextToNotebookLM(text: string, title?: string): Promise<boolean> {
  try {
    // Step 1: Open the add source dialog
    await openAddSourceDialog();

    // Step 2: Check if already on "Copied text" sub-page (textarea visible)
    let textArea = findDialogElement<HTMLTextAreaElement>('.copied-text-input-textarea')
      || await findTextareaByPlaceholder(
        ['在此处粘贴文字', '粘贴文字', '粘贴', 'Paste text here', 'Paste'],
        500
      );

    if (!textArea) {
      // Need to navigate to copied text sub-page first
      // First go back to main dialog if on another sub-page (e.g. URL input)
      const backButton = findDialogElement<HTMLElement>('.back-button')
        || await findDialogButtonByIcon(['arrow_back'], 200);
      if (backButton) {
        backButton.click();
        await delay(500);
      }

      // Click "Copied text" button — stable class + icon (language-independent)
      const textButton = findDialogElement<HTMLElement>('.drop-zone-icon-button', el =>
          !!el.querySelector('img')?.textContent?.trim()?.includes('content_paste'))
        || await findDialogButtonByIcon(['content_paste'], 500)
        || await findButtonByText(['复制的文字', '复制的文本', 'Copied text', 'Text'], 3000);
      if (!textButton) {
        throw new Error('Copied text button not found in dialog');
      }
      textButton.click();
      await delay(500);

      // Now find the textarea — stable class first
      textArea = findDialogElement<HTMLTextAreaElement>('.copied-text-input-textarea')
        || await findTextareaByPlaceholder(
          ['在此处粘贴文字', '粘贴文字', '粘贴', 'Paste text here', 'Paste'],
          3000
        );
    }

    if (!textArea) {
      // Last resort fallback: find any textarea in the dialog
      const dialogTextareas = getDialogTextareas();
      if (dialogTextareas.length === 0) {
        throw new Error('Text area not found');
      }
      textArea = dialogTextareas[dialogTextareas.length - 1];
    }

    // Step 3: Fill title if available (note: newer UI removed inline title input)
    if (title) {
      const titleInput = await findInputByPlaceholder(
        ['来源名称', '标题', 'Source name', 'Title', 'title'],
        500
      );
      if (titleInput) {
        await fillInput(titleInput, title);
      }
    }

    // Step 4: Fill text content
    await fillInput(textArea, text);

    // Step 5: Click "插入" (Insert) button — wait longer for it to become enabled
    await delay(800);
    const insertButton = await findButtonByText(['插入', 'Insert'], 5000);
    if (!insertButton) {
      throw new Error('Insert button not found');
    }
    // Wait for button to be enabled (disabled while processing input)
    for (let i = 0; i < 10; i++) {
      if (!(insertButton as HTMLButtonElement).disabled) break;
      await delay(300);
    }
    insertButton.click();

    // Wait for dialog to close / import to complete
    for (let i = 0; i < 10; i++) {
      await delay(1000);
      if (!getMainDialog()) break;
    }

    // Smart rename: wait for NotebookLM to process, then check if it auto-renamed.
    // If the source still has a default name, rename it manually. (Fixes #38)
    if (title) {
      await delay(3000);
      const defaultNames = ['粘贴的文字', '复制的文字', 'Copied text', 'Pasted text', 'Pasted Text'];
      const allSources = document.querySelectorAll('.single-source-container');
      if (allSources.length > 0) {
        const lastSource = allSources[allSources.length - 1];
        const sourceTitle = lastSource.querySelector('.source-title')?.textContent?.trim();
        if (sourceTitle && defaultNames.includes(sourceTitle)) {
          console.log(`[importText] Source still has default name "${sourceTitle}", renaming to "${title}"`);
          try {
            await renameSource(sourceTitle, title);
          } catch (e) {
            console.warn('[importText] Rename failed (non-fatal):', e);
            // Ensure any leftover dialog is dismissed
            dismissAnyDialog();
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to import text:', error);
    return false;
  }
}

// ─── Helpers ────────────────────────────────────────────────

function getMainDialog(): Element | null {
  // Prefer Material dialog container (avoids matching emoji keyboard [role="dialog"])
  return document.querySelector('mat-dialog-container') || document.querySelector('.mat-mdc-dialog-container');
}

/** Check if the currently open dialog is the Add Source dialog (not Studio/Rename/etc.) */
function isAddSourceDialog(dialog: Element): boolean {
  // Add Source main page has .drop-zone-container; sub-pages have .urls-input-container / .copied-text-container
  return !!(
    dialog.querySelector('.drop-zone-container')
    || dialog.querySelector('.urls-input-container')
    || dialog.querySelector('.copied-text-container')
  );
}

/**
 * Find an element inside the current dialog by CSS selector.
 * Optionally filter with a predicate (e.g. to match by icon).
 * Returns null if dialog is closed or element not found.
 */
function findDialogElement<T extends HTMLElement>(
  selector: string,
  predicate?: (el: T) => boolean,
): T | null {
  const dialog = getMainDialog();
  if (!dialog) return null;
  if (predicate) {
    const candidates = dialog.querySelectorAll<T>(selector);
    for (const el of candidates) {
      if (predicate(el)) return el;
    }
    return null;
  }
  return dialog.querySelector<T>(selector);
}

async function openAddSourceDialog(): Promise<void> {
  const existingDialog = getMainDialog();

  if (existingDialog) {
    if (isAddSourceDialog(existingDialog)) {
      return; // Add Source dialog already open
    }
    // A different dialog is open (Studio, Rename, etc.) — dismiss it first
    const closeBtn = existingDialog.querySelector<HTMLElement>('.close-button, .dialog-title-close-icon, .cancel-button');
    if (closeBtn) {
      closeBtn.click();
      await delay(500);
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await delay(500);
    }
  }

  // Find and click "Add source" button
  const addButton = findAddSourceButton();
  if (!addButton) {
    throw new Error('Add source button not found');
  }
  addButton.click();
  await delay(500);

  // Wait for Material dialog to appear
  const dialog = await waitForElement('mat-dialog-container, .mat-mdc-dialog-container', 3000);
  if (!dialog) {
    throw new Error('Add source dialog did not open');
  }
}

function findAddSourceButton(): HTMLElement | null {
  // Strategy 1: Stable class selector (language-independent)
  const byClass = document.querySelector<HTMLElement>('.add-source-button');
  if (byClass) return byClass;

  // Strategy 2: aria-label
  const ariaSelectors = [
    'button[aria-label*="Add source"]',
    'button[aria-label*="添加来源"]',
  ];
  for (const selector of ariaSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }

  // Strategy 3: Find button with "add" icon in the source panel
  const sourcePanel = document.querySelector('.source-panel, [class*="source"]');
  const searchRoot = sourcePanel || document;
  const buttons = searchRoot.querySelectorAll('button');
  for (const button of buttons) {
    const icons = button.querySelectorAll('img, .material-symbols-outlined, .material-icons, mat-icon');
    for (const icon of icons) {
      if (icon.textContent?.trim() === 'add') {
        const btnText = button.textContent?.trim() || '';
        if (btnText.includes('source') || btnText.includes('来源') || btnText.includes('Add')) {
          return button;
        }
      }
    }
  }

  return null;
}

async function findButtonByText(
  texts: string[],
  timeout: number = 3000
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Search in Material dialog first, then fallback [role="dialog"], then document
    const containers = [
      getMainDialog(),
      document.querySelector('[role="dialog"]'),
      document,
    ].filter(Boolean) as (Element | Document)[];

    for (const container of containers) {
      // Search <button> elements
      const buttons = container.querySelectorAll('button');
      for (const button of buttons) {
        const btnText = button.textContent?.trim() || '';
        for (const text of texts) {
          if (btnText.includes(text)) {
            return button;
          }
        }
      }
      // Also search clickable spans (Material button labels) and walk up to button
      const spans = container.querySelectorAll('span.mdc-button__label, [class*="button__label"]');
      for (const span of spans) {
        const spanText = span.textContent?.trim() || '';
        for (const text of texts) {
          if (spanText === text) {
            const parentBtn = span.closest('button, [role="button"], a') as HTMLElement;
            if (parentBtn) return parentBtn;
            // If no button parent, the span's parent might be clickable
            return span.parentElement as HTMLElement;
          }
        }
      }
    }

    await delay(100);
  }

  return null;
}

async function findTextareaByPlaceholder(
  placeholders: string[],
  timeout: number = 3000
): Promise<HTMLTextAreaElement | HTMLInputElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Search both textarea and input elements
    const elements = document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
      'textarea, input[type="text"], input[type="url"], input:not([type])'
    );
    for (const el of elements) {
      const ph = el.placeholder?.toLowerCase() || '';
      for (const placeholder of placeholders) {
        if (ph.includes(placeholder.toLowerCase())) {
          return el;
        }
      }
    }

    // Also check contenteditable and role="textbox" elements within dialog
    const dialog = getMainDialog() || document.querySelector('[role="dialog"]');
    if (dialog) {
      const textboxes = dialog.querySelectorAll<HTMLElement>('[role="textbox"], [contenteditable="true"]');
      for (const tb of textboxes) {
        const ph = tb.getAttribute('aria-placeholder')?.toLowerCase()
          || tb.getAttribute('placeholder')?.toLowerCase()
          || tb.dataset?.placeholder?.toLowerCase()
          || '';
        for (const placeholder of placeholders) {
          if (ph.includes(placeholder.toLowerCase())) {
            return tb as unknown as HTMLTextAreaElement;
          }
        }
      }
    }

    await delay(100);
  }

  return null;
}

async function findInputByPlaceholder(
  placeholders: string[],
  timeout: number = 3000
): Promise<HTMLInputElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])');
    for (const input of inputs) {
      const ph = input.placeholder?.toLowerCase() || '';
      for (const placeholder of placeholders) {
        if (ph.includes(placeholder.toLowerCase())) {
          return input;
        }
      }
    }
    await delay(100);
  }

  return null;
}

function getDialogTextareas(): HTMLTextAreaElement[] {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return [];
  return Array.from(dialog.querySelectorAll<HTMLTextAreaElement>('textarea'));
}

async function fillInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  element.focus();

  // Use native setter to bypass React's synthetic event system
  const nativeInputValueSetter =
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events to trigger React/Angular state updates
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Also try InputEvent for frameworks that listen to it
  const nativeInputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: value,
  });
  element.dispatchEvent(nativeInputEvent);

  await delay(200);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dismiss any open mat-dialog (rename, studio, etc.) to prevent leftover UI. */
function dismissAnyDialog(): void {
  const dialog = getMainDialog();
  if (!dialog) return;
  const closeBtn = dialog.querySelector<HTMLElement>('.close-button, .cancel-button, .dialog-title-close-icon');
  if (closeBtn) {
    closeBtn.click();
  } else {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
}

/**
 * Find a button inside the current dialog by its Material icon text content.
 * Material icons render as <img> or <span> with text like "link", "content_paste", "upload".
 * This is language-independent — icons don't change with locale.
 */
async function findDialogButtonByIcon(
  iconNames: string[],
  timeout: number = 3000
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const dialog = getMainDialog() || document.querySelector('[role="dialog"]');
    if (dialog) {
      const buttons = dialog.querySelectorAll('button');
      for (const button of buttons) {
        // Check <img> children with Material icon text (NotebookLM uses <img> with text content for icons)
        const icons = button.querySelectorAll('img, .material-symbols-outlined, .material-icons, mat-icon');
        for (const icon of icons) {
          const iconText = icon.textContent?.trim() || '';
          if (iconNames.includes(iconText)) {
            return button;
          }
        }
      }
    }
    await delay(100);
  }
  return null;
}

// ─── Source Rename ──────────────────────────────────────────

/**
 * Rename a source in the source list by clicking its three-dot menu → "重命名来源".
 * Finds the LAST source matching `oldName` (most recently added).
 */
async function renameSource(oldName: string, newName: string): Promise<void> {
  // NotebookLM DOM: .single-source-container > .source-title-column (title) + .source-item-more-button (⋮)
  const allItems = document.querySelectorAll('.single-source-container');
  let targetMoreBtn: HTMLElement | null = null;

  // Search from last to first (most recently added source is at the bottom)
  for (let i = allItems.length - 1; i >= 0; i--) {
    const item = allItems[i];
    const titleEl = item.querySelector('.source-title-column');
    if (titleEl?.textContent?.trim() === oldName) {
      targetMoreBtn = item.querySelector('.source-item-more-button') as HTMLElement;
      if (!targetMoreBtn) {
        // Fallback: find button with aria-label="更多"
        targetMoreBtn = item.querySelector('button[aria-label="更多"], button[aria-label="More"]') as HTMLElement;
      }
      if (targetMoreBtn) break;
    }
  }

  if (!targetMoreBtn) {
    throw new Error(`Source "${oldName}" not found in source list`);
  }

  // Scroll the source into view first (it may be outside viewport)
  targetMoreBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
  await delay(500);

  // Click the more button to open context menu, with retry (progressive delays for large pastes)
  const maxAttempts = 6;
  let renameItem: HTMLElement | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    targetMoreBtn.click();
    const waitMs = 600 + attempt * 400; // 600, 1000, 1400, 1800, 2200, 2600
    await delay(waitMs);

    renameItem = document.querySelector<HTMLElement>('.more-menu-edit-source-button')
      || await findMenuItemByIconOrText(['edit', 'drive_file_rename_outline'], ['重命名来源', 'Rename source', 'Rename'], 3000);
    if (renameItem) break;

    // Menu didn't open — dismiss any stale overlay and retry
    console.log(`[rename] Attempt ${attempt + 1}/${maxAttempts}: menu not found, retrying...`);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await delay(800 + attempt * 300);
  }

  if (!renameItem) {
    throw new Error(`Rename menu item not found after ${maxAttempts} attempts`);
  }
  renameItem.click();
  await delay(800);

  // Find the rename dialog input — stable class first, then fallback
  const renameInput = await waitForElement<HTMLInputElement>('.edit-source-dialog input', 3000)
    || await findInputByLabel(['来源名称', 'Source name'], 3000);
  if (!renameInput) {
    dismissAnyDialog();
    throw new Error('Rename input not found');
  }

  // Clear and fill with new name
  renameInput.select();
  await delay(100);
  await fillInput(renameInput, newName);

  // Click Save button — stable class first, then text fallback
  const saveBtn = document.querySelector<HTMLElement>('mat-dialog-container .submit-button')
    || await findButtonByText(['保存', 'Save'], 3000);
  if (!saveBtn) {
    dismissAnyDialog();
    throw new Error('Save button not found');
  }
  saveBtn.click();
  await delay(500);

  // Verify dialog closed; dismiss if still open (e.g. Angular didn't accept the change)
  if (getMainDialog()?.querySelector('.edit-source-dialog')) {
    console.warn('[rename] Dialog still open after Save — force closing');
    dismissAnyDialog();
    await delay(300);
  }
}

/**
 * Find a menu item by icon name or text (inside mat-menu-panel or similar menu).
 * Tries icon matching first (language-independent), then falls back to text.
 */
async function findMenuItemByIconOrText(
  iconNames: string[],
  texts: string[],
  timeout: number = 3000
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const items = document.querySelectorAll('[role="menuitem"], .mat-menu-item, .mat-mdc-menu-item, button[mat-menu-item]');

    // Try icon match first
    for (const item of items) {
      const icons = item.querySelectorAll('img, .material-symbols-outlined, .material-icons, mat-icon');
      for (const icon of icons) {
        const iconText = icon.textContent?.trim() || '';
        if (iconNames.includes(iconText)) {
          return item as HTMLElement;
        }
      }
    }

    // Fallback: text match
    for (const item of items) {
      const itemText = item.textContent?.trim() || '';
      for (const text of texts) {
        if (itemText.includes(text)) {
          return item as HTMLElement;
        }
      }
    }
    await delay(100);
  }
  return null;
}

// Keep backward-compatible alias
async function findMenuItemByText(
  texts: string[],
  timeout: number = 3000
): Promise<HTMLElement | null> {
  return findMenuItemByIconOrText([], texts, timeout);
}

/**
 * Find an input by its associated label text (for Angular Material mat-label).
 */
async function findInputByLabel(
  labels: string[],
  timeout: number = 3000
): Promise<HTMLInputElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    // Angular Material: mat-label inside mat-form-field, input is sibling
    const matLabels = document.querySelectorAll('mat-label, label, .mat-mdc-floating-label');
    for (const lbl of matLabels) {
      const lblText = lbl.textContent?.trim()?.replace(/\*$/, '').trim() || '';
      const lblLower = lblText.toLowerCase();
      for (const label of labels) {
        if (lblLower === label.toLowerCase() || lblLower.includes(label.toLowerCase())) {
          // Find the input within the same form field
          const formField = lbl.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field');
          if (formField) {
            const input = formField.querySelector('input') as HTMLInputElement;
            if (input) return input;
          }
          // Fallback: label's for attribute
          const forId = (lbl as HTMLLabelElement).htmlFor;
          if (forId) {
            const input = document.getElementById(forId) as HTMLInputElement;
            if (input) return input;
          }
        }
      }
    }
    await delay(100);
  }
  return null;
}

// ─── Content Script i18n ────────────────────────────────────

const _csIsZh = navigator.language.startsWith('zh');
const _csStrings: Record<string, [string, string]> = {
  // [zh, en]
  'select.toolbar':    ['已选 {n}/{t}', '{n}/{t} selected'],
  'select.all':        ['全选', 'Select all'],
  'select.none':       ['取消全选', 'Deselect all'],
  'select.failed':     ['选择失败', 'Select failed'],
  'select.invert':     ['反选', 'Invert'],
  'select.delete':     ['删除', 'Delete'],
  'select.deleting':   ['删除中 {n}/{t}...', 'Deleting {n}/{t}...'],
  'select.confirm':    ['确定删除 {n} 个来源？此操作不可撤销。', 'Delete {n} sources? This cannot be undone.'],
  'select.done':       ['已删除 {n} 个来源', '{n} sources deleted'],
  'rescue.text':       ['{n} 个来源导入失败，可尝试抢救', '{n} failed source imports — try rescue'],
  'rescue.btn':        ['↻ 抢救', '↻ Rescue'],
  'rescue.pending':    ['待抢救', 'Pending'],
  'rescue.running':    ['抢救中...', 'Rescuing...'],
  'rescue.done':       ['抢救完成：<strong>{s}</strong> 成功', 'Rescue done: <strong>{s}</strong> succeeded'],
  'rescue.doneFail':   ['，<strong>{f}</strong> 失败', ', <strong>{f}</strong> failed'],
  'rescue.removeFailed': ['移除已抢救的失败来源', 'Remove rescued failed sources'],
  'repair.text':       ['{n} 个来源需要修复（内容可能为空）', '{n} sources need repair (may be empty)'],
  'repair.btn':        ['🔧 修复', '🔧 Repair'],
  'repair.pending':    ['待修复', 'Pending'],
  'repair.running':    ['修复中...', 'Repairing...'],
  'repair.done':       ['修复完成：<strong>{s}</strong> 成功', 'Repair done: <strong>{s}</strong> succeeded'],
  'repair.doneFail':   ['，<strong>{f}</strong> 失败', ', <strong>{f}</strong> failed'],
  'repair.removeOld':  ['移除原始失败来源', 'Remove original failed sources'],
  'success':           ['成功', 'Success'],
  'failed':            ['失败', 'Failed'],
  'done':              ['✓ 完成', '✓ Done'],
  'close':             ['关闭', 'Close'],
};
function ct(key: string, params?: Record<string, string | number>): string {
  const pair = _csStrings[key];
  let text = pair ? pair[_csIsZh ? 0 : 1] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

// ─── Inline Rescue Banner ───────────────────────────────────

function injectRescueBanner(): void {
  // Don't duplicate
  if (document.getElementById('nlm-rescue-banner')) return;

  const failedUrls = getFailedSourceUrls();
  if (failedUrls.length === 0) return;

  const scrollArea = document.querySelector('.scroll-area-desktop');
  if (!scrollArea) return;

  const banner = document.createElement('div');
  banner.id = 'nlm-rescue-banner';
  banner.innerHTML = `
    <style>
      #nlm-rescue-banner {
        margin: 8px 12px;
        padding: 10px 12px;
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 10px;
        font-family: 'Google Sans', Roboto, sans-serif;
        font-size: 13px;
        color: #92400e;
        animation: nlm-fade-in 0.3s ease;
      }
      @keyframes nlm-fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      #nlm-rescue-banner .nlm-rescue-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #nlm-rescue-banner .nlm-rescue-icon {
        width: 16px; height: 16px; flex-shrink: 0;
      }
      #nlm-rescue-banner .nlm-rescue-text { flex: 1; }
      #nlm-rescue-banner .nlm-rescue-btn {
        padding: 4px 12px;
        background: #f59e0b;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      #nlm-rescue-banner .nlm-rescue-btn:hover { background: #d97706; }
      #nlm-rescue-banner .nlm-rescue-btn:disabled {
        opacity: 0.6; cursor: not-allowed;
      }
      #nlm-rescue-banner .nlm-rescue-details {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #fde68a;
        font-size: 12px;
        color: #78350f;
      }
      #nlm-rescue-banner .nlm-rescue-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        overflow: hidden;
      }
      #nlm-rescue-banner .nlm-rescue-item-url {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      #nlm-rescue-banner .nlm-rescue-status {
        flex-shrink: 0;
        font-size: 11px;
      }
      #nlm-rescue-banner .nlm-rescue-success { color: #16a34a; }
      #nlm-rescue-banner .nlm-rescue-error { color: #dc2626; }
      #nlm-rescue-banner .nlm-rescue-spinner {
        display: inline-block;
        width: 12px; height: 12px;
        border: 2px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: nlm-spin 0.6s linear infinite;
      }
      @keyframes nlm-spin { to { transform: rotate(360deg); } }
      #nlm-rescue-banner .nlm-dismiss {
        background: none; border: none; color: #b45309;
        cursor: pointer; font-size: 16px; padding: 0 2px;
        line-height: 1; flex-shrink: 0;
      }
      #nlm-rescue-banner .nlm-dismiss:hover { color: #92400e; }
      #nlm-rescue-banner .nlm-rescue-footer {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #fde68a;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #nlm-rescue-banner .nlm-rescue-footer label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #78350f;
        cursor: pointer;
        flex: 1;
      }
      #nlm-rescue-banner .nlm-rescue-footer input[type="checkbox"] {
        accent-color: #f59e0b;
        width: 14px; height: 14px;
      }
      #nlm-rescue-banner .nlm-rescue-done-btn {
        padding: 6px 16px;
        background: #16a34a;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }
      #nlm-rescue-banner .nlm-rescue-done-btn:hover { background: #15803d; }
    </style>
    <div class="nlm-rescue-header">
      <svg class="nlm-rescue-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span class="nlm-rescue-text">
        ${ct('rescue.text', { n: `<strong>${failedUrls.length}</strong>` })}
      </span>
      <button class="nlm-rescue-btn" id="nlm-rescue-btn">
        ${ct('rescue.btn')}
      </button>
      <button class="nlm-dismiss" id="nlm-rescue-dismiss" title="${ct('close')}">×</button>
    </div>
    <div class="nlm-rescue-details" id="nlm-rescue-details" style="display:none">
      ${failedUrls.map((url) => `
        <div class="nlm-rescue-item" data-url="${url}">
          <span class="nlm-rescue-item-url" title="${url}">${url}</span>
          <span class="nlm-rescue-status" data-status="pending">${ct('rescue.pending')}</span>
        </div>
      `).join('')}
    </div>
  `;

  scrollArea.insertBefore(banner, scrollArea.firstChild);

  // Button handlers
  document.getElementById('nlm-rescue-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('nlm-rescue-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = `<span class="nlm-rescue-spinner"></span> ${ct('rescue.running')}`; // static i18n string, safe

    // Show details
    const details = document.getElementById('nlm-rescue-details');
    if (details) details.style.display = 'block';

    // Send rescue request to background
    chrome.runtime.sendMessage({ type: 'RESCUE_SOURCES', urls: failedUrls }, (resp) => {
      const results = resp?.success ? resp.data : (resp || []);
      updateInlineBanner(results);
    });
  });

  document.getElementById('nlm-rescue-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
}

function updateInlineBanner(results: Array<{ url: string; status: string; title?: string; error?: string }>): void {
  const btn = document.getElementById('nlm-rescue-btn') as HTMLButtonElement;
  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'error').length;

  // Hide the rescue button
  if (btn) btn.style.display = 'none';

  // Update text
  const textEl = document.querySelector('#nlm-rescue-banner .nlm-rescue-text');
  if (textEl) {
    textEl.innerHTML = `${ct('rescue.done', { s: successCount })}${failCount > 0 ? ct('rescue.doneFail', { f: failCount }) : ''}`; // static i18n, safe
  }

  // Show details
  const details = document.getElementById('nlm-rescue-details');
  if (details) details.style.display = 'block';

  // Update individual items
  for (const result of results) {
    const item = document.querySelector(`#nlm-rescue-details .nlm-rescue-item[data-url="${CSS.escape(result.url)}"]`);
    if (!item) continue;
    const statusEl = item.querySelector('.nlm-rescue-status');
    if (statusEl) {
      if (result.status === 'success') {
        statusEl.className = 'nlm-rescue-status nlm-rescue-success';
        statusEl.textContent = `✓ ${result.title || ct('success')}`;
      } else {
        statusEl.className = 'nlm-rescue-status nlm-rescue-error';
        statusEl.textContent = `✗ ${result.error || ct('failed')}`;
      }
    }
  }

  // Add footer with done button + remove checkbox (only if at least one success)
  if (successCount > 0) {
    const banner = document.getElementById('nlm-rescue-banner');
    if (banner && !document.getElementById('nlm-rescue-footer')) {
      const footer = document.createElement('div');
      footer.id = 'nlm-rescue-footer';
      footer.className = 'nlm-rescue-footer';
      footer.innerHTML = `
        <label>
          <input type="checkbox" id="nlm-rescue-remove-failed" checked />
          ${ct('rescue.removeFailed')}
        </label>
        <button class="nlm-rescue-done-btn" id="nlm-rescue-done-btn">${ct('done')}</button>
      `;
      banner.appendChild(footer);

      document.getElementById('nlm-rescue-done-btn')?.addEventListener('click', async () => {
        const removeCheckbox = document.getElementById('nlm-rescue-remove-failed') as HTMLInputElement;
        if (removeCheckbox?.checked) {
          await removeFailedSources();
        }
        banner.remove();
      });
    }
  }
}

async function removeFailedSources(): Promise<void> {
  // Find a failed source and click its "更多" menu to access "移除所有失败的来源"
  const errorContainers = document.querySelectorAll('.single-source-error-container');
  if (errorContainers.length === 0) return;

  // Find the "More" button inside the first error container
  const firstError = errorContainers[0];
  const moreBtn = (firstError.querySelector('.source-item-more-button') || firstError.querySelector('button')) as HTMLElement;
  if (!moreBtn) return;

  moreBtn.click();
  await delay(500);

  // Stable class first, then text fallback
  const removeAllItem = document.querySelector<HTMLElement>('[class*="more-menu-remove-all-fail"]')
    || Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], .mat-mdc-menu-item'))
      .find(item => {
        const text = item.textContent?.trim() || '';
        return text.includes('移除所有失败的来源') || text.includes('Remove all failed');
      });
  if (removeAllItem) {
    removeAllItem.click();
    await delay(500);
    return;
  }

  // Fallback: press Escape to close menu if we couldn't find the option
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// ─── Failed Source Detection ────────────────────────────────

// ─── Repair Banner (WeChat fake-success) ────────────────────

function injectRepairBanner(): void {
  if (document.getElementById('nlm-repair-banner')) return;

  const wechatUrls = getWechatFakeSuccessSources();
  if (wechatUrls.length === 0) return;

  const scrollArea = document.querySelector('.scroll-area-desktop');
  if (!scrollArea) return;

  const banner = document.createElement('div');
  banner.id = 'nlm-repair-banner';
  banner.innerHTML = `
    <style>
      #nlm-repair-banner {
        margin: 8px 12px;
        padding: 10px 12px;
        background: #eff6ff;
        border: 1px solid #93c5fd;
        border-radius: 10px;
        font-family: 'Google Sans', Roboto, sans-serif;
        font-size: 13px;
        color: #1e40af;
        animation: nlm-fade-in 0.3s ease;
      }
      #nlm-repair-banner .nlm-repair-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #nlm-repair-banner .nlm-repair-icon {
        width: 16px; height: 16px; flex-shrink: 0;
      }
      #nlm-repair-banner .nlm-repair-text { flex: 1; }
      #nlm-repair-banner .nlm-repair-btn {
        padding: 4px 12px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      #nlm-repair-banner .nlm-repair-btn:hover { background: #2563eb; }
      #nlm-repair-banner .nlm-repair-btn:disabled {
        opacity: 0.6; cursor: not-allowed;
      }
      #nlm-repair-banner .nlm-repair-details {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #bfdbfe;
        font-size: 12px;
        color: #1e3a8a;
      }
      #nlm-repair-banner .nlm-repair-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        overflow: hidden;
      }
      #nlm-repair-banner .nlm-repair-item-url {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      #nlm-repair-banner .nlm-repair-status { flex-shrink: 0; font-size: 11px; }
      #nlm-repair-banner .nlm-repair-success { color: #16a34a; }
      #nlm-repair-banner .nlm-repair-error { color: #dc2626; }
      #nlm-repair-banner .nlm-repair-spinner {
        display: inline-block;
        width: 12px; height: 12px;
        border: 2px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: nlm-spin 0.6s linear infinite;
      }
      #nlm-repair-banner .nlm-repair-footer {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #bfdbfe;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #nlm-repair-banner .nlm-repair-footer label {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; color: #1e3a8a; cursor: pointer; flex: 1;
      }
      #nlm-repair-banner .nlm-repair-footer input[type="checkbox"] {
        accent-color: #3b82f6; width: 14px; height: 14px;
      }
      #nlm-repair-banner .nlm-repair-done-btn {
        padding: 6px 16px; background: #16a34a; color: white;
        border: none; border-radius: 6px; font-size: 12px;
        font-weight: 500; cursor: pointer;
      }
      #nlm-repair-banner .nlm-repair-done-btn:hover { background: #15803d; }
      #nlm-repair-banner .nlm-dismiss {
        background: none; border: none; color: #3b82f6;
        cursor: pointer; font-size: 16px; padding: 0 2px;
        line-height: 1; flex-shrink: 0;
      }
    </style>
    <div class="nlm-repair-header">
      <svg class="nlm-repair-icon" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <span class="nlm-repair-text">
        ${ct('repair.text', { n: `<strong>${wechatUrls.length}</strong>` })}
      </span>
      <button class="nlm-repair-btn" id="nlm-repair-btn">
        ${ct('repair.btn')}
      </button>
      <button class="nlm-dismiss" id="nlm-repair-dismiss" title="${ct('close')}">×</button>
    </div>
    <div class="nlm-repair-details" id="nlm-repair-details" style="display:none">
      ${wechatUrls.map((url) => `
        <div class="nlm-repair-item" data-url="${url}">
          <span class="nlm-repair-item-url" title="${url}">${url}</span>
          <span class="nlm-repair-status" data-status="pending">${ct('repair.pending')}</span>
        </div>
      `).join('')}
    </div>
  `;

  // Insert after rescue banner if it exists, otherwise at top
  const rescueBanner = document.getElementById('nlm-rescue-banner');
  if (rescueBanner && rescueBanner.nextSibling) {
    scrollArea.insertBefore(banner, rescueBanner.nextSibling);
  } else if (rescueBanner) {
    scrollArea.appendChild(banner);
  } else {
    scrollArea.insertBefore(banner, scrollArea.firstChild);
  }

  document.getElementById('nlm-repair-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('nlm-repair-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = `<span class="nlm-repair-spinner"></span> ${ct('repair.running')}`; // static i18n string, safe
    const details = document.getElementById('nlm-repair-details');
    if (details) details.style.display = 'block';

    chrome.runtime.sendMessage({ type: 'REPAIR_WECHAT_SOURCES', urls: wechatUrls }, (resp) => {
      const results = resp?.success ? resp.data : (resp || []);
      updateRepairBanner(results, wechatUrls);
    });
  });

  document.getElementById('nlm-repair-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
}

function updateRepairBanner(results: Array<{ url: string; status: string; title?: string; error?: string }>, originalUrls: string[]): void {
  const btn = document.getElementById('nlm-repair-btn') as HTMLButtonElement;
  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'error').length;

  if (btn) btn.style.display = 'none';

  const textEl = document.querySelector('#nlm-repair-banner .nlm-repair-text');
  if (textEl) {
    textEl.innerHTML = `${ct('repair.done', { s: successCount })}${failCount > 0 ? ct('repair.doneFail', { f: failCount }) : ''}`; // static i18n, safe
  }

  for (const result of results) {
    const item = document.querySelector(`#nlm-repair-details .nlm-repair-item[data-url="${CSS.escape(result.url)}"]`);
    if (!item) continue;
    const statusEl = item.querySelector('.nlm-repair-status');
    if (statusEl) {
      if (result.status === 'success') {
        statusEl.className = 'nlm-repair-status nlm-repair-success';
        statusEl.textContent = `✓ ${result.title || ct('success')}`;
      } else {
        statusEl.className = 'nlm-repair-status nlm-repair-error';
        statusEl.textContent = `✗ ${result.error || ct('failed')}`;
      }
    }
  }

  if (successCount > 0) {
    const bannerEl = document.getElementById('nlm-repair-banner');
    if (bannerEl && !document.getElementById('nlm-repair-footer')) {
      const footer = document.createElement('div');
      footer.id = 'nlm-repair-footer';
      footer.className = 'nlm-repair-footer';
      footer.innerHTML = `
        <label>
          <input type="checkbox" id="nlm-repair-remove-old" checked />
          ${ct('repair.removeOld')}
        </label>
        <button class="nlm-repair-done-btn" id="nlm-repair-done-btn">${ct('done')}</button>
      `;
      bannerEl.appendChild(footer);

      document.getElementById('nlm-repair-done-btn')?.addEventListener('click', async () => {
        const removeCheckbox = document.getElementById('nlm-repair-remove-old') as HTMLInputElement;
        if (removeCheckbox?.checked) {
          await removeSourcesByUrl(originalUrls);
        }
        bannerEl.remove();
      });
    }
  }
}

async function removeSourcesByUrl(urls: string[]): Promise<void> {
  for (const url of urls) {
    // Find the source item with this URL title
    const sources = document.querySelectorAll('.source-title');
    for (const source of sources) {
      if (source.textContent?.trim() !== url) continue;
      const container = source.closest('.single-source-container');
      if (!container) continue;

      // Click the "More" menu button
      const menuBtn = (container.querySelector('.source-item-more-button') || container.querySelector('button')) as HTMLElement;
      if (!menuBtn) continue;
      menuBtn.click();
      await delay(500);

      // Stable class first, then text fallback
      const deleteItem = document.querySelector<HTMLElement>('.more-menu-delete-source-button')
        || Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], .mat-mdc-menu-item'))
          .find(item => {
            const text = item.textContent?.trim() || '';
            return text.includes('移除来源') || text.includes('Remove source') || text.includes('Delete source');
          });
      if (deleteItem) {
        deleteItem.click();
        await delay(800);

        // Confirm — stable class first, then text fallback
        const confirmBtn = document.querySelector<HTMLElement>('mat-dialog-container .submit-button')
          || Array.from(document.querySelectorAll<HTMLElement>('button'))
            .find(btn => {
              const btnText = btn.textContent?.trim() || '';
              return btnText === 'Delete' || btnText === '删除';
            });
        if (confirmBtn) {
          confirmBtn.click();
          await delay(1000);
        }
      }
      break;
    }
  }
}

// ─── WeChat Fake-Success Detection ──────────────────────────

/** Patterns for sites that NotebookLM can't fetch properly (SPA / anti-scraping) */
const FAKE_SUCCESS_PATTERNS = [
  /^https?:\/\/mp\.weixin\.qq\.com\//,        // WeChat articles
  /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//, // X.com / Twitter
];

function getWechatFakeSuccessSources(): string[] {
  const urls: string[] = [];
  const sources = document.querySelectorAll('.source-title');
  sources.forEach((s) => {
    const text = s.textContent?.trim();
    if (text && FAKE_SUCCESS_PATTERNS.some(p => p.test(text))) {
      const container = s.closest('.single-source-container');
      // Only include non-error ones (error ones are handled by rescue)
      if (container && !container.classList.contains('single-source-error-container')) {
        urls.push(text);
      }
    }
  });
  return [...new Set(urls)];
}

function getFailedSourceUrls(): string[] {
  const urls: string[] = [];

  // NotebookLM uses Angular with class "single-source-error-container" for failed sources
  // The URL is in a .source-title span inside the container
  const errorContainers = document.querySelectorAll('.single-source-error-container');
  for (const container of errorContainers) {
    const titleEl = container.querySelector('.source-title');
    const text = titleEl?.textContent?.trim();
    if (text && /^https?:\/\//.test(text)) {
      urls.push(text);
    }
  }

  // Fallback: also check for mat-icon "info" near source titles with URL text
  if (urls.length === 0) {
    const sourceColumns = document.querySelectorAll('.source-title-column');
    for (const col of sourceColumns) {
      const row = col.closest('.single-source-container');
      if (!row) continue;
      const hasInfoIcon = row.querySelector('mat-icon')?.textContent?.trim() === 'info';
      if (!hasInfoIcon) continue;
      const titleEl = col.querySelector('.source-title');
      const text = titleEl?.textContent?.trim();
      if (text && /^https?:\/\//.test(text)) {
        urls.push(text);
      }
    }
  }

  return [...new Set(urls)];
}

async function waitForElement<T extends Element = Element>(
  selector: string,
  timeout: number = 5000
): Promise<T | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const selectors = selector.split(',').map((s) => s.trim());

    for (const sel of selectors) {
      try {
        const element = document.querySelector<T>(sel);
        if (element) return element;
      } catch {
        // Invalid selector, continue
      }
    }

    await delay(100);
  }

  return null;
}

// ─── Notebook Info ──────────────────────────────────────────

interface NotebookInfo {
  id: string;
  title: string;
  url: string;
}

/**
 * Extract current notebook info from the page.
 * Works on both the notebook page (single notebook) and the home page (list).
 */
function getNotebookInfo(): { current: NotebookInfo | null; list: NotebookInfo[] } {
  const baseUrl = 'https://notebooklm.google.com';
  const currentUrl = window.location.href;
  let current: NotebookInfo | null = null;

  // If we're inside a notebook, extract its info
  const notebookMatch = currentUrl.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
  if (notebookMatch) {
    const id = notebookMatch[1];
    // Try to get title from the page header
    const titleEl = document.querySelector<HTMLElement>(
      '.notebook-title, [class*="notebook-title"], [class*="project-title"], h1'
    );
    const title = titleEl?.textContent?.trim()
      || document.title.replace(/ - NotebookLM$/, '').trim()
      || 'Untitled';
    current = { id, title, url: `${baseUrl}/notebook/${id}` };
  }

  // Try to get notebook list from the home page
  const list: NotebookInfo[] = [];

  // Strategy 1: Look for notebook cards/links on the home page
  const notebookLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/notebook/"]'
  );
  const seen = new Set<string>();
  for (const link of notebookLinks) {
    const match = link.href.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);

    // Try to find the title from the link or its parent card
    const card = link.closest('[class*="card"], [class*="project"], [class*="notebook"]') || link;
    const titleEl = card.querySelector<HTMLElement>(
      '[class*="title"], [class*="name"], h2, h3, .mat-headline, .mat-title'
    );
    const title = titleEl?.textContent?.trim()
      || link.textContent?.trim()
      || 'Untitled';

    list.push({
      id: match[1],
      title,
      url: `${baseUrl}/notebook/${match[1]}`,
    });
  }

  return { current, list };
}
