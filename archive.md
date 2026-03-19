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
{% assign archive_tags = site.tags | sort %}
<section class="archive-tag-filter" id="archive-tag-filter">
  <div class="archive-tag-filter-head">
    <p class="section-label">Filter</p>
    <button class="action-button ghost archive-tag-toggle" id="archive-tag-toggle" type="button" hidden>展开标签</button>
  </div>
  <label class="archive-search-field" for="archive-search">
    <input id="archive-search" type="search" placeholder="按标题、摘要或标签搜索">
  </label>
  <div class="archive-tag-filter-chips is-collapsed" id="archive-tag-filter-chips" aria-label="Archive tag filters">
    <button class="tag-chip archive-tag-chip is-active" type="button" data-filter-tag="__all__" data-count="{{ site.posts.size }}">
      <span>全部</span>
      <span class="archive-tag-count">{{ site.posts.size }}</span>
    </button>
    {% for tag_entry in archive_tags %}
    {% assign tag_name = tag_entry[0] %}
    {% assign tag_posts = tag_entry[1] %}
    <button class="tag-chip archive-tag-chip" type="button" data-filter-tag="{{ tag_name | escape }}" data-count="{{ tag_posts.size }}">
      <span>{{ tag_name }}</span>
      <span class="archive-tag-count">{{ tag_posts.size }}</span>
    </button>
    {% endfor %}
  </div>
</section>

<ul class="archive-list archive-timeline">
  {% for post in site.posts %}
  <li class="archive-item" data-post-tags="{{ post.tags | join: '||' | escape }}" data-search-text="{{ post.title | append: ' ' | append: post.excerpt | append: ' ' | append: post.tags | join: ' ' | strip_html | downcase | escape }}">
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
<p class="empty-state archive-filter-empty" id="archive-filter-empty" hidden>这个标签下暂时没有文章。</p>
{% else %}
<p class="empty-state">No posts yet. Add a Markdown file to the _posts folder and it will appear here automatically.</p>
{% endif %}

<script>
  (function () {
    var tagFilter = document.getElementById("archive-tag-filter");
    var tagToggle = document.getElementById("archive-tag-toggle");
    var tagChips = document.getElementById("archive-tag-filter-chips");
    var searchInput = document.getElementById("archive-search");
    var archiveItems = Array.prototype.slice.call(document.querySelectorAll(".archive-item"));
    var emptyState = document.getElementById("archive-filter-empty");

    if (tagFilter && tagChips && archiveItems.length) {
      var chips = Array.prototype.slice.call(tagChips.querySelectorAll(".archive-tag-chip"));
      var allChip = chips.find(function (chip) {
        return chip.getAttribute("data-filter-tag") === "__all__";
      });
      var sortedChips = chips
        .filter(function (chip) {
          return chip !== allChip;
        })
        .sort(function (left, right) {
          var countDiff = Number(right.getAttribute("data-count")) - Number(left.getAttribute("data-count"));
          if (countDiff !== 0) {
            return countDiff;
          }
          return left.getAttribute("data-filter-tag").localeCompare(right.getAttribute("data-filter-tag"));
        });

      tagChips.innerHTML = "";
      if (allChip) {
        tagChips.appendChild(allChip);
      }
      sortedChips.forEach(function (chip) {
        tagChips.appendChild(chip);
      });

      var rowHeight = 0;
      var chipGap = 8;
      var currentTag = "__all__";
      var currentQuery = "";

      function computeTagHeights() {
        var firstChip = tagChips.querySelector(".archive-tag-chip");
        if (!firstChip) {
          return;
        }

        var styles = window.getComputedStyle(tagChips);
        chipGap = parseFloat(styles.rowGap || styles.gap || "8") || 8;
        rowHeight = firstChip.offsetHeight + chipGap;
        tagChips.style.setProperty("--archive-tag-row-height", Math.max(rowHeight - chipGap, firstChip.offsetHeight) + "px");

        var collapsedHeight = rowHeight;
        var expandedHeight = rowHeight * 3 - chipGap;
        var needsToggle = tagChips.scrollHeight > collapsedHeight + 2;

        tagToggle.hidden = !needsToggle;
        if (!needsToggle) {
          tagChips.classList.remove("is-collapsed");
          tagChips.classList.remove("is-expanded");
          tagChips.style.maxHeight = "";
          return;
        }

        if (tagChips.classList.contains("is-expanded")) {
          tagChips.style.maxHeight = expandedHeight + "px";
        } else {
          tagChips.style.maxHeight = collapsedHeight + "px";
        }
      }

      function setActiveChip(nextTag) {
        currentTag = nextTag;
        Array.prototype.forEach.call(tagChips.querySelectorAll(".archive-tag-chip"), function (chip) {
          chip.classList.toggle("is-active", chip.getAttribute("data-filter-tag") === nextTag);
        });
      }

      function applyFilter(nextTag) {
        if (typeof nextTag === "string") {
          currentTag = nextTag;
        }

        var visibleCount = 0;
        archiveItems.forEach(function (item) {
          var rawTags = item.getAttribute("data-post-tags") || "";
          var tags = rawTags ? rawTags.split("||") : [];
          var searchText = (item.getAttribute("data-search-text") || "").toLowerCase();
          var tagMatch = currentTag === "__all__" || tags.indexOf(currentTag) !== -1;
          var searchMatch = !currentQuery || searchText.indexOf(currentQuery) !== -1;
          var matches = tagMatch && searchMatch;
          item.hidden = !matches;
          if (matches) {
            visibleCount += 1;
          }
        });

        if (emptyState) {
          emptyState.hidden = visibleCount !== 0;
        }

        setActiveChip(nextTag);
      }

      tagChips.addEventListener("click", function (event) {
        var button = event.target.closest(".archive-tag-chip");
        if (!button) {
          return;
        }

        var nextTag = button.getAttribute("data-filter-tag");
        if (nextTag === currentTag || nextTag === "__all__") {
          applyFilter("__all__");
          return;
        }

        applyFilter(nextTag);
      });

      tagToggle.addEventListener("click", function () {
        var expanded = tagChips.classList.toggle("is-expanded");
        tagChips.classList.toggle("is-collapsed", !expanded);
        tagToggle.textContent = expanded ? "收起标签" : "展开标签";
        computeTagHeights();
      });

      if (searchInput) {
        searchInput.addEventListener("input", function () {
          currentQuery = searchInput.value.trim().toLowerCase();
          applyFilter(currentTag);
        });
      }

      window.addEventListener("resize", computeTagHeights);
      applyFilter("__all__");
      computeTagHeights();
    }

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
