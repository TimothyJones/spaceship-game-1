// Thin client for the game API. In dev, /api is proxied to the local backend
// (see vite.config.js); in production set VITE_API_URL to the deployed API.
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `request failed (${res.status})`);
  }
  return data;
}

export const createGame = (name) => request("POST", "/games", { name });
export const joinGame = (id, name) =>
  request("POST", `/games/${encodeURIComponent(id)}/join`, { name });
export const getGame = (id) =>
  request("GET", `/games/${encodeURIComponent(id)}`);
export const submitTurn = (id, token, angle, power) =>
  request("POST", `/games/${encodeURIComponent(id)}/turns`, {
    token,
    angle,
    power,
  });
