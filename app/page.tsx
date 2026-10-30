"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type View = "character" | "world" | "api";
type Tone = "mist" | "warm" | "paper";
type Provider = "openai" | "anthropic" | "gemini" | "custom";

type CharacterDraft = {
  name: string;
  gender: string;
  note: string;
  nickname: string;
  signature: string;
  age: string;
  suffix: string;
  language: string;
  persona: string;
  greetings: string[];
  biography: string;
  appearance: string;
  conflicts: string;
  source: string;
  background: string;
};

type WorldEntry = {
  id: string;
  title: string;
  keys: string;
  content: string;
  category: string;
  priority: number;
  enabled: boolean;
};

type ApiPreset = {
  provider: Provider;
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  temperature: number;
};

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  gender: "",
  note: "",
  nickname: "",
  signature: "",
  age: "",
  suffix: "",
  language: "中文",
  persona: "",
  greetings: [""],
  biography: "",
  appearance: "",
  conflicts: "",
  source: "",
  background: "",
};

const DEFAULT_API: ApiPreset = {
  provider: "openai",
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4.1-mini",
  apiKey: "",
  temperature: 0.7,
};

const PROVIDERS: Record<Provider, Omit<ApiPreset, "apiKey" | "temperature"> & { docs: string; hint: string }> = {
  openai: {
    provider: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini",
    docs: "https://platform.openai.com/docs/api-reference/chat/create",
    hint: "OpenAI 官方接口",
  },
  anthropic: {
    provider: "anthropic",
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-3-7-sonnet-latest",
    docs: "https://docs.anthropic.com/en/api/messages",
    hint: "Claude Messages API",
  },
  gemini: {
    provider: "gemini",
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    model: "gemini-2.0-flash",
    docs: "https://ai.google.dev/gemini-api/docs/text-generation",
    hint: "Google Gemini API",
  },
  custom: {
    provider: "custom",
    name: "兼容接口",
    endpoint: "https://your-api.example.com/v1/chat/completions",
    model: "your-model-name",
    docs: "https://platform.openai.com/docs/api-reference/chat/create",
    hint: "OpenAI Chat Completions 兼容格式",
  },
};

const NAV_ITEMS: Array<{ id: View; label: string; note: string; mark: string }> = [
  { id: "character", label: "角色卡", note: "整理与生成", mark: "01" },
  { id: "world", label: "世界书", note: "规则与设定", mark: "02" },
  { id: "api", label: "API 预设", note: "模型连接", mark: "03" },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanJsonText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function saveFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <i>必填</i>}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  helper?: string;
}) {
  return (
    <label className="field field-wide">
      <span className="field-label">{label}</span>
      {helper && <span className="field-helper">{helper}</span>}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} />
    </label>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("character");
  const [tone, setTone] = useState<Tone>("mist");
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [entries, setEntries] = useState<WorldEntry[]>([]);
  const [api, setApi] = useState<ApiPreset>(DEFAULT_API);
  const [busy, setBusy] = useState<"character" | "world" | "test" | null>(null);
  const [notice, setNotice] = useState("草稿仅保存在此设备");
  const [ready, setReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);

  useEffect(() => {
    try {
      const storedDraft = localStorage.getItem("mori-character-draft");
      const storedEntries = localStorage.getItem("mori-world-entries");
      const storedApi = localStorage.getItem("mori-api-preset");
      const storedTone = localStorage.getItem("mori-tone") as Tone | null;
      if (storedDraft) setDraft({ ...EMPTY_DRAFT, ...JSON.parse(storedDraft) });
      if (storedEntries) setEntries(JSON.parse(storedEntries));
      if (storedApi) setApi({ ...DEFAULT_API, ...JSON.parse(storedApi) });
      if (storedTone && ["mist", "warm", "paper"].includes(storedTone)) setTone(storedTone);
    } catch {
      setNotice("本地草稿读取失败，已为你新建空白卡片");
    } finally {
      setReady(true);
    }

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("mori-character-draft", JSON.stringify(draft));
    localStorage.setItem("mori-world-entries", JSON.stringify(entries));
    localStorage.setItem("mori-api-preset", JSON.stringify(api));
    localStorage.setItem("mori-tone", tone);
  }, [api, draft, entries, ready, tone]);

  const completion = useMemo(() => {
    const checks = [draft.name, draft.gender, draft.age, draft.language, draft.persona, draft.greetings[0], draft.biography, draft.appearance];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  const updateDraft = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const chooseProvider = (provider: Provider) => {
    const selected = PROVIDERS[provider];
    setApi((current) => ({ ...current, ...selected, provider, apiKey: current.provider === provider ? current.apiKey : "" }));
    setNotice(`已切换到 ${selected.name} 预设`);
  };

  const callModel = async (mode: "character" | "world" | "test", prompt: string) => {
    if (!api.apiKey.trim()) {
      setView("api");
      throw new Error("请先填写 API Key");
    }
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, prompt, preset: api }),
    });
    const payload = (await response.json()) as { text?: string; error?: string };
    if (!response.ok) throw new Error(payload.error || "生成失败，请检查 API 配置");
    return payload.text ?? "";
  };

  const generateCharacter = async () => {
    if (!draft.source.trim()) {
      setNotice("请先粘贴小说、设定或聊天记录");
      return;
    }
    setBusy("character");
    setNotice("正在提取角色设定…");
    try {
      const text = await callModel(
        "character",
        `【角色原始资料】\n${draft.source}\n\n【补充世界背景】\n${draft.background || "未提供"}`,
      );
      const parsed = JSON.parse(cleanJsonText(text)) as Partial<CharacterDraft> & { greetings?: string[] };
      setDraft((current) => ({
        ...current,
        ...parsed,
        source: current.source,
        background: current.background,
        greetings: Array.isArray(parsed.greetings) && parsed.greetings.length ? parsed.greetings.slice(0, 3) : current.greetings,
      }));
      setNotice("角色卡已生成，请逐项确认后导出");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(null);
    }
  };

  const generateWorld = async () => {
    if (!draft.background.trim() && !draft.source.trim()) {
      setNotice("请先提供世界背景或角色资料");
      return;
    }
    setBusy("world");
    setNotice("正在拆分世界书条目…");
    try {
      const text = await callModel(
        "world",
        `【世界背景】\n${draft.background || "未单独提供"}\n\n【角色资料】\n${draft.source || draft.persona || "未提供"}`,
      );
      const parsed = JSON.parse(cleanJsonText(text)) as Array<Partial<WorldEntry>>;
      if (!Array.isArray(parsed)) throw new Error("模型返回的世界书格式不正确");
      setEntries(
        parsed.slice(0, 24).map((entry, index) => ({
          id: uid(),
          title: entry.title || `条目 ${index + 1}`,
          keys: entry.keys || "",
          content: entry.content || "",
          category: entry.category || "世界观",
          priority: Number(entry.priority) || 100 - index,
          enabled: entry.enabled !== false,
        })),
      );
      setView("world");
      setNotice("世界书已生成，可继续编辑与导出");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "世界书生成失败");
    } finally {
      setBusy(null);
    }
  };

  const testApi = async () => {
    setBusy("test");
    setNotice("正在测试连接…");
    try {
      const text = await callModel("test", "请只回复：连接成功");
      setNotice(text.trim().slice(0, 60) || "连接成功");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(null);
    }
  };

  const importSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      updateDraft("source", text.slice(0, 120000));
      setNotice(`已读取 ${file.name}`);
    } catch {
      setNotice("文件读取失败，请改为粘贴文本");
    }
    event.target.value = "";
  };

  const exportCharacter = (format: "json" | "txt") => {
    const filename = `${draft.name || "未命名角色"}_角色卡.${format}`;
    if (format === "json") {
      saveFile(filename, JSON.stringify({ format: "mori-character-card-v1", ...draft, worldBook: entries }, null, 2), "application/json");
      return;
    }
    const content = [
      `【01 基础信息】\n名字：${draft.name || "未提供"}\n性别：${draft.gender || "未提供"}\n备注：${draft.note || "未提供"}\n网名：${draft.nickname || "未提供"}\n签名：${draft.signature || "未提供"}\n年龄：${draft.age || "未提供"}\n被拍后缀：${draft.suffix || "未提供"}\n文化母语：${draft.language || "未提供"}`,
      `【02 人设正文】\n${draft.persona || "未提供"}`,
      `【03 开场白】\n${draft.greetings.map((item, index) => `开场白 ${index + 1}\n${item || "未提供"}`).join("\n\n")}`,
      `【04 人物小传】\n${draft.biography || "未提供"}`,
      `【05 生图外貌】\n${draft.appearance || "未提供"}`,
      `【06 世界书】\n${entries.map((item) => `${item.title}｜${item.keys}\n${item.content}`).join("\n\n") || "未提供"}`,
      `【07 缺失信息与设定冲突】\n${draft.conflicts || "未提供"}`,
    ].join("\n\n");
    saveFile(filename, content);
  };

  const exportWorld = () => {
    const worldBook = {
      name: `${draft.name || "角色"}的世界书`,
      format: "mori-world-book-v1",
      entries: entries.map((entry, index) => ({
        uid: index,
        key: entry.keys.split(/[,，、]/).map((key) => key.trim()).filter(Boolean),
        comment: entry.title,
        content: entry.content,
        constant: false,
        selective: true,
        order: entry.priority,
        position: 0,
        disable: !entry.enabled,
        category: entry.category,
      })),
    };
    saveFile(`${draft.name || "未命名"}_世界书.json`, JSON.stringify(worldBook, null, 2), "application/json");
  };

  const installApp = async () => {
    if (installEvent && "prompt" in installEvent) {
      await (installEvent as Event & { prompt: () => Promise<void> }).prompt();
      setInstallEvent(null);
      return;
    }
    setNotice("请在浏览器菜单中选择“添加到主屏幕”或“安装应用”");
  };

  const updateEntry = (id: string, patch: Partial<WorldEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      { id: uid(), title: "新条目", keys: "", content: "", category: "世界观", priority: 100, enabled: true },
    ]);
    setNotice("已添加空白世界书条目");
  };

  return (
    <div className="app-shell" data-tone={tone}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("character")} aria-label="返回角色卡首页">
          <span className="brand-mark">M</span>
          <span>
            <b>MORI</b>
            <small>角色工作室</small>
          </span>
        </button>

        <nav className="side-nav" aria-label="主导航">
          <span className="nav-caption">WORKSPACE</span>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span className="nav-index">{item.mark}</span>
              <span>
                <b>{item.label}</b>
                <small>{item.note}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="side-note">
          <span className="eyebrow">LOCAL FIRST</span>
          <p>草稿与密钥只保存在当前设备，生成请求经过加密连接发送。</p>
        </div>

        <button className="install-button" onClick={installApp}>
          <span>＋</span> 添加到主屏幕
        </button>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div className="mobile-brand">MORI</div>
          <div className="status-pill"><span /> {notice}</div>
          <div className="top-actions">
            <label className="tone-select">
              <span>背景</span>
              <select value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                <option value="mist">雾白</option>
                <option value="warm">暖灰</option>
                <option value="paper">纸白</option>
              </select>
            </label>
            <button className="quiet-button" onClick={() => exportCharacter("json")}>导出 JSON</button>
          </div>
        </header>

        {view === "character" && (
          <div className="page-wrap">
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">CHARACTER ARCHIVE · 角色档案</span>
                <h1>把散乱资料，整理成<br /><em>可长期扮演</em>的角色。</h1>
                <p>粘贴小说、设定或聊天记录，自动拆分 LiToT 必填字段，同时保留人物的矛盾、语气与经历。</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={generateCharacter} disabled={busy !== null}>
                    {busy === "character" ? "正在生成…" : "生成完整角色卡"}<span>→</span>
                  </button>
                  <label className="file-button">
                    导入资料
                    <input type="file" accept=".txt,.md,.json,text/plain,application/json" onChange={importSource} />
                  </label>
                </div>
              </div>
              <div className="hero-card" aria-label="角色卡完成度">
                <div className="profile-orbit"><span>{draft.name.trim().slice(0, 1) || "未"}</span></div>
                <div>
                  <small>CARD COMPLETION</small>
                  <strong>{completion}<i>%</i></strong>
                  <p>{draft.name || "未命名角色"}</p>
                </div>
                <div className="progress-track"><span style={{ width: `${completion}%` }} /></div>
              </div>
            </section>

            <section className="editor-card source-card">
              <div className="section-heading">
                <div><span>STEP 01</span><h2>原始资料与世界背景</h2></div>
                <small>支持 TXT / MD / JSON，最多读取 120,000 字符</small>
              </div>
              <div className="dual-textareas">
                <TextAreaField
                  label="角色原始资料"
                  value={draft.source}
                  onChange={(value) => updateDraft("source", value)}
                  rows={10}
                  placeholder="粘贴小说片段、旧角色卡、人物设定、聊天记录……"
                  helper="系统会忠于原文提取，不把推测写成事实。"
                />
                <TextAreaField
                  label="世界背景 / 想要的故事背景"
                  value={draft.background}
                  onChange={(value) => updateDraft("background", value)}
                  rows={10}
                  placeholder="例如：近未来首尔、财阀与地下诊所并存；城市长期处于酸雨季……"
                  helper="这部分也会用于生成独立的世界书条目。"
                />
              </div>
              <div className="inline-actions">
                <button className="secondary-button" onClick={generateCharacter} disabled={busy !== null}>提取角色信息</button>
                <button className="text-button" onClick={generateWorld} disabled={busy !== null}>根据背景生成世界书 →</button>
              </div>
            </section>

            <section className="editor-card">
              <div className="section-heading">
                <div><span>STEP 02</span><h2>基础信息</h2></div>
                <small>来自示例角色卡的 8 个基础字段</small>
              </div>
              <div className="field-grid">
                <Field label="名字" value={draft.name} onChange={(value) => updateDraft("name", value)} placeholder="角色正式姓名" required />
                <Field label="性别" value={draft.gender} onChange={(value) => updateDraft("gender", value)} placeholder="女性 / 男性 / 其他" required />
                <Field label="备注" value={draft.note} onChange={(value) => updateDraft("note", value)} placeholder="你对角色的私密备注" />
                <Field label="网名" value={draft.nickname} onChange={(value) => updateDraft("nickname", value)} placeholder="聊天中显示的昵称" />
                <Field label="签名" value={draft.signature} onChange={(value) => updateDraft("signature", value)} placeholder="一句代表角色的话" />
                <Field label="年龄" value={draft.age} onChange={(value) => updateDraft("age", value)} placeholder="真实或外观年龄" required />
                <Field label="被拍后缀" value={draft.suffix} onChange={(value) => updateDraft("suffix", value)} placeholder="如：同学 / 先生 / 前辈" />
                <Field label="文化母语" value={draft.language} onChange={(value) => updateDraft("language", value)} placeholder="中文 / 韩语 / 日语" required />
              </div>
            </section>

            <section className="editor-card">
              <div className="section-heading">
                <div><span>STEP 03</span><h2>人设正文</h2></div>
                <small>{draft.persona.length.toLocaleString()} 字符</small>
              </div>
              <TextAreaField
                label="身份、性格、心理、说话方式、关系与行为逻辑"
                value={draft.persona}
                onChange={(value) => updateDraft("persona", value)}
                rows={13}
                placeholder="AI 长期扮演角色时使用的核心设定……"
              />
            </section>

            <section className="editor-card">
              <div className="section-heading">
                <div><span>STEP 04</span><h2>开场白</h2></div>
                <button
                  className="mini-button"
                  onClick={() => updateDraft("greetings", [...draft.greetings, ""].slice(0, 3))}
                  disabled={draft.greetings.length >= 3}
                >＋ 添加情境</button>
              </div>
              <div className="greeting-list">
                {draft.greetings.map((greeting, index) => (
                  <div className="greeting-item" key={index}>
                    <span>0{index + 1}</span>
                    <textarea
                      aria-label={`开场白 ${index + 1}`}
                      rows={5}
                      value={greeting}
                      placeholder={index === 0 ? "包含场景、动作与角色对白，让用户能自然接话……" : "另一个互动情境……"}
                      onChange={(event) => {
                        const next = [...draft.greetings];
                        next[index] = event.target.value;
                        updateDraft("greetings", next);
                      }}
                    />
                    {draft.greetings.length > 1 && (
                      <button aria-label={`删除开场白 ${index + 1}`} onClick={() => updateDraft("greetings", draft.greetings.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="split-editor">
              <section className="editor-card">
                <div className="section-heading"><div><span>STEP 05</span><h2>人物小传</h2></div></div>
                <TextAreaField label="人物经历" value={draft.biography} onChange={(value) => updateDraft("biography", value)} rows={12} placeholder="按时间线整理出身、转折、关系变化与当前状态……" />
              </section>
              <section className="editor-card">
                <div className="section-heading"><div><span>STEP 06</span><h2>生图外貌</h2></div></div>
                <TextAreaField label="可视觉化设定" value={draft.appearance} onChange={(value) => updateDraft("appearance", value)} rows={12} placeholder="外观年龄、体型、五官、发型、服饰、辨识特征与神态……" />
              </section>
            </div>

            <section className="editor-card">
              <div className="section-heading"><div><span>STEP 07</span><h2>缺失信息与设定冲突</h2></div><small>不会擅自替你决定冲突版本</small></div>
              <TextAreaField label="待确认事项" value={draft.conflicts} onChange={(value) => updateDraft("conflicts", value)} rows={5} placeholder="原文未提供的信息，以及互相矛盾的设定会列在这里……" />
              <div className="export-row">
                <div><b>完成后导出</b><span>可再次导入此工作台，也可复制到其他角色平台。</span></div>
                <button className="quiet-button" onClick={() => exportCharacter("txt")}>下载 TXT</button>
                <button className="primary-button compact" onClick={() => exportCharacter("json")}>下载 JSON <span>↓</span></button>
              </div>
            </section>
          </div>
        )}

        {view === "world" && (
          <div className="page-wrap world-page">
            <section className="page-intro">
              <div><span className="eyebrow">WORLD ARCHIVE · 世界档案</span><h1>让背景设定在正确的时机被想起。</h1><p>把时代、地点、组织、规则与关系拆成可触发条目，避免所有设定都挤进人设正文。</p></div>
              <div className="page-intro-actions">
                <button className="quiet-button" onClick={addEntry}>＋ 新建条目</button>
                <button className="primary-button compact" onClick={generateWorld} disabled={busy !== null}>{busy === "world" ? "生成中…" : "AI 生成条目"}<span>→</span></button>
              </div>
            </section>

            <section className="editor-card world-source">
              <TextAreaField label="世界背景" value={draft.background} onChange={(value) => updateDraft("background", value)} rows={7} placeholder="描述时代、地理、组织、制度、力量体系、历史事件和特殊规则……" />
            </section>

            <div className="world-toolbar">
              <div><b>{entries.length}</b><span> 条设定</span></div>
              <button className="quiet-button" onClick={exportWorld} disabled={!entries.length}>导出世界书 JSON</button>
            </div>

            <section className="world-list">
              {entries.length === 0 ? (
                <div className="empty-state"><span>空</span><h2>还没有世界书条目</h2><p>填写背景后让 AI 拆分，或先新建一个空白条目。</p><button className="secondary-button" onClick={addEntry}>新建第一个条目</button></div>
              ) : entries.map((entry, index) => (
                <article className="world-entry" key={entry.id}>
                  <div className="entry-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="entry-main">
                    <div className="entry-topline">
                      <input aria-label={`条目 ${index + 1} 标题`} value={entry.title} onChange={(event) => updateEntry(entry.id, { title: event.target.value })} />
                      <select aria-label={`条目 ${index + 1} 分类`} value={entry.category} onChange={(event) => updateEntry(entry.id, { category: event.target.value })}>
                        <option>世界观</option><option>地点</option><option>组织</option><option>人物关系</option><option>历史事件</option><option>规则</option><option>力量体系</option>
                      </select>
                    </div>
                    <label><span>触发关键词</span><input value={entry.keys} onChange={(event) => updateEntry(entry.id, { keys: event.target.value })} placeholder="用逗号分隔，如：白夜区、酸雨、地下诊所" /></label>
                    <label><span>条目内容</span><textarea rows={6} value={entry.content} onChange={(event) => updateEntry(entry.id, { content: event.target.value })} placeholder="只写与这个条目相关、AI 需要记住的设定……" /></label>
                    <div className="entry-meta">
                      <label>优先级 <input type="number" value={entry.priority} onChange={(event) => updateEntry(entry.id, { priority: Number(event.target.value) })} /></label>
                      <label className="switch"><input type="checkbox" checked={entry.enabled} onChange={(event) => updateEntry(entry.id, { enabled: event.target.checked })} /><span /> 启用</label>
                      <button onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}>删除</button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}

        {view === "api" && (
          <div className="page-wrap api-page">
            <section className="page-intro">
              <div><span className="eyebrow">MODEL CONNECTION · 模型连接</span><h1>连接你信任的模型服务。</h1><p>切换预设即可改变生成引擎。密钥只保存在当前浏览器，不会写入网站数据库。</p></div>
              <div className={`connection-badge ${api.apiKey ? "ready" : ""}`}><span />{api.apiKey ? "已填写密钥" : "等待配置"}</div>
            </section>

            <section className="preset-grid" aria-label="API 服务商预设">
              {(Object.keys(PROVIDERS) as Provider[]).map((provider) => (
                <button key={provider} className={api.provider === provider ? "active" : ""} onClick={() => chooseProvider(provider)}>
                  <span className="provider-mark">{provider === "custom" ? "＋" : PROVIDERS[provider].name.slice(0, 1)}</span>
                  <span><b>{PROVIDERS[provider].name}</b><small>{PROVIDERS[provider].hint}</small></span>
                  <i>{api.provider === provider ? "●" : "○"}</i>
                </button>
              ))}
            </section>

            <section className="editor-card api-form">
              <div className="section-heading"><div><span>ACTIVE PRESET</span><h2>{api.name}</h2></div><a href={PROVIDERS[api.provider].docs} target="_blank" rel="noreferrer">查看官方文档 ↗</a></div>
              <div className="field-grid api-fields">
                <Field label="预设名称" value={api.name} onChange={(value) => setApi((current) => ({ ...current, name: value }))} placeholder="我的模型" />
                <Field label="模型名称" value={api.model} onChange={(value) => setApi((current) => ({ ...current, model: value }))} placeholder="模型 ID" required />
                <label className="field field-wide"><span className="field-label">API Endpoint <i>必填</i></span><input value={api.endpoint} onChange={(event) => setApi((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://…" /></label>
                <label className="field field-wide"><span className="field-label">API Key <i>仅本机</i></span><input type="password" autoComplete="off" value={api.apiKey} onChange={(event) => setApi((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…" /></label>
                <label className="field field-wide range-field"><span className="field-label">创造性 <b>{api.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={api.temperature} onChange={(event) => setApi((current) => ({ ...current, temperature: Number(event.target.value) }))} /></label>
              </div>
              <div className="api-notice"><span>i</span><p><b>安全提示</b>请只在自己的设备上保存密钥。使用共享设备时，完成后点击“清除密钥”。</p></div>
              <div className="inline-actions api-actions">
                <button className="primary-button compact" onClick={testApi} disabled={busy !== null}>{busy === "test" ? "测试中…" : "测试连接"}<span>→</span></button>
                <button className="text-button danger" onClick={() => { setApi((current) => ({ ...current, apiKey: "" })); setNotice("API Key 已从本机清除"); }}>清除密钥</button>
              </div>
            </section>

            <section className="api-help">
              <div><span>01</span><b>选择服务商</b><p>使用官方预设，或连接兼容 OpenAI Chat Completions 的接口。</p></div>
              <div><span>02</span><b>保存到本机</b><p>输入后自动保存在这个浏览器，下次打开无需重新填写。</p></div>
              <div><span>03</span><b>回到角色卡</b><p>同一套预设可用于角色提取和世界书生成。</p></div>
            </section>
          </div>
        )}

        <nav className="mobile-nav" aria-label="移动端导航">
          {NAV_ITEMS.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.mark}</span>{item.label}</button>)}
        </nav>
      </main>
    </div>
  );
}
