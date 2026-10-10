import Phaser from 'phaser';
import type { MapObj } from './MapBuilder';

/** All positions/sizes are 1x world pixels; all velocities are pixels/second. */
export interface EnvironmentLight {
  x: number; y: number; radius?: number; texture?: string;
  color?: number | string; alpha?: number; flicker?: number;
}
export interface EnvironmentFog {
  x: number; y: number; width: number; height: number; texture?: string;
  alpha?: number; speedX?: number; scrollFactor?: number;
}
export interface EnvironmentParticles {
  kind: 'leaf' | 'firefly'; x: number; y: number; width: number; height: number;
  count?: number; texture?: string; color?: number | string; alpha?: number;
  size?: number; speedX?: number; speedY?: number;
}
export interface EnvironmentArtConfig {
  enabled?: boolean;
  areas?: Record<string, boolean>;
  budget?: { lights?: number; fog?: number; particles?: number };
  lights?: EnvironmentLight[];
  fog?: EnvironmentFog[];
  particles?: EnvironmentParticles[];
}

export const ENVIRONMENT_DEPTH = { light: 13, fog: 14, particle: 15 } as const;
export const ENVIRONMENT_LIMIT = { lights: 24, fog: 8, particles: 96 } as const;
const DEFAULT_BUDGET = { lights: 12, fog: 4, particles: 48 };
const GENERATED = '__environment_art_';
type Light = { image: Phaser.GameObjects.Image; alpha: number; flicker: number; phase: number };
type Fog = { image: Phaser.GameObjects.TileSprite; speed: number };
type Particle = {
  image: Phaser.GameObjects.Image; kind: 'leaf' | 'firefly'; x: number; y: number;
  width: number; height: number; initialX: number; initialY: number;
  speedX: number; speedY: number; phase: number; alpha: number;
};

const numeric = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, numeric(value, fallback)));
const wrap = (value: number, extent: number) => ((value % extent) + extent) % extent;
function tint(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(0xffffff, value));
  if (typeof value === 'string' && /^#?[a-f\d]{6}$/i.test(value)) return parseInt(value.replace('#', ''), 16);
  return fallback;
}
function fraction(seed: number): number {
  let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

/** Rendering only: no Arcade bodies, gameplay clocks, input handlers or scene lights. */
export class EnvironmentArt {
  private readonly lights: Light[] = [];
  private readonly fog: Fog[] = [];
  private readonly particles: Particle[] = [];
  private readonly definitions: { lights: EnvironmentLight[]; fog: EnvironmentFog[]; particles: EnvironmentParticles[] };
  private readonly areas: Record<string, boolean>;
  private readonly budget: typeof DEFAULT_BUDGET;
  private globalEnabled: boolean;
  private initialized = false;
  private destroyed = false;
  private seconds = 0;

  constructor(private readonly scene: Phaser.Scene, readonly area: string,
    private readonly mapWidth: number, private readonly mapHeight: number,
    config?: EnvironmentArtConfig | null, objects: readonly MapObj[] = []) {
    this.globalEnabled = config?.enabled !== false;
    this.areas = { ...config?.areas };
    this.budget = {
      lights: Math.floor(bounded(config?.budget?.lights, DEFAULT_BUDGET.lights, 0, ENVIRONMENT_LIMIT.lights)),
      fog: Math.floor(bounded(config?.budget?.fog, DEFAULT_BUDGET.fog, 0, ENVIRONMENT_LIMIT.fog)),
      particles: Math.floor(bounded(config?.budget?.particles, DEFAULT_BUDGET.particles, 0, ENVIRONMENT_LIMIT.particles)),
    };
    this.definitions = {
      lights: Array.isArray(config?.lights) ? config.lights.filter(Boolean) : [],
      fog: Array.isArray(config?.fog) ? config.fog.filter(Boolean) : [],
      particles: Array.isArray(config?.particles) ? config.particles.filter(Boolean) : [],
    };
    for (const object of objects) {
      if (object.props.enabled === false) continue;
      const def = { ...object.props, x: object.x, y: object.y, width: object.w, height: object.h };
      if (object.type === 'environment_light') this.definitions.lights.push(def);
      else if (object.type === 'environment_fog') this.definitions.fog.push(def);
      else if (object.type === 'environment_particles') this.definitions.particles.push(def as EnvironmentParticles);
    }
    this.ensureInitialized();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private get active(): boolean {
    return !this.destroyed && this.globalEnabled && this.areas[this.area] !== false;
  }

  setEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
    this.applyEnabled();
  }

  setAreaEnabled(area: string, enabled: boolean): void {
    this.areas[area] = enabled;
    if (area === this.area) this.applyEnabled();
  }

  private applyEnabled(): void {
    this.ensureInitialized();
    for (const light of this.lights) light.image.setVisible(this.active);
    for (const fog of this.fog) fog.image.setVisible(this.active);
    for (const particle of this.particles) particle.image.setVisible(this.active);
  }

  private ensureInitialized(): void {
    if (!this.active || this.initialized) return;
    this.initialized = true;
    for (const def of this.definitions.lights) {
      if (this.lights.length >= this.budget.lights) break;
      if (!Number.isFinite(def.x) || !Number.isFinite(def.y)) continue;
      const radius = bounded(def.radius, 64, 1, 512), alpha = bounded(def.alpha, 0.35, 0, 1);
      const image = this.scene.add.image(def.x, def.y, this.texture(def.texture, 'light'))
        .setName('environment:light').setDepth(ENVIRONMENT_DEPTH.light).setDisplaySize(radius * 2, radius * 2)
        .setTint(tint(def.color, 0xffd78e)).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
      this.lights.push({ image, alpha, flicker: bounded(def.flicker, 0, 0, 1), phase: fraction(this.lights.length + 1) * Math.PI * 2 });
    }
    for (const def of this.definitions.fog) {
      if (this.fog.length >= this.budget.fog) break;
      if (!Number.isFinite(def.x) || !Number.isFinite(def.y)) continue;
      const width = bounded(def.width, this.mapWidth, 1, this.mapWidth * 2);
      const height = bounded(def.height, 64, 1, Math.max(1, this.mapHeight));
      const image = this.scene.add.tileSprite(def.x, def.y, width, height, this.texture(def.texture, 'fog'))
        .setOrigin(0, 0).setName('environment:fog').setDepth(ENVIRONMENT_DEPTH.fog)
        .setAlpha(bounded(def.alpha, 0.12, 0, 1)).setScrollFactor(bounded(def.scrollFactor, 1, 0, 1));
      this.fog.push({ image, speed: bounded(def.speedX, 6, -256, 256) });
    }
    for (const def of this.definitions.particles) {
      if (this.particles.length >= this.budget.particles) break;
      if (def.kind !== 'leaf' && def.kind !== 'firefly' || !Number.isFinite(def.x) || !Number.isFinite(def.y)) continue;
      const leaf = def.kind === 'leaf', count = Math.floor(bounded(def.count, 12, 0, this.budget.particles - this.particles.length));
      if (!count) continue;
      const texture = this.texture(def.texture, def.kind);
      const width = bounded(def.width, this.mapWidth, 1, this.mapWidth * 2);
      const height = bounded(def.height, this.mapHeight, 1, Math.max(1, this.mapHeight));
      const alpha = bounded(def.alpha, leaf ? 0.6 : 0.7, 0, 1), size = bounded(def.size, leaf ? 10 : 5, 1, 48);
      for (let index = 0; index < count; index++) {
        const seed = this.particles.length * 7 + 3, initialX = fraction(seed) * width, initialY = fraction(seed + 1) * height;
        const image = this.scene.add.image(def.x + initialX, def.y + initialY, texture)
          .setName(`environment:${def.kind}`).setDepth(ENVIRONMENT_DEPTH.particle).setDisplaySize(size, leaf ? size * 0.6 : size)
          .setTint(tint(def.color, leaf ? 0xabc889 : 0xd8ff8e)).setAlpha(alpha);
        if (!leaf) image.setBlendMode(Phaser.BlendModes.ADD);
        this.particles.push({ image, kind: def.kind, x: def.x, y: def.y, width, height, initialX, initialY,
          speedX: bounded(def.speedX, leaf ? 16 : 2, -256, 256), speedY: bounded(def.speedY, leaf ? 12 : -2, -256, 256),
          phase: fraction(seed + 2) * Math.PI * 2, alpha });
      }
    }
  }

  /** Closed-form motion gives the same travel at 60 and 144 Hz, with no per-frame allocations. */
  update(deltaMs: number): void {
    if (!this.active || !this.lights.length && !this.fog.length && !this.particles.length) return;
    this.seconds += bounded(deltaMs, 0, 0, 250) / 1000;
    const time = this.seconds, view = this.scene.cameras.main.worldView;
    for (const light of this.lights) {
      const image = light.image, radius = image.displayWidth / 2;
      image.visible = image.x + radius >= view.left && image.x - radius <= view.right
        && image.y + radius >= view.top && image.y - radius <= view.bottom;
      if (light.flicker) image.alpha = light.alpha * (1 - light.flicker * (0.5 + 0.5 * Math.sin(time * 3 + light.phase)));
    }
    for (const fog of this.fog) fog.image.tilePositionX = time * fog.speed;
    for (const particle of this.particles) {
      const sway = Math.sin(time * (particle.kind === 'leaf' ? 1.8 : 0.9) + particle.phase) - Math.sin(particle.phase);
      const x = particle.x + wrap(particle.initialX + particle.speedX * time + sway * 8, particle.width);
      const y = particle.y + wrap(particle.initialY + particle.speedY * time, particle.height);
      const image = particle.image;
      image.x = x; image.y = y;
      image.visible = x >= view.left - 24 && x <= view.right + 24 && y >= view.top - 24 && y <= view.bottom + 24;
      if (particle.kind === 'leaf') image.rotation = particle.phase + time * 0.45;
      else image.alpha = particle.alpha * (0.6 + 0.4 * Math.sin(time * 2 + particle.phase) ** 2);
    }
  }

  snapshot() {
    return { enabled: this.active, globalEnabled: this.globalEnabled, areaEnabled: this.areas[this.area] !== false,
      area: this.area, lights: this.lights.length, fog: this.fog.length, particles: this.particles.length,
      budget: { ...this.budget }, simulationSeconds: this.seconds,
      depths: { ...ENVIRONMENT_DEPTH }, objects: this.lights.length + this.fog.length + this.particles.length };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    for (const light of this.lights) light.image.destroy();
    for (const fog of this.fog) fog.image.destroy();
    for (const particle of this.particles) particle.image.destroy();
    this.lights.length = this.fog.length = this.particles.length = 0;
  }

  private texture(requested: string | undefined, kind: 'light' | 'fog' | 'leaf' | 'firefly'): string {
    if (requested && this.scene.textures.exists(requested)) return requested;
    const key = GENERATED + kind;
    if (this.scene.textures.exists(key)) return key;
    const size = kind === 'light' ? 64 : kind === 'fog' ? 128 : kind === 'leaf' ? 12 : 8;
    const height = kind === 'fog' ? 32 : size;
    const texture = this.scene.textures.createCanvas(key, size, height)!;
    const context = texture.context;
    if (kind === 'light' || kind === 'firefly') {
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.35, '#ffffff99'); gradient.addColorStop(1, '#ffffff00');
      context.fillStyle = gradient; context.fillRect(0, 0, size, size);
    } else if (kind === 'fog') {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#ffffff00'); gradient.addColorStop(0.5, '#fff'); gradient.addColorStop(1, '#ffffff00');
      context.fillStyle = gradient; context.fillRect(0, 0, size, height);
      context.globalCompositeOperation = 'destination-in';
      const horizontal = context.createLinearGradient(0, 0, size, 0);
      horizontal.addColorStop(0, '#fff'); horizontal.addColorStop(0.5, '#ffffff80'); horizontal.addColorStop(1, '#fff');
      context.fillStyle = horizontal; context.fillRect(0, 0, size, height);
    } else {
      context.fillStyle = '#fff'; context.beginPath();
      context.ellipse(size / 2, size / 2, size / 2, size / 4, -0.3, 0, Math.PI * 2); context.fill();
    }
    texture.refresh();
    return key;
  }
}
