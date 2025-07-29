// Inject the postMessage tracker script into the page context
if (document.contentType !== 'application/xml') {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.type = 'text/javascript';
  script.defer = true;
  document.documentElement.appendChild(script);
}

// Relay messages from the injected script to the background script
window.addEventListener('beforeunload', () => {
  const storeEvent = new CustomEvent('postMessageTracker', {
    detail: { changePage: true }
  });
  document.dispatchEvent(storeEvent);
});

document.addEventListener('postMessageTracker', (event) => {
  chrome.runtime.sendMessage(event.detail);
});