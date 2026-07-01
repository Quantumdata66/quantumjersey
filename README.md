# Quantum Jersey ⚡

> **Premium football merchandise storefront** — built as a production-grade platform and portfolio project demonstrating full-stack web development, cloud infrastructure, and AI integration.

**Live:** [quantum-jersey.vercel.app](https://quantum-jersey.vercel.app) &nbsp;|&nbsp; **Admin:** `/admin`

---

## Overview

Quantum Jersey is a Nigerian football merchandise brand selling jerseys, boots, and sportswear. This project is the complete digital storefront — from customer-facing product pages to a secure admin dashboard with AI-assisted product management.

The stack is intentionally lean: no frameworks, no build tools, no bundlers. Pure HTML, CSS, and JavaScript backed by real cloud services. Every product card on the site is database-driven and updates in real time without touching a line of code.

---

## Features

### Storefront
- Dynamic product catalog fetched live from Supabase
- Category pages: Jerseys, Football Boots, Sportswear
- Real-time search with debounced input
- WhatsApp-based ordering flow (no checkout, by design)
- Skeleton loaders for perceived performance
- Graceful fallback to static products when offline
- Fully responsive — mobile, tablet, desktop
- Open Graph meta tags on all pages

### Admin Panel (`/admin`)
- Email + password auth via Supabase Auth
- Drag-and-drop image upload to Supabase Storage
- Manual product creation (name, category, price, sizes, description)
- Optional AI-assisted product generation via Gemini 2.0 Flash
- Feature / unfeature products on homepage
- Delete products with confirmation
- Dashboard: total products, featured count, storage usage, category breakdown, recent uploads
- Session persistence — stay logged in across page refreshes

### Infrastructure
- Supabase: database, auth, and object storage
- Vercel: global CDN deployment with clean URLs and security headers
- Row-Level Security: public users read-only, writes require auth
- Images cached for 1 year at the CDN edge

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | Google Gemini 2.0 Flash (vision) |
| Deployment | Vercel |
| Image format | WebP (optimised) |

---

## Project Structure

```
quantum-jersey/
├── index.html          # Homepage — featured products + hero
├── catalog.html        # Full product catalog with search
├── boots.html          # Football Boots category
├── jerseys.html        # Jerseys category
├── sportswear.html     # Sportswear category
├── contact.html        # Contact + WhatsApp CTA
├── admin.html          # Admin dashboard (auth-gated)
├── css/
│   └── style.css       # All styles — design system, components, admin
├── js/
│   ├── supabase.js     # Supabase client, auth, DB ops, Gemini AI
│   ├── products.js     # Static fallback products + shared utilities
│   ├── render.js       # Async rendering, skeleton loaders, search
│   └── admin.js        # Admin panel logic — auth, publish, manage
├── assets/
│   └── images/         # Local WebP images (fallback)
├── vercel.json         # Deployment config — clean URLs, headers, caching
└── .gitignore
```

---

## Local Development

No build step required. Open `index.html` directly in a browser, or use any static server:

```bash
# Python
python -m http.server 3000

# Node
npx serve .
```

---

## Deployment

### 1. Supabase Setup

Create a project at [supabase.com](https://supabase.com) and run this SQL:

```sql
CREATE TABLE public.products (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT       NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN ('boots', 'jerseys', 'sportswear')),
  price       INTEGER     NOT NULL CHECK (price > 0),
  sizes       TEXT[]      NOT NULL DEFAULT '{}',
  image_url   TEXT        NOT NULL,
  description TEXT,
  badge       TEXT,
  featured    BOOLEAN     NOT NULL DEFAULT false,
  slug        TEXT        UNIQUE,
  in_stock    BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"   ON public.products FOR SELECT               USING (true);
CREATE POLICY "Admin insert"  ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin update"  ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete"  ON public.products FOR DELETE TO authenticated USING (true);
```

Create a Storage bucket named `product-images` and set it to **Public**.

### 2. Deploy to Vercel

```bash
# Install Vercel CLI (once)
npm i -g vercel

# Deploy
vercel --prod
```

Or connect the GitHub repo directly in [vercel.com/dashboard](https://vercel.com/dashboard).

### 3. Environment Variables

The Supabase credentials are embedded in `js/supabase.js`. For production, they can be overridden via `window.QJ_SUPABASE_URL` and `window.QJ_SUPABASE_ANON_KEY` (the anon key is safe to expose publicly — it is restricted by RLS).

The **Gemini API key** is stored only in the admin's browser `localStorage` — it is never committed to the repo or exposed to customers.

### 4. Create Admin User

In Supabase Dashboard → Authentication → Users → **Invite User** with your email.

---

## Security Model

| Action | Requirement |
|---|---|
| View products | None (public) |
| Search products | None (public) |
| Place order (WhatsApp) | None (public) |
| Upload images | Supabase Auth session |
| Publish products | Supabase Auth session |
| Delete/feature products | Supabase Auth session |
| AI image analysis | Gemini API key (admin localStorage only) |

---

## Author

Built by **[Your Name]** as a portfolio project demonstrating production-grade web development with cloud and AI integration.

- GitHub: [@yourusername](https://github.com/yourusername)
- LinkedIn: [linkedin.com/in/yourprofile](https://linkedin.com/in/yourprofile)

---

## License

MIT
