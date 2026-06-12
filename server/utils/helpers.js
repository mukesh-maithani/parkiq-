/**
 * Utility Helper Functions
 */

const { v4: uuidv4 } = require('uuid');

// Generate UUID
const generateUUID = () => uuidv4();

// Generate booking code
const generateBookingCode = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK-${timestamp}-${random}`;
};

// Generate transaction ID
const generateTransactionId = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
};

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

// Convert degrees to radians
const toRad = (deg) => deg * (Math.PI / 180);

// Format currency
const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount);
};

// Calculate booking duration in hours
const calculateDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.ceil(diffHours * 100) / 100; // Round up to 2 decimal places
};

// Calculate booking amount
const calculateBookingAmount = (pricePerHour, duration, taxRate = 0.1) => {
    const baseAmount = pricePerHour * duration;
    const taxAmount = baseAmount * taxRate;
    const totalAmount = baseAmount + taxAmount;
    
    return {
        baseAmount: Math.round(baseAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100
    };
};

// Pagination helper
const paginate = (page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    return { limit: parseInt(limit), offset };
};

// Format pagination response
const formatPaginationResponse = (data, total, page, limit) => {
    const totalPages = Math.ceil(total / limit);
    
    return {
        data,
        pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: total,
            itemsPerPage: parseInt(limit),
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    };
};

// Check if parking is open
const isParkingOpen = (openingTime, closingTime, is24Hours) => {
    if (is24Hours) return true;
    
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    
    return currentTime >= openingTime && currentTime <= closingTime;
};

// Get slot availability status
const getAvailabilityStatus = (available, total) => {
    const percentage = (available / total) * 100;
    
    if (percentage === 0) return { status: 'full', color: 'red' };
    if (percentage <= 20) return { status: 'limited', color: 'orange' };
    if (percentage <= 50) return { status: 'moderate', color: 'yellow' };
    return { status: 'available', color: 'green' };
};

// Sanitize object for SQL (remove undefined values)
const sanitizeForSQL = (obj) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

module.exports = {
    generateUUID,
    generateBookingCode,
    generateTransactionId,
    calculateDistance,
    formatCurrency,
    calculateDuration,
    calculateBookingAmount,
    paginate,
    formatPaginationResponse,
    isParkingOpen,
    getAvailabilityStatus,
    sanitizeForSQL
};
