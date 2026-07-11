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
    msaa: true,

    lightAngle: 229,
    lightWidth: 0.16,
    lightSoftness: 0.62,
    ior: 1.45,
    clarity: 0.5,
    translucency: 0,
    lightFalloff: 0,
    bandPosition: 0.28,
    bandWidth: 0.15,
    tintColor: '#66d8ff',
    tintStrength: 0,

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

  // Materials are curated bundles over the shared knobs. `shading` is always
  // applied; `physics` only when the "also apply kinetics" checkbox is on.
  // Values are starting points — everything stays live-tunable afterward.
  root.MATERIALS = Object.freeze({
    jelly: {
      shading: {
        renderMode: 'metaball', fusionThreshold: 0.35, edgeSoftness: 0.08, specFusion: 5,
        translucency: 0.55, clarity: 0.75, ior: 1.4, lightFalloff: 1.5,
        glow: 1.15, bloomStrength: 1.2, tintColor: '#3fe6a6', tintStrength: 0.6
      },
      physics: {
        elasticity: 1.05, wallBounce: 0.92, airDrag: 0.08, contactViscosity: 0.05,
        clumpAffinity: 2600, splitEnergy: 520, compliance: 0.0003, sizeMode: 'single'
      }
    },
    ocean: {
      shading: {
        renderMode: 'metaball', fusionThreshold: 0.3, edgeSoftness: 0.1, specFusion: 8,
        translucency: 0.72, clarity: 0.85, ior: 1.33, lightFalloff: 2.2, bandPosition: 0.14,
        glow: 1.0, bloomStrength: 1.1, tintColor: '#2aa6ff', tintStrength: 0.55
      },
      physics: {
        elasticity: 0.42, wallBounce: 0.5, airDrag: 0.2, contactViscosity: 0.35,
        clumpAffinity: 1300, splitEnergy: 240, compliance: 0.00002, sizeMode: 'single'
      }
    },
    mud: {
      shading: {
        renderMode: 'metaball', fusionThreshold: 0.42, edgeSoftness: 0.06, specFusion: 6,
        translucency: 0.08, clarity: 0.2, ior: 1.3, lightFalloff: 1.0,
        glow: 0.7, bloomStrength: 0.5, tintColor: '#6b4a2b', tintStrength: 0.85
      },
      physics: {
        elasticity: 0.1, wallBounce: 0.2, airDrag: 0.5, contactViscosity: 0.7,
        clumpAffinity: 3600, splitEnergy: 760, compliance: 0, sizeMode: 'single'
      }
    },
    vapor: {
      shading: {
        renderMode: 'metaball', fusionThreshold: 0.22, edgeSoftness: 0.16, specFusion: 11,
        translucency: 0.9, clarity: 0.55, ior: 1.1, lightFalloff: 0.5,
        glow: 1.4, bloomStrength: 2.0, tintColor: '#dfe8ff', tintStrength: 0.5
      },
      physics: {
        elasticity: 0.85, wallBounce: 0.85, airDrag: 0.8, contactViscosity: 0.05,
        clumpAffinity: 0, splitEnergy: 120, sizeMode: 'mixed', radiusMin: 3, radiusMax: 9
      }
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
