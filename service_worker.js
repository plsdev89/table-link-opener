const STORAGE_KEY = "opened_by_date"; // { 'YYYY-MM-DD': [urls...] }

function formatDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function storageGet(key) {
  return new Promise((resolve) =>
    chrome.storage.local.get(key, (res) => resolve(res[key] || {})),
  );
}

function storageSet(obj) {
  return new Promise((resolve) =>
    chrome.storage.local.set(obj, () => resolve()),
  );
}

function pruneOldEntries(map) {
  const keepDays = 7; // keep last 7 days including today
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (keepDays - 1));
  const cutoffStr = formatDate(cutoff);
  const out = {};
  for (const [date, arr] of Object.entries(map || {})) {
    if (date >= cutoffStr) out[date] = Array.isArray(arr) ? arr : [];
  }
  return out;
}

function urlIsRecorded(recordMap, url) {
  if (!recordMap) return false;
  for (const arr of Object.values(recordMap)) {
    if (Array.isArray(arr) && arr.includes(url)) return true;
  }
  return false;
}

async function recordOpenedUrls(urls) {
  if (!urls || !urls.length) return;
  const current = await storageGet(STORAGE_KEY);
  const pruned = pruneOldEntries(current);
  const today = formatDate();
  const set = new Set(pruned[today] || []);
  for (const u of urls) set.add(u);
  pruned[today] = Array.from(set);
  await storageSet({ [STORAGE_KEY]: pruned });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    // load recorded URLs and prune locally (we'll write after opening any new ones)
    const recorded = await storageGet(STORAGE_KEY);
    const pruned = pruneOldEntries(recorded);

    // collect links from current page (re-parses DOM at click-time)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const anchors = Array.from(document.querySelectorAll("table a[href]"));
        const urls = anchors
          .map((a) => a.href)
          .filter((v, i, arr) => v && arr.indexOf(v) === i);
        return urls;
      },
    });

    const links = results && results[0] && results[0].result;
    if (!links || !links.length) return;

    // unique and filter against recorded (last 7 days)
    const unique = links.filter((v, i, arr) => v && arr.indexOf(v) === i);
    const toOpen = unique.filter((u) => !urlIsRecorded(pruned, u));
    if (!toOpen.length) return;

    // open each link in new tab(s) next to current tab
    let insertIndex = typeof tab.index === "number" ? tab.index + 1 : undefined;
    for (const url of toOpen) {
      const createOpts = { url };
      if (typeof insertIndex === "number") {
        createOpts.index = insertIndex;
        createOpts.active = false;
        insertIndex++;
      }
      chrome.tabs.create(createOpts);
    }

    // record opened URLs and prune older than week
    await recordOpenedUrls(toOpen);
  } catch (err) {
    console.error("Table Link Opener error:", err);
  }
});

// Handle messages from content script (overlay button)
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || msg.type !== "openLinksFromContent") return;
  const links = Array.isArray(msg.links) ? msg.links : [];
  if (!links.length) return;
  try {
    const recorded = await storageGet(STORAGE_KEY);
    const pruned = pruneOldEntries(recorded);
    const unique = links.filter((v, i, arr) => v && arr.indexOf(v) === i);
    const toOpen = unique.filter((u) => !urlIsRecorded(pruned, u));
    if (!toOpen.length) return;

    // try to open next to the sender tab when available
    let insertIndex;
    if (sender && sender.tab && typeof sender.tab.index === "number") {
      insertIndex = sender.tab.index + 1;
    } else {
      // fallback to active tab in last focused window
      const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (tabs && tabs[0] && typeof tabs[0].index === "number")
        insertIndex = tabs[0].index + 1;
    }

    for (const url of toOpen) {
      const createOpts = { url };
      if (typeof insertIndex === "number") {
        createOpts.index = insertIndex;
        createOpts.active = false;
        insertIndex++;
      }
      chrome.tabs.create(createOpts);
    }

    await recordOpenedUrls(toOpen);
  } catch (err) {
    console.error("Table Link Opener message handler error:", err);
  }
});
