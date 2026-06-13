/**
 * Parking Controller
 * Handles parking location CRUD and search operations
 */

const { query, transaction } = require('../config/db');
const { generateUUID, paginate, formatPaginationResponse, isParkingOpen, getAvailabilityStatus } = require('../utils/helpers');
const { findNearbyParking, getRecommendations } = require('../services/locationService');
// Safely parse JSON columns — handles plain strings, arrays, and null
function safeJsonParse(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch {
            // Plain comma-separated string like "EV Charging, Covered"
            return val.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    return [];
}



// Get all parking locations with filters
exports.getAllParking = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            city,
            search,
            hasEVCharging,
            isCovered,
            minRating,
            maxPrice,
            sortBy = 'rating'
        } = req.query;

        const { limit: queryLimit, offset } = paginate(page, limit);

        let sql = `
            SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name
            FROM parking_locations p
            JOIN users u ON p.owner_id = u.id
            WHERE p.is_active = TRUE AND p.is_approved = TRUE
        `;
        const params = [];

        if (city) {
            sql += ' AND p.city = ?';
            params.push(city);
        }

        if (search) {
            sql += ' AND (p.name LIKE ? OR p.address LIKE ? OR p.city LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (hasEVCharging === 'true') {
            sql += ' AND p.has_ev_charging = TRUE';
        }

        if (isCovered === 'true') {
            sql += ' AND p.is_covered = TRUE';
        }

        if (minRating) {
            sql += ' AND p.rating >= ?';
            params.push(parseFloat(minRating));
        }

        if (maxPrice) {
            sql += ' AND p.price_per_hour <= ?';
            params.push(parseFloat(maxPrice));
        }

        // Get total count
        const countSql = sql.replace('SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name', 'SELECT COUNT(*) as total');
        const countResult = await query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        switch (sortBy) {
            case 'price_low':
                sql += ' ORDER BY p.price_per_hour ASC';
                break;
            case 'price_high':
                sql += ' ORDER BY p.price_per_hour DESC';
                break;
            case 'availability':
                sql += ' ORDER BY (p.available_slots / p.total_slots) DESC';
                break;
            default:
                sql += ' ORDER BY p.rating DESC, p.total_reviews DESC';
        }

        sql += ' LIMIT ? OFFSET ?';
        params.push(queryLimit, offset);

        const parking = await query(sql, params);

        // Format response
        const formattedParking = parking.map(p => ({
            id: p.id,
            uuid: p.uuid,
            name: p.name,
            description: p.description,
            address: p.address,
            city: p.city,
            state: p.state,
            zipCode: p.zip_code,
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            totalSlots: p.total_slots,
            availableSlots: p.available_slots,
            pricePerHour: parseFloat(p.price_per_hour),
            pricePerDay: p.price_per_day ? parseFloat(p.price_per_day) : null,
            isCovered: p.is_covered,
            hasEVCharging: p.has_ev_charging,
            hasHandicapSpots: p.has_handicap_spots,
            hasSecurity: p.has_security,
            hasCCTV: p.has_cctv,
            is24Hours: p.is_24_hours,
            openingTime: p.opening_time,
            closingTime: p.closing_time,
            isOpen: isParkingOpen(p.opening_time, p.closing_time, p.is_24_hours),
            rating: parseFloat(p.rating),
            totalReviews: p.total_reviews,
            availability: getAvailabilityStatus(p.available_slots, p.total_slots),
            images: safeJsonParse(p.images),
            amenities: safeJsonParse(p.amenities),
            owner: {
                firstName: p.owner_first_name,
                lastName: p.owner_last_name
            }
        }));

        res.json({
            success: true,
            ...formatPaginationResponse(formattedParking, total, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

// Get nearby parking locations
exports.getNearbyParking = async (req, res, next) => {
    try {
        const { latitude, longitude, radius = 10, limit = 20, sortBy = 'distance' } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const parking = await findNearbyParking(
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(radius),
            { limit: parseInt(limit), sortBy }
        );

        const formattedParking = parking.map(p => ({
            id: p.id,
            uuid: p.uuid,
            name: p.name,
            address: p.address,
            city: p.city,
            state: p.state,
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            totalSlots: p.total_slots,
            availableSlots: p.available_slots,
            pricePerHour: parseFloat(p.price_per_hour),
            pricePerDay: p.price_per_day ? parseFloat(p.price_per_day) : null,
            isCovered: p.is_covered,
            hasEVCharging: p.has_ev_charging,
            hasHandicapSpots: p.has_handicap_spots,
            hasSecurity: p.has_security,
            hasCCTV: p.has_cctv,
            is24Hours: p.is_24_hours,
            openingTime: p.opening_time,
            closingTime: p.closing_time,
            isOpen: isParkingOpen(p.opening_time, p.closing_time, p.is_24_hours),
            rating: parseFloat(p.rating),
            totalReviews: p.total_reviews,
            images: safeJsonParse(p.images),
            amenities: safeJsonParse(p.amenities),
            distance: p.distance,
            distanceText: p.distanceText,
            availability: getAvailabilityStatus(p.available_slots, p.total_slots)
        }));

        res.json({
            success: true,
            data: formattedParking,
            total: formattedParking.length
        });
    } catch (error) {
        next(error);
    }
};

// Get parking recommendations
exports.getRecommendations = async (req, res, next) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const recommendations = await getRecommendations(
            parseFloat(latitude),
            parseFloat(longitude)
        );

        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        next(error);
    }
};

// Get single parking by ID
exports.getParkingById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const parking = await query(`
            SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
                   u.email as owner_email, u.phone as owner_phone
            FROM parking_locations p
            JOIN users u ON p.owner_id = u.id
            WHERE p.id = ? AND p.is_active = TRUE AND p.is_approved = TRUE
        `, [id]);

        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking location not found'
            });
        }

        const p = parking[0];

        // Get parking slots
        const slots = await query(
            'SELECT * FROM parking_slots WHERE parking_id = ? AND is_active = TRUE ORDER BY floor, slot_number',
            [id]
        );

        // Get recent reviews
        const reviews = await query(`
            SELECT r.*, u.first_name, u.last_name, u.avatar
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.parking_id = ? AND r.is_visible = TRUE
            ORDER BY r.created_at DESC
            LIMIT 5
        `, [id]);

        res.json({
            success: true,
            data: {
                id: p.id,
                uuid: p.uuid,
                name: p.name,
                description: p.description,
                address: p.address,
                city: p.city,
                state: p.state,
                zipCode: p.zip_code,
                country: p.country,
                latitude: parseFloat(p.latitude),
                longitude: parseFloat(p.longitude),
                totalSlots: p.total_slots,
                availableSlots: p.available_slots,
                pricePerHour: parseFloat(p.price_per_hour),
                pricePerDay: p.price_per_day ? parseFloat(p.price_per_day) : null,
                currency: p.currency,
                isCovered: p.is_covered,
                hasEVCharging: p.has_ev_charging,
                hasHandicapSpots: p.has_handicap_spots,
                hasSecurity: p.has_security,
                hasCCTV: p.has_cctv,
                is24Hours: p.is_24_hours,
                openingTime: p.opening_time,
                closingTime: p.closing_time,
                isOpen: isParkingOpen(p.opening_time, p.closing_time, p.is_24_hours),
                rating: parseFloat(p.rating),
                totalReviews: p.total_reviews,
                availability: getAvailabilityStatus(p.available_slots, p.total_slots),
                images: safeJsonParse(p.images),
                amenities: safeJsonParse(p.amenities),
                owner: {
                    firstName: p.owner_first_name,
                    lastName: p.owner_last_name
                },
                slots: slots.map(s => ({
                    id: s.id,
                    slotNumber: s.slot_number,
                    floor: s.floor,
                    type: s.slot_type,
                    status: s.status
                })),
                recentReviews: reviews.map(r => ({
                    id: r.id,
                    rating: r.rating,
                    title: r.title,
                    comment: r.comment,
                    isVerified: r.is_verified,
                    createdAt: r.created_at,
                    user: {
                        firstName: r.first_name,
                        lastName: r.last_name,
                        avatar: r.avatar
                    }
                }))
            }
        });
    } catch (error) {
        next(error);
    }
};

// Create parking location (Owner/Admin)
exports.createParking = async (req, res, next) => {
    try {
        console.log('========== CREATE PARKING ==========');
        console.log('User:', req.user);
        console.log('Body:', req.body);
        const {
            name, description, address, city, state, zipCode, country,
            latitude, longitude, totalSlots, pricePerHour, pricePerDay,
            priceBike, priceCar, priceHeavy,
            isCovered, hasEVCharging, hasHandicapSpots, hasSecurity, hasCCTV,
            is24Hours, openingTime, closingTime, amenities
        } = req.body;

        // Vehicle-type pricing
        const vehiclePricing = {
            bike: parseFloat(priceBike) || parseFloat(pricePerHour) || 20,
            car: parseFloat(priceCar) || parseFloat(pricePerHour) || 50,
            heavy: parseFloat(priceHeavy) || (parseFloat(pricePerHour) * 2) || 100
        };
        const basePrice = vehiclePricing.car; // Use car price as the base/display price

        // Validate coordinates — reject if missing or zero
        if (!latitude || !longitude || parseFloat(latitude) === 0 || parseFloat(longitude) === 0) {
            return res.status(400).json({ success: false, message: 'Please pin your parking location on the map. Latitude and longitude are required.' });
        }

        const uuid = generateUUID();
        // Admin can specify ownerId for the target owner; owners use their own id
        const ownerId = (req.user.role === 'admin' && req.body.ownerId)
            ? parseInt(req.body.ownerId)
            : req.user.id;

        // Admin-created lots are auto-approved; owner submissions need approval
        const isApproved = req.user.role === 'admin';

        const enrichedAmenities = [
            ...(amenities || []),
            `Bike: ₹${vehiclePricing.bike}/hr`,
            `Car: ₹${vehiclePricing.car}/hr`,
            `Heavy: ₹${vehiclePricing.heavy}/hr`
        ];

        const result = await query(`
            INSERT INTO parking_locations (
                uuid, owner_id, name, description, address, city, state, zip_code, country,
                latitude, longitude, total_slots, available_slots, price_per_hour, price_per_day,
                is_covered, has_ev_charging, has_handicap_spots, has_security, has_cctv,
                is_24_hours, opening_time, closing_time, is_approved, amenities
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            uuid, ownerId, name, description || null, address, city, state || null, zipCode || null, country || 'India',
            parseFloat(latitude), parseFloat(longitude), totalSlots, totalSlots, basePrice, pricePerDay || null,
            isCovered || false, hasEVCharging || false, hasHandicapSpots || false, hasSecurity || false, hasCCTV || false,
            is24Hours !== false, openingTime || '00:00:00', closingTime || '23:59:59', isApproved,
            JSON.stringify(enrichedAmenities)
        ]);
        console.log('INSERT RESULT:', result);
        const parkingId = result.insertId;

        // Generate default parking slots
        const slotValues = [];
        for (let i = 1; i <= totalSlots; i++) {
            const floor = i <= 50 ? 'G' : i <= 100 ? '1' : '2';
            const slotNumber = `${floor}${String(i % 50 || 50).padStart(2, '0')}`;
            slotValues.push([parkingId, slotNumber, floor, 'regular', 'available']);
        }

        if (slotValues.length > 0) {
            await query(
                `INSERT INTO parking_slots (parking_id, slot_number, floor, slot_type, status)
                 VALUES ${slotValues.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
                slotValues.flat()
            );
        }

        res.status(201).json({
            success: true,
            message: 'Parking location published successfully',
            data: {
                id: parkingId,
                uuid,
                name,
                isApproved
            }
        });
    } catch (error) {
        console.error('CREATE PARKING ERROR:', error);
        next(error);
    }
};

// Update parking location
exports.updateParking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check ownership
        const parking = await query(
            'SELECT owner_id FROM parking_locations WHERE id = ?',
            [id]
        );

        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking location not found'
            });
        }

        if (parking[0].owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this parking location'
            });
        }

        // Build update query
        const allowedFields = [
            'name', 'description', 'address', 'city', 'state', 'zip_code',
            'price_per_hour', 'price_per_day', 'is_covered', 'has_ev_charging',
            'has_handicap_spots', 'has_security', 'has_cctv', 'is_24_hours',
            'opening_time', 'closing_time', 'amenities'
        ];

        const updateParts = [];
        const params = [];

        // Map camelCase to snake_case
        const fieldMap = {
            pricePerHour: 'price_per_hour',
            pricePerDay: 'price_per_day',
            isCovered: 'is_covered',
            hasEVCharging: 'has_ev_charging',
            hasHandicapSpots: 'has_handicap_spots',
            hasSecurity: 'has_security',
            hasCCTV: 'has_cctv',
            is24Hours: 'is_24_hours',
            openingTime: 'opening_time',
            closingTime: 'closing_time',
            zipCode: 'zip_code'
        };

        for (const [key, value] of Object.entries(updates)) {
            const dbField = fieldMap[key] || key;
            if (allowedFields.includes(dbField) && value !== undefined) {
                updateParts.push(`${dbField} = ?`);
                if (dbField === 'amenities') {
                    params.push(JSON.stringify(value));
                } else {
                    params.push(value);
                }
            }
        }

        if (updateParts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        params.push(id);

        await query(
            `UPDATE parking_locations SET ${updateParts.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
        );

        res.json({
            success: true,
            message: 'Parking location updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Delete parking location
exports.deleteParking = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check ownership
        const parking = await query(
            'SELECT owner_id FROM parking_locations WHERE id = ?',
            [id]
        );

        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking location not found'
            });
        }

        if (parking[0].owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this parking location'
            });
        }

        // Soft delete
        await query(
            'UPDATE parking_locations SET is_active = FALSE, updated_at = NOW() WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Parking location deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Get owner's parking locations
exports.getOwnerParking = async (req, res, next) => {
    try {
        const ownerId = req.user.id;

        const parking = await query(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM bookings b WHERE b.parking_id = p.id AND b.status IN ('confirmed', 'active')) as active_bookings,
                   (SELECT SUM(total_amount) FROM bookings b WHERE b.parking_id = p.id AND b.status = 'completed' AND b.payment_status = 'paid') as total_revenue
            FROM parking_locations p
            WHERE p.owner_id = ? AND p.is_active = TRUE
            ORDER BY p.created_at DESC
        `, [ownerId]);

        res.json({
            success: true,
            data: parking.map(p => ({
                id: p.id,
                uuid: p.uuid,
                name: p.name,
                address: p.address,
                city: p.city,
                totalSlots: p.total_slots,
                availableSlots: p.available_slots,
                pricePerHour: parseFloat(p.price_per_hour),
                rating: parseFloat(p.rating),
                totalReviews: p.total_reviews,
                isApproved: p.is_approved,
                activeBookings: p.active_bookings || 0,
                totalRevenue: parseFloat(p.total_revenue) || 0,
                availability: getAvailabilityStatus(p.available_slots, p.total_slots),
                createdAt: p.created_at
            }))
        });
    } catch (error) {
        next(error);
    }
};


// Update slot status
exports.updateSlotStatus = async (req, res, next) => {
    try {
        const { parkingId, slotId } = req.params;
        const { status } = req.body;

        // Verify ownership
        const parking = await query(
            'SELECT owner_id FROM parking_locations WHERE id = ?',
            [parkingId]
        );

        if (parking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Parking not found'
            });
        }

        if (parking[0].owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        await query(
            'UPDATE parking_slots SET status = ? WHERE id = ? AND parking_id = ?',
            [status, slotId, parkingId]
        );

        // Update available count
        await query(`
            UPDATE parking_locations p
            SET available_slots = (
                SELECT COUNT(*) FROM parking_slots ps 
                WHERE ps.parking_id = p.id AND ps.status = 'available'
            )
            WHERE p.id = ?
        `, [parkingId]);

        res.json({
            success: true,
            message: 'Slot status updated'
        });
    } catch (error) {
        next(error);
    }
};

// ── Admin: Get all parking (with optional approval filter) ──
exports.adminGetAllParking = async (req, res, next) => {
    try {
        const { isApproved, limit = 50 } = req.query;
        let sql = `
            SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name, u.email as owner_email
            FROM parking_locations p
            JOIN users u ON p.owner_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (isApproved !== undefined) {
            sql += ' AND p.is_approved = ?';
            params.push(isApproved === 'true' || isApproved === '1' ? 1 : 0);
        }
        sql += ` ORDER BY p.created_at DESC LIMIT ${Number(limit) || 50}`;

        const rows = await query(sql, params);
        const lots = rows.map(p => ({
            id: p.id,
            name: p.name,
            city: p.city,
            state: p.state,
            address: p.address,
            totalSlots: p.total_slots,
            availableSlots: p.available_slots,
            pricePerHour: p.price_per_hour,
            isApproved: p.is_approved,
            isActive: p.is_active,
            rating: p.rating,
            createdAt: p.created_at,
            owner: { id: p.owner_id, firstName: p.owner_first_name, lastName: p.owner_last_name, email: p.owner_email }
        }));

        res.json({ success: true, data: lots });
    } catch (error) { next(error); }
};

// ── Admin: Approve parking lot ──
exports.adminApproveLot = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Sync available_slots from actual slot rows before going live
        await query(`
            UPDATE parking_locations
            SET is_approved = 1,
                is_active   = 1,
                available_slots = (
                    SELECT COUNT(*) FROM parking_slots
                    WHERE parking_id = ? AND status = 'available' AND is_active = TRUE
                ),
                total_slots = (
                    SELECT COUNT(*) FROM parking_slots
                    WHERE parking_id = ? AND is_active = TRUE
                )
            WHERE id = ?
        `, [id, id, id]);

        res.json({ success: true, message: 'Parking lot approved' });
    } catch (error) { next(error); }
};

// ── Admin: Reject (delete) parking lot ──
exports.adminRejectLot = async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('UPDATE parking_locations SET is_approved = 0, is_active = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: 'Parking lot rejected' });
    } catch (error) { next(error); }
};

// ── Admin: Deactivate parking lot ──
exports.adminDeactivateLot = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        await query('UPDATE parking_locations SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
        res.json({ success: true, message: active ? 'Parking lot activated' : 'Parking lot deactivated' });
    } catch (error) { next(error); }
};

// ── Admin: Delete parking lot ──
exports.adminDeleteLot = async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM parking_locations WHERE id = ?', [id]);
        res.json({ success: true, message: 'Parking lot deleted' });
    } catch (error) { next(error); }
};
e