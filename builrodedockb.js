/* builrodedockb v1.0.1
   Single writer for bhProject. Owns .bh-add controls, quantity accordion,
   project-mode sheet, lane switching, dock render, contact discovery,
   hero WhatsApp fallback, legacy suppression and body padding.
   Supersedes builrodedocka and builrodeselect3.
   Inert on any page without #bhDock. */
(function () {
  "use strict";

  var dock = null;

  /* ================= registry — canonical key is the only identity ========= */
  var SERVICES = {
    "kitchen":               { legacy: "Kitchen",                 unit: "kitchen",   lane: "a", repeatable: false },
    "bathroom":              { legacy: "Bathroom",                unit: "bathroom",  lane: "a", repeatable: true  },
    "bedroom":               { legacy: "Bedroom",                 unit: "bedroom",   lane: "a", repeatable: true  },
    "living-room":           { legacy: "Living room",             unit: "living room", lane: "a", repeatable: false },
    "balcony":               { legacy: "Balcony",                 unit: "balcony",   lane: "a", repeatable: true  },
    "painting":              { legacy: "Painting",                unit: "painting",  lane: "a", repeatable: false },
    "flooring":              { legacy: "Flooring",                unit: "flooring",  lane: "a", repeatable: false },
    "false-ceiling":         { legacy: "False ceiling",           unit: "ceiling",   lane: "a", repeatable: false },
    "wardrobes-carpentry":   { legacy: "Wardrobes and carpentry", unit: "wardrobes", lane: "a", repeatable: false },
    "electrical":            { legacy: "Electrical",              unit: "electrical",lane: "a", repeatable: false },
    "doors-windows":         { legacy: "Doors and windows",       unit: "doors",     lane: "a", repeatable: false },
    "other-renovation-work": { legacy: "Something else",          unit: "other work",lane: "a", repeatable: false },
    "seepage-damp":          { legacy: "Seepage and damp",        unit: "seepage",   lane: "b", repeatable: false },
    "home-repairs":          { legacy: "Home repairs",            unit: "repairs",   lane: "b", repeatable: false }
  };

  var MODES = {
    "full-home": {
      title: "Full home renovation",
      lines: ["Design and planning across the home",
              "Civil, electrical, plumbing and finishes"],
      legacy: "Full home renovation"
    },
    "new-flat-fitout": {
      title: "New flat fit-out",
      lines: ["Plan the home before you move in",
              "Interiors, services and finishing together"],
      legacy: "New flat fit-out"
    }
  };

  var LEGACY_TO_KEY = {};
  Object.keys(SERVICES).forEach(function (k) { LEGACY_TO_KEY[SERVICES[k].legacy] = k; });

  var QTY = ["1", "2", "all"];
  var STORE = "bhProject";
  var MIRROR = "bhServices";
  var EVT = "bh:projectchange";

  /* ================= state ================================================ */
  var state = { projectMode: null, selections: {} };

  /* UI-only. Never persisted, never in bhProject. */
  var openQuantityKey = null;
  var pendingMode = null;
  var lastTrigger = null;

  function normalise(s) {
    var out = { projectMode: null, selections: {} };
    if (!s || typeof s !== "object") return out;
    if (s.projectMode && MODES[s.projectMode]) out.projectMode = s.projectMode;
    var sel = s.selections || {};
    Object.keys(sel).forEach(function (k) {
      if (!SERVICES[k]) return;
      if (SERVICES[k].repeatable) {
        var q = String(sel[k] && sel[k].quantity);
        out.selections[k] = { quantity: QTY.indexOf(q) > -1 ? q : "1" };
      } else {
        out.selections[k] = { selected: true };
      }
    });
    if (out.projectMode) out.selections = {};
    return out;
  }

  function hydrate() {
    try { state = normalise(JSON.parse(sessionStorage.getItem(STORE))); }
    catch (e) { state = { projectMode: null, selections: {} }; }
  }

  function mirrorNames() {
    if (state.projectMode) return [MODES[state.projectMode].legacy];
    return Object.keys(state.selections).map(function (k) { return SERVICES[k].legacy; });
  }

  function persist() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(state));
      sessionStorage.setItem(MIRROR, JSON.stringify(mirrorNames()));
    } catch (e) {}
  }

  function emit() {
    document.dispatchEvent(new CustomEvent(EVT, {
      detail: JSON.parse(JSON.stringify(state))
    }));
  }

  function get() { return JSON.parse(JSON.stringify(state)); }

  /* ================= the only mutator =====================================
     While projectMode is active, individual selection actions are REJECTED.
     Only an explicit clearMode (the "choose individual areas instead"
     affordance) or a setMode may change that. Nothing clears mode silently. */
  function update(action) {
    if (!action || !action.type) return get();
    var k = action.key;
    var svc = k ? SERVICES[k] : null;
    var changed = false;

    switch (action.type) {
      case "toggle":
        if (state.projectMode) break;
        if (!svc || svc.repeatable) break;
        if (state.selections[k]) delete state.selections[k];
        else state.selections[k] = { selected: true };
        changed = true;
        break;

      case "select":
        if (state.projectMode) break;
        if (!svc) break;
        if (!state.selections[k]) {
          state.selections[k] = svc.repeatable ? { quantity: "1" } : { selected: true };
          changed = true;
        }
        break;

      case "setQuantity":
        if (state.projectMode) break;
        if (!svc || !svc.repeatable) break;
        if (QTY.indexOf(String(action.quantity)) === -1) break;
        state.selections[k] = { quantity: String(action.quantity) };
        changed = true;
        break;

      case "remove":
        if (!k || !state.selections[k]) break;
        delete state.selections[k];
        if (openQuantityKey === k) openQuantityKey = null;
        changed = true;
        break;

      case "setMode":
        if (!MODES[action.mode]) break;
        state.projectMode = action.mode;
        state.selections = {};
        openQuantityKey = null;
        changed = true;
        break;

      case "clearMode":
        if (!state.projectMode) break;
        state.projectMode = null;
        changed = true;
        break;
    }

    if (!changed) return get();
    state = normalise(state);
    persist();
    emit();            /* readers render from the event, not from here */
    return get();
  }

  window.BuilrodeProject = { get: get, update: update };

  /* ================= helpers ============================================== */
  function bindPseudoButton(el, handler) {
    el.addEventListener("click", function (e) { e.preventDefault(); handler(e); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(e); }
    });
  }

  var wideMQ = window.matchMedia("(min-width: 390px)");
  function wide() { return wideMQ.matches; }

  function pillLabel(key) {
    var svc = SERVICES[key];
    var sel = state.selections[key];
    if (!sel) return "Add";
    if (!svc.repeatable) return "\u2713 Added";
    var q = sel.quantity;
    if (!wide()) return q === "all" ? "\u2713 All" : "\u2713 " + q;
    if (q === "all") return "\u2713 All " + svc.unit + "s";
    if (q === "1") return "\u2713 1 " + svc.unit;
    return "\u2713 " + q + " " + svc.unit + "s";
  }

  function setLabel(el, text) {
    var span = el.querySelector("span");
    if (span) span.textContent = text; else el.textContent = text;
  }

  /* ================= scoped styling ======================================= */
  function injectStyle() {
    if (document.getElementById("bhDockbStyle")) return;
    var s = document.createElement("style");
    s.id = "bhDockbStyle";
    s.textContent =
      ".bh-sv .bh-add.bh-add-on{background:#111;border-color:#111;color:#fff}" +
      ".bh-rm .bh-add,.bh-os .bh-add{display:inline-flex;align-items:center;font-size:13px;" +
      "border-radius:6px;padding:6px 13px;margin-top:0;border:1px solid #D4D4D4;background:#fff;color:#111}" +
      ".bh-rm .bh-add.bh-add-on,.bh-os .bh-add.bh-add-on{background:#111;border-color:#111;color:#fff}" +
      ".bh-sv-row{min-height:44px;display:flex;align-items:center;cursor:pointer}" +
      ".bh-sv-list .bh-add{display:none}" +
      ".bh-sv-list .bh-add.bh-add-on{display:inline-flex;align-items:center;margin-left:auto;font-size:12px;line-height:1;border-radius:6px;padding:5px 10px}" +
      ".bh-os-l .bh-sv-card{min-height:44px;cursor:pointer}" +
      ".bh-qp{grid-column:1 / -1;background:#F1F1F1;border:1px solid #E5E5E5;border-radius:12px;padding:12px;margin-top:7px}" +
      ".bh-qp-h{font-size:12px;color:#6B6B6B;margin-bottom:8px}" +
      ".bh-qp-r{display:flex;gap:6px}" +
      ".bh-qp-b{flex:1;height:44px;font-size:13px;border-radius:6px;background:#fff;" +
      "border:1px solid #E0E0E0;color:#111;cursor:pointer;font-family:inherit}" +
      ".bh-qp-b.on{background:#000;border-color:#000;color:#fff}" +
      ".bh-qp-x{width:100%;height:44px;margin-top:6px;border:0;border-top:1px solid #E5E5E5;" +
      "background:transparent;font-size:12px;color:#6B6B6B;cursor:pointer;font-family:inherit}" +
      ".bh-mx{display:none;width:100%;height:44px;margin-top:12px;border:1px solid #E0E0E0;" +
      "background:#fff;border-radius:6px;font-size:13px;color:#111;cursor:pointer;font-family:inherit}" +
      ".bh-mode-on .bh-mx{display:block}" +
      ".bh-mode-on .bh-rm,.bh-mode-on .bh-os,.bh-mode-on .bh-sv-list{display:none}" +
      ".bh-mode-on .bh-gl{display:none}" +
      ".bh-mode-on .bh-wh .bh-gl{display:block}" +
      ".brb-bar{display:none}" +
      "body.bh-locked{overflow:hidden}";
    document.head.appendChild(s);
  }

  /* ================= legacy suppression — DOM-keyed, never path-keyed ===== */
  function suppressLegacy() {
    var bar = document.querySelector(".brb-bar");
    if (bar) bar.style.setProperty("display", "none", "important");
    var old = document.getElementById("bhBar");
    if (old) old.style.setProperty("display", "none", "important");
  }

  /* ================= contact discovery — learn, never hardcode ============ */
  var contact = { tel: null, wa: null };

  function discoverContact() {
    var scope = document.querySelector(".brb-bar");
    var t = (scope && scope.querySelector('a[href^="tel:"]')) ||
            document.querySelector('a[href^="tel:"]');
    var w = (scope && scope.querySelector('a[href*="wa.me"]')) ||
            document.querySelector('a[href*="wa.me"]');
    contact.tel = t ? t.getAttribute("href") : null;
    contact.wa = w ? w.getAttribute("href") : null;
  }

  function applyContact() {
    var call = document.getElementById("bhDockCall");
    var wa = document.getElementById("bhDockWa");
    [[call, contact.tel], [wa, contact.wa]].forEach(function (pair) {
      var el = pair[0], href = pair[1];
      if (!el) return;
      if (href) { el.setAttribute("href", href); el.removeAttribute("aria-disabled"); }
      else { el.removeAttribute("href"); el.setAttribute("aria-disabled", "true"); }
    });
  }

  function waWithText(text) {
    if (!contact.wa) return null;
    return contact.wa.split("?")[0] + "?text=" + encodeURIComponent(text);
  }

  /* ================= body padding ownership =============================== */
  function syncBodyPadding() {
    var h = dock.offsetHeight || 0;
    document.body.style.paddingBottom = Math.max(0, h - 30) + "px";
  }

  /* ================= controls ============================================= */
  function controls() {
    return [].slice.call(document.querySelectorAll(".bh-sv .bh-add[data-sv]"));
  }
  function keyOf(el) { return LEGACY_TO_KEY[el.getAttribute("data-sv")] || null; }
  function controlFor(key) {
    return controls().filter(function (el) { return keyOf(el) === key; })[0] || null;
  }

  function activate(key) {
    var svc = SERVICES[key];
    if (!svc) return;
    if (state.projectMode) return;          /* mode active: reject silently */
    if (svc.repeatable) {
      if (!state.selections[key]) {
        openQuantityKey = key;
        update({ type: "select", key: key });
      } else {
        openQuantityKey = (openQuantityKey === key) ? null : key;
        render();                            /* UI-only, no mutation */
      }
    } else {
      update({ type: "toggle", key: key });
    }
  }

  function bindControls() {
    controls().forEach(function (el) {
      var key = keyOf(el);
      if (!key) return;
      el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      bindPseudoButton(el, function (e) { e.stopPropagation(); activate(key); });
    });

    /* 44px proxies: whole chip row, whole Balcony row */
    [].slice.call(document.querySelectorAll(".bh-sv-list .bh-sv-row")).forEach(function (row) {
      var pill = row.querySelector(".bh-add[data-sv]");
      if (!pill) return;
      var key = keyOf(pill);
      if (!key) return;
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      bindPseudoButton(row, function () { activate(key); });
    });

    [].slice.call(document.querySelectorAll(".bh-os-l .bh-sv-card")).forEach(function (card) {
      var pill = card.querySelector(".bh-add[data-sv]");
      if (!pill) return;
      var key = keyOf(pill);
      if (!key) return;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      bindPseudoButton(card, function () { activate(key); });
    });
  }

  /* ================= quantity accordion =================================== */
  function clearPanels() {
    [].slice.call(document.querySelectorAll(".bh-qp")).forEach(function (p) {
      p.parentNode.removeChild(p);
    });
  }

  function buildPanel(key) {
    var svc = SERVICES[key];
    var sel = state.selections[key];
    var panel = document.createElement("div");
    panel.className = "bh-qp";
    panel.setAttribute("data-qp", key);

    var h = document.createElement("div");
    h.className = "bh-qp-h";
    h.textContent = "How many " + svc.unit + "s?";
    panel.appendChild(h);

    var row = document.createElement("div");
    row.className = "bh-qp-r";
    QTY.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bh-qp-b" + (sel && sel.quantity === q ? " on" : "");
      b.setAttribute("aria-pressed", sel && sel.quantity === q ? "true" : "false");
      b.textContent = q === "all" ? "All" : q;
      b.addEventListener("click", function (e) {
        e.preventDefault();
        update({ type: "setQuantity", key: key, quantity: q });
      });
      row.appendChild(b);
    });
    panel.appendChild(row);

    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "bh-qp-x";
    rm.textContent = "Remove";
    rm.addEventListener("click", function (e) {
      e.preventDefault();
      update({ type: "remove", key: key });
    });
    panel.appendChild(rm);

    return panel;
  }

  /* room panels open under the tapped card's ROW, spanning the grid */
  function placePanel(key, panel) {
    var ctrl = controlFor(key);
    if (!ctrl) return;

    var grid = ctrl.closest(".bh-rm-g");
    if (grid) {
      var cards = [].slice.call(grid.children).filter(function (c) {
        return c.className.indexOf("bh-qp") === -1;
      });
      var card = ctrl.closest(".bh-rc");
      var idx = cards.indexOf(card);
      if (idx === -1) { grid.appendChild(panel); return; }
      var nextRowStart = (Math.floor(idx / 2) + 1) * 2;
      if (nextRowStart < cards.length) grid.insertBefore(panel, cards[nextRowStart]);
      else grid.appendChild(panel);
      return;
    }

    var host = ctrl.closest(".bh-sv-card") || ctrl.closest(".bh-sv-row") || ctrl.parentNode;
    host.parentNode.insertBefore(panel, host.nextSibling);
  }

  /* ================= mode-active affordance =============================== */
  function ensureModeExit() {
    var wh = document.querySelector(".bh-wh");
    if (!wh) return null;
    var btn = wh.querySelector(".bh-mx");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bh-mx";
    btn.textContent = "Choose individual areas instead";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      update({ type: "clearMode" });
    });
    wh.appendChild(btn);
    return btn;
  }

  function renderMode() {
    var sv = document.querySelector(".bh-sv");
    if (sv) sv.classList.toggle("bh-mode-on", !!state.projectMode);
    ensureModeExit();
    [].slice.call(document.querySelectorAll("[data-mode]")).forEach(function (row) {
      row.setAttribute("aria-pressed",
        state.projectMode === row.getAttribute("data-mode") ? "true" : "false");
    });
  }

  /* ================= render =============================================== */
  function render() {
    clearPanels();

    controls().forEach(function (el) {
      var key = keyOf(el);
      if (!key) return;
      var on = !!state.selections[key];
      el.classList.toggle("bh-add-on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
      setLabel(el, pillLabel(key));
      if (SERVICES[key].repeatable) {
        el.setAttribute("aria-expanded", openQuantityKey === key ? "true" : "false");
      }
    });

    if (openQuantityKey && state.selections[openQuantityKey]) {
      placePanel(openQuantityKey, buildPanel(openQuantityKey));
    } else {
      openQuantityKey = null;
    }

    renderMode();
    renderDock();
    syncBodyPadding();
  }

  /* ================= dock — deliberately dumb during step-2 QA ============ */
  function renderDock() {
    var t = document.getElementById("bhDockT");
    var go = document.getElementById("bhDockGo");
    var tray = document.querySelector(".bh-dk-tray");
    var names = mirrorNames();
    var n = names.length;

    if (t) {
      t.textContent = n ? n + " selected" : "";
      t.style.display = n ? "" : "none";
    }

    if (go) {
      go.classList.toggle("bh-dk-go-i", !n);
      if (n) {
        setLabel(go, "Continue \u2192");
        var url = waWithText("Hi Builrode, I would like a quote for: " + names.join(", "));
        if (url) { go.setAttribute("href", url); go.removeAttribute("aria-disabled"); }
        else { go.removeAttribute("href"); go.setAttribute("aria-disabled", "true"); }
      } else {
        setLabel(go, "Talk to an engineer \u2192");
        var idle = contact.wa || contact.tel;
        if (idle) { go.setAttribute("href", idle); go.removeAttribute("aria-disabled"); }
        else { go.removeAttribute("href"); go.setAttribute("aria-disabled", "true"); }
      }
    }

    if (tray) {
      tray.innerHTML = "";
      tray.style.display = n ? "" : "none";
      names.forEach(function (nm) {
        var c = document.createElement("div");
        c.className = "bh-dk-tc";
        c.textContent = nm;
        tray.appendChild(c);
      });
    }
  }

  /* ================= lanes ================================================ */
  function bindLanes() {
    var wrap = document.querySelector(".bh-sv .bh-ln");
    if (!wrap) return;
    var panes = [].slice.call(wrap.querySelectorAll(".bh-ln-b"));
    var groups = [].slice.call(document.querySelectorAll(".bh-sv [data-lane]"));
    wrap.setAttribute("role", "tablist");

    function show(lane, moveFocus) {
      panes.forEach(function (p, i) {
        var active = (i === 0 ? "a" : "b") === lane;
        p.classList.toggle("bh-ln-on", active);
        p.setAttribute("role", "tab");
        p.setAttribute("aria-selected", active ? "true" : "false");
        p.setAttribute("tabindex", active ? "0" : "-1");
        if (active && moveFocus) p.focus();
      });
      groups.forEach(function (g) {
        g.style.display = g.getAttribute("data-lane") === lane ? "" : "none";
      });
    }

    panes.forEach(function (p, i) {
      var lane = i === 0 ? "a" : "b";
      bindPseudoButton(p, function () { show(lane, false); });
      p.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          show(i === 0 ? "b" : "a", true);
        }
      });
    });

    show("a", false);
  }

  /* ================= project-mode sheet =================================== */
  function bindSheet() {
    var sheet = document.querySelector('[data-sheet="project-mode"]');
    if (!sheet) return;

    var panel = sheet.querySelector(".bh-pms-panel");
    var titleEl = sheet.querySelector("[data-sheet-title]");
    var l1 = sheet.querySelector('[data-sheet-scope="1"]');
    var l2 = sheet.querySelector('[data-sheet-scope="2"]');
    var warn = sheet.querySelector("[data-sheet-warning]");
    var plan = sheet.querySelector("[data-sheet-plan]");
    var yes = sheet.querySelector("[data-sheet-confirm]");
    var keep = sheet.querySelector("[data-sheet-keep]");

    function focusables() {
      return [].slice.call(panel.querySelectorAll('[role="button"],button,a[href]'))
        .filter(function (el) { return el.offsetParent !== null; });
    }

    function normalState() {
      if (warn) warn.hidden = true;
      if (plan) plan.style.display = "";
    }

    function open(mode, trigger) {
      var m = MODES[mode];
      if (!m) return;
      pendingMode = mode;
      lastTrigger = trigger || null;
      if (titleEl) titleEl.textContent = m.title;
      if (l1) l1.textContent = m.lines[0];
      if (l2) l2.textContent = m.lines[1];
      normalState();
      sheet.removeAttribute("aria-hidden");
      sheet.classList.add("bh-pms-open");
      document.body.classList.add("bh-locked");
      var f = focusables();
      if (f.length) f[0].focus();
    }

    function close() {
      sheet.classList.remove("bh-pms-open");
      sheet.setAttribute("aria-hidden", "true");
      document.body.classList.remove("bh-locked");
      normalState();
      pendingMode = null;
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
      lastTrigger = null;
    }

    [].slice.call(sheet.querySelectorAll("[data-sheet-dismiss]")).forEach(function (el) {
      if (el.className.indexOf("bh-pms-scrim") > -1) el.addEventListener("click", close);
      else bindPseudoButton(el, close);
    });

    if (plan) bindPseudoButton(plan, function () {
      if (!Object.keys(state.selections).length) {
        update({ type: "setMode", mode: pendingMode });
        close();
        return;
      }
      plan.style.display = "none";
      if (warn) {
        warn.hidden = false;
        var f = warn.querySelector('button,[role="button"]');
        if (f) f.focus();
      }
    });

    if (yes) bindPseudoButton(yes, function () {
      update({ type: "setMode", mode: pendingMode });
      close();
    });

    if (keep) bindPseudoButton(keep, function () {
      normalState();
      if (plan && plan.focus) plan.focus();
    });

    sheet.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    [].slice.call(document.querySelectorAll("[data-mode]")).forEach(function (row) {
      row.setAttribute("role", "button");
      if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "0");
      bindPseudoButton(row, function () { open(row.getAttribute("data-mode"), row); });
    });
  }

  /* ================= hero fallback — WhatsApp, never mutates state ======== */
  function bindHero() {
    var q = document.getElementById("bhQ");
    var go = document.getElementById("bhGo");

    function send() {
      var text = q && q.value ? q.value.trim() : "";
      if (!text) { if (q) q.focus(); return; }
      var url = waWithText("Hi Builrode, I need help with: " + text);
      if (!url) { if (q) q.focus(); return; }
      window.open(url, "_blank");
    }

    if (go) bindPseudoButton(go, send);
    if (q) q.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); send(); }
    });
  }

  /* ================= boot ================================================= */
  function boot() {
    dock = document.getElementById("bhDock");
    if (!dock) return;                 /* inert on every other page */
    injectStyle();
    suppressLegacy();
    discoverContact();
    applyContact();
    hydrate();
    bindControls();
    bindLanes();
    bindSheet();
    bindHero();

    document.addEventListener(EVT, render);   /* one writer, many readers */
    render();

    if (wideMQ.addEventListener) wideMQ.addEventListener("change", render);
    else if (wideMQ.addListener) wideMQ.addListener(render);

    var t = null;
    window.addEventListener("resize", function () {
      if (t) clearTimeout(t);
      t = setTimeout(syncBodyPadding, 150);
    });
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
