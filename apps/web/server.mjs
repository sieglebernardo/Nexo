import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = resolve(fileURLToPath(new URL("./dist/", import.meta.url)));
const indexFile = join(distDirectory, "index.html");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = "0.0.0.0";

if (!existsSync(indexFile)) {
  throw new Error("apps/web/dist/index.html is missing; run the web build first");
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self';base-uri 'self';connect-src 'self' https:;font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';style-src 'self' 'unsafe-inline'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};

function send(response, statusCode, headers, body) {
  response.writeHead(statusCode, { ...securityHeaders, ...headers });
  response.end(body);
}

function isInsideDist(filePath) {
  const pathFromDist = relative(distDirectory, filePath);
  return pathFromDist === "" || (!pathFromDist.startsWith(`..${sep}`) && pathFromDist !== "..");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, { Allow: "GET, HEAD" }, "Method Not Allowed\n");
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(request.url ?? "/", "http://localhost");
  } catch {
    send(response, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request\n");
    return;
  }

  if (requestUrl.pathname === "/health") {
    send(
      response,
      200,
      { "Content-Type": "application/json; charset=utf-8" },
      request.method === "HEAD" ? undefined : JSON.stringify({ service: "nexo-web", status: "ok" }),
    );
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestUrl.pathname);
  } catch {
    send(response, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request\n");
    return;
  }

  const requestedFile = resolve(distDirectory, `.${decodedPath}`);
  let filePath = isInsideDist(requestedFile) && existsSync(requestedFile) ? requestedFile : null;
  if (filePath && !statSync(filePath).isFile()) filePath = null;

  const isAssetRequest = extname(decodedPath) !== "";
  if (!filePath && !isAssetRequest) filePath = indexFile;
  if (!filePath) {
    send(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found\n");
    return;
  }

  const body = await readFile(filePath);
  const isIndex = filePath === indexFile;
  const isHashedAsset = filePath.startsWith(join(distDirectory, "assets") + sep);
  send(
    response,
    200,
    {
      "Cache-Control": isIndex
        ? "no-cache"
        : isHashedAsset
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      "Content-Length": String(body.byteLength),
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    },
    request.method === "HEAD" ? undefined : body,
  );
});

server.listen({ host, port }, () => {
  console.log(`Nexo web listening on http://${host}:${port}`);
});
