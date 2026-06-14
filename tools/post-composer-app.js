const DRAFT_STORAGE_KEY = "post-composer-draft-v2";
const LIBRARY_EXPANDED_STORAGE_KEY = "post-composer-library-expanded";

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
const composerLayout = document.querySelector("#composer-layout");
const toggleLibraryButton = document.querySelector("#toggle-library");
const libraryToggleLabel = document.querySelector("#library-toggle-label");
const libraryCurrentMeta = document.querySelector("#library-current-meta");
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
const saveButton = document.querySelector("#save-post");
const saveAndNewButton = document.querySelector("#save-and-new");
const publishButton = document.querySelector("#publish-post");
const downloadButton = document.querySelector("#download-post");
const insertLocalImageButton = document.querySelector("#insert-local-image");
const insertRemoteImageButton = document.querySelector("#insert-remote-image");
const toolbarButtons = document.querySelectorAll("[data-action]");

const requestedEditFile = normalizePostFileName(new URLSearchParams(window.location.search).get("edit"));

const state = {
  serviceReady: false,
  repositoryName: "",
  requestToken: "",
  slugTouched: false,
  selectedTags: [],
  availableTags: [],
  hiddenPosts: new Set(),
  postsIndex: [],
  uiReady: false,
  libraryExpanded: false,
  mode: "create",
  currentFileName: "",
  originalFileName: "",
  originalAssetSlug: "",
  lastSavedContext: null,
  publishing: false,
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
  }).format(new Date(post.sortTimestamp || post.lastModified));
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
  const timePart = [
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 5).padEnd(3, "0");
  return timePart + "-" + randomPart;
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

function parseCanonicalTimestamp(rawDate, fileName, lastModified) {
  const normalizedDate = String(rawDate || "").trim();
  if (normalizedDate) {
    const jsDate = normalizedDate
      .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s+([+-]\d{2})(\d{2}))?$/, (_, date, time, hourOffset, minuteOffset) => (
        date + "T" + time + (hourOffset ? hourOffset + ":" + minuteOffset : "")
      ));
    const parsed = Date.parse(jsDate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const fileMatch = normalizePostFileName(fileName).match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (fileMatch) {
    const parsed = new Date(Number(fileMatch[1]), Number(fileMatch[2]) - 1, Number(fileMatch[3])).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return lastModified;
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
    sortTimestamp: parseCanonicalTimestamp(fields.date, fileName, lastModified),
    assetSlug: assetSlugFromFileName(fileName)
  };
}

function isPostHiddenLocally(fileName) {
  return state.hiddenPosts.has(normalizePostFileName(fileName));
}

function hasTag(tag) {
  return state.selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
}

function addTag(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized || hasTag(normalized)) {
    return false;
  }

  setPublishAvailability(null);
  state.selectedTags.push(normalized);
  renderTags();
  renderPreview();
  return true;
}

function removeTag(tag) {
  setPublishAvailability(null);
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

function toggleTag(tag) {
  setPublishAvailability(null);
  if (hasTag(tag)) {
    state.selectedTags = state.selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
  } else {
    state.selectedTags.push(tag);
  }
  renderTags();
  renderPreview();
}

function renderSelectedTags() {
  const allTagsSet = new Set([
    ...state.availableTags,
    ...state.selectedTags
  ]);
  
  const allTags = Array.from(allTagsSet).sort((a, b) => a.localeCompare(b));
  
  if (!allTags.length) {
    selectedTagsEl.innerHTML = "<span class=\"tag-empty\">还没有任何标签</span>";
    return;
  }
  
  selectedTagsEl.innerHTML = allTags.map((tag) => {
    const isSelected = hasTag(tag);
    if (isSelected) {
      return (
        "<button class=\"tag-pill selected\" type=\"button\" data-toggle-tag=\"" + escapeHtml(tag) + "\">" +
          "<span>" + escapeHtml(tag) + "</span>" +
          "<span class=\"tag-pill-remove\" aria-hidden=\"true\">×</span>" +
        "</button>"
      );
    } else {
      return (
        "<button class=\"tag-pill suggestion\" type=\"button\" data-toggle-tag=\"" + escapeHtml(tag) + "\">" +
          "<span>" + escapeHtml(tag) + "</span>" +
        "</button>"
      );
    }
  }).join("");
}

function renderAvailableTags() {
  // Unified rendering is handled inside renderSelectedTags()
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

function setPublishAvailability(context) {
  state.lastSavedContext = context;

  if (!publishButton) {
    return;
  }

  if (!context) {
    publishButton.classList.add("hidden");
    publishButton.disabled = false;
    publishButton.textContent = "发布到网站";
    return;
  }

  publishButton.classList.remove("hidden");
  publishButton.disabled = false;
  publishButton.textContent = "发布到网站";
}

function setPublishingState(active, activeLabel = "正在发布...") {
  state.publishing = active;

  if (!publishButton) {
    return;
  }

  publishButton.disabled = active || !state.lastSavedContext;
  publishButton.textContent = active ? activeLabel : "发布到网站";
}

function setConnectionState(mode, text, detail) {
  connectionChip.textContent = text;
  connectionChip.className = "status-chip" + (mode ? " " + mode : "");
  connectionCopy.textContent = detail;
}

function disconnectLocalService(message) {
  state.serviceReady = false;
  state.requestToken = "";
  setPublishAvailability(null);
  setConnectionState("offline", "本地服务未连接", "服务会话已失效，请刷新发帖器页面重新连接。");
  setStatus(message || "本地服务会话已失效，请刷新页面重新连接。", "error");
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

function setLibraryExpanded(expanded, options = {}) {
  state.libraryExpanded = Boolean(expanded);

  if (composerLayout) {
    composerLayout.classList.toggle("library-expanded", state.libraryExpanded);
  }

  if (toggleLibraryButton) {
    const label = state.libraryExpanded ? "折叠文章库" : "展开文章库";
    toggleLibraryButton.setAttribute("aria-expanded", state.libraryExpanded ? "true" : "false");
    toggleLibraryButton.setAttribute("title", label);
    toggleLibraryButton.setAttribute("aria-label", label);
    if (libraryToggleLabel) {
      libraryToggleLabel.textContent = label;
    }
  }

  if (options.persist) {
    localStorage.setItem(LIBRARY_EXPANDED_STORAGE_KEY, state.libraryExpanded ? "true" : "false");
  }

  if (state.libraryExpanded && postSearchInput && options.focusSearch) {
    postSearchInput.focus();
  }
}

function updateLibraryCollapsedSummary() {
  if (!libraryCurrentMeta) {
    return;
  }

  if (state.mode === "edit" && state.originalFileName) {
    libraryCurrentMeta.textContent = "编辑";
    return;
  }

  libraryCurrentMeta.textContent = "新建";
}

function initializeLibraryState() {
  setLibraryExpanded(localStorage.getItem(LIBRARY_EXPANDED_STORAGE_KEY) === "true");
  updateLibraryCollapsedSummary();
}

function renderComposerMode() {
  const editing = state.mode === "edit";
  composerModeChip.textContent = editing ? "编辑模式" : "新建模式";
  if (editingFileEl) {
    editingFileEl.hidden = !editing;
    if (editing) {
      editingFileEl.textContent = "当前文件：" + state.originalFileName;
    }
  }

  slugInput.disabled = editing;
  slugHelp.textContent = editing
    ? "编辑模式会保留原文件名与图片目录；slug 仅作为当前文件标识显示。"
    : "建议使用英文、数字和连字符。留空时会自动生成安全 slug。";
  if (saveButton) {
    saveButton.textContent = editing ? "保存修改" : "保存文章";
  }
  if (saveAndNewButton) {
    saveAndNewButton.textContent = editing ? "保存并新建文章" : "保存并继续写下一篇";
  }
}

function renderPostList() {
  if (!state.serviceReady) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">正在连接本地文章库。</div>";
    return;
  }

  if (!state.postsIndex.length) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">当前项目里还没有可编辑的文章。</div>";
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
    postListEl.innerHTML = "<div class=\"post-library-empty\">没有匹配的文章。试试标题、文件名或标签。</div>";
    return;
  }

  postListEl.innerHTML = filtered.map((post) => {
    const hiddenLocally = isPostHiddenLocally(post.fileName);
    return (
    "<div class=\"post-library-item-wrapper" + (hiddenLocally ? " is-hidden-locally" : "") + "\">" +
      "<button class=\"post-library-item" + (state.mode === "edit" && state.originalFileName === post.fileName ? " active" : "") + "\" type=\"button\" data-open-post=\"" + escapeHtml(post.fileName) + "\">" +
        "<span class=\"post-library-item-title\">" + escapeHtml(post.title) + "</span>" +
        "<span class=\"post-library-item-meta\">" + escapeHtml(formatListDate(post)) + "</span>" +
        "<span class=\"post-library-local-status" + (hiddenLocally ? " is-hidden" : "") + "\">" + (hiddenLocally ? "已隐藏" : "可见") + "</span>" +
        (post.tags.length
          ? "<span class=\"post-library-item-tags\">" + post.tags.map((tag) => (
            "<span class=\"tag-pill suggestion\">" + escapeHtml(tag) + "</span>"
          )).join("") + "</span>"
          : "") +
      "</button>" +
      "<div class=\"post-library-actions\" role=\"group\" aria-label=\"文章操作\">" +
      "<button class=\"post-library-visibility-btn\" type=\"button\" data-toggle-post-visibility=\"" + escapeHtml(post.fileName) + "\" data-hidden=\"" + (hiddenLocally ? "true" : "false") + "\" title=\"" + (hiddenLocally ? "恢复并发布可见" : "隐藏并发布到网站") + "\" aria-label=\"" + (hiddenLocally ? "恢复并发布可见" : "隐藏并发布到网站") + "\">" +
        (hiddenLocally
          ? "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M12 5c5 0 9 5.5 9 7s-4 7-9 7-9-5.5-9-7 4-7 9-7zm0 2c-3.5 0-6.5 3.6-7 5 .5 1.4 3.5 5 7 5s6.5-3.6 7-5c-.5-1.4-3.5-5-7-5zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z\"/></svg>"
          : "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M2.3 4.7 3.7 3.3l17 17-1.4 1.4-3.1-3.1A10 10 0 0 1 12 19c-5 0-9-5.5-9-7 0-.8 1.1-2.6 2.8-4.2L2.3 4.7zM7.2 9.2C6 10.2 5.2 11.4 5 12c.5 1.4 3.5 5 7 5 .9 0 1.8-.2 2.6-.6l-2-2A2.5 2.5 0 0 1 9.6 11.4L7.2 9.2zM12 5c5 0 9 5.5 9 7 0 .8-.9 2.3-2.4 3.8l-2.1-2.1c.2-.5.4-1.1.4-1.7A4.8 4.8 0 0 0 12 7.1c-.6 0-1.2.1-1.7.3L8.6 5.7c1-.4 2.2-.7 3.4-.7z\"/></svg>") +
      "</button>" +
      "<button class=\"post-library-delete-btn\" type=\"button\" data-delete-post=\"" + escapeHtml(post.fileName) + "\" title=\"删除文章\" aria-label=\"删除文章\">" +
        "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\"><path fill=\"currentColor\" d=\"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z\"/></svg>" +
      "</button>" +
      "</div>" +
    "</div>"
    );
  }).join("");
}

function renderPreview() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  syncSlugFromTitle();
  updateEditorStats();
  updateLibraryCollapsedSummary();

  if (!title && !body) {
    if (fileNameEl) {
      fileNameEl.textContent = state.mode === "edit" && state.originalFileName ? state.originalFileName : "未生成文件名";
    }
    if (outputMetaEl) {
      outputMetaEl.textContent = "语言与发布时间会显示在这里";
    }
    previewDate.textContent = "POST";
    previewTitle.textContent = "在左边输入标题和正文";
    previewHost.innerHTML = "<p class=\"preview-empty\">这里会渲染接近博客文章页的预览，包括标题、段落、列表、代码块和图片。</p>";
    renderPreviewTags();
    persistDraft();
    return;
  }

  if (fileNameEl) {
    fileNameEl.textContent = buildFileName();
  }
  if (outputMetaEl) {
    outputMetaEl.textContent = (state.mode === "edit" ? "模式：编辑 | " : "模式：新建 | ") + "语言：" + langInput.value + " | 标签：" + state.selectedTags.length + " | 摘要：" + (buildExcerpt() || "自动留空");
  }
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
  setPublishAvailability(null);
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
    setStatus("目标文章文件名无效。", "error");
    return false;
  }

  if (!options.skipDirtyCheck && !confirmDiscardChanges("当前编辑区有未保存修改，确定切换到另一篇文章吗？")) {
    return false;
  }

  if (!state.serviceReady) {
    state.pendingEditFile = normalizedFileName;
    setStatus("本地文章库连接完成后会自动打开 " + normalizedFileName + "。", "warn");
    return false;
  }

  try {
    const parsed = state.postsIndex.find((post) => post.fileName === normalizedFileName);
    if (!parsed) {
      throw new Error("文章不存在");
    }
    const baseSnapshot = snapshotFromPost(parsed);
    const draftSnapshot = loadDraftByKey(draftKeyFor(normalizedFileName));

    state.mode = "edit";
    state.currentFileName = normalizedFileName;
    state.originalFileName = normalizedFileName;
    state.originalAssetSlug = parsed.assetSlug;
    setPublishAvailability(null);
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
    let hasPublishableChanges = false;
    if (!draftSnapshot) {
      const publishContext = {
        fileName: normalizedFileName,
        assetSlug: parsed.assetSlug,
        mode: "edit"
      };
      try {
        const previewRequest = await postJson("/publish/preview", publishContext);
        hasPublishableChanges = previewRequest.response.ok && previewRequest.result.status === "ready";
        setPublishAvailability(hasPublishableChanges ? publishContext : null);
      } catch (error) {
        setPublishAvailability(null);
      }
    }
    setStatus(draftSnapshot
      ? "已打开 " + normalizedFileName + "，并恢复了这篇文章的未保存草稿。"
      : hasPublishableChanges
        ? "已载入 " + normalizedFileName + "，并发现尚未发布的本地改动。"
        : "已载入 " + normalizedFileName + "，后续保存会覆盖原文件。", hasPublishableChanges ? "warn" : "success");
    setLibraryExpanded(false, { persist: true });
    return true;
  } catch (error) {
    state.pendingEditFile = "";
    setStatus("打开文章失败：" + normalizedFileName + " 不存在，或本地文章库尚未刷新。", "error");
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

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return { ok: false, message: "本地服务返回了无效响应。" };
  }
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Post-Composer-Token": state.requestToken
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (response.status === 403) {
    disconnectLocalService(result.message || "本地服务会话已失效，请刷新页面重新连接。");
    throw new Error(result.message || "本地服务会话已失效，请刷新页面重新连接。");
  }
  return { response, result };
}

async function loadPostsIndex() {
  try {
    const response = await fetch("/api/posts", {
      headers: {
        "X-Post-Composer-Token": state.requestToken
      }
    });
    const result = await readJsonResponse(response);
    if (response.status === 403) {
      disconnectLocalService(result.message || "本地服务会话已失效，请刷新页面重新连接。");
      return false;
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法读取文章列表。");
    }

    const tags = new Map();
    const posts = result.posts.map((post) => parsePostDocument(post.fileName, post.source, post.lastModified));
    posts.forEach((post) => post.tags.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!tags.has(key)) {
        tags.set(key, tag);
      }
    }));
    posts.sort((left, right) => right.sortTimestamp - left.sortTimestamp || left.fileName.localeCompare(right.fileName, "en"));
    state.postsIndex = posts;
    state.availableTags = Array.from(tags.values()).sort((left, right) => left.localeCompare(right, "en"));
    renderPostList();
    renderTags();
    return true;
  } catch (error) {
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
    setStatus("读取文章列表失败：" + error.message, "warn");
    return false;
  }
}

async function loadLocalVisibility() {
  if (!state.serviceReady) {
    state.hiddenPosts = new Set();
    return false;
  }

  try {
    const response = await fetch("/api/local-post-visibility");
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法读取本地隐藏状态。");
    }
    state.hiddenPosts = new Set(
      (Array.isArray(result.hiddenPosts) ? result.hiddenPosts : [])
        .map((fileName) => normalizePostFileName(fileName))
        .filter(Boolean)
    );
    renderPostList();
    return true;
  } catch (error) {
    state.hiddenPosts = new Set();
    renderPostList();
    setStatus("读取本地隐藏状态失败：" + error.message, "warn");
    return false;
  }
}

async function setPostLocalVisibility(fileName, hidden) {
  if (!state.serviceReady) {
    setStatus("本地服务未连接，无法发布隐藏状态。", "error");
    return;
  }

  const normalizedFileName = normalizePostFileName(fileName);
  if (!normalizedFileName) {
    return;
  }

  try {
    const request = await postJson("/api/local-post-visibility", {
      fileName: normalizedFileName,
      hidden
    });
    if (!request.response.ok || !request.result.ok) {
      throw new Error(request.result.message || "发布隐藏状态失败。");
    }
    state.hiddenPosts = new Set(
      (Array.isArray(request.result.hiddenPosts) ? request.result.hiddenPosts : [])
        .map((nextFileName) => normalizePostFileName(nextFileName))
        .filter(Boolean)
    );
    renderPostList();
    const publishStatus = request.result.publish && request.result.publish.status;
    const suffix = publishStatus === "published" ? " GitHub Pages 稍后会自动更新。" : "";
    setStatus(hidden ? "已隐藏并推送 " + normalizedFileName + "。" + suffix : "已恢复可见并推送 " + normalizedFileName + "。" + suffix, "success");
  } catch (error) {
    setStatus("发布隐藏状态失败：" + error.message, "error");
  }
}

async function connectLocalRepository() {
  try {
    const response = await fetch("/status");
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法连接本地服务。");
    }
    if (typeof result.requestToken !== "string" || !result.requestToken) {
      throw new Error("本地服务未建立安全会话。请重启发帖器。");
    }
    state.serviceReady = true;
    state.repositoryName = result.repositoryName || "当前博客";
    state.requestToken = result.requestToken;
    setConnectionState("", "本地仓库已就绪", "已连接到 " + state.repositoryName + "，文章和图片会直接保存到项目中。");
    if (!await loadPostsIndex()) {
      return;
    }
    await loadLocalVisibility();
    await maybeOpenPendingEditFile();
    if (!requestedEditFile && state.mode !== "edit") {
      setStatus("", "");
    }
  } catch (error) {
    state.serviceReady = false;
    state.requestToken = "";
    setConnectionState("offline", "本地服务未连接", "请通过 Open Post Composer 启动发帖器后再重试。");
    renderPostList();
    setStatus("无法连接本地发帖服务：" + error.message, "error");
  }
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}

function insertImagesMarkdown(entries) {
  const lines = entries.map((entry) => "![" + entry.alt + "](" + entry.webPath + ")");
  insertAtSelection("\n" + lines.join("\n\n") + "\n");
}

function handleLocalImageInsert() {
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

  setPublishAvailability(null);
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

  if (!state.serviceReady) {
    setStatus("本地服务未连接，暂时无法导入图片。", "warn");
    return;
  }

  try {
    setPublishAvailability(null);
    if (state.mode === "create" && !state.slugTouched) {
      slugInput.value = getCurrentSlug();
      state.slugTouched = true;
    }
    const inserted = [];

    for (const file of files) {
      const request = await postJson("/api/images/import", {
        assetSlug: getCurrentSlug(),
        fileName: sanitizeImageName(file.name),
        base64: await fileToBase64(file)
      });
      if (!request.response.ok || !request.result.ok) {
        throw new Error(request.result.message || "图片保存失败。");
      }
      inserted.push({
        alt: safeFileStem(request.result.fileName.replace(/\.[^.]+$/, "")).replace(/-/g, " "),
        webPath: request.result.webPath
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
  const publishContext = {
    fileName: buildFileName(),
    assetSlug: getCurrentSlug(),
    mode: state.mode
  };
  collectPendingTags();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return false;
  }

  if (state.mode === "edit" && !isDirty()) {
    setStatus("当前文章没有新的改动。", "");
    return true;
  }

  if (!state.serviceReady) {
    setStatus("本地服务未连接，无法保存文章。", "error");
    return false;
  }

  try {
    const fileName = buildFileName();
    let saveRequest = await postJson("/api/posts/save", {
      fileName,
      markdown: buildMarkdown(),
      mode: state.mode,
      overwrite: false
    });

    if (saveRequest.response.status === 409) {
      if (!window.confirm(saveRequest.result.message || (fileName + " 已存在，是否覆盖？"))) {
        return false;
      }
      saveRequest = await postJson("/api/posts/save", {
        fileName,
        markdown: buildMarkdown(),
        mode: state.mode,
        overwrite: true
      });
    }
    if (!saveRequest.response.ok || !saveRequest.result.ok) {
      throw new Error(saveRequest.result.message || "保存失败。");
    }
    clearCurrentDraft();
    await loadPostsIndex();

    if (resetAfterSave) {
      enterCreateMode({ snapshot: emptySnapshot(), baseline: emptySnapshot() });
      setStatus("已保存 " + fileName + "，编辑器已准备好下一篇新文章。", "success");
      return true;
    }

    if (state.mode === "create") {
      state.mode = "edit";
      state.currentFileName = fileName;
      state.originalFileName = fileName;
      state.originalAssetSlug = publishContext.assetSlug;
      renderComposerMode();
      setComposerUrl(fileName);
    }
    setDirtyBaseline(captureEditorSnapshot());
    setPublishAvailability(publishContext);
    renderPostList();
    renderPreview();
    setStatus(publishContext.mode === "edit"
      ? "已保存修改到 " + fileName + "。"
      : "已保存到 " + fileName + "。刷新博客后就能看到新文章。", "success");
    return true;
  } catch (error) {
    setStatus("保存失败：" + error.message, "error");
    return false;
  }
}

function downloadMarkdown() {
  setPublishAvailability(null);
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
  setStatus("已下载 Markdown 文件，可作为文章备份或外部编辑副本。", "success");
}

function publishConfirmationMessage(preview) {
  const lines = [
    "即将发布：" + preview.fileName,
    "分支：" + preview.branch,
    "",
    "本次文章相关改动：",
    ...preview.changes.map((change) => "  " + change)
  ];

  if (preview.aheadCount > 0) {
    lines.push("", "注意：当前分支另有 " + preview.aheadCount + " 个尚未推送的提交，推送时也会一并上传。");
  }
  if (preview.otherStagedPaths.length) {
    lines.push("", "已有其他暂存文件（本次提交不会包含）：", ...preview.otherStagedPaths.map((path) => "  " + path));
  }
  lines.push("", "确认提交当前文章并推送到远端吗？");
  return lines.join("\n");
}

async function publishPost() {
  if (!state.lastSavedContext || state.publishing) {
    return;
  }

  setPublishingState(true, "正在检查...");
  try {
    const previewRequest = await postJson("/publish/preview", state.lastSavedContext);
    const preview = previewRequest.result;
    if (!previewRequest.response.ok || !preview.ok) {
      setStatus("发布检查失败：" + (preview.message || "未知错误"), "error");
      return;
    }
    if (preview.status === "noop") {
      setStatus(preview.message || "当前文章没有可发布的 Git 改动。", "");
      return;
    }
    setPublishingState(false);
    if (!window.confirm(publishConfirmationMessage(preview))) {
      setStatus("已取消发布，文章仍保存在本地。", "");
      return;
    }
    setPublishingState(true, "正在发布...");
    const publishRequest = await postJson("/publish", state.lastSavedContext);
    const result = publishRequest.result;

    if (!publishRequest.response.ok || !result.ok) {
      setStatus(result.message || "发布失败。", result.status === "committed_not_pushed" ? "warn" : "error");
      return;
    }
    if (result.status === "noop") {
      setStatus(result.message || "当前文章没有可发布的 Git 改动。", "");
      return;
    }
    setStatus((result.message || "已提交并推送当前文章。") + (result.commitMessage ? " " + result.commitMessage : ""), "success");
  } catch (error) {
    setStatus("发布失败：" + error.message, "error");
  } finally {
    setPublishingState(false);
  }
}

function switchToNewPost() {
  if (!confirmDiscardChanges("当前编辑区有未保存修改，确定切换到新建模式吗？")) {
    return;
  }

  clearDraftByKey("create");
  enterCreateMode({
    snapshot: emptySnapshot(),
    baseline: emptySnapshot()
  });
  setLibraryExpanded(false, { persist: true });
  setStatus("已切换到新建模式。", "");
}

if (toggleLibraryButton) {
  toggleLibraryButton.addEventListener("click", () => {
    setLibraryExpanded(!state.libraryExpanded, { persist: true, focusSearch: !state.libraryExpanded });
  });
}

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
});

newPostButton.addEventListener("click", switchToNewPost);
if (saveButton) saveButton.addEventListener("click", () => saveToPosts(false));
if (saveAndNewButton) saveAndNewButton.addEventListener("click", () => saveToPosts(true));
if (publishButton) publishButton.addEventListener("click", publishPost);
if (downloadButton) downloadButton.addEventListener("click", downloadMarkdown);

const savePublishButton = document.querySelector("#save-publish-post");
if (savePublishButton) {
  savePublishButton.addEventListener("click", async () => {
    const saved = await saveToPosts(false);
    if (saved) {
      await publishPost();
    }
  });
}
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
  const button = event.target.closest("[data-toggle-tag]");
  if (!button) {
    return;
  }
  toggleTag(button.dataset.toggleTag);
});

if (availableTagsEl) {
  availableTagsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-tag]");
    if (!button) {
      return;
    }
    addTag(button.dataset.addTag);
  });
}

postListEl.addEventListener("click", async (event) => {
  const visibilityBtn = event.target.closest("[data-toggle-post-visibility]");
  if (visibilityBtn) {
    await setPostLocalVisibility(visibilityBtn.dataset.togglePostVisibility, visibilityBtn.dataset.hidden !== "true");
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-post]");
  if (deleteBtn) {
    const fileName = deleteBtn.dataset.deletePost;
    if (confirm("确定要删除文章 \"" + fileName + "\" 吗？此操作无法撤销。")) {
      try {
        const response = await fetch("/api/posts/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Post-Composer-Token": state.requestToken
          },
          body: JSON.stringify({ fileName })
        });
        const result = await response.json();
        if (result.ok) {
          alert("成功删除文章 \"" + fileName + "\"");
          setStatus("", "");
          if (state.mode === "edit" && state.originalFileName === fileName) {
            state.dirtyBaseline = JSON.stringify(emptySnapshot());
            switchToNewPost();
          }
          await loadPostsIndex();
          await loadLocalVisibility();
          renderPostList();
        } else {
          alert(result.message || "删除文章失败。");
        }
      } catch (error) {
        alert("删除失败：" + error.message);
      }
    }
    return;
  }

  const button = event.target.closest("[data-open-post]");
  if (!button) {
    return;
  }
  openPostForEditing(button.dataset.openPost);
});

[titleInput, langInput, publishInput, excerptInput, bodyInput].forEach((element) => {
  element.addEventListener("input", () => {
    setPublishAvailability(null);
    renderPreview();
  });
});

slugInput.addEventListener("input", () => {
  if (state.mode === "edit") {
    slugInput.value = state.originalAssetSlug;
    return;
  }

  state.slugTouched = slugInput.value.trim().length > 0;
  slugInput.value = safeSlug(slugInput.value);
  setPublishAvailability(null);
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
initializeLibraryState();
state.uiReady = true;
setPublishAvailability(null);
renderPostList();
renderTags();
renderPreview();

if (requestedEditFile) {
  setStatus("正在载入 " + requestedEditFile + "。", "");
} else if (createDraft) {
  setStatus("已恢复上次未完成的新文章草稿。", "success");
}

connectLocalRepository();

// Theme Toggle Logic
const themeToggleBtn = document.querySelector("#theme-toggle");
const themeToggleIcon = document.querySelector("#theme-toggle-icon");

const sunIconPath = "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41z";
const moonIconPath = "M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.2-9.8.6-.1 1.2.3 1.3.9.1.6-.2 1.2-.8 1.4-2.8 1-4.7 3.5-4.7 6.5 0 3.9 3.1 7 7 7 3 0 5.5-1.9 6.5-4.7.2-.6.8-.9 1.4-.8.6.1 1 .7.9 1.3-.9 4.7-5 8.2-9.7 8.2z";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("post-composer-theme", theme);
  if (themeToggleIcon) {
    themeToggleIcon.innerHTML = `<path d="${theme === "dark" ? sunIconPath : moonIconPath}"/>`;
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("post-composer-theme");
  if (savedTheme) {
    applyTheme(savedTheme);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
}

initTheme();

// Liquid Glass Interactive Refraction Hover
const glassFilter = document.querySelector("#liquid-glass-filter feDisplacementMap");
if (glassFilter) {
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.addEventListener("mousemove", (e) => {
      const rect = panel.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Update glare highlight coordinates relative to the panel
      panel.style.setProperty("--mouse-x", `${x}px`);
      panel.style.setProperty("--mouse-y", `${y}px`);
      
      // Calculate normalized coordinates from center
      const cx = x / rect.width - 0.5;
      const cy = y / rect.height - 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      
      // Adjust scales of individual RGB displacement maps to create an organic fluid ripple feeling with chromatic dispersion
      const baseScale = 12 + dist * 24;
      const filterR = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(1)");
      const filterG = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(2)");
      const filterB = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(3)");
      
      if (filterR) filterR.setAttribute("scale", (baseScale + 4).toFixed(1));
      if (filterG) filterG.setAttribute("scale", baseScale.toFixed(1));
      if (filterB) filterB.setAttribute("scale", Math.max(2, baseScale - 4).toFixed(1));
    });
    
    panel.addEventListener("mouseleave", () => {
      const filterR = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(1)");
      const filterG = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(2)");
      const filterB = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(3)");
      
      if (filterR) filterR.setAttribute("scale", "22");
      if (filterG) filterG.setAttribute("scale", "18");
      if (filterB) filterB.setAttribute("scale", "14");
    });
  });
}
