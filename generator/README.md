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
| SCRUM-169 · F-93 | Induce openings, voltage loss, phase drop, overload, low energy, inactivity, free fall, solar alarm | `--scenarios`, `src/scenarios.ts`, `test/scenarios.test.ts` |
| SCRUM-170 · F-94 | Openings separated by configurable gaps inside and outside the grouping window | `opening-sequence`, `--grouping-window` |
| (F-96, F-97, F-98) | Seeded, CLI only, circuits geographically compact | `--seed`, `src/cli.ts`, `src/network.ts` |

`--silent-devices` produces devices with no data in the last 10 hours (gray / inactive state,
F-36, F-37). Data gaps that resume later (F-95) can be made with an `inactivity` scenario with a
`durationMinutes`.

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
| `--scenarios` | JSON file with test scenarios, or `demo` for the built-in set | none |
| `--grouping-window` | Fault grouping window in minutes, used by `demo` and the expected results | 5 |

## Test scenarios (US9 · F-93, F-94)

Scenarios change a few devices on purpose, so the colour, fault and inactivity rules can be checked
on known data (use case CU-07). Everything else in the network stays healthy (green).

```bash
# Every scenario type at once, ending now, so the map shows them live
npm run generate -- --reset --scenarios demo --end "$(date -u +%Y-%m-%dT%H:%M:00Z)"

# Your own list
npm run generate -- --reset --scenarios my-scenarios.json
```

Before inserting, the CLI prints each scenario with its node, devices and **what the platform should
show**, for example:

```
opening-sequence   node 0000400009 at 2026-10-25T09:00:00.000Z
                   0000400009-R, 0000400009-S → expect: 4 min < 5 min window → grouped: 1 two-phase fault, node CRITICAL (red)
opening-sequence   node 0000500002 at 2026-10-25T09:00:00.000Z
                   0000500002-R, 0000500002-S → expect: 6 min >= 5 min window → not grouped: 2 faults (single-phase + single-phase), node CRITICAL (red)
```

| `type` | What it does to the data | Rows in `alarms` (Technical Annex §4.2) |
|---|---|---|
| `opening` | `phases` (1–3) fuses of one set open a few seconds apart: `fuse_state = 'Abierto'`, `is_fuse_alarm`, inclination ~115–135° | `131420` SET, and CLEAR when it closes |
| `two-branch-opening` | `phases: [a, b]` open on branches A and B of the same node (CU-07 2b: two independent faults, never one with the phases added) | as above |
| `opening-sequence` | Phases R, S (and T) open `gapsMinutes` apart, e.g. `[4]` or `[6]` around a 5-minute window (F-94) | as above |
| `voltage-loss` | Fuses stay closed but `is_voltage_present = false` (yellow node) | `131421` SET / CLEAR |
| `phase-drop` | `phases` (1–3) of a transformer drop to 80–95 V and their current to ~0 | `051421A`… SET / CLEAR |
| `overload` | Transformer load 115–135 %, currents scaled with it | none (telemetry only, Scope §3.2) |
| `low-energy` | `device: "falcon"` → `supercaps_per` 5–12 %; `"smac"` → `battery_per` 5–12 % | none (telemetry only) |
| `inactivity` | The device stops reporting; by default 10 h before the end (more than 9 h Falcon / 3 h SMAC). With `durationMinutes` it is a gap and the device reports again | none (derived from missing data) |
| `free-fall` | `is_free_fall_alarm = true`, inclination 70–90° | `131401` MSG |
| `solar-alarm` | `is_solar_panel_alarm = true`, `solar_panel = 0` | none (telemetry only) |

Optional fields for any scenario: `node` (otherwise a free node is picked from the seed), `set`
(`"A"`/`"B"`, with `node`), `at` (ISO instant inside the range; default 2 h before the end, 3 h for
sequences, 10 h for inactivity) and `durationMinutes` (default: still active at the end of the range).
Each automatic pick uses a different node, and nodes with `--silent-devices` are skipped.

```json
[
  { "type": "opening", "phases": 3 },
  { "type": "opening", "node": "0000100004", "phases": 2, "at": "2026-10-24T14:00:00Z", "durationMinutes": 45 },
  { "type": "opening-sequence", "gapsMinutes": [2, 8] },
  { "type": "phase-drop", "phases": 2 },
  { "type": "inactivity", "device": "smac", "at": "2026-10-24T08:00:00Z", "durationMinutes": 240 }
]
```

Grouping rule used for the expected results (Scope v6.0 §3.4): openings of the **same fuse set**
whose instants are separated by **less than** the window form one fault (a gap equal to the window
splits them). Each opening is compared with the previous one. The state changes also produce one
extra Falcon/SMAC record at that instant, as a real device would send an uplink.

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
inactivity query and that a second run with the same seed gives identical data. With `--scenarios
demo` loaded, they also check the `alarms` codes and that the backend's fuse-layer rule (US6) and
SMAC rule (F-37) give red, yellow and gray exactly to the scenario nodes.
