/**
 * SMAC inactivity (US5 · F-37, Scope v6.0 §3.3 and RF-ING-01).
 * A SMAC is inactive when it has no record, or when its most recent record — across
 * last_smac_vc_values, last_smac_pw_values and last_smac_pf_values, which arrive on separate
 * LoRaWAN uplinks — is older than the threshold.
 */

/** Default SMAC inactivity threshold (F-37); overridable with SMAC_INACTIVITY_HOURS (NF-07). */
export const DEFAULT_SMAC_INACTIVITY_HOURS = 3;

/**
 * One row per node with transformers: whether any SMAC monitoring them is inactive
 * (nodes → trafos → last_smac_*_values). A transformer without a device or without records counts as inactive.
 * GREATEST ignores NULLs, so the newest of the three tables wins; it is NULL only when none has a record.
 */
export const SMAC_INACTIVITY_SQL = `
  SELECT t.node_id,
         BOOL_OR(s.last_seen IS NULL
                 OR s.last_seen < now() - $2 * interval '1 hour') AS any_inactive
  FROM public.trafos t
  CROSS JOIN LATERAL (
    SELECT GREATEST(
             (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = t.current_hw_id),
             (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = t.current_hw_id),
             (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = t.current_hw_id)
           ) AS last_seen
  ) s
  WHERE t.node_id = ANY($1)
  GROUP BY t.node_id
`;
