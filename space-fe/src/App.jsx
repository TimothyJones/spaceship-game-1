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

function drawScene(ctx, planets) {
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
}

function App() {
  const canvasRef = useRef(null);
  const [planets, setPlanets] = useState(() => generatePlanets());

  const newGame = useCallback(() => {
    setPlanets(generatePlanets());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawScene(ctx, planets);
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
