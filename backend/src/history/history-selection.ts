import type { HistoryFilterType } from './history-params';

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): which of the selected scope elements exist and overlap the
 * user's assigned scope.
 *
 * Why "overlap" is consistent with applyNodeScope (scope-query.helper.ts): a node is in the user's
 * scope when some assignment is that node, its circuit, its substation, its zone, or a device of
 * it. An in-scope node under a selected element therefore has an assignment and the element on the
 * same root path of the hierarchy (zone > substation > circuit > node), which is what the
 * `overlaps_scope` test below checks: one of the two is an ancestor-or-self of the other. An
 * assigned element with no nodes still overlaps (the answer is then 200 with zeros, not 404).
 *
 * Parameters: $1 integer[] zone ids, $2 integer[] substation ids, $3 integer[] circuit ids,
 * $4 text[] node names, $5 integer user id. One row per selected element that EXISTS: an unknown
 * element produces no row. A `device` assignment counts as its node (same matching as
 * applyNodeScope: fuses `current_hw_id` or `custom_id`, transformers `current_hw_id` or
 * `custom_id`). Entity ids are stored as text: zone, substation and circuit as `id::text`, node as
 * its name.
 */
export const SELECTION_OVERLAP_SQL = `
WITH selected AS (
  SELECT 'zone'::text AS type, z.id::text AS id,
         z.id AS zone_id, NULL::integer AS substation_id, NULL::integer AS circuit_id, NULL::text AS node_name
  FROM public.zones z WHERE z.id = ANY($1::integer[])
  UNION ALL
  SELECT 'substation', s.id::text, s.zone_id, s.id, NULL, NULL
  FROM public.substations s WHERE s.id = ANY($2::integer[])
  UNION ALL
  SELECT 'circuit', c.id::text, s.zone_id, s.id, c.id, NULL
  FROM public.circuits c JOIN public.substations s ON s.id = c.substation_id
  WHERE c.id = ANY($3::integer[])
  UNION ALL
  SELECT 'node', n.name, s.zone_id, s.id, c.id, n.name
  FROM public.nodes n
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  WHERE n.name = ANY($4::text[])
), assigned AS (
  SELECT z.id AS zone_id, NULL::integer AS substation_id, NULL::integer AS circuit_id, NULL::text AS node_name
  FROM public.user_scopes us JOIN public.zones z ON us.entity_id = z.id::text
  WHERE us.user_id = $5 AND us.entity_type = 'zone'
  UNION ALL
  SELECT s.zone_id, s.id, NULL, NULL
  FROM public.user_scopes us JOIN public.substations s ON us.entity_id = s.id::text
  WHERE us.user_id = $5 AND us.entity_type = 'substation'
  UNION ALL
  SELECT s.zone_id, s.id, c.id, NULL
  FROM public.user_scopes us
  JOIN public.circuits c ON us.entity_id = c.id::text
  JOIN public.substations s ON s.id = c.substation_id
  WHERE us.user_id = $5 AND us.entity_type = 'circuit'
  UNION ALL
  SELECT s.zone_id, s.id, c.id, n.name
  FROM public.user_scopes us
  JOIN public.nodes n ON (
       (us.entity_type = 'node' AND us.entity_id = n.name)
    OR (us.entity_type = 'device' AND (
         EXISTS (SELECT 1 FROM public.fuses_sets fs JOIN public.fuses f ON f.fuses_set_id = fs.id
                 WHERE fs.node_id = n.name AND (f.current_hw_id = us.entity_id OR f.custom_id = us.entity_id))
      OR EXISTS (SELECT 1 FROM public.trafos t
                 WHERE t.node_id = n.name AND (t.current_hw_id = us.entity_id OR t.custom_id = us.entity_id)))))
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  WHERE us.user_id = $5
)
SELECT sel.type, sel.id,
       EXISTS (
         SELECT 1 FROM assigned a
         WHERE a.zone_id = sel.zone_id
           AND (a.substation_id IS NULL OR sel.substation_id IS NULL OR a.substation_id = sel.substation_id)
           AND (a.circuit_id IS NULL OR sel.circuit_id IS NULL OR a.circuit_id = sel.circuit_id)
           AND (a.node_name IS NULL OR sel.node_name IS NULL OR a.node_name = sel.node_name)
       ) AS overlaps_scope
FROM selected sel
`;

export interface SelectionOverlapRow {
  type: HistoryFilterType;
  /** Numeric id as text for zone, substation and circuit; the node name for node. */
  id: string;
  overlaps_scope: boolean;
}

/**
 * Device-level authorization of the historical reads (F-10, F-08). The shared node scope
 * (applyNodeScope) lets a device assignment in through its whole node; the historical counts must
 * not include the other devices of that node. For a restricted user with at least one `device`
 * assignment, this returns the fuses (fuses.custom_id) of the given nodes the user may see:
 *   - every fuse of a node covered by a node, circuit, substation or zone assignment;
 *   - otherwise only the fuses matched by a device assignment, with the same matching as
 *     applyNodeScope (fuses.current_hw_id or fuses.custom_id). A transformer (SMAC) assignment
 *     authorizes no fuse, so it adds no Falcon event.
 * A user without device assignments gets has_device_scope = false and fuses = NULL: node-level scope
 * is then exact and nothing is restricted further (the list is not even built).
 *
 * Parameters: $1 text[] node names (already inside the user's node scope), $2 integer user id.
 */
export const DEVICE_SCOPED_FUSES_SQL = `
  WITH device_scope AS (
    SELECT EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = $2 AND us.entity_type = 'device'
    ) AS present
  )
  SELECT ds.present AS has_device_scope,
         CASE WHEN ds.present THEN COALESCE((
           SELECT array_agg(f.custom_id ORDER BY f.custom_id)
           FROM public.fuses_sets fs
           JOIN public.fuses f ON f.fuses_set_id = fs.id
           JOIN public.nodes n ON n.name = fs.node_id
           JOIN public.circuits c ON c.id = n.circuit_id
           JOIN public.substations s ON s.id = c.substation_id
           WHERE fs.node_id = ANY($1::text[])
             AND EXISTS (
               SELECT 1 FROM public.user_scopes us
               WHERE us.user_id = $2
                 AND ((us.entity_type = 'node' AND us.entity_id = n.name)
                   OR (us.entity_type = 'circuit' AND us.entity_id = c.id::text)
                   OR (us.entity_type = 'substation' AND us.entity_id = s.id::text)
                   OR (us.entity_type = 'zone' AND us.entity_id = s.zone_id::text)
                   OR (us.entity_type = 'device'
                       AND (f.current_hw_id = us.entity_id OR f.custom_id = us.entity_id)))
             )
         ), ARRAY[]::text[]) END AS fuses
  FROM device_scope ds
`;

export interface DeviceScopedFusesRow {
  has_device_scope: boolean;
  /** NULL without device assignments; otherwise the authorized fuses (possibly empty). */
  fuses: string[] | null;
}
