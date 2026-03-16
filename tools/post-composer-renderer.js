function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(text) {
  const tokens = [];

  function stash(pattern, renderer, input) {
    return input.replace(pattern, (...args) => {
      const token = "%%TOKEN_" + tokens.length + "%%";
      tokens.push(renderer(...args));
      return token;
    });
  }

  let value = text;
  value = stash(/`([^`]+)`/g, (_, code) => "<code>" + escapeHtml(code) + "</code>", value);
  value = stash(/\!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => (
    "<img src=\"" + escapeHtml(src) + "\" alt=\"" + escapeHtml(alt) + "\">"
  ), value);
  value = stash(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => (
    "<a href=\"" + escapeHtml(href) + "\" target=\"_blank\" rel=\"noreferrer\">" + escapeHtml(label) + "</a>"
  ), value);
  value = escapeHtml(value);
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  value = value.replace(/%%TOKEN_(\d+)%%/g, (_, index) => tokens[Number(index)]);
  return value;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let codeLines = null;
  let listType = null;
  let listItems = [];
  let quoteLines = [];

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    html.push("<p>" + renderInlineMarkdown(paragraph.join(" ")) + "</p>");
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length || !listType) {
      return;
    }
    html.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
    listItems = [];
    listType = null;
  }

  function flushQuote() {
    if (!quoteLines.length) {
      return;
    }
    html.push("<blockquote>" + renderMarkdown(quoteLines.join("\n")) + "</blockquote>");
    quoteLines = [];
  }

  for (const line of lines) {
    if (codeLines) {
      if (line.startsWith("```")) {
        html.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      codeLines = [];
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = line.match(/^#+/)[0].length;
      html.push("<h" + level + ">" + renderInlineMarkdown(line.slice(level + 1).trim()) + "</h" + level + ">");
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      html.push("<hr>");
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      quoteLines.push(line.replace(/^>\s?/, ""));
      continue;
    }

    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      const checked = /\[[xX]\]/.test(line);
      const content = line.replace(/^[-*]\s+\[[ xX]\]\s+/, "");
      listItems.push("<li><input type=\"checkbox\" disabled" + (checked ? " checked" : "") + "> " + renderInlineMarkdown(content) + "</li>");
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push("<li>" + renderInlineMarkdown(line.replace(/^[-*]\s+/, "")) + "</li>");
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push("<li>" + renderInlineMarkdown(line.replace(/^\d+\.\s+/, "")) + "</li>");
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeLines) {
    html.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
  }

  flushParagraph();
  flushList();
  flushQuote();

  return html.join("");
}
