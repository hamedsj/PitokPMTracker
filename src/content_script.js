// Inject the postMessage tracker script into the page context
if (document.contentType !== 'application/xml' && !document.documentElement.dataset.pitokInjected) {
  document.documentElement.dataset.pitokInjected = '1';
  const script = document.createElement('script');
  script.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('injected.js');
  script.type = 'text/javascript';
  // No defer: execute as soon as possible to catch early listeners
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
  const runtime = typeof browser !== 'undefined' ? browser : chrome;
  runtime.runtime.sendMessage(event.detail);
});

