/*
  CONTRIBLY - SINGLE CONTRIBUTION WIDGET
  =======================================
  HOW TO EMBED THIS ON A PAGE (once this file is hosted somewhere public):

    <div class="contribly-widget" data-contribution="THE-CONTRIBUTION-ID"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-contribution-widget.js" defer></script>

  That's it. Put one <div> per contribution you want to show; a single copy
  of this script handles all of them on the page.

  WHERE TO HOST THIS FILE:
    Anywhere with a public HTTPS URL: your own site's static assets folder,
    a CDN, GitHub Pages, Netlify, or ask your dev team / Contribly to host it
    alongside Contribly's own widget files. Once it has a URL, the two lines
    above are all any page needs.

  PERFORMANCE NOTES:
    - Data for a widget is only fetched once it's about to scroll into view
      (IntersectionObserver), so a page with several widgets doesn't fire
      several API calls the moment it loads.
    - Images/video reserve their real aspect ratio up front (using the
      width/height Contribly returns) so the page doesn't jump as content
      loads in.
    - Video files are never downloaded until someone presses play
      (preload="none"); only the poster image loads up front.
    - No external fonts or libraries. System fonts only.

  FIELD NOTES (confirmed against real Contribly responses, not just the
  published API docs, since a couple of fields differ in practice):
    - Contributor name -> contribution.attribution
    - Location         -> contribution.place (null if none was captured)
    - Journalist reply -> contribution.journalistResponse.text
    - Media artifacts   -> mediaUsages[0].artifacts (NOT nested inside .media)
    - Video artifacts sit in the same array as poster images and can include
      an audio-only track, so we pick by contentType, not just by label.
*/

(function () {
  var STYLE_ID = "contribly-widget-styles";
  var LOCATION_PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/>' +
    '<circle cx="12" cy="9.5" r="2.3"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".contribly-widget{" +
      "--contribly-bg:#ffffff;--contribly-border:#e3dfd3;--contribly-ink:#1c1c1a;" +
      "--contribly-muted:#6b6b63;--contribly-accent:#2f5d50;--contribly-radius:12px;" +
      "--contribly-font-headline:Georgia,'Iowan Old Style','Times New Roman',serif;" +
      "--contribly-font-body:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "max-width:560px;width:100%;box-sizing:border-box;background:var(--contribly-bg);" +
      "border-radius:var(--contribly-radius);overflow:hidden;font-family:var(--contribly-font-body);" +
      "color:var(--contribly-ink);line-height:1.5;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);" +
      "opacity:0;transition:opacity .35s ease;}" +
      ".contribly-widget *{box-sizing:border-box;}" +
      ".contribly-widget.is-ready{opacity:1;}" +
      "@media (prefers-reduced-motion:reduce){.contribly-widget{transition:none;}}" +
      ".contribly-widget__loading{aspect-ratio:4/3;background:linear-gradient(90deg,#eeece3 25%,#f6f4ec 37%,#eeece3 63%);" +
      "background-size:400% 100%;animation:contribly-shimmer 1.4s ease infinite;}" +
      "@media (prefers-reduced-motion:reduce){.contribly-widget__loading{animation:none;background:#eeece3;}}" +
      "@keyframes contribly-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".contribly-widget__error{padding:20px;color:var(--contribly-muted);font-size:14px;}" +
      ".contribly-widget__media{display:block;width:100%;height:auto;object-fit:cover;background:#f2f0e9;}" +
      ".contribly-widget__body{padding:18px 20px 16px;}" +
      "@media (min-width:480px){.contribly-widget__body{padding:22px 24px 18px;}}" +
      ".contribly-widget__headline{font-family:var(--contribly-font-headline);" +
      "font-size:clamp(18px,4.5vw,22px);line-height:1.3;margin:0 0 8px;color:var(--contribly-ink);}" +
      ".contribly-widget__text{font-size:clamp(14px,3.6vw,15px);margin:0 0 16px;color:var(--contribly-ink);}" +
      ".contribly-widget__meta{border-top:1px solid var(--contribly-border);padding-top:12px;}" +
      ".contribly-widget__meta-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 12px;}" +
      ".contribly-widget__name{font-weight:600;font-size:14px;color:var(--contribly-accent);}" +
      ".contribly-widget__date{font-size:13px;color:var(--contribly-muted);white-space:nowrap;}" +
      ".contribly-widget__location{display:flex;align-items:center;gap:4px;margin-top:4px;font-size:13px;color:var(--contribly-muted);}" +
      ".contribly-widget__location svg{width:12px;height:12px;flex-shrink:0;}" +
      ".contribly-widget__response{margin-top:14px;padding:12px 14px;background:#f2f0e9;" +
      "border-left:3px solid var(--contribly-accent);border-radius:0 8px 8px 0;font-size:14px;white-space:pre-line;}" +
      ".contribly-widget__response-label{font-weight:600;font-size:12px;color:var(--contribly-accent);margin-bottom:4px;}";
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

  function formatDate(isoString) {
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
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

    html += '<div class="contribly-widget__body">';

    if (contribution.headline) {
      html += '<h3 class="contribly-widget__headline">' + escapeHtml(contribution.headline) + "</h3>";
    }
    if (contribution.body) {
      html += '<p class="contribly-widget__text">' + escapeHtml(contribution.body) + "</p>";
    }

    html += '<div class="contribly-widget__meta"><div class="contribly-widget__meta-row">';

    var displayName = contribution.attribution || "Community contributor";
    html += '<span class="contribly-widget__name">' + escapeHtml(displayName) + "</span>";

    if (contribution.created) {
      html += '<span class="contribly-widget__date">' + formatDate(contribution.created) + "</span>";
    }
    html += "</div>"; // end meta-row

    var place = contribution.place;
    if (place && place.name) {
      html +=
        '<div class="contribly-widget__location">' +
        LOCATION_PIN_SVG +
        "<span>" +
        escapeHtml(place.name) +
        "</span></div>";
    }

    if (contribution.journalistResponse && contribution.journalistResponse.text) {
      html +=
        '<div class="contribly-widget__response">' +
        '<div class="contribly-widget__response-label">Journalist response</div>' +
        escapeHtml(contribution.journalistResponse.text) +
        "</div>";
    }

    html += "</div></div>"; // end meta, end body

    container.innerHTML = html;
    container.classList.add("is-ready");
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
