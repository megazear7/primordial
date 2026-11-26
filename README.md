# Primordial

A hands-off microbial colony simulation. Glowing colonies send flagellates out through a much larger watery world to gather drifting nutrients, bring them home, and grow. You watch, pan, and zoom. The rules are the old [village](https://github.com/megazear7/canvas-play) simulation (homes, gatherers, ripening apples, outposts, splits) recast as a microscope slide.

This is stage 1: the running world, not the menu or save slots.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173/).

```bash
npm test
npm run build
npm run preview
```

## Controls

The same build serves phones, tablets, desktops, and televisions.

| Input | Action |
| --- | --- |
| One finger or mouse drag | Pan |
| Pinch, mouse wheel, or trackpad scroll | Zoom toward the pointer |
| Arrow keys or WASD | Pan (hold to accelerate) |
| `+` / `−`, numpad, Page Up / Page Down, channel or media skip keys | Zoom toward the center |
| Home | Recenter the slide |
| Enter | Move focus to quality |
| Escape or Back | Return focus to the slide |
| Minimap drag or click | Jump the view |

Quality is Low, Medium, or High. The first visit picks a default from screen size, pixel ratio, memory, and CPU count, and remembers a manual choice in `localStorage`. A 4K television starts on Medium so the post-process is not a full 8-megapixel shader unless you ask for High.

## GitHub Pages

The site is meant to be served at `https://megazear7.github.io/primordial/`.

1. In the repository, open **Settings → Pages → Build and deployment**.
2. Set **Source** to **GitHub Actions**.
3. Merge this project to `main`.

`.github/workflows/pages.yml` builds with `BASE_PATH=/primordial/` and deploys the `dist` folder with `actions/deploy-pages`. There is no `CNAME` yet. Vite's `base` keeps script, style, icon, manifest, and service worker URLs on that subpath.

## Install and offline

The production build is a progressive web app. It precaches the page, scripts, styles, and icons, so the slide opens with no network after one online visit. A newer deploy waits until you choose **Update**, then the new service worker takes over and reloads once onto the fresh cache.

Manifest scope, start URL, and the service worker follow Vite's `base`:

- GitHub Pages sets `BASE_PATH=/primordial/`.
- `primordial.alexlockhart.me` should be built with `BASE_PATH=/` or with the variable unset. The app does not hardcode `/primordial/`.

Install it from the browser (Chrome and Edge show an install icon; on iPhone use Share → Add to Home Screen). Icons include 192 and 512 any-purpose, maskable copies of both, and a 180px Apple touch icon. Display is standalone and orientation is any, so landscape and portrait both work.

`npm run dev` does not register a service worker. Use `npm run build` and `npm run preview` to try the offline app. For the Pages path, build and preview with `BASE_PATH=/primordial/`.

iOS does not offer an install prompt, ignores maskable icons, and can evict the cache after a long time unused. A new version is picked up the next time the home-screen app is opened, not while it sits in the background.

## Layout

- `src/sim` is the simulation. It does not import Pixi. State is plain JSON (`version: 1`) via `serialize` / `deserialize`.
- `src/render` is the camera, Pixi scene, water filter, HUD, and input.
- Fixed 60 Hz simulation steps, independent of the display rate. A slow frame runs at most three steps so it cannot spiral.
- The world is 6400×4200. The camera starts centered on a colony, zoomed so gatherers stay readable on a phone and a television. Drag, pinch, wheel, and keys pan and zoom, clamped to the slide. The minimap sits in a corner and scales with the layout.
- One full-screen WebGL filter does ripple refraction, caustics, a little chromatic aberration, bloom, film grain, and an elliptical microscope vignette. Quality turns those down. Foreground and background debris are blurred on Medium and High.

Warriors, thieves, and predators are not simulated yet. Colony genes already store strength, heroism, and aggressiveness for them. Vacuoles are the budded drop-off points (the old outposts), and overcrowded colonies split into mutated daughters. Births pause above 500 gatherers so a long session stays smooth. That ceiling is a stage-1 guard, not a rule from the original village.
