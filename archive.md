---
layout: page
title: Archive
permalink: /archive/
description: A running list of posts published on the site.
kicker: Archive
page_class: archive-page
lang: en-US
hide_page_heading: true
---

<div class="archive-local-actions" id="archive-local-actions" hidden>
  <a class="button-link archive-local-actions-link" href="http://127.0.0.1:4173/post-composer.html">发新文章</a>
</div>

{% if site.posts.size > 0 %}
<ul class="archive-list archive-timeline">
  {% for post in site.posts %}
  <li class="archive-item">
    <span class="archive-date">{{ post.date | date: "%b %-d, %Y" }}</span>
    <div class="archive-entry">
      <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      {% if post.tags and post.tags.size > 0 %}
      <div class="tag-row tag-row-compact" aria-label="Post tags">
        {% for tag in post.tags %}
        <span class="tag-chip tag-chip-compact">{{ tag }}</span>
        {% endfor %}
      </div>
      {% endif %}
      <p>{{ post.excerpt | strip_html | truncate: 170 }}</p>
    </div>
  </li>
  {% endfor %}
</ul>
{% else %}
<p class="empty-state">No posts yet. Add a Markdown file to the _posts folder and it will appear here automatically.</p>
{% endif %}

<script>
  (function () {
    var container = document.getElementById("archive-local-actions");
    if (!container || !window.fetch) {
      return;
    }

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () {
      if (controller) {
        controller.abort();
      }
    }, 1200);

    fetch("http://127.0.0.1:4173/status", {
      method: "GET",
      cache: "no-store",
      mode: "cors",
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (payload) {
        if (payload && payload.ok === true && payload.service === "post-composer") {
          container.hidden = false;
        }
      })
      .catch(function () {
        // Keep the local action hidden when the composer is unavailable.
      })
      .finally(function () {
        window.clearTimeout(timeoutId);
      });
  })();
</script>
