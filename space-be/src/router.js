import {
  GameError,
  applyTurn,
  createGame,
  joinGame,
  publicGame,
} from "./game.js";
import { getStore } from "./store/index.js";

// Load-mutate-save with optimistic concurrency. On a version conflict the
// mutation is retried against the fresh state; rule violations (wrong turn,
// game full, ...) surface as GameErrors from the mutation itself.
async function mutateGame(store, id, mutate) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const game = await store.get(id);
    if (!game) throw new GameError(404, "game not found");
    const expectedVersion = game.version;
    mutate(game);
    try {
      return await store.put(game, expectedVersion);
    } catch (err) {
      const conflict = err instanceof GameError && err.status === 409;
      if (!conflict || attempt === 2) throw err;
    }
  }
  throw new GameError(409, "game was modified concurrently");
}

// The whole API in one router, shared by the Lambda handler and the local
// dev server. Paths are relative to the /api prefix.
//
//   POST /games                { name }                -> 201 { game, token, playerIndex }
//   GET  /games/:id                                    -> 200 { game }
//   POST /games/:id/join       { name }                -> 200 { game, token, playerIndex }
//   POST /games/:id/turns      { token, angle, power } -> 200 { game }
export async function handleRequest(method, path, body) {
  const store = await getStore();
  try {
    let match;

    if (method === "POST" && path === "/games") {
      const game = createGame(body?.name);
      const saved = await store.put(game, null);
      return {
        status: 201,
        body: {
          game: publicGame(saved),
          token: saved.players[0].token,
          playerIndex: 0,
        },
      };
    }

    if ((match = path.match(/^\/games\/([A-Za-z0-9]+)$/)) && method === "GET") {
      const game = await store.get(match[1].toUpperCase());
      if (!game) throw new GameError(404, "game not found");
      return { status: 200, body: { game: publicGame(game) } };
    }

    if (
      (match = path.match(/^\/games\/([A-Za-z0-9]+)\/join$/)) &&
      method === "POST"
    ) {
      const saved = await mutateGame(store, match[1].toUpperCase(), (game) =>
        joinGame(game, body?.name),
      );
      return {
        status: 200,
        body: {
          game: publicGame(saved),
          token: saved.players[1].token,
          playerIndex: 1,
        },
      };
    }

    if (
      (match = path.match(/^\/games\/([A-Za-z0-9]+)\/turns$/)) &&
      method === "POST"
    ) {
      const saved = await mutateGame(store, match[1].toUpperCase(), (game) =>
        applyTurn(game, body?.token, body?.angle, body?.power),
      );
      return { status: 200, body: { game: publicGame(saved) } };
    }

    throw new GameError(404, "not found");
  } catch (err) {
    if (err instanceof GameError) {
      return { status: err.status, body: { error: err.message } };
    }
    console.error(err);
    return { status: 500, body: { error: "internal error" } };
  }
}
