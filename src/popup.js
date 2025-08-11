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
  const search = document.getElementById("search");
  const excludeInput = document.getElementById("exclude");
  const countBadge = document.getElementById("count-badge");

  let currentAll = [];
  let currentFiltered = [];

  runtime.storage.sync.get({ filter_extensions: true, exclude_sources: 'jquery, googletagmanager' }, (items) => {
    checkbox.checked = !items.filter_extensions;
    if (excludeInput) excludeInput.value = items.exclude_sources || '';
    refresh();
  });

  checkbox.addEventListener("change", () => {
    runtime.storage.sync.set({ filter_extensions: !checkbox.checked }, () => {
      runtime.runtime.sendMessage("refresh-badge");
      refresh();
    });
  });

  if (search) {
    search.addEventListener("input", () => {
      applySearchAndRender();
    });
  }

  if (excludeInput) {
    let t;
    excludeInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        runtime.storage.sync.set({ exclude_sources: excludeInput.value || '' }, () => {
          runtime.runtime.sendMessage("refresh-badge");
          applySearchAndRender();
        });
      }, 250);
    });
  }

  function refresh() {
    runtime.runtime.sendMessage("refresh-badge");

    runtime.runtime.sendMessage("get-stuff", (msg) => {
      runtime.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const selectedTab = tabs[0];
        const selectedId = selectedTab.id;
        const rawListeners = (msg && msg.listeners && msg.listeners[selectedId]) || [];
        currentAll = rawListeners.slice();
        currentFiltered = filterListeners(currentAll, !checkbox.checked);

        const h = document.getElementById("h");
        const fullUrl = selectedTab.url || "";
        h.innerText = fullUrl;
        h.title = fullUrl;

        requestAnimationFrame(() => {
          if (h.scrollWidth > h.clientWidth) {
            h.innerText = shortenMiddle(fullUrl);
          }
        });

        applySearchAndRender();
      });
    });
  }

  function parseExclusions(val) {
    return (val || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  function filterByExclusions(list, tokens) {
    if (!tokens || tokens.length === 0) return list;
    return list.filter((l) => {
      const hay = ((l.domain || '') + ' ' + (l.stack || '') + ' ' + (l.listener || '')).toLowerCase();
      return !tokens.some((tok) => hay.includes(tok));
    });
  }

  function applySearchAndRender() {
    const q = ((search && search.value) || "").toLowerCase();
    const tokens = parseExclusions(excludeInput ? excludeInput.value : '');
    const base = filterByExclusions(currentFiltered || [], tokens);
    const result = q
      ? base.filter((l) =>
          (l.domain || "").toLowerCase().includes(q) ||
          (l.stack || "").toLowerCase().includes(q) ||
          (l.listener || "").toLowerCase().includes(q)
        )
      : base;
    if (countBadge) countBadge.textContent = String(result.length);
    listListeners(result);
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
  const container = document.getElementById("x");
  container.innerHTML = "";

  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "row wrap";

    const domain = document.createElement("span");
    domain.className = "domain";
    domain.textContent = listener.domain || "";
    header.appendChild(domain);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${listener.window ? listener.window + " " : ""}${
      listener.hops && listener.hops.length ? listener.hops : ""
    }`;
    header.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "actions";
    const expandBtn = document.createElement("button");
    expandBtn.className = "btn";
    expandBtn.textContent = "Collapse";
    actions.appendChild(expandBtn);

    const prettifyBtn = document.createElement("button");
    prettifyBtn.className = "btn";
    prettifyBtn.textContent = "Prettify";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn";
    copyBtn.textContent = "Copy";
    actions.appendChild(copyBtn);

    header.appendChild(actions);

    const stack = document.createElement("span");
    stack.className = "stack";
    const fullStackStr = listener.stack || "";
    if (listener.fullstack) stack.title = listener.fullstack.join("\n\n");
    else stack.title = fullStackStr;
    stack.textContent = shortenMiddle(fullStackStr, 100);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs language-javascript";
    pre.style.display = "block";
    pre.appendChild(code);

    let originalCode = listener.listener || "";
    let prettifiedCode = null;
    let isPrettified = false;
    let isHighlighted = false;
    const hasSource = !!(originalCode && originalCode.trim() && originalCode.trim() !== 'function () { [native code] }');
    let canPrettify = hasSource;

    function highlightNow() {
      if (isHighlighted) return;
      if (!hasSource) {
        code.textContent = "No source available (native/wrapped or unavailable).";
      } else {
        try {
          const result = hljs.highlight(originalCode, { language: "javascript" });
          code.innerHTML = result.value;
        } catch (err) {
          code.textContent = "Highlight.js failed: " + err + "\n\n" + originalCode;
        }
      }
      isHighlighted = true;
    }

    // Expand by default and highlight initially
    highlightNow();

    expandBtn.addEventListener("click", () => {
      const open = pre.style.display !== "none";
      if (open) {
        pre.style.display = "none";
        expandBtn.textContent = "Expand";
      } else {
        pre.style.display = "block";
        expandBtn.textContent = "Collapse";
        highlightNow();
      }
    });

    // Pre-flight prettify check: hide button if Prettier cannot parse
    if (!hasSource) {
      canPrettify = false;
    } else {
      try {
        // Attempt formatting once; if it fails, disable the button
        prettifiedCode = prettier.format(originalCode, { parser: "babel", plugins: prettierPlugins });
        canPrettify = true;
      } catch (e) {
        canPrettify = false;
      }
    }
    if (canPrettify) {
      // Insert the button only when formatting is possible
      actions.insertBefore(prettifyBtn, copyBtn);
      prettifyBtn.addEventListener("click", () => {
        try {
          if (!hasSource || !canPrettify) return;
          if (!isPrettified) {
            const result = hljs.highlight(prettifiedCode, { language: "javascript" });
            code.innerHTML = result.value;
            prettifyBtn.textContent = "Original";
            isPrettified = true;
          } else {
            const result = hljs.highlight(originalCode, { language: "javascript" });
            code.innerHTML = result.value;
            prettifyBtn.textContent = "Prettify";
            isPrettified = false;
          }
          pre.style.display = "block";
          expandBtn.textContent = "Collapse";
          isHighlighted = true;
        } catch (e) {
          console.error("Prettify toggle failed:", e);
        }
      });
    }

    copyBtn.addEventListener("click", async () => {
      try {
        const toCopy = hasSource ? (isPrettified && prettifiedCode ? prettifiedCode : originalCode) : '';
        await navigator.clipboard.writeText(toCopy);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    });

    card.appendChild(header);
    card.appendChild(stack);
    card.appendChild(pre);
    container.appendChild(card);
  }

  const existingMsg = document.getElementById("no-listeners");
  if (listeners.length === 0) {
    if (!existingMsg) {
      const msg = document.createElement("p");
      msg.id = "no-listeners";
      msg.innerText = "No PostMessage Listener Found =(";
      msg.style.fontStyle = "italic";
      msg.style.color = "#888";
      msg.style.marginTop = "20px";
      msg.style.textAlign = "center";
      msg.style.width = "100%";
      container.parentElement.appendChild(msg);
    }
  } else if (existingMsg) {
    existingMsg.remove();
  }
}

// Expose helpers for Node-based tests without affecting browser runtime
if (typeof module !== "undefined") {
  module.exports = { isFromExtension, filterListeners, shortenMiddle };
}
