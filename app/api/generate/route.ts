import { NextResponse } from "next/server";

type Provider = "openai" | "anthropic" | "gemini" | "custom";

type GenerateRequest = {
  mode?: "character" | "world" | "test";
  prompt?: string;
  preset?: {
    provider?: Provider;
    endpoint?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
  };
};

const CHARACTER_SYSTEM = `你是专业的 AI 角色设定整理师。完整阅读资料，忠实提取设定，不擅自改写身份、经历、关系或世界观。原文未明确的信息使用空字符串；冲突设定写入 conflicts，不自行裁决。保留人物复杂性、缺点、隐藏动机、语言风格和情绪变化。只返回合法 JSON，不要 Markdown、解释或代码围栏。JSON 必须包含以下键：name, gender, note, nickname, signature, age, suffix, language, persona, greetings, biography, appearance, conflicts。greetings 是 1 至 3 条字符串数组。persona 以第三人称整理身份、背景、性格、心理、欲望、恐惧、行为逻辑、说话方式、关系和互动模式。biography 按人生轨迹叙述。appearance 只写可视觉化信息。`;

const WORLD_SYSTEM = `你是世界观资料编辑。将输入拆成独立、清晰、可按关键词触发的世界书条目。覆盖必要的时代、地理、地点、国家、组织、制度、历史事件、人物关系、力量体系与特殊规则；不要把无关内容堆在一个条目里，不要编造输入中不存在的事实。只返回合法 JSON 数组，不要 Markdown、解释或代码围栏。每项包含 title, keys, content, category, priority, enabled。keys 是用中文逗号分隔的触发词字符串；category 只能是世界观、地点、组织、人物关系、历史事件、规则、力量体系之一；priority 为 1 到 100 的整数；enabled 为 true。`;

const TEST_SYSTEM = "这是 API 连通性测试。严格按照用户要求进行简短回复。";

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^169\.254\./.test(host);
}

function normalizedEndpoint(provider: Provider, rawEndpoint: string, model: string, apiKey: string) {
  let endpoint = rawEndpoint.trim();
  if (provider === "custom" && /\/v1\/?$/i.test(endpoint)) endpoint = `${endpoint.replace(/\/$/, "")}/chat/completions`;
  if (provider === "gemini") {
    endpoint = endpoint.replace("{model}", encodeURIComponent(model));
    const url = new URL(endpoint);
    url.searchParams.set("key", apiKey);
    return url;
  }
  return new URL(endpoint);
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const mode = body.mode ?? "character";
  const prompt = body.prompt?.trim() ?? "";
  const provider = body.preset?.provider ?? "openai";
  const endpoint = body.preset?.endpoint?.trim() ?? "";
  const model = body.preset?.model?.trim() ?? "";
  const apiKey = body.preset?.apiKey?.trim() ?? "";
  const temperature = Math.max(0, Math.min(1.5, Number(body.preset?.temperature) || 0.7));

  if (!prompt || prompt.length > 140000) return NextResponse.json({ error: "资料为空或内容过长" }, { status: 400 });
  if (!endpoint || !model || !apiKey) return NextResponse.json({ error: "请完整填写接口地址、模型名称和 API Key" }, { status: 400 });
  if (!["openai", "anthropic", "gemini", "custom"].includes(provider)) return NextResponse.json({ error: "不支持的 API 类型" }, { status: 400 });

  let target: URL;
  try {
    target = normalizedEndpoint(provider, endpoint, model, apiKey);
    if (target.protocol !== "https:" || blockedHost(target.hostname)) throw new Error("unsafe");
  } catch {
    return NextResponse.json({ error: "接口地址必须是可公开访问的 HTTPS 地址" }, { status: 400 });
  }

  const system = mode === "world" ? WORLD_SYSTEM : mode === "test" ? TEST_SYSTEM : CHARACTER_SYSTEM;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    let response: Response;
    if (provider === "anthropic") {
      response = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 5000, temperature, system, messages: [{ role: "user", content: prompt }] }),
        signal: controller.signal,
      });
    } else if (provider === "gemini") {
      response = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, responseMimeType: mode === "test" ? "text/plain" : "application/json" },
        }),
        signal: controller.signal,
      });
    } else {
      response = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    }

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const apiError = payload.error as { message?: string } | string | undefined;
      const message = typeof apiError === "string" ? apiError : apiError?.message;
      return NextResponse.json({ error: message || `上游接口返回 ${response.status}` }, { status: response.status < 500 ? response.status : 502 });
    }

    let text = "";
    if (provider === "anthropic") {
      const content = payload.content as Array<{ type?: string; text?: string }> | undefined;
      text = content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? "";
    } else if (provider === "gemini") {
      const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
      text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
    } else {
      const choices = payload.choices as Array<{ message?: { content?: string | Array<{ text?: string }> } }> | undefined;
      const content = choices?.[0]?.message?.content;
      text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : "";
    }

    if (!text.trim()) return NextResponse.json({ error: "接口已响应，但没有返回文本内容" }, { status: 502 });
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "接口响应超时，请稍后重试" : "无法连接该接口，请检查地址、模型和网络";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
