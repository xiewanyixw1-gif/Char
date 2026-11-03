import { NextResponse } from "next/server";

type ImageRequest = {
  prompt?: string;
  negativePrompt?: string;
  preset?: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    size?: string;
    quality?: string;
    style?: string;
  };
};

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^169\.254\./.test(host);
}

function normalizedImageEndpoint(rawEndpoint: string) {
  const target = new URL(rawEndpoint.trim());
  const path = target.pathname.replace(/\/+$/, "");
  if (!path || path === "/") target.pathname = "/v1/images/generations";
  else if (/\/v1$/i.test(path)) target.pathname = `${path}/images/generations`;
  else if (!/\/images\/generations$/i.test(path)) target.pathname = `${path}/images/generations`;
  return target;
}

function errorMessage(payload: Record<string, unknown>) {
  const error = payload.error as { message?: string } | string | undefined;
  return typeof error === "string" ? error : error?.message;
}

export async function POST(request: Request) {
  let body: ImageRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const prompt = body.prompt?.trim() ?? "";
  const negativePrompt = body.negativePrompt?.trim() ?? "";
  const endpoint = body.preset?.endpoint?.trim() ?? "";
  const model = body.preset?.model?.trim() ?? "";
  const apiKey = body.preset?.apiKey?.trim() ?? "";
  const size = body.preset?.size?.trim() ?? "";
  const quality = body.preset?.quality?.trim() ?? "";
  const style = body.preset?.style?.trim() ?? "";

  if (!prompt || prompt.length > 30000 || negativePrompt.length > 6000) return NextResponse.json({ error: "生图提示词为空或内容过长" }, { status: 400 });
  if (!endpoint || !model || !apiKey) return NextResponse.json({ error: "请完整填写生图接口地址、模型名称和 API Key" }, { status: 400 });

  let target: URL;
  try {
    target = normalizedImageEndpoint(endpoint);
    if (target.protocol !== "https:" || blockedHost(target.hostname)) throw new Error("unsafe");
  } catch {
    return NextResponse.json({ error: "生图接口必须是可公开访问的 HTTPS 地址" }, { status: 400 });
  }

  const upstreamBody: Record<string, unknown> = {
    model,
    prompt: negativePrompt ? `${prompt}\n\nAvoid / negative prompt: ${negativePrompt}` : prompt,
    n: 1,
  };
  if (size && size !== "auto") upstreamBody.size = size;
  if (quality && quality !== "auto") upstreamBody.quality = quality;
  if (style) upstreamBody.style = style;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ error: errorMessage(payload) || `生图接口返回 ${response.status}` }, { status: response.status < 500 ? response.status : 502 });

    const data = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
    const images = Array.isArray(payload.images) ? payload.images as Array<Record<string, unknown>> : [];
    const output = Array.isArray(payload.output) ? payload.output as Array<Record<string, unknown>> : [];
    const first = data[0] ?? images[0] ?? output[0] ?? {};
    const base64 = typeof first.b64_json === "string" ? first.b64_json : typeof first.base64 === "string" ? first.base64 : "";
    const url = typeof first.url === "string" ? first.url : typeof first.image_url === "string" ? first.image_url : "";
    const mimeType = typeof first.mime_type === "string" ? first.mime_type : "image/png";
    const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : url;
    const revisedPrompt = typeof first.revised_prompt === "string" ? first.revised_prompt : undefined;

    if (!imageUrl) return NextResponse.json({ error: "接口已响应，但没有返回可识别的图片 URL 或 base64 数据" }, { status: 502 });
    return NextResponse.json({ imageUrl, revisedPrompt });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "生图超时，请稍后重试或降低图片尺寸" : "无法连接生图接口，请检查地址、模型、密钥和网络";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
