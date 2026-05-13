// Per-agent qualitative metadata for the "Bargaining Fingerprint" cards.
//
// Numerical fields (SE+, α_cue, α_inf, ρ_π proxy, role bias, etc.) are
// auto-computed from data.js at render time; see app.js (renderDiagnoses).
//
// Manual fields encoded here:
//   trajectory        anchor-and-hold | mid-balanced | anchor-and-concede | accepter | refuser
//   safety            holder | forcer | rejector | mixed
//   bottleneck        control | uncertainty | inference | mixed | unknown
//                     (only the four flagship models are reported in F4)
//   tagline           one-line strapline shown under the agent name
//   diagnosis         hand-curated 2–4 sentence diagnostic paragraph
//   avatar            optional image path (place under leaderboard/avatars/);
//                     null until you drop in cartoons
//
// All other fields (rank, αcue/αinf bins, superlatives) are derived.
window.TERMS_DIAGNOSES = {
  "llm_claude_aws_4_6": {
    trajectory: "anchor-and-hold",
    safety: "holder",
    bottleneck: "mixed",
    tagline: "Disciplined anchor; loses to friendly cues.",
    diagnosis:
      "A disciplined anchor-and-hold negotiator: opens tight, refuses to concede, " +
      "and closes on its own terms. Recovers the largest fraction of available " +
      "oracle surplus in the panel, but over-reacts when verbal cues are " +
      "informative (largest α_cue penalty) and fails to convert latent-type " +
      "knowledge into action; its remaining gap is mixed across inference, " +
      "uncertainty, and control. Strongly favors the seller role.",
    avatar: null,
  },
  "llm_glm": {
    trajectory: "anchor-and-hold",
    safety: "forcer",
    bottleneck: "unknown",
    tagline: "Highest conditional surplus; occasional reservation breaches.",
    diagnosis:
      "Anchor-and-hold style with the highest conditional surplus and oracle " +
      "attainment in the panel: when GLM 5.1 closes a deal it captures more of " +
      "the ZOPA than any other agent. The trade-off is critical-violation rate: " +
      "it occasionally agrees on prices that breach its own reservation, the only " +
      "anchor-and-hold model with non-zero IR violations. Loses ground under " +
      "product grounding more than other top models.",
    avatar: null,
  },
  "llm_claude_aws": {
    trajectory: "anchor-and-hold",
    safety: "holder",
    bottleneck: "uncertainty",
    tagline: "Holder profile; bottleneck is residual uncertainty.",
    diagnosis:
      "Anchor-and-hold style with clean reservation discipline (no IR violations, " +
      "low AgentExit⁻). Its oracle gap is dominated by residual uncertainty: even " +
      "with the latent type revealed, it can recover only a small additional " +
      "fraction of surplus; the inference component of the gap is nearly closed " +
      "but uncertainty over the remaining unknowns binds.",
    avatar: null,
  },
  "llm_google_gemma-4-31b-it": {
    trajectory: "mid-balanced",
    safety: "holder",
    bottleneck: "unknown",
    tagline: "Mid-tier capture; near-saturated agreement rate.",
    diagnosis:
      "Mid-balanced trajectory with one of the highest feasible agreement rates " +
      "in the panel and near-zero violations. Captures surplus reliably but not " +
      "aggressively. Closes deals readily and at moderate ZOPA share. Performance " +
      "holds under product grounding, suggesting robust use of the public " +
      "reference anchor.",
    avatar: null,
  },
  "llm_gemini_naci": {
    trajectory: "anchor-and-hold",
    safety: "holder",
    bottleneck: "unknown",
    tagline: "Anchor-and-hold with smallest cross-suite penalty.",
    diagnosis:
      "Anchor-and-hold trajectory with the smallest drop on the hardest difficulty " +
      "bin in the panel and the largest gain under data grounding. Holds opening " +
      "anchors and closes cleanly; clean reservation discipline (zero IR " +
      "violations). The model most consistent across structural conditions.",
    avatar: null,
  },
  "llm_deepseek": {
    trajectory: "mid-balanced",
    safety: "forcer",
    bottleneck: "unknown",
    tagline: "Balanced trajectory; occasional reservation pushes.",
    diagnosis:
      "Mid-balanced negotiator: closes deals at moderate ZOPA share and survives " +
      "structural stress reasonably well, but occasionally agrees on prices below " +
      "its own reservation. Belief error is among the lowest in the panel, but " +
      "that calibration does not translate into top-tier surplus.",
    avatar: null,
  },
  "llm_qwen": {
    trajectory: "mid-balanced",
    safety: "forcer",
    bottleneck: "unknown",
    tagline: "Mid-tier capture; highest violation rate in the panel.",
    diagnosis:
      "Mid-balanced trajectory but the highest critical-violation rate in the " +
      "panel, including the only non-zero feasible-disagreement on no-deal " +
      "scenarios. Loses substantial surplus under product grounding (–0.112 " +
      "ΔSE⁺), suggesting the synthetic anchor partially compensated for weaker " +
      "anchoring on the public reference price.",
    avatar: null,
  },
  "llm_x-ai_grok-4.20": {
    trajectory: "anchor-and-concede",
    safety: "mixed",
    bottleneck: "uncertainty",
    tagline: "Lowest belief error; mid-tier surplus capture.",
    diagnosis:
      "Anchor-and-concede style: closes high fraction of deals on its own offers " +
      "but at a lower ZOPA share than the anchor-and-hold cohort. Achieves the " +
      "lowest belief error in the panel (best latent-type inference) yet only " +
      "mid-tier surplus; its bottleneck is decisions under uncertainty, not " +
      "inference quality. Carries a non-trivial critical-violation rate.",
    avatar: null,
  },
  "llm_kimi": {
    trajectory: "mid-balanced",
    safety: "rejector",
    bottleneck: "unknown",
    tagline: "Mid trajectory in overlap; aggressive walk-aways on no-deal.",
    diagnosis:
      "Mid-balanced in overlap regimes but a rejector under infeasibility: highest " +
      "AgentExit⁻ in the non-refuser cohort, walking away cleanly when no agreement " +
      "is rational. Zero IR violations. Loses meaningfully under data grounding " +
      "(–0.099 ΔSE⁺); anchoring on the synthetic price range was doing real work.",
    avatar: null,
  },
  "llm_gpt_azure": {
    trajectory: "accepter",
    safety: "holder",
    bottleneck: "unknown",
    tagline: "Accepts readily; near-zero α_cue penalty.",
    diagnosis:
      "Accepter style: closes most deals on counterpart offers rather than its own. " +
      "ZOPA share at closing is the lowest among non-refuser agents. Notably, its " +
      "α_cue penalty is the smallest in the panel; it neither benefits from nor " +
      "is harmed by informative verbal cues, consistent with a strategy of " +
      "accepting reasonable offers regardless of cue content.",
    avatar: null,
  },
  "llm_gpt_5_5": {
    trajectory: "mid-balanced",
    safety: "holder",
    bottleneck: "unknown",
    tagline: "High ρπ in mid-tier; largest α_cue penalty in panel.",
    diagnosis:
      "Mid-balanced σπ at the upper ρπ boundary: closes a high share of deals on " +
      "its own offers but with mid-tier ZOPA capture. Carries the largest α_cue " +
      "penalty in the panel (–0.072), the most brittle to friendly verbal cues. " +
      "Modest gain under data grounding (+0.012 ΔSE⁺), one of only two lower-half " +
      "models to improve.",
    avatar: null,
  },
  "llm_seed": {
    trajectory: "anchor-and-concede",
    safety: "holder",
    bottleneck: "unknown",
    tagline: "Anchors but concedes; cleanest agreement-rate profile.",
    diagnosis:
      "Anchor-and-concede style with the highest feasible agreement rate in the " +
      "panel (essentially never walks away from a feasible deal) and clean " +
      "no-deal discipline. The trade-off: lowest ZOPA share at closing among " +
      "agents that aren't refusers, so total surplus capture is below the " +
      "frontier despite excellent agreement calibration.",
    avatar: null,
  },
  "llm_openai_gpt-4o-mini": {
    trajectory: "refuser",
    safety: "rejector",
    bottleneck: "control",
    tagline: "Sub-frontier refuser; control-limited.",
    diagnosis:
      "Sub-frontier reference: AGR⁺ drops to 52% (refuses winnable deals), and the " +
      "oracle decomposition attributes 98% of its gap to control; neither " +
      "posterior injection nor type revelation recovers meaningful surplus. The " +
      "only agent where the buyer role outperforms the seller role on closing " +
      "surplus, and the only one whose α_inf does not amplify under data " +
      "grounding; its inference channel is too weak to be sharpened by structure.",
    avatar: null,
  },
};
