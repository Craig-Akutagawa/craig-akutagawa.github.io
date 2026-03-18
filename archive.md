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
