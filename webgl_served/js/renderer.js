(() => {
  'use strict';

  const root = window.FluidBalls = window.FluidBalls || {};
  const { hexToRgb } = root.utils;

  const BALL_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aCorner;
    layout(location=1) in vec2 aCenter;
    layout(location=2) in float aRadius;
    layout(location=3) in float aHue;
    layout(location=4) in float aEnergy;
    layout(location=5) in float aPressure;
    uniform vec2 uResolution;
    uniform float uHaloScale;
    out vec2 vLocal;
    out float vHue;
    out float vEnergy;
    out float vPressure;
    out float vScreenY;
    void main() {
      vec2 pixel = aCenter + aCorner * aRadius * uHaloScale;
      vec2 clip = pixel / uResolution * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      vLocal = aCorner * uHaloScale;
      vHue = aHue;
      vEnergy = aEnergy;
      vPressure = aPressure;
      // Normalised screen Y (0 top .. 1 bottom) for light-distance falloff.
      vScreenY = clamp(aCenter.y / uResolution.y, 0.0, 1.0);
    }
  `;

  // Shared surface lighting, called by BOTH the lit-sphere billboards and (from
  // Feature 3) the metaball surface pass — one material param set governs both.
  //   model 0 = sphere: light in normal space, strip highlight in billboard xy.
  //   model 1 = metaball: screen-space horizontal band (aquarium strip on water).
  // Injected into each fragment shader so lighting is never inlined per-shader.
  const LIGHTING_GLSL = `
    uniform vec3 uLightDir;
    uniform vec2 uHighlight;
    uniform float uStripWidth;
    uniform float uStripSoft;
    uniform float uSpecPower;
    uniform float uIor;
    uniform float uClarity;
    uniform float uTranslucency; // 0 opaque .. 1 see-through (real water in metaballs)
    uniform float uLightFalloff; // how fast the light reflection dims with distance
    uniform vec3 uTint;          // material base colour
    uniform float uTintStrength; // 0 = dynamic hue only .. 1 = full material tint
    uniform float uBandY;
    uniform float uBandWidth;

    // atten (0..1) scales the LIGHT-SOURCE reflection (specular + strip) by the
    // surface's proximity to the light, so distant balls no longer mirror the
    // strip as brightly as near ones. Body shading (ambient/diffuse/Fresnel) is
    // left intact so nothing goes black.
    vec3 shadeSurface(vec3 base, vec3 normal, float energy, float edgeShade, vec2 coord, float atten, int model) {
      float diffuse = max(dot(normal, uLightDir), 0.0);
      // Fresnel from index of refraction (Schlick): higher IOR => glassier edge.
      float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
      float fres = f0 + (1.0 - f0) * pow(1.0 - max(normal.z, 0.0), 5.0);
      float specular = pow(max(dot(reflect(-uLightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), uSpecPower);

      // Clarity blends matte (more ambient, muted highlights) <-> glossy.
      float ambient   = mix(0.20, 0.12, uClarity);
      float diffuseW  = mix(0.86, 0.90, uClarity);
      float specGain  = mix(0.55, 1.15, uClarity);
      float fresGain  = mix(0.30, 0.95, uClarity);
      float stripGain = mix(0.55, 0.95, uClarity);

      float highlight;
      if (model == 0) {
        // Anisotropic strip: wide in x, tight in y. Small width = round highlight.
        vec2 hp = coord - uHighlight;
        float sw = max(uStripWidth, 0.02);
        highlight = exp(-(hp.x * hp.x / (sw * sw) + hp.y * hp.y * uStripSoft));
      } else {
        // Screen-space horizontal band: highlight tracks blob position on screen.
        float dy = coord.y - uBandY;
        highlight = exp(-(dy * dy) / max(uBandWidth * uBandWidth, 1e-4));
      }

      vec3 color = base * (ambient + diffuseW * diffuse) * (0.62 + 0.38 * edgeShade);
      color += vec3(1.0) * specular * specGain * (0.75 + energy * 0.5) * atten;
      color += base * fres * fresGain;
      color += vec3(1.0) * highlight * stripGain * atten;
      color *= 0.78 + 0.35 * energy;
      return color;
    }
  `;

  const BALL_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vLocal;
    in float vHue;
    in float vEnergy;
    in float vScreenY;
    uniform float uGlow;
    uniform int uPass;
    ${LIGHTING_GLSL}
    out vec4 outColor;

    vec3 hsv2rgb(vec3 c) {
      vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
      return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }

    void main() {
      float d = length(vLocal);
      if (d > 1.72) discard;
      vec3 base = hsv2rgb(vec3(fract(vHue / 360.0), 0.82, 0.98));
      base = mix(base, uTint, uTintStrength);

      if (uPass == 1) {
        float halo = exp(-max(d - 0.66, 0.0) * 3.8) * smoothstep(1.72, 0.72, d);
        float core = smoothstep(1.02, 0.78, d);
        float brightness = (0.35 + 0.65 * vEnergy) * uGlow;
        outColor = vec4(base * (halo * brightness + core * 0.28 * brightness), halo);
        return;
      }

      if (d > 1.02) discard;
      float aa = fwidth(d) * 1.5;
      float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
      float z = sqrt(max(0.0, 1.0 - d * d));
      vec3 normal = normalize(vec3(vLocal, z));
      float edgeShade = smoothstep(1.0, 0.2, d);
      // Light-distance falloff: the strip reflection dims with a ball's screen
      // distance from the light height. uLightFalloff 0 => uniform (old look).
      float atten = exp(-uLightFalloff * abs(vScreenY - uBandY));
      vec3 color = shadeSurface(base, normal, vEnergy, edgeShade, vLocal, atten, 0);
      // Glassy translucency: the sphere centre (z~1, facing us) transmits, the
      // grazing edge (z~0) stays opaque. Default 0 keeps balls fully opaque;
      // real thickness-absorbed water arrives with the metaball surface pass.
      alpha *= 1.0 - 0.7 * uTranslucency * pow(max(z, 0.0), 1.3);
      outColor = vec4(color * alpha, alpha);
    }
  `;

  const FULLSCREEN_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aPosition;
    out vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const FEEDBACK_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uPrevious;
    uniform sampler2D uScene;
    uniform float uPersistence;
    uniform vec3 uBackground;
    out vec4 outColor;
    void main() {
      vec3 previous = texture(uPrevious, vUv).rgb;
      vec4 scene = texture(uScene, vUv);
      vec3 faded = max(previous - uBackground * (1.0 - uPersistence) * 0.02, vec3(0.0));
      vec3 color = faded * uPersistence + scene.rgb;
      outColor = vec4(color, 1.0);
    }
  `;

  const BLUR_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uTexelStep;
    out vec4 outColor;
    void main() {
      vec3 color = texture(uTexture, vUv).rgb * 0.227027;
      color += texture(uTexture, vUv + uTexelStep * 1.384615).rgb * 0.316216;
      color += texture(uTexture, vUv - uTexelStep * 1.384615).rgb * 0.316216;
      color += texture(uTexture, vUv + uTexelStep * 3.230769).rgb * 0.070270;
      color += texture(uTexture, vUv - uTexelStep * 3.230769).rgb * 0.070270;
      outColor = vec4(color, 1.0);
    }
  `;

  const COMPOSITE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uHistory;
    uniform sampler2D uBloom;
    uniform vec3 uBackground;
    uniform float uBloomStrength;
    uniform float uExposure;
    uniform bool uVignette;
    out vec4 outColor;
    void main() {
      vec3 color = texture(uHistory, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
      color += uBackground;
      color = vec3(1.0) - exp(-color * uExposure);
      if (uVignette) {
        vec2 q = vUv * 2.0 - 1.0;
        float vignette = smoothstep(1.45, 0.28, dot(q, q));
        color *= 0.68 + 0.32 * vignette;
      }
      outColor = vec4(color, 1.0);
    }
  `;

  // Metaball field runs at 1/FIELD_DIV resolution then upsamples — cheaper and
  // reads more liquid. Single constant so full-res is a one-line change.
  const FIELD_DIV = 2;

  // Field pass: reuse the ball vertex shader; additively splat each ball's smooth
  // radial kernel into a float target. RGB = ball colour premultiplied by the
  // kernel, A = kernel sum (the field / thickness). Overlapping balls sum, which
  // is what fuses them. u = |vLocal| / uFieldRadius is independent of pixel size.
  const FIELD_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vLocal;
    in float vHue;
    uniform float uFieldRadius;
    uniform vec3 uTint;
    uniform float uTintStrength;
    out vec4 outColor;
    vec3 hsv2rgb(vec3 c) {
      vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
      return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }
    void main() {
      float u = length(vLocal) / uFieldRadius;
      if (u >= 1.0) discard;
      float fall = 1.0 - u * u;
      fall = fall * fall * fall;
      vec3 base = hsv2rgb(vec3(fract(vHue / 360.0), 0.82, 0.98));
      base = mix(base, uTint, uTintStrength);
      outColor = vec4(base * fall, fall);
    }
  `;

  // Surface pass: threshold the field into a fused iso-surface, reconstruct the
  // normal from the field gradient, and light it with the SHARED shadeSurface
  // (model 1 = screen-space band). Translucency turns it into thickness-graded
  // water: thin iso edges read see-through, deep interior stays opaque.
  const SURFACE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uField;
    uniform vec2 uFieldTexel;
    uniform float uThreshold;
    uniform float uEdge;
    uniform float uSpecFusion; // normal-sampling radius (texels): fuses per-ball glints
    uniform float uMaxLod;     // clamp: 0 if field mipmaps are unavailable on this GPU
    ${LIGHTING_GLSL}
    out vec4 outColor;
    void main() {
      vec4 f = textureLod(uField, vUv, 0.0);
      float field = f.a;
      float mask = smoothstep(uThreshold - uEdge, uThreshold + uEdge, field);
      if (mask <= 0.001) { outColor = vec4(0.0); return; }
      vec3 blob = field > 1e-4 ? f.rgb / field : vec3(0.0);

      // Normal from a MIP level of the field — a true hardware low-pass. Raising
      // Specular fusion blurs the per-ball bumps away instead of undersampling
      // them into speckle (which is what the old wide Sobel did — the dark dots).
      // The silhouette/threshold above stays on mip 0, so blob edges keep crisp
      // while only the shading normal smooths. Y is screen-down-positive to match
      // the lit-sphere light convention.
      float fuse = max(uSpecFusion, 1.0);
      float lod = min(log2(fuse), uMaxLod);
      vec2 off = uFieldTexel * fuse;
      float l  = textureLod(uField, vUv - vec2(off.x, 0.0), lod).a;
      float r  = textureLod(uField, vUv + vec2(off.x, 0.0), lod).a;
      float dn = textureLod(uField, vUv - vec2(0.0, off.y), lod).a;
      float up = textureLod(uField, vUv + vec2(0.0, off.y), lod).a;
      vec3 normal = normalize(vec3(l - r, up - dn, 1.2));

      // Screen coords with top = 0 to match the light-height / band convention.
      vec2 screen = vec2(vUv.x, 1.0 - vUv.y);
      float atten = exp(-uLightFalloff * abs(screen.y - uBandY));
      vec3 color = shadeSurface(blob, normal, 0.35, mask, screen, atten, 1);

      // Thickness-graded translucency: thin edges transmit, deep interior opaque.
      float deep = 1.0 - exp(-max(field - uThreshold, 0.0) * 0.8);
      float a = mask * mix(1.0, 0.25 + 0.75 * deep, uTranslucency);
      outColor = vec4(color * a, a);
    }
  `;

  class WebGLRenderer {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.settings = settings;
      this.gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      if (!this.gl) throw new Error('WebGL 2 is unavailable in this browser or GPU configuration.');

      this.floatTargets = Boolean(
        this.gl.getExtension('EXT_color_buffer_float') &&
        this.gl.getExtension('OES_texture_float_linear')
      );
      this.maxInstances = 0;
      this.instanceData = new Float32Array(0);
      this.pixelRatio = 1;
      this.width = 1;
      this.height = 1;
      this.historyIndex = 0;
      this.contextLost = false;
      this.targets = null;

      canvas.addEventListener('webglcontextlost', (event) => this.onContextLost(event), false);
      canvas.addEventListener('webglcontextrestored', () => this.onContextRestored(), false);

      this.createResources();
    }

    // Without preventDefault() the browser never fires webglcontextrestored.
    onContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
      this.targets = null;
      this.maxInstances = 0;
      this.instanceData = new Float32Array(0);
      const reason = event.statusMessage || '(no status message)';
      console.error('[FluidBalls] WebGL context lost — rendering halted.', reason);
      this.canvas.dispatchEvent(new CustomEvent('fluidballs:contextlost', { detail: { reason } }));
    }

    onContextRestored() {
      console.warn('[FluidBalls] WebGL context restored — rebuilding GPU resources.');
      try {
        this.floatTargets = Boolean(
          this.gl.getExtension('EXT_color_buffer_float') &&
          this.gl.getExtension('OES_texture_float_linear')
        );
        this.createResources();
        this.contextLost = false;
        console.info('[FluidBalls] WebGL resources rebuilt; rendering resumed.');
        this.canvas.dispatchEvent(new CustomEvent('fluidballs:contextrestored'));
      } catch (error) {
        console.error('[FluidBalls] Could not rebuild WebGL resources after restore.', error);
        this.canvas.dispatchEvent(new CustomEvent('fluidballs:contextlost', { detail: { reason: error.message } }));
      }
    }

    // Every program, buffer, texture and framebuffer dies with the context,
    // so restore has to run the same setup the constructor does.
    createResources() {
      this.ballProgram = this.createProgram(BALL_VERTEX, BALL_FRAGMENT);
      this.fieldProgram = this.createProgram(BALL_VERTEX, FIELD_FRAGMENT);
      this.surfaceProgram = this.createProgram(FULLSCREEN_VERTEX, SURFACE_FRAGMENT);
      this.feedbackProgram = this.createProgram(FULLSCREEN_VERTEX, FEEDBACK_FRAGMENT);
      this.blurProgram = this.createProgram(FULLSCREEN_VERTEX, BLUR_FRAGMENT);
      this.compositeProgram = this.createProgram(FULLSCREEN_VERTEX, COMPOSITE_FRAGMENT);
      this.createGeometry();
      this.targets = null;
      this.resize();
    }

    get gpuDescription() {
      const gl = this.gl;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debug) return this.floatTargets ? 'WebGL2 · HDR targets' : 'WebGL2 · RGBA8 targets';
      const name = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
      return `${name} · ${this.floatTargets ? 'HDR' : 'RGBA8'}`;
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed:\n${message}`);
      }
      return shader;
    }

    createProgram(vertexSource, fragmentSource) {
      const gl = this.gl;
      const program = gl.createProgram();
      const vertex = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragment = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program linking failed:\n${message}`);
      }
      return program;
    }

    createGeometry() {
      const gl = this.gl;
      this.ballVao = gl.createVertexArray();
      gl.bindVertexArray(this.ballVao);

      const corners = new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
      ]);
      const quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      this.instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
      // 6 floats/instance: center.xy, radius, hue, energy, pressure. The pressure
      // slot is packed once here (Feature 1) so the metaball field pass (Feature
      // 3) can read per-ball load without a second stride change.
      const stride = 6 * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 2 * 4);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 3 * 4);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 4 * 4);
      gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 5 * 4);
      gl.vertexAttribDivisor(5, 1);
      gl.bindVertexArray(null);

      this.fullscreenVao = gl.createVertexArray();
      gl.bindVertexArray(this.fullscreenVao);
      const fullscreenBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    createTarget(width, height, mipmap = false) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Mipmapped targets (the metaball field) feed textureLod-based normal
      // smoothing; everything else stays plain LINEAR.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const internalFormat = this.floatTargets ? gl.RGBA16F : gl.RGBA8;
      const type = this.floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Unable to create a WebGL render target.');
      }
      return { texture, framebuffer, width, height };
    }

    // Multisampled colour renderbuffer for the lit-sphere pass; resolved into the
    // scene texture with blitFramebuffer. Returns null if this GPU can't do MSAA at
    // the chosen format (float MSAA is the shaky case), so the caller falls back to
    // direct rendering. Tries 4x then 2x samples.
    createMultisampleTarget(width, height) {
      const gl = this.gl;
      const format = this.floatTargets ? gl.RGBA16F : gl.RGBA8;
      const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
      for (const want of [4, 2]) {
        const samples = Math.min(want, maxSamples);
        if (samples < 2) break;
        const renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, width, height);
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (complete) return { framebuffer, renderbuffer, width, height, samples };
        gl.deleteRenderbuffer(renderbuffer);
        gl.deleteFramebuffer(framebuffer);
      }
      return null;
    }

    destroyTargets() {
      if (!this.targets) return;
      const gl = this.gl;
      Object.values(this.targets).flatMap((value) => Array.isArray(value) ? value : [value]).forEach((target) => {
        if (!target) return;
        if (target.texture) gl.deleteTexture(target.texture);
        if (target.renderbuffer) gl.deleteRenderbuffer(target.renderbuffer);
        gl.deleteFramebuffer(target.framebuffer);
      });
      this.targets = null;
    }

    resize() {
      const maxPixelRatio = window.innerWidth < 700 ? 1.5 : 2;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
      const displayWidth = Math.max(1, Math.floor(this.canvas.clientWidth * this.pixelRatio));
      const displayHeight = Math.max(1, Math.floor(this.canvas.clientHeight * this.pixelRatio));
      if (this.canvas.width === displayWidth && this.canvas.height === displayHeight && this.targets) return false;
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.width = displayWidth;
      this.height = displayHeight;
      this.destroyTargets();
      const bloomWidth = Math.max(1, Math.floor(displayWidth * 0.5));
      const bloomHeight = Math.max(1, Math.floor(displayHeight * 0.5));
      const fieldWidth = Math.max(1, Math.floor(displayWidth / FIELD_DIV));
      const fieldHeight = Math.max(1, Math.floor(displayHeight / FIELD_DIV));
      this.targets = {
        scene: this.createTarget(displayWidth, displayHeight),
        sceneMs: this.createMultisampleTarget(displayWidth, displayHeight),
        field: this.createTarget(fieldWidth, fieldHeight, true),
        history: [this.createTarget(displayWidth, displayHeight), this.createTarget(displayWidth, displayHeight)],
        bloom: [this.createTarget(bloomWidth, bloomHeight), this.createTarget(bloomWidth, bloomHeight)]
      };
      this.fieldMips = this.probeMipmap(this.targets.field);
      this.historyIndex = 0;
      this.clearHistory();
      return true;
    }

    // Some GPUs/drivers refuse generateMipmap on RGBA16F. Probe once per target
    // build; if it errors, drop the field back to plain LINEAR and signal the
    // shader (uMaxLod 0) so it samples mip 0 instead of a black incomplete mip.
    probeMipmap(target) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      gl.generateMipmap(gl.TEXTURE_2D);
      const ok = gl.getError() === gl.NO_ERROR;
      if (!ok) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return ok;
    }

    clearTarget(target, color = [0, 0, 0, 0]) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(color[0], color[1], color[2], color[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    clearHistory() {
      if (!this.targets) return;
      this.clearTarget(this.targets.history[0]);
      this.clearTarget(this.targets.history[1]);
      this.clearTarget(this.targets.scene);
      this.clearTarget(this.targets.bloom[0]);
      this.clearTarget(this.targets.bloom[1]);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    ensureInstanceCapacity(count) {
      if (count <= this.maxInstances) return;
      this.maxInstances = Math.max(count, Math.ceil(this.maxInstances * 1.5), 512);
      this.instanceData = new Float32Array(this.maxInstances * 6);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    }

    updateInstances(simulation, timeSeconds) {
      this.ensureInstanceCapacity(simulation.count);
      const mode = this.settings.colorMode;
      const baseHue = Number(this.settings.baseHue);
      const hueSpread = Number(this.settings.hueSpread);
      const cycle = timeSeconds * Number(this.settings.colorSpeed);
      // Pressure mode samples the physics load field. Diffusion (on by default)
      // averages it over the contact graph so packed clumps share one colour;
      // turned off, each ball maps its own load independently (more legible).
      const pressureField = mode === 'pressure'
        ? (this.settings.pressureDiffuse ? simulation.diffusePressure() : simulation.pSmooth)
        : null;
      const pressureScale = Math.max(0.001, Number(this.settings.pressureScale));
      for (let i = 0; i < simulation.count; i += 1) {
        const offset = i * 6;
        const speed = Math.hypot(simulation.vx[i], simulation.vy[i]);
        let energy = Math.min(1.5, speed / 900);
        let hue = baseHue;
        if (mode === 'cycle') hue += simulation.hueSeed[i] * hueSpread + cycle;
        else if (mode === 'speed') hue += Math.min(1, speed / 1100) * hueSpread + cycle * 0.2;
        else if (mode === 'direction') hue += ((Math.atan2(simulation.vy[i], simulation.vx[i]) / Math.PI + 1) * 0.5) * hueSpread + cycle * 0.15;
        else if (mode === 'pressure') {
          const load = Math.min(1, pressureField[i] / pressureScale);
          hue += load * hueSpread + cycle * 0.15;
          // Let dense regions read as hot: lift brightness with load so a packed
          // pile glows rather than just shifting hue. Velocity energy still wins
          // when a ball is both fast and loaded.
          energy = Math.max(energy, 0.28 + 0.72 * load);
        }
        else hue += cycle;
        this.instanceData[offset] = simulation.x[i] * this.pixelRatio;
        this.instanceData[offset + 1] = simulation.y[i] * this.pixelRatio;
        this.instanceData[offset + 2] = simulation.r[i] * this.pixelRatio;
        this.instanceData[offset + 3] = ((hue % 360) + 360) % 360;
        this.instanceData[offset + 4] = energy;
        // Cheap independent per-ball load [0,1] for the GPU (metaball field pass).
        // Always packed — diffusion stays CPU-side and strictly opt-in.
        this.instanceData[offset + 5] = Math.min(1, simulation.pSmooth[i] / pressureScale);
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, simulation.count * 6));
    }

    drawBalls(target, count, pass) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(this.ballProgram);
      gl.bindVertexArray(this.ballVao);
      gl.uniform2f(gl.getUniformLocation(this.ballProgram, 'uResolution'), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.ballProgram, 'uHaloScale'), pass === 1 ? 1.72 : 1.04);
      gl.uniform1f(gl.getUniformLocation(this.ballProgram, 'uGlow'), Number(this.settings.glow));
      gl.uniform1i(gl.getUniformLocation(this.ballProgram, 'uPass'), pass);
      this.setMaterialUniforms(this.ballProgram);

      gl.enable(gl.BLEND);
      if (pass === 1) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    // The one material param set (light + IOR/clarity/softness/translucency/band/
    // falloff), shared by the ball shader and the metaball surface pass so both
    // are lit identically. Light angle drives the diffuse direction (fixed
    // elevation matching the original constant) and the strip-highlight centre.
    setMaterialUniforms(program) {
      const gl = this.gl;
      const s = this.settings;
      const a = Number(s.lightAngle) * Math.PI / 180;
      const lx = Math.cos(a) * 0.737;
      const ly = Math.sin(a) * 0.737;
      const il = 1 / Math.hypot(lx, ly, 0.86);
      gl.uniform3f(gl.getUniformLocation(program, 'uLightDir'), lx * il, ly * il, 0.86 * il);
      gl.uniform2f(gl.getUniformLocation(program, 'uHighlight'), Math.cos(a) * 0.45, Math.sin(a) * 0.45);
      const soft = Number(s.lightSoftness);
      gl.uniform1f(gl.getUniformLocation(program, 'uStripWidth'), Number(s.lightWidth));
      gl.uniform1f(gl.getUniformLocation(program, 'uStripSoft'), 60 - 40 * soft);
      gl.uniform1f(gl.getUniformLocation(program, 'uSpecPower'), 90 - 74 * soft);
      gl.uniform1f(gl.getUniformLocation(program, 'uIor'), Number(s.ior));
      gl.uniform1f(gl.getUniformLocation(program, 'uClarity'), Number(s.clarity));
      gl.uniform1f(gl.getUniformLocation(program, 'uTranslucency'), Number(s.translucency));
      gl.uniform1f(gl.getUniformLocation(program, 'uLightFalloff'), Number(s.lightFalloff));
      const tint = hexToRgb(s.tintColor);
      gl.uniform3f(gl.getUniformLocation(program, 'uTint'), tint[0], tint[1], tint[2]);
      gl.uniform1f(gl.getUniformLocation(program, 'uTintStrength'), Number(s.tintStrength));
      gl.uniform1f(gl.getUniformLocation(program, 'uBandY'), Number(s.bandPosition));
      gl.uniform1f(gl.getUniformLocation(program, 'uBandWidth'), Number(s.bandWidth));
    }

    // Metaball field pass: additively splat every ball's smooth kernel into the
    // half-res float field target. Reuses the ball VAO/instance buffer and vertex
    // shader; uResolution stays full-res so clip positions are correct while the
    // smaller viewport does the downsampling.
    drawField(count) {
      const gl = this.gl;
      const field = this.targets.field;
      const radius = Number(this.settings.fieldRadius);
      gl.bindFramebuffer(gl.FRAMEBUFFER, field.framebuffer);
      gl.viewport(0, 0, field.width, field.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.fieldProgram);
      gl.bindVertexArray(this.ballVao);
      gl.uniform2f(gl.getUniformLocation(this.fieldProgram, 'uResolution'), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'uHaloScale'), radius);
      gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'uFieldRadius'), radius);
      const tint = hexToRgb(this.settings.tintColor);
      gl.uniform3f(gl.getUniformLocation(this.fieldProgram, 'uTint'), tint[0], tint[1], tint[2]);
      gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'uTintStrength'), Number(this.settings.tintStrength));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    // Metaball surface pass: threshold the field into a lit, fused iso-surface.
    drawSurface() {
      const gl = this.gl;
      const field = this.targets.field;
      this.drawFullscreen(this.surfaceProgram, this.targets.scene, (program) => {
        this.bindTexture(program, 'uField', 0, field.texture);
        gl.uniform2f(gl.getUniformLocation(program, 'uFieldTexel'), 1 / field.width, 1 / field.height);
        gl.uniform1f(gl.getUniformLocation(program, 'uThreshold'), Number(this.settings.fusionThreshold));
        gl.uniform1f(gl.getUniformLocation(program, 'uEdge'), Number(this.settings.edgeSoftness));
        gl.uniform1f(gl.getUniformLocation(program, 'uSpecFusion'), Math.max(1, Number(this.settings.specFusion)));
        gl.uniform1f(gl.getUniformLocation(program, 'uMaxLod'), this.fieldMips ? 16 : 0);
        this.setMaterialUniforms(program);
      });
    }

    bindTexture(program, uniformName, unit, texture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, uniformName), unit);
    }

    drawFullscreen(program, target, configure) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : this.width, target ? target.height : this.height);
      gl.useProgram(program);
      gl.bindVertexArray(this.fullscreenVao);
      configure?.(program);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    render(simulation, timeSeconds) {
      if (this.contextLost) return;
      this.resize();
      this.updateInstances(simulation, timeSeconds);
      const gl = this.gl;
      const [r, g, b] = hexToRgb(this.settings.backgroundColor);

      const metaball = this.settings.renderMode === 'metaball';
      this.clearTarget(this.targets.scene);
      if (metaball) {
        this.drawField(simulation.count);
        // Build the field mip chain: the surface pass reads the normal from a mip
        // level so widening Specular fusion low-passes the per-ball bumps away
        // instead of undersampling them into speckle. Skipped if the GPU rejected
        // float mipmaps (probe) — the shader then clamps to mip 0.
        if (this.fieldMips) {
          gl.bindTexture(gl.TEXTURE_2D, this.targets.field.texture);
          gl.generateMipmap(gl.TEXTURE_2D);
        }
        this.drawSurface();
      } else if (this.settings.msaa && this.targets.sceneMs) {
        // Lit spheres into the multisampled buffer, then blit-resolve into the
        // scene texture the rest of the pipeline reads. Only sphere mode needs
        // this — the metaball iso edge is already smoothstep-antialiased.
        const ms = this.targets.sceneMs;
        this.clearTarget(ms);
        this.drawBalls(ms, simulation.count, 0);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.targets.scene.framebuffer);
        gl.blitFramebuffer(0, 0, ms.width, ms.height, 0, 0, this.targets.scene.width, this.targets.scene.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        this.drawBalls(this.targets.scene, simulation.count, 0);
      }

      // Bloom is decoupled from render mode: sphere mode redraws additive ball
      // halos as the source; metaball mode has no halos, so it seeds from the
      // blob scene. The on/off toggle is identical in both.
      const bloomEnabled = Boolean(this.settings.bloomEnabled) && Number(this.settings.bloomStrength) > 0;
      if (bloomEnabled) {
        this.clearTarget(this.targets.bloom[0]);
        if (metaball) {
          this.drawFullscreen(this.blurProgram, this.targets.bloom[0], (program) => {
            this.bindTexture(program, 'uTexture', 0, this.targets.scene.texture);
            gl.uniform2f(gl.getUniformLocation(program, 'uTexelStep'), 1 / this.targets.bloom[0].width, 0);
          });
        } else {
          this.drawBalls(this.targets.bloom[0], simulation.count, 1);
        }
        for (let iteration = 0; iteration < 2; iteration += 1) {
          this.drawFullscreen(this.blurProgram, this.targets.bloom[1], (program) => {
            this.bindTexture(program, 'uTexture', 0, this.targets.bloom[0].texture);
            gl.uniform2f(gl.getUniformLocation(program, 'uTexelStep'), 1 / this.targets.bloom[0].width, 0);
          });
          this.drawFullscreen(this.blurProgram, this.targets.bloom[0], (program) => {
            this.bindTexture(program, 'uTexture', 0, this.targets.bloom[1].texture);
            gl.uniform2f(gl.getUniformLocation(program, 'uTexelStep'), 0, 1 / this.targets.bloom[1].height);
          });
        }
      } else {
        this.clearTarget(this.targets.bloom[0]);
      }

      const previous = this.targets.history[this.historyIndex];
      const current = this.targets.history[1 - this.historyIndex];
      this.drawFullscreen(this.feedbackProgram, current, (program) => {
        this.bindTexture(program, 'uPrevious', 0, previous.texture);
        this.bindTexture(program, 'uScene', 1, this.targets.scene.texture);
        gl.uniform1f(gl.getUniformLocation(program, 'uPersistence'), Number(this.settings.trailPersistence));
        gl.uniform3f(gl.getUniformLocation(program, 'uBackground'), r, g, b);
      });
      this.historyIndex = 1 - this.historyIndex;

      this.drawFullscreen(this.compositeProgram, null, (program) => {
        this.bindTexture(program, 'uHistory', 0, current.texture);
        this.bindTexture(program, 'uBloom', 1, this.targets.bloom[0].texture);
        gl.uniform3f(gl.getUniformLocation(program, 'uBackground'), r, g, b);
        gl.uniform1f(gl.getUniformLocation(program, 'uBloomStrength'), bloomEnabled ? Number(this.settings.bloomStrength) : 0);
        gl.uniform1f(gl.getUniformLocation(program, 'uExposure'), Number(this.settings.exposure));
        gl.uniform1i(gl.getUniformLocation(program, 'uVignette'), this.settings.vignette ? 1 : 0);
      });
    }

    screenshot() {
      return new Promise((resolve, reject) => {
        this.canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Screenshot capture failed.')), 'image/png');
      });
    }
  }

  root.WebGLRenderer = WebGLRenderer;
})();
