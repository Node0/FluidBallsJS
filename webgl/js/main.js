(() => {
  'use strict';

  const root = window.FluidBalls;
  // Boot into the "Synaptic Cascades" showcase preset (falls back to plain
  // defaults if it is ever removed). The preset dropdown lists it too.
  const settings = { ...root.DEFAULTS, ...(root.PRESETS.synaptic || {}) };
  const canvas = document.getElementById('fluidCanvas');
  const fatalError = document.getElementById('fatalError');

  let simulation;
  let renderer;
  let ui;
  let paused = false;
  let accumulator = 0;
  let previousTime = performance.now();
  let lastStatsTime = previousTime;
  let statsFrames = 0;
  let statsFrameMs = 0;
  let mediaRecorder = null;
  let recordingChunks = [];

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applySettings(next) {
    Object.assign(settings, next);
    ui?.syncAll();
    simulation?.setCount(Number(settings.ballCount));
    simulation?.resizeGrid();
    renderer?.clearHistory();
  }

  function setPaused(value) {
    paused = value;
    ui.setPaused(paused);
    if (!paused) previousTime = performance.now();
  }

  function installPointerControls() {
    const getPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * simulation.width / rect.width,
        y: (event.clientY - rect.top) * simulation.height / rect.height
      };
    };

    canvas.addEventListener('pointerdown', (event) => {
      const point = getPoint(event);
      if (event.button === 1 || event.shiftKey) {
        simulation.spawnBurst(point.x, point.y, 18);
        settings.ballCount = simulation.count;
        ui.syncSetting('ballCount');
        ui.toast('Spawned 18 balls');
        event.preventDefault();
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      simulation.pointerDown(point.x, point.y, event.button);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
      const point = getPoint(event);
      simulation.pointerMove(point.x, point.y);
    });
    canvas.addEventListener('pointerup', () => simulation.pointerUp());
    canvas.addEventListener('pointercancel', () => simulation.pointerUp());
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      settings.gravityMode = 'manual';
      settings.gravityAngle = (Number(settings.gravityAngle) + Math.sign(event.deltaY) * 5 + 360) % 360;
      ui.syncSetting('gravityMode');
      ui.syncSetting('gravityAngle');
      event.preventDefault();
    }, { passive: false });
  }

  function installKeyboardControls() {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === 'Space') {
        setPaused(!paused);
        event.preventDefault();
      } else if (event.key.toLowerCase() === 'r') {
        simulation.reset();
        renderer.clearHistory();
        ui.toast('Simulation reset');
      } else if (event.key.toLowerCase() === 's') {
        simulation.shake();
        ui.toast('Box shaken');
      } else if (event.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    });
  }

  async function requestTiltPermission() {
    try {
      if (typeof DeviceOrientationEvent === 'undefined') {
        ui.toast('Device orientation is unavailable here');
        return;
      }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('Permission not granted');
      }
      window.addEventListener('deviceorientation', (event) => {
        const gamma = Number(event.gamma) || 0;
        const beta = Number(event.beta) || 0;
        simulation.setTilt(gamma / 45, beta / 45);
      });
      settings.gravityMode = 'tilt';
      ui.syncSetting('gravityMode');
      ui.toast('Device tilt gravity enabled');
    } catch (error) {
      ui.toast(`Tilt permission failed: ${error.message}`);
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      ui.toast(`Fullscreen failed: ${error.message}`);
    }
  }

  async function takeScreenshot() {
    try {
      const blob = await renderer.screenshot();
      downloadBlob(blob, `fluidballs-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
      ui.toast('Screenshot saved');
    } catch (error) {
      ui.toast(error.message);
    }
  }

  function toggleRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      ui.toast('WebM recording is unavailable in this browser');
      return;
    }
    const stream = canvas.captureStream(60);
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
    recordingChunks = [];
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      downloadBlob(blob, `fluidballs-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`);
      ui.setRecording(false);
      ui.toast('WebM recording saved');
      mediaRecorder = null;
    };
    mediaRecorder.start(1000);
    ui.setRecording(true);
    ui.toast('Recording started');
  }

  function savePreset() {
    localStorage.setItem('fluidballs.customPreset', JSON.stringify(settings));
    ui.toast('Current settings saved locally');
  }

  function loadPreset() {
    try {
      const raw = localStorage.getItem('fluidballs.customPreset');
      if (!raw) {
        ui.toast('No local preset has been saved');
        return;
      }
      applySettings(sanitizeSettings(JSON.parse(raw)));
      ui.toast('Local preset loaded');
    } catch (error) {
      ui.toast(`Preset load failed: ${error.message}`);
    }
  }

  // Whitelist an incoming settings object against DEFAULTS so a malformed or
  // hostile shared file can never wedge the sim: unknown keys are dropped, types
  // are coerced to match DEFAULTS, numbers are clamped to their control's range,
  // and enum strings must match an actual <select> option.
  function sanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const clean = {};
    for (const key of Object.keys(root.DEFAULTS)) {
      if (!(key in raw)) continue;
      const def = root.DEFAULTS[key];
      const value = raw[key];
      if (typeof def === 'boolean') {
        clean[key] = Boolean(value);
      } else if (typeof def === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) continue;
        const input = document.querySelector(`input[type="range"][data-setting="${key}"], input[type="number"][data-setting="${key}"]`);
        clean[key] = (input && input.min !== '' && input.max !== '')
          ? Math.min(Number(input.max), Math.max(Number(input.min), n))
          : n;
      } else {
        const str = String(value);
        const select = document.querySelector(`select[data-setting="${key}"]`);
        if (select) {
          if ([...select.options].some((option) => option.value === str)) clean[key] = str;
        } else if (/^#[0-9a-fA-F]{3,8}$/.test(str)) {
          clean[key] = str;
        }
      }
    }
    return clean;
  }

  function exportPreset() {
    const payload = JSON.stringify({ version: 1, app: 'fluidballs', settings }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    downloadBlob(blob, `fluidballs-${new Date().toISOString().replace(/[:.]/g, '-')}.fluidballs.json`);
    ui.toast('Preset exported to file');
  }

  function importPreset(file) {
    const reader = new FileReader();
    reader.onerror = () => ui.toast('Could not read that file');
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const raw = parsed && typeof parsed === 'object' && parsed.settings ? parsed.settings : parsed;
        const clean = sanitizeSettings(raw);
        const count = Object.keys(clean).length;
        if (!count) {
          ui.toast('No recognizable settings in that file');
          return;
        }
        applySettings(clean);
        ui.toast(`Loaded ${count} setting${count === 1 ? '' : 's'} from file`);
      } catch (error) {
        ui.toast(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function onResize() {
    const rect = canvas.getBoundingClientRect();
    simulation.setBounds(rect.width, rect.height);
    renderer.resize();
  }

  function tick(now) {
    const frameStart = performance.now();
    const frameSeconds = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    const fixedDt = 1 / Math.max(30, Number(settings.physicsHz));

    if (!paused) {
      accumulator += frameSeconds;
      let substeps = 0;
      const maxSubsteps = 8;
      while (accumulator >= fixedDt && substeps < maxSubsteps) {
        simulation.step(fixedDt);
        accumulator -= fixedDt;
        substeps += 1;
      }
      if (substeps === maxSubsteps) accumulator = 0;
    }

    renderer.render(simulation, now / 1000);
    statsFrames += 1;
    statsFrameMs += performance.now() - frameStart;
    if (now - lastStatsTime >= 500) {
      const elapsed = (now - lastStatsTime) / 1000;
      ui.updateStats({
        fps: statsFrames / elapsed,
        frameMs: statsFrameMs / statsFrames,
        contacts: simulation.contactCount,
        balls: simulation.count,
        gpu: renderer.gpuDescription
      });
      statsFrames = 0;
      statsFrameMs = 0;
      lastStatsTime = now;
    }
    requestAnimationFrame(tick);
  }

  try {
    simulation = new root.Simulation(settings);
    renderer = new root.WebGLRenderer(canvas, settings);
    ui = new root.UI(settings, {
      onSettingChanged(key, value) {
        if (key === 'ballCount') simulation.setCount(value);
        if (key === 'radius' || key === 'radiusMin' || key === 'radiusMax' || key === 'sizeMode') {
          simulation.refreshRadii();
          simulation.resizeGrid();
          simulation.setBounds(simulation.width, simulation.height);
        }
        if (key === 'backgroundColor' || key === 'trailPersistence') renderer.clearHistory();
      },
      onPause: () => setPaused(!paused),
      onStep: () => {
        if (!paused) setPaused(true);
        simulation.step(1 / Math.max(30, Number(settings.physicsHz)));
      },
      onShake: () => { simulation.shake(); ui.toast('Box shaken'); },
      onReset: () => { simulation.reset(); renderer.clearHistory(); ui.toast('Simulation reset'); },
      onRandomize: () => { simulation.randomizeVelocities(); ui.toast('Velocities randomized'); },
      onZeroVelocity: () => { simulation.zeroVelocities(); ui.toast('Velocity zeroed'); },
      onReseedColors: () => { simulation.reseedColors(); ui.toast('Color seeds randomized'); },
      onClearTrails: () => { renderer.clearHistory(); ui.toast('Trails cleared'); },
      onSpawn: () => {
        simulation.spawnBurst(undefined, undefined, 32);
        settings.ballCount = simulation.count;
        ui.syncSetting('ballCount');
        ui.toast('Spawned 32 balls');
      },
      onScreenshot: takeScreenshot,
      onRecord: toggleRecording,
      onFullscreen: toggleFullscreen,
      onApplyPreset: (name, label) => {
        applySettings(root.PRESETS[name]);
        simulation.reset();
        ui.toast(`Applied ${label || name} preset`);
      },
      onApplyMaterial: (name, withKinetics) => {
        const material = root.MATERIALS[name];
        if (!material) return;
        applySettings({ ...material.shading, ...(withKinetics ? material.physics : {}) });
        ui.toast(`Applied ${name}${withKinetics ? ' + kinetics' : ' (look only)'}`);
      },
      onSavePreset: savePreset,
      onLoadPreset: loadPreset,
      onExportPreset: exportPreset,
      onImportPreset: importPreset,
      onTiltPermission: requestTiltPermission
    });

    canvas.addEventListener('fluidballs:contextlost', (event) => {
      fatalError.hidden = false;
      fatalError.textContent = `FluidBalls lost the GPU context.\n\n${event.detail.reason}\n\nWaiting for the browser to restore it…`;
    });
    canvas.addEventListener('fluidballs:contextrestored', () => {
      fatalError.hidden = true;
      fatalError.textContent = '';
      previousTime = performance.now();
      accumulator = 0;
    });

    installPointerControls();
    installKeyboardControls();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      previousTime = performance.now();
      accumulator = 0;
    });
    onResize();
    simulation.reset();
    requestAnimationFrame(tick);
  } catch (error) {
    console.error(error);
    fatalError.hidden = false;
    fatalError.textContent = `FluidBalls could not start.\n\n${error.message}\n\nTry enabling hardware acceleration or opening this file in a current Chrome, Edge, Firefox, or Safari build.`;
  }
})();
