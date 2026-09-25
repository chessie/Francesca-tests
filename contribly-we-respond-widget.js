/*
  CONTRIBLY - "YOU ASKED, WE ANSWERED" QUOTE WIDGET
  A conversation-style widget for a reader's question or comment and the
  newsroom's reply, styled as a two-bubble exchange rather than an
  editorial pull-quote (see the separate Marginalia widget for that style).
  =============================================================================
  EMBED:

    <div class="contribly-we-respond" data-contribution="THE-CONTRIBUTION-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-we-respond-widget.js" defer></script>

  DESIGN DECISIONS FROM THE REVIEW PROCESS:
    - Header reads "You asked, we answered" (translated per locale below),
      fixed, not overridable per client. If a client genuinely needs
      different wording later, that's a code change to the TRANSLATIONS
      object below, not a runtime setting, that was a deliberate choice to
      keep this simple rather than add configuration nobody asked for yet.
    - These header translations are OUR OWN wording, not decoded from any
      confirmed Contribly source. Unlike keys such as poll.live or
      form.back (which we did see in Contribly's own real translation
      data), there is no existing "we respond" style phrase anywhere we've
      actually confirmed. Treat these as a reasonable starting point that
      may need a native speaker's review, not verified copy.
    - No "Question from" label and no separate name/role caption under the
      reply. The reader's name/location/date sit beside their avatar (real
      data); the newsroom side only shows a generic icon, no name, because
      there is no confirmed field for the individual journalist's name.
      If a journalist signs their reply (e.g. wrapping their name in
      <strong>), it will show up naturally inside the reply bubble, that's
      the only place a name can currently come from.
    - Text-only: no image/video rendering, matching the design brief.
    - A long question is not truncated, same standing decision as the
      other quote widget, revisit if it becomes a real problem in practice.
    - The reply bubble uses white-space:pre-line so a journalist's plain
      paragraph breaks show up correctly even without typing HTML.
    - The card caps at 680px wide and centres itself, regardless of how
      wide the space it's given is, so it doesn't stretch into an
      illegibly wide bubble in a full-width desktop article column.
      (Originally capped at 480px; real testing showed that was too
      conservative, made every line wrap early and the page scroll far
      more than it needed to. 680px is the corrected value.)
      Sizing below that responds to the widget's own rendered width via a
      container query, correct in a phone-width column or a narrow
      desktop sidebar alike.
    - Right-aligned like/share, added for parity with the other widgets in
      this project since every other one has it; this wasn't explicitly
      requested for this specific design, worth confirming it's wanted
      here too rather than assuming.

  FIELD NOTES (same as the other widgets in this project):
    contributor name -> attribution, location -> place.name, journalist
    reply -> journalistResponse.text (sanitised), submission date ->
    created.
*/

(function () {
  var STYLE_ID = "contribly-we-respond-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var API_BASE = "https://api.contribly.com/1";
  var LIKED_STORAGE_PREFIX = "contribly-liked-";
  var DEFAULT_LANGUAGE = "en-gb";

  // Header phrase translations: our own wording, not Contribly-sourced, see
  // the header comment above. likeLabel/shareLabel/shareCopied/loadError
  // reuse the same approach as the other widgets in this project.
  var TRANSLATIONS = {
    "en-gb": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded." },
    "en-us": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded." },
    "en-ie": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded." },
    "fr-fr": { header: "Vous avez demand\u00e9, nous avons r\u00e9pondu", likeLabel: "Aimer", shareLabel: "Partager", shareCopied: "Copi\u00e9", loadError: "Impossible de charger ce contenu." },
    "nl-nl": { header: "U vroeg, wij antwoordden", likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen." },
    "nl-be": { header: "U vroeg, wij antwoordden", likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen." },
    "es-es": { header: "Preguntaste, respondimos", likeLabel: "Me gusta", shareLabel: "Compartir", shareCopied: "Copiado", loadError: "No se pudo cargar." },
    "de-de": { header: "Sie fragten, wir antworteten", likeLabel: "Gef\u00e4llt mir", shareLabel: "Teilen", shareCopied: "Kopiert", loadError: "Konnte nicht geladen werden." },
    "fi-fi": { header: "Sin\u00e4 kysyit, me vastasimme", likeLabel: "Tyk\u00e4\u00e4", shareLabel: "Jaa", shareCopied: "Kopioitu", loadError: "T\u00e4t\u00e4 ei voitu ladata." },
    "hr-hr": { header: "Pitali ste, odgovorili smo", likeLabel: "Sviđa mi se", shareLabel: "Udio", shareCopied: "Kopirano", loadError: "Ovo se nije moglo u\u010ditati." },
    "ro-ro": { header: "Ai \u00eentrebat, am r\u0103spuns", likeLabel: "Apreciaz\u0103", shareLabel: "Distribuie", shareCopied: "Copiat", loadError: "Acest lucru nu a putut fi \u00eenc\u0103rcat." }
  };

  function translate(lang, key) {
    var normalised = (lang || DEFAULT_LANGUAGE).toLowerCase();
    if (TRANSLATIONS[normalised] && TRANSLATIONS[normalised][key]) return TRANSLATIONS[normalised][key];
    var base = normalised.split("-")[0];
    var baseMatch = Object.keys(TRANSLATIONS).filter(function (c) { return c.split("-")[0] === base; })[0];
    if (baseMatch) return TRANSLATIONS[baseMatch][key];
    return TRANSLATIONS[DEFAULT_LANGUAGE][key];
  }

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H8l-4 4z"/></svg>';
  var ICON_HEART_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_HEART_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".contribly-we-respond{container-type:inline-size;width:100%;box-sizing:border-box;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".contribly-we-respond *{box-sizing:border-box;}" +
      ".wr-card{--wr-ink:#17171a;--wr-muted:#6e6e76;--wr-accent:#4f46e5;--wr-accent-tint:#eef0ff;--wr-input:#f5f5f8;--wr-bg:#fff;--wr-rule:#ececf2;" +
      "max-width:680px;margin:0 auto;background:var(--wr-bg);color:var(--wr-ink);border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(20,20,43,.08);}" +
      "@media (prefers-color-scheme:dark){.wr-card{--wr-ink:#f2f1f7;--wr-muted:#a3a2ad;--wr-accent:#a5a0fb;--wr-accent-tint:rgba(165,160,251,.15);--wr-input:#2a2a33;--wr-bg:#1c1c22;--wr-rule:rgba(242,241,247,.14);}}" +
      ".wr-head{display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid var(--wr-rule);}" +
      ".wr-head .wr-mark{width:30px;height:30px;border-radius:50%;background:var(--wr-accent);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}" +
      ".wr-head .wr-mark svg{width:15px;height:15px;}" +
      ".wr-head .wr-label{font-weight:700;font-size:15px;}" +
      ".wr-body{padding:24px 22px;}" +
      ".wr-headline{font-weight:600;font-size:13px;color:var(--wr-muted);margin:0 0 16px;line-height:1.4;}" +
      ".wr-row{display:flex;align-items:flex-start;gap:12px;}" +
      ".wr-row+.wr-row{margin-top:22px;}" +
      ".wr-idcol{flex:0 0 64px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;}" +
      ".wr-avatar{width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;}" +
      ".wr-avatar.reader{background:var(--wr-input);color:var(--wr-muted);font-weight:700;font-size:14px;}" +
      ".wr-avatar.newsroom{background:var(--wr-accent);color:#fff;}" +
      ".wr-avatar svg{width:18px;height:18px;}" +
      ".wr-idcol .wr-name{font-weight:700;font-size:12.5px;line-height:1.3;}" +
      ".wr-idcol .wr-meta{font-size:11px;color:var(--wr-muted);line-height:1.3;}" +
      ".wr-bubblewrap{flex:1 1 auto;min-width:0;position:relative;}" +
      ".wr-bubble{padding:14px 18px;font-size:15.5px;line-height:1.6;position:relative;white-space:pre-line;}" +
      ".wr-qbubble{background:var(--wr-input);border-radius:4px 14px 14px 14px;}" +
      ".wr-qbubble:before{content:'';position:absolute;left:-6px;top:16px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:6px solid var(--wr-input);}" +
      ".wr-rbubble{background:var(--wr-accent-tint);border-radius:14px 4px 14px 14px;}" +
      ".wr-rbubble:before{content:'';position:absolute;right:-6px;top:16px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:6px solid var(--wr-accent-tint);}" +
      ".wr-rbubble strong{color:var(--wr-accent);}" +
      ".wr-rbubble a{color:var(--wr-accent);}" +
      ".wr-reply-row{flex-direction:row-reverse;}" +
      ".wr-actions{display:flex;gap:4px;align-items:center;justify-content:flex-end;margin-top:22px;padding-top:18px;border-top:1px solid var(--wr-rule);}" +
      ".wr-actions button{background:none;border:none;cursor:pointer;padding:11px 10px;margin:-11px 0;" +
      "display:flex;align-items:center;gap:7px;font-size:14px;color:var(--wr-muted);border-radius:8px;font-family:inherit;}" +
      ".wr-actions svg{width:19px;height:19px;}" +
      ".wr-actions button:hover{color:var(--wr-ink);}" +
      ".wr-actions button.liked{color:var(--wr-accent);}" +
      ".wr-actions button:disabled{cursor:default;}" +
      ".wr-actions button:focus-visible{outline:2px solid var(--wr-accent);outline-offset:2px;}" +
      ".wr-credit{display:block;text-align:center;font-size:11px;color:var(--wr-muted);padding:0 22px 16px;text-decoration:none;}" +
      ".wr-credit:hover{text-decoration:underline;}" +
      ".wr-skeleton{max-width:680px;margin:0 auto;height:200px;border-radius:10px;background:linear-gradient(90deg,#e4e4e4 25%,#efefef 37%,#e4e4e4 63%);" +
      "background-size:400% 100%;animation:wr-shimmer 1.4s ease infinite;}" +
      "@media (prefers-color-scheme:dark){.wr-skeleton{background:linear-gradient(90deg,#2a2a33 25%,#34343f 37%,#2a2a33 63%);background-size:400% 100%;}}" +
      "@keyframes wr-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".wr-state{max-width:680px;margin:0 auto;background:var(--wr-bg,#f5f5f5);padding:32px 16px;text-align:center;color:var(--wr-muted,#666);" +
      "font-size:14px;display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:10px;}" +
      ".wr-state svg{width:20px;height:20px;}" +
      "@container (max-width:380px){" +
      ".wr-idcol{flex-basis:52px;}.wr-avatar{width:36px;height:36px;}.wr-idcol .wr-meta{display:none;}" +
      ".wr-bubble{font-size:14.5px;padding:12px 15px;}.wr-actions .wr-label{display:none;}}" +
      "@media (prefers-reduced-motion:reduce){.contribly-we-respond *{animation-duration:.001ms!important;transition-duration:.001ms!important;}}";
    document.head.appendChild(s);
  }

  var PRECONNECT_ID = "contribly-we-respond-preconnect";
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
  function formatDate(iso, lang) { try { return new Date(iso).toLocaleDateString(lang || DEFAULT_LANGUAGE, { day: "numeric", month: "short" }); } catch (e) { return ""; } }
  function getInitials(name) { if (!name) return "?"; var p = name.trim().split(/\s+/); return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase(); }

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

  function renderState(lang) {
    var s = document.createElement("div");
    s.className = "wr-state";
    s.innerHTML = ICON_ALERT + "<span>" + escapeHtml(translate(lang, "loadError")) + "</span>";
    return s;
  }

  function renderCard(root, item, lang) {
    root.innerHTML = "";
    var card = document.createElement("div");
    card.className = "wr-card";

    var head = document.createElement("div");
    head.className = "wr-head";
    head.innerHTML = '<span class="wr-mark">' + ICON_CHAT + "</span><span class=\"wr-label\">" + escapeHtml(translate(lang, "header")) + "</span>";
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "wr-body";

    if (item.headline) {
      var h = document.createElement("p");
      h.className = "wr-headline";
      h.textContent = item.headline;
      body.appendChild(h);
    }

    var qRow = document.createElement("div");
    qRow.className = "wr-row";
    var qId = document.createElement("div");
    qId.className = "wr-idcol";
    var qAvatar = document.createElement("span");
    qAvatar.className = "wr-avatar reader";
    qAvatar.textContent = getInitials(item.attribution);
    qId.appendChild(qAvatar);
    var qName = document.createElement("span");
    qName.className = "wr-name";
    qName.textContent = item.attribution || "Community contributor";
    qId.appendChild(qName);
    var metaParts = [];
    if (item.place && item.place.name) metaParts.push(item.place.name);
    if (item.created) metaParts.push(formatDate(item.created, lang));
    if (metaParts.length) {
      var qMeta = document.createElement("span");
      qMeta.className = "wr-meta";
      qMeta.innerHTML = metaParts.map(escapeHtml).join("<br>");
      qId.appendChild(qMeta);
    }
    qRow.appendChild(qId);
    var qBubbleWrap = document.createElement("div");
    qBubbleWrap.className = "wr-bubblewrap";
    var qBubble = document.createElement("div");
    qBubble.className = "wr-bubble wr-qbubble";
    qBubble.textContent = item.body || "";
    qBubbleWrap.appendChild(qBubble);
    qRow.appendChild(qBubbleWrap);
    body.appendChild(qRow);

    var hasResponse = item.journalistResponse && item.journalistResponse.text;
    if (hasResponse) {
      var rRow = document.createElement("div");
      rRow.className = "wr-row wr-reply-row";
      var rId = document.createElement("div");
      rId.className = "wr-idcol";
      rId.innerHTML = '<span class="wr-avatar newsroom">' + ICON_CHAT + "</span>";
      rRow.appendChild(rId);
      var rBubbleWrap = document.createElement("div");
      rBubbleWrap.className = "wr-bubblewrap";
      var rBubble = document.createElement("div");
      rBubble.className = "wr-bubble wr-rbubble";
      rBubbleWrap.appendChild(rBubble);
      rRow.appendChild(rBubbleWrap);
      body.appendChild(rRow);
      ensureDOMPurify(function () { rBubble.innerHTML = sanitiseHtml(item.journalistResponse.text); });
    }

    var actions = document.createElement("div");
    actions.className = "wr-actions";

    var liked = hasLikedLocally(item.id);
    var likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = liked ? "liked" : "";
    likeBtn.disabled = liked;
    likeBtn.setAttribute("aria-label", translate(lang, "likeLabel"));
    var likeCount = item.allLikes || 0;
    likeBtn.innerHTML = (liked ? ICON_HEART_FILLED : ICON_HEART_OUTLINE) + '<span class="wr-label">' + likeCount + "</span>";
    likeBtn.addEventListener("click", function () {
      if (likeBtn.disabled) return;
      likeBtn.disabled = true; likeBtn.classList.add("liked");
      likeCount += 1;
      likeBtn.innerHTML = ICON_HEART_FILLED + '<span class="wr-label">' + likeCount + "</span>";
      markLikedLocally(item.id);
      sendLike(item.id);
    });
    actions.appendChild(likeBtn);

    var shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.setAttribute("aria-label", translate(lang, "shareLabel"));
    shareBtn.innerHTML = ICON_SHARE + '<span class="wr-label">' + escapeHtml(translate(lang, "shareLabel")) + "</span>";
    shareBtn.addEventListener("click", function () {
      var url = (function () { try { var u = new URL(window.location.href); u.searchParams.set("contributionID", item.id); return u.toString(); } catch (e) { return window.location.href; } })();
      if (navigator.share) { navigator.share({ url: url }).catch(function () {}); return; }
      copyToClipboard(url).then(function () {
        var lbl = shareBtn.querySelector(".wr-label");
        var original = lbl.textContent;
        lbl.textContent = translate(lang, "shareCopied");
        setTimeout(function () { lbl.textContent = original; }, 1500);
      });
    });
    actions.appendChild(shareBtn);

    body.appendChild(actions);
    card.appendChild(body);
    root.appendChild(card);

    var credit = document.createElement("a");
    credit.className = "wr-credit";
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
    skeleton.className = "wr-skeleton";
    root.appendChild(skeleton);

    fetchContribution(contributionId)
      .then(function (item) { renderCard(root, item, lang); })
      .catch(function () { root.innerHTML = ""; root.appendChild(renderState(lang)); });
  }

  function init() {
    document.querySelectorAll(".contribly-we-respond:not([data-contribly-initialised])").forEach(initInstance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
