/*
  CONTRIBLY - POLL RESULTS WIDGET
  Shows the current results of the poll attached to one assignment, as
  horizontal bars, leader highlighted, matching the other widgets in this
  project on colour, light/dark mode, and responsiveness.
  =============================================================================
  EMBED:

    <div class="contribly-poll" data-assignment="THE-ASSIGNMENT-ID" data-language="en-gb"></div>
    <script src="https://YOUR-HOSTING-URL/contribly-poll-widget.js" defer></script>

  CONFIRMED DIRECTLY AGAINST A LIVE RESPONSE (not inferred this time):
    - One plain, unauthenticated GET /1/assignments/{id} call is enough.
      No form fetch, no bearer token. Verified by opening the endpoint
      directly in an incognito window (no session) and getting the full
      payload back, and a plain URL navigation can't send a custom
      Authorization header anyway, so this rules out both routes an auth
      requirement could have come through.
    - assignment.pollSummary[0] gives {name, label, counts}. label is the
      real question text ("Which one would you back?"), counts is keyed
      by the option's raw id.
    - assignment.additionalFields, matched by .name to the pollSummary
      entry, gives the poll field's optionsExt: [{id, name}], the real
      display labels for each option.
    - An option with zero votes is simply MISSING from counts entirely,
      not present with a value of 0. Confirmed twice, once from Contribly's
      own Hub dashboard source and once from a live assignment payload
      ("Principality" absent from counts both times). Every option is
      defaulted to 0 votes if missing, this isn't optional defensive
      coding, real data behaves this way.
    - A field on additionalFields also carries a "public": false flag in
      the live payload we saw. Unclear exactly what that governs, but
      worth remembering if a future widget needs to reason about what's
      safe to expose.

  DESIGN DECISIONS:
    - Shows only the question, no assignment name or subtitle above it.
    - The vote count total is hidden until more than 150 votes have come
      in, small numbers early in a poll's life aren't shown.
    - The leading option gets a solid bar; the rest sit at reduced
      opacity, so the front-runner reads instantly without needing to
      compare four bars of equal visual weight.
    - Single fetch on load, no live refresh/polling for new votes. Easy to
      add later (a setInterval re-fetch) if this is expected to sit open
      on a live blog for a long time and reflect changing results without
      a page reload.
*/

(function () {
  var STYLE_ID = "contribly-poll-styles";
  var API_BASE = "https://api.contribly.com/1";
  var DEFAULT_LANGUAGE = "en-gb";
  var VOTES_VISIBILITY_THRESHOLD = 150;

  var TRANSLATIONS = {
    "en-gb": { votes: "votes", loadError: "This couldn't be loaded.", noPoll: "No poll on this call-out." },
    "en-us": { votes: "votes", loadError: "This couldn't be loaded.", noPoll: "No poll on this call-out." },
    "en-ie": { votes: "votes", loadError: "This couldn't be loaded.", noPoll: "No poll on this call-out." },
    "fr-fr": { votes: "votes", loadError: "Impossible de charger ce contenu.", noPoll: "Aucun sondage pour cet appel \u00e0 contribution." },
    "nl-nl": { votes: "stemmen", loadError: "Kon niet worden geladen.", noPoll: "Geen peiling bij deze oproep." },
    "nl-be": { votes: "stemmen", loadError: "Kon niet worden geladen.", noPoll: "Geen peiling bij deze oproep." },
    "es-es": { votes: "votos", loadError: "No se pudo cargar.", noPoll: "No hay encuesta en esta convocatoria." },
    "de-de": { votes: "Stimmen", loadError: "Konnte nicht geladen werden.", noPoll: "Keine Umfrage zu diesem Aufruf." },
    "fi-fi": { votes: "\u00e4\u00e4nt\u00e4", loadError: "T\u00e4t\u00e4 ei voitu ladata.", noPoll: "Ei \u00e4\u00e4nestyst\u00e4 t\u00e4ss\u00e4 kutsussa." },
    "hr-hr": { votes: "glasova", loadError: "Ovo se nije moglo u\u010ditati.", noPoll: "Nema ankete za ovaj poziv." },
    "ro-ro": { votes: "voturi", loadError: "Acest lucru nu a putut fi \u00eenc\u0103rcat.", noPoll: "Niciun sondaj pentru acest apel." }
  };

  function translate(lang, key) {
    var normalised = (lang || DEFAULT_LANGUAGE).toLowerCase();
    if (TRANSLATIONS[normalised] && TRANSLATIONS[normalised][key]) return TRANSLATIONS[normalised][key];
    var base = normalised.split("-")[0];
    var baseMatch = Object.keys(TRANSLATIONS).filter(function (c) { return c.split("-")[0] === base; })[0];
    if (baseMatch) return TRANSLATIONS[baseMatch][key];
    return TRANSLATIONS[DEFAULT_LANGUAGE][key];
  }

  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".contribly-poll{container-type:inline-size;width:100%;box-sizing:border-box;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".contribly-poll *{box-sizing:border-box;}" +
      ".cp-card{--cp-ink:#17171a;--cp-muted:#6e6e76;--cp-accent:#4f46e5;--cp-track:#f0f0f5;--cp-bg:#fff;" +
      "max-width:560px;margin:0 auto;background:var(--cp-bg);color:var(--cp-ink);border-radius:10px;" +
      "padding:24px 22px;box-shadow:0 1px 3px rgba(20,20,43,.08);}" +
      "@media (prefers-color-scheme:dark){.cp-card{--cp-ink:#f2f1f7;--cp-muted:#a3a2ad;--cp-accent:#a5a0fb;--cp-track:#2a2a33;--cp-bg:#1c1c22;}}" +
      ".cp-question{font-size:18px;font-weight:700;margin:0 0 20px;line-height:1.35;}" +
      ".cp-row{margin-bottom:14px;}" +
      ".cp-row:last-child{margin-bottom:0;}" +
      ".cp-label-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;margin-bottom:6px;}" +
      ".cp-label-row span:first-child{min-width:0;overflow-wrap:break-word;}" +
      ".cp-pct{color:var(--cp-accent);flex-shrink:0;}" +
      ".cp-track{height:30px;background:var(--cp-track);border-radius:6px;overflow:hidden;}" +
      ".cp-fill{height:100%;background:var(--cp-accent);border-radius:6px;transition:width .5s ease;}" +
      ".cp-total{font-size:12.5px;color:var(--cp-muted);margin-top:18px;text-align:right;}" +
      ".cp-skeleton{max-width:560px;margin:0 auto;height:220px;border-radius:10px;" +
      "background:linear-gradient(90deg,#e4e4e4 25%,#efefef 37%,#e4e4e4 63%);background-size:400% 100%;animation:cp-shimmer 1.4s ease infinite;}" +
      "@media (prefers-color-scheme:dark){.cp-skeleton{background:linear-gradient(90deg,#2a2a33 25%,#34343f 37%,#2a2a33 63%);background-size:400% 100%;}}" +
      "@keyframes cp-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}" +
      ".cp-state{max-width:560px;margin:0 auto;background:#f5f5f5;padding:32px 16px;text-align:center;color:#666;" +
      "font-size:14px;display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:10px;}" +
      "@container (max-width:320px){.cp-question{font-size:16px;}.cp-track{height:26px;}.cp-label-row{font-size:13px;}}" +
      "@media (prefers-reduced-motion:reduce){.contribly-poll *{animation-duration:.001ms!important;transition-duration:.001ms!important;}}";
    document.head.appendChild(s);
  }

  var PRECONNECT_ID = "contribly-poll-preconnect";
  function addPreconnectOnce() {
    if (document.getElementById(PRECONNECT_ID)) return;
    var link = document.createElement("link");
    link.id = PRECONNECT_ID; link.rel = "preconnect"; link.href = "https://api.contribly.com"; link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  function escapeHtml(str) { var d = document.createElement("div"); d.textContent = str == null ? "" : str; return d.innerHTML; }

  function fetchAssignment(id) {
    return fetch(API_BASE + "/assignments/" + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error("assignment fetch failed"); return r.json(); });
  }

  // Builds the display list: [{ id, label, count }], every option present
  // even if it has zero votes (missing from counts entirely in real data).
  function buildPollModel(assignment) {
    var pollSummary = (assignment.pollSummary || [])[0];
    if (!pollSummary) return null;

    var fieldDef = (assignment.additionalFields || []).filter(function (f) {
      return f.name === pollSummary.name && f.type === "poll";
    })[0];

    var displayOptions;
    if (fieldDef && fieldDef.optionsExt && fieldDef.optionsExt.length) {
      displayOptions = fieldDef.optionsExt.map(function (o) { return { id: o.id, label: o.name }; });
    } else if (fieldDef && fieldDef.options && fieldDef.options.length) {
      displayOptions = fieldDef.options.map(function (v) { return { id: v, label: v }; });
    } else {
      // No field definition found at all: fall back to whatever raw keys
      // pollSummary.counts happens to have. Lower quality (raw slugs as
      // labels, and any true zero-vote option would be invisible since
      // there is nothing else to enumerate it from), but still functional.
      displayOptions = Object.keys(pollSummary.counts || {}).map(function (k) { return { id: k, label: k }; });
    }

    var counts = pollSummary.counts || {};
    var results = displayOptions.map(function (o) {
      return { id: o.id, label: o.label, count: counts[o.id] || 0 };
    });
    var total = results.reduce(function (sum, r) { return sum + r.count; }, 0);
    results.forEach(function (r) { r.pct = total > 0 ? Math.round((r.count / total) * 100) : 0; });
    results.sort(function (a, b) { return b.count - a.count; });

    return { question: pollSummary.label || (fieldDef && fieldDef.label) || "", results: results, total: total };
  }

  function renderState(root, lang, kind) {
    root.innerHTML = "";
    var s = document.createElement("div");
    s.className = "cp-state";
    s.innerHTML = ICON_ALERT + "<span>" + escapeHtml(translate(lang, kind === "noPoll" ? "noPoll" : "loadError")) + "</span>";
    root.appendChild(s);
  }

  function renderPoll(root, model, lang) {
    root.innerHTML = "";
    var card = document.createElement("div");
    card.className = "cp-card";

    var question = document.createElement("p");
    question.className = "cp-question";
    question.textContent = model.question;
    card.appendChild(question);

    model.results.forEach(function (r, index) {
      var row = document.createElement("div");
      row.className = "cp-row";

      var labelRow = document.createElement("div");
      labelRow.className = "cp-label-row";
      labelRow.innerHTML = "<span>" + escapeHtml(r.label) + '</span><span class="cp-pct">' + r.pct + "%</span>";
      row.appendChild(labelRow);

      var track = document.createElement("div");
      track.className = "cp-track";
      var fill = document.createElement("div");
      fill.className = "cp-fill";
      fill.style.width = r.pct + "%";
      if (index > 0) fill.style.opacity = "0.45";
      track.appendChild(fill);
      row.appendChild(track);

      card.appendChild(row);
    });

    if (model.total > VOTES_VISIBILITY_THRESHOLD) {
      var total = document.createElement("p");
      total.className = "cp-total";
      total.textContent = model.total + " " + translate(lang, "votes");
      card.appendChild(total);
    }

    root.appendChild(card);
  }

  function initInstance(root) {
    injectStylesOnce();
    addPreconnectOnce();
    root.setAttribute("data-contribly-initialised", "true");
    var assignmentId = root.getAttribute("data-assignment");
    var lang = root.getAttribute("data-language") || DEFAULT_LANGUAGE;
    if (!assignmentId) { renderState(root, lang, "loadError"); return; }

    var skeleton = document.createElement("div");
    skeleton.className = "cp-skeleton";
    root.appendChild(skeleton);

    fetchAssignment(assignmentId)
      .then(function (assignment) {
        var model = buildPollModel(assignment);
        if (!model) { renderState(root, lang, "noPoll"); return; }
        renderPoll(root, model, lang);
      })
      .catch(function () { renderState(root, lang, "loadError"); });
  }

  function init() {
    document.querySelectorAll(".contribly-poll:not([data-contribly-initialised])").forEach(initInstance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
