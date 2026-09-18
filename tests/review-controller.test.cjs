'use strict';
// DOM integration tests. Native Webflow transport is simulated; staging capture
// and mobile/IME keyboard checks remain separate release gates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const source = readFileSync(require('node:path').join(__dirname, '../builrode-project.js'), 'utf8');
const raw = '  नमस्ते, kitchen repair chahiye 👩‍🔧\nदूसरी पंक्ति — tiles replace karne hain.  ';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function markup(inline = true) {
  return `<div id="bhReview"><div class="rvc-proj">
    <div data-r="empty">Empty</div>
    <div data-r="text">${inline ? `<label for="rv-desc">Tell us what you'd like done</label>
      <span data-r="desc-optional">Optional</span><p id="rv-desc-help">A sentence or two helps our engineer understand the work.</p>
      <textarea id="rv-desc" data-r="desc" maxlength="1000" aria-describedby="rv-desc-help"></textarea>
      <p id="rv-desc-error" data-r="desc-error" hidden></p>` : '<span data-r="quote"></span><button data-r="edit">Edit</button>'}</div>
    <div data-r="list"><div data-r="row" data-k="Bathroom">Bathroom</div></div>
    <div data-r="full">Full renovation<div data-r="focus"><span data-k="Bathroom">Bathroom</span></div><span data-r="focus-empty"></span></div>
    <div data-r="suggest"><button data-r="suggestion" data-k="Bathroom">Suggestion</button></div>
    <button data-r="addrow" data-k="Bathroom">Add bathroom</button>
    <button data-r="remove" data-k="Bathroom">Remove bathroom</button>
    <button data-r="accept" data-k="Bathroom">Accept bathroom</button>
    <button data-r="startover">Start over</button></div>
    ${inline ? '' : '<div data-r="editor"><textarea data-r="edit-text"></textarea><button data-r="edit-save">Save</button><button data-r="edit-cancel">Cancel</button></div>'}
    <div data-r="form"><div class="w-form"><form>
      <input name="locality"><input name="whatsapp"><input name="website">
      <button type="button" data-r="start" data-v="soon">Soon</button>
      <input type="submit" value="Send" data-wait="Sending"><div data-r="error"></div>
    </form><div class="w-form-done" style="display:none"></div><div class="w-form-fail" style="display:none"></div></div></div>
    <a data-r="fallback"></a><div data-r="success"><h2 data-r="success-title">Received</h2><span data-r="rc-text"></span></div>
  </div>`;
}

async function boot(t, { inline = true, stored, home = false, unavailableStorage = false, html } = {}) {
  const dom = new JSDOM(html || (home ? '<div id="bhBar"></div>' : markup(inline)), {
    url: 'https://builrodes-supercool-site.webflow.io/' + (home ? '' : 'review'),
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, sent = [], errors = [];
  w.addEventListener('error', e => errors.push(e.error));
  t.after(() => assert.deepEqual(errors, []));
  if (stored) w.localStorage.setItem('bh_project', stored);
  if (unavailableStorage) Object.defineProperty(w, 'localStorage', { value: { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() {} } });
  w.Webflow = { require: name => name === 'forms' ? {} : null };
  d.addEventListener('submit', e => {
    if (!e.defaultPrevented) {
      sent.push(Array.from(new w.FormData(e.target).entries()));
      e.preventDefault();
    }
  });
  let watchdog;
  const timeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms, ...args) => {
    if (ms === 20000) watchdog = fn;
    return timeout(fn, ms, ...args);
  };
  w.eval(source);
  await tick();
  const q = s => d.querySelector(s), api = w.BuilrodeProject;
  assert.equal(api.version, '2.3.0');
  function type(value) { q('#rv-desc').value = value; q('#rv-desc').dispatchEvent(new w.Event('input', { bubbles: true })); }
  function details() {
    q('[name=locality]').value = 'Noida Sector 74';
    q('[name=whatsapp]').value = '9000000000';
    q('[data-r=start]').click();
  }
  function submit() { q('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
  function persistedShow() { const e = new w.Event('pageshow'); Object.defineProperty(e, 'persisted', { value: true }); w.dispatchEvent(e); }
  return { w, d, q, api, sent, type, details, submit, persistedShow, watchdog: () => watchdog(), stored: () => w.localStorage.getItem('bh_project'), fields: () => Object.fromEntries(sent.at(-1) || []) };
}

test('2.2.0 dock renderer and effects remain byte-identical', () => {
  const block = source.slice(source.indexOf('  var dock = {'), source.indexOf('  var review = {'));
  assert.equal(createHash('sha256').update(block).digest('hex'), 'beb700b8fb99063e526fffc7e151861946e6cae4274eda113e2446905fa67d1d');
});

test('empty inline Review shows the textarea/form and no premature error or dock', async t => {
  const p = await boot(t);
  assert.notEqual(p.q('[data-r=text]').style.display, 'none');
  assert.notEqual(p.q('[data-r=form]').style.display, 'none');
  assert.equal(p.q('[data-r=empty]').style.display, 'none');
  assert.equal(p.q('[data-r=desc-error]').hidden, true);
  assert.equal(p.q('[data-r=desc-optional]').hidden, true);
  assert.equal(p.q('#bhBar'), null);
  assert.equal(p.q('#rv-desc').form, null);
  assert.equal(p.q('#rv-desc').hasAttribute('name'), false);
});

for (const [name, choose, description] of [
  ['service only', p => p.api.addService('Bathroom'), ''],
  ['description only', () => {}, 'hi'],
  ['both', p => p.api.addService('Bathroom'), 'Replace tiles'],
  ['Full renovation without focus areas', p => p.api.setFull(true), ''],
  ['one Devanagari character', () => {}, 'क']
]) test(`${name} passes the project rule`, async t => {
  const p = await boot(t); p.details(); choose(p); p.type(description); p.submit();
  assert.equal(p.sent.length, 1);
  assert.equal(p.fields().heroText, description);
  assert.equal(p.fields().controller, '2.3.0');
  if (name.startsWith('Full')) { assert.equal(p.fields().fullRenovation, 'true'); assert.equal(p.fields().focusAreas, ''); }
});

for (const value of ['', ' \n\t ']) test(`empty/whitespace project blocks: ${JSON.stringify(value)}`, async t => {
  const p = await boot(t); p.details(); p.type(value); p.submit();
  assert.equal(p.sent.length, 0);
  assert.equal(p.q('[data-r=desc-error]').hidden, false);
  assert.equal(p.q('#rv-desc').getAttribute('aria-invalid'), 'true');
  assert.equal(p.d.activeElement, p.q('#rv-desc'));
  assert.match(p.q('#rv-desc').getAttribute('aria-describedby'), /rv-desc-help.*rv-desc-error/);
  p.type('hi');
  assert.equal(p.q('[data-r=desc-error]').hidden, true);
  assert.equal(p.q('#rv-desc').getAttribute('aria-describedby'), 'rv-desc-help');
  assert.equal(p.q('#rv-desc').hasAttribute('aria-invalid'), false);
});

test('a service clears a prior project error; DOM suggestion rows alone do not qualify', async t => {
  const p = await boot(t); p.details(); p.q('[data-r=suggest]').style.display = ''; p.submit();
  assert.equal(p.sent.length, 0);
  p.q('[data-r=accept]').click();
  assert.equal(p.q('[data-r=desc-error]').hidden, true);
  assert.equal(p.q('[data-r=desc-optional]').hidden, false);
  p.submit(); assert.equal(p.sent.length, 1);
  assert.equal(p.fields().acceptedSuggestions, 'Bathroom');
});

test('Unicode, spaces, ZWJ and newline reach the single canonical field unchanged', async t => {
  const p = await boot(t); p.details(); p.type(raw);
  assert.equal(p.api.get().heroText, raw);
  assert.equal(JSON.parse(p.stored()).heroText, raw);
  p.submit(); assert.equal(p.fields().heroText, raw);
  assert.equal(p.sent[0].filter(([key]) => key === 'heroText').length, 1);
  assert.equal(p.sent[0].some(([key]) => key === 'description'), false);
  assert.equal(p.api.get().locality, undefined);
  assert.equal(JSON.parse(p.stored()).whatsapp, undefined);
});

test('submit flushes the current DOM value even before an input event', async t => {
  const p = await boot(t); p.details(); p.type('First');
  p.q('#rv-desc').value = 'First, plus the last keystrokes'; p.submit();
  assert.equal(p.fields().heroText, 'First, plus the last keystrokes');
});

test('selection changes preserve raw text, node identity and caret', async t => {
  const p = await boot(t); p.type(raw); const ta = p.q('#rv-desc');
  ta.focus(); ta.setSelectionRange(4, 4);
  p.api.addService('Bathroom'); p.api.removeService('Bathroom'); p.api.setFull(true); p.api.setFull(false);
  assert.equal(p.q('#rv-desc'), ta); assert.equal(ta.value, raw); assert.equal(ta.selectionStart, 4);
});

test('placeholder is empty-only, with Full renovation taking precedence', async t => {
  const p = await boot(t);
  assert.equal(p.q('#rv-desc').placeholder, 'Tell us what needs doing');
  p.api.addService('Bathroom'); assert.match(p.q('#rv-desc').placeholder, /bathroom tiles/);
  p.type('Custom work'); const old = p.q('#rv-desc').placeholder;
  p.api.setFull(true); assert.equal(p.q('#rv-desc').placeholder, old);
  p.type(''); assert.match(p.q('#rv-desc').placeholder, /Full renovation of a 3 BHK/);
  assert.equal(p.q('[data-r=desc-optional]').hidden, false);
  p.api.setFull(false); p.api.removeService('Bathroom'); assert.equal(p.q('[data-r=desc-optional]').hidden, true);
});

test('refresh restores description and services without persisting the contact draft', async t => {
  const p = await boot(t); p.details(); p.type(raw); p.api.addService('Bathroom');
  const restored = await boot(t, { stored: p.stored() });
  assert.equal(restored.q('#rv-desc').value, raw);
  assert.deepEqual(Array.from(restored.api.get().services), ['Bathroom']);
  assert.equal(restored.q('[name=locality]').value, '');
  assert.equal(restored.q('[name=whatsapp]').value, '');
  assert.equal(restored.q('[data-r=start]').getAttribute('aria-pressed'), 'false');
});

test('back-cache return reads newer Home choices instead of overwriting them', async t => {
  const p = await boot(t); p.type(raw);
  const next = p.api.get(); next.services = ['Bathroom'];
  p.w.localStorage.setItem('bh_project', JSON.stringify(next)); p.persistedShow();
  assert.deepEqual(Array.from(p.api.get().services), ['Bathroom']); assert.equal(p.q('#rv-desc').value, raw);
  p.w.localStorage.removeItem('bh_project'); p.persistedShow();
  assert.equal(p.q('#rv-desc').value, '');
  p.w.dispatchEvent(new p.w.Event('pagehide')); assert.equal(p.stored(), null);
});

test('storage-unavailable back-cache return retains the in-memory draft', async t => {
  const p = await boot(t, { unavailableStorage: true }); p.type(raw); p.persistedShow();
  assert.equal(p.q('#rv-desc').value, raw); assert.equal(p.api.get().heroText, raw);
});

test('composition is not rewritten by a service render, and final text is stored', async t => {
  const p = await boot(t); const ta = p.q('#rv-desc');
  ta.dispatchEvent(new p.w.CompositionEvent('compositionstart'));
  p.type('न'); p.api.addService('Bathroom'); assert.equal(ta.value, 'न');
  ta.value = 'नमस्ते'; ta.dispatchEvent(new p.w.CompositionEvent('compositionend'));
  assert.equal(p.api.get().heroText, 'नमस्ते');
});

test('over-limit text is preserved and blocked without truncation', async t => {
  const p = await boot(t); p.details(); p.api.addService('Bathroom'); p.type('x'.repeat(1001)); p.submit();
  assert.equal(p.sent.length, 0); assert.equal(p.api.get().heroText.length, 1001);
  assert.match(p.q('[data-r=desc-error]').textContent, /1,000/);
  p.type('x'.repeat(1000)); p.submit(); assert.equal(p.fields().heroText.length, 1000);
});

test('pending request and watchdog keep a stable read-only snapshot; failure unlocks retry', async t => {
  const p = await boot(t); p.details(); p.type(raw); p.submit(); const id = p.fields().leadId;
  assert.equal(p.q('#rv-desc').readOnly, true);
  p.watchdog(); assert.equal(p.q('#rv-desc').readOnly, true);
  p.submit(); assert.equal(p.sent.length, 1);
  p.q('[data-r=addrow]').click(); assert.equal(p.api.get().services.length, 0);
  p.q('.w-form-fail').style.display = 'block'; await tick();
  assert.equal(p.q('#rv-desc').readOnly, false); assert.equal(p.q('#rv-desc').value, raw);
  p.type(raw + '!'); p.submit();
  assert.equal(p.sent.length, 2); assert.equal(p.fields().leadId, id); assert.equal(p.fields().heroText, raw + '!');
});

test('receipt requires native success; form hiding is not success and cleared text cannot return', async t => {
  const p = await boot(t); p.details(); p.type(raw); p.submit();
  p.q('form').style.display = 'none'; await tick();
  assert.notEqual(p.q('#bhReview').getAttribute('data-mode'), 'submitted');
  p.q('.w-form-done').style.display = 'block'; await tick();
  assert.equal(p.q('#bhReview').getAttribute('data-mode'), 'submitted');
  assert.equal(p.q('#rv-desc').value, ''); assert.equal(p.stored(), null);
  p.q('#rv-desc').dispatchEvent(new p.w.Event('blur')); p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(p.stored(), null); assert.equal(p.sent.length, 1);
  assert.match(p.q('[data-r=rc-text]').textContent, /नमस्ते/);
});

test('explicit clear discards composing text and pagehide cannot resurrect it', async t => {
  const p = await boot(t); p.type(raw);
  p.q('#rv-desc').dispatchEvent(new p.w.CompositionEvent('compositionstart'));
  p.api.clear(); p.q('#rv-desc').dispatchEvent(new p.w.CompositionEvent('compositionend'));
  p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(p.q('#rv-desc').value, ''); assert.equal(p.stored(), null);
});

test('confirmed Start over clears inline text and contact draft', async t => {
  const p = await boot(t); p.details(); p.type(raw);
  const button = p.q('[data-r=startover]'); button.click();
  const now = p.w.Date.now(); p.w.Date.now = () => now + 500;
  button.click(); p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(p.q('#rv-desc').value, ''); assert.equal(p.stored(), null);
  assert.equal(p.q('[name=locality]').value, '');
  assert.equal(p.q('[name=whatsapp]').value, '');
});

test('feature gate ignores an identically named element outside Review', async t => {
  const p = await boot(t, { html: '<textarea id="rv-desc"></textarea>' + markup(false) });
  assert.equal(p.q('[data-r=form]').style.display, 'none');
  p.api.setHeroText('  legacy  '); assert.equal(p.api.get().heroText, 'legacy');
});

test('pagehide flushes the current value before navigation', async t => {
  const p = await boot(t); p.q('#rv-desc').value = raw; p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(JSON.parse(p.stored()).heroText, raw);
});

test('invalid contact details and honeypot still block submission', async t => {
  const p = await boot(t); p.type('hi'); p.submit(); assert.equal(p.sent.length, 0);
  p.details(); p.q('[name=whatsapp]').value = '123'; p.submit(); assert.equal(p.sent.length, 0);
  p.details(); p.q('[name=website]').value = 'bot'; p.submit(); assert.equal(p.sent.length, 0);
  assert.match(p.q('[data-r=error]').textContent, /Something went wrong/);
});

test('legacy Review retains hidden empty form, editor save/cancel and trimming', async t => {
  const p = await boot(t, { inline: false });
  assert.equal(p.q('[data-r=form]').style.display, 'none');
  p.api.addService('Bathroom'); p.q('[data-r=edit]').click();
  p.q('[data-r=edit-text]').value = '  legacy description  '; p.q('[data-r=edit-save]').click();
  assert.equal(p.api.get().heroText, 'legacy description');
  p.q('[data-r=edit]').click(); p.q('[data-r=edit-text]').value = 'unsaved';
  p.details(); p.submit(); assert.equal(p.sent.length, 0);
  assert.match(p.q('[data-r=error]').textContent, /Save or cancel/);
  p.q('[data-r=edit-cancel]').click(); assert.equal(p.api.get().heroText, 'legacy description');
  p.submit(); assert.equal(p.sent.length, 1); assert.equal(p.fields().heroText, 'legacy description');
});

test('Home without inline markup retains legacy setter and dock behaviour', async t => {
  const p = await boot(t, { home: true }); p.api.setHeroText('  text  ');
  assert.equal(p.api.get().heroText, 'text');
  p.api.setFull(true); await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(p.q('#bhBar').getAttribute('data-state'), '4');
  assert.equal(p.q('.bhd-label').getAttribute('aria-label'), 'Show Full renovation');
  assert.equal(p.api.waContractOk(), true);
});
