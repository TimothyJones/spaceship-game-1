import { useState } from "react";
import { createGame, joinGame } from "./api.js";

// Entry screen: pick a name, then either start a new game (and share its
// code) or join a friend's game by code.
function Lobby({ onEnter }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const { game, token, playerIndex } = await action();
      onEnter({ gameId: game.id, token, playerIndex, name: name.trim() }, game);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const canCreate = name.trim() !== "" && !busy;
  const canJoin = canCreate && code.trim() !== "";

  return (
    <div className="lobby">
      <label className="lobby__field">
        Your name
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
        />
      </label>

      <div className="lobby__actions">
        <button
          type="button"
          className="game__button"
          disabled={!canCreate}
          onClick={() => run(() => createGame(name.trim()))}
        >
          Create game
        </button>

        <div className="lobby__join">
          <input
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Game code"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canJoin) {
                run(() => joinGame(code.trim(), name.trim()));
              }
            }}
          />
          <button
            type="button"
            className="game__button"
            disabled={!canJoin}
            onClick={() => run(() => joinGame(code.trim(), name.trim()))}
          >
            Join game
          </button>
        </div>
      </div>

      {error && <p className="lobby__error">{error}</p>}
    </div>
  );
}

export default Lobby;
