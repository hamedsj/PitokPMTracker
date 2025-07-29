function loaded() {
  chrome.runtime.sendMessage("get-stuff", (msg) => {
    console.log("message received:", msg);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const selectedId = tabs[0].id;
      if (msg && msg.listeners && msg.listeners[selectedId]) {
        listListeners(msg.listeners[selectedId]);
      } else {
        console.warn("No listeners found for tab", selectedId);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", loaded);

function listListeners(listeners) {
  var x = document.getElementById("x");
  if (x) x.parentElement.removeChild(x);
  x = document.createElement("ol");
  x.id = "x";

  document.getElementById("h").innerText = listeners.length
    ? listeners[0].parent_url
    : "";

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
      const result = hljs.highlight(listener.listener, {
        language: "javascript",
      });
      code.innerHTML = result.value;
    } catch (err) {
      code.textContent =
        "Highlight.js failed to parse code: " +
        err +
        "\n\n" +
        listener.listener;
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
            prettifiedCode = prettier.format(originalCode, {
              parser: "babel",
              plugins: prettierPlugins,
            });
          }
          const result = hljs.highlight(prettifiedCode, {
            language: "javascript",
          });
          code.innerHTML = result.value;
          btn.textContent = "Original";
          isPrettified = true;
        } else {
          const result = hljs.highlight(originalCode, {
            language: "javascript",
          });
          code.innerHTML = result.value;
          btn.textContent = "Prettify";
          isPrettified = false;
        }
      } catch (e) {
        console.error("Prettify toggle failed:", e);
        alert("Could not format the code.");
      }
    });

    const container = document.createElement("div");
    container.style.position = "relative";
    container.appendChild(btn);
    container.appendChild(pel);

    el.appendChild(container);

    x.appendChild(el);
  }

  document.getElementById("content").appendChild(x);
}
