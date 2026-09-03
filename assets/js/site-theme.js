/**
 * Site Theme & Global Navigation Controller
 * Handles dark/light theme toggle, Giscus comments iframe theme synchronization,
 * and local-development composer link visibility.
 */
(function () {
  'use strict';

  function initSiteTheme() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      var composerLink = document.getElementById('nav-composer-link');
      if (composerLink) {
        composerLink.hidden = false;
      }
    }

    var root = document.documentElement;
    var toggleBtn = document.getElementById('theme-toggle');
    var giscusOrigin = 'https://giscus.app';
    var giscusRetryTimer = 0;

    function normalizedTheme(theme) {
      return theme === 'dark' ? 'dark' : 'light';
    }

    function giscusTheme(theme) {
      return normalizedTheme(theme) === 'dark' ? 'dark_dimmed' : 'light';
    }

    function syncToggleState(theme) {
      if (!toggleBtn) return;
      var isDark = normalizedTheme(theme) === 'dark';
      toggleBtn.setAttribute('aria-pressed', String(isDark));
      toggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function postGiscusTheme(theme) {
      var frame = document.querySelector('iframe.giscus-frame');
      if (!frame || !frame.contentWindow) {
        return false;
      }

      try {
        frame.contentWindow.postMessage({
          giscus: {
            setConfig: {
              theme: giscusTheme(theme)
            }
          }
        }, giscusOrigin);
        return true;
      } catch (error) {
        return false;
      }
    }

    function queueGiscusTheme(theme) {
      var nextTheme = normalizedTheme(theme);
      if (giscusRetryTimer) {
        window.clearTimeout(giscusRetryTimer);
      }

      var attempts = 0;
      function retry() {
        if (postGiscusTheme(nextTheme) || attempts >= 8) {
          giscusRetryTimer = 0;
          return;
        }
        attempts += 1;
        giscusRetryTimer = window.setTimeout(retry, attempts < 3 ? 100 : 500);
      }
      retry();
    }

    function bindGiscusFrame(frame) {
      if (!frame || frame.dataset.themeSyncBound === 'true') {
        return false;
      }
      frame.dataset.themeSyncBound = 'true';
      frame.addEventListener('load', function () {
        queueGiscusTheme(root.getAttribute('data-theme'));
      });
      return true;
    }

    function inspectGiscusFrames() {
      var frames = document.querySelectorAll('iframe.giscus-frame');
      var newlyBound = false;
      for (var i = 0; i < frames.length; i += 1) {
        newlyBound = bindGiscusFrame(frames[i]) || newlyBound;
      }
      if (newlyBound) {
        queueGiscusTheme(root.getAttribute('data-theme'));
      }
    }

    if (window.MutationObserver) {
      var giscusObserver = new MutationObserver(inspectGiscusFrames);
      giscusObserver.observe(document.documentElement, { childList: true, subtree: true });

      var themeObserver = new MutationObserver(function () {
        var theme = root.getAttribute('data-theme');
        syncToggleState(theme);
        queueGiscusTheme(theme);
      });
      themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }

    window.__syncGiscusTheme = queueGiscusTheme;
    syncToggleState(root.getAttribute('data-theme'));
    inspectGiscusFrames();

    if (!toggleBtn) return;
    toggleBtn.addEventListener('click', function () {
      var currentTheme = normalizedTheme(root.getAttribute('data-theme'));
      var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', nextTheme);
      try {
        localStorage.setItem('theme', nextTheme);
      } catch (error) {
        // A blocked storage area should not prevent the theme from changing.
      }
      syncToggleState(nextTheme);
      queueGiscusTheme(nextTheme);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteTheme);
  } else {
    initSiteTheme();
  }
})();
