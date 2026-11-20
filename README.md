# vice-poster-studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Chuongvanmanh/vice-poster-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Chuongvanmanh/vice-poster-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01/Chuongvanmanh/vice-poster-studio/reward?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Vice Poster Studio is an original, completely offline cover-art machine. Drop in photos, write a caption, and it composes a multi-panel movie-poster collage over a procedural Vice City sunset with neon colour grading, striped sun, palms, perspective grid and layered poster lettering. The live editor and the export use the same canvas renderer, so what you see is what you download.

## Run it

```bash
node serve.ts
```

Then open <http://localhost:8080>. Node 22+ is enough: there is no install, build step, framework, CDN, web font or network request. Images are decoded locally with `URL.createObjectURL()` and never uploaded.

## How to use

1. **Add photos.** Choose or drag image files, paste from the clipboard, or press **Try sample photos**. Panels auto-fill by aspect-ratio fit. Click a panel, drag to pan the crop and scroll to zoom; drag a thumbnail onto a panel to replace its photo.
2. **Write the cover.** Edit the caption (Enter makes a new line), script tagline, kicker bar and badge. Pick a font, colour grade, text position and layout, then nudge size, tracking and panel crops. **Randomise style** tries a fresh composition.
3. **Export PNG.** Choose 1080 × 1080, 1080 × 1350 or 1920 × 1080 and click **Export PNG**. The file downloads as `vice-poster-<size>.png` at exactly that resolution.

## Features

- 4–6 polygonal photo panels with gutters, rims, glows, drop shadows, grain, halftone, light leaks and inner vignettes.
- Seven distinct structures in every size: Left Hero, Diagonal Slash, Flanked Centre, Grid Slant, Top Strip, Asymmetric Mosaic and Neon Triptych. Each has a ≥55% photo-area collage, 1.2% gutters, a 13% sun window and panels ending at 88% / 90% height.
- Five distinct cinematic grades: Vice Sunset, Neon Miami, Dusk Teal-Orange, Chrome Night and Pink Haze.
- A procedurally chosen striped sun, layered palm silhouettes, stars, birds and a neon ground grid. Sun placement rasterises the panel polygons into a 96-pixel mask and scores 24 deterministic candidates, preferring open sky.
- Seven locally bundled SIL Open Font License fonts with Archivo Black as the default. Captions are measured with real `ctx.measureText` widths, tracking and extrusion, then fitted as one line, two balanced lines or three balanced lines and anchored as an overlapping movie-poster logo. Extrusion, outline, neon rim, gradient fill, highlight, glow, kicker bar, Pacifico tagline and corner badge are preserved.
- Aspect-aware auto-fill, shuffle and one-photo-everywhere reframe. Faces are kept above the lettering by measuring the text block against each panel.
- URL parameters for automated screenshots: `shot=1`, `size`, `template`, `grade`, `caption`, `tagline`, `kicker`, `font`, `photos` and `select`. `window.__shotReady` flips true after fonts, photos and the first paint.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` | Rotate the selected panel |
| `F` | Flip the selected panel horizontally |
| `S` | Shuffle photos with a seeded, aspect-aware reshuffle |
| `Space` | Randomise the whole style |
| `Delete` / `Backspace` | Clear the selected panel |

## Credits

- **Layouts and grades:** original to this project, defined in `app/src/layouts.js` and `app/src/grades.js`.
- **Fonts:** Anton (The Anton Project Authors), Bebas Neue (Dharma Type / Ryoichi Tsunekawa), Archivo Black (Omnibus-Type), Bowlby One (Vernon Adams), Monoton (Vernon Adams), Black Ops One (The Black Ops Project Authors) and Pacifico (The Pacifico Project Authors). All are under the SIL Open Font License 1.1, from the `ofl/` directory of [google/fonts](https://github.com/google/fonts). Details are in `app/fonts/LICENSE.md`.
- **Sample photos:** eight images in `app/samples/` were made for this project with an image model and are free to use.

All artwork, shapes, scenery, lettering effects and code here are original. No Rockstar Games logos, wordmarks, artwork or fonts are copied or bundled.
