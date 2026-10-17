--
-- COLBITS production schema (copy of create_tables.sql shared by Colbits, Oct 2, 2026).
-- Used only to create an EMPTY dev/test database for the synthetic data generator.
--
-- Changes from the original file (structure is otherwise identical):
--   * removed the trailing comma in device_type_enum ('smac',), which made the original fail to run
--   * removed the session SET statements (search_path = '' etc.)
--   * CREATE ... IF NOT EXISTS / DO blocks so the file can be applied twice safely
--

DO $$ BEGIN
    CREATE TYPE public.department_name AS ENUM ('north_district', 'south_district');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.device_type_enum AS ENUM ('falcon', 'smac');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_last_falcon_values() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO last_falcon_values (
        hw_id, custom_id, post, recorded_at, angle_incl, internal_temperature,
        supercaps_per, solar_panel, fuse_state, is_voltage_present,
        is_fuse_alarm, is_free_fall_alarm, is_solar_panel_alarm
    )
    VALUES (
        NEW.hw_id, NEW.custom_id, NEW.post, NEW.recorded_at, NEW.angle_incl, NEW.internal_temperature,
        NEW.supercaps_per, NEW.solar_panel, NEW.fuse_state, NEW.is_voltage_present,
        NEW.is_fuse_alarm, NEW.is_free_fall_alarm, NEW.is_solar_panel_alarm
    )
    ON CONFLICT (hw_id) DO UPDATE SET
        custom_id = EXCLUDED.custom_id,
        post = EXCLUDED.post,
        recorded_at = EXCLUDED.recorded_at,
        angle_incl = EXCLUDED.angle_incl,
        internal_temperature = EXCLUDED.internal_temperature,
        supercaps_per = EXCLUDED.supercaps_per,
        solar_panel = EXCLUDED.solar_panel,
        fuse_state = EXCLUDED.fuse_state,
        is_voltage_present = EXCLUDED.is_voltage_present,
        is_fuse_alarm = EXCLUDED.is_fuse_alarm,
        is_free_fall_alarm = EXCLUDED.is_free_fall_alarm,
        is_solar_panel_alarm = EXCLUDED.is_solar_panel_alarm
    WHERE EXCLUDED.recorded_at > last_falcon_values.recorded_at;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_smac_vc_values() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO last_smac_vc_values (
        hw_id, custom_id, recorded_at, internal_temperature, battery_per,
        va, vb, vc, ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent
    )
    VALUES (
        NEW.hw_id, NEW.custom_id, NEW.recorded_at, NEW.internal_temperature, NEW.battery_per,
        NEW.va, NEW.vb, NEW.vc, NEW.ia, NEW.ib, NEW.ic, NEW.in_, NEW.cuf_percent, NEW.vuf_percent, NEW.load_percent
    )
    ON CONFLICT (hw_id) DO UPDATE SET
        custom_id = EXCLUDED.custom_id,
        recorded_at = EXCLUDED.recorded_at,
        internal_temperature = EXCLUDED.internal_temperature,
        battery_per = EXCLUDED.battery_per,
        va = EXCLUDED.va,
        vb = EXCLUDED.vb,
        vc = EXCLUDED.vc,
        ia = EXCLUDED.ia,
        ib = EXCLUDED.ib,
        ic = EXCLUDED.ic,
        in_ = EXCLUDED.in_,
        cuf_percent = EXCLUDED.cuf_percent,
        vuf_percent = EXCLUDED.vuf_percent,
        load_percent = EXCLUDED.load_percent
    WHERE EXCLUDED.recorded_at > last_smac_vc_values.recorded_at;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_smac_pw_values() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO last_smac_pw_values (
        hw_id, custom_id, recorded_at,
        phase_a_active_power, phase_b_active_power, phase_c_active_power,
        phase_a_reactive_power, phase_b_reactive_power, phase_c_reactive_power,
        phase_a_apparent_power, phase_b_apparent_power
    )
    VALUES (
        NEW.hw_id, NEW.custom_id, NEW.recorded_at,
        NEW.phase_a_active_power, NEW.phase_b_active_power, NEW.phase_c_active_power,
        NEW.phase_a_reactive_power, NEW.phase_b_reactive_power, NEW.phase_c_reactive_power,
        NEW.phase_a_apparent_power, NEW.phase_b_apparent_power
    )
    ON CONFLICT (hw_id) DO UPDATE SET
        custom_id = EXCLUDED.custom_id,
        recorded_at = EXCLUDED.recorded_at,
        phase_a_active_power = EXCLUDED.phase_a_active_power,
        phase_b_active_power = EXCLUDED.phase_b_active_power,
        phase_c_active_power = EXCLUDED.phase_c_active_power,
        phase_a_reactive_power = EXCLUDED.phase_a_reactive_power,
        phase_b_reactive_power = EXCLUDED.phase_b_reactive_power,
        phase_c_reactive_power = EXCLUDED.phase_c_reactive_power,
        phase_a_apparent_power = EXCLUDED.phase_a_apparent_power,
        phase_b_apparent_power = EXCLUDED.phase_b_apparent_power
    WHERE EXCLUDED.recorded_at > last_smac_pw_values.recorded_at;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_smac_pf_values() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO last_smac_pf_values (
        hw_id, custom_id, recorded_at,
        phase_c_apparent_power, phase_a_power_factor, phase_b_power_factor, phase_c_power_factor
    )
    VALUES (
        NEW.hw_id, NEW.custom_id, NEW.recorded_at,
        NEW.phase_c_apparent_power, NEW.phase_a_power_factor, NEW.phase_b_power_factor, NEW.phase_c_power_factor
    )
    ON CONFLICT (hw_id) DO UPDATE SET
        custom_id = EXCLUDED.custom_id,
        recorded_at = EXCLUDED.recorded_at,
        phase_c_apparent_power = EXCLUDED.phase_c_apparent_power,
        phase_a_power_factor = EXCLUDED.phase_a_power_factor,
        phase_b_power_factor = EXCLUDED.phase_b_power_factor,
        phase_c_power_factor = EXCLUDED.phase_c_power_factor
    WHERE EXCLUDED.recorded_at > last_smac_pf_values.recorded_at;

    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.departments (
    id integer NOT NULL,
    name public.department_name NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT departments_pkey PRIMARY KEY (id),
    CONSTRAINT departments_name_key UNIQUE (name)
);
CREATE SEQUENCE IF NOT EXISTS public.departments_id_seq AS integer OWNED BY public.departments.id;
ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);

CREATE TABLE IF NOT EXISTS public.zones (
    id integer NOT NULL,
    name text NOT NULL,
    department_id integer NOT NULL REFERENCES public.departments(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zones_pkey PRIMARY KEY (id),
    CONSTRAINT zones_name_department_id_key UNIQUE (name, department_id)
);
CREATE SEQUENCE IF NOT EXISTS public.zones_id_seq AS integer OWNED BY public.zones.id;
ALTER TABLE ONLY public.zones ALTER COLUMN id SET DEFAULT nextval('public.zones_id_seq'::regclass);

CREATE TABLE IF NOT EXISTS public.substations (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    zone_id integer NOT NULL REFERENCES public.zones(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substations_pkey PRIMARY KEY (id),
    CONSTRAINT substations_code_key UNIQUE (code),
    CONSTRAINT substations_name_key UNIQUE (name)
);
CREATE SEQUENCE IF NOT EXISTS public.substations_id_seq AS integer OWNED BY public.substations.id;
ALTER TABLE ONLY public.substations ALTER COLUMN id SET DEFAULT nextval('public.substations_id_seq'::regclass);

CREATE TABLE IF NOT EXISTS public.circuits (
    id integer NOT NULL,
    name text NOT NULL,
    substation_id integer NOT NULL REFERENCES public.substations(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT circuits_pkey PRIMARY KEY (id),
    CONSTRAINT circuits_name_substation_id_key UNIQUE (name, substation_id)
);
CREATE SEQUENCE IF NOT EXISTS public.circuits_id_seq AS integer OWNED BY public.circuits.id;
ALTER TABLE ONLY public.circuits ALTER COLUMN id SET DEFAULT nextval('public.circuits_id_seq'::regclass);

CREATE TABLE IF NOT EXISTS public.nodes (
    name text NOT NULL,
    circuit_id integer NOT NULL REFERENCES public.circuits(id),
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nodes_pkey PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS public.devices (
    hw_id text NOT NULL,
    device_type public.device_type_enum NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devices_pkey1 PRIMARY KEY (hw_id)
);

CREATE TABLE IF NOT EXISTS public.fuses_sets (
    id integer NOT NULL,
    node_id text NOT NULL REFERENCES public.nodes(name),
    set_id text,
    ext_ref_id text,
    client_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuses_sets_pkey PRIMARY KEY (id),
    CONSTRAINT fuses_sets_ext_ref_id_key UNIQUE (ext_ref_id),
    CONSTRAINT fuses_sets_node_id_set_id_key UNIQUE (node_id, set_id)
);
CREATE SEQUENCE IF NOT EXISTS public.fuses_sets_id_seq AS integer OWNED BY public.fuses_sets.id;
ALTER TABLE ONLY public.fuses_sets ALTER COLUMN id SET DEFAULT nextval('public.fuses_sets_id_seq'::regclass);

CREATE TABLE IF NOT EXISTS public.fuses (
    custom_id text NOT NULL,
    fuses_set_id integer NOT NULL REFERENCES public.fuses_sets(id),
    phase text NOT NULL,
    current_hw_id text REFERENCES public.devices(hw_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuses_pkey PRIMARY KEY (custom_id)
);

CREATE TABLE IF NOT EXISTS public.trafos (
    custom_id text NOT NULL,
    node_id text NOT NULL REFERENCES public.nodes(name),
    rated_kva numeric,
    ext_ref_id text,
    current_hw_id text REFERENCES public.devices(hw_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trafos_pkey PRIMARY KEY (custom_id),
    CONSTRAINT trafos_ext_ref_id_key UNIQUE (ext_ref_id)
);

CREATE TABLE IF NOT EXISTS public.alarms (
    hw_id text NOT NULL,
    custom_id text,
    event_code text NOT NULL,
    event_type text NOT NULL,
    alarm text NOT NULL,
    value text,
    recorded_at timestamp with time zone NOT NULL,
    CONSTRAINT alarms_pkey PRIMARY KEY (hw_id, recorded_at, event_code)
);

CREATE TABLE IF NOT EXISTS public.falcon_values (
    hw_id text NOT NULL,
    custom_id text,
    post text,
    recorded_at timestamp with time zone NOT NULL,
    angle_incl real,
    internal_temperature real,
    supercaps_per integer,
    solar_panel real,
    fuse_state text,
    is_voltage_present boolean,
    is_fuse_alarm boolean,
    is_free_fall_alarm boolean,
    is_solar_panel_alarm boolean,
    CONSTRAINT falcon_values_pkey PRIMARY KEY (hw_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS public.last_falcon_values (
    hw_id text NOT NULL,
    custom_id text,
    post text,
    recorded_at timestamp with time zone NOT NULL,
    angle_incl real,
    internal_temperature real,
    supercaps_per integer,
    solar_panel real,
    fuse_state text,
    is_voltage_present boolean,
    is_fuse_alarm boolean,
    is_free_fall_alarm boolean,
    is_solar_panel_alarm boolean,
    CONSTRAINT last_falcon_values_pkey PRIMARY KEY (hw_id)
);

CREATE TABLE IF NOT EXISTS public.smac_vc_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    internal_temperature real,
    battery_per integer,
    va real, vb real, vc real,
    ia real, ib real, ic real, in_ real,
    cuf_percent numeric,
    vuf_percent numeric,
    load_percent numeric,
    CONSTRAINT smac_vc_values_pkey PRIMARY KEY (hw_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS public.last_smac_vc_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    internal_temperature real,
    battery_per integer,
    va real, vb real, vc real,
    ia real, ib real, ic real, in_ real,
    cuf_percent numeric,
    vuf_percent numeric,
    load_percent numeric,
    CONSTRAINT last_smac_vc_values_pkey PRIMARY KEY (hw_id)
);

CREATE TABLE IF NOT EXISTS public.smac_pw_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_a_active_power real, phase_b_active_power real, phase_c_active_power real,
    phase_a_reactive_power real, phase_b_reactive_power real, phase_c_reactive_power real,
    phase_a_apparent_power real, phase_b_apparent_power real,
    CONSTRAINT smac_pw_values_pkey PRIMARY KEY (hw_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS public.last_smac_pw_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_a_active_power real, phase_b_active_power real, phase_c_active_power real,
    phase_a_reactive_power real, phase_b_reactive_power real, phase_c_reactive_power real,
    phase_a_apparent_power real, phase_b_apparent_power real,
    CONSTRAINT last_smac_pw_values_pkey PRIMARY KEY (hw_id)
);

CREATE TABLE IF NOT EXISTS public.smac_pf_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_c_apparent_power real,
    phase_a_power_factor real, phase_b_power_factor real, phase_c_power_factor real,
    CONSTRAINT smac_pf_values_pkey PRIMARY KEY (hw_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS public.last_smac_pf_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_c_apparent_power real,
    phase_a_power_factor real, phase_b_power_factor real, phase_c_power_factor real,
    CONSTRAINT last_smac_pf_values_pkey PRIMARY KEY (hw_id)
);

CREATE INDEX IF NOT EXISTS idx_alarms_custom_id ON public.alarms USING btree (custom_id);
CREATE INDEX IF NOT EXISTS idx_alarms_node ON public.alarms USING btree ("left"(custom_id, 10));
CREATE INDEX IF NOT EXISTS idx_alarms_recorded_hw ON public.alarms USING btree (recorded_at, hw_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON public.devices USING btree (device_type);
CREATE INDEX IF NOT EXISTS idx_falcon_values_custom_id ON public.falcon_values USING btree (custom_id);
CREATE INDEX IF NOT EXISTS idx_falcon_values_node ON public.falcon_values USING btree ("left"(custom_id, 10));
CREATE INDEX IF NOT EXISTS idx_fuses_fuses_set_id ON public.fuses USING btree (fuses_set_id);
CREATE INDEX IF NOT EXISTS idx_fuses_sets_node_id ON public.fuses_sets USING btree (node_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fuses_sets_node_null_set ON public.fuses_sets USING btree (node_id) WHERE (set_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_nodes_circuit_id ON public.nodes USING btree (circuit_id);
CREATE INDEX IF NOT EXISTS idx_smac_pf_node ON public.smac_pf_values USING btree ("left"(custom_id, 10));
CREATE INDEX IF NOT EXISTS idx_smac_pw_node ON public.smac_pw_values USING btree ("left"(custom_id, 10));
CREATE INDEX IF NOT EXISTS idx_smac_vc_node ON public.smac_vc_values USING btree ("left"(custom_id, 10));
CREATE INDEX IF NOT EXISTS idx_trafos_node_id ON public.trafos USING btree (node_id);

DROP TRIGGER IF EXISTS falcon_values_latest_update ON public.falcon_values;
CREATE TRIGGER falcon_values_latest_update AFTER INSERT ON public.falcon_values FOR EACH ROW EXECUTE FUNCTION public.update_last_falcon_values();
DROP TRIGGER IF EXISTS smac_vc_latest_update ON public.smac_vc_values;
CREATE TRIGGER smac_vc_latest_update AFTER INSERT ON public.smac_vc_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_vc_values();
DROP TRIGGER IF EXISTS smac_pw_latest_update ON public.smac_pw_values;
CREATE TRIGGER smac_pw_latest_update AFTER INSERT ON public.smac_pw_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_pw_values();
DROP TRIGGER IF EXISTS smac_pf_latest_update ON public.smac_pf_values;
CREATE TRIGGER smac_pf_latest_update AFTER INSERT ON public.smac_pf_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_pf_values();
