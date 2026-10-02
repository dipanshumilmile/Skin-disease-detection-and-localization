# DermaScope — Next.js Frontend

Next.js (App Router) + Tailwind CSS port of the DermaScope UI mockup. Two real models drive the
design: an EfficientNetV2S classifier (disease prediction + Grad-CAM) and a separately-trained
U-Net (lesion mask, bounding box, % area affected).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Structure

- `app/` — root layout (fonts, metadata) and the single page route
- `components/Shell.js` — owns active-view and dark/light theme state
- `components/Sidebar.js`, `components/Topbar.js` — navigation chrome
- `components/views/` — one file per page: Analyze, Verify, Lesions, Trends, History,
  Model info, Settings
- `components/ui/LesionPhoto.js` — the CSS-drawn placeholder "photo" + dermatoscope vignette,
  reused everywhere an image needs to appear
- `lib/data.js` — all mock data in one place; swap these arrays for real API calls when wiring
  up your inference backend

## Wiring to a real backend

Every view currently reads from `lib/data.js`. To connect real inference:
1. Replace the `LesionPhoto` placeholder with an `<img>` / `next/image` showing the uploaded file
2. Replace the hardcoded arrays in `lib/data.js` with `fetch()` calls to your FastAPI (or other)
   backend, returning classifier probabilities, Grad-CAM heatmap, U-Net mask/bbox/area
3. `AnalyzeView`'s overlay toggle logic already expects three layers (`heat`, `mask`, `box`) —
   swap the CSS gradient placeholders in `globals.css` (`.ov-heat`, `.ov-mask`, `.ov-box`) for
   actual heatmap/mask images returned by the backend (e.g. as base64 PNGs)
4. `LesionsView`'s comparison/alert logic is currently static example data — once scans are
   persisted (e.g. in a database keyed by lesion tag), compute the real delta/alert server-side
   or client-side using the same logic described in the project notes

## Notes

- Theming uses CSS custom properties (`--teal`, `--clay`, `--gold`, etc.) defined in
  `app/globals.css`, toggled via a `data-theme` attribute — consumed through Tailwind arbitrary
  values (e.g. `bg-[var(--panel)]`) so the same tokens work in both plain CSS and Tailwind classes
- The Trends chart uses `chart.js` + `react-chartjs-2` (already in `package.json`)
