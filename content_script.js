// Inject a floating overlay button that collects table links and sends them to the background script.
(function () {
  if (window.__tableLinkOpenerInjected) return;
  window.__tableLinkOpenerInjected = true;

  const STORAGE_KEY = "overlay_pos_" + location.hostname;

  function createButton(pos) {
    const btn = document.createElement("button");
    btn.id = "table-link-opener-btn";
    btn.textContent = "Open table links";
    Object.assign(btn.style, {
      position: "fixed",
      zIndex: 2147483647,
      background: "#007bff",
      color: "#fff",
      border: "none",
      padding: "10px 14px",
      borderRadius: "6px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      cursor: "pointer",
      fontSize: "14px",
      userSelect: "none",
    });

    if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
      btn.style.left = pos.left + "px";
      btn.style.top = pos.top + "px";
    } else {
      btn.style.right = "16px";
      btn.style.bottom = "16px";
    }

    addDragHandlers(btn);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function addDragHandlers(btn) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function getClient(e) {
      if (e.touches && e.touches[0])
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function onDown(e) {
      if (e.type === "mousedown" && e.button !== 0) return;
      e.preventDefault();
      const c = getClient(e);
      dragging = true;
      startX = c.x;
      startY = c.y;
      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const c = getClient(e);
      const dx = c.x - startX;
      const dy = c.y - startY;
      let left = startLeft + dx;
      let top = startTop + dy;
      const rect = btn.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      if (left < 0) left = 0;
      if (left + rect.width > winW) left = winW - rect.width;
      if (top < 0) top = 0;
      if (top + rect.height > winH) top = winH - rect.height;
      btn.style.left = left + "px";
      btn.style.top = top + "px";
      btn.style.right = "auto";
      btn.style.bottom = "auto";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      const left = parseInt(
        btn.style.left || btn.getBoundingClientRect().left,
        10,
      );
      const top = parseInt(
        btn.style.top || btn.getBoundingClientRect().top,
        10,
      );
      const save = {};
      save[STORAGE_KEY] = { left, top };
      try {
        chrome.storage.local.set(save);
      } catch (err) {
        // ignore in non-extension environments
      }
    }

    btn.addEventListener("mousedown", onDown);
    btn.addEventListener("touchstart", onDown, { passive: false });
  }

  async function onClick(e) {
    e.stopPropagation();
    const anchors = Array.from(document.querySelectorAll("table a[href]"));
    const urls = anchors
      .map((a) => a.href)
      .filter((v, i, arr) => v && arr.indexOf(v) === i);
    if (!urls.length) return;
    try {
      chrome.runtime.sendMessage({ type: "openLinksFromContent", links: urls });
    } catch (err) {
      console.error("Table Link Opener content script sendMessage failed", err);
    }
  }

  function attachButton() {
    let btn = document.getElementById("table-link-opener-btn");
    if (!btn) {
      try {
        chrome.storage.local.get(STORAGE_KEY, (res) => {
          const pos = res && res[STORAGE_KEY];
          const b = createButton(pos);
          document.body.appendChild(b);
        });
      } catch (err) {
        // fallback if chrome.storage not available
        const b = createButton();
        document.body.appendChild(b);
      }
    }
  }

  // Attach initially
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachButton);
  } else {
    attachButton();
  }

  // Re-attach on history navigation for SPA pages (pushState/replaceState) and popstate
  (function () {
    const _push = history.pushState;
    history.pushState = function () {
      _push.apply(this, arguments);
      setTimeout(attachButton, 50);
    };
    const _replace = history.replaceState;
    history.replaceState = function () {
      _replace.apply(this, arguments);
      setTimeout(attachButton, 50);
    };
    window.addEventListener("popstate", () => setTimeout(attachButton, 50));
  })();
})();
