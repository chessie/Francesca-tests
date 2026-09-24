/*
  CONTRIBLY - "MARGINALIA" QUOTE WIDGET (one reader quote/question + a
  newsroom reply, styled to stand out inside an article or live blog)
  =============================================================================
  EMBED:

    <div class="contribly-quote" data-contribution="THE-CONTRIBUTION-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-quote-widget.js" defer></script>

  DESIGN DECISIONS, CARRIED OVER FROM THE DESIGN REVIEW:
    - Deliberately text-first: no image/video rendering. This widget is for
      the reader's words and the newsroom's reply, not media. If a
      contribution needs to show a photo or clip too, use the original
      single-contribution widget instead.
    - Colours use the same tokens as the other widgets in this project
      (light: pale violet-tinted surface + indigo accent; dark: ink +
      light violet), and now genuinely follow the page's own light/dark
      mode via prefers-color-scheme, rather than being permanently dark.
    - A long question is NOT truncated. This card sits alone in an article,
      it doesn't need to match a neighbour's height the way a gallery card
      does, so it's allowed to grow. Worth revisiting if a genuinely huge
      question ends up dominating a page in practice.
    - The journalist's name is NOT a separately confirmed API field.
      journalistResponse.text is rendered as sanitised HTML, and the
      reply's author is expected to be typed into that text itself (e.g.
      "<strong>Aisha Rahman, football correspondent:</strong> ..."). This
      only works if there's a consistent newsroom convention for it, worth
      raising with the editorial team, and worth re-checking with Contribly
      in case a real author field exists that we simply haven't seen yet.
    - Right-aligned like/share, with generously padded (not just
      visually large) tap targets for mobile.
    - Sizing responds to the widget's own rendered width via a container
      query, correct whether it's full-width on a phone or squeezed into a
      narrow column on a wide desktop screen.
    - No analytics event tracking included. The gallery widget kept its
      predecessor's real GA event names for continuity with an existing
      dashboard; this widget has no predecessor to match, so nothing was
      invented. Add real event names here once there's a convention to
      follow.

  FIELD NOTES (same as the other widgets in this project):
    contributor name -> attribution, location -> place.name, journalist
    reply -> journalistResponse.text (sanitised), submission date ->
    created.
*/

(function () {
  var STYLE_ID = "contribly-quote-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var API_BASE = "https://api.contribly.com/1";
  var LIKED_STORAGE_PREFIX = "contribly-liked-";
  var DEFAULT_LANGUAGE = "en-gb";

  var TRANSLATIONS = {
    "en-gb": { likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", response: "Newsroom reply" },
    "en-us": { likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", response: "Newsroom reply" },
    "en-ie": { likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", response: "Newsroom reply" },
    "fr-fr": { likeLabel: "Aimer", shareLabel: "Partager", shareCopied: "Copi\u00e9", loadError: "Impossible de charger ce contenu.", response: "R\u00e9ponse de la r\u00e9daction" },
    "nl-nl": { likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen.", response: "Reactie van de redactie" },
    "nl-be": { likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen.", response: "Reactie van de redactie" },
    "es-es": { likeLabel: "Me gusta", shareLabel: "Compartir", shareCopied: "Copiado", loadError: "No se pudo cargar.", response: "Respuesta de la redacci\u00f3n" },
    "de-de": { likeLabel: "Gef\u00e4llt mir", shareLabel: "Teilen", shareCopied: "Kopiert", loadError: "Konnte nicht geladen werden.", response: "Antwort der Redaktion" },
    "fi-fi": { likeLabel: "Tyk\u00e4\u00e4", shareLabel: "Jaa", shareCopied: "Kopioitu", loadError: "T\u00e4t\u00e4 ei voitu ladata.", response: "Toimituksen vastaus" },
    "hr-hr": { likeLabel: "Sviđa mi se", shareLabel: "Udio", shareCopied: "Kopirano", loadError: "Ovo se nije moglo u\u010ditati.", response: "Odgovor redakcije" },
    "ro-ro": { likeLabel: "Apreciaz\u0103", shareLabel: "Distribuie", shareCopied: "Copiat", loadError: "Acest lucru nu a putut fi \u00eenc\u0103rcat.", response: "R\u0103spunsul redac\u021biei" }
  };

  function translate(lang, key) {
    var normalised = (lang || DEFAULT_LANGUAGE).toLowerCase();
    if (TRANSLATIONS[normalised] && TRANSLATIONS[normalised][key]) return TRANSLATIONS[normalised][key];
    var base = normalised.split("-")[0];
    var baseMatch = Object.keys(TRANSLATIONS).filter(function (c) { return c.split("-")[0] === base; })[0];
    if (baseMatch) return TRANSLATIONS[baseMatch][key];
    return TRANSLATIONS[DEFAULT_LANGUAGE][key];
  }

  var ICON_LOCATION = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';
  var ICON_DATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var ICON_REPLY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_HEART_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_HEART_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".contribly-quote{container-type:inline-size;width:100%;box-sizing:border-box;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".contribly-quote *{box-sizing:border-box;}" +
      ".cq-card{--cq-bg:#eef0ff;--cq-ink:#17171a;--cq-muted:#6e6e76;--cq-accent:#4f46e5;--cq-rule:rgba(23,23,26,.12);" +
      "background:var(--cq-bg);color:var(--cq-ink);border-radius:6px;padding:40px 36px 32px;position:relative;}" +
      "@media (prefers-color-scheme:dark){.cq-card{--cq-bg:#1c1c22;--cq-ink:#f2f1f7;--cq-muted:#a3a2ad;--cq-accent:#a5a0fb;--cq-rule:rgba(242,241,247,.14);}}" +
      ".cq-headline{font-weight:600;font-size:13.5px;color:var(--cq-muted);margin:0 0 14px;line-height:1.4;}" +
      ".cq-mark{font-family:Georgia,'Times New Roman',serif;font-size:54px;line-height:1;color:var(--cq-accent);margin:0 0 4px;font-weight:600;}" +
      ".cq-quote{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;" +
      "font-size:25px;line-height:1.42;margin:0 0 18px;color:var(--cq-ink);}" +
      ".cq-who{font-size:14px;color:var(--cq-muted);margin-bottom:26px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}" +
      ".cq-who .cq-loc,.cq-who .cq-date{display:inline-flex;align-items:center;gap:5px;}" +
      ".cq-who svg{width:13px;height:13px;}" +
      ".cq-rule{border:none;border-top:1px solid var(--cq-rule);margin:0 0 22px;}" +
      ".cq-reply{display:flex;gap:14px;align-items:flex-start;}" +
      ".cq-reply-icon{flex-shrink:0;margin-top:3px;width:18px;height:18px;color:var(--cq-accent);}" +
      ".cq-reply-body{font-size:15.5px;line-height:1.6;color:var(--cq-ink);}" +
      ".cq-reply-body p{margin:0 0 10px;}" +
      ".cq-reply-body strong{color:var(--cq-accent);}" +
      ".cq-reply-body a{color:var(--cq-accent);text-decoration:underline;}" +
      ".cq-actions{display:flex;gap:4px;align-items:center;justify-content:flex-end;margin-top:24px;padding-top:20px;border-top:1px solid var(--cq-rule);}" +
      ".cq-actions button{background:none;border:none;cursor:pointer;padding:11px 10px;margin:-11px 0;" +
      "display:flex;align-items:center;gap:7px;font-size:14px;color:var(--cq-muted);border-radius:8px;font-family:inherit;}" +
      ".cq-actions svg{width:19px;height:19px;}" +
      ".cq-actions button:hover{color:var(--cq-ink);}" +
      ".cq-actions button.liked{color:var(--cq-accent);}" +
      ".cq-actions button:disabled{cursor:default;}" +
      ".cq-actions button:focus-visible{outline:2px solid var(--cq-accent);outline-offset:2px;}" +
      ".cq-actions button.copied{color:var(--cq-accent);}" +
      ".cq-credit{display:block;text-align:center;font-size:11px;color:var(--cq-muted);margin-top:14px;text-decoration:none;}" +
      ".cq-credit:hover{text-decoration:underline;}" +
      ".cq-skeleton{height:180px;border-radius:6px;background:linear-gradient(90deg,#e4e4e4 25%,#efefef 37%,#e4e4e4 63%);" +
      "background-size:400% 100%;animation:cq-shimmer 1.4s ease infinite;}" +
      "@media (prefers-color-scheme:dark){.cq-skeleton{background:linear-gradient(90deg,#2a2a33 25%,#34343f 37%,#2a2a33 63%);background-size:400% 100%;}}" +
      "@keyframes cq-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".cq-state{background:var(--cq-bg,#f5f5f5);padding:32px 16px;text-align:center;color:var(--cq-muted,#666);font-size:14px;" +
      "display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:6px;}" +
      ".cq-state svg{width:20px;height:20px;}" +
      "@container (max-width:480px){" +
      ".cq-card{padding:26px 20px 22px;}.cq-quote{font-size:20px;}.cq-mark{font-size:42px;}" +
      ".cq-actions .cq-label{display:none;}}" +
      "@media (prefers-reduced-motion:reduce){.contribly-quote *{animation-duration:.001ms!important;transition-duration:.001ms!important;}}";
    document.head.appendChild(s);
  }

  var PRECONNECT_ID = "contribly-quote-preconnect";
  function addPreconnectOnce() {
    if (document.getElementById(PRECONNECT_ID)) return;
    var link = document.createElement("link");
    link.id = PRECONNECT_ID; link.rel = "preconnect"; link.href = "https://api.contribly.com"; link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

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
    if (window.DOMPurify) return window.DOMPurify.sanitize(raw, { ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "br", "p"], ALLOWED_ATTR: ["href", "target", "rel"] });
    return escapeHtml(raw);
  }
  function escapeHtml(str) { var d = document.createElement("div"); d.textContent = str == null ? "" : str; return d.innerHTML; }
  function formatDate(iso, lang) { try { return new Date(iso).toLocaleDateString(lang || DEFAULT_LANGUAGE, { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return ""; } }

  function hasLikedLocally(id) { try { return window.localStorage.getItem(LIKED_STORAGE_PREFIX + id) === "1"; } catch (e) { return false; } }
  function markLikedLocally(id) { try { window.localStorage.setItem(LIKED_STORAGE_PREFIX + id, "1"); } catch (e) {} }
  function sendLike(id) { return fetch(API_BASE + "/contributions/" + encodeURIComponent(id) + "/widgetlike", { method: "POST" }); }

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

  function fetchContribution(id) {
    return fetch(API_BASE + "/contributions/" + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error("contribution fetch failed"); return r.json(); });
  }

  function renderState(lang, kind) {
    var s = document.createElement("div");
    s.className = "cq-state";
    s.innerHTML = ICON_ALERT + "<span>" + escapeHtml(translate(lang, "loadError")) + "</span>";
    return s;
  }

  function renderCard(root, item, lang) {
    root.innerHTML = "";
    var card = document.createElement("div");
    card.className = "cq-card";

    if (item.headline) {
      var h = document.createElement("p");
      h.className = "cq-headline";
      h.textContent = item.headline;
      card.appendChild(h);
    }

    var mark = document.createElement("p");
    mark.className = "cq-mark";
    mark.textContent = "\u201C";
    card.appendChild(mark);

    var quote = document.createElement("blockquote");
    quote.className = "cq-quote";
    quote.style.margin = "0 0 18px";
    quote.textContent = item.body || "";
    card.appendChild(quote);

    var who = document.createElement("p");
    who.className = "cq-who";
    var nameSpan = document.createElement("span");
    nameSpan.textContent = item.attribution || "Community contributor";
    who.appendChild(nameSpan);
    if (item.place && item.place.name) {
      var loc = document.createElement("span");
      loc.className = "cq-loc";
      loc.innerHTML = ICON_LOCATION + "<span>" + escapeHtml(item.place.name) + "</span>";
      who.appendChild(loc);
    }
    if (item.created) {
      var date = document.createElement("span");
      date.className = "cq-date";
      date.innerHTML = ICON_DATE + "<span>" + escapeHtml(formatDate(item.created, lang)) + "</span>";
      who.appendChild(date);
    }
    card.appendChild(who);

    var hasResponse = item.journalistResponse && item.journalistResponse.text;
    if (hasResponse) {
      var hr = document.createElement("hr");
      hr.className = "cq-rule";
      card.appendChild(hr);

      var reply = document.createElement("div");
      reply.className = "cq-reply";
      reply.innerHTML = '<span class="cq-sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;">' +
        escapeHtml(translate(lang, "response")) + "</span>" +
        '<svg class="cq-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
        '<div class="cq-reply-body"></div>';
      card.appendChild(reply);
      ensureDOMPurify(function () {
        var bodyEl = reply.querySelector(".cq-reply-body");
        if (bodyEl) bodyEl.innerHTML = sanitiseHtml(item.journalistResponse.text);
      });
    }

    var actions = document.createElement("div");
    actions.className = "cq-actions";

    var liked = hasLikedLocally(item.id);
    var likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = liked ? "liked" : "";
    likeBtn.disabled = liked;
    likeBtn.setAttribute("aria-label", translate(lang, "likeLabel"));
    var likeCount = item.allLikes || 0;
    likeBtn.innerHTML = (liked ? ICON_HEART_FILLED : ICON_HEART_OUTLINE) + '<span class="cq-label">' + likeCount + "</span>";
    likeBtn.addEventListener("click", function () {
      if (likeBtn.disabled) return;
      likeBtn.disabled = true; likeBtn.classList.add("liked");
      likeCount += 1;
      likeBtn.innerHTML = ICON_HEART_FILLED + '<span class="cq-label">' + likeCount + "</span>";
      markLikedLocally(item.id);
      sendLike(item.id);
    });
    actions.appendChild(likeBtn);

    var shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.setAttribute("aria-label", translate(lang, "shareLabel"));
    shareBtn.innerHTML = ICON_SHARE + '<span class="cq-label">' + escapeHtml(translate(lang, "shareLabel")) + "</span>";
    shareBtn.addEventListener("click", function () {
      var url = (function () { try { var u = new URL(window.location.href); u.searchParams.set("contributionID", item.id); return u.toString(); } catch (e) { return window.location.href; } })();
      if (navigator.share) { navigator.share({ url: url }).catch(function () {}); return; }
      copyToClipboard(url).then(function () {
        shareBtn.classList.add("copied");
        var original = shareBtn.querySelector(".cq-label").textContent;
        shareBtn.querySelector(".cq-label").textContent = translate(lang, "shareCopied");
        setTimeout(function () { shareBtn.classList.remove("copied"); shareBtn.querySelector(".cq-label").textContent = original; }, 1500);
      });
    });
    actions.appendChild(shareBtn);

    card.appendChild(actions);
    root.appendChild(card);

    var credit = document.createElement("a");
    credit.className = "cq-credit";
    credit.href = "https://www.contribly.com/"; credit.target = "_blank"; credit.rel = "noopener noreferrer";
    credit.textContent = "Powered by Contribly";
    root.appendChild(credit);
  }

  function initInstance(root) {
    injectStylesOnce();
    addPreconnectOnce();
    root.setAttribute("data-contribly-initialised", "true");
    var contributionId = root.getAttribute("data-contribution");
    var lang = root.getAttribute("data-language") || DEFAULT_LANGUAGE;
    if (!contributionId) { root.appendChild(renderState(lang)); return; }

    var skeleton = document.createElement("div");
    skeleton.className = "cq-skeleton";
    root.appendChild(skeleton);

    fetchContribution(contributionId)
      .then(function (item) { renderCard(root, item, lang); })
      .catch(function () { root.innerHTML = ""; root.appendChild(renderState(lang)); });
  }

  function init() {
    document.querySelectorAll(".contribly-quote:not([data-contribly-initialised])").forEach(initInstance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
