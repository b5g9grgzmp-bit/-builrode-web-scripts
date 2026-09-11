/*! builrode-project.js v2.1.3
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
 */
(function (win, doc) {
  'use strict';
  if (win.BuilrodeProject) return;

  var VERSION = '2.1.3';
  var SCHEMA = 1;
  var KEY = 'bh_project';
  var TTL_MS = 14 * 24 * 60 * 60 * 1000;
  var FULL = 'Full renovation';
  var DEFAULT_REVIEW = '/review';
  var DEFAULT_TEL = 'tel:+918383056889';
  var DEFAULT_WA = 'https://wa.me/918383056889';
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
    setHeroText: function (t) { set({ heroText: String(t || '').trim() }); }
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
  /* Dock — owns the markup inside #bhBar. Four presentations.           */
  /*   empty      → Talk to an engineer                                   */
  /*   text-only  → Your project · Review project                         */
  /*   services   → N selected · Review project                           */
  /*   full       → Full renovation · N areas · Review project            */
  /* ------------------------------------------------------------------ */
  var dock = {
    init: function () {
      this.bar = $('#bhBar');
      if (!this.bar) return false;
      // Contact discovery, once, before this script writes any links of its own.
      var tel = $('a[href^="tel:"]'), wa = $('a[href*="wa.me"]');
      this.tel = tel ? tel.getAttribute('href') : DEFAULT_TEL;
      this.wa = wa ? wa.getAttribute('href') : DEFAULT_WA;
      var glyph = $('.brb-bar .brb-wa svg');
      this.glyph = glyph ? glyph.outerHTML :
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 10c0 3 2 5 5 5l1-2-2-1-1 1c-1 0-2-1-2-2l1-1-1-2z"/></svg>';
      return true;
    },
    label: function (d) {
      if (d.projectMode === 'full') {
        return FULL + (d.count ? ' \u00b7 ' + d.count + (d.count === 1 ? ' area' : ' areas') : '');
      }
      if (!d.count) return 'Your project';                       // text-only: never "0 selected"
      var l = d.count + ' selected';
      return d.showReturnCue ? 'Your project \u00b7 ' + l : l;   // return cue only where it fits
    },
    render: function (d) {
      var b = this.bar;
      b.setAttribute('data-mode', d.isEmpty ? 'empty' : d.projectMode);
      var waLink = '<a class="bhd-wa" href="' + esc(this.wa) + '" target="_blank" rel="noopener" aria-label="Chat with Builrode on WhatsApp">' + this.glyph + '</a>';

      if (d.isEmpty) {
        b.innerHTML = '<div class="bhd bhd-empty">' + waLink +
          '<a class="bhd-talk" href="' + esc(this.wa) + '" target="_blank" rel="noopener">Talk to an engineer \u2192</a></div>';
        return;
      }
      b.innerHTML = '<div class="bhd">' + waLink +
        '<span class="bhd-state">' + esc(this.label(d)) + '</span>' +
        '<a class="bhd-cta" href="' + esc(reviewUrl()) + '">Review project \u2192</a></div>';
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
      return true;
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
        ['[name="locality"]', '[name="whatsapp"]', '[data-r="edit-text"]'].forEach(function (sel) {
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
      var ta = $('[data-r="edit-text"]', this.root);
      if (ta) ops.setHeroText(ta.value.slice(0, 1000)); // selections untouched; suggestions re-derive
      this.closeEditor();
    },
    closeEditor: function () {
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
        ['empty', 'text', 'full', 'list', 'suggest', 'form'].forEach(function (r) {
          show($('[data-r="' + r + '"]', root), false);
        });
        show($('[data-r="success"]', root), true);
        return;
      }
      show($('[data-r="success"]', root), false);

      show($('[data-r="empty"]', root), d.isEmpty);
      show($('[data-r="text"]', root), d.hasText || this.editing);
      var quote = $('[data-r="quote"]', root);
      if (quote) {
        quote.textContent = S.heroText;
        quote.classList.toggle('is-long', S.heroText.length > LONG_TEXT || /\n/.test(S.heroText));
        show(quote, !this.editing);
      }
      show($('[data-r="edit"]', root), !this.editing);

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

      show($('[data-r="form"]', root), !d.isEmpty);
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
      if (d.isEmpty) return 'Add at least one service, or describe what you need.';
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
      if (this.editing) {
        stop();
        this.error('Save or cancel your description edit before sending.');
        var editor = $('[data-r="edit-text"]', root);
        if (editor) editor.focus();
        return;
      }
      var f = this.read();
      var err = this.validate(f);
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
      if (f.locality.length < 2) el = $('[name="locality"]', root);
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
    if (dock.init()) renderers.push(function (d) { dock.render(d); });
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
    setHeroText: ops.setHeroText
  };

  if (doc.readyState !== 'loading') init();
  else doc.addEventListener('DOMContentLoaded', init);
})(window, document);
