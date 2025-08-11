// Node's built-in test runner (Node >=18)
const test = require('node:test');
const assert = require('node:assert/strict');

// Import helpers from src/popup.js (guarded for Node)
const { isFromExtension, filterListeners, shortenMiddle } = require('../src/popup.js');

test('isFromExtension detects chrome-extension in stack', () => {
  const listener = {
    stack: 'at handler (chrome-extension://abc123/script.js:10:5)',
    fullstack: []
  };
  assert.equal(isFromExtension(listener), true);
});

// Note: By design, current isFromExtension only checks the first entry.

test('isFromExtension returns false for normal http(s) stacks', () => {
  const listener = {
    stack: 'at fn (https://example.com/app.js:100:20)',
    fullstack: [
      'at another (http://example.com/app.js:1:1)'
    ]
  };
  assert.equal(isFromExtension(listener), false);
});

test('filterListeners excludes extension listeners when excludeExtensions=true', () => {
  const listeners = [
    { stack: 'at (chrome-extension://id/file.js:1:1)', fullstack: [], listener: 'fn(){}' },
    { stack: 'at (https://site/script.js:1:1)', fullstack: [], listener: 'fn(){}' },
  ];
  const filtered = filterListeners(listeners, true);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].stack.includes('https://site'), true);
});

test('filterListeners keeps all when excludeExtensions=false', () => {
  const listeners = [
    { stack: 'at (chrome-extension://id/file.js:1:1)', fullstack: [], listener: 'fn(){}' },
    { stack: 'at (https://site/script.js:1:1)', fullstack: [], listener: 'fn(){}' },
  ];
  const filtered = filterListeners(listeners, false);
  assert.equal(filtered.length, 2);
});

test('shortenMiddle leaves short strings untouched', () => {
  const s = 'short string';
  assert.equal(shortenMiddle(s, 20), s);
});

test('shortenMiddle truncates long strings with ellipsis and preserves ends', () => {
  const s = 'https://very.long.domain.example.com/some/really/long/path?with=query&and=params';
  const out = shortenMiddle(s, 30);
  assert.equal(out.includes('...'), true);
  assert.equal(out.startsWith('https://very'), true);
  assert.equal(out.endsWith('and=params'), true);
  assert.ok(out.length <= 30);
});
