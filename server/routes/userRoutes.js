const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// ── Admin middleware ──
const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
};

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);
router.put('/change-password', authenticate, userController.changePassword);

// Admin user management
router.get('/admin/all', authenticate, isAdmin, userController.adminGetAllUsers);
router.get('/admin/owners', authenticate, isAdmin, userController.adminGetAllOwners);
router.patch('/admin/:id/toggle-active', authenticate, isAdmin, userController.adminToggleUserActive);
router.delete('/admin/:id', authenticate, isAdmin, userController.adminDeleteUser);

// Admin dashboard stats
router.get('/admin/stats', authenticate, isAdmin, userController.adminGetStats);
router.get('/admin/revenue-chart', authenticate, isAdmin, userController.adminRevenueChart);

// Admin bookings management
router.get('/admin/bookings', authenticate, isAdmin, userController.adminGetAllBookings);
router.patch('/admin/bookings/:id/cancel', authenticate, isAdmin, userController.adminCancelBooking);

// Admin promo codes
router.get('/admin/promos', authenticate, isAdmin, userController.adminGetPromos);
router.post('/admin/promos', authenticate, isAdmin, userController.adminCreatePromo);
router.patch('/admin/promos/:id/toggle', authenticate, isAdmin, userController.adminTogglePromo);
router.delete('/admin/promos/:id', authenticate, isAdmin, userController.adminDeletePromo);

router.get('/public/login-stats', async (req, res) => {
    try {
        res.json({
            parkingLocations: 0,
            users: 0,
            averageRating: 0,
            featuredReview: {
                name: 'ParkIQ User',
                comment: 'Welcome to ParkIQ',
                location: 'India'
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});
module.exports = router;
