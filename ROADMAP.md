# Quantum Jersey — Technical Roadmap & Future Feature Specifications ⚡

This document outlines the architectural roadmap for high-impact e-commerce features planned for upcoming milestones of **Quantum Jersey**:
1. Customer Reviews System (Production Rollout)
2. Interactive Product Videos
3. 3D Football Boot Viewing (WebGL / Three.js)
4. Quantum Jersey Studio (Custom Name & Number Jersey Customizer)

---

## Milestone 1: Full Customer Reviews System Rollout

### Objective
Enable verified Nigerian football fans and ballers to submit ratings (1 to 5 stars) and detailed reviews for boots, jerseys, and training gear, with strict moderation and verified purchase badges.

### Architecture & Security
- **Database Schema**: `public.reviews` linked to `public.products` (via `product_id`) and `public.orders` (via `order_id` / `order_ref`).
- **Verified Purchase derived validation**:
  - Verification check confirms `order_ref` matches an existing record in `public.orders` where `status = 'delivered'`.
  - Database-level unique constraint `(order_id, product_id)` guarantees one review per product per customer purchase.
- **Privacy Enforcement**:
  - Review queries only expose `customer_name`, `rating`, `review_text`, `is_verified_purchase`, `created_at`.
  - Customer phone numbers, delivery addresses, and financial totals are never exposed in public queries (enforced by RLS).
- **Admin Moderation**:
  - Review queue in `/admin` with `Approve`, `Reject`, and `Delete` actions.
  - Public queries only fetch `status = 'approved'`.

---

## Milestone 2: Product Videos & Video Reels Integration

### Objective
Provide fast, high-engagement video previews and TikTok/Instagram reel embeds showcasing authentic boot flex tests, stud grip on Nigerian turf, and jersey fabric breathability.

### Architecture & Technical Plan
- **Storage & CDN**:
  - Store compressed WebP-animated snippets or MP4/WebM short clips in Supabase Storage bucket `product-videos` with 1-year edge CDN caching.
  - Video file limits: max 15 MB, H.264 / AAC or AV1 codecs, 1080x1920 (9:16 vertical) and 1920x1080 (16:9).
- **Frontend Player**:
  - Custom zero-dependency HTML5 `<video>` player with lazy-loading (`loading="lazy"`, `preload="none"`, `playsinline`, `muted`, `loop`).
  - IntersectionObserver auto-play/pause on viewport entry to save mobile bandwidth.
- **TikTok & Instagram Feed Sync**:
  - Lightweight iframe wrapper and deep-linking to `@quantum_jersey` TikTok and Instagram reels.

---

## Milestone 3: Interactive 3D Football Boot Viewing (WebGL)

### Objective
Allow customers to rotate, zoom, and inspect boots from 360 degrees, examining stud traction patterns, dynamic fit collars, and leather textures before purchasing.

### Architecture & Technical Plan
- **3D Asset Pipeline**:
  - Use optimized **glTF / GLB** binary format with Draco mesh compression (target model size: < 2.5 MB per boot).
  - PBR (Physically Based Rendering) texture maps: Diffuse/Albedo, Roughness/Metallic, Normal map.
- **Rendering Engine**:
  - Integrated via Google `<model-viewer>` web component or Three.js WebGL canvas.
  - Support AR (Augmented Reality) via `ar` attribute on iOS (Quick Look `.usdz`) and Android (`Scene Viewer`).
- **Performance Budget**:
  - On-demand asset download: 3D viewer only loads when user clicks "View in 3D" or expands the 3D tab.

---

## Milestone 4: Quantum Jersey Studio (Custom Name & Number Customizer)

### Objective
Allow football fans to personalize any club or national team jersey with their custom name, preferred squad number, and official league sleeve badges (e.g. Premier League, Champions League, AFCON).

### Architecture & Technical Plan
- **Canvas / SVG Live Preview Engine**:
  - Interactive HTML5 Canvas / SVG overlay engine rendering live font typography on jersey textures in real-time.
  - Authentic club font styles and curve arching algorithms.
- **Order Data Integration**:
  - Store customisation specs inside order line item JSON:
    ```json
    {
      "custom_name": "NURUDEEN",
      "custom_number": "10",
      "sleeve_badge": "Premier League Champions 2024",
      "customization_fee": 5000
    }
    ```
  - Automatically format customized jersey details into WhatsApp checkout message:
    `👕 Custom Printing: "NURUDEEN #10" (+₦5,000)`
- **Admin Printing Queue**:
  - Dedicated customizer print sheet generator in `/admin` with high-resolution vector export for heat-press technicians.

---

*Authored by the Quantum Jersey Engineering Team. Designed for scalable cloud deployment on Vercel & Supabase.*
