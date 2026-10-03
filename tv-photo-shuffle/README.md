# TV Photo Shuffle

Fullscreen, endless, shuffled slideshow of a shared Google Photos album (no 2,000-photo limit).

- `public/index.html` – the whole app (no build step, no dependencies, no tracking).
- `netlify/functions/album.mjs` – reads the shared album page by page (`/api/album`).
  Google has no official API for shared-link albums; this parses the album page and
  uses the internal paging call of photos.google.com. If Google changes that format,
  this is the only file to fix.

## Deploy on Netlify

1. Netlify → *Add new site* → *Import an existing project* → this repository.
2. **Base directory:** `tv-photo-shuffle` (build command empty; publish dir and functions come from `netlify.toml`).
3. Deploy, then open the site URL.

## Use

- Paste the album link (the default is pre-filled) and tap **Start**.
- Tap the screen for Pause / Resume / Stop. Every Start makes a new random order.
- The phone is locked to landscape and kept awake while the slideshow runs.
- Tip: open the same URL in the Samsung TV's own *Internet* browser to skip Smart View.
