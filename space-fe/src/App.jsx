import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const WIDTH = 900;
const HEIGHT = 600;
const MIN_PLANETS = 3;
const MAX_PLANETS = 5;

const SHOT_RADIUS = 5;
const SHOT_SPEED = 280; // pixels per second
const SHOT_LIFETIME = 10; // seconds a shot lives, even off-screen
// Gravitational constant, tuned for gameplay. A planet's mass scales with
// radius², so bigger planets pull harder; pull falls off with distance².
const GRAVITY = 1000;
const ROTATION_SPEED = Math.PI / 2; // radians per second while an arrow is held
const SHIP_NOSE = 18; // distance from ship centre to its nose

const randBetween = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(randBetween(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// Gas-giant palettes modelled on the real outer planets. Each has a base fill,
// a set of band colours, and an optional storm-spot colour (Jupiter/Neptune).
const GAS_PALETTES = [
  {
    base: "#c8a97a",
    bands: ["#dcc49a", "#b5905f", "#e2cfa8", "#a67b4e"],
    spot: "#b5533a",
  }, // Jupiter
  {
    base: "#d9c58c",
    bands: ["#e8d7a6", "#c9ad6f", "#f0e2b8", "#bfa065"],
    spot: null,
  }, // Saturn
  {
    base: "#3b6fb0",
    bands: ["#4f86c6", "#2f5f9e", "#5f96d6", "#274f86"],
    spot: "#25406e",
  }, // Neptune
  {
    base: "#7fc9c9",
    bands: ["#96d6d6", "#68b8b8", "#a8e0e0", "#58a8a8"],
    spot: null,
  }, // Uranus
];

// Rocky worlds get their own base colours and detail palettes.
const EARTH = { base: "#2b5fa5", land: ["#3f8f4a", "#5a8f3a", "#7a6a3a"] };
const MARS = {
  base: "#b5502f",
  patch: ["#8a3a20", "#6f2e1a"],
  pole: "#e8ddd5",
};
const MOON = { base: "#8a8a92", crater: "#6a6a72", rim: "#a8a8b0" };

// All feature coordinates below are in unit space (-1..1) relative to the
// planet centre, so they scale with radius and stay fixed once generated
// (features are stored on the planet, so redraws never flicker).
function makeGasFeatures() {
  const pal = pick(GAS_PALETTES);
  const bands = [];
  let y = -1;
  while (y < 1) {
    const h = randBetween(0.12, 0.26);
    bands.push({ y0: y, y1: Math.min(1, y + h), color: pick(pal.bands) });
    y += h;
  }
  const spot = pal.spot
    ? {
        cx: randBetween(-0.35, 0.35),
        cy: randBetween(-0.1, 0.4),
        rx: randBetween(0.16, 0.26),
        ry: randBetween(0.08, 0.14),
        color: pal.spot,
      }
    : null;
  return { base: pal.base, bands, spot };
}

function makeEarthFeatures() {
  const blobs = [];
  const n = randInt(4, 7);
  for (let i = 0; i < n; i += 1) {
    blobs.push({
      cx: randBetween(-0.7, 0.7),
      cy: randBetween(-0.7, 0.7),
      r: randBetween(0.15, 0.32),
      color: pick(EARTH.land),
    });
  }
  return { base: EARTH.base, blobs };
}

function makeMarsFeatures() {
  const patches = [];
  const n = randInt(3, 6);
  for (let i = 0; i < n; i += 1) {
    patches.push({
      cx: randBetween(-0.7, 0.7),
      cy: randBetween(-0.6, 0.6),
      r: randBetween(0.15, 0.3),
      color: pick(MARS.patch),
    });
  }
  return { base: MARS.base, patches, pole: MARS.pole };
}

function makeMoonFeatures() {
  const craters = [];
  const n = randInt(5, 9);
  for (let i = 0; i < n; i += 1) {
    craters.push({
      cx: randBetween(-0.75, 0.75),
      cy: randBetween(-0.75, 0.75),
      r: randBetween(0.06, 0.16),
    });
  }
  return { base: MOON.base, crater: MOON.crater, rim: MOON.rim, craters };
}

const ROCKY_TYPES = ["earth", "mars", "moon"];

function makeFeatures(type) {
  if (type === "gas") return makeGasFeatures();
  if (type === "earth") return makeEarthFeatures();
  if (type === "mars") return makeMarsFeatures();
  return makeMoonFeatures();
}

// The two ships live on opposite sides of the screen, vertically centred.
// `angle` is the direction the nose points (radians, 0 = right).
const SHIPS = [
  { x: 60, y: HEIGHT / 2, color: "#7fd7ff", angle: 0 },
  { x: WIDTH - 60, y: HEIGHT / 2, color: "#ff9d7f", angle: Math.PI },
];

// Generate 3-5 planets that don't overlap each other or sit on top of a ship.
// One big planet always sits roughly in the middle so the ships (which share a
// horizontal line) can't hit each other with a straight, direct shot.
function generatePlanets() {
  const count = randInt(MIN_PLANETS, MAX_PLANETS);
  const centralRadius = randBetween(110, 140);
  const central = {
    x: WIDTH / 2 + randBetween(-40, 40),
    // Keep it on the ships' firing line so it blocks the direct shot.
    y: HEIGHT / 2 + randBetween(-centralRadius / 3, centralRadius / 3),
    radius: centralRadius,
    // The central blocker is always a gas giant.
    type: "gas",
    features: makeGasFeatures(),
  };
  const planets = [central];
  let attempts = 0;

  while (planets.length < count && attempts < 1000) {
    attempts += 1;
    const radius = randBetween(30, 70);
    const type = pick(ROCKY_TYPES);
    const candidate = {
      x: randBetween(radius, WIDTH - radius),
      y: randBetween(radius, HEIGHT - radius),
      radius,
      type,
      features: makeFeatures(type),
    };

    const tooCloseToShip = SHIPS.some(
      (ship) =>
        Math.hypot(ship.x - candidate.x, ship.y - candidate.y) < radius + 90,
    );
    if (tooCloseToShip) continue;

    // Keep a clear gap of at least half of each planet's radius between them,
    // so planets never sit very close together.
    const tooClose = planets.some(
      (p) =>
        Math.hypot(p.x - candidate.x, p.y - candidate.y) <
        p.radius * 1.5 + radius * 1.5,
    );
    if (tooClose) continue;

    planets.push(candidate);
  }

  return planets;
}

function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.fillStyle = ship.color;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fillDisc(ctx, cx, cy, r, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawShot(ctx, shot) {
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, SHOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd94a";
  ctx.fill();
}

function drawGas(ctx, x, y, r, f) {
  f.bands.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(x - r, y + b.y0 * r, r * 2, (b.y1 - b.y0) * r);
  });
  if (f.spot) {
    ctx.fillStyle = f.spot.color;
    ctx.beginPath();
    ctx.ellipse(
      x + f.spot.cx * r,
      y + f.spot.cy * r,
      f.spot.rx * r,
      f.spot.ry * r,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawEarth(ctx, x, y, r, f) {
  f.blobs.forEach((b) =>
    fillDisc(ctx, x + b.cx * r, y + b.cy * r, b.r * r, b.color),
  );
}

function drawMars(ctx, x, y, r, f) {
  f.patches.forEach((p) =>
    fillDisc(ctx, x + p.cx * r, y + p.cy * r, p.r * r, p.color),
  );
  // Polar ice caps top and bottom.
  ctx.fillStyle = f.pole;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x, y + sign * r * 0.9, r * 0.55, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMoon(ctx, x, y, r, f) {
  f.craters.forEach((c) => {
    const cx = x + c.cx * r;
    const cy = y + c.cy * r;
    fillDisc(ctx, cx, cy, c.r * r, f.crater);
    // A thin lighter rim on the lower edge for a touch of relief.
    ctx.strokeStyle = f.rim;
    ctx.lineWidth = Math.max(1, c.r * r * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, c.r * r, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  });
}

function drawPlanet(ctx, planet) {
  const { x, y, radius, type, features } = planet;

  ctx.save();
  // Clip all surface detail to the planet disc.
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  // Base colour first so any gaps between features are covered.
  ctx.fillStyle = features.base;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  if (type === "gas") drawGas(ctx, x, y, radius, features);
  else if (type === "earth") drawEarth(ctx, x, y, radius, features);
  else if (type === "mars") drawMars(ctx, x, y, radius, features);
  else drawMoon(ctx, x, y, radius, features);

  ctx.restore();

  // Subtle outline to separate the planet from the background.
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawScene(ctx, planets, shots) {
  // Space background.
  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A sprinkling of stars for depth (deterministic so it doesn't flicker).
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 137) % WIDTH;
    const y = (i * 251) % HEIGHT;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  planets.forEach((planet) => drawPlanet(ctx, planet));
  SHIPS.forEach((ship) => drawShip(ctx, ship));
  shots.forEach((shot) => drawShot(ctx, shot));

  // Remaining lifetime of each shot, stacked up from the bottom-right corner.
  ctx.fillStyle = "#ffd94a";
  ctx.font = "14px monospace";
  ctx.textAlign = "right";
  shots.forEach((shot, i) => {
    const remaining = Math.max(shot.ttl, 0);
    const seconds = Math.floor(remaining);
    const decis = Math.floor((remaining - seconds) * 10);
    ctx.fillText(`${seconds}.${decis}s`, WIDTH - 12, HEIGHT - 14 - i * 18);
  });
}

// Move shots forward and drop any that hit a planet or ran out of time.
// Shots may leave the screen and be pulled back by gravity, so they only
// expire when their lifetime does. Each planet attracts shots:
// acceleration = GRAVITY * radius² / distance², pointed at the planet's centre.
function updateShots(shots, planets, dt) {
  return shots.filter((shot) => {
    shot.ttl -= dt;
    if (shot.ttl <= 0) return false;

    planets.forEach((p) => {
      const dx = p.x - shot.x;
      const dy = p.y - shot.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      if (dist === 0) return;
      const accel = (GRAVITY * p.radius * p.radius) / distSq;
      shot.vx += (dx / dist) * accel * dt;
      shot.vy += (dy / dist) * accel * dt;
    });

    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    const hitPlanet = planets.some(
      (p) => Math.hypot(p.x - shot.x, p.y - shot.y) < p.radius + SHOT_RADIUS,
    );
    return !hitPlanet;
  });
}

function App() {
  const canvasRef = useRef(null);
  const shotsRef = useRef([]);
  const [planets, setPlanets] = useState(() => generatePlanets());

  const heldKeysRef = useRef(new Set());

  const newGame = useCallback(() => {
    shotsRef.current = [];
    SHIPS[0].angle = 0;
    SHIPS[1].angle = Math.PI;
    setPlanets(generatePlanets());
  }, []);

  // Space bar fires a shot from the left ship's nose, in the direction the
  // ship is pointing. Arrow keys are tracked as held so the animation loop
  // can spin the ship smoothly.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        heldKeysRef.current.add(event.code);
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      const ship = SHIPS[0];
      shotsRef.current.push({
        x: ship.x + SHIP_NOSE * Math.cos(ship.angle),
        y: ship.y + SHIP_NOSE * Math.sin(ship.angle),
        vx: SHOT_SPEED * Math.cos(ship.angle),
        vy: SHOT_SPEED * Math.sin(ship.angle),
        ttl: SHOT_LIFETIME,
      });
    };
    const onKeyUp = (event) => {
      heldKeysRef.current.delete(event.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let frameId;
    let lastTime = performance.now();
    const tick = (time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const held = heldKeysRef.current;
      if (held.has("ArrowLeft")) SHIPS[0].angle -= ROTATION_SPEED * dt;
      if (held.has("ArrowRight")) SHIPS[0].angle += ROTATION_SPEED * dt;

      shotsRef.current = updateShots(shotsRef.current, planets, dt);
      drawScene(ctx, planets, shotsRef.current);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [planets]);

  return (
    <div className="game">
      <header className="game__header">
        <h1>Spaceship Game</h1>
        <button type="button" className="game__button" onClick={newGame}>
          New game
        </button>
      </header>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="game__canvas"
      />
    </div>
  );
}

export default App;
