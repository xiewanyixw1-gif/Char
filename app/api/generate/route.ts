import { NextResponse } from "next/server";

type Provider = "openai" | "anthropic" | "gemini" | "custom";
type RevisionSection = "basic" | "persona" | "greetings" | "biography" | "appearance" | "world" | "conflicts";

type GenerateRequest = {
  mode?: "character-create" | "character-extract" | "world" | "revise" | "test" | "models";
  section?: RevisionSection;
  prompt?: string;
  preset?: {
    provider?: Provider;
    endpoint?: string;
    modelsEndpoint?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
  };
};

const CHARACTER_EXTRACT_SYSTEM = `你是专业的 AI 角色设定整理师。完整阅读资料，忠实提取设定，不擅自改写身份、经历、关系或世界观。原文未明确的信息使用空字符串；冲突设定写入 conflicts，不自行裁决。保留人物复杂性、缺点、隐藏动机、语言风格和情绪变化。只返回合法 JSON，不要 Markdown、解释或代码围栏。JSON 必须包含以下键：name, gender, note, nickname, signature, age, suffix, language, persona, greetings, biography, appearance, conflicts。greetings 是 1 至 3 条字符串数组。persona 以第三人称整理身份、背景、性格、心理、欲望、恐惧、行为逻辑、说话方式、关系和互动模式。biography 按人生轨迹叙述。appearance 只写可视觉化信息。`;

const CHARACTER_CREATE_SYSTEM = `你是专业的 AI 角色设定创作师。用户会提供想要的人设方向与世界背景，请在严格遵守这些要求的前提下，直接创作一张完整、可长期稳定扮演的角色卡。合理补齐姓名、经历、关系、行为逻辑、语言习惯和视觉细节，使各模块互相一致；不要加入违背用户要求的身份、性格或关系。避免空泛标签、完美化人物和套路化表达，让角色有缺点、矛盾、欲望、恐惧与清晰边界。只返回合法 JSON，不要 Markdown、解释或代码围栏。JSON 必须包含以下键：name, gender, note, nickname, signature, age, suffix, language, persona, greetings, biography, appearance, conflicts。greetings 是 1 至 3 条可直接开聊的字符串数组，不替用户决定言行。persona 以第三人称写身份、背景、性格、心理、目标、弱点、行为逻辑、说话方式、关系与互动模式。biography 按时间线叙述。appearance 只写可视觉化内容。conflicts 用于记录需要用户确认的创作选择，没有则为空字符串。`;

const WORLD_SYSTEM = `你是世界观资料编辑。将输入拆成独立、清晰、可按关键词触发的世界书条目。覆盖必要的时代、地理、地点、国家、组织、制度、历史事件、人物关系、力量体系与特殊规则；不要把无关内容堆在一个条目里，不要编造输入中不存在的事实。只返回合法 JSON 数组，不要 Markdown、解释或代码围栏。每项包含 title, keys, content, category, priority, enabled。keys 是用中文逗号分隔的触发词字符串；category 只能是世界观、地点、组织、人物关系、历史事件、规则、力量体系之一；priority 为 1 到 100 的整数；enabled 为 true。`;

const TEST_SYSTEM = "这是 API 连通性测试。严格按照用户要求进行简短回复。";
const VARIABLE_SYSTEM = "变量规范：{{char}} 始终代表当前角色，{{user}} 始终代表与角色互动的用户。必须原样保留双花括号变量，不要擅自替换为具体姓名，也不要替 {{user}} 决定言行、台词、心理或过去。";

function revisionSystem(section?: RevisionSection) {
  const shared = "你正在根据用户的修改建议优化已经生成的角色卡。必须保留用户没有要求改变的核心设定，不要解释修改过程，不要输出前言、Markdown 或代码围栏。";
  switch (section) {
    case "basic":
      return `${shared} 只返回合法 JSON 对象，包含 name, gender, note, nickname, signature, age, suffix, language 八个字符串字段。`;
    case "greetings":
      return `${shared} 只返回合法 JSON 字符串数组，包含 1 至 3 条完整开场白；保持角色语气，不替用户决定行为、心理或台词。`;
    case "world":
      return `${shared} 只返回合法 JSON 数组。每项包含 title, keys, content, category, priority, enabled；保留仍适用的条目，并按建议增删或改写。`;
    case "persona":
      return `${shared} 只返回优化后的完整人设正文，保持第三人称，覆盖身份、心理、语言、关系和行为逻辑。`;
    case "biography":
      return `${shared} 只返回优化后的完整人物小传，按合理时间线叙述。`;
    case "appearance":
      return `${shared} 只返回优化后的完整生图外貌，只包含可以视觉呈现的特征。`;
    case "conflicts":
      return `${shared} 只返回优化后的“缺失信息与设定冲突”正文；不得擅自替用户裁决仍未确定的冲突。`;
    default:
      return `${shared} 只返回优化后的完整正文。`;
  }
}

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
  if (provider === "custom") {
    const url = new URL(endpoint);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") url.pathname = "/v1/chat/completions";
    else if (/\/v1$/i.test(path)) url.pathname = `${path}/chat/completions`;
    endpoint = url.toString();
  }
  if (provider === "gemini") {
    endpoint = endpoint.replace("{model}", encodeURIComponent(model));
    const url = new URL(endpoint);
    url.searchParams.set("key", apiKey);
    return url;
  }
  return new URL(endpoint);
}

function normalizedModelsEndpoint(provider: Provider, rawEndpoint: string, rawModelsEndpoint: string, apiKey: string) {
  const configured = rawModelsEndpoint.trim();
  let endpoint = configured || rawEndpoint.trim();
  endpoint = endpoint.replace("{model}", "model");
  const url = new URL(endpoint);

  if (!configured) {
    const path = url.pathname.replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(path)) url.pathname = path.replace(/\/chat\/completions$/i, "/models");
    else if (/\/responses$/i.test(path)) url.pathname = path.replace(/\/responses$/i, "/models");
    else if (/\/messages$/i.test(path)) url.pathname = path.replace(/\/messages$/i, "/models");
    else if (/\/models\/.*:generateContent$/i.test(path)) url.pathname = path.replace(/\/models\/.*:generateContent$/i, "/models");
    else if (!path || path === "/") url.pathname = provider === "gemini" ? "/v1beta/models" : "/v1/models";
    else if (/\/v1(?:beta)?$/i.test(path)) url.pathname = `${path}/models`;
    else url.pathname = `${path}/models`;
  }

  if (provider === "gemini") url.searchParams.set("key", apiKey);
  return url;
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const mode = body.mode ?? "character";
  const section = body.section;
  const prompt = body.prompt?.trim() ?? "";
  const provider = body.preset?.provider ?? "openai";
  const endpoint = body.preset?.endpoint?.trim() ?? "";
  const modelsEndpoint = body.preset?.modelsEndpoint?.trim() ?? "";
  const model = body.preset?.model?.trim() ?? "";
  const apiKey = body.preset?.apiKey?.trim() ?? "";
  const temperature = Math.max(0, Math.min(1.5, Number(body.preset?.temperature) || 0.7));

  if (mode !== "models" && (!prompt || prompt.length > 140000)) return NextResponse.json({ error: "资料为空或内容过长" }, { status: 400 });
  if (!endpoint || (!model && mode !== "models") || !apiKey) return NextResponse.json({ error: "请完整填写接口地址、模型名称和 API Key" }, { status: 400 });
  if (!["openai", "anthropic", "gemini", "custom"].includes(provider)) return NextResponse.json({ error: "不支持的 API 类型" }, { status: 400 });

  if (mode === "models") {
    let target: URL;
    try {
      target = normalizedModelsEndpoint(provider, endpoint, modelsEndpoint, apiKey);
      if (target.protocol !== "https:" || blockedHost(target.hostname)) throw new Error("unsafe");
    } catch {
      return NextResponse.json({ error: "模型列表地址必须是可公开访问的 HTTPS 地址" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (provider === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (provider !== "gemini") {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(target, { headers, signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const apiError = payload.error as { message?: string } | string | undefined;
        const message = typeof apiError === "string" ? apiError : apiError?.message;
        return NextResponse.json({ error: message || `模型列表接口返回 ${response.status}` }, { status: response.status < 500 ? response.status : 502 });
      }

      const candidates = (Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : []) as Array<Record<string, unknown> | string>;
      const models = candidates
        .filter((item) => {
          if (typeof item === "string") return true;
          const methods = item.supportedGenerationMethods;
          return !Array.isArray(methods) || methods.includes("generateContent");
        })
        .map((item) => {
          if (typeof item === "string") return item;
          const value = item.id ?? item.name;
          return typeof value === "string" ? value.replace(/^models\//, "") : "";
        })
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 1000);

      if (!models.length) return NextResponse.json({ error: "接口已连接，但没有返回可用模型" }, { status: 502 });
      return NextResponse.json({ models });
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "拉取模型超时，请稍后重试" : "无法拉取模型，请检查接口地址和 API Key";
      return NextResponse.json({ error: message }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  }

  let target: URL;
  try {
    target = normalizedEndpoint(provider, endpoint, model, apiKey);
    if (target.protocol !== "https:" || blockedHost(target.hostname)) throw new Error("unsafe");
  } catch {
    return NextResponse.json({ error: "接口地址必须是可公开访问的 HTTPS 地址" }, { status: 400 });
  }

  const baseSystem = mode === "world"
    ? WORLD_SYSTEM
    : mode === "test"
      ? TEST_SYSTEM
      : mode === "revise"
        ? revisionSystem(section)
        : mode === "character-create"
          ? CHARACTER_CREATE_SYSTEM
          : CHARACTER_EXTRACT_SYSTEM;
  const system = mode === "test" ? baseSystem : `${baseSystem}\n${VARIABLE_SYSTEM}`;
  const textRevision = mode === "revise" && ["persona", "biography", "appearance", "conflicts"].includes(section ?? "");
  const expectsJson = mode !== "test" && !textRevision;
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
          generationConfig: { temperature, responseMimeType: expectsJson ? "application/json" : "text/plain" },
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
