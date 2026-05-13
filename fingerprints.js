/* ============================================================
   TERMS-Bench bargaining fingerprints — standalone renderer for
   leaderboard/fingerprints.html. Reuses data.js + diagnoses.js
   (already loaded as <script> tags) and renders one card per
   evaluated LLM agent (filters out fixed-concession baselines and
   any agent without a diagnoses.js entry).
   ============================================================ */

(function () {
  const data = window.TERMS_DATA;
  if (!data) {
    console.error("TERMS_DATA not loaded — check data.js ordering.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  /* --------------------------- Theme toggle --------------------------- */

  function initThemeToggle() {
    const btn = $("theme-toggle");
    if (!btn) return;
    const get = () =>
      document.documentElement.getAttribute("data-theme") || "light";
    const set = (t) => {
      document.documentElement.setAttribute("data-theme", t);
      try {
        localStorage.setItem("terms-theme", t);
      } catch (_) {}
    };
    btn.addEventListener("click", () => {
      set(get() === "light" ? "dark" : "light");
    });
  }

  /* --------------------------- α_cue / α_inf -------------------------- */

  const FAM_CUE_REVEAL = ["inference_critical", "expressive"];
  const FAM_CUE_MUTED  = ["taciturn", "strategic"];
  const FAM_TYPE_INSTR = ["inference_critical", "taciturn"];
  const FAM_HIGH_REACT = ["expressive", "strategic"];

  function meanFamilySE(row, fams) {
    const vals = [];
    for (const f of fams) {
      const cell = (row.families || {})[f];
      const v = cell && cell.se_plus;
      if (typeof v === "number" && isFinite(v)) vals.push(v);
    }
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function diagAlphas(row) {
    const reveal = meanFamilySE(row, FAM_CUE_REVEAL);
    const muted  = meanFamilySE(row, FAM_CUE_MUTED);
    const instr  = meanFamilySE(row, FAM_TYPE_INSTR);
    const react  = meanFamilySE(row, FAM_HIGH_REACT);
    return {
      alpha_cue: (reveal != null && muted != null) ? reveal - muted : null,
      alpha_inf: (instr  != null && react != null) ? instr - react  : null,
    };
  }

  function penaltyTier(v, thresh = { bad: -0.04, mid: -0.02 }) {
    if (v == null || !isFinite(v)) return { label: "—", cls: "neutral" };
    if (v <= thresh.bad)            return { label: "brittle",  cls: "warn" };
    if (v <= thresh.mid)            return { label: "moderate", cls: "neutral" };
    return                                  { label: "robust",  cls: "good" };
  }

  function fmtPlusMinus(v, d) {
    if (v == null || !isFinite(v)) return "—";
    const s = v >= 0 ? "+" : "−";
    return s + Math.abs(v).toFixed(d ?? 3);
  }
  function fmtSE(v, d)  { return (v == null || !isFinite(v)) ? "—" : v.toFixed(d ?? 3); }
  function fmtPct(v, d) { return (v == null || !isFinite(v)) ? "—" : (v * 100).toFixed(d ?? 1) + "%"; }

  function rankBy(rows, key, dir) {
    const enriched = rows.map((r) => ({ row: r, v: key(r) }))
                         .filter((x) => x.v != null && isFinite(x.v));
    enriched.sort((a, b) => dir > 0 ? b.v - a.v : a.v - b.v);
    const ranks = new Map();
    enriched.forEach((x, i) => ranks.set(x.row.id, i + 1));
    return { ranks, n: enriched.length };
  }

  function buildSuperlatives(rows, agent, alphasMap) {
    const seR   = rankBy(rows, (r) => r.regimes.overall.se_plus,            +1);
    const agrR  = rankBy(rows, (r) => r.regimes.overall.agr_plus,           +1);
    const beR   = rankBy(rows, (r) => r.regimes.overall.be_type,            -1);
    const critR = rankBy(rows, (r) => r.regimes.overall.crit_viol_pct,      -1);
    const condR = rankBy(rows, (r) => r.regimes.overall.conditional_utility, +1);
    const cueR  = rankBy(rows, (r) => alphasMap.get(r.id)?.alpha_cue,       +1);
    const infR  = rankBy(rows, (r) => alphasMap.get(r.id)?.alpha_inf,       +1);

    const strengths = [];
    const weaknesses = [];
    const id = agent.id;

    const push = (rank, label, where) => {
      if (rank == null) return;
      if (rank === 1) where.push(`${label} (best in panel)`);
      else if (rank === 2) where.push(`${label} (2nd in panel)`);
    };
    push(seR.ranks.get(id),   "Highest SE⁺",                 strengths);
    push(condR.ranks.get(id), "Highest conditional surplus", strengths);
    push(agrR.ranks.get(id),  "Highest feasible-agreement",  strengths);
    push(beR.ranks.get(id),   "Lowest type-belief error",    strengths);
    push(critR.ranks.get(id), "Cleanest critical-violation", strengths);
    push(cueR.ranks.get(id),  "Most robust to verbal cues",  strengths);
    push(infR.ranks.get(id),  "Best latent-type conversion", strengths);

    const pushW = (rank, label, total) => {
      if (rank == null) return;
      if (rank === total) weaknesses.push(`${label} (worst in panel)`);
      else if (rank === total - 1) weaknesses.push(`${label} (2nd worst in panel)`);
    };
    pushW(seR.ranks.get(id),   "Lowest SE⁺",                  seR.n);
    pushW(condR.ranks.get(id), "Lowest conditional surplus",  condR.n);
    pushW(agrR.ranks.get(id),  "Lowest feasible-agreement",   agrR.n);
    pushW(beR.ranks.get(id),   "Highest type-belief error",   beR.n);
    pushW(critR.ranks.get(id), "Highest critical-violation",  critR.n);
    pushW(cueR.ranks.get(id),  "Largest α_cue penalty",       cueR.n);
    pushW(infR.ranks.get(id),  "Largest α_inf penalty",       infR.n);

    return {
      strengths: strengths.slice(0, 2),
      weaknesses: weaknesses.slice(0, 2),
      ranks: { se: seR.ranks.get(id) },
      n: seR.n,
    };
  }

  function avatarGlyph(name) {
    const parts = (name || "").split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* ------------------ Provider / model-family logos ------------------ *
   * Mirror of resolveAgentLogoSlug() from app.js; kept here so the
   * standalone fingerprints page doesn't need to depend on app.js. SVGs
   * live under leaderboard/logos/<slug>.svg and are embedded as <img>
   * inside the .diag-avatar tile.
   */
  const LOGO_FILES_AVAILABLE = new Set([
    "openai", "claude", "anthropic", "gemini", "gemma", "deepmind",
    "grok", "moonshot", "deepseek", "meta", "qwen", "zai",
    "doubao", "tencent",
  ]);
  const PROVIDER_LOGO_FALLBACK = {
    openai: "openai",
    anthropic: "claude",
    google: "gemini",
    "x-ai": "grok",
    moonshotai: "moonshot",
    deepseek: "deepseek",
    "meta-llama": "meta",
    qwen: "qwen",
    tencent: "tencent",
    claude: "claude",
    gemini: "gemini",
    gpt: "openai",
    zhipu: "zai",
    bytedance: "doubao",
  };
  function resolveAgentLogoSlug(row) {
    if (!row || row.kind === "baseline") return null;
    const id = row.id || "";
    const m = id.match(/^llm_([^_]+)_(.+)$/);
    const providerSlug = m ? m[1] : row.provider_slug || "";
    const modelLower = m ? m[2].toLowerCase() : "";
    let candidate = null;
    if (modelLower.startsWith("claude")) candidate = "claude";
    else if (modelLower.startsWith("gemini")) candidate = "gemini";
    else if (modelLower.startsWith("gemma")) candidate = "gemma";
    else if (modelLower.startsWith("grok")) candidate = "grok";
    else if (modelLower.startsWith("kimi")) candidate = "moonshot";
    else if (modelLower.startsWith("llama")) candidate = "meta";
    else if (modelLower.startsWith("deepseek")) candidate = "deepseek";
    else if (modelLower.startsWith("qwen")) candidate = "qwen";
    else if (modelLower.startsWith("hy3")) candidate = "tencent";
    else if (modelLower.startsWith("gpt") || /^o[1-9]/.test(modelLower))
      candidate = "openai";
    if (!candidate)
      candidate = PROVIDER_LOGO_FALLBACK[providerSlug] || null;
    return candidate && LOGO_FILES_AVAILABLE.has(candidate) ? candidate : null;
  }

  /* --------------------------- Renderer ------------------------------- */

  function renderDiagnoses() {
    const host = $("diagnoses-grid");
    if (!host || !window.TERMS_DIAGNOSES) return;
    host.innerHTML = "";
    const meta = window.TERMS_DIAGNOSES;

    const llmRows = data.rows.filter(
      (r) => r.kind !== "baseline" && meta[r.id]
    );

    const alphasMap = new Map();
    for (const row of llmRows) alphasMap.set(row.id, diagAlphas(row));

    const rows = [...llmRows].sort((a, b) => {
      const av = a.regimes.overall.se_plus ?? -Infinity;
      const bv = b.regimes.overall.se_plus ?? -Infinity;
      return bv - av;
    });

    // Update the agent-count meta in the header.
    const agentCountEl = $("fp-agent-count");
    if (agentCountEl) agentCountEl.textContent = `${rows.length}`;

    for (const row of rows) {
      const overall = row.regimes.overall || {};
      const m = meta[row.id] || {};
      const alphas = alphasMap.get(row.id) || {};
      const supers = buildSuperlatives(llmRows, row, alphasMap);

      const card = document.createElement("article");
      card.className = "diagnosis-card";
      card.setAttribute("data-agent-id", row.id);

      const cueTier = penaltyTier(alphas.alpha_cue);
      const infTier = penaltyTier(alphas.alpha_inf);

      // Avatar source priority: hand-curated avatar image > provider logo
      // SVG > letter-glyph fallback.
      const logoSlug = resolveAgentLogoSlug(row);
      let avatarMarkup;
      if (m.avatar) {
        avatarMarkup = `<img src="${m.avatar}" alt="${row.display} avatar" class="diag-avatar-img"/>`;
      } else if (logoSlug) {
        avatarMarkup =
          `<img src="logos/${logoSlug}.svg" alt="${row.display} logo" class="diag-avatar-logo"/>`;
      } else {
        avatarMarkup = `<span class="diag-avatar-glyph">${avatarGlyph(row.display)}</span>`;
      }

      const rankCell = supers.ranks.se
        ? `· #${supers.ranks.se} of ${supers.n}`
        : ``;

      const tags = [];
      if (m.trajectory) tags.push({ label: "trajectory", value: m.trajectory });
      if (m.safety)     tags.push({ label: "safety",     value: m.safety });
      if (m.bottleneck && m.bottleneck !== "unknown")
        tags.push({ label: "bottleneck", value: m.bottleneck + "-limited" });

      const tagMarkup = tags.map((t) =>
        `<span class="diag-tag"><span class="diag-tag-label">${t.label}</span>${t.value}</span>`
      ).join("");

      const strengthList = supers.strengths.length
        ? supers.strengths.map((s) => `<li>${s}</li>`).join("")
        : `<li style="color: var(--fg-faint); opacity: 0.7;">—</li>`;
      const weaknessList = supers.weaknesses.length
        ? supers.weaknesses.map((s) => `<li>${s}</li>`).join("")
        : `<li style="color: var(--fg-faint); opacity: 0.7;">—</li>`;

      card.innerHTML = `
        <div class="diag-head">
          <div class="diag-avatar">${avatarMarkup}</div>
          <div class="diag-title">
            <div class="diag-name">${row.display}</div>
            <div class="diag-provider">${row.provider || ""} <span class="diag-rank-inline">${rankCell}</span></div>
          </div>
        </div>

        ${m.tagline ? `<p class="diag-tagline">${m.tagline}</p>` : ""}

        <div class="diag-headline">
          <div class="diag-headline-cell">
            <span class="diag-headline-label">SE⁺</span>
            <span class="diag-headline-value">${fmtSE(overall.se_plus)}</span>
            ${(() => {
              const pg = (window.TERMS_PG_OVERLAY || {})[row.id]?.se_plus_pg;
              if (pg == null || !isFinite(pg) || overall.se_plus == null) return "";
              const d = pg - overall.se_plus;
              const cls = (d >= 0.01) ? "good" : (d <= -0.01 ? "warn" : "neutral");
              const sign = d >= 0 ? "+" : "−";
              return `<span class="diag-pg-delta ${cls}" title="Δ vs data-grounded suite (PG SE⁺ ${fmtSE(pg)})">PG ${sign}${Math.abs(d).toFixed(3)}</span>`;
            })()}
          </div>
          <div class="diag-headline-cell">
            <span class="diag-headline-label">AGR⁺</span>
            <span class="diag-headline-value">${fmtPct(overall.agr_plus)}</span>
          </div>
          <div class="diag-headline-cell">
            <span class="diag-headline-label">CSE⁺</span>
            <span class="diag-headline-value">${fmtSE(overall.cse_plus)}</span>
          </div>
          <div class="diag-headline-cell">
            <span class="diag-headline-label">BE_type</span>
            <span class="diag-headline-value">${fmtSE(overall.be_type)}</span>
          </div>
          <div class="diag-headline-cell">
            <span class="diag-headline-label">CritViol</span>
            <span class="diag-headline-value">${fmtPct(overall.crit_viol_pct, 2)}</span>
          </div>
        </div>

        ${tagMarkup ? `<div class="diag-tags">${tagMarkup}</div>` : ""}

        <div class="diag-axes">
          <div class="diag-axis">
            <span class="diag-axis-label">cue sensitivity (α_cue)</span>
            <span class="diag-axis-value">
              ${fmtPlusMinus(alphas.alpha_cue)}
              <span class="diag-axis-flag ${cueTier.cls}">${cueTier.label}</span>
            </span>
            <span class="diag-axis-note">cue-revealing minus cue-muted family SE⁺</span>
          </div>
          <div class="diag-axis">
            <span class="diag-axis-label">latent-type use (α_inf)</span>
            <span class="diag-axis-value">
              ${fmtPlusMinus(alphas.alpha_inf)}
              <span class="diag-axis-flag ${infTier.cls}">${infTier.label}</span>
            </span>
            <span class="diag-axis-note">type-instrumental minus high-reactivity family SE⁺</span>
          </div>
        </div>

        <div class="diag-superlatives">
          <div class="diag-super-col strengths">
            <h4>Strengths</h4>
            <ul>${strengthList}</ul>
          </div>
          <div class="diag-super-col weaknesses">
            <h4>Weaknesses</h4>
            <ul>${weaknessList}</ul>
          </div>
        </div>

        ${m.diagnosis ? `
          <p class="diag-paragraph">
            <span class="diag-paragraph-label">Diagnosis</span>
            ${m.diagnosis}
          </p>` : ""}
      `;

      host.appendChild(card);
    }
  }

  /* --------------------------- Kickoff -------------------------------- */

  initThemeToggle();
  renderDiagnoses();
})();
