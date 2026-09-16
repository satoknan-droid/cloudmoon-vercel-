import { Readable } from "node:stream";
import worker from "../worker.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

function requestHeaders(incomingHeaders) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function responseHeaders(headers) {
  const output = {};

  headers.forEach((value, name) => {
    if (!["content-encoding", "content-length", "transfer-encoding"].includes(name)) {
      output[name] = value;
    }
  });

  return output;
}

export default async function handler(req, res) {
  try {
    const protocol = req.headers["x-forwarded-proto"]?.split(",")[0] || "https";
    const host = req.headers.host || "localhost";
    const method = req.method || "GET";
    const hasBody = !["GET", "HEAD"].includes(method);

    const request = new Request(`${protocol}://${host}${req.url || "/"}`, {
      method,
      headers: requestHeaders(req.headers),
      body: hasBody ? req : undefined,
      duplex: hasBody ? "half" : undefined,
    });

    const response = await worker.fetch(request);
    res.statusCode = response.status;
    res.setHeader("Cache-Control", "no-store");

    for (const [name, value] of Object.entries(responseHeaders(response.headers))) {
      res.setHeader(name, value);
    }

    if (!response.body) {
      res.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("Vercel request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
}
