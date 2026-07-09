import {
  GRAVITY,
  GRAVITY_FALLOFF,
  GRAVITY_REF,
  SHOT_RADIUS,
  SHOT_LIFETIME,
  SHOT_SPAWN_DIST,
  SHIP_HIT_RADIUS,
  SIM_DT,
} from "./constants.js";

// Simulate one shot from firing until it hits something or expires, using a
// fixed timestep so the result is reproducible. The server runs this to
// resolve a turn; clients rerun it with the same inputs to animate the shot.
//
// `ships` only needs `{ x, y }` per ship — angles don't affect physics.
// Returns:
//   outcome  — "ship" | "planet" | "expired"
//   hitShip  — index of the ship that was hit (only for outcome "ship";
//              self-hits are possible when a shot curves back around)
//   impact   — for outcome "planet": { x, y, nx, ny }, the point on the
//              planet's surface and its outward unit normal, for effects
//   path     — [{ x, y }] sampled every SIM_DT, for animation
//   duration — seconds the shot flew
export function simulateShot(planets, ships, shooter, angle, power) {
  let x = ships[shooter].x + SHOT_SPAWN_DIST * Math.cos(angle);
  let y = ships[shooter].y + SHOT_SPAWN_DIST * Math.sin(angle);
  let vx = power * Math.cos(angle);
  let vy = power * Math.sin(angle);

  const path = [{ x, y }];
  let elapsed = 0;

  while (elapsed < SHOT_LIFETIME) {
    elapsed += SIM_DT;

    // Each planet attracts the shot: acceleration =
    // GRAVITY * radius² / distance^FALLOFF (normalised at GRAVITY_REF),
    // pointed at its centre. A falloff below 2 gives gravity a longer reach.
    for (const p of planets) {
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      // Normalised falloff: denominator is dist^FALLOFF scaled so it equals
      // dist² at GRAVITY_REF, so the pull at REF is unchanged.
      const falloff =
        dist ** GRAVITY_FALLOFF * GRAVITY_REF ** (2 - GRAVITY_FALLOFF);
      const accel = (GRAVITY * p.radius * p.radius) / falloff;
      vx += (dx / dist) * accel * SIM_DT;
      vy += (dy / dist) * accel * SIM_DT;
    }

    x += vx * SIM_DT;
    y += vy * SIM_DT;
    path.push({ x, y });

    for (const p of planets) {
      const dx = x - p.x;
      const dy = y - p.y;
      const distSq = dx * dx + dy * dy;
      const limit = p.radius + SHOT_RADIUS;
      if (distSq < limit * limit) {
        // Surface normal, pointing from the planet centre out to the impact.
        const dist = Math.sqrt(distSq);
        const nx = dist === 0 ? 1 : dx / dist;
        const ny = dist === 0 ? 0 : dy / dist;
        const impact = {
          x: p.x + nx * p.radius,
          y: p.y + ny * p.radius,
          nx,
          ny,
        };
        return {
          outcome: "planet",
          hitShip: null,
          impact,
          path,
          duration: elapsed,
        };
      }
    }

    for (let i = 0; i < ships.length; i += 1) {
      const dx = ships[i].x - x;
      const dy = ships[i].y - y;
      const limit = SHIP_HIT_RADIUS + SHOT_RADIUS;
      if (dx * dx + dy * dy < limit * limit) {
        return { outcome: "ship", hitShip: i, path, duration: elapsed };
      }
    }
  }

  return { outcome: "expired", hitShip: null, path, duration: elapsed };
}
