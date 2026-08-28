/*! builrode-project.js v2.0.1
 *  Single controller for the Builrode project state.
 *  Replaces the fifteen legacy Home v2 page scripts.
 *
 *  Principles
 *    - One persistent state object: project INTENT only. Every write goes through
 *      the operations in `ops`, which keep derived provenance (acceptedSuggestions)
 *      consistent on every path.
 *    - One ephemeral layer: the Review form draft (locality, start timing, WhatsApp).
 *      Never persisted. Reset by review.resetForm() on Start over.
 *    - Every render is a pure function of state. One boot on DOM ready.
 *      No timers, no retries, no monkey-patching.
 *    - Inert on any page that has none of its anchors. Injects no CSS
 *      (styling lives in the page head block — see builrode-project.css).
 *
 *  Client-side validation is UX only. The webhook URL is public; Make must
 *  validate the schema, dedupe on leadId, and rate-limit.
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
 *    <div id="bhReview" data-webhook="https://…">  Make webhook (replaceable, not secret)
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

  var VERSION = '2.0.1';
  var SCHEMA = 1;
  var KEY = 'bh_project';
  var TTL_MS = 14 * 24 * 60 * 60 * 1000;
  var FULL = 'Full renovation';
  var DEFAULT_REVIEW = '/review';
  var DEFAULT_TEL = 'tel:+918383056889';
  var DEFAULT_WA = 'https://wa.me/918383056889';
  var SUBMIT_TIMEOUT_MS = 8000;

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
      this.webhook = root.getAttribute('data-webhook') || '';
      this.contact = $('a[href*="wa.me"]');
      this.resetForm();
      var self = this;

      root.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-r]') : null;
        if (!t) return;
        var r = t.getAttribute('data-r');
        var holder = t.hasAttribute('data-k') ? t : t.closest('[data-k]');
        var k = holder ? holder.getAttribute('data-k') : '';

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
        } else if (r === 'submit') {
          e.preventDefault();
          self.submit();
        } else if (r === 'startover') {
          e.preventDefault();
          self.resetForm();
          clear();
        }
      });

      var form = $('[data-r="form"]', root);
      if (form) form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(); });
      $$('input', root).forEach(function (i) { i.addEventListener('input', function () { self.error(''); }); });
      return true;
    },

    resetForm: function () {
      var root = this.root;
      this.draft = { start: '' };
      this.submitted = false;
      $$('input', root).forEach(function (i) { i.value = ''; });
      $$('[data-r="start"]', root).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      var btn = $('[data-r="submit"]', root);
      if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
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
      show($('[data-r="text"]', root), d.hasText);
      var quote = $('[data-r="quote"]', root);
      if (quote) quote.textContent = S.heroText;

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
      if (!el) return;
      el.textContent = msg || '';
      show(el, !!msg);
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

    // UX validation only; Make validates the payload again.
    validate: function (f) {
      var d = derive(S);
      if (d.isEmpty) return 'Add at least one service, or describe what you need.';
      if (f.locality.length < 2) return 'Tell us where the home is.';
      if (!f.start) return 'Choose when you want to start.';
      if (!/^[6-9]\d{9}$/.test(f.whatsapp)) return 'Enter a 10-digit WhatsApp number.';
      if (f.honeypot) return 'Something went wrong. Please try again.';
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
        home: { locality: f.locality, startTiming: f.start },
        contact: { whatsapp: '+91' + f.whatsapp },
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
      var num = (this.contact ? this.contact.getAttribute('href') : DEFAULT_WA).replace(/\D/g, '');
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent(parts.join(' '));
    },

    submit: function () {
      var self = this, root = this.root;
      var f = this.read();
      var err = this.validate(f);
      if (err) { this.error(err); return; }

      var btn = $('[data-r="submit"]', root);
      var payload = this.serialize(f);
      var fallback = $('[data-r="fallback"]', root);
      if (fallback) fallback.setAttribute('href', this.fallbackLink(f));

      function busy(on) {
        if (!btn) return;
        btn.disabled = on;
        btn.classList.toggle('is-busy', on);
      }
      function succeed() {
        self.submitted = true;
        busy(false);
        self.error('');
        show(fallback, false);
        clear(); // emits; render() sees submitted and shows only the success block
      }
      function fail() {
        busy(false);
        self.error('We could not send that. Try again, or send it on WhatsApp below.');
        show(fallback, true);
      }

      if (!this.webhook || typeof win.fetch !== 'function') { fail(); return; }
      busy(true);

      var ctrl = win.AbortController ? new win.AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, SUBMIT_TIMEOUT_MS) : null;

      win.fetch(this.webhook, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        succeed();
      }).catch(function () {
        if (timer) clearTimeout(timer);
        fail();
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Boot — once                                                          */
  /* ------------------------------------------------------------------ */
  function init() {
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
