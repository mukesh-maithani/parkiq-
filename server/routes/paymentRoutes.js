const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.post('/create', authenticate, paymentController.createPayment);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.get('/history', authenticate, paymentController.getPaymentHistory);
router.post('/refund', authenticate, paymentController.requestRefund);

// 3DS bank redirect callback — NO auth middleware, Razorpay posts directly
router.post('/callback', paymentController.razorpayCallback);

module.exports = router;
