const STORAGE_DB = "post-composer-db";
const STORAGE_STORE = "handles";
const STORAGE_KEY = "repo-root";

const titleInput = document.querySelector("#title");
const langInput = document.querySelector("#lang");
const publishInput = document.querySelector("#publishAt");
const slugInput = document.querySelector("#slug");
const excerptInput = document.querySelector("#excerpt");
const bodyInput = document.querySelector("#body");
const statusEl = document.querySelector("#status");
const fileNameEl = document.querySelector("#file-name");
const outputMetaEl = document.querySelector("#output-meta");
const previewHost = document.querySelector("#preview-host");
const previewTitle = document.querySelector("#preview-title");
const previewDate = document.querySelector("#preview-date");
const editorStats = document.querySelector("#editor-stats");
const imagePicker = document.querySelector("#image-picker");
const connectionChip = document.querySelector("#connection-chip");
const connectionCopy = document.querySelector("#connection-copy");
const pickProjectButton = document.querySelector("#pick-project");
const forgetProjectButton = document.querySelector("#forget-project");
const saveButton = document.querySelector("#save-post");
const saveAndNewButton = document.querySelector("#save-and-new");
const downloadButton = document.querySelector("#download-post");
const insertImageButton = document.querySelector("#insert-image");
const toolbarButtons = document.querySelectorAll("[data-action]");

const state = {
  repoHandle: null,
  slugTouched: false,
  supportsFsAccess: typeof window.showDirectoryPicker === "function",
  dbReady: null
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

function getCurrentSlug() {
  return safeSlug(slugInput.value.trim()) || slugFromTitle(titleInput.value.trim());
}

function buildFileName() {
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
  if (!state.slugTouched) {
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

function renderPreview() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  syncSlugFromTitle();
  updateEditorStats();

  if (!title && !body) {
    fileNameEl.textContent = "未生成文件名";
    outputMetaEl.textContent = "语言与发布时间会显示在这里";
    previewDate.textContent = "POST";
    previewTitle.textContent = "在左边输入标题和正文";
    previewHost.innerHTML = "<p class=\"preview-empty\">这里会渲染接近博客文章页的预览，包括标题、段落、列表、代码块和图片。</p>";
    return;
  }

  fileNameEl.textContent = buildFileName();
  outputMetaEl.textContent = "语言：" + langInput.value + " | 摘要：" + (buildExcerpt() || "自动留空");
  previewDate.textContent = formatPreviewDate(publishInput.value, langInput.value);
  previewTitle.textContent = title || "Untitled Post";
  previewHost.innerHTML = body ? renderMarkdown(body) : "<p class=\"preview-empty\">正文为空。</p>";
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

async function updateConnectionUi() {
  if (!state.repoHandle) {
    setConnectionState("offline", "未连接项目目录", "第一次使用时，选择整个项目根目录。之后就能同时保存文章和图片。");
    return;
  }

  const hasPosts = await repoHasPostsDirectory(state.repoHandle);
  if (hasPosts) {
    setConnectionState("", "项目目录已连接", "已连接到 " + state.repoHandle.name + "，可以写入 _posts 和 assets/posts。");
  } else {
    setConnectionState("warn", "目录不完整", "已选中 " + state.repoHandle.name + "，但里面找不到 _posts，保存时会被阻止。");
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
      setStatus(permission === "granted" ? "已恢复上次连接的项目目录。" : "已找到上次使用的项目目录；保存时可能会再次询问权限。", permission === "granted" ? "success" : "");
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
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.repoHandle = handle;
    await persistRepoHandle(handle);
    await updateConnectionUi();
    setStatus(await repoHasPostsDirectory(handle)
      ? "已连接到项目目录：" + handle.name + "。后面保存文章和图片会直接写入仓库。"
      : "已选中目录：" + handle.name + "，但里面没有 _posts。请重新选择博客项目根目录。", await repoHasPostsDirectory(handle) ? "success" : "warn");
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

function handleImageInsert() {
  if (!ensureFsSupport()) {
    return;
  }
  imagePicker.click();
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
    if (!state.slugTouched) {
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
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return false;
  }

  if (!await ensureRepoPermission()) {
    return false;
  }

  try {
    const postsDir = await getPostsDirectory();
    const fileName = buildFileName();

    if (await fileExists(postsDir, fileName) && !window.confirm(fileName + " 已存在，是否覆盖？")) {
      return false;
    }

    const fileHandle = await postsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buildMarkdown());
    await writable.close();

    if (resetAfterSave) {
      resetComposer();
      setStatus("已保存 " + fileName + "，编辑器已准备好下一篇新文章。", "success");
    } else {
      setStatus("已保存到 " + fileName + "。刷新博客后就能看到新文章。", "success");
    }
    return true;
  } catch (error) {
    setStatus("保存失败：" + error.message, "error");
    return false;
  }
}

function downloadMarkdown() {
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

function resetComposer() {
  titleInput.value = "";
  excerptInput.value = "";
  bodyInput.value = "";
  slugInput.value = "";
  publishInput.value = defaultDateTimeLocal();
  state.slugTouched = false;
  renderPreview();
  bodyInput.focus();
}

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
});

pickProjectButton.addEventListener("click", pickProjectRoot);
forgetProjectButton.addEventListener("click", forgetProjectRoot);
saveButton.addEventListener("click", () => saveToPosts(false));
saveAndNewButton.addEventListener("click", () => saveToPosts(true));
downloadButton.addEventListener("click", downloadMarkdown);
insertImageButton.addEventListener("click", handleImageInsert);
imagePicker.addEventListener("change", (event) => importImages(Array.from(event.target.files || [])));

[titleInput, langInput, publishInput, excerptInput, bodyInput].forEach((element) => {
  element.addEventListener("input", renderPreview);
});

slugInput.addEventListener("input", () => {
  state.slugTouched = slugInput.value.trim().length > 0;
  slugInput.value = safeSlug(slugInput.value);
  renderPreview();
});

publishInput.value = defaultDateTimeLocal();
renderPreview();
updateConnectionUi();
restoreProjectHandle();
