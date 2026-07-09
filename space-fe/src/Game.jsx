import { useCallback, useEffect, useRef, useState } from "react";
import {
  WIDTH,
  HEIGHT,
  SHOT_RADIUS,
  SHOT_LIFETIME,
  ROTATION_SPEED,
  SHIP_NOSE,
  SHOT_MIN_SPEED,
  SHOT_MAX_SPEED,
  CHARGE_TIME,
  SIM_DT,
  SHIP_STARTS,
  simulateShot,
} from "space-engine";
import { getGame, submitTurn } from "./api.js";

const SHIP_COLORS = ["#7fd7ff", "#ff9d7f"];
const POLL_INTERVAL_MS = 2000;

// Explosion behaviour, spawned where a shot strikes a planet.
const EXPLOSION_DURATION = 0.6; // seconds a burst lives for
const PARTICLE_COUNT = 16;
const EXPLOSION_COLORS = ["#fff3c4", "#ffd24a", "#ff9d3c", "#ff5a2c"];

const randBetween = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
      color: pick(EXPLOSION_COLORS),
    });
  }
  return { x, y, age: 0, duration: EXPLOSION_DURATION, particles };
}

// Advance each explosion and drop the ones that have finished.
function updateExplosions(explosions, dt) {
  return explosions.filter((explosion) => {
    explosion.age += dt;
    if (explosion.age >= explosion.duration) return false;
    explosion.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Air-drag style slow-down so debris eases to a stop.
      const drag = Math.exp(-2.5 * dt);
      p.vx *= drag;
      p.vy *= drag;
    });
    return true;
  });
}

function drawShip(ctx, ship, color) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.fillStyle = color;
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

function drawBackground(ctx) {
  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A sprinkling of stars for depth (deterministic so it doesn't flicker).
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 137) % WIDTH;
    const y = (i * 251) % HEIGHT;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawAimGuide(ctx, ship, angle, charge) {
  const length = 30 + charge * 50;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255, 217, 74, 0.5)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(SHIP_NOSE + 4, 0);
  ctx.lineTo(SHIP_NOSE + 4 + length, 0);
  ctx.stroke();
  ctx.restore();
}

// Draw the power meter that fills while Space is held. `charge` is a fraction
// from 0 (just pressed) to 1 (fully charged); pass null to hide the bar.
function drawChargeBar(ctx, charge) {
  const barW = 220;
  const barH = 16;
  const x = 12;
  const y = HEIGHT - 12 - barH;

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(x, y, barW, barH);

  // Fill runs green → yellow → red as the shot powers up.
  const hue = 120 - charge * 120;
  ctx.fillStyle = `hsl(${hue}, 85%, 55%)`;
  ctx.fillRect(x, y, barW * charge, barH);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`POWER ${Math.round(charge * 100)}%`, x + 6, y + barH / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

// The playing field. The server owns the game; this component polls it for
// new state, lets the current player aim (arrows) and fire (hold Space to
// charge, release to shoot), and replays each resolved shot as an animation
// by re-simulating it with the shared engine (the outcome shown is always
// the server's).
function Game({ session, initialGame, onLeave }) {
  const me = session.playerIndex;

  const canvasRef = useRef(null);
  const displayRef = useRef(initialGame); // state currently rendered
  const latestRef = useRef(initialGame); // newest state from the server
  const animRef = useRef(null); // { shot, path, impact, i } while replaying
  const explosionsRef = useRef([]);
  const aimRef = useRef({ angle: initialGame.ships[me].angle });
  // While Space is held, `charging` is true and `charge` grows (in seconds)
  // up to CHARGE_TIME. On release we fire a shot scaled by the charge.
  const chargingRef = useRef(false);
  const chargeRef = useRef(0);
  const heldKeysRef = useRef(new Set());
  const fireBusyRef = useRef(false);
  const fireRef = useRef(() => {});

  const [shownGame, setShownGame] = useState(initialGame);
  const [error, setError] = useState(null);

  const commit = useCallback(
    (game) => {
      displayRef.current = game;
      setShownGame(game);
      if (game.status === "playing" && game.currentPlayer === me) {
        aimRef.current.angle = game.ships[me].angle;
      }
    },
    [me],
  );

  const handleIncoming = useCallback(
    (game) => {
      if (game.version <= latestRef.current.version) return; // stale
      latestRef.current = game;
      if (animRef.current) return; // committed when the replay finishes

      const shown = displayRef.current;
      if (game.turn === shown.turn + 1 && game.lastShot?.turn === shown.turn) {
        // Exactly one new turn: replay the shot before showing the result.
        // The snapshot in lastShot.planets is the field the shot flew
        // through, even if the round reset regenerated planets since.
        const shot = game.lastShot;
        const sim = simulateShot(
          shot.planets,
          SHIP_STARTS,
          shot.shooter,
          shot.angle,
          shot.power,
        );
        animRef.current = { shot, path: sim.path, impact: sim.impact, i: 0 };
      } else {
        // Anything else (join, or we're several turns behind): jump to it.
        commit(game);
      }
    },
    [commit],
  );

  // Poll the server for new turns.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const { game } = await getGame(session.gameId);
        if (!active) return;
        setError(null);
        handleIncoming(game);
      } catch (err) {
        if (active) setError(err.message);
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session.gameId, handleIncoming]);

  // Firing. Kept in a ref so the mount-once key listener sees fresh state.
  fireRef.current = async (power) => {
    const latest = latestRef.current;
    const myTurn =
      latest.status === "playing" &&
      latest.currentPlayer === me &&
      !animRef.current;
    if (!myTurn || fireBusyRef.current) return;
    fireBusyRef.current = true;
    try {
      const { game } = await submitTurn(
        session.gameId,
        session.token,
        aimRef.current.angle,
        power,
      );
      setError(null);
      handleIncoming(game);
    } catch (err) {
      setError(err.message);
    } finally {
      fireBusyRef.current = false;
    }
  };

  // Arrow keys are tracked as held so the animation loop can spin the ship
  // smoothly. Holding Space charges a shot; releasing it fires with speed
  // scaled by the charge.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        heldKeysRef.current.add(event.code);
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      // keydown auto-repeats while held; only start charging on the first one.
      if (chargingRef.current) return;
      const latest = latestRef.current;
      const myTurn =
        latest.status === "playing" &&
        latest.currentPlayer === me &&
        !animRef.current &&
        !fireBusyRef.current;
      if (!myTurn) return;
      chargingRef.current = true;
      chargeRef.current = 0;
    };
    const onKeyUp = (event) => {
      heldKeysRef.current.delete(event.code);
      if (event.code !== "Space" || !chargingRef.current) return;
      const charge = Math.min(chargeRef.current / CHARGE_TIME, 1);
      const power = SHOT_MIN_SPEED + charge * (SHOT_MAX_SPEED - SHOT_MIN_SPEED);
      chargingRef.current = false;
      chargeRef.current = 0;
      fireRef.current(power);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [me]);

  // Render loop: apply held keys to the aim, grow the charge, advance any
  // shot replay and explosions, draw.
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    let frameId;
    let lastTime = performance.now();

    const tick = (time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const game = displayRef.current;
      const anim = animRef.current;
      const myTurn =
        game.status === "playing" && game.currentPlayer === me && !anim;

      if (myTurn) {
        const held = heldKeysRef.current;
        if (held.has("ArrowLeft")) aimRef.current.angle -= ROTATION_SPEED * dt;
        if (held.has("ArrowRight")) aimRef.current.angle += ROTATION_SPEED * dt;
      }

      let charge = null;
      if (chargingRef.current) {
        chargeRef.current = Math.min(chargeRef.current + dt, CHARGE_TIME);
        charge = chargeRef.current / CHARGE_TIME;
      }

      drawBackground(ctx);
      const planets = anim ? anim.shot.planets : game.planets;
      planets.forEach((planet) => drawPlanet(ctx, planet));

      game.ships.forEach((ship, i) => {
        let angle = ship.angle;
        if (anim && i === anim.shot.shooter) angle = anim.shot.angle;
        else if (myTurn && i === me) angle = aimRef.current.angle;
        drawShip(ctx, { ...ship, angle }, SHIP_COLORS[i]);
      });

      if (anim) {
        anim.i += dt / SIM_DT;
        if (anim.i >= anim.path.length) {
          if (anim.impact) {
            explosionsRef.current.push(
              createExplosion(
                anim.impact.x,
                anim.impact.y,
                anim.impact.nx,
                anim.impact.ny,
              ),
            );
          }
          animRef.current = null;
          commit(latestRef.current);
        } else {
          const point = anim.path[Math.floor(anim.i)];
          ctx.beginPath();
          ctx.arc(point.x, point.y, SHOT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = "#ffd94a";
          ctx.fill();

          const remaining = Math.max(SHOT_LIFETIME - anim.i * SIM_DT, 0);
          const seconds = Math.floor(remaining);
          const decis = Math.floor((remaining - seconds) * 10);
          ctx.fillStyle = "#ffd94a";
          ctx.font = "14px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`${seconds}.${decis}s`, WIDTH - 12, HEIGHT - 14);
        }
      }

      explosionsRef.current = updateExplosions(explosionsRef.current, dt);
      explosionsRef.current.forEach((explosion) =>
        drawExplosion(ctx, explosion),
      );

      if (myTurn) {
        drawAimGuide(ctx, game.ships[me], aimRef.current.angle, charge ?? 0);
      }
      if (charge !== null) drawChargeBar(ctx, charge);

      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [me, commit]);

  const opponent = shownGame.players[1 - me];
  let statusLine;
  if (shownGame.status === "waiting") {
    statusLine = (
      <>
        Waiting for an opponent — share code{" "}
        <strong className="game__code">{shownGame.id}</strong>
      </>
    );
  } else if (shownGame.status === "finished") {
    statusLine = `${shownGame.players[shownGame.winner].name} wins the match!`;
  } else if (shownGame.currentPlayer === me) {
    statusLine =
      "Your turn — ← → to aim, hold Space to charge, release to fire";
  } else {
    statusLine = `Waiting for ${opponent?.name ?? "opponent"}…`;
  }

  return (
    <div className="game">
      <header className="game__header">
        <h1>Spaceship Game</h1>
        <div className="game__scores">
          {shownGame.players.map((player, i) => (
            <span
              key={i}
              className="game__score"
              style={{ color: SHIP_COLORS[i] }}
            >
              {player.name}
              {i === me ? " (you)" : ""}: {shownGame.scores[i]}
            </span>
          ))}
        </div>
        <button type="button" className="game__button" onClick={onLeave}>
          Leave game
        </button>
      </header>
      <p className="game__status">{statusLine}</p>
      {error && <p className="game__error">{error}</p>}
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="game__canvas"
      />
    </div>
  );
}

export default Game;
