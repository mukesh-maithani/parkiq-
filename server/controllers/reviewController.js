/**
 * Review Controller
 * Handles parking reviews and ratings
 */

const { query } = require('../config/db');

// Create review
exports.createReview = async (req, res, next) => {
    try {
        const { parkingId, bookingId, rating, title, comment } = req.body;
        const userId = req.user.id;
        
        // Check if parking exists
        const parking = await query(
            'SELECT id FROM parking_locations WHERE id = ? AND is_active = TRUE',
            [parkingId]
        );
        
        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking location not found'
            });
        }
        
        // Check for existing review
        const existingReview = await query(
            'SELECT id FROM reviews WHERE user_id = ? AND parking_id = ?',
            [userId, parkingId]
        );
        
        if (existingReview.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this parking location'
            });
        }
        
        // Check if user has completed booking at this parking
        let isVerified = false;
        if (bookingId) {
            const booking = await query(
                'SELECT id FROM bookings WHERE id = ? AND user_id = ? AND parking_id = ? AND status = ?',
                [bookingId, userId, parkingId, 'completed']
            );
            isVerified = booking.length > 0;
        }
        
        // Create review
        const result = await query(`
            INSERT INTO reviews (user_id, parking_id, booking_id, rating, title, comment, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, parkingId, bookingId || null, rating, title || null, comment || null, isVerified]);
        
        // Update parking rating
        await query(`
            UPDATE parking_locations p
            SET rating = (
                SELECT AVG(rating) FROM reviews WHERE parking_id = p.id AND is_visible = TRUE
            ),
            total_reviews = (
                SELECT COUNT(*) FROM reviews WHERE parking_id = p.id AND is_visible = TRUE
            )
            WHERE p.id = ?
        `, [parkingId]);
        
        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: {
                id: result.insertId,
                rating,
                isVerified
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get reviews for parking
exports.getParkingReviews = async (req, res, next) => {
    try {
        const { parkingId } = req.params;
        const { page = 1, limit = 10, sortBy = 'recent' } = req.query;
        const offset = (page - 1) * limit;
        
        let sql = `
            SELECT r.*, u.first_name, u.last_name, u.avatar
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.parking_id = ? AND r.is_visible = TRUE
        `;
        
        switch (sortBy) {
            case 'highest':
                sql += ' ORDER BY r.rating DESC, r.created_at DESC';
                break;
            case 'lowest':
                sql += ' ORDER BY r.rating ASC, r.created_at DESC';
                break;
            case 'helpful':
                sql += ' ORDER BY r.helpful_count DESC, r.created_at DESC';
                break;
            default:
                sql += ' ORDER BY r.created_at DESC';
        }
        
        const countResult = await query(
            `SELECT COUNT(*) as total FROM reviews WHERE parking_id = ? AND is_visible = TRUE`,
            [parkingId]
        );
        
        sql += ' LIMIT ? OFFSET ?';
        
        const reviews = await query(sql, [parkingId, parseInt(limit), offset]);
        
        // Get rating distribution
        const distribution = await query(`
            SELECT rating, COUNT(*) as count
            FROM reviews
            WHERE parking_id = ? AND is_visible = TRUE
            GROUP BY rating
        `, [parkingId]);
        
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        distribution.forEach(d => {
            ratingDistribution[d.rating] = d.count;
        });
        
        res.json({
            success: true,
            data: reviews.map(r => ({
                id: r.id,
                rating: r.rating,
                title: r.title,
                comment: r.comment,
                isVerified: r.is_verified,
                helpfulCount: r.helpful_count,
                ownerReply: r.owner_reply,
                ownerRepliedAt: r.owner_replied_at,
                createdAt: r.created_at,
                user: {
                    firstName: r.first_name,
                    lastName: r.last_name,
                    avatar: r.avatar
                }
            })),
            ratingDistribution,
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

// Mark review as helpful
exports.markHelpful = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        await query(
            'UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Marked as helpful'
        });
    } catch (error) {
        next(error);
    }
};

// Owner reply to review
exports.replyToReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;
        
        // Get review and verify ownership
        const reviews = await query(`
            SELECT r.*, p.owner_id 
            FROM reviews r
            JOIN parking_locations p ON r.parking_id = p.id
            WHERE r.id = ?
        `, [id]);
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        
        if (reviews[0].owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to reply to this review'
            });
        }
        
        await query(
            'UPDATE reviews SET owner_reply = ?, owner_replied_at = NOW() WHERE id = ?',
            [reply, id]
        );
        
        res.json({
            success: true,
            message: 'Reply added successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Delete review (review author only)
exports.deleteReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const reviews = await query('SELECT user_id, parking_id FROM reviews WHERE id = ?', [id]);
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        
        if (reviews[0].user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this review'
            });
        }
        
        // Soft delete
        await query('UPDATE reviews SET is_visible = FALSE WHERE id = ?', [id]);
        
        // Update parking rating
        await query(`
            UPDATE parking_locations p
            SET rating = COALESCE((
                SELECT AVG(rating) FROM reviews WHERE parking_id = p.id AND is_visible = TRUE
            ), 0),
            total_reviews = (
                SELECT COUNT(*) FROM reviews WHERE parking_id = p.id AND is_visible = TRUE
            )
            WHERE p.id = ?
        `, [reviews[0].parking_id]);
        
        res.json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Get top reviews across all parking locations (for homepage)
exports.getTopReviews = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 6, 12);

        const reviews = await query(`
            SELECT r.id, r.rating, r.comment, r.created_at,
                   u.first_name, u.last_name,
                   pl.name AS parking_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            JOIN parking_locations pl ON r.parking_id = pl.id
            WHERE r.is_visible = TRUE
              AND r.rating >= 4
              AND r.comment IS NOT NULL
              AND CHAR_LENGTH(TRIM(r.comment)) > 20
            ORDER BY r.rating DESC, r.helpful_count DESC, r.created_at DESC
            LIMIT ?
        `, [limit]);

        res.json({
            success: true,
            data: reviews.map(r => ({
                id:          r.id,
                rating:      r.rating,
                comment:     r.comment,
                createdAt:   r.created_at,
                firstName:   r.first_name,
                lastName:    r.last_name,
                parkingName: r.parking_name
            }))
        });
    } catch (error) {
        next(error);
    }
};
