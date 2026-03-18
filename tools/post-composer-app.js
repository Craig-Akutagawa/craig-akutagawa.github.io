const STORAGE_DB = "post-composer-db";
const STORAGE_STORE = "handles";
const STORAGE_KEY = "repo-root";
const DRAFT_STORAGE_KEY = "post-composer-draft-v2";

const titleInput = document.querySelector("#title");
const langInput = document.querySelector("#lang");
const publishInput = document.querySelector("#publishAt");
const slugInput = document.querySelector("#slug");
const slugHelp = document.querySelector("#slug-help");
const excerptInput = document.querySelector("#excerpt");
const tagsInput = document.querySelector("#tags-input");
const addTagButton = document.querySelector("#add-tag");
const postSearchInput = document.querySelector("#post-search");
const postListEl = document.querySelector("#post-list");
const newPostButton = document.querySelector("#new-post");
const composerModeChip = document.querySelector("#composer-mode-chip");
const editingFileEl = document.querySelector("#editing-file");
const bodyInput = document.querySelector("#body");
const statusEl = document.querySelector("#status");
const fileNameEl = document.querySelector("#file-name");
const outputMetaEl = document.querySelector("#output-meta");
const previewHost = document.querySelector("#preview-host");
const previewTitle = document.querySelector("#preview-title");
const previewDate = document.querySelector("#preview-date");
const previewTags = document.querySelector("#preview-tags");
const editorStats = document.querySelector("#editor-stats");
const imagePicker = document.querySelector("#image-picker");
const connectionChip = document.querySelector("#connection-chip");
const connectionCopy = document.querySelector("#connection-copy");
const selectedTagsEl = document.querySelector("#selected-tags");
const availableTagsEl = document.querySelector("#available-tags");
const pickProjectButton = document.querySelector("#pick-project");
const forgetProjectButton = document.querySelector("#forget-project");
const saveButton = document.querySelector("#save-post");
const saveAndNewButton = document.querySelector("#save-and-new");
const downloadButton = document.querySelector("#download-post");
const insertLocalImageButton = document.querySelector("#insert-local-image");
const insertRemoteImageButton = document.querySelector("#insert-remote-image");
const toolbarButtons = document.querySelectorAll("[data-action]");

const requestedEditFile = normalizePostFileName(new URLSearchParams(window.location.search).get("edit"));

const state = {
  repoHandle: null,
  slugTouched: false,
  selectedTags: [],
  availableTags: [],
  postsIndex: [],
  supportsFsAccess: typeof window.showDirectoryPicker === "function",
  dbReady: null,
  uiReady: false,
  mode: "create",
  currentFileName: "",
  originalFileName: "",
  originalAssetSlug: "",
  dirtyBaseline: "",
  pendingEditFile: requestedEditFile
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function defaultDateTimeLocal() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + "T" + [pad(now.getHours()), pad(now.getMinutes())].join(":");
}

function formatOffset(date) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(totalMinutes);
  return sign + pad(Math.floor(absMinutes / 60)) + pad(absMinutes % 60);
}

function frontMatterDate(dateTimeValue) {
  const date = dateTimeValue ? new Date(dateTimeValue) : new Date();
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [pad(date.getHours()), pad(date.getMinutes()), "00"].join(":") + " " + formatOffset(date);
}

function formatPreviewDate(dateTimeValue, lang) {
  const value = dateTimeValue ? new Date(dateTimeValue) : new Date();
  const locale = lang === "zh-Hant" ? "zh-TW" : lang === "zh-Hans" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(value);
}

function formatListDate(post) {
  if (post.publishAt) {
    return formatPreviewDate(post.publishAt, post.lang || "en-US");
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(post.lastModified));
}

function slugFromTitle(title) {
  const normalized = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  const date = publishInput.value ? new Date(publishInput.value) : new Date();
  return "post-" + [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");
}

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_>#~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt() {
  const manual = excerptInput.value.trim();
  if (manual) {
    return manual;
  }

  const raw = plainText(bodyInput.value);
  if (!raw) {
    return "";
  }

  return raw.length > 88 ? raw.slice(0, 88).trim() + "..." : raw;
}

function yamlString(value) {
  return "\"" + value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
}

function normalizeTag(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseTagTokens(raw) {
  return raw
    .split(",")
    .map((token) => normalizeTag(token))
    .filter(Boolean);
}

function normalizePostFileName(value) {
  if (!value) {
    return "";
  }

  const candidate = String(value).trim().split(/[\\/]/).pop();
  return /^[A-Za-z0-9._-]+\.md$/.test(candidate) ? candidate : "";
}

function assetSlugFromFileName(fileName) {
  const normalized = normalizePostFileName(fileName);
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  return safeSlug(match ? match[1] : normalized.replace(/\.md$/, ""));
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  return trimmed;
}

function splitFrontMatter(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontMatter: "", body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { frontMatter: "", body: normalized };
  }

  const frontMatter = normalized.slice(4, endIndex);
  let body = normalized.slice(endIndex + 5);
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return { frontMatter, body };
}

function inputValueFromFrontMatterDate(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? match[1] + "T" + match[2] : "";
}

function parseFrontMatterBlock(frontMatter) {
  const fields = {};
  const lines = frontMatter.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2];

    if (key === "tags") {
      const tags = [];
      const inline = rawValue.trim();

      if (inline.startsWith("[") && inline.endsWith("]")) {
        inline
          .slice(1, -1)
          .split(",")
          .map((item) => normalizeTag(parseYamlScalar(item)))
          .filter(Boolean)
          .forEach((tag) => tags.push(tag));
      } else {
        for (let child = index + 1; child < lines.length; child += 1) {
          const tagLine = lines[child];
          if (!/^\s*-\s+/.test(tagLine)) {
            break;
          }
          const value = normalizeTag(parseYamlScalar(tagLine.replace(/^\s*-\s+/, "")));
          if (value) {
            tags.push(value);
          }
        }
      }

      fields.tags = tags;
      continue;
    }

    fields[key] = parseYamlScalar(rawValue);
  }

  return fields;
}

function parsePostDocument(fileName, source, lastModified) {
  const parts = splitFrontMatter(source);
  const fields = parseFrontMatterBlock(parts.frontMatter);
  return {
    fileName,
    title: fields.title || fileName.replace(/\.md$/, ""),
    excerpt: fields.excerpt || "",
    lang: fields.lang || "en-US",
    publishAt: inputValueFromFrontMatterDate(fields.date) || "",
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    body: parts.body,
    lastModified,
    assetSlug: assetSlugFromFileName(fileName)
  };
}

function hasTag(tag) {
  return state.selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
}

function addTag(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized || hasTag(normalized)) {
    return false;
  }

  state.selectedTags.push(normalized);
  renderTags();
  renderPreview();
  return true;
}

function removeTag(tag) {
  state.selectedTags = state.selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
  renderTags();
  renderPreview();
}

function collectPendingTags() {
  const pending = parseTagTokens(tagsInput.value);
  if (!pending.length) {
    return;
  }

  pending.forEach(addTag);
  tagsInput.value = "";
  renderTags();
  renderPreview();
}

function renderSelectedTags() {
  if (!state.selectedTags.length) {
    selectedTagsEl.innerHTML = "<span class=\"tag-empty\">还没有标签</span>";
    return;
  }

  selectedTagsEl.innerHTML = state.selectedTags.map((tag) => (
    "<button class=\"tag-pill selected\" type=\"button\" data-remove-tag=\"" + escapeHtml(tag) + "\">" +
      "<span>" + escapeHtml(tag) + "</span>" +
      "<span class=\"tag-pill-remove\" aria-hidden=\"true\">×</span>" +
    "</button>"
  )).join("");
}

function renderAvailableTags() {
  const filter = normalizeTag(tagsInput.value).toLowerCase();
  const available = state.availableTags
    .filter((tag) => !hasTag(tag))
    .filter((tag) => !filter || tag.toLowerCase().includes(filter));

  if (!available.length) {
    availableTagsEl.innerHTML = "<span class=\"tag-empty\">没有可复用的标签</span>";
    return;
  }

  availableTagsEl.innerHTML = available.map((tag) => (
    "<button class=\"tag-pill suggestion\" type=\"button\" data-add-tag=\"" + escapeHtml(tag) + "\">" +
      escapeHtml(tag) +
    "</button>"
  )).join("");
}

function renderPreviewTags() {
  if (!state.selectedTags.length) {
    previewTags.innerHTML = "";
    previewTags.hidden = true;
    return;
  }

  previewTags.hidden = false;
  previewTags.innerHTML = state.selectedTags.map((tag) => (
    "<span class=\"preview-tag\">" + escapeHtml(tag) + "</span>"
  )).join("");
}

function renderTags() {
  renderSelectedTags();
  renderAvailableTags();
  renderPreviewTags();
  persistDraft();
}

function getCurrentSlug() {
  if (state.mode === "edit" && state.originalAssetSlug) {
    return state.originalAssetSlug;
  }

  return safeSlug(slugInput.value.trim()) || slugFromTitle(titleInput.value.trim());
}

function buildFileName() {
  if (state.mode === "edit" && state.originalFileName) {
    return state.originalFileName;
  }

  const sourceDate = publishInput.value ? new Date(publishInput.value) : new Date();
  const datePart = [
    sourceDate.getFullYear(),
    pad(sourceDate.getMonth() + 1),
    pad(sourceDate.getDate())
  ].join("-");
  return datePart + "-" + getCurrentSlug() + ".md";
}

function buildMarkdown() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const excerpt = buildExcerpt();
  const lines = [
    "---",
    "layout: post",
    "title: " + yamlString(title || "Untitled Post"),
    "date: " + frontMatterDate(publishInput.value)
  ];

  if (excerpt) {
    lines.push("excerpt: " + yamlString(excerpt));
  }

  lines.push("lang: " + langInput.value);
  if (state.selectedTags.length) {
    lines.push("tags:");
    state.selectedTags.forEach((tag) => {
      lines.push("  - " + yamlString(tag));
    });
  }
  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n") + "\n";
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status-text" + (kind ? " " + kind : "");
}

function setConnectionState(mode, text, detail) {
  connectionChip.textContent = text;
  connectionChip.className = "status-chip" + (mode ? " " + mode : "");
  connectionCopy.textContent = detail;
}

function updateEditorStats() {
  const value = bodyInput.value;
  const lineCount = value ? value.split("\n").length : 0;
  editorStats.textContent = value.length + " 字符 | " + lineCount + " 行";
}

function syncSlugFromTitle() {
  if (state.mode === "create" && !state.slugTouched) {
    slugInput.value = getCurrentSlug();
  }
}

function wrapSelection(before, after, placeholder) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const value = bodyInput.value;
  const selected = value.slice(start, end);
  const content = selected || placeholder;
  bodyInput.value = value.slice(0, start) + before + content + after + value.slice(end);
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + content.length;
  bodyInput.focus();
  bodyInput.setSelectionRange(cursorStart, cursorEnd);
  renderPreview();
}

function insertAtSelection(snippet, selectStartOffset = 0, selectEndOffset = 0) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const value = bodyInput.value;
  bodyInput.value = value.slice(0, start) + snippet + value.slice(end);
  bodyInput.focus();
  bodyInput.setSelectionRange(start + selectStartOffset, start + snippet.length - selectEndOffset);
  renderPreview();
}

function prefixSelectedLines(prefixFactory) {
  const value = bodyInput.value;
  const selectionStart = bodyInput.selectionStart;
  const selectionEnd = bodyInput.selectionEnd;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const replacement = block
    .split("\n")
    .map((line, index) => prefixFactory(index) + line)
    .join("\n");
  bodyInput.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
  bodyInput.focus();
  bodyInput.setSelectionRange(lineStart, lineStart + replacement.length);
  renderPreview();
}

function handleToolbarAction(action) {
  switch (action) {
    case "h1":
      return prefixSelectedLines(() => "# ");
    case "h2":
      return prefixSelectedLines(() => "## ");
    case "h3":
      return prefixSelectedLines(() => "### ");
    case "bold":
      return wrapSelection("**", "**", "粗体文字");
    case "italic":
      return wrapSelection("*", "*", "斜体文字");
    case "link":
      return wrapSelection("[", "](https://example.com)", "链接文字");
    case "inline-code":
      return wrapSelection("`", "`", "code");
    case "quote":
      return prefixSelectedLines(() => "> ");
    case "ul":
      return prefixSelectedLines(() => "- ");
    case "ol":
      return prefixSelectedLines((index) => (index + 1) + ". ");
    case "task":
      return prefixSelectedLines(() => "- [ ] ");
    case "code-block":
      return insertAtSelection("```txt\n代码内容\n```\n", 7, 4);
    case "hr":
      return insertAtSelection("\n---\n");
    default:
      return null;
  }
}

function captureEditorSnapshot() {
  return {
    title: titleInput.value,
    lang: langInput.value,
    publishAt: publishInput.value,
    slug: slugInput.value,
    excerpt: excerptInput.value,
    body: bodyInput.value,
    tags: state.selectedTags.slice(),
    pendingTagInput: tagsInput.value
  };
}

function setDirtyBaseline(snapshot) {
  state.dirtyBaseline = JSON.stringify(snapshot || captureEditorSnapshot());
}

function isDirty() {
  return JSON.stringify(captureEditorSnapshot()) !== state.dirtyBaseline;
}

function emptySnapshot() {
  return {
    title: "",
    lang: "zh-Hans",
    publishAt: defaultDateTimeLocal(),
    slug: "",
    excerpt: "",
    body: "",
    tags: [],
    pendingTagInput: ""
  };
}

function snapshotFromPost(post) {
  return {
    title: post.title || "",
    lang: post.lang || "en-US",
    publishAt: post.publishAt || defaultDateTimeLocal(),
    slug: post.assetSlug || "",
    excerpt: post.excerpt || "",
    body: post.body || "",
    tags: Array.isArray(post.tags) ? post.tags.slice() : [],
    pendingTagInput: ""
  };
}

function applySnapshot(snapshot) {
  titleInput.value = snapshot.title || "";
  langInput.value = snapshot.lang || "zh-Hans";
  publishInput.value = snapshot.publishAt || defaultDateTimeLocal();
  slugInput.value = safeSlug(snapshot.slug || "");
  excerptInput.value = snapshot.excerpt || "";
  bodyInput.value = snapshot.body || "";
  tagsInput.value = snapshot.pendingTagInput || "";
  state.selectedTags = Array.isArray(snapshot.tags)
    ? snapshot.tags
      .map((tag) => normalizeTag(String(tag)))
      .filter(Boolean)
      .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
    : [];
  state.slugTouched = slugInput.value.trim().length > 0;
}

function readDraftStore() {
  if (!("localStorage" in window)) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return {};
  }
}

function writeDraftStore(store) {
  if (!("localStorage" in window)) {
    return;
  }

  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
}

function draftKeyFor(fileName) {
  return fileName ? "edit:" + fileName : "create";
}

function currentDraftKey() {
  return state.mode === "edit" && state.originalFileName ? draftKeyFor(state.originalFileName) : "create";
}

function hasSnapshotContent(snapshot) {
  return Boolean(
    snapshot.title.trim() ||
    snapshot.slug.trim() ||
    snapshot.excerpt.trim() ||
    snapshot.body.trim() ||
    snapshot.tags.length ||
    snapshot.pendingTagInput.trim()
  );
}

function loadDraftByKey(key) {
  const store = readDraftStore();
  if (!store[key]) {
    return null;
  }

  try {
    const snapshot = JSON.parse(JSON.stringify(store[key]));
    return {
      title: typeof snapshot.title === "string" ? snapshot.title : "",
      lang: typeof snapshot.lang === "string" ? snapshot.lang : "zh-Hans",
      publishAt: typeof snapshot.publishAt === "string" && snapshot.publishAt ? snapshot.publishAt : defaultDateTimeLocal(),
      slug: typeof snapshot.slug === "string" ? snapshot.slug : "",
      excerpt: typeof snapshot.excerpt === "string" ? snapshot.excerpt : "",
      body: typeof snapshot.body === "string" ? snapshot.body : "",
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
      pendingTagInput: typeof snapshot.pendingTagInput === "string" ? snapshot.pendingTagInput : ""
    };
  } catch (error) {
    return null;
  }
}

function clearDraftByKey(key) {
  const store = readDraftStore();
  if (!(key in store)) {
    return;
  }

  delete store[key];
  writeDraftStore(store);
}

function clearCurrentDraft() {
  clearDraftByKey(currentDraftKey());
}

function persistDraft() {
  if (!state.uiReady || !("localStorage" in window)) {
    return;
  }

  const snapshot = captureEditorSnapshot();
  const store = readDraftStore();
  const key = currentDraftKey();

  if (!hasSnapshotContent(snapshot)) {
    if (key in store) {
      delete store[key];
      writeDraftStore(store);
    }
    return;
  }

  store[key] = snapshot;
  writeDraftStore(store);
}

function setComposerUrl(fileName) {
  const url = new URL(window.location.href);
  if (fileName) {
    url.searchParams.set("edit", fileName);
  } else {
    url.searchParams.delete("edit");
  }
  window.history.replaceState({}, "", url.toString());
}

function renderComposerMode() {
  const editing = state.mode === "edit";
  composerModeChip.textContent = editing ? "编辑模式" : "新建模式";
  newPostButton.hidden = !editing;
  editingFileEl.hidden = !editing;
  if (editing) {
    editingFileEl.textContent = "当前文件：" + state.originalFileName;
  }

  slugInput.disabled = editing;
  slugHelp.textContent = editing
    ? "编辑模式会保留原文件名与图片目录；slug 仅作为当前文件标识显示。"
    : "建议使用英文、数字和连字符。留空时会自动生成安全 slug。";
  saveButton.textContent = editing ? "保存修改" : "保存文章";
  saveAndNewButton.textContent = editing ? "保存并新建文章" : "保存并继续写下一篇";
}

function renderPostList() {
  if (!state.repoHandle) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">连接项目目录后，这里会显示最近修改的贴文。</div>";
    return;
  }

  if (!state.postsIndex.length) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">当前项目里还没有可编辑的贴文。</div>";
    return;
  }

  const keyword = postSearchInput.value.trim().toLowerCase();
  const filtered = state.postsIndex.filter((post) => {
    if (!keyword) {
      return true;
    }

    const haystack = [
      post.title,
      post.fileName,
      post.excerpt,
      post.tags.join(" ")
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });

  if (!filtered.length) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">没有匹配的贴文。试试标题、文件名或标签。</div>";
    return;
  }

  postListEl.innerHTML = filtered.map((post) => (
    "<button class=\"post-library-item" + (state.mode === "edit" && state.originalFileName === post.fileName ? " active" : "") + "\" type=\"button\" data-open-post=\"" + escapeHtml(post.fileName) + "\">" +
      "<span class=\"post-library-item-title\">" + escapeHtml(post.title) + "</span>" +
      "<span class=\"post-library-item-meta\">" + escapeHtml(formatListDate(post)) + " | " + escapeHtml(post.fileName) + "</span>" +
      (post.tags.length
        ? "<span class=\"post-library-item-tags\">" + post.tags.map((tag) => (
          "<span class=\"tag-pill suggestion\">" + escapeHtml(tag) + "</span>"
        )).join("") + "</span>"
        : "") +
    "</button>"
  )).join("");
}

function renderPreview() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  syncSlugFromTitle();
  updateEditorStats();

  if (!title && !body) {
    fileNameEl.textContent = state.mode === "edit" && state.originalFileName ? state.originalFileName : "未生成文件名";
    outputMetaEl.textContent = "语言与发布时间会显示在这里";
    previewDate.textContent = "POST";
    previewTitle.textContent = "在左边输入标题和正文";
    previewHost.innerHTML = "<p class=\"preview-empty\">这里会渲染接近博客文章页的预览，包括标题、段落、列表、代码块和图片。</p>";
    renderPreviewTags();
    persistDraft();
    return;
  }

  fileNameEl.textContent = buildFileName();
  outputMetaEl.textContent = (state.mode === "edit" ? "模式：编辑 | " : "模式：新建 | ") + "语言：" + langInput.value + " | 标签：" + state.selectedTags.length + " | 摘要：" + (buildExcerpt() || "自动留空");
  previewDate.textContent = formatPreviewDate(publishInput.value, langInput.value);
  previewTitle.textContent = title || "Untitled Post";
  previewHost.innerHTML = body ? renderMarkdown(body) : "<p class=\"preview-empty\">正文为空。</p>";
  renderPreviewTags();
  persistDraft();
}

function confirmDiscardChanges(message) {
  if (!isDirty()) {
    return true;
  }

  return window.confirm(message);
}

function enterCreateMode(options = {}) {
  const snapshot = options.snapshot || emptySnapshot();
  state.mode = "create";
  state.currentFileName = "";
  state.originalFileName = "";
  state.originalAssetSlug = "";
  applySnapshot(snapshot);
  renderComposerMode();
  renderTags();
  renderPostList();
  renderPreview();
  setComposerUrl("");
  setDirtyBaseline(options.baseline || emptySnapshot());
  if (options.focus !== false) {
    bodyInput.focus();
  }
}

async function openPostForEditing(fileName, options = {}) {
  const normalizedFileName = normalizePostFileName(fileName);
  if (!normalizedFileName) {
    setStatus("目标贴文文件名无效。", "error");
    return false;
  }

  if (!options.skipDirtyCheck && !confirmDiscardChanges("当前编辑区有未保存修改，确定切换到另一篇贴文吗？")) {
    return false;
  }

  if (!state.repoHandle || !await repoHasPostsDirectory(state.repoHandle)) {
    state.pendingEditFile = normalizedFileName;
    setStatus("连接项目目录后会自动打开 " + normalizedFileName + "。", "warn");
    return false;
  }

  try {
    const postsDir = await getPostsDirectory();
    const fileHandle = await postsDir.getFileHandle(normalizedFileName);
    const file = await fileHandle.getFile();
    const parsed = parsePostDocument(normalizedFileName, await file.text(), file.lastModified);
    const baseSnapshot = snapshotFromPost(parsed);
    const draftSnapshot = loadDraftByKey(draftKeyFor(normalizedFileName));

    state.mode = "edit";
    state.currentFileName = normalizedFileName;
    state.originalFileName = normalizedFileName;
    state.originalAssetSlug = parsed.assetSlug;
    applySnapshot(draftSnapshot || baseSnapshot);
    slugInput.value = parsed.assetSlug;
    tagsInput.value = draftSnapshot ? draftSnapshot.pendingTagInput : "";
    renderComposerMode();
    renderTags();
    renderPostList();
    renderPreview();
    setComposerUrl(normalizedFileName);
    setDirtyBaseline(baseSnapshot);
    bodyInput.focus();
    setStatus(draftSnapshot
      ? "已打开 " + normalizedFileName + "，并恢复了这篇贴文的未保存草稿。"
      : "已载入 " + normalizedFileName + "，后续保存会覆盖原文件。", "success");
    return true;
  } catch (error) {
    state.pendingEditFile = "";
    setStatus("打开贴文失败：" + normalizedFileName + " 不存在，或当前目录不是正确的项目根目录。", "error");
    return false;
  }
}

async function maybeOpenPendingEditFile() {
  if (!state.pendingEditFile) {
    return;
  }

  const target = state.pendingEditFile;
  state.pendingEditFile = "";
  await openPostForEditing(target, { skipDirtyCheck: true });
}

function ensureFsSupport() {
  if (state.supportsFsAccess) {
    return true;
  }

  setStatus("当前浏览器不支持直接写入项目目录，仍然可以用“下载 Markdown”导出文章。建议用 Edge 或 Chrome 打开。", "warn");
  setConnectionState("offline", "浏览器不支持目录写入", "当前环境无法直接连接项目目录，图片自动导入也会禁用。");
  return false;
}

function openHandleDb() {
  if (!("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  if (state.dbReady) {
    return state.dbReady;
  }

  state.dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return state.dbReady;
}

async function persistRepoHandle(handle) {
  const db = await openHandleDb();
  if (!db) {
    return;
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, "readwrite");
    tx.objectStore(STORAGE_STORE).put(handle, STORAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPersistedHandle() {
  const db = await openHandleDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, "readonly");
    const request = tx.objectStore(STORAGE_STORE).get(STORAGE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function clearPersistedHandle() {
  const db = await openHandleDb();
  if (!db) {
    return;
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, "readwrite");
    tx.objectStore(STORAGE_STORE).delete(STORAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function repoHasPostsDirectory(handle) {
  try {
    await handle.getDirectoryHandle("_posts");
    return true;
  } catch (error) {
    return false;
  }
}

async function readTextFile(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

async function loadPostsIndex() {
  if (!state.repoHandle || !await repoHasPostsDirectory(state.repoHandle)) {
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
    return;
  }

  try {
    const postsDir = await getPostsDirectory();
    const posts = [];
    const tags = new Map();

    for await (const entry of postsDir.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".md")) {
        continue;
      }

      const file = await entry.getFile();
      const parsed = parsePostDocument(entry.name, await file.text(), file.lastModified);
      posts.push(parsed);
      parsed.tags.forEach((tag) => {
        const key = tag.toLowerCase();
        if (!tags.has(key)) {
          tags.set(key, tag);
        }
      });
    }

    posts.sort((left, right) => right.lastModified - left.lastModified || left.fileName.localeCompare(right.fileName, "en"));
    state.postsIndex = posts;
    state.availableTags = Array.from(tags.values()).sort((left, right) => left.localeCompare(right, "en"));
    renderPostList();
    renderTags();
  } catch (error) {
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
    setStatus("读取贴文列表失败：" + error.message, "warn");
  }
}

async function updateConnectionUi() {
  if (!state.repoHandle) {
    setConnectionState("offline", "未连接项目目录", "第一次使用时，选择整个项目根目录。之后就能同时保存文章和图片。");
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
    return;
  }

  const hasPosts = await repoHasPostsDirectory(state.repoHandle);
  if (hasPosts) {
    setConnectionState("", "项目目录已连接", "已连接到 " + state.repoHandle.name + "，可以写入 _posts 和 assets/posts。");
    await loadPostsIndex();
    await maybeOpenPendingEditFile();
  } else {
    setConnectionState("warn", "目录不完整", "已选中 " + state.repoHandle.name + "，但里面找不到 _posts，保存时会被阻止。");
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
  }
}

async function restoreProjectHandle() {
  if (!ensureFsSupport()) {
    return;
  }

  try {
    const handle = await loadPersistedHandle();
    if (!handle) {
      return;
    }

    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted" || permission === "prompt") {
      state.repoHandle = handle;
      await updateConnectionUi();
      if (state.mode !== "edit") {
        setStatus(permission === "granted"
          ? "已恢复上次连接的项目目录。"
          : "已找到上次使用的项目目录；保存时可能会再次询问权限。", permission === "granted" ? "success" : "");
      }
    }
  } catch (error) {
    setStatus("恢复最近使用目录失败：" + error.message, "warn");
  }
}

async function pickProjectRoot() {
  if (!ensureFsSupport()) {
    return;
  }

  try {
    const pendingTarget = state.pendingEditFile;
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.repoHandle = handle;
    await persistRepoHandle(handle);
    await updateConnectionUi();
    if (!(pendingTarget && state.mode === "edit")) {
      setStatus(await repoHasPostsDirectory(handle)
        ? "已连接到项目目录：" + handle.name + "。后面保存文章和图片会直接写入仓库。"
        : "已选中目录：" + handle.name + "，但里面没有 _posts。请重新选择博客项目根目录。", await repoHasPostsDirectory(handle) ? "success" : "warn");
    }
  } catch (error) {
    if (error && error.name !== "AbortError") {
      setStatus("选择项目目录失败：" + error.message, "warn");
    }
  }
}

async function forgetProjectRoot() {
  state.repoHandle = null;
  await clearPersistedHandle();
  await updateConnectionUi();
  setStatus("已断开当前目录连接。之后仍然可以下载 Markdown 文件。", "");
}

async function ensureRepoPermission() {
  if (!state.repoHandle) {
    await pickProjectRoot();
    if (!state.repoHandle) {
      return false;
    }
  }

  const permission = await state.repoHandle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    setStatus("浏览器没有拿到写入权限，所以目前只能下载 Markdown。", "warn");
    return false;
  }

  if (!await repoHasPostsDirectory(state.repoHandle)) {
    setStatus("当前选中的目录不是博客项目根目录，因为里面找不到 _posts。", "error");
    return false;
  }

  return true;
}

async function getPostsDirectory() {
  return state.repoHandle.getDirectoryHandle("_posts");
}

async function getPostAssetsDirectory() {
  const assetsDir = await state.repoHandle.getDirectoryHandle("assets", { create: true });
  const postsDir = await assetsDir.getDirectoryHandle("posts", { create: true });
  return postsDir.getDirectoryHandle(getCurrentSlug(), { create: true });
}

function safeFileStem(name) {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "image";
}

function sanitizeImageName(fileName) {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? "." + parts.pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = safeFileStem(parts.join("."));
  return stem + (extension || ".png");
}

async function fileExists(directoryHandle, name) {
  try {
    await directoryHandle.getFileHandle(name);
    return true;
  } catch (error) {
    return false;
  }
}

async function resolveImageFileName(directoryHandle, originalName) {
  const safeName = sanitizeImageName(originalName);
  if (!await fileExists(directoryHandle, safeName)) {
    return safeName;
  }

  if (window.confirm(safeName + " 已存在。点击“确定”覆盖，点击“取消”自动改名保存。")) {
    return safeName;
  }

  const dotIndex = safeName.lastIndexOf(".");
  const base = dotIndex === -1 ? safeName : safeName.slice(0, dotIndex);
  const ext = dotIndex === -1 ? "" : safeName.slice(dotIndex);
  let index = 2;
  while (await fileExists(directoryHandle, base + "-" + index + ext)) {
    index += 1;
  }
  return base + "-" + index + ext;
}

function insertImagesMarkdown(entries) {
  const lines = entries.map((entry) => "![" + entry.alt + "](" + entry.webPath + ")");
  insertAtSelection("\n" + lines.join("\n\n") + "\n");
}

function handleLocalImageInsert() {
  if (!ensureFsSupport()) {
    return;
  }
  imagePicker.click();
}

function insertRemoteImageTemplate() {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const value = bodyInput.value;
  const selected = value.slice(start, end).trim();
  const altText = selected || "网络图片";
  const urlPlaceholder = "https://example.com/image.png";
  const snippet = "![" + altText + "](" + urlPlaceholder + ")";
  const urlStartOffset = snippet.indexOf(urlPlaceholder);

  bodyInput.value = value.slice(0, start) + snippet + value.slice(end);
  bodyInput.focus();
  bodyInput.setSelectionRange(start + urlStartOffset, start + urlStartOffset + urlPlaceholder.length);
  renderPreview();
  setStatus("已插入网络图片模板，直接粘贴图片链接即可。", "success");
}

async function importImages(files) {
  if (!files.length) {
    return;
  }

  if (!titleInput.value.trim()) {
    setStatus("插图前先填标题，这样图片会落到更合理的文章目录里。", "warn");
    return;
  }

  if (!await ensureRepoPermission()) {
    return;
  }

  try {
    if (state.mode === "create" && !state.slugTouched) {
      slugInput.value = getCurrentSlug();
      state.slugTouched = true;
    }
    const imageDir = await getPostAssetsDirectory();
    const inserted = [];

    for (const file of files) {
      const finalName = await resolveImageFileName(imageDir, file.name);
      const fileHandle = await imageDir.getFileHandle(finalName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      inserted.push({
        alt: safeFileStem(finalName.replace(/\.[^.]+$/, "")).replace(/-/g, " "),
        webPath: "/assets/posts/" + getCurrentSlug() + "/" + finalName
      });
    }

    insertImagesMarkdown(inserted);
    setStatus("已导入 " + inserted.length + " 张图片，并自动插入正文。", "success");
  } catch (error) {
    setStatus("导入图片失败：" + error.message, "error");
  } finally {
    imagePicker.value = "";
  }
}

async function saveToPosts(resetAfterSave) {
  collectPendingTags();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return false;
  }

  if (state.mode === "edit" && !isDirty()) {
    setStatus("当前贴文没有新的改动。", "");
    return true;
  }

  if (!await ensureRepoPermission()) {
    return false;
  }

  try {
    const postsDir = await getPostsDirectory();
    const fileName = buildFileName();

    if (state.mode === "create" && await fileExists(postsDir, fileName) && !window.confirm(fileName + " 已存在，是否覆盖？")) {
      return false;
    }

    const fileHandle = await postsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buildMarkdown());
    await writable.close();
    clearCurrentDraft();
    await loadPostsIndex();

    if (resetAfterSave) {
      enterCreateMode({ snapshot: emptySnapshot(), baseline: emptySnapshot() });
      setStatus("已保存 " + fileName + "，编辑器已准备好下一篇新文章。", "success");
      return true;
    }

    setDirtyBaseline(captureEditorSnapshot());
    renderPostList();
    renderPreview();
    setStatus(state.mode === "edit"
      ? "已保存修改到 " + fileName + "。"
      : "已保存到 " + fileName + "。刷新博客后就能看到新文章。", "success");
    return true;
  } catch (error) {
    setStatus("保存失败：" + error.message, "error");
    return false;
  }
}

function downloadMarkdown() {
  collectPendingTags();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return;
  }

  const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("已下载 Markdown 文件。没有目录写权限时，你仍然可以用这个方式保存。", "success");
}

function switchToNewPost() {
  if (!confirmDiscardChanges("当前编辑区有未保存修改，确定切换到新建模式吗？")) {
    return;
  }

  const createDraft = loadDraftByKey("create");
  enterCreateMode({
    snapshot: createDraft || emptySnapshot(),
    baseline: emptySnapshot()
  });
  setStatus(createDraft ? "已切换到新建模式，并恢复了未完成的新文章草稿。" : "已切换到新建模式。", createDraft ? "success" : "");
}

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
});

pickProjectButton.addEventListener("click", pickProjectRoot);
forgetProjectButton.addEventListener("click", forgetProjectRoot);
newPostButton.addEventListener("click", switchToNewPost);
saveButton.addEventListener("click", () => saveToPosts(false));
saveAndNewButton.addEventListener("click", () => saveToPosts(true));
downloadButton.addEventListener("click", downloadMarkdown);
insertLocalImageButton.addEventListener("click", handleLocalImageInsert);
insertRemoteImageButton.addEventListener("click", insertRemoteImageTemplate);
imagePicker.addEventListener("change", (event) => importImages(Array.from(event.target.files || [])));
addTagButton.addEventListener("click", collectPendingTags);
postSearchInput.addEventListener("input", renderPostList);

tagsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    collectPendingTags();
  }
});

tagsInput.addEventListener("input", renderTags);
tagsInput.addEventListener("blur", collectPendingTags);

selectedTagsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-tag]");
  if (!button) {
    return;
  }
  removeTag(button.dataset.removeTag);
});

availableTagsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-tag]");
  if (!button) {
    return;
  }
  addTag(button.dataset.addTag);
});

postListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-post]");
  if (!button) {
    return;
  }
  openPostForEditing(button.dataset.openPost);
});

[titleInput, langInput, publishInput, excerptInput, bodyInput].forEach((element) => {
  element.addEventListener("input", renderPreview);
});

slugInput.addEventListener("input", () => {
  if (state.mode === "edit") {
    slugInput.value = state.originalAssetSlug;
    return;
  }

  state.slugTouched = slugInput.value.trim().length > 0;
  slugInput.value = safeSlug(slugInput.value);
  renderPreview();
});

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
    return;
  }

  event.preventDefault();
  saveToPosts(event.shiftKey);
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

const createDraft = !requestedEditFile ? loadDraftByKey("create") : null;
enterCreateMode({
  snapshot: createDraft || emptySnapshot(),
  baseline: emptySnapshot(),
  focus: false
});
state.uiReady = true;
renderPostList();
renderTags();
renderPreview();

if (requestedEditFile) {
  setStatus("连接项目目录后会自动打开 " + requestedEditFile + "。", "warn");
} else if (createDraft) {
  setStatus("已恢复上次未完成的新文章草稿。", "success");
}

updateConnectionUi();
restoreProjectHandle();
