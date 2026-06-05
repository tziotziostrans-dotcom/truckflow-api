const Notification = require('../models/Notification')
const User = require('../models/User')
const emailService = require('./emailService')
const admin = require('firebase-admin')
const path = require('path')
const { getIO, isUserOnline } = require('../config/socket')
const { t } = require('../utils/i18n')

// Initialize Firebase Admin
try {
  let credential
  let serviceAccount
  const localServiceAccountPath = path.join(
    __dirname,
    '../config/firebase-service-account.json',
  )

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // Parse the credentials from environment variable
      let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT.trim()
      // Remove wrapping single quotes if present
      if (
        serviceAccountStr.startsWith("'") &&
        serviceAccountStr.endsWith("'")
      ) {
        serviceAccountStr = serviceAccountStr.slice(1, -1)
      }
      // Remove wrapping double quotes if present
      if (
        serviceAccountStr.startsWith('"') &&
        serviceAccountStr.endsWith('"')
      ) {
        serviceAccountStr = serviceAccountStr.slice(1, -1)
      }

      const parsedJson = JSON.parse(serviceAccountStr)
      if (parsedJson.private_key) {
        parsedJson.private_key = parsedJson.private_key.replace(/\\n/g, '\n')
      }
      serviceAccount = parsedJson
    } catch (parseError) {
      console.warn(
        '⚠️ Invalid FIREBASE_SERVICE_ACCOUNT env variable. Falling back to local firebase-service-account.json file.',
      )
      console.warn('Parse error:', parseError.message)
      serviceAccount = null
    }
  }

  if (!serviceAccount) {
    serviceAccount = require(localServiceAccountPath)
  }

  credential = admin.credential.cert(serviceAccount)
  admin.initializeApp({
    credential,
  })
  console.log('✅ Firebase Admin initialized successfully')
} catch (error) {
  console.warn('⚠️ Firebase Admin could not be initialized:', error.message)
  console.warn(
    '⚠️ Push notifications will be skipped until configuration is provided.',
  )
}

/**
 * Send push notification to user's registered devices
 */
const sendPushToUser = async (userId, payload) => {
  try {
    console.log(`\n📱 ========== FCM PUSH ATTEMPT ==========`);
    console.log(`📱 User ID: ${userId}`);
    console.log(`📱 Payload:`, JSON.stringify(payload, null, 2));

    if (!admin.apps.length) {
      console.warn(
        '❌ FCM push skipped because Firebase Admin is not initialized:',
        userId,
      )
      return
    }
    console.log(`✅ Firebase Admin is initialized`);

    const user = await User.findById(userId)
    if (!user) {
      console.warn('❌ FCM push skipped because user was not found:', userId)
      return
    }
    console.log(`✅ User found: ${user.name} (${user.email})`);

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      console.warn(`❌ FCM push skipped because user has no tokens: ${userId}`)
      console.warn(`   User ${user.name} needs to enable notifications!`)
      return
    }

    console.log(
      `✅ FCM push: sending to ${user.fcmTokens.length} token(s) for user ${user.name}`,
    )
    user.fcmTokens.forEach((token, idx) => {
      console.log(`   Token ${idx + 1}: ${token.substring(0, 40)}...`);
    });

    const message = {
      notification: {
        title: payload.title,
        body: payload.message,
      },
      data: {
        type: payload.type || 'general',
        loadId: payload.loadId ? payload.loadId.toString() : '',
        routeId: payload.routeId ? payload.routeId.toString() : '',
        loadNumber: payload.loadNumber || '',
      },
      tokens: user.fcmTokens,
    }

    console.log(`📤 Sending multicast message via Firebase Admin...`);
    const response = await admin.messaging().sendEachForMulticast(message)

    console.log(`📊 FCM Response:`);
    console.log(`   ✅ Success: ${response.successCount}`);
    console.log(`   ❌ Failure: ${response.failureCount}`);

    // Clean up failed/invalid tokens
    if (response.failureCount > 0) {
      const tokensToRemove = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.log(`   ❌ Token ${idx + 1} failed:`, resp.error.code, resp.error.message);
          const errorCode = resp.error.code
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(user.fcmTokens[idx])
          }
        } else {
          console.log(`   ✅ Token ${idx + 1} sent successfully`);
        }
      })

      if (tokensToRemove.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: tokensToRemove } },
        })
        console.log(
          `🧹 Cleaned up ${tokensToRemove.length} invalid FCM tokens for user ${userId}`,
        )
      }
    } else {
      console.log(`✅ All tokens sent successfully!`);
    }

    console.log(`📱 ========================================\n`);
    return response
  } catch (error) {
    console.error('❌ Error sending push notification:', error)
    console.error('Error details:', error.stack);
  }
}

/**
 * Create and send notification
 */
const createNotification = async ({
  userId,
  type,
  title,
  message,
  titleKey,
  messageKey,
  params = {},
  loadId,
  routeId,
  loadNumber,
}) => {
  try {
    // Get user's preferred language
    const user = await User.findById(userId).select('preferredLanguage')
    const lang = user ? user.preferredLanguage : 'en'

    // Localize title and message if keys are provided
    const localizedTitle = titleKey ? t(titleKey, lang, params) : title
    const localizedMessage = messageKey ? t(messageKey, lang, params) : message

    // Save to database
    const notification = await Notification.create({
      userId,
      type,
      title: localizedTitle,
      message: localizedMessage,
      titleKey,
      messageKey,
      params,
      loadId,
      routeId,
      loadNumber,
    })

    // Send real-time Socket.io notification if user is online
    if (isUserOnline(userId)) {
      const io = getIO()
      io.to(`user:${userId}`).emit('notification', {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        titleKey: notification.titleKey,
        messageKey: notification.messageKey,
        params: notification.params,
        loadId: notification.loadId,
        routeId: notification.routeId,
        loadNumber: notification.loadNumber,
        read: notification.read,
        createdAt: notification.createdAt,
      })
    }

    // Send Push Notification
    await sendPushToUser(userId, {
      title: localizedTitle,
      message: localizedMessage,
      type,
      loadId,
      routeId,
      loadNumber,
    })

    return notification
  } catch (error) {
    console.error('Error creating notification:', error)
    throw error
  }
}

/**
 * Notify manager about new load
 */
const notifyManagerNewLoad = async (managerId, load) => {
  const loadNum = load._id.toString().slice(-8).toUpperCase()
  return createNotification({
    userId: managerId,
    type: 'load_created',
    title: 'New Load Created',
    message: `Load #${loadNum} from ${load.pickupLocation} to ${load.dropoffLocation} has been created`,
    titleKey: 'notifications.newLoad',
    messageKey: 'notifications.newLoadCreated',
    params: {
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })
}

/**
 * Notify driver about load assignment
 */
const notifyDriverLoadAssigned = async (driverId, load) => {
  const loadNum = load._id.toString().slice(-8).toUpperCase()

  // Create in-app notification
  const notification = await createNotification({
    userId: driverId,
    type: 'load_assigned',
    title: 'New Load Assigned',
    message: `You have been assigned load #${loadNum} from ${load.pickupLocation} to ${load.dropoffLocation}`,
    titleKey: 'notifications.loadAssigned',
    messageKey: 'notifications.loadAssignedToYou',
    params: {
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })

  // Send email notification
  try {
    const driver = await User.findById(driverId)
    if (driver && driver.email) {
      await emailService.sendLoadNotificationEmail(driver, load, 'assigned')
    }
  } catch (error) {
    console.error('Failed to send assignment email:', error)
  }

  return notification
}

/**
 * Notify manager about load acceptance
 */
const notifyManagerLoadAccepted = async (managerId, load, driverName) => {
  const loadNum = load._id.toString().slice(-8).toUpperCase()

  const notification = await createNotification({
    userId: managerId,
    type: 'load_accepted',
    title: 'Load Accepted',
    message: `${driverName} accepted load #${loadNum} (${load.pickupLocation} → ${load.dropoffLocation})`,
    titleKey: 'notifications.loadAccepted',
    messageKey: 'notifications.driverAcceptedLoadDetails',
    params: {
      driverName,
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })

  // Send email to manager
  try {
    const manager = await User.findById(managerId)
    if (manager && manager.email) {
      await emailService.sendLoadNotificationEmail(
        { email: manager.email, name: manager.name },
        load,
        'accepted',
        driverName,
      )
    }
  } catch (error) {
    console.error('Failed to send acceptance email to manager:', error)
  }

  return notification
}

/**
 * Notify manager about load rejection
 */
const notifyManagerLoadRejected = async (managerId, load, driverName) => {
  const loadNum = load._id.toString().slice(-8).toUpperCase()

  const notification = await createNotification({
    userId: managerId,
    type: 'load_rejected',
    title: 'Load Rejected',
    message: `${driverName} rejected load #${loadNum} (${load.pickupLocation} → ${load.dropoffLocation})`,
    titleKey: 'notifications.loadRejected',
    messageKey: 'notifications.driverRejectedLoadDetails',
    params: {
      driverName,
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })

  // Send email to manager
  try {
    const manager = await User.findById(managerId)
    if (manager && manager.email) {
      await emailService.sendLoadNotificationEmail(
        { email: manager.email, name: manager.name },
        load,
        'rejected',
        driverName,
      )
    }
  } catch (error) {
    console.error('Failed to send rejection email to manager:', error)
  }

  return notification
}

/**
 * Notify manager about load completion
 */
const notifyManagerLoadCompleted = async (managerId, load, driverName) => {
  const loadNum = load._id.toString().slice(-8).toUpperCase()

  const notification = await createNotification({
    userId: managerId,
    type: 'load_completed',
    title: 'Load Completed',
    message: `${driverName} completed load #${loadNum} (${load.pickupLocation} → ${load.dropoffLocation})`,
    titleKey: 'notifications.loadCompleted',
    messageKey: 'notifications.driverCompletedLoadDetails',
    params: {
      driverName,
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })

  // Send email to manager
  try {
    const manager = await User.findById(managerId)
    if (manager && manager.email) {
      await emailService.sendLoadNotificationEmail(
        { email: manager.email, name: manager.name },
        load,
        'completed',
        driverName,
      )
    }
  } catch (error) {
    console.error('Failed to send completion email to manager:', error)
  }

  return notification
}

/**
 * Notify manager about load in transit
 */
const notifyManagerLoadInTransit = async (managerId, load, driverName) => {
  const loadNum = load.loadNumber || load._id.toString().slice(-8).toUpperCase()
  return createNotification({
    userId: managerId,
    type: 'load_in_transit',
    title: 'Load In Transit',
    message: `${driverName} has started the journey for load #${loadNum}`,
    titleKey: 'notifications.loadInTransit',
    messageKey: 'notifications.driverStartedLoadJourney',
    params: {
      driverName,
      loadNumber: loadNum,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })
}

/**
 * Get user notifications
 */
const getUserNotifications = async (userId, limit = 50) => {
  return Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
}

/**
 * Mark notification as read
 */
const markAsRead = async (notificationId, userId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read: true },
    { new: true },
  )
}

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (userId) => {
  return Notification.updateMany({ userId, read: false }, { read: true })
}

/**
 * Get unread count
 */
const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, read: false })
}

/**
 * Notify manager when driver uploads documents
 */
const notifyManagerDocumentsUploaded = async (managerId, load, driverName) => {
  const loadNum = load.loadNumber || load._id.toString().slice(-8).toUpperCase()

  const notification = await createNotification({
    userId: managerId,
    type: 'documents_uploaded',
    title: 'Documents Uploaded',
    message: `${driverName} has uploaded documents for load #${loadNum} (${load.pickupLocation} → ${load.dropoffLocation})`,
    titleKey: 'notifications.documentsUploaded',
    messageKey: 'notifications.driverUploadedDocumentsDetails',
    params: {
      driverName,
      loadNumber: loadNum,
      pickup: load.pickupLocation,
      dropoff: load.dropoffLocation,
    },
    loadId: load._id,
    loadNumber: loadNum,
  })

  // Send email to manager
  try {
    const manager = await User.findById(managerId)
    if (manager && manager.email) {
      await emailService.sendLoadNotificationEmail(
        { email: manager.email, name: manager.name },
        load,
        'documents_uploaded',
        driverName,
      )
    }
  } catch (error) {
    console.error('Failed to send documents uploaded email to manager:', error)
  }

  return notification
}

/**
 * Delete notification
 */
const deleteNotification = async (notificationId, userId) => {
  return Notification.findOneAndDelete({ _id: notificationId, userId })
}

/**
 * Notify driver about route assignment
 */
const notifyDriverRouteAssigned = async (driverId, route) => {
  const notification = await createNotification({
    userId: driverId,
    type: 'route_assigned',
    title: 'New Route Assigned',
    message: `You have been assigned to route: ${route.routeName}`,
    titleKey: 'notifications.routeAssigned',
    messageKey: 'notifications.routeAssignedToYou',
    params: {
      routeName: route.routeName,
      routeNumber: route.routeNumber,
    },
    routeId: route._id,
    loadNumber: route.routeNumber,
  })

  // Send email notification
  try {
    const driver = await User.findById(driverId)
    if (driver && driver.email) {
      await emailService.sendRouteNotificationEmail(driver, route)
    }
  } catch (error) {
    console.error('Failed to send route assignment email:', error)
  }

  return notification
}

/**
 * Notify manager about route acceptance
 */
const notifyManagerRouteAccepted = async (managerId, route, driverName) => {
  return createNotification({
    userId: managerId,
    type: 'route_accepted',
    title: 'Route Accepted',
    message: `${driverName} accepted route: ${route.routeName}`,
    titleKey: 'notifications.routeAccepted',
    messageKey: 'notifications.driverAcceptedRoute',
    params: {
      driverName,
      routeName: route.routeName,
      routeNumber: route.routeNumber,
    },
    routeId: route._id,
    loadNumber: route.routeNumber,
  })
}

/**
 * Notify manager about route rejection
 */
const notifyManagerRouteRejected = async (managerId, route, driverName) => {
  return createNotification({
    userId: managerId,
    type: 'route_rejected',
    title: 'Route Rejected',
    message: `${driverName} rejected route: ${route.routeName}`,
    titleKey: 'notifications.routeRejected',
    messageKey: 'notifications.driverRejectedRoute',
    params: {
      driverName,
      routeName: route.routeName,
      routeNumber: route.routeNumber,
    },
    routeId: route._id,
    loadNumber: route.routeNumber,
  })
}

/**
 * Notify manager when driver uploads route documents
 */
const notifyManagerRouteDocumentsUploaded = async (
  managerId,
  route,
  driverName,
) => {
  const routeNum =
    route.routeNumber || `R-${route._id.toString().slice(-8).toUpperCase()}`

  const notification = await createNotification({
    userId: managerId,
    type: 'route_documents_uploaded',
    title: 'Route Documents Uploaded',
    message: `${driverName} has uploaded documents for route: ${route.routeName} (#${routeNum})`,
    titleKey: 'notifications.routeDocumentsUploaded',
    messageKey: 'notifications.driverUploadedRouteDocumentsDetails',
    params: {
      driverName,
      routeName: route.routeName,
      routeNumber: routeNum,
    },
    routeId: route._id,
    loadNumber: routeNum,
  })

  // Send email to manager
  try {
    const manager = await User.findById(managerId)
    if (manager && manager.email) {
      await emailService.sendRouteNotificationEmail(
        manager,
        route,
        'documents_uploaded',
        driverName,
      )
    }
  } catch (error) {
    console.error(
      'Failed to send route documents uploaded email to manager:',
      error,
    )
  }

  return notification
}

module.exports = {
  createNotification,
  notifyManagerNewLoad,
  notifyDriverLoadAssigned,
  notifyManagerLoadAccepted,
  notifyManagerLoadRejected,
  notifyManagerLoadCompleted,
  notifyManagerLoadInTransit,
  notifyManagerDocumentsUploaded,
  notifyDriverRouteAssigned,
  notifyManagerRouteAccepted,
  notifyManagerRouteRejected,
  notifyManagerRouteDocumentsUploaded,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
}
