(() => {
  'use strict';

  const root = window.FluidBalls = window.FluidBalls || {};
  const { clamp, shortestAngleDelta, smoothstep } = root.utils;

  class Simulation {
    constructor(settings) {
      this.settings = settings;
      this.width = 1;
      this.height = 1;
      this.capacity = 0;
      this.count = 0;
      this.x = new Float32Array(0);
      this.y = new Float32Array(0);
      this.prevX = new Float32Array(0);
      this.prevY = new Float32Array(0);
      this.vx = new Float32Array(0);
      this.vy = new Float32Array(0);
      this.r = new Float32Array(0);
      this.invMass = new Float32Array(0);
      this.hueSeed = new Float32Array(0);
      this.next = new Int32Array(0);
      this.head = new Int32Array(0);
      this.cols = 1;
      this.rows = 1;
      this.cellSize = 1;
      this.contactCount = 0;
      this.simulationTime = 0;
      this.gravityAngleCurrent = Number(settings.gravityAngle);
      this.gravityAngleStart = this.gravityAngleCurrent;
      this.gravityAngleTarget = this.gravityAngleCurrent;
      this.gravityCycleElapsed = 0;
      this.gravityTransitionElapsed = Number(settings.gravityTransitionTime);
      this.pointer = {
        active: false,
        x: 0,
        y: 0,
        previousX: 0,
        previousY: 0,
        forceSign: 1,
        draggedIndex: -1
      };
      this.tilt = { x: 0, y: 1, available: false };
      this.ensureCapacity(Number(settings.ballCount));
      this.setCount(Number(settings.ballCount), true);
    }

    ensureCapacity(required) {
      if (required <= this.capacity) return;
      const nextCapacity = Math.max(required, Math.ceil(this.capacity * 1.5), 256);
      const grow = (oldArray, Type = Float32Array) => {
        const next = new Type(nextCapacity);
        next.set(oldArray);
        return next;
      };
      this.x = grow(this.x);
      this.y = grow(this.y);
      this.prevX = grow(this.prevX);
      this.prevY = grow(this.prevY);
      this.vx = grow(this.vx);
      this.vy = grow(this.vy);
      this.r = grow(this.r);
      this.invMass = grow(this.invMass);
      this.hueSeed = grow(this.hueSeed);
      this.next = grow(this.next, Int32Array);
      this.capacity = nextCapacity;
    }

    // 'single' keeps every ball identical, which is what lets the packing
    // settle into hexagonal crystal domains. 'mixed' spreads sizes across
    // [radiusMin, radiusMax] and suppresses that ordering.
    radiusBounds() {
      if (this.settings.sizeMode !== 'mixed') {
        const radius = Math.max(0.5, Number(this.settings.radius));
        return { min: radius, max: radius };
      }
      const a = Math.max(0.5, Number(this.settings.radiusMin));
      const b = Math.max(0.5, Number(this.settings.radiusMax));
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }

    get maxRadius() {
      return this.radiusBounds().max;
    }

    // Sizes are spaced evenly across the range so every size in [min, max] is
    // represented rather than clustered around a random mean. Mass scales with
    // area (r^2), and the solver weights corrections by inverse mass.
    refreshRadii() {
      const { min, max } = this.radiusBounds();
      for (let i = 0; i < this.count; i += 1) {
        const t = this.count > 1 ? i / (this.count - 1) : 0;
        const radius = min + (max - min) * t;
        this.r[i] = radius;
        this.invMass[i] = 1 / (radius * radius);
      }
    }

    setBounds(width, height) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      for (let i = 0; i < this.count; i += 1) {
        const radius = this.r[i];
        this.x[i] = clamp(this.x[i], radius, Math.max(radius, this.width - radius));
        this.y[i] = clamp(this.y[i], radius, Math.max(radius, this.height - radius));
      }
      this.resizeGrid();
    }

    // A one-ring neighbour walk only finds pairs closer than cellSize, and the
    // widest possible contact is maxRadius * 2 — so the cell must be sized to
    // the largest ball or big/big pairs silently miss the broadphase.
    resizeGrid() {
      this.cellSize = Math.max(4, this.maxRadius * 2.05);
      this.cols = Math.max(1, Math.ceil(this.width / this.cellSize));
      this.rows = Math.max(1, Math.ceil(this.height / this.cellSize));
      const cells = this.cols * this.rows;
      if (this.head.length !== cells) this.head = new Int32Array(cells);
    }

    setCount(value, initial = false) {
      const target = clamp(Math.round(value), 1, 10000);
      this.ensureCapacity(target);
      const oldCount = this.count;
      this.count = target;
      this.refreshRadii();
      if (target > oldCount) {
        for (let i = oldCount; i < target; i += 1) this.spawnOne(i, initial);
      }
      if (this.pointer.draggedIndex >= target) this.pointer.draggedIndex = -1;
    }

    spawnOne(index, quiet = false, x = null, y = null) {
      const radius = this.r[index];
      const angle = Math.random() * Math.PI * 2;
      const speed = quiet ? 40 + Math.random() * 120 : 120 + Math.random() * 440;
      this.x[index] = x ?? (radius + Math.random() * Math.max(1, this.width - radius * 2));
      this.y[index] = y ?? (radius + Math.random() * Math.max(1, this.height - radius * 2));
      this.prevX[index] = this.x[index];
      this.prevY[index] = this.y[index];
      this.vx[index] = Math.cos(angle) * speed;
      this.vy[index] = Math.sin(angle) * speed;
      this.hueSeed[index] = Math.random();
    }

    spawnBurst(x = this.width * 0.5, y = this.height * 0.5, amount = 24) {
      const old = this.count;
      const target = Math.min(10000, old + amount);
      this.ensureCapacity(target);
      this.count = target;
      this.refreshRadii();
      for (let i = old; i < target; i += 1) {
        const radius = this.r[i];
        const a = Math.random() * Math.PI * 2;
        const ring = Math.sqrt(Math.random()) * radius * 4;
        this.spawnOne(i, false, clamp(x + Math.cos(a) * ring, radius, this.width - radius), clamp(y + Math.sin(a) * ring, radius, this.height - radius));
        const impulse = 320 + Math.random() * 620;
        this.vx[i] += Math.cos(a) * impulse;
        this.vy[i] += Math.sin(a) * impulse;
      }
      this.settings.ballCount = this.count;
    }

    reset() {
      for (let i = 0; i < this.count; i += 1) this.spawnOne(i, true);
      this.gravityAngleCurrent = Number(this.settings.gravityAngle);
      this.gravityAngleTarget = this.gravityAngleCurrent;
      this.gravityAngleStart = this.gravityAngleCurrent;
      this.gravityCycleElapsed = 0;
      this.simulationTime = 0;
    }

    randomizeVelocities(scale = 1) {
      for (let i = 0; i < this.count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (80 + Math.random() * 520) * scale;
        this.vx[i] = Math.cos(angle) * speed;
        this.vy[i] = Math.sin(angle) * speed;
      }
    }

    zeroVelocities() {
      this.vx.fill(0, 0, this.count);
      this.vy.fill(0, 0, this.count);
    }

    reseedColors() {
      for (let i = 0; i < this.count; i += 1) this.hueSeed[i] = Math.random();
    }

    shake(strength = 800) {
      for (let i = 0; i < this.count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const impulse = strength * (0.35 + Math.random() * 0.65);
        this.vx[i] += Math.cos(a) * impulse;
        this.vy[i] += Math.sin(a) * impulse;
      }
      this.pickGravityTarget(true);
    }

    pickGravityTarget(force = false) {
      const mode = this.settings.gravityMode;
      let target = Number(this.settings.gravityAngle);
      if (mode === 'cardinal') {
        const choices = [0, 90, 180, 270].filter((value) => force || Math.abs(shortestAngleDelta(this.gravityAngleTarget, value)) > 10);
        target = choices[Math.floor(Math.random() * choices.length)] ?? target;
      } else if (mode === 'wander') {
        target = Math.random() * 360;
      } else {
        return;
      }
      this.gravityAngleStart = this.gravityAngleCurrent;
      this.gravityAngleTarget = target;
      this.gravityTransitionElapsed = 0;
    }

    updateGravity(dt) {
      const mode = this.settings.gravityMode;
      if (mode === 'manual') {
        const target = Number(this.settings.gravityAngle);
        this.gravityAngleCurrent += shortestAngleDelta(this.gravityAngleCurrent, target) * Math.min(1, dt * 10);
      } else if (mode === 'rotate') {
        const period = Math.max(0.25, Number(this.settings.gravityCycleTime));
        this.gravityAngleCurrent = (this.gravityAngleCurrent + (360 / period) * dt) % 360;
      } else if (mode === 'cardinal' || mode === 'wander') {
        this.gravityCycleElapsed += dt;
        if (this.gravityCycleElapsed >= Number(this.settings.gravityCycleTime)) {
          this.gravityCycleElapsed %= Number(this.settings.gravityCycleTime);
          this.pickGravityTarget();
        }
        const duration = Math.max(0.01, Number(this.settings.gravityTransitionTime));
        this.gravityTransitionElapsed += dt;
        const t = smoothstep(this.gravityTransitionElapsed / duration);
        this.gravityAngleCurrent = this.gravityAngleStart + shortestAngleDelta(this.gravityAngleStart, this.gravityAngleTarget) * t;
      } else if (mode === 'tilt' && this.tilt.available) {
        this.gravityAngleCurrent = Math.atan2(this.tilt.y, this.tilt.x) * 180 / Math.PI;
      }
      this.gravityAngleCurrent = (this.gravityAngleCurrent + 360) % 360;
    }

    setTilt(x, y) {
      const length = Math.hypot(x, y);
      if (length < 0.05) return;
      this.tilt.x = x / length;
      this.tilt.y = y / length;
      this.tilt.available = true;
    }

    pointerDown(x, y, button = 0) {
      this.pointer.active = true;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.previousX = x;
      this.pointer.previousY = y;
      this.pointer.forceSign = button === 2 ? -1 : 1;
      this.pointer.draggedIndex = button === 0 ? this.findBall(x, y) : -1;
    }

    pointerMove(x, y) {
      this.pointer.previousX = this.pointer.x;
      this.pointer.previousY = this.pointer.y;
      this.pointer.x = x;
      this.pointer.y = y;
    }

    pointerUp() {
      this.pointer.active = false;
      this.pointer.draggedIndex = -1;
    }

    findBall(x, y) {
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < this.count; i += 1) {
        const hit = this.r[i] * 1.6;
        const dx = this.x[i] - x;
        const dy = this.y[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < hit * hit && d2 < bestDistance) {
          bestDistance = d2;
          best = i;
        }
      }
      return best;
    }

    buildGrid() {
      if (Math.abs(this.cellSize - this.maxRadius * 2.05) > 0.25) this.resizeGrid();
      this.head.fill(-1);
      for (let i = 0; i < this.count; i += 1) {
        const cx = clamp(Math.floor(this.x[i] / this.cellSize), 0, this.cols - 1);
        const cy = clamp(Math.floor(this.y[i] / this.cellSize), 0, this.rows - 1);
        const cell = cy * this.cols + cx;
        this.next[i] = this.head[cell];
        this.head[cell] = i;
      }
    }

    applyMouseField(dt) {
      if (!this.pointer.active || this.pointer.draggedIndex >= 0 || this.settings.mouseMode === 'off') return;
      const radius = Number(this.settings.mouseRadius);
      const radius2 = radius * radius;
      const strength = Number(this.settings.mouseStrength);
      const mode = this.pointer.forceSign < 0 ? 'repel' : this.settings.mouseMode;
      for (let i = 0; i < this.count; i += 1) {
        const dx = this.pointer.x - this.x[i];
        const dy = this.pointer.y - this.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > radius2 || d2 < 1) continue;
        const distance = Math.sqrt(d2);
        const falloff = 1 - distance / radius;
        const nx = dx / distance;
        const ny = dy / distance;
        if (mode === 'vortex') {
          this.vx[i] += -ny * strength * falloff * dt;
          this.vy[i] += nx * strength * falloff * dt;
        } else {
          const sign = mode === 'repel' ? -1 : 1;
          this.vx[i] += nx * strength * falloff * dt * sign;
          this.vy[i] += ny * strength * falloff * dt * sign;
        }
      }
    }

    step(dt) {
      this.simulationTime += dt;
      this.updateGravity(dt);
      this.applyMouseField(dt);

      const gravityStrength = Number(this.settings.gravityStrength);
      const gravityRadians = this.gravityAngleCurrent * Math.PI / 180;
      let gx = Math.cos(gravityRadians) * gravityStrength;
      let gy = Math.sin(gravityRadians) * gravityStrength;
      if (this.settings.gravityMode === 'tilt' && !this.tilt.available) {
        gx = 0;
        gy = gravityStrength;
      }

      const windRadians = Number(this.settings.windAngle) * Math.PI / 180;
      const windStrength = Number(this.settings.windStrength);
      const turbulence = Number(this.settings.windTurbulence);
      const noiseX = Math.sin(this.simulationTime * 1.17) * Math.sin(this.simulationTime * 0.31 + 1.9);
      const noiseY = Math.cos(this.simulationTime * 0.93 + 0.7) * Math.sin(this.simulationTime * 0.27);
      const wx = Math.cos(windRadians) * windStrength + noiseX * windStrength * turbulence;
      const wy = Math.sin(windRadians) * windStrength + noiseY * windStrength * turbulence;
      const drag = Math.exp(-Number(this.settings.airDrag) * dt);

      for (let i = 0; i < this.count; i += 1) {
        this.prevX[i] = this.x[i];
        this.prevY[i] = this.y[i];
        this.vx[i] = (this.vx[i] + (gx + wx) * dt) * drag;
        this.vy[i] = (this.vy[i] + (gy + wy) * dt) * drag;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
      }

      const dragged = this.pointer.draggedIndex;
      if (dragged >= 0 && dragged < this.count) {
        const radius = this.r[dragged];
        const dx = this.pointer.x - this.pointer.previousX;
        const dy = this.pointer.y - this.pointer.previousY;
        this.x[dragged] = clamp(this.pointer.x, radius, this.width - radius);
        this.y[dragged] = clamp(this.pointer.y, radius, this.height - radius);
        this.prevX[dragged] = this.x[dragged] - dx;
        this.prevY[dragged] = this.y[dragged] - dy;
      }

      const iterations = Math.max(1, Math.round(Number(this.settings.solverIterations)));
      this.contactCount = 0;
      for (let pass = 0; pass < iterations; pass += 1) {
        this.solveWalls();
        this.buildGrid();
        this.solveContacts(dt, pass === iterations - 1);
      }
      this.solveWalls();

      const invDt = 1 / dt;
      const wallBounce = Number(this.settings.wallBounce);
      for (let i = 0; i < this.count; i += 1) {
        const radius = this.r[i];
        this.vx[i] = (this.x[i] - this.prevX[i]) * invDt;
        this.vy[i] = (this.y[i] - this.prevY[i]) * invDt;
        if (this.x[i] <= radius + 0.001 && this.vx[i] < 0) this.vx[i] *= -wallBounce;
        if (this.x[i] >= this.width - radius - 0.001 && this.vx[i] > 0) this.vx[i] *= -wallBounce;
        if (this.y[i] <= radius + 0.001 && this.vy[i] < 0) this.vy[i] *= -wallBounce;
        if (this.y[i] >= this.height - radius - 0.001 && this.vy[i] > 0) this.vy[i] *= -wallBounce;
      }

      this.applyContactVelocityResponse();

      if (dragged >= 0 && dragged < this.count) {
        this.vx[dragged] = (this.pointer.x - this.pointer.previousX) * invDt * 0.65;
        this.vy[dragged] = (this.pointer.y - this.pointer.previousY) * invDt * 0.65;
      }
    }

    solveWalls() {
      for (let i = 0; i < this.count; i += 1) {
        const radius = this.r[i];
        this.x[i] = clamp(this.x[i], radius, Math.max(radius, this.width - radius));
        this.y[i] = clamp(this.y[i], radius, Math.max(radius, this.height - radius));
      }
    }

    forEachContact(callback) {
      for (let i = 0; i < this.count; i += 1) {
        const ri = this.r[i];
        const cx = clamp(Math.floor(this.x[i] / this.cellSize), 0, this.cols - 1);
        const cy = clamp(Math.floor(this.y[i] / this.cellSize), 0, this.rows - 1);
        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = cy + oy;
          if (ny < 0 || ny >= this.rows) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = cx + ox;
            if (nx < 0 || nx >= this.cols) continue;
            let j = this.head[ny * this.cols + nx];
            while (j !== -1) {
              if (j > i) {
                const minDistance = ri + this.r[j];
                const dx = this.x[j] - this.x[i];
                const dy = this.y[j] - this.y[i];
                const d2 = dx * dx + dy * dy;
                if (d2 <= minDistance * minDistance * 1.002) callback(i, j, dx, dy, d2, minDistance);
              }
              j = this.next[j];
            }
          }
        }
      }
    }

    solveContacts(dt, countContacts) {
      const compliance = Math.max(0, Number(this.settings.compliance));
      const alpha = compliance / (dt * dt);
      this.forEachContact((i, j, dx, dy, d2, minDistance) => {
        let distance = Math.sqrt(Math.max(d2, 1e-10));
        let nx = dx / distance;
        let ny = dy / distance;
        if (distance < 1e-5) {
          const a = ((i * 12.9898 + j * 78.233) % 6.28318);
          nx = Math.cos(a);
          ny = Math.sin(a);
          distance = 0;
        }
        const penetration = minDistance - distance;
        const correction = penetration / (2 + alpha);
        const dragged = this.pointer.draggedIndex;
        const wi = i === dragged ? 0 : this.invMass[i];
        const wj = j === dragged ? 0 : this.invMass[j];
        const weight = wi + wj;
        if (weight <= 0) return;
        const scale = correction / weight;
        this.x[i] -= nx * scale * wi;
        this.y[i] -= ny * scale * wi;
        this.x[j] += nx * scale * wj;
        this.y[j] += ny * scale * wj;
        if (countContacts) this.contactCount += 1;
      });
    }

    applyContactVelocityResponse() {
      this.buildGrid();
      const restitution = Number(this.settings.elasticity);
      const viscosity = Number(this.settings.contactViscosity);
      this.forEachContact((i, j, dx, dy, d2) => {
        const distance = Math.sqrt(Math.max(d2, 1e-10));
        const nx = dx / distance;
        const ny = dy / distance;
        const wi = this.invMass[i];
        const wj = this.invMass[j];
        const weight = wi + wj;
        if (weight <= 0) return;
        const rvx = this.vx[j] - this.vx[i];
        const rvy = this.vy[j] - this.vy[i];
        const normalVelocity = rvx * nx + rvy * ny;
        if (normalVelocity < 0) {
          const impulse = -(1 + restitution) * normalVelocity / weight;
          this.vx[i] -= nx * impulse * wi;
          this.vy[i] -= ny * impulse * wi;
          this.vx[j] += nx * impulse * wj;
          this.vy[j] += ny * impulse * wj;
        }
        if (viscosity > 0) {
          const tx = -ny;
          const ty = nx;
          const tangentVelocity = rvx * tx + rvy * ty;
          const tangentImpulse = tangentVelocity * viscosity / weight;
          this.vx[i] += tx * tangentImpulse * wi;
          this.vy[i] += ty * tangentImpulse * wi;
          this.vx[j] -= tx * tangentImpulse * wj;
          this.vy[j] -= ty * tangentImpulse * wj;
        }
      });
    }
  }

  root.Simulation = Simulation;
})();
