/**
 * Express Application Setup
 * Middleware configuration and route mounting
 */
 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
 
const authRoutes    = require('./routes/authRoutes');
const userRoutes    = require('./routes/userRoutes');
const parkingRoutes = require('./routes/parkingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes  = require('./routes/reviewRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
 
const errorHandler = require('./middleware/errorHandler');
 
const app = express();
 
// Helmet — CSP disabled so Razorpay 3DS OTP iframes work properly
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false  // Razorpay card 3DS & UPI need unrestricted iframe/popup access
}));
 
app.use(cors({
    origin: function(origin, callback) { return callback(null, true); },
    credentials: true
}));
 
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);
 
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}
 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../client')));
 
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Smart Parking API is running', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});
 
app.get('/api/debug/parking', async (req, res) => {
    try {
        const { pool } = require('./config/db');
        const [rows] = await pool.query('SELECT id, name, city, is_active, is_approved, available_slots, total_slots, latitude, longitude FROM parking_locations');
        res.json({ count: rows.length, rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debug/fix-coords', async (req, res) => {
    try {
        const { pool } = require('./config/db');
        const { id, latitude, longitude } = req.body;
        await pool.query('UPDATE parking_locations SET latitude=?, longitude=? WHERE id=?', [latitude, longitude, id]);
        res.json({ success: true, message: `Updated lot ${id} to ${latitude}, ${longitude}` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/test', async (req, res) => {
    const { pool } = require('./config/db');
    try {
        const [r1] = await pool.query('SELECT 1+1 AS result');
        const [r2] = await pool.query('SHOW TABLES');
        const [r3] = await pool.query('SELECT id, name, is_active, is_approved, latitude, longitude FROM parking_locations LIMIT 10');
        res.json({ dbOk: true, tables: r2, parking: r3 });
    } catch(e) { res.status(500).json({ dbOk: false, error: e.message, code: e.code, sql: e.sql }); }
});

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/parking',  parkingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/payments', paymentRoutes);
 
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../client/pages/index.html'));
    }
});
 
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});
 
app.use(errorHandler);
 
module.exports = app;