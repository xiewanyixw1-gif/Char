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
  const [source, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /models: string\[\]/);
  assert.match(source, /快速切换/);
  assert.match(source, /另存为新预设/);
  assert.match(source, /已切换到站点预设/);
  assert.match(source, /创作 API/);
  assert.match(source, /生图 API/);
  assert.match(source, /测试生成兼容/);
  assert.match(source, /generation-error/);
  assert.match(source, /parseGeneratedJson/);
  assert.match(route, /TEST_JSON_SYSTEM/);
  assert.match(route, /response_format/);
  assert.match(route, /max_tokens/);
  assert.match(source, /正在生成第 1\/3 部分/);
  assert.match(source, /character-create-core/);
  assert.match(source, /character-create-story/);
  assert.match(source, /character-create-visual/);
  assert.match(route, /characterSegmentSystem/);
  assert.match(route, /50000/);
  assert.match(source, /direct: true/);
  assert.match(source, /anthropic-dangerous-direct-browser/);
  assert.match(source, /Netlify 代理等待超时/);
  assert.match(route, /body\.direct/);
  assert.match(route, /Cache-Control.*no-store/);
});

test("allows deleting a character directly from the character library", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /deleteCharacterById/);
  assert.match(source, /确定删除角色/);
  assert.match(source, /onClick=\{\(\) => deleteCharacterById\(item.id\)\}/);
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
  assert.match(css, /grid-template-columns: repeat\(6/);
  assert.match(css, /\.library-page \.page-intro-actions/);
  assert.match(css, /\.library-entry textarea \{ overflow-wrap: anywhere/);
});

test("separates online and offline greeting modes", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /type GreetingMode = "online" \| "offline"/);
  assert.match(page, /线上聊天/);
  assert.match(page, /线下聊天/);
  assert.match(route, /greetingModes/);
  assert.match(route, /线上聊天要符合消息/);
});

test("uses a structured persona template and relationship premise", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /char-persona-reference-template/);
  assert.match(page, /char-user-relationship-premise/);
  assert.match(page, /userRelationship: string/);
  assert.match(page, /产生并持续交集的原因/);
  assert.match(route, /relationshipStage/);
  assert.match(route, /不得强行偶遇或越级推进/);
});

test("structures biographies by age and prevents module repetition", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /char-module-boundaries/);
  assert.match(page, /23-现在（社会）/);
  assert.match(page, /对未来的期望/);
  assert.match(route, /MODULE_BOUNDARIES_SYSTEM/);
  assert.match(route, /超过当前年龄的阶段写“尚未经历”/);
  assert.match(route, /各阶段内容不得重复/);
});

test("provides a character image studio with independent API presets", async () => {
  const [page, imageRoute, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /CHARACTER IMAGE STUDIO/);
  assert.match(page, /char-image-api-presets/);
  assert.match(page, /设为卡片背景/);
  assert.match(page, /loadImageModels/);
  assert.match(page, /生图模型列表地址/);
  assert.match(page, /GPT_IMAGE_SIZES/);
  assert.match(page, /NAI_IMAGE_SIZES/);
  assert.match(page, /832x1216/);
  assert.match(page, /1472x1472/);
  assert.match(page, /自定义图片尺寸/);
  assert.match(page, /选择本次生成尺寸/);
  assert.match(page, /选择本次生成图片数量/);
  assert.match(page, /选择情绪（可多选）/);
  assert.match(page, /IMAGE_EMOTIONS/);
  assert.match(page, /正在生成第/);
  assert.match(page, /for \(const \[index, request\] of requests\.entries\(\)\)/);
  assert.match(page, /保存图片/);
  assert.match(page, /saveImageUrl/);
  assert.match(page, /navigator\.canShare/);
  assert.match(page, /存储图像/);
  assert.match(page, /image-save-overlay/);
  assert.match(page, /查看大图/);
  assert.match(page, /moveImagePreview/);
  assert.match(page, /replace\(\/-\/g, "\+"\)/);
  assert.match(page, /generatedObjectUrls/);
  assert.match(page, /URL\.createObjectURL\(localBlob\)/);
  assert.match(page, /自动重试中/);
  assert.match(page, /image-result-tabs/);
  assert.match(page, /optimizeImageForStorage/);
  assert.match(page, /canvas\.toDataURL\("image\/jpeg"/);
  assert.match(page, /已压缩并设为/);
  assert.match(imageRoute, /images\/generations/);
  assert.match(imageRoute, /normalizedModelsEndpoint/);
  assert.match(imageRoute, /无法拉取生图模型/);
  assert.match(imageRoute, /b64_json/);
  assert.match(imageRoute, /contentType\.startsWith\("image\/"\)/);
  assert.match(imageRoute, /payload\.artifacts/);
  assert.match(imageRoute, /返回字段/);
  assert.match(css, /\.image-studio-grid/);
  assert.match(css, /\.image-save-preview/);
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
  assert.match(serviceWorker, /char-shell-v19/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
