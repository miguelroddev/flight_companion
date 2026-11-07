// The landing page's 3D globe, drawn straight with WebGL2: no 3D library.
//
// One shader draws the sphere itself, per pixel: ocean, continents as a grid
// of dots (from land.png, Natural Earth's 110m land, public domain), a rim of
// light and a soft atmosphere around it. Everything else is a point sprite:
// every airport, in the map's pin colours, and the arcs, lifted off the
// surface and drawn as dotted lines with a comet running along each.
//
// Framework-free on purpose: NetworkGlobe.tsx wraps it for React.

import { PIN_TIERS } from "../map/mapTheme";

export type GlobeAirport = {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  routeCount: number;
};

export type GlobePoint = { x: number; y: number; visible: boolean };

export type GlobeOptions = {
  // Still, with no comets and no spinning on its own: dragging still works.
  reducedMotion: boolean;
  // The airport under the pointer, in CSS pixels of the canvas, or null.
  onHover?: (hit: { airport: GlobeAirport; x: number; y: number } | null) => void;
  // After each frame is drawn, to keep HTML labels on moving points.
  onFrame?: () => void;
};

type Vec3 = [number, number, number];

// Rows of land dots, in degrees apart.
const DOT_STEP = 0.75;
// How far the camera sits from the centre, in globe radii, and how much of
// the canvas's shorter side the globe spans.
const DISTANCE = 3.6;
const FILL = 0.78;
// Radians per second on its own, and per CSS pixel dragged.
const SPIN_SPEED = 0.055;
const DRAG_SPEED = 0.0055;
const IDLE_BEFORE_SPIN_MS = 2500;
const MAX_PITCH = 1.05;

const COLORS = {
  ocean: hex("#c4ddf2"),
  oceanShade: hex("#9dbfe0"),
  landFill: hex("#eef4f9"),
  landDot: hex("#ffffff"),
  rim: hex("#ffffff"),
  glow: hex("#8fbde6"),
  arc: hex("#1b3480"),
  highlight: hex("#f97316"),
  departure: hex("#3fbaf4"),
  arrival: hex("#152c4c"),
};

// Airport dots by tier, quietest first, as on the map: size carries the
// hierarchy, so the quiet majority stays out of the way of the hubs.
const TIER_SIZES = [2.6, 3.4, 4.6, 6.2];
const TIER_ALPHAS = [0.75, 0.9, 1, 1];

function hex(value: string): Vec3 {
  const n = parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toVector(lat: number, lng: number): Vec3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}

function tierOf(routeCount: number): number {
  let tier = 0;
  PIN_TIERS.forEach((t, index) => {
    if (routeCount >= t.minRoutes) tier = index;
  });
  return tier;
}

// Rotation that brings (lat, lng) to the front: pitch around x after yaw
// around y. Column-major, as WebGL wants it.
function rotation(yaw: number, pitch: number): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Rx(pitch) * Ry(yaw)
  const m = [
    [cy, 0, sy],
    [sp * sy, cp, -sp * cy],
    [-cp * sy, sp, cp * cy],
  ];
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}

function transpose3(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function apply(m: number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

const SPHERE_VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const SPHERE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_ndc;
out vec4 o;
uniform vec2 u_tan;
uniform float u_dist;
uniform mat3 u_inverse;
uniform sampler2D u_land;
uniform float u_dotStep;
uniform vec3 u_ocean, u_oceanShade, u_landFill, u_landDot, u_rim, u_glow;

void main() {
  vec3 dir = normalize(vec3(v_ndc * u_tan, -1.0));
  vec3 centre = vec3(0.0, 0.0, -u_dist);
  float along = dot(dir, centre);
  float miss2 = dot(centre, centre) - along * along;

  if (miss2 > 1.0) {
    // The atmosphere: a haze fading out from the rim, and gone well before
    // the canvas's edges.
    vec2 edge = smoothstep(vec2(0.78), vec2(1.0), abs(v_ndc));
    float glow = exp(-(sqrt(miss2) - 1.0) * 16.0) * 0.6 * (1.0 - edge.x) * (1.0 - edge.y);
    o = vec4(u_glow * glow, glow);
    return;
  }

  vec3 n = normalize(dir * (along - sqrt(1.0 - miss2)) - centre);
  vec3 light = normalize(vec3(-0.5, 0.6, 0.65));
  float lit = clamp(dot(n, light), 0.0, 1.0);
  float facing = clamp(dot(n, -dir), 0.0, 1.0);

  // Back to the globe's own frame, to read the land under this pixel.
  vec3 m = u_inverse * n;
  float lat = degrees(asin(clamp(m.y, -1.0, 1.0)));
  float lng = degrees(atan(m.x, m.z));
  float land = texture(u_land, vec2(lng / 360.0 + 0.5, 0.5 - lat / 180.0)).r;

  // The dot grid: rows of even latitude, each with as many dots as fit its
  // circumference, so they stay evenly spaced towards the poles.
  float row = floor((lat + 90.0) / u_dotStep);
  float rowLat = (row + 0.5) * u_dotStep - 90.0;
  float shrink = max(cos(radians(rowLat)), 0.04);
  float columns = max(floor(360.0 * shrink / u_dotStep), 1.0);
  float lngStep = 360.0 / columns;
  float dotLng = (floor((lng + 180.0) / lngStep) + 0.5) * lngStep - 180.0;
  float fromDot = length(vec2((lng - dotLng) * shrink, lat - rowLat)) / u_dotStep;
  float soft = max(fwidth(fromDot), 0.02);
  float dotShape = 1.0 - smoothstep(0.32 - soft, 0.32 + soft, fromDot);
  float dotOnLand = step(0.5, texture(u_land, vec2(dotLng / 360.0 + 0.5, 0.5 - rowLat / 180.0)).r);

  vec3 colour = mix(u_oceanShade, u_ocean, 0.35 + 0.65 * lit);
  colour = mix(colour, u_landFill, smoothstep(0.3, 0.7, land) * 0.45);
  colour = mix(colour, u_landDot, dotShape * dotOnLand * (0.55 + 0.45 * facing));
  colour = mix(colour, u_rim, pow(1.0 - facing, 3.0) * 0.5);
  o = vec4(colour, 1.0);
}`;

const POINT_VERTEX = `#version 300 es
in vec3 a_pos;
in vec4 a_color;
in float a_size;
in vec2 a_arc;
uniform mat3 u_model;
uniform float u_dist;
uniform vec2 u_tan;
uniform float u_px;
uniform float u_time;
uniform float u_animate;
uniform int u_mode;
out vec4 v_color;
out float v_size;

void main() {
  vec3 p = u_model * a_pos;
  vec3 v = p - vec3(0.0, 0.0, u_dist);
  float visible = 1.0;
  if (u_mode == 1) {
    // Off the surface: hidden wherever the globe stands in between.
    vec3 dir = normalize(v);
    vec3 centre = vec3(0.0, 0.0, -u_dist);
    float along = dot(dir, centre);
    float miss2 = dot(centre, centre) - along * along;
    if (miss2 < 1.0 && along - sqrt(1.0 - miss2) < length(v) - 0.003) visible = 0.0;
  } else {
    // On it: faded out towards the rim, gone round the back.
    visible = smoothstep(0.0, 0.22, dot(normalize(p), normalize(-v)));
  }

  float alpha = a_color.a;
  float size = a_size;
  if (u_mode == 1) {
    // A comet running the arc: a bright head with a fading tail, starting
    // and ending off the arc so each one rests between passes.
    float head = fract(u_time * 0.2 + a_arc.y) * 1.7 - 0.35;
    float behind = head - a_arc.x;
    float tail = 0.3;
    float trail = behind >= 0.0 && behind < tail ? 1.0 - behind / tail : 0.0;
    trail *= u_animate;
    alpha = mix(alpha, 1.0, trail);
    size *= 1.0 + trail;
  } else if (u_mode == 2) {
    size *= 1.0 + 0.3 * u_animate * (0.5 + 0.5 * sin(u_time * 3.0 + a_arc.y));
  }

  v_color = vec4(a_color.rgb, alpha * visible);
  v_size = visible > 0.0 ? size * u_px * (u_dist - 1.0) / -v.z : 0.0;
  gl_PointSize = v_size;
  gl_Position = vec4(v.x / -v.z / u_tan.x, v.y / -v.z / u_tan.y, 0.0, 1.0);
}`;

const POINT_FRAGMENT = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_size;
uniform float u_outline;
out vec4 o;

void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float soft = 2.0 / max(v_size, 1.0);
  float shape = 1.0 - smoothstep(1.0 - soft, 1.0, r);
  vec3 colour = v_color.rgb;
  if (u_outline > 0.0 && v_size > 7.0) {
    // A hairline ring, as the map's pins have.
    float ring = u_outline * 2.0 / max(v_size, 1.0);
    colour = mix(colour, vec3(0.05, 0.08, 0.12), smoothstep(1.0 - ring - soft, 1.0 - ring, r) * 0.8);
  }
  float a = v_color.a * shape;
  o = vec4(colour * a, a);
}`;

type PointLayer = {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
};

// Floats per point: position (3), colour (4), size (1), arc (2).
const STRIDE = 10;

export class NetworkGlobe {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly options: GlobeOptions;
  private readonly sphereProgram: WebGLProgram;
  private readonly pointProgram: WebGLProgram;
  private readonly sphereVao: WebGLVertexArrayObject;
  private readonly landTexture: WebGLTexture;
  private airports: GlobeAirport[] = [];
  private airportVectors: Vec3[] = [];
  private layers: { airports?: PointLayer; arcs?: PointLayer; highlight?: PointLayer; ends?: PointLayer } = {};

  private yaw = 0;
  private pitch = 0;
  private velocity = 0;
  private lastInteraction = -Infinity;
  private focus: { yaw: number; pitch: number; fromYaw: number; fromPitch: number; start: number } | null = null;
  private dragging: { x: number; y: number; time: number } | null = null;
  private frame = 0;
  private running = false;
  private visible = true;
  private lastTime = 0;
  private time = 0;
  private hoverPending: { x: number; y: number } | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, landImageUrl: string, options: GlobeOptions) {
    const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.canvas = canvas;
    this.options = options;

    this.sphereProgram = program(gl, SPHERE_VERTEX, SPHERE_FRAGMENT);
    this.pointProgram = program(gl, POINT_VERTEX, POINT_FRAGMENT);

    // One triangle covering the screen: the sphere shader works per pixel.
    this.sphereVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sphereVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.sphereProgram, "a_pos");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Ocean everywhere until the land image arrives.
    this.landTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.landTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    const image = new Image();
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, this.landTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.requestDraw();
    };
    image.src = landImageUrl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.lookAt(20, 10, false);
    this.listen();
    this.resize();
    this.start();
  }

  // Every airport, as a dot in its tier's colour and size.
  setAirports(airports: GlobeAirport[]): void {
    this.airports = airports;
    this.airportVectors = airports.map((airport) => toVector(airport.lat, airport.lng));
    // Quietest first, so the hubs are drawn on top.
    const order = airports.map((_, index) => index).sort((a, b) => airports[a].routeCount - airports[b].routeCount);
    const data: number[] = [];
    for (const index of order) {
      const tier = tierOf(airports[index].routeCount);
      const [r, g, b] = hex(PIN_TIERS[tier].color);
      data.push(...this.airportVectors[index], r, g, b, TIER_ALPHAS[tier], TIER_SIZES[tier], 0, 0);
    }
    this.layers.airports = this.upload(this.layers.airports, data);
  }

  // Routes as arcs between airports, lifted higher the further they go.
  setArcs(pairs: [GlobeAirport, GlobeAirport][]): void {
    const data: number[] = [];
    pairs.forEach(([from, to], index) => {
      // A spread of starting points, so the comets do not run in step.
      const phase = (index * 0.618034) % 1;
      pushArc(data, from, to, COLORS.arc, 0.2, 2.2, phase);
    });
    this.layers.arcs = this.upload(this.layers.arcs, data);
  }

  // One route picked out in orange, its ends marked: today's route game.
  setHighlight(from: GlobeAirport | null, to: GlobeAirport | null): void {
    const arc: number[] = [];
    const ends: number[] = [];
    if (from && to) {
      pushArc(arc, from, to, COLORS.highlight, 0.95, 3.6, 0.15, 0.5, 220);
      ends.push(...toVector(from.lat, from.lng), ...COLORS.departure, 1, 9, 0, 0);
      ends.push(...toVector(to.lat, to.lng), ...COLORS.arrival, 1, 9, 0, Math.PI);
    }
    this.layers.highlight = this.upload(this.layers.highlight, arc);
    this.layers.ends = this.upload(this.layers.ends, ends);
  }

  // Turn to face a place, smoothly unless still.
  lookAt(lat: number, lng: number, animate = !this.options.reducedMotion): void {
    const yaw = (-lng * Math.PI) / 180;
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, (lat * Math.PI) / 180));
    if (!animate) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.focus = null;
      this.requestDraw();
      return;
    }
    // The short way round.
    const turn = ((((yaw - this.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    this.focus = { yaw: this.yaw + turn, pitch, fromYaw: this.yaw, fromPitch: this.pitch, start: this.time };
    this.lastInteraction = performance.now();
  }

  // Where a place is on the canvas, in CSS pixels, and whether it faces us.
  project(lat: number, lng: number): GlobePoint {
    const p = apply(rotation(this.yaw, this.pitch), toVector(lat, lng));
    return this.toScreen(p);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private toScreen(p: Vec3, view = this.view()): GlobePoint {
    const { tanX, tanY, width, height } = view;
    const z = p[2] - DISTANCE;
    const viewDir: Vec3 = [-p[0], -p[1], -z];
    const length = Math.hypot(...viewDir);
    const facing = (p[0] * viewDir[0] + p[1] * viewDir[1] + p[2] * viewDir[2]) / length;
    return {
      x: ((p[0] / -z / tanX + 1) / 2) * width,
      y: ((1 - p[1] / -z / tanY) / 2) * height,
      visible: facing > 0.08,
    };
  }

  // The camera's field of view, set so the globe spans FILL of the canvas's
  // shorter side, and the canvas's size in CSS pixels.
  private view(): { tanX: number; tanY: number; width: number; height: number } {
    const width = Math.max(this.canvas.clientWidth, 1);
    const height = Math.max(this.canvas.clientHeight, 1);
    // The globe's apparent radius, as a fraction of the half-height.
    const radius = (FILL * Math.min(width, height)) / height;
    const tanY = 1 / Math.sqrt(DISTANCE * DISTANCE - 1) / radius;
    return { tanX: tanY * (width / height), tanY, width, height };
  }

  private upload(layer: PointLayer | undefined, data: number[]): PointLayer {
    const gl = this.gl;
    const target = layer ?? this.createLayer();
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    target.count = data.length / STRIDE;
    this.requestDraw();
    return target;
  }

  private createLayer(): PointLayer {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const attributes: [string, number, number][] = [
      ["a_pos", 3, 0],
      ["a_color", 4, 3],
      ["a_size", 1, 7],
      ["a_arc", 2, 8],
    ];
    for (const [name, size, offset] of attributes) {
      const location = gl.getAttribLocation(this.pointProgram, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
    }
    gl.bindVertexArray(null);
    return { vao, buffer, count: 0 };
  }

  private listen(): void {
    const canvas = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Document,
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, handler as EventListener);
      this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
    };

    on(canvas, "pointerdown", (event) => {
      this.dragging = { x: event.clientX, y: event.clientY, time: performance.now() };
      this.velocity = 0;
      this.focus = null;
      canvas.setPointerCapture(event.pointerId);
      this.options.onHover?.(null);
    });
    on(canvas, "pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!this.dragging) {
        if (event.pointerType === "mouse") {
          this.hoverPending = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          this.requestDraw();
        }
        return;
      }
      const now = performance.now();
      const dx = event.clientX - this.dragging.x;
      const dy = event.clientY - this.dragging.y;
      this.yaw += dx * DRAG_SPEED;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dy * DRAG_SPEED));
      const elapsed = Math.max(now - this.dragging.time, 1) / 1000;
      this.velocity = (dx * DRAG_SPEED) / elapsed;
      this.dragging = { x: event.clientX, y: event.clientY, time: now };
      this.lastInteraction = now;
      this.requestDraw();
    });
    const release = () => {
      if (!this.dragging) return;
      // Let go after a pause and it stops, flicked and it coasts.
      if (performance.now() - this.dragging.time > 80) this.velocity = 0;
      this.dragging = null;
      this.lastInteraction = performance.now();
    };
    on(canvas, "pointerup", release);
    on(canvas, "pointercancel", release);
    on(canvas, "pointerleave", () => {
      if (!this.dragging) this.options.onHover?.(null);
    });

    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(canvas);
    this.cleanups.push(() => resizeObserver.disconnect());

    // Off screen, it stops drawing.
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.start();
    });
    visibilityObserver.observe(canvas);
    this.cleanups.push(() => visibilityObserver.disconnect());

    on(canvas, "webglcontextlost" as keyof HTMLElementEventMap, (event) => {
      event.preventDefault();
      this.running = false;
      cancelAnimationFrame(this.frame);
    });
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.requestDraw();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private requestDraw(): void {
    if (!this.running && this.visible) this.start();
  }

  private readonly tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time += dt;

    const still = this.options.reducedMotion;
    if (this.focus) {
      const t = Math.min((this.time - this.focus.start) / 1.6, 1);
      const eased = 1 - (1 - t) ** 3;
      this.yaw = this.focus.fromYaw + (this.focus.yaw - this.focus.fromYaw) * eased;
      this.pitch = this.focus.fromPitch + (this.focus.pitch - this.focus.fromPitch) * eased;
      if (t >= 1) this.focus = null;
    } else if (!this.dragging) {
      if (Math.abs(this.velocity) > 0.001) {
        this.yaw += this.velocity * dt;
        this.velocity *= Math.exp(-dt * 3);
      } else if (!still && now - this.lastInteraction > IDLE_BEFORE_SPIN_MS) {
        this.yaw += SPIN_SPEED * dt;
      }
    }

    this.draw();
    if (this.hoverPending) {
      this.hover(this.hoverPending.x, this.hoverPending.y);
      this.hoverPending = null;
    }
    this.options.onFrame?.();

    // Nothing moves when still, idle and not visible: no need to keep going.
    const moving =
      !still || this.dragging || this.focus || Math.abs(this.velocity) > 0.001;
    if (this.visible && moving) {
      this.frame = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  private hover(x: number, y: number): void {
    const model = rotation(this.yaw, this.pitch);
    const view = this.view();
    let best: { airport: GlobeAirport; x: number; y: number } | null = null;
    let bestDistance = 14 * 14;
    this.airportVectors.forEach((vector, index) => {
      const point = this.toScreen(apply(model, vector), view);
      if (!point.visible) return;
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
      // Among close ones, the busier airport wins: it is the bigger dot.
      const weighted = distance - Math.min(this.airports[index].routeCount, 200) * 0.2;
      if (weighted < bestDistance) {
        bestDistance = weighted;
        best = { airport: this.airports[index], x: point.x, y: point.y };
      }
    });
    this.options.onHover?.(best);
  }

  private draw(): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const model = rotation(this.yaw, this.pitch);
    const { tanX, tanY } = this.view();

    gl.useProgram(this.sphereProgram);
    const sphere = (name: string) => gl.getUniformLocation(this.sphereProgram, name);
    gl.uniform2f(sphere("u_tan"), tanX, tanY);
    gl.uniform1f(sphere("u_dist"), DISTANCE);
    gl.uniformMatrix3fv(sphere("u_inverse"), false, transpose3(model));
    gl.uniform1f(sphere("u_dotStep"), DOT_STEP);
    gl.uniform3fv(sphere("u_ocean"), COLORS.ocean);
    gl.uniform3fv(sphere("u_oceanShade"), COLORS.oceanShade);
    gl.uniform3fv(sphere("u_landFill"), COLORS.landFill);
    gl.uniform3fv(sphere("u_landDot"), COLORS.landDot);
    gl.uniform3fv(sphere("u_rim"), COLORS.rim);
    gl.uniform3fv(sphere("u_glow"), COLORS.glow);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.landTexture);
    gl.uniform1i(sphere("u_land"), 0);
    gl.bindVertexArray(this.sphereVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.pointProgram);
    const point = (name: string) => gl.getUniformLocation(this.pointProgram, name);
    gl.uniformMatrix3fv(point("u_model"), false, model);
    gl.uniform1f(point("u_dist"), DISTANCE);
    gl.uniform2f(point("u_tan"), tanX, tanY);
    // Device pixels per CSS pixel, and dots a little smaller on a small globe
    // so it does not drown in them.
    const ratio = this.canvas.width / Math.max(this.canvas.clientWidth, 1);
    const scale = Math.max(0.6, Math.min(1, Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / 640));
    gl.uniform1f(point("u_px"), ratio * scale);
    gl.uniform1f(point("u_time"), this.time);
    gl.uniform1f(point("u_animate"), this.options.reducedMotion ? 0 : 1);

    const layer = (target: PointLayer | undefined, mode: number, outline: number) => {
      if (!target || target.count === 0) return;
      gl.uniform1i(point("u_mode"), mode);
      gl.uniform1f(point("u_outline"), outline);
      gl.bindVertexArray(target.vao);
      gl.drawArrays(gl.POINTS, 0, target.count);
    };
    layer(this.layers.arcs, 1, 0);
    layer(this.layers.airports, 0, 0.9);
    layer(this.layers.highlight, 1, 0);
    layer(this.layers.ends, 2, 1.4);
    gl.bindVertexArray(null);
  }
}

// An arc as a row of dots from one airport to the other, along the great
// circle and raised off the surface in the middle, more so the longer it is.
function pushArc(
  data: number[],
  from: GlobeAirport,
  to: GlobeAirport,
  colour: Vec3,
  alpha: number,
  size: number,
  phase: number,
  lift = 0,
  density = 75,
): void {
  const a = toVector(from.lat, from.lng);
  const b = toVector(to.lat, to.lng);
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(cos);
  if (angle < 1e-4) return;
  // At most ~0.2 of a radius up, so even the longest arcs stay close to the
  // globe rather than looping out around it.
  const height = 0.02 + 0.16 * (angle / Math.PI) + lift * 0.06;
  const count = Math.max(16, Math.ceil(angle * density));
  const sin = Math.sin(angle);
  for (let i = 0; i <= count; i++) {
    const s = i / count;
    const wa = Math.sin((1 - s) * angle) / sin;
    const wb = Math.sin(s * angle) / sin;
    const up = 1 + height * Math.sin(Math.PI * s);
    data.push(
      (a[0] * wa + b[0] * wb) * up,
      (a[1] * wa + b[1] * wb) * up,
      (a[2] * wa + b[2] * wb) * up,
      ...colour,
      alpha,
      size,
      s,
      phase,
    );
  }
}

function program(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const reason = gl.isContextLost() ? "the WebGL context was lost" : gl.getShaderInfoLog(shader);
      throw new Error(`Globe shader failed to compile: ${reason || "no reason given"}`);
    }
    return shader;
  };
  const result = gl.createProgram()!;
  gl.attachShader(result, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(`Globe shaders failed to link: ${gl.getProgramInfoLog(result) || "no reason given"}`);
  }
  return result;
}
