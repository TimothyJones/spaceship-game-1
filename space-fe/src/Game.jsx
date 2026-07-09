import { useCallback, useEffect, useRef, useState } from "react";
import {
  WIDTH,
  HEIGHT,
  SHOT_RADIUS,
  SHOT_LIFETIME,
  ROTATION_SPEED,
  SHIP_NOSE,
  DEFAULT_SHOT_POWER,
  MIN_SHOT_POWER,
  MAX_SHOT_POWER,
  SIM_DT,
  SHIP_STARTS,
  simulateShot,
} from "space-engine";
import { getGame, submitTurn } from "./api.js";

const SHIP_COLORS = ["#7fd7ff", "#ff9d7f"];
const POLL_INTERVAL_MS = 2000;
const POWER_RATE = 150; // power change per second while up/down is held

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

function drawPlanet(ctx, planet) {
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
  ctx.fillStyle = planet.color;
  ctx.fill();
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

function drawAimGuide(ctx, ship, aim) {
  const powerFrac =
    (aim.power - MIN_SHOT_POWER) / (MAX_SHOT_POWER - MIN_SHOT_POWER);
  const length = 30 + powerFrac * 50;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(aim.angle);
  ctx.strokeStyle = "rgba(255, 217, 74, 0.5)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(SHIP_NOSE + 4, 0);
  ctx.lineTo(SHIP_NOSE + 4 + length, 0);
  ctx.stroke();
  ctx.restore();
}

function drawPowerBar(ctx, power) {
  const frac = (power - MIN_SHOT_POWER) / (MAX_SHOT_POWER - MIN_SHOT_POWER);
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = "13px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`power ${Math.round(power)}`, 14, HEIGHT - 30);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.strokeRect(14, HEIGHT - 24, 120, 10);
  ctx.fillStyle = "#ffd94a";
  ctx.fillRect(14, HEIGHT - 24, 120 * frac, 10);
}

// The playing field. The server owns the game; this component polls it for
// new state, lets the current player aim (arrows) and fire (space), and
// replays each resolved shot as an animation by re-simulating it with the
// shared engine (the outcome shown is always the server's).
function Game({ session, initialGame, onLeave }) {
  const me = session.playerIndex;

  const canvasRef = useRef(null);
  const displayRef = useRef(initialGame); // state currently rendered
  const latestRef = useRef(initialGame); // newest state from the server
  const animRef = useRef(null); // { shot, path, i } while replaying a shot
  const aimRef = useRef({
    angle: initialGame.ships[me].angle,
    power: DEFAULT_SHOT_POWER,
  });
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
        animRef.current = { shot, path: sim.path, i: 0 };
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
  fireRef.current = async () => {
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
        aimRef.current.power,
      );
      setError(null);
      handleIncoming(game);
    } catch (err) {
      setError(err.message);
    } finally {
      fireBusyRef.current = false;
    }
  };

  // Arrows are tracked as held so the animation loop can adjust aim smoothly;
  // space fires.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)
      ) {
        event.preventDefault();
        heldKeysRef.current.add(event.code);
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      fireRef.current();
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

  // Render loop: apply held keys to the aim, advance any shot replay, draw.
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
        const aim = aimRef.current;
        if (held.has("ArrowLeft")) aim.angle -= ROTATION_SPEED * dt;
        if (held.has("ArrowRight")) aim.angle += ROTATION_SPEED * dt;
        if (held.has("ArrowUp")) aim.power += POWER_RATE * dt;
        if (held.has("ArrowDown")) aim.power -= POWER_RATE * dt;
        aim.power = Math.min(
          MAX_SHOT_POWER,
          Math.max(MIN_SHOT_POWER, aim.power),
        );
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

      if (myTurn) {
        drawAimGuide(ctx, game.ships[me], aimRef.current);
        drawPowerBar(ctx, aimRef.current.power);
      }

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
    statusLine = "Your turn — ← → aim, ↑ ↓ power, space to fire";
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
