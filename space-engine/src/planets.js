import {
  WIDTH,
  HEIGHT,
  MIN_PLANETS,
  MAX_PLANETS,
  PLANET_COLORS,
  SHIP_STARTS,
} from "./constants.js";

const randBetween = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(randBetween(min, max + 1));

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
    color: PLANET_COLORS[randInt(0, PLANET_COLORS.length - 1)],
  };
  const planets = [central];
  let attempts = 0;

  while (planets.length < count && attempts < 1000) {
    attempts += 1;
    const radius = randBetween(30, 70);
    const candidate = {
      x: randBetween(radius, WIDTH - radius),
      y: randBetween(radius, HEIGHT - radius),
      radius,
      color: PLANET_COLORS[randInt(0, PLANET_COLORS.length - 1)],
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
