/**
 * Notification Service
 * Handles in-app notifications for users
 * Extensible for email/SMS via third-party providers (e.g. Nodemailer, Twilio)
 */

const { query } = require('../config/db');
const { NOTIFICATION_TYPES } = require('../utils/constants');

/**
 * Create a new notification for a user
 * @param {number} userId - Target user ID
 * @param {string} type   - Notification type (see NOTIFICATION_TYPES)
 * @param {string} title  - Short title
 * @param {string} message - Full notification message
 * @param {object} data   - Optional JSON payload (booking id, promo code, etc.)
 */
const createNotification = async (userId, type, title, message, data = null) => {
    try {
        const result = await query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, type, title, message, data ? JSON.stringify(data) : null]
        );

        return {
            id: result.insertId,
            userId,
            type,
            title,
            message,
            data,
            isRead: false,
            createdAt: new Date()
        };
    } catch (error) {
        console.error('[NotificationService] createNotification error:', error.message);
        throw error;
    }
};

/**
 * Get all notifications for a user (with pagination)
 * @param {number} userId
 * @param {object} options - { page, limit, unreadOnly }
 */
const getUserNotifications = async (userId, options = {}) => {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const offset = (page - 1) * limit;

    let sql = `
        SELECT id, type, title, message, data, is_read, read_at, created_at
        FROM notifications
        WHERE user_id = ?
    `;
    const params = [userId];

    if (unreadOnly) {
        sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const notifications = await query(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?';
    const countParams = [userId];
    if (unreadOnly) {
        countSql += ' AND is_read = FALSE';
    }
    const [{ total }] = await query(countSql, countParams);

    return {
        notifications: notifications.map(n => ({
            ...n,
            data: n.data ? JSON.parse(n.data) : null
        })),
        pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: parseInt(limit)
        }
    };
};

/**
 * Mark a single notification as read
 * @param {number} notificationId
 * @param {number} userId - For ownership check
 */
const markAsRead = async (notificationId, userId) => {
    const result = await query(
        `UPDATE notifications
         SET is_read = TRUE, read_at = NOW()
         WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
    );

    if (result.affectedRows === 0) {
        throw new Error('Notification not found or access denied');
    }

    return true;
};

/**
 * Mark all notifications as read for a user
 * @param {number} userId
 */
const markAllAsRead = async (userId) => {
    await query(
        `UPDATE notifications
         SET is_read = TRUE, read_at = NOW()
         WHERE user_id = ? AND is_read = FALSE`,
        [userId]
    );
    return true;
};

/**
 * Delete a notification
 * @param {number} notificationId
 * @param {number} userId
 */
const deleteNotification = async (notificationId, userId) => {
    const result = await query(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [notificationId, userId]
    );

    if (result.affectedRows === 0) {
        throw new Error('Notification not found or access denied');
    }

    return true;
};

/**
 * Get unread notification count for a user
 * @param {number} userId
 */
const getUnreadCount = async (userId) => {
    const [{ count }] = await query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
        [userId]
    );
    return count;
};

// ─────────────────────────────────────────────
// Pre-built notification helpers
// ─────────────────────────────────────────────

/**
 * Notify user when booking is confirmed
 */
const notifyBookingConfirmed = async (userId, booking) => {
    return createNotification(
        userId,
        NOTIFICATION_TYPES.BOOKING,
        'Booking Confirmed ✅',
        `Your booking ${booking.bookingCode} has been confirmed. See you at ${booking.parkingName}!`,
        { bookingId: booking.id, bookingCode: booking.bookingCode }
    );
};

/**
 * Notify user when booking is cancelled
 */
const notifyBookingCancelled = async (userId, booking) => {
    return createNotification(
        userId,
        NOTIFICATION_TYPES.BOOKING,
        'Booking Cancelled',
        `Your booking ${booking.bookingCode} has been cancelled. ${booking.refundAmount ? `Refund of $${booking.refundAmount} will be processed.` : ''}`,
        { bookingId: booking.id, bookingCode: booking.bookingCode }
    );
};

/**
 * Notify user 1 hour before parking starts
 */
const notifyParkingReminder = async (userId, booking) => {
    return createNotification(
        userId,
        NOTIFICATION_TYPES.REMINDER,
        '⏰ Parking Starts Soon',
        `Your parking session at ${booking.parkingName} starts in 1 hour. Booking code: ${booking.bookingCode}`,
        { bookingId: booking.id }
    );
};

/**
 * Notify user when payment is successful
 */
const notifyPaymentSuccess = async (userId, payment) => {
    return createNotification(
        userId,
        NOTIFICATION_TYPES.PAYMENT,
        'Payment Successful 💳',
        `Payment of $${payment.amount} received for booking ${payment.bookingCode}.`,
        { paymentId: payment.id, amount: payment.amount }
    );
};

/**
 * Notify user when payment fails
 */
const notifyPaymentFailed = async (userId, payment) => {
    return createNotification(
        userId,
        NOTIFICATION_TYPES.PAYMENT,
        'Payment Failed ❌',
        `Your payment of $${payment.amount} could not be processed. Please try again.`,
        { paymentId: payment.id }
    );
};

/**
 * Send a promotional notification to multiple users
 * @param {number[]} userIds
 * @param {string} title
 * @param {string} message
 * @param {object} data
 */
const sendPromotion = async (userIds, title, message, data = {}) => {
    const results = [];
    for (const userId of userIds) {
        try {
            const notification = await createNotification(
                userId,
                NOTIFICATION_TYPES.PROMOTION,
                title,
                message,
                data
            );
            results.push({ userId, success: true, notificationId: notification.id });
        } catch (error) {
            results.push({ userId, success: false, error: error.message });
        }
    }
    return results;
};

/**
 * Send a system alert to a user (e.g. account changes, security alerts)
 */
const sendSystemAlert = async (userId, title, message, data = {}) => {
    return createNotification(userId, NOTIFICATION_TYPES.SYSTEM, title, message, data);
};

module.exports = {
    createNotification,
    getUserNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getUnreadCount,
    notifyBookingConfirmed,
    notifyBookingCancelled,
    notifyParkingReminder,
    notifyPaymentSuccess,
    notifyPaymentFailed,
    sendPromotion,
    sendSystemAlert
};
