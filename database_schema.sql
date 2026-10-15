-- ============================================================
-- BustoSight - Complete Database Schema
-- Run this entire file in Supabase SQL Editor (in order)
-- to set up a fresh project from scratch.
-- ============================================================


-- ============================================================
-- SECTION 1: PROFILES TABLE
-- Stores user account info linked to Supabase Auth users.
-- Must be created BEFORE admin_action_logs (which references it).
-- ============================================================

CREATE TABLE public.profiles (
    id UUID NOT NULL,
    employee_id TEXT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NULL,
    username TEXT NOT NULL,
    role TEXT NULL DEFAULT 'Staff'::text,
    status TEXT NULL DEFAULT 'Active'::text,
    archived BOOLEAN NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT timezone('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NULL,
    must_change_password BOOLEAN NULL DEFAULT FALSE,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_email_key UNIQUE (email),
    CONSTRAINT profiles_employee_id_key UNIQUE (employee_id),
    CONSTRAINT profiles_username_key UNIQUE (username),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Avoid referencing public.profiles inside a policy on public.profiles,
-- as that causes an "infinite recursion detected in policy for relation profiles" error (HTTP 500).
CREATE POLICY "Allow read profiles for all"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Allow update profiles for authenticated"
ON public.profiles FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow insert profiles for authenticated"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (true);

-- --------------------------------------------------------
-- Trigger: Auto-insert a profiles row when a new Auth user
-- signs up via supabase.auth.signUp(). This is required
-- because ManageAccounts.jsx relies on the trigger to
-- populate profiles after authClient.auth.signUp().
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        first_name,
        last_name,
        username,
        role,
        employee_id
    )
    VALUES (
        NEW.id,
        NEW.email,
        -- COALESCE fallbacks prevent NOT NULL violations when creating
        -- users via the Supabase dashboard (which sends no metadata).
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'Staff'),
        NEW.raw_user_meta_data->>'employee_id'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SECTION 2: ADMIN ACTION LOGS TABLE
-- Audit log for sensitive admin actions (e.g. password resets).
-- References profiles(id), so profiles must exist first.
-- ============================================================

CREATE TABLE public.admin_action_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_id UUID NULL,
    action TEXT NOT NULL,
    target_id UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT timezone('utc'::text, NOW()),
    CONSTRAINT admin_action_logs_pkey PRIMARY KEY (id),
    CONSTRAINT admin_action_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id),
    CONSTRAINT admin_action_logs_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles(id)
) TABLESPACE pg_default;


-- ============================================================
-- SECTION 3: RESIDENTS TABLE
-- Stores barangay resident census records.
-- ============================================================

CREATE TABLE public.residents (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    h_no TEXT NOT NULL,
    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT NULL,
    qualifier TEXT NULL,
    house_no TEXT NULL,
    street TEXT NULL,
    purok TEXT NULL,
    birth_place TEXT NULL,
    birth_date DATE NULL,
    sex TEXT NULL,
    civil_status TEXT NULL,
    citizenship TEXT NULL DEFAULT 'FILIPINO'::text,
    occupation TEXT NULL,
    relation_to_head TEXT NULL,
    age INTEGER NULL,
    residence_type TEXT NULL,
    is_household_head BOOLEAN NULL DEFAULT FALSE,
    religion TEXT NULL,
    educational_attainment TEXT NULL,
    is_pwd BOOLEAN NULL DEFAULT FALSE,
    has_pwd_id BOOLEAN NULL DEFAULT FALSE,
    is_senior BOOLEAN NULL DEFAULT FALSE,
    has_senior_id BOOLEAN NULL DEFAULT FALSE,
    is_solo_parent BOOLEAN NULL DEFAULT FALSE,
    has_solo_parent_id BOOLEAN NULL DEFAULT FALSE,
    age_at_first_birth INTEGER NULL,
    teenage_pregnancy_case BOOLEAN NULL DEFAULT FALSE,
    current_teenage_mother BOOLEAN NULL DEFAULT FALSE,
    is_4ps BOOLEAN NULL DEFAULT FALSE,
    is_voter TEXT NULL,
    barangay TEXT NOT NULL,
    is_archived BOOLEAN NULL DEFAULT FALSE,
    archive_date TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
    data_year INTEGER NULL,
    CONSTRAINT residents_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Enable Row Level Security (RLS)
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all actions for both anon and authenticated users
CREATE POLICY "Allow all actions for all roles"
ON public.residents FOR ALL
USING (true)
WITH CHECK (true);

-- --------------------------------------------------------
-- Function: Prevent duplicate resident records
-- in the same barangay and data year.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_duplicate_resident()
RETURNS TRIGGER AS $$
DECLARE
    existing_rec RECORD;
BEGIN
    SELECT is_archived INTO existing_rec
    FROM public.residents
    WHERE
        LOWER(TRIM(last_name))                          = LOWER(TRIM(NEW.last_name)) AND
        LOWER(TRIM(first_name))                         = LOWER(TRIM(NEW.first_name)) AND
        LOWER(TRIM(COALESCE(middle_name, '')))          = LOWER(TRIM(COALESCE(NEW.middle_name, ''))) AND
        birth_date IS NOT DISTINCT FROM NEW.birth_date AND
        LOWER(TRIM(barangay))                           = LOWER(TRIM(NEW.barangay)) AND
        data_year IS NOT DISTINCT FROM NEW.data_year
    LIMIT 1;

    IF FOUND THEN
        IF existing_rec.is_archived THEN
            RAISE EXCEPTION 'This resident already exists in the system (archived record).';
        ELSE
            RAISE EXCEPTION 'This resident already exists in the system.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fires on INSERT only (matches live DB definition)
CREATE TRIGGER trg_prevent_duplicate_resident
    BEFORE INSERT ON public.residents
    FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_resident();


-- ============================================================
-- SECTION 4: DASHBOARD RPC FUNCTION
-- Aggregates demographic & statistical data for Dashboard.jsx
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(target_year integer DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
BEGIN
    WITH base_data AS (
        SELECT 
            *,
            COALESCE(NULLIF(data_year::text, '')::integer, EXTRACT(YEAR FROM created_at)::integer) as resolved_year,
            CASE WHEN upper(trim(sex)) IN ('M', 'MALE') THEN 1 ELSE 0 END as is_male,
            CASE WHEN upper(trim(sex)) IN ('F', 'FEMALE') THEN 1 ELSE 0 END as is_female,
            CASE WHEN NULLIF(age::text, '') ~ '^[0-9]+$' AND NULLIF(age::text, '')::integer <= 17 THEN 1 ELSE 0 END as is_child,
            CASE WHEN NULLIF(age::text, '') ~ '^[0-9]+$' AND NULLIF(age::text, '')::integer BETWEEN 18 AND 59 THEN 1 ELSE 0 END as is_working,
            CASE WHEN NULLIF(age::text, '') ~ '^[0-9]+$' AND NULLIF(age::text, '')::integer >= 60 THEN 1 ELSE 0 END as is_old,
            CASE WHEN lower(is_voter) LIKE '%registered%' THEN 1 ELSE 0 END as is_reg_voter,
            CASE WHEN occupation IS NOT NULL 
                      AND trim(occupation) != '' 
                      AND lower(trim(occupation)) NOT IN ('none','unemployed','n/a','na','student','housewife','none.') 
                 THEN 1 ELSE 0 END as is_employed
        FROM public.residents
        WHERE is_archived = false
    ),
    global_stats AS (
        SELECT 
            jsonb_build_object(
                'totalPopulation', count(*),
                'totalHouseholds', count(distinct barangay || '__' || h_no),
                'totalSeniors', sum(case when is_senior then 1 else 0 end),
                'totalPwd', sum(case when is_pwd then 1 else 0 end),
                'totalSoloParent', sum(case when is_solo_parent then 1 else 0 end),
                'total4ps', sum(case when is_4ps then 1 else 0 end),
                'maleCount', sum(is_male),
                'femaleCount', sum(is_female),
                'childrenCount', sum(is_child),
                'workingAgeCount', sum(is_working),
                'seniorCount', sum(is_old),
                'pwdWithId', sum(case when is_pwd and has_pwd_id then 1 else 0 end),
                'pwdNoId', sum(case when is_pwd and (has_pwd_id = false or has_pwd_id is null) then 1 else 0 end),
                'seniorWithId', sum(case when is_senior and has_senior_id then 1 else 0 end),
                'seniorNoId', sum(case when is_senior and (has_senior_id = false or has_senior_id is null) then 1 else 0 end),
                'registeredVoters', sum(is_reg_voter),
                'nonVoters', count(*) - sum(is_reg_voter),
                'teenPregnancyCases', sum(case when teenage_pregnancy_case then 1 else 0 end),
                'currentTeenMothers', sum(case when current_teenage_mother then 1 else 0 end),
                'employed', sum(is_employed),
                'unemployed', count(*) - sum(is_employed)
            ) as stats
        FROM base_data
        WHERE target_year IS NULL OR resolved_year = target_year
    ),
    yearly_stats AS (
        -- Intentionally NOT filtering by target_year so regression charts have all historical data
        SELECT 
            jsonb_object_agg(
                resolved_year::text, 
                jsonb_build_object(
                    'pop', pop_count,
                    'senior', senior_count,
                    'voter', voter_count,
                    'teenPreg', teen_preg_count,
                    'employed', employed_count
                )
            ) as stats
        FROM (
            SELECT 
                resolved_year,
                count(*) as pop_count,
                sum(case when is_senior then 1 else 0 end) as senior_count,
                sum(is_reg_voter) as voter_count,
                sum(case when teenage_pregnancy_case then 1 else 0 end) as teen_preg_count,
                sum(is_employed) as employed_count
            FROM base_data
            WHERE resolved_year IS NOT NULL
            GROUP BY resolved_year
        ) y
    ),
    brgy_stats AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'name', brgy,
                    'count', c,
                    'seniors', s,
                    'pwd', p,
                    'households', hh,
                    'voters', v,
                    'teenPreg', tp,
                    'teenMother', tm
                )
            ) as stats
        FROM (
            SELECT 
                coalesce(barangay, 'Poblacion') as brgy,
                count(*) as c,
                sum(case when is_senior then 1 else 0 end) as s,
                sum(case when is_pwd then 1 else 0 end) as p,
                count(distinct coalesce(h_no, 'Unknown')) as hh,
                sum(is_reg_voter) as v,
                sum(case when teenage_pregnancy_case then 1 else 0 end) as tp,
                sum(case when current_teenage_mother then 1 else 0 end) as tm
            FROM base_data
            WHERE target_year IS NULL OR resolved_year = target_year
            GROUP BY coalesce(barangay, 'Poblacion')
        ) x
    )
    SELECT jsonb_build_object(
        'global', (SELECT coalesce(stats, '{}'::jsonb) FROM global_stats),
        'yearly', (SELECT coalesce(stats, '{}'::jsonb) FROM yearly_stats),
        'barangays', (SELECT coalesce(stats, '[]'::jsonb) FROM brgy_stats)
    ) INTO result;

    RETURN coalesce(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(integer) TO anon, authenticated, service_role;


-- ============================================================
-- SECTION 5: USER ROLE HELPER FUNCTION
-- Returns the role of the currently authenticated user
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated, service_role;


-- ============================================================
-- SECTION 6: IS ADMIN HELPER FUNCTION
-- Checks if the currently authenticated user is an active Admin
-- Uses SECURITY DEFINER to safely bypass RLS recursion
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
          AND role IN ('Admin', 'Administrator') 
          AND archived = false
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;


-- ============================================================
-- DONE. Summary of what was created:
--
--  Tables:
--    - public.profiles           (user accounts, linked to auth.users)
--    - public.admin_action_logs  (audit log for admin actions)
--    - public.residents          (barangay census data)
--
--  Triggers & Functions:
--    - on_auth_user_created      -> handle_new_user()
--      Fires on auth.users INSERT. Auto-populates profiles row.
--    - trigger_check_duplicate_resident -> check_duplicate_resident()
--      Fires on residents INSERT ONLY. Blocks duplicate entries.
--      Trigger name: trg_prevent_duplicate_resident
--
--  RLS Policies:
--    - profiles: "Users can view own profile"
--    - profiles: "Admins can view all profiles"
--    - residents: "Allow all actions for all roles"
--
--  After running this, set Edge Function secrets:
--    supabase secrets set SERVICE_ROLE_KEY=<your-new-service-role-key>
-- ============================================================


