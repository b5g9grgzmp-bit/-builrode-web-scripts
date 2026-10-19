# builrode-project.js 2.3.1 — 19 Oct 2026

Service taxonomy update on the 2.3.0 Review line; the same change as 2.2.1 on the homepage line.

- New services: New flat interiors, Wall panels, Plumbing (split out of Home repairs).
- Carpentry renamed to TV units and woodwork; projects saved under the old name are converted on load.
- SCHEMA stays 1. Nothing else changes from 2.3.0.

Pages: Review runs 2.3.1, the homepage runs 2.2.1. Both must go live together with the Designer data-k switch.

Rollback: re-pin 2.3.0 @ faf3d8d6 on Review and 2.2.0 @ 1de7dc95 on the homepage, and restore the Carpentry data-k values.

Tests: `npm test` (28 pass).
