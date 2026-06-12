const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleAuth');
const { bookingValidation } = require('../middleware/validator');

router.post('/', authenticate, bookingValidation, bookingController.createBooking);
router.get('/my-bookings', authenticate, (req, res, next) => {
    req.params.userId = req.user.id;
    next();
}, bookingController.getUserBookings);
router.get('/user/:userId', authenticate, bookingController.getUserBookings);
router.get('/:id', authenticate, bookingController.getBookingById);
router.put('/cancel/:id', authenticate, bookingController.cancelBooking);
router.patch('/:id/check-in', authenticate, isOwner, bookingController.checkIn);
router.patch('/:id/check-out', authenticate, isOwner, bookingController.checkOut);

// Owner routes
router.get('/parking/:parkingId', authenticate, isOwner, bookingController.getParkingBookings);

module.exports = router;
