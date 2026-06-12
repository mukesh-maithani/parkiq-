-- ============================================================
--  Smart Parking System — Seed Data (Production-ready)
--  Only seeds the admin account and starter promo codes.
--  All other data (owners, users, parking lots, bookings)
--  will come from real registrations and usage.
-- ============================================================

USE smart_parking;

-- ─────────────────────────────────────────────────────────────
-- 1. ADMIN USER
--    Email:    vijayc123@gmail.com
--    Password: Vijay@123
--    Hash generated with bcrypt cost 12.
-- ─────────────────────────────────────────────────────────────
INSERT INTO users
    (uuid, first_name, last_name, email, password, phone, role, email_verified, is_active)
VALUES
(UUID(), 'Vijay', 'Chandra', 'vijayc123@gmail.com',
 '$2a$12$9E.yttiXgjzivuJ5wE9Y8eIr3RG4cgh3XLw3SBa630DuslwZGPQ8e',
 NULL, 'admin', 1, 1);
-- admin user id = 1 (first record)


-- ─────────────────────────────────────────────────────────────
-- 2. STARTER PROMO CODES  (created_by = admin = id 1)
--    Remove or edit these before going live if not needed.
-- ─────────────────────────────────────────────────────────────
INSERT INTO promo_codes
    (code, description, discount_type, discount_value, max_discount,
     min_booking_amount, max_uses, used_count,
     valid_from, valid_until, is_active, created_by)
VALUES
('WELCOME10', 'Welcome discount for new users',
 'percentage', 10.00, 150.00, 50.00, 1000, 0,
 NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 1, 1);

-- ─────────────────────────────────────────────────────────────
-- DONE
-- Run this file once after schema.sql to initialise the system.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- UPDATE SCRIPT: If admin already exists (re-run safety)
-- Run this if you already have an admin and need to update creds.
-- ─────────────────────────────────────────────────────────────
-- UPDATE users
-- SET email = 'vijayc123@gmail.com',
--     password = '$2a$12$9E.yttiXgjzivuJ5wE9Y8eIr3RG4cgh3XLw3SBa630DuslwZGPQ8e',
--     first_name = 'Vijay',
--     last_name = 'Chandra'
-- WHERE role = 'admin' LIMIT 1;
