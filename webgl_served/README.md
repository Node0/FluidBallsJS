# FluidBalls WebGL

A self-contained, modern browser interpretation of the classic XScreenSaver FluidBalls idea.

## Run it

For the broadest `file://` compatibility, including Brave, double-click:

```text
fluidballs-webgl-single.html
```

That file contains the HTML, CSS, JavaScript, and GLSL shader source in one document. It has no external runtime dependency and requires no server, package manager, CDN, or build tool.

The split source version remains available as `index.html`, `style.css`, and the files under `js/`. Some browsers apply line-unique security origins to sibling `file://` resources, so the split version may need a local HTTP server.

## Rebuild the single-file version

After editing the split source files, run:

```bash
python build_single.py
```

This regenerates `fluidballs-webgl-single.html`. An alternate output path can be supplied with:

```bash
python build_single.py --output my-fluidballs.html
```

The bundler uses only the Python standard library. It inlines local stylesheets and classic scripts in document order, refuses paths outside the project directory, and rejects module scripts rather than flattening them incorrectly.

## What is included

- WebGL 2 instanced sphere rendering
- GPU bloom render targets with separable Gaussian blur
- HDR render targets when `EXT_color_buffer_float` is available
- Motion trails through a feedback buffer
- Fresnel/rim lighting, specular highlights, glow, exposure, and vignette
- Fixed-timestep compliant PBD collision solver
- Uniform-grid broad phase, avoiding all-pairs collision checks
- Live ball count changes up to 5,000 from the UI
- Gravity magnitude, direction, manual/cardinal/random/continuous/tilt modes
- Smooth gravity transitions and adjustable cycle time
- Wind direction, strength, and turbulence
- Ball restitution, wall restitution, air drag, contact viscosity, solver passes, and compliance
- Color cycling, velocity colors, direction colors, or single-hue rendering
- Mouse attraction, repulsion, vortex field, direct ball dragging, and spawning
- Pause, single-step, reset, shake, zero velocity, randomize, clear trails
- Built-in presets plus localStorage save/load
- PNG screenshots, WebM recording, and fullscreen mode
- FPS, frame time, contact count, ball count, and GPU display
- Keyboard shortcuts: Space pause, R reset, S shake, F fullscreen

## Interaction

- Drag directly on a ball to move it.
- Press and hold on empty space to apply the selected mouse field.
- Right-click and hold to repel.
- Middle-click or Shift-click to spawn a small burst.
- Use the mouse wheel over the canvas to rotate gravity and switch it to manual mode.

## Architecture

- `js/physics.js`: fixed-step simulation, spatial grid, compliant positional constraints, restitution, forces, pointer interactions
- `js/renderer.js`: WebGL programs, instancing, render targets, bloom, feedback trails, compositing
- `js/ui.js`: synchronized range and numeric controls, buttons, stats, notifications
- `js/main.js`: timing loop, browser integration, recording, screenshots, presets, input wiring
- `js/config.js`: defaults, presets, small shared utilities

## Performance notes

Rendering is GPU-instanced, while collision solving remains CPU-side. Practical limits depend heavily on radius, screen dimensions, solver passes, physics Hz, browser, and CPU. Reducing solver passes or Physics Hz is the fastest way to recover headroom at high ball counts.

A smaller radius creates more occupied grid cells and can increase collision work because more balls fit on screen. Dense piles are intentionally more expensive than sparse motion.

## Browser notes

WebGL 2 is required. WebM recording format support varies by browser. Device-orientation gravity requires a device with orientation sensors and, on some platforms, explicit permission or a secure context.

## Brave and Safari: use localhost, not `file://`

Some browsers assign every local `file://` document an opaque/unique security
origin. Bundling removes cross-file requests, but it does not give the document
a normal web origin. For consistent WebGL, storage, fullscreen, recording, and
download behavior, run FluidBalls on the loopback interface.

### macOS double-click launcher

Double-click `FluidBalls.command`. A Terminal window starts a loopback-only
server and opens FluidBalls in the default browser. Close it with Control-C.

If macOS blocks the downloaded command because of quarantine, right-click it,
choose **Open**, then confirm once. Alternatively run the Python command below.

### Terminal launcher

```bash
cd fluidballs-webgl
python3 serve.py
```

The script binds only to `127.0.0.1`, chooses an available port automatically,
and opens `index.html`. No package installation is required.

Useful options:

```bash
python3 serve.py --no-browser
python3 serve.py --port 8080
python3 serve.py --page fluidballs-webgl-single.html
```
