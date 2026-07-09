import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const WIDTH = 900;
const HEIGHT = 600;
const MIN_PLANETS = 3;
const MAX_PLANETS = 5;

const PLANET_COLORS = [
  "#c96f4a",
  "#4a90c9",
  "#5bc96f",
  "#c9b04a",
  "#9b5bc9",
  "#4ac9b0",
];

// Bullet / firing behaviour.
const BULLET_SPEED = 340; // px per second
const BULLET_RADIUS = 3;
const FIRE_INTERVAL = 1.1; // seconds between a ship's shots

// Explosion behaviour.
const EXPLOSION_DURATION = 0.6; // seconds a burst lives for
const PARTICLE_COUNT = 16;
const EXPLOSION_COLORS = ["#fff3c4", "#ffd24a", "#ff9d3c", "#ff5a2c"];

const randBetween = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(randBetween(min, max + 1));

// The two ships live on opposite sides of the screen, vertically centred.
const SHIPS = [
  { x: 60, y: HEIGHT / 2, color: "#7fd7ff", facing: 1 },
  { x: WIDTH - 60, y: HEIGHT / 2, color: "#ff9d7f", facing: -1 },
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

// Spawn a burst of particles plus an expanding shockwave at an impact point.
// `nx`/`ny` is the (unit) surface normal so the debris sprays back outward
// from the planet rather than into it.
function createExplosion(x, y, nx, ny) {
  const baseAngle = Math.atan2(ny, nx);
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    // Bias the spray into the hemisphere pointing away from the planet.
    const angle = baseAngle + randBetween(-Math.PI / 2, Math.PI / 2);
    const speed = randBetween(60, 240);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: randBetween(1.5, 3.5),
      color: EXPLOSION_COLORS[randInt(0, EXPLOSION_COLORS.length - 1)],
    });
  }
  return { x, y, age: 0, duration: EXPLOSION_DURATION, particles };
}

function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.scale(ship.facing, 1);
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

function drawPlanet(ctx, planet) {
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
  ctx.fillStyle = planet.color;
  ctx.fill();
}

function drawBullet(ctx, bullet) {
  ctx.save();
  ctx.fillStyle = "#fdfdd0";
  ctx.shadowColor = "#ffd24a";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExplosion(ctx, explosion) {
  const t = explosion.age / explosion.duration; // 0 -> 1
  const fade = 1 - t;

  ctx.save();

  // Expanding shockwave ring.
  const ringRadius = 6 + t * 46;
  ctx.globalAlpha = fade * 0.7;
  ctx.strokeStyle = "#ffd24a";
  ctx.lineWidth = 2 * fade + 0.5;
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Bright central flash, brief.
  if (t < 0.35) {
    ctx.globalAlpha = (1 - t / 0.35) * 0.9;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, 7 * (1 - t / 0.35) + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Debris particles.
  explosion.particles.forEach((p) => {
    ctx.globalAlpha = fade;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawScene(ctx, planets, bullets, explosions) {
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
  bullets.forEach((bullet) => drawBullet(ctx, bullet));
  explosions.forEach((explosion) => drawExplosion(ctx, explosion));
}

function App() {
  const canvasRef = useRef(null);
  const [planets, setPlanets] = useState(() => generatePlanets());

  // Mutable simulation state, kept in refs so the animation loop can read and
  // mutate it without re-subscribing every frame.
  const planetsRef = useRef(planets);
  const bulletsRef = useRef([]);
  const explosionsRef = useRef([]);
  // Per-ship countdown (seconds) until the next shot, staggered so the two
  // ships don't fire in perfect unison.
  const fireTimersRef = useRef(SHIPS.map((_, i) => i * (FIRE_INTERVAL / 2)));

  const newGame = useCallback(() => {
    bulletsRef.current = [];
    explosionsRef.current = [];
    fireTimersRef.current = SHIPS.map((_, i) => i * (FIRE_INTERVAL / 2));
    setPlanets(generatePlanets());
  }, []);

  useEffect(() => {
    planetsRef.current = planets;
  }, [planets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");

    let frame;
    let lastTime;

    const step = (time) => {
      // Delta time in seconds, clamped so a backgrounded tab doesn't teleport
      // everything across the screen on the first frame back.
      if (lastTime === undefined) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const planetList = planetsRef.current;

      // Ships fire on a timer.
      fireTimersRef.current = fireTimersRef.current.map((timer, i) => {
        let next = timer - dt;
        if (next <= 0) {
          const ship = SHIPS[i];
          bulletsRef.current.push({
            x: ship.x + ship.facing * 20,
            y: ship.y,
            vx: ship.facing * BULLET_SPEED,
            // A little vertical spread keeps repeated shots visually varied.
            vy: randBetween(-40, 40),
          });
          next += FIRE_INTERVAL;
        }
        return next;
      });

      // Advance bullets; explode on planet contact, drop when off-screen.
      const survivingBullets = [];
      for (const bullet of bulletsRef.current) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;

        let hit = false;
        for (const planet of planetList) {
          const dx = bullet.x - planet.x;
          const dy = bullet.y - planet.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= planet.radius + BULLET_RADIUS) {
            // Surface normal, pointing from the planet centre out to the hit.
            const nx = dist === 0 ? 1 : dx / dist;
            const ny = dist === 0 ? 0 : dy / dist;
            const hx = planet.x + nx * planet.radius;
            const hy = planet.y + ny * planet.radius;
            explosionsRef.current.push(createExplosion(hx, hy, nx, ny));
            hit = true;
            break; // Planets are indestructible — the bullet is consumed.
          }
        }

        const offScreen =
          bullet.x < -20 ||
          bullet.x > WIDTH + 20 ||
          bullet.y < -20 ||
          bullet.y > HEIGHT + 20;

        if (!hit && !offScreen) survivingBullets.push(bullet);
      }
      bulletsRef.current = survivingBullets;

      // Advance explosions.
      const survivingExplosions = [];
      for (const explosion of explosionsRef.current) {
        explosion.age += dt;
        if (explosion.age >= explosion.duration) continue;
        explosion.particles.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // Air-drag style slow-down so debris eases to a stop.
          const drag = Math.exp(-2.5 * dt);
          p.vx *= drag;
          p.vy *= drag;
        });
        survivingExplosions.push(explosion);
      }
      explosionsRef.current = survivingExplosions;

      drawScene(ctx, planetList, bulletsRef.current, explosionsRef.current);
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

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
