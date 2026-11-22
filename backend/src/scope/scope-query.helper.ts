import { SelectQueryBuilder } from 'typeorm';
import { ScopeContext } from './scope.types';

/**
 * Applies node-level access restrictions directly in SQL.
 *
 * The supplied column must be a trusted SQL column reference
 * defined by the backend, never user-provided input.
 */
export function applyNodeScope<T extends object>(
  query: SelectQueryBuilder<T>,
  nodeColumn: string,
  scope: ScopeContext,
): SelectQueryBuilder<T> {
  if (scope.kind === 'empty') {
    return query.andWhere('1 = 0');
  }

  if (scope.kind === 'unrestricted') {
    return query;
  }

  const authorizedNodes = `
    SELECT n.name
    FROM public.nodes n
    JOIN public.circuits c
      ON c.id = n.circuit_id
    JOIN public.substations s
      ON s.id = c.substation_id
    WHERE EXISTS (
      SELECT 1
      FROM public.user_scopes us
      WHERE us.user_id = :scopeUserId
        AND (
          (us.entity_type = 'node'
            AND us.entity_id = n.name)

          OR (us.entity_type = 'circuit'
            AND us.entity_id = c.id::text)

          OR (us.entity_type = 'substation'
            AND us.entity_id = s.id::text)

          OR (us.entity_type = 'zone'
            AND us.entity_id = s.zone_id::text)

          OR (us.entity_type = 'device'
            AND (
              EXISTS (
                SELECT 1
                FROM public.fuses_sets fs
                JOIN public.fuses f ON f.fuses_set_id = fs.id
                WHERE fs.node_id = n.name
                  AND (f.current_hw_id = us.entity_id OR f.custom_id = us.entity_id)
              )
              OR EXISTS (
                SELECT 1
                FROM public.trafos t
                WHERE t.node_id = n.name
                  AND (t.current_hw_id = us.entity_id OR t.custom_id = us.entity_id)
              )
            ))
        )
    )
  `;

  return query
    .andWhere(`${nodeColumn} IN (${authorizedNodes})`)
    .setParameter('scopeUserId', scope.userId);
}
