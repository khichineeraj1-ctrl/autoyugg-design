# Claude Memory — Neeraj Khichi

Last updated: 2026-06-07

## Index

- [User](MEMORY.md#user) — Identity, email, preferences
- [Project](MEMORY.md#project) — Auto portal prototype details
- [GitHub](MEMORY.md#github) — Repo and git workflow
- [Work Context](MEMORY.md#work-context) — Industry, role, tools

---

## User

- **Name:** Neeraj Khichi
- **Email:** khichineeraj1@gmail.com
- **Preferences:** Be concise and direct. No unnecessary explanation or verbosity. Remove words if the point still lands.

---

## Project

- **Name:** Auto Portal Prototype (autoyugg)
- **Folder:** `/Users/neerajkhichi/Desktop/autoportal/auto-portal-prototype (1)/`
- **Stack:** Single-page HTML files, vanilla JS, no framework. CSS variables for theming.
- **Design system:** `--accent:#8b1820` (dark red), `--bg-alt:#f5f6f8`, `--ink:#1a1410`, Inter font (Google Fonts), SF Pro Display for headings. Header height: 60px sticky.
- **Key pages built:** homepage-final.html, model-page.html, variant-page.html, admin-panel.html, editors.html, editor-profile.html, editor-signup.html, all-brands.html, compare-page.html, byc.html, brand-page.html, upcoming-page.html, on-road-price.html, news-page.html, reviews-page.html, write-review.html, bike-* equivalents, ai-server/
- **AI assistant:** Node.js/Express backend (`ai-server/server.js`) using `claude-haiku-4-5-20251001`. POST `/api/chat` on `localhost:3001`.
- **City detection:** `user_city` cookie/localStorage slug → used in lead form and ORP calculation.
- **Lead scoring:** 0–100 based on timeline, finance, exchange, WhatsApp fields.
- **OTP gate:** editor-signup.html has email→OTP→form flow. Demo OTP: `123456`.
- **Admin login:** `admin@brand.com` / `admin123`

---

## GitHub

- **Repo:** `git@github.com:khichineeraj1-ctrl/autoyugg-design.git`
- **Branch:** `main`
- **Push command:** `git push -u origin main --force` (repo was initialized fresh from local, force push needed first time)

---

## Work Context

- Works in **automotive digital marketing** — Google Ads + Meta Ads for Indian OEM brands (BikeDekho/CarDekho platform context)
- Skills installed: google-ads-auto, google-ads-editor, google-ads-negatives, google-ads-precision, meta-ads-auto, meta-creative
- Familiar with CPL optimization, bulk uploads to Google Ads Editor, OEM lead gen campaigns (TVS, Bajaj, Ampere, Piaggio etc.)
