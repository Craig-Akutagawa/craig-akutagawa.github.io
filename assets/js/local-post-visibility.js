(function () {
  var LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  var COMPOSER_VISIBILITY_URL = "http://127.0.0.1:4173/api/local-post-visibility";

  if (LOCAL_HOSTS.indexOf(window.location.hostname) === -1) {
    return;
  }

  function fetchVisibilityState() {
    return fetch(COMPOSER_VISIBILITY_URL)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Local visibility service unavailable.");
        }
        return response.json();
      })
      .then(function (payload) {
        return Array.isArray(payload.hiddenPosts) ? payload.hiddenPosts : [];
      })
      .catch(function () {
        return [];
      });
  }

  function applyHomeVisibility(hiddenFiles) {
    var list = document.querySelector('[data-local-post-list="home"]');
    if (!list) {
      return;
    }

    var limit = Number(list.getAttribute("data-visible-limit")) || 3;
    var visibleCount = 0;
    var hiddenSet = new Set(hiddenFiles);
    var items = Array.prototype.slice.call(list.querySelectorAll("[data-local-post-item]"));

    items.forEach(function (item) {
      var fileName = item.getAttribute("data-post-file") || "";
      var shouldShow = !hiddenSet.has(fileName) && visibleCount < limit;
      item.hidden = !shouldShow;
      item.classList.toggle("is-hidden-locally", hiddenSet.has(fileName));
      if (shouldShow) {
        visibleCount += 1;
      }
    });

    var emptyState = list.parentElement ? list.parentElement.querySelector("[data-local-post-empty]") : null;
    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  function applyArchiveBadges(hiddenFiles) {
    var archiveList = document.querySelector('[data-local-post-list="archive"]');
    if (!archiveList) {
      return;
    }

    var hiddenSet = new Set(hiddenFiles);
    Array.prototype.forEach.call(archiveList.querySelectorAll("[data-local-post-item]"), function (item) {
      var fileName = item.getAttribute("data-post-file") || "";
      var hidden = hiddenSet.has(fileName);
      var date = item.querySelector(".archive-date");
      if (!date) {
        return;
      }

      var badge = date.querySelector(".local-post-status-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "local-post-status-badge";
        date.appendChild(badge);
      }

      badge.textContent = hidden ? "Hidden" : "Visible";
      badge.classList.toggle("is-hidden", hidden);
      item.classList.toggle("is-hidden-locally", hidden);
    });
  }

  function refreshLocalPostVisibility() {
    fetchVisibilityState().then(function (hiddenFiles) {
      applyHomeVisibility(hiddenFiles);
      applyArchiveBadges(hiddenFiles);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshLocalPostVisibility);
  } else {
    refreshLocalPostVisibility();
  }
})();
