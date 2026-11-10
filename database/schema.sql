-- =====================================================
-- Trip Planner Database (PostgreSQL)
-- Database Name: trip_planner
-- =====================================================

SET search_path TO public;

-- =====================================================
-- 1. ENUM TYPES
-- =====================================================

-- Activity Status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'activity_status'
    ) THEN
        CREATE TYPE public.activity_status AS ENUM (
            'Planned',
            'Booked',
            'Completed'
        );
    END IF;
END
$$;

-- Packing Category
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'packing_category'
    ) THEN
        CREATE TYPE public.packing_category AS ENUM (
            'Clothing',
            'Electronics',
            'Toiletries',
            'Documents',
            'Others'
        );
    END IF;
END
$$;

-- Document Type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'document_type'
    ) THEN
        CREATE TYPE public.document_type AS ENUM (
            'Flight Ticket',
            'Hotel Booking',
            'Passport Copy',
            'Visa',
            'Others'
        );
    END IF;
END
$$;

-- Member Role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'member_role'
    ) THEN
        CREATE TYPE public.member_role AS ENUM (
            'Owner',
            'Member'
        );
    END IF;
END
$$;


-- =====================================================
-- 2. BASE TABLES
-- =====================================================

-- Users
CREATE TABLE IF NOT EXISTS public.app_user (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive unique email
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email_lower
ON public.app_user (LOWER(email));


-- Trips
CREATE TABLE IF NOT EXISTS public.trip (
    trip_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_trip_user
        FOREIGN KEY (user_id)
        REFERENCES public.app_user(user_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_trip_dates
        CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_trip_user
ON public.trip (user_id);


-- =====================================================
-- 3. TRIP ENTITIES
-- =====================================================

-- Activities
CREATE TABLE IF NOT EXISTS public.activity (
    activity_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    activity_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    notes TEXT,
    status public.activity_status NOT NULL DEFAULT 'Planned',
    display_order INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_activity_trip
        FOREIGN KEY (trip_id)
        REFERENCES public.trip(trip_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_activity_times
        CHECK (
            start_time IS NULL
            OR end_time IS NULL
            OR end_time >= start_time
        )
);

CREATE INDEX IF NOT EXISTS idx_activity_trip_date_order
ON public.activity (trip_id, activity_date, display_order);


-- Packing Items
CREATE TABLE IF NOT EXISTS public.packing_item (
    item_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    category public.packing_category NOT NULL DEFAULT 'Others',
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_packing_item_trip
        FOREIGN KEY (trip_id)
        REFERENCES public.trip(trip_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_packing_item_trip
        UNIQUE (item_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_packing_item_trip
ON public.packing_item (trip_id);


-- Documents
CREATE TABLE IF NOT EXISTS public.document (
    document_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    document_type public.document_type NOT NULL DEFAULT 'Others',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_document_trip
        FOREIGN KEY (trip_id)
        REFERENCES public.trip(trip_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_trip
ON public.document (trip_id);


-- =====================================================
-- 4. JUNCTION TABLES
-- =====================================================

-- Trip Members
CREATE TABLE IF NOT EXISTS public.trip_member (
    trip_member_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id INT NOT NULL,
    user_id INT NOT NULL,
    role public.member_role NOT NULL DEFAULT 'Member',

    CONSTRAINT fk_trip_member_trip
        FOREIGN KEY (trip_id)
        REFERENCES public.trip(trip_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_trip_member_user
        FOREIGN KEY (user_id)
        REFERENCES public.app_user(user_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_trip_member_trip_user
        UNIQUE (trip_id, user_id),

    CONSTRAINT uq_trip_member_id_trip
        UNIQUE (trip_member_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_member_user
ON public.trip_member (user_id);


-- =====================================================
-- 5. TRIGGER FUNCTION
-- =====================================================

-- Automatically add the trip owner as a trip member

CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.trip_member (
        trip_id,
        user_id,
        role
    )
    VALUES (
        NEW.trip_id,
        NEW.user_id,
        'Owner'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;


-- =====================================================
-- 6. TRIGGER
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_trip_add_owner'
          AND tgrelid = 'public.trip'::regclass
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER trg_trip_add_owner
        AFTER INSERT ON public.trip
        FOR EACH ROW
        EXECUTE FUNCTION public.add_owner_as_member();
    END IF;
END
$$;


-- =====================================================
-- 7. ITEM ASSIGNMENT
-- =====================================================

-- Assign packing items to members of the same trip

CREATE TABLE IF NOT EXISTS public.item_assignment (
    assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id INT NOT NULL,
    item_id INT NOT NULL,
    trip_member_id INT NOT NULL,

    CONSTRAINT fk_item_assignment_item
        FOREIGN KEY (item_id, trip_id)
        REFERENCES public.packing_item(item_id, trip_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_item_assignment_member
        FOREIGN KEY (trip_member_id, trip_id)
        REFERENCES public.trip_member(trip_member_id, trip_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_item_assignment
        UNIQUE (item_id, trip_member_id)
);

CREATE INDEX IF NOT EXISTS idx_item_assignment_member
ON public.item_assignment (trip_member_id);

CREATE INDEX IF NOT EXISTS idx_item_assignment_trip
ON public.item_assignment (trip_id);
