/**
 * User Controller
 * Handles user profile and account management
 */

const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// Get user profile
exports.getProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const users = await query(
            `SELECT u.id, u.uuid, u.first_name, u.last_name, u.email, u.phone, u.avatar, 
                    u.role, u.email_verified, u.created_at,
                    (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as total_bookings,
                    (SELECT COUNT(*) FROM bookings WHERE user_id = u.id AND status = 'completed') as completed_bookings,
                    (SELECT COUNT(*) FROM reviews WHERE user_id = u.id) as total_reviews
             FROM users u WHERE u.id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Get owner info if applicable
        let ownerInfo = null;
        if (user.role === 'owner') {
            const owners = await query(
                `SELECT business_name, is_verified, total_earnings
                 FROM parking_owners WHERE user_id = ?`,
                [userId]
            );
            if (owners.length > 0) {
                ownerInfo = owners[0];
            }
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                uuid: user.uuid,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                role: user.role,
                emailVerified: user.email_verified,
                createdAt: user.created_at,
                stats: {
                    totalBookings: user.total_bookings,
                    completedBookings: user.completed_bookings,
                    totalReviews: user.total_reviews
                },
                ...(ownerInfo && { ownerInfo })
            }
        });
    } catch (error) {
        next(error);
    }
};

// Update user profile
exports.updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, phone } = req.body;

        // Build update query
        const updates = [];
        const params = [];

        if (firstName) {
            updates.push('first_name = ?');
            params.push(firstName);
        }
        if (lastName) {
            updates.push('last_name = ?');
            params.push(lastName);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(userId);

        await query(
            `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
        );

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Change password
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get current password hash
        const users = await query(
            'SELECT password FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, users[0].password);

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await query(
            'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
};



// ── Admin: Get all users ──
exports.adminGetAllUsers = async (req, res, next) => {
    try {
        const { role, search, limit = 100 } = req.query;
        let sql = `SELECT id, uuid, first_name, last_name, email, phone, role, is_active, created_at,
                   (SELECT COUNT(*) FROM bookings WHERE user_id = users.id) as booking_count
                   FROM users WHERE 1=1`;
        const params = [];
        if (role) { sql += ' AND role = ?'; params.push(role); }
        if (search) { sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
        sql += ` ORDER BY created_at DESC LIMIT ${Number(limit) || 100}`;
        const rows = await query(sql, params);
        res.json({
            success: true, data: rows.map(u => ({
                id: u.id, uuid: u.uuid, firstName: u.first_name, lastName: u.last_name,
                email: u.email, phone: u.phone, role: u.role, isActive: u.is_active,
                createdAt: u.created_at, bookingCount: u.booking_count
            }))
        });
    } catch (error) { next(error); }
};

// ── Admin: Toggle user active state (block/unblock) ──
exports.adminToggleUserActive = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        await query('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
        res.json({ success: true, message: active ? 'User unblocked' : 'User blocked' });
    } catch (error) { next(error); }
};

// ── Admin: Delete user ──
exports.adminDeleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'User deleted' });
    } catch (error) { next(error); }
};


// ── Admin: Platform Overview Stats ──
exports.adminGetStats = async (req, res, next) => {
    try {
        const [totals] = await Promise.all([
            require('../config/db').query(`
                SELECT
                    (SELECT COUNT(*) FROM users WHERE role != 'admin') AS total_users,
                    (SELECT COUNT(*) FROM bookings) AS total_bookings,
                    (SELECT COALESCE(SUM(total_amount),0) FROM bookings WHERE payment_status = 'paid') AS total_revenue,
                    (SELECT COUNT(*) FROM parking_locations WHERE is_approved = 0 AND is_active = 1) AS pending_approvals,
                    (SELECT COUNT(*) FROM parking_locations WHERE is_approved = 1) AS approved_lots
            `)
        ]);
        const row = totals[0];
        res.json({
            success: true, data: {
                totalUsers: row.total_users,
                totalBookings: row.total_bookings,
                totalRevenue: parseFloat(row.total_revenue) || 0,
                pendingApprovals: row.pending_approvals,
                approvedLots: row.approved_lots
            }
        });
    } catch (error) { next(error); }
};

// ── Admin: Get all bookings ──
exports.adminGetAllBookings = async (req, res, next) => {
    try {
        const { search, status, limit = 100, offset = 0 } = req.query;
        let sql = `
            SELECT b.id, b.booking_code, b.status, b.payment_status,
                   b.start_time, b.end_time, b.duration_hours,
                   b.base_amount, b.tax_amount, b.total_amount,
                   b.vehicle_number, b.vehicle_type, b.created_at,
                   u.first_name, u.last_name, u.email,
                   p.name AS parking_name, p.city
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            JOIN parking_locations p ON p.id = b.parking_id
            WHERE 1=1`;
        const params = [];
        if (status) { sql += ' AND b.status = ?'; params.push(status); }
        if (search) { sql += ' AND (b.booking_code LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR p.name LIKE ?)'; const s = `%${search}%`; params.push(s, s, s, s); }
        sql += ` ORDER BY b.created_at DESC
         LIMIT ${Number(limit) || 100}
         OFFSET ${Number(offset) || 0}`;
        const rows = await require('../config/db').query(sql, params);
        res.json({
            success: true, data: rows.map(b => ({
                id: b.id, bookingCode: b.booking_code, status: b.status,
                paymentStatus: b.payment_status,
                startTime: b.start_time, endTime: b.end_time,
                durationHours: b.duration_hours,
                baseAmount: parseFloat(b.base_amount),
                taxAmount: parseFloat(b.tax_amount),
                totalAmount: parseFloat(b.total_amount),
                vehicleNumber: b.vehicle_number, vehicleType: b.vehicle_type,
                createdAt: b.created_at,
                user: { firstName: b.first_name, lastName: b.last_name, email: b.email },
                parking: { name: b.parking_name, city: b.city }
            }))
        });
    } catch (error) { next(error); }
};

// ── Admin: Cancel a booking ──
exports.adminCancelBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        await require('../config/db').query(
            `UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [id]
        );
        res.json({ success: true, message: 'Booking cancelled' });
    } catch (error) { next(error); }
};

// ── Admin: Get all promo codes ──
exports.adminGetPromos = async (req, res, next) => {
    try {
        const rows = await require('../config/db').query(
            `SELECT id, code, description, discount_type, discount_value, max_discount,
                    max_uses, used_count, valid_from, valid_until, is_active, created_at
             FROM promo_codes ORDER BY created_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
};

// ── Admin: Create promo code ──
exports.adminCreatePromo = async (req, res, next) => {
    try {
        const { code, description, discountType, discountValue, maxDiscount, maxUses, validFrom, validUntil } = req.body;
        await require('../config/db').query(
            `INSERT INTO promo_codes (code, description, discount_type, discount_value, max_discount, max_uses, valid_from, valid_until, is_active, created_by)
             VALUES (?,?,?,?,?,?,?,?,1,?)`,
            [code.toUpperCase(), description || '', discountType, discountValue, maxDiscount || null, maxUses || null, validFrom, validUntil, req.user.id]
        );
        res.status(201).json({ success: true, message: 'Promo code created' });
    } catch (error) { next(error); }
};

// ── Admin: Toggle promo active ──
exports.adminTogglePromo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        await require('../config/db').query(`UPDATE promo_codes SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
        res.json({ success: true, message: active ? 'Promo enabled' : 'Promo disabled' });
    } catch (error) { next(error); }
};

// ── Admin: Delete promo code ──
exports.adminDeletePromo = async (req, res, next) => {
    try {
        const { id } = req.params;
        await require('../config/db').query(`DELETE FROM promo_codes WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Promo code deleted' });
    } catch (error) { next(error); }
};

// ── Admin: Revenue chart (last 7 days) ──
exports.adminRevenueChart = async (req, res, next) => {
    try {
        const rows = await require('../config/db').query(`
            SELECT DATE(created_at) AS day,
                   COUNT(*) AS bookings,
                   COALESCE(SUM(total_amount),0) AS revenue
            FROM bookings
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND payment_status = 'paid'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        `);
        res.json({
            success: true, data: rows.map(r => ({
                day: r.day, bookings: r.bookings, revenue: parseFloat(r.revenue)
            }))
        });
    } catch (error) { next(error); }
};

// ── Admin: Get all owners (for dropdowns) ──
exports.adminGetAllOwners = async (req, res, next) => {
    try {
        const rows = await require('../config/db').query(
            `SELECT u.id, u.first_name, u.last_name, u.email
             FROM users u WHERE u.role = 'owner' AND u.is_active = 1
             ORDER BY u.first_name ASC`
        );
        res.json({
            success: true, data: rows.map(u => ({
                id: u.id,
                firstName: u.first_name,
                lastName: u.last_name,
                email: u.email
            }))
        });
    } catch (error) { next(error); }
};
