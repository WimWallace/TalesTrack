# TV Photo Shuffle

Fullscreen, endless, shuffled slideshow of a shared Google Photos album (no 2,000-photo limit).

- `public/index.html` – the whole app (no build step, no dependencies, no tracking).
- `netlify/functions/album.mjs` – reads the shared album page by page (`/api/album`).
  Google has no official API for shared-link albums; this parses the album page and
  uses the internal paging call of photos.google.com. If Google changes that format,
  this is the only file to fix.
- `netlify/functions/orient.mjs` – reads a photo's EXIF orientation (`/api/orient`) for
  browsers that ignore it (many Samsung TV browsers), so portrait photos are not shown on their side.

## Deploy on Netlify

1. Netlify → *Add new site* → *Import an existing project* → this repository.
2. **Base directory:** `tv-photo-shuffle` (build command empty; publish dir and functions come from `netlify.toml`).
3. Deploy, then open the site URL.

## Use

- Paste the album link (the default is pre-filled), pick the time per photo and tap **Start**.
- Tap / OK for the controls: Previous, Pause/Resume, Next, − / + seconds, Stop.
  While paused the controls stay on screen. Remote: play/pause keys, left/right to browse.
- Every Start makes a new random order of the whole album. The first start loads the whole
  album before the first photo (so even that one is random); later starts use the remembered
  list and refresh it in the background.
- The phone is locked to landscape and kept awake while the slideshow runs.
- Tip: open the same URL in the Samsung TV's own *Internet* browser to skip Smart View.
