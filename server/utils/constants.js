/**
 * Application Constants
 * Central place for all enums, config values, and magic strings
 * Import this file wherever you need shared constants
 */

// ─────────────────────────────────────────────
// User roles
// ─────────────────────────────────────────────
const USER_ROLES = Object.freeze({
    USER: 'user',
    OWNER: 'owner',
    ADMIN: 'admin'
});

// ─────────────────────────────────────────────
// Booking statuses
// ─────────────────────────────────────────────
const BOOKING_STATUS = Object.freeze({
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired',
    NO_SHOW: 'no_show'
});

// ─────────────────────────────────────────────
// Payment statuses
// ─────────────────────────────────────────────
const PAYMENT_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded'
});

// ─────────────────────────────────────────────
// Payment methods
// ─────────────────────────────────────────────
const PAYMENT_METHOD = Object.freeze({
    CARD: 'card',
    UPI: 'upi',
    WALLET: 'wallet',
    CASH: 'cash',
    NETBANKING: 'netbanking'
});

// ─────────────────────────────────────────────
// Parking slot statuses
// ─────────────────────────────────────────────
const SLOT_STATUS = Object.freeze({
    AVAILABLE: 'available',
    OCCUPIED: 'occupied',
    RESERVED: 'reserved',
    MAINTENANCE: 'maintenance'
});

// ─────────────────────────────────────────────
// Parking slot types
// ─────────────────────────────────────────────
const SLOT_TYPE = Object.freeze({
    REGULAR: 'regular',
    COMPACT: 'compact',
    HANDICAP: 'handicap',
    EV: 'ev',
    MOTORCYCLE: 'motorcycle'
});

// ─────────────────────────────────────────────
// Vehicle types
// ─────────────────────────────────────────────
const VEHICLE_TYPE = Object.freeze({
    CAR: 'car',
    MOTORCYCLE: 'motorcycle',
    EV: 'ev',
    TRUCK: 'truck'
});

// ─────────────────────────────────────────────
// Notification types
// ─────────────────────────────────────────────
const NOTIFICATION_TYPES = Object.freeze({
    BOOKING: 'booking',
    PAYMENT: 'payment',
    REMINDER: 'reminder',
    PROMOTION: 'promotion',
    SYSTEM: 'system',
    ALERT: 'alert'
});

// ─────────────────────────────────────────────
// Promo discount types
// ─────────────────────────────────────────────
const DISCOUNT_TYPE = Object.freeze({
    PERCENTAGE: 'percentage',
    FIXED: 'fixed'
});

// ─────────────────────────────────────────────
// Availability labels (used in UI & helpers)
// ─────────────────────────────────────────────
const AVAILABILITY_STATUS = Object.freeze({
    FULL: { status: 'full', color: 'red', label: 'Fully Occupied' },
    LIMITED: { status: 'limited', color: 'orange', label: 'Limited Spots' },
    MODERATE: { status: 'moderate', color: 'yellow', label: 'Moderately Available' },
    AVAILABLE: { status: 'available', color: 'green', label: 'Spots Available' }
});

// ─────────────────────────────────────────────
// Business rules / thresholds
// ─────────────────────────────────────────────
const BUSINESS_RULES = Object.freeze({
    /** Pending bookings older than this (minutes) are auto-expired by cron */
    BOOKING_EXPIRY_MINUTES: 15,

    /** Confirmed bookings with no check-in after this (minutes) become no_show */
    NO_SHOW_GRACE_MINUTES: 30,

    /** Default tax rate applied to base booking amount */
    DEFAULT_TAX_RATE: 0.10,

    /** Minimum booking duration in hours */
    MIN_BOOKING_HOURS: 0.5,

    /** Maximum booking duration in hours */
    MAX_BOOKING_HOURS: 720, // 30 days

    /** Default search radius in km when user doesn't specify */
    DEFAULT_SEARCH_RADIUS_KM: 10,

    /** Maximum search radius allowed */
    MAX_SEARCH_RADIUS_KM: 50,

    /** Number of results returned in a nearby search by default */
    DEFAULT_NEARBY_LIMIT: 20,

    /** Cancellation full-refund window (hours before start time) */
    FULL_REFUND_WINDOW_HOURS: 24,

    /** Cancellation partial-refund window (hours before start time) */
    PARTIAL_REFUND_WINDOW_HOURS: 2,

    /** Partial refund percentage (0–1) */
    PARTIAL_REFUND_PERCENTAGE: 0.5
});

// ─────────────────────────────────────────────
// Pagination defaults
// ─────────────────────────────────────────────
const PAGINATION = Object.freeze({
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
});

// ─────────────────────────────────────────────
// Supported currencies
// ─────────────────────────────────────────────
const CURRENCIES = Object.freeze({
    USD: 'USD',
    INR: 'INR',
    EUR: 'EUR',
    GBP: 'GBP'
});

// ─────────────────────────────────────────────
// Sort options for parking search
// ─────────────────────────────────────────────
const SORT_OPTIONS = Object.freeze({
    DISTANCE: 'distance',
    PRICE: 'price',
    RATING: 'rating',
    AVAILABILITY: 'availability'
});

// ─────────────────────────────────────────────
// HTTP status codes (convenience re-export)
// ─────────────────────────────────────────────
const HTTP_STATUS = Object.freeze({
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
});

// ─────────────────────────────────────────────
// Regex patterns used for validation
// ─────────────────────────────────────────────
const REGEX = Object.freeze({
    PHONE: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/,
    VEHICLE_NUMBER: /^[A-Z0-9\-]{2,20}$/i,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
});

// ─────────────────────────────────────────────
// File upload limits
// ─────────────────────────────────────────────
const FILE_UPLOAD = Object.freeze({
    MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    MAX_PARKING_IMAGES: 10
});

module.exports = {
    USER_ROLES,
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    SLOT_STATUS,
    SLOT_TYPE,
    VEHICLE_TYPE,
    NOTIFICATION_TYPES,
    DISCOUNT_TYPE,
    AVAILABILITY_STATUS,
    BUSINESS_RULES,
    PAGINATION,
    CURRENCIES,
    SORT_OPTIONS,
    HTTP_STATUS,
    REGEX,
    FILE_UPLOAD
};
