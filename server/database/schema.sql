-- ============================================================
--  Smart Parking System — Database Schema
--  MySQL 8.0+
--  Corrections applied:
--    • All ENUM values normalised (no trailing spaces)
--    • DECIMAL precisions consistent throughout
--    • CHECK constraints use proper MySQL 8 syntax
--    • Foreign-key column types match their parent PKs exactly
--    • analytics_daily.parking_id made nullable (system-wide rows)
--    • Removed duplicate / redundant indexes
--    • Added missing ON DELETE / ON UPDATE rules
--    • Added created_by to promo_codes for audit trail
--    • notifications.read_at renamed to be consistent
--    • Indexes named clearly to avoid collisions
-- ============================================================

CREATE DATABASE IF NOT EXISTS smart_parking
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_parking;

-- ── 1. USERS ────────────────────────────────────────────────
CREATE TABLE users (
    id             INT              NOT NULL AUTO_INCREMENT,
    uuid           VARCHAR(36)      NOT NULL,
    first_name     VARCHAR(50)      NOT NULL,
    last_name      VARCHAR(50)      NOT NULL,
    email          VARCHAR(100)     NOT NULL,
    password       VARCHAR(255)     NOT NULL,
    phone          VARCHAR(20)               DEFAULT NULL,
    avatar         VARCHAR(255)              DEFAULT NULL,
    role           ENUM('user','owner','admin') NOT NULL DEFAULT 'user',
    email_verified TINYINT(1)       NOT NULL DEFAULT 0,
    is_active      TINYINT(1)       NOT NULL DEFAULT 1,
    last_login     TIMESTAMP                 DEFAULT NULL,
    created_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_uuid  (uuid),
    UNIQUE KEY uq_users_email (email),
    INDEX  idx_users_role     (role),
    INDEX  idx_users_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2. PARKING OWNERS (extended info) ───────────────────────
CREATE TABLE parking_owners (
    id               INT           NOT NULL AUTO_INCREMENT,
    user_id          INT           NOT NULL,
    business_name    VARCHAR(100)           DEFAULT NULL,
    business_license VARCHAR(50)            DEFAULT NULL,
    tax_id           VARCHAR(50)            DEFAULT NULL,
    bank_account     VARCHAR(50)            DEFAULT NULL,
    bank_name        VARCHAR(100)           DEFAULT NULL,
    total_earnings   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_verified      TINYINT(1)    NOT NULL DEFAULT 0,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_parking_owners_user (user_id),
    CONSTRAINT fk_po_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 3. PARKING LOCATIONS ────────────────────────────────────
CREATE TABLE parking_locations (
    id                  INT              NOT NULL AUTO_INCREMENT,
    uuid                VARCHAR(36)      NOT NULL,
    owner_id            INT              NOT NULL,
    name                VARCHAR(100)     NOT NULL,
    description         TEXT                      DEFAULT NULL,
    address             VARCHAR(255)     NOT NULL,
    city                VARCHAR(100)     NOT NULL,
    state               VARCHAR(100)              DEFAULT NULL,
    zip_code            VARCHAR(20)               DEFAULT NULL,
    country             VARCHAR(100)     NOT NULL DEFAULT 'India',
    latitude            DECIMAL(10,8)    NOT NULL,
    longitude           DECIMAL(11,8)    NOT NULL,
    total_slots         INT              NOT NULL DEFAULT 0,
    available_slots     INT              NOT NULL DEFAULT 0,
    price_per_hour      DECIMAL(10,2)    NOT NULL,
    price_per_day       DECIMAL(10,2)             DEFAULT NULL,
    currency            CHAR(3)          NOT NULL DEFAULT 'USD',
    is_covered          TINYINT(1)       NOT NULL DEFAULT 0,
    has_ev_charging     TINYINT(1)       NOT NULL DEFAULT 0,
    has_handicap_spots  TINYINT(1)       NOT NULL DEFAULT 0,
    has_security        TINYINT(1)       NOT NULL DEFAULT 0,
    has_cctv            TINYINT(1)       NOT NULL DEFAULT 0,
    opening_time        TIME             NOT NULL DEFAULT '00:00:00',
    closing_time        TIME             NOT NULL DEFAULT '23:59:59',
    is_24_hours         TINYINT(1)       NOT NULL DEFAULT 1,
    is_active           TINYINT(1)       NOT NULL DEFAULT 1,
    is_approved         TINYINT(1)       NOT NULL DEFAULT 0,
    rating              DECIMAL(3,2)     NOT NULL DEFAULT 0.00,
    total_reviews       INT              NOT NULL DEFAULT 0,
    images              JSON                      DEFAULT NULL,
    amenities           JSON                      DEFAULT NULL,
    created_at          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_pl_rating        CHECK (rating BETWEEN 0 AND 5),
    CONSTRAINT chk_pl_slots         CHECK (available_slots >= 0 AND total_slots >= 0),
    CONSTRAINT chk_pl_price         CHECK (price_per_hour >= 0),

    PRIMARY KEY (id),
    UNIQUE KEY uq_pl_uuid          (uuid),
    INDEX  idx_pl_geo              (latitude, longitude),
    INDEX  idx_pl_city             (city),
    INDEX  idx_pl_owner            (owner_id),
    INDEX  idx_pl_active_approved  (is_active, is_approved),
    FULLTEXT INDEX idx_pl_search   (name, address, city),

    CONSTRAINT fk_pl_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 4. PARKING SLOTS ────────────────────────────────────────
CREATE TABLE parking_slots (
    id         INT         NOT NULL AUTO_INCREMENT,
    parking_id INT         NOT NULL,
    slot_number VARCHAR(20) NOT NULL,
    floor      VARCHAR(10) NOT NULL DEFAULT 'G',
    slot_type  ENUM('regular','compact','handicap','ev','motorcycle') NOT NULL DEFAULT 'regular',
    status     ENUM('available','occupied','reserved','maintenance')  NOT NULL DEFAULT 'available',
    is_active  TINYINT(1)  NOT NULL DEFAULT 1,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_slot_per_lot     (parking_id, slot_number),
    INDEX  idx_slot_parking_status (parking_id, status),

    CONSTRAINT fk_slot_parking
        FOREIGN KEY (parking_id) REFERENCES parking_locations(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 5. BOOKINGS ─────────────────────────────────────────────
CREATE TABLE bookings (
    id                  INT           NOT NULL AUTO_INCREMENT,
    uuid                VARCHAR(36)   NOT NULL,
    booking_code        VARCHAR(20)   NOT NULL,
    user_id             INT           NOT NULL,
    parking_id          INT           NOT NULL,
    slot_id             INT                    DEFAULT NULL,
    vehicle_number      VARCHAR(20)   NOT NULL,
    vehicle_type        ENUM('car','motorcycle','ev','truck') NOT NULL DEFAULT 'car',
    start_time          DATETIME      NOT NULL,
    end_time            DATETIME      NOT NULL,
    actual_check_in     DATETIME               DEFAULT NULL,
    actual_check_out    DATETIME               DEFAULT NULL,
    duration_hours      DECIMAL(6,2)  NOT NULL,
    base_amount         DECIMAL(10,2) NOT NULL,
    tax_amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount        DECIMAL(10,2) NOT NULL,
    status              ENUM('pending','confirmed','active','completed',
                             'cancelled','expired','no_show') NOT NULL DEFAULT 'pending',
    payment_status      ENUM('pending','paid','refunded','failed') NOT NULL DEFAULT 'pending',
    qr_code             TEXT                   DEFAULT NULL,
    notes               TEXT                   DEFAULT NULL,
    cancelled_at        DATETIME               DEFAULT NULL,
    cancellation_reason TEXT                   DEFAULT NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_bk_times        CHECK (end_time > start_time),
    CONSTRAINT chk_bk_duration     CHECK (duration_hours > 0),
    CONSTRAINT chk_bk_amounts      CHECK (base_amount >= 0 AND tax_amount >= 0
                                          AND discount_amount >= 0 AND total_amount >= 0),

    PRIMARY KEY (id),
    UNIQUE KEY uq_bk_uuid          (uuid),
    UNIQUE KEY uq_bk_code          (booking_code),
    INDEX  idx_bk_user             (user_id, status),
    INDEX  idx_bk_parking          (parking_id, status),
    INDEX  idx_bk_time             (start_time, end_time),
    INDEX  idx_bk_slot             (slot_id),

    CONSTRAINT fk_bk_user
        FOREIGN KEY (user_id)    REFERENCES users(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_bk_parking
        FOREIGN KEY (parking_id) REFERENCES parking_locations(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_bk_slot
        FOREIGN KEY (slot_id)    REFERENCES parking_slots(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 6. PAYMENTS ─────────────────────────────────────────────
CREATE TABLE payments (
    id               INT           NOT NULL AUTO_INCREMENT,
    uuid             VARCHAR(36)   NOT NULL,
    booking_id       INT           NOT NULL,
    user_id          INT           NOT NULL,
    transaction_id   VARCHAR(100)           DEFAULT NULL,
    payment_method   ENUM('card','upi','wallet','cash','netbanking') NOT NULL DEFAULT 'card',
    amount           DECIMAL(10,2) NOT NULL,
    currency         CHAR(3)       NOT NULL DEFAULT 'USD',
    status           ENUM('pending','processing','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    payment_gateway  VARCHAR(50)            DEFAULT NULL,
    gateway_response JSON                   DEFAULT NULL,
    paid_at          DATETIME               DEFAULT NULL,
    refunded_at      DATETIME               DEFAULT NULL,
    refund_amount    DECIMAL(10,2)          DEFAULT NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_pay_amount       CHECK (amount >= 0),
    CONSTRAINT chk_pay_refund       CHECK (refund_amount IS NULL OR refund_amount >= 0),

    PRIMARY KEY (id),
    UNIQUE KEY uq_pay_uuid          (uuid),
    UNIQUE KEY uq_pay_transaction   (transaction_id),
    INDEX  idx_pay_booking          (booking_id),
    INDEX  idx_pay_user             (user_id),

    CONSTRAINT fk_pay_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_pay_user
        FOREIGN KEY (user_id)    REFERENCES users(id)
        ON DELETE CASCADE  ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 7. REVIEWS ──────────────────────────────────────────────
CREATE TABLE reviews (
    id               INT       NOT NULL AUTO_INCREMENT,
    user_id          INT       NOT NULL,
    parking_id       INT       NOT NULL,
    booking_id       INT                DEFAULT NULL,
    rating           TINYINT   NOT NULL,
    title            VARCHAR(100)       DEFAULT NULL,
    comment          TEXT               DEFAULT NULL,
    is_verified      TINYINT(1) NOT NULL DEFAULT 0,
    is_visible       TINYINT(1) NOT NULL DEFAULT 1,
    helpful_count    INT        NOT NULL DEFAULT 0,
    owner_reply      TEXT               DEFAULT NULL,
    owner_replied_at DATETIME           DEFAULT NULL,
    created_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_rv_rating CHECK (rating BETWEEN 1 AND 5),

    PRIMARY KEY (id),
    -- one review per user per parking location
    UNIQUE KEY uq_rv_user_parking   (user_id, parking_id),
    INDEX  idx_rv_parking           (parking_id, is_visible),
    INDEX  idx_rv_booking           (booking_id),

    CONSTRAINT fk_rv_user
        FOREIGN KEY (user_id)    REFERENCES users(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_rv_parking
        FOREIGN KEY (parking_id) REFERENCES parking_locations(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_rv_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 8. NOTIFICATIONS ────────────────────────────────────────
CREATE TABLE notifications (
    id         INT       NOT NULL AUTO_INCREMENT,
    user_id    INT       NOT NULL,
    type       ENUM('booking','payment','reminder','promotion','system','alert') NOT NULL,
    title      VARCHAR(100) NOT NULL,
    message    TEXT         NOT NULL,
    data       JSON                  DEFAULT NULL,
    is_read    TINYINT(1)   NOT NULL DEFAULT 0,
    read_at    DATETIME              DEFAULT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_notif_user    (user_id, is_read),
    INDEX idx_notif_created (created_at),

    CONSTRAINT fk_notif_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 9. FAVORITES ────────────────────────────────────────────
CREATE TABLE favorites (
    id         INT       NOT NULL AUTO_INCREMENT,
    user_id    INT       NOT NULL,
    parking_id INT       NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_fav_user_parking (user_id, parking_id),

    CONSTRAINT fk_fav_user
        FOREIGN KEY (user_id)    REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_parking
        FOREIGN KEY (parking_id) REFERENCES parking_locations(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 10. PROMO CODES ─────────────────────────────────────────
CREATE TABLE promo_codes (
    id                  INT           NOT NULL AUTO_INCREMENT,
    code                VARCHAR(20)   NOT NULL,
    description         VARCHAR(255)           DEFAULT NULL,
    discount_type       ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
    discount_value      DECIMAL(10,2) NOT NULL,
    max_discount        DECIMAL(10,2)          DEFAULT NULL,
    min_booking_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    max_uses            INT                    DEFAULT NULL,   -- NULL = unlimited
    used_count          INT           NOT NULL DEFAULT 0,
    valid_from          DATETIME      NOT NULL,
    valid_until         DATETIME      NOT NULL,
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_by          INT                    DEFAULT NULL,  -- admin user_id
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_promo_value      CHECK (discount_value > 0),
    CONSTRAINT chk_promo_dates      CHECK (valid_until > valid_from),
    CONSTRAINT chk_promo_used       CHECK (used_count >= 0),

    PRIMARY KEY (id),
    UNIQUE KEY uq_promo_code        (code),
    INDEX  idx_promo_validity       (valid_from, valid_until, is_active),

    CONSTRAINT fk_promo_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 11. PROMO CODE USAGE (junction) ─────────────────────────
--  Tracks which user used which promo on which booking.
--  Prevents double-use and gives a full audit trail.
CREATE TABLE promo_code_usage (
    id          INT       NOT NULL AUTO_INCREMENT,
    promo_id    INT       NOT NULL,
    user_id     INT       NOT NULL,
    booking_id  INT       NOT NULL,
    used_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_pcu_booking (booking_id),          -- one promo per booking
    INDEX  idx_pcu_promo      (promo_id),
    INDEX  idx_pcu_user       (user_id),

    CONSTRAINT fk_pcu_promo
        FOREIGN KEY (promo_id)   REFERENCES promo_codes(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_pcu_user
        FOREIGN KEY (user_id)    REFERENCES users(id)
        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_pcu_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE  ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 12. DAILY ANALYTICS ─────────────────────────────────────
CREATE TABLE analytics_daily (
    id                   INT           NOT NULL AUTO_INCREMENT,
    parking_id           INT                    DEFAULT NULL,  -- NULL = platform total
    date                 DATE          NOT NULL,
    total_bookings       INT           NOT NULL DEFAULT 0,
    completed_bookings   INT           NOT NULL DEFAULT 0,
    cancelled_bookings   INT           NOT NULL DEFAULT 0,
    total_revenue        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    average_occupancy    DECIMAL(5,2)  NOT NULL DEFAULT 0.00,  -- percentage 0-100
    peak_hour            TINYINT                DEFAULT NULL,  -- 0-23

    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_ad_occupancy     CHECK (average_occupancy BETWEEN 0 AND 100),
    CONSTRAINT chk_ad_peak_hour     CHECK (peak_hour IS NULL OR peak_hour BETWEEN 0 AND 23),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ad_parking_date   (parking_id, date),
    INDEX  idx_ad_date              (date),

    CONSTRAINT fk_ad_parking
        FOREIGN KEY (parking_id) REFERENCES parking_locations(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 13. VEHICLES (saved per user) ───────────────────────────
--  Separates vehicle management from the bookings table.
CREATE TABLE vehicles (
    id             INT         NOT NULL AUTO_INCREMENT,
    user_id        INT         NOT NULL,
    registration   VARCHAR(20) NOT NULL,
    vehicle_type   ENUM('car','motorcycle','ev','truck') NOT NULL DEFAULT 'car',
    label          VARCHAR(50)          DEFAULT NULL,  -- e.g. "My Tesla"
    is_primary     TINYINT(1)  NOT NULL DEFAULT 0,
    created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_vehicle_user_reg  (user_id, registration),
    INDEX  idx_vehicle_user         (user_id),

    CONSTRAINT fk_veh_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payments 
  ADD COLUMN razorpay_order_id VARCHAR(100),
  ADD COLUMN razorpay_payment_id VARCHAR(100),
  ADD COLUMN razorpay_signature VARCHAR(255),
  ADD COLUMN razorpay_refund_id VARCHAR(100);
