/*
  CONTRIBLY - "YOU ASKED, WE ANSWERED" GALLERY
  A running feed of reader questions/comments and journalist replies from
  one assignment, stacked vertically, one full conversation card below the
  next, never side by side. Each card is the exact same component as the
  standalone "you asked, we answered" widget, just repeated.
  =============================================================================
  EMBED:

    <div class="contribly-we-respond-gallery" data-assignment="THE-ASSIGNMENT-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-we-respond-gallery-widget.js" defer></script>

  DECISIONS FROM THIS BUILD:
    - Shows every contribution, not just answered ones. There's no
      confirmed way to ask the API for "only the ones with a reply", so
      filtering to answered-only client-side would mean silently fetching
      extra pages behind the scenes to find enough, unpredictable and
      slow for a sparsely-answered assignment. A card with no reply yet
      just shows the question alone, same graceful handling the
      standalone widget already does.
    - Each card repeats the full "You asked, we answered" header, on
      purpose, for literal consistency with "same style as the individual
      widget." Worth a second look once this is full of real content,
      that header repeated ten or twenty times down a page might read as
      heavier than intended; dropping it to a single header at the very
      top of the whole feed instead is an easy follow-up change if so.
    - The "Powered by Contribly" credit appears ONCE at the very bottom of
      the whole feed, not once per card. Repeating it per card felt like
      genuine clutter rather than useful consistency, this is the one
      deliberate deviation from "reuse the card exactly."
    - Loads in batches with a "Load more" button rather than everything at
      once, same reasoning as the photo gallery widget: keeps a
      long-running assignment from dumping hundreds of full cards into the
      page at once.
    - No tag or sort filtering in this version, wasn't asked for. Easy to
      add later using the same pattern as the photo gallery widget if
      needed.

  Everything else (translations, sanitisation, like/share behaviour, field
  names, the unresolved journalist-name-in-<strong> situation) is
  identical to the standalone widget. See that file's header comment for
  the full detail; it isn't repeated here.
*/

(function () {
  var STYLE_ID = "contribly-we-respond-gallery-styles";
  var DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";
  var API_BASE = "https://api.contribly.com/1";
  var LIKED_STORAGE_PREFIX = "contribly-liked-";
  var DEFAULT_LANGUAGE = "en-gb";
  var PAGE_SIZE = 8;

  var TRANSLATIONS = {
    "en-gb": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", loadMore: "Load more", contributions: "questions answered so far", noItems: "No questions here yet." },
    "en-us": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", loadMore: "Load more", contributions: "questions answered so far", noItems: "No questions here yet." },
    "en-ie": { header: "You asked, we answered", likeLabel: "Like", shareLabel: "Share", shareCopied: "Copied", loadError: "This couldn't be loaded.", loadMore: "Load more", contributions: "questions answered so far", noItems: "No questions here yet." },
    "fr-fr": { header: "Vous avez demand\u00e9, nous avons r\u00e9pondu", likeLabel: "Aimer", shareLabel: "Partager", shareCopied: "Copi\u00e9", loadError: "Impossible de charger ce contenu.", loadMore: "Charger plus", contributions: "questions r\u00e9pondues", noItems: "Aucune question pour le moment." },
    "nl-nl": { header: "U vroeg, wij antwoordden", likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen.", loadMore: "Meer laden", contributions: "vragen beantwoord", noItems: "Nog geen vragen." },
    "nl-be": { header: "U vroeg, wij antwoordden", likeLabel: "Vind ik leuk", shareLabel: "Delen", shareCopied: "Gekopieerd", loadError: "Kon niet worden geladen.", loadMore: "Meer laden", contributions: "vragen beantwoord", noItems: "Nog geen vragen." },
    "es-es": { header: "Preguntaste, respondimos", likeLabel: "Me gusta", shareLabel: "Compartir", shareCopied: "Copiado", loadError: "No se pudo cargar.", loadMore: "Cargar m\u00e1s", contributions: "preguntas respondidas", noItems: "Todav\u00eda no hay preguntas." },
    "de-de": { header: "Sie fragten, wir antworteten", likeLabel: "Gef\u00e4llt mir", shareLabel: "Teilen", shareCopied: "Kopiert", loadError: "Konnte nicht geladen werden.", loadMore: "Mehr laden", contributions: "Fragen beantwortet", noItems: "Noch keine Fragen." },
    "fi-fi": { header: "Sin\u00e4 kysyit, me vastasimme", likeLabel: "Tyk\u00e4\u00e4", shareLabel: "Jaa", shareCopied: "Kopioitu", loadError: "T\u00e4t\u00e4 ei voitu ladata.", loadMore: "Lataa lis\u00e4\u00e4", contributions: "kysymyst\u00e4 vastattu", noItems: "Ei viel\u00e4 kysymyksi\u00e4." },
    "hr-hr": { header: "Pitali ste, odgovorili smo", likeLabel: "Sviđa mi se", shareLabel: "Udio", shareCopied: "Kopirano", loadError: "Ovo se nije moglo u\u010ditati.", loadMore: "U\u010ditaj vi\u0161e", contributions: "pitanja odgovoreno", noItems: "Jo\u0161 nema pitanja." },
    "ro-ro": { header: "Ai \u00eentrebat, am r\u0103spuns", likeLabel: "Apreciaz\u0103", shareLabel: "Distribuie", shareCopied: "Copiat", loadError: "Acest lucru nu a putut fi \u00eenc\u0103rcat.", loadMore: "\u00cencarc\u0103 mai multe", contributions: "\u00eentreb\u0103ri primite r\u0103spuns", noItems: "\u00cenc\u0103 nicio \u00eentrebare." }
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
      ".contribly-we-respond-gallery{container-type:inline-size;width:100%;box-sizing:border-box;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".contribly-we-respond-gallery *{box-sizing:border-box;}" +
      ".wrg-intro{max-width:680px;margin:0 auto 20px;text-align:center;}" +
      ".wrg-title{font-size:18px;font-weight:700;color:#17171a;margin:0 0 4px;}" +
      ".wrg-count{font-size:13px;color:#6e6e76;margin:0;}" +
      "@media (prefers-color-scheme:dark){.wrg-title{color:#f2f1f7;}.wrg-count{color:#a3a2ad;}}" +
      ".wrg-stack{display:flex;flex-direction:column;gap:20px;}" +
      ".wr-card{--wr-ink:#17171a;--wr-muted:#6e6e76;--wr-accent:#4f46e5;--wr-accent-tint:#eef0ff;--wr-input:#f5f5f8;--wr-bg:#fff;--wr-rule:#ececf2;" +
      "max-width:680px;margin:0 auto;background:var(--wr-bg);color:var(--wr-ink);border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(20,20,43,.08);width:100%;}" +
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
      ".wrg-loadmore-wrap{display:flex;justify-content:center;margin-top:24px;}" +
      ".wrg-loadmore{font-family:inherit;font-size:14px;font-weight:600;padding:10px 24px;border-radius:999px;" +
      "border:1px solid #d8d8e2;background:#fff;color:#17171a;cursor:pointer;}" +
      "@media (prefers-color-scheme:dark){.wrg-loadmore{border-color:#3a3a45;background:#1c1c22;color:#f2f1f7;}}" +
      ".wrg-loadmore:disabled{opacity:.6;cursor:default;}" +
      ".wrg-credit{display:block;text-align:center;font-size:11px;color:#6e6e76;margin-top:20px;text-decoration:none;}" +
      "@media (prefers-color-scheme:dark){.wrg-credit{color:#a3a2ad;}}" +
      ".wrg-credit:hover{text-decoration:underline;}" +
      ".wrg-skeleton{max-width:680px;margin:0 auto 20px;height:200px;border-radius:10px;background:linear-gradient(90deg,#e4e4e4 25%,#efefef 37%,#e4e4e4 63%);" +
      "background-size:400% 100%;animation:wrg-shimmer 1.4s ease infinite;}" +
      "@media (prefers-color-scheme:dark){.wrg-skeleton{background:linear-gradient(90deg,#2a2a33 25%,#34343f 37%,#2a2a33 63%);background-size:400% 100%;}}" +
      "@keyframes wrg-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".wrg-state{max-width:680px;margin:0 auto;background:#f5f5f5;padding:32px 16px;text-align:center;color:#666;" +
      "font-size:14px;display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:10px;}" +
      "@container (max-width:380px){" +
      ".wr-idcol{flex-basis:52px;}.wr-avatar{width:36px;height:36px;}.wr-idcol .wr-meta{display:none;}" +
      ".wr-bubble{font-size:14.5px;padding:12px 15px;}.wr-actions .wr-label{display:none;}}" +
      "@media (prefers-reduced-motion:reduce){.contribly-we-respond-gallery *{animation-duration:.001ms!important;transition-duration:.001ms!important;}}";
    document.head.appendChild(s);
  }

  var PRECONNECT_ID = "contribly-we-respond-gallery-preconnect";
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

  // ---- Builds exactly one conversation card, same component as the
  // standalone widget ----
  function buildCard(item, lang) {
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
    return card;
  }

  function renderState(lang, root) {
    var s = document.createElement("div");
    s.className = "wrg-state";
    s.innerHTML = ICON_ALERT + "<span>" + escapeHtml(translate(lang, "loadError")) + "</span>";
    root.appendChild(s);
  }

  function createInstance(root) {
    return {
      root: root,
      assignmentId: root.getAttribute("data-assignment"),
      lang: root.getAttribute("data-language") || DEFAULT_LANGUAGE,
      calloutName: "", items: [], nextPage: 1, total: null, allLoaded: false, loadingPage: false
    };
  }

  function fetchAssignmentName(inst) {
    return fetch(API_BASE + "/assignments/" + encodeURIComponent(inst.assignmentId))
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (data) { inst.calloutName = data.name || ""; })
      .catch(function () {});
  }

  function contributionsUrl(inst, page) {
    return API_BASE + "/contributions?assignment=" + encodeURIComponent(inst.assignmentId) + "&page=" + page + "&pageSize=" + PAGE_SIZE;
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
        if (list.length < PAGE_SIZE) inst.allLoaded = true;
      })
      .finally(function () { inst.loadingPage = false; });
  }

  function renderAll(inst) {
    inst.root.innerHTML = "";

    var intro = document.createElement("div");
    intro.className = "wrg-intro";
    if (inst.calloutName) {
      var title = document.createElement("p");
      title.className = "wrg-title";
      title.textContent = inst.calloutName;
      intro.appendChild(title);
    }
    if (inst.total != null) {
      var count = document.createElement("p");
      count.className = "wrg-count";
      count.textContent = inst.total + " " + translate(inst.lang, "contributions");
      intro.appendChild(count);
    }
    if (intro.children.length) inst.root.appendChild(intro);

    if (!inst.items.length) {
      var empty = document.createElement("div");
      empty.className = "wrg-state";
      empty.textContent = translate(inst.lang, "noItems");
      inst.root.appendChild(empty);
    } else {
      var stack = document.createElement("div");
      stack.className = "wrg-stack";
      var frag = document.createDocumentFragment();
      inst.items.forEach(function (item) { frag.appendChild(buildCard(item, inst.lang)); });
      stack.appendChild(frag);
      inst.root.appendChild(stack);

      if (!inst.allLoaded) {
        var loadMoreWrap = document.createElement("div");
        loadMoreWrap.className = "wrg-loadmore-wrap";
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "wrg-loadmore"; btn.textContent = translate(inst.lang, "loadMore");
        btn.addEventListener("click", function () {
          btn.disabled = true;
          fetchPage(inst, inst.nextPage).then(function () { renderAll(inst); });
        });
        loadMoreWrap.appendChild(btn);
        inst.root.appendChild(loadMoreWrap);
      }
    }

    var credit = document.createElement("a");
    credit.className = "wrg-credit";
    credit.href = "https://www.contribly.com/"; credit.target = "_blank"; credit.rel = "noopener noreferrer";
    credit.textContent = "Powered by Contribly";
    inst.root.appendChild(credit);
  }

  function initInstance(root) {
    injectStylesOnce();
    addPreconnectOnce();
    root.setAttribute("data-contribly-initialised", "true");
    var inst = createInstance(root);
    if (!inst.assignmentId) { renderState(inst.lang, root); return; }
    root.innerHTML = "";
    var skeleton = document.createElement("div");
    skeleton.className = "wrg-skeleton";
    root.appendChild(skeleton);

    Promise.all([fetchAssignmentName(inst), fetchTotalCount(inst), fetchPage(inst, 1)])
      .then(function () { renderAll(inst); })
      .catch(function () { root.innerHTML = ""; renderState(inst.lang, root); });
  }

  function init() {
    document.querySelectorAll(".contribly-we-respond-gallery:not([data-contribly-initialised])").forEach(initInstance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
