import { GameError } from "../game.js";

// In-memory store for local development. Same interface as the DynamoDB
// store: optimistic concurrency via a version counter, so two requests
// mutating the same game can't silently clobber each other.
export function createMemoryStore() {
  const games = new Map();
  return {
    async get(id) {
      const game = games.get(id);
      return game ? structuredClone(game) : null;
    },

    // expectedVersion null means "create": fails if the id already exists.
    // Otherwise the write only succeeds if the stored version still matches.
    async put(game, expectedVersion) {
      const current = games.get(game.id);
      if (expectedVersion === null) {
        if (current) throw new GameError(409, "game id collision");
      } else if (!current || current.version !== expectedVersion) {
        throw new GameError(409, "game was modified concurrently");
      }
      const saved = structuredClone({
        ...game,
        version: expectedVersion === null ? 1 : expectedVersion + 1,
      });
      games.set(game.id, saved);
      return structuredClone(saved);
    },
  };
}
