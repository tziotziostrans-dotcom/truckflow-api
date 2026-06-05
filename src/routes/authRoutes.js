const express = require('express');
const { login, getMe, refreshToken, logout, forgotPassword, resetPassword, setupPassword, updateFcmToken, clearAllFcmTokens } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/setup-password', setupPassword);
router.post('/fcm-token', protect, updateFcmToken);
router.delete('/fcm-token/all', protect, clearAllFcmTokens);

module.exports = router;


