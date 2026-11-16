# Client Clarifications and Derived Decisions — Data Schema

**Project:** Colbits IoT Grid Monitoring Platform
**Version:** 1.0 · 7 November 2026
**Status:** Colbits answers are confirmed. Team decisions are proposed and must be agreed by the team before implementation.
**Update 9 November 2026:** the code was checked against this document and the corrections listed in section 7 were made.
**Update 11 November 2026:** Colbits answered the TD-04 follow-up (CL-24): a failed phase always reports a value. TD-04 is now resolved with the simple variant, the latest reading only (section 7.2).
**Update 14 November 2026:** SCRUM-245 added free fall, solar-panel failure and overload / imbalance to `GET /faults`. What is implemented, what stays open and how it performs is in section 7.4.

## Purpose

This document records what Colbits clarified about the database schema on 3 November 2026, and what the team derived from those answers. It complements the Requirements Specification v2.0 and supersedes any earlier assumption about units, formulas, thresholds and source precedence.

## Sources

| Source | Content |
| --- | --- |
| `create_tables.sql`, `dummy_inserts.sql` | Schema and sample data shared by Colbits |
| Colbits *Scope, Requirements and Use Cases Specification* v6.0 | Alert origins (3.2), inactivity thresholds (3.3), identifiers (3.5, 3.6) |
| Colbits *Technical Annex — Data Model, Identifiers and UI Mockups* (file v1.1) | Data model (4, 4.1), `event_code` structure (4.2) |
| Colbits answers, 3 Nov 2026 | Comments on the shared question document (Katerine Lotero) |
| Team question report, 28 Oct 2026 | Questions Q1–Q25, numbering used below |

## Status labels

| Label | Meaning |
| --- | --- |
| **Confirmed** | Stated by Colbits in its answers |
| **Documented** | Stated in the Specification v6.0 or the Technical Annex |
| **Team decision** | Derived by the team from the above; open to review |
| **Out of scope** | Excluded by Colbits or by the Specification |

---

## 1. Confirmed by Colbits (3 Nov 2026)

### 1.1 Source precedence

| ID | Clarification | Affects |
| --- | --- | --- |
| CL-01 | When the `alarms` table and telemetry disagree on the same condition, `alarms` takes priority. (Q25) | F-15 to F-18, F-47, F-59 to F-63 |

### 1.2 Units and meaning of SMAC columns

| ID | Column | Clarification | Affects |
| --- | --- | --- | --- |
| CL-02 | `va`, `vb`, `vc` | Volts, phase-to-neutral voltage. (Q1) | F-72 |
| CL-03 | `ia`, `ib`, `ic`, `in_` | Amperes; `in_` is the neutral current. (Q2) | F-72 |
| CL-04 | `*_active_power`, `*_reactive_power`, `*_apparent_power` | W, VAr and VA. Values may be shown scaled (kW, kVAr, kVA). (Q3) | F-72 |
| CL-05 | `load_percent` | `(total apparent power ÷ rated power in VA) × 100`. Overload is above **90 %**, configurable. (Q5) | F-47, F-71, F-83 |
| CL-06 | `cuf_percent`, `vuf_percent` | No reference threshold exists yet; set a predefined value that can be changed later. (Q4) | F-47, F-71 |
| CL-07 | Non-existent phase | Stored as `NULL`. A two-phase transformer can have any pair of phases (A-B, B-C, A-C). (Q6) | F-23 |
| CL-08 | SMAC phases A, B, C | Have **no** correspondence with fuse phases R, S, T. (Q7) | F-24, F-72 |

### 1.3 Falcon columns

| ID | Column | Clarification | Affects |
| --- | --- | --- | --- |
| CL-09 | `solar_panel` | Measures voltage (volts). (Q8) | F-72 |
| CL-10 | `is_solar_panel_alarm` | Set by the device when the panel has been without voltage for several hours. (Q8) | F-47 |
| CL-11 | `supercaps_per`, `battery_per` | Percentages. Recommended low-energy threshold: **30 %**. (Q9) | F-44, F-45, NF-08 |
| CL-12 | `angle_incl` | The opening range is configured on each device; the platform only checks open/closed. (Q10) | F-72 |
| CL-13 | `fuse_state` | Only two values: `Abierto` or `Cerrado`. (Q11) | F-15 to F-18 |
| CL-14 | `is_free_fall_alarm` and event `13xx01` | Same condition; both appear together. (Q12) | F-47 |

### 1.4 Identifiers and catalog

| ID | Item | Clarification | Affects |
| --- | --- | --- | --- |
| CL-15 | `post` | Always equals the first 10 characters of `custom_id`. (Q13) | — |
| CL-16 | `nodes.name` | Opaque identifier; may contain letters; encodes nothing. (Q14) | F-34 |
| CL-17 | `client_count` | Clients downstream of the fuse set. Empty means unknown, not zero. (Q15) | F-29, F-55, F-57 |
| CL-18 | Phase alphabet I, C, D | Means left, center, right. Discarded; the platform uses R, S, T only. Fuses with I, C or D phases in the real database are **out of scope**. | F-49, F-67 |

### 1.5 Alarms and timestamps

| ID | Item | Clarification | Affects |
| --- | --- | --- | --- |
| CL-19 | SMAC channel in `05xx20y` / `05xx21y` | `y` maps 1 = A, 2 = B, 3 = C. (Q17) | F-19 to F-23 |
| CL-20 | `alarms.value` on `05xx20y` | Volts. (Q19) | — |
| CL-21 | `recorded_at` | Assigned by the **server** on receipt. Telemetry generally does not arrive out of order. (Q20) | F-46 |
| CL-22 | SMAC alignment tolerance | Initial value **2 minutes**. (Q20) | F-73, NF-12 |

### 1.6 Schema

| ID | Item | Clarification |
| --- | --- | --- |
| CL-23 | `idx_falcon_values_custom` and `idx_falcon_values_custom_id` | Identical; one may be omitted. (Q23) |

### 1.7 Follow-up (11 Nov 2026, Katerine Lotero)

| ID | Item | Clarification | Affects |
| --- | --- | --- | --- |
| CL-24 | `va`, `vb`, `vc` of a phase that lost voltage | A failed phase **always reports a value**, never `NULL`. So `NULL` only means the phase does not exist, and the simplification proposed by the team is accepted. (Follow-up to Q6) | TD-04, TD-05, F-23 |

---

## 2. Resolved by the documentation

| ID | Item | Resolution | Source |
| --- | --- | --- | --- |
| DOC-01 | `xx` in `event_code` | Firmware version (e.g. `14` = v1.4); ignored by the platform. | Annex 4.2 |
| DOC-02 | `phase_c_apparent_power` in `smac_pf_values` | Split caused by LoRaWAN payload size limits. | Annex 4 |
| DOC-03 | `current_hw_id` | Holds only the active device; replacement history must live in a platform table. | Annex 4.1 |
| DOC-04 | Telemetry and `alarms` without foreign keys to `devices` | Intentional; linked through `hw_id`. | Annex 4, figure 4 |
| DOC-05 | Alarm management states | Only `SET` / `CLEAR` / `MSG`; acknowledgement or closure would go in platform tables. | Annex 4.1; Specification SUP-03 |
| DOC-06 | Inactivity thresholds | Falcon 9 h, SMAC 3 h, configurable. | Specification 3.3; NF-07 |
| DOC-07 | Repetition digit (`I1`, `I2`) | Legacy pattern; specific handling out of scope. | Specification 3.5; Annex 3.2 |
| DOC-08 | `ext_ref_id` | Masked column name; the real copy uses a different name. | Annex 2.1 |

---

## 3. Team decisions (derived)

### 3.1 State and alert logic

| ID | Decision | Rationale | Risk |
| --- | --- | --- | --- |
| TD-01 | Fuse and voltage state come from the latest `13xx20` / `13xx21` event. Telemetry (`fuse_state`, `is_voltage_present`) is used **only** for a fuse that has no event of that type yet. | Applies CL-01. Without a fallback, a fuse that has never changed could not be confirmed closed, so F-18 could never show it green. | Low |
| TD-02 | `13xx01` is accepted as `SET` or `MSG`, case-insensitively. Its alert resolves at the first record with `is_free_fall_alarm = false`. | The event has no `CLEAR`; CL-14 makes the flag the same condition. Q18 was not answered. | Low |
| TD-03 | The event parser accepts the SMAC channel as a digit (`1`–`3`) or a letter (`A`–`C`). | CL-19 confirms digits; the sample data uses letters. | None |
| TD-04 | A transformer's existing phases are the voltage columns that are not `NULL`. Proposed safer variant: channels non-`NULL` at least once in the last 7 days. **Resolved (11 Nov 2026, CL-24): the latest reading only. The window stays as a setting (`SMAC_PHASE_WINDOW_DAYS`, default 0). It was provisionally 7 days on 9 Nov. See 7.2.** | Applies CL-07 and F-23. | Low since CL-24: a failed phase always reports a value, so `NULL` is never a failure |
| TD-05 | Drop events on a channel the transformer does not have are ignored and logged. | F-23: a missing phase must never count as down. | Low |
| TD-06 | Event codes that match no documented pattern are logged and kept out of the alert list. | F-47 allows no other alert types. | Low |
| TD-07 | SMAC inactivity uses the latest `recorded_at` across `last_smac_vc_values`, `last_smac_pw_values` and `last_smac_pf_values`. | Specification 3.3 does not say which table; a device that sends any part is communicating. | Low |
| TD-08 | `load_percent`, `vuf_percent` and `cuf_percent` are read as stored and compared with thresholds; the platform never recomputes them. | They arrive calculated; NF-03 keeps the platform read-only. | None |

### 3.2 Initial thresholds

All values are configurable. TD-09 and TD-10 need a new flexibility requirement (section 4).

| ID | Threshold | Initial value | Source |
| --- | --- | --- | --- |
| — | Falcon inactivity | 9 h | DOC-06 |
| — | SMAC inactivity | 3 h | DOC-06 |
| — | Falcon low energy (`supercaps_per`) | 30 % | CL-11 |
| TD-11 | SMAC low energy (`battery_per`) | 30 % | CL-11, applied to SMAC by the team |
| — | Overload (`load_percent`) | 90 % | CL-05 |
| TD-09 | Voltage imbalance (`vuf_percent`) | 2 % | Team: voltage-unbalance limit of EN 50160 |
| TD-10 | Current imbalance (`cuf_percent`) | **To be agreed** | Team: no common standard exists |
| — | SMAC alignment tolerance | 2 min | CL-22 |
| — | Fault grouping window | 5 min | Specification 3.4; NF-09 |

### 3.3 Display

| ID | Decision |
| --- | --- |
| TD-12 | `angle_incl` is shown in degrees in the node view and never used to decide state (CL-12). |
| TD-13 | `alarms.value` is shown as text; `05xx21y` values are labeled as volts by analogy with CL-20. `value` never decides state. |
| TD-14 | An empty `client_count` is shown as "unknown", never as zero (CL-17). |
| TD-15 | SMAC phases (A, B, C) and fuse phases (R, S, T) are shown in separate layers and never combined (CL-08). |

### 3.4 Our copy of the schema

| ID | Change | Reason |
| --- | --- | --- |
| TD-16 | Remove the trailing comma after `'smac'` in `device_type_enum`. | Syntax error; the script stops there. |
| TD-17 | When reading `devices`, tolerate `device_type` values other than `falcon` and `smac`. | Another type was likely removed during anonymization (Specification SUP-04). |
| TD-18 | Prefix tables with `public.` inside the `update_last_*` trigger functions. | The script sets an empty `search_path`, so the triggers fail in the same session. |
| TD-19 | Create only one of the two duplicate `falcon_values(custom_id)` indexes. | CL-23. |
| TD-20 | The correct totals of `dummy_inserts.sql` are 14 fuses and 10 alarm events (its closing comment says 11 and 9). | Counted from the file. |
| TD-25 | In `dummy_inserts.sql`, the missing phase C of the two-phase transformer `0000100005-T1-2` is stored as `NULL` in `va`/`vc` and `ic`, not `0` (added 9 Nov 2026). | CL-07 says a missing phase is `NULL`; with TD-04 a `0` would make phase C look present. |

### 3.5 Synthetic data generator

| ID | Decision | Affects |
| --- | --- | --- |
| TD-21 | Missing phases are generated as `NULL` in all three SMAC tables, never `0`. | F-90 |
| TD-22 | Two-phase transformers use varying phase pairs (A-B, B-C, A-C). | F-90, F-93 |
| TD-23 | `load_percent` is generated with the CL-05 formula, so it stays consistent with the generated powers and `rated_kva`. | F-90, F-93 |
| TD-24 | `recorded_at` is generated in order; SMAC parts of one reading are generated within the 2-minute tolerance. | F-73, F-92 |

---

## 4. Changes required in other documents

### 4.1 Requirements Specification v2.0

| Item | Current text | Change |
| --- | --- | --- |
| F-46, rationale | "Data can reach the database late; calculations must reflect when things happened." | `recorded_at` is the server's receipt time (CL-21). Reword the rationale: calculations use the stored timestamp, not the time of the query. |
| F-73, acceptance criterion | Uses a 30-second tolerance in the example | State that the initial tolerance is 2 minutes (CL-22). The example can stay as a test case. |
| NF-12, rationale | No initial value | Add "initial value 2 minutes (Colbits, 3 Nov 2026)". |
| New NF (Flexibility) | Missing | "The system shall let the overload and imbalance thresholds be changed without modifying code." Source: CL-05, CL-06. |
| F-49, acceptance criterion | Repetition digit counts as one phase | Keep. Repetition sets use the discarded I/C/D alphabet (CL-18), so this case only appears in out-of-scope data. |

### 4.2 Requirements analysis (`Analisis de requisitos V2.md`)

| Section | Change |
| --- | --- |
| 2.8, overload KPI | Overload is above 90 % (CL-05), not above 100 % of `rated_kva`. |
| 2.8, load bands | The <50 / 50–80 / >80 % bands are a prototype proposal; align the top band with the 90 % threshold. |
| 5.7, 5.8 | Already outdated by the client review of F-56 and F-58 (alarm panel counters and filters); follow v2.0. |

---

## 5. Out of scope

| Item | Source |
| --- | --- |
| Fuses with legacy phases I, C, D | CL-18 |
| Specific handling of repetition fuse sets (`I1`, `I2`) | DOC-07 |
| Tampering alert (no column or event code in the schema) | Specification 3.2; F-47 |
| Manual alarm acknowledgement, closure or reopening | Specification 4.5; DOC-05 |

## 6. Open items

| Item | Status | Owner |
| --- | --- | --- |
| Initial `cuf_percent` threshold (TD-10) | Not set | Team |
| TD-04 variant: latest reading or last 7 days | Resolved (11 Nov 2026, CL-24): latest reading only; the window stays a setting (7.2) | Team |
| Legacy I, C, D phases in the fault classification (CL-18) | Kept as they are (7.2) | Team |
| Q18: does `13xx01` arrive as `SET` or `MSG`? | Unanswered; covered by TD-02 | No action needed |
| Hours without voltage before `is_solar_panel_alarm` fires | Not given; evaluated by the device | No action needed |
| Device alerts (free fall, solar panel, overload / imbalance): derive on every request or store them (7.4) | Derived on every request; storing is undecided | Team |
| Resolved episodes of the device alerts in `GET /faults/resolved` | Not available (nothing is stored); depends on the previous item | Team |
| Cost of the overload / imbalance and solar-panel queries on large histories (7.4) | Known limitation, accepted for SCRUM-245 (14 Nov 2026); not optimized. To revisit with the persistence decision. | Team |

## 7. Implementation record (9 November 2026)

The backend, the seed SQL, the synthetic generator and the frontend were checked against sections 1 to 4. This section records what was found, what was changed and what stays open.

### 7.1 Corrections made

Every change in code, SQL and configuration is marked with a comment that starts with `#CORRECTION`, followed by the rule and the date, for example `// #CORRECTION CL-01/TD-01 (2026-11-09): …` (`--` in SQL, `#` in `.env` and YAML). To list them all: `git grep -n "#CORRECTION"`.

| Rule | Problem found | Correction | Files |
| --- | --- | --- | --- |
| CL-01, TD-01 | The fuse layer of the map used telemetry only (`fuse_state`, `is_voltage_present`). The seed fuse `0000100002-A-R` showed red on the map while its alarm history had closed it, and the fault list did not show it. | Fuse and voltage state come from the latest `13xx20` / `13xx21` event of each fuse (by `custom_id`; SET wins at the same instant, as in the fault list). Telemetry is used only for a fuse with no event of that type. Inactivity still comes from the last Falcon record. | `backend/src/nodes/fuse-state.ts`, `backend/src/nodes/nodes.service.ts` |
| CL-07, TD-04 | Existing phases came from the `-2` / `-3` suffix of `custom_id`, assuming a two-phase transformer has A and B. On a B-C transformer a drop on C was ignored and a drop on A counted. | Existing phases are the voltage columns (`va`, `vb`, `vc`) that were not `NULL` at least once within `SMAC_PHASE_WINDOW_DAYS` up to the SMAC's latest reading (default 0 since 11 Nov: the latest reading only; it was 7 on 9 Nov). Without any voltage reading, the identifier suffix is the fallback. | `backend/src/nodes/transformer-state.ts`, `backend/src/nodes/nodes.service.ts` |
| TD-05 | A drop event on a missing phase was ignored but not logged. | It is ignored and logged once per transformer and channel (at most 100 per process). | `backend/src/nodes/nodes.service.ts` |
| CL-13, CL-01 | `FaultsService.getActiveFaults()` filtered `fuse_state = 'OPEN'` (the real value is `Abierto`) and read telemetry instead of `alarms`. Nothing used it. | Removed. The active fault list is `ActiveFaultsService`. | `backend/src/faults/faults.service.ts` |
| TD-21 | The generator wrote `vc = 0` and `ic = 0` for the missing phase. | The missing phase is `NULL` in all three SMAC tables. | `generator/src/telemetry.ts` |
| TD-22 | Every generated two-phase transformer was A-B. | Each two-phase transformer gets A-B, B-C or A-C from its own seeded stream, so no other generated value changes. Phase-drop scenarios drop phases the transformer has. | `generator/src/network.ts`, `generator/src/scenarios.ts` |
| TD-23 | `load_percent` came from the load curve, not from the powers. | `load_percent` = total apparent power ÷ (`rated_kva` × 1000) × 100. Normal operation stays below 90 %. | `generator/src/telemetry.ts` |
| CL-05 | The overload scenario said "> 100 %". | It says "above the 90 % overload threshold". | `generator/src/scenarios.ts` |
| TD-18 | Trigger functions wrote `last_*` tables without schema under an empty `search_path`. | Prefixed with `public.`. | `backend/database/01_create_tables.sql` |
| TD-19 | Both identical `falcon_values(custom_id)` indexes were created. | Only `idx_falcon_values_custom_id` is created. | `backend/database/01_create_tables.sql` |
| TD-20 | The seed's closing comment said 11 fuses and 9 alarms. | 14 fuses and 10 alarm events. | `backend/database/02_dummy_inserts.sql` |
| TD-25 | The seed stored the missing phase C of `0000100005-T1-2` as `0`. | Stored as `NULL`. | `backend/database/02_dummy_inserts.sql` |
| Section 4.1 | The Requirements Specification v2.0 still had the old texts. | F-46 rationale, F-73 criterion (2 min), NF-12 initial value, and new NF-22 (overload and imbalance thresholds). NF-22 is numbered after NF-21 so existing references keep their numbers. | `COLBITS_Requirements_Specification_v2.md` |

New setting: `SMAC_PHASE_WINDOW_DAYS` (default 0, latest reading only; changed from 7 on 11 Nov 2026), added next to `FALCON_INACTIVITY_HOURS` and `SMAC_INACTIVITY_HOURS` in `.env.example`, `backend/.env.example`, both `docker-compose.yml` files and the e2e runner.

Tests added or updated: fuse layer with alarms vs. telemetry (unit and e2e), B-C and A-C transformers, a NULL phase versus a failed phase that still reports a value, and the window setting (unit and e2e), generator NULL phases, phase pairs and the `load_percent` formula.

### 7.2 Decisions that may change

Each can change later; the table says how. TD-04 was provisional on 9 Nov 2026 and was confirmed by Colbits on 11 Nov 2026 (CL-24).

| Item | Decision | Why | How to change it |
| --- | --- | --- | --- |
| TD-04: latest reading or last 7 days | **Latest reading only** (`SMAC_PHASE_WINDOW_DAYS=0`). It was provisionally 7 days (9 Nov 2026). | Colbits confirmed on 11 Nov 2026 (CL-24) that a failed phase always reports a value, so `NULL` only means the phase does not exist and a longer window is not needed. The window stays as a setting, so a longer one is still possible. | Configuration only: set `SMAC_PHASE_WINDOW_DAYS` to a number of days, counted back from the SMAC's latest reading. No code change. |
| CL-18: legacy phases I, C, D | **Kept as they are.** The fault classification still accepts the I/C/D alphabet as its own alphabet, never mixed with or mapped to R/S/T. | Colbits put fuses with I, C, D phases out of scope. They are only in the seed (nodes `0000100001`, `0000100003`), so nothing new is built for them and nothing that works today is removed. | A code change in `backend/src/faults/fault-classification.ts` if the team later decides to exclude them. |

### 7.3 Still open

| Item | Status |
| --- | --- |
| Alert types of F-47 not yet in the fault list | Low energy (CL-11, TD-11) and device inactivity. Free fall (TD-02), solar panel, overload and imbalance are listed since SCRUM-245 (7.4). |
| Thresholds 90 % (CL-05), 2 % (TD-09), `cuf_percent` (TD-10) | 90 % and 2 % are settings since SCRUM-245 (NF-22, 7.4). TD-10 still has no value, so the current-imbalance condition is off. The 30 % thresholds (CL-11, TD-11) are outside SCRUM-245. |
| SMAC alignment tolerance of 2 minutes (CL-22, NF-12) | No alignment of the three SMAC tables yet (history view, F-73). |
| `angle_incl` in the node view (TD-12) | Not exposed by the node-detail endpoint yet. |
| Section 4.2 (`Analisis de requisitos V2.md`) | Not in this repository; to be updated where the document is kept. |

### 7.4 Device alerts in the fault list (SCRUM-245, 14 November 2026)

`GET /faults` now also lists `FREE_FALL`, `SOLAR_PANEL_FAILURE` and `OVERLOAD_UNBALANCE`. The rules are in `backend/src/faults/device-alerts.ts` (pure reference, unit tested) and the SQL in `backend/src/faults/device-alert-queries.ts`; an e2e test checks that the SQL agrees with the reference on seeded random data.

**Implemented (complete for SCRUM-245)**

| Alert | Rule | Starts | Ends |
| --- | --- | --- | --- |
| `FREE_FALL` (one per fuse) | An `alarms` row with code `13xx01` and type `SET` or `MSG` (TD-02, CL-14). The flag alone never raises it (CL-01). | First such event after the last `is_free_fall_alarm = false` reading | The first reading **strictly later** than the event with `is_free_fall_alarm = false`. A `CLEAR` is ignored. An event at the same instant as a false reading keeps the alert. |
| `SOLAR_PANEL_FAILURE` (one per fuse) | The flag is the alert (CL-10): last non-null `is_solar_panel_alarm` is true. | First true reading after the last false one | The next reading with the flag false |
| `OVERLOAD_UNBALANCE` (one per transformer) | Any of `load_percent` above `SMAC_OVERLOAD_PERCENT` (90, CL-05), `vuf_percent` above `SMAC_VOLTAGE_UNBALANCE_PERCENT` (2, TD-09), `cuf_percent` above `SMAC_CURRENT_UNBALANCE_PERCENT` (unset, TD-10). Strictly above; values read as stored (TD-08). | First reading with any condition active, while none was | When no condition is active. Overlapping conditions never restart it, so `started_at` and the `id` are stable. |

- A `NULL` value changes nothing: it neither raises nor resolves an alert. `NaN` and infinite values count as no measurement.
- Thresholds are settings read on every request (NF-22): with `SMAC_OVERLOAD_PERCENT=80` a transformer at 85 % raises the alert and one at exactly 80 % does not (e2e test). A condition without a threshold is never active.
- Scope is node-level, as for every other alert. Device-level scope (F-10) depends on SCRUM-249 and is not claimed here.
- The two new response fields, `conditions` and `transformer_load`, are `null` on every other alert type.
- Counters of F-58 still count only the four original types. Ordering (F-57) is unchanged: clients, then age; the new types have no client count and no weight of their own.

**Open team decisions**

| Item | State |
| --- | --- |
| TD-10: `cuf_percent` threshold | No value. The condition is disabled, the API logs a warning that names TD-10 at start-up, and `CURRENT_UNBALANCE` never appears. CL-06 is **not** met until the team agrees a value (a setting, no code change). |
| Persistence: derive on every request (current) or store alert episodes | Nothing is stored. Storing would give stable history and remove the cost described under known performance limitations, but needs a schema change and a job; it is the team's call. |
| Resolved alerts | `GET /faults/resolved` returns no device alert. A free fall, solar failure or overload that ends just leaves the active list. Needs the persistence decision first. |
| Device-level scope (F-10) | Scope is the whole node, as for every alert: a user who sees a node sees all its device alerts. Device-level scope depends on SCRUM-249; full F-10 compliance is not claimed. |
| Free-fall `CLEAR` and the same-instant tie | `CLEAR` is ignored because no document defines it (Q18 unanswered); the tie rule (an event at the same instant as a false reading wins) is the team's choice. Both to confirm. |
| Weight of the new types in the severity order (NF-11) | Not set (they weigh 0). |
| Threshold changes | The history is evaluated again with the new value, so an episode's start and `id` can move; enabling TD-10 does the same. |

**Known performance limitations (accepted for SCRUM-245, 14 November 2026)**

The team decided not to optimize these queries inside SCRUM-245, whose goal is the alert behavior. They are documented here as known limitations. No index, schema change or persistence was added, and none is needed for the behavior to be correct.

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on PostgreSQL 15 (Docker, `shared_buffers` 512 MB, default settings, warm cache, synthetic data): 2,000 transformers with 11.3 M readings (1,500 with 30 days, 400 with 90 days, 100 with 365 days, one reading every 15 minutes), 6,300 fuses with 7.7 M Falcon readings and 1.2 M alarms. Times are for the whole query. "JIT on" is the PostgreSQL default; whether production uses it is not known.

| Query and situation | JIT on | JIT off |
| --- | --- | --- |
| Overload, no transformer over a limit | about 1 s | 0.05 s |
| Overload, 1 transformer over a limit | 1.2 s (30 days of history) to 3.9 s (365 days) | not measured |
| Overload, 100 transformers over a limit (5 % of the network) | 6 to 7 s | 5.5 s |
| Overload, the transformers of one circuit all over a limit | about 17 s | not measured |
| Overload, 100 over a limit, 365 days of history each | 29 to 30 s | not measured |
| Overload, 400 over a limit, 90 days each | 26 to 30 s | not measured |
| Overload, 1,500 over a limit, 30 days each | 30 to 39 s | not measured |
| Overload, all 2,000 over a limit | 73 to 80 s | not measured |
| Solar panel, no fuse failing | 0.8 s | 0.08 s |
| Solar panel, 315 fuses failing for the last 2 h | 0.7 s | not measured |
| Solar panel, 100 fuses failing for 365 days | 7.4 s | not measured |
| Free fall, 6,300 fuses (none, or 20 % active) | 0.4 to 0.7 s | 0.4 s |
| Free fall, one circuit | 0.03 s | 0.03 s |

- **Overload / imbalance.** The history of each transformer that is over a limit is read to find when its episode started. The planner reads the readings table in index order up to the last such transformer and then sorts four times (about 5 to 10 microseconds per reading), so the cost grows with the table size and the history length, not only with the number of transformers over a limit. A network where many transformers are over a limit for a long time is slow.
- **JIT.** With the default settings PostgreSQL compiles the overload and solar queries, which adds about 0.7 to 1 s to every request even when nothing is over a limit. The same queries take 0.05 to 0.08 s with JIT off.
- **Solar panel.** A fuse that has been failing for a long time costs about 35 ms per fuse for each 365 days of history.
- **Free fall.** No limitation seen at this size.
- **What was not done.** No query optimization, no index and no stored episodes. A rewrite of the overload history read that was tried in a scratch copy helped the one-transformer case and made the many-transformer case worse, so it is not recommended without more work. Switching JIT off for these queries, restructuring the history read, or storing the episodes (the persistence decision above) are the options if the cost matters in production.
- **Limits of the measurements.** One synthetic, healthy-by-construction data set on a developer machine; production sizes, settings and hardware were not available.

## Appendix: question numbering

Q-numbers follow the team's question report of 28 October 2026. The copy sent to Colbits was numbered differently: Q25 was first, and Q16, Q21, Q22 and Q24 were not sent (they were resolved by the team as DOC-08, TD-16 to TD-18 and TD-20).
