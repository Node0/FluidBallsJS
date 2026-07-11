(() => {
  'use strict';

  const root = window.FluidBalls = window.FluidBalls || {};

  root.DEFAULTS = Object.freeze({
    ballCount: 700,
    sizeMode: 'single',
    radius: 9,
    radiusMin: 4,
    radiusMax: 14,
    solverIterations: 3,
    physicsHz: 120,
    compliance: 0.00002,

    gravityMode: 'cardinal',
    gravityStrength: 780,
    gravityAngle: 90,
    gravityCycleTime: 5,
    gravityTransitionTime: 1.2,
    windStrength: 50,
    windAngle: 0,
    windTurbulence: 0.14,

    elasticity: 0.84,
    wallBounce: 0.88,
    airDrag: 0.18,
    contactViscosity: 0.12,
    clumpAffinity: 0,
    splitEnergy: 300,

    renderMode: 'sphere',
    fusionThreshold: 0.35,
    edgeSoftness: 0.08,
    fieldRadius: 1.5,
    specFusion: 6,

    colorMode: 'cycle',
    baseHue: 205,
    hueSpread: 88,
    colorSpeed: 14,
    pressureScale: 16,
    pressureDiffuse: false,
    glow: 1.05,
    bloomStrength: 1.25,
    trailPersistence: 0.68,
    exposure: 1.18,
    backgroundColor: '#02050b',
    bloomEnabled: true,
    vignette: true,

    lightAngle: 229,
    lightWidth: 0.16,
    lightSoftness: 0.62,
    ior: 1.45,
    clarity: 0.5,
    translucency: 0,
    lightFalloff: 0,
    bandPosition: 0.28,
    bandWidth: 0.15,

    mouseMode: 'attract',
    mouseStrength: 3600,
    mouseRadius: 220
  });

  root.PRESETS = Object.freeze({
    classic: {
      gravityMode: 'cardinal', gravityStrength: 780, gravityCycleTime: 5,
      elasticity: 0.84, wallBounce: 0.88, airDrag: 0.18,
      colorMode: 'cycle', baseHue: 205, hueSpread: 78, colorSpeed: 12,
      glow: 1.0, bloomStrength: 1.2, trailPersistence: 0.62,
      backgroundColor: '#02050b'
    },
    mercury: {
      gravityMode: 'wander', gravityStrength: 520, gravityCycleTime: 7,
      elasticity: 0.38, wallBounce: 0.52, airDrag: 0.38, contactViscosity: 0.48,
      colorMode: 'mono', baseHue: 196, hueSpread: 8, colorSpeed: 0,
      glow: 1.65, bloomStrength: 1.8, trailPersistence: 0.78,
      backgroundColor: '#05080b'
    },
    lava: {
      gravityMode: 'rotate', gravityStrength: 240, gravityCycleTime: 18,
      windStrength: 80, windTurbulence: 0.4,
      elasticity: 0.58, wallBounce: 0.62, airDrag: 0.5, contactViscosity: 0.3,
      colorMode: 'cycle', baseHue: 350, hueSpread: 72, colorSpeed: 7,
      glow: 2.1, bloomStrength: 2.35, trailPersistence: 0.86,
      exposure: 1.35, backgroundColor: '#090105'
    },
    orbit: {
      gravityMode: 'manual', gravityStrength: 0,
      windStrength: 0, windTurbulence: 0,
      elasticity: 1.0, wallBounce: 1.0, airDrag: 0.012, contactViscosity: 0.01,
      colorMode: 'direction', baseHue: 190, hueSpread: 250, colorSpeed: 3,
      glow: 1.15, bloomStrength: 1.45, trailPersistence: 0.91,
      backgroundColor: '#000006'
    },
    storm: {
      gravityMode: 'wander', gravityStrength: 1100, gravityCycleTime: 1.8,
      gravityTransitionTime: 0.28, windStrength: 700, windAngle: 15, windTurbulence: 0.85,
      elasticity: 0.96, wallBounce: 0.96, airDrag: 0.08,
      colorMode: 'speed', baseHue: 210, hueSpread: 155, colorSpeed: 4,
      glow: 1.35, bloomStrength: 1.7, trailPersistence: 0.78,
      backgroundColor: '#010107'
    }
  });

  root.utils = {
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    smoothstep(t) {
      const x = Math.max(0, Math.min(1, t));
      return x * x * (3 - 2 * x);
    },

    shortestAngleDelta(from, to) {
      let delta = (to - from) % 360;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      return delta;
    },

    hexToRgb(hex) {
      const normalized = hex.replace('#', '');
      const value = Number.parseInt(normalized.length === 3
        ? normalized.split('').map((c) => c + c).join('')
        : normalized, 16);
      return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    }
  };
})();
