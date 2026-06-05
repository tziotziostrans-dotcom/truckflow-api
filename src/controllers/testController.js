const notificationService = require('../services/notificationService');

// @desc    Send test notification to current user
// @route   POST /api/test/send-notification
// @access  Private
exports.sendTestNotification = async (req, res) => {
    try {
        const { title, message } = req.body;
        
        console.log('\n🧪 ========== TEST NOTIFICATION ==========');
        console.log(`🧪 Sending test notification to user: ${req.user.id}`);
        
        const notification = await notificationService.createNotification({
            userId: req.user.id,
            type: 'test',
            title: title || 'Test Notification',
            message: message || 'This is a test notification from the debug page',
        });
        
        console.log(`🧪 Test notification created: ${notification._id}`);
        console.log('🧪 =======================================\n');
        
        res.status(200).json({
            success: true,
            message: 'Test notification sent',
            notification,
        });
    } catch (err) {
        console.error('❌ Test Notification Error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to send test notification',
            error: err.message,
        });
    }
};

module.exports = {
    sendTestNotification,
};
