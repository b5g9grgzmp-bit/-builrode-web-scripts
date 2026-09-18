# Review controller 2.3.0 - Webflow handoff

Controller: `builrode-project.js` / `window.BuilrodeProject`.
Base: `1de7dc95c4a0e39529849292e997e6b2094fbeb1` (2.2.0).
Scope: controller and automated tests only. Webflow page edits and staging publication
are a separate delivery. Production publication requires the existing explicit approval.

## Integrity

Expected SHA-384 SRI of `builrode-project.js`:

```text
sha384-6DfDuA180f6brA8RQgHE4cNi6IIjVJw1udSrdcATTZOY1KmsUVJ+lPf7HR11pmlw
```

SHA-256: `e4025fb97b81df936a23476af5a6bf05ab18bdc2e44656f044f374bc219d5d78`.

Use the full release commit SHA in the jsDelivr URL; never use a moving branch URL.
Compare the served bytes against this hash before registering the Webflow script.
Use `integrity` with `crossorigin="anonymous"` on the external script.

## Feature gate and deployment order

The presence of a textarea `#rv-desc` **inside `#bhReview` at initialisation** enables
the inline path. Without it, the legacy 2.2.0 editor behaviour remains active, including
its old trimming, save/cancel workflow and empty-state rendering. Markup changes take
effect on the next page load; this release does not hot-switch modes after initialisation.

1. Snapshot the Review page markup, scoped CSS, helper code and current script assignment.
2. Register 2.3.0 at its immutable commit with the verified SRI. Apply it to Review only.
   Publish **staging only** while the legacy page markup is still present. Verify the
   old editor, validation and submission path before making the page changes.
3. Add the new inline block and its styles, update the helpers described below, and
   retire the old editor UI on staging. Reload the page and run the inline acceptance
   checks against actual Webflow storage.
4. Home remains on 2.2.0 in this release. The controller also supports Home without new
   markup, but moving its pin is a separate change.

The 2.2.0 dock renderer and effects are byte-identical. Do not change `pddock`, `thdock`
or `v31dockcss` companion scripts for this release.

## Markup contract

The textarea stays in the project card, **outside the native Webflow form**, with no
`name` or `form` attribute. The controller submits through the single existing hidden
`heroText` input. Do not create a second `description` field.

```html
<div class="rv-block" data-r="text">
  <div class="rvc-dhead">
    <label class="rv-lab" for="rv-desc">Tell us what you'd like done</label>
    <span class="rvc-dopt" data-r="desc-optional">Optional</span>
  </div>
  <p class="rvc-dhelp" id="rv-desc-help">A sentence or two helps our engineer understand the work.</p>
  <textarea id="rv-desc" class="rvc-dta" data-r="desc"
    aria-describedby="rv-desc-help" rows="3" maxlength="1000"
    autocapitalize="sentences" autocorrect="on" spellcheck="true"></textarea>
  <p class="rvc-derr" id="rv-desc-error" data-r="desc-error" hidden></p>
  <p class="rvc-dnote">You can share photos later on WhatsApp.</p>
</div>
```

Use the agreed charcoal card, existing type/spacing, 16px field text and hairline.
Interface copy is English; the textarea accepts any script. No prompt chips or minimum
length beyond non-whitespace text. The controller supplies placeholders and validation
copy, maintains the Optional badge and uses the existing live region for one announcement.

## Webflow helper changes

- Update empty-mode CSS and the `data-bpe` helper so an empty Review still exposes the
  project card, add-service control, description and normal enquiry form. Remove the
  conflicting redirect-only empty panel. Preserve explicit Start over behaviour.
- Remove the completion helper's old editor/save/cancel assumptions and update its
  focus target to `#rv-desc`. Preserve contact checks and security-state messaging.
- Update **RVX-SEND 2.2** to include project completeness in its missing-details list.
  Wait for `BuilrodeProject`, then use the same state rule as the controller:

```js
var needsProject = window.BuilrodeProject.derive().isEmpty;
// If true, include "Add a service or describe the work" in the missing-details
// presentation and use #rv-desc as its focus target.
```

  Equivalently, presence is `state.fullRenovation || state.services.length > 0 ||
  state.heroText.trim().length > 0`. Full renovation needs no focus areas. Suggestions
  alone do not count. Subscribe the helper's render function through
  `BuilrodeProject.subscribe(...)` so typing and service changes update it immediately.
  Also avoid a ready indication for a restored description longer than 1000 UTF-16 code
  units. The existing textarea limit and controller length validation still apply.

  The missing-details cue is neutral guidance; keep the description's error treatment
  hidden until a send attempt. Keep Send usable so the controller can explain errors.
  Do not override the native in-flight or security disabled state.

## Controller guarantees and compatibility

- Inline state is saved immediately on input. The current textarea value is flushed
  before validation and serialisation, and on blur/pagehide while editable.
- Raw spaces, line breaks, emoji and other scripts stay in `heroText` unchanged.
  Trimming is used for the presence check, not inline storage or submission.
- Service changes preserve the textarea node, value and caret. IME composition avoids
  a renderer rewrite, and completion commits the final value.
- A pending native request locks the textarea read-only. The watchdog does not unlock
  an unresolved request; confirmed failure restores editing. Receipt still requires
  Webflow's success block, not form hiding.
- Confirmed success and Start over discard stale text without resurrecting the project.
- A back-cache return reloads newer shared project state, so Home service changes are
  not overwritten by the cached Review. Unavailable storage retains the in-memory draft.
- Schema 1, `bh_project`, the 14-day expiry and the single `heroText` form field remain.
  Locality, timing and contact details are not added to persistent project storage.

## Rollback compatibility

| Script | Markup | Result |
|---|---|---|
| 2.3.0 | Legacy editor | Supported fallback |
| 2.3.0 | Inline textarea | Supported inline flow |
| 2.1.3 / 2.2.0 | Legacy editor | Original flow |
| 2.1.3 / 2.2.0 | Inline-only markup | Unsupported: old scripts do not bind the inline field |

The safe rollback after the page migration is **restore the legacy page bundle first**
while keeping 2.3.0, reload and verify the fallback, then optionally restore the old
controller pin. Before the markup migration, the script pin can be reverted by itself.
Feature detection in the new script does not make an old script understand new markup.

## Verification

Run `npm ci --ignore-scripts` and `npm test` (Node 18 or newer).

**28 automated DOM integration tests pass.** These cover both markup paths, the project
validation combinations, Unicode and canonical-field mapping, fast sends, persistence,
selection/IME behaviour, a simulated pending/failure/success lifecycle, reset behaviour,
Home compatibility and exact preservation of the 2.2.0 dock code.

Native Webflow transport is simulated in these tests. They do **not** establish live
Turnstile behaviour, actual stored Webflow records, real mobile keyboard behaviour or
the page helper/CSS integration. Complete the agreed staging acceptance pass and retain
record references and mobile screenshots before production approval.
