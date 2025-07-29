// Inject the postMessage tracker script into the page context
if (document.contentType !== 'application/xml') {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js'); // Works in Firefox too
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
  // Use 'browser' if available, fallback to 'chrome'
  const runtime = typeof browser !== 'undefined' ? browser : chrome;
  runtime.runtime.sendMessage(event.detail);
});