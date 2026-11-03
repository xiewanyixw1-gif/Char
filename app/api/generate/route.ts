import { NextResponse } from "next/server";

type Provider = "openai" | "anthropic" | "gemini" | "custom";
type RevisionSection = "basic" | "persona" | "greetings" | "biography" | "appearance" | "world" | "conflicts";

type GenerateRequest = {
  mode?: "character-create" | "character-extract" | "world" | "revise" | "check" | "test" | "models";
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

const CHARACTER_EXTRACT_SYSTEM = `你是专业的 AI 角色设定整理师。完整阅读资料，忠实提取设定，不擅自改写身份、经历、关系或世界观。原文未明确的信息使用空字符串；冲突设定写入 conflicts，不自行裁决。保留人物复杂性、缺点、隐藏动机、语言风格和情绪变化。只返回合法 JSON，不要 Markdown、解释或代码围栏。JSON 必须包含以下键：name, gender, note, nickname, signature, age, suffix, language, persona, userRelationship, relationshipStage, connectionReason, greetings, greetingModes, biography, appearance, conflicts。greetings 是至少 1 条字符串数组，原资料有多个开场情境时全部保留。greetingModes 必须与 greetings 等长，每项只能是 online 或 offline；消息、电话、视频、社交平台等远程互动标为 online，同处一个现实场景的面对面互动标为 offline。userRelationship 写角色与 {{user}} 当前的具体关系，relationshipStage 写双方目前所处的关系阶段，connectionReason 写最初产生交集及持续联系的原因；原资料未明确时保持空字符串，不得推测。每条开场白必须符合这三项关系前提、称呼和情感距离。persona 以第三人称按人物核心、身份生活、表面与内在性格、欲望恐惧、缺点边界、兴趣喜恶、健康习惯、情感观、重要关系、成长影响、情绪反应、语言与行为逻辑组织；外貌细节集中写入 appearance，不在 persona 中反复堆砌。叙述中使用角色真实姓名。biography 按人生轨迹叙述。appearance 只写可视觉化信息。`;

const CHARACTER_CREATE_SYSTEM = `你是专业的 AI 角色设定创作师。用户会提供想要的人设方向与世界背景，请在严格遵守这些要求的前提下，直接创作一张完整、可长期稳定扮演的角色卡。合理补齐姓名、经历、关系、行为逻辑、语言习惯和视觉细节，使各模块互相一致；不要加入违背用户要求的身份、性格或关系。避免空泛标签、完美化人物和套路化表达，让角色有缺点、矛盾、欲望、恐惧与清晰边界。只返回合法 JSON，不要 Markdown、解释或代码围栏。JSON 必须包含以下键：name, gender, note, nickname, signature, age, suffix, language, persona, userRelationship, relationshipStage, connectionReason, greetings, greetingModes, biography, appearance, conflicts。userRelationship 必须写角色与 {{user}} 当前是什么具体关系；relationshipStage 必须写双方正处于陌生、初识、熟悉、朋友、暧昧、交往、婚后或其他哪个准确阶段；connectionReason 必须写最初如何产生交集、为什么现在仍保持联系，并与时代、城市、学校、家庭、职业及人物经历一致。用户已指定时严格保留，未指定时围绕人设合理补齐。greetings 是至少 1 条可直接开聊的字符串数组；每条必须遵守同一关系前提、称呼、已知信息和情感距离，不强行偶遇、不越级亲密、不替用户决定言行。greetingModes 必须与 greetings 等长，每项只能是 online 或 offline；消息、电话、视频、社交平台等远程互动标为 online，同处一个现实场景的面对面互动标为 offline。适合时至少各生成一条线上和线下开场，但不要违背用户明确指定的单一场景。线上开场要呈现聊天媒介与消息节奏，线下开场要呈现环境、动作和现场感。persona 以第三人称按人物核心、身份与生活基础、外在第一印象、表面与内在性格、欲望与恐惧、缺点与边界、兴趣喜恶、健康与习惯、情感观与关系递进、重要人际关系、成长经历造成的影响，以及开心、生气、失落、害羞和动情时不同的微表情、动作与语言反应组织；同时写明语言风格、行为逻辑、日常作息、擅长与不擅长和有依据的反差点。外貌细节集中写入 appearance，不在 persona 和日常互动中反复复述；亲密或成人设定只有用户明确要求且相关角色均为成年人时才补充。描述中始终使用生成出的角色真实姓名。背景需明确时代、城市或学校、家庭与社会环境，不能只用模糊占位词。biography 按时间线叙述。appearance 只写可视觉化内容。conflicts 用于记录需要用户确认的创作选择，没有则为空字符串。`;

const WORLD_SYSTEM = `你是世界观与群像资料编辑。将输入拆成独立、清晰、可按关键词触发的世界书条目。覆盖必要的时代、国家、城市、地点、学校、家庭、组织、制度、历史事件、人物关系、力量体系与特殊规则。根据角色身份补足有不同姓名、性格、目标、说话方式与关系的 NPC 群像，NPC 不得同质化或只作为工具人；校园背景需明确学校、年级班级、校规、社团、宿舍和师生同学，家庭背景需明确成员、经济与关系。不要把无关内容堆在一个条目里，也不要违背输入中的事实。只返回合法 JSON 数组，不要 Markdown、解释或代码围栏。每项包含 title, keys, content, category, priority, enabled。keys 是用中文逗号分隔的触发词字符串；category 只能是世界观、时代、城市、地点、学校、家庭、NPC、组织、人物关系、历史事件、规则、力量体系之一；priority 为 1 到 100 的整数；enabled 为 true。`;
const CONSISTENCY_SYSTEM = `你是角色卡质量审校员。检查基础信息、人设正文、User 当前关系、关系阶段、交集原因、开场白、人物小传、生图外貌、冲突说明与世界书之间是否存在事实矛盾、年龄或时间线冲突、关系冲突、交集原因不符合背景、开场白越过当前关系阶段、角色语气偏离、开场白内容与 online/offline 类型不匹配、不可视觉化的外貌描述、用户变量误用，以及替 {{user}} 决定言行或心理的问题。只返回合法 JSON 数组，每项包含 section, issue, suggestion。section 只能是 basic、persona、greetings、biography、appearance、world、conflicts 之一；关系前提或开场问题归入 greetings。issue 用简洁中文说明一个具体问题；suggestion 只说明怎样修复这一项，不得要求重写其他内容。一个对象只能包含一个问题；没有发现问题时返回空数组。不要改写原文，不要输出 Markdown 或解释。`;

const TEST_SYSTEM = "这是 API 连通性测试。严格按照用户要求进行简短回复。";
const VARIABLE_SYSTEM = "变量规范：角色设定、人物小传、世界书和叙事描述中使用角色的真实姓名，不使用 char 或 {{char}} 作为占位；{{user}} 始终代表与角色互动的用户，必须原样保留双花括号变量，不要替 {{user}} 决定言行、台词、心理或过去。";

function revisionSystem(section?: RevisionSection) {
  const shared = "你正在根据用户的修改建议优化已经生成的角色卡。一次只解决用户明确指出的当前问题；必须逐字保留与本次问题无关的设定，不得顺带润色、删减、扩写或重写其他内容。不要解释修改过程，不要输出前言、Markdown 或代码围栏。";
  switch (section) {
    case "basic":
      return `${shared} 只返回合法 JSON 对象，包含 name, gender, note, nickname, signature, age, suffix, language 八个字符串字段。`;
    case "greetings":
      return `${shared} 只返回合法 JSON 对象，包含 greetings 字符串数组和 greetingModes 数组。两个数组必须等长，greetingModes 每项只能是 online 或 offline。输入中的 userRelationship、relationshipStage 与 connectionReason 是固定关系前提，不得修改；所有开场必须符合当前关系阶段、交集原因、称呼、已知信息与情感距离，不得强行偶遇或越级推进。保留当前全部开场白及其类型，并根据用户建议增删或改写任意数量；至少包含 1 条。线上聊天要符合消息、电话、视频或社交平台的远程互动方式；线下聊天要包含同场环境、动作与现场感。保持角色语气，不替用户决定行为、心理或台词。`;
    case "world":
      return `${shared} 只返回合法 JSON 数组。每项包含 title, keys, content, category, priority, enabled；保留仍适用的条目，并按建议增删或改写。`;
    case "persona":
      return `${shared} 只返回修改后的完整人设正文，保持第三人称并使用角色真实姓名。完整正文仍需覆盖人物核心、身份生活、表面与内在性格、欲望恐惧、缺点边界、兴趣喜恶、健康习惯、情感观、重要关系、成长影响、情绪反应、语言与行为逻辑、日常作息、擅长与不擅长及人物反差；外貌细节留给生图外貌字段。`;
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
    : mode === "check"
      ? CONSISTENCY_SYSTEM
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
