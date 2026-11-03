import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Char workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Char/);
  assert.match(html, /角色工作室/);
  assert.match(html, /角色库/);
  assert.match(html, /批量导入/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps multiple world books bound to each character", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /worldBooks: WorldBookRecord\[\]/);
  assert.match(source, /保存并绑定/);
  assert.match(source, /AI 再次生成时会另存一本/);
});

test("stores and switches independent API site presets", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /models: string\[\]/);
  assert.match(source, /快速切换/);
  assert.match(source, /另存为新预设/);
  assert.match(source, /已切换到站点预设/);
});

test("supports local issue repair, built-in knowledge, and batch archives", async () => {
  const [page, route, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /仅修复这一项/);
  assert.match(page, /char-npc-ensemble/);
  assert.match(page, /char-character-bundle-v1/);
  assert.match(page, /char-world-book-bundle-v1/);
  assert.match(route, /一次只解决用户明确指出的当前问题/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /grid-template-columns: repeat\(5/);
});

test("ships installable app assets and removes the starter preview", async () => {
  const [manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  const parsed = JSON.parse(manifest);
  assert.equal(parsed.name, "Char 角色工作室");
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.icons.length, 2);
  assert.match(serviceWorker, /char-shell-v3/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
