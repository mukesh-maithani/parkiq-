/**
 * Booking Controller
 * Handles booking creation, cancellation, and management
 */

const { query, transaction } = require('../config/db');
const { generateUUID, generateBookingCode, calculateDuration, calculateBookingAmount } = require('../utils/helpers');
const { generateBookingQR } = require('../services/qrService');

// Create new booking
exports.createBooking = async (req, res, next) => {
    try {
        const {
            parkingId,
            vehicleNumber,
            vehicleType = 'car',
            startTime,
            endTime,
            slotId,
            promoCode
        } = req.body;
        
        const userId = req.user.id;
        
        // Check parking availability
        const parking = await query(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM parking_slots ps WHERE ps.parking_id = p.id AND ps.status = 'available') as available
            FROM parking_locations p
            WHERE p.id = ? AND p.is_active = TRUE AND p.is_approved = TRUE
        `, [parkingId]);
        
        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking location not found or not available'
            });
        }
        
        const parkingData = parking[0];
        
        if (parkingData.available <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No slots available at this parking location'
            });
        }
        
        // Check for overlapping bookings for same user
        const existingBooking = await query(`
            SELECT id FROM bookings 
            WHERE user_id = ? 
            AND parking_id = ?
            AND status IN ('pending', 'confirmed', 'active')
            AND (
                (start_time <= ? AND end_time >= ?) OR
                (start_time <= ? AND end_time >= ?) OR
                (start_time >= ? AND end_time <= ?)
            )
        `, [userId, parkingId, startTime, startTime, endTime, endTime, startTime, endTime]);
        
        if (existingBooking.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'You already have a booking at this location during this time'
            });
        }
        
        // Calculate pricing
        const duration = calculateDuration(startTime, endTime);
        const { baseAmount, taxAmount, totalAmount } = calculateBookingAmount(
            parseFloat(parkingData.price_per_hour),
            duration
        );
        
        // Apply promo code if provided
        let discountAmount = 0;
        if (promoCode) {
            const promo = await query(`
                SELECT * FROM promo_codes 
                WHERE code = ? 
                AND is_active = TRUE 
                AND valid_from <= NOW() 
                AND valid_until >= NOW()
                AND (max_uses IS NULL OR used_count < max_uses)
            `, [promoCode.toUpperCase()]);
            
            if (promo.length > 0) {
                const promoData = promo[0];
                if (baseAmount >= promoData.min_booking_amount) {
                    if (promoData.discount_type === 'percentage') {
                        discountAmount = (baseAmount * promoData.discount_value) / 100;
                        if (promoData.max_discount) {
                            discountAmount = Math.min(discountAmount, parseFloat(promoData.max_discount));
                        }
                    } else {
                        discountAmount = parseFloat(promoData.discount_value);
                    }
                    
                    // Update promo usage
                    await query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', [promoData.id]);
                }
            }
        }
        
        const finalAmount = Math.max(0, totalAmount - discountAmount);
        
        // Create booking
        const uuid = generateUUID();
        const bookingCode = generateBookingCode();
        
        // Find available slot if not specified
        let assignedSlotId = slotId;
        if (!assignedSlotId) {
            const availableSlots = await query(`
                SELECT id FROM parking_slots 
                WHERE parking_id = ? AND status = 'available' 
                LIMIT 1
            `, [parkingId]);
            
            if (availableSlots.length > 0) {
                assignedSlotId = availableSlots[0].id;
            }
        }
        
        const result = await query(`
            INSERT INTO bookings (
                uuid, booking_code, user_id, parking_id, slot_id,
                vehicle_number, vehicle_type, start_time, end_time,
                duration_hours, base_amount, tax_amount, discount_amount, total_amount,
                status, payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
        `, [
            uuid, bookingCode, userId, parkingId, assignedSlotId,
            vehicleNumber.toUpperCase(), vehicleType, startTime, endTime,
            duration, baseAmount, taxAmount, discountAmount, finalAmount
        ]);
        
        const bookingId = result.insertId;
        
        // Generate QR code
        const qrCode = await generateBookingQR({
            bookingCode,
            parkingId,
            vehicleNumber: vehicleNumber.toUpperCase(),
            startTime,
            endTime
        });
        
        // Update booking with QR code
        await query('UPDATE bookings SET qr_code = ? WHERE id = ?', [qrCode, bookingId]);
        
        // Reserve the slot if assigned
        if (assignedSlotId) {
            await query('UPDATE parking_slots SET status = ? WHERE id = ?', ['reserved', assignedSlotId]);
            
            // Update available slots count
            await query(`
                UPDATE parking_locations 
                SET available_slots = available_slots - 1 
                WHERE id = ? AND available_slots > 0
            `, [parkingId]);
        }
        
        // Create notification
        await query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (?, 'booking', 'Booking Created', ?, ?)
        `, [
            userId,
            `Your booking ${bookingCode} at ${parkingData.name} has been created. Please complete payment to confirm.`,
            JSON.stringify({ bookingId, bookingCode })
        ]);
        
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: {
                id: bookingId,
                uuid,
                bookingCode,
                parking: {
                    id: parkingData.id,
                    name: parkingData.name,
                    address: parkingData.address
                },
                vehicleNumber: vehicleNumber.toUpperCase(),
                vehicleType,
                startTime,
                endTime,
                duration,
                pricing: {
                    baseAmount,
                    taxAmount,
                    discountAmount,
                    totalAmount: finalAmount
                },
                status: 'pending',
                qrCode
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get user's bookings
exports.getUserBookings = async (req, res, next) => {
    try {
        const userId = req.params.userId || req.user.id;
        const { status, page = 1, limit = 10 } = req.query;
        
        // Authorization check
        if (req.user.id !== parseInt(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const offset = (page - 1) * limit;
        
        let sql = `
            SELECT b.*, 
                   p.name as parking_name, p.address as parking_address, 
                   p.city as parking_city, p.latitude, p.longitude
            FROM bookings b
            JOIN parking_locations p ON b.parking_id = p.id
            WHERE b.user_id = ?
        `;
        const params = [userId];
        
        if (status) {
            sql += ' AND b.status = ?';
            params.push(status);
        }
        
        // Count
        const countResult = await query(
            sql.replace('SELECT b.*, p.name as parking_name, p.address as parking_address, p.city as parking_city, p.latitude, p.longitude', 'SELECT COUNT(*) as total'),
            params
        );
        
        sql += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const bookings = await query(sql, params);
        
        res.json({
            success: true,
            data: bookings.map(b => ({
                id: b.id,
                uuid: b.uuid,
                bookingCode: b.booking_code,
                parking: {
                    id: b.parking_id,
                    name: b.parking_name,
                    address: b.parking_address,
                    city: b.parking_city,
                    latitude: parseFloat(b.latitude),
                    longitude: parseFloat(b.longitude)
                },
                vehicleNumber: b.vehicle_number,
                vehicleType: b.vehicle_type,
                startTime: b.start_time,
                endTime: b.end_time,
                duration: b.duration_hours,
                pricing: {
                    baseAmount: parseFloat(b.base_amount),
                    taxAmount: parseFloat(b.tax_amount),
                    discountAmount: parseFloat(b.discount_amount),
                    totalAmount: parseFloat(b.total_amount)
                },
                status: b.status,
                paymentStatus: b.payment_status,
                qrCode: b.qr_code,
                createdAt: b.created_at
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

// Get single booking
exports.getBookingById = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const bookings = await query(`
            SELECT b.*, 
                   p.name as parking_name, p.address as parking_address, 
                   p.city as parking_city, p.latitude, p.longitude, p.owner_id,
                   ps.slot_number, ps.floor
            FROM bookings b
            JOIN parking_locations p ON b.parking_id = p.id
            LEFT JOIN parking_slots ps ON b.slot_id = ps.id
            WHERE b.id = ?
        `, [id]);
        
        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        const b = bookings[0];
        
        // Authorization check
        if (req.user.id !== b.user_id && req.user.id !== b.owner_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        res.json({
            success: true,
            data: {
                id: b.id,
                uuid: b.uuid,
                bookingCode: b.booking_code,
                parking: {
                    id: b.parking_id,
                    name: b.parking_name,
                    address: b.parking_address,
                    city: b.parking_city,
                    latitude: parseFloat(b.latitude),
                    longitude: parseFloat(b.longitude)
                },
                slot: b.slot_id ? {
                    id: b.slot_id,
                    number: b.slot_number,
                    floor: b.floor
                } : null,
                vehicleNumber: b.vehicle_number,
                vehicleType: b.vehicle_type,
                startTime: b.start_time,
                endTime: b.end_time,
                actualCheckIn: b.actual_check_in,
                actualCheckOut: b.actual_check_out,
                duration: b.duration_hours,
                pricing: {
                    baseAmount: parseFloat(b.base_amount),
                    taxAmount: parseFloat(b.tax_amount),
                    discountAmount: parseFloat(b.discount_amount),
                    totalAmount: parseFloat(b.total_amount)
                },
                status: b.status,
                paymentStatus: b.payment_status,
                qrCode: b.qr_code,
                notes: b.notes,
                cancellationReason: b.cancellation_reason,
                createdAt: b.created_at
            }
        });
    } catch (error) {
        next(error);
    }
};

// Cancel booking
exports.cancelBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const bookings = await query(
            'SELECT * FROM bookings WHERE id = ?',
            [id]
        );
        
        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        const booking = bookings[0];
        
        // Authorization check
        if (req.user.id !== booking.user_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Check if cancellable
        if (!['pending', 'confirmed'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel booking with status: ${booking.status}`
            });
        }
        
        // Update booking
        await query(`
            UPDATE bookings 
            SET status = 'cancelled', 
                cancelled_at = NOW(), 
                cancellation_reason = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [reason || 'Cancelled by user', id]);
        
        // Release slot
        if (booking.slot_id) {
            await query('UPDATE parking_slots SET status = ? WHERE id = ?', ['available', booking.slot_id]);
            
            // Update available count
            await query(`
                UPDATE parking_locations 
                SET available_slots = available_slots + 1 
                WHERE id = ?
            `, [booking.parking_id]);
        }
        
        // Create notification
        await query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (?, 'booking', 'Booking Cancelled', ?, ?)
        `, [
            booking.user_id,
            `Your booking ${booking.booking_code} has been cancelled.`,
            JSON.stringify({ bookingId: id })
        ]);
        
        res.json({
            success: true,
            message: 'Booking cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Check-in
exports.checkIn = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const bookings = await query(
            'SELECT * FROM bookings WHERE id = ? AND status = ?',
            [id, 'confirmed']
        );
        
        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Confirmed booking not found'
            });
        }
        
        await query(`
            UPDATE bookings 
            SET status = 'active', actual_check_in = NOW(), updated_at = NOW()
            WHERE id = ?
        `, [id]);
        
        if (bookings[0].slot_id) {
            await query('UPDATE parking_slots SET status = ? WHERE id = ?', ['occupied', bookings[0].slot_id]);
        }
        
        res.json({
            success: true,
            message: 'Check-in successful'
        });
    } catch (error) {
        next(error);
    }
};

// Check-out
exports.checkOut = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const bookings = await query(
            'SELECT * FROM bookings WHERE id = ? AND status = ?',
            [id, 'active']
        );
        
        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Active booking not found'
            });
        }
        
        await query(`
            UPDATE bookings 
            SET status = 'completed', actual_check_out = NOW(), updated_at = NOW()
            WHERE id = ?
        `, [id]);
        
        if (bookings[0].slot_id) {
            await query('UPDATE parking_slots SET status = ? WHERE id = ?', ['available', bookings[0].slot_id]);
            
            await query(`
                UPDATE parking_locations 
                SET available_slots = available_slots + 1 
                WHERE id = ?
            `, [bookings[0].parking_id]);
        }
        
        res.json({
            success: true,
            message: 'Check-out successful'
        });
    } catch (error) {
        next(error);
    }
};

// Get parking bookings (for owner)
exports.getParkingBookings = async (req, res, next) => {
    try {
        const { parkingId } = req.params;
        const { status, date, page = 1, limit = 20 } = req.query;
        
        // Verify ownership
        const parking = await query('SELECT owner_id FROM parking_locations WHERE id = ?', [parkingId]);
        
        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking not found'
            });
        }
        
        if (parking[0].owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const offset = (page - 1) * limit;
        
        let sql = `
            SELECT b.*, u.first_name, u.last_name, u.email, u.phone,
                   ps.slot_number, ps.floor
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN parking_slots ps ON b.slot_id = ps.id
            WHERE b.parking_id = ?
        `;
        const params = [parkingId];
        
        if (status) {
            sql += ' AND b.status = ?';
            params.push(status);
        }
        
        if (date) {
            sql += ' AND DATE(b.start_time) = ?';
            params.push(date);
        }
        
        const countResult = await query(
            sql.replace('SELECT b.*, u.first_name, u.last_name, u.email, u.phone, ps.slot_number, ps.floor', 'SELECT COUNT(*) as total'),
            params
        );
        
        sql += ' ORDER BY b.start_time DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const bookings = await query(sql, params);
        
        res.json({
            success: true,
            data: bookings.map(b => ({
                id: b.id,
                bookingCode: b.booking_code,
                user: {
                    firstName: b.first_name,
                    lastName: b.last_name,
                    email: b.email,
                    phone: b.phone
                },
                slot: b.slot_id ? { number: b.slot_number, floor: b.floor } : null,
                vehicleNumber: b.vehicle_number,
                vehicleType: b.vehicle_type,
                startTime: b.start_time,
                endTime: b.end_time,
                totalAmount: parseFloat(b.total_amount),
                status: b.status,
                paymentStatus: b.payment_status
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

