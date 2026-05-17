/* ============================================================
   TERMS-Bench leaderboard renderer.
   Data source: window.TERMS_DATA, built by leaderboard/build_data.py.
   ============================================================ */

(function () {
  const data = window.TERMS_DATA;
  if (!data) {
    console.error("TERMS_DATA not loaded");
    return;
  }

  /* --------------------------- Constants --------------------------- */

  const SERIES_COLORS = [
    "--s1", "--s2", "--s3", "--s4", "--s5",
    "--s6", "--s7", "--s8", "--s9", "--s10",
  ];

  const KIND_FILTERS = [
    { id: "all", label: "All" },
    { id: "frontier", label: "Frontier" },
    { id: "open", label: "Open-weight" },
    { id: "baseline", label: "Baselines" },
  ];

  // Metrics whose lower values are better — bar fills reverse orientation.
  const LOWER_IS_BETTER = new Set(["fagr_minus", "be_type", "crit_viol_pct"]);

  // Known worst-case reference scales for reverse bars (0→worst).
  const REVERSE_BAR_MAX = {
    fagr_minus: 1.0,
    crit_viol_pct: 0.25,
    be_type: 0.5,
  };

  // Expected upper bound for higher-is-better bar normalization.
  const FORWARD_BAR_MAX = {
    se_plus: 1.0,
    agr_plus: 1.0,
    cse_plus: 1.0,
    mean_utility: null, // computed dynamically from row range
  };

  /* --------------------------- Utilities --------------------------- */

  const $ = (id) => document.getElementById(id);
  const ce = (tag, attrs, children) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else el.setAttribute(k, v);
      }
    }
    if (children) {
      for (const c of children) {
        if (c == null) continue;
        if (typeof c === "string") el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
      }
    }
    return el;
  };

  const fmtNum = (x, digits) => {
    if (x == null || Number.isNaN(x)) return null;
    return Number(x).toFixed(digits ?? 3);
  };

  const metricCellDigits = {
    se_plus: 3,
    agr_plus: 3,
    cse_plus: 3,
    fagr_minus: 3,
    be_type: 3,
    crit_viol_pct: 3,
    mean_utility: 2,
    stance_acc: 3,
    conditional_utility: 2,
    safe_term_minus: 3,
    n_episodes: 0,
  };

  /* --------------------------- Masthead meta --------------------------- */

  // Friendly version label shown to readers; the raw build run id from
  // build_data.py (data.run) is kept in the data file for provenance but
  // not surfaced to end users, since the artifact slug isn't meaningful.
  $("meta-run").textContent = "TERMS-Bench-v1 (Bilateral Negotiation)";
  $("meta-date").textContent = formatDate(data.generatedAt);
  $("meta-agents").textContent = `${data.rows.length}`;
  const fr = $("footer-run");
  if (fr) fr.textContent = "TERMS-Bench";

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  }

  /* ============================================================
     SECTION A — Leaderboard (regime pills, sortable, paginated)
     ============================================================ */

  const boardState = {
    regime: "overall",
    sortKey: "se_plus",
    sortDir: "desc",
    pageSize: data.rows.length,
    page: 1,
  };

  function initRegimePills() {
    const host = $("regime-pills");
    host.innerHTML = "";
    for (const id of data.regimes) {
      const pill = ce("button", {
        class: "pill" + (id === boardState.regime ? " active" : ""),
        type: "button",
        "data-id": id,
        text: data.regimeLabels[id] || id,
        onclick: () => {
          boardState.regime = id;
          boardState.page = 1;
          renderRegimePills();
          renderBoard();
          termsUrlScheduleSync();
        },
      });
      host.appendChild(pill);
    }
  }

  function renderRegimePills() {
    for (const pill of $("regime-pills").querySelectorAll(".pill")) {
      pill.classList.toggle("active", pill.dataset.id === boardState.regime);
    }
  }

  function initSortHeaders() {
    const ths = document.querySelectorAll("#leaderboard thead th.sortable");
    ths.forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (boardState.sortKey === key) {
          boardState.sortDir = boardState.sortDir === "desc" ? "asc" : "desc";
        } else {
          boardState.sortKey = key;
          boardState.sortDir = LOWER_IS_BETTER.has(key) ? "asc" : "desc";
        }
        renderBoard();
      });
    });
  }

  function compareRows(a, b, key, dir) {
    const va = (a.regimes[boardState.regime] || {})[key];
    const vb = (b.regimes[boardState.regime] || {})[key];
    const aIsNum = va != null && !Number.isNaN(va);
    const bIsNum = vb != null && !Number.isNaN(vb);
    if (!aIsNum && !bIsNum) return 0;
    if (!aIsNum) return 1; // always sink empty cells
    if (!bIsNum) return -1;
    return dir === "asc" ? va - vb : vb - va;
  }

  function renderBoard() {
    const rows = [...data.rows].sort((a, b) =>
      compareRows(a, b, boardState.sortKey, boardState.sortDir)
    );

    // header sort state
    document.querySelectorAll("#leaderboard thead th.sortable").forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.key === boardState.sortKey) {
        th.classList.add(boardState.sortDir === "asc" ? "sort-asc" : "sort-desc");
      }
    });

    const body = $("leaderboard-body");
    body.innerHTML = "";

    const meanUtilMax = Math.max(
      ...data.rows.map((r) => Math.abs((r.regimes[boardState.regime] || {}).mean_utility || 0)),
      1
    );

    const start = (boardState.page - 1) * boardState.pageSize;
    const end = start + boardState.pageSize;
    const pageRows = rows.slice(start, end);

    pageRows.forEach((row, idx) => {
      const slice = row.regimes[boardState.regime] || {};
      const tr = ce("tr");
      tr.appendChild(ce("td", { class: "col-rank", text: String(start + idx + 1) }));
      tr.appendChild(
        ce("td", { class: "col-agent" }, [makeAgentCell(row, { showKind: true })])
      );
      tr.appendChild(ce("td", { class: "col-provider", text: row.provider || "—" }));
      tr.appendChild(makeBarCell(slice.se_plus, "se_plus"));
      tr.appendChild(makeBarCell(slice.agr_plus, "agr_plus"));
      tr.appendChild(makeBarCell(slice.cse_plus, "cse_plus"));
      tr.appendChild(makeBarCell(slice.fagr_minus, "fagr_minus"));
      tr.appendChild(makeBarCell(slice.be_type, "be_type"));
      tr.appendChild(makeBarCell(slice.crit_viol_pct, "crit_viol_pct"));
      tr.appendChild(
        makeBarCell(slice.mean_utility, "mean_utility", { max: meanUtilMax })
      );
      body.appendChild(tr);
    });

    renderPagination(rows.length);
  }

  function makeBarCell(value, metric, opts) {
    const td = ce("td", { class: "num" });
    if (value == null || Number.isNaN(value)) {
      td.appendChild(ce("span", { class: "na-cell", text: "—" }));
      return td;
    }
    const digits = metricCellDigits[metric] ?? 3;
    const displayNum = fmtNum(value, digits);
    const reverse = LOWER_IS_BETTER.has(metric);
    const maxVal = reverse
      ? REVERSE_BAR_MAX[metric] ?? 1
      : opts?.max ?? FORWARD_BAR_MAX[metric] ?? 1;
    const pct = Math.max(0, Math.min(1, Math.abs(value) / (maxVal || 1))) * 100;
    td.appendChild(
      ce("div", { class: "bar-cell" }, [
        ce("span", { class: "bar-num", text: displayNum }),
        ce("div", { class: "bar-track" }, [
          ce("div", {
            class: reverse ? "bar-fill reverse" : "bar-fill",
            style: `width:${pct.toFixed(1)}%`,
          }),
        ]),
      ])
    );
    return td;
  }

  function renderPagination(total) {
    const row = $("pagination-row");
    row.innerHTML = "";
    if (total <= boardState.pageSize) return;

    const totalPages = Math.ceil(total / boardState.pageSize);
    const prev = ce("button", {
      text: "Prev",
      disabled: boardState.page === 1 ? "disabled" : null,
      onclick: () => {
        if (boardState.page > 1) {
          boardState.page -= 1;
          renderBoard();
        }
      },
    });
    const next = ce("button", {
      text: "Next",
      disabled: boardState.page === totalPages ? "disabled" : null,
      onclick: () => {
        if (boardState.page < totalPages) {
          boardState.page += 1;
          renderBoard();
        }
      },
    });
    const count = ce("span", {
      class: "count",
      text: `Page ${boardState.page} / ${totalPages} · ${total} agents`,
    });
    row.appendChild(count);
    row.appendChild(prev);
    row.appendChild(next);
  }

  /* ============================================================
     SECTION B/C — Headline line charts
     ============================================================ */

  const chartStates = {
    family: { kind: "all", hidden: new Set() },
    difficulty: { kind: "all", hidden: new Set() },
  };

  function initKindPills(hostId, stateKey, rerender) {
    const host = $(hostId);
    host.innerHTML = "";
    for (const { id, label } of KIND_FILTERS) {
      const pill = ce("button", {
        class: "pill" + (chartStates[stateKey].kind === id ? " active" : ""),
        type: "button",
        "data-id": id,
        text: label,
        onclick: () => {
          chartStates[stateKey].kind = id;
          chartStates[stateKey].hidden = new Set();
          for (const p of host.querySelectorAll(".pill")) {
            p.classList.toggle("active", p.dataset.id === id);
          }
          rerender();
          termsUrlScheduleSync();
        },
      });
      host.appendChild(pill);
    }
  }

  function eligibleRows(stateKey, sliceKey, axisIds) {
    const st = chartStates[stateKey];
    const kind = st.kind;
    const rows = data.rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      const slices = r[sliceKey] || {};
      // Row must have at least one se_plus value on the axis
      return axisIds.some((id) => {
        const s = slices[id] || {};
        return s.se_plus != null && !Number.isNaN(s.se_plus);
      });
    });
    return rows;
  }

  function renderChart({
    containerId,
    footnoteId,
    axisIds,
    axisLabels,
    sliceKey,
    stateKey,
    xAxisLabel,
    yAxisLabel = "SE⁺",
  }) {
    const container = $(containerId);
    container.innerHTML = "";
    const rows = eligibleRows(stateKey, sliceKey, axisIds);

    const footnote = $(footnoteId);
    if (!rows.length || !axisIds.length) {
      container.appendChild(
        ce("div", {
          class: "chart-empty",
          text:
            "No agents with this slice are available in the current run. " +
            "Run a full sweep with the latest schema to populate this panel.",
        })
      );
      if (footnote) footnote.textContent = "";
      return;
    }

    // Determine color per agent (stable by insertion order in data.rows).
    const colorIndex = new Map();
    let ci = 0;
    for (const r of data.rows) {
      if (rows.includes(r)) {
        colorIndex.set(r.id, SERIES_COLORS[ci % SERIES_COLORS.length]);
        ci += 1;
      }
    }

    // SVG layout
    const width = 920;
    const height = 380;
    const margin = { top: 18, right: 24, bottom: 52, left: 54 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${yAxisLabel} vs ${xAxisLabel}`);

    // Scales: x is categorical → discrete positions
    const n = axisIds.length;
    const xAt = (i) => margin.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));

    // y-axis: always 0..1 for SE+
    const yMax = 1.0;
    const yAt = (v) => margin.top + plotH - (v / yMax) * plotH;

    // Gridlines + y-axis labels (0, 0.25, 0.5, 0.75, 1)
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
    for (const t of yTicks) {
      const y = yAt(t);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", margin.left);
      line.setAttribute("x2", margin.left + plotW);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-grid-line");
      svg.appendChild(line);
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", margin.left - 8);
      lbl.setAttribute("y", y + 3.5);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = t.toFixed(2);
      svg.appendChild(lbl);
    }

    // x-axis line
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", margin.left);
    xAxis.setAttribute("x2", margin.left + plotW);
    xAxis.setAttribute("y1", margin.top + plotH);
    xAxis.setAttribute("y2", margin.top + plotH);
    xAxis.setAttribute("class", "chart-axis-line");
    svg.appendChild(xAxis);

    // x-tick labels
    axisIds.forEach((id, i) => {
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", xAt(i));
      lbl.setAttribute("y", margin.top + plotH + 20);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = axisLabels[id] || id;
      svg.appendChild(lbl);
    });

    // axis titles
    const xTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xTitle.setAttribute("x", margin.left + plotW / 2);
    xTitle.setAttribute("y", height - 6);
    xTitle.setAttribute("text-anchor", "middle");
    xTitle.setAttribute("class", "chart-axis-label");
    xTitle.textContent = xAxisLabel;
    svg.appendChild(xTitle);

    const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const yTitleX = 16;
    const yTitleY = margin.top + plotH / 2;
    yTitle.setAttribute("x", yTitleX);
    yTitle.setAttribute("y", yTitleY);
    yTitle.setAttribute("text-anchor", "middle");
    yTitle.setAttribute("transform", `rotate(-90 ${yTitleX} ${yTitleY})`);
    yTitle.setAttribute("class", "chart-axis-label");
    yTitle.textContent = yAxisLabel;
    svg.appendChild(yTitle);

    // Series — polylines + dots
    const hidden = chartStates[stateKey].hidden;
    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const color = `var(${colorToken})`;
      const slices = row[sliceKey] || {};
      const points = [];
      axisIds.forEach((id, i) => {
        const s = slices[id] || {};
        const v = s.se_plus;
        if (v != null && !Number.isNaN(v)) {
          points.push([xAt(i), yAt(v), v]);
        }
      });
      if (!points.length) continue;
      const isDim = hidden.has(row.id);
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", points.map((p) => `${p[0]},${p[1]}`).join(" "));
      polyline.setAttribute("class", "chart-series-line" + (isDim ? " dim" : ""));
      polyline.setAttribute("stroke", color);
      svg.appendChild(polyline);

      points.forEach(([x, y]) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", x);
        c.setAttribute("cy", y);
        c.setAttribute("r", 3.5);
        c.setAttribute("fill", color);
        c.setAttribute("stroke", "var(--bg)");
        c.setAttribute("class", "chart-series-dot" + (isDim ? " dim" : ""));
        svg.appendChild(c);
      });
    }

    container.appendChild(svg);

    // Legend
    const legend = ce("div", { class: "chart-legend" });
    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const isDim = hidden.has(row.id);
      const item = ce("span", {
        class: "chart-legend-item" + (isDim ? " dim" : ""),
        onclick: () => {
          if (hidden.has(row.id)) hidden.delete(row.id);
          else hidden.add(row.id);
          // Re-render to update line dimming
          if (stateKey === "family") renderFamilyChart();
          else renderDifficultyChart();
        },
      });
      item.appendChild(
        ce("span", {
          class: "chart-legend-swatch",
          style: `background: var(${colorToken})`,
        })
      );
      item.appendChild(ce("span", { text: row.display }));
      legend.appendChild(item);
    }
    container.appendChild(legend);

    if (footnote) {
      const omitted = data.rows.length - rows.length;
      const kindLabel = chartStates[stateKey].kind === "all"
        ? "all kinds"
        : KIND_FILTERS.find((k) => k.id === chartStates[stateKey].kind)?.label.toLowerCase();
      footnote.textContent =
        `Showing ${rows.length} of ${data.rows.length} agents (${kindLabel}).` +
        (omitted > 0 ? ` ${omitted} agents omitted — either filtered by kind or lacking this slice in the source run.` : "");
    }
  }

  /**
   * Persistent state for the family radar — pinned + hovered focus, plus a
   * one-shot entry-animation flag so we don't re-animate on every legend
   * toggle. Mirrors `bankrollChartState` in spirit.
   */
  const familyChartState = {
    pinnedAgent: null,
    pinnedAxis: null,
    hoveredAgent: null,
    hoveredAxis: null,
    hasAnimated: false,
    lastDataKey: null,
  };

  /**
   * Render the "Surplus efficiency by counterpart family" panel as a
   * single radar / spider chart: one filled-and-stroked polygon per agent
   * across all six counterpart-family axes. The shape of the polygon *is*
   * the agent's profile — broadly inflated polygons are robust generalists,
   * while sharply asymmetric ones reveal which families an agent leans on.
   *
   * The chart is fully interactive in the same spirit as the bankroll chart:
   *   - hovering a polygon spotlights that agent and shows a tooltip with
   *     all six SE⁺ values (mini-bars) for full-profile read-out;
   *   - hovering any "family wedge" (the angular slice around a spoke)
   *     highlights that axis and shows a tooltip with the family's SE⁺
   *     ranking across all eligible agents;
   *   - clicking a polygon or wedge pins the focus so the cursor can leave
   *     the chart; clicking empty radar space unpins;
   *   - on first reveal each polygon inflates from the center, staggered.
   */
  function renderFamilyChart() {
    const containerId = "chart-family";
    const footnoteId = "chart-family-footnote";
    const stateKey = "family";
    const sliceKey = "families";
    const axisIds = data.families || [];

    const container = $(containerId);
    container.innerHTML = "";
    const footnote = $(footnoteId);

    const rows = eligibleRows(stateKey, sliceKey, axisIds);
    if (!rows.length || !axisIds.length) {
      container.appendChild(
        ce("div", {
          class: "chart-empty",
          text:
            "No agents with this slice are available in the current run. " +
            "Run a full sweep with the latest schema to populate this panel.",
        })
      );
      if (footnote) footnote.textContent = "";
      return;
    }

    // Stable per-agent series color, ordered by data.rows insertion order
    // so a given agent gets the same hue here, in the legend, and in the
    // leaderboard table further down the page.
    const colorIndex = new Map();
    let ci = 0;
    for (const r of data.rows) {
      if (rows.includes(r)) {
        colorIndex.set(r.id, SERIES_COLORS[ci % SERIES_COLORS.length]);
        ci += 1;
      }
    }

    const hidden = chartStates[stateKey].hidden;
    const labels = data.familyLabels || {};

    // Re-animate on a meaningful data change (kind filter changed the set of
    // rows). Legend toggles keep the same dataKey so we don't re-animate.
    const dataKey =
      `${chartStates[stateKey].kind}|${rows.map((r) => r.id).join(",")}`;
    if (familyChartState.lastDataKey !== dataKey) {
      familyChartState.hasAnimated = false;
      familyChartState.pinnedAgent = null;
      familyChartState.pinnedAxis = null;
      familyChartState.hoveredAgent = null;
      familyChartState.hoveredAxis = null;
      familyChartState.lastDataKey = dataKey;
    }

    const radarBlock = ce("div", { class: "family-radar-block" });
    const figure = ce("div", { class: "family-radar-figure" });

    const SVG_NS = "http://www.w3.org/2000/svg";
    const w = 560;
    const h = 520;
    const cx = w / 2;
    const cy = h / 2;
    const R = 180;
    const N = axisIds.length;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "family-radar");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "SE⁺ profile across counterpart families, one polygon per agent"
    );

    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const pt = (i, frac) => [
      cx + Math.cos(ang(i)) * R * frac,
      cy + Math.sin(ang(i)) * R * frac,
    ];

    // ---------- Layer 1: hexagonal grid + ring scale labels ----------
    for (const t of [0.25, 0.5, 0.75, 1.0]) {
      const points = [];
      for (let i = 0; i < N; i++) {
        const [x, y] = pt(i, t);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", points.join(" "));
      poly.setAttribute("class", "family-radar-grid");
      svg.appendChild(poly);
    }
    // Scale labels along the topmost spoke so readers can calibrate the rings.
    for (const t of [0.25, 0.5, 0.75, 1.0]) {
      const [x, y] = pt(0, t);
      const lbl = document.createElementNS(SVG_NS, "text");
      lbl.setAttribute("x", x + 5);
      lbl.setAttribute("y", y + 3);
      lbl.setAttribute("class", "family-radar-grid-label");
      lbl.textContent = t.toFixed(2);
      svg.appendChild(lbl);
    }

    // ---------- Layer 2: invisible per-axis hover wedges ----------
    // Each wedge is a triangle from the center bisecting the angle to its
    // neighbors, extended slightly past the axis-label radius so labels are
    // also inside the wedge. Wedges sit *under* agent groups so agent hover
    // wins where they overlap.
    const wedges = [];
    for (let i = 0; i < N; i++) {
      const a1 = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / N;
      const a2 = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / N;
      const Rext = R * 1.32;
      const x1 = cx + Math.cos(a1) * Rext;
      const y1 = cy + Math.sin(a1) * Rext;
      const x2 = cx + Math.cos(a2) * Rext;
      const y2 = cy + Math.sin(a2) * Rext;
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} Z`
      );
      path.setAttribute("class", "family-radar-wedge");
      path.setAttribute("data-axis-id", axisIds[i]);
      svg.appendChild(path);
      wedges.push(path);
    }

    // ---------- Layer 3: spokes ----------
    const spokes = [];
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, 1);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", cx);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      line.setAttribute("class", "family-radar-spoke");
      line.setAttribute("data-axis-id", axisIds[i]);
      svg.appendChild(line);
      spokes.push(line);
    }

    // ---------- Layer 4: agent groups (polygons + per-axis dots) ----------
    const agentGroups = new Map();
    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const isLegendDim = hidden.has(row.id);
      const slices = row[sliceKey] || {};

      const polyPoints = [];
      for (let i = 0; i < N; i++) {
        const v = (slices[axisIds[i]] || {}).se_plus;
        const frac =
          v != null && !Number.isNaN(v) ? Math.max(0, Math.min(1, v)) : 0;
        const [x, y] = pt(i, frac);
        polyPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }

      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute(
        "class",
        "family-radar-agent" + (isLegendDim ? " dim" : "")
      );
      g.setAttribute("data-id", row.id);
      // Inflate-from-center transform; CSS handles the transition.
      g.style.transformOrigin = `${cx}px ${cy}px`;

      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", polyPoints.join(" "));
      poly.setAttribute("stroke", `var(${colorToken})`);
      poly.setAttribute("fill", `var(${colorToken})`);
      poly.setAttribute("class", "family-radar-poly");
      g.appendChild(poly);

      const dotByAxis = new Map();
      for (let i = 0; i < N; i++) {
        const v = (slices[axisIds[i]] || {}).se_plus;
        if (v == null || Number.isNaN(v)) continue;
        const [x, y] = pt(i, Math.max(0, Math.min(1, v)));
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", x);
        c.setAttribute("cy", y);
        c.setAttribute("r", "4");
        c.setAttribute("fill", `var(${colorToken})`);
        c.setAttribute("class", "family-radar-dot");
        c.setAttribute("data-axis-id", axisIds[i]);
        g.appendChild(c);
        dotByAxis.set(axisIds[i], c);
      }

      const titleEl = document.createElementNS(SVG_NS, "title");
      titleEl.textContent = row.display || row.id;
      g.appendChild(titleEl);

      svg.appendChild(g);
      agentGroups.set(row.id, { g, poly, dotByAxis, colorToken, row });
    }

    // ---------- Layer 5: axis labels (drawn last so they're never clipped) ----------
    const axisLabelEls = [];
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, 1.18);
      const txt = document.createElementNS(SVG_NS, "text");
      txt.setAttribute("x", x);
      txt.setAttribute("y", y);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("dominant-baseline", "middle");
      txt.setAttribute("class", "family-radar-axis-label");
      txt.setAttribute("data-axis-id", axisIds[i]);
      txt.textContent = labels[axisIds[i]] || axisIds[i];
      svg.appendChild(txt);
      axisLabelEls.push(txt);
    }

    figure.appendChild(svg);

    // Floating HTML tooltip. Positioned over the cursor in agent/axis mode,
    // anchored next to the active spoke when an axis is *pinned* (so the
    // cursor can leave entirely).
    const tooltip = ce("div", { class: "family-radar-tooltip" });
    tooltip.style.display = "none";
    figure.appendChild(tooltip);

    // Pin indicator chip — itself the release affordance. Clicking it clears
    // both pin types and dispatches an applyFocus() update.
    const pinChip = ce("span", {
      class: "family-radar-pin-chip",
      role: "button",
      "aria-label": "Release pinned focus",
      title: "Release pinned focus",
    });
    pinChip.textContent = "Pinned";
    pinChip.style.display = "none";
    // When the chip captures a click, also clear hover state — otherwise the
    // wedge sitting underneath the chip never sees pointerleave (the chip
    // blocks it), so its `hoveredAxis` would persist and re-show the
    // ranking tooltip immediately after release.
    pinChip.addEventListener("click", (e) => {
      e.stopPropagation();
      familyChartState.pinnedAgent = null;
      familyChartState.pinnedAxis = null;
      familyChartState.hoveredAgent = null;
      familyChartState.hoveredAxis = null;
      applyFocus();
    });
    pinChip.addEventListener("pointerenter", () => {
      familyChartState.hoveredAgent = null;
      familyChartState.hoveredAxis = null;
      applyFocus();
    });
    figure.appendChild(pinChip);

    radarBlock.appendChild(figure);
    radarBlock.appendChild(
      ce("p", {
        class: "family-radar-hint",
        text:
          "Hover a polygon for that agent's full profile; hover near a spoke for the family's ranking. Click to pin.",
      })
    );
    container.appendChild(radarBlock);

    // ---------- Legend (same toggle behavior as the other charts) ----------
    // Each item: [color swatch] [provider logo] [model name].
    // The swatch ties the legend entry to its polygon hue; the logo
    // disambiguates between multiple models from the same provider
    // (e.g. GPT-4o mini vs o3-pro) which would otherwise read as
    // identical-looking name fragments at small sizes.
    const legend = ce("div", { class: "chart-legend" });
    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const isDim = hidden.has(row.id);
      const item = ce("span", {
        class: "chart-legend-item" + (isDim ? " dim" : ""),
        onclick: () => {
          if (hidden.has(row.id)) hidden.delete(row.id);
          else hidden.add(row.id);
          renderFamilyChart();
        },
      });
      item.appendChild(
        ce("span", {
          class: "chart-legend-swatch",
          style: `background: var(${colorToken})`,
        })
      );
      item.appendChild(makeAgentLogoMark(row));
      item.appendChild(ce("span", { text: row.display || row.id }));
      legend.appendChild(item);
    }
    container.appendChild(legend);

    if (footnote) {
      const omitted = data.rows.length - rows.length;
      const kindLabel = chartStates[stateKey].kind === "all"
        ? "all kinds"
        : KIND_FILTERS.find((k) => k.id === chartStates[stateKey].kind)?.label.toLowerCase();
      footnote.textContent =
        `Showing ${rows.length} of ${data.rows.length} agents (${kindLabel}).` +
        (omitted > 0
          ? ` ${omitted} agents omitted — either filtered by kind or lacking this slice in the source run.`
          : "");
    }

    // ====================================================================
    // Interactivity wiring.
    // Effective focus = pinnedAgent || hoveredAgent || pinnedAxis || hoveredAxis.
    // ====================================================================
    function effectiveFocus() {
      if (familyChartState.pinnedAgent)
        return { mode: "agent", id: familyChartState.pinnedAgent, pinned: true };
      if (familyChartState.hoveredAgent)
        return { mode: "agent", id: familyChartState.hoveredAgent, pinned: false };
      if (familyChartState.pinnedAxis)
        return { mode: "axis", id: familyChartState.pinnedAxis, pinned: true };
      if (familyChartState.hoveredAxis)
        return { mode: "axis", id: familyChartState.hoveredAxis, pinned: false };
      return { mode: "none" };
    }

    function rankingForAxis(axisId) {
      const list = [];
      for (const r of rows) {
        const v = ((r[sliceKey] || {})[axisId] || {}).se_plus;
        if (v != null && !Number.isNaN(v)) list.push({ row: r, v });
      }
      list.sort((a, b) => b.v - a.v);
      return list;
    }

    function fillAgentTooltip(agentId) {
      tooltip.classList.remove("axis-mode");
      tooltip.classList.add("agent-mode");
      tooltip.innerHTML = "";
      const ag = agentGroups.get(agentId);
      if (!ag) return;
      const { row, colorToken } = ag;
      const slices = row[sliceKey] || {};

      const head = ce("div", { class: "family-radar-tooltip-head" });
      head.appendChild(
        ce("span", {
          class: "family-radar-tooltip-swatch",
          style: `background: var(${colorToken})`,
        })
      );
      head.appendChild(
        ce("span", {
          class: "family-radar-tooltip-title",
          text: row.display || row.id,
        })
      );
      const activeAxis =
        familyChartState.pinnedAxis || familyChartState.hoveredAxis;
      tooltip.appendChild(head);

      const grid = ce("div", { class: "family-radar-tooltip-grid" });
      for (let i = 0; i < N; i++) {
        const axisId = axisIds[i];
        const v = (slices[axisId] || {}).se_plus;
        const frac = v != null && !Number.isNaN(v) ? Math.max(0, Math.min(1, v)) : 0;

        const lblEl = ce("span", {
          class:
            "family-radar-tooltip-axis" +
            (axisId === activeAxis ? " active" : ""),
          text: labels[axisId] || axisId,
        });
        const bar = ce("span", { class: "family-radar-tooltip-bar" });
        const fill = ce("span", { class: "family-radar-tooltip-bar-fill" });
        fill.style.width = (frac * 100).toFixed(1) + "%";
        fill.style.background = `var(${colorToken})`;
        bar.appendChild(fill);
        const valEl = ce("span", {
          class: "family-radar-tooltip-val",
          text: v != null && !Number.isNaN(v) ? v.toFixed(2) : "—",
        });
        grid.appendChild(lblEl);
        grid.appendChild(bar);
        grid.appendChild(valEl);
      }
      tooltip.appendChild(grid);
    }

    function fillAxisTooltip(axisId) {
      tooltip.classList.remove("agent-mode");
      tooltip.classList.add("axis-mode");
      tooltip.innerHTML = "";

      const head = ce("div", { class: "family-radar-tooltip-head" });
      head.appendChild(
        ce("span", {
          class: "family-radar-tooltip-title",
          text: labels[axisId] || axisId,
        })
      );
      head.appendChild(
        ce("span", {
          class: "family-radar-tooltip-sub",
          text: "SE⁺ ranking",
        })
      );
      tooltip.appendChild(head);

      const ranked = rankingForAxis(axisId);
      const list = ce("ol", { class: "family-radar-tooltip-list" });
      let rk = 1;
      for (const { row, v } of ranked) {
        const colorToken = colorIndex.get(row.id);
        const li = ce("li", { class: "family-radar-tooltip-rank-row" });
        li.appendChild(
          ce("span", { class: "family-radar-tooltip-rank", text: `${rk}.` })
        );
        li.appendChild(
          ce("span", {
            class: "family-radar-tooltip-swatch",
            style: `background: var(${colorToken})`,
          })
        );
        li.appendChild(
          ce("span", {
            class: "family-radar-tooltip-name",
            text: row.display || row.id,
          })
        );
        li.appendChild(
          ce("span", { class: "family-radar-tooltip-val", text: v.toFixed(2) })
        );
        list.appendChild(li);
        rk += 1;
      }
      if (!ranked.length) {
        list.appendChild(
          ce("li", {
            class: "family-radar-tooltip-empty",
            text: "no agents with data on this family",
          })
        );
      }
      tooltip.appendChild(list);
    }

    function positionTooltipAtCursor(clientX, clientY) {
      if (clientX == null || clientY == null) {
        // Pinned-but-no-mouse fallback: pin the tooltip to the radar corner
        // so it's still visible after the cursor leaves the figure.
        tooltip.style.left = "12px";
        tooltip.style.top = "12px";
        return;
      }
      const figRect = figure.getBoundingClientRect();
      const lx = clientX - figRect.left;
      const ly = clientY - figRect.top;
      tooltip.style.left = `${lx + 14}px`;
      tooltip.style.top = `${ly + 14}px`;
      // Clamp to figure bounds so the tooltip never escapes the chart frame.
      const tipRect = tooltip.getBoundingClientRect();
      let dx = 14;
      let dy = 14;
      if (lx + tipRect.width + 14 > figRect.width) dx = -tipRect.width - 14;
      if (ly + tipRect.height + 14 > figRect.height) dy = -tipRect.height - 14;
      tooltip.style.left = `${Math.max(0, lx + dx)}px`;
      tooltip.style.top = `${Math.max(0, ly + dy)}px`;
    }

    function applyFocus(clientX, clientY) {
      // Reset visual classes.
      for (const ag of agentGroups.values()) {
        ag.g.classList.remove("focused", "dimmed");
      }
      for (const sp of spokes) sp.classList.remove("active");
      for (const al of axisLabelEls) al.classList.remove("active");
      svg.classList.remove("has-focus", "agent-focus", "axis-focus");

      const f = effectiveFocus();
      const anyPinned =
        familyChartState.pinnedAgent || familyChartState.pinnedAxis;
      pinChip.style.display = anyPinned ? "" : "none";

      if (f.mode === "agent") {
        for (const [id, ag] of agentGroups) {
          if (id === f.id) ag.g.classList.add("focused");
          else ag.g.classList.add("dimmed");
        }
        svg.classList.add("has-focus", "agent-focus");
        fillAgentTooltip(f.id);
        tooltip.style.display = "";
        positionTooltipAtCursor(clientX, clientY);
      } else if (f.mode === "axis") {
        const idx = axisIds.indexOf(f.id);
        if (idx >= 0) {
          spokes[idx].classList.add("active");
          axisLabelEls[idx].classList.add("active");
          // Visually emphasize agents' dots on the active axis by adding a
          // class to the SVG (CSS targets [data-axis-id="<active>"]).
          svg.dataset.activeAxis = f.id;
        }
        svg.classList.add("has-focus", "axis-focus");
        fillAxisTooltip(f.id);
        tooltip.style.display = "";
        positionTooltipAtCursor(clientX, clientY);
      } else {
        delete svg.dataset.activeAxis;
        tooltip.style.display = "none";
      }
    }

    // -- Wedge handlers (axis hover/pin) --
    for (const wedge of wedges) {
      const axisId = wedge.getAttribute("data-axis-id");
      wedge.addEventListener("pointerenter", (e) => {
        if (familyChartState.hoveredAgent) return;
        familyChartState.hoveredAxis = axisId;
        applyFocus(e.clientX, e.clientY);
      });
      wedge.addEventListener("pointermove", (e) => {
        if (!familyChartState.hoveredAgent) {
          familyChartState.hoveredAxis = axisId;
        }
        applyFocus(e.clientX, e.clientY);
      });
      wedge.addEventListener("pointerleave", (e) => {
        if (familyChartState.hoveredAxis === axisId)
          familyChartState.hoveredAxis = null;
        applyFocus(e.clientX, e.clientY);
      });
      wedge.addEventListener("click", (e) => {
        e.stopPropagation();
        familyChartState.pinnedAxis =
          familyChartState.pinnedAxis === axisId ? null : axisId;
        familyChartState.pinnedAgent = null;
        applyFocus(e.clientX, e.clientY);
      });
    }

    // -- Axis-label click pin (label sits visually outside wedges) --
    for (const al of axisLabelEls) {
      const axisId = al.getAttribute("data-axis-id");
      al.addEventListener("click", (e) => {
        e.stopPropagation();
        familyChartState.pinnedAxis =
          familyChartState.pinnedAxis === axisId ? null : axisId;
        familyChartState.pinnedAgent = null;
        applyFocus(e.clientX, e.clientY);
      });
    }

    // -- Agent group handlers (polygon + dots, wins over wedge by stacking) --
    for (const [id, ag] of agentGroups) {
      ag.g.addEventListener("pointerenter", (e) => {
        familyChartState.hoveredAgent = id;
        familyChartState.hoveredAxis = null;
        applyFocus(e.clientX, e.clientY);
      });
      ag.g.addEventListener("pointermove", (e) => {
        applyFocus(e.clientX, e.clientY);
      });
      ag.g.addEventListener("pointerleave", (e) => {
        if (familyChartState.hoveredAgent === id)
          familyChartState.hoveredAgent = null;
        applyFocus(e.clientX, e.clientY);
      });
      ag.g.addEventListener("click", (e) => {
        e.stopPropagation();
        familyChartState.pinnedAgent =
          familyChartState.pinnedAgent === id ? null : id;
        familyChartState.pinnedAxis = null;
        applyFocus(e.clientX, e.clientY);
      });
    }

    // -- Click on empty SVG area releases pins --
    svg.addEventListener("click", () => {
      familyChartState.pinnedAgent = null;
      familyChartState.pinnedAxis = null;
      applyFocus();
    });

    // -- Pointer leaving the SVG entirely clears hover (pins survive) --
    svg.addEventListener("pointerleave", () => {
      familyChartState.hoveredAgent = null;
      familyChartState.hoveredAxis = null;
      applyFocus();
    });

    // Initial paint reflects any surviving pin.
    applyFocus();

    // ---------- Entry animation ----------
    if (!familyChartState.hasAnimated) {
      if (!prefersReducedMotion()) {
        let i = 0;
        for (const ag of agentGroups.values()) {
          ag.g.classList.add("entry-init");
          ag.g.style.transitionDelay = `${i * 80}ms`;
          i += 1;
        }
        // Two rAFs so the browser flushes the initial transformed state before
        // we remove the class and let the transition kick in.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const ag of agentGroups.values()) {
              ag.g.classList.remove("entry-init");
            }
          });
        });
      }
      familyChartState.hasAnimated = true;
    }
  }

  /**
   * Render the "Surplus efficiency by environment difficulty" panel as a
   * heatmap (rows=agents, cols=difficulty bins, color intensity=SE⁺).
   *
   * Why a heatmap rather than a line chart: with five discrete bins and the
   * fact that most agents have one steep cliff between bin 0 and bin 1, a
   * line plot reads as a flat tail and the easy→hard descent gets lost. The
   * heatmap encodes SE⁺ as cell brightness so each row literally fades from
   * left (easy, bright) to right (hard, faint), and the rightmost column
   * prints the easy→hard percentage drop in the page's "warn" color so the
   * loss is impossible to miss.
   */
  function renderDifficultyChart() {
    const containerId = "chart-difficulty";
    const footnoteId = "chart-difficulty-footnote";
    const stateKey = "difficulty";
    const sliceKey = "difficulty";
    const axisIds = data.difficultyBins || [];

    const container = $(containerId);
    container.innerHTML = "";
    const footnote = $(footnoteId);

    const rows = eligibleRows(stateKey, sliceKey, axisIds);
    if (!rows.length || !axisIds.length) {
      container.appendChild(
        ce("div", {
          class: "chart-empty",
          text:
            "No agents with this slice are available in the current run. " +
            "Run a full sweep with the latest schema to populate this panel.",
        })
      );
      if (footnote) footnote.textContent = "";
      return;
    }

    // Stable per-agent color, matching the family chart's ordering.
    const colorIndex = new Map();
    let ci = 0;
    for (const r of data.rows) {
      if (rows.includes(r)) {
        colorIndex.set(r.id, SERIES_COLORS[ci % SERIES_COLORS.length]);
        ci += 1;
      }
    }

    // Global SE⁺ ceiling across all visible cells. Normalising globally
    // (rather than per-row) keeps cell brightness comparable across agents:
    // a brighter cell anywhere on the grid means a higher SE⁺.
    let vMax = 0;
    for (const row of rows) {
      const slices = row[sliceKey] || {};
      for (const id of axisIds) {
        const s = slices[id];
        const v = s && s.se_plus;
        if (v != null && !Number.isNaN(v) && v > vMax) vMax = v;
      }
    }
    if (vMax <= 0) vMax = 1;

    const hidden = chartStates[stateKey].hidden;

    const heatmap = ce("div", { class: "chart-heatmap" });
    heatmap.style.setProperty("--hm-bins", String(axisIds.length));

    // Header row.
    const header = ce("div", { class: "hm-row hm-header" });
    header.appendChild(ce("div", { class: "hm-y-label hm-y-header", text: "AGENT" }));
    axisIds.forEach((_, i) => {
      header.appendChild(ce("div", { class: "hm-x-label", text: `bin ${i}` }));
    });
    header.appendChild(ce("div", { class: "hm-delta-header", text: "Δ EASY→HARD" }));
    heatmap.appendChild(header);

    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const isDim = hidden.has(row.id);
      const slices = row[sliceKey] || {};

      const tr = ce("div", {
        class: "hm-row" + (isDim ? " dim" : ""),
        "data-id": row.id,
      });

      const yLbl = ce("div", { class: "hm-y-label" });
      yLbl.appendChild(makeAgentLogoMark(row));
      yLbl.appendChild(
        ce("span", { class: "hm-y-name", text: row.display || row.id })
      );
      yLbl.style.cursor = "pointer";
      yLbl.title = "Click to dim this agent";
      yLbl.addEventListener("click", () => {
        if (hidden.has(row.id)) hidden.delete(row.id);
        else hidden.add(row.id);
        renderDifficultyChart();
      });
      tr.appendChild(yLbl);

      let firstV = null;
      let lastV = null;
      axisIds.forEach((id, i) => {
        const s = slices[id] || {};
        const seVal = s.se_plus;
        const cell = ce("div", { class: "hm-cell" });
        cell.style.setProperty("--cell-color", `var(${colorToken})`);

        if (seVal == null || Number.isNaN(seVal)) {
          cell.classList.add("hm-cell-empty");
          cell.textContent = "—";
        } else {
          // Slightly super-linear mapping pushes weak cells closer to the
          // page background, exaggerating the bright→faded gradient that
          // *is* the trend we want to make obvious.
          const norm = Math.max(
            0.04,
            Math.pow(Math.min(1, seVal / vMax), 1.15)
          );
          cell.style.setProperty("--v", norm.toFixed(3));
          if (norm > 0.55) cell.classList.add("text-on-color");
          cell.textContent = seVal.toFixed(2);
          cell.title = `${row.display || row.id}: SE⁺ = ${seVal.toFixed(3)} at bin ${i}`;
          if (i === 0) firstV = seVal;
          if (i === axisIds.length - 1) lastV = seVal;
        }
        tr.appendChild(cell);
      });

      const deltaCell = ce("div", { class: "hm-delta" });
      if (firstV != null && lastV != null && firstV > 0) {
        const dropPct = (1 - lastV / firstV) * 100;
        const sign = dropPct >= 0 ? "−" : "+";
        deltaCell.textContent = `${sign}${Math.abs(dropPct).toFixed(0)}%`;
        deltaCell.classList.add(dropPct >= 0 ? "loss" : "gain");
        deltaCell.title =
          `Easy→hard SE⁺: ${firstV.toFixed(3)} → ${lastV.toFixed(3)} ` +
          `(${sign}${Math.abs(dropPct).toFixed(1)}%)`;
      } else {
        deltaCell.textContent = "—";
        deltaCell.classList.add("hm-cell-empty");
      }
      tr.appendChild(deltaCell);

      heatmap.appendChild(tr);
    }

    // X-axis title spanning the bin columns.
    const axisTitle = ce("div", { class: "hm-axis-title" });
    axisTitle.appendChild(
      ce("span", { class: "hm-axis-name", text: "Environment difficulty" })
    );
    axisTitle.appendChild(
      ce("span", { class: "hm-axis-arrow", text: "easy → hard" })
    );
    heatmap.appendChild(axisTitle);

    container.appendChild(heatmap);

    if (footnote) {
      const omitted = data.rows.length - rows.length;
      const kindLabel = chartStates[stateKey].kind === "all"
        ? "all kinds"
        : KIND_FILTERS.find((k) => k.id === chartStates[stateKey].kind)?.label.toLowerCase();
      footnote.textContent =
        `Showing ${rows.length} of ${data.rows.length} agents (${kindLabel}). ` +
        "Cell shading encodes SE⁺ (bright = high, faded = low); the rightmost column reports the easy→hard drop per agent." +
        (omitted > 0
          ? ` ${omitted} agents omitted — either filtered by kind or lacking this slice in the source run.`
          : "");
    }
  }

  /* ============================================================
     SECTION D — Diagnostic scatters (four cells, shared kind filter)
     ============================================================ */

  const SCATTER_SPECS = [
    {
      id: "scatter-agr-se",
      x: "agr_plus",
      y: "se_plus",
      xLabel: "AGR⁺",
      yLabel: "SE⁺",
      xMin: 0, xMax: 1,
      yMin: 0, yMax: 1,
      reverseX: false,
      idealCorner: "top-right",
    },
    {
      id: "scatter-be-se",
      x: "be_type",
      y: "se_plus",
      xLabel: "BE_type",
      yLabel: "SE⁺",
      xMin: 0, xMax: 0.5,
      yMin: 0, yMax: 1,
      reverseX: true,
      idealCorner: "top-left",
    },
    {
      id: "scatter-crit-se",
      x: "crit_viol_pct",
      y: "se_plus",
      xLabel: "CritViol%",
      yLabel: "SE⁺",
      xMin: 0, xMax: 0.25,
      yMin: 0, yMax: 1,
      reverseX: true,
      idealCorner: "top-left",
    },
    {
      id: "scatter-fagr-se",
      x: "fagr_minus",
      y: "se_plus",
      xLabel: "FAGR⁻",
      yLabel: "SE⁺",
      xMin: 0, xMax: 1,
      yMin: 0, yMax: 1,
      reverseX: true,
      idealCorner: "top-left",
    },
  ];

  const diagState = { kind: "all" };

  function eligibleDiagRows() {
    const kind = diagState.kind;
    return data.rows.filter((r) => kind === "all" || r.kind === kind);
  }

  function renderDiagLegend() {
    const host = $("diag-legend");
    host.innerHTML = "";
    const rows = eligibleDiagRows();
    rows.forEach((row, i) => {
      const colorToken = SERIES_COLORS[i % SERIES_COLORS.length];
      const item = ce("span", { class: "chart-legend-item" });
      item.appendChild(
        ce("span", {
          class: "chart-legend-swatch",
          style: `background: var(${colorToken})`,
        })
      );
      item.appendChild(ce("span", { class: "chart-legend-idx", text: String(i + 1) }));
      // Provider logo next to the index keeps the visual order
      // [color][rank][provider][model]. Useful when two open-weight
      // checkpoints share a row band — the logo disambiguates them
      // before the eye gets to the truncated model name.
      item.appendChild(makeAgentLogoMark(row));
      item.appendChild(ce("span", { text: row.display }));
      host.appendChild(item);
    });
  }

  function renderScatter(spec) {
    const container = $(spec.id);
    container.innerHTML = "";
    const rows = eligibleDiagRows();

    // Collect points: {row, color, index, x, y}.  The index is the position
    // in the current legend so the viewer can cross-reference dots and legend
    // entries without relying on crowded labels.
    const pts = [];
    rows.forEach((row, i) => {
      const ov = row.regimes.overall || {};
      const xv = ov[spec.x];
      const yv = ov[spec.y];
      if (xv == null || yv == null || Number.isNaN(xv) || Number.isNaN(yv)) return;
      pts.push({
        row,
        color: `var(${SERIES_COLORS[i % SERIES_COLORS.length]})`,
        index: i + 1,
        x: xv,
        y: yv,
      });
    });

    if (!pts.length) {
      container.appendChild(
        ce("div", {
          class: "chart-empty",
          text: "No agents in this run report both metrics.",
        })
      );
      return;
    }

    const width = 420;
    const height = 260;
    const margin = { top: 14, right: 14, bottom: 40, left: 42 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xAt = (v) =>
      margin.left + ((v - spec.xMin) / (spec.xMax - spec.xMin)) * plotW;
    const yAt = (v) =>
      margin.top + plotH - ((v - spec.yMin) / (spec.yMax - spec.yMin)) * plotH;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${spec.yLabel} vs ${spec.xLabel}`);

    // Grid + y ticks
    [0, 0.25, 0.5, 0.75, 1.0].forEach((t) => {
      const v = spec.yMin + t * (spec.yMax - spec.yMin);
      const y = yAt(v);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", margin.left);
      line.setAttribute("x2", margin.left + plotW);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-grid-line");
      svg.appendChild(line);
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", margin.left - 6);
      lbl.setAttribute("y", y + 3.5);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = v.toFixed(2);
      svg.appendChild(lbl);
    });

    // x ticks (5)
    for (let t = 0; t <= 1; t += 0.25) {
      const v = spec.xMin + t * (spec.xMax - spec.xMin);
      const x = xAt(v);
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", x);
      lbl.setAttribute("y", margin.top + plotH + 16);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = v.toFixed(2);
      svg.appendChild(lbl);
    }

    // Axis lines
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", margin.left);
    xAxis.setAttribute("x2", margin.left + plotW);
    xAxis.setAttribute("y1", margin.top + plotH);
    xAxis.setAttribute("y2", margin.top + plotH);
    xAxis.setAttribute("class", "chart-axis-line");
    svg.appendChild(xAxis);

    // Axis labels
    const xTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xTitle.setAttribute("x", margin.left + plotW / 2);
    xTitle.setAttribute("y", height - 6);
    xTitle.setAttribute("text-anchor", "middle");
    xTitle.setAttribute("class", "chart-axis-label");
    xTitle.textContent = spec.xLabel + (spec.reverseX ? " (← better)" : " (better →)");
    svg.appendChild(xTitle);

    const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const yTitleX = 12;
    const yTitleY = margin.top + plotH / 2;
    yTitle.setAttribute("x", yTitleX);
    yTitle.setAttribute("y", yTitleY);
    yTitle.setAttribute("text-anchor", "middle");
    yTitle.setAttribute("transform", `rotate(-90 ${yTitleX} ${yTitleY})`);
    yTitle.setAttribute("class", "chart-axis-label");
    yTitle.textContent = spec.yLabel;
    svg.appendChild(yTitle);

    // Ideal corner annotation
    const anno = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const cornerX = spec.idealCorner.includes("left") ? margin.left + 6 : margin.left + plotW - 6;
    const cornerY = margin.top + 12;
    anno.setAttribute("x", cornerX);
    anno.setAttribute("y", cornerY);
    anno.setAttribute(
      "text-anchor",
      spec.idealCorner.includes("left") ? "start" : "end"
    );
    anno.setAttribute("class", "scatter-anno");
    anno.textContent = "ideal";
    svg.appendChild(anno);

    // Identify the "lead" — the agent whose normalized point sits closest to
    // the ideal corner.  We normalize each axis into [0,1] with the better-is-
    // higher convention (lower-is-better axes get flipped), then target (1, 1).
    const normX = (v) => (v - spec.xMin) / (spec.xMax - spec.xMin);
    const normY = (v) => (v - spec.yMin) / (spec.yMax - spec.yMin);
    const betterX = (v) => (spec.reverseX ? 1 - normX(v) : normX(v));
    const betterY = (v) => normY(v); // all y-axes are better-up in our specs
    let leadIdx = 0;
    let leadScore = -Infinity;
    pts.forEach((p, i) => {
      const s = -((1 - betterX(p.x)) ** 2 + (1 - betterY(p.y)) ** 2);
      if (s > leadScore) { leadScore = s; leadIdx = i; }
    });

    // Points: each dot + its index badge + a hidden full-name label, grouped
    // so CSS can dim siblings on hover and promote the hovered label to full
    // opacity.  The index badge is tiny (2ch mono) and always visible, so
    // even when two dots overlap, both indices remain readable.
    const svgNS = "http://www.w3.org/2000/svg";
    pts.forEach((p, i) => {
      const lead = i === leadIdx;
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "scatter-point" + (lead ? " lead" : ""));

      if (lead) {
        const halo = document.createElementNS(svgNS, "circle");
        halo.setAttribute("cx", xAt(p.x));
        halo.setAttribute("cy", yAt(p.y));
        halo.setAttribute("r", 10);
        halo.setAttribute("fill", p.color);
        halo.setAttribute("class", "scatter-halo");
        g.appendChild(halo);
      }

      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", xAt(p.x));
      c.setAttribute("cy", yAt(p.y));
      c.setAttribute("r", lead ? 5 : 4);
      c.setAttribute("fill", p.color);
      c.setAttribute("class", "scatter-dot");
      const tip = document.createElementNS(svgNS, "title");
      tip.textContent = `${p.row.display}: ${spec.xLabel}=${p.x.toFixed(3)}, ${spec.yLabel}=${p.y.toFixed(3)}`;
      c.appendChild(tip);
      g.appendChild(c);

      // Tiny index badge: always visible, sits just to the right of the dot.
      const idx = document.createElementNS(svgNS, "text");
      idx.setAttribute("x", xAt(p.x) + (lead ? 9 : 8));
      idx.setAttribute("y", yAt(p.y) + 3.2);
      idx.setAttribute("class", "scatter-index");
      idx.textContent = String(p.index);
      g.appendChild(idx);

      // Full-name label: hidden by default, revealed on hover (handled by CSS);
      // always visible for the lead point as the panel's narrative anchor.
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", xAt(p.x) + (lead ? 18 : 14));
      lbl.setAttribute("y", yAt(p.y) + 3.5);
      lbl.setAttribute("class", "scatter-label");
      lbl.textContent = p.row.display;
      g.appendChild(lbl);

      svg.appendChild(g);
    });

    container.appendChild(svg);
  }

  function renderAllScatters() {
    SCATTER_SPECS.forEach(renderScatter);
    renderDiagLegend();
    const rows = eligibleDiagRows();
    const kindLabel = diagState.kind === "all"
      ? "all kinds"
      : KIND_FILTERS.find((k) => k.id === diagState.kind)?.label.toLowerCase();
    $("diag-footnote").textContent =
      `Showing ${rows.length} of ${data.rows.length} agents (${kindLabel}). ` +
      `Agents missing a metric are silently excluded from that panel.`;
  }

  function initDiagKindPills() {
    const host = $("diag-kind-pills");
    host.innerHTML = "";
    for (const { id, label } of KIND_FILTERS) {
      const pill = ce("button", {
        class: "pill" + (diagState.kind === id ? " active" : ""),
        type: "button",
        "data-id": id,
        text: label,
        onclick: () => {
          diagState.kind = id;
          for (const p of host.querySelectorAll(".pill")) {
            p.classList.toggle("active", p.dataset.id === id);
          }
          renderAllScatters();
          termsUrlScheduleSync();
        },
      });
      host.appendChild(pill);
    }
  }

  /* ============================================================
     SECTION E — System prompt excerpt
     ============================================================ */

  async function loadPromptExcerpt() {
    const pre = $("prompt-pre");
    try {
      const res = await fetch("system_prompt_buyer.txt");
      if (!res.ok) throw new Error(`${res.status}`);
      pre.textContent = await res.text();
    } catch (e) {
      pre.textContent =
        "Prompt file is not reachable from this static host.";
    }
  }

  /* ============================================================
     SECTION F — Selected traces
     ============================================================ */

  const TRACE_BUCKET_LABELS = {
    success: { label: "Surplus capture", cls: "success" },
    discipline: { label: "No-deal discipline", cls: "discipline" },
    failure: { label: "Diagnostic failure", cls: "failure" },
  };

  function renderTraces() {
    const host = $("trace-list");
    if (!host) return;
    host.innerHTML = "";
    const traces = window.TERMS_TRACES?.episodes || [];
    if (!traces.length) {
      host.appendChild(
        ce("div", {
          class: "chart-empty",
          text:
            "No curated traces yet. Generate them with " +
            "`python leaderboard/mine_traces.py`.",
        })
      );
      return;
    }
    for (const ep of traces) {
      host.appendChild(renderTraceCard(ep));
    }
  }

  function renderTraceCard(ep) {
    const bucket = TRACE_BUCKET_LABELS[ep.bucket] || { label: ep.bucket, cls: "" };
    const card = ce("details", { class: "trace-card" });
    const summary = ce("summary");
    summary.appendChild(
      ce("span", { class: `trace-label ${bucket.cls}`, text: bucket.label })
    );
    summary.appendChild(
      ce("div", { class: "trace-title" }, [
        ce("h3", { text: ep.title }),
        ce("div", {
          class: "trace-sub",
          text: `${ep.agent_display} · ${ep.regime_label} · ${ep.family_label} · ${ep.agent_role}`,
        }),
      ])
    );
    summary.appendChild(renderTraceOutcome(ep));
    card.appendChild(summary);

    const body = ce("div", { class: "trace-body" });
    body.appendChild(renderTraceMeta(ep));
    body.appendChild(renderTranscript(ep));
    card.appendChild(body);

    return card;
  }

  function renderTraceOutcome(ep) {
    const out = ce("div", { class: "trace-outcome" });
    if (ep.agreement_reached && ep.outcome_price != null) {
      out.appendChild(
        ce("span", { class: "outcome-price", text: `p = ${ep.outcome_price.toFixed(2)}` })
      );
      out.appendChild(
        ce("span", { text: `u = ${ep.agent_utility?.toFixed(2) ?? "—"}` })
      );
    } else {
      out.appendChild(ce("span", { class: "outcome-price", text: "no deal" }));
      out.appendChild(ce("span", { text: ep.termination_reason || "—" }));
    }
    out.appendChild(ce("br"));
    out.appendChild(ce("span", { text: `rounds: ${ep.rounds_played}` }));
    return out;
  }

  function renderTraceMeta(ep) {
    const panel = ce("div", { class: "trace-meta-panel" });
    panel.appendChild(
      metaBlock("Scenario", [
        ["regime", ep.regime_label],
        ["family", ep.family_label],
        ["ZOPA Δ", fmtSigned(ep.zopa_width, 2)],
        ["gap δ", fmtSigned(ep.infeasibility_gap, 2)],
        ["env. score", ep.env_score?.toFixed(2) ?? "—"],
      ])
    );
    panel.appendChild(
      metaBlock("Agent (private)", [
        ["role", ep.agent_role],
        ["reservation", ep.agent_type.reservation_price.toFixed(2)],
        ["urgency κ", ep.agent_type.urgency.toFixed(2)],
        ["stance η", ep.agent_type.stance, "stance"],
      ])
    );
    panel.appendChild(
      metaBlock("Counterpart (private)", [
        ["reservation", ep.counterpart_type.reservation_price.toFixed(2)],
        ["urgency κ", ep.counterpart_type.urgency.toFixed(2)],
        ["stance η", ep.counterpart_type.stance, "stance"],
      ])
    );
    if (ep.note) {
      const note = ce("div", { class: "meta-block" });
      note.appendChild(ce("h4", { text: "Why this trace" }));
      note.appendChild(ce("p", { text: ep.note, style: "margin:0;font-size:13px;color:var(--fg-muted);line-height:1.55" }));
      panel.appendChild(note);
    }
    return panel;
  }

  function metaBlock(title, rows) {
    const blk = ce("div", { class: "meta-block" });
    blk.appendChild(ce("h4", { text: title }));
    const dl = ce("dl");
    for (const [k, v, cls] of rows) {
      dl.appendChild(ce("dt", { text: k }));
      dl.appendChild(ce("dd", { text: v == null ? "—" : String(v), class: cls || "" }));
    }
    blk.appendChild(dl);
    return blk;
  }

  function fmtSigned(v, d) {
    if (v == null || Number.isNaN(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${Number(v).toFixed(d)}`;
  }

  function renderTranscript(ep) {
    const wrap = ce("div", { class: "transcript" });
    for (const t of ep.turns) {
      const turn = ce("div", { class: "turn" });
      turn.appendChild(ce("div", { class: "turn-num", text: `R${t.round}` }));
      const col = ce("div", { class: "turn-col" });
      if (t.counterpart) col.appendChild(renderUtt(t.counterpart, "counterpart"));
      if (t.agent) col.appendChild(renderUtt(t.agent, "agent"));
      turn.appendChild(col);
      wrap.appendChild(turn);
    }
    return wrap;
  }

  function renderUtt(u, side) {
    const el = ce("div", { class: `utt ${side}` });
    const head = ce("div", { class: "utt-head" });
    head.appendChild(ce("strong", { text: side === "agent" ? "Agent" : "Counterpart" }));
    if (u.price != null) {
      head.appendChild(ce("span", { text: " · ", class: "sep" }));
      head.appendChild(ce("span", { class: "utt-price", text: `p = ${u.price.toFixed(2)}` }));
    }
    if (u.decision && u.decision !== "Offer") {
      const cls = u.decision === "Accept" ? "utt-decision accept" : u.decision === "Reject" ? "utt-decision reject" : "utt-decision";
      head.appendChild(ce("span", { class: cls, text: ` ${u.decision}` }));
    }
    if (u.sentiment) {
      head.appendChild(ce("span", { class: "utt-cue", text: `sentiment: ${u.sentiment}` }));
    }
    if (u.stance_cue) {
      head.appendChild(ce("span", { class: "utt-cue", text: `cue: ${u.stance_cue}` }));
    }
    el.appendChild(head);
    if (u.message) el.appendChild(ce("p", { class: "utt-msg", text: u.message }));
    return el;
  }

  /* --------------------------- Theme toggle --------------------------- */

  function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const root = document.documentElement;
    btn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("terms-theme", next); } catch (_) {}
      termsUrlScheduleSync();
    });
  }

  /* ====================================================================
     TERMS-Commerce — additive section, fed by leaderboard/commerce_data.js.
     Reads window.TERMS_COMMERCE_DATA (set by build_data.py when a commerce
     run exists).  When the file is missing or empty, the section auto-hides
     and the rest of the page is unaffected.
     ==================================================================== */

  const commerceData = window.TERMS_COMMERCE_DATA;
  const commerceState = { perspective: "all", source: null };

  // Resolve which commerce data block (rows / regimes / families) to
  // render given the active data source.  Backward-compat: when the
  // legacy single-source payload is in use (rows on the top level),
  // source state is ignored and the top-level fields are returned.
  function commerceCurrentSource() {
    if (!commerceData) return null;
    if (commerceData.sources) {
      return (
        commerceData.sources[commerceState.source] ||
        commerceData.sources[(commerceData.sourceOrder || [])[0]] ||
        null
      );
    }
    return commerceData;
  }

  function fmtUSD(value, digits) {
    if (value == null || Number.isNaN(value)) return "—";
    const d = digits ?? 0;
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(Number(value));
    return `${sign}$${abs.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }

  function fmtPctC(value, digits) {
    if (value == null || Number.isNaN(value)) return "—";
    return `${(Number(value) * 100).toFixed(digits ?? 1)}%`;
  }

  function fmtMargin(value) {
    if (value == null || Number.isNaN(value)) return "—";
    const sign = value < 0 ? "-" : "";
    return `${sign}${Math.abs(Number(value) * 100).toFixed(1)}%`;
  }

  function signedNumClass(value) {
    if (value == null || Number.isNaN(value)) return "num";
    const v = Number(value);
    if (v > 0) return "num num-positive";
    if (v < 0) return "num num-negative";
    return "num";
  }

  function commerceCellFor(row, perspective) {
    if (!row) return null;
    if (perspective === "all") return row.overall || null;
    return (row.perspectives || {})[perspective] || null;
  }

  function commerceIsAvailable() {
    if (!commerceData) return false;
    if (window.__TERMS_COMMERCE_MISSING) return false;
    if (commerceData.sources) {
      return (commerceData.sourceOrder || []).some(
        (s) => (commerceData.sources[s]?.rows || []).length > 0
      );
    }
    return Array.isArray(commerceData.rows) && commerceData.rows.length > 0;
  }

  function initCommerceSection() {
    const section = $("commerce-section");
    if (!section) return;
    if (!commerceIsAvailable()) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    // Default data source = first non-empty source in sourceOrder.
    if (commerceData.sources && commerceData.sourceOrder) {
      const firstNonEmpty = commerceData.sourceOrder.find(
        (s) => (commerceData.sources[s]?.rows || []).length > 0
      );
      commerceState.source = firstNonEmpty || commerceData.sourceOrder[0];
    }

    initCommerceSourcePills();
    initCommercePerspectivePills();
    renderCommerceFootnote();
    renderCommerceBoard();
  }

  function initCommerceSourcePills() {
    const host = $("commerce-source-pills");
    if (!host) return;
    host.innerHTML = "";
    if (!commerceData?.sources) {
      host.parentElement.style.display = "none";
      return;
    }
    host.parentElement.style.display = "";

    const order = commerceData.sourceOrder || Object.keys(commerceData.sources);
    for (const src of order) {
      const block = commerceData.sources[src];
      if (!block) continue;
      const isEmpty = !(block.rows && block.rows.length > 0);
      const label =
        (commerceData.dataSourceLabels || {})[src] || src;
      const btn = ce("button", {
        class:
          "pill" +
          (src === commerceState.source ? " active" : "") +
          (isEmpty ? " dim" : ""),
        type: "button",
        role: "tab",
        text: label,
        onclick: () => {
          if (isEmpty) return;
          commerceState.source = src;
          for (const el of host.querySelectorAll(".pill")) {
            el.classList.toggle("active", el.dataset.source === src);
          }
          // Re-init perspective pills since the source's perspective set
          // may differ.  Reset perspective to "all" for safety.
          commerceState.perspective = "all";
          initCommercePerspectivePills();
          renderCommerceFootnote();
          renderCommerceBoard();
          termsUrlScheduleSync();
        },
      });
      btn.dataset.source = src;
      host.appendChild(btn);
    }
  }

  function initCommercePerspectivePills() {
    const host = $("commerce-perspective-pills");
    if (!host) return;
    host.innerHTML = "";

    const block = commerceCurrentSource();
    const perspectives = (block && block.perspectives) || [];
    const labels = (block && block.perspectiveLabels) || {};
    const options = [{ id: "all", label: "Combined" }];
    for (const p of perspectives) {
      options.push({ id: p, label: labels[p] || p });
    }
    for (const opt of options) {
      const btn = ce("button", {
        class: "pill" + (opt.id === commerceState.perspective ? " active" : ""),
        type: "button",
        role: "tab",
        text: opt.label,
        onclick: () => {
          commerceState.perspective = opt.id;
          for (const el of host.querySelectorAll(".pill")) {
            el.classList.toggle("active", el.dataset.perspective === opt.id);
          }
          renderCommerceBoard();
          termsUrlScheduleSync();
        },
      });
      btn.dataset.perspective = opt.id;
      host.appendChild(btn);
    }
  }

  function renderCommerceFootnote() {
    const footnote = $("commerce-footnote");
    if (!footnote) return;
    const block = commerceCurrentSource();
    if (!block) {
      footnote.textContent = "";
      return;
    }
    const sources = (block.sourceSummaries || []).join(", ");
    const sourceLabel =
      (commerceData.dataSourceLabels || {})[commerceState.source] ||
      "synthetic";
    footnote.textContent =
      `Showing ${sourceLabel}. Profit is computed post-hoc from the ` +
      `negotiated price using per-episode unit economics; the diagnostic ` +
      `axes above are unaffected. Source: ${sources || "—"}.`;
  }

  function renderCommerceBoard() {
    const tbody = $("commerce-leaderboard-body");
    if (!tbody || !commerceData) return;
    const block = commerceCurrentSource();
    if (!block) return;

    const perspective = commerceState.perspective;
    const rows = (block.rows || [])
      .map((row) => ({ row, cell: commerceCellFor(row, perspective) }))
      .filter((entry) => entry.cell != null);

    rows.sort((a, b) => {
      const av = a.cell.total_profit_usd;
      const bv = b.cell.total_profit_usd;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });

    tbody.innerHTML = "";
    rows.forEach((entry, idx) => {
      const cell = entry.cell;
      const row = entry.row;
      const tr = ce("tr", null, [
        ce("td", { class: "col-rank num", text: String(idx + 1) }),
        ce("td", { class: "col-agent" }, [makeAgentCell(row)]),
        ce("td", { class: "col-provider", text: row.provider || "" }),
        ce("td", {
          class: signedNumClass(cell.total_profit_usd) + " col-headline",
          text: fmtUSD(cell.total_profit_usd, 0),
        }),
        ce("td", {
          class: signedNumClass(cell.avg_profit_per_episode_usd),
          text: fmtUSD(cell.avg_profit_per_episode_usd, 2),
        }),
        ce("td", {
          class: signedNumClass(cell.avg_margin_rate),
          text: fmtMargin(cell.avg_margin_rate),
        }),
        ce("td", { class: "num", text: fmtPctC(cell.negative_profit_rate, 1) }),
        ce("td", { class: "num", text: fmtPctC(cell.walkaway_correctness_rate, 1) }),
        ce("td", { class: "num", text: fmtUSD(cell.avg_money_left_on_table_usd, 2) }),
        ce("td", { class: "num", text: fmtPctC(cell.regret_rate, 1) }),
        ce("td", { class: "num", text: cell.n_episodes != null ? String(cell.n_episodes) : "—" }),
      ]);
      tbody.appendChild(tr);
    });

    if (rows.length === 0) {
      tbody.appendChild(
        ce("tr", null, [
          ce("td", {
            colspan: "11",
            class: "num",
            text: "No commerce data for this perspective.",
          }),
        ])
      );
    }
  }

  /* ====================================================================
     TERMS-Bankroll — additive section, fed by leaderboard/bankroll_data.js.
     Reads window.TERMS_BANKROLL_DATA (set by build_data.py when a bankroll
     run exists).  When the file is missing or empty, the section auto-hides
     and the rest of the page is unaffected.
     ==================================================================== */

  const bankrollData = window.TERMS_BANKROLL_DATA;
  const bankrollState = { mode: null, source: null };
  /* Trajectory-chart UI state.  Lives at module scope so that re-renders
     triggered by mode/source/legend changes can pick up where the user
     left off (or, for dataset switches, deliberately reset).  See
     renderBankrollChart for the contract. */
  const bankrollChartState = {
    hidden: new Set(),       // legend-toggled (dimmed) agent ids
    pinnedId: null,          // spotlight: agent id pinned by click, else null
    hoveredId: null,         // spotlight: agent id under cursor, else null
    hoverPeriod: null,       // hover-only period for the read-bubble; null →
                             // fall back to scrubPeriod (so the bubble keeps
                             // pointing at the playhead when the cursor
                             // leaves the chart but a pin is active).
    scrubPeriod: 0,          // playhead position 0..H; advanced by playback
                             // and the scrubber.  Distinct from hoverPeriod
                             // so the entry animation isn't killed by an
                             // incidental pointermove during page load.
    playing: false,          // playback: whether the auto-replay is active
    playbackRAF: null,       // requestAnimationFrame handle for the play loop
    statsMode: "mean",       // "mean" → mean ± SEM ribbon; "median" → IQR fan
    lastDataKey: null,       // key for detecting dataset switches
  };

  /* Provider / model-family logos live under leaderboard/logos/<slug>.svg.
     Filenames don't always equal provider_slug — Google ships visually
     distinct Gemini and Gemma marks, xAI uses "Grok", Moonshot AI's file
     is "moonshot.svg" (not "moonshotai.svg"), Anthropic is shipped as
     "claude.svg" per the brand mark. Match on model family first; fall
     back to the provider-level mark; otherwise return null so the renderer
     uses the v1 colored-letter glyph. */
  const LOGO_FILES_AVAILABLE = new Set([
    "openai",
    "claude",
    "anthropic",
    "gemini",
    "gemma",
    "deepmind",
    "grok",
    "moonshot",
    "deepseek",
    "meta",
    "qwen",
    "zai",
    "doubao",
    "tencent",
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
    // Jiashuo sweep label conventions: regex `^llm_<head>_<tail>$` puts
    // the model family name in <head>, so map those heads to logos too.
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
    return candidate && LOGO_FILES_AVAILABLE.has(candidate)
      ? candidate
      : null;
  }

  /* SVG provider logos are inlined as <symbol>s inside the chart SVG and
     referenced via <use> so that `currentColor` (used by the OpenAI mark
     and similar monochrome logos) inherits from the chart's theme rather
     than falling back to black inside an isolated <image> context.

     Each cache entry stores { viewBox, inner } where `inner` is the raw
     child markup of the source <svg> root. A null entry means the file
     failed to load and the renderer should fall back to the letter glyph. */
  const LOGO_SYMBOL_CACHE = {};
  let logoPreloadPromise = null;

  function parseViewBox(vb) {
    const parts = (vb || "0 0 24 24")
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (parts.length !== 4) return { x: 0, y: 0, w: 24, h: 24 };
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  /* Walk a parsed SVG subtree and rewrite fill="currentColor" /
     stroke="currentColor" attributes to inline `style="fill: var(--fg)"`.
     This is necessary because `currentColor` resolution depends on CSS
     `color` inheriting through the chart's render tree, which doesn't
     work reliably across all browsers when the path is cloned out of
     a parsed DOMParser document. Using an inline style with a CSS var
     guarantees the cloned mark picks up the active theme color. */
  function neutralizeCurrentColor(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const fillAttr = node.getAttribute && node.getAttribute("fill");
    if (fillAttr && fillAttr.toLowerCase() === "currentcolor") {
      node.removeAttribute("fill");
      const prev = node.getAttribute("style") || "";
      node.setAttribute(
        "style",
        (prev ? prev.trimEnd().replace(/;$/, "") + "; " : "") +
          "fill: var(--fg)"
      );
    }
    const strokeAttr = node.getAttribute && node.getAttribute("stroke");
    if (strokeAttr && strokeAttr.toLowerCase() === "currentcolor") {
      node.removeAttribute("stroke");
      const prev = node.getAttribute("style") || "";
      node.setAttribute(
        "style",
        (prev ? prev.trimEnd().replace(/;$/, "") + "; " : "") +
          "stroke: var(--fg)"
      );
    }
    if (node.children) {
      for (const child of node.children) neutralizeCurrentColor(child);
    }
  }

  /* Presentation attributes that cascade from <svg> to its children and
     therefore need to be transferred onto our wrapper <g> when we strip
     the original <svg> root. Anything inheritable that the source root
     sets must be replayed or the cloned children render with the chart's
     defaults (typically a solid black fill). */
  const SVG_INHERITABLE_ATTRS = [
    "fill",
    "fill-rule",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-opacity",
    "stroke-miterlimit",
    "color",
  ];

  function preloadLogos() {
    if (logoPreloadPromise) return logoPreloadPromise;
    const slugs = [...LOGO_FILES_AVAILABLE];
    logoPreloadPromise = Promise.all(
      slugs.map((slug) =>
        fetch(`logos/${slug}.svg`)
          .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
          .then((text) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "image/svg+xml");
            const svgEl = doc.documentElement;
            if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") {
              LOGO_SYMBOL_CACHE[slug] = null;
              return;
            }
            const viewBox =
              svgEl.getAttribute("viewBox") || "0 0 24 24";
            // Capture inheritable presentation attributes from the root so
            // we can re-apply them on the wrapper <g> at render time.
            // Translate fill/stroke="currentColor" to the theme variable.
            const rootAttrs = {};
            for (const name of SVG_INHERITABLE_ATTRS) {
              const v = svgEl.getAttribute(name);
              if (v == null) continue;
              if (v.toLowerCase() === "currentcolor") {
                rootAttrs[name] = "var(--fg)";
              } else {
                rootAttrs[name] = v;
              }
            }
            const nodes = Array.from(svgEl.childNodes).filter(
              (n) =>
                n.nodeType === Node.ELEMENT_NODE &&
                n.nodeName.toLowerCase() !== "title"
            );
            for (const n of nodes) neutralizeCurrentColor(n);
            LOGO_SYMBOL_CACHE[slug] = { viewBox, nodes, rootAttrs };
          })
          .catch(() => {
            LOGO_SYMBOL_CACHE[slug] = null;
          })
      )
    );
    return logoPreloadPromise;
  }

  /* Build a small circular logo mark for an agent.  Returns an inline-block
     <span> wrapping either an <svg> with the cached provider logo or a
     letter-glyph fallback.  Used by both the chart ladder and every
     leaderboard table cell so the visual identity is consistent.
     Baselines (kind === "baseline") fall through to a neutral glyph since
     they don't represent a real provider. */
  function makeAgentLogoMark(row) {
    const wrap = ce("span", { class: "agent-logo" });
    const slug = resolveAgentLogoSlug(row);
    const entry = slug ? LOGO_SYMBOL_CACHE[slug] : null;
    const renderGlyph = () => {
      wrap.innerHTML = "";
      wrap.classList.add("is-glyph");
      const isBaseline = row && row.kind === "baseline";
      if (isBaseline) wrap.classList.add("is-baseline");
      wrap.textContent = (row && (row.display || row.id) ? row.display || row.id : "?")
        .trim()
        .charAt(0)
        .toUpperCase();
    };
    if (entry) {
      const svgNS = "http://www.w3.org/2000/svg";
      const lb = parseViewBox(entry.viewBox);
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", `${lb.x} ${lb.y} ${lb.w} ${lb.h}`);
      svg.setAttribute("aria-hidden", "true");
      if (entry.rootAttrs) {
        for (const name of Object.keys(entry.rootAttrs)) {
          svg.setAttribute(name, entry.rootAttrs[name]);
        }
      }
      for (const child of entry.nodes) {
        svg.appendChild(document.importNode(child, true));
      }
      wrap.appendChild(svg);
    } else if (slug) {
      const img = ce("img", {
        src: `logos/${slug}.svg`,
        alt: "",
        loading: "eager",
        decoding: "async",
      });
      img.addEventListener("error", renderGlyph, { once: true });
      wrap.appendChild(img);
    } else {
      renderGlyph();
    }
    return wrap;
  }

  /* Compose a leaderboard-row agent cell: logo + name (+ optional kind tag).
     `opts.showKind` controls whether the small UPPER-CASE kind label is
     rendered below the name (used by the main board, omitted by the
     commerce/bankroll boards which already devote a Provider column). */
  function makeAgentCell(row, opts) {
    const showKind = opts && opts.showKind === true;
    const cell = ce("div", { class: "agent-cell" });
    cell.appendChild(makeAgentLogoMark(row));
    const text = ce("div", { class: "agent-text" });
    text.appendChild(
      ce("span", { class: "agent-name", text: row.display || row.id })
    );
    if (showKind && row.kind) {
      text.appendChild(
        ce("span", {
          class: `agent-kind kind-${row.kind || "other"}`,
          text: (row.kind || "other").toUpperCase(),
        })
      );
    }
    cell.appendChild(text);
    return cell;
  }

  function fmtPeriods(value) {
    if (value == null || Number.isNaN(value)) return "—";
    return Number(value).toFixed(1);
  }

  // Returns the active data-source block (synthetic / grounded), or
  // falls back to the legacy top-level payload when the new shape is
  // not in use.
  function bankrollCurrentSource() {
    if (!bankrollData) return null;
    if (bankrollData.sources) {
      return (
        bankrollData.sources[bankrollState.source] ||
        bankrollData.sources[(bankrollData.sourceOrder || [])[0]] ||
        null
      );
    }
    return bankrollData;
  }

  // Returns the per-mode block within the active data source.
  function bankrollCurrentBlock() {
    const src = bankrollCurrentSource();
    if (!src) return null;
    if (src.modes && bankrollState.mode) {
      return src.modes[bankrollState.mode] || null;
    }
    if (Array.isArray(src.rows)) return src;
    return null;
  }

  function bankrollIsAvailable() {
    if (!bankrollData) return false;
    if (window.__TERMS_BANKROLL_MISSING) return false;
    if (bankrollData.sources) {
      return (bankrollData.sourceOrder || []).some((s) => {
        const src = bankrollData.sources[s];
        return src && (src.modeOrder || []).some(
          (m) => (src.modes[m]?.rows || []).length > 0
        );
      });
    }
    if (bankrollData.modes) {
      return (bankrollData.modeOrder || []).some(
        (m) => (bankrollData.modes[m]?.rows || []).length > 0
      );
    }
    return Array.isArray(bankrollData.rows) && bankrollData.rows.length > 0;
  }

  function initBankrollSection() {
    const section = $("bankroll-section");
    if (!section) return;
    if (!bankrollIsAvailable()) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    if (bankrollData.sources && bankrollData.sourceOrder) {
      const firstNonEmpty = bankrollData.sourceOrder.find((s) => {
        const src = bankrollData.sources[s];
        return src && (src.modeOrder || []).some(
          (m) => (src.modes[m]?.rows || []).length > 0
        );
      });
      bankrollState.source =
        firstNonEmpty || bankrollData.sourceOrder[0];
    }

    const src = bankrollCurrentSource();
    if (src && src.modes && src.modeOrder) {
      const firstMode = src.modeOrder.find(
        (m) => (src.modes[m]?.rows || []).length > 0
      );
      bankrollState.mode = firstMode || src.modeOrder[0];
    } else if (bankrollData.modes && bankrollData.modeOrder) {
      // Legacy single-source shape.
      const firstMode = bankrollData.modeOrder.find(
        (m) => (bankrollData.modes[m]?.rows || []).length > 0
      );
      bankrollState.mode = firstMode || bankrollData.modeOrder[0];
    }

    initBankrollSourcePills();
    initBankrollModePills();
    renderBankrollFootnote();
    renderBankrollBoard();

    // Wait for provider logos to preload before the first chart render so
    // the entry animation runs once, with real marks.  We still race against
    // a short timeout so the chart never hangs if logo fetches stall.
    Promise.race([
      preloadLogos(),
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]).then(() => renderBankrollChart());
  }

  function initBankrollSourcePills() {
    const host = $("bankroll-source-pills");
    if (!host) return;
    host.innerHTML = "";
    if (!bankrollData?.sources) {
      host.parentElement.style.display = "none";
      return;
    }
    host.parentElement.style.display = "";

    const order = bankrollData.sourceOrder || Object.keys(bankrollData.sources);
    // Hide the whole source-selector when only one data source is
    // present (e.g. arxiv runs with synthetic only). A single pill is
    // visual noise.
    const wrapper = host.closest(".control-group");
    if (wrapper) {
      wrapper.hidden = order.length <= 1;
    }
    for (const src of order) {
      const block = bankrollData.sources[src];
      if (!block) continue;
      const isEmpty = !(block.modeOrder || []).some(
        (m) => (block.modes[m]?.rows || []).length > 0
      );
      const label = (bankrollData.dataSourceLabels || {})[src] || src;
      const btn = ce("button", {
        class:
          "pill" +
          (src === bankrollState.source ? " active" : "") +
          (isEmpty ? " dim" : ""),
        type: "button",
        role: "tab",
        text: label,
        onclick: () => {
          if (isEmpty) return;
          bankrollState.source = src;
          for (const el of host.querySelectorAll(".pill")) {
            el.classList.toggle("active", el.dataset.source === src);
          }
          // Re-pick a sensible mode in the new source.
          const newSrc = bankrollCurrentSource();
          if (newSrc && newSrc.modeOrder) {
            const firstMode = newSrc.modeOrder.find(
              (m) => (newSrc.modes[m]?.rows || []).length > 0
            );
            bankrollState.mode = firstMode || newSrc.modeOrder[0];
          }
          initBankrollModePills();
          renderBankrollFootnote();
          bankrollChartState.hidden = new Set();
          renderBankrollChart();
          renderBankrollBoard();
          termsUrlScheduleSync();
        },
      });
      btn.dataset.source = src;
      host.appendChild(btn);
    }
  }

  function initBankrollModePills() {
    const host = $("bankroll-mode-pills");
    if (!host) return;
    host.innerHTML = "";

    // Pull the per-mode container from the active data source (multi-
    // source shape) or from the top level (legacy single-source shape).
    const src = bankrollCurrentSource();
    const modes = src?.modes || bankrollData?.modes;
    const modeOrder =
      src?.modeOrder ||
      bankrollData?.modeOrder ||
      (modes ? Object.keys(modes) : []);
    if (!modes) return;

    // Hide the whole control-group when only a single supplier mode
    // exists — a one-pill selector is visual noise.
    const wrapper = host.closest(".control-group");
    if (wrapper) {
      wrapper.hidden = modeOrder.filter((m) => modes[m]).length <= 1;
    }

    for (const mode of modeOrder) {
      const block = modes[mode];
      if (!block) continue;
      const label =
        (bankrollData.supplierModeLabels || {})[mode] || mode;
      const isEmpty = !(block.rows && block.rows.length > 0);
      const btn = ce("button", {
        class:
          "pill" +
          (mode === bankrollState.mode ? " active" : "") +
          (isEmpty ? " dim" : ""),
        type: "button",
        role: "tab",
        text: label,
        onclick: () => {
          if (isEmpty) return;
          bankrollState.mode = mode;
          for (const el of host.querySelectorAll(".pill")) {
            el.classList.toggle("active", el.dataset.mode === mode);
          }
          renderBankrollFootnote();
          bankrollChartState.hidden = new Set();
          renderBankrollChart();
          renderBankrollBoard();
          termsUrlScheduleSync();
        },
      });
      btn.dataset.mode = mode;
      host.appendChild(btn);
    }
  }

  function renderBankrollFootnote() {
    const footnote = $("bankroll-footnote");
    if (!footnote) return;
    const block = bankrollCurrentBlock();
    if (!block) {
      footnote.textContent = "";
      return;
    }
    const src = bankrollCurrentSource();
    const sources = (
      (src && src.sourceSummaries) ||
      bankrollData.sourceSummaries ||
      []
    ).join(", ");
    const horizon = block.horizon;
    const capital = block.starting_capital_usd;
    const mode = block.supplier_mode || bankrollState.mode || "iid";
    const modeLabel =
      (bankrollData.supplierModeLabels || {})[mode] || mode;
    const sourceLabel =
      (bankrollData.dataSourceLabels || {})[bankrollState.source] ||
      "synthetic";
    const cfgParts = [];
    if (horizon != null) cfgParts.push(`horizon ${horizon} periods`);
    if (capital != null) cfgParts.push(`starting capital ${fmtUSD(capital, 0)}`);
    cfgParts.push(modeLabel);
    cfgParts.push(sourceLabel);

    // Memory-premium diagnostic is included only when the underlying
    // run carries memoryless-replay results. Arxiv-era runs skip it,
    // so the footnote omits the gloss to stay honest with the table.
    const rows = block.rows || [];
    const hasMemory = rows.some(
      (r) => (r.overall || {}).memory_premium_mean_usd != null
    );
    const memoryNote = hasMemory
      ? " Memory premium = stateful terminal balance minus memoryless " +
        "replay on the same scenario chain; positive means the agent " +
        "uses ledger state."
      : "";
    footnote.textContent =
      `Showing ${sourceLabel} × ${modeLabel}. ` +
      `Configuration: ${cfgParts.join(", ")}.${memoryNote} ` +
      `Sources: ${sources || "—"}.`;
  }

  /* Trajectory chart for the bankroll section.
     
     Layout (CSS grid inside #chart-bankroll):
       row 1: header — stats-mode toggle (Mean ± SEM | Median (IQR))
       row 2: SVG chart  |  HTML leaderboard ladder
       row 3: playback rail (▶ + scrubber + period readout), full width
       row 4: legend, full width

     Data layers inside the SVG (order = z-order):
       - grid + axes + ref lines (start, ruin)
       - <g clip-path="url(#bk-progress)">  ← all series content
           - per-agent uncertainty band (polygon between upper and lower)
           - per-agent center line (mean or median)
       - vertical hover/scrub guide
       - per-agent hover dot (above clip group; not clipped)
       - transparent capture rect for pointer events

     Interactivity
       - Spotlight: hovering near a line (or its ladder rung) lifts that
         agent to full opacity and dims the rest. Click locks (pins) the
         spotlight on that agent; clicking again or clicking another
         agent re-pins or releases.
       - Scrubber: drag the bottom rail to lock a specific period —
         the clipPath truncates lines/bands at that x, the ladder
         re-ranks live, and the period readout updates.
       - Replay: ▶ animates the scrubber from current period (or 0)
         to horizon over ~5.5s. Tap again to pause.
       - Entry animation: the same playback machinery doubles as a
         ~1.4s draw-in animation when the dataset changes, giving the
         chart a clean reveal without extra code paths.

     Stats mode
       - Mean ± SEM (default): center line is the per-period mean
         across n sessions; band is mean ± SEM (uncertainty about where
         the mean lies — tightens with √n).
       - Median (IQR): center line is the per-period median; band is
         p25–p75 (the spread of *individual sessions*, robust to ruin
         events that drag the mean down).
   */
  function renderBankrollChart() {
    const container = $("chart-bankroll");
    if (!container) return;
    if (bankrollChartState.playbackRAF) {
      cancelAnimationFrame(bankrollChartState.playbackRAF);
      bankrollChartState.playbackRAF = null;
    }

    const block = bankrollCurrentBlock();
    const figure = $("bankroll-chart-block");
    container.innerHTML = "";
    if (!block) {
      if (figure) figure.style.display = "none";
      return;
    }

    const rowsAll = block.rows || [];
    const rows = rowsAll.filter(
      (r) =>
        r.balance_trajectory &&
        Array.isArray(r.balance_trajectory.mean_usd) &&
        r.balance_trajectory.mean_usd.length > 1
    );

    if (!rows.length) {
      if (figure) figure.style.display = "none";
      container.appendChild(
        ce("div", {
          class: "chart-empty",
          text:
            "No per-period balance trajectories in this run. " +
            "Regenerate bankroll_data.js with the latest build_data.py to " +
            "populate this chart.",
        })
      );
      return;
    }
    if (figure) figure.style.display = "";

    const horizon =
      block.horizon ||
      Math.max(...rows.map((r) => r.balance_trajectory.periods.length - 1));
    const startingCapital =
      block.starting_capital_usd != null
        ? block.starting_capital_usd
        : rows[0].balance_trajectory.mean_usd[0];
    const ruinThreshold = block.bankruptcy_threshold_usd ?? null;

    /* Detect whether the user actually switched to a different dataset
       (mode/source toggle, or stats-mode toggle).  Legend toggles and
       spotlight changes do *not* change this key, so they don't reset
       the scrubber or replay the entry animation. */
    const dataKey =
      `${bankrollState.source}:${bankrollState.mode}:` +
      bankrollChartState.statsMode;
    const datasetChanged = bankrollChartState.lastDataKey !== dataKey;
    if (datasetChanged) {
      bankrollChartState.pinnedId = null;
      bankrollChartState.hoveredId = null;
      bankrollChartState.scrubPeriod = horizon;
      bankrollChartState.playing = false;
      bankrollChartState.lastDataKey = dataKey;
    }

    const useMedian = bankrollChartState.statsMode === "median";

    /* Color assignment is locked to the original `rows` order (which is
       deterministic for a given dataset) so an agent keeps the same
       color across mean/median toggles, scrubbing, and pinning. */
    const colorIndex = new Map();
    rows.forEach((row, i) => {
      colorIndex.set(row.id, SERIES_COLORS[i % SERIES_COLORS.length]);
    });

    const seriesState = rows.map((row) => {
      const traj = row.balance_trajectory;
      const colorToken = colorIndex.get(row.id);
      const meanArr = traj.mean_usd;
      const semArr = traj.sem_usd || [];
      const lineVals = useMedian ? traj.p50_usd || meanArr : meanArr;
      const upperVals = useMedian
        ? traj.p75_usd || meanArr
        : meanArr.map((m, i) => m + (semArr[i] || 0));
      const lowerVals = useMedian
        ? traj.p25_usd || meanArr
        : meanArr.map((m, i) => m - (semArr[i] || 0));
      return {
        row,
        traj,
        colorToken,
        color: `var(${colorToken})`,
        periods: traj.periods,
        lineVals,
        upperVals,
        lowerVals,
        isHidden: bankrollChartState.hidden.has(row.id),
      };
    });

    /* Y range follows the currently displayed agents, not the whole
       bankroll from $0.  The old domain included the bankruptcy line at
       zero, which made $1k → $1.18k earnings look almost flat. */
    const scaleSeries = seriesState.filter((s) => !s.isHidden);
    const domainSeries = scaleSeries.length ? scaleSeries : seriesState;
    const yValues = domainSeries.flatMap((s) => [
      ...s.upperVals,
      ...s.lowerVals,
    ]);
    if (startingCapital != null) yValues.push(startingCapital);
    const yDomain = niceDomain(
      Math.min(...yValues),
      Math.max(...yValues),
      5
    );
    const yMin = yDomain.min;
    const yMax = yDomain.max;

    /* Slightly narrower SVG than v1 to leave room for the right-edge
       ladder column on a fixed grid track.  At small widths the ladder
       wraps below via @media in style.css. */
    const width = 740;
    const height = 380;
    const margin = { top: 18, right: 16, bottom: 56, left: 64 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const svgNS = "http://www.w3.org/2000/svg";

    const xAt = (period) => margin.left + (period / horizon) * plotW;
    const yAt = (value) =>
      margin.top + plotH - ((value - yMin) / (yMax - yMin || 1)) * plotH;

    /* ---------- Outer layout ---------- */
    const layout = ce("div", { class: "chart-layout" });
    container.appendChild(layout);
    const headerRow = ce("div", { class: "chart-header" });
    const bodyRow = ce("div", { class: "chart-body" });
    const playRow = ce("div", { class: "chart-playback" });
    const legendRow = ce("div", { class: "chart-legend" });
    layout.appendChild(headerRow);
    layout.appendChild(bodyRow);
    layout.appendChild(playRow);
    layout.appendChild(legendRow);

    /* ---------- Stats-mode toggle ---------- */
    const statsToggle = ce("div", {
      class: "chart-stats-toggle",
      role: "tablist",
      "aria-label": "Trajectory statistics",
    });
    for (const [mode, label] of [
      ["mean", "Mean ± SEM"],
      ["median", "Median (IQR)"],
    ]) {
      const active = bankrollChartState.statsMode === mode;
      const btn = ce("button", {
        class: "chart-stats-btn" + (active ? " active" : ""),
        role: "tab",
        "aria-selected": active ? "true" : "false",
        text: label,
        onclick: () => {
          if (bankrollChartState.statsMode === mode) return;
          bankrollChartState.statsMode = mode;
          renderBankrollChart();
          termsUrlScheduleSync();
        },
      });
      statsToggle.appendChild(btn);
    }
    headerRow.appendChild(statsToggle);

    /* ---------- SVG chart ---------- */
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Cash balance over time");
    bodyRow.appendChild(svg);

    /* clipPath powers both the entry animation and the scrubber: the
       rect's width gets updated by applyScrub() and everything inside
       the series <g> gets clipped to that width.  ID is randomized so
       multiple charts on the same page (theoretical) don't collide. */
    const defs = document.createElementNS(svgNS, "defs");
    const clipId =
      "bk-progress-clip-" + Math.random().toString(36).slice(2, 8);
    const clipPath = document.createElementNS(svgNS, "clipPath");
    clipPath.setAttribute("id", clipId);
    const clipRect = document.createElementNS(svgNS, "rect");
    clipRect.setAttribute("x", margin.left);
    clipRect.setAttribute("y", 0);
    clipRect.setAttribute("width", plotW);
    clipRect.setAttribute("height", height);
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    /* y-axis: gridlines + tick labels */
    const yTicks = niceTicks(yMin, yMax, 5);
    for (const t of yTicks) {
      const y = yAt(t);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", margin.left);
      line.setAttribute("x2", margin.left + plotW);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-grid-line");
      svg.appendChild(line);
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", margin.left - 8);
      lbl.setAttribute("y", y + 3.5);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = fmtUSDShort(t);
      svg.appendChild(lbl);
    }

    /* x-axis: tick labels */
    const xTickStep = horizon <= 10 ? 1 : Math.ceil(horizon / 10);
    for (let p = 0; p <= horizon; p += xTickStep) {
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", xAt(p));
      lbl.setAttribute("y", margin.top + plotH + 18);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("class", "chart-tick-label");
      lbl.textContent = String(p);
      svg.appendChild(lbl);
    }

    const xAxis = document.createElementNS(svgNS, "line");
    xAxis.setAttribute("x1", margin.left);
    xAxis.setAttribute("x2", margin.left + plotW);
    xAxis.setAttribute("y1", margin.top + plotH);
    xAxis.setAttribute("y2", margin.top + plotH);
    xAxis.setAttribute("class", "chart-axis-line");
    svg.appendChild(xAxis);

    const xTitle = document.createElementNS(svgNS, "text");
    xTitle.setAttribute("x", margin.left + plotW / 2);
    xTitle.setAttribute("y", height - 8);
    xTitle.setAttribute("text-anchor", "middle");
    xTitle.setAttribute("class", "chart-axis-label");
    xTitle.textContent = "Period";
    svg.appendChild(xTitle);

    const yTitle = document.createElementNS(svgNS, "text");
    const yTitleX = 16;
    const yTitleY = margin.top + plotH / 2;
    yTitle.setAttribute("x", yTitleX);
    yTitle.setAttribute("y", yTitleY);
    yTitle.setAttribute("text-anchor", "middle");
    yTitle.setAttribute("transform", `rotate(-90 ${yTitleX} ${yTitleY})`);
    yTitle.setAttribute("class", "chart-axis-label");
    yTitle.textContent = "Cash balance (USD)";
    svg.appendChild(yTitle);

    /* Reference lines: starting capital + bankruptcy threshold */
    if (
      startingCapital != null &&
      startingCapital >= yMin &&
      startingCapital <= yMax
    ) {
      const refY = yAt(startingCapital);
      const ref = document.createElementNS(svgNS, "line");
      ref.setAttribute("x1", margin.left);
      ref.setAttribute("x2", margin.left + plotW);
      ref.setAttribute("y1", refY);
      ref.setAttribute("y2", refY);
      ref.setAttribute("class", "chart-ref-line starting");
      svg.appendChild(ref);
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", margin.left + plotW - 4);
      lbl.setAttribute("y", refY - 4);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-ref-label");
      lbl.textContent = `start ${fmtUSDShort(startingCapital)}`;
      svg.appendChild(lbl);
    }
    if (
      ruinThreshold != null &&
      ruinThreshold >= yMin &&
      ruinThreshold <= yMax &&
      ruinThreshold !== startingCapital
    ) {
      const refY = yAt(ruinThreshold);
      const ref = document.createElementNS(svgNS, "line");
      ref.setAttribute("x1", margin.left);
      ref.setAttribute("x2", margin.left + plotW);
      ref.setAttribute("y1", refY);
      ref.setAttribute("y2", refY);
      ref.setAttribute("class", "chart-ref-line ruin");
      svg.appendChild(ref);
      const lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", margin.left + 4);
      lbl.setAttribute("y", refY - 4);
      lbl.setAttribute("class", "chart-ref-label");
      lbl.textContent = `ruin ${fmtUSDShort(ruinThreshold)}`;
      svg.appendChild(lbl);
    }

    /* ---------- Series group (clipped) ---------- */
    const seriesGroup = document.createElementNS(svgNS, "g");
    seriesGroup.setAttribute("clip-path", `url(#${clipId})`);
    svg.appendChild(seriesGroup);

    /* All series elements indexed by row id so spotlight + scrub
       updaters can flip CSS classes / move dots without rebuilding the
       DOM on each pointer event. */
    const seriesElems = new Map();

    for (const s of seriesState) {
      const bandPts = [];
      for (let i = 0; i < s.periods.length; i++) {
        bandPts.push(`${xAt(s.periods[i])},${yAt(s.upperVals[i])}`);
      }
      for (let i = s.periods.length - 1; i >= 0; i--) {
        bandPts.push(`${xAt(s.periods[i])},${yAt(s.lowerVals[i])}`);
      }
      const band = document.createElementNS(svgNS, "polygon");
      band.setAttribute("points", bandPts.join(" "));
      band.setAttribute(
        "class",
        "chart-series-band" + (s.isHidden ? " is-hidden" : "")
      );
      band.setAttribute("fill", s.color);
      band.dataset.seriesId = s.row.id;
      seriesGroup.appendChild(band);

      const linePts = s.periods
        .map((p, i) => `${xAt(p)},${yAt(s.lineVals[i])}`)
        .join(" ");
      const line = document.createElementNS(svgNS, "polyline");
      line.setAttribute("points", linePts);
      line.setAttribute(
        "class",
        "chart-series-line" + (s.isHidden ? " is-hidden" : "")
      );
      line.setAttribute("stroke", s.color);
      line.setAttribute("fill", "none");
      line.dataset.seriesId = s.row.id;
      seriesGroup.appendChild(line);

      seriesElems.set(s.row.id, { line, band });
    }

    /* Hover dot per series (above clip group; not clipped — survives
       even when the series content is clipped to scrubPeriod < its x). */
    for (const s of seriesState) {
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("r", 5);
      c.setAttribute("fill", s.color);
      c.setAttribute("stroke", "var(--bg)");
      c.setAttribute("stroke-width", "1.75");
      c.setAttribute("class", "chart-hover-dot");
      c.setAttribute("visibility", "hidden");
      c.dataset.seriesId = s.row.id;
      svg.appendChild(c);
      seriesElems.get(s.row.id).hoverDot = c;
    }

    /* Vertical guide line (shown on hover or while pinned) */
    const guide = document.createElementNS(svgNS, "line");
    guide.setAttribute("class", "chart-hover-line");
    guide.setAttribute("y1", margin.top);
    guide.setAttribute("y2", margin.top + plotH);
    guide.setAttribute("visibility", "hidden");
    svg.appendChild(guide);

    /* Floating value bubble (HTML, anchored over the cursor for the
       focused series — only one row, not a multi-line tooltip). */
    const bubble = ce("div", { class: "chart-focus-bubble" });
    bubble.style.display = "none";
    container.appendChild(bubble);

    /* Capture rect for pointer events over the plot */
    const capture = document.createElementNS(svgNS, "rect");
    capture.setAttribute("x", margin.left);
    capture.setAttribute("y", margin.top);
    capture.setAttribute("width", plotW);
    capture.setAttribute("height", plotH);
    capture.setAttribute("fill", "transparent");
    capture.setAttribute("class", "chart-hover-capture");
    svg.appendChild(capture);

    /* ---------- Right-edge ladder (HTML) ---------- */
    const ladder = ce("div", {
      class: "chart-ladder",
      role: "list",
      "aria-label": "Live agent ranking",
    });
    bodyRow.appendChild(ladder);
    const RUNG_H = 38;
    ladder.style.minHeight = `${seriesState.length * RUNG_H}px`;
    const ladderRungs = new Map();
    for (const s of seriesState) {
      const rung = ce("div", {
        class: "chart-ladder-rung" + (s.isHidden ? " is-hidden" : ""),
        role: "listitem",
        "data-series-id": s.row.id,
      });
      rung.dataset.seriesId = s.row.id;
      const rank = ce("span", { class: "chart-ladder-rank", text: "—" });
      rung.appendChild(rank);

      const avatar = ce("span", { class: "chart-ladder-avatar" });
      avatar.style.borderColor = `var(${s.colorToken})`;
      const logoSlug = resolveAgentLogoSlug(s.row);
      const logoEntry = logoSlug ? LOGO_SYMBOL_CACHE[logoSlug] : null;
      const renderAvatarGlyph = () => {
        avatar.innerHTML = "";
        avatar.classList.add("is-glyph");
        avatar.style.background = `var(${s.colorToken})`;
        avatar.textContent = (s.row.display || s.row.id || "?")
          .trim()
          .charAt(0)
          .toUpperCase();
      };
      if (logoEntry) {
        const lb = parseViewBox(logoEntry.viewBox);
        const inner = document.createElementNS(svgNS, "svg");
        inner.setAttribute("viewBox", `${lb.x} ${lb.y} ${lb.w} ${lb.h}`);
        inner.setAttribute("class", "chart-ladder-logo");
        if (logoEntry.rootAttrs) {
          for (const name of Object.keys(logoEntry.rootAttrs)) {
            inner.setAttribute(name, logoEntry.rootAttrs[name]);
          }
        }
        for (const child of logoEntry.nodes) {
          inner.appendChild(document.importNode(child, true));
        }
        avatar.appendChild(inner);
      } else if (logoSlug) {
        const img = ce("img", {
          class: "chart-ladder-logo",
          src: `logos/${logoSlug}.svg`,
          alt: "",
          loading: "eager",
          decoding: "async",
        });
        img.addEventListener("error", renderAvatarGlyph, { once: true });
        avatar.appendChild(img);
      } else {
        renderAvatarGlyph();
      }
      rung.appendChild(avatar);

      const textCol = ce("div", { class: "chart-ladder-text" });
      const name = ce("div", {
        class: "chart-ladder-name",
        text: s.row.display || s.row.id,
      });
      const valueEl = ce("div", { class: "chart-ladder-val" });
      textCol.appendChild(name);
      textCol.appendChild(valueEl);
      rung.appendChild(textCol);

      ladder.appendChild(rung);
      ladderRungs.set(s.row.id, { rung, rank, valueEl });
    }

    /* ---------- Playback rail ---------- */
    const playBtn = ce("button", {
      class: "chart-play-btn",
      type: "button",
      "aria-label": "Play race replay",
    });
    /* Two stacked icons: triangle (paused), bars (playing). CSS toggles
       which one is visible based on the .playing class. */
    playBtn.innerHTML =
      '<svg class="chart-play-icon-play" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
      '<polygon points="2.5,1.5 10.5,6 2.5,10.5"/>' +
      "</svg>" +
      '<svg class="chart-play-icon-pause" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
      '<rect x="2.5" y="1.5" width="2.5" height="9" rx="0.5"/>' +
      '<rect x="7" y="1.5" width="2.5" height="9" rx="0.5"/>' +
      "</svg>";

    const scrubber = ce("input", {
      class: "chart-scrubber",
      type: "range",
      min: "0",
      max: String(horizon),
      step: "1",
      value: String(bankrollChartState.scrubPeriod),
      "aria-label": "Period scrubber",
    });

    const periodLbl = ce("span", { class: "chart-period-readout" });

    playRow.appendChild(playBtn);
    playRow.appendChild(scrubber);
    playRow.appendChild(periodLbl);

    /* ---------- Updaters (mutate existing DOM, no rebuild) ----------

       Two independent state axes drive the visuals:
         scrubPeriod  = playhead position (clip width, ladder ranks,
                        scrubber slider position).  Animated by the
                        play button and by the entry animation.
         hoverPeriod  = where the cursor is along the x-axis.  Drives
                        only the spotlight bubble + vertical guide +
                        focused hover dot.  Falls back to scrubPeriod
                        when hoverPeriod is null.

       Decoupling them means the entry animation and the cursor can
       coexist — moving the mouse during the 1.4s draw-in animation no
       longer kills the playhead. */

    function applyScrub(periodFloat) {
      const period = Math.max(0, Math.min(horizon, periodFloat));
      const periodInt = Math.round(period);
      bankrollChartState.scrubPeriod = period;

      const w = Math.max(0, xAt(period) - margin.left);
      clipRect.setAttribute("width", w);

      scrubber.value = String(periodInt);
      periodLbl.textContent = `Period ${periodInt} / ${horizon}`;

      const visible = seriesState
        .filter((s) => !s.isHidden)
        .map((s) => ({ s, v: s.lineVals[periodInt] }));
      visible.sort((a, b) => b.v - a.v);
      const hidden = seriesState
        .filter((s) => s.isHidden)
        .map((s) => ({ s, v: 0 }));
      const ordered = [...visible, ...hidden];
      ordered.forEach((entry, i) => {
        const refs = ladderRungs.get(entry.s.row.id);
        if (!refs) return;
        refs.rung.style.transform = `translateY(${i * RUNG_H}px)`;
        refs.rank.textContent = entry.s.isHidden ? "—" : String(i + 1);
        refs.valueEl.textContent = fmtUSD(entry.s.lineVals[periodInt], 0);
      });

      /* Hover dot/guide track scrubPeriod when no separate hover is
         active — keeps them visually anchored during playback. */
      if (bankrollChartState.hoverPeriod == null) applyHover();
    }

    function applySpotlight() {
      const focusedId =
        bankrollChartState.pinnedId || bankrollChartState.hoveredId;
      seriesState.forEach((s) => {
        const refs = seriesElems.get(s.row.id);
        const ladderRefs = ladderRungs.get(s.row.id);
        const focused = focusedId === s.row.id;
        const dim = (focusedId && focusedId !== s.row.id) || s.isHidden;
        refs.line.classList.toggle("focused", !!focused);
        refs.line.classList.toggle("dim", !!dim);
        refs.band.classList.toggle("focused", !!focused);
        refs.band.classList.toggle("dim", !!dim);
        ladderRefs.rung.classList.toggle("focused", !!focused);
        ladderRefs.rung.classList.toggle("dim", !!dim);
      });
      applyHover();
    }

    function applyHover() {
      const focusedId =
        bankrollChartState.pinnedId || bankrollChartState.hoveredId;
      const period =
        bankrollChartState.hoverPeriod != null
          ? bankrollChartState.hoverPeriod
          : bankrollChartState.scrubPeriod;
      const periodInt = Math.round(period);

      // Hide all hover dots first, then show only the focused one.
      seriesState.forEach((s) => {
        const refs = seriesElems.get(s.row.id);
        const isFocused = focusedId === s.row.id && !s.isHidden;
        if (isFocused) {
          refs.hoverDot.setAttribute("cx", xAt(period));
          refs.hoverDot.setAttribute("cy", yAt(s.lineVals[periodInt]));
          refs.hoverDot.setAttribute("visibility", "visible");
        } else {
          refs.hoverDot.setAttribute("visibility", "hidden");
        }
      });

      // Vertical guide: show whenever there is a focused agent OR the
      // cursor is actively over the chart.
      const guideVisible =
        focusedId || bankrollChartState.hoverPeriod != null;
      if (guideVisible) {
        const x = xAt(period);
        guide.setAttribute("x1", x);
        guide.setAttribute("x2", x);
        guide.setAttribute("visibility", "visible");
      } else {
        guide.setAttribute("visibility", "hidden");
      }

      // Spotlight bubble: only when we have a focused series.
      if (focusedId) {
        const focused = seriesState.find((s) => s.row.id === focusedId);
        if (focused && !focused.isHidden) {
          bubble.innerHTML = "";
          bubble.appendChild(
            ce("span", {
              class: "chart-focus-swatch",
              style: `background: var(${focused.colorToken})`,
            })
          );
          bubble.appendChild(
            ce("span", {
              text:
                `${focused.row.display} · ` +
                `${fmtUSD(focused.lineVals[periodInt], 0)} · P${periodInt}`,
            })
          );
          bubble.style.display = "";
          const r = svg.getBoundingClientRect();
          const cx = (xAt(period) / width) * r.width;
          const cy = (yAt(focused.lineVals[periodInt]) / height) * r.height;
          const containerRect = container.getBoundingClientRect();
          const localX = cx + r.left - containerRect.left;
          const localY = cy + r.top - containerRect.top;
          const tipW = bubble.offsetWidth || 160;
          let left = localX + 12;
          if (left + tipW > containerRect.width - 4)
            left = localX - tipW - 12;
          if (left < 4) left = 4;
          bubble.style.left = `${left}px`;
          bubble.style.top = `${Math.max(8, localY - 26)}px`;
        } else {
          bubble.style.display = "none";
        }
      } else {
        bubble.style.display = "none";
      }
    }

    /* ---------- Pointer geometry helpers ---------- */
    function periodFromEvent(ev) {
      const r = svg.getBoundingClientRect();
      const localX = ((ev.clientX - r.left) / r.width) * width;
      const periodFloat = ((localX - margin.left) / plotW) * horizon;
      return Math.max(0, Math.min(horizon, Math.round(periodFloat)));
    }

    function nearestSeriesAt(period, ev) {
      const r = svg.getBoundingClientRect();
      const localY = ((ev.clientY - r.top) / r.height) * height;
      let bestId = null;
      let bestDist = Infinity;
      for (const s of seriesState) {
        if (s.isHidden) continue;
        const dy = Math.abs(yAt(s.lineVals[period]) - localY);
        if (dy < bestDist) {
          bestDist = dy;
          bestId = s.row.id;
        }
      }
      return bestId;
    }

    /* ---------- Event wiring ----------
       Hover only updates hoveredId + hoverPeriod — never scrubPeriod.
       That keeps the entry animation and any active playback running
       even while the cursor moves over the chart.  Click pins the
       spotlight; the scrubber drag and play button are the only inputs
       that actually move the playhead. */
    capture.addEventListener("pointermove", (ev) => {
      const p = periodFromEvent(ev);
      bankrollChartState.hoverPeriod = p;
      if (!bankrollChartState.pinnedId) {
        bankrollChartState.hoveredId = nearestSeriesAt(p, ev);
      }
      applySpotlight();
    });
    capture.addEventListener("pointerleave", () => {
      bankrollChartState.hoverPeriod = null;
      if (!bankrollChartState.pinnedId) {
        bankrollChartState.hoveredId = null;
      }
      applySpotlight();
    });
    capture.addEventListener("click", (ev) => {
      const p = periodFromEvent(ev);
      const id = nearestSeriesAt(p, ev);
      if (!id) return;
      bankrollChartState.pinnedId =
        bankrollChartState.pinnedId === id ? null : id;
      bankrollChartState.hoveredId = null;
      applySpotlight();
    });

    /* Ladder hover & click mirror chart hover & click. */
    ladder.addEventListener("pointerover", (ev) => {
      if (bankrollChartState.pinnedId) return;
      const r = ev.target.closest(".chart-ladder-rung");
      if (!r) return;
      bankrollChartState.hoveredId = r.dataset.seriesId;
      applySpotlight();
    });
    ladder.addEventListener("pointerleave", () => {
      if (bankrollChartState.pinnedId) return;
      bankrollChartState.hoveredId = null;
      applySpotlight();
    });
    ladder.addEventListener("click", (ev) => {
      const r = ev.target.closest(".chart-ladder-rung");
      if (!r) return;
      const id = r.dataset.seriesId;
      bankrollChartState.pinnedId =
        bankrollChartState.pinnedId === id ? null : id;
      bankrollChartState.hoveredId = null;
      applySpotlight();
    });

    /* Scrubber drag — manual control overrides any active playback. */
    scrubber.addEventListener("input", () => {
      stopPlayback();
      applyScrub(Number(scrubber.value));
    });

    /* Play / pause */
    playBtn.addEventListener("click", () => {
      if (bankrollChartState.playing) {
        stopPlayback();
      } else {
        startPlayback({ durationMs: 5500 });
      }
    });

    function startPlayback({ durationMs }) {
      stopPlayback();
      const startPeriod =
        bankrollChartState.scrubPeriod >= horizon
          ? 0
          : bankrollChartState.scrubPeriod;
      const remaining = horizon - startPeriod;
      if (remaining <= 0) return;
      bankrollChartState.playing = true;
      playBtn.classList.add("playing");
      const totalMs = durationMs * (remaining / horizon);
      const startTs = performance.now();
      function tick(now) {
        if (!bankrollChartState.playing) return;
        const t = Math.min(1, (now - startTs) / totalMs);
        applyScrub(startPeriod + (horizon - startPeriod) * t);
        if (t >= 1) {
          stopPlayback();
          return;
        }
        bankrollChartState.playbackRAF = requestAnimationFrame(tick);
      }
      bankrollChartState.playbackRAF = requestAnimationFrame(tick);
    }

    function stopPlayback() {
      bankrollChartState.playing = false;
      playBtn.classList.remove("playing");
      if (bankrollChartState.playbackRAF) {
        cancelAnimationFrame(bankrollChartState.playbackRAF);
        bankrollChartState.playbackRAF = null;
      }
    }

    /* ---------- Initial paint ---------- */
    applyScrub(bankrollChartState.scrubPeriod);
    applySpotlight();

    /* Entry animation: when the dataset just changed, replay the
       trajectory drawing in 1.4s.  Reuses the playback machinery. */
    if (datasetChanged && !prefersReducedMotion()) {
      bankrollChartState.scrubPeriod = 0;
      applyScrub(0);
      startPlayback({ durationMs: 1400 });
    }

    /* ---------- Legend (still useful for show/hide) ---------- */
    for (const row of rows) {
      const colorToken = colorIndex.get(row.id);
      const isDim = bankrollChartState.hidden.has(row.id);
      const item = ce("span", {
        class: "chart-legend-item" + (isDim ? " dim" : ""),
        onclick: () => {
          if (bankrollChartState.hidden.has(row.id))
            bankrollChartState.hidden.delete(row.id);
          else bankrollChartState.hidden.add(row.id);
          renderBankrollChart();
        },
      });
      item.appendChild(
        ce("span", {
          class: "chart-legend-swatch",
          style: `background: var(${colorToken})`,
        })
      );
      const traj = row.balance_trajectory;
      const finalArr =
        useMedian && traj.p50_usd ? traj.p50_usd : traj.mean_usd;
      const final = finalArr[finalArr.length - 1];
      const n = traj.n_sessions;
      item.appendChild(
        ce("span", {
          text: `${row.display} · ${fmtUSD(final, 0)} (n=${n})`,
        })
      );
      legendRow.appendChild(item);
    }
  }

  function fmtUSDShort(value) {
    if (value == null || Number.isNaN(value)) return "—";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}$${abs.toFixed(0)}`;
  }

  function niceCeil(v) {
    if (v <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    const niceNorm =
      norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return niceNorm * mag;
  }

  function niceFloor(v) {
    if (v >= 0) return 0;
    return -niceCeil(-v);
  }

  function niceDomain(min, max, targetTicks) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }
    if (max < min) [min, max] = [max, min];
    let span = max - min;
    if (span <= 0) {
      const pad = Math.max(1, Math.abs(max) * 0.05);
      min -= pad;
      max += pad;
      span = max - min;
    }
    const pad = Math.max(span * 0.08, 1);
    const paddedMin = min - pad;
    const paddedMax = max + pad;
    const rawStep = (paddedMax - paddedMin) / Math.max(1, targetTicks);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const niceNorm =
      norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    const step = niceNorm * mag;
    return {
      min: Math.floor(paddedMin / step) * step,
      max: Math.ceil(paddedMax / step) * step,
    };
  }

  function niceTicks(min, max, target) {
    if (max <= min) return [min];
    const range = max - min;
    const rawStep = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const niceNorm =
      norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    const step = niceNorm * mag;
    const out = [];
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max + step / 2; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    if (out[0] !== min) out.unshift(min);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }

  function renderBankrollBoard() {
    const tbody = $("bankroll-leaderboard-body");
    if (!tbody || !bankrollData) return;
    const block = bankrollCurrentBlock();
    if (!block) return;

    const rows = (block.rows || []).slice();
    rows.sort((a, b) => {
      const av = (a.overall || {}).terminal_balance_mean_usd;
      const bv = (b.overall || {}).terminal_balance_mean_usd;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });

    tbody.innerHTML = "";
    rows.forEach((row, idx) => {
      const cell = row.overall || {};
      const tr = ce("tr", null, [
        ce("td", { class: "col-rank num", text: String(idx + 1) }),
        ce("td", { class: "col-agent" }, [makeAgentCell(row)]),
        ce("td", { class: "col-provider", text: row.provider || "" }),
        ce("td", {
          class: signedNumClass(cell.terminal_balance_mean_usd) + " col-headline",
          text: fmtUSD(cell.terminal_balance_mean_usd, 0),
        }),
        ce("td", {
          class: "num",
          text: cell.terminal_balance_sem_usd != null
            ? `±${fmtUSD(cell.terminal_balance_sem_usd, 0).replace("$", "$")}`
            : "—",
        }),
        ce("td", {
          class: signedNumClass(cell.mean_period_profit_usd),
          text: fmtUSD(cell.mean_period_profit_usd, 2),
        }),
        ce("td", {
          class: "num",
          text: fmtPctC(cell.survival_rate, 0),
        }),
        ce("td", {
          class: "num",
          text: cell.time_to_ruin_median_periods != null
            ? `p${fmtPeriods(cell.time_to_ruin_median_periods)}`
            : "—",
        }),
        ce("td", {
          class: "num",
          text: cell.max_drawdown_mean_usd != null
            ? fmtUSD(cell.max_drawdown_mean_usd, 0)
            : "—",
        }),
        ce("td", {
          class: signedNumClass(cell.memory_premium_mean_usd) + " col-memory-premium",
          text: cell.memory_premium_mean_usd != null
            ? fmtUSD(cell.memory_premium_mean_usd, 0)
            : "—",
        }),
        ce("td", {
          class: "num col-memory-premium",
          text: cell.memory_premium_sem_usd != null
            ? `±${fmtUSD(cell.memory_premium_sem_usd, 0).replace("$", "$")}`
            : "—",
        }),
        ce("td", {
          class: "num",
          text: cell.n_sessions != null ? String(cell.n_sessions) : "—",
        }),
      ]);
      tbody.appendChild(tr);
    });

    if (rows.length === 0) {
      tbody.appendChild(
        ce("tr", null, [
          ce("td", {
            colspan: "12",
            class: "num",
            text: "No bankroll data available.",
          }),
        ])
      );
    }

    // Hide the Memory-premium columns when no row carries the diagnostic.
    // Arxiv-era runs skip the memoryless replay, so all values are null.
    const tbl = $("bankroll-leaderboard");
    const hasMemory = rows.some(
      (r) => (r.overall || {}).memory_premium_mean_usd != null
    );
    if (tbl) tbl.classList.toggle("hide-memory-premium", !hasMemory);
  }

  /* ---------------- Shareable view URL + motion preference ---------------- */

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  let termsUrlSyncTimer = null;
  function termsUrlScheduleSync() {
    if (typeof history === "undefined" || !history.replaceState) return;
    clearTimeout(termsUrlSyncTimer);
    termsUrlSyncTimer = setTimeout(termsApplyCurrentStateToUrl, 200);
  }

  function termsApplyCurrentStateToUrl() {
    const p = new URLSearchParams();
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme === "dark" || theme === "light") p.set("theme", theme);
    if (boardState.regime) p.set("regime", boardState.regime);
    p.set("family_kind", chartStates.family.kind);
    p.set("difficulty_kind", chartStates.difficulty.kind);
    p.set("diag_kind", diagState.kind);
    if (commerceIsAvailable() && commerceData?.sources) {
      if (commerceState.source != null) {
        p.set("commerce_src", String(commerceState.source));
      }
      if (commerceState.perspective != null) {
        p.set("commerce_persp", String(commerceState.perspective));
      }
    }
    if (bankrollIsAvailable() && bankrollData) {
      if (bankrollState.source != null) {
        p.set("bankroll_src", String(bankrollState.source));
      }
      if (bankrollState.mode != null) {
        p.set("bankroll_mode", String(bankrollState.mode));
      }
      p.set(
        "bankroll_stats",
        bankrollChartState.statsMode === "median" ? "median" : "mean"
      );
    }
    const qs = p.toString();
    const url = new URL(window.location.href);
    url.search = qs;
    history.replaceState(null, "", url);
  }

  function termsReadUrlState() {
    let sp;
    try {
      sp = new URLSearchParams(window.location.search);
    } catch (_) {
      return;
    }

    const th = sp.get("theme");
    if (th === "dark" || th === "light") {
      document.documentElement.setAttribute("data-theme", th);
      try { localStorage.setItem("terms-theme", th); } catch (_) {}
    }

    if (sp.has("regime")) {
      const reg = sp.get("regime");
      if (reg && data.regimes && data.regimes.includes(reg)) {
        boardState.regime = reg;
        boardState.page = 1;
        renderRegimePills();
        renderBoard();
      }
    }

    const applyChartKind = (param, stateKey, hostId, rerenderFn) => {
      if (!sp.has(param)) return;
      const v = sp.get(param);
      if (!v || !KIND_FILTERS.some((k) => k.id === v)) return;
      chartStates[stateKey].kind = v;
      chartStates[stateKey].hidden = new Set();
      const host = $(hostId);
      if (host) {
        for (const pill of host.querySelectorAll(".pill")) {
          pill.classList.toggle("active", pill.dataset.id === v);
        }
      }
      rerenderFn();
    };
    applyChartKind("family_kind", "family", "family-kind-pills", renderFamilyChart);
    applyChartKind(
      "difficulty_kind",
      "difficulty",
      "difficulty-kind-pills",
      renderDifficultyChart
    );

    if (sp.has("diag_kind")) {
      const dk = sp.get("diag_kind");
      if (dk && KIND_FILTERS.some((k) => k.id === dk)) {
        diagState.kind = dk;
        const host = $("diag-kind-pills");
        if (host) {
          for (const pill of host.querySelectorAll(".pill")) {
            pill.classList.toggle("active", pill.dataset.id === dk);
          }
        }
        renderAllScatters();
      }
    }

    const hasCommerceQs = sp.has("commerce_src") || sp.has("commerce_persp");
    if (commerceIsAvailable() && commerceData?.sources && hasCommerceQs) {
      const cs = sp.get("commerce_src");
      if (cs && commerceData.sources[cs]) {
        const block = commerceData.sources[cs];
        if (block.rows && block.rows.length > 0) commerceState.source = cs;
      }
      initCommerceSourcePills();
      initCommercePerspectivePills();
      const cp = sp.get("commerce_persp");
      if (cp != null && cp !== "") {
        const block = commerceCurrentSource();
        const ok =
          cp === "all" || (block?.perspectives || []).includes(cp);
        if (ok) commerceState.perspective = cp;
        const pchost = $("commerce-perspective-pills");
        if (pchost) {
          for (const el of pchost.querySelectorAll(".pill")) {
            el.classList.toggle(
              "active",
              el.dataset.perspective === commerceState.perspective
            );
          }
        }
      }
      renderCommerceFootnote();
      renderCommerceBoard();
    }

    const hasBankrollQs =
      sp.has("bankroll_src") ||
      sp.has("bankroll_mode") ||
      sp.has("bankroll_stats");
    if (bankrollIsAvailable() && bankrollData && hasBankrollQs) {
      const bs = sp.get("bankroll_src");
      if (bs && bankrollData.sources?.[bs]) {
        const src = bankrollData.sources[bs];
        const nonempty = (src.modeOrder || []).some(
          (m) => (src.modes?.[m]?.rows || []).length > 0
        );
        if (nonempty) bankrollState.source = bs;
      }
      const bm = sp.get("bankroll_mode");
      const srcBlock = bankrollCurrentSource();
      if (bm && srcBlock?.modes?.[bm]) {
        const rows = srcBlock.modes[bm].rows;
        if (rows && rows.length > 0) bankrollState.mode = bm;
      }
      const bst = sp.get("bankroll_stats");
      if (bst === "median" || bst === "mean") {
        bankrollChartState.statsMode = bst;
      }
      if (sp.has("bankroll_src") || sp.has("bankroll_mode")) {
        initBankrollSourcePills();
        initBankrollModePills();
        renderBankrollFootnote();
        bankrollChartState.hidden = new Set();
      }
      renderBankrollChart();
      renderBankrollBoard();
    }
  }

  /* =================================================================
     SECTION F — Data-grounded robustness charts
     Two SVG charts in #section-pg-robustness:
       1. renderPGShiftChart   — synth -> PG SE+ slopegraph
       2. renderPGRankingChart — vertical bar chart of PG SE+ with logos
     Both use the existing scatter-style CSS hover pattern: parent on hover
     dims non-hovered children via `parent:hover .item:not(:hover)`.
     ================================================================= */

  // Kind -> bar fill color. Matches the paper teaser's tier palette.
  // "other" rows (e.g. Grok 4.20) are treated as frontier-pink: in
  // data.js they're tagged "other" only because they don't slot into
  // the open-weight / closed-frontier dichotomy cleanly, but for the
  // leaderboard's tier-colouring they belong with the frontier band.
  const PG_KIND_COLORS = {
    frontier: "#e9a4be",     // pink — frontier closed-source
    open:     "#e8c87a",     // yellow — open-weight
    other:    "#e9a4be",     // pink — treat as frontier (e.g. Grok)
    baseline: "#c5c5c5",     // grey — fixed-concession baselines
    sub_frontier: "#8fb5d6", // blue — sub-frontier reference
  };
  function pgKindColor(row) {
    // GPT-4o-mini is labelled "frontier" in data.js but is a
    // deliberately sub-frontier reference in the paper; colour it
    // blue to match the teaser figure.
    if (/gpt-?4o[- ]?mini/i.test(row.display || row.id || "")) {
      return PG_KIND_COLORS.sub_frontier;
    }
    return PG_KIND_COLORS[row.kind] || PG_KIND_COLORS.other;
  }

  function _pgPairedRows() {
    if (!data || !window.TERMS_PG_OVERLAY) return [];
    const out = [];
    for (const row of data.rows) {
      if (row.kind === "baseline") continue;
      const synSE = row.regimes?.overall?.se_plus;
      const pgSE = window.TERMS_PG_OVERLAY[row.id]?.se_plus_pg;
      if (typeof synSE !== "number" || typeof pgSE !== "number") continue;
      out.push({ row, synSE, pgSE });
    }
    return out;
  }

  function renderPGShiftChart() {
    const host = $("chart-pg-shift");
    if (!host) return;
    host.innerHTML = "";
    const rows = _pgPairedRows();
    if (rows.length === 0) {
      host.appendChild(ce("p", {
        class: "chart-empty",
        text: "Data-grounded overlay not loaded.",
      }));
      return;
    }
    const SVG_NS_L = "http://www.w3.org/2000/svg";
    const W = Math.max(640, host.clientWidth || 720);
    const H = 380;
    const M = { top: 28, right: 240, bottom: 36, left: 64 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;
    const xSyn = M.left + 0.08 * innerW;
    const xPG = M.left + 0.92 * innerW;

    // Y-axis span: 0 to max of either suite (rounded up to nearest 0.1).
    let yMax = 0;
    for (const r of rows) yMax = Math.max(yMax, r.synSE, r.pgSE);
    yMax = Math.min(1.0, Math.ceil(yMax * 10) / 10);
    const yMin = 0.0;
    const yScale = (v) => M.top + innerH * (1 - (v - yMin) / (yMax - yMin));

    const svg = document.createElementNS(SVG_NS_L, "svg");
    svg.setAttribute("class", "chart-svg pg-shift-svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = `${H}px`;

    // Y axis ticks
    for (let v = yMin; v <= yMax + 1e-9; v += 0.1) {
      const y = yScale(v);
      const grid = document.createElementNS(SVG_NS_L, "line");
      grid.setAttribute("x1", M.left);
      grid.setAttribute("x2", W - M.right);
      grid.setAttribute("y1", y);
      grid.setAttribute("y2", y);
      grid.setAttribute("class", "chart-grid");
      svg.appendChild(grid);
      const lbl = document.createElementNS(SVG_NS_L, "text");
      lbl.setAttribute("x", M.left - 8);
      lbl.setAttribute("y", y + 4);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-axis-label");
      lbl.textContent = v.toFixed(1);
      svg.appendChild(lbl);
    }

    // Column headers
    const head = (x, text) => {
      const t = document.createElementNS(SVG_NS_L, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", M.top - 10);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "chart-axis-title");
      t.textContent = text;
      svg.appendChild(t);
    };
    head(xSyn, "Synthetic");
    head(xPG, "Data-grounded");

    // Y-axis title
    const yt = document.createElementNS(SVG_NS_L, "text");
    yt.setAttribute("transform", `translate(${M.left - 44}, ${M.top + innerH / 2}) rotate(-90)`);
    yt.setAttribute("text-anchor", "middle");
    yt.setAttribute("class", "chart-axis-title");
    yt.textContent = "SE+";
    svg.appendChild(yt);

    // Deconflict the right-side labels (sort by pgSE desc; enforce min gap).
    const sortedByPG = [...rows].sort((a, b) => b.pgSE - a.pgSE);
    const MIN_GAP = 14; // px in viewBox units
    const labelY = new Map();
    let prev = -Infinity;
    for (const r of sortedByPG) {
      let y = yScale(r.pgSE);
      if (y - prev < MIN_GAP) y = prev + MIN_GAP;
      labelY.set(r.row.id, y);
      prev = y;
    }

    // One group per agent: line + two endpoints + right-side label.
    for (const r of rows) {
      const delta = r.pgSE - r.synSE;
      const colorClass =
        delta >= 0.01 ? "pg-shift-gain" :
        delta <= -0.01 ? "pg-shift-loss" : "pg-shift-flat";
      const g = document.createElementNS(SVG_NS_L, "g");
      g.setAttribute("class", `pg-shift-line ${colorClass}`);
      g.setAttribute("data-agent", r.row.id);

      const y1 = yScale(r.synSE);
      const y2 = yScale(r.pgSE);

      const line = document.createElementNS(SVG_NS_L, "line");
      line.setAttribute("x1", xSyn);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", xPG);
      line.setAttribute("y2", y2);
      line.setAttribute("class", "pg-shift-line-stroke");
      g.appendChild(line);

      const dotL = document.createElementNS(SVG_NS_L, "circle");
      dotL.setAttribute("cx", xSyn); dotL.setAttribute("cy", y1);
      dotL.setAttribute("r", 4);
      dotL.setAttribute("class", "pg-shift-dot");
      g.appendChild(dotL);

      const dotR = document.createElementNS(SVG_NS_L, "circle");
      dotR.setAttribute("cx", xPG); dotR.setAttribute("cy", y2);
      dotR.setAttribute("r", 4);
      dotR.setAttribute("class", "pg-shift-dot");
      g.appendChild(dotR);

      const ly = labelY.get(r.row.id);
      // Connector from the right-side dot to the label position (when offset).
      if (Math.abs(ly - y2) > 1) {
        const lead = document.createElementNS(SVG_NS_L, "line");
        lead.setAttribute("x1", xPG + 6);
        lead.setAttribute("y1", y2);
        lead.setAttribute("x2", xPG + 18);
        lead.setAttribute("y2", ly);
        lead.setAttribute("class", "pg-shift-lead");
        g.appendChild(lead);
      }
      const lbl = document.createElementNS(SVG_NS_L, "text");
      lbl.setAttribute("x", xPG + 24);
      lbl.setAttribute("y", ly + 4);
      lbl.setAttribute("class", "pg-shift-label");
      const sign = delta >= 0 ? "+" : "−";
      lbl.textContent = `${r.row.display}  (${sign}${Math.abs(delta).toFixed(3)})`;
      g.appendChild(lbl);

      // SVG <title> for native browser tooltip on hover.
      const title = document.createElementNS(SVG_NS_L, "title");
      title.textContent = `${r.row.display}\nSynthetic SE+: ${r.synSE.toFixed(3)}\nData-grounded SE+: ${r.pgSE.toFixed(3)}\nΔ: ${sign}${Math.abs(delta).toFixed(3)}`;
      g.appendChild(title);

      svg.appendChild(g);
    }
    host.appendChild(svg);
  }

  function renderPGRankingChart() {
    const host = $("chart-pg-ranking");
    if (!host) return;
    host.innerHTML = "";
    const rows = _pgPairedRows()
      .slice()
      .sort((a, b) => b.pgSE - a.pgSE);
    if (rows.length === 0) {
      host.appendChild(ce("p", {
        class: "chart-empty",
        text: "Data-grounded overlay not loaded.",
      }));
      return;
    }
    const SVG_NS_L = "http://www.w3.org/2000/svg";
    const containerW = host.clientWidth || 880;
    const W = Math.max(720, containerW);
    const H = 440;
    const M = { top: 56, right: 24, bottom: 92, left: 56 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    let yMax = 0;
    for (const r of rows) yMax = Math.max(yMax, r.pgSE);
    yMax = Math.min(1.0, Math.ceil(yMax * 10) / 10 + 0.05);
    const yScale = (v) => M.top + innerH * (1 - v / yMax);

    const n = rows.length;
    const slot = innerW / n;
    const barW = Math.min(56, Math.max(28, slot * 0.62));

    const svg = document.createElementNS(SVG_NS_L, "svg");
    svg.setAttribute("class", "chart-svg pg-ranking-svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = `${H}px`;

    // Y axis ticks + grid
    for (let v = 0; v <= yMax + 1e-9; v += 0.1) {
      const y = yScale(v);
      const grid = document.createElementNS(SVG_NS_L, "line");
      grid.setAttribute("x1", M.left);
      grid.setAttribute("x2", W - M.right);
      grid.setAttribute("y1", y);
      grid.setAttribute("y2", y);
      grid.setAttribute("class", "chart-grid");
      svg.appendChild(grid);
      const lbl = document.createElementNS(SVG_NS_L, "text");
      lbl.setAttribute("x", M.left - 8);
      lbl.setAttribute("y", y + 4);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("class", "chart-axis-label");
      lbl.textContent = v.toFixed(1);
      svg.appendChild(lbl);
    }
    const yt = document.createElementNS(SVG_NS_L, "text");
    yt.setAttribute("transform", `translate(${M.left - 38}, ${M.top + innerH / 2}) rotate(-90)`);
    yt.setAttribute("text-anchor", "middle");
    yt.setAttribute("class", "chart-axis-title");
    yt.textContent = "Data-grounded SE+";
    svg.appendChild(yt);

    // One group per bar
    rows.forEach((r, i) => {
      const cx = M.left + slot * (i + 0.5);
      const xBar = cx - barW / 2;
      const y0 = yScale(0);
      const y1 = yScale(r.pgSE);

      const g = document.createElementNS(SVG_NS_L, "g");
      g.setAttribute("class", "pg-bar");
      g.setAttribute("data-agent", r.row.id);

      // Bar rect
      const rect = document.createElementNS(SVG_NS_L, "rect");
      rect.setAttribute("x", xBar);
      rect.setAttribute("y", y1);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", Math.max(0, y0 - y1));
      rect.setAttribute("fill", pgKindColor(r.row));
      rect.setAttribute("class", "pg-bar-rect");
      g.appendChild(rect);

      // Value label inside-top of the bar
      const val = document.createElementNS(SVG_NS_L, "text");
      val.setAttribute("x", cx);
      val.setAttribute("y", y1 - 18);
      val.setAttribute("text-anchor", "middle");
      val.setAttribute("class", "pg-bar-value");
      val.textContent = r.pgSE.toFixed(3);
      g.appendChild(val);

      // Logo above the value label. Logo bottom sits ~10px above the
      // top of the value-label text so the two don't collide.
      const logoSlug = resolveAgentLogoSlug(r.row);
      if (logoSlug) {
        const size = 22;
        const img = document.createElementNS(SVG_NS_L, "image");
        img.setAttribute("href", `logos/${logoSlug}.svg`);
        img.setAttribute("x", cx - size / 2);
        img.setAttribute("y", y1 - 62);
        img.setAttribute("width", size);
        img.setAttribute("height", size);
        img.setAttribute("class", "pg-bar-logo");
        g.appendChild(img);
      }

      // Agent name below the x axis, angled
      const name = document.createElementNS(SVG_NS_L, "text");
      name.setAttribute("transform", `translate(${cx}, ${y0 + 14}) rotate(-32)`);
      name.setAttribute("text-anchor", "end");
      name.setAttribute("class", "pg-bar-name");
      name.textContent = r.row.display;
      g.appendChild(name);

      // Native tooltip on hover
      const title = document.createElementNS(SVG_NS_L, "title");
      title.textContent =
        `${r.row.display}\nData-grounded SE+: ${r.pgSE.toFixed(3)}\nSynthetic SE+: ${r.synSE.toFixed(3)}\nΔ: ${r.pgSE >= r.synSE ? "+" : "−"}${Math.abs(r.pgSE - r.synSE).toFixed(3)}`;
      g.appendChild(title);

      svg.appendChild(g);
    });

    // x-axis baseline
    const base = document.createElementNS(SVG_NS_L, "line");
    base.setAttribute("x1", M.left);
    base.setAttribute("x2", W - M.right);
    base.setAttribute("y1", yScale(0));
    base.setAttribute("y2", yScale(0));
    base.setAttribute("class", "chart-axis-line");
    svg.appendChild(base);

    // Legend (kind chips)
    const legendItems = [
      { label: "frontier",     color: PG_KIND_COLORS.frontier },
      { label: "open-weight",  color: PG_KIND_COLORS.open },
      { label: "sub-frontier", color: PG_KIND_COLORS.sub_frontier },
    ];
    let lx = M.left;
    const ly = 18;
    legendItems.forEach((item) => {
      const sw = document.createElementNS(SVG_NS_L, "rect");
      sw.setAttribute("x", lx); sw.setAttribute("y", ly - 8);
      sw.setAttribute("width", 12); sw.setAttribute("height", 12);
      sw.setAttribute("fill", item.color);
      sw.setAttribute("rx", 2);
      svg.appendChild(sw);
      const lbl = document.createElementNS(SVG_NS_L, "text");
      lbl.setAttribute("x", lx + 18); lbl.setAttribute("y", ly + 3);
      lbl.setAttribute("class", "chart-legend-text");
      lbl.textContent = item.label;
      svg.appendChild(lbl);
      lx += 18 + (item.label.length * 6.5) + 18;
    });

    host.appendChild(svg);
  }

  function initPageToc() {
    const liC = $("page-toc-li-commerce");
    if (liC) liC.hidden = !commerceIsAvailable();
    const liB = $("page-toc-li-bankroll");
    if (liB) liB.hidden = !bankrollIsAvailable();
  }
  /* --------------------------- Kickoff --------------------------- */

  initThemeToggle();
  initRegimePills();
  initSortHeaders();
  renderBoard();

  initKindPills("family-kind-pills", "family", renderFamilyChart);
  initKindPills("difficulty-kind-pills", "difficulty", renderDifficultyChart);
  renderFamilyChart();
  renderDifficultyChart();

  initDiagKindPills();
  renderAllScatters();

  renderPGShiftChart();
  renderPGRankingChart();

  loadPromptExcerpt();
  renderTraces();

  initCommerceSection();
  initBankrollSection();
  initPageToc();
  termsReadUrlState();

  /* Kick off provider-logo preload at startup.  Each table has already
     rendered a first paint with letter-glyph fallbacks; once the SVGs
     resolve we re-render every surface that embeds a logo so the marks
     upgrade to the real provider artwork in place.  We race against a
     1.2s timeout so a slow logo fetch never blocks an upgrade we
     already finished. */
  Promise.race([
    preloadLogos(),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]).then(() => {
    if (data) {
      renderBoard();
      // Each of these surfaces embeds a provider logo (heatmap rows,
      // radar legend, scatter legend) and was painted before the SVG
      // cache filled.  Re-rendering swaps the letter-glyph fallback
      // for the real provider mark in place.
      renderDifficultyChart();
      renderFamilyChart();
      renderAllScatters();
    }
    if (commerceData) renderCommerceBoard();
    if (bankrollData) renderBankrollBoard();
  });
})();
