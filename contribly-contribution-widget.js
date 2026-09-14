/*
  CONTRIBLY - SINGLE CONTRIBUTION WIDGET
  =======================================
  HOW TO EMBED THIS ON A PAGE (once this file is hosted somewhere public):

    <div class="contribly-widget" data-contribution="THE-CONTRIBUTION-ID"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-contribution-widget.js" defer></script>

  DESIGN:
    Matches the indigo/violet accent and rounded, generous style of Contribly's
    own upload flow. --contribly-accent below is a placeholder indigo, swap in
    the exact brand hex once confirmed (search "TODO brand colour").

  DARK MODE:
    Automatically switches to a dark palette when the visitor's OS/browser is
    set to dark mode (prefers-color-scheme). This does NOT cover a publisher's
    own manual dark-mode toggle button, since every site implements that
    differently and there's no universal way to detect it. If a publisher's
    dev team wants the widget to follow their own toggle instead of/as well as
    the OS setting, they can override the variables directly, e.g.:

      .your-sites-dark-mode-class .contribly-widget {
        --contribly-bg: #1c1c22;
        --contribly-border: #2e2e38;
        --contribly-ink: #f2f1f7;
        --contribly-muted: #a3a2ad;
        --contribly-accent: #a5a0fb;
        --contribly-accent-tint: #2b2757;
      }

  JOURNALIST REPLY SAFETY:
    contribution.journalistResponse.text can contain real HTML written by an
    authenticated moderator (e.g. a link). We do NOT trust it outright, even
    though it's an authenticated source, because this widget runs on many
    different publisher sites, so a mistake or compromised account has a much
    bigger blast radius than it would inside Contribly's own CMS.

    We sanitise it with DOMPurify (loaded on demand, only when a response is
    present) using a strict allow-list: links, bold, italic, underline, line
    breaks and paragraphs. Everything else is stripped. Links are forced to
    open safely (target="_blank" rel="noopener noreferrer").

    The contributor's own headline/body/name are NOT run through this path,
    they're always treated as plain text (escaped), since that's public
    input rather than moderator input.

  FIELD NOTES (confirmed against real Contribly responses):
    - Contributor name -> contribution.attribution
    - Location         -> contribution.place (null if none was captured)
    - Journalist reply -> contribution.journalistResponse.text (may contain HTML)
    - Media artifacts  -> mediaUsages[0].artifacts (NOT nested inside .media)
    - Video artifacts sit in the same array as poster images and can include
      an audio-only track, so we pick by contentType, not just by label.
*/

(function () {
  var STYLE_ID = "contribly-widget-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var LOCATION_PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/>' +
    '<circle cx="12" cy="9.5" r="2.3"/></svg>';
  var REPLY_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.7 8.7 0 0 1-4-1L3 20l1.1-5.5a8.4 8.4 0 0 1-1-4A8.38 8.38 0 0 1 11.6 2a8.5 8.5 0 0 1 9.4 9.5z"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".contribly-widget{" +
      "--contribly-bg:#ffffff;--contribly-border:#e9e8f2;--contribly-ink:#17171a;" +
      "--contribly-muted:#6e6e76;--contribly-accent:#4f46e5;--contribly-accent-tint:#eef0ff;" +
      "--contribly-shadow:rgba(20,20,43,.05);--contribly-shimmer-a:#eeedf7;--contribly-shimmer-b:#f7f6fc;" +
      "--contribly-radius:16px;--contribly-font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "max-width:400px;width:100%;box-sizing:border-box;background:var(--contribly-bg);" +
      "border-radius:var(--contribly-radius);overflow:hidden;font-family:var(--contribly-font);" +
      "color:var(--contribly-ink);line-height:1.5;border:0.5px solid var(--contribly-border);" +
      "box-shadow:0 1px 2px var(--contribly-shadow),0 8px 20px var(--contribly-shadow);" +
      "opacity:0;transition:opacity .35s ease;}" +
      "@media (prefers-color-scheme:dark){.contribly-widget{" +
      "--contribly-bg:#1c1c22;--contribly-border:#2e2e38;--contribly-ink:#f2f1f7;" +
      "--contribly-muted:#a3a2ad;--contribly-accent:#a5a0fb;--contribly-accent-tint:#2b2757;" +
      "--contribly-shadow:rgba(0,0,0,.35);--contribly-shimmer-a:#2a2a33;--contribly-shimmer-b:#34343f;}}" +
      ".contribly-widget *{box-sizing:border-box;}" +
      ".contribly-widget.is-ready{opacity:1;}" +
      "@media (prefers-reduced-motion:reduce){.contribly-widget{transition:none;}}" +
      ".contribly-widget__loading{aspect-ratio:4/3;background:linear-gradient(90deg,var(--contribly-shimmer-a) 25%,var(--contribly-shimmer-b) 37%,var(--contribly-shimmer-a) 63%);" +
      "background-size:400% 100%;animation:contribly-shimmer 1.4s ease infinite;}" +
      "@media (prefers-reduced-motion:reduce){.contribly-widget__loading{animation:none;background:var(--contribly-shimmer-a);}}" +
      "@keyframes contribly-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".contribly-widget__error{padding:20px;color:var(--contribly-muted);font-size:14px;}" +
      ".contribly-widget__header{display:flex;align-items:center;gap:10px;padding:14px 16px;}" +
      ".contribly-widget__avatar{width:36px;height:36px;border-radius:50%;background:var(--contribly-accent-tint);" +
      "display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;" +
      "color:var(--contribly-accent);flex-shrink:0;}" +
      ".contribly-widget__identity{flex:1;min-width:0;}" +
      ".contribly-widget__name{font-weight:600;font-size:14px;margin:0;color:var(--contribly-ink);" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".contribly-widget__location{display:flex;align-items:center;gap:4px;margin-top:2px;" +
      "font-size:12px;color:var(--contribly-muted);}" +
      ".contribly-widget__location svg{width:12px;height:12px;flex-shrink:0;}" +
      ".contribly-widget__date{font-size:12px;color:var(--contribly-muted);white-space:nowrap;margin-left:auto;}" +
      ".contribly-widget__media{display:block;width:100%;height:auto;object-fit:cover;background:var(--contribly-accent-tint);}" +
      ".contribly-widget__content{padding:14px 16px 16px;}" +
      ".contribly-widget__headline{font-weight:600;font-size:14px;margin:0 0 6px;color:var(--contribly-ink);}" +
      ".contribly-widget__text{font-size:14px;line-height:1.6;margin:0 0 12px;color:var(--contribly-ink);}" +
      ".contribly-widget__content > .contribly-widget__text:last-child{margin-bottom:0;}" +
      ".contribly-widget__response{background:var(--contribly-accent-tint);border-radius:12px;padding:10px 12px;" +
      "display:flex;gap:8px;align-items:flex-start;}" +
      ".contribly-widget__response svg{width:16px;height:16px;flex-shrink:0;margin-top:2px;color:var(--contribly-accent);}" +
      ".contribly-widget__response-label{font-size:11px;font-weight:600;color:var(--contribly-accent);margin:0 0 4px;}" +
      ".contribly-widget__response-body{font-size:13px;line-height:1.6;color:var(--contribly-ink);white-space:pre-line;}" +
      ".contribly-widget__response-body p{margin:0 0 8px;}" +
      ".contribly-widget__response-body p:last-child{margin-bottom:0;}" +
      ".contribly-widget__response-body a{color:var(--contribly-accent);text-decoration:underline;}";
    document.head.appendChild(style);
  }

  function addPreconnectsOnce() {
    ["https://api.contribly.com", "https://storage.googleapis.com"].forEach(function (origin) {
      var id = "contribly-preconnect-" + origin.replace(/[^a-z0-9]/gi, "");
      if (document.getElementById(id)) return;
      var link = document.createElement("link");
      link.id = id;
      link.rel = "preconnect";
      link.href = origin;
      document.head.appendChild(link);
    });
  }

  var domPurifyCallbacks = [];
  var domPurifyLoading = false;
  var domPurifyHookAdded = false;

  function ensureDOMPurify(callback) {
    if (window.DOMPurify) {
      addSafeLinkHookOnce();
      callback();
      return;
    }
    domPurifyCallbacks.push(callback);
    if (domPurifyLoading) return;
    domPurifyLoading = true;
    var script = document.createElement("script");
    script.src = DOMPURIFY_SRC;
    script.onload = function () {
      addSafeLinkHookOnce();
      domPurifyCallbacks.forEach(function (cb) {
        cb();
      });
      domPurifyCallbacks = [];
    };
    script.onerror = function () {
      // If DOMPurify fails to load (e.g. offline), fail safe: don't render
      // unsanitised HTML. Callbacks run with DOMPurify absent and the
      // sanitiseResponse function below falls back to plain-text escaping.
      domPurifyCallbacks.forEach(function (cb) {
        cb();
      });
      domPurifyCallbacks = [];
    };
    document.head.appendChild(script);
  }

  function addSafeLinkHookOnce() {
    if (domPurifyHookAdded || !window.DOMPurify) return;
    domPurifyHookAdded = true;
    window.DOMPurify.addHook("afterSanitizeAttributes", function (node) {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  function sanitiseResponseHtml(rawText) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(rawText, {
        ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "br", "p"],
        ALLOWED_ATTR: ["href", "target", "rel"],
      });
    }
    // DOMPurify unavailable: fail safe and show as plain text rather than
    // risk rendering unsanitised HTML.
    return escapeHtml(rawText);
  }

  function formatDate(isoString) {
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    } catch (e) {
      return "";
    }
  }

  function getInitials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function pickArtifactByType(artifacts, contentTypePrefix, preferredLabels) {
    var candidates = artifacts.filter(function (a) {
      return a.url && a.contentType && a.contentType.indexOf(contentTypePrefix) === 0;
    });
    if (!candidates.length) return null;
    for (var i = 0; i < preferredLabels.length; i++) {
      var match = candidates.filter(function (a) {
        return a.label === preferredLabels[i];
      })[0];
      if (match) return match;
    }
    return candidates[0];
  }

  function pickMedia(mediaUsages) {
    if (!mediaUsages || !mediaUsages.length) return null;
    var usage = mediaUsages[0];
    var media = usage.media;
    var artifacts = usage.artifacts;
    if (!artifacts || !artifacts.length) return null;

    if (media && media.type === "video") {
      var video = pickArtifactByType(artifacts, "video/", ["HD", "nHD"]);
      if (!video) return null;
      var poster = pickArtifactByType(artifacts, "image/", ["HD", "mediumlandscape", "large", "medium"]);
      return {
        kind: "video",
        videoUrl: video.url,
        videoContentType: video.contentType,
        width: video.width,
        height: video.height,
        posterUrl: poster ? poster.url : null,
      };
    }

    var image = pickArtifactByType(artifacts, "image/", [
      "large",
      "mediumlandscapecropdouble",
      "extralarge",
      "medium",
    ]);
    if (!image) return null;
    return { kind: "image", imageUrl: image.url, width: image.width, height: image.height };
  }

  function renderContribution(container, contribution) {
    var html = "";

    var displayName = contribution.attribution || "Community contributor";
    html += '<div class="contribly-widget__header">';
    html += '<div class="contribly-widget__avatar">' + escapeHtml(getInitials(displayName)) + "</div>";
    html += '<div class="contribly-widget__identity">';
    html += '<p class="contribly-widget__name">' + escapeHtml(displayName) + "</p>";
    var place = contribution.place;
    if (place && place.name) {
      html +=
        '<div class="contribly-widget__location">' +
        LOCATION_PIN_SVG +
        "<span>" +
        escapeHtml(place.name) +
        "</span></div>";
    }
    html += "</div>"; // end identity
    if (contribution.created) {
      html += '<span class="contribly-widget__date">' + formatDate(contribution.created) + "</span>";
    }
    html += "</div>"; // end header

    var mediaInfo = pickMedia(contribution.mediaUsages);
    if (mediaInfo) {
      var ratioStyle =
        mediaInfo.width && mediaInfo.height
          ? ' style="aspect-ratio:' + mediaInfo.width + "/" + mediaInfo.height + ';"'
          : "";
      if (mediaInfo.kind === "video") {
        html +=
          '<video class="contribly-widget__media" controls preload="none"' +
          ratioStyle +
          (mediaInfo.posterUrl ? ' poster="' + mediaInfo.posterUrl + '"' : "") +
          "><source src=\"" +
          mediaInfo.videoUrl +
          '" type="' +
          (mediaInfo.videoContentType || "video/mp4") +
          '"></video>';
      } else {
        html +=
          '<img class="contribly-widget__media" src="' +
          mediaInfo.imageUrl +
          '" alt="" loading="lazy" decoding="async"' +
          ratioStyle +
          " />";
      }
    }

    html += '<div class="contribly-widget__content">';
    if (contribution.headline) {
      html += '<p class="contribly-widget__headline">' + escapeHtml(contribution.headline) + "</p>";
    }
    if (contribution.body) {
      html += '<p class="contribly-widget__text">' + escapeHtml(contribution.body) + "</p>";
    }

    var hasResponse = contribution.journalistResponse && contribution.journalistResponse.text;
    if (hasResponse) {
      html +=
        '<div class="contribly-widget__response" data-pending="true">' +
        REPLY_ICON_SVG +
        '<div><p class="contribly-widget__response-label">Newsroom reply</p>' +
        '<div class="contribly-widget__response-body"></div></div></div>';
    }
    html += "</div>"; // end content

    container.innerHTML = html;
    container.classList.add("is-ready");

    if (hasResponse) {
      var rawResponse = contribution.journalistResponse.text;
      ensureDOMPurify(function () {
        var bodyEl = container.querySelector(".contribly-widget__response-body");
        if (bodyEl) bodyEl.innerHTML = sanitiseResponseHtml(rawResponse);
      });
    }
  }

  function renderError(container) {
    container.innerHTML = '<div class="contribly-widget__error">This contribution couldn\'t be loaded.</div>';
    container.classList.add("is-ready");
  }

  function loadWidget(widget) {
    var contributionId = widget.getAttribute("data-contribution");
    if (!contributionId) {
      renderError(widget);
      return;
    }
    fetch("https://api.contribly.com/1/contributions/" + contributionId)
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then(function (contribution) {
        renderContribution(widget, contribution);
      })
      .catch(function () {
        renderError(widget);
      });
  }

  function init() {
    injectStylesOnce();
    addPreconnectsOnce();

    var widgets = document.querySelectorAll(".contribly-widget:not([data-contribly-initialised])");
    widgets.forEach(function (widget) {
      widget.setAttribute("data-contribly-initialised", "true");
      widget.innerHTML = '<div class="contribly-widget__loading"></div>';

      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                observer.unobserve(widget);
                loadWidget(widget);
              }
            });
          },
          { rootMargin: "200px" }
        );
        observer.observe(widget);
      } else {
        loadWidget(widget);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
