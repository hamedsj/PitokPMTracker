let tab_listeners = {};
let tab_push = {};
let tab_lasturl = {};
let selectedId = -1;

function refreshCount() {
  const txt = tab_listeners[selectedId] ? tab_listeners[selectedId].length : 0;
  chrome.tabs.get(selectedId, () => {
    if (!chrome.runtime.lastError) {
      chrome.action.setBadgeText({ text: txt.toString(), tabId: selectedId });
      chrome.action.setBadgeBackgroundColor({
        tabId: selectedId,
        color: txt > 0 ? [255, 0, 0, 255] : [0, 0, 255, 0]
      });
    }
  });
}

function logListener(data) {
  chrome.storage.sync.get({ log_url: '' }, (items) => {
    const log_url = items.log_url;
    if (!log_url) return;
    try {
      fetch(log_url, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.warn('Log fetch failed:', e);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.listener && msg.listener !== 'function () { [native code] }') {
    msg.parent_url = sender.tab.url;
    tab_listeners[tabId] = tab_listeners[tabId] || [];
    tab_listeners[tabId].push(msg);
    logListener(msg);
  }

  if (msg.pushState) tab_push[tabId] = true;
  if (msg.changePage) delete tab_lasturl[tabId];
  if (msg.log) console.log(msg.log);
  else refreshCount();
});

chrome.tabs.onUpdated.addListener((tabId, props) => {
  if (props.status === 'complete' && tabId === selectedId) {
    refreshCount();
  } else if (props.status) {
    if (tab_push[tabId]) {
      delete tab_push[tabId]; // pushState change
    } else if (!tab_lasturl[tabId]) {
      tab_listeners[tabId] = []; // treat as new navigation
    }
  }

  if (props.status === 'loading') {
    tab_lasturl[tabId] = true;
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  selectedId = activeInfo.tabId;
  refreshCount();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      selectedId = tabs[0].id;
      refreshCount();
    }
  });
});

// Replace onConnect with runtime message-based query
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'get-stuff') {
    sendResponse({ listeners: tab_listeners });
  }
});