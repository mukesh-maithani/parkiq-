/**
 * Authentication Controller
 * Handles user registration, login, and token management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../config/db');
const { generateUUID } = require('../utils/helpers');

// Generate JWT tokens
const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    const refreshToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
    
    return { accessToken, refreshToken };
};

// Register new user
exports.register = async (req, res, next) => {
    try {
        const { firstName, lastName, email, password, phone, role: rawRole = 'user' } = req.body;
        const role = rawRole === 'owner' ? 'owner' : 'user'; // Only 'user' or 'owner' allowed
        
        // Check if email exists
        const existingUser = await query(
            'SELECT id FROM users WHERE email = ?',
            [email.toLowerCase()]
        );
        
        if (existingUser.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Create user
        const uuid = generateUUID();
        const result = await query(
            `INSERT INTO users (uuid, first_name, last_name, email, password, phone, role, email_verified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid, firstName, lastName, email.toLowerCase(), hashedPassword, phone || null, role, false]
        );
        
        // If registering as owner, create owner record
        if (role === 'owner') {
            await query(
                `INSERT INTO parking_owners (user_id) VALUES (?)`,
                [result.insertId]
            );
        }
        
        // Generate tokens
        const tokens = generateTokens(result.insertId);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                user: {
                    id: result.insertId,
                    uuid,
                    firstName,
                    lastName,
                    email: email.toLowerCase(),
                    role
                },
                ...tokens
            }
        });
    } catch (error) {
        next(error);
    }
};

// User login
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const users = await query(
            `SELECT id, uuid, first_name, last_name, email, password, phone, avatar, role, is_active
             FROM users WHERE email = ?`,
            [email.toLowerCase()]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        const user = users[0];
        
        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact support.'
            });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        // Generate tokens
        const tokens = generateTokens(user.id);
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    uuid: user.uuid,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    phone: user.phone,
                    avatar: user.avatar,
                    role: user.role
                },
                ...tokens
            }
        });
    } catch (error) {
        next(error);
    }
};

// Refresh token
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }
        
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
        
        // Check if user exists and is active
        const users = await query(
            'SELECT id, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (users.length === 0 || !users[0].is_active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }
        
        // Generate new tokens
        const tokens = generateTokens(decoded.userId);
        
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: tokens
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Refresh token has expired. Please login again.'
            });
        }
        next(error);
    }
};

// Get current user
exports.getCurrentUser = async (req, res, next) => {
    try {
        const users = await query(
            `SELECT id, uuid, first_name, last_name, email, phone, avatar, role, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = users[0];
        
        res.json({
            success: true,
            data: {
                id: user.id,
                uuid: user.uuid,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                role: user.role,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        next(error);
    }
};

// Logout (client-side token removal, but we can log it)
exports.logout = async (req, res) => {
    // In a production app, you might want to blacklist the token
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};


