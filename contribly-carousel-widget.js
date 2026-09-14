/*
  CONTRIBLY - AUTO-ADVANCING CONTRIBUTION CAROUSEL (for a whole assignment/call-out)
  ===================================================================================
  HOW TO EMBED THIS ON A PAGE (once this file is hosted somewhere public):

    <div class="contribly-carousel" data-assignment="THE-ASSIGNMENT-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-carousel-widget.js" defer></script>

  WHAT THIS DOES:
    Shows one contribution at a time from an assignment (call-out), full card,
    nothing hidden behind a click. Advances automatically:
      - Photo/text contributions: every 2.5 seconds.
      - Video contributions: autoplays (muted, required by browsers), advances
        when the video ends rather than on a fixed timer.
    Loops back to the first contribution after the last one.

  TRANSITIONS:
    Outgoing and incoming cards genuinely overlap and slide past each other
    (direction matches travel: next slides in from the right, previous from
    the left), rather than a sequential fade-to-blank-then-fade-in. Cards
    vary a lot in height (video vs text-only vs a long journalist reply), so
    the frame around them briefly resizes to whichever is taller during the
    ~320ms transition, then settles to the new card's natural height.

  INTERACTION MODEL (mobile-first):
    - Press and hold anywhere on the card content to pause (freezes the timer,
      or pauses the video). No visible pause icon, the hold itself is the cue.
    - Release: waits 6 seconds before resuming, so someone who just let go
      has a moment to finish reading before it moves on.
    - A clear horizontal swipe (not just a hold) navigates immediately,
      skipping that 6-second grace pause since it's a deliberate action.
    - Left/right arrow buttons overlaid on the frame for manual navigation.
    - Dots below show position only (not tappable).

  LIKES AND SHARING:
    - Likes post to /1/contributions/{id}/widgetlike, mirroring what
      Contribly's own gallery widget actually calls in production (a one-way
      "add a like", not the documented /like toggle endpoint). "Already
      liked" is remembered in the visitor's own browser storage, not tied to
      any account.
    - Share uses the native OS share sheet where available, falling back to
      copying a link that reopens the widget on that exact contribution
      (via a ?contributionID= parameter), the same trick the official widget
      uses, then tidies that parameter back out of the URL once landed.

  DATA:
    - GET /1/contributions?assignment={id}&pageSize=&page= to list contributions,
      fetched a page at a time as the carousel nears the end of what's loaded.
    - A HEAD request first reads X-Total-Count so dots know the total without
      downloading everything.
    - Field notes: contributor name -> attribution, location -> place,
      journalist reply -> journalistResponse.text (may contain safe HTML,
      sanitised with an allow-list), media artifacts -> mediaUsages[0].artifacts
      (not nested inside .media), video artifacts share their array with
      poster images and an audio-only track so we pick by contentType.

  ACCESSIBILITY:
    The journalist-reply icon's hidden label uses Contribly's own real
    translations for this concept ("Response"/"Réponse"/"Reactie"/etc),
    taken from their gallery widget rather than guessed.
*/

(function () {
  var STYLE_ID = "contribly-carousel-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var DWELL_MS = 2500;
  var HOLD_RELEASE_GRACE_MS = 6000;
  var MAX_VISIBLE_DOTS = 8;
  var TRANSITION_MS = 320;
  var SWIPE_THRESHOLD_PX = 40;
  var MAX_DEEP_LINK_PAGES = 20;
  var LIKED_STORAGE_PREFIX = "contribly-liked-";

  var LOCATION_PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/>' +
    '<circle cx="12" cy="9.5" r="2.3"/></svg>';
  var REPLY_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.7 8.7 0 0 1-4-1L3 20l1.1-5.5a8.4 8.4 0 0 1-1-4A8.38 8.38 0 0 1 11.6 2a8.5 8.5 0 0 1 9.4 9.5z"/></svg>';
  var CHEVRON_LEFT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
  var CHEVRON_RIGHT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
  var MUTE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  var UNMUTE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a9 9 0 0 1 0 12"/></svg>';
  var ALERT_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>';
  var HEART_OUTLINE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var HEART_FILLED_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">' +
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var SHARE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

  // Real Contribly wording for "journalist reply", taken from their own
  // gallery widget (contribution.response), not guessed. loadError has no
  // equivalent there so stays English-only until we have one.
  var TRANSLATIONS = {
    "en-gb": { newsroomReply: "Response", loadError: "This contribution couldn't be loaded.", prev: "Previous", next: "Next" },
    "en-us": { newsroomReply: "Response", loadError: "This contribution couldn't be loaded.", prev: "Previous", next: "Next" },
    "en-ie": { newsroomReply: "Response", loadError: "This contribution couldn't be loaded.", prev: "Previous", next: "Next" },
    "fr-fr": { newsroomReply: "Réponse", loadError: "This contribution couldn't be loaded.", prev: "Précédent", next: "Suivant" },
    "nl-nl": { newsroomReply: "Reactie", loadError: "This contribution couldn't be loaded.", prev: "Vorige", next: "Volgende" },
    "nl-be": { newsroomReply: "Reactie", loadError: "This contribution couldn't be loaded.", prev: "Vorige", next: "Volgende" },
    "es-es": { newsroomReply: "Respuesta", loadError: "This contribution couldn't be loaded.", prev: "Anterior", next: "Siguiente" },
    "de-de": { newsroomReply: "Antwort", loadError: "This contribution couldn't be loaded.", prev: "Zurück", next: "Vor" },
    "fi-fi": { newsroomReply: "Vastaus", loadError: "This contribution couldn't be loaded.", prev: "Edellinen", next: "Seuraava" },
    "hr-hr": { newsroomReply: "Odgovor", loadError: "This contribution couldn't be loaded.", prev: "Prethodno", next: "Sljedeće" },
    "ro-ro": { newsroomReply: "Răspuns", loadError: "This contribution couldn't be loaded.", prev: "Anterior", next: "Următorul" },
  };
  var DEFAULT_LANGUAGE = "en-gb";

  function translate(lang, key) {
    var normalised = (lang || DEFAULT_LANGUAGE).toLowerCase();
    if (TRANSLATIONS[normalised] && TRANSLATIONS[normalised][key]) return TRANSLATIONS[normalised][key];
    var base = normalised.split("-")[0];
    var baseMatch = Object.keys(TRANSLATIONS).filter(function (c) { return c.split("-")[0] === base; })[0];
    if (baseMatch) return TRANSLATIONS[baseMatch][key];
    return TRANSLATIONS[DEFAULT_LANGUAGE][key];
  }

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".contribly-carousel{--contribly-bg:#ffffff;--contribly-border:#e9e8f2;--contribly-ink:#17171a;" +
      "--contribly-muted:#6e6e76;--contribly-accent:#4f46e5;--contribly-accent-tint:#eef0ff;" +
      "--contribly-shadow:rgba(20,20,43,.05);--contribly-shimmer-a:#eeedf7;--contribly-shimmer-b:#f7f6fc;" +
      "--contribly-like-color:#e0245e;" +
      "--contribly-radius:16px;--contribly-font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "max-width:400px;width:100%;box-sizing:border-box;font-family:var(--contribly-font);color:var(--contribly-ink);}" +
      "@media (prefers-color-scheme:dark){.contribly-carousel{--contribly-bg:#1c1c22;--contribly-border:#2e2e38;" +
      "--contribly-ink:#f2f1f7;--contribly-muted:#a3a2ad;--contribly-accent:#a5a0fb;--contribly-accent-tint:#2b2757;" +
      "--contribly-shadow:rgba(0,0,0,.35);--contribly-shimmer-a:#2a2a33;--contribly-shimmer-b:#34343f;}}" +
      ".contribly-carousel *{box-sizing:border-box;}" +
      ".contribly-carousel__stage{position:relative;touch-action:pan-y;}" +
      ".contribly-carousel__frame{position:relative;background:var(--contribly-bg);border-radius:var(--contribly-radius);" +
      "overflow:hidden;border:0.5px solid var(--contribly-border);box-shadow:0 1px 2px var(--contribly-shadow),0 8px 20px var(--contribly-shadow);" +
      "-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}" +
      ".contribly-carousel__slide{position:absolute;top:0;left:0;width:100%;}" +
      ".contribly-carousel__loading{aspect-ratio:4/3;background:linear-gradient(90deg,var(--contribly-shimmer-a) 25%,var(--contribly-shimmer-b) 37%,var(--contribly-shimmer-a) 63%);" +
      "background-size:400% 100%;animation:contribly-carousel-shimmer 1.4s ease infinite;border-radius:var(--contribly-radius);}" +
      "@keyframes contribly-carousel-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".contribly-carousel__error{padding:24px 16px;color:var(--contribly-muted);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;}" +
      ".contribly-carousel__error svg{width:22px;height:22px;}" +
      ".contribly-carousel__header{display:flex;align-items:center;gap:10px;padding:14px 16px;}" +
      ".contribly-carousel__avatar{width:36px;height:36px;border-radius:50%;background:var(--contribly-accent-tint);" +
      "display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:var(--contribly-accent);flex-shrink:0;}" +
      ".contribly-carousel__identity{flex:1;min-width:0;}" +
      ".contribly-carousel__name{font-weight:600;font-size:14px;margin:0;color:var(--contribly-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".contribly-carousel__location{display:flex;align-items:center;gap:4px;margin-top:2px;font-size:12px;color:var(--contribly-muted);}" +
      ".contribly-carousel__location svg{width:12px;height:12px;flex-shrink:0;}" +
      ".contribly-carousel__date{font-size:12px;color:var(--contribly-muted);white-space:nowrap;margin-left:auto;}" +
      ".contribly-carousel__media-wrap{position:relative;}" +
      ".contribly-carousel__media{display:block;width:100%;height:auto;object-fit:cover;background:var(--contribly-accent-tint);-webkit-touch-callout:none;}" +
      ".contribly-carousel__mute{position:absolute;bottom:10px;right:10px;width:32px;height:32px;border-radius:50%;" +
      "background:rgba(0,0,0,.45);border:none;color:#fff;display:flex;align-items:center;justify-content:center;}" +
      ".contribly-carousel__mute svg{width:16px;height:16px;}" +
      ".contribly-carousel__arrow{position:absolute;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;" +
      "background:var(--contribly-bg);opacity:.9;border:0.5px solid var(--contribly-border);display:flex;align-items:center;" +
      "justify-content:center;color:var(--contribly-ink);z-index:2;}" +
      ".contribly-carousel__arrow svg{width:18px;height:18px;}" +
      ".contribly-carousel__arrow--prev{left:8px;}" +
      ".contribly-carousel__arrow--next{right:8px;}" +
      ".contribly-carousel__content{padding:14px 16px 16px;}" +
      ".contribly-carousel__headline{font-weight:600;font-size:14px;margin:0 0 6px;color:var(--contribly-ink);}" +
      ".contribly-carousel__text{font-size:14px;line-height:1.6;margin:0 0 12px;color:var(--contribly-ink);}" +
      ".contribly-carousel__content > .contribly-carousel__text:last-child{margin-bottom:0;}" +
      ".contribly-carousel__response{background:var(--contribly-accent-tint);border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;}" +
      ".contribly-carousel__response svg{width:20px;height:20px;flex-shrink:0;margin-top:1px;color:var(--contribly-accent);}" +
      ".contribly-carousel__response-body{font-size:13px;line-height:1.6;color:var(--contribly-ink);white-space:pre-line;}" +
      ".contribly-carousel__response-body p{margin:0 0 8px;}" +
      ".contribly-carousel__response-body p:last-child{margin-bottom:0;}" +
      ".contribly-carousel__response-body a{color:var(--contribly-accent);text-decoration:underline;}" +
      ".contribly-carousel__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}" +
      ".contribly-carousel__likes{display:flex;align-items:center;justify-content:space-between;}" +
      ".contribly-carousel__like-btn,.contribly-carousel__share-btn{background:none;border:none;padding:4px;display:flex;" +
      "align-items:center;gap:6px;color:var(--contribly-muted);cursor:pointer;}" +
      ".contribly-carousel__like-btn{padding-left:0;}" +
      ".contribly-carousel__like-btn svg,.contribly-carousel__share-btn svg{width:20px;height:20px;flex-shrink:0;transition:transform 150ms ease;}" +
      ".contribly-carousel__like-btn.liked{color:var(--contribly-like-color);}" +
      ".contribly-carousel__like-btn.liked svg{transform:scale(1.15);}" +
      ".contribly-carousel__share-btn.copied{color:var(--contribly-accent);}" +
      ".contribly-carousel__like-count{font-size:13px;}" +
      ".contribly-carousel__dots{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:12px;}" +
      ".contribly-carousel__dot{width:6px;height:6px;border-radius:50%;background:var(--contribly-border);flex-shrink:0;}" +
      ".contribly-carousel__dot--active{width:16px;height:6px;border-radius:3px;background:var(--contribly-border);overflow:hidden;position:relative;}" +
      ".contribly-carousel__dot--active .fill{position:absolute;left:0;top:0;bottom:0;width:0%;background:var(--contribly-accent);}" +
      ".contribly-carousel__dot--active .fill.running{animation-name:contribly-carousel-fill;animation-timing-function:linear;animation-fill-mode:forwards;}" +
      ".contribly-carousel__dot--active .fill.held{animation-play-state:paused;}" +
      "@keyframes contribly-carousel-fill{from{width:0%}to{width:100%}}";
    document.head.appendChild(style);
  }

  var domPurifyCallbacks = [];
  var domPurifyLoading = false;
  var domPurifyHookAdded = false;

  function ensureDOMPurify(callback) {
    if (window.DOMPurify) { addSafeLinkHookOnce(); callback(); return; }
    domPurifyCallbacks.push(callback);
    if (domPurifyLoading) return;
    domPurifyLoading = true;
    var script = document.createElement("script");
    script.src = DOMPURIFY_SRC;
    script.onload = function () {
      addSafeLinkHookOnce();
      domPurifyCallbacks.forEach(function (cb) { cb(); });
      domPurifyCallbacks = [];
    };
    script.onerror = function () {
      domPurifyCallbacks.forEach(function (cb) { cb(); });
      domPurifyCallbacks = [];
    };
    document.head.appendChild(script);
  }

  function addSafeLinkHookOnce() {
    if (domPurifyHookAdded || !window.DOMPurify) return;
    domPurifyHookAdded = true;
    window.DOMPurify.addHook("afterSanitizeAttributes", function (node) {
      if (node.tagName === "A") { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
    });
  }

  function sanitiseResponseHtml(rawText) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(rawText, {
        ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "br", "p"],
        ALLOWED_ATTR: ["href", "target", "rel"],
      });
    }
    return escapeHtml(rawText);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(isoString, lang) {
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString(lang || DEFAULT_LANGUAGE, { day: "numeric", month: "short" });
    } catch (e) { return ""; }
  }

  function getInitials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function hasLikedLocally(id) {
    try { return window.localStorage.getItem(LIKED_STORAGE_PREFIX + id) === "1"; } catch (e) { return false; }
  }

  function markLikedLocally(id) {
    try { window.localStorage.setItem(LIKED_STORAGE_PREFIX + id, "1"); } catch (e) { /* private browsing etc: fine to no-op */ }
  }

  function sendLike(id) {
    // Mirrors the endpoint Contribly's own gallery widget actually calls in
    // production (a one-way "add a like", not a toggle). If Contribly
    // confirms the documented /like toggle is preferred, this is the one
    // line to change.
    fetch("https://api.contribly.com/1/contributions/" + encodeURIComponent(id) + "/widgetlike", { method: "POST" })
      .catch(function () { /* best-effort: the visible count is already updated locally */ });
  }

  function buildShareUrl(id) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("contributionID", id);
      return url.toString();
    } catch (e) { return window.location.href; }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function getSharedContributionId() {
    try { return new URLSearchParams(window.location.search).get("contributionID"); } catch (e) { return null; }
  }

  function clearSharedContributionIdFromUrl() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("contributionID");
      window.history.replaceState({}, document.title, url.toString());
    } catch (e) { /* non-fatal */ }
  }

  function pickArtifactByType(artifacts, contentTypePrefix, preferredLabels) {
    var candidates = artifacts.filter(function (a) { return a.url && a.contentType && a.contentType.indexOf(contentTypePrefix) === 0; });
    if (!candidates.length) return null;
    for (var i = 0; i < preferredLabels.length; i++) {
      var match = candidates.filter(function (a) { return a.label === preferredLabels[i]; })[0];
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
      return { kind: "video", videoUrl: video.url, videoContentType: video.contentType, width: video.width, height: video.height, posterUrl: poster ? poster.url : null };
    }
    var image = pickArtifactByType(artifacts, "image/", ["large", "mediumlandscapecropdouble", "extralarge", "medium"]);
    if (!image) return null;
    return { kind: "image", imageUrl: image.url, width: image.width, height: image.height };
  }

  // ---- Per-widget instance ----

  function createInstance(root) {
    return {
      root: root,
      assignmentId: root.getAttribute("data-assignment"),
      lang: root.getAttribute("data-language") || DEFAULT_LANGUAGE,
      items: [],
      total: null,
      nextPage: 1,
      pageSize: 10,
      allLoaded: false,
      loadingPage: false,
      currentIndex: 0,
      dwellTimeoutId: null,
      resumeTimeoutId: null,
      slideStartedAt: null,
      pausedRemainingMs: null,
      isHeld: false,
      currentVideoEl: null,
      // Persistent DOM, created once by ensureStageStructure:
      stageEl: null,
      frameEl: null,
      dotsEl: null,
      currentSlideEl: null,
      activeDotFillEl: null,
    };
  }

  function apiUrl(inst, page) {
    return "https://api.contribly.com/1/contributions?assignment=" + encodeURIComponent(inst.assignmentId) +
      "&page=" + page + "&pageSize=" + inst.pageSize;
  }

  function fetchTotalCount(inst) {
    return fetch(apiUrl(inst, 1), { method: "HEAD" })
      .then(function (res) {
        var count = res.headers.get("X-Total-Count");
        inst.total = count ? parseInt(count, 10) : null;
      })
      .catch(function () { inst.total = null; });
  }

  function fetchPage(inst, page) {
    if (inst.loadingPage || inst.allLoaded) return Promise.resolve();
    inst.loadingPage = true;
    return fetch(apiUrl(inst, page))
      .then(function (res) { if (!res.ok) throw new Error("Request failed"); return res.json(); })
      .then(function (data) {
        var list = data.contributions || data || [];
        inst.items = inst.items.concat(list);
        inst.nextPage = page + 1;
        if (list.length < inst.pageSize) inst.allLoaded = true;
      })
      .finally(function () { inst.loadingPage = false; });
  }

  function maybePrefetch(inst) {
    if (!inst.allLoaded && inst.currentIndex >= inst.items.length - 2) fetchPage(inst, inst.nextPage);
  }

  function clearTimers(inst) {
    if (inst.dwellTimeoutId) { clearTimeout(inst.dwellTimeoutId); inst.dwellTimeoutId = null; }
    if (inst.resumeTimeoutId) { clearTimeout(inst.resumeTimeoutId); inst.resumeTimeoutId = null; }
  }

  // ---- Persistent chrome: created once, reused across every slide ----

  function ensureStageStructure(inst) {
    if (inst.stageEl) return;

    var stage = document.createElement("div");
    stage.className = "contribly-carousel__stage";

    var frame = document.createElement("div");
    frame.className = "contribly-carousel__frame";
    stage.appendChild(frame);

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "contribly-carousel__arrow contribly-carousel__arrow--prev";
    prevBtn.setAttribute("aria-label", translate(inst.lang, "prev"));
    prevBtn.innerHTML = CHEVRON_LEFT_SVG;
    prevBtn.addEventListener("click", function () { goToIndex(inst, inst.currentIndex - 1, -1); });
    stage.appendChild(prevBtn);

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "contribly-carousel__arrow contribly-carousel__arrow--next";
    nextBtn.setAttribute("aria-label", translate(inst.lang, "next"));
    nextBtn.innerHTML = CHEVRON_RIGHT_SVG;
    nextBtn.addEventListener("click", function () { goToIndex(inst, inst.currentIndex + 1, 1); });
    stage.appendChild(nextBtn);

    var dots = document.createElement("div");
    dots.className = "contribly-carousel__dots";

    inst.root.innerHTML = "";
    inst.root.appendChild(stage);
    inst.root.appendChild(dots);

    inst.stageEl = stage;
    inst.frameEl = frame;
    inst.dotsEl = dots;

    attachHoldHandlers(inst, stage);
  }

  function updateDots(inst) {
    var total = inst.total;
    inst.dotsEl.innerHTML = "";
    inst.activeDotFillEl = null;
    if (!total || total <= 1) return;
    var count = Math.min(total, MAX_VISIBLE_DOTS);
    var start = Math.max(0, Math.min(inst.currentIndex - Math.floor(count / 2), total - count));
    for (var i = 0; i < count; i++) {
      var itemIndex = start + i;
      var dot = document.createElement("span");
      if (itemIndex === inst.currentIndex) {
        dot.className = "contribly-carousel__dot contribly-carousel__dot--active";
        var fill = document.createElement("span");
        fill.className = "fill";
        dot.appendChild(fill);
        inst.activeDotFillEl = fill;
      } else {
        dot.className = "contribly-carousel__dot";
      }
      inst.dotsEl.appendChild(dot);
    }
  }

  function startDotFill(inst, durationMs) {
    if (!inst.activeDotFillEl) return;
    var fill = inst.activeDotFillEl;
    fill.style.animationDuration = durationMs + "ms";
    fill.classList.remove("running");
    void fill.offsetWidth; // restart the animation cleanly
    fill.classList.add("running");
  }

  function setDotFillHeld(inst, held) {
    if (inst.activeDotFillEl) inst.activeDotFillEl.classList.toggle("held", held);
  }

  function scheduleDwell(inst, ms) {
    inst.slideStartedAt = Date.now();
    inst.dwellTimeoutId = setTimeout(function () { advance(inst); }, ms);
  }

  function onHoldStart(inst) {
    if (inst.isHeld) return;
    inst.isHeld = true;
    setDotFillHeld(inst, true);
    if (inst.currentVideoEl) {
      inst.currentVideoEl.pause();
    } else if (inst.dwellTimeoutId) {
      var elapsed = Date.now() - inst.slideStartedAt;
      inst.pausedRemainingMs = Math.max(0, DWELL_MS - elapsed);
      clearTimeout(inst.dwellTimeoutId);
      inst.dwellTimeoutId = null;
    }
    if (inst.resumeTimeoutId) { clearTimeout(inst.resumeTimeoutId); inst.resumeTimeoutId = null; }
  }

  function onHoldEnd(inst) {
    if (!inst.isHeld) return;
    inst.isHeld = false;
    inst.resumeTimeoutId = setTimeout(function () {
      setDotFillHeld(inst, false);
      if (inst.currentVideoEl) {
        inst.currentVideoEl.play().catch(function () {});
      } else {
        scheduleDwell(inst, inst.pausedRemainingMs != null ? inst.pausedRemainingMs : DWELL_MS);
      }
    }, HOLD_RELEASE_GRACE_MS);
  }

  function attachHoldHandlers(inst, stageEl) {
    var isControl = function (target) {
      return !!(target.closest && target.closest(
        ".contribly-carousel__arrow, .contribly-carousel__mute, .contribly-carousel__like-btn, .contribly-carousel__share-btn"
      ));
    };
    var swipeStart = null;

    stageEl.addEventListener("pointerdown", function (e) {
      if (isControl(e.target)) return;
      swipeStart = { x: e.clientX, y: e.clientY };
      onHoldStart(inst);
    });

    stageEl.addEventListener("pointerup", function (e) {
      if (isControl(e.target)) return;
      var wasSwipe = false;
      if (swipeStart) {
        var dx = e.clientX - swipeStart.x;
        var dy = e.clientY - swipeStart.y;
        if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
          wasSwipe = true;
          inst.isHeld = false;
          if (inst.resumeTimeoutId) { clearTimeout(inst.resumeTimeoutId); inst.resumeTimeoutId = null; }
          goToIndex(inst, inst.currentIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
        }
      }
      swipeStart = null;
      if (!wasSwipe) onHoldEnd(inst);
    });

    ["pointercancel", "pointerleave"].forEach(function (evt) {
      stageEl.addEventListener(evt, function (e) {
        if (isControl(e.target)) return;
        swipeStart = null;
        onHoldEnd(inst);
      });
    });
  }

  // ---- Slide navigation and the overlapping transition ----

  function goToIndex(inst, index, direction) {
    clearTimers(inst);
    if (inst.currentVideoEl) { inst.currentVideoEl.pause(); inst.currentVideoEl = null; }
    var len = inst.items.length;
    if (len === 0) return;
    var newIndex = index;
    if (newIndex >= len) newIndex = inst.allLoaded ? 0 : len - 1;
    if (newIndex < 0) newIndex = inst.allLoaded ? len - 1 : 0;
    inst.currentIndex = newIndex;

    var newSlide = buildSlide(inst);
    mountSlide(inst, newSlide, direction || 1);
    updateDots(inst);
    maybePrefetch(inst);
  }

  function advance(inst) { goToIndex(inst, inst.currentIndex + 1, 1); }

  function mountSlide(inst, newSlideEl, direction) {
    var frame = inst.frameEl;
    var oldSlideEl = inst.currentSlideEl;

    if (!oldSlideEl) {
      // First slide ever: no previous card to transition from, just show it.
      newSlideEl.style.position = "absolute";
      newSlideEl.style.top = "0";
      newSlideEl.style.left = "0";
      newSlideEl.style.width = "100%";
      frame.appendChild(newSlideEl);
      frame.style.height = newSlideEl.offsetHeight + "px";
      inst.currentSlideEl = newSlideEl;
      return;
    }

    // Position the incoming slide off to the side (matching travel direction)
    // before it's visible, then measure it, then animate both cards past
    // each other while the frame resizes to the incoming card's height.
    newSlideEl.style.transition = "none";
    newSlideEl.style.transform = "translateX(" + (direction >= 0 ? "100%" : "-100%") + ")";
    newSlideEl.style.opacity = "0";
    frame.appendChild(newSlideEl);

    var oldHeight = oldSlideEl.offsetHeight;
    var newHeight = newSlideEl.offsetHeight;

    frame.style.transition = "none";
    frame.style.height = Math.max(oldHeight, newHeight) + "px";

    void frame.offsetHeight; // force reflow before re-enabling transitions

    frame.style.transition = "height " + TRANSITION_MS + "ms ease";
    newSlideEl.style.transition = "transform " + TRANSITION_MS + "ms ease, opacity " + TRANSITION_MS + "ms ease";
    oldSlideEl.style.transition = "transform " + TRANSITION_MS + "ms ease, opacity " + TRANSITION_MS + "ms ease";

    requestAnimationFrame(function () {
      frame.style.height = newHeight + "px";
      newSlideEl.style.transform = "translateX(0)";
      newSlideEl.style.opacity = "1";
      oldSlideEl.style.transform = "translateX(" + (direction >= 0 ? "-100%" : "100%") + ")";
      oldSlideEl.style.opacity = "0";
    });

    setTimeout(function () {
      if (oldSlideEl.parentNode) oldSlideEl.parentNode.removeChild(oldSlideEl);
    }, TRANSITION_MS + 30);

    inst.currentSlideEl = newSlideEl;
  }

  // Builds a slide's DOM and wires its internal behaviour (video, like,
  // share, response sanitising). Does NOT insert or animate it, that's
  // mountSlide's job, kept separate so this stays easy to reason about.
  function buildSlide(inst) {
    var item = inst.items[inst.currentIndex];
    var slide = document.createElement("div");
    slide.className = "contribly-carousel__slide";
    if (!item) return slide;

    var html = "";
    var displayName = item.attribution || "Community contributor";
    html += '<div class="contribly-carousel__header">';
    html += '<div class="contribly-carousel__avatar">' + escapeHtml(getInitials(displayName)) + "</div>";
    html += '<div class="contribly-carousel__identity"><p class="contribly-carousel__name">' + escapeHtml(displayName) + "</p>";
    var place = item.place;
    if (place && place.name) {
      html += '<div class="contribly-carousel__location">' + LOCATION_PIN_SVG + "<span>" + escapeHtml(place.name) + "</span></div>";
    }
    html += "</div>";
    if (item.created) html += '<span class="contribly-carousel__date">' + formatDate(item.created, inst.lang) + "</span>";
    html += "</div>";

    var mediaInfo = pickMedia(item.mediaUsages);
    html += '<div class="contribly-carousel__media-wrap">';
    if (mediaInfo) {
      var ratioStyle = mediaInfo.width && mediaInfo.height ? ' style="aspect-ratio:' + mediaInfo.width + "/" + mediaInfo.height + ';"' : "";
      if (mediaInfo.kind === "video") {
        html += '<video class="contribly-carousel__media" muted playsinline autoplay preload="auto"' + ratioStyle +
          (mediaInfo.posterUrl ? ' poster="' + mediaInfo.posterUrl + '"' : "") +
          '><source src="' + mediaInfo.videoUrl + '" type="' + (mediaInfo.videoContentType || "video/mp4") + '"></video>';
        html += '<button class="contribly-carousel__mute" type="button" aria-label="Toggle sound">' + MUTE_SVG + "</button>";
      } else {
        html += '<img class="contribly-carousel__media" src="' + mediaInfo.imageUrl + '" alt=""' + ratioStyle + " />";
      }
    }
    html += "</div>";

    html += '<div class="contribly-carousel__content">';
    if (item.headline) html += '<p class="contribly-carousel__headline">' + escapeHtml(item.headline) + "</p>";
    if (item.body) html += '<p class="contribly-carousel__text">' + escapeHtml(item.body) + "</p>";
    var hasResponse = item.journalistResponse && item.journalistResponse.text;
    if (hasResponse) {
      html += '<div class="contribly-carousel__response"><span class="contribly-carousel__sr-only">' +
        escapeHtml(translate(inst.lang, "newsroomReply")) + "</span>" + REPLY_ICON_SVG +
        '<div class="contribly-carousel__response-body"></div></div>';
    }

    var likeCount = typeof item.allLikes === "number" ? item.allLikes : 0;
    var alreadyLiked = hasLikedLocally(item.id);
    html += '<div class="contribly-carousel__likes">' +
      '<button type="button" class="contribly-carousel__like-btn' + (alreadyLiked ? " liked" : "") + '" aria-pressed="' + (alreadyLiked ? "true" : "false") + '">' +
      (alreadyLiked ? HEART_FILLED_SVG : HEART_OUTLINE_SVG) +
      '<span class="contribly-carousel__like-count">' + likeCount + "</span></button>" +
      '<button type="button" class="contribly-carousel__share-btn" aria-label="Share">' + SHARE_SVG + "</button>" +
      "</div>";
    html += "</div>";

    slide.innerHTML = html;

    if (hasResponse) {
      ensureDOMPurify(function () {
        var bodyEl = slide.querySelector(".contribly-carousel__response-body");
        if (bodyEl) bodyEl.innerHTML = sanitiseResponseHtml(item.journalistResponse.text);
      });
    }

    var likeBtn = slide.querySelector(".contribly-carousel__like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", function () {
        if (hasLikedLocally(item.id)) return;
        markLikedLocally(item.id);
        item.allLikes = likeCount + 1;
        likeBtn.classList.add("liked");
        likeBtn.setAttribute("aria-pressed", "true");
        likeBtn.innerHTML = HEART_FILLED_SVG + '<span class="contribly-carousel__like-count">' + item.allLikes + "</span>";
        sendLike(item.id);
      });
    }

    var shareBtn = slide.querySelector(".contribly-carousel__share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", function () {
        var url = buildShareUrl(item.id);
        if (navigator.share) {
          navigator.share({ url: url, title: item.headline || undefined, text: item.body || undefined }).catch(function () {});
          return;
        }
        copyToClipboard(url).then(function () {
          var original = shareBtn.innerHTML;
          shareBtn.innerHTML = CHECK_SVG;
          shareBtn.classList.add("copied");
          setTimeout(function () { shareBtn.innerHTML = original; shareBtn.classList.remove("copied"); }, 1500);
        });
      });
    }

    var videoEl = slide.querySelector("video");
    if (videoEl) {
      inst.currentVideoEl = videoEl;
      videoEl.addEventListener("ended", function () { advance(inst); });
      videoEl.addEventListener("loadedmetadata", function () {
        if (videoEl.duration && isFinite(videoEl.duration)) startDotFill(inst, videoEl.duration * 1000);
      });
      var muteBtn = slide.querySelector(".contribly-carousel__mute");
      if (muteBtn) {
        muteBtn.addEventListener("click", function () {
          videoEl.muted = !videoEl.muted;
          muteBtn.innerHTML = videoEl.muted ? MUTE_SVG : UNMUTE_SVG;
        });
      }
      videoEl.play().catch(function () {});
    } else {
      startDotFill(inst, DWELL_MS);
      scheduleDwell(inst, DWELL_MS);
    }

    return slide;
  }

  function renderError(inst) {
    inst.root.innerHTML = '<div class="contribly-carousel__error">' + ALERT_ICON_SVG +
      '<span class="contribly-carousel__sr-only">' + escapeHtml(translate(inst.lang, "loadError")) + "</span></div>";
  }

  function findIndexById(inst, id) {
    for (var i = 0; i < inst.items.length; i++) if (inst.items[i].id === id) return i;
    return -1;
  }

  function resolveStartIndex(inst, targetId) {
    if (!targetId) return Promise.resolve(0);
    var foundIndex = findIndexById(inst, targetId);
    if (foundIndex !== -1) return Promise.resolve(foundIndex);
    if (inst.allLoaded || inst.nextPage > MAX_DEEP_LINK_PAGES) return Promise.resolve(0);
    return fetchPage(inst, inst.nextPage).then(function () { return resolveStartIndex(inst, targetId); });
  }

  function initInstance(root) {
    injectStylesOnce();
    root.setAttribute("data-contribly-initialised", "true");
    var inst = createInstance(root);
    if (!inst.assignmentId) { renderError(inst); return; }
    root.innerHTML = '<div class="contribly-carousel__loading"></div>';

    var sharedId = getSharedContributionId();

    Promise.all([fetchTotalCount(inst), fetchPage(inst, 1)])
      .then(function () { return resolveStartIndex(inst, sharedId); })
      .then(function (startIndex) {
        if (!inst.items.length) { renderError(inst); return; }
        if (sharedId) clearSharedContributionIdFromUrl();
        ensureStageStructure(inst);
        goToIndex(inst, startIndex);
      })
      .catch(function () { renderError(inst); });
  }

  function init() {
    var widgets = document.querySelectorAll(".contribly-carousel:not([data-contribly-initialised])");
    widgets.forEach(initInstance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
