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
    uniform vec2 uResolution;
    uniform float uHaloScale;
    out vec2 vLocal;
    out float vHue;
    out float vEnergy;
    void main() {
      vec2 pixel = aCenter + aCorner * aRadius * uHaloScale;
      vec2 clip = pixel / uResolution * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      vLocal = aCorner * uHaloScale;
      vHue = aHue;
      vEnergy = aEnergy;
    }
  `;

  const BALL_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vLocal;
    in float vHue;
    in float vEnergy;
    uniform float uGlow;
    uniform int uPass;
    out vec4 outColor;

    vec3 hsv2rgb(vec3 c) {
      vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
      return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }

    void main() {
      float d = length(vLocal);
      if (d > 1.72) discard;
      vec3 base = hsv2rgb(vec3(fract(vHue / 360.0), 0.82, 0.98));

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
      vec3 light = normalize(vec3(-0.48, -0.56, 0.86));
      float diffuse = max(dot(normal, light), 0.0);
      float rim = pow(1.0 - max(normal.z, 0.0), 2.2);
      float specular = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 44.0);
      float edgeShade = smoothstep(1.0, 0.2, d);
      vec3 color = base * (0.16 + 0.88 * diffuse) * (0.62 + 0.38 * edgeShade);
      color += vec3(1.0) * specular * (0.75 + vEnergy * 0.5);
      color += base * rim * 0.38;
      vec2 highlightPos = vLocal - vec2(-0.30, -0.34);
      color += vec3(1.0) * exp(-dot(highlightPos, highlightPos) * 42.0) * 0.75;
      color *= 0.78 + 0.35 * vEnergy;
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
      const stride = 5 * 4;
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

    createTarget(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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

    destroyTargets() {
      if (!this.targets) return;
      const gl = this.gl;
      Object.values(this.targets).flatMap((value) => Array.isArray(value) ? value : [value]).forEach((target) => {
        if (!target) return;
        gl.deleteTexture(target.texture);
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
      this.targets = {
        scene: this.createTarget(displayWidth, displayHeight),
        history: [this.createTarget(displayWidth, displayHeight), this.createTarget(displayWidth, displayHeight)],
        bloom: [this.createTarget(bloomWidth, bloomHeight), this.createTarget(bloomWidth, bloomHeight)]
      };
      this.historyIndex = 0;
      this.clearHistory();
      return true;
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
      this.instanceData = new Float32Array(this.maxInstances * 5);
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
      for (let i = 0; i < simulation.count; i += 1) {
        const offset = i * 5;
        const speed = Math.hypot(simulation.vx[i], simulation.vy[i]);
        const energy = Math.min(1.5, speed / 900);
        let hue = baseHue;
        if (mode === 'cycle') hue += simulation.hueSeed[i] * hueSpread + cycle;
        else if (mode === 'speed') hue += Math.min(1, speed / 1100) * hueSpread + cycle * 0.2;
        else if (mode === 'direction') hue += ((Math.atan2(simulation.vy[i], simulation.vx[i]) / Math.PI + 1) * 0.5) * hueSpread + cycle * 0.15;
        else hue += cycle;
        this.instanceData[offset] = simulation.x[i] * this.pixelRatio;
        this.instanceData[offset + 1] = simulation.y[i] * this.pixelRatio;
        this.instanceData[offset + 2] = simulation.r[i] * this.pixelRatio;
        this.instanceData[offset + 3] = ((hue % 360) + 360) % 360;
        this.instanceData[offset + 4] = energy;
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, simulation.count * 5));
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
      gl.enable(gl.BLEND);
      if (pass === 1) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
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

      this.clearTarget(this.targets.scene);
      this.drawBalls(this.targets.scene, simulation.count, 0);

      const bloomEnabled = Boolean(this.settings.bloomEnabled) && Number(this.settings.bloomStrength) > 0;
      if (bloomEnabled) {
        this.clearTarget(this.targets.bloom[0]);
        this.drawBalls(this.targets.bloom[0], simulation.count, 1);
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
