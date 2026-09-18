/*! builrode-project.js v2.3.0
 *  Single controller for the Builrode project state.
 *  Replaces the fifteen legacy Home v2 page scripts.
 *
 *  2.1.1 — native Webflow capture (Stage A), reviewed draft
 *    The Review form is a real Webflow form with a real submit button. This script
 *    validates in the capture phase, fills the hidden fields, and lets Webflow's own
 *    handler post the submission. "Project received" is shown only when Webflow
 *    reports success (its done block becomes visible). No fetch, no webhook, no
 *    reference on screen. Downstream sync (Make → Zite) reads Webflow's stored
 *    submissions; it is not on the homeowner's path.
 *    An unresolved native request stays locked: a watchdog cannot cancel it.
 *    Only the native success block confirms capture; hiding the form does not.
 *  2.1.2 — keyboard and outcome accessibility (Stage A)
 *    Review controls built as role="button" elements respond to Enter (on keydown)
 *    and Space (on keyup) exactly once per press; auto-repeat is ignored. The Start
 *    over confirmation ignores a second activation within 400 ms of arming. Errors
 *    and waiting messages are announced through an assertive live region (role=alert);
 *    focus moves to the receipt on success and back to Send after a failure.
 *    Pairs with the page-head rule that hides Webflow's own success and failure
 *    blocks visually without changing their display (RV-CHECKOUT v2.1.0).
 *  2.1.3 — review corrections
 *    Cancels obsolete announcements when state changes. Recovers focus from native
 *    outcome blocks while preserving visible controls, including fixed-position links.
 *
 *  Principles
 *    - One persistent state object: project INTENT only. Every write goes through
 *      the operations in `ops`, which keep derived provenance (acceptedSuggestions)
 *      consistent on every path.
 *    - One ephemeral layer: the Review form draft (locality, start timing, WhatsApp).
 *      Never persisted. Reset by review.resetForm() on Start over.
 *    - Every render is a pure function of state. One boot on DOM ready.
 *      No automatic network retries and no monkey-patching of Webflow.
 *    - Inert on any page that has none of its anchors. Injects no CSS
 *      (styling lives in the page head block — see builrode-project.css).
 *
 *  Client-side validation is UX only. Webflow stores the submission; the honeypot
 *  field (name="website") is submitted with it and filtered downstream. Client-side
 *  the honeypot blocks the submit outright.
 *
 *  Anchors
 *    [data-k]    catalogue cards and rows (outside #bhReview)
 *    #bhQ        hero input          #bhGo   hero arrow
 *    #bhMore     drawer toggle       #bhDrawer / #bhChev
 *    #bhBar      dock                (markup inside it is owned by this script)
 *    #bhReview   review page root    (data-r="…" attributes mark its parts)
 *
 *  Page-level configuration (optional attributes)
 *    <body data-review="/review">                  destination of the hero arrow and the dock CTA
 *    <div id="bhReview">                            review page root; the form inside it is a
 *                                                  native Webflow form with hidden fields (see fill)
 *
 *  Taxonomy
 *    SERVICES (derived from the parser table) is the single allowed-key list, used by the
 *    operations, by storage validation and by serialization. Designer data-k values must match it.
 *
 *  Storage schema
 *    SCHEMA 1 — today's taxonomy. Bump to 2 at Release 2 (Carpentry & wardrobes merge);
 *    v1 projects then expire safely on load instead of carrying stale service names.
 *
 *  ── 2.2.0 — 12 Sep 2026 — Project Dock v1.2 ──────────────────────────────
 *  Dock rebuilt to the frozen v1.2 specification. Six states resolved in a
 *  fixed order with Full renovation tested first. No arrows or chevrons.
 *  State 0 is a single whole-bar anchor; selected states expose exactly two
 *  controls (label, Review project). Count moves into a cream chip; the
 *  primary label carries the underline and is the only editable affordance.
 *  Button accessible names are static — the persistent status region is the
 *  only thing that announces counts.
 *  #bhBar gains two permanent children created once at init: .bhd-view,
 *  the only node whose innerHTML is ever written, and .bhd-sr, a status
 *  region that is never detached.
 *  WhatsApp: state 0 CLONES .brb-bar .brb-wa svg at runtime and both
 *  entries carry the .bhm-walink href byte-for-byte, unmodified. The
 *  inline GLYPH below is the missing-source fallback and the row's own
 *  drawing. Adds the in-flow .bhm-warow row inside #bhMain, a 75/75ms
 *  opacity crossfade on the project label only (never across state 0), a
 *  measured reserve variable and keyboard suppression.
 *  Mobile-only by CSS; this file renders identically at every width and the
 *  injectors hide #bhBar at >=768px.
 *  Rollback: re-pin 2.1.3 @ 88d94eb5 and remove the v31dockcss* injectors.
 *
 *  2.3.0 — Review inline description, gated by #rv-desc inside #bhReview.
 *  Without that textarea, the legacy editor path remains active. The 2.2.0
 *  dock renderer/effects and schema-1 storage contract are preserved.
 *  Inline descriptions retain their raw string through the existing heroText
 *  payload field. Native Webflow capture still owns submission and receipts.
 *  Deploy the controller first, then the matching Review page changes.
 *  Restoring an older controller requires restoring its compatible page first.
 */
(function (win, doc) {
  'use strict';
  if (win.BuilrodeProject) return;

  var VERSION = '2.3.0';
  var SCHEMA = 1;
  var KEY = 'bh_project';
  var TTL_MS = 14 * 24 * 60 * 60 * 1000;
  var FULL = 'Full renovation';
  var DEFAULT_REVIEW = '/review';
  var DEFAULT_TEL = 'tel:+918383056889';
  var DEFAULT_WA = 'https://wa.me/918383056889';
  var FIELDS = 'input, textarea, [contenteditable]';
  var CAPTURE_WATCHDOG_MS = 20000;
  var ATTR_KEY = 'bh_attr';
  var LONG_TEXT = 140;
  var CONFIRM_GUARD_MS = 400;

  /* ------------------------------------------------------------------ */
  /* Parser — keyword table and logic lifted from builrodehomev2part4.   */
  /* Suggests services from free text. Never selects anything itself.    */
  /* ------------------------------------------------------------------ */
  var WORDS = [
    ['Waterproofing', 'seepage damp seelan leak tapak paani moisture'],
    ['Bathroom', 'bathroom washroom toilet shower geyser tile'],
    ['Kitchen', 'kitchen rasoi modular chimney cabinet'],
    ['Painting', 'paint putty safedi repaint whitewash'],
    ['Wardrobes', 'wardrobe almirah almari cupboard closet'],
    ['Flooring', 'floor marble granite vitrified laminate'],
    ['False ceiling', 'ceiling pop gypsum'],
    ['Doors and windows', 'door window upvc grill'],
    ['Electrical', 'socket switch wiring mcb electric bijli'],
    ['Carpentry', 'carpenter carpentry shelf'],
    ['Home repairs', 'crack darar plumbing plumber tap nal drain pipe'],
    [FULL, 'full renovation poora ghar entire flat']
  ];
  var BROKEN = ['not working', 'broken', 'fault', 'choke', 'burst', 'damage', 'kharab'];
  var SERVICES = WORDS.map(function (e) { return e[0]; }); // the allowed-key list, FULL included
  function known(k) { return has(SERVICES, k); }
  function unique(arr) { return arr.every(function (v, i) { return arr.indexOf(v) === i; }); }

  function parse(text) {
    var v = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var found = {};
    var broken = BROKEN.some(function (w) { return v.indexOf(w) > -1; });
    WORDS.forEach(function (entry) {
      entry[1].split(' ').forEach(function (k) {
        if (k && v.indexOf(k) > -1) found[entry[0]] = 1;
      });
    });
    if (broken && found.Electrical) { delete found.Electrical; found['Home repairs'] = 1; }
    return Object.keys(found);
  }

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                      */
  /* ------------------------------------------------------------------ */
  function now() { return Date.now(); }
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || doc).querySelectorAll(sel)); }
  function has(arr, v) { return arr.indexOf(v) > -1; }
  function without(arr, v) { return arr.filter(function (x) { return x !== v; }); }
  function union(arr, v) { return has(arr, v) ? arr : arr.concat(v); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uuid() {
    if (win.crypto && typeof win.crypto.randomUUID === 'function') return win.crypto.randomUUID();
    var t = now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (t + Math.random() * 16) % 16 | 0; t = Math.floor(t / 16);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function reviewUrl() {
    return (doc.body && doc.body.getAttribute('data-review')) || DEFAULT_REVIEW;
  }

  /* ------------------------------------------------------------------ */
  /* Persistent state — project intent only                              */
  /* ------------------------------------------------------------------ */
  function fresh() {
    return {
      version: SCHEMA,
      leadId: null,            // assigned on the first meaningful write, kept until reset
      startedAt: null,         // same moment as leadId
      sourcePage: null,        // pathname where the project was first created
      heroText: '',
      fullRenovation: false,
      services: [],            // data-k names, in tap order
      acceptedSuggestions: [], // services (or FULL) added via the Review suggestion control
      updatedAt: 0
    };
  }

  function valid(s) {
    return !!s &&
      s.version === SCHEMA &&
      typeof s.leadId === 'string' &&
      typeof s.startedAt === 'number' &&
      typeof s.sourcePage === 'string' &&
      typeof s.heroText === 'string' &&
      typeof s.fullRenovation === 'boolean' &&
      Array.isArray(s.services) && unique(s.services) &&
      s.services.every(function (k) { return known(k) && k !== FULL; }) &&
      Array.isArray(s.acceptedSuggestions) && unique(s.acceptedSuggestions) &&
      s.acceptedSuggestions.every(function (k) {
        return k === FULL ? s.fullRenovation === true : has(s.services, k); // provenance must point at something active
      }) &&
      typeof s.updatedAt === 'number' &&
      now() - s.updatedAt < TTL_MS;
  }

  var store = {
    memoryOnly: false, // storage UNAVAILABLE (private mode, quota) — distinct from corrupt data
    load: function () {
      var raw;
      try { raw = win.localStorage.getItem(KEY); }
      catch (e) { this.memoryOnly = true; return null; }
      if (!raw) return null;
      var s = null;
      try { s = JSON.parse(raw); } catch (e) { s = null; } // corrupt → discard below
      if (!valid(s)) { this.clear(); return null; }
      return s;
    },
    save: function (s) {
      if (this.memoryOnly) return;
      try { win.localStorage.setItem(KEY, JSON.stringify(s)); }
      catch (e) { this.memoryOnly = true; }
    },
    clear: function () {
      try { win.localStorage.removeItem(KEY); } catch (e) { /* unavailable; nothing to clear */ }
    }
  };

  var S = fresh();
  var restored = false;   // state came from storage this page load
  var interacted = false; // the homeowner has touched the project this page load
  var renderers = [];

  function derive(s) {
    s = s || S;
    var text = (s.heroText || '').trim();
    var picks = s.fullRenovation || s.services.length > 0;
    var suggestions = text ? parse(text).filter(function (k) {
      return k === FULL ? !s.fullRenovation : !has(s.services, k);
    }) : [];
    return {
      projectMode: s.fullRenovation ? 'full' : 'services',
      entrySource: text && picks ? 'mixed' : text ? 'hero' : 'catalogue',
      focusAreas: s.fullRenovation ? s.services.slice() : [],
      count: s.services.length,
      hasText: !!text,
      isEmpty: !text && !picks,
      suggestions: suggestions,
      showReturnCue: restored && !interacted && (!!text || picks)
    };
  }

  function emit() {
    var d = derive(S);
    renderers.forEach(function (fn) { fn(d); });
  }

  function get() { return JSON.parse(JSON.stringify(S)); }

  // Low-level write. Not exported — all writes go through ops.
  function set(patch) {
    Object.keys(patch).forEach(function (k) {
      if (k in S && k !== 'version' && k !== 'leadId' && k !== 'startedAt' && k !== 'sourcePage') S[k] = patch[k];
    });
    if (!S.leadId) { S.leadId = uuid(); S.startedAt = now(); S.sourcePage = win.location.pathname; }
    S.updatedAt = now();
    interacted = true;
    store.save(S);
    emit();
  }

  function clear() {
    S = fresh();
    restored = false;
    interacted = false;
    store.clear();
    emit();
  }

  function subscribe(fn) {
    renderers.push(fn);
    return function () { renderers = without(renderers, fn); };
  }

  /* Operations — the only way state changes. Each keeps acceptedSuggestions
     consistent: a removal on ANY path drops that key's provenance. */
  var ops = {
    addService: function (k, viaSuggestion) {
      if (!known(k)) { if (win.console) win.console.warn('BuilrodeProject: unknown service', k); return; }
      if (k === FULL) return ops.setFull(true, viaSuggestion);
      var patch = { services: union(S.services, k) };
      if (viaSuggestion) patch.acceptedSuggestions = union(S.acceptedSuggestions, k);
      set(patch);
    },
    removeService: function (k) {
      if (k === FULL) return ops.setFull(false);
      set({ services: without(S.services, k), acceptedSuggestions: without(S.acceptedSuggestions, k) });
    },
    toggleService: function (k) {
      if (k === FULL) return ops.setFull(!S.fullRenovation);
      if (has(S.services, k)) ops.removeService(k); else ops.addService(k, false);
    },
    setFull: function (on, viaSuggestion) {
      var patch = { fullRenovation: !!on };
      patch.acceptedSuggestions = on
        ? (viaSuggestion ? union(S.acceptedSuggestions, FULL) : S.acceptedSuggestions)
        : without(S.acceptedSuggestions, FULL);
      set(patch);
    },
    acceptSuggestion: function (k) { ops.addService(k, true); },
    setHeroText: function (t) {
      var value = String(t || '');
      // Retain legacy trimming on Home and on Review without the inline field.
      set({ heroText: review && review.inline ? value : value.trim() });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Catalogue — cards, rows, Full renovation, drawer                     */
  /* ------------------------------------------------------------------ */
  var catalogue = {
    els: [],
    init: function () {
      var review = $('#bhReview');
      this.els = $$('[data-k]').filter(function (el) { return !(review && review.contains(el)); });
      if (!this.els.length) return false;

      this.els.forEach(function (el) {
        var k = el.hasAttribute('data-x') ? FULL : el.getAttribute('data-k');
        function toggle() { ops.toggleService(k); }
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      });

      this.initDrawer();
      return true;
    },
    initDrawer: function () {
      var more = $('#bhMore'), drawer = $('#bhDrawer');
      if (!more || !drawer) return;
      function setOpen(open) {
        drawer.style.display = open ? 'block' : 'none';
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      setOpen(more.getAttribute('aria-expanded') === 'true');
      more.addEventListener('click', function () {
        setOpen(more.getAttribute('aria-expanded') !== 'true');
      });
      more.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); more.click(); }
      });
    },
    render: function (d) {
      this.els.forEach(function (el) {
        var isFull = el.hasAttribute('data-x') || el.getAttribute('data-k') === FULL;
        var on = isFull ? S.fullRenovation : has(S.services, el.getAttribute('data-k'));
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      var main = $('#bhMain');
      if (main) main.setAttribute('data-mode', d.projectMode);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Hero — store the text, go to Review. No chips, no parsing here.     */
  /* ------------------------------------------------------------------ */
  var hero = {
    init: function () {
      var q = $('#bhQ');
      if (!q) return false;
      var go = $('#bhGo'), form = q.form, wrap = $('.bh-field');
      var fired = false;

      q.setAttribute('placeholder', '');
      if (S.heroText) q.value = S.heroText; // 2.0.1: restore persisted text into the field (also pauses the example typewriter via its busy() check)

      function submit(e) {
        if (e) e.preventDefault();
        if (fired) return; // one user action can arrive by more than one route
        var t = q.value.trim();
        if (!t) { q.focus(); return; }
        fired = true;
        ops.setHeroText(t);
        win.location.href = reviewUrl();
      }

      var goIsNativeSubmit = !!go && (
        (go.tagName === 'BUTTON' && (go.getAttribute('type') || 'submit').toLowerCase() === 'submit') ||
        (go.tagName === 'INPUT' && go.type === 'submit'));

      if (form) {
        form.addEventListener('submit', submit);            // Enter and native submit buttons land here
        if (go && !goIsNativeSubmit) go.addEventListener('click', submit);
      } else {
        if (go) go.addEventListener('click', submit);
        q.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(e); });
      }
      if (wrap) wrap.addEventListener('click', function (e) {
        if (e.target !== q && !(go && go.contains(e.target))) q.focus();
      });
      return true;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Dock — owns the markup inside #bhBar. Six states, resolved in a fixed  */
  /* order so Full renovation can never fall through to a service count:    */
  /*   0   empty          WhatsApp glyph + whole-bar link                   */
  /*   1   hero text only Your project            (plain text, no control)  */
  /*   2   one service    1 service selected      + Review project          */
  /*   3   N services     N services selected     + Review project          */
  /*   4   full, 0 areas  Full renovation         + Review project          */
  /*   4a  full, N areas  Full renovation + chip  + Review project          */
  /*                                                                        */
  /* #bhBar gets exactly two permanent children, built once in init():      */
  /*   .bhd-view   the only node this script ever writes innerHTML to       */
  /*   .bhd-sr     the status region, created once and never detached       */
  /* #bhBar.innerHTML is cleared once at init and never assigned again, so  */
  /* the live region keeps its DOM identity across every state change.      */
  /* The page head carries #bhBar>:not(.bhd){display:none!important}; the   */
  /* injected CSS re-shows these two children at higher specificity.        */
  /* It also owns .bhm-warow, the in-flow WhatsApp row inside #bhMain.      */
  /* ------------------------------------------------------------------ */
  var dock = {
    /* Fallback drawing only. State 0 clones the live site glyph; this is   */
    /* used when that source is absent, and by the in-flow row.             */
    GLYPH: '<svg class="bhd-g" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24Zm-2.5 4.1c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.68 2.57 4.07 3.6.57.25 1.01.39 1.36.5.57.19 1.09.16 1.5.1.46-.07 1.41-.58 1.61-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28-.24-.12-1.41-.7-1.63-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.45Z"/></svg>',

    /* Clone the live site glyph for state 0. CSS supplies 20px and the     */
    /* #25D366 colour through currentColor.                                 */
    cloneGlyph: function () {
      var s = $('.brb-bar .brb-wa svg');
      if (!s || !s.cloneNode) return this.GLYPH;
      var c = s.cloneNode(true);
      c.setAttribute('class', 'bhd-g');
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('focusable', 'false');
      return c.outerHTML || this.GLYPH;
    },

    /* The approved source href is used EXACTLY as authored — never split,  */
    /* decoded, re-encoded or rebuilt. Fallback only when it is absent.     */
    waHref: function () {
      var a = $('.bhm-walink[href*="wa.me"]');
      if (a) return a.getAttribute('href');
      var b = $('a[href*="wa.me"]');
      return (b && b.getAttribute('href')) || DEFAULT_WA;
    },

    /* Contract: dockHref === sourceHref && rowHref === sourceHref.         */
    assertWa: function () {
      var a = $('.bhm-walink[href*="wa.me"]');
      if (!a) return true;                              // fallback path, nothing to compare
      var source = a.getAttribute('href');
      var dockA = this.viewNode && this.viewNode.querySelector('.bhd-empty');
      var rowA = doc.querySelector('.bhm-warow');
      var dockHref = dockA ? dockA.getAttribute('href') : this.wa;
      var rowHref = rowA ? rowA.getAttribute('href') : this.wa;
      var pass = dockHref === source && rowHref === source;
      if (!pass && win.console && win.console.warn) {
        win.console.warn('[builrode] WhatsApp href contract violated', { source: source, dock: dockHref, row: rowHref });
      }
      return pass;
    },

    init: function () {
      this.bar = $('#bhBar');
      if (!this.bar) return false;
      var tel = $('a[href^="tel:"]');
      this.tel = tel ? tel.getAttribute('href') : DEFAULT_TEL;
      this.wa = this.waHref();
      this.glyph = this.cloneGlyph();
      if (!this.bar.getAttribute('role')) this.bar.setAttribute('role', 'region');
      if (!this.bar.getAttribute('aria-label')) this.bar.setAttribute('aria-label', 'Your project');

      // The only time #bhBar.innerHTML is ever written.
      this.bar.innerHTML = '';
      var v = doc.createElement('div');
      v.className = 'bhd-view';
      var s = doc.createElement('span');
      s.className = 'bhd-sr';
      s.setAttribute('role', 'status');
      s.setAttribute('aria-live', 'polite');
      s.setAttribute('aria-atomic', 'true');
      this.bar.appendChild(v);
      this.bar.appendChild(s);
      this.viewNode = v;
      this.srNode = s;

      this.swap = null;        // pending crossfade timer
      this.faded = false;      // project label currently at opacity 0
      this.booted = false;     // initial-render guard, separate from content key
      this.lastKey = null;
      this.lastState = null;
      this.bind();
      this.warow();
      return true;
    },

    /* ---- in-flow WhatsApp row, scoped to the Home catalogue ----------- */
    /* Resolved inside #bhMain only. #bhMore and #bhDrawer are siblings, so */
    /* an after-#bhMore insert would land between the drawer trigger and    */
    /* its content; an after-#bhDrawer insert would break the existing      */
    /* #bhDrawer + .bh-strip adjacency. Before .bh-mf satisfies both.       */
    /* No fallback anchor: if either lookup fails, nothing is inserted.     */
    warow: function () {
      var main = $('#bhMain');
      if (!main) return;
      if (main.querySelector('.bhm-warow')) return;     // idempotency, scoped
      var mf = main.querySelector('.bh-mf');
      if (!mf || !mf.parentNode) return;
      var a = doc.createElement('a');
      a.className = 'bhm-warow';
      a.setAttribute('href', this.wa);                  // identical string, no rewrite
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.innerHTML = '<span class="bhm-wac">' + this.GLYPH + '</span>' +
        '<span class="bhm-wat">' +
        '<span class="bhm-wat1">Talk to an engineer on WhatsApp</span>' +
        '<span class="bhm-wat2">Need help choosing? Ask before you decide.</span>' +
        '</span>';
      mf.parentNode.insertBefore(a, mf);
    },

    /* ---- state ------------------------------------------------------- */
    state: function (d) {
      if (d.projectMode === 'full') return d.count > 0 ? '4a' : '4';
      if (d.count >= 2) return '3';
      if (d.count === 1) return '2';
      if (!d.isEmpty) return '1';
      return '0';
    },

    parts: function (st, d) {
      if (st === '4a') return { primary: FULL, chip: d.count + (d.count === 1 ? ' area' : ' areas') };
      if (st === '4') return { primary: FULL, chip: '' };
      if (st === '3') return { primary: d.count + ' services selected', chip: '' };
      if (st === '2') return { primary: '1 service selected', chip: '' };
      return { primary: 'Your project', chip: '' };
    },

    /* Static by design. Counts are announced by the status region only —   */
    /* a changing button name would double-announce.                        */
    aria: function (st) {
      return (st === '4' || st === '4a') ? 'Show Full renovation' : 'Show selected services';
    },

    target: function (st) {
      return (st === '4' || st === '4a') ? $('.bh-cardwide') : $('#bhGrid');
    },

    bind: function () {
      var self = this;
      this.bar.addEventListener('click', function (e) {     // stays on #bhBar
        var t = e.target.closest ? e.target.closest('.bhd-label') : null;
        if (!t) return;
        e.preventDefault();
        var el = self.target(self.lastState);
        if (!el) return;
        var reduce = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
        catch (err) { el.scrollIntoView(); }
      });
    },

    paint: function (st, d, p) {
      if (st === '0') {
        this.viewNode.innerHTML = '<a class="bhd bhd-empty" href="' + esc(this.wa) +
          '" target="_blank" rel="noopener noreferrer">' + this.glyph +
          '<span class="bhd-talk">Talk to an engineer on WhatsApp</span></a>';
      } else {
        var inner = '<span class="bhd-t">' + esc(p.primary) + '</span>' +
          (p.chip ? '<span class="bhd-chip">' + esc(p.chip) + '</span>' : '');
        var left = st === '1'
          ? '<span class="bhd-plain">' + inner + '</span>'
          : '<button type="button" class="bhd-label" aria-label="' + esc(this.aria(st)) + '">' + inner + '</button>';
        this.viewNode.innerHTML = '<div class="bhd">' + left +
          '<a class="bhd-cta" href="' + esc(reviewUrl()) + '">Review project</a></div>';
      }
      this.faded = false;
      this.assertWa();
    },

    announce: function (st, p) {
      if (!interacted || !this.srNode) return;
      this.srNode.textContent = st === '0' ? '' : p.primary + (p.chip ? ', ' + p.chip : '');
    },

    /* Project label only. .bhd-empty is deliberately excluded so the       */
    /* WhatsApp action and its glyph never fade.                            */
    group: function () {
      return this.viewNode.querySelector('.bhd-label, .bhd-plain');
    },

    render: function (d) {
      var self = this, st = this.state(d);
      var prev = this.lastState;                       // captured BEFORE the update
      this.lastState = st;
      this.bar.setAttribute('data-mode', st === '0' ? 'empty' : d.projectMode);
      this.bar.setAttribute('data-state', st);
      doc.documentElement.setAttribute('data-bhstate', st);

      var p = st === '0' ? { primary: '', chip: '' } : this.parts(st, d);
      var key = st + '|' + p.primary + '|' + p.chip;
      if (key === this.lastKey) return;                // nothing visible changed

      if (this.swap) { clearTimeout(this.swap); this.swap = null; }   // latest wins

      var first = !this.booted;
      var reduce = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function commit() {
        self.paint(st, d, p);
        self.lastKey = key;
        if (!first) self.announce(st, p);
      }

      // Instant whenever state 0 is on either side of the transition.
      if (first || reduce || prev === '0' || st === '0') {
        commit();
        this.booted = true;
        return;
      }

      function fadeIn() {
        var g = self.group();
        if (!g) return;
        g.style.opacity = '0';
        g.style.transition = 'opacity 75ms linear';
        void g.offsetWidth;                            // commit 0 before animating
        g.style.opacity = '1';
      }

      if (this.faded) { commit(); fadeIn(); return; }  // already hidden: swap now

      var g0 = this.group();
      if (!g0) { commit(); return; }
      g0.style.transition = 'opacity 75ms linear';
      g0.style.opacity = '0';
      this.faded = true;
      this.swap = setTimeout(function () {
        self.swap = null;
        commit();
        fadeIn();
      }, 75);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Dock chrome — measured reserve, menu and keyboard suppression         */
  /* The observer writes only --bh-dock-measured-reserve so the CSS state   */
  /* classes can still override --mobile-dock-reserve.                     */
  /* ------------------------------------------------------------------ */
  var dockFx = {
    MOBILE: '(max-width: 767px)',
    KB_DELTA: 150,
    RESTORE_MS: 100,
    last: 0,
    kbTimer: null,

    small: function () { return !!(win.matchMedia && win.matchMedia(this.MOBILE).matches); },

    kbOpen: function () {
      var vv = win.visualViewport;
      return !!vv && (win.innerHeight - vv.height) > this.KB_DELTA;
    },

    measure: function () {
      var bar = $('#bhBar');
      if (!bar || !this.small()) return;
      var h = bar.offsetHeight;
      if (!h) return;                                  // hidden: keep the last valid value
      this.last = h + 16;
      doc.documentElement.style.setProperty('--bh-dock-measured-reserve', this.last + 'px');
    },

    /* Immediate, synchronous removal with no timer. Used above 767px.      */
    clearKb: function () {
      if (this.kbTimer) { clearTimeout(this.kbTimer); this.kbTimer = null; }
      doc.documentElement.classList.remove('bh-kbopen');
    },

    /* on:  add immediately and cancel any pending removal                  */
    /* off: remove only after a stable RESTORE_MS, re-checked on fire, and  */
    /*      independently of whether a field still holds focus              */
    setKb: function (on) {
      var self = this, root = doc.documentElement;
      if (this.kbTimer) { clearTimeout(this.kbTimer); this.kbTimer = null; }
      if (on) { root.classList.add('bh-kbopen'); return; }
      this.kbTimer = setTimeout(function () {
        self.kbTimer = null;
        if (self.kbOpen()) return;                     // keyboard came back
        if (!win.visualViewport) {
          var a = doc.activeElement;                   // no viewport signal: trust focus
          if (a && a.matches && a.matches(FIELDS)) return;
        }
        root.classList.remove('bh-kbopen');
        self.measure();
      }, this.RESTORE_MS);
    },

    init: function () {
      var self = this;
      doc.documentElement.style.removeProperty('--mobile-dock-reserve');
      this.measure();

      var bar = $('#bhBar');
      if (bar && win.ResizeObserver) {
        new win.ResizeObserver(function () { self.measure(); }).observe(bar);
      }

      doc.addEventListener('focusin', function (e) {
        if (!self.small()) return;
        var t = e.target;
        if (t && t.matches && t.matches(FIELDS)) self.setKb(true);
      });

      doc.addEventListener('focusout', function () {
        if (!self.small()) return;
        self.setKb(false);                             // cancelled by a focusin in the same tick
      });

      if (win.visualViewport) {
        win.visualViewport.addEventListener('resize', function () {
          if (!self.small()) { self.clearKb(); return; }   // desktop: never toggles the class
          self.setKb(self.kbOpen());
        });
      }

      win.addEventListener('resize', function () {
        if (!self.small()) self.clearKb();
        else self.measure();
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Review — pre-built DOM driven by data-r attributes                   */
  /*                                                                      */
  /* Two layers, deliberately separate:                                   */
  /*   persistent  — the project (S): what the homeowner wants done        */
  /*   ephemeral   — the form draft: locality, start timing, WhatsApp      */
  /* The draft is never persisted (personal data) and is reset by         */
  /* resetForm() on Start over and on a new project.                      */
  /* ------------------------------------------------------------------ */
  var review = {
    init: function () {
      var root = this.root = $('#bhReview');
      if (!root) return false;
      this.description = $('#rv-desc', root);
      this.inline = !!this.description && this.description.tagName === 'TEXTAREA';
      var waLink = $('[data-r="photos"]', root) || $('a[href*="wa.me"]', root);
      this.waNumber = ((waLink && waLink.getAttribute('href')) || DEFAULT_WA).split('?')[0].replace(/\D/g, '');
      this.editing = false;
      this.inFlight = false;
      this.pending = null;
      this.resetForm();
      var self = this;

      root.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-r]') : null;
        if (!t) return;
        var r = t.getAttribute('data-r');
        var holder = t.hasAttribute('data-k') ? t : t.closest('[data-k]');
        var k = holder ? holder.getAttribute('data-k') : '';

        // The native request has no request ID in its DOM outcome. Preserve its
        // snapshot and prevent a new project from replacing it before it settles.
        if (self.inFlight && has(['remove', 'accept', 'addrow', 'add', 'start',
          'edit', 'edit-save', 'edit-cancel', 'startover'], r)) {
          e.preventDefault();
          return;
        }

        if (r === 'remove' && k) {
          ops.removeService(k);
        } else if (r === 'accept' && k) {
          ops.acceptSuggestion(k);            // the one path that records provenance
        } else if (r === 'addrow' && k) {
          ops.addService(k, false);
        } else if (r === 'add') {
          var list = $('[data-r="addlist"]', root);
          if (list) {
            var open = list.style.display === 'none';
            show(list, open);
            t.setAttribute('aria-expanded', open ? 'true' : 'false');
          }
        } else if (r === 'start') {
          self.draft.start = t.getAttribute('data-v') || '';
          $$('[data-r="start"]', root).forEach(function (b) {
            b.setAttribute('aria-pressed', b === t ? 'true' : 'false');
          });
          self.error('');
        } else if (r === 'edit') {
          e.preventDefault();
          self.openEditor();
        } else if (r === 'edit-save') {
          e.preventDefault();
          self.saveEditor();
        } else if (r === 'edit-cancel') {
          e.preventDefault();
          self.closeEditor();
        } else if (r === 'print') {
          e.preventDefault();
          if (typeof win.print === 'function') win.print();
        } else if (r === 'startover') {
          e.preventDefault();
          if (t.getAttribute('data-armed') === '1') {
            // A bounce, double tap or held key must not complete both steps.
            if (Date.now() - (self.armedAt || 0) < CONFIRM_GUARD_MS) return;
            self.disarm(t);
            self.resetForm();
            clear();
          } else {
            self.arm(t);
          }
        }
      });

      // Keyboard parity for controls built as role="button" elements. Like a native
      // button: Enter acts on keydown, Space on keyup, auto-repeat never acts, and
      // the page does not scroll on Space. Only the focused control itself counts;
      // native buttons, inputs, links and the text area keep their own behaviour.
      var spaceOn = null;
      function customControl(e) {
        var t = e.target;
        if (!t || t === root || !t.getAttribute || t.getAttribute('role') !== 'button') return null;
        if (!t.hasAttribute('data-r') || t.isContentEditable) return null;
        if (/^(BUTTON|INPUT|A|TEXTAREA|SELECT|SUMMARY)$/.test(t.tagName)) return null;
        return t;
      }
      root.addEventListener('keydown', function (e) {
        var t = customControl(e);
        if (!t || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) t.click();
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (!e.repeat) spaceOn = t;
        }
      });
      root.addEventListener('keyup', function (e) {
        if (e.key !== ' ' && e.key !== 'Spacebar') return;
        var t = customControl(e), armed = spaceOn;
        spaceOn = null;
        if (t && t === armed) { e.preventDefault(); t.click(); }
      });
      root.addEventListener('focusout', function (e) { if (e.target === spaceOn) spaceOn = null; });

      // One assertive announcer (role=alert) for errors and waiting messages. It stays
      // in the accessibility tree, so repeated messages are announced reliably.
      var live = this.live = doc.createElement('div');
      live.setAttribute('role', 'alert');
      live.setAttribute('data-r', 'live');
      live.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
      root.appendChild(live);

      // One submission path: the native form. Validation and the hidden fields
      // happen in the capture phase, before Webflow's own submit handler runs.
      var form = this.form = $('[data-r="form"] form', root) || $('form', root);
      if (form) {
        form.addEventListener('submit', function (e) { self.onSubmit(e); }, true);
        this.watchCapture(form);
        // Webflow normally handles submission at document level and cancels the
        // browser's default action. Catch an absent/unbound handler afterwards.
        win.addEventListener('submit', function (e) { self.onUnhandledSubmit(e); });
      }
      var ta = $('[data-r="edit-text"]', root);
      if (ta) ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); self.closeEditor(); } });
      $$('input', root).forEach(function (i) { i.addEventListener('input', function () { self.error(''); }); });
      if (this.inline) this.bindDescription();
      return true;
    },

    // The page owns markup and styling. This path is enabled only by #rv-desc.
    bindDescription: function () {
      var self = this, ta = this.description;
      ta.addEventListener('compositionstart', function () { self.composing = true; });
      ta.addEventListener('input', function () { self.flushDescription(); });
      ta.addEventListener('compositionend', function () {
        self.composing = false;
        self.flushDescription();
      });
      ta.addEventListener('blur', function () {
        self.composing = false;
        self.flushDescription();
      });
      win.addEventListener('pagehide', function () { self.flushDescription(); });
      win.addEventListener('pageshow', function (e) {
        if (!e.persisted || self.inFlight || self.submitted) return;
        // Home may have changed choices while this Review was in the back cache.
        // Never write the stale cached Review state over those choices.
        var loaded = store.load();
        if (store.memoryOnly) return;
        self.composing = false;
        S = loaded || fresh();
        restored = !!loaded;
        emit();
      });
    },

    flushDescription: function () {
      if (!this.inline || this.inFlight || this.submitted) return;
      var value = this.description.value;
      if (value !== S.heroText) ops.setHeroText(value);
    },

    descriptionProblem: function () {
      if (!(S.fullRenovation || S.services.length) && !S.heroText.trim()) {
        return 'Choose a service above, or describe the work here — either is enough.';
      }
      if (S.heroText.length > 1000) return 'Keep the description within 1,000 characters.';
      return '';
    },

    descriptionError: function (msg) {
      if (!this.inline) return;
      this.descriptionMessage = msg || '';
      var el = $('[data-r="desc-error"]', this.root), ta = this.description;
      if (el) {
        if (!el.id) el.id = 'rv-desc-error';
        el.textContent = msg || '';
        el.hidden = !msg;
        // The existing controller live region announces the error once.
        el.removeAttribute('role');
        show(el, !!msg);
      }
      var id = el ? el.id : 'rv-desc-error';
      var ids = (ta.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (v) {
        return v && v !== id;
      });
      if (msg) {
        ta.setAttribute('aria-invalid', 'true');
        if (el) ids.push(id);
      } else ta.removeAttribute('aria-invalid');
      if (ids.length) ta.setAttribute('aria-describedby', ids.join(' '));
      else ta.removeAttribute('aria-describedby');
    },

    renderDescription: function () {
      var ta = this.description;
      // clear() must discard even an unfinished composition, never resurrect it.
      if (!S.leadId) this.composing = false;
      if (!this.composing && ta.value !== S.heroText) ta.value = S.heroText;
      var optional = $('[data-r="desc-optional"]', this.root);
      var selected = S.fullRenovation || S.services.length > 0;
      if (optional) { optional.hidden = !selected; show(optional, selected); }
      if (!ta.value) {
        var examples = {
          'Kitchen': 'Replace the kitchen counter and add more storage',
          'Bathroom': 'Replace the bathroom tiles and fix the damp patch below the window',
          'Painting': 'Repaint two bedrooms and the living room',
          'Waterproofing': 'Damp on the bedroom wall after rain',
          'Flooring': 'Replace the living room flooring',
          'False ceiling': 'False ceiling with lighting in the living room',
          'Doors and windows': 'Replace two bedroom doors',
          'Electrical': 'Add points in the kitchen and fix a tripping switch',
          'Carpentry': 'Build a study table and two wardrobes',
          'Wardrobes': 'Two wardrobes in the bedrooms',
          'Home repairs': 'A few small repairs around the flat',
          'Full renovation': 'Full renovation of a 3 BHK, kitchen and bathrooms first'
        };
        ta.placeholder = examples[S.fullRenovation ? FULL : S.services[0]] || 'Tell us what needs doing';
      }
      if (this.descriptionMessage) {
        var previous = this.descriptionMessage, next = this.descriptionProblem();
        if (previous !== next) {
          this.descriptionError(next);
          var summary = $('[data-r="error"]', this.root);
          if (!summary || summary.textContent === previous) this.error(next);
        }
      }
    },

    /* Observe this form's native outcome blocks. Form visibility alone can change
       for unrelated UI reasons and must never be treated as a saved enquiry. */
    watchCapture: function (form) {
      var self = this;
      var wrap = form.closest ? form.closest('.w-form') : null;
      var done = wrap ? $('.w-form-done', wrap) : null;
      var fail = wrap ? $('.w-form-fail', wrap) : null;
      this.captureReady = false;
      this.nativeDone = done;
      this.nativeFail = fail;
      if (!win.MutationObserver || !wrap || !done || !fail) return;
      function visible(el) {
        var style = win.getComputedStyle ? win.getComputedStyle(el) : el.style;
        return style.display !== 'none' && style.visibility !== 'hidden';
      }
      var mo = new win.MutationObserver(function () {
        if (!self.inFlight || !self.pending) return;
        if (visible(done)) self.captured();
        else if (visible(fail)) self.failed();
      });
      [done, fail].forEach(function (el) {
        mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
      });
      this.captureReady = true;
    },

    resetNativeOutcome: function () {
      if (this.nativeDone) this.nativeDone.style.display = 'none';
      if (this.nativeFail) this.nativeFail.style.display = 'none';
      if (this.form) this.form.style.display = '';
    },

    runtimeReady: function () {
      try {
        return !!(this.captureReady && win.Webflow &&
          typeof win.Webflow.require === 'function' && win.Webflow.require('forms'));
      } catch (e) { return false; }
    },

    onUnhandledSubmit: function (e) {
      if (e.target !== this.form || !this.inFlight || e.defaultPrevented) return;
      e.preventDefault();
      this.failed();
    },

    lockDraft: function (on) {
      if (on) {
        if (this.lockedInputs) return;
        this.lockedInputs = [];
        var self = this;
        ['[name="locality"]', '[name="whatsapp"]', this.inline ? '#rv-desc' : '[data-r="edit-text"]'].forEach(function (sel) {
          var el = $(sel, self.root);
          if (!el) return;
          self.lockedInputs.push({ el: el, readOnly: el.readOnly });
          // Read-only fields remain part of native form serialization.
          el.readOnly = true;
        });
      } else {
        (this.lockedInputs || []).forEach(function (item) { item.el.readOnly = item.readOnly; });
        this.lockedInputs = null;
      }
    },

    openEditor: function () {
      if (this.inline) { this.description.focus(); return; }
      var root = this.root;
      var ed = $('[data-r="editor"]', root), ta = $('[data-r="edit-text"]', root);
      if (!ed || !ta) return;
      this.editing = true;
      ta.value = S.heroText;
      show(ed, true);
      show($('[data-r="quote"]', root), false);
      show($('[data-r="edit"]', root), false);
      try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* older browsers */ }
    },
    saveEditor: function () {
      if (this.inline) { this.flushDescription(); return; }
      var ta = $('[data-r="edit-text"]', this.root);
      if (ta) ops.setHeroText(ta.value.slice(0, 1000)); // selections untouched; suggestions re-derive
      this.closeEditor();
    },
    closeEditor: function () {
      if (this.inline) { this.flushDescription(); return; }
      var root = this.root;
      this.editing = false;
      show($('[data-r="editor"]', root), false);
      emit();
    },

    arm: function (t) {
      var self = this;
      t.setAttribute('data-armed', '1');
      this.armedAt = Date.now();
      t.setAttribute('data-label', t.textContent);
      t.textContent = 'Tap again to clear everything';
      clearTimeout(this.armTimer);
      this.armTimer = setTimeout(function () { self.disarm(t); }, 5000);
    },
    disarm: function (t) {
      clearTimeout(this.armTimer);
      if (t.getAttribute('data-armed') !== '1') return;
      t.removeAttribute('data-armed');
      t.textContent = t.getAttribute('data-label') || 'Start over';
    },

    resetForm: function () {
      if (this.inFlight) return; // The native transport has not settled yet.
      var root = this.root;
      this.draft = { start: '' };
      this.submitted = false;
      this.inFlight = false;
      this.pending = null;
      clearTimeout(this.watchdog);
      this.lockDraft(false);
      this.resetNativeOutcome();
      if (this.inline) {
        this.composing = false;
        this.description.value = '';
        this.descriptionError('');
      }
      $$('input', root).forEach(function (i) { if (i.type !== 'submit') i.value = ''; });
      $$('[data-r="start"]', root).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      this.busy(false);
      show($('[data-r="editor"]', root), false);
      this.editing = false;
      show($('[data-r="fallback"]', root), false);
      show($('[data-r="addlist"]', root), false);
      var add = $('[data-r="add"]', root);
      if (add) add.setAttribute('aria-expanded', 'false');
      this.error('');
    },

    render: function (d) {
      var root = this.root;
      root.setAttribute('data-mode', this.submitted ? 'submitted' : d.isEmpty ? 'empty' : d.projectMode);
      root.setAttribute('data-entry', d.entrySource);

      if (this.submitted) {
        if (this.inline) this.description.value = '';
        ['empty', 'text', 'full', 'list', 'suggest', 'form'].forEach(function (r) {
          show($('[data-r="' + r + '"]', root), false);
        });
        show($('[data-r="success"]', root), true);
        return;
      }
      show($('[data-r="success"]', root), false);

      show($('[data-r="empty"]', root), !this.inline && d.isEmpty);
      show($('[data-r="text"]', root), this.inline || d.hasText || this.editing);
      var quote = $('[data-r="quote"]', root);
      if (quote) {
        quote.textContent = S.heroText;
        quote.classList.toggle('is-long', S.heroText.length > LONG_TEXT || /\n/.test(S.heroText));
        show(quote, !this.inline && !this.editing);
      }
      show($('[data-r="edit"]', root), !this.inline && !this.editing);
      if (this.inline) this.renderDescription();

      show($('[data-r="full"]', root), S.fullRenovation);
      $$('[data-r="focus"] [data-k]', root).forEach(function (c) {
        show(c, has(S.services, c.getAttribute('data-k')));
      });
      show($('[data-r="focus-empty"]', root), S.fullRenovation && !S.services.length);

      show($('[data-r="list"]', root), !S.fullRenovation && S.services.length > 0);
      $$('[data-r="row"]', root).forEach(function (row) {
        show(row, has(S.services, row.getAttribute('data-k')));
      });

      var anySuggestion = false;
      $$('[data-r="suggestion"]', root).forEach(function (s) {
        var on = has(d.suggestions, s.getAttribute('data-k'));
        show(s, on); if (on) anySuggestion = true;
      });
      show($('[data-r="suggest"]', root), anySuggestion);

      $$('[data-r="addrow"]', root).forEach(function (row) {
        var k = row.getAttribute('data-k');
        show(row, k === FULL ? !S.fullRenovation : !has(S.services, k));
      });

      show($('[data-r="form"]', root), this.inline || !d.isEmpty);
    },

    error: function (msg) {
      var el = $('[data-r="error"]', this.root);
      if (el) {
        el.textContent = msg || '';
        show(el, !!msg);
      }
      this.announce(msg || '');
    },

    announce: function (msg) {
      clearTimeout(this.announceTimer);
      this.announceTimer = null;
      var live = this.live;
      if (!live) return;
      live.textContent = '';
      if (!msg) return;
      var self = this;
      this.announceTimer = setTimeout(function () {
        self.announceTimer = null;
        live.textContent = msg;
      }, 50);
    },

    // Native outcome blocks are clipped, but still have layout boxes. A visible
    // fixed-position control can have no offsetParent, so check rendered boxes.
    focusLost: function () {
      var a = doc.activeElement;
      if (!a || a === doc.body || a === doc.documentElement) return true;
      if ([this.nativeDone, this.nativeFail].some(function (el) {
        return el && (el === a || (el.contains && el.contains(a)));
      })) return true;
      return a.getClientRects ? a.getClientRects().length === 0 : !a.offsetParent;
    },

    read: function () {
      var root = this.root;
      var locality = ($('[name="locality"]', root) || {}).value || '';
      var whatsapp = ($('[name="whatsapp"]', root) || {}).value || '';
      var honeypot = ($('[name="website"]', root) || {}).value || '';
      var digits = whatsapp.replace(/\D/g, '');
      if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
      if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
      return { locality: locality.trim(), start: this.draft.start, whatsapp: digits, honeypot: honeypot };
    },

    // UX validation only; native spam controls and downstream checks are separate.
    validate: function (f) {
      var d = derive(S);
      if (f.honeypot) return 'Something went wrong. Please try again.';
      if (this.inline) {
        var problem = this.descriptionProblem();
        if (problem) return problem;
      } else if (d.isEmpty) return 'Add at least one service, or describe what you need.';
      if (f.locality.length < 2) return 'Tell us where the home is.';
      if (!f.start) return 'Choose when you want to start.';
      if (!/^[6-9]\d{9}$/.test(f.whatsapp)) return 'Enter a 10-digit WhatsApp number.';
      return '';
    },

    serialize: function (f) {
      var d = derive(S);
      var suggested = d.hasText ? parse(S.heroText) : [];
      return {
        schema: SCHEMA,
        leadId: S.leadId,
        env: /webflow\.io$/.test(win.location.hostname) ? 'staging' : 'production',
        submittedAt: new Date().toISOString(),
        project: {
          projectMode: d.projectMode,
          entrySource: d.entrySource,
          fullRenovation: S.fullRenovation,
          services: S.services.slice(),
          focusAreas: d.focusAreas,
          heroText: S.heroText,
          suggested: suggested,
          acceptedSuggestions: S.acceptedSuggestions.slice()
        },
        home: { locality: f.locality, startTiming: f.start, startLabel: this.startLabel() },
        contact: { whatsapp: f.whatsapp },          // ten digits; +91 is added downstream
        attribution: attribution.get(),
        meta: {
          sourcePage: S.sourcePage,
          submissionPage: win.location.pathname,
          projectStartedAt: S.startedAt ? new Date(S.startedAt).toISOString() : null,
          controller: VERSION,
          ua: (win.navigator && win.navigator.userAgent || '').slice(0, 200)
        }
      };
    },

    fallbackLink: function (f) {
      var d = derive(S);
      var what = S.fullRenovation
        ? FULL + (d.focusAreas.length ? ' (focus: ' + d.focusAreas.join(', ') + ')' : '')
        : S.services.join(', ');
      var parts = ['Hi Builrode, my project:'];
      if (what) parts.push(what + '.');
      if (S.heroText) parts.push('"' + S.heroText + '"');
      if (f.locality) parts.push('Home: ' + f.locality + '.');
      if (f.start) parts.push('Start: ' + f.start.replace(/-/g, ' ') + '.');
      return 'https://wa.me/' + this.waNumber + '?text=' + encodeURIComponent(parts.join(' '));
    },

    startLabel: function () {
      var b = $('[data-r="start"][aria-pressed="true"]', this.root);
      return b ? b.textContent.trim() : '';
    },

    busy: function (on) {
      var btn = $('input[type="submit"], button[type="submit"]', this.root);
      if (!btn) return;
      btn.disabled = !!on;
      btn.classList.toggle('is-busy', !!on);
      var wait = btn.getAttribute('data-wait');
      if (wait) {
        if (btn.tagName === 'INPUT') {
          if (on) { if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', btn.value); btn.value = wait; }
          else if (btn.getAttribute('data-label')) btn.value = btn.getAttribute('data-label');
        } else {
          if (on) { if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', btn.textContent); btn.textContent = wait; }
          else if (btn.getAttribute('data-label')) btn.textContent = btn.getAttribute('data-label');
        }
      }
    },

    /* Hidden fields carry the structured project into Webflow's submission.
       Arrays are joined with ", " (service names contain no commas); booleans are
       "true"/"false". Any field missing from the Designer is created on the fly so
       the stored submission is always complete. */
    fill: function (p) {
      var form = this.form;
      if (!form) return;
      var fields = {
        leadId: p.leadId,
        env: p.env,
        submittedAt: p.submittedAt,
        projectMode: p.project.projectMode,
        entrySource: p.project.entrySource,
        fullRenovation: String(!!p.project.fullRenovation),
        services: p.project.services.join(', '),
        focusAreas: p.project.focusAreas.join(', '),
        heroText: p.project.heroText,
        suggested: p.project.suggested.join(', '),
        acceptedSuggestions: p.project.acceptedSuggestions.join(', '),
        startTiming: p.home.startTiming,
        sourcePage: p.meta.sourcePage || '',
        submissionPage: p.meta.submissionPage,
        projectStartedAt: p.meta.projectStartedAt || '',
        controller: p.meta.controller,
        utmSource: p.attribution.utm_source || '',
        utmMedium: p.attribution.utm_medium || '',
        utmCampaign: p.attribution.utm_campaign || '',
        gclid: p.attribution.gclid || ''
      };
      Object.keys(fields).forEach(function (name) {
        var el = form.querySelector('input[name="' + name + '"]');
        if (!el) {
          el = doc.createElement('input');
          el.type = 'hidden';
          el.name = name;
          form.appendChild(el);
        }
        el.value = fields[name];
      });
      // Store the visible fields exactly as validated.
      var loc = $('[name="locality"]', form), wa = $('[name="whatsapp"]', form);
      if (loc) loc.value = p.home.locality;
      if (wa) wa.value = p.contact.whatsapp;
    },

    // Capture-phase submit handler: runs before Webflow's own handler.
    onSubmit: function (e) {
      var self = this, root = this.root;
      function stop() { e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
      if (this.inFlight || this.submitted) { stop(); return; }
      if (this.inline) this.flushDescription();
      if (this.editing) {
        stop();
        this.error('Save or cancel your description edit before sending.');
        var editor = $('[data-r="edit-text"]', root);
        if (editor) editor.focus();
        return;
      }
      var f = this.read();
      var err = this.validate(f);
      if (this.inline) this.descriptionError(f.honeypot ? '' : this.descriptionProblem());
      if (err) {
        stop();
        this.error(err);
        this.focusProblem(f);
        return;
      }
      var fallback = $('[data-r="fallback"]', root);
      if (fallback) fallback.setAttribute('href', this.fallbackLink(f));
      if (!this.runtimeReady()) { // A Webflow=[] queue is not the loaded forms runtime.
        stop();
        this.failed();
        return;
      }
      var payload = this.serialize(f);
      this.resetNativeOutcome();
      this.pending = payload;
      this.fill(payload);
      show(fallback, false);
      this.error('');
      this.inFlight = true;
      this.lockDraft(true);
      this.busy(true);
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(function () { self.uncertain(); }, CAPTURE_WATCHDOG_MS);
      // Not stopping the event: Webflow's handler posts the form now.
    },

    focusProblem: function (f) {
      var root = this.root, el = null;
      if (this.inline && !f.honeypot && this.descriptionProblem()) el = this.description;
      else if (f.locality.length < 2) el = $('[name="locality"]', root);
      else if (!f.start) el = $('[data-r="start"]', root);
      else if (!/^[6-9]\d{9}$/.test(f.whatsapp)) el = $('[name="whatsapp"]', root);
      if (el && el.focus) { try { el.focus(); } catch (err) { /* not focusable */ } }
    },

    // Webflow accepted and stored the submission.
    captured: function () {
      var root = this.root, p = this.pending;
      if (!p) return;
      clearTimeout(this.watchdog);
      this.inFlight = false;
      this.pending = null;
      this.submitted = true;
      this.lockDraft(false);
      this.busy(false);
      this.error('');
      show($('[data-r="fallback"]', root), false);
      this.renderReceipt(p);
      clear(); // emits; render() sees submitted and shows only the success block
      // Move focus to the receipt after Webflow's own handler has finished.
      var card = $('[data-r="success-title"]', root) || $('[data-r="success"]', root);
      if (card) {
        if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
        setTimeout(function () { try { card.focus(); } catch (e) { /* not focusable */ } }, 0);
      }
    },

    // Webflow reported failure (network, server or its spam filter).
    failed: function () {
      clearTimeout(this.watchdog);
      this.inFlight = false;
      this.pending = null;
      this.lockDraft(false);
      this.busy(false);
      this.error('We couldn\u2019t send that. Your answers are still here. Try again, or send them on WhatsApp.');
      show($('[data-r="fallback"]', this.root), true);
      var btn = $('input[type="submit"], button[type="submit"]', this.root);
      if (btn && this.focusLost()) { try { btn.focus(); } catch (e) { /* not focusable */ } }
    },

    // No outcome yet. Webflow still owns a live request that cannot be cancelled
    // here, so keep the snapshot and lock until a native success or failure.
    uncertain: function () {
      if (!this.inFlight || !this.pending) return;
      this.error('This is taking longer than expected. Your answers are still here. We\u2019re waiting for confirmation; you can also send them on WhatsApp below.');
      var fallback = $('[data-r="fallback"]', this.root);
      show(fallback, true);
      if (fallback && this.focusLost()) { try { fallback.focus(); } catch (e) { /* not focusable */ } }
    },

    renderReceipt: function (p) {
      var root = this.root;
      function put(r, text) {
        var el = $('[data-r="' + r + '"]', root);
        if (el) el.textContent = text;
      }
      var what = p.project.fullRenovation
        ? FULL + (p.project.focusAreas.length ? ' (focus: ' + p.project.focusAreas.join(', ') + ')' : '')
        : p.project.services.join(', ');
      put('rc-services', what);
      show($('[data-r="rc-services-row"]', root), !!what);
      put('rc-text', p.project.heroText ? '\u201C' + p.project.heroText + '\u201D' : '');
      show($('[data-r="rc-text-row"]', root), !!p.project.heroText);
      put('rc-locality', p.home.locality);
      put('rc-start', p.home.startLabel || p.home.startTiming.replace(/-/g, ' '));
      put('rc-whatsapp', '+91 ' + p.contact.whatsapp.slice(0, 5) + ' ' + p.contact.whatsapp.slice(5));
      var photos = $('[data-r="photos"]', root);
      if (photos) photos.setAttribute('href', this.photosLink(p, what));
    },

    photosLink: function (p, what) {
      var text = 'Hi Builrode, I just sent my project enquiry on your website' +
        (what ? ' (' + what + (p.home.locality ? ' \u00B7 ' + p.home.locality : '') + ')' : '') +
        '. Sharing photos of my home.';
      return 'https://wa.me/' + this.waNumber + '?text=' + encodeURIComponent(text);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Attribution — UTM/gclid seen on any page this session               */
  /* ------------------------------------------------------------------ */
  var attribution = {
    capture: function () {
      var q = win.location.search || '';
      if (!q) return;
      var keep = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid'], out = {}, any = false;
      function decode(value) {
        try { return decodeURIComponent(value.replace(/\+/g, ' ')); }
        catch (e) { return null; } // One malformed tracking value must not break the site.
      }
      q.replace(/^\?/, '').split('&').forEach(function (pair) {
        var i = pair.indexOf('='), k = decode(i < 0 ? pair : pair.slice(0, i));
        if (keep.indexOf(k) < 0) return;
        var value = decode(i < 0 ? '' : pair.slice(i + 1));
        if (value === null) return;
        out[k] = value.slice(0, 120);
        any = true;
      });
      if (!any) return;
      try { win.sessionStorage.setItem(ATTR_KEY, JSON.stringify(out)); } catch (e) { /* unavailable */ }
    },
    get: function () {
      try { return JSON.parse(win.sessionStorage.getItem(ATTR_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Boot — once                                                          */
  /* ------------------------------------------------------------------ */
  function init() {
    attribution.capture();
    var loaded = store.load();
    if (loaded) { S = loaded; restored = true; }

    if (catalogue.init()) renderers.push(function (d) { catalogue.render(d); });
    hero.init();
    if (dock.init()) { renderers.push(function (d) { dock.render(d); }); dockFx.init(); }
    if (review.init()) renderers.push(function (d) { review.render(d); });

    if (!renderers.length && !$('#bhQ')) return; // nothing on this page for us
    emit();
  }

  win.BuilrodeProject = {
    version: VERSION,
    get: get,
    clear: clear,
    derive: function () { return derive(S); },
    subscribe: subscribe,
    parse: parse,
    addService: ops.addService,
    removeService: ops.removeService,
    toggleService: ops.toggleService,
    setFull: ops.setFull,
    acceptSuggestion: ops.acceptSuggestion,
    setHeroText: ops.setHeroText,
    waContractOk: function () { return dock.assertWa(); }
  };

  if (doc.readyState !== 'loading') init();
  else doc.addEventListener('DOMContentLoaded', init);
})(window, document);
