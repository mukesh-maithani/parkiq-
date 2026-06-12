/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

// Verify JWT token
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token format.'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const users = await query(
            'SELECT id, uuid, email, first_name, last_name, role, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found.'
            });
        }
        
        const user = users[0];
        
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated.'
            });
        }
        
        // Attach user to request
        req.user = {
            id: user.id,
            uuid: user.uuid,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role
        };
        
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired.'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }
        
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error.'
        });
    }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return next();
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const users = await query(
            'SELECT id, uuid, email, first_name, last_name, role FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );
        
        if (users.length > 0) {
            req.user = {
                id: users[0].id,
                uuid: users[0].uuid,
                email: users[0].email,
                firstName: users[0].first_name,
                lastName: users[0].last_name,
                role: users[0].role
            };
        }
        
        next();
    } catch (error) {
        // Silently continue without authentication
        next();
    }
};

module.exports = { authenticate, optionalAuth };
