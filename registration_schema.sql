--
-- PostgreSQL database dump
--

-- Dumped from database version 16.11
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: laboratories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laboratories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    study_program_id uuid NOT NULL,
    code character varying(32),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: practicum_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practicum_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practicum_id uuid NOT NULL,
    code character varying(32),
    name text NOT NULL,
    sequence integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    is_individual_mentoring boolean DEFAULT false,
    mentoring_duration_minutes integer
);


--
-- Name: COLUMN practicum_modules.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.practicum_modules.description IS 'Deskripsi atau penjelasan tentang module praktikum';


--
-- Name: COLUMN practicum_modules.is_individual_mentoring; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.practicum_modules.is_individual_mentoring IS 'Flag untuk menandakan apakah module menggunakan metode mentoring individu';


--
-- Name: COLUMN practicum_modules.mentoring_duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.practicum_modules.mentoring_duration_minutes IS 'Durasi mentoring per individu dalam menit (hanya diisi jika is_individual_mentoring = true)';


--
-- Name: practicums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practicums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    laboratory_id uuid NOT NULL,
    code character varying(32),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: schedule_assistants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_assistants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    user_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schedule_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    user_id character varying(255) NOT NULL,
    booking_date date NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying,
    cancelled_by character varying(255),
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: schedule_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    slot_number integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status character varying(32) DEFAULT 'available'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_slot_number CHECK ((slot_number > 0)),
    CONSTRAINT check_slot_times CHECK ((end_time > start_time))
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    start_time timestamp with time zone,
    venue text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    end_time timestamp with time zone
);


--
-- Name: COLUMN schedules.start_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedules.start_time IS 'Waktu mulai jadwal asisten';


--
-- Name: COLUMN schedules.end_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedules.end_time IS 'Waktu akhir jadwal asisten';


--
-- Name: study_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(32),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: laboratories laboratories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laboratories
    ADD CONSTRAINT laboratories_pkey PRIMARY KEY (id);


--
-- Name: practicum_modules practicum_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicum_modules
    ADD CONSTRAINT practicum_modules_pkey PRIMARY KEY (id);


--
-- Name: practicums practicums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicums
    ADD CONSTRAINT practicums_pkey PRIMARY KEY (id);


--
-- Name: schedule_assistants schedule_assistants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assistants
    ADD CONSTRAINT schedule_assistants_pkey PRIMARY KEY (id);


--
-- Name: schedule_bookings schedule_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_bookings
    ADD CONSTRAINT schedule_bookings_pkey PRIMARY KEY (id);


--
-- Name: schedule_slots schedule_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: study_programs study_programs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_programs
    ADD CONSTRAINT study_programs_code_key UNIQUE (code);


--
-- Name: study_programs study_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_programs
    ADD CONSTRAINT study_programs_pkey PRIMARY KEY (id);


--
-- Name: schedule_assistants unique_schedule_assistant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assistants
    ADD CONSTRAINT unique_schedule_assistant UNIQUE (schedule_id, user_id);


--
-- Name: schedule_slots unique_schedule_slot_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT unique_schedule_slot_number UNIQUE (schedule_id, slot_number);


--
-- Name: idx_schedule_assistants_schedule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_assistants_schedule_id ON public.schedule_assistants USING btree (schedule_id);


--
-- Name: idx_schedule_assistants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_assistants_user_id ON public.schedule_assistants USING btree (user_id);


--
-- Name: idx_schedule_bookings_booking_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_bookings_booking_date ON public.schedule_bookings USING btree (booking_date);


--
-- Name: idx_schedule_bookings_slot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_bookings_slot_id ON public.schedule_bookings USING btree (slot_id);


--
-- Name: idx_schedule_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_bookings_status ON public.schedule_bookings USING btree (status);


--
-- Name: idx_schedule_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_bookings_user_id ON public.schedule_bookings USING btree (user_id);


--
-- Name: idx_schedule_slots_schedule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_slots_schedule_id ON public.schedule_slots USING btree (schedule_id);


--
-- Name: idx_schedule_slots_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_slots_start_time ON public.schedule_slots USING btree (start_time);


--
-- Name: idx_schedule_slots_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_slots_status ON public.schedule_slots USING btree (status);


--
-- Name: idx_schedules_end_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_end_time ON public.schedules USING btree (end_time);


--
-- Name: idx_schedules_module_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_module_id ON public.schedules USING btree (module_id);


--
-- Name: idx_schedules_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_start_time ON public.schedules USING btree (start_time);


--
-- Name: unique_slot_booking_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_slot_booking_active ON public.schedule_bookings USING btree (slot_id) WHERE ((status)::text = 'active'::text);


--
-- Name: unique_user_booking_per_day_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_user_booking_per_day_active ON public.schedule_bookings USING btree (user_id, booking_date) WHERE ((status)::text = 'active'::text);


--
-- Name: schedule_bookings trigger_update_slot_status_on_booking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_slot_status_on_booking AFTER INSERT OR UPDATE ON public.schedule_bookings FOR EACH ROW EXECUTE FUNCTION public.update_slot_status_on_booking();


--
-- Name: schedule_bookings update_schedule_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedule_bookings_updated_at BEFORE UPDATE ON public.schedule_bookings FOR EACH ROW EXECUTE FUNCTION public.update_schedule_bookings_updated_at();


--
-- Name: schedule_slots update_schedule_slots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedule_slots_updated_at BEFORE UPDATE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.update_schedule_slots_updated_at();


--
-- Name: schedules update_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_schedules_updated_at();


--
-- Name: laboratories fk_lab_study_program; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laboratories
    ADD CONSTRAINT fk_lab_study_program FOREIGN KEY (study_program_id) REFERENCES public.study_programs(id) ON DELETE CASCADE;


--
-- Name: practicum_modules fk_module_practicum; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicum_modules
    ADD CONSTRAINT fk_module_practicum FOREIGN KEY (practicum_id) REFERENCES public.practicums(id) ON DELETE CASCADE;


--
-- Name: practicums fk_practicum_lab; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicums
    ADD CONSTRAINT fk_practicum_lab FOREIGN KEY (laboratory_id) REFERENCES public.laboratories(id) ON DELETE CASCADE;


--
-- Name: schedule_bookings schedule_bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_bookings
    ADD CONSTRAINT schedule_bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.schedule_slots(id) ON DELETE CASCADE;


--
-- Name: schedules schedules_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.practicum_modules(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

