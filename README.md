# anjum.pro

Personal hub of **Muhammad Ahmad Anjum** (BLACKOT). Static site, served by GitHub Pages on the custom domain in `CNAME`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page: content, SEO tags, JSON-LD (WebSite, ProfilePage, Person), inline icon sprite |
| `style.css` | Design system, dark and light themes, responsive layout |
| `script.js` | WebGL black hole, boot sequence, name warp, ticker, theme switch, copy-email |
| `favicon.svg`, `favicon.ico`, `assets/icons/*` | BLACKOT tab icon, Apple touch icon, app icons |
| `assets/blackot-logo.svg` | BLACKOT wordmark |
| `assets/og-preview.png` | 1200 x 630 social preview |
| `site.webmanifest`, `robots.txt`, `sitemap.xml`, `404.html` | PWA metadata, crawler rules, sitemap, not-found page |

## Editing

- **Links:** edit the rows in `index.html` (`<a class="row" ...>`). Each row's `--brand` is the hover colour as `R,G,B`.
- **Cache:** after changing `style.css` or `script.js`, bump the `?v=` number in `index.html` and `404.html`.
- **Fonts:** Anybody and Instrument Sans load from Google Fonts. The name warps by using Anybody's width axis.
- **Reduced motion:** the site respects the visitor's setting. Animation stops and the black hole renders as a still frame.

## After deploying

1. Open Google Search Console, add `https://anjum.pro/`, and submit `https://anjum.pro/sitemap.xml`.
2. Use "URL inspection" > "Request indexing" for the home page.
3. Check the social preview with the LinkedIn Post Inspector and the Facebook Sharing Debugger (they cache old previews until re-scraped).

Icons: Font Awesome Free 7 (CC BY 4.0), https://fontawesome.com/license/free
