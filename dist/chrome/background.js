// Cross-browser runtime helper
const runtime = typeof browser !== 'undefined' ? browser : chrome;

let tab_listeners = {};
let tab_push = {};
let tab_lasturl = {};
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

function refreshCount(targetId) {
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

  runtime.storage.sync.get({ filter_extensions: true, exclude_sources: 'jquery, googletagmanager' }, (settings) => {
    const listeners = tab_listeners[id] || [];
    const filtered = settings.filter_extensions
      ? listeners.filter((l) => !isFromExtension(l))
      : listeners;

    const tokens = parseExclusions(settings.exclude_sources || '');
    const filtered2 = filtered.filter((l) => !excludedByTokens(l, tokens));

    const txt = filtered2.length;

    runtime.tabs.get(id, () => {
      if (!runtime.runtime.lastError) {
        runtime.action.setBadgeText({
          text: txt > 0 ? txt.toString() : "",
          tabId: id,
        });
        runtime.action.setBadgeBackgroundColor({
          tabId: id,
          color: txt > 0 ? [255, 0, 0, 255] : [0, 0, 255, 0],
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

runtime.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.listener && msg.listener !== "function () { [native code] }") {
    msg.parent_url = sender.tab.url;
    tab_listeners[tabId] = tab_listeners[tabId] || [];
    tab_listeners[tabId].push(msg);
    logListener(msg);
  }

  if (msg.pushState) tab_push[tabId] = true;
  if (msg.changePage) delete tab_lasturl[tabId];
  if (msg.log) console.log(msg.log);
  else {
    if (selectedId < 0) selectedId = tabId; // initialize selection early
    refreshCount(tabId);
  }
});

runtime.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tab_listeners[tabId] = [];
    delete tab_push[tabId];
    delete tab_lasturl[tabId];
  }
  if (changeInfo.status === 'complete' && tabId === selectedId) {
    refreshCount();
  }
});

runtime.tabs.onActivated.addListener((activeInfo) => {
  selectedId = activeInfo.tabId;
  refreshCount();
});

runtime.runtime.onStartup.addListener(() => {
  runtime.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      selectedId = tabs[0].id;
      refreshCount();
    }
  });
});

runtime.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'get-stuff') {
    sendResponse({ listeners: tab_listeners });
  }
});

runtime.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === "refresh-badge") {
    refreshCount();
  }
});
