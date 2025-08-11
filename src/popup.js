function isFromExtension(listener) {
  const stack = listener.stack || "";
  const fullstack = listener.fullstack || [];
  const allStacks = [stack, ...fullstack][0];
  return (
    /moz-extension:\/\//.test(allStacks) ||
    /chrome-extension:\/\//.test(allStacks)
  );
}

function filterListeners(listeners, excludeExtensions) {
  return excludeExtensions
    ? listeners.filter((listener) => !isFromExtension(listener))
    : listeners;
}

function loaded() {
  const runtime = typeof browser !== "undefined" ? browser : chrome;
  const checkbox = document.getElementById("filter-ext");

  runtime.storage.sync.get({ filter_extensions: true }, (items) => {
    checkbox.checked = !items.filter_extensions;
    refresh();
  });

  checkbox.addEventListener("change", () => {
    runtime.storage.sync.set({ filter_extensions: !checkbox.checked }, () => {
      runtime.runtime.sendMessage("refresh-badge");
      refresh();
    });
  });

  function refresh() {
    runtime.runtime.sendMessage("refresh-badge");

    runtime.runtime.sendMessage("get-stuff", (msg) => {
      runtime.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const selectedTab = tabs[0];
        const selectedId = selectedTab.id;
        const rawListeners = msg && msg.listeners && msg.listeners[selectedId];
        const filtered = filterListeners(rawListeners || [], !checkbox.checked);

        const h = document.getElementById("h");
        const fullUrl = selectedTab.url || "";
        h.innerText = fullUrl;
        h.title = fullUrl;

        requestAnimationFrame(() => {
          if (h.scrollWidth > h.clientWidth) {
            h.innerText = shortenMiddle(fullUrl);
          }
        });

        listListeners(filtered);
      });
    });
  }
}

function shortenMiddle(text, maxLength = 60) {
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 3) / 2);
  return text.slice(0, half) + "..." + text.slice(-half);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", loaded);
}

function listListeners(listeners) {
  var x = document.getElementById("x");
  if (x) x.parentElement.removeChild(x);
  x = document.createElement("ol");
  x.id = "x";

  for (var i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
    const el = document.createElement("li");

    const bel = document.createElement("b");
    bel.innerText = listener.domain + " ";

    const win = document.createElement("code");
    win.innerText =
      " " +
      (listener.window ? listener.window + " " : "") +
      (listener.hops && listener.hops.length ? listener.hops : "");
    el.appendChild(bel);
    el.appendChild(win);

    const sel = document.createElement("span");
    if (listener.fullstack)
      sel.setAttribute("title", listener.fullstack.join("\n\n"));
    const seltxt = document.createTextNode(listener.stack);
    sel.appendChild(seltxt);
    el.appendChild(sel);

    const pel = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs language-javascript";

    try {
      const result = hljs.highlight(listener.listener, { language: "javascript" });
      code.innerHTML = result.value;
    } catch (err) {
      code.textContent =
        "Highlight.js failed to parse code: " + err + "\n\n" + listener.listener;
    }

    pel.appendChild(code);

    let originalCode = listener.listener;
    let prettifiedCode = null;
    let isPrettified = false;

    const btn = document.createElement("button");
    btn.textContent = "Prettify";
    btn.style.position = "absolute";
    btn.style.top = "4px";
    btn.style.right = "4px";
    btn.style.fontSize = "10px";
    btn.style.padding = "3px 6px";
    btn.style.border = "1px solid #ccc";
    btn.style.borderRadius = "4px";
    btn.style.background = "#2e2e33";
    btn.style.color = "#aaaab1";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "10";
    btn.style.marginBottom = "4px";

    btn.addEventListener("click", () => {
      try {
        if (!isPrettified) {
          if (!prettifiedCode) {
            try {
              prettifiedCode = prettier.format(originalCode, {
                parser: "babel",
                plugins: prettierPlugins,
              });
            } catch (prettierError) {
              console.error("Prettier formatting failed:", prettierError);
              prettifiedCode = originalCode;
            }
          }
          const result = hljs.highlight(prettifiedCode, { language: "javascript" });
          code.innerHTML = result.value;
          btn.textContent = "Original";
          isPrettified = true;
        } else {
          const result = hljs.highlight(originalCode, { language: "javascript" });
          code.innerHTML = result.value;
          btn.textContent = "Prettify";
          isPrettified = false;
        }
      } catch (e) {
        console.error("Prettify toggle failed:", e);
      }
    });

    const container = document.createElement("div");
    container.style.position = "relative";

    try {
      prettifiedCode = prettier.format(originalCode, {
        parser: "babel",
        plugins: prettierPlugins,
      });
      container.appendChild(btn);
    } catch {}

    container.appendChild(pel);

    el.appendChild(container);

    x.appendChild(el);
  }

  const content = document.getElementById("content");
  content.appendChild(x);

  const existingMsg = document.getElementById("no-listeners");

  if (listeners.length === 0 && !existingMsg) {
    const msg = document.createElement("p");
    msg.id = "no-listeners";
    msg.innerText = "No PostMessage Listener Found =(";
    msg.style.fontStyle = "italic";
    msg.style.color = "#888";
    msg.style.marginTop = "20px";
    msg.style.textAlign = "center";
    msg.style.width = "100%";
    content.appendChild(msg);
  } else if (listeners.length > 0 && existingMsg) {
    existingMsg.remove();
  }
}

// Expose helpers for Node-based tests without affecting browser runtime
if (typeof module !== "undefined") {
  module.exports = { isFromExtension, filterListeners, shortenMiddle };
}

