Nice name. And before you spend the $99 — you almost certainly don't need it yet.

Xcode's "Sign to Run Locally" (ad-hoc signing) works with a free Apple ID and is enough to build a .saver bundle, install it in ~/Library/Screen Savers/, and use it on your own Macs indefinitely. The paid Developer Program buys you exactly one thing here: a Developer ID certificate, which lets you notarize the bundle so it opens on other people's machines without Gatekeeper blocking it. If Fluidity is for you, build it free. If you want to hand it to friends or put it on GitHub for strangers, that's when you pay.

As for the port, the split is lopsided in your favor:

physics.js is essentially already Swift. It's ~400 lines of Float32Array math with no DOM, no browser API, nothing platform-specific — that's why I could run it under Node in a vm sandbox to test it. Float32Array → UnsafeMutableBufferPointer<Float> or just [Float], and the Verlet integrator, spatial hash, and inverse-mass solver transcribe almost line for line. You'd get a large speedup for free, since JS engines don't vectorize that inner contact loop and Swift will.

The renderer is the actual work. Four GLSL ES 3.00 shaders (ball, feedback, blur, composite) → MSL, plus the RGBA16F ping-pong render targets and the instanced quad draw. Metal maps onto all of it cleanly — instanced rendering, half-float textures, offscreen passes — but it's a genuine rewrite, not a translation. Budget most of your time here.

Three paths, roughly in effort order:

1. WKWebView inside a ScreenSaverView. Load the single-file HTML you already have. Ship it this afternoon. It works, and it's a defensible choice — but you inherit a whole browser engine per display, and screensavers run in a constrained host process, so I'd expect memory and wake-from-sleep friction. Good for proving the idea, poor as the destination.
2. Swift physics + MTKView/Metal. The real version. Physics ports in an evening; shaders are the project.
3. Swift physics + SpriteKit. Faster to stand up than Metal, but you'd lose the bloom/feedback/trail pipeline, which is most of why it looks good. I'd skip it.

Two things I'd flag rather than let you discover them:

Screensavers on recent macOS run inside a host process (legacyScreenSaver) rather than in System Settings directly, and that boundary has historically been where .saver bundles break — sandboxing, GPU context lifetime, preferences not persisting. My knowledge here has a cutoff and Apple has churned this area repeatedly, so verify the current state against Apple's docs before you architect around it; don't trust my recollection of which macOS version changed what.

And build for arm64 (or universal). A screensaver is a plugin loaded into a system process — if your architecture doesn't match the host's, it fails in ways that look like "my saver does nothing," which, after tonight, you have earned the right to be suspicious of.

If you want, I can transcribe physics.js to Swift and port the test harness with it — the seeded-RNG regression check would carry straight over, so you'd be able to prove the Swift
