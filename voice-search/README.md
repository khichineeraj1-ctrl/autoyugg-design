# Voice Search (OpenAI Realtime) — Setup Guide

People tap the mic, ask out loud ("automatic SUV under 15 lakh", "sabse zyada mileage wali scooty", "Tata Curvv ka price"), and the assistant searches **your MySQL catalogue**, shows the matches on screen and gives a short spoken answer in the same language. It can also open a model page when they ask.

Built for your stack: **PHP + jQuery/AJAX + MySQL**, styled with the portal's design tokens (`--accent`, `--ink`, `--line`…).

---

## How it works

```
Browser (jQuery)                 Your server (PHP)                 OpenAI
────────────────                 ─────────────────                 ──────
1. Mic tap ──POST──────────────▶ api/session.php ──(API key)────▶ /v1/realtime/client_secrets
                                 returns short-lived key ◀──────── ek_… (valid ~2 min)
2. WebRTC audio  ◀──────────────────────────────────────────────▶ /v1/realtime/calls
3. Model calls search_vehicles ─▶ api/search.php ──PDO──▶ MySQL
   results → shown on screen + sent back to the model → spoken reply
```

Your real OpenAI key **never reaches the browser**. The browser only gets a key that expires in 2 minutes and is locked to your instructions, tools and model.

---

## Files

| File | What it does |
|---|---|
| `api/config.php` | The only file you edit: API key, model, voice, DB, allowed domains, limits |
| `api/session.php` | Creates the short-lived Realtime key, with assistant instructions + tools |
| `api/search.php` | MySQL search (FULLTEXT + LIKE fallback, filters, Hinglish handling). Also works for normal typed AJAX search |
| `api/bootstrap.php` | Helpers: origin check, per-IP rate limit, PDO, ₹ lakh/crore format |
| `api/.htaccess` | Blocks direct access to config/bootstrap |
| `assets/voice-search.js` | jQuery widget: WebRTC, tool calls, transcript, results panel |
| `assets/voice-search-site.js` | One-line site loader: adds mic buttons to header, overlay, hero, mobile |
| `assets/voice-search.css` | Panel styles (uses your CSS vars, no italics) |
| `sql/install.sql` | `vehicles` table + FULLTEXT index + 40 seed models from the prototype catalogue |
| `demo.html` | Standalone test page |

---

## Setup (about 15 minutes)

### 1. Requirements
- PHP 7.4+ with `curl` and `pdo_mysql`
- MySQL 5.7+ / MariaDB 10.3+ (InnoDB FULLTEXT)
- **HTTPS** on the live site (browsers only allow the mic on https:// or localhost)
- An OpenAI API key with billing enabled

### 2. Upload
Copy the `voice-search/` folder to your web root, e.g. `https://www.yoursite.com/voice-search/`.

### 3. Database
```bash
mysql -u USER -p YOUR_DB < voice-search/sql/install.sql
```
Already have a models table? Skip the `CREATE TABLE`, then either:
- create a MySQL **VIEW** named `vehicles` over your table with the same column names (easiest, no PHP changes), or
- rename the columns inside `api/search.php`.

Add the index on your own table:
```sql
ALTER TABLE your_table ADD FULLTEXT ft_search (name, brand, body, fuel, tags, use_cases, highlights, features);
```
If you can't add FULLTEXT, set `'use_fulltext' => false` in config.

Set the `url` column to each model's real page (e.g. `/tata/curvv-ev`). If empty, `url_pattern` in config is used.

### 4. Configure `api/config.php`
- `openai_api_key` — preferably set as a server env var:
  Apache vhost: `SetEnv OPENAI_API_KEY sk-...` · PHP-FPM pool: `env[OPENAI_API_KEY] = sk-...`
- `db` — your credentials
- `allowed_origins` — your exact domains (www and non-www). Requests from anywhere else are refused.
- `model` / `voice` — defaults `gpt-realtime-2.1` / `marin`

### 5. Test
- Open `https://www.yoursite.com/voice-search/demo.html`, tap the mic, allow microphone, speak.
- Search endpoint alone: `https://www.yoursite.com/voice-search/api/search.php?query=tata%20curvv` (open from a page on your domain, or it returns `origin_not_allowed`).

Local test: `cd voice-search && php -S localhost:8000` → open `http://localhost:8000/demo.html` (localhost counts as secure for the mic).

---

## Site integration (done)

All 24 active pages with the site header now load voice search with one line before `</body>`:
```html
<script src="voice-search/assets/voice-search-site.js" defer></script>
```
That loader adds the CSS, loads jQuery only if the page doesn't have it, and places mic buttons:

| Where | Pages |
|---|---|
| Header, next to the search icon | all 24 pages (desktop/tablet) |
| Inside the search overlay input | all 24 pages |
| Hero search box | homepage-final (existing `#heroVoice`), bike-homepage-final (added) |
| Floating mic, bottom-left | phones only (the header search icon sits off-screen on small phones) |

The old browser speech-to-text handlers on `#heroVoice` / `#soVoiceBtn` in homepage-final are replaced automatically. Suggestion chips switch to bike examples on `bike-*` pages.

Not included (no site header / internal): all-brands, 404, byc, editors, editor-profile, editor-signup, admin-panel, and the legacy index / upcoming-cars / homepage-trending-mockup. To add a page, paste the same line.

**Run it locally** (voice needs PHP, not file://):
```bash
cd "auto-portal-prototype (1)"
php -S localhost:8000
# open http://localhost:8000/homepage-final.html
```
In the prototype every result links to the anchor pages (`model-page.html` / `bike-model-page.html`). On the live site, fill the `url` column or change `url_pattern` in config.

Manual setup on another site: include `voice-search.css`, jQuery and `voice-search.js`, then call:
```js
VoiceSearch.init({ sessionUrl: '/voice-search/api/session.php', searchUrl: '/voice-search/api/search.php', triggers: '#yourMicButton' });
```

### Options
| Option | Default | |
|---|---|---|
| `idleTimeoutMs` | `30000` | Ends the session after 30s of silence |
| `maxSessionMs` | `180000` | Hard cap of 3 minutes per session |
| `suggestions` | 4 examples | Chips shown before the first question |
| `takeOverTriggers` | `true` | Strip existing click handlers from trigger buttons |
| `getContext` | city/category/page | Override to send other page context |

### Events
- `voicesearch:results (e, results, args)` — each search
- `voicesearch:navigate (e, vehicle)` — before opening a page; call `e.preventDefault()` to handle it yourself (e.g. open in the same SPA view or track it)

---

## Cost and abuse controls (already built in)

- Short spoken replies (`max_output_tokens` 350, instructions ask for ≤35 words; results are on screen)
- Compact tool results sent back to the model (fewer tokens)
- Auto-stop after 30s silence, 3 min hard cap
- 15 voice sessions/hour and 60 searches/min per IP (edit in config)
- Only your domains can get a token

Realtime audio is billed per audio token (input and output). Check current pricing on OpenAI's pricing page and set a monthly **usage limit** in the OpenAI dashboard. For lower cost, try a smaller realtime model in `config.php` if one is available on your account.

For analytics, log `args` from `voicesearch:results` to GA4 as a `voice_search` event — the spoken queries are great keyword research for SEO and ads.

---

## Fallback behaviour
- Browsers without WebRTC: uses built-in speech-to-text (Chrome/Edge/Safari), runs the same search, shows results (no spoken reply).
- Mic blocked / no HTTPS / rate limited: clear message in the panel.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `origin_not_allowed` | Add your exact domain (with https://, no trailing slash) to `allowed_origins` |
| `server_not_configured` | API key still `sk-REPLACE_ME` |
| `upstream_error` 401 | Wrong/expired key. 404/400: model name not available to your account — check `model` |
| Mic prompt never appears | Page not on HTTPS |
| No results for short words like "i20" | Normal for FULLTEXT; the LIKE fallback handles them automatically |
| PHP error log | Look for lines starting `[voice-search]` |
