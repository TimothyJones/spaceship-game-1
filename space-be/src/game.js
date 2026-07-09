import crypto from "node:crypto";
import {
  DEFAULT_SHOT_POWER,
  MIN_SHOT_POWER,
  MAX_SHOT_POWER,
  SHIP_STARTS,
  generatePlanets,
  simulateShot,
} from "space-engine";

// Errors that map to HTTP responses; anything else is a 500.
export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Game codes avoid ambiguous characters (0/O, 1/I) so they're easy to share.
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newGameId = () =>
  Array.from(
    { length: 6 },
    () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)],
  ).join("");

const newToken = () => crypto.randomBytes(16).toString("hex");

function cleanName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new GameError(400, "name is required");
  }
  return name.trim().slice(0, 20);
}

const freshShips = () => SHIP_STARTS.map((ship) => ({ ...ship }));

export function createGame(name) {
  return {
    id: newGameId(),
    version: 0,
    createdAt: Date.now(),
    status: "waiting", // waiting -> playing -> finished
    players: [{ name: cleanName(name), token: newToken() }],
    planets: generatePlanets(),
    ships: freshShips(),
    currentPlayer: 0,
    turn: 0,
    scores: [0, 0],
    targetScore: 2, // best of three
    lastShot: null,
    winner: null,
  };
}

export function joinGame(game, name) {
  if (game.status !== "waiting") {
    throw new GameError(409, "game already has two players");
  }
  game.players.push({ name: cleanName(name), token: newToken() });
  game.status = "playing";
  return game;
}

// Resolve one turn: fire a shot, score it, and advance the game.
export function applyTurn(game, token, angle, power) {
  const shooter = game.players.findIndex((p) => p.token === token);
  if (shooter === -1) throw new GameError(403, "unknown player token");
  if (game.status !== "playing") {
    throw new GameError(409, "game is not in progress");
  }
  if (shooter !== game.currentPlayer) throw new GameError(409, "not your turn");
  if (!Number.isFinite(angle))
    throw new GameError(400, "angle must be a number");

  const clampedPower = Math.min(
    MAX_SHOT_POWER,
    Math.max(MIN_SHOT_POWER, Number(power) || DEFAULT_SHOT_POWER),
  );

  const result = simulateShot(
    game.planets,
    game.ships,
    shooter,
    angle,
    clampedPower,
  );

  game.ships[shooter].angle = angle;
  // Snapshot the planets the shot flew through so clients can replay it for
  // animation even after a round reset regenerates the field.
  game.lastShot = {
    turn: game.turn,
    shooter,
    angle,
    power: clampedPower,
    outcome: result.outcome,
    hitShip: result.hitShip,
    planets: game.planets,
  };
  game.turn += 1;

  if (result.outcome === "ship") {
    // The survivor scores — including when a shot curves back and hits the
    // ship that fired it.
    const scorer = 1 - result.hitShip;
    game.scores[scorer] += 1;
    if (game.scores[scorer] >= game.targetScore) {
      game.status = "finished";
      game.winner = scorer;
    } else {
      // New round: fresh field, and the player who was hit shoots first.
      game.planets = generatePlanets();
      game.ships = freshShips();
      game.currentPlayer = result.hitShip;
    }
  } else {
    game.currentPlayer = 1 - game.currentPlayer;
  }

  return game;
}

// What clients are allowed to see: everything except player tokens.
export function publicGame(game) {
  return {
    ...game,
    players: game.players.map((p) => ({ name: p.name })),
  };
}
