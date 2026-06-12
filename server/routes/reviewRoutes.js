const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleAuth');
const { reviewValidation } = require('../middleware/validator');

router.post('/', authenticate, reviewValidation, reviewController.createReview);
router.get('/top', reviewController.getTopReviews);
router.get('/:parkingId', reviewController.getParkingReviews);
router.patch('/:id/helpful', authenticate, reviewController.markHelpful);
router.patch('/:id/reply', authenticate, isOwner, reviewController.replyToReview);
router.delete('/:id', authenticate, reviewController.deleteReview);

module.exports = router;
