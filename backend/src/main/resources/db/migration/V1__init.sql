-- Joinlist schema. Seat correctness is enforced here, not only in Java:
--   * events.confirmed_count can never exceed capacity (CHECK)
--   * one active registration per user per event (partial UNIQUE index)

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(254) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE events (
    id                     BIGSERIAL PRIMARY KEY,
    organizer_id           BIGINT       NOT NULL REFERENCES users (id),
    title                  VARCHAR(120) NOT NULL,
    description            TEXT         NOT NULL DEFAULT '',
    location               VARCHAR(200) NOT NULL,
    starts_at              TIMESTAMPTZ  NOT NULL,
    registration_opens_at  TIMESTAMPTZ  NOT NULL,
    registration_closes_at TIMESTAMPTZ  NOT NULL,
    capacity               INT          NOT NULL,
    confirmed_count        INT          NOT NULL DEFAULT 0,
    status                 VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT events_capacity_positive CHECK (capacity > 0),
    CONSTRAINT events_no_overbooking CHECK (confirmed_count >= 0 AND confirmed_count <= capacity),
    CONSTRAINT events_status_valid CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
    CONSTRAINT events_window_valid CHECK (registration_opens_at < registration_closes_at
                                          AND registration_closes_at <= starts_at)
);
CREATE INDEX events_organizer ON events (organizer_id);
CREATE INDEX events_upcoming ON events (starts_at) WHERE status = 'PUBLISHED';

CREATE TABLE registrations (
    id            BIGSERIAL PRIMARY KEY,
    event_id      BIGINT      NOT NULL REFERENCES events (id),
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    status        VARCHAR(20) NOT NULL,
    checked_in_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT registrations_status_valid CHECK (status IN ('CONFIRMED', 'WAITLISTED', 'CANCELLED')),
    CONSTRAINT registrations_checkin_confirmed CHECK (checked_in_at IS NULL OR status = 'CONFIRMED')
);
-- A user may cancel and register again, so only non-cancelled rows must be unique.
CREATE UNIQUE INDEX registrations_one_active ON registrations (event_id, user_id) WHERE status <> 'CANCELLED';
-- Waitlist order is the id order (ids come from a sequence, so two people never share a place).
CREATE INDEX registrations_waitlist ON registrations (event_id, id) WHERE status = 'WAITLISTED';
CREATE INDEX registrations_user ON registrations (user_id);

CREATE TABLE notification_logs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    event_id      BIGINT      NOT NULL REFERENCES events (id),
    type          VARCHAR(30) NOT NULL,
    status        VARCHAR(10) NOT NULL,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
