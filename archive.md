---
layout: page
title: Archive
permalink: /archive/
description: A running list of posts published on the site.
kicker: Archive
---

{% if site.posts.size > 0 %}
<ul class="archive-list">
  {% for post in site.posts %}
  <li>
    <span class="archive-date">{{ post.date | date: "%b %-d, %Y" }}</span>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </li>
  {% endfor %}
</ul>
{% else %}
<p class="empty-state">No posts yet. Add a Markdown file to the _posts folder and it will appear here automatically.</p>
{% endif %}