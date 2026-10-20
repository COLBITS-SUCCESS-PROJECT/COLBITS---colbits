import { DataSource } from 'typeorm';
import { applyNodeScope } from './scope-query.helper';

describe('applyNodeScope', () => {
  let dataSource: DataSource;

    beforeAll(() => {
    dataSource = new DataSource({
        type: 'postgres',
        entities: [],
        });
    });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

    const makeQuery = () =>
    dataSource
        .createQueryBuilder()
        .select('node.name')
        .from('public.nodes', 'node');

  it('does not restrict an authorized administrator', () => {
    const query = makeQuery();
    const result = applyNodeScope(query, 'node.name', {
      kind: 'unrestricted',
    });

    expect(result.getQuery()).not.toContain('1 = 0');
    expect(result.getQuery()).not.toContain('public.user_scopes');
  });

  it('returns no rows for an empty scope', () => {
    const query = makeQuery();
    const result = applyNodeScope(query, 'node.name', {
      kind: 'empty',
    });

    expect(result.getQuery()).toContain('1 = 0');
  });

  it('adds scope filtering for consultation users', () => {
    const query = makeQuery();
    const result = applyNodeScope(query, 'node.name', {
      kind: 'restricted',
      userId: 42,
    });

    const sql = result.getQuery();

    expect(sql).toContain('public.user_scopes');
    expect(sql).toContain("us.entity_type = 'node'");
    expect(sql).toContain("us.entity_type = 'circuit'");
    expect(sql).toContain("us.entity_type = 'substation'");
    expect(sql).toContain("us.entity_type = 'zone'");
    expect(sql).toContain('node.name IN');

    expect(result.getParameters()).toMatchObject({
      scopeUserId: 42,
    });
  });

  it('matches circuits, substations and zones by id, never by name', () => {
    const query = makeQuery();
    const sql = applyNodeScope(query, 'node.name', {
      kind: 'restricted',
      userId: 42,
    }).getQuery();

    expect(sql).toContain('us.entity_id = c.id::text');
    expect(sql).toContain('us.entity_id = s.id::text');
    expect(sql).toContain('us.entity_id = s.zone_id::text');
    expect(sql).not.toMatch(/us\.entity_id\s*=\s*(c|s|z)\.name/);
  });

  it('keeps the user ID parameterized', () => {
    const query = makeQuery();
    const result = applyNodeScope(query, 'node.name', {
      kind: 'restricted',
      userId: 123456,
    });

    expect(result.getQuery()).toContain(':scopeUserId');
    expect(result.getParameters().scopeUserId).toBe(123456);
  });
});
