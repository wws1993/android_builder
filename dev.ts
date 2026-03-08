/** 开发服务器：静态文件服务，支持热重载 */
import { resolve } from "path";
import { existsSync } from "fs";

const PORT = 5189;
const WWW_DIR = resolve(import.meta.dir, "www");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = resolve(WWW_DIR, pathname.slice(1));
    if (!filePath.startsWith(WWW_DIR)) return new Response("Forbidden", { status: 403 });
    if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });
    const file = Bun.file(filePath);
    const ext = pathname.split(".").pop();
    const mime: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      ico: "image/x-icon",
    };
    const contentType = mime[ext ?? ""] ?? "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": contentType } });
  },
});

console.log(`开发服务: http://localhost:${PORT}`);
