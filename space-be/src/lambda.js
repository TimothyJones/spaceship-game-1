import { handleRequest } from "./router.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

// Entry point for API Gateway (HTTP API, payload format 2.0). All routes go
// through the shared router; the /api prefix used by the frontend is
// stripped here.
export async function handler(event) {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const path = event.rawPath.replace(/^\/api/, "");
  let body = null;
  if (event.body) {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    try {
      body = JSON.parse(raw);
    } catch {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ error: "invalid JSON body" }),
      };
    }
  }

  const result = await handleRequest(method, path, body);
  return {
    statusCode: result.status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(result.body),
  };
}
