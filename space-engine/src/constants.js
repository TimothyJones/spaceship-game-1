export const WIDTH = 900;
export const HEIGHT = 600;
export const MIN_PLANETS = 3;
export const MAX_PLANETS = 5;

export const SHOT_RADIUS = 5;
export const SHOT_LIFETIME = 10; // seconds a shot lives, even off-screen
// Gravitational constant, tuned for gameplay. A planet's mass scales with
// radius², so bigger planets pull harder; pull falls off with distance².
export const GRAVITY = 1000;
export const ROTATION_SPEED = Math.PI / 2; // radians per second while an arrow is held
export const SHIP_NOSE = 18; // distance from ship centre to its nose
export const SHIP_HIT_RADIUS = 16; // ships are treated as circles for hit detection

// Shots spawn just past the nose so a freshly fired shot never overlaps the
// shooter's own hit circle (24 > SHIP_HIT_RADIUS + SHOT_RADIUS).
export const SHOT_SPAWN_DIST = SHIP_NOSE + SHOT_RADIUS + 1;

// A shot's launch speed depends on how long Space is held. Releasing instantly
// fires at the minimum; holding for CHARGE_TIME seconds reaches the maximum.
export const SHOT_MIN_SPEED = 160; // pixels per second, at no charge
export const SHOT_MAX_SPEED = 560; // pixels per second, at full charge
export const CHARGE_TIME = 1.4; // seconds of holding Space to reach full power

// Fixed simulation timestep. Server and client both step shots at this rate,
// so a client can replay a shot for animation and land on the same outcome
// the server computed.
export const SIM_DT = 1 / 120;

// The two ships live on opposite sides of the screen, vertically centred.
// `angle` is the direction the nose points (radians, 0 = right).
export const SHIP_STARTS = [
  { x: 60, y: HEIGHT / 2, angle: 0 },
  { x: WIDTH - 60, y: HEIGHT / 2, angle: Math.PI },
];
