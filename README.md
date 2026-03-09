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
---
```

## Content and design notes

- The site uses the Cayman theme as a base, then overrides the presentation through `_includes/custom-style.html`.
- Layouts are intentionally minimal so new pages and posts stay easy to add.
- The visual direction favors warm surfaces, card-based sections, and simple navigation over heavy structure.

## Deployment notes

This repo is set up like a GitHub Pages Jekyll site. The checked-in files are enough for Pages to build the published site once the repository settings are pointed at the correct branch.

There is not a local Jekyll toolchain checked into this repo yet. If local preview becomes part of the regular workflow, the next practical improvement is to add a `Gemfile` and a short setup section for `bundle exec jekyll serve`.
