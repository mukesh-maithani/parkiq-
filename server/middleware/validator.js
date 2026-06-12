/**
 * Input Validation Middleware
 * Express-validator rules for API endpoints
 */

const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    
    next();
};

// Registration validation rules
const registerValidation = [
    body('firstName')
        .trim()
        .notEmpty().withMessage('First name is required')
        .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName')
        .trim()
        .notEmpty().withMessage('Last name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number and special character'),
    body('phone')
        .optional()
        .matches(/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/)
        .withMessage('Invalid phone number'),
    body('role')
        .optional()
        .isIn(['user', 'owner']).withMessage('Invalid role'),
    handleValidation
];

// Login validation rules
const loginValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format'),
    body('password')
        .notEmpty().withMessage('Password is required'),
    handleValidation
];

// Parking creation validation
const parkingValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Parking name is required')
        .isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
    body('address')
        .trim()
        .notEmpty().withMessage('Address is required'),
    body('city')
        .trim()
        .notEmpty().withMessage('City is required'),
    body('latitude')
        .notEmpty().withMessage('Latitude is required')
        .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('longitude')
        .notEmpty().withMessage('Longitude is required')
        .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('totalSlots')
        .notEmpty().withMessage('Total slots is required')
        .isInt({ min: 1 }).withMessage('Total slots must be at least 1'),
    body('pricePerHour')
        .notEmpty().withMessage('Price per hour is required')
        .isFloat({ min: 0 }).withMessage('Price must be positive'),
    handleValidation
];

// Booking validation
const bookingValidation = [
    body('parkingId')
        .notEmpty().withMessage('Parking ID is required')
        .isInt().withMessage('Invalid parking ID'),
    body('vehicleNumber')
        .trim()
        .notEmpty().withMessage('Vehicle number is required')
        .isLength({ min: 2, max: 20 }).withMessage('Invalid vehicle number'),
    body('startTime')
        .notEmpty().withMessage('Start time is required')
        .isISO8601().withMessage('Invalid start time format'),
    body('endTime')
        .notEmpty().withMessage('End time is required')
        .isISO8601().withMessage('Invalid end time format')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startTime)) {
                throw new Error('End time must be after start time');
            }
            return true;
        }),
    body('vehicleType')
        .optional()
        .isIn(['car', 'motorcycle', 'ev', 'truck']).withMessage('Invalid vehicle type'),
    handleValidation
];

// Review validation
const reviewValidation = [
    body('parkingId')
        .notEmpty().withMessage('Parking ID is required')
        .isInt().withMessage('Invalid parking ID'),
    body('rating')
        .notEmpty().withMessage('Rating is required')
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Comment must be under 1000 characters'),
    handleValidation
];

// ID parameter validation
const idParamValidation = [
    param('id')
        .notEmpty().withMessage('ID is required')
        .isInt().withMessage('Invalid ID format'),
    handleValidation
];

// Pagination validation
const paginationValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    handleValidation
];

module.exports = {
    handleValidation,
    registerValidation,
    loginValidation,
    parkingValidation,
    bookingValidation,
    reviewValidation,
    idParamValidation,
    paginationValidation
};
