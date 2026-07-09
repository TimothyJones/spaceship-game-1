import { useState } from "react";
import "./App.css";
import Lobby from "./Lobby.jsx";
import Game from "./Game.jsx";

// Top level: no session yet -> lobby; otherwise the game view. The session
// (game id + secret player token) lives in memory only, so a refresh returns
// to the lobby.
function App() {
  const [session, setSession] = useState(null);
  const [initialGame, setInitialGame] = useState(null);

  if (!session) {
    return (
      <div className="game">
        <header className="game__header">
          <h1>Spaceship Game</h1>
        </header>
        <Lobby
          onEnter={(newSession, game) => {
            setInitialGame(game);
            setSession(newSession);
          }}
        />
      </div>
    );
  }

  return (
    <Game
      key={session.gameId}
      session={session}
      initialGame={initialGame}
      onLeave={() => {
        setSession(null);
        setInitialGame(null);
      }}
    />
  );
}

export default App;
