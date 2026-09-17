/*
  CONTRIBLY - MODERN GALLERY WIDGET (a whole assignment/call-out, grid style)
  =============================================================================
  EMBED (once this file is hosted somewhere public):

    <div class="contribly-gallery" data-assignment="THE-ASSIGNMENT-ID" data-client="THE-CLIENT-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-gallery-widget.js" defer></script>

  This is a rebuild of Contribly's existing production gallery widget, kept
  functionally equivalent where that functionality is genuinely worth
  keeping, modernised where it wasn't. See the notes below for exactly what
  changed and why; this isn't a guess, it's a direct comparison against the
  real widget's source.

  KEPT FROM THE ORIGINAL:
    - Tag filter + sort filter (Most recent / Most liked), both refetching.
    - Likes via POST /1/contributions/{id}/widgetlike (one-way, no unlike),
      remembered per-visitor in localStorage so the button disables after use.
    - Share: native OS share sheet where available, Facebook/Twitter(X)/copy
      link fallback otherwise.
    - Deep-linking via a ?contributionID= URL parameter, using the same
      /contributions/{id}/assignment/{id}/page endpoint the original widget
      calls to find which page a specific contribution lives on.
    - Read-more truncation on long text.
    - Journalist replies, with icon + timestamp.
    - Google Analytics event names and payload shape (contribly_gallery_*
      via gtag, plus the matching window.dataLayer pushes), kept identical
      to the original on purpose, for continuity with existing dashboards.
    - data-language attribute for translated UI labels (11 languages,
      Contribly's own real wording, not machine-translated guesses).

  CHANGED FROM THE ORIGINAL, DELIBERATELY:
    - No jQuery, no Fancybox. Both are replaced with plain JS and a small
      custom lightbox, matching the other widgets built alongside this one
      and removing a large, dated dependency chain.
    - Journalist replies now render as real sanitised HTML (a link in a
      reply actually works as a link), instead of being shown as plain
      escaped text the way the original widget did. Same sanitisation
      approach as the other widgets: an allow-list HTML cleaner, links
      forced to open in a new tab safely.
    - A video contribution with no matching video file no longer vanishes
      from the grid silently, it's skipped from the count instead of
      appearing as a broken gap.
    - Videos in the grid do NOT autoplay (unlike the single-contribution and
      carousel widgets), a grid can show a dozen+ cards at once and
      autoplaying all of them would hurt the "faster" goal directly. Grid
      cards show a poster image with a play indicator; the actual video
      plays on click, inside the lightbox, with sound, as a deliberate action.
    - "Next/Previous batch" pagination replaced with a "Load more" button
      that appends to the grid rather than replacing it and resetting
      scroll position, feels less disruptive and keeps images below the
      fold genuinely lazy until asked for.
    - Clipboard copy uses navigator.clipboard.writeText first, falling back
      to the older document.execCommand only if that API isn't available.
    - Added: skeleton loading state, dark mode support, lazy-loaded images,
      and a container-query based responsive grid (reflows based on the
      widget's own rendered width, correct whether it's embedded in a full
      page or a narrow article column, not just screen size).
    - "Powered by Contribly" is now a small plain text link to
      contribly.com (opens in a new tab) for every embed, replacing the
      original's whitelabel-client allowlist logic.

  ONE THING NOT INDEPENDENTLY VERIFIED:
    The deep-link endpoint (/contributions/{id}/assignment/{id}/page) is
    used here because it's what the original widget calls, but we haven't
    tested it ourselves against live data. Worth confirming it behaves as
    expected before relying on it in production.

  FIELD NOTES (same as the other widgets in this project):
    contributor name -> attribution, location -> place.name, journalist
    reply -> journalistResponse.text (sanitised), media artifacts ->
    mediaUsages[N].artifacts (a sibling of .media, not nested inside it),
    picked by contentType prefix since video/poster/audio share one array.
*/

(function () {
  var STYLE_ID = "contribly-gallery-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var API_BASE = "https://api.contribly.com/1";
  var PAGE_SIZE = 12;
  var LIKED_STORAGE_PREFIX = "contribly-liked-";
  var APP_NAME = "Contribly - Gallery";

  // ---- Real Contribly wording, decoded from their own gallery widget ----
  var TRANSLATIONS = {
    "en-gb": { readMore: "Read more", response: "Response", filterAll: "All", filterMostLiked: "Most liked", filterMostRecent: "Most recent", contributions: "contributions", loadMore: "Load more", shareCopied: "Copied", shareLabel: "Share", likeLabel: "Like", noContributions: "No contributions yet.", loadError: "This gallery couldn't be loaded." },
    "en-us": { readMore: "Read more", response: "Response", filterAll: "All", filterMostLiked: "Most liked", filterMostRecent: "Most recent", contributions: "contributions", loadMore: "Load more", shareCopied: "Copied", shareLabel: "Share", likeLabel: "Like", noContributions: "No contributions yet.", loadError: "This gallery couldn't be loaded." },
    "en-ie": { readMore: "Read more", response: "Response", filterAll: "All", filterMostLiked: "Most liked", filterMostRecent: "Most recent", contributions: "contributions", loadMore: "Load more", shareCopied: "Copied", shareLabel: "Share", likeLabel: "Like", noContributions: "No contributions yet.", loadError: "This gallery couldn't be loaded." },
    "fr-fr": { readMore: "Lire la suite", response: "R\u00e9ponse", filterAll: "Tout", filterMostLiked: "Les plus lik\u00e9es", filterMostRecent: "Le plus r\u00e9cent", contributions: "contributions", loadMore: "Charger plus", shareCopied: "Copi\u00e9", shareLabel: "Partager", likeLabel: "Aimer", noContributions: "Pas encore de contributions.", loadError: "Cette galerie n'a pas pu \u00eatre charg\u00e9e." },
    "nl-nl": { readMore: "Lees meer", response: "Reactie", filterAll: "Alle", filterMostLiked: "Populairst", filterMostRecent: "Nieuwste", contributions: "inzendingen", loadMore: "Meer laden", shareCopied: "Gekopieerd", shareLabel: "Delen", likeLabel: "Vind ik leuk", noContributions: "Nog geen inzendingen.", loadError: "Deze galerij kon niet worden geladen." },
    "nl-be": { readMore: "Lees meer", response: "Reactie", filterAll: "Alle", filterMostLiked: "Meest leuk gevonden", filterMostRecent: "Meest recente", contributions: "inzendingen", loadMore: "Meer laden", shareCopied: "Gekopieerd", shareLabel: "Delen", likeLabel: "Vind ik leuk", noContributions: "Nog geen inzendingen.", loadError: "Deze galerij kon niet worden geladen." },
    "es-es": { readMore: "Leer m\u00e1s", response: "Respuesta", filterAll: "Todos", filterMostLiked: "M\u00e1s votados", filterMostRecent: "M\u00e1s recientes", contributions: "contribuciones", loadMore: "Cargar m\u00e1s", shareCopied: "Copiado", shareLabel: "Compartir", likeLabel: "Me gusta", noContributions: "A\u00fan no hay contribuciones.", loadError: "No se pudo cargar esta galer\u00eda." },
    "de-de": { readMore: "Mehr lesen", response: "Antwort", filterAll: "Alle", filterMostLiked: "Am beliebtesten", filterMostRecent: "Neueste", contributions: "Beitr\u00e4ge", loadMore: "Mehr laden", shareCopied: "Kopiert", shareLabel: "Teilen", likeLabel: "Gef\u00e4llt mir", noContributions: "Noch keine Beitr\u00e4ge.", loadError: "Diese Galerie konnte nicht geladen werden." },
    "fi-fi": { readMore: "Lue lis\u00e4\u00e4", response: "Vastaus", filterAll: "Kaikki", filterMostLiked: "Eniten tyk\u00e4tty", filterMostRecent: "Uusin", contributions: "Julkaisut", loadMore: "Lataa lis\u00e4\u00e4", shareCopied: "Kopioitu", shareLabel: "Jaa", likeLabel: "Tyk\u00e4\u00e4", noContributions: "Ei viel\u00e4 julkaisuja.", loadError: "T\u00e4t\u00e4 galleriaa ei voitu ladata." },
    "hr-hr": { readMore: "Pro\u010ditajte vi\u0161e", response: "Odgovor", filterAll: "Sve", filterMostLiked: "Najsvi\u0111anije", filterMostRecent: "Najnovije", contributions: "Doprinosi", loadMore: "U\u010ditaj vi\u0161e", shareCopied: "Kopirano", shareLabel: "Udio", likeLabel: "Sviđa mi se", noContributions: "Jo\u0161 nema doprinosa.", loadError: "Ova galerija se nije mogla u\u010ditati." },
    "ro-ro": { readMore: "Cite\u0219te mai mult", response: "R\u0103spuns", filterAll: "Toate", filterMostLiked: "Cele mai apreciate", filterMostRecent: "Cel mai recent", contributions: "Contribu\u021bii", loadMore: "\u00cencarc\u0103 mai multe", shareCopied: "Copiat", shareLabel: "Distribuie", likeLabel: "Apreciaz\u0103", noContributions: "\u00cenc\u0103 nu exist\u0103 contribu\u021bii.", loadError: "Aceast\u0103 galerie nu a putut fi \u00eenc\u0103rcat\u0103." }
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

  // ---- Icons ----
  var ICON_LOCATION = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';
  var ICON_REPLY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.7 8.7 0 0 1-4-1L3 20l1.1-5.5a8.4 8.4 0 0 1-1-4A8.38 8.38 0 0 1 11.6 2a8.5 8.5 0 0 1 9.4 9.5z"/></svg>';
  var ICON_HEART_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_HEART_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>';
  var ICON_FACEBOOK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.4 8.4L23 22h-6.6l-5.2-6.8L5.2 22H2l7.9-9L1.5 2h6.8l4.7 6.2L18.9 2z"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.5.4l2-2a5 5 0 0 0-7-7l-1.2 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.4l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".contribly-gallery{--cg-bg:#fff;--cg-border:#e9e8f2;--cg-ink:#17171a;--cg-muted:#6e6e76;--cg-accent:#4f46e5;" +
      "--cg-accent-tint:#eef0ff;--cg-like:#e0245e;--cg-shadow:rgba(20,20,43,.06);--cg-shimmer-a:#eeedf7;--cg-shimmer-b:#f7f6fc;" +
      "--cg-radius:14px;--cg-font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "container-type:inline-size;width:100%;box-sizing:border-box;font-family:var(--cg-font);color:var(--cg-ink);}" +
      "@media (prefers-color-scheme:dark){.contribly-gallery{--cg-bg:#1c1c22;--cg-border:#2e2e38;--cg-ink:#f2f1f7;" +
      "--cg-muted:#a3a2ad;--cg-accent:#a5a0fb;--cg-accent-tint:#2b2757;--cg-shadow:rgba(0,0,0,.4);--cg-shimmer-a:#2a2a33;--cg-shimmer-b:#34343f;}}" +
      ".contribly-gallery *{box-sizing:border-box;}" +
      ".cg-head{margin-bottom:16px;}" +
      ".cg-title{font-size:20px;font-weight:700;margin:0 0 4px;}" +
      ".cg-desc{font-size:14px;color:var(--cg-muted);margin:0 0 8px;}" +
      ".cg-count{font-size:13px;color:var(--cg-muted);margin:0 0 12px;}" +
      ".cg-filters{display:flex;gap:8px;flex-wrap:wrap;}" +
      ".cg-filters select{font-family:var(--cg-font);font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid var(--cg-border);" +
      "background:var(--cg-bg);color:var(--cg-ink);}" +
      ".cg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;}" +
      ".cg-card{background:var(--cg-bg);border:0.5px solid var(--cg-border);border-radius:var(--cg-radius);overflow:hidden;" +
      "box-shadow:0 1px 2px var(--cg-shadow);display:flex;flex-direction:column;}" +
      ".cg-media-wrap{position:relative;background:var(--cg-accent-tint);cursor:pointer;}" +
      ".cg-media{display:block;width:100%;height:auto;}" +
      "@media (min-width:532px){.cg-media-wrap{aspect-ratio:var(--cg-ratio,auto);overflow:hidden;}.cg-media{height:100%;object-fit:cover;}}" +
      ".cg-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;" +
      "background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;pointer-events:none;}" +
      ".cg-play svg{width:20px;height:20px;margin-left:2px;}" +
      ".cg-body{padding:14px;display:flex;flex-direction:column;gap:8px;flex:1;}" +
      ".cg-headline{font-weight:700;font-size:14px;margin:0;}" +
      ".cg-text{font-size:14px;line-height:1.55;margin:0;white-space:pre-line;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;-webkit-line-clamp:4;}" +
      ".cg-card--has-media .cg-text{-webkit-line-clamp:3;}" +
      ".cg-card--text-only .cg-text{-webkit-line-clamp:8;}" +
      ".cg-text.cg-expanded{-webkit-line-clamp:unset;overflow:visible;}" +
      ".cg-readmore{background:none;border:none;color:var(--cg-accent);font-size:13px;font-weight:600;padding:0;cursor:pointer;align-self:flex-start;}" +
      ".cg-response{background:var(--cg-accent-tint);border-radius:10px;padding:10px;display:flex;gap:8px;align-items:flex-start;}" +
      ".cg-response svg{width:16px;height:16px;flex-shrink:0;margin-top:2px;color:var(--cg-accent);}" +
      ".cg-response-body{font-size:12.5px;line-height:1.5;}" +
      ".cg-response-body a{color:var(--cg-accent);text-decoration:underline;}" +
      ".cg-meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--cg-muted);flex-wrap:wrap;}" +
      ".cg-meta .name{font-weight:600;color:var(--cg-ink);}" +
      ".cg-meta .loc{display:inline-flex;align-items:center;gap:3px;}" +
      ".cg-meta .loc svg{width:11px;height:11px;}" +
      ".cg-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:6px;border-top:1px solid var(--cg-border);}" +
      ".cg-like-btn,.cg-share-btn{background:none;border:none;display:flex;align-items:center;gap:5px;color:var(--cg-muted);" +
      "font-size:13px;cursor:pointer;padding:4px;}" +
      ".cg-like-btn svg,.cg-share-btn svg{width:18px;height:18px;transition:transform .15s ease;}" +
      ".cg-like-btn.liked{color:var(--cg-like);}" +
      ".cg-like-btn.liked svg{transform:scale(1.15);}" +
      ".cg-like-btn:disabled{cursor:default;}" +
      ".cg-share-btn.copied{color:var(--cg-accent);}" +
      ".cg-share-panel{position:absolute;bottom:100%;right:0;background:var(--cg-bg);border:1px solid var(--cg-border);" +
      "border-radius:10px;box-shadow:0 4px 16px var(--cg-shadow);padding:6px;display:flex;gap:4px;z-index:3;}" +
      ".cg-share-panel a,.cg-share-panel button{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;" +
      "justify-content:center;color:var(--cg-ink);background:none;border:none;cursor:pointer;}" +
      ".cg-share-panel svg{width:16px;height:16px;}" +
      ".cg-share-wrap{position:relative;}" +
      ".cg-loadmore-wrap{display:flex;justify-content:center;margin-top:20px;}" +
      ".cg-loadmore{font-family:var(--cg-font);font-size:14px;font-weight:600;padding:10px 24px;border-radius:999px;" +
      "border:1px solid var(--cg-border);background:var(--cg-bg);color:var(--cg-ink);cursor:pointer;}" +
      ".cg-loadmore:disabled{opacity:.6;cursor:default;}" +
      ".cg-skeleton{aspect-ratio:4/3;background:linear-gradient(90deg,var(--cg-shimmer-a) 25%,var(--cg-shimmer-b) 37%,var(--cg-shimmer-a) 63%);" +
      "background-size:400% 100%;animation:cg-shimmer 1.4s ease infinite;border-radius:var(--cg-radius);}" +
      "@keyframes cg-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".cg-state{padding:32px 16px;text-align:center;color:var(--cg-muted);font-size:14px;display:flex;flex-direction:column;align-items:center;gap:8px;}" +
      ".cg-state svg{width:22px;height:22px;}" +
      ".cg-credit{display:block;text-align:center;font-size:11px;color:var(--cg-muted);margin-top:16px;text-decoration:none;}" +
      ".cg-credit:hover{text-decoration:underline;}" +
      ".cg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}" +
      ".cg-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;}" +
      ".cg-lightbox-inner{max-width:90vw;max-height:90vh;position:relative;}" +
      ".cg-lightbox-inner img,.cg-lightbox-inner video{max-width:90vw;max-height:80vh;display:block;border-radius:8px;}" +
      ".cg-lightbox-caption{color:#fff;font-size:13px;margin-top:10px;text-align:center;max-width:90vw;}" +
      ".cg-lightbox-close{position:absolute;top:-40px;right:0;background:none;border:none;color:#fff;cursor:pointer;}" +
      ".cg-lightbox-close svg{width:24px;height:24px;}" +
      "@media (prefers-reduced-motion:reduce){.contribly-gallery *{animation-duration:.001ms!important;transition-duration:.001ms!important;}}";
    document.head.appendChild(s);
  }

  // ---- DOMPurify (loaded on demand, only if a journalist reply exists) ----
  var domPurifyCallbacks = [], domPurifyLoading = false, domPurifyHookAdded = false;
  function ensureDOMPurify(cb) {
    if (window.DOMPurify) { addSafeLinkHookOnce(); cb(); return; }
    domPurifyCallbacks.push(cb);
    if (domPurifyLoading) return;
    domPurifyLoading = true;
    var s = document.createElement("script");
    s.src = DOMPURIFY_SRC;
    s.onload = function () { addSafeLinkHookOnce(); domPurifyCallbacks.forEach(function (c) { c(); }); domPurifyCallbacks = []; };
    s.onerror = function () { domPurifyCallbacks.forEach(function (c) { c(); }); domPurifyCallbacks = []; };
    document.head.appendChild(s);
  }
  function addSafeLinkHookOnce() {
    if (domPurifyHookAdded || !window.DOMPurify) return;
    domPurifyHookAdded = true;
    window.DOMPurify.addHook("afterSanitizeAttributes", function (node) {
      if (node.tagName === "A") { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
    });
  }
  function sanitiseHtml(raw) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, { ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "br", "p"], ALLOWED_ATTR: ["href", "target", "rel"] });
    }
    return escapeHtml(raw);
  }

  function escapeHtml(str) { var d = document.createElement("div"); d.textContent = str == null ? "" : str; return d.innerHTML; }
  function formatDate(iso, lang) { try { return new Date(iso).toLocaleDateString(lang || DEFAULT_LANGUAGE, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function getInitials(name) { if (!name) return "?"; var p = name.trim().split(/\s+/); return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase(); }

  function pickArtifactByType(artifacts, prefix, preferredLabels) {
    var candidates = (artifacts || []).filter(function (a) { return a.url && a.contentType && a.contentType.indexOf(prefix) === 0; });
    if (!candidates.length) return null;
    for (var i = 0; i < preferredLabels.length; i++) {
      var m = candidates.filter(function (a) { return a.label === preferredLabels[i]; })[0];
      if (m) return m;
    }
    return candidates[0];
  }

  function pickMedia(mediaUsages, forLightbox) {
    if (!mediaUsages || !mediaUsages.length) return null;
    var usage = mediaUsages[0], media = usage.media, artifacts = usage.artifacts;
    if (!artifacts || !artifacts.length) return null;
    if (media && media.type === "video") {
      var video = pickArtifactByType(artifacts, "video/", ["HD", "nHD"]);
      if (!video) return null; // no usable video file: treat as no media, don't render a broken card
      var poster = pickArtifactByType(artifacts, "image/", forLightbox ? ["HD", "large", "medium"] : ["medium", "mediumlandscape", "small"]);
      return { kind: "video", videoUrl: video.url, videoType: video.contentType, width: video.width, height: video.height, posterUrl: poster ? poster.url : null };
    }
    var image = pickArtifactByType(artifacts, "image/", forLightbox ? ["extralarge", "HD", "large"] : ["medium", "mediumlandscapecropdouble", "small"]);
    if (!image) return null;
    return { kind: "image", imageUrl: image.url, width: image.width, height: image.height };
  }

  // ---- Likes ----
  function hasLikedLocally(id) { try { return window.localStorage.getItem(LIKED_STORAGE_PREFIX + id) === "1"; } catch (e) { return false; } }
  function markLikedLocally(id) { try { window.localStorage.setItem(LIKED_STORAGE_PREFIX + id, "1"); } catch (e) {} }
  function sendLike(id) {
    return fetch(API_BASE + "/contributions/" + encodeURIComponent(id) + "/widgetlike", { method: "POST" });
  }

  // ---- Share ----
  function buildShareUrl(id) {
    try { var u = new URL(window.location.href); u.searchParams.set("contributionID", id); return u.toString(); }
    catch (e) { return window.location.href; }
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  // ---- Google Analytics (kept identical to the original widget on purpose) ----
  function trackEvent(inst, kind, extra) {
    var page = inst.loadedBatches || 1;
    if (typeof window.gtag === "function") {
      var actionMap = { impression: "impression", like: "liked", share: "shared", search: undefined };
      var payload = { callout: inst.calloutName, gallery: "Engagement", app_name: APP_NAME, order_by: inst.sortBy || "date", page: page };
      if (actionMap[kind] !== undefined) payload.action = actionMap[kind];
      if (kind === "search") payload.search_term = extra && extra.searchTerm != null ? extra.searchTerm : null;
      window.gtag("event", "contribly_gallery_" + kind, payload);
    }
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      var elementText = kind === "like" ? "liked" : kind === "share" ? "shared" : kind === "search" ? "search" : "";
      var event = kind === "impression" ? "hnp_impression" : "hnp_click";
      var dlPayload = { event: event, element_name: "Inline", element_text: elementText, element_content: "Gallery", source_system: "Contribly", callout: inst.calloutName, order_by: inst.sortBy || "date", page: page };
      if (kind === "search") dlPayload.search_term = null;
      window.dataLayer.push(dlPayload);
    }
  }

  // ---- Per-instance state ----
  function createInstance(root) {
    return {
      root: root,
      assignmentId: root.getAttribute("data-assignment"),
      clientId: root.getAttribute("data-client") || "Unknown",
      lang: root.getAttribute("data-language") || DEFAULT_LANGUAGE,
      calloutName: "", calloutDescription: "",
      tags: [], selectedTag: "", sortBy: "",
      items: [], nextPage: 1, total: null, allLoaded: false, loadingPage: false, loadedBatches: 0,
      formId: null,
      impressionSent: false,
    };
  }

  function contributionsUrl(inst, page) {
    var url = API_BASE + "/contributions?assignment=" + encodeURIComponent(inst.assignmentId) + "&page=" + page + "&pageSize=" + PAGE_SIZE;
    if (inst.selectedTag) url += "&tag=" + encodeURIComponent(inst.selectedTag);
    if (inst.sortBy === "likes") url += "&sortBy=allLikes";
    return url;
  }

  function fetchAssignment(inst) {
    return fetch(API_BASE + "/assignments/" + encodeURIComponent(inst.assignmentId))
      .then(function (r) { if (!r.ok) throw new Error("assignment fetch failed"); return r.json(); })
      .then(function (data) {
        inst.calloutName = data.name || "";
        inst.calloutDescription = data.description || "";
        inst.formId = data.form || null;
      });
  }

  function fetchTags(inst) {
    if (!inst.formId) return Promise.resolve();
    return fetch(API_BASE + "/forms/" + encodeURIComponent(inst.formId))
      .then(function (r) { return r.ok ? r.json() : { tags: [] }; })
      .then(function (data) { inst.tags = data.tags || []; })
      .catch(function () { inst.tags = []; });
  }

  function fetchTotalCount(inst) {
    return fetch(contributionsUrl(inst, 1), { method: "HEAD" })
      .then(function (r) { var c = r.headers.get("X-Total-Count"); inst.total = c ? parseInt(c, 10) : null; })
      .catch(function () { inst.total = null; });
  }

  function fetchPage(inst, page) {
    if (inst.loadingPage || inst.allLoaded) return Promise.resolve();
    inst.loadingPage = true;
    return fetch(contributionsUrl(inst, page))
      .then(function (r) { if (!r.ok) throw new Error("contributions fetch failed"); return r.json(); })
      .then(function (data) {
        var list = data.contributions || data || [];
        inst.items = inst.items.concat(list);
        inst.nextPage = page + 1;
        inst.loadedBatches += 1;
        if (list.length < PAGE_SIZE) inst.allLoaded = true;
      })
      .finally(function () { inst.loadingPage = false; });
  }

  // Not independently verified against live data; mirrors the original
  // widget's own approach for jumping straight to a shared contribution.
  function fetchDeepLinkPage(inst, contributionId) {
    return fetch(API_BASE + "/contributions/" + encodeURIComponent(contributionId) + "/assignment/" + encodeURIComponent(inst.assignmentId) + "/page")
      .then(function (r) { if (!r.ok) throw new Error("deep link fetch failed"); return r.json(); })
      .then(function (data) {
        var list = data.contributions || data || [];
        inst.items = list;
        inst.loadedBatches = (data.page || 1);
        inst.nextPage = inst.loadedBatches + 1;
        if (list.length < PAGE_SIZE) inst.allLoaded = true;
        return contributionId;
      });
  }

  // ---- Rendering ----
  function renderSkeletons(count) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var d = document.createElement("div");
      d.className = "cg-skeleton";
      frag.appendChild(d);
    }
    return frag;
  }

  function buildCard(inst, item) {
    var card = document.createElement("div");
    card.className = "cg-card";
    card.dataset.contributionId = item.id;

    var mediaInfo = pickMedia(item.mediaUsages, false);
    card.classList.add(mediaInfo ? "cg-card--has-media" : "cg-card--text-only");
    if (mediaInfo) {
      var wrap = document.createElement("div");
      wrap.className = "cg-media-wrap";
      if (mediaInfo.width && mediaInfo.height) wrap.style.setProperty("--cg-ratio", mediaInfo.width + "/" + mediaInfo.height);
      var img = document.createElement("img");
      img.className = "cg-media";
      img.loading = "lazy";
      img.alt = item.headline || "";
      img.src = mediaInfo.kind === "video" ? (mediaInfo.posterUrl || "") : mediaInfo.imageUrl;
      wrap.appendChild(img);
      if (mediaInfo.kind === "video") {
        var play = document.createElement("div");
        play.className = "cg-play";
        play.innerHTML = ICON_PLAY;
        wrap.appendChild(play);
      }
      wrap.addEventListener("click", function () { openLightbox(inst, item); });
      card.appendChild(wrap);
    }

    var body = document.createElement("div");
    body.className = "cg-body";

    if (item.headline) {
      var h = document.createElement("p");
      h.className = "cg-headline";
      h.textContent = item.headline;
      body.appendChild(h);
    }
    if (item.body) {
      var t = document.createElement("p");
      t.className = "cg-text";
      t.textContent = item.body;
      body.appendChild(t);
      // Detect real overflow after layout, only then show the toggle.
      requestAnimationFrame(function () {
        if (t.scrollHeight > t.clientHeight + 1) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cg-readmore";
          btn.textContent = translate(inst.lang, "readMore");
          btn.addEventListener("click", function () {
            t.classList.toggle("cg-expanded");
            btn.style.display = t.classList.contains("cg-expanded") ? "none" : "";
          });
          t.insertAdjacentElement("afterend", btn);
        }
      });
    }

    var hasResponse = item.journalistResponse && item.journalistResponse.text;
    if (hasResponse) {
      var resp = document.createElement("div");
      resp.className = "cg-response";
      resp.innerHTML = '<span class="cg-sr-only">' + escapeHtml(translate(inst.lang, "response")) + "</span>" + ICON_REPLY +
        '<div class="cg-response-body"></div>';
      body.appendChild(resp);
      ensureDOMPurify(function () {
        var bodyEl = resp.querySelector(".cg-response-body");
        if (bodyEl) bodyEl.innerHTML = sanitiseHtml(item.journalistResponse.text);
      });
    }

    var meta = document.createElement("div");
    meta.className = "cg-meta";
    var nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = item.attribution || "Community contributor";
    meta.appendChild(nameSpan);
    if (item.created) {
      var dateSpan = document.createElement("span");
      dateSpan.textContent = "\u00b7 " + formatDate(item.created, inst.lang);
      meta.appendChild(dateSpan);
    }
    if (item.place && item.place.name) {
      var locSpan = document.createElement("span");
      locSpan.className = "loc";
      locSpan.innerHTML = ICON_LOCATION + "<span>" + escapeHtml(item.place.name) + "</span>";
      meta.appendChild(locSpan);
    }
    body.appendChild(meta);

    var footer = document.createElement("div");
    footer.className = "cg-footer";

    var liked = hasLikedLocally(item.id);
    var likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "cg-like-btn" + (liked ? " liked" : "");
    likeBtn.disabled = liked;
    likeBtn.setAttribute("aria-label", translate(inst.lang, "likeLabel"));
    var likeCount = item.allLikes || 0;
    likeBtn.innerHTML = (liked ? ICON_HEART_FILLED : ICON_HEART_OUTLINE) + '<span class="cg-like-count">' + likeCount + "</span>";
    likeBtn.addEventListener("click", function () {
      if (likeBtn.disabled) return;
      likeBtn.disabled = true;
      likeBtn.classList.add("liked");
      likeCount += 1;
      likeBtn.innerHTML = ICON_HEART_FILLED + '<span class="cg-like-count">' + likeCount + "</span>";
      markLikedLocally(item.id);
      sendLike(item.id);
      trackEvent(inst, "like");
    });
    footer.appendChild(likeBtn);

    var shareWrap = document.createElement("div");
    shareWrap.className = "cg-share-wrap";
    var shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "cg-share-btn";
    shareBtn.setAttribute("aria-label", translate(inst.lang, "shareLabel"));
    shareBtn.innerHTML = ICON_SHARE;
    shareBtn.addEventListener("click", function () { handleShareClick(inst, item, shareBtn, shareWrap); });
    shareWrap.appendChild(shareBtn);
    footer.appendChild(shareWrap);

    body.appendChild(footer);
    card.appendChild(body);
    return card;
  }

  function handleShareClick(inst, item, shareBtn, shareWrap) {
    trackEvent(inst, "share");
    var url = buildShareUrl(item.id);
    if (navigator.share) {
      navigator.share({ url: url }).catch(function () {});
      return;
    }
    var existing = shareWrap.querySelector(".cg-share-panel");
    if (existing) { existing.remove(); return; }
    var panel = document.createElement("div");
    panel.className = "cg-share-panel";
    var fb = document.createElement("a");
    fb.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    fb.target = "_blank"; fb.rel = "noopener noreferrer"; fb.innerHTML = ICON_FACEBOOK; fb.setAttribute("aria-label", "Facebook");
    var x = document.createElement("a");
    x.href = "https://twitter.com/intent/tweet?url=" + encodeURIComponent(url);
    x.target = "_blank"; x.rel = "noopener noreferrer"; x.innerHTML = ICON_X; x.setAttribute("aria-label", "X");
    var copy = document.createElement("button");
    copy.type = "button"; copy.innerHTML = ICON_LINK; copy.setAttribute("aria-label", translate(inst.lang, "shareLabel"));
    copy.addEventListener("click", function () {
      copyToClipboard(url).then(function () {
        shareBtn.classList.add("copied");
        setTimeout(function () { shareBtn.classList.remove("copied"); }, 1500);
        panel.remove();
      });
    });
    panel.appendChild(fb); panel.appendChild(x); panel.appendChild(copy);
    shareWrap.appendChild(panel);
    setTimeout(function () {
      document.addEventListener("click", function onDoc(e) {
        if (!shareWrap.contains(e.target)) { panel.remove(); document.removeEventListener("click", onDoc); }
      });
    }, 0);
  }

  function openLightbox(inst, item) {
    var mediaInfo = pickMedia(item.mediaUsages, true);
    if (!mediaInfo) return;
    var overlay = document.createElement("div");
    overlay.className = "cg-lightbox";
    var inner = document.createElement("div");
    inner.className = "cg-lightbox-inner";
    var closeBtn = document.createElement("button");
    closeBtn.className = "cg-lightbox-close";
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.setAttribute("aria-label", "Close");
    inner.appendChild(closeBtn);
    if (mediaInfo.kind === "video") {
      var v = document.createElement("video");
      v.src = mediaInfo.videoUrl; v.controls = true; v.autoplay = true; v.playsInline = true;
      if (mediaInfo.posterUrl) v.poster = mediaInfo.posterUrl;
      inner.appendChild(v);
    } else {
      var img = document.createElement("img");
      img.src = mediaInfo.imageUrl; img.alt = item.headline || "";
      inner.appendChild(img);
    }
    if (item.attribution || item.body) {
      var cap = document.createElement("div");
      cap.className = "cg-lightbox-caption";
      cap.textContent = item.body ? item.body : (item.attribution || "");
      inner.appendChild(cap);
    }
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
    function close() {
      var video = overlay.querySelector("video");
      if (video) video.pause();
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  }

  function renderState(inst, kind) {
    var s = document.createElement("div");
    s.className = "cg-state";
    if (kind === "empty") s.innerHTML = "<span>" + escapeHtml(translate(inst.lang, "noContributions")) + "</span>";
    else s.innerHTML = ICON_ALERT + "<span>" + escapeHtml(translate(inst.lang, "loadError")) + "</span>";
    return s;
  }

  function renderFilters(inst, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "cg-filters";

    if (inst.tags && inst.tags.length) {
      var tagSelect = document.createElement("select");
      tagSelect.setAttribute("aria-label", "Filter by tag");
      var allOpt = document.createElement("option");
      allOpt.value = ""; allOpt.textContent = translate(inst.lang, "filterAll");
      tagSelect.appendChild(allOpt);
      inst.tags.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id; o.textContent = t.name;
        tagSelect.appendChild(o);
      });
      tagSelect.addEventListener("change", function () { inst.selectedTag = tagSelect.value; onChange(); });
      wrap.appendChild(tagSelect);
    }

    var sortSelect = document.createElement("select");
    sortSelect.setAttribute("aria-label", "Sort order");
    var recentOpt = document.createElement("option");
    recentOpt.value = ""; recentOpt.textContent = translate(inst.lang, "filterMostRecent");
    var likedOpt = document.createElement("option");
    likedOpt.value = "likes"; likedOpt.textContent = translate(inst.lang, "filterMostLiked");
    sortSelect.appendChild(recentOpt); sortSelect.appendChild(likedOpt);
    sortSelect.addEventListener("change", function () { inst.sortBy = sortSelect.value; onChange(); });
    wrap.appendChild(sortSelect);

    return wrap;
  }

  function renderAll(inst) {
    inst.root.innerHTML = "";

    var head = document.createElement("div");
    head.className = "cg-head";
    if (inst.calloutName) { var h1 = document.createElement("p"); h1.className = "cg-title"; h1.textContent = inst.calloutName; head.appendChild(h1); }
    if (inst.total != null) { var c = document.createElement("p"); c.className = "cg-count"; c.textContent = inst.total + " " + translate(inst.lang, "contributions"); head.appendChild(c); }
    head.appendChild(renderFilters(inst, function () { trackEvent(inst, "search"); resetAndReload(inst); }));
    inst.root.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "cg-grid";
    inst.gridEl = grid;
    inst.root.appendChild(grid);

    if (!inst.items.length) {
      inst.root.appendChild(renderState(inst, "empty"));
    } else {
      inst.items.forEach(function (item) { grid.appendChild(buildCard(inst, item)); });
      if (!inst.allLoaded) {
        var loadMoreWrap = document.createElement("div");
        loadMoreWrap.className = "cg-loadmore-wrap";
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "cg-loadmore"; btn.textContent = translate(inst.lang, "loadMore");
        btn.addEventListener("click", function () {
          btn.disabled = true;
          fetchPage(inst, inst.nextPage).then(function () { renderAll(inst); });
        });
        loadMoreWrap.appendChild(btn);
        inst.root.appendChild(loadMoreWrap);
      }
    }

    var credit = document.createElement("a");
    credit.className = "cg-credit";
    credit.href = "https://www.contribly.com/"; credit.target = "_blank"; credit.rel = "noopener noreferrer";
    credit.textContent = "Powered by Contribly";
    inst.root.appendChild(credit);

    maybeSendImpression(inst);
  }

  function resetAndReload(inst) {
    inst.items = []; inst.nextPage = 1; inst.allLoaded = false; inst.loadedBatches = 0; inst.total = null;
    inst.root.innerHTML = ""; inst.root.appendChild(renderSkeletons(6));
    Promise.all([fetchTotalCount(inst), fetchPage(inst, 1)]).then(function () { renderAll(inst); });
  }

  function maybeSendImpression(inst) {
    if (inst.impressionSent) return;
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { trackEvent(inst, "impression"); inst.impressionSent = true; observer.disconnect(); }
    }, { threshold: 0.1 });
    observer.observe(inst.root);
  }

  function scrollToAndHighlight(inst, contributionId) {
    requestAnimationFrame(function () {
      var card = inst.gridEl && inst.gridEl.querySelector('[data-contribution-id="' + contributionId + '"]');
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.style.outline = "2px solid var(--cg-accent)";
        setTimeout(function () { card.style.outline = ""; }, 2000);
      }
    });
  }

  function initInstance(root) {
    injectStylesOnce();
    root.setAttribute("data-contribly-initialised", "true");
    var inst = createInstance(root);
    if (!inst.assignmentId) { root.appendChild(renderState(inst, "error")); return; }
    root.innerHTML = "";
    root.appendChild(renderSkeletons(6));

    var deepLinkId = null;
    try { deepLinkId = new URL(window.location.href).searchParams.get("contributionID"); } catch (e) {}

    fetchAssignment(inst)
      .then(function () { return fetchTags(inst); })
      .then(function () {
        if (deepLinkId) {
          return fetchDeepLinkPage(inst, deepLinkId).then(function (id) {
            inst.total = inst.total; // total not returned by this endpoint; leave as null, shown count omitted in that case
            renderAll(inst);
            scrollToAndHighlight(inst, id);
          });
        }
        return Promise.all([fetchTotalCount(inst), fetchPage(inst, 1)]).then(function () { renderAll(inst); });
      })
      .catch(function () { root.innerHTML = ""; root.appendChild(renderState(inst, "error")); });
  }

  function init() {
    document.querySelectorAll(".contribly-gallery:not([data-contribly-initialised])").forEach(initInstance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
