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

const SHOT_RADIUS = 5;
const SHOT_SPEED = 420; // pixels per second
const ROTATION_SPEED = Math.PI; // radians per second while an arrow is held
const SHIP_NOSE = 18; // distance from ship centre to its nose

const randBetween = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(randBetween(min, max + 1));

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

function drawPlanet(ctx, planet) {
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
  ctx.fillStyle = planet.color;
  ctx.fill();
}

function drawShot(ctx, shot) {
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, SHOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd94a";
  ctx.fill();
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
}

// Move shots forward and drop any that hit a planet or left the screen.
function updateShots(shots, planets, dt) {
  return shots.filter((shot) => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    if (
      shot.x < -SHOT_RADIUS ||
      shot.x > WIDTH + SHOT_RADIUS ||
      shot.y < -SHOT_RADIUS ||
      shot.y > HEIGHT + SHOT_RADIUS
    )
      return false;

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
