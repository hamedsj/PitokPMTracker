// Cross-browser runtime helper
const runtime = typeof browser !== 'undefined' ? browser : chrome;

// IndexedDB wrapper for persistent storage across service worker restarts
const DB_NAME = 'PitokPMTracker';
const DB_VERSION = 1;
const STORE_NAME = 'listeners';

let db = null;

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with tabId as key
        database.createObjectStore(STORE_NAME, { keyPath: 'tabId' });
      }
    };
  });
}

// Get tab data from IndexedDB
async function getTabData(tabId) {
  try {
    await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(tabId);

      request.onsuccess = () => {
        const data = request.result || { tabId, listeners: [], push: false, lasturl: '' };
        resolve(data);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[PitokPM] IndexedDB read failed:', error);
    return { tabId, listeners: [], push: false, lasturl: '' };
  }
}

// Save tab data to IndexedDB
async function saveTabData(tabId, updates) {
  try {
    await initDB();
    const current = await getTabData(tabId);
    const merged = { ...current, tabId, ...updates };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(merged);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[PitokPM] IndexedDB write failed:', error);
  }
}

// Get all tabs data
async function getAllTabsData() {
  try {
    await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = {};
        (request.result || []).forEach(item => {
          result[item.tabId] = item.listeners || [];
        });
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[PitokPM] IndexedDB getAll failed:', error);
    return {};
  }
}

// Delete tab data from IndexedDB
async function deleteTabData(tabId) {
  try {
    await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(tabId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[PitokPM] IndexedDB delete failed:', error);
  }
}

// In-memory cache for selectedId (doesn't need persistence)
let selectedId = -1;

function isFromExtension(listener) {
  const stack = listener.stack || "";
  const fullstack = listener.fullstack || [];
  const allStacks = [stack, ...fullstack][0];
  return (
    /moz-extension:\/\//.test(allStacks) ||
    /chrome-extension:\/\//.test(allStacks)
  );
}

function parseExclusions(val) {
  return (val || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function excludedByTokens(item, tokens) {
  if (!tokens || tokens.length === 0) return false;
  const hay = ((item.domain || '') + ' ' + (item.stack || '') + ' ' + (item.listener || '')).toLowerCase();
  return tokens.some((tok) => hay.includes(tok));
}

async function refreshCount(targetId) {
  const id = Number.isInteger(targetId) && targetId >= 0 ? targetId : selectedId;
  if (!Number.isInteger(id) || id < 0) {
    // Try to infer current active tab to avoid errors on -1
    return runtime.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        selectedId = tabs[0].id;
        refreshCount(selectedId);
      }
    });
  }

  // Fetch from IndexedDB
  const tabData = await getTabData(id);
  const listeners = tabData.listeners || [];

  runtime.storage.sync.get({ filter_extensions: true, exclude_sources: 'jquery, googletagmanager' }, (settings) => {
    const filtered = settings.filter_extensions
      ? listeners.filter((l) => !isFromExtension(l))
      : listeners;

    const tokens = parseExclusions(settings.exclude_sources || '');
    const filtered2 = filtered.filter((l) => !excludedByTokens(l, tokens));

    const txt = filtered2.length;

    runtime.tabs.get(id, () => {
      if (!runtime.runtime.lastError) {
        // FIX: Always set badge text, including empty string for 0 listeners
        runtime.action.setBadgeText({
          text: txt > 0 ? txt.toString() : "",
          tabId: id,
        });
        runtime.action.setBadgeBackgroundColor({
          tabId: id,
          color: txt > 0 ? [255, 0, 0, 255] : [0, 0, 0, 0], // Transparent when 0
        });
      }
    });
  });
}

function logListener(data) {
  runtime.storage.sync.get({ log_url: "" }, (items) => {
    const log_url = items.log_url;
    if (!log_url) return;
    try {
      fetch(log_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.warn("Log fetch failed:", e);
    }
  });
}

// FIX: Consolidate all message handlers into single listener to prevent race conditions
runtime.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle popup/options messages (no sender.tab)
  if (!sender.tab) {
    if (msg === 'get-stuff') {
      // Return all listeners from IndexedDB
      getAllTabsData().then(allListeners => {
        sendResponse({ listeners: allListeners });
      }).catch(err => {
        console.error('[PitokPM] Failed to get listeners:', err);
        sendResponse({ listeners: {} });
      });
      return true; // Keep channel open for async response
    }
    if (msg === "refresh-badge") {
      refreshCount();
      return false;
    }
    return false;
  }

  // Handle content script messages (has sender.tab) - make async
  const tabId = sender.tab.id;
  if (!tabId) return false;

  // Process async operations
  (async () => {
    if (msg.listener && msg.listener !== "function () { [native code] }") {
      msg.parent_url = sender.tab.url;

      // Get current listeners from IndexedDB
      const tabData = await getTabData(tabId);
      const listeners = tabData.listeners || [];
      listeners.push(msg);

      // Save updated listeners to IndexedDB
      await saveTabData(tabId, { listeners });
      logListener(msg);
    }

    if (msg.pushState) {
      const tabData = await getTabData(tabId);
      await saveTabData(tabId, { push: true });
    }

    if (msg.changePage) {
      // FIX: Clear listeners on page change (beforeunload)
      await saveTabData(tabId, { listeners: [], push: false, lasturl: '' });
    }

    if (msg.log) console.log(msg.log);
    else {
      if (selectedId < 0) selectedId = tabId; // initialize selection early
      refreshCount(tabId);
    }
  })();

  return false; // No async response needed for content script messages
});

runtime.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // FIX: Only clear listeners on actual navigation, not sub-resource loading
  if (changeInfo.status === 'loading' && changeInfo.url) {
    (async () => {
      // Get current URL from IndexedDB
      const tabData = await getTabData(tabId);
      const currentUrl = tabData.lasturl || '';
      const newUrl = changeInfo.url;

      // Additional safety: Don't clear if it's just a hash change or query param change
      const urlChanged = !currentUrl || (
        newUrl !== currentUrl &&
        newUrl.split('#')[0] !== currentUrl.split('#')[0] // Different base URL
      );

      if (urlChanged) {
        console.log(`[PitokPM] Clearing listeners for tab ${tabId}: ${currentUrl} -> ${newUrl}`);
        await saveTabData(tabId, { listeners: [], push: false, lasturl: newUrl });
      }
    })();
  }
  if (changeInfo.status === 'complete' && tabId === selectedId) {
    refreshCount();
  }
});

runtime.tabs.onActivated.addListener((activeInfo) => {
  selectedId = activeInfo.tabId;
  refreshCount();
});

// Clean up IndexedDB when tabs are closed to prevent bloat
runtime.tabs.onRemoved.addListener((tabId) => {
  deleteTabData(tabId);
  console.log(`[PitokPM] Cleaned up data for closed tab ${tabId}`);
});

runtime.runtime.onStartup.addListener(() => {
  // Initialize IndexedDB on startup
  initDB().then(() => {
    console.log('[PitokPM] IndexedDB initialized');
  }).catch(err => {
    console.error('[PitokPM] IndexedDB initialization failed:', err);
  });

  runtime.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      selectedId = tabs[0].id;
      refreshCount();
    }
  });
});

// Initialize IndexedDB immediately when service worker starts
initDB().catch(err => console.error('[PitokPM] IndexedDB init failed:', err));
