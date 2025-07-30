(function(pushstate, msgeventlistener, msgporteventlistener) {
  var loaded = false;
  var originalFunctionToString = Function.prototype.toString;

  var m = function(detail) {
    var storeEvent = new CustomEvent('postMessageTracker', { detail });
    document.dispatchEvent(storeEvent);
  };

  var h = function(p) {
    var hops = "";
    try {
      if (!p) p = window;
      if (p.top != p && p.top == window.top) {
        var w = p;
        while (top != w) {
          var x = 0;
          for (var i = 0; i < w.parent.frames.length; i++) {
            if (w == w.parent.frames[i]) x = i;
          }
          hops = "frames[" + x + "]" + (hops.length ? "." : "") + hops;
          w = w.parent;
        }
        hops = "top" + (hops.length ? "." + hops : "");
      } else {
        hops = p.top == window.top ? "top" : "diffwin";
      }
    } catch (e) {}
    return hops;
  };

  var jq = function(instance) {
    if (!instance || !instance.message || !instance.message.length) return;
    var j = 0;
    while ((e = instance.message[j++])) {
      listener = e.handler;
      if (!listener) return;
      m({ window: window.top == window ? 'top' : window.name, hops: h(), domain: document.domain, stack: 'jQuery', listener: listener.toString() });
    }
  };

  var l = function(listener, pattern_before, additional_offset) {
    var offset = 3 + (additional_offset || 0);
    try {
      throw new Error('');
    } catch (error) {
      var stack = error.stack || '';
    }
    stack = stack.split('\n').map(line => line.trim());
    var fullstack = stack.slice();

    if (pattern_before) {
      var nextitem = false;
      stack = stack.filter(e => {
        if (nextitem) {
          nextitem = false;
          return true;
        }
        if (e.match(pattern_before)) nextitem = true;
        return false;
      });
      stack = stack[0];
    } else {
      stack = stack[offset];
    }

    var listener_str = listener.__postmessagetrackername__ || listener.toString();
    m({ window: window.top == window ? 'top' : window.name, hops: h(), domain: document.domain, stack, fullstack, listener: listener_str });
  };

  var jqc = function(key) {
    if (typeof window[key] == 'function' && typeof window[key]._data == 'function') {
      var ev = window[key]._data(window, 'events');
      jq(ev);
    } else if (window[key] && (expando = window[key].expando)) {
      var i = 1;
      while ((instance = window[expando + i++])) {
        jq(instance.events);
      }
    } else if (window[key]) {
      jq(window[key].events);
    }
  };

  var j = function() {
    var all = Object.getOwnPropertyNames(window);
    for (var i = 0; i < all.length; i++) {
      var key = all[i];
      if (key.indexOf('jQuery') !== -1) {
        jqc(key);
      }
    }
    loaded = true;
  };

  History.prototype.pushState = function(state, title, url) {
    m({ pushState: true });
    return pushstate.apply(this, arguments);
  };

  var original_setter = window.__lookupSetter__('onmessage');
  window.__defineSetter__('onmessage', function(listener) {
    if (listener) {
      l(listener.toString());
    }
    original_setter(listener);
  });

  var c = function(listener) {
    var listener_str = originalFunctionToString.apply(listener);
    if (listener_str.match(/\.deep.*apply.*captureException/s)) return 'raven';
    if (listener_str.match(/arguments.*(start|typeof).*err.*finally.*end/s) && listener["nr@original"] && typeof listener["nr@original"] == "function") return 'newrelic';
    if (listener_str.match(/rollbarContext.*rollbarWrappedError/s) && listener._isWrap) return 'rollbar';
    if (listener_str.match(/autoNotify.*(unhandledException|notifyException)/s) && typeof listener.bugsnag == "function") return 'bugsnag';
    if (listener_str.match(/call.*arguments.*typeof.*apply/s) && typeof listener.__sentry_original__ == "function") return 'sentry';
    if (listener_str.match(/function.*function.*\.apply.*arguments/s) && typeof listener.__trace__ == "function") return 'bugsnag2';
    return false;
  };

  var onmsgport = function(e) {
    var msg = '%c[Port]%c → %c' + h(e.source) + '%c ' + (typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
    console.log(msg, 'color: blue;', '', 'color: purple;', '');
  };

  var onmsg = function(e) {
    var msg = '%c[Window]%c → %c' + h(e.source) + '%c ' + (typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
    console.log(msg, 'color: red;', '', 'color: green;', '');
  };

  window.addEventListener('message', onmsg);
  MessagePort.prototype.addEventListener = function(type, listener, useCapture) {
    if (!this.__postmessagetrackername__) {
      this.__postmessagetrackername__ = true;
      this.addEventListener('message', onmsgport);
    }
    return msgporteventlistener.apply(this, arguments);
  };

  Window.prototype.addEventListener = function(type, listener, useCapture) {
    if (type === 'message') {
      var pattern_before = false, offset = 0;
      if (listener.toString().includes('event.dispatch.apply')) {
        pattern_before = /init\.on|init\..*on\]/;
        if (loaded) setTimeout(j, 100);
      }
      var unwrap = function(listener) {
        var found = c(listener);
        if (found === 'raven') {
          var f;
          for (var key in listener) {
            var v = listener[key];
            if (typeof v === "function") f = v;
          }
          listener = unwrap(f);
          offset++;
        } else if (found === 'newrelic') {
          listener = unwrap(listener["nr@original"]);
          offset++;
        } else if (found === 'sentry') {
          listener = unwrap(listener["__sentry_original__"]);
          offset++;
        }
        return listener;
      };
      if (typeof listener === "function") {
        listener = unwrap(listener);
        l(listener, pattern_before, offset);
      }
    }
    return msgeventlistener.apply(this, arguments);
  };

  window.addEventListener('load', j);
  window.addEventListener('postMessageTrackerUpdate', j);
})(History.prototype.pushState, Window.prototype.addEventListener, MessagePort.prototype.addEventListener);
