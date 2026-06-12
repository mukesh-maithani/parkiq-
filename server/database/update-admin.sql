-- ============================================================
--  Run this script if you ALREADY have an admin user in the DB
--  and just want to update their email + password.
--
--  New credentials:
--    Email:    vijayc123@gmail.com
--    Password: Vijay@123
-- ============================================================

USE smart_parking;

UPDATE users
SET
    email      = 'vijayc123@gmail.com',
    password   = '$2a$12$9E.yttiXgjzivuJ5wE9Y8eIr3RG4cgh3XLw3SBa630DuslwZGPQ8e',
    first_name = 'Vijay',
    last_name  = 'Admin',
    is_active  = 1,
    email_verified = 1
WHERE role = 'admin'
LIMIT 1;

SELECT 'Admin credentials updated successfully.' AS result;
SELECT id, email, first_name, last_name, role, is_active FROM users WHERE role = 'admin';
