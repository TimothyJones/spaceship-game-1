import { createServer } from "node:http";
import { handleRequest } from "./router.js";

// Local stand-in for API Gateway + Lambda: same router, in-memory store.
// The frontend dev server proxies /api here (see space-fe/vite.config.js).
const PORT = Number(process.env.PORT ?? 3001);

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  let body = null;
  let response;
  if (raw !== "") {
    try {
      body = JSON.parse(raw);
    } catch {
      response = { status: 400, body: { error: "invalid JSON body" } };
    }
  }

  if (!response) {
    const path = new URL(req.url, "http://localhost").pathname.replace(
      /^\/api/,
      "",
    );
    response = await handleRequest(req.method, path, body);
  }

  res.writeHead(response.status, { "content-type": "application/json" });
  res.end(JSON.stringify(response.body));
});

server.listen(PORT, () => {
  console.log(`space-be local server listening on http://localhost:${PORT}`);
});
