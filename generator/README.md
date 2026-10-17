# COLBITS — synthetic data generator (US1)

Fills a **dev/test** PostgreSQL (or TimescaleDB) database with fake but realistic data that has
**exactly the same schema as Colbits' production database** (`create_tables.sql`), so the backend
and frontend can be developed and tested without the real data.

> Never point it at Colbits' database. Our platform only reads Colbits' data (NF-03).

| Jira | Requirement | Where |
|---|---|---|
| SCRUM-66 · F-90 | Same structure as the real schema | `sql/schema.sql`, `src/network.ts`, `test/database.test.ts` |
| SCRUM-67 · F-91 | Entity counts are parameters (incl. two-branch nodes) | `--zones --substations --circuits --nodes --two-branch-nodes` |
| SCRUM-68 · F-92 | Telemetry periodicity and time range are parameters | `--interval --days --start --end` |
| (F-96, F-97, F-98) | Seeded, CLI only, circuits geographically compact | `--seed`, `src/cli.ts`, `src/network.ts` |

Not in this version (US9, next sprint): induced faults, voltage loss, phase drops, low energy and
other scenarios (F-93, F-94). `--silent-devices` already produces devices with no data in the last
10 hours, so the gray / inactive state (F-36, F-37) can be tested today.

## Requirements

- Node.js **22.6+** (the team uses Node 24). No build step: Node runs the TypeScript directly.
- A PostgreSQL 15+ database (the `postgres` service in the root `docker-compose.yml` works).

## Run it

```bash
cd generator
npm ci

# Default network: 2 zones, 3 substations, 5 circuits, 50 nodes (5 with two branches),
# 30 % of nodes with a transformer, one record every 15 min for the last 7 days.
npm run generate -- --db postgres://postgres:adminpassword@localhost:5432/colbits --create-schema --reset

# Same thing, using DATABASE_URL from the environment
export DATABASE_URL=postgres://postgres:adminpassword@localhost:5432/colbits
npm run generate -- --create-schema --reset

# Bigger network, 30 days, a reading every 5 minutes, 6 devices that stopped reporting
npm run generate -- --reset --nodes 300 --circuits 12 --two-branch-nodes 30 --days 30 --interval 5 --silent-devices 6

# See what would be generated without touching any database
npm run generate -- --dry-run --nodes 500

npm run generate -- --help   # all options
```

| Option | Meaning | Default |
|---|---|---|
| `--zones` `--substations` `--circuits` `--nodes` | Totals for the whole network, spread evenly over the level above | 2 · 3 · 5 · 50 |
| `--two-branch-nodes` | Nodes with two fuse sets (branches A and B) | 5 |
| `--trafo-ratio` | Share of nodes that also have a transformer (SMAC) | 0.3 |
| `--two-phase-ratio` | Share of transformers that are two-phase | 0.2 |
| `--interval` | Minutes between two records of the same device | 15 |
| `--days` / `--start` / `--end` | Time range (`--end` defaults to today 00:00 UTC) | 7 days |
| `--silent-devices` | Devices with no records in the last 10 h | 0 |
| `--seed` | Same seed + same options = identical data | 42 |
| `--create-schema` | Create Colbits' tables if they do not exist (`sql/schema.sql`) | off |
| `--reset` | Delete all data in those tables before inserting | off |

## What it generates

- **Hierarchy** — `departments` (`north_district`, `south_district`) → `zones` → `substations`
  (`S/E NORTE 1`…) → `circuits` (`CTO 1`…; names repeat across substations, as in the real data)
  → `nodes` (10-character names, e.g. `0000100001`).
- **Field equipment** — one fuse set per node (`set_id` NULL) or two (`A`, `B`); three fuses per set
  (`R`, `S`, `T`), each with its own Falcon. Transformers `NODE-T1-3` / `NODE-T1-2`, each with a SMAC.
  Device `hw_id`s are 10 hex characters starting with `13` (Falcon) or `05` (SMAC).
- **Telemetry** — `falcon_values` and the three SMAC tables. Values follow a day/night cycle
  (solar panel, temperature, load). The three SMAC tables are a few seconds apart for the same
  reading, like the real LoRaWAN uplinks (RF-HIS-10). Two-phase transformers have no phase C values.
- `last_*` tables are **not** written by the generator: Colbits' own triggers fill them.
- Coordinates: each circuit is a short line of poles (~100 m apart) near its substation, so it looks
  like one compact area on the map (F-98).

## Tests

```bash
npm test                     # unit tests (no database needed)
TEST_DATABASE_URL=postgres://postgres:adminpassword@localhost:5432/colbits_test npm test   # + database tests
npm run typecheck
```

The database tests load the data into the real schema and check keys, triggers, the 9-hour
inactivity query and that a second run with the same seed gives identical data.
