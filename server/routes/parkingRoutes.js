const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleAuth');
const { parkingValidation, idParamValidation } = require('../middleware/validator');

// ── Admin middleware ──
const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
};

// ── Owner OR Admin middleware ──
const isOwnerOrAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
    if (req.user.role === 'admin' || req.user.role === 'owner') return next();
    return res.status(403).json({ success: false, message: 'Owner or admin access required.' });
};

// Public routes
router.get('/', optionalAuth, parkingController.getAllParking);
router.get('/nearby', parkingController.getNearbyParking);
router.get('/recommendations', parkingController.getRecommendations);

// Admin routes (must come before /:id to avoid param conflicts)
router.get('/admin/all', authenticate, isAdmin, parkingController.adminGetAllParking);
router.patch('/admin/:id/approve', authenticate, isAdmin, parkingController.adminApproveLot);
router.patch('/admin/:id/reject', authenticate, isAdmin, parkingController.adminRejectLot);
router.patch('/admin/:id/toggle-active', authenticate, isAdmin, parkingController.adminDeactivateLot);
router.delete('/admin/:id', authenticate, isAdmin, parkingController.adminDeleteLot);

// Owner routes
router.get('/owner/my-parking', authenticate, isOwner, parkingController.getOwnerParking);
router.patch('/:parkingId/slots/:slotId', authenticate, isOwner, parkingController.updateSlotStatus);

router.get('/:id', idParamValidation, parkingController.getParkingById);

// Create parking — owner OR admin can do this
router.post('/', authenticate, isOwnerOrAdmin, parkingValidation, parkingController.createParking);
router.put('/:id', authenticate, isOwnerOrAdmin, parkingController.updateParking);
router.delete('/:id', authenticate, isOwnerOrAdmin, parkingController.deleteParking);

module.exports = router;
