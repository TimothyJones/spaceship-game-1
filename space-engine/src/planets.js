import {
  WIDTH,
  HEIGHT,
  MIN_PLANETS,
  MAX_PLANETS,
  SHIP_STARTS,
} from "./constants.js";

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
// planet centre, so they scale with radius and stay fixed once generated.
// Features are plain data stored on each planet, so they serialize with the
// game state and every client renders the same worlds without flicker.
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

// Generate 3-5 planets that don't overlap each other or sit on top of a ship.
// One big planet always sits roughly in the middle so the ships (which share a
// horizontal line) can't hit each other with a straight, direct shot.
export function generatePlanets() {
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

    const tooCloseToShip = SHIP_STARTS.some(
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
