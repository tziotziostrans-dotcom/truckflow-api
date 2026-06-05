const express = require('express');
const { sendTestNotification } = require('../controllers/testController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/send-notification', protect, sendTestNotification);

module.exports = router;
