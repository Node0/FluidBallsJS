(() => {
  'use strict';

  const root = window.FluidBalls = window.FluidBalls || {};

  class UI {
    constructor(settings, callbacks) {
      this.settings = settings;
      this.callbacks = callbacks;
      this.elementsBySetting = new Map();
      this.toastTimer = 0;
      this.bindSettings();
      this.bindButtons();
      this.syncAll();
    }

    bindSettings() {
      document.querySelectorAll('[data-setting]').forEach((element) => {
        const key = element.dataset.setting;
        if (!this.elementsBySetting.has(key)) this.elementsBySetting.set(key, []);
        this.elementsBySetting.get(key).push(element);
        const eventName = element.type === 'range' ? 'input' : 'change';
        element.addEventListener(eventName, () => {
          let value;
          if (element.type === 'checkbox') value = element.checked;
          else if (element.type === 'number' || element.type === 'range') value = Number(element.value);
          else value = element.value;
          this.settings[key] = value;
          this.syncSetting(key, element);
          if (key === 'sizeMode') this.syncSizeMode();
          if (key === 'colorMode') this.syncColorMode();
          if (key === 'renderMode') this.syncRenderMode();
          this.callbacks.onSettingChanged?.(key, value);
        });
        if (element.type === 'number') {
          element.addEventListener('input', () => {
            if (element.value === '' || !Number.isFinite(Number(element.value))) return;
            this.settings[key] = Number(element.value);
            this.syncSetting(key, element);
            this.callbacks.onSettingChanged?.(key, Number(element.value));
          });
        }
      });
    }

    bindButtons() {
      const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
      bind('pauseButton', () => this.callbacks.onPause?.());
      bind('stepButton', () => this.callbacks.onStep?.());
      bind('shakeButton', () => this.callbacks.onShake?.());
      bind('resetButton', () => this.callbacks.onReset?.());
      bind('randomizeButton', () => this.callbacks.onRandomize?.());
      bind('zeroVelocityButton', () => this.callbacks.onZeroVelocity?.());
      bind('reseedColorButton', () => this.callbacks.onReseedColors?.());
      bind('clearTrailsButton', () => this.callbacks.onClearTrails?.());
      bind('spawnButton', () => this.callbacks.onSpawn?.());
      bind('screenshotButton', () => this.callbacks.onScreenshot?.());
      bind('recordButton', () => this.callbacks.onRecord?.());
      bind('fullscreenButton', () => this.callbacks.onFullscreen?.());
      bind('applyPresetButton', () => {
        const select = document.getElementById('presetSelect');
        this.callbacks.onApplyPreset?.(select.value, select.selectedOptions[0]?.textContent ?? select.value);
      });
      bind('applyMaterialButton', () => this.callbacks.onApplyMaterial?.(
        document.getElementById('materialSelect').value,
        document.getElementById('materialKinetics').checked
      ));
      bind('savePresetButton', () => this.callbacks.onSavePreset?.());
      bind('loadPresetButton', () => this.callbacks.onLoadPreset?.());
      bind('exportPresetButton', () => this.callbacks.onExportPreset?.());
      bind('importPresetButton', () => document.getElementById('importPresetInput')?.click());
      document.getElementById('importPresetInput')?.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) this.callbacks.onImportPreset?.(file);
        event.target.value = '';
      });
      bind('tiltPermissionButton', () => this.callbacks.onTiltPermission?.());

      const panel = document.getElementById('panel');
      const openPanel = document.getElementById('openPanel');
      bind('collapsePanel', () => {
        panel.hidden = true;
        openPanel.hidden = false;
      });
      bind('openPanel', () => {
        panel.hidden = false;
        openPanel.hidden = true;
      });
    }

    syncSetting(key, source = null) {
      const elements = this.elementsBySetting.get(key) || [];
      for (const element of elements) {
        if (element === source) continue;
        if (element.type === 'checkbox') element.checked = Boolean(this.settings[key]);
        else element.value = this.settings[key];
      }
    }

    syncSizeMode() {
      const mode = this.settings.sizeMode === 'mixed' ? 'mixed' : 'single';
      document.querySelectorAll('[data-size-mode]').forEach((element) => {
        element.hidden = element.dataset.sizeMode !== mode;
      });
    }

    syncColorMode() {
      const mode = this.settings.colorMode;
      document.querySelectorAll('[data-color-mode]').forEach((element) => {
        element.hidden = element.dataset.colorMode !== mode;
      });
    }

    syncRenderMode() {
      const mode = this.settings.renderMode === 'metaball' ? 'metaball' : 'sphere';
      document.querySelectorAll('[data-render-mode]').forEach((element) => {
        element.hidden = element.dataset.renderMode !== mode;
      });
    }

    syncAll() {
      for (const key of this.elementsBySetting.keys()) this.syncSetting(key);
      this.syncSizeMode();
      this.syncColorMode();
      this.syncRenderMode();
    }

    setPaused(paused) {
      document.getElementById('pauseButton').textContent = paused ? 'Resume' : 'Pause';
    }

    setRecording(recording) {
      const button = document.getElementById('recordButton');
      button.textContent = recording ? 'Stop recording' : 'Record WebM';
      button.style.borderColor = recording ? '#ff668d' : '';
    }

    updateStats({ fps, frameMs, contacts, balls, gpu }) {
      document.getElementById('fpsValue').textContent = Math.round(fps);
      document.getElementById('frameValue').textContent = frameMs.toFixed(1);
      document.getElementById('collisionValue').textContent = contacts.toLocaleString();
      document.getElementById('ballValue').textContent = balls.toLocaleString();
      if (gpu) document.getElementById('gpuValue').textContent = gpu;
    }

    toast(message) {
      const element = document.getElementById('toast');
      element.textContent = message;
      element.classList.add('is-visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2200);
    }
  }

  root.UI = UI;
})();
