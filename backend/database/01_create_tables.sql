--
-- PostgreSQL schema — IoT Electrical Grid Monitoring Platform
-- Colbits / GDSD
--
-- Derived from a production pg_dump (schema only). Anonymized for sharing
-- with students:
--   - department_name enum values renamed to fictional district names
--
-- NOTE ON TIMESTAMPS: every recorded_at / created_at / updated_at column
-- below is `timestamp with time zone`, matching production. Telemetry
-- timestamps are NOT naive — they carry zone information. Any code that
-- assumes naive timestamps (e.g. comparing against a server-local "now()"
-- without accounting for zone) will produce wrong results across DST or
-- multi-region deployments.
--


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: department_name; Type: TYPE; Schema: public; Owner: -
-- Anonymized: real values masked.
--

CREATE TYPE public.department_name AS ENUM (
    'north_district',
    'south_district'
);


--
-- Name: device_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.device_type_enum AS ENUM (
    'falcon',
    'smac'
);


--
-- Name: update_last_falcon_values(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_falcon_values() RETURNS trigger
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


--
-- Name: update_last_smac_vc_values(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_smac_vc_values() RETURNS trigger
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


--
-- Name: update_last_smac_pw_values(); Type: FUNCTION; Schema: public; Owner: -
--


CREATE FUNCTION public.update_last_smac_pw_values() RETURNS trigger
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


--
-- Name: update_last_smac_pf_values(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_smac_pf_values() RETURNS trigger
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


SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Name: alarms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alarms (
    hw_id text NOT NULL,
    custom_id text,
    event_code text NOT NULL,
    event_type text NOT NULL,
    alarm text NOT NULL,
    value text,
    recorded_at timestamp with time zone NOT NULL
);


--
-- Name: circuits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circuits (
    id integer NOT NULL,
    name text NOT NULL,
    substation_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.circuits_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.circuits_id_seq OWNED BY public.circuits.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name public.department_name NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.departments_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    hw_id text NOT NULL,
    device_type public.device_type_enum NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: falcon_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.falcon_values (
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
    is_solar_panel_alarm boolean
);


--
-- Name: fuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fuses (
    custom_id text NOT NULL,
    fuses_set_id integer NOT NULL,
    phase text NOT NULL,
    current_hw_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fuses_sets; Type: TABLE; Schema: public; Owner: -
-- External-reference ID column renamed to ext_ref_id (masked alias — see file header).
--

CREATE TABLE public.fuses_sets (
    id integer NOT NULL,
    node_id text NOT NULL,
    set_id text,
    ext_ref_id text,
    client_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.fuses_sets_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.fuses_sets_id_seq OWNED BY public.fuses_sets.id;


--
-- Name: last_falcon_values; Type: TABLE; Schema: public; Owner: -
-- Kept current by the update_last_falcon_values() trigger (see below).
--

CREATE TABLE public.last_falcon_values (
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
    is_solar_panel_alarm boolean
);


--
-- Name: last_smac_vc_values; Type: TABLE; Schema: public; Owner: -
-- Kept current by the update_last_smac_vc_values() trigger (see below).
--

CREATE TABLE public.last_smac_vc_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    internal_temperature real,
    battery_per integer,
    va real,
    vb real,
    vc real,
    ia real,
    ib real,
    ic real,
    in_ real,
    cuf_percent numeric,
    vuf_percent numeric,
    load_percent numeric
);


--
-- Name: last_smac_pw_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.last_smac_pw_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_a_active_power real,
    phase_b_active_power real,
    phase_c_active_power real,
    phase_a_reactive_power real,
    phase_b_reactive_power real,
    phase_c_reactive_power real,
    phase_a_apparent_power real,
    phase_b_apparent_power real
);


--
-- Name: last_smac_pf_values; Type: TABLE; Schema: public; Owner: -
-- Added: same note as last_smac_pw_values above.
--

CREATE TABLE public.last_smac_pf_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_c_apparent_power real,
    phase_a_power_factor real,
    phase_b_power_factor real,
    phase_c_power_factor real
);


--
-- Name: nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nodes (
    name text NOT NULL,
    circuit_id integer NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: smac_pf_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smac_pf_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_c_apparent_power real,
    phase_a_power_factor real,
    phase_b_power_factor real,
    phase_c_power_factor real
);


--
-- Name: smac_pw_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smac_pw_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    phase_a_active_power real,
    phase_b_active_power real,
    phase_c_active_power real,
    phase_a_reactive_power real,
    phase_b_reactive_power real,
    phase_c_reactive_power real,
    phase_a_apparent_power real,
    phase_b_apparent_power real
);


--
-- Name: smac_vc_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smac_vc_values (
    hw_id text NOT NULL,
    custom_id text,
    recorded_at timestamp with time zone NOT NULL,
    internal_temperature real,
    battery_per integer,
    va real,
    vb real,
    vc real,
    ia real,
    ib real,
    ic real,
    in_ real,
    cuf_percent numeric,
    vuf_percent numeric,
    load_percent numeric
);


--
-- Name: substations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substations (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    zone_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.substations_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.substations_id_seq OWNED BY public.substations.id;


--
-- Name: trafos; Type: TABLE; Schema: public; Owner: -
-- External-reference ID column renamed to ext_ref_id (masked alias — see file header).
--

CREATE TABLE public.trafos (
    custom_id text NOT NULL,
    node_id text NOT NULL,
    rated_kva numeric,
    ext_ref_id text,
    current_hw_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id integer NOT NULL,
    name text NOT NULL,
    department_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.zones_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.zones_id_seq OWNED BY public.zones.id;


--
-- Defaults
--

ALTER TABLE ONLY public.circuits ALTER COLUMN id SET DEFAULT nextval('public.circuits_id_seq'::regclass);
ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);
ALTER TABLE ONLY public.fuses_sets ALTER COLUMN id SET DEFAULT nextval('public.fuses_sets_id_seq'::regclass);
ALTER TABLE ONLY public.substations ALTER COLUMN id SET DEFAULT nextval('public.substations_id_seq'::regclass);
ALTER TABLE ONLY public.zones ALTER COLUMN id SET DEFAULT nextval('public.zones_id_seq'::regclass);


--
-- Primary keys / unique constraints
--

ALTER TABLE ONLY public.alarms
    ADD CONSTRAINT alarms_pkey PRIMARY KEY (hw_id, recorded_at, event_code);

ALTER TABLE ONLY public.circuits
    ADD CONSTRAINT circuits_name_substation_id_key UNIQUE (name, substation_id);
ALTER TABLE ONLY public.circuits
    ADD CONSTRAINT circuits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);
ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey1 PRIMARY KEY (hw_id);

ALTER TABLE ONLY public.falcon_values
    ADD CONSTRAINT falcon_values_pkey PRIMARY KEY (hw_id, recorded_at);

ALTER TABLE ONLY public.fuses
    ADD CONSTRAINT fuses_pkey PRIMARY KEY (custom_id);

ALTER TABLE ONLY public.fuses_sets
    ADD CONSTRAINT fuses_sets_ext_ref_id_key UNIQUE (ext_ref_id);
ALTER TABLE ONLY public.fuses_sets
    ADD CONSTRAINT fuses_sets_node_id_set_id_key UNIQUE (node_id, set_id);
ALTER TABLE ONLY public.fuses_sets
    ADD CONSTRAINT fuses_sets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.last_falcon_values
    ADD CONSTRAINT last_falcon_values_pkey PRIMARY KEY (hw_id);

ALTER TABLE ONLY public.last_smac_vc_values
    ADD CONSTRAINT last_smac_vc_values_pkey PRIMARY KEY (hw_id);

ALTER TABLE ONLY public.last_smac_pw_values
    ADD CONSTRAINT last_smac_pw_values_pkey PRIMARY KEY (hw_id);

ALTER TABLE ONLY public.last_smac_pf_values
    ADD CONSTRAINT last_smac_pf_values_pkey PRIMARY KEY (hw_id);

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.smac_pf_values
    ADD CONSTRAINT smac_pf_values_pkey PRIMARY KEY (hw_id, recorded_at);

ALTER TABLE ONLY public.smac_pw_values
    ADD CONSTRAINT smac_pw_values_pkey PRIMARY KEY (hw_id, recorded_at);

ALTER TABLE ONLY public.smac_vc_values
    ADD CONSTRAINT smac_vc_values_pkey PRIMARY KEY (hw_id, recorded_at);

ALTER TABLE ONLY public.substations
    ADD CONSTRAINT substations_code_key UNIQUE (code);
ALTER TABLE ONLY public.substations
    ADD CONSTRAINT substations_name_key UNIQUE (name);
ALTER TABLE ONLY public.substations
    ADD CONSTRAINT substations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trafos
    ADD CONSTRAINT trafos_ext_ref_id_key UNIQUE (ext_ref_id);
ALTER TABLE ONLY public.trafos
    ADD CONSTRAINT trafos_pkey PRIMARY KEY (custom_id);

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_name_department_id_key UNIQUE (name, department_id);
ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Indexes
--

CREATE INDEX idx_alarms_custom_id ON public.alarms USING btree (custom_id);
CREATE INDEX idx_alarms_node ON public.alarms USING btree ("left"(custom_id, 10));
CREATE INDEX idx_alarms_recorded_hw ON public.alarms USING btree (recorded_at, hw_id);
CREATE INDEX idx_devices_device_type ON public.devices USING btree (device_type);
CREATE INDEX idx_falcon_values_custom ON public.falcon_values USING btree (custom_id);
CREATE INDEX idx_falcon_values_custom_id ON public.falcon_values USING btree (custom_id);
CREATE INDEX idx_falcon_values_node ON public.falcon_values USING btree ("left"(custom_id, 10));
CREATE INDEX idx_fuses_fuses_set_id ON public.fuses USING btree (fuses_set_id);
CREATE INDEX idx_fuses_sets_node_id ON public.fuses_sets USING btree (node_id);
CREATE UNIQUE INDEX idx_fuses_sets_node_null_set ON public.fuses_sets USING btree (node_id) WHERE (set_id IS NULL);
CREATE INDEX idx_nodes_circuit_id ON public.nodes USING btree (circuit_id);
CREATE INDEX idx_smac_pf_node ON public.smac_pf_values USING btree ("left"(custom_id, 10));
CREATE INDEX idx_smac_pw_node ON public.smac_pw_values USING btree ("left"(custom_id, 10));
CREATE INDEX idx_smac_vc_node ON public.smac_vc_values USING btree ("left"(custom_id, 10));
CREATE INDEX idx_trafos_node_id ON public.trafos USING btree (node_id);


--
-- Triggers
-- Each keeps its "last known value" table current on every insert, only
-- overwriting when the incoming row is newer (see each function's WHERE
-- clause above).
--

CREATE TRIGGER falcon_values_latest_update AFTER INSERT ON public.falcon_values FOR EACH ROW EXECUTE FUNCTION public.update_last_falcon_values();
CREATE TRIGGER smac_vc_latest_update AFTER INSERT ON public.smac_vc_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_vc_values();
CREATE TRIGGER smac_pw_latest_update AFTER INSERT ON public.smac_pw_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_pw_values();
CREATE TRIGGER smac_pf_latest_update AFTER INSERT ON public.smac_pf_values FOR EACH ROW EXECUTE FUNCTION public.update_last_smac_pf_values();


--
-- Foreign keys
--

ALTER TABLE ONLY public.circuits
    ADD CONSTRAINT circuits_substation_id_fkey FOREIGN KEY (substation_id) REFERENCES public.substations(id);

ALTER TABLE ONLY public.fuses
    ADD CONSTRAINT fuses_current_hw_id_fkey FOREIGN KEY (current_hw_id) REFERENCES public.devices(hw_id);
ALTER TABLE ONLY public.fuses
    ADD CONSTRAINT fuses_fuses_set_id_fkey FOREIGN KEY (fuses_set_id) REFERENCES public.fuses_sets(id);

ALTER TABLE ONLY public.fuses_sets
    ADD CONSTRAINT fuses_sets_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(name);

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_circuit_id_fkey FOREIGN KEY (circuit_id) REFERENCES public.circuits(id);

ALTER TABLE ONLY public.substations
    ADD CONSTRAINT substations_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id);

ALTER TABLE ONLY public.trafos
    ADD CONSTRAINT trafos_current_hw_id_fkey FOREIGN KEY (current_hw_id) REFERENCES public.devices(hw_id);
ALTER TABLE ONLY public.trafos
    ADD CONSTRAINT trafos_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(name);

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

--
-- End of schema
--
