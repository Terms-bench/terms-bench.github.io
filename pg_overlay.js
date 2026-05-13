/* Per-agent data-grounded SE+ snapshot for the bargaining-fingerprints
 * page. Sourced from final_results_product_grounded/<agent>/metrics.json
 * ("all" block). Currently a hand-curated mapping keyed by data.rows.id;
 * regenerate when product-grounded sweeps refresh.
 *
 * Used by fingerprints.js to annotate each card with the cross-suite
 * SE+ delta. Agents with no PG entry simply skip the annotation.
 */
window.TERMS_PG_OVERLAY = {
  // agent_id : { se_plus_pg: <data-grounded SE+, 0–1> }
  "llm_claude_aws_4_6":           { se_plus_pg: 0.7103 },
  "llm_claude_aws":               { se_plus_pg: 0.6813 },
  "llm_gemini_naci":              { se_plus_pg: 0.6707 },
  "llm_google_gemma-4-31b-it":    { se_plus_pg: 0.6486 },
  "llm_glm":                      { se_plus_pg: 0.6253 },
  "llm_gpt_5_5":                  { se_plus_pg: 0.6177 },
  "llm_deepseek":                 { se_plus_pg: 0.6126 },
  "llm_x-ai_grok-4.20":           { se_plus_pg: 0.5623 },
  "llm_kimi":                     { se_plus_pg: 0.4977 },
  "llm_qwen":                     { se_plus_pg: 0.4916 },
  "llm_openai_gpt-4o-mini":       { se_plus_pg: 0.0861 },
};
