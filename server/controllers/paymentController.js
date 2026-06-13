/**
 * Payment Controller
 * Handles payment processing and verification with Razorpay
 */

const { query } = require('../config/db');
const { generateUUID, generateTransactionId } = require('../utils/helpers');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create payment (Razorpay order banao)
exports.createPayment = async (req, res, next) => {
    try {
        const { bookingId, paymentMethod = 'card' } = req.body;
        const userId = req.user.id;

        // Get booking
        const bookings = await query(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ? AND payment_status = ?',
            [bookingId, userId, 'pending']
        );

        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pending booking not found'
            });
        }

        const booking = bookings[0];

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(parseFloat(booking.total_amount) * 100), // paise mein
            currency: 'INR',
            receipt: `receipt_${bookingId}`,
            notes: {
                bookingId: bookingId,
                userId: userId,
            },
        });

        // Save payment record in DB
        const uuid = generateUUID();
        const transactionId = generateTransactionId();

        await query(`
            INSERT INTO payments (uuid, booking_id, user_id, transaction_id, payment_method, amount, status, razorpay_order_id)
            VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
        `, [uuid, bookingId, userId, transactionId, paymentMethod, booking.total_amount, order.id]);

        res.status(201).json({
            success: true,
            message: 'Payment initiated',
            data: {
                orderId: order.id,
                transactionId,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
            }
        });
    } catch (error) {
        next(error);
    }
};

// Verify payment (signature check + booking confirm)
exports.verifyPayment = async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

        // Step 1: Verify Razorpay signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed — invalid signature'
            });
        }

        // Step 2: Get payment record
        const payments = await query(
            'SELECT p.*, b.booking_code FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE p.razorpay_order_id = ?',
            [razorpay_order_id]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        const payment = payments[0];

        // Step 3: Update payment status
        await query(
            'UPDATE payments SET status = ?, razorpay_payment_id = ?, razorpay_signature = ?, paid_at = NOW() WHERE id = ?',
            ['completed', razorpay_payment_id, razorpay_signature, payment.id]
        );

        // Step 4: Update booking status
        await query(
            'UPDATE bookings SET status = ?, payment_status = ? WHERE id = ?',
            ['confirmed', 'paid', payment.booking_id]
        );

        // Step 4b: Credit owner's total_earnings with base_amount (their listed price)
        const bookingRow = await query('SELECT base_amount, parking_id FROM bookings WHERE id = ?', [payment.booking_id]);
        if (bookingRow.length > 0) {
            const { base_amount, parking_id } = bookingRow[0];
            await query(`
                UPDATE parking_owners po
                JOIN parking_locations pl ON pl.owner_id = po.user_id
                SET po.total_earnings = po.total_earnings + ?
                WHERE pl.id = ?
            `, [parseFloat(base_amount), parking_id]);
        }

        // Step 5: Create notification
        await query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (?, 'payment', 'Payment Successful', ?, ?)
        `, [
            payment.user_id,
            `Your payment of ₹${payment.amount} for booking ${payment.booking_code} was successful.`,
            JSON.stringify({ bookingId: payment.booking_id, razorpay_payment_id })
        ]);

        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                transactionId: payment.transaction_id,
                bookingId: payment.booking_id,
                bookingCode: payment.booking_code,
                amount: parseFloat(payment.amount),
                status: 'completed'
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get payment history
exports.getPaymentHistory = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const payments = await query(`
            SELECT p.*, b.booking_code, pl.name as parking_name
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            JOIN parking_locations pl ON b.parking_id = pl.id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, parseInt(limit), offset]);

        const countResult = await query(
            'SELECT COUNT(*) as total FROM payments WHERE user_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: payments.map(p => ({
                id: p.id,
                transactionId: p.transaction_id,
                bookingCode: p.booking_code,
                parkingName: p.parking_name,
                amount: parseFloat(p.amount),
                paymentMethod: p.payment_method,
                status: p.status,
                paidAt: p.paid_at,
                createdAt: p.created_at
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(countResult[0].total / limit),
                totalItems: countResult[0].total
            }
        });
    } catch (error) {
        next(error);
    }
};

// Request refund
exports.requestRefund = async (req, res, next) => {
    try {
        const { bookingId, reason } = req.body;
        const userId = req.user.id;

        // Get payment
        const payments = await query(`
            SELECT p.*, b.status as booking_status
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            WHERE p.booking_id = ? AND p.user_id = ? AND p.status = 'completed'
        `, [bookingId, userId]);

        if (payments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Eligible payment not found'
            });
        }

        const payment = payments[0];

        // Only allow refund for cancelled bookings
        if (payment.booking_status !== 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Refund only available for cancelled bookings'
            });
        }

        // Process refund via Razorpay
        const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
            amount: Math.round(parseFloat(payment.amount) * 100), // paise mein
            notes: { reason: reason || 'Booking cancelled' }
        });

        await query(
            'UPDATE payments SET status = ?, refunded_at = NOW(), refund_amount = ?, razorpay_refund_id = ? WHERE id = ?',
            ['refunded', payment.amount, refund.id, payment.id]
        );

        await query(
            'UPDATE bookings SET payment_status = ? WHERE id = ?',
            ['refunded', bookingId]
        );

        res.json({
            success: true,
            message: 'Refund processed successfully',
            data: {
                refundId: refund.id,
                refundAmount: parseFloat(payment.amount)
            }
        });
    } catch (error) {
        next(error);
    }
};

// Admin: Get revenue analytics
exports.getRevenueAnalytics = async (req, res, next) => {
    try {
        const { startDate, endDate, parkingId } = req.query;

        let sql = `
            SELECT 
                DATE(p.paid_at) as date,
                COUNT(*) as transactions,
                SUM(p.amount) as revenue
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            WHERE p.status = 'completed'
        `;
        const params = [];

        if (startDate) {
            sql += ' AND p.paid_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            sql += ' AND p.paid_at <= ?';
            params.push(endDate);
        }

        if (parkingId) {
            sql += ' AND b.parking_id = ?';
            params.push(parkingId);
        }

        sql += ' GROUP BY DATE(p.paid_at) ORDER BY date DESC LIMIT 30';

        const dailyRevenue = await query(sql, params);

        // Get totals
        let totalsSql = `
            SELECT 
                COUNT(*) as total_transactions,
                SUM(amount) as total_revenue,
                AVG(amount) as avg_transaction
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            WHERE p.status = 'completed'
        `;

        if (parkingId) {
            totalsSql += ' AND b.parking_id = ?';
        }

        const totals = await query(totalsSql, parkingId ? [parkingId] : []);

        res.json({
            success: true,
            data: {
                daily: dailyRevenue.map(d => ({
                    date: d.date,
                    transactions: d.transactions,
                    revenue: parseFloat(d.revenue)
                })),
                summary: {
                    totalTransactions: totals[0].total_transactions || 0,
                    totalRevenue: parseFloat(totals[0].total_revenue) || 0,
                    avgTransaction: parseFloat(totals[0].avg_transaction) || 0
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// Razorpay 3DS callback — receives POST redirect from bank after card auth
// No auth middleware here (Razorpay posts directly, no user token)
exports.razorpayCallback = async (req, res) => {
    const callbackBase = '/pages/payment-callback.html';
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const bookingId = req.query.bookingId;

        // Payment failed at bank — Razorpay sends error fields instead of signature
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            const reason = req.body.error
                ? (req.body.error.description || req.body.error.reason || 'Payment declined by bank')
                : 'Payment was not completed';
            return res.redirect(
                `${callbackBase}?status=failed&message=${encodeURIComponent(reason)}`
            );
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.redirect(
                `${callbackBase}?status=failed&message=${encodeURIComponent('Signature verification failed')}`
            );
        }

        // Get payment record
        const payments = await query(
            'SELECT p.*, b.booking_code FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE p.razorpay_order_id = ?',
            [razorpay_order_id]
        );

        if (payments.length === 0) {
            return res.redirect(
                `${callbackBase}?status=failed&message=${encodeURIComponent('Payment record not found')}`
            );
        }

        const payment = payments[0];

        // Update payment status
        await query(
            'UPDATE payments SET status = ?, razorpay_payment_id = ?, razorpay_signature = ?, paid_at = NOW() WHERE id = ?',
            ['completed', razorpay_payment_id, razorpay_signature, payment.id]
        );

        // Update booking status
        await query(
            'UPDATE bookings SET status = ?, payment_status = ? WHERE id = ?',
            ['confirmed', 'paid', payment.booking_id]
        );

        // Credit owner's total_earnings with base_amount
        const bookingRow2 = await query('SELECT base_amount, parking_id FROM bookings WHERE id = ?', [payment.booking_id]);
        if (bookingRow2.length > 0) {
            const { base_amount, parking_id } = bookingRow2[0];
            await query(`
                UPDATE parking_owners po
                JOIN parking_locations pl ON pl.owner_id = po.user_id
                SET po.total_earnings = po.total_earnings + ?
                WHERE pl.id = ?
            `, [parseFloat(base_amount), parking_id]);
        }

        // Create notification
        await query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (?, 'payment', 'Payment Successful', ?, ?)
        `, [
            payment.user_id,
            `Your payment of ₹${payment.amount} for booking ${payment.booking_code} was successful.`,
            JSON.stringify({ bookingId: payment.booking_id, razorpay_payment_id })
        ]);

        return res.redirect(
            `${callbackBase}?status=success&bookingCode=${encodeURIComponent(payment.booking_code)}&amount=${encodeURIComponent(payment.amount)}&bookingId=${payment.booking_id}`
        );

    } catch (error) {
        console.error('Razorpay callback error:', error);
        return res.redirect(
            `${callbackBase}?status=failed&message=${encodeURIComponent('Server error during verification')}`
        );
    }
};
