/*! Builrode enquiry-summary PDF 1.0.2 — A4, Inter embedded, dark closing band.
 *  Runs in the browser (Save summary control) and in Node (test harness) with the same code.
 *  build(input, deps) → Promise<{ blob|buffer, pages, filename }>
 *  input  = { ref, submittedAt, replyBy?, name?, phone, location, start, fullRenovation, services[], note? }
 *  deps   = { jsPDF, QRCode, assets }   assets = { fonts:{regular,semibold,display (base64)}, images:{...dataURIs} }
 *  Every displayed value is derived from `submittedAt`, so a later download reproduces the original date and deadline. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuilrodeSummaryPDF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.0.2';
  const BUSINESS_WA = '918383056889', BUSINESS_WA_TEXT = '+91 83830 56889';
  const C = {
    text: '#1A1614', grey: '#6E6963', grey2: '#8A8580', rule: '#C9C6C0', hair: '#E4E2DD', ring: '#BDB8B1', green: '#278158', white: '#FFFFFF',
    band: '#1A1614', bandRule: '#3A3430', onDark: '#FFFFFF', onDark2: '#B4AFA9', onDark3: '#8F8A84', waDark: '#86CFA6'
  };
  const ICON = { 'Full renovation': 'home', 'Kitchen': 'tools-kitchen-2', 'Bathroom': 'bath', 'Wardrobes': 'hanger', 'Painting': 'paint', 'Waterproofing': 'droplet',
    'Flooring': 'layout-grid', 'False ceiling': 'layers-subtract', 'Doors and windows': 'door', 'Carpentry': 'hammer', 'Carpentry & wardrobes': 'hammer', 'Electrical': 'bolt', 'Home repairs': 'tool' };
  const DESC = { 'Full renovation': 'Whole home', 'Kitchen': 'New modular kitchen or renovation', 'Bathroom': 'Retiling, fittings or full renovation', 'Wardrobes': 'Wardrobes and storage',
    'Painting': 'Interior painting', 'Waterproofing': 'Seepage and leak repair', 'Flooring': 'Tile, marble and wooden floors', 'False ceiling': 'Gypsum and POP ceilings',
    'Doors and windows': 'Repair or replacement', 'Carpentry': 'Wardrobes, TV units and woodwork', 'Carpentry & wardrobes': 'Wardrobes, TV units and woodwork', 'Electrical': 'Wiring, points and fittings', 'Home repairs': 'Small jobs around the home' };
  const IST = 'Asia/Kolkata';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---- date helpers (all in IST, independent of the device time zone)
  function istParts(date) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: IST, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false });
    const p = {}; f.formatToParts(date).forEach(x => { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: DAYS.indexOf(p.weekday) };
  }
  const fmtDate = p => p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
  const fmtTime = p => { const h12 = p.h % 12 || 12, ap = p.h < 12 ? 'am' : 'pm'; return h12 + ':' + String(p.min).padStart(2, '0') + ' ' + ap + ' IST'; };
  const fmtDay = p => DAYS[p.wd] + ' ' + p.d + ' ' + MONTHS[p.m - 1];
  function addMonths(p, n) { let m = p.m - 1 + n, y = p.y; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return { y, m: m + 1, d: p.d }; }
  const monthWord = p => (p.d <= 10 ? 'early ' : p.d < 20 ? 'mid ' : 'late ') + MONTHS[p.m - 1];
  function startWindow(choice, p) {
    const c = String(choice || '').toLowerCase();
    if (c.indexOf('this month') >= 0) return MONTHS[p.m - 1] + ' ' + p.y;
    if (c.indexOf('1') >= 0 && c.indexOf('3') >= 0) { const a = addMonths(p, 1), b = addMonths(p, 3); return monthWord(a) + ' \u2013 ' + MONTHS[b.m - 1] + ' ' + b.y; }
    return null;
  }
  // 1 working day (Mon–Sat): the next day that is not a Sunday. Only used when the caller passes no replyBy.
  function nextWorkingDay(date) { const d = new Date(date.getTime()); do { d.setTime(d.getTime() + 864e5); } while (istParts(d).wd === 0); return d; }

  function formatPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    return ten.length === 10 ? '+91 ' + ten.slice(0, 5) + ' ' + ten.slice(5) : String(raw || '');
  }
  const nonLatin = t => /[^\u0000-\u024F\u2000-\u206F\u20B9\u2122\u00A0]/.test(String(t || ''));

  // ---- derive everything the page shows from the stored submission
  function derive(inp) {
    const when = inp.submittedAt ? new Date(inp.submittedAt) : new Date();
    const p = istParts(when);
    const reply = inp.replyBy ? new Date(inp.replyBy) : nextWorkingDay(when);
    const win = startWindow(inp.start, p);
    const list = (inp.services || []).map(s => String(s).trim()).filter(Boolean);
    const services = [];
    if (inp.fullRenovation) {
      services.push({ level: 0, name: 'Full renovation', sub: DESC['Full renovation'], icon: 'home-ink' });
      list.forEach(n => services.push({ level: 1, name: n, icon: (ICON[n] || 'tool') + '-grey' }));
    } else list.forEach(n => services.push({ level: 0, name: n, sub: DESC[n] || '', icon: (ICON[n] || 'tool') + '-ink' }));
    return {
      ref: inp.ref, sentDate: fmtDate(p), sentTime: fmtTime(p), replyBy: fmtDay(istParts(reply)),
      start: inp.start || '\u2014', startSub: win ? 'Approx. ' + win : (String(inp.start || '').toLowerCase().indexOf('explor') >= 0 ? 'No date yet' : null),
      name: inp.name ? String(inp.name).trim() : null, phone: formatPhone(inp.phone), location: String(inp.location || '').trim(),
      services, note: inp.note ? String(inp.note).trim() : null,
      steps: [
        { title: 'Received', detail: 'With the Builrode team now.', when: 'Done', done: true },
        { title: 'An engineer replies on WhatsApp', detail: 'We\u2019ll review your enquiry and message you from\u00A0the\u00A0number\u00A0below.', when: 'By ' + fmtDay(istParts(reply)), icon: 'brand-whatsapp-green' },
        { title: 'Free site visit, if you\u2019d like', detail: 'Measurements and photos, then an itemised quotation.', when: 'At a time we agree', icon: 'ruler-measure-grey' }
      ]
    };
  }

  // Non-Latin text (Hindi etc.) is drawn by the browser onto a canvas, so shaping is correct; the PDF gets an image per line group.
  const canvasFont = sizePx => sizePx + 'px Inter, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif';
  function canvasLines(text, widthPt, sizePt) {
    if (typeof document === 'undefined') return null;
    const S = 3, ctx = document.createElement('canvas').getContext('2d'); ctx.font = canvasFont(sizePt * S);
    const lines = []; let cur = '';
    String(text).split(/\s+/).forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= widthPt * S) cur = t; else { if (cur) lines.push(cur); cur = w; } });
    if (cur) lines.push(cur);
    return lines;
  }
  function canvasImage(lines, widthPt, sizePt, color, lineH) {
    const S = 3, c = document.createElement('canvas');
    c.width = Math.ceil(widthPt * S); c.height = Math.ceil(lineH * S * lines.length);
    const ctx = c.getContext('2d'); ctx.font = canvasFont(sizePt * S); ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => ctx.fillText(l, 0, Math.round((lineH * 0.78 + i * lineH) * S)));
    return c.toDataURL('image/png');
  }

  async function build(input, deps) {
    const jsPDF = deps.jsPDF, QRCode = deps.QRCode, A = deps.assets;
    const d = derive(input);
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    [['regular', 'Inter'], ['semibold', 'InterSemi'], ['display', 'Display']].forEach(([k, n]) => { doc.addFileToVFS(n + '.ttf', A.fonts[k]); doc.addFont(n + '.ttf', n, 'normal'); });
    doc.setProperties({ title: 'Builrode enquiry summary ' + d.ref, subject: 'Enquiry summary', author: 'Builrode Construction Pvt. Ltd.', creator: 'builrode.com summary ' + VERSION });
    doc.setLanguage('en-IN');
    const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (v / 255).toFixed(4)).join(' '); };

    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const M = 54, W = PW - 2 * M, R = M + W;
    const BAND = 210, SLIM = 44, ESS = 34;
    let lastMode = false;
    const limit = () => lastMode ? PH - BAND - 12 : PH - SLIM - 22 - (doc.getCurrentPageInfo().pageNumber === 1 ? ESS : 0);
    const wa = 'https://wa.me/' + BUSINESS_WA + '?text=' + encodeURIComponent('Hi, reference ' + d.ref);

    const fill = hex => doc.internal.write(rgb(hex) + ' rg');
    const stroke = hex => doc.internal.write(rgb(hex) + ' RG');
    const font = (n, s, c) => { doc.setFont(n, 'normal'); doc.setFontSize(s); doc.setTextColor(c); };
    const T = (s, x, y, o) => doc.text(s, x, y, o || {});
    const TR2 = (s, x, y) => doc.text(s, x - doc.getTextWidth(s), y);
    const bind = t => String(t).replace(/\b(Sector|Tower|Flat|Block|Plot|Floor|Phase|Pocket|Wing|Villa|House|No\.?)\s+(?=\S)/gi, '$1\u00A0').replace(/\+91\s/g, '+91\u00A0');
    const caps = (s, x, y, align, col) => { font('InterSemi', 8.5, col || C.grey); const cs = 0.8; const w = doc.getTextWidth(s) + cs * (s.length - 1); doc.text(s, align === 'right' ? x - w : x, y, { charSpace: cs }); return w; };
    const rule = (y, x1, x2, col, w) => { doc.setLineCap('butt'); doc.setLineWidth(w || 0.75); stroke(col || C.rule); doc.line(x1 === undefined ? M : x1, y, x2 === undefined ? R : x2, y); };
    const img = (n, x, y, s) => doc.addImage(A.images[n], 'PNG', x, y, s, s);
    const ringCheck = (cx, cy, r) => {
      doc.setLineWidth(1.25); stroke(C.text); doc.circle(cx, cy, r, 'S');
      doc.setLineCap('square'); doc.setLineJoin('miter'); doc.setLineWidth(1.5);
      const a = [cx - r * 0.40, cy + r * 0.02], b = [cx - r * 0.10, cy + r * 0.32], c = [cx + r * 0.42, cy - r * 0.26];
      doc.lines([[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]], a[0], a[1], [1, 1], 'S', false);
      doc.setLineCap('butt');
    };
    const ringIcon = (cx, cy, r, n, s) => { doc.setLineWidth(1); stroke(C.ring); doc.circle(cx, cy, r, 'S'); img(n, cx - s / 2, cy - s / 2, s); };
    // text that may be non-Latin: layout returns {kind, lines}; drawLines draws a slice of them
    const layout = (t, w, size, fontName) => {
      font(fontName || 'Inter', size, C.text);
      if (nonLatin(t)) { const ls = canvasLines(t, w, size); if (ls) return { kind: 'image', lines: ls }; }
      return { kind: 'text', lines: doc.splitTextToSize(t, w) };
    };
    const drawLines = (L, from, to, x, y, w, size, col, lh, fontName) => {
      const part = L.lines.slice(from, to); if (!part.length) return;
      if (L.kind === 'image') { doc.addImage(canvasImage(part, w, size, col, lh), 'PNG', x, y - size * 0.78, w, lh * part.length); return; }
      font(fontName || 'Inter', size, col); T(part, x, y, { lineHeightFactor: lh / size });
    };
    const textBlock = (t, x, y, w, size, col, lh, fontName) => { const L = layout(t, w, size, fontName); drawLines(L, 0, L.lines.length, x, y, w, size, col, lh, fontName); return L.lines.length; };
    // A phone number drawn as text is picked up by the iOS PDF viewer's data detector,
    // which offers to dial it and overrides the wa.me link annotation beneath. Drawing it
    // as artwork leaves nothing for the detector to find; the link annotation still works.
    const numberArt = (t, x, y, size, col, fontName) => {
      font(fontName || 'InterSemi', size, col);
      const fallback = doc.getTextWidth(t);
      if (typeof document === 'undefined') { T(t, x, y); return fallback; }
      try {
        const S = 4, px = size * S, spec = '600 ' + px + 'px Inter, system-ui, sans-serif';
        const c = document.createElement('canvas');
        let ctx = c.getContext('2d'); if (!ctx) { T(t, x, y); return fallback; }
        ctx.font = spec;
        const mw = Math.ceil(ctx.measureText(t).width) || Math.ceil(fallback * S);
        c.width = mw; c.height = Math.ceil(px * 1.32);
        ctx = c.getContext('2d'); ctx.font = spec; ctx.fillStyle = col; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t, 0, Math.round(px));
        const w = mw / S;
        doc.addImage(c.toDataURL('image/png'), 'PNG', x, y - size, w, c.height / S);
        return w;
      } catch (e) { T(t, x, y); return fallback; }
    };

    let y = 50;
    const header = compact => {
      const wmW = compact ? 96 : 136, wmH = wmW * 282 / 1600;
      doc.addImage(A.images['wordmark'], 'PNG', M, y, wmW, wmH);
      if (compact) { font('Inter', 10.5, C.grey); TR2('Enquiry summary  \u00B7  ' + d.ref, R, y + wmH); }
      else { const t = 'Enquiry summary', cs = -0.4; font('Display', 24, C.text); T(t, R - (doc.getTextWidth(t) + cs * (t.length - 1)), y + wmH, { charSpace: cs }); }
      y += wmH + 20;
    };
    const need = h => { if (y + h > limit()) { doc.addPage(); y = 50; header(true); } };
    const section = (title, minBody) => { need(36 + (minBody || 50)); rule(y); font('InterSemi', 14, C.text); T(title, M, y + 25); y += 36; };

    header(false);

    // Enquiry details
    rule(y); y += 16;
    const cw = W / 3, gap = 16;
    const rows = [
      [{ l: 'REFERENCE', v: d.ref, strong: true }, { l: 'SUBMITTED', v: d.sentDate, sub: d.sentTime }, { l: 'PREFERRED START', v: d.start, sub: d.startSub }],
      d.name ? [{ l: 'NAME', v: d.name }, { l: 'YOUR WHATSAPP', v: d.phone }, { l: 'HOME LOCATION', v: d.location }]
             : [{ l: 'YOUR WHATSAPP', v: d.phone }, { l: 'HOME LOCATION', v: d.location, span: 2 }]
    ];
    rows.forEach((row, ri) => {
      let x = M, bottom = 0;
      row.forEach(c => {
        const span = c.span || 1, w = cw * span - gap;
        caps(c.l, x, y + 8);
        const n = textBlock(bind(c.v), x, y + 26, w, c.strong ? 14 : 12.5, C.text, 15.5, c.strong ? 'InterSemi' : 'Inter');
        let last = y + 26 + 15.5 * (n - 1);
        if (c.sub) { font('Inter', 11, C.grey); last += 15; T(c.sub, x, last); }
        bottom = Math.max(bottom, last + 4); x += cw * span;
      });
      y = bottom + (ri === 0 ? 12 : 16);
    });

    // Services
    section('Services', 46);
    const hairline = (yy, x1) => rule(yy, x1, R, C.hair, 0.5);
    const focus = d.services.filter(x => x.level === 1), twoCol = focus.length > 3, colW = (W - 30) / 2;
    let lastFocus = false, col = 0;
    d.services.forEach((s, i) => {
      const next = d.services[i + 1];
      if (s.level === 0) {
        const h = s.sub ? 44 : 34; need(h + 44);
        img(s.icon, M, y + (s.sub ? 13 : 8), 18);
        font('InterSemi', 14, C.text); T(s.name, M + 30, y + (s.sub ? 19 : 21));
        if (s.sub) { font('Inter', 11, C.grey); T(s.sub, M + 30, y + 34.5); }
        if (next) hairline(y + h, M + 30);
        y += h;
        if (next && next.level === 1) { need(24 + 26); caps('FOCUS AREAS', M + 30, y + 17); y += 24; }
        lastFocus = false; col = 0;
      } else if (twoCol) {
        const h = 26; if (col === 0) need(h + 44);
        const x = M + 30 + col * colW;
        img(s.icon, x, y + 6, 14); font('Inter', 12.5, C.text); T(s.name, x + 22, y + 17);
        const rowEnds = col === 1 || !next || next.level !== 1;
        if (rowEnds) { if (next && next.level === 1) hairline(y + h, M + 52); y += h; col = 0; } else col = 1;
        lastFocus = true;
      } else {
        const h = 26; need(h + 44);
        img(s.icon, M + 30, y + 6, 14); font('Inter', 12.5, C.text); T(s.name, M + 52, y + 17);
        if (next && next.level === 1) hairline(y + h, M + 52);
        y += h; lastFocus = true;
      }
    });
    if (lastFocus) y += 12;
    if (d.note) {
      const nw = Math.min(W - 30, 420), lh = 16, L = layout(d.note, nw, 12.5);
      let idx = 0, first = true;
      while (idx < L.lines.length) {
        const left = L.lines.length - idx;
        let n = Math.floor((limit() - y - 30) / lh);            // lines that fit under the label on this page
        if (n < Math.min(3, left)) { doc.addPage(); y = 50; header(true); continue; }
        n = Math.min(n, left);
        if (left - n > 0 && left - n < 3) n = Math.max(3, left - 3);   // never strand one or two lines on the next page
        if (first) { rule(y, M + 30, R, C.hair, 0.5); img('quote-grey', M + 1, y + 12, 16); }
        caps(first ? 'IN YOUR WORDS' : 'IN YOUR WORDS (CONTINUED)', M + 30, y + 20);
        drawLines(L, idx, idx + n, M + 30, y + 37, nw, 12.5, C.text, lh);
        y += 30 + lh * (n - 1) + 16 + 8;
        idx += n; first = false;
      }
    }
    y += 10;

    // What happens next — kept together, always on the last page above the full band
    font('Inter', 11, C.grey);
    const stepsH = d.steps.reduce((a, s) => a + 29 + 14 * (doc.splitTextToSize(s.detail, W - 30 - 130 - 16).length - 1) + 12, 0);
    if (y + 36 + stepsH > PH - BAND - 12) { doc.addPage(); y = 50; header(true); }
    lastMode = true;
    section('What happens next', 60);
    const whenW = 130, tw = W - 30 - whenW - 16, cx = M + 10, r = 10, marks = [];
    d.steps.forEach(s => {
      font('Inter', 11, C.grey);
      const lines = doc.splitTextToSize(s.detail, tw), h = 29 + 14 * (lines.length - 1) + 12;
      need(h);
      const cy = y + 9.5;
      if (s.done) ringCheck(cx, cy, r); else ringIcon(cx, cy, r, s.icon, 13);
      marks.push({ cy, page: doc.getCurrentPageInfo().pageNumber });
      font('InterSemi', 12.5, C.text); T(s.title, M + 30, y + 14);
      font('Inter', 11, C.grey); T(lines, M + 30, y + 29, { lineHeightFactor: 14 / 11 });
      if (s.done) font('Inter', 12.5, C.grey); else font('InterSemi', 12.5, C.text);
      T(s.when, R, y + 14, { align: 'right' });
      y += h;
    });
    for (let i = 0; i < marks.length - 1; i++) {
      if (marks[i].page !== marks[i + 1].page) continue;
      doc.setPage(marks[i].page); doc.setLineWidth(0.75); stroke(C.hair); doc.line(cx, marks[i].cy + r + 4, cx, marks[i + 1].cy - r - 4);
    }
    doc.setPage(doc.getNumberOfPages());
    y += 12;

    // Closing band
    const pages = doc.getNumberOfPages();
    const qr = await QRCode.toDataURL(wa, { margin: 0, scale: 12, errorCorrectionLevel: 'M', color: { dark: C.text + 'FF', light: '#FFFFFFFF' } });
    const fine = (x0, xr, yb, pageLabel) => {
      font('Inter', 9, C.onDark2);
      T('Builrode Construction Pvt. Ltd.  \u00B7  CIN U41000UP2024PTC205144', x0, yb);
      T('Office: Regus, Starling Edge, Plot\u00A0A, Sector\u00A0104, Noida, Uttar Pradesh \u2013 201301.', x0, yb + 12);
      T('This summary records your enquiry. It is not a quotation.', x0, yb + 24);
      font('Inter', 9, C.onDark);
      [['builrode.com', 'https://builrode.com', 0], ['projects@builrode.com', 'mailto:projects@builrode.com', 12]].forEach(([t, url, dy]) => {
        const w = doc.getTextWidth(t); T(t, xr - w, yb + dy); doc.link(xr - w - 6, yb + dy - 9, w + 12, 13, { url });
      });
      if (pageLabel) { font('Inter', 9, C.onDark2); TR2(pageLabel, xr, yb + 24); }
    };
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      const last = p === pages, bh = last ? BAND : SLIM, top = PH - bh;
      fill(C.band); doc.rect(0, top, PW, bh, 'F');
      if (!last) {
        font('Inter', 9, C.onDark2); T('Builrode Construction Pvt. Ltd.  \u00B7  CIN U41000UP2024PTC205144  \u00B7  Enquiry summary ' + d.ref, M, top + 26);
        TR2(p + ' / ' + pages, R, top + 26);
        if (p === 1) {
          const ey = top - 16; rule(ey - 22, M, R, C.rule);
          font('Inter', 11, C.grey); T('Engineer\u2019s reply by ', M, ey); let ex = M + doc.getTextWidth('Engineer\u2019s reply by ');
          font('InterSemi', 11, C.text); T(d.replyBy, ex, ey); ex += doc.getTextWidth(d.replyBy);
          font('Inter', 11, C.grey); T('  \u00B7  WhatsApp ', ex, ey); ex += doc.getTextWidth('  \u00B7  WhatsApp ');
          const nw = numberArt(BUSINESS_WA_TEXT, ex, ey, 11, C.green);
          doc.link(ex - 8, ey - 14, nw + 16, 20, { url: wa });
        }
        continue;
      }
      const r1 = top + 24;
      caps('QUESTIONS?', M, r1 + 8, null, C.onDark3);
      font('Inter', 11, C.onDark); T('Message us on WhatsApp and quote your reference.', M, r1 + 27);
      const ny = r1 + 49;
      img('brand-whatsapp-mint', M, ny - 11, 14);
      numberArt(BUSINESS_WA_TEXT, M + 19, ny, 12.5, C.waDark);
      font('Inter', 10, C.onDark2); T('Save it so you know it\u2019s us.', M, ny + 15);
      T('No payment until you approve an itemised quotation.', M, ny + 35);
      doc.link(M - 10, r1 - 4, 330, ny + 35 - r1 + 12, { url: wa });
      const ts = 66, qs = 52, tx = R - ts, ty = r1 - 2;
      fill(C.white); doc.roundedRect(tx, ty, ts, ts, 8, 8, 'F');
      doc.addImage(qr, 'PNG', tx + (ts - qs) / 2, ty + (ts - qs) / 2, qs, qs); doc.link(tx - 8, ty - 8, ts + 16, ts + 16, { url: wa });
      font('Inter', 9, C.onDark2); TR2('Scan to chat on WhatsApp.', R, ty + ts + 13);
      const dv = r1 + 98;
      doc.setLineWidth(0.75); stroke(C.bandRule); doc.line(M, dv, R, dv);
      const wmW = 84, wmH = wmW * 282 / 1600;
      doc.addImage(A.images['wordmark-white'], 'PNG', M, dv + 14, wmW, wmH);
      font('Inter', 11, C.onDark); TR2('Thank you for your enquiry.', R, dv + 14 + wmH - 3);
      fine(M, R, dv + 14 + wmH + 18, pages > 1 ? p + ' / ' + pages : null);
    }
    const filename = 'Builrode-' + d.ref + '.pdf';
    const out = { pages, filename, derived: d, version: VERSION };
    out.buffer = doc.output('arraybuffer');
    if (typeof window !== 'undefined' && typeof Blob !== 'undefined') out.blob = doc.output('blob');
    return out;
  }

  // Browser convenience: loads jsPDF, the QR library and the asset bundle, then builds and shares/downloads.
  async function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
  const assetsCache = {};
  async function ready(cfg) {
    cfg = cfg || {};
    if (!window.jspdf) await loadScript(cfg.jspdf || 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.QRCode || !window.QRCode.toDataURL) await loadScript(cfg.qrcode || 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js');
    const url = cfg.assets; if (!assetsCache[url]) assetsCache[url] = fetch(url).then(r => { if (!r.ok) throw new Error('assets ' + r.status); return r.json(); });
    return { jsPDF: window.jspdf.jsPDF, QRCode: window.QRCode, assets: await assetsCache[url] };
  }
  async function save(input, cfg) {
    const deps = await ready(cfg);
    const out = await build(input, deps);
    const file = new File([out.blob], out.filename, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: out.filename }); return out; } catch (e) { if (e && e.name === 'AbortError') return out; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(out.blob); a.download = out.filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return out;
  }
  return { VERSION, derive, build, ready, save, formatPhone, startWindow };
});
