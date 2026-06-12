/**
 * Global Error Handler Middleware
 * Centralized error handling for the application
 */

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    // Default error
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let errors = err.errors || null;
    
    // MySQL errors
    if (err.code) {
        switch (err.code) {
            case 'ER_DUP_ENTRY':
                statusCode = 409;
                message = 'Duplicate entry. This record already exists.';
                break;
            case 'ER_NO_REFERENCED_ROW_2':
                statusCode = 400;
                message = 'Referenced record not found.';
                break;
            case 'ER_ROW_IS_REFERENCED_2':
                statusCode = 400;
                message = 'Cannot delete. Record is referenced by other data.';
                break;
            case 'ECONNREFUSED':
                statusCode = 503;
                message = 'Database connection failed.';
                break;
        }
    }
    
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token.';
    }
    
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token has expired.';
    }
    
    // Validation errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed.';
    }
    
    // Send response
    res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors }),
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack
        })
    });
};

// Custom error class
class AppError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
