# builrode-project.js 2.3.2 — 19 Oct 2026

Home interiors and an optional home type, on the 2.3.1 Review line; the same change as 2.2.2 on the homepage line.

- New flat interiors becomes Home interiors (the tick inside the Full renovation card). Projects saved under the old name are converted on load.
- Optional home type: Apartment, Villa, Independent house or Builder floor, chosen from `[data-ht]` buttons inside the Full renovation card on the homepage. Tapping the chosen type again clears it.
- Stored with the project as `homeType` (`''` when unset; an unknown stored value reads as `''`, the project is kept).
- Sent only while Full renovation or Home interiors is chosen: payload `home.homeType`, form field `homeType`, and the WhatsApp fallback and photos messages ("Home: Villa, Sector 74 Noida.").
- New API: `BuilrodeProject.setHomeType(type)`.
- SCHEMA stays 1. The 2.2.0 dock block is unchanged (hash test).

Pages: Review runs 2.3.2, every other page runs 2.2.2. Both go live together with the Designer data-k switch (New flat interiors → Home interiors on the homepage tile and the four Review elements), the home-type buttons, and the enquiry-summary PDF 1.0.4.

Rollback: re-pin 2.3.1 @ cc0da93e on Review and 2.2.1 @ 82d44db2 elsewhere, and restore the New flat interiors data-k values.

Tests: `npm test` (35 pass).
