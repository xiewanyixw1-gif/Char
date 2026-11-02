"use client";

/* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration and local-first snapshot synchronization intentionally update client state */

import { ChangeEvent, CSSProperties, DragEvent, useEffect, useMemo, useState } from "react";

type View = "character" | "library" | "world" | "api";
type Tone = "mist" | "warm" | "paper";
type Provider = "openai" | "anthropic" | "gemini" | "custom";
type GenerationMode = "create" | "extract";
type RevisionSection = "basic" | "persona" | "greetings" | "biography" | "appearance" | "world" | "conflicts";
type ModelMode = "character-create" | "character-extract" | "world" | "revise" | "check" | "test";

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

type LibraryCategory = "变量规范" | "人设要求" | "世界书参考" | "互动规则" | "文风要求" | "禁用项";

type LibraryEntry = {
  id: string;
  title: string;
  category: LibraryCategory;
  content: string;
  enabled: boolean;
};

type ApiPreset = {
  id?: string;
  provider: Provider;
  name: string;
  endpoint: string;
  modelsEndpoint: string;
  model: string;
  models: string[];
  apiKey: string;
  temperature: number;
};

type WorldBookRecord = {
  id: string;
  name: string;
  entries: WorldEntry[];
  updatedAt: string;
};

type CharacterRecord = {
  id: string;
  label: string;
  draft: CharacterDraft;
  entries: WorldEntry[];
  worldBooks: WorldBookRecord[];
  activeWorldBookId: string;
  updatedAt: string;
};

type RevisionPreview = {
  section: RevisionSection;
  label: string;
  before: string;
  after: string;
  value: unknown;
  greetingIndex?: number;
};

type UndoSnapshot = {
  label: string;
  draft: CharacterDraft;
  entries: WorldEntry[];
};

const EMPTY_DRAFT: CharacterDraft = {
  name: "char",
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
  modelsEndpoint: "https://api.openai.com/v1/models",
  model: "gpt-4.1-mini",
  models: [],
  apiKey: "",
  temperature: 0.7,
};

const DEFAULT_LIBRARY: LibraryEntry[] = [
  {
    id: "char-variable-convention",
    title: "角色与用户变量规范",
    category: "变量规范",
    content: "角色统一使用 {{char}}，对话用户统一使用 {{user}}。必须保留双花括号，不要擅自替换成具体姓名；不要替 {{user}} 决定言行、心理或过去。",
    enabled: true,
  },
];

const LIBRARY_CATEGORIES: LibraryCategory[] = ["变量规范", "人设要求", "世界书参考", "互动规则", "文风要求", "禁用项"];

const PROVIDERS: Record<Provider, Omit<ApiPreset, "apiKey" | "temperature" | "models"> & { docs: string; hint: string }> = {
  openai: {
    provider: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsEndpoint: "https://api.openai.com/v1/models",
    model: "gpt-4.1-mini",
    docs: "https://platform.openai.com/docs/api-reference/chat/create",
    hint: "OpenAI 官方接口",
  },
  anthropic: {
    provider: "anthropic",
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    modelsEndpoint: "https://api.anthropic.com/v1/models",
    model: "claude-3-7-sonnet-latest",
    docs: "https://docs.anthropic.com/en/api/messages",
    hint: "Claude Messages API",
  },
  gemini: {
    provider: "gemini",
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-2.0-flash",
    docs: "https://ai.google.dev/gemini-api/docs/text-generation",
    hint: "Google Gemini API",
  },
  custom: {
    provider: "custom",
    name: "兼容接口",
    endpoint: "https://your-api.example.com/v1/chat/completions",
    modelsEndpoint: "",
    model: "your-model-name",
    docs: "https://platform.openai.com/docs/api-reference/chat/create",
    hint: "OpenAI Chat Completions 兼容格式",
  },
};

const NAV_ITEMS: Array<{ id: View; label: string; note: string; mark: string }> = [
  { id: "character", label: "角色卡", note: "整理与生成", mark: "01" },
  { id: "library", label: "资料库", note: "长期提示与知识", mark: "02" },
  { id: "world", label: "世界书", note: "规则与设定", mark: "03" },
  { id: "api", label: "API 预设", note: "模型连接", mark: "04" },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneDraft(draft: CharacterDraft): CharacterDraft {
  return { ...draft, greetings: [...draft.greetings] };
}

function cloneEntries(entries: WorldEntry[]): WorldEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function freshDraft(): CharacterDraft {
  return cloneDraft(EMPTY_DRAFT);
}

function revisionText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint || "未填写地址";
  }
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

function RevisionPanel({
  section,
  value,
  onChange,
  onSubmit,
  loading,
  example,
}: {
  section: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  example: string;
}) {
  return (
    <div className="revision-panel">
      <div className="revision-copy">
        <span>AI REFINE</span>
        <b>对{section}提出修改建议</b>
      </div>
      <input
        aria-label={`${section}修改建议`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim() && !loading) onSubmit();
        }}
        placeholder={example}
      />
      <button onClick={onSubmit} disabled={loading || !value.trim()}>
        {loading ? "正在优化…" : "AI 重新优化"}<span>↗</span>
      </button>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("character");
  const [tone, setTone] = useState<Tone>("mist");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("create");
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [entries, setEntries] = useState<WorldEntry[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState("");
  const [worldBooks, setWorldBooks] = useState<WorldBookRecord[]>([]);
  const [activeWorldBookId, setActiveWorldBookId] = useState("");
  const [library, setLibrary] = useState<LibraryEntry[]>(DEFAULT_LIBRARY);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory | "全部">("全部");
  const [api, setApi] = useState<ApiPreset>(DEFAULT_API);
  const [savedApis, setSavedApis] = useState<ApiPreset[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState<"character" | "world" | "check" | "test" | null>(null);
  const [revising, setRevising] = useState<RevisionSection | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreview | null>(null);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [consistencyIssues, setConsistencyIssues] = useState<string[] | null>(null);
  const [greetingNotes, setGreetingNotes] = useState<Record<number, string>>({});
  const [dragGreetingIndex, setDragGreetingIndex] = useState<number | null>(null);
  const [revisionNotes, setRevisionNotes] = useState<Record<RevisionSection, string>>({
    basic: "",
    persona: "",
    greetings: "",
    biography: "",
    appearance: "",
    world: "",
    conflicts: "",
  });
  const [notice, setNotice] = useState("草稿仅保存在此设备");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [backgroundImage, setBackgroundImage] = useState("");
  const [ready, setReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);

  useEffect(() => {
    try {
      const storedDraft = localStorage.getItem("char-character-draft");
      const storedEntries = localStorage.getItem("char-world-entries");
      const storedCharacters = localStorage.getItem("char-characters");
      const storedActiveId = localStorage.getItem("char-active-character");
      const storedLibrary = localStorage.getItem("char-prompt-library");
      const storedApi = localStorage.getItem("char-api-preset");
      const storedSavedApis = localStorage.getItem("char-custom-api-presets");
      const storedTone = localStorage.getItem("char-tone") as Tone | null;
      const storedMode = localStorage.getItem("char-generation-mode") as GenerationMode | null;
      const storedBackgroundImage = localStorage.getItem("char-background-image");

      let restoredCharacters = storedCharacters ? JSON.parse(storedCharacters) as CharacterRecord[] : [];
      if (!Array.isArray(restoredCharacters) || !restoredCharacters.length) {
        const parsedDraft = storedDraft ? JSON.parse(storedDraft) as Partial<CharacterDraft> : {};
        const restoredDraft = { ...freshDraft(), ...parsedDraft, greetings: Array.isArray(parsedDraft.greetings) ? parsedDraft.greetings : [""], name: parsedDraft.name?.trim() || "char" };
        const initialBook: WorldBookRecord = { id: uid(), name: `${restoredDraft.name || "char"}的世界书`, entries: storedEntries ? JSON.parse(storedEntries) : [], updatedAt: new Date().toISOString() };
        restoredCharacters = [{
          id: uid(),
          label: restoredDraft.name || "char",
          draft: restoredDraft,
          entries: initialBook.entries,
          worldBooks: [initialBook],
          activeWorldBookId: initialBook.id,
          updatedAt: new Date().toISOString(),
        }];
      }
      restoredCharacters = restoredCharacters.map((item) => {
        const existingEntries = Array.isArray(item.entries) ? item.entries : [];
        const restoredBooks = Array.isArray(item.worldBooks) && item.worldBooks.length
          ? item.worldBooks
          : [{ id: uid(), name: `${item.draft?.name || item.label || "char"}的世界书`, entries: existingEntries, updatedAt: item.updatedAt || new Date().toISOString() }];
        const activeBook = restoredBooks.find((book) => book.id === item.activeWorldBookId) ?? restoredBooks[0];
        return { ...item, entries: activeBook.entries, worldBooks: restoredBooks, activeWorldBookId: activeBook.id };
      });
      const restoredActive = restoredCharacters.find((item) => item.id === storedActiveId) ?? restoredCharacters[0];
      const restoredActiveBook = restoredActive.worldBooks.find((book) => book.id === restoredActive.activeWorldBookId) ?? restoredActive.worldBooks[0];
      setCharacters(restoredCharacters);
      setActiveCharacterId(restoredActive.id);
      setDraft({ ...freshDraft(), ...restoredActive.draft, greetings: restoredActive.draft.greetings?.length ? restoredActive.draft.greetings : [""] });
      setWorldBooks(restoredActive.worldBooks);
      setActiveWorldBookId(restoredActiveBook.id);
      setEntries(cloneEntries(restoredActiveBook.entries));
      if (storedLibrary !== null) setLibrary(JSON.parse(storedLibrary));
      if (storedApi) {
        const restoredApi = { ...DEFAULT_API, ...JSON.parse(storedApi) } as ApiPreset;
        restoredApi.models = Array.isArray(restoredApi.models) ? restoredApi.models : [];
        setApi(restoredApi);
        setModelOptions(restoredApi.models);
      }
      if (storedSavedApis) {
        const restoredApis = JSON.parse(storedSavedApis) as ApiPreset[];
        setSavedApis(Array.isArray(restoredApis) ? restoredApis.map((item) => ({ ...DEFAULT_API, ...item, models: Array.isArray(item.models) ? item.models : [] })) : []);
      }
      if (storedTone && ["mist", "warm", "paper"].includes(storedTone)) setTone(storedTone);
      if (storedMode && ["create", "extract"].includes(storedMode)) setGenerationMode(storedMode);
      if (storedBackgroundImage) setBackgroundImage(storedBackgroundImage);
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
    try {
      const savedAt = new Date();
      const syncedBooks = worldBooks.map((book) => book.id === activeWorldBookId ? { ...book, entries: cloneEntries(entries), updatedAt: savedAt.toISOString() } : book);
      setCharacters((current) => {
        const next = current.map((item) => item.id === activeCharacterId
          ? { ...item, label: draft.name.trim() || item.label || "char", draft: cloneDraft(draft), entries: cloneEntries(entries), worldBooks: syncedBooks, activeWorldBookId, updatedAt: savedAt.toISOString() }
          : item);
        localStorage.setItem("char-characters", JSON.stringify(next));
        return next;
      });
      localStorage.setItem("char-active-character", activeCharacterId);
      localStorage.setItem("char-character-draft", JSON.stringify(draft));
      localStorage.setItem("char-world-entries", JSON.stringify(entries));
      setLastSavedAt(savedAt);
    } catch {
      setNotice("角色草稿保存失败，请导出备份后检查浏览器存储空间");
    }
  }, [activeCharacterId, activeWorldBookId, draft, entries, ready, worldBooks]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("char-prompt-library", JSON.stringify(library));
      localStorage.setItem("char-api-preset", JSON.stringify(api));
      localStorage.setItem("char-custom-api-presets", JSON.stringify(savedApis));
      localStorage.setItem("char-tone", tone);
      localStorage.setItem("char-generation-mode", generationMode);
      if (backgroundImage) localStorage.setItem("char-background-image", backgroundImage);
      else localStorage.removeItem("char-background-image");
    } catch {
      setNotice("设置保存失败，请检查浏览器存储空间");
    }
  }, [api, backgroundImage, generationMode, library, ready, savedApis, tone]);

  useEffect(() => {
    if (!ready || !api.id) return;
    setSavedApis((current) => current.map((item) => item.id === api.id ? { ...api, models: [...modelOptions] } : item));
  }, [api, modelOptions, ready]);

  const completion = useMemo(() => {
    const checks = [draft.name, draft.gender, draft.age, draft.language, draft.persona, draft.greetings[0], draft.biography, draft.appearance];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  const activeWorldBook = useMemo(() => worldBooks.find((book) => book.id === activeWorldBookId) ?? worldBooks[0], [activeWorldBookId, worldBooks]);

  const enabledLibraryText = useMemo(() => library
    .filter((item) => item.enabled && item.content.trim())
    .map((item, index) => `【资料库 ${index + 1}｜${item.category}｜${item.title || "未命名"}】\n${item.content.trim()}`)
    .join("\n\n"), [library]);

  const filteredLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return library.filter((item) => {
      const matchesCategory = libraryCategory === "全部" || item.category === libraryCategory;
      const matchesQuery = !query || `${item.title}\n${item.content}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [library, libraryCategory, libraryQuery]);

  const updateDraft = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const copyText = async (label: string, text: string) => {
    if (!text.trim()) {
      setNotice(`${label}还没有内容`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setNotice(`${label}已复制`);
  };

  const booksWithCurrentEntries = () => worldBooks.map((book) => book.id === activeWorldBookId
    ? { ...book, entries: cloneEntries(entries), updatedAt: new Date().toISOString() }
    : book);

  const recordsWithCurrentDraft = () => characters.map((item) => item.id === activeCharacterId
    ? { ...item, label: draft.name.trim() || item.label || "char", draft: cloneDraft(draft), entries: cloneEntries(entries), worldBooks: booksWithCurrentEntries(), activeWorldBookId, updatedAt: new Date().toISOString() }
    : item);

  const switchCharacter = (id: string) => {
    const nextRecords = recordsWithCurrentDraft();
    const nextCharacter = nextRecords.find((item) => item.id === id);
    if (!nextCharacter) return;
    setCharacters(nextRecords);
    setActiveCharacterId(nextCharacter.id);
    setDraft(cloneDraft(nextCharacter.draft));
    const nextBook = nextCharacter.worldBooks.find((book) => book.id === nextCharacter.activeWorldBookId) ?? nextCharacter.worldBooks[0];
    setWorldBooks(nextCharacter.worldBooks);
    setActiveWorldBookId(nextBook.id);
    setEntries(cloneEntries(nextBook.entries));
    setRevisionPreview(null);
    setConsistencyIssues(null);
    setUndoStack([]);
    setNotice(`已切换到“${nextCharacter.label}”`);
  };

  const addCharacter = () => {
    const nextRecords = recordsWithCurrentDraft();
    const nextDraft = freshDraft();
    const nextBook: WorldBookRecord = { id: uid(), name: "新角色的世界书", entries: [], updatedAt: new Date().toISOString() };
    const nextCharacter: CharacterRecord = { id: uid(), label: `新角色 ${nextRecords.length + 1}`, draft: nextDraft, entries: [], worldBooks: [nextBook], activeWorldBookId: nextBook.id, updatedAt: new Date().toISOString() };
    setCharacters([...nextRecords, nextCharacter]);
    setActiveCharacterId(nextCharacter.id);
    setDraft(nextDraft);
    setWorldBooks([nextBook]);
    setActiveWorldBookId(nextBook.id);
    setEntries([]);
    setUndoStack([]);
    setConsistencyIssues(null);
    setNotice("已新建独立角色档案");
  };

  const duplicateCharacter = () => {
    const nextRecords = recordsWithCurrentDraft();
    const duplicateDraft = cloneDraft(draft);
    duplicateDraft.name = `${draft.name || "char"} 副本`;
    const activeBookIndex = Math.max(0, worldBooks.findIndex((book) => book.id === activeWorldBookId));
    const duplicatedBooks = booksWithCurrentEntries().map((book) => ({ ...book, id: uid(), name: `${book.name} 副本`, entries: cloneEntries(book.entries).map((entry) => ({ ...entry, id: uid() })) }));
    const duplicate: CharacterRecord = {
      id: uid(),
      label: duplicateDraft.name,
      draft: duplicateDraft,
      entries: cloneEntries(duplicatedBooks[activeBookIndex]?.entries ?? []),
      worldBooks: duplicatedBooks,
      activeWorldBookId: duplicatedBooks[activeBookIndex]?.id ?? duplicatedBooks[0].id,
      updatedAt: new Date().toISOString(),
    };
    setCharacters([...nextRecords, duplicate]);
    setActiveCharacterId(duplicate.id);
    setDraft(duplicateDraft);
    setWorldBooks(duplicatedBooks);
    setActiveWorldBookId(duplicate.activeWorldBookId);
    setEntries(cloneEntries(duplicate.entries));
    setUndoStack([]);
    setConsistencyIssues(null);
    setNotice("已复制为新的角色档案");
  };

  const deleteCharacter = () => {
    if (characters.length <= 1) {
      setNotice("至少保留一个角色档案");
      return;
    }
    if (!window.confirm(`确定删除角色“${draft.name || "char"}”吗？此操作无法撤销。`)) return;
    const remaining = characters.filter((item) => item.id !== activeCharacterId);
    const nextCharacter = remaining[0];
    setCharacters(remaining);
    setActiveCharacterId(nextCharacter.id);
    setDraft(cloneDraft(nextCharacter.draft));
    const nextBook = nextCharacter.worldBooks.find((book) => book.id === nextCharacter.activeWorldBookId) ?? nextCharacter.worldBooks[0];
    setWorldBooks(nextCharacter.worldBooks);
    setActiveWorldBookId(nextBook.id);
    setEntries(cloneEntries(nextBook.entries));
    setUndoStack([]);
    setConsistencyIssues(null);
    setNotice("角色档案已删除");
  };

  const pushUndo = (label: string) => {
    const snapshot: UndoSnapshot = { label, draft: cloneDraft(draft), entries: cloneEntries(entries) };
    setUndoStack((current) => [...current.slice(-9), snapshot]);
  };

  const undoLastChange = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setDraft(cloneDraft(previous.draft));
    setEntries(cloneEntries(previous.entries));
    setUndoStack((current) => current.slice(0, -1));
    setRevisionPreview(null);
    setNotice(`已撤销：${previous.label}`);
  };

  const changeBackgroundImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_500_000) {
      setNotice("请选择不超过 1.5MB 的图片作为背景");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBackgroundImage(typeof reader.result === "string" ? reader.result : "");
      setNotice("自定义背景已保存到本机");
    };
    reader.onerror = () => setNotice("背景图片读取失败");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const exportWorkspace = () => {
    const safeApi = { ...api, apiKey: "" };
    const safeSavedApis = savedApis.map((item) => ({ ...item, apiKey: "" }));
    saveFile("Char_完整备份.json", JSON.stringify({
      format: "char-workspace-backup-v1",
      exportedAt: new Date().toISOString(),
      activeCharacterId,
      characters: recordsWithCurrentDraft(),
      library,
      api: safeApi,
      savedApis: safeSavedApis,
      tone,
      generationMode,
    }, null, 2), "application/json");
    setNotice("完整备份已导出；为安全起见不包含 API Key");
  };

  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Partial<{
        format: string;
        activeCharacterId: string;
        characters: CharacterRecord[];
        library: LibraryEntry[];
        api: ApiPreset;
        savedApis: ApiPreset[];
        tone: Tone;
        generationMode: GenerationMode;
      }>;
      if (payload.format !== "char-workspace-backup-v1" || !Array.isArray(payload.characters) || !payload.characters.length) throw new Error("不是有效的 Char 完整备份");
      const restored = payload.characters.map((item, index) => {
        const restoredDraft = { ...freshDraft(), ...item.draft, greetings: item.draft?.greetings?.length ? item.draft.greetings : [""] };
        const existingEntries = Array.isArray(item.entries) ? item.entries : [];
        const restoredBooks = Array.isArray(item.worldBooks) && item.worldBooks.length
          ? item.worldBooks
          : [{ id: uid(), name: `${restoredDraft.name || `角色 ${index + 1}`}的世界书`, entries: existingEntries, updatedAt: new Date().toISOString() }];
        const restoredBook = restoredBooks.find((book) => book.id === item.activeWorldBookId) ?? restoredBooks[0];
        return {
          ...item,
          id: item.id || uid(),
          label: item.label || restoredDraft.name || `角色 ${index + 1}`,
          draft: restoredDraft,
          entries: restoredBook.entries,
          worldBooks: restoredBooks,
          activeWorldBookId: restoredBook.id,
          updatedAt: item.updatedAt || new Date().toISOString(),
        };
      });
      const active = restored.find((item) => item.id === payload.activeCharacterId) ?? restored[0];
      const activeBook = active.worldBooks.find((book) => book.id === active.activeWorldBookId) ?? active.worldBooks[0];
      setCharacters(restored);
      setActiveCharacterId(active.id);
      setDraft(cloneDraft(active.draft));
      setWorldBooks(active.worldBooks);
      setActiveWorldBookId(activeBook.id);
      setEntries(cloneEntries(activeBook.entries));
      if (Array.isArray(payload.library)) setLibrary(payload.library);
      if (payload.api) {
        const restoredApi = { ...DEFAULT_API, ...payload.api, models: Array.isArray(payload.api.models) ? payload.api.models : [], apiKey: "" };
        setApi(restoredApi);
        setModelOptions(restoredApi.models);
      }
      if (Array.isArray(payload.savedApis)) setSavedApis(payload.savedApis.map((item) => ({ ...DEFAULT_API, ...item, models: Array.isArray(item.models) ? item.models : [], apiKey: "" })));
      if (payload.tone) setTone(payload.tone);
      if (payload.generationMode) setGenerationMode(payload.generationMode);
      setUndoStack([]);
      setConsistencyIssues(null);
      setNotice(`已恢复 ${restored.length} 个角色档案，请重新填写 API Key`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "完整备份导入失败");
    }
    event.target.value = "";
  };

  const withLibrary = (prompt: string) => enabledLibraryText
    ? `${prompt}\n\n【长期资料库｜以下内容必须作为创作约束与参考】\n${enabledLibraryText}`
    : prompt;

  const chooseProvider = (provider: Provider) => {
    const selected = PROVIDERS[provider];
    setApi((current) => ({ ...current, ...selected, id: undefined, provider, models: [], apiKey: current.provider === provider ? current.apiKey : "" }));
    setModelOptions([]);
    setNotice(`已切换到 ${selected.name} 预设`);
  };

  const chooseSavedApi = (preset: ApiPreset) => {
    const restored = { ...DEFAULT_API, ...preset, provider: "custom" as const, models: Array.isArray(preset.models) ? preset.models : [] };
    setApi(restored);
    setModelOptions(restored.models);
    setNotice(`已切换到站点预设“${preset.name}”`);
  };

  const startNewApiPreset = () => {
    setApi({ ...DEFAULT_API, ...PROVIDERS.custom, id: undefined, provider: "custom", name: `自定义站点 ${savedApis.length + 1}`, models: [], apiKey: "", temperature: api.temperature });
    setModelOptions([]);
    setNotice("已新建空白站点预设，请填写连接信息后保存");
  };

  const saveCurrentApi = (saveAsNew = false) => {
    if (api.provider !== "custom") {
      setNotice("官方预设会自动保留；需要新增站点时请选择“兼容接口”");
      return;
    }
    if (!api.name.trim() || !api.endpoint.trim()) {
      setNotice("请填写预设名称和 API Endpoint");
      return;
    }
    const saved = {
      ...api,
      id: saveAsNew || !api.id ? uid() : api.id,
      name: saveAsNew ? `${api.name} 副本` : api.name,
      provider: "custom" as const,
      models: [...modelOptions],
    };
    setSavedApis((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
    });
    setApi(saved);
    setNotice(`已保存并启用站点预设“${saved.name}”`);
  };

  const removeSavedApi = (id: string) => {
    setSavedApis((current) => current.filter((item) => item.id !== id));
    if (api.id === id) {
      setApi({ ...DEFAULT_API, ...PROVIDERS.custom, id: undefined, models: [], apiKey: "", temperature: api.temperature });
      setModelOptions([]);
    }
    setNotice("已删除该自定义站点");
  };

  const clearCurrentApiKey = () => {
    const currentId = api.id;
    setApi((current) => ({ ...current, apiKey: "" }));
    if (currentId) {
      setSavedApis((current) => current.map((item) => item.id === currentId ? { ...item, apiKey: "" } : item));
    }
    setNotice("API Key 已从当前预设和本机记录中清除");
  };

  const loadModels = async () => {
    if (!api.apiKey.trim() || !api.endpoint.trim()) {
      setNotice("请先填写 API Endpoint 和 API Key");
      return;
    }
    setLoadingModels(true);
    setNotice("正在从 API 站点拉取模型…");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "models", preset: api }),
      });
      const payload = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "模型列表拉取失败");
      const models = payload.models ?? [];
      setModelOptions(models);
      setApi((current) => ({
        ...current,
        models,
        model: models.length && (!current.model.trim() || current.model === "your-model-name") ? models[0] : current.model,
      }));
      setNotice(`已拉取 ${models.length} 个模型，可从模型名称的下拉建议中选择`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "模型列表拉取失败");
    } finally {
      setLoadingModels(false);
    }
  };

  const callModel = async (mode: ModelMode, prompt: string, section?: RevisionSection) => {
    if (!api.apiKey.trim()) {
      setView("api");
      throw new Error("请先填写 API Key");
    }
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, prompt, section, preset: api }),
    });
    const payload = (await response.json()) as { text?: string; error?: string };
    if (!response.ok) throw new Error(payload.error || "生成失败，请检查 API 配置");
    return payload.text ?? "";
  };

  const generateCharacter = async () => {
    if (!draft.source.trim()) {
      setNotice(generationMode === "create" ? "请先描述你想要的人设" : "请先粘贴小说、设定或聊天记录");
      return;
    }
    setBusy("character");
    setNotice(generationMode === "create" ? "正在按照你的想法创作完整角色卡…" : "正在提取角色设定…");
    try {
      const text = await callModel(
        generationMode === "create" ? "character-create" : "character-extract",
        withLibrary(generationMode === "create"
          ? `【我想要的人设】\n${draft.source}\n\n【故事与世界背景】\n${draft.background || "未提供，请围绕人设合理创作"}`
          : `【角色原始资料】\n${draft.source}\n\n【补充世界背景】\n${draft.background || "未提供"}`),
      );
      const parsed = JSON.parse(cleanJsonText(text)) as Partial<CharacterDraft> & { greetings?: string[] };
      pushUndo("生成完整角色卡");
      setDraft((current) => ({
        ...current,
        ...parsed,
        source: current.source,
        background: current.background,
        greetings: Array.isArray(parsed.greetings) && parsed.greetings.length
          ? parsed.greetings.filter((item): item is string => typeof item === "string")
          : current.greetings,
      }));
      setNotice("角色卡已生成；每个部分都可以填写建议并让 AI 单独优化");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(null);
    }
  };

  const updateRevisionNote = (section: RevisionSection, value: string) => {
    setRevisionNotes((current) => ({ ...current, [section]: value }));
  };

  const normalizeWorldEntries = (items: Array<Partial<WorldEntry>>) => items.slice(0, 24).map((entry, index) => ({
    id: uid(),
    title: entry.title || `条目 ${index + 1}`,
    keys: entry.keys || "",
    content: entry.content || "",
    category: entry.category || "世界观",
    priority: Number(entry.priority) || 100 - index,
    enabled: entry.enabled !== false,
  }));

  const optimizeSection = async (section: RevisionSection) => {
    const suggestion = revisionNotes[section].trim();
    if (!suggestion) return;

    const currentContent: Record<RevisionSection, unknown> = {
      basic: {
        name: draft.name,
        gender: draft.gender,
        note: draft.note,
        nickname: draft.nickname,
        signature: draft.signature,
        age: draft.age,
        suffix: draft.suffix,
        language: draft.language,
      },
      persona: draft.persona,
      greetings: draft.greetings,
      biography: draft.biography,
      appearance: draft.appearance,
      world: entries,
      conflicts: draft.conflicts,
    };

    setRevising(section);
    setNotice(`正在根据建议重新优化${section === "world" ? "世界书" : "这一部分"}…`);
    try {
      const text = await callModel(
        "revise",
        withLibrary(`【角色与世界背景】\n${draft.source || "未提供"}\n${draft.background || ""}\n\n【完整人设参考】\n${draft.persona || "未生成"}\n\n【当前内容】\n${JSON.stringify(currentContent[section], null, 2)}\n\n【用户修改建议】\n${suggestion}`),
        section,
      );

      let previewValue: unknown;
      if (section === "basic") {
        const parsed = JSON.parse(cleanJsonText(text)) as Partial<CharacterDraft>;
        const basicKeys: Array<keyof CharacterDraft> = ["name", "gender", "note", "nickname", "signature", "age", "suffix", "language"];
        previewValue = basicKeys.reduce<Record<string, string>>((result, key) => {
          result[key] = typeof parsed[key] === "string" ? parsed[key] as string : draft[key] as string;
          return result;
        }, {});
      } else if (section === "greetings") {
        const parsed = JSON.parse(cleanJsonText(text));
        if (!Array.isArray(parsed)) throw new Error("开场白格式不正确，请重试");
        previewValue = parsed.filter((item): item is string => typeof item === "string");
      } else if (section === "world") {
        const parsed = JSON.parse(cleanJsonText(text)) as Array<Partial<WorldEntry>>;
        if (!Array.isArray(parsed)) throw new Error("世界书格式不正确，请重试");
        previewValue = normalizeWorldEntries(parsed);
      } else {
        previewValue = text.trim();
      }
      setRevisionPreview({
        section,
        label: section === "world" ? "世界书" : section === "greetings" ? "开场白" : section === "basic" ? "基础信息" : section === "persona" ? "人设正文" : section === "biography" ? "人物小传" : section === "appearance" ? "生图外貌" : "冲突与缺失信息",
        before: revisionText(currentContent[section]),
        after: revisionText(previewValue),
        value: previewValue,
      });
      setNotice("AI 优化完成，请预览后决定是否应用");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "优化失败，请稍后重试");
    } finally {
      setRevising(null);
    }
  };

  const applyRevisionPreview = () => {
    if (!revisionPreview) return;
    pushUndo(`应用${revisionPreview.label}优化`);
    const { section, value, greetingIndex } = revisionPreview;
    if (section === "basic") {
      setDraft((current) => ({ ...current, ...(value as Partial<CharacterDraft>) }));
    } else if (section === "greetings") {
      if (typeof greetingIndex === "number") {
        const next = [...draft.greetings];
        next[greetingIndex] = String(value);
        updateDraft("greetings", next);
      } else {
        updateDraft("greetings", value as string[]);
      }
    } else if (section === "world") {
      setEntries(cloneEntries(value as WorldEntry[]));
    } else {
      const fieldMap: Record<Exclude<RevisionSection, "basic" | "greetings" | "world">, keyof CharacterDraft> = {
        persona: "persona",
        biography: "biography",
        appearance: "appearance",
        conflicts: "conflicts",
      };
      updateDraft(fieldMap[section], String(value));
    }
    updateRevisionNote(section, "");
    if (typeof greetingIndex === "number") setGreetingNotes((current) => ({ ...current, [greetingIndex]: "" }));
    setRevisionPreview(null);
    setConsistencyIssues(null);
    setNotice(`已应用${revisionPreview.label}优化，可随时撤销`);
  };

  const moveGreeting = (from: number, to: number) => {
    if (to < 0 || to >= draft.greetings.length || from === to) return;
    const next = [...draft.greetings];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateDraft("greetings", next);
    setNotice("开场白顺序已调整");
  };

  const dropGreeting = (event: DragEvent<HTMLDivElement>, to: number) => {
    event.preventDefault();
    if (dragGreetingIndex !== null) moveGreeting(dragGreetingIndex, to);
    setDragGreetingIndex(null);
  };

  const duplicateGreeting = (index: number) => {
    const next = [...draft.greetings];
    next.splice(index + 1, 0, draft.greetings[index]);
    updateDraft("greetings", next);
    setNotice(`已复制开场白 ${index + 1}`);
  };

  const optimizeGreeting = async (index: number) => {
    const suggestion = greetingNotes[index]?.trim();
    if (!suggestion) return;
    setRevising("greetings");
    setNotice(`正在单独优化开场白 ${index + 1}…`);
    try {
      const text = await callModel(
        "revise",
        withLibrary(`【完整人设参考】\n${draft.persona || "未生成"}\n\n【当前仅这一条开场白】\n${JSON.stringify([draft.greetings[index]])}\n\n【用户修改建议】\n${suggestion}\n\n只处理这一条，并仅返回包含一个字符串的 JSON 数组。`),
        "greetings",
      );
      const parsed = JSON.parse(cleanJsonText(text));
      if (!Array.isArray(parsed) || typeof parsed[0] !== "string") throw new Error("单条开场白格式不正确，请重试");
      setRevisionPreview({
        section: "greetings",
        label: `开场白 ${index + 1}`,
        before: draft.greetings[index],
        after: parsed[0],
        value: parsed[0],
        greetingIndex: index,
      });
      setNotice("单条开场白优化完成，请预览后决定是否应用");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "开场白优化失败");
    } finally {
      setRevising(null);
    }
  };

  const checkConsistency = async () => {
    setBusy("check");
    setNotice("正在检查角色卡内部一致性…");
    try {
      const text = await callModel("check", withLibrary(JSON.stringify({ draft, worldBook: entries }, null, 2)));
      const parsed = JSON.parse(cleanJsonText(text));
      if (!Array.isArray(parsed)) throw new Error("检查结果格式不正确，请重试");
      const issues = parsed.flatMap((item) => typeof item === "string" ? [item] : []);
      setConsistencyIssues(issues);
      setNotice(issues.length ? `发现 ${issues.length} 项需要确认的内容` : "一致性检查通过，没有发现明显问题");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "一致性检查失败");
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
        withLibrary(`【世界背景】\n${draft.background || "未单独提供"}\n\n【角色资料】\n${draft.source || draft.persona || "未提供"}`),
      );
      const parsed = JSON.parse(cleanJsonText(text)) as Array<Partial<WorldEntry>>;
      if (!Array.isArray(parsed)) throw new Error("模型返回的世界书格式不正确");
      pushUndo("生成世界书");
      const generatedEntries = normalizeWorldEntries(parsed);
      const nextBook: WorldBookRecord = {
        id: uid(),
        name: `${draft.name || "char"}的世界书 ${worldBooks.length + 1}`,
        entries: generatedEntries,
        updatedAt: new Date().toISOString(),
      };
      setWorldBooks([...booksWithCurrentEntries(), nextBook]);
      setActiveWorldBookId(nextBook.id);
      setEntries(generatedEntries);
      setView("world");
      setNotice(`已新建并绑定世界书“${nextBook.name}”`);
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

  const characterText = () => [
    `【01 基础信息】\n名字：${draft.name || "未提供"}\n性别：${draft.gender || "未提供"}\n备注：${draft.note || "未提供"}\n网名：${draft.nickname || "未提供"}\n签名：${draft.signature || "未提供"}\n年龄：${draft.age || "未提供"}\n被拍后缀：${draft.suffix || "未提供"}\n文化母语：${draft.language || "未提供"}`,
    `【02 人设正文】\n${draft.persona || "未提供"}`,
    `【03 开场白】\n${draft.greetings.map((item, index) => `开场白 ${index + 1}\n${item || "未提供"}`).join("\n\n")}`,
    `【04 人物小传】\n${draft.biography || "未提供"}`,
    `【05 生图外貌】\n${draft.appearance || "未提供"}`,
    `【06 世界书】\n${entries.map((item) => `${item.title}｜${item.keys}\n${item.content}`).join("\n\n") || "未提供"}`,
    `【07 缺失信息与设定冲突】\n${draft.conflicts || "未提供"}`,
  ].join("\n\n");

  const characterMarkdown = () => [
    `# ${draft.name || "char"}`,
    `## 基础信息\n\n- 性别：${draft.gender || "未提供"}\n- 年龄：${draft.age || "未提供"}\n- 网名：${draft.nickname || "未提供"}\n- 签名：${draft.signature || "未提供"}\n- 被拍后缀：${draft.suffix || "未提供"}\n- 文化母语：${draft.language || "未提供"}\n- 备注：${draft.note || "未提供"}`,
    `## 人设正文\n\n${draft.persona || "未提供"}`,
    `## 开场白\n\n${draft.greetings.map((item, index) => `### 开场白 ${index + 1}\n\n${item || "未提供"}`).join("\n\n")}`,
    `## 人物小传\n\n${draft.biography || "未提供"}`,
    `## 生图外貌\n\n${draft.appearance || "未提供"}`,
    `## 世界书\n\n${entries.map((item) => `### ${item.title}\n\n关键词：${item.keys || "无"}\n\n${item.content}`).join("\n\n") || "未提供"}`,
    `## 缺失信息与设定冲突\n\n${draft.conflicts || "未提供"}`,
  ].join("\n\n");

  const exportCharacter = (format: "json" | "txt" | "md" | "sillytavern") => {
    const baseName = `${draft.name || "未命名角色"}_角色卡`;
    if (format === "json") {
      saveFile(`${baseName}.json`, JSON.stringify({ format: "char-character-card-v1", ...draft, worldBook: entries, promptLibrary: library }, null, 2), "application/json");
      return;
    }
    if (format === "md") {
      saveFile(`${baseName}.md`, characterMarkdown(), "text/markdown;charset=utf-8");
      return;
    }
    if (format === "sillytavern") {
      const card = {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: draft.name || "char",
          description: draft.persona,
          personality: draft.persona,
          scenario: draft.background,
          first_mes: draft.greetings[0] || "",
          mes_example: "",
          creator_notes: [draft.note, draft.biography && `人物小传：\n${draft.biography}`, draft.appearance && `生图外貌：\n${draft.appearance}`].filter(Boolean).join("\n\n"),
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: draft.greetings.slice(1).filter(Boolean),
          tags: [],
          creator: "Char",
          character_version: "1.0",
          extensions: { char: { conflicts: draft.conflicts, worldBook: entries } },
        },
      };
      saveFile(`${draft.name || "char"}_SillyTavern_V2.json`, JSON.stringify(card, null, 2), "application/json");
      return;
    }
    saveFile(`${baseName}.txt`, characterText());
  };

  const exportWorld = () => {
    const activeBook = worldBooks.find((book) => book.id === activeWorldBookId);
    const worldBook = {
      name: activeBook?.name || `${draft.name || "角色"}的世界书`,
      format: "char-world-book-v1",
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
    saveFile(`${worldBook.name || "未命名世界书"}.json`, JSON.stringify(worldBook, null, 2), "application/json");
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

  const switchWorldBook = (id: string) => {
    const nextBooks = booksWithCurrentEntries();
    const nextBook = nextBooks.find((book) => book.id === id);
    if (!nextBook) return;
    setWorldBooks(nextBooks);
    setActiveWorldBookId(nextBook.id);
    setEntries(cloneEntries(nextBook.entries));
    setUndoStack([]);
    setNotice(`已切换到“${nextBook.name}”`);
  };

  const addWorldBook = () => {
    const nextBook: WorldBookRecord = { id: uid(), name: `${draft.name || "char"}的新世界书`, entries: [], updatedAt: new Date().toISOString() };
    setWorldBooks([...booksWithCurrentEntries(), nextBook]);
    setActiveWorldBookId(nextBook.id);
    setEntries([]);
    setUndoStack([]);
    setNotice(`已为“${draft.name || "char"}”新建一本世界书`);
  };

  const duplicateWorldBook = () => {
    const currentBook = worldBooks.find((book) => book.id === activeWorldBookId);
    if (!currentBook) return;
    const duplicate: WorldBookRecord = { id: uid(), name: `${currentBook.name} 副本`, entries: cloneEntries(entries).map((entry) => ({ ...entry, id: uid() })), updatedAt: new Date().toISOString() };
    setWorldBooks([...booksWithCurrentEntries(), duplicate]);
    setActiveWorldBookId(duplicate.id);
    setEntries(cloneEntries(duplicate.entries));
    setUndoStack([]);
    setNotice("世界书副本已创建并绑定当前角色");
  };

  const renameWorldBook = (name: string) => {
    setWorldBooks((current) => current.map((book) => book.id === activeWorldBookId ? { ...book, name } : book));
  };

  const deleteWorldBook = () => {
    if (worldBooks.length <= 1) {
      setNotice("每个角色至少保留一本世界书");
      return;
    }
    const currentBook = worldBooks.find((book) => book.id === activeWorldBookId);
    if (!window.confirm(`确定删除世界书“${currentBook?.name || "未命名"}”吗？`)) return;
    const remaining = worldBooks.filter((book) => book.id !== activeWorldBookId);
    setWorldBooks(remaining);
    setActiveWorldBookId(remaining[0].id);
    setEntries(cloneEntries(remaining[0].entries));
    setUndoStack([]);
    setNotice("世界书已删除，角色其他世界书不受影响");
  };

  const saveWorldBookNow = () => {
    const savedAt = new Date();
    const nextBooks = worldBooks.map((book) => book.id === activeWorldBookId ? { ...book, entries: cloneEntries(entries), updatedAt: savedAt.toISOString() } : book);
    setWorldBooks(nextBooks);
    setLastSavedAt(savedAt);
    setNotice(`世界书已保存，并绑定角色“${draft.name || "char"}”`);
  };

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      { id: uid(), title: "新条目", keys: "", content: "", category: "世界观", priority: 100, enabled: true },
    ]);
    setNotice("已添加空白世界书条目");
  };

  const addLibraryEntry = (category: LibraryCategory = "人设要求") => {
    setLibrary((current) => [
      ...current,
      { id: uid(), title: "新资料", category, content: "", enabled: true },
    ]);
    setNotice("已添加资料库条目");
  };

  const updateLibraryEntry = (id: string, patch: Partial<LibraryEntry>) => {
    setLibrary((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const duplicateLibraryEntry = (item: LibraryEntry) => {
    setLibrary((current) => [...current, { ...item, id: uid(), title: `${item.title || "资料"} 副本` }]);
    setNotice("资料条目已复制");
  };

  const saveLibraryNow = () => {
    try {
      localStorage.setItem("char-prompt-library", JSON.stringify(library));
      setNotice(`资料库已保存到本机，共 ${library.length} 条`);
    } catch {
      setNotice("资料库保存失败，请检查浏览器是否允许本地存储");
    }
  };

  const exportLibrary = () => {
    saveFile("Char_角色资料库.json", JSON.stringify({
      format: "char-prompt-library-v1",
      variables: { character: "{{char}}", user: "{{user}}" },
      entries: library,
    }, null, 2), "application/json");
  };

  const importLibrary = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let imported: LibraryEntry[] = [];
      try {
        const payload = JSON.parse(text) as { entries?: unknown } | unknown[];
        const rawEntries = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && "entries" in payload
            ? Array.isArray(payload.entries) ? payload.entries : Object.values(payload.entries as Record<string, unknown>)
            : [];
        imported = rawEntries.flatMap((raw, index) => {
          if (!raw || typeof raw !== "object") return [];
          const item = raw as Record<string, unknown>;
          const content = typeof item.content === "string" ? item.content : "";
          if (!content.trim()) return [];
          const rawCategory = typeof item.category === "string" ? item.category : "世界书参考";
          const category = LIBRARY_CATEGORIES.includes(rawCategory as LibraryCategory) ? rawCategory as LibraryCategory : "世界书参考";
          const key = Array.isArray(item.key) ? item.key.filter((value): value is string => typeof value === "string").join("、") : "";
          return [{
            id: uid(),
            title: typeof item.title === "string" ? item.title : typeof item.comment === "string" ? item.comment : key || `导入资料 ${index + 1}`,
            category,
            content,
            enabled: item.enabled !== false && item.disable !== true,
          }];
        });
      } catch {
        if (text.trim()) imported = [{ id: uid(), title: file.name.replace(/\.[^.]+$/, ""), category: "世界书参考", content: text.trim(), enabled: true }];
      }
      if (!imported.length) throw new Error("没有找到可导入的文字条目");
      setLibrary((current) => [...current, ...imported]);
      setNotice(`已导入 ${imported.length} 条资料`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资料库导入失败");
    }
    event.target.value = "";
  };

  return (
    <div
      className="app-shell"
      data-tone={tone}
      style={backgroundImage ? { "--custom-bg": `url(${JSON.stringify(backgroundImage)})` } as CSSProperties : undefined}
    >
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("character")} aria-label="返回角色卡首页">
          <span className="brand-mark">C</span>
          <span>
            <b>Char</b>
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
          <div className="mobile-brand">Char</div>
          <div className="status-pill" title={lastSavedAt ? `上次保存：${lastSavedAt.toLocaleString()}` : notice}><span /> {notice}{lastSavedAt && <small> · {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 已保存</small>}</div>
          <div className="top-actions">
            <label className="tone-select">
              <span>背景</span>
              <select value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                <option value="mist">雾白</option>
                <option value="warm">暖灰</option>
                <option value="paper">纸白</option>
              </select>
            </label>
            {undoStack.length > 0 && <button className="quiet-button" onClick={undoLastChange}>撤销</button>}
            <button className="quiet-button" onClick={() => exportCharacter("json")}>导出 JSON</button>
          </div>
        </header>

        {view === "character" && (
          <div className="page-wrap">
            <section className="character-manager" aria-label="角色档案管理">
              <div className="character-manager-main">
                <span>CHARACTER FILE</span>
                <select aria-label="切换角色档案" value={activeCharacterId} onChange={(event) => switchCharacter(event.target.value)}>
                  {characters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <small>{characters.length} 个角色 · {lastSavedAt ? `${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 已保存` : "正在准备存档"}</small>
              </div>
              <div className="character-manager-actions">
                <button onClick={addCharacter}>＋ 新角色</button>
                <button onClick={duplicateCharacter}>复制角色</button>
                <button onClick={undoLastChange} disabled={!undoStack.length}>撤销修改</button>
                <button onClick={exportWorkspace}>完整备份</button>
                <label>恢复备份<input type="file" accept="application/json,.json" onChange={importWorkspace} /></label>
                <label>背景图<input type="file" accept="image/*" onChange={changeBackgroundImage} /></label>
                {backgroundImage && <button onClick={() => { setBackgroundImage(""); setNotice("已恢复默认背景"); }}>清除背景</button>}
                <button className="danger" onClick={deleteCharacter} disabled={characters.length <= 1}>删除角色</button>
              </div>
            </section>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">CHARACTER ARCHIVE · 角色档案</span>
                <h1>把你的想法，直接变成<br /><em>可长期扮演</em>的角色。</h1>
                <p>描述想要的人设与故事背景，AI 会按照角色卡模板一次生成完整内容；不满意的部分可以单独提出建议、重新优化。</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={generateCharacter} disabled={busy !== null}>
                    {busy === "character" ? "正在生成…" : generationMode === "create" ? "按我的想法生成" : "提取完整角色卡"}<span>→</span>
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
                <div><span>STEP 01</span><h2>{generationMode === "create" ? "告诉 AI 你想要的角色" : "原始资料与世界背景"}</h2></div>
                <div className="mode-switch" aria-label="角色生成模式">
                  <button className={generationMode === "create" ? "active" : ""} onClick={() => setGenerationMode("create")}>从想法创作</button>
                  <button className={generationMode === "extract" ? "active" : ""} onClick={() => setGenerationMode("extract")}>从资料提取</button>
                </div>
              </div>
              <div className="dual-textareas">
                <TextAreaField
                  label={generationMode === "create" ? "我想要的人设" : "角色原始资料"}
                  value={draft.source}
                  onChange={(value) => updateDraft("source", value)}
                  rows={10}
                  placeholder={generationMode === "create" ? "例如：28 岁的财阀继承人，表面冷淡克制，私下很会照顾人；说话简短、不油腻，与用户是多年未见的旧识……" : "粘贴小说片段、旧角色卡、人物设定、聊天记录……"}
                  helper={generationMode === "create" ? "可以只写关键词，也可以详细描述性格、关系、语气、禁忌和互动偏好。" : "系统会忠于原文提取，不把推测写成事实。"}
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
                <button className="secondary-button" onClick={generateCharacter} disabled={busy !== null}>{generationMode === "create" ? "直接生成完整角色卡" : "提取角色信息"}</button>
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
              <RevisionPanel
                section="基础信息"
                value={revisionNotes.basic}
                onChange={(value) => updateRevisionNote("basic", value)}
                onSubmit={() => optimizeSection("basic")}
                loading={revising === "basic"}
                example="例如：改成韩文名字，年龄调整为 31 岁，签名更克制"
              />
            </section>

            <section className="editor-card">
              <div className="section-heading">
                <div><span>STEP 03</span><h2>人设正文</h2></div>
                <div className="section-heading-actions">
                  <small>{draft.persona.length.toLocaleString()} 字符</small>
                  <button className="copy-button" onClick={() => copyText("人设正文", draft.persona)} disabled={!draft.persona.trim()}>复制</button>
                </div>
              </div>
              <TextAreaField
                label="身份、性格、心理、说话方式、关系与行为逻辑"
                value={draft.persona}
                onChange={(value) => updateDraft("persona", value)}
                rows={13}
                placeholder="AI 长期扮演角色时使用的核心设定……"
              />
              <RevisionPanel
                section="人设正文"
                value={revisionNotes.persona}
                onChange={(value) => updateRevisionNote("persona", value)}
                onSubmit={() => optimizeSection("persona")}
                loading={revising === "persona"}
                example="例如：减少霸总感，增加生活化缺点；对用户更慢热"
              />
            </section>

            <section className="editor-card">
              <div className="section-heading">
                <div><span>STEP 04</span><h2>开场白</h2></div>
                <div className="section-heading-actions">
                  <button className="copy-button" onClick={() => copyText("全部开场白", draft.greetings.filter((item) => item.trim()).map((item, index) => `开场白 ${index + 1}\n${item}`).join("\n\n"))} disabled={!draft.greetings.some((item) => item.trim())}>复制全部</button>
                  <button className="mini-button" onClick={() => updateDraft("greetings", [...draft.greetings, ""])}>＋ 添加情境</button>
                </div>
              </div>
              <div className="greeting-list">
                {draft.greetings.map((greeting, index) => (
                  <div
                    className={`greeting-item ${dragGreetingIndex === index ? "dragging" : ""}`}
                    key={index}
                    draggable
                    onDragStart={() => setDragGreetingIndex(index)}
                    onDragEnd={() => setDragGreetingIndex(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropGreeting(event, index)}
                  >
                    <span title="拖拽排序">{String(index + 1).padStart(2, "0")}</span>
                    <div className="greeting-editor">
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
                      <div className="single-greeting-refine">
                        <input aria-label={`开场白 ${index + 1} 修改建议`} value={greetingNotes[index] || ""} onChange={(event) => setGreetingNotes((current) => ({ ...current, [index]: event.target.value }))} placeholder="只优化这一条，例如：改成雨夜重逢，语气更自然" />
                        <button onClick={() => optimizeGreeting(index)} disabled={revising !== null || !greetingNotes[index]?.trim()}>{revising === "greetings" ? "优化中…" : "AI 优化此条"}</button>
                      </div>
                    </div>
                    <div className="greeting-actions">
                      <button aria-label={`上移开场白 ${index + 1}`} onClick={() => moveGreeting(index, index - 1)} disabled={index === 0}>↑</button>
                      <button aria-label={`下移开场白 ${index + 1}`} onClick={() => moveGreeting(index, index + 1)} disabled={index === draft.greetings.length - 1}>↓</button>
                      <button onClick={() => duplicateGreeting(index)}>复制一条</button>
                      <button className="copy-button" onClick={() => copyText(`开场白 ${index + 1}`, greeting)} disabled={!greeting.trim()}>复制</button>
                      {draft.greetings.length > 1 && (
                        <button className="greeting-delete" aria-label={`删除开场白 ${index + 1}`} onClick={() => updateDraft("greetings", draft.greetings.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <RevisionPanel
                section="开场白"
                value={revisionNotes.greetings}
                onChange={(value) => updateRevisionNote("greetings", value)}
                onSubmit={() => optimizeSection("greetings")}
                loading={revising === "greetings"}
                example="例如：第一条改成雨夜重逢；对白更自然，不要替用户行动"
              />
            </section>

            <div className="split-editor">
              <section className="editor-card">
                <div className="section-heading"><div><span>STEP 05</span><h2>人物小传</h2></div><button className="copy-button" onClick={() => copyText("人物小传", draft.biography)} disabled={!draft.biography.trim()}>复制</button></div>
                <TextAreaField label="人物经历" value={draft.biography} onChange={(value) => updateDraft("biography", value)} rows={12} placeholder="按时间线整理出身、转折、关系变化与当前状态……" />
                <RevisionPanel
                  section="人物小传"
                  value={revisionNotes.biography}
                  onChange={(value) => updateRevisionNote("biography", value)}
                  onSubmit={() => optimizeSection("biography")}
                  loading={revising === "biography"}
                  example="例如：补充留学经历，但不要改变家庭关系"
                />
              </section>
              <section className="editor-card">
                <div className="section-heading"><div><span>STEP 06</span><h2>生图外貌</h2></div><button className="copy-button" onClick={() => copyText("生图外貌", draft.appearance)} disabled={!draft.appearance.trim()}>复制</button></div>
                <TextAreaField label="可视觉化设定" value={draft.appearance} onChange={(value) => updateDraft("appearance", value)} rows={12} placeholder="外观年龄、体型、五官、发型、服饰、辨识特征与神态……" />
                <RevisionPanel
                  section="生图外貌"
                  value={revisionNotes.appearance}
                  onChange={(value) => updateRevisionNote("appearance", value)}
                  onSubmit={() => optimizeSection("appearance")}
                  loading={revising === "appearance"}
                  example="例如：改成黑色微卷短发，穿搭更偏极简韩系"
                />
              </section>
            </div>

            <section className="editor-card">
              <div className="section-heading"><div><span>STEP 07</span><h2>缺失信息与设定冲突</h2></div><div className="section-heading-actions"><small>不会擅自替你决定冲突版本</small><button className="copy-button" onClick={() => copyText("缺失信息与设定冲突", draft.conflicts)} disabled={!draft.conflicts.trim()}>复制</button></div></div>
              <TextAreaField label="待确认事项" value={draft.conflicts} onChange={(value) => updateDraft("conflicts", value)} rows={5} placeholder="原文未提供的信息，以及互相矛盾的设定会列在这里……" />
              <RevisionPanel
                section="冲突与缺失信息"
                value={revisionNotes.conflicts}
                onChange={(value) => updateRevisionNote("conflicts", value)}
                onSubmit={() => optimizeSection("conflicts")}
                loading={revising === "conflicts"}
                example="例如：把已经确认的年龄从冲突项中删除，其余保留"
              />
              <div className="quality-panel">
                <div><span>CONSISTENCY CHECK</span><b>检查人设、经历、开场白和世界书是否互相矛盾</b></div>
                <button className="secondary-button" onClick={checkConsistency} disabled={busy !== null}>{busy === "check" ? "检查中…" : "AI 一致性检查"}</button>
                {consistencyIssues !== null && (
                  <div className={`quality-results ${consistencyIssues.length === 0 ? "passed" : ""}`}>
                    {consistencyIssues.length === 0 ? <p>没有发现明显矛盾，变量规范也符合要求。</p> : <ol>{consistencyIssues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ol>}
                  </div>
                )}
              </div>
              <div className="export-row">
                <div><b>完成后导出</b><span>可再次导入此工作台，也可复制到其他角色平台。</span></div>
                <button className="quiet-button" onClick={() => copyText("完整角色卡", characterText())}>复制整卡</button>
                <button className="quiet-button" onClick={() => exportCharacter("txt")}>下载 TXT</button>
                <button className="quiet-button" onClick={() => exportCharacter("md")}>下载 Markdown</button>
                <button className="quiet-button" onClick={() => exportCharacter("sillytavern")}>SillyTavern V2</button>
                <button className="primary-button compact" onClick={() => exportCharacter("json")}>下载 JSON <span>↓</span></button>
              </div>
            </section>
          </div>
        )}

        {view === "library" && (
          <div className="page-wrap library-page">
            <section className="page-intro">
              <div><span className="eyebrow">CREATIVE LIBRARY · 创作资料库</span><h1>把长期要求，交给 AI 一直记住。</h1><p>修改会自动保存在当前设备，也可以点击“保存到本机”立即确认。启用的条目会自动加入角色生成、世界书生成和分区优化。</p></div>
              <div className="page-intro-actions">
                <label className="file-button">导入资料<input type="file" accept=".json,.txt,.md,application/json,text/plain" onChange={importLibrary} /></label>
                <button className="quiet-button" onClick={exportLibrary} disabled={!library.length}>导出</button>
                <button className="quiet-button" onClick={saveLibraryNow}>保存到本机</button>
                <button className="primary-button compact" onClick={() => addLibraryEntry()}>＋ 新建</button>
              </div>
            </section>

            <section className="variable-guide">
              <div><span>CHAR</span><code>{"{{char}}"}</code><p>默认角色名变量，代表当前正在塑造或扮演的角色。</p></div>
              <div><span>USER</span><code>{"{{user}}"}</code><p>默认用户变量，代表与角色对话的用户，不替用户决定言行和心理。</p></div>
              <div className="library-summary"><b>{library.filter((item) => item.enabled && item.content.trim()).length}</b><span>条资料正在参与 AI 生成</span></div>
            </section>

            <section className="library-quick-add" aria-label="快速添加资料类型">
              <span>快速添加</span>
              {LIBRARY_CATEGORIES.filter((category) => category !== "变量规范").map((category) => <button key={category} onClick={() => addLibraryEntry(category)}>＋ {category}</button>)}
            </section>

            <section className="library-toolbar" aria-label="资料库搜索与筛选">
              <input aria-label="搜索资料库" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="搜索标题或内容…" />
              <select aria-label="按资料类型筛选" value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value as LibraryCategory | "全部")}>
                <option>全部</option>
                {LIBRARY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
              <span>显示 {filteredLibrary.length} / {library.length} 条</span>
            </section>

            <section className="library-list">
              {library.length === 0 ? (
                <div className="empty-state"><span>空</span><h2>还没有长期资料</h2><p>添加一条人设要求，或导入已有的世界书 JSON / TXT。</p><button className="secondary-button" onClick={() => addLibraryEntry()}>新建第一条资料</button></div>
              ) : filteredLibrary.length === 0 ? (
                <div className="empty-state"><span>0</span><h2>没有匹配的资料</h2><p>换一个关键词或选择“全部”分类。</p><button className="secondary-button" onClick={() => { setLibraryQuery(""); setLibraryCategory("全部"); }}>清除筛选</button></div>
              ) : filteredLibrary.map((item, index) => (
                <article className={`library-entry ${item.enabled ? "active" : ""}`} key={item.id}>
                  <div className="library-entry-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="library-entry-main">
                    <div className="library-entry-topline">
                      <input aria-label={`资料 ${index + 1} 标题`} value={item.title} onChange={(event) => updateLibraryEntry(item.id, { title: event.target.value })} placeholder="资料标题" />
                      <select aria-label={`资料 ${index + 1} 类型`} value={item.category} onChange={(event) => updateLibraryEntry(item.id, { category: event.target.value as LibraryCategory })}>{LIBRARY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
                    </div>
                    <textarea aria-label={`资料 ${index + 1} 内容`} rows={7} value={item.content} onChange={(event) => updateLibraryEntry(item.id, { content: event.target.value })} placeholder={`写下 AI 需要长期遵守或参考的内容。角色用 {{char}}，用户用 {{user}}。`} />
                    <div className="library-entry-footer">
                      <label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => updateLibraryEntry(item.id, { enabled: event.target.checked })} /><span /> {item.enabled ? "已启用" : "已停用"}</label>
                      <small>{item.content.length} 字</small>
                      <div className="library-row-actions">
                        <button onClick={() => copyText(item.title || "资料条目", item.content)} disabled={!item.content.trim()}>复制</button>
                        <button onClick={() => duplicateLibraryEntry(item)}>创建副本</button>
                        <button className="danger" onClick={() => setLibrary((current) => current.filter((entry) => entry.id !== item.id))}>删除</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}

        {view === "world" && (
          <div className="page-wrap world-page">
            <section className="page-intro">
              <div><span className="eyebrow">WORLD ARCHIVE · 世界档案</span><h1>让背景设定在正确的时机被想起。</h1><p>每个角色可以绑定多本独立世界书。AI 再次生成时会另存一本，不会覆盖之前的内容。</p></div>
              <div className="page-intro-actions">
                <button className="quiet-button" onClick={addEntry}>＋ 新建条目</button>
                <button className="primary-button compact" onClick={generateWorld} disabled={busy !== null}>{busy === "world" ? "生成中…" : "AI 生成条目"}<span>→</span></button>
              </div>
            </section>

            <section className="world-book-manager" aria-label="当前角色的世界书">
              <div className="world-book-binding"><span>BOUND CHARACTER</span><b>{draft.name || "char"}</b><small>已绑定 {worldBooks.length} 本世界书</small></div>
              <label><span>切换世界书</span><select value={activeWorldBookId} onChange={(event) => switchWorldBook(event.target.value)}>{worldBooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label>
              <label><span>世界书名称</span><input value={activeWorldBook?.name || ""} onChange={(event) => renameWorldBook(event.target.value)} placeholder="给这本世界书命名" /></label>
              <div className="world-book-actions">
                <button onClick={addWorldBook}>＋ 新建一本</button>
                <button onClick={duplicateWorldBook}>复制此书</button>
                <button onClick={saveWorldBookNow}>保存并绑定</button>
                <button className="danger" onClick={deleteWorldBook} disabled={worldBooks.length <= 1}>删除此书</button>
              </div>
            </section>

            <section className="editor-card world-source">
              <TextAreaField label="世界背景" value={draft.background} onChange={(value) => updateDraft("background", value)} rows={7} placeholder="描述时代、地理、组织、制度、力量体系、历史事件和特殊规则……" />
              <RevisionPanel
                section="世界书"
                value={revisionNotes.world}
                onChange={(value) => updateRevisionNote("world", value)}
                onSubmit={() => optimizeSection("world")}
                loading={revising === "world"}
                example="例如：合并重复地点，增加财阀组织条目，关键词用常见简称"
              />
            </section>

            <div className="world-toolbar">
              <div><b>{activeWorldBook?.name || "未命名世界书"}</b><span> · {entries.length} 条设定</span></div>
              <button className="quiet-button" onClick={exportWorld} disabled={!entries.length}>单独导出此书 JSON</button>
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
              <div><span className="eyebrow">MODEL CONNECTION · 模型连接</span><h1>连接你信任的模型服务。</h1><p>可添加多个 OpenAI 兼容站点并拉取模型列表。密钥只保存在当前浏览器，不会写入网站数据库。</p></div>
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

            <section className="api-preset-switcher" aria-label="切换已保存的 API 预设">
              <div>
                <span>当前使用的 API 预设</span>
                <b>{api.name || "未命名预设"}</b>
                <small>{endpointHost(api.endpoint)} · {api.model || "未选模型"}</small>
              </div>
              <label>
                <span>快速切换</span>
                <select
                  value={api.id ?? ""}
                  onChange={(event) => {
                    const selected = savedApis.find((preset) => preset.id === event.target.value);
                    if (selected) chooseSavedApi(selected);
                  }}
                >
                  <option value="">选择已保存的站点预设</option>
                  {savedApis.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.model || "未选模型"}</option>)}
                </select>
              </label>
              <button onClick={startNewApiPreset}>＋ 新建站点预设</button>
            </section>

            <section className="saved-api-section" aria-label="已保存的自定义 API 站点">
                <div className="saved-api-heading"><div><span>SAVED SITES</span><h2>我的站点预设</h2></div><small>{savedApis.length} 个预设 · 仅保存在当前浏览器</small></div>
                {savedApis.length > 0 ? (
                <div className="saved-api-grid">
                  {savedApis.map((preset) => (
                    <article key={preset.id} className={api.id === preset.id ? "active" : ""}>
                      <button className="saved-api-select" onClick={() => chooseSavedApi(preset)}>
                        <span className="provider-mark">{preset.name.trim().slice(0, 1) || "＋"}</span>
                        <span><b>{preset.name}{api.id === preset.id ? " · 使用中" : ""}</b><small>{endpointHost(preset.endpoint)} · {preset.model || "未选模型"} · {preset.models?.length ?? 0} 个已拉取模型</small></span>
                      </button>
                      <button className="saved-api-delete" onClick={() => preset.id && removeSavedApi(preset.id)} aria-label={`删除 ${preset.name}`}>×</button>
                    </article>
                  ))}
                </div>
                ) : <div className="saved-api-empty"><b>还没有自定义站点</b><span>点击“新建站点预设”，填写地址和密钥后保存。</span></div>}
              </section>

            <section className="editor-card api-form">
              <div className="section-heading"><div><span>ACTIVE PRESET</span><h2>{api.name}</h2></div><a href={PROVIDERS[api.provider].docs} target="_blank" rel="noreferrer">查看官方文档 ↗</a></div>
              <div className="field-grid api-fields">
                <Field label="预设名称" value={api.name} onChange={(value) => setApi((current) => ({ ...current, name: value }))} placeholder="我的模型" />
                <label className="field">
                  <span className="field-label">模型名称 <i>必填</i></span>
                  <div className="model-picker">
                    <div className="model-fields">
                      {modelOptions.length > 0 && (
                        <select
                          aria-label="选择已拉取的模型"
                          value={modelOptions.includes(api.model) ? api.model : ""}
                          onChange={(event) => event.target.value && setApi((current) => ({ ...current, model: event.target.value }))}
                        >
                          <option value="">已拉取 {modelOptions.length} 个模型，点击选择</option>
                          {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                      )}
                      <input aria-label="手动输入模型 ID" value={api.model} onChange={(event) => setApi((current) => ({ ...current, model: event.target.value }))} placeholder="也可以手动输入模型 ID" />
                    </div>
                    <button type="button" onClick={loadModels} disabled={loadingModels || busy !== null}>{loadingModels ? "拉取中…" : "拉取模型"}</button>
                  </div>
                  <small className="field-helper">{modelOptions.length > 0 ? `列表中共有 ${modelOptions.length} 个模型；下拉选择或手动输入均可。` : "拉取模型后会显示完整下拉列表，也可以直接手动填写。"}</small>
                </label>
                <label className="field field-wide"><span className="field-label">API Endpoint <i>必填</i></span><input value={api.endpoint} onChange={(event) => { setApi((current) => ({ ...current, endpoint: event.target.value, models: [] })); setModelOptions([]); }} placeholder="https://站点地址/v1 或完整的 /chat/completions 地址" /><small className="field-helper">兼容接口可填写站点的 /v1 基础地址，生成时会自动使用 /chat/completions。</small></label>
                <label className="field field-wide"><span className="field-label">模型列表地址 <i>可选</i></span><input value={api.modelsEndpoint} onChange={(event) => setApi((current) => ({ ...current, modelsEndpoint: event.target.value }))} placeholder="留空时根据 API Endpoint 自动推导 /models" /><small className="field-helper">只有站点使用特殊路径时才需要填写；一般留空即可。</small></label>
                <label className="field field-wide"><span className="field-label">API Key <i>仅本机</i></span><input type="password" autoComplete="off" value={api.apiKey} onChange={(event) => setApi((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…" /></label>
                <label className="field field-wide range-field"><span className="field-label">创造性 <b>{api.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={api.temperature} onChange={(event) => setApi((current) => ({ ...current, temperature: Number(event.target.value) }))} /></label>
              </div>
              <div className="api-notice"><span>i</span><p><b>安全提示</b>请只在自己的设备上保存密钥。使用共享设备时，完成后点击“清除密钥”。</p></div>
              <div className="inline-actions api-actions">
                {api.provider === "custom" && <button className="secondary-button" onClick={() => saveCurrentApi(false)}>{api.id ? "保存当前修改" : "保存为新预设"}</button>}
                {api.provider === "custom" && api.id && <button className="quiet-button" onClick={() => saveCurrentApi(true)}>另存为新预设</button>}
                <button className="primary-button compact" onClick={testApi} disabled={busy !== null}>{busy === "test" ? "测试中…" : "测试连接"}<span>→</span></button>
                <button className="text-button danger" onClick={clearCurrentApiKey}>清除密钥</button>
              </div>
            </section>

            <section className="api-help">
              <div><span>01</span><b>添加 API 站点</b><p>选择“兼容接口”，填写站点的 /v1 地址和 API Key。</p></div>
              <div><span>02</span><b>拉取并选择模型</b><p>点击“拉取模型”，也可在站点不支持列表接口时手动输入模型 ID。</p></div>
              <div><span>03</span><b>保存多个预设</b><p>保存后可在不同 API 站点之间切换，用于角色卡和世界书生成。</p></div>
            </section>
          </div>
        )}

        {revisionPreview && (
          <div className="revision-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRevisionPreview(null); }}>
            <section className="revision-preview" role="dialog" aria-modal="true" aria-labelledby="revision-preview-title">
              <div className="revision-preview-heading">
                <div><span>AI REVISION PREVIEW</span><h2 id="revision-preview-title">应用{revisionPreview.label}修改前，先核对内容。</h2></div>
                <button aria-label="关闭修改预览" onClick={() => setRevisionPreview(null)}>×</button>
              </div>
              <div className="revision-compare">
                <article><span>当前版本</span><pre>{revisionPreview.before || "（空）"}</pre></article>
                <article className="new"><span>AI 新版本</span><pre>{revisionPreview.after || "（空）"}</pre></article>
              </div>
              <div className="revision-preview-actions">
                <button className="quiet-button" onClick={() => setRevisionPreview(null)}>保留原文</button>
                <button className="secondary-button" onClick={() => setRevisionPreview(null)}>继续调整建议</button>
                <button className="primary-button compact" onClick={applyRevisionPreview}>应用新版本 <span>→</span></button>
              </div>
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
