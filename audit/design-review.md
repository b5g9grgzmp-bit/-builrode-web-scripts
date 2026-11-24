# Builrode.com design review

Date: 24 Nov 2026. Suggestions only. Nothing on the site was changed.

Scope: 10 live pages at desktop width (1440 px) and 3 pages at phone width (360 px), plus the Webflow colour tokens, uploaded fonts and the custom dock stylesheet in this repo.

Severity: **Critical** = visibly broken or unfinished, fix before sending traffic. **High** = hurts trust or conversion. **Medium** = polish and consistency.

---

## 1. Summary

The site has a strong base. The grid is calm, the copy is specific and honest, and the "Our promises, in writing" cards and the long-form article are well above the category norm. The main problems are unfinished template parts that are still visible, a colour system with too many accents, and imagery that undercuts the "run by engineers" trust message.

Top five, in order:

1. Remove every visible "No items found." block (4 places) and the "Example Text" placeholders on the contact form.
2. Replace the template social links in the menu, which point to the home pages of LinkedIn, X, YouTube and Instagram.
3. Reduce the accents to one. Blue buttons, pastel blue, terracotta, sage and WhatsApp green currently compete.
4. Make the homepage hero do its job: larger headline, a visible primary action, one line of proof.
5. Decide how AI-style renders are presented. Label them as concepts or replace them with real site photos.

---

## 2. Critical

| # | Finding | Where | Suggestion |
|---|---|---|---|
| C1 | "No items found." shown to visitors | Home "Featured projects", /projects, "Home Renovation highlights" on each service page | Hide each section when its list is empty (Webflow: conditional visibility on the section, or an empty-state design). Publish the 3 real projects to fill them. |
| C2 | Every field shows "Example Text" placeholder | /contact (all 4 fields) | Clear the placeholders, or use real hints: "e.g. Priya Sharma", "10-digit mobile", "e.g. ATS Greens, Sector 50". |
| C3 | Social links are template placeholders | Menu overlay: LinkedIn, X, YouTube, Instagram all go to the platform's home page | Link real profiles, or remove the block. |
| C4 | Idea photos are not clickable, and idea pages return 404 | /ideas grid; tested /ideas/a-u-shaped-kitchen-with-a-clear-middle | 40 ideas have good titles and captions in the CMS that no visitor or search engine can reach. Either link each tile to its page, or open a lightbox with title, caption and "Get this look" WhatsApp button. The home slider even shows a "View" pill on hover that goes nowhere. |
| C5 | "Additional services" repeats the main services | /discipline/home-renovation: Full home, Kitchen, Bathroom, Room appear in both rows | Filter the second row to the additional sub-services (Flooring, Painting, Waterproofing and so on), as the Services page already does. |

---

## 3. Brand and visual system

### Colour (High)
Current tokens and usage:

| Token | Value | Seen on |
|---|---|---|
| c1 / c2 | Black / white | Base, nav bar, footer |
| c3 | Bright blue | All "Get free quote" buttons, inline links, article category |
| c4 | Indigo #1C19AE | Not seen, likely unused |
| c5 | Pastel blue #C4DEE8 | Newsletter card, WhatsApp tile on service pages |
| c6 | Sage #9BAE9A | Not seen, likely unused |
| c7 | Terracotta #B5532F | "Something else? Ask us" tile |
| whatsapp | #25D366 | Floating button |
| (repo CSS) | Warm black #1A1614, warm grey #66615B | Project dock, not tokenised |

The blue is the template's default and is the only cool colour against warm wood-and-terracotta photography. It reads as generic SaaS rather than interiors.

Suggestion: one warm accent for all primary actions, chosen from the photography. Terracotta c7 already exists and has good contrast with white text. Keep black for secondary buttons, keep WhatsApp green only on the WhatsApp control, drop c4 and c6, and make c5 a neutral warm tint (for example a light sand) or remove it. Move the dock's warm black and grey into tokens so the dock and the site match.

### Typography (Medium)
- 20 font files are uploaded: Inter **and** Inter Tight, 5 weights each, with italics, all as TTF. The two families look nearly identical on screen. Use Inter Tight only, 3 weights (400, 500, 600), as WOFF2. This cuts download weight sharply.
- The homepage headline is the smallest H1 on the site (about 28 px), while every inner page uses a 70 px H1. The most important page has the weakest headline. Bring the home H1 up to the same scale or one step below.
- Small grey labels ("Services", "You receive", dates, form labels) are around 11 to 12 px in 40% black. See Accessibility.

### Imagery (High)
- Real photography (home hero, About hero, founders) is warm and credible.
- Most other images (Ideas grid, service pages, contact card, "Start with a site visit") look like AI renders: perfect light, identical styling, repeated motifs. For a brand whose message is "measured, priced, supervised by engineers", undisclosed renders weaken trust. The Ideas collection already has a "concept-render" field.
- Suggestion: show a small "Concept" chip on renders, and steadily replace them with real before-and-after site photos from Marigold, Blue Tile and Ella Vale houses. Real work beats perfect renders in this category.
- The kitchen sub-service hero image is soft and over-enlarged. Use a higher-resolution source.
- The red-and-green chair image at the bottom of /services does not match the rest of the palette or the subject.

### Layout and spacing (Medium)
- The newsletter and referral cards on Home and /news start 16 px from the edge while all other content sits on a 44 px margin. Align them to the grid.
- Home form section: the form uses the left 60% and the right 40% is empty. Use that space for "What happens next": 1. Engineer calls within one working day, 2. Site visit and measured drawing, 3. Itemised quotation.
- /services ends with an image on the left and a two-line paragraph floating far down on the right. Either give it a heading and CTA, or remove it.
- Slider arrows stay visible and active even when every item already fits (Additional services row). Hide arrows when there is nothing to scroll.

---

## 4. Page by page

| Page | What works | Suggestions |
|---|---|---|
| **Home** | Clear section rhythm; "What does your home need?" tiles; promise cards with "You receive" deliverables | Hero: larger H1, add a primary "Get free quote" or WhatsApp button next to "Call now" (the black pill is hard to see on the dark photo), add one proof line such as "Engineer-led · Itemised quotes · Noida". The three text-only service links duplicate the photo carousel below them; merge them or give each a one-line description. Hide "Featured projects" until projects are live. |
| **Services** | Clean two-column list of main and additional services | Add one line of description or a thumbnail per discipline. Add a short "How we price" or "How it works" band before the closing CTA. Fix the closing image block (see Layout). |
| **Discipline (service) pages** | Good intro copy; "Start with a site visit" block is a strong idea | Fix duplicated Additional services (C5). Hide empty "highlights". Give the black site-visit card a labelled button ("Book a site visit") instead of a bare arrow. The intro text column is narrow and grey; use full black at 17 to 18 px. |
| **Sub-service pages** (26) | Tidy facts table (Service, Quote, On site); clear "What's included" list | Add a CTA right after "What's included", not only at the footer. Add typical duration, a price-range guide or "what affects the price", 3 FAQs, and related ideas. The inline "Home Interiors" link is blue while other links are underlined black; pick one link style. |
| **Ideas** | Filter chips are clear; strong grid | C4 (tiles not clickable). Show the idea title under each photo. Header says "15 ideas" while 40 are published; check why 25 are filtered out. Add a CTA band after the grid ("Like a look? Send it on WhatsApp"). |
| **Projects** | Not applicable | Page is empty except one filter chip. Hide from navigation until at least 3 projects are published. |
| **About** | Best page on the site. Strong headline, real photo, honest copy, founder quote | Founder photos use different treatments (colour lifestyle vs black-and-white studio); shoot or edit them to match. The quote says "Director" while People says "Founder"; align titles. Add credentials (engineering degrees, DPIIT recognition, years, homes delivered) as a small stat row. |
| **Contact** | Large WhatsApp / Call / Email links are excellent on mobile | C2 placeholders. The mobile number field is half width on desktop while others are full. Add opening hours and a map link to the address card, and replace its render with an office or site photo. On mobile, the "Send us a note" intro appears after the form; move it above. Button says "Send my message" here but "Get free quote" elsewhere; use one label. |
| **Blog & Newsletter** | Card design matches home | Filter chips "News" and "Perspectives" lead to empty lists; hide unused topics. Two articles look thin on a full-width grid; until there are 6+, show them as a list. |
| **Article** | Excellent reading layout, "Test in brief" summary, jump links, real-life examples | Add an end-of-article CTA tied to the topic ("Get your kitchen drawing checked by an engineer"). Caption text is very small; raise to 13 to 14 px. |
| **Navigation** | Simple, consistent bar | All links are behind a hamburger even at 1440 px. Show Services, Ideas, About and Contact inline on desktop. **Ideas is not in the menu at all.** Remove "Home" from the menu (logo does this). |
| **Footer** | Clean | Remove the "India (English)" language selector (only one language). Add address, hours, WhatsApp, email and real social links. Footer says "Interiors / Renovation / Construction" while pages say "Home Interiors" etc.; use the same names. |
| **404** | Branded | Logo alt text still says "fusca". Add links to Services and Ideas. |

---

## 5. Mobile (360 px)

- **High:** The floating WhatsApp button covers body text on service pages and the "Society or sector" field on /contact. Add bottom padding to forms and long text, or move to a slim bottom bar (the repo's dock pattern) that reserves its own space.
- The consent checkbox is about 20 px with 11 px text. Make the whole consent line tappable and at least 44 px tall.
- Hero, carousels and footer stack well. Large tap targets on Contact are good.
- Service page carousels show a cut-off third card, which correctly signals scrolling.

---

## 6. Accessibility

| Check | Result | Suggestion |
|---|---|---|
| Grey labels (40% black on white, about #999) | About 2.8:1, fails WCAG AA | Use 60% black (#666) minimum for any text. |
| Blue button with white text | About 5.3:1, passes | Keep contrast if the accent changes (terracotta #B5532F with white is about 4.9:1, which passes AA). |
| Consent and caption text | About 11 px | Raise to 13 px minimum. |
| Inputs | Underline only, no visible focus seen | Add a clear focus state and a light field background. |
| Arrow-only buttons | Several (site visit card, sliders, tiles) | Give each an accessible label. |
| Images | 3 homepage images with empty alt; 404 logo alt "fusca" | Decorative images can stay empty; fix the logo. |

---

## 7. Performance items that affect design

- All 26 homepage images are lazy-loaded, including the logo and hero. This delays the first visible image. Set the hero and logo to eager loading.
- No responsive image sizes (srcset) were found on the homepage, so phones download desktop-size images. Check that Webflow responsive images are enabled for these assets.
- 20 TTF font files (see Typography).

---

## 8. Suggested order of work

| Order | Task | Effort |
|---|---|---|
| 1 | C1 to C5: empty states, placeholders, social links, idea links, duplicated services | Half a day |
| 2 | Homepage hero and form side panel | Half a day |
| 3 | Navigation: inline desktop links, add Ideas, hide Projects until ready | 1 hour |
| 4 | Colour consolidation to one accent, tokens cleaned | Half a day |
| 5 | Grey text contrast, consent and caption sizes, focus states | 2 hours |
| 6 | Mobile WhatsApp overlap | 1 hour |
| 7 | Fonts to one family in WOFF2; hero and logo eager loading | 1 hour |
| 8 | Imagery: "Concept" chips now, real project photos over the next month | Ongoing |
| 9 | Sub-service template: mid-page CTA, duration, FAQs, related ideas | 1 day |
