# Table Link Opener

Quick Chrome extension to open all links found inside HTML tables on the current page when you click the extension icon.

Installation (developer mode):

1. Open `chrome://extensions` in Chrome.
2. Enable "Developer mode".
3. Click "Load unpacked" and select this repository folder.

Usage:

- Navigate to a page that contains one or more `<table>` elements with links inside.
- Click the extension icon (toolbar). The extension will open each distinct `href` found under `table a[href]` in a new tab.

Notes & next steps:

- Pop-up blocking may prevent many automatic windows; opening tabs via the background script is more reliable.
- I can add options (limit count, open in background, skip duplicates) or an icon if you want.
