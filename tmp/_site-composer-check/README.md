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

Then open the local page in your browser, choose the repository root once, and save directly into `_posts`.

For the easiest Windows workflow, just double-click:

- `Open Post Composer.cmd`
- `Close Post Composer.cmd`

Security model:

- The composer lives under `tools/` and is excluded from the published Jekyll site.
- The local server only listens on `127.0.0.1`, so it is reachable only from this computer.
- Saving still requires local browser permission to write into the project directory.

The upgraded composer supports:

- Markdown toolbar buttons for headings, emphasis, links, quotes, lists, task lists, code blocks, dividers, and images
- A live rendered preview that is closer to the actual post page
- Automatic image import into `assets/posts/<post-slug>/`
- Direct save to `_posts` plus a `Save and start a new draft` flow

## Content and design notes

- The site uses the Cayman theme as a base, then overrides the presentation through `_includes/custom-style.html`.
- Layouts are intentionally minimal so new pages and posts stay easy to add.
- The visual direction favors warm surfaces, card-based sections, and simple navigation over heavy structure.

## Deployment notes

This repo is set up like a GitHub Pages Jekyll site. The checked-in files are enough for Pages to build the published site once the repository settings are pointed at the correct branch.

There is not a local Jekyll toolchain checked into this repo yet. If local preview becomes part of the regular workflow, the next practical improvement is to add a `Gemfile` and a short setup section for `bundle exec jekyll serve`.
