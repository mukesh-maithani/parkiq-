const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleAuth');
const { bookingValidation } = require('../middleware/validator');

router.post('/', authenticate, bookingValidation, bookingController.createBooking);

// Named/static routes MUST come before /:id to avoid being swallowed by the wildcard
router.get('/my-bookings', authenticate, (req, res, next) => {
    req.params.userId = req.user.id;
    next();
}, bookingController.getUserBookings);
router.get('/my-stats', authenticate, bookingController.getUserStats);
router.get('/user/:userId', authenticate, bookingController.getUserBookings);

// Owner routes — also before /:id
router.get('/parking/:parkingId', authenticate, isOwner, bookingController.getParkingBookings);

// Wildcard param route last
router.get('/:id', authenticate, bookingController.getBookingById);
router.put('/cancel/:id', authenticate, bookingController.cancelBooking);
router.patch('/:id/check-in', authenticate, isOwner, bookingController.checkIn);
router.patch('/:id/check-out', authenticate, isOwner, bookingController.checkOut);

module.exports = router;
