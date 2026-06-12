/**
 * Location & Distance Service
 * Handles geolocation calculations and nearby parking searches
 */

const { query } = require('../config/db');
const { calculateDistance } = require('../utils/helpers');

// Find nearby parking locations
const findNearbyParking = async (latitude, longitude, radiusKm = 10, options = {}) => {
    const {
        limit = 20,
        sortBy = 'distance',
        hasEVCharging,
        isCovered,
        maxPrice,
        minRating
    } = options;

    // Build inner query — compute distance, keep all columns
    // Wrap in a subquery so we can filter on the computed 'distance' in WHERE (not HAVING)
    let innerConditions = `p.is_active = TRUE AND p.is_approved = TRUE`;
    const innerParams = [latitude, longitude, latitude];

    if (hasEVCharging !== undefined) {
        innerConditions += ' AND p.has_ev_charging = ?';
        innerParams.push(hasEVCharging);
    }
    if (isCovered !== undefined) {
        innerConditions += ' AND p.is_covered = ?';
        innerParams.push(isCovered);
    }
    if (maxPrice) {
        innerConditions += ' AND p.price_per_hour <= ?';
        innerParams.push(maxPrice);
    }
    if (minRating) {
        innerConditions += ' AND p.rating >= ?';
        innerParams.push(minRating);
    }

    // Subquery computes distance; outer query filters by radius and sorts
    let orderClause;
    switch (sortBy) {
        case 'price':       orderClause = 'price_per_hour ASC, dist ASC'; break;
        case 'rating':      orderClause = 'rating DESC, dist ASC'; break;
        case 'availability':orderClause = '(available_slots / total_slots) DESC, dist ASC'; break;
        default:            orderClause = 'dist ASC';
    }

    const sql = `
        SELECT *
        FROM (
            SELECT
                p.*,
                (
                    6371 * acos(
                        LEAST(1.0,
                            cos(radians(?)) * cos(radians(p.latitude)) *
                            cos(radians(p.longitude) - radians(?)) +
                            sin(radians(?)) * sin(radians(p.latitude))
                        )
                    )
                ) AS dist
            FROM parking_locations p
            WHERE ${innerConditions}
        ) AS located
        WHERE dist <= ?
        ORDER BY ${orderClause}
        LIMIT ?
    `;

    const params = [...innerParams, radiusKm, limit];
    const results = await query(sql, params);
    
    // Add formatted distance
    return results.map(parking => ({
        ...parking,
        distance: Math.round(parking.dist * 100) / 100,
        distanceText: parking.dist < 1 
            ? `${Math.round(parking.dist * 1000)} m`
            : `${parking.dist.toFixed(1)} km`
    }));
};

// Get parking recommendations
const getRecommendations = async (latitude, longitude, userPreferences = {}) => {
    const radiusKm = 15;
    
    // Get all nearby parking
    const nearbyParking = await findNearbyParking(latitude, longitude, radiusKm, { limit: 50 });
    
    if (nearbyParking.length === 0) {
        return {
            nearest: [],
            cheapest: [],
            bestRated: [],
            leastCrowded: []
        };
    }
    
    // Nearest parking
    const nearest = [...nearbyParking]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
    
    // Cheapest parking
    const cheapest = [...nearbyParking]
        .sort((a, b) => a.price_per_hour - b.price_per_hour)
        .slice(0, 5);
    
    // Best rated parking
    const bestRated = [...nearbyParking]
        .filter(p => p.total_reviews >= 5)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5);
    
    // Least crowded (highest availability percentage)
    const leastCrowded = [...nearbyParking]
        .filter(p => p.available_slots > 0)
        .sort((a, b) => (b.available_slots / b.total_slots) - (a.available_slots / a.total_slots))
        .slice(0, 5);
    
    return {
        nearest,
        cheapest,
        bestRated,
        leastCrowded
    };
};

// Calculate estimated travel time (simplified)
const estimateTravelTime = (distanceKm, mode = 'driving') => {
    // Average speeds in km/h
    const speeds = {
        walking: 5,
        cycling: 15,
        driving: 30 // Accounting for urban traffic
    };
    
    const speed = speeds[mode] || speeds.driving;
    const timeHours = distanceKm / speed;
    const timeMinutes = Math.ceil(timeHours * 60);
    
    return {
        minutes: timeMinutes,
        text: timeMinutes < 60 
            ? `${timeMinutes} min`
            : `${Math.floor(timeMinutes / 60)}h ${timeMinutes % 60}min`
    };
};

module.exports = {
    findNearbyParking,
    getRecommendations,
    estimateTravelTime
};
