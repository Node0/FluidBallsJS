# FluidBallsJS v1.0 <sub>WebGL</sub>

A self-contained, GPU-accelerated reimagining of the classic XScreenSaver *FluidBalls* — thousands of soft-body marbles sloshing, packing, and fusing in real time, with every physics and lighting knob live-tunable from an in-browser control panel.

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-Launch_it-62d8ff?style=for-the-badge)](https://node0.github.io/fluidballsjs/)
&nbsp;
![WebGL2](https://img.shields.io/badge/WebGL-2-9b7cff?style=flat-square)
![No dependencies](https://img.shields.io/badge/dependencies-none-3fe6a6?style=flat-square)
![Single file](https://img.shields.io/badge/runs-from_a_single_HTML_file-f5f8ff?style=flat-square)

### ▶ [**Launch the live simulation →**](https://node0.github.io/fluidballsjs/)

No install, no server, no build step — it runs entirely in your browser.

<img width="2286" height="1328" alt="FLUIDBALLS_SCREENSHOT" src="https://github.com/user-attachments/assets/4242c436-2952-4537-98fc-6e7e58c057d9" />


---

## What it is

FluidBalls is a positional-based-dynamics (PBD) particle sandbox rendered with WebGL 2. Physics runs on the CPU with a uniform-grid broad phase; everything you see is GPU work that scales with pixels rather than ball count, so the look can get expensive without the simulation slowing down. It ships as split source (`index.html` + `style.css` + `js/`) and as a single self-contained HTML file that has zero runtime dependencies.

## Features

- **WebGL 2 instanced rendering** — up to 5,000 balls, mixed or single-size, mass-aware collisions.
- **Two render modes** — lit spheres, or a **metaball fluid** surface that fuses touching balls into a single thresholded iso-surface.
- **Physical lighting** — Fresnel/rim from an adjustable index of refraction, specular strip highlight, clarity, translucency, and a distance-based light falloff, all shared between the sphere and metaball passes.
- **Pressure-field coloring** — a per-ball load signal (penetration-sum EMA) drives hue and brightness, so tightly packed piles read hot; optional contact-graph diffusion makes dense clumps share one color.
- **Post-processing** — GPU bloom with separable Gaussian blur, HDR render targets when `EXT_color_buffer_float` is available, motion trails via a feedback buffer, exposure, and vignette.
- **Forces** — gravity with manual / cardinal-cycle / random-wander / continuous-rotate / device-tilt modes and smooth transitions, plus wind direction, strength, and turbulence.
- **Material model** — ball & wall restitution, air drag, contact viscosity, solver passes, constraint compliance, and cohesion (surface tension) for holding blobs together.
- **Curated material presets** — Jelly, Ocean water, Mud, and Vapor, each a bundle of look + optional kinetics.
- **Sharing** — built-in scene presets, localStorage save/load, and JSON preset **export/import** with input validation.
- **Capture** — PNG screenshots, WebM recording, and fullscreen.
- **Live stats** — FPS, frame time, contact count, ball count, and detected GPU.

## Controls

| Interaction | Action |
| --- | --- |
| Drag on a ball | Grab and fling it |
| Hold on empty space | Apply the selected mouse field (attract / repel / vortex) |
| Right-click and hold | Repel |
| Middle-click or Shift-click | Spawn a small burst |
| Mouse wheel over canvas | Rotate gravity (switches it to manual) |

**Keyboard:** `Space` pause · `R` reset · `S` shake · `F` fullscreen

## Run it locally

Download the repo and double-click:

```text
webgl/fluidballs-webgl-single.html
```

That one file contains the HTML, CSS, JavaScript, and GLSL shaders. It has no external runtime dependency and needs no server — it even works over `file://` in browsers like Brave that isolate sibling local files.

The split source (`webgl/index.html`, `style.css`, `js/`) is the version you edit. Some browsers apply per-file security origins to sibling `file://` resources, so the split version may need a local HTTP server:

```bash
cd webgl
python -m http.server 8000
# then open http://localhost:8000/
```

## Rebuild the single file

After editing any split source file, regenerate the bundle:

```bash
cd webgl
python build_single.py
```

The bundler uses only the Python standard library. It inlines local stylesheets and classic scripts in document order, refuses paths outside the project directory, and rejects module scripts rather than flattening them incorrectly. An alternate output path:

```bash
python build_single.py --output my-fluidballs.html
```

## Architecture

| File | Responsibility |
| --- | --- |
| `js/config.js` | Defaults, scene presets, material bundles, shared utilities |
| `js/physics.js` | Fixed-step PBD solver, spatial grid, constraints, restitution, forces, pointer interaction, pressure field |
| `js/renderer.js` | WebGL programs, instancing, render targets, bloom, metaball field/surface passes, feedback trails, compositing |
| `js/ui.js` | Synchronized range/numeric controls, buttons, stats, notifications |
| `js/main.js` | Timing loop, input wiring, recording, screenshots, preset I/O |
| `build_single.py` | Inlines the split source into `fluidballs-webgl-single.html` |

## Browser support

WebGL 2 is required. WebM recording format support varies by browser. Device-orientation gravity requires a device with orientation sensors and, on some platforms, an explicit permission grant or a secure context.

## License

MIT License

Copyright (c) 2026 Joe Hacobian

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
