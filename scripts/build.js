#!/usr/bin/env node
/*
  Zero-dependency build for the extension.
  - Copies shared JS from src/ to dist/{chrome,firefox}
  - Keeps each browser's manifest.json as-is
  - Copies static assets (icons, styles, vendor libs)
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');

function rimraf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

function writeFromSrc(targetDir) {
  const out = path.join(dist, targetDir);
  ensureDir(out);

  // JS from src (shared across browsers)
  const js = ['background.js', 'content_script.js', 'injected.js', 'popup.js', 'options.js'];
  js.forEach((f) => copyFile(path.join('src', f), path.join(out, f)));

  // Static vendor libs (from chrome folder today)
  ['highlight.min.js', 'prettier.min.js', 'parser-babel.js'].forEach((f) => {
    copyFile(path.join('chrome', f), path.join(out, f));
  });

  // HTML (popup/options)
  // Keep per-target HTML if needed; for now copy from that browser folder
  ['popup.html', 'options.html'].forEach((f) => {
    const srcHtml = path.join(targetDir.replace('dist/', ''), f);
    const fallbackHtml = path.join('chrome', f);
    const source = fs.existsSync(srcHtml) ? srcHtml : fallbackHtml;
    copyFile(source, path.join(out, f));
  });

  // Styles and icons (reuse chrome assets for both unless folder exists)
  const iconsSrc = fs.existsSync(path.join(targetDir.replace('dist/', ''), 'icons'))
    ? path.join(targetDir.replace('dist/', ''), 'icons')
    : path.join('chrome', 'icons');
  copyDir(iconsSrc, path.join(out, 'icons'));

  const stylesSrc = fs.existsSync(path.join(targetDir.replace('dist/', ''), 'styles'))
    ? path.join(targetDir.replace('dist/', ''), 'styles')
    : path.join('chrome', 'styles');
  copyDir(stylesSrc, path.join(out, 'styles'));
}

function main() {
  rimraf(dist);
  ensureDir(dist);

  // Chrome
  const chromeOut = path.join(dist, 'chrome');
  ensureDir(chromeOut);
  copyFile(path.join('chrome', 'manifest.json'), path.join(chromeOut, 'manifest.json'));
  writeFromSrc('chrome');

  // Firefox
  const firefoxOut = path.join(dist, 'firefox');
  ensureDir(firefoxOut);
  copyFile(path.join('firefox', 'manifest.json'), path.join(firefoxOut, 'manifest.json'));
  writeFromSrc('firefox');

  console.log('Build complete. Output in dist/chrome and dist/firefox');
}

main();

