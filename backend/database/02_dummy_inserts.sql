-- ============================================================================
-- DUMMY DATA — Legacy schema (matches create_tables.sql)
-- IoT Electrical Grid Monitoring Platform — Colbits / GDSD
--
-- PURPOSE: exploration only. This is NOT the synthetic data generator
-- required. This is a small, fixed, hand-written
-- dataset so students can see table structure and relationships.
--
-- All names, codes, IDs and coordinates are fictional.
--
-- NAMING CONVENTIONS USED HERE (per Colbits):
--   - node names: 10 characters, zero-padded where the example calls for it
--   - device hw_id: 10 hex characters, Falcon prefixed '13', SMAC prefixed '05'
--   - all recorded_at / created_at / updated_at values are timestamptz
--
-- This file does NOT insert into last_falcon_values, last_smac_vc_values,
-- last_smac_pw_values or last_smac_pf_values directly. Those four tables
-- are kept current automatically by the AFTER INSERT triggers defined in
-- create_tables.sql — inserting into them here as well would fight the
-- trigger and risk inconsistent "last known" rows.
--
-- Insert order respects foreign keys: geography -> devices -> field
-- infrastructure -> telemetry -> alarms.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Geographic / administrative hierarchy
-- ----------------------------------------------------------------------------

INSERT INTO departments (id, name) VALUES
  (1, 'north_district'),
  (2, 'south_district');

INSERT INTO zones (id, name, department_id) VALUES
  (1, 'North Ring 01', 1),
  (2, 'North Ring 02', 1),
  (3, 'South Ring 01', 2);

-- Substation names start with "S/E" per Colbits convention.
INSERT INTO substations (id, code, name, zone_id) VALUES
  (1, 'SUB-N-01', 'S/E NORTE 1', 1),
  (2, 'SUB-N-02', 'S/E NORTE 2', 2),
  (3, 'SUB-S-01', 'S/E SUR 1',   3);

-- Note: 'CTO 1' appears twice (id 1 and id 3) at two DIFFERENT substations.
-- This is valid: the UNIQUE constraint on circuits is (name, substation_id),
-- not on name alone. A query that filters by circuit name without also
-- scoping by substation will silently mix these two unrelated circuits.
INSERT INTO circuits (id, name, substation_id) VALUES
  (1, 'CTO 1', 1),
  (2, 'CTO 2', 1),
  (3, 'CTO 1', 2),
  (4, 'CTO CENTRO', 3);

-- 8 nodes, 10-character names. The first six are zero-padded; the last two
-- (south department) deliberately are not, so students see both styles.
-- Same identifier-pattern coverage as before:
--   0000100001  normal fuse set, legacy phase alphabet (I, C, D), no branch
--   0000100002  bifurcated node (branch A and B), current phase alphabet (R/S/T)
--   0000100003  legacy repetition on phase I (I1/I2) — out of scope for
--               processing logic, included only so the
--               identifier parser has something to recognize.
--   0000100004  transformer node, 3-phase SMAC
--   0000100005  transformer node, 2-phase SMAC
--   0000200001  normal fuse set, current alphabet, circuit 'CTO 1' at
--               substation 2 (NOT the same circuit as id 1, same name)
--   1000300001  south department, single phase monitored, no leading zeros
--   1000300002  south department, transformer node, no leading zeros
INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES
  ('0000100001', 1, 3.111111, -75.111111),
  ('0000100002', 1, 3.111222, -75.111222),
  ('0000100003', 1, 3.111333, -75.111333),
  ('0000100004', 2, 3.112111, -75.112111),
  ('0000100005', 2, 3.112222, -75.112222),
  ('0000200001', 3, 3.121111, -75.121111),
  ('1000300001', 4, 3.211111, -75.211111),
  ('1000300002', 4, 3.211222, -75.211222);

-- ----------------------------------------------------------------------------
-- 2. Devices (Falcon and SMAC hardware)
-- hw_id: 10 hex characters. Falcon prefixed '13', SMAC prefixed '05'
-- (matches the device-type prefix used inside alarms.event_code, see
-- Technical Annex section 4.2 — this is intentional, not a coincidence:
-- the first two characters of a hw_id and of an event_code mean the same
-- thing: device type). Letters A-F appear further in to show these are
-- genuinely hex strings, not zero-padded decimal counters.
-- ----------------------------------------------------------------------------

INSERT INTO devices (hw_id, device_type, latitude, longitude) VALUES
  ('1301000001', 'falcon', 3.111111, -75.111111),  -- node 0000100001, phase I
  ('1301000002', 'falcon', 3.111111, -75.111111),  -- node 0000100001, phase C
  ('1301000003', 'falcon', 3.111111, -75.111111),  -- node 0000100001, phase D
  ('1301000004', 'falcon', 3.111222, -75.111222),  -- node 0000100002, branch A-R
  ('1301000005', 'falcon', 3.111222, -75.111222),  -- node 0000100002, branch A-S
  ('1301000006', 'falcon', 3.111222, -75.111222),  -- node 0000100002, branch B-R
  ('1301000007', 'falcon', 3.111333, -75.111333),  -- node 0000100003, phase I1
  ('1301000008', 'falcon', 3.111333, -75.111333),  -- node 0000100003, phase I2
  ('1301000009', 'falcon', 3.111333, -75.111333),  -- node 0000100003, phase C
  ('130100000A', 'falcon', 3.111333, -75.111333),  -- node 0000100003, phase D
  ('130100000B', 'falcon', 3.121111, -75.121111),  -- node 0000200001, phase R
  ('130100000C', 'falcon', 3.121111, -75.121111),  -- node 0000200001, phase S
  ('130100000D', 'falcon', 3.121111, -75.121111),  -- node 0000200001, phase T
  ('130100000E', 'falcon', 3.211111, -75.211111),  -- node 1000300001, phase R
  ('0501000001', 'smac',   3.112111, -75.112111),  -- node 0000100004 (3-phase trafo)
  ('0501000002', 'smac',   3.112222, -75.112222),  -- node 0000100005 (2-phase trafo)
  ('0501000003', 'smac',   3.211222, -75.211222);  -- node 1000300002 (3-phase trafo)

-- ----------------------------------------------------------------------------
-- 3. Fuse sets and fuses
-- ----------------------------------------------------------------------------

INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES
  (1, '0000100001', NULL, 'EXT-FS-0001', 42);

INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES
  ('0000100001-I', 1, 'I', '1301000001'),
  ('0000100001-C', 1, 'C', '1301000002'),
  ('0000100001-D', 1, 'D', '1301000003');

-- Bifurcated node: two fuse sets. Branch A has 2 phases monitored, branch B
-- only 1 (partial installation — a realistic case worth being able to query).
INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES
  (2, '0000100002', 'A', 'EXT-FS-0002A', 18),
  (3, '0000100002', 'B', 'EXT-FS-0002B', 9);

INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES
  ('0000100002-A-R', 2, 'R', '1301000004'),
  ('0000100002-A-S', 2, 'S', '1301000005'),
  ('0000100002-B-R', 3, 'R', '1301000006');

-- Legacy repetition fuse set: phase I has two devices (I1, I2). Out of scope
-- for processing logic — included only so the custom_id parser
-- has a real example to strip the repetition digit from.
INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES
  (4, '0000100003', NULL, 'EXT-FS-0003', 27);

INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES
  ('0000100003-I1', 4, 'I', '1301000007'),
  ('0000100003-I2', 4, 'I', '1301000008'),
  ('0000100003-C',  4, 'C', '1301000009'),
  ('0000100003-D',  4, 'D', '130100000A');

INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES
  (5, '0000200001', NULL, 'EXT-FS-0006', 15);

INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES
  ('0000200001-R', 5, 'R', '130100000B'),
  ('0000200001-S', 5, 'S', '130100000C'),
  ('0000200001-T', 5, 'T', '130100000D');

INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES
  (6, '1000300001', NULL, 'EXT-FS-2001', 6);

INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES
  ('1000300001-R', 6, 'R', '130100000E');

-- ----------------------------------------------------------------------------
-- 4. Transformers (SMAC)
-- custom_id pattern (spec 3.6): node(10) + '-' + transformer_id + phase_count.
-- One 3-phase, one 2-phase, one 3-phase (south), to exercise RF-MAP-05.
-- ----------------------------------------------------------------------------

INSERT INTO trafos (custom_id, node_id, rated_kva, ext_ref_id, current_hw_id) VALUES
  ('0000100004-T1-3', '0000100004', 75.0,  'EXT-TR-0004', '0501000001'),
  ('0000100005-T1-2', '0000100005', 50.0,  'EXT-TR-0005', '0501000002'),
  ('1000300002-T1-3', '1000300002', 112.5, 'EXT-TR-2002', '0501000003');

-- ----------------------------------------------------------------------------
-- 5. Falcon telemetry
-- Deliberate edge cases:
--   - 1301000001: normal reading (closed, voltage present)
--   - 1301000004: fuse opened
--   - 1301000005: no voltage, fuse still closed (tests the yellow state)
--   - 1301000007 / 1301000008: both report independently (repetition case)
--   - 130100000C: low supercapacitor level
-- ----------------------------------------------------------------------------

INSERT INTO falcon_values
  (hw_id, custom_id, post, recorded_at, angle_incl, internal_temperature,
   supercaps_per, solar_panel, fuse_state, is_voltage_present, is_fuse_alarm,
   is_free_fall_alarm, is_solar_panel_alarm)
VALUES
  ('1301000001', '0000100001-I', '0000100001', '2026-09-01 08:00:00-05', 1.2, 28.4,
   96, 13.1, 'Cerrado', TRUE, FALSE, FALSE, FALSE),

  ('1301000004', '0000100002-A-R', '0000100002', '2026-09-01 08:05:00-05', 0.8, 29.1,
   91, 12.8, 'Abierto', TRUE, TRUE, FALSE, FALSE),

  ('1301000005', '0000100002-A-S', '0000100002', '2026-09-01 08:05:00-05', 0.9, 29.0,
   90, 12.9, 'Cerrado', FALSE, FALSE, FALSE, FALSE),

  ('1301000007', '0000100003-I1', '0000100003', '2026-09-01 08:10:00-05', 1.0, 27.5,
   88, 13.5, 'Cerrado', TRUE, FALSE, FALSE, FALSE),

  ('1301000008', '0000100003-I2', '0000100003', '2026-09-01 08:10:30-05', 1.0, 27.6,
   87, 13.4, 'Cerrado', TRUE, FALSE, FALSE, FALSE),

  ('130100000B', '0000200001-R', '0000200001', '2026-09-01 08:15:00-05', 0.5, 26.0,
   95, 14.0, 'Cerrado', TRUE, FALSE, FALSE, FALSE),

  ('130100000C', '0000200001-S', '0000200001', '2026-09-01 08:15:00-05', 0.5, 26.1,
   8,  14.0, 'Cerrado', TRUE, FALSE, FALSE, FALSE),  -- low supercaps: RF-ING-05

  ('130100000E', '1000300001-R', '1000300001', '2026-09-01 08:20:00-05', 0.3, 24.8,
   99, 15.2, 'Cerrado', TRUE, FALSE, FALSE, FALSE);

-- ----------------------------------------------------------------------------
-- 6. SMAC telemetry
-- Timestamps across smac_vc/pw/pf are deliberately offset by a few seconds
-- — not an error. See spec RF-HIS-10: these three tables are never
-- guaranteed to align exactly and must be joined with a tolerance.
-- ----------------------------------------------------------------------------

INSERT INTO smac_vc_values
  (hw_id, custom_id, recorded_at, internal_temperature, battery_per,
   va, vb, vc, ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent)
VALUES
  ('0501000001', '0000100004-T1-3', '2026-09-01 08:00:00-05', 31.2, 87,
   221.4, 220.9, 222.1, 12.1, 11.8, 12.4, 0.3, 1.8, 0.6, 71.4),
  ('0501000002', '0000100005-T1-2', '2026-09-01 08:00:05-05', 30.5, 62,
   220.1, 219.8, 0,     9.5,  9.3,  0,    0.2, 2.4, 0.9, 58.2);

INSERT INTO smac_pw_values
  (hw_id, custom_id, recorded_at,
   phase_a_active_power, phase_b_active_power, phase_c_active_power,
   phase_a_reactive_power, phase_b_reactive_power, phase_c_reactive_power,
   phase_a_apparent_power, phase_b_apparent_power)
VALUES
  ('0501000001', '0000100004-T1-3', '2026-09-01 08:00:02-05',
   2650.0, 2580.0, 2700.0, 410.0, 395.0, 420.0, 2680.0, 2610.0),
  ('0501000002', '0000100005-T1-2', '2026-09-01 08:00:08-05',
   2050.0, 2010.0, NULL,   300.0, 290.0, NULL,  2070.0, 2030.0);

INSERT INTO smac_pf_values
  (hw_id, custom_id, recorded_at,
   phase_c_apparent_power, phase_a_power_factor, phase_b_power_factor, phase_c_power_factor)
VALUES
  ('0501000001', '0000100004-T1-3', '2026-09-01 08:00:04-05', 2730.0, 0.98, 0.97, 0.98),
  ('0501000002', '0000100005-T1-2', '2026-09-01 08:00:10-05', NULL,   0.96, 0.95, NULL);

-- ----------------------------------------------------------------------------
-- 7. Alarms (device-reported events)
-- event_code patterns (Technical Annex section 4.2):
--   13xx20  Falcon fuse alarm           05xx20y  SMAC phase out of range
--   13xx21  Falcon voltage alarm        05xx21y  SMAC phase drop/recovery
--   13xx01  Falcon abnormal movement
-- Plus one deliberately UNRECOGNIZED event_code to test that the platform
-- surfaces it as unknown instead of silently mapping it to a known alert.
-- ----------------------------------------------------------------------------

INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at) VALUES
  ('1301000004', '0000100002-A-R', '131420', 'SET',   'Fusible abierto', '126.8°', '2026-09-01 08:05:00-05'),
  ('1301000004', '0000100002-A-R', '131420', 'CLEAR', 'Fusible cerrado', '17.39°', '2026-09-01 08:47:00-05'),

  ('1301000005', '0000100002-A-S', '131421', 'SET',   'Ausencia de tensión', NULL, '2026-09-01 08:05:00-05'),
  ('1301000005', '0000100002-A-S', '131421', 'CLEAR', 'Tensión normalizada', NULL, '2026-09-01 08:46:00-05'),

  ('130100000D', '0000200001-T', '131401', 'MSG', 'Movimiento anormal detectado', NULL, '2026-09-01 09:12:00-05'),

  ('0501000002', '0000100005-T1-2', '051420A', 'SET',   'Fase A fuera de rango', '198.4', '2026-09-01 08:30:00-05'),
  ('0501000002', '0000100005-T1-2', '051420A', 'CLEAR', 'Fase A dentro de rango', '219.9', '2026-09-01 08:41:00-05'),

  ('0501000002', '0000100005-T1-2', '051421C', 'SET',   'Caída de la fase C', '87.52', '2026-09-01 07:58:00-05'),
  ('0501000002', '0000100005-T1-2', '051421C', 'CLEAR', 'Recuperación de la fase C', '108.2', '2026-09-01 08:03:00-05'),

  -- Deliberately unrecognized event_code — matches no documented pattern.
  ('130100000E', '1000300001-R', '139999', 'SET', 'Código de evento no documentado', NULL, '2026-09-01 10:00:00-05');

-- ============================================================================
-- END OF FILE
-- 8 nodes, 17 devices, 6 fuse sets, 11 fuses, 3 transformers, 8 Falcon
-- readings, 2+2+2 SMAC readings, 9 alarm events.
-- ============================================================================
