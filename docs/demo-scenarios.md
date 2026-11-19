# Demo scenarios (US31 · F-100)

Backend of the demo scenario panel (SCRUM-254): an administrator makes a device report a fault or a condition, and the map, the alarm list and the device lists react through their normal rules. The service is `backend/src/scenarios/` (SCRUM-252 fuse, voltage and phase actions; SCRUM-253 the rest and the safeguards). Swagger documents both endpoints.

A scenario writes synthetic telemetry, so it only ever writes to a designated demo database built from synthetic data. It never runs on Colbits' data.

## Where scenarios can run

`POST /scenarios` answers 403 and writes nothing, and `GET /scenarios` reports `enabled: false`, unless all three hold:

| Condition | Set by |
|---|---|
| `DEMO_SCENARIOS_ENABLED=true` | The environment. Off by default and in production. |
| `DEMO_SCENARIOS_DATABASE` equals the database the API is connected to (`current_database()`) | The environment. Unset in production. |
| `public.synthetic_dataset` has a row naming that database | Only the synthetic loaders: `backend/database/02_dummy_inserts.sql` and the generator, in the same transaction as their data. A failed or partial generation leaves none; a copied database does not inherit it. |

The database checks run inside the transaction that writes. The marker shows that our loaders built the database; it is not proof that the data is synthetic (a hand-written marker or real data restored into a marked database defeats it). The platform's database account is not read-only (NF-03); that is outside SCRUM-253.

| Environment | State | Before using scenarios |
|---|---|---|
| Local (`docker-compose.yml`) | On: `DEMO_SCENARIOS_DATABASE` defaults to `colbits` | A volume created before SCRUM-253 has no marker and no `demo_silenced_devices`: recreate it or run the generator once. |
| Render staging (`render.yaml`, `colbits-api-dev`) | On: `colbits_dev` | Confirm the live database name; the setting reaches staging after a release or by hand; the next data refresh writes the marker. See `docs/deploy-render.md`. |
| Render production | Off | Nothing: neither setting is set. |
| Beta (`deploy/docker-compose.yml`) | On: `DEMO_SCENARIOS_ENABLED: 'true'` and `DEMO_SCENARIOS_DATABASE: colbits` (since 16 Nov) | The backend regenerates test data older than `DATA_REFRESH_HOURS` when it starts, and that refresh writes the marker. |

## API

- `GET /scenarios` → `{ enabled, actions: [{ action, target, channel_required, effect }] }`. The 22 actions come in a fixed order, each start right before its stop.
- `POST /scenarios` with `{ action, target, channel? }`: `target` is the fuse or transformer `custom_id` (`target: FUSE` or `TRANSFORMER` in the list); `channel` (A, B, C) only for the four phase actions. Answers 201 with `{ action, node, target, channel, hw_id, event_code, event_type, recorded_at, effect }`.
- `event_code` / `event_type` are null for the actions that write no event; `FREE_FALL` gives `13xx01` / `MSG`. `recorded_at` is the database time of the write (for `SILENCE_*`, of the silence).
- 400 invalid body or target; 401 no token; 403 not an administrator or not a demo database; 404 unknown target or outside the scope; 409 nothing would change or another scenario would be broken (the message says which). Nothing is written on any error.

## The 22 actions

| Start / stop | Target | Writes | Shown in |
|---|---|---|---|
| `OPEN_FUSE` / `CLOSE_FUSE` | FUSE | Reading + `13xx20` SET / CLEAR | Map, `GET /faults` (FUSE_OPENING) |
| `CUT_VOLTAGE` / `RESTORE_VOLTAGE` | FUSE | Reading + `13xx21` SET / CLEAR | Map, `GET /faults` (NO_VOLTAGE) |
| `DROP_PHASE` / `RESTORE_PHASE` (channel) | TRANSFORMER | Reading + `05xx21y` SET / CLEAR | Map, `GET /faults` (PHASE_LOSS) |
| `PHASE_OUT_OF_RANGE` / `PHASE_IN_RANGE` (channel) | TRANSFORMER | Reading (250 V / 220 V on that channel) + `05xx20y` SET / CLEAR; the transformer state does not change | `GET /faults` (PHASE_OUT_OF_RANGE), counter *phase out of range* |
| `DRAIN_SUPERCAPS` / `RECHARGE_SUPERCAPS` | FUSE | `supercaps_per` below / back at or above `FALCON_LOW_ENERGY_PERCENT` | `GET /device/low-energy` |
| `FREE_FALL` / `END_FREE_FALL` | FUSE | `is_free_fall_alarm` true + `13xx01` MSG / a later reading with it false | `GET /faults` (FREE_FALL) |
| `SOLAR_PANEL_ALARM` / `CLEAR_SOLAR_PANEL_ALARM` | FUSE | `is_solar_panel_alarm` true, `solar_panel` 0 / false, earlier value | `GET /faults` (SOLAR_PANEL_FAILURE) |
| `DRAIN_BATTERY` / `RECHARGE_BATTERY` | TRANSFORMER | `battery_per` below / back at or above `SMAC_LOW_ENERGY_PERCENT` | `GET /device/low-energy` |
| `START_OVERLOAD` / `END_OVERLOAD` | TRANSFORMER | `load_percent` above / back at or below `SMAC_OVERLOAD_PERCENT` | `GET /faults` (OVERLOAD_UNBALANCE) |
| `SILENCE_FALCON` / `RESUME_FALCON` | FUSE | See below | `GET /device/inactive`, map (gray) |
| `SILENCE_SMAC` / `RESUME_SMAC` | TRANSFORMER | See below | `GET /device/inactive`, map (gray) |

Values come from the configured thresholds, never fixed ones; a stop writes back the device's value from before the condition when it has one.

## Rules every action follows

- **One request at a time per device**: a transaction-level lock on the device; its state is read, checked and written under that lock.
- **Timestamps**: the database clock, strictly after the device's latest record. A device with a record more than 1 s ahead of the clock is refused (409).
- **Own fields only**: each action copies the device's latest reading and changes only its own fields, so conditions on one device are independent (stopping an overload never clears an imbalance; free fall never moves the fuse angle).
- **No repeat**: a start while its condition is on, or a stop while it is off, is refused (409). Each condition is read with the rule of the alert that shows it (SCRUM-245, F-44, F-45).

## Inactivity: SILENCE and RESUME

- `SILENCE_*` removes the device's readings after `database time − inactivity threshold − 1 minute` (`FALCON_INACTIVITY_HOURS` 9, `SMAC_INACTIVITY_HOURS` 3; for a SMAC in its three tables), rebuilds its latest-value rows from what is left, and records the silence in `public.demo_silenced_devices`, all in one transaction. Alarm events are never removed.
- It is refused (409, nothing written) when the device is already inactive, has no reading before the cutoff to resume from (for a SMAC, in `smac_vc_values`), has alarm events after the cutoff, has another scenario active, or when the removal would bring back a condition or change the transformer's OVERLOAD_UNBALANCE alert (id, start or conditions).
- While a silence holds, every other action on that device is refused (409, "run RESUME_* first"). A silence stops holding as soon as the device has any record after its cutoff. A device that is only stale (no silence of its own) accepts every other action, as before SCRUM-253 (its first reading makes it report again); `SILENCE_*` on it is refused as already silent, and `RESUME_*` works.
- `RESUME_*` removes the record and writes one reading copied from the latest one: the device is active again and the silence stays in its history as an inactivity period.
- `demo_silenced_devices` is created by the same synthetic loaders as the marker and emptied by every generator run. Without it, `SILENCE_*` is refused and the other actions work.

## Known limitations

- SILENCE removes up to threshold + 1 minute of history of that one synthetic device; anything derived from it changes accordingly (inactivity periods, a low-energy `since`, resolved episodes of `GET /faults/resolved` inside that window).
- Restore values come from the device's history: a device whose only earlier values come from scenarios gets those back.
- A threshold changed between a start and its stop applies at the stop. Raising the inactivity threshold after a SILENCE keeps the device silenced until `RESUME_*`.
- `SILENCE_SMAC` reads SCRUM-245's overload query for the transformer's node twice (about 4 ms, or 26 ms for 30 days of imbalanced history, on a 150-transformer test dataset).

## Notes for the frontend (SCRUM-254)

- The panel needs no change: every action has `target` FUSE or TRANSFORMER and only the phase actions (`DROP_PHASE`, `RESTORE_PHASE`, `PHASE_OUT_OF_RANGE`, `PHASE_IN_RANGE`) need a channel. Without a label (`dashboard:scenarios.action.<CODE>` / `scenarios.result.<CODE>`) a button shows its code and `effect`.
- `event_code` / `event_type` can be null, and `event_type` can be `MSG`: the frontend `ScenarioResultDto` allows both (the mapper does not read them).
- Every 409 is shown as "already in that state"; the backend message is more specific (for example "run RESUME_FALCON first").
- After a 403 the panel asks `GET /scenarios` again and hides itself, which matches `enabled`. After an action it asks the map, the node detail, the fault list with the resolved alarms, the inactive devices and the low-energy alerts (active and resolved) again at once. Every other user sees the change with the 15 s refresh; the NF-01 check of all 22 actions is in `frontend/docs/specs/dashboard/SCRUM-218.md` §8 (SCRUM-255).
