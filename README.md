# Craig Akutagawa's Personal Site

This repository contains the source for a lightweight personal blog built with Jekyll and published with GitHub Pages. The current site focuses on a clear home page, an about page, and a simple post archive so writing can grow before the stack does.

## Project shape

- `index.html` is the custom home page.
- `about.md` is the personal profile page.
- `archive.md` lists published posts.
- `_posts/` stores blog posts in standard Jekyll dated Markdown files.
- `_layouts/` contains the custom page and post wrappers.
- `_includes/` holds the shared navigation and custom styling.
- `_config.yml` defines site metadata and core Jekyll settings.

## Writing workflow

1. Add a new Markdown file in `_posts/` named `YYYY-MM-DD-title.md`.
2. Include front matter with at least `layout`, `title`, `date`, and an optional `excerpt`.
3. Write the post body in Markdown.
4. Commit and push the change so GitHub Pages can rebuild the site.

Example front matter:

```md
---
layout: post
title: A New Post
date: 2026-03-09 09:00:00 +0800
excerpt: A short summary for cards and archive previews.
lang: en-US
---
```

For pages or posts written primarily in Chinese or Japanese, set `lang` in the front matter to `zh-Hant`, `zh-Hans`, or `ja`.
When a single page mixes languages, wrap the specific phrase, sentence, or section with a matching `lang` attribute so the CJK typography rules can apply correctly, for example `<span lang="ja">...</span>` or `<div lang="zh-Hant">...</div>`.

## Local post composer

If you prefer a GUI over writing front matter by hand, run the local-only composer:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\start-post-composer.ps1
```

Then open the local page in your browser and start writing. The local composer service reads and saves articles directly in this repository, so there is no directory-permission step.

For a writing-only session, double-click:

- `Open Post Composer.cmd`
- `Close Post Composer.cmd`

For the full local site preview, double-click:

- `Open Local Preview.cmd` starts the blog preview and Post Composer, then opens the home page.
- Use the `发新文章` button in the home page's `LOCAL ONLY` section to enter the composer.
- `Close Local Preview.cmd` stops only the services launched by that full-preview shortcut.

Security model:

- The composer lives under `tools/` and is excluded from the published Jekyll site.
- The local server only listens on `127.0.0.1`, so it is reachable only from this computer.
- The server verifies the local host name and an in-memory browser session token before reading, saving, importing, or publishing article data.
- Write requests are accepted only from the local composer page using JSON requests.

The upgraded composer supports:

- Markdown toolbar buttons for headings, emphasis, links, quotes, lists, task lists, code blocks, dividers, and images
- A live rendered preview that is closer to the actual post page
- Automatic image import into `assets/posts/<post-slug>/`
- Direct save to `_posts` plus a `Save and start a new draft` flow
- A publish confirmation that surfaces the branch and existing unpushed commits before committing and pushing

## GitHub comments

This site can use `giscus` for comments on post pages only.

Before enabling it:

1. Turn on GitHub Discussions for the repository.
2. Create or choose the Discussion category you want to use for comments.
3. Install and authorize the Giscus app for the repository.
4. Copy the repository ID and category ID from the Giscus configuration page.
5. Fill those values into `comments.repo_id` and `comments.category_id` in `_config.yml`.
6. Set `comments.enabled: true`.

The current implementation maps discussions by post pathname, so changing a post title alone will not break its comment thread as long as the URL path stays the same.

## Content and design notes

- The site uses the Cayman theme as a base, then overrides the presentation through `_includes/custom-style.html`.
- Layouts are intentionally minimal so new pages and posts stay easy to add.
- The visual direction favors warm surfaces, card-based sections, and simple navigation over heavy structure.

## Deployment notes

This repo is set up like a GitHub Pages Jekyll site. The checked-in files are enough for Pages to build the published site once the repository settings are pointed at the correct branch.

Local preview uses the checked-in `Gemfile` with `bundle exec jekyll serve`. Generated site output, preview logs, PID/process records, Python caches, and request-capture files belong under ignored local paths and should never be committed.

`tools/capture_openai_requests.py` is a local debugging aid. It redacts sensitive request headers before writing, but captured request bodies can still include private content; keep `tmp/openai_requests.jsonl` local only.
