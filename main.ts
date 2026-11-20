// Vice Poster Studio, an original offline gta6-cover-art-01 entry (Node 22, standard library only).
// app/ is a folder of plain static files a desktop browser loads offline: ES modules, canvas 2D, local fonts
// and local sample photos, with no library, CDN or network request. It turns photos and a caption into a
// multi-panel Vice City sunset poster with cinematic grades and layered lettering, exported as a PNG at
// 1080x1080, 1080x1350 or 1920x1080. This program sanity-checks that folder, copies app/ and screenshots/
// from beside this file to /output, and writes /output/dossier.json with the vendored make.fun library.
// The eight sample photos in app/samples/ were made for make.fun with an image model and are free to use.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const required of ['app/index.html', 'app/src/main.js']) {
  const path = join(here, required);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Vice Poster Studio: missing required file ${required}`);
}
const shotDir = join(here, 'screenshots');
const shotFiles = existsSync(shotDir)
  ? readdirSync(shotDir, { withFileTypes: true }).filter((entry) => entry.isFile())
  : [];
if (shotFiles.length < 3) throw new Error(`Vice Poster Studio: screenshots/ needs at least 3 files, found ${shotFiles.length}`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
