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
| SCRUM-171 · F-95 | Data gaps that trigger inactivity and the gray state (RF-GEN-06, CU-07 2c) | `inactivity` + `durationMinutes`, `expectInactivity` in `src/scenarios.ts`, `test/data-gaps.test.ts` |
| (F-96, F-97, F-98) | Seeded, CLI only, circuits geographically compact | `--seed`, `src/cli.ts`, `src/network.ts` |

`--silent-devices` produces devices with no data in the last 10 hours (gray / inactive state,
F-36, F-37). For controlled data gaps, still silent or resumed, see
[Data gaps and inactivity](#data-gaps-and-inactivity-f-95).

## Requirements

- Node.js **22.6+** (the team uses Node 24). No build step: Node runs the TypeScript directly.
- A PostgreSQL 15+ database (the `postgres` service in the root `docker-compose.yml` works).

## Run it

`--reset` deletes all data in Colbits' tables of the target database. Use it only on a dedicated,
disposable development or test database, never on a shared one.

```bash
cd generator
npm ci

# See what would be generated without touching any database
npm run generate -- --dry-run --nodes 500

# Default network: 2 zones, 3 substations, 5 circuits, 50 nodes (5 with two branches),
# 30 % of nodes with a transformer, one record every 15 min for the last 7 days.
# Only into a dedicated, disposable database; the URL is a placeholder for your own.
export DATABASE_URL='<url of your disposable dev/test database>'
npm run generate -- --create-schema --reset

# Same thing, with the URL as an option instead of DATABASE_URL
npm run generate -- --db "$DATABASE_URL" --create-schema --reset

# Bigger network, 30 days, a reading every 5 minutes, 6 devices that stopped reporting (same disposable database)
npm run generate -- --reset --nodes 300 --circuits 12 --two-branch-nodes 30 --days 30 --interval 5 --silent-devices 6

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
| `--reset` | Delete all data in those tables before inserting (dedicated, disposable databases only) | off |
| `--scenarios` | JSON file with test scenarios, or `demo` for the built-in set | none |
| `--grouping-window` | Fault grouping window in minutes, used by `demo` and the expected results | 5 |

Environment: `DATABASE_URL` is used when `--db` is omitted. `FALCON_INACTIVITY_HOURS` and
`SMAC_INACTIVITY_HOURS` are the backend's inactivity thresholds (default 9 and 3). They only change
the expected results the CLI prints, never the data (see
[Data gaps and inactivity](#data-gaps-and-inactivity-f-95)).

## Test scenarios (US9 · F-93, F-94, F-95)

Scenarios change a few devices on purpose, so the colour, fault and inactivity rules can be checked
on known data (use case CU-07). Everything else in the network stays healthy (green), as long as
`--end` is recent (see [Use a recent `--end`](#use-a-recent---end)).

```bash
# 1. Every scenario type at once, ending now: print them and their expected results, no database touched
npm run generate -- --dry-run --scenarios demo --end "$(date -u +%Y-%m-%dT%H:%M:00Z)"

# 2. Load them, only into a dedicated, disposable test database (--reset deletes all its Colbits data)
npm run generate -- --reset --scenarios demo --end "$(date -u +%Y-%m-%dT%H:%M:00Z)"

# Your own list
npm run generate -- --dry-run --scenarios my-scenarios.json
```

The `demo` set holds every RF-GEN-04 scenario, both senses of F-94, CU-07 2b and, for F-95, one
Falcon data gap that resumes before the end. Windows PowerShell commands are in
[Data gaps and inactivity](#data-gaps-and-inactivity-f-95).

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
| `inactivity` | `device` (`falcon` / `smac`) stops reporting, by default 10 h before the end (more than 9 h Falcon / 3 h SMAC). Without `durationMinutes`, or if the gap reaches the end, it stays silent. With `durationMinutes` the device reports again when the gap ends (F-95, see below) | none (derived from missing data) |
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

## Data gaps and inactivity (F-95)

F-95 (RF-GEN-06, CU-07 2c) uses the `inactivity` scenario: it removes a device's records over a span
of time, so the backend's inactivity rule and the gray node colour can be tested on known data.
Same JSON as above; no new type or field.

| | Ongoing silence | Resumed gap |
|---|---|---|
| JSON | `{ "type": "inactivity", "device": "falcon" }` | `{ "type": "inactivity", "device": "falcon", "durationMinutes": 570 }` |
| Data | No records from `at` to the end of the range | No records in `[at, at + durationMinutes)`, one record exactly when the gap ends, then the usual period |
| Backend, now | Inactive, once the silence is over the threshold | Active again: the inactivity is history only |
| In `demo` | One Falcon and one SMAC, silent for the last 10 h | One Falcon, silent for 9.5 h from 10 h before the end, back 30 min before the end |

A gap that ends at or after the end of the range is an ongoing silence. Without `at`, a gap starts
10 h before `--end`, so this file works with any recent `--end`:

```json
[
  { "type": "inactivity", "device": "falcon" },
  { "type": "inactivity", "device": "falcon", "durationMinutes": 570 },
  { "type": "inactivity", "device": "smac", "durationMinutes": 240 }
]
```

### Thresholds (RF-ING-01, NF-07)

The generator uses the backend's rule. A Falcon is inactive when its last record is **more than**
9 h old. A SMAC is inactive when the newest record across its three tables is more than 3 h old. A
device with no record at all is inactive; one exactly at the threshold is still active.

The thresholds are read from `FALCON_INACTIVITY_HOURS` and `SMAC_INACTIVITY_HOURS`, with the
backend's rule: a number above 0, otherwise the default. Set the same values as the backend you
test against. They only change the expected results; the generated data stays the same.

### Expected results: now and during the gap

For each `inactivity` scenario the CLI prints the device's state **at the end of the range** and,
for a resumed gap, whether it was inactive **during the gap**. Each result is one of three:

- **inactive**: definitely inactive;
- **active**: definitely active;
- **borderline**: too close to the threshold to tell.

Why borderline exists: each device reports on its own offset, so its last record before a gap is
only known to within one `--interval`, plus up to 8 s for a SMAC (its three tables arrive a few
seconds apart). When the threshold falls inside that margin, the CLI says "borderline" instead of
guessing. Keep a gap at least one interval away from the threshold when you need a definite result.
The same results are available to code and tests as `ResolvedScenario.inactivity` (`atEnd`,
`duringGap`, `resumesAt`, `turnsInactive`).

**Current versus historical.** Only the current state reaches the map. A resumed gap was inactive in
the past, but the backend keeps no inactivity history yet (inactivity alarms and inactivity time,
US17 / US24, are not built). Once the device reports again, nothing marks its node.

### What the map shows

Inactivity is a device state, not the node colour. The colour also depends on everything else on
the node:

- **Fuse layer** (`fuse_state`, RF-MAP-03): CRITICAL (a fuse open) > WARNING (a fuse without
  voltage) > INACTIVE (a Falcon inactive) > NORMAL.
  - A silent Falcon turns its node gray only if no fuse on that node is open or without voltage.
  - After a resumed gap the node is green only if nothing else applies to it either.
- **Transformers:** an inactive SMAC appears as `smac_inactive: true` in `GET /nodes`, and as an
  inactive transformer in the node detail.
  - The transformer-layer colour (`transformer_state`, US7 / F-21) is pending until it is merged.
    Until then the map has no gray for it.

**No alarm events.** Inactivity comes from missing records (Scope §3.2), and the current generator
writes no inactivity alarm event to `alarms`. The current `GET /faults` lists active fuse-opening
faults only, so inactivity does not appear there.

### Use a recent `--end`

The backend compares the last records with its own clock (`now()`), not with `--end`. The default
`--end` is today 00:00 UTC. About 3 h later every SMAC looks inactive; about 9 h later every Falcon
does, and the whole map turns gray. Generate with `--end` set to the current time just before you
test, and generate again when the data gets old.

Bash:

```bash
cd generator
END="$(date -u +%Y-%m-%dT%H:%M:00Z)"
# Only if the backend uses other thresholds than 9 h / 3 h:
# export FALCON_INACTIVITY_HOURS=9 SMAC_INACTIVITY_HOURS=3

# 1. Preview: scenarios and expected results, no database touched
npm run generate -- --dry-run --scenarios demo --end "$END"

# 2. Load, only into a dedicated, disposable test database: --reset deletes all its Colbits data
export DATABASE_URL='<url of your disposable test database>'
npm run generate -- --create-schema --reset --scenarios demo --end "$END"
```

Windows PowerShell:

```powershell
cd generator
$end = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:00Z')
# Only if the backend uses other thresholds than 9 h / 3 h:
# $env:FALCON_INACTIVITY_HOURS = '9'; $env:SMAC_INACTIVITY_HOURS = '3'

# 1. Preview: scenarios and expected results, no database touched
npm run generate -- --dry-run --scenarios demo --end $end

# 2. Load, only into a dedicated, disposable test database: --reset deletes all its Colbits data
$env:DATABASE_URL = '<url of your disposable test database>'
npm run generate -- --create-schema --reset --scenarios demo --end $end
```

### Check the results with the backend

The backend must read the database you loaded. Every route below needs a header
`Authorization: Bearer <access_token>`. You get the token from `POST /auth/login` with
`{ "username", "password" }` of your own account. A user sees only the nodes in their scope.
The Swagger UI is at `/api/docs` on the backend (port 3000 by default).

| Route | What to check |
|---|---|
| `GET /nodes` | `nodes[].fuse_state` (`INACTIVE` = gray on the fuse layer) and `nodes[].smac_inactive` |
| `GET /nodes/{name}/detail` | `fuse_sets[].fuses[].inactive` and `recorded_at` per Falcon; `transformers[].inactive` and `recorded_at` (newest of the three SMAC tables) |
| `GET /faults` | No entry for inactivity (active fuse-opening faults only) |

`GET /device/inactivity-status` only judges a number of hours you pass in. It does not read the
generated records, so it cannot confirm a gap.

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
npm run typecheck

# + database tests. They empty Colbits' tables first: dedicated, disposable test database only.
TEST_DATABASE_URL='<url of your disposable test database>' npm test
```

The database tests load the data into the real schema and check keys, triggers, the 9-hour
inactivity query and that a second run with the same seed gives identical data. With `--scenarios
demo` loaded, they also check the `alarms` codes and that the backend's fuse-layer rule (US6) and
SMAC rule (F-37) give red, yellow and gray exactly to the scenario nodes. For F-95 they check that
the demo's data gaps reach the latest-value tables through Colbits' triggers: an ongoing Falcon and
SMAC silence keep the last record before the gap, the resumed Falcon gap has no rows inside it and
a record when it ends, and no gap writes an `alarms` row.

`test/data-gaps.test.ts` (F-95) needs no database. It applies the backend's inactivity rule to the
generated rows and checks the expected results against it: ongoing silence, resumed gaps, exact
thresholds, several `--interval` values, configured thresholds, and no change to other devices or
scenarios. The unit tests use the default thresholds (9 h / 3 h) whatever the shell exports.
