# Phase 0 — Unblock indexing (builrode.com)

Status as of 24 Nov 2026. Site ID `6829d394c35528c6ea9acabf`, last full publish 23 Nov 2026.

## Correction to the earlier finding
The "homepage is noindex" finding is withdrawn. The `noindex, nofollow` tag sits inside the Cloudflare Turnstile challenge document that the contact form embeds, not in the page `<head>`. The home page's head and the site-wide head custom code contain no robots directive. The homepage is indexable.

## Done from here (staged, goes live on next publish)
- 12 draft/internal pages removed from the sitemap: design-lab, contact-v2, contact-v3, about-v3, about-v1, home-v3, home-v2, untitled, internal/licenses, internal/changelog, internal/documentation, internal/style-guide.

## Needs the Webflow UI (site is not on an Enterprise plan, so these are not API-accessible)

1. **Turn the sitemap on.** Site settings → SEO → Sitemap → "Auto-generate sitemap" = Yes. `/sitemap.xml` currently returns 404 on www.builrode.com and on the webflow.io staging domain.
2. **Set the global canonical.** Same screen → "Global canonical tag URL" = `https://www.builrode.com`. No page has a canonical today; Google has indexed `/?src=stickybar` as a separate URL.
3. **Add the 301 redirects** in Site settings → Publishing → 301 redirects. Full list in `audit/redirects.csv` (39 rows). The six that matter most:

   | Old path | New path |
   |---|---|
   | /discipline/renovation | /discipline/home-renovation |
   | /discipline/interior-finishing | /discipline/home-interiors |
   | /project/sandstone-luxe | /ideas |
   | /photo-diagnosis | /sub-service/waterproofing-seepage-repair |
   | /internal/documentation | / |
   | /internal/(.*) | / |

   Do not add a wildcard on `/project/(.*)` or `/article/(.*)`: Webflow evaluates redirects before pages, so it would hijack the real project and article pages once they are published.
4. **Confirm the default domain** is `www.builrode.com` (Site settings → Publishing → Custom domains → "Default"). Both `builrode.com` and `www.builrode.com` are connected; one must redirect to the other.
5. **Check robots.txt** in a browser at `https://www.builrode.com/robots.txt`. It should be the Webflow default with no `Disallow: /`. Automated fetchers could not read it from here.
6. **Publish** to all domains after steps 1–4.
7. **Search Console**: submit `https://www.builrode.com/sitemap.xml`, request indexing for `/`, `/services`, the three discipline pages and `/ideas`.

## Contact form: finish in the Designer before publishing (about 2 minutes)
Already staged by API (24 Nov): contact button now "↳ Get free quote" with "Sending…" while loading; homepage label "Location" renamed to "Society or sector".

Also staged (24 Nov), contact address section, using existing theme classes only:
- Intro sentence moved under the "Reach us" heading (`hub__lead` + `text-paragraph --c1-80`, the same pattern as the Ideas page).
- Address card is full width on tablet and phone (`contact-v1__info` max-width removed at the tablet breakpoint; desktop unchanged).
- Render image in the card hidden (visibility off, not deleted). Switch it back on, or swap in a real office photo, in the Designer.
- Phone number is now a tap-to-call link, plus a "Get directions" link to Google Maps (new tab), both in the theme's `contact-v1__link` style.

The API cannot do these two; open the Contact page in the Designer:
1. **Remove "Example Text".** Select each of the 4 fields (Full name, Mobile number, Society or sector, Message) → Element settings (gear icon) → clear the **Placeholder** box. Leave it empty, as on the homepage form.
2. **Put Mobile and Society side by side.** Select the "Society or sector" block (class `form__item`) → Style panel → Grid child → set column span back to **1** (or Auto). It currently spans the full row.

## Content decisions needed before publish (flagged, not changed)
- **/projects is live with zero published projects.** The three real projects (Marigold House, Blue Tile House, Ella Vale House) are drafts; the 12 published items are archived Fusca template projects. Either publish the three projects or set the Projects page to draft until they are ready.
- **Homepage links to a draft article.** `/article/compare-flat-renovation-quotes-noida` is staged as draft but still live from the 23 Nov publish. The next publish will 404 it. Set it back to published or remove the link.
- **Template leftovers still in the CMS**: 4 archived disciplines, 12 archived projects, 5 archived markets, 9 draft Fusca articles. Archived items are not published, but deleting them keeps the collections clean and avoids accidental republishing.

## Inventory summary (`audit/inventory.csv`)

| Type | Live URLs | Notes |
|---|---|---|
| Static pages | 8 | /projects and /privacy-policy have no meta description |
| Disciplines (services) | 3 | Template has no description field |
| Sub-services | 26 | Template description = `lead-line`, which is empty on 25 of 26 |
| Ideas | 40 | Captions present on all 40 |
| Articles | 1 | Template title has no brand suffix; no description field exists |
| Topics | 3 | Thin listing pages |
| Markets | 1 | Thin listing page |
| **Total** | **82** | |

Phase 1 (full crawl of these 82 URLs) can start as soon as the publish in step 6 is done, so the crawl reflects the new sitemap and canonicals.
