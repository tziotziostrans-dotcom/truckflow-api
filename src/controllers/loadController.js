const Load = require('../models/Load')
const {
  convertToBase64,
  validateImageFile,
} = require('../services/uploadService')
const notificationService = require('../services/notificationService')
const { calculateRouteDistance } = require('../services/geocodeService')

// @desc    Create load (manager only)
// @route   POST /api/loads
// @access  Private/Manager
exports.createLoad = async (req, res) => {
  try {
    const {
      pickupLocation,
      dropoffLocation,
      clientName,
      clientPrice,
      driverPrice,
      shippingType,
      loadWeight,
      pallets,
      loadingDate,
      loadingTime,
      paymentTerms,
      expectedPayoutDate,
      fuel,
      tolls,
      otherExpenses,
      notes,
      driverId,
      driverIds, // NEW: array of driver IDs for multi-broadcast
      pickupCoords,
      dropoffCoords,
      initialImages,
    } = req.body

    // Safety check for user (should be handled by middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authenticate as a manager to create loads',
      })
    }

    // Validate required fields
    if (!pickupLocation || !dropoffLocation) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and dropoff locations are required',
      })
    }

    if (!clientName) {
      return res.status(400).json({
        success: false,
        message: 'Client name is required',
      })
    }

    if (!clientPrice || !paymentTerms) {
      return res.status(400).json({
        success: false,
        message: 'Client price and payment terms are required',
      })
    }

    if (!loadingDate || !loadingTime) {
      return res.status(400).json({
        success: false,
        message: 'Loading date and time are required',
      })
    }

    // Calculate expected payout date if not provided
    let calculatedPayoutDate = expectedPayoutDate
    if (!calculatedPayoutDate && loadingDate && paymentTerms) {
      calculatedPayoutDate = new Date(loadingDate)
      calculatedPayoutDate.setDate(
        calculatedPayoutDate.getDate() + paymentTerms,
      )
    }

    // Calculate distance between pickup and dropoff
    let distanceData = { distance: 0, unit: 'km', duration: null }
    try {
      console.log('🔄 Calculating distance...')
      distanceData = await calculateRouteDistance(
        pickupLocation,
        dropoffLocation,
      )
      console.log(
        `✅ Distance calculated: ${distanceData.distance} ${distanceData.unit}`,
      )
    } catch (distanceError) {
      console.error('⚠️ Distance calculation failed:', distanceError.message)
      // Continue without distance - load creation should not fail
      // Distance can be calculated later or manually entered
    }

    // Create load with all fields matching UI
    const loadData = {
      createdBy: req.user._id,
      pickupLocation,
      dropoffLocation,
      distance: distanceData.distance,
      distanceUnit: distanceData.unit,
      clientName,
      clientPrice,
      driverPrice: driverPrice || 0,
      shippingType: shippingType || 'FTL',
      loadWeight: loadWeight || 0,
      pallets: pallets || undefined,
      pickupCoords,
      dropoffCoords,
      loadingDate,
      loadingTime,
      paymentTerms: paymentTerms || 45,
      expectedPayoutDate: calculatedPayoutDate,
      fuel: fuel || 0,
      tolls: tolls || 0,
      otherExpenses: otherExpenses || 0,
      notes: notes || '',
      status: 'pending',
      initialImages: initialImages || [],

      // Cost model fields (with defaults)
      fuelConsumption: req.body.fuelConsumption || 30,
      fuelPricePerLiter: req.body.fuelPricePerLiter || 0,
      driverDailyCost: req.body.driverDailyCost || 0,
      truckCostPerKm: req.body.truckCostPerKm || 0,
    }

    // Add driver(s) based on single or multi-select
    const effectiveDriverIds =
      driverIds && driverIds.length > 0 ? driverIds : driverId ? [driverId] : []

    if (effectiveDriverIds.length === 1) {
      // Single driver: assign directly (existing behavior)
      loadData.assignedDriver = effectiveDriverIds[0]
    } else if (effectiveDriverIds.length > 1) {
      // Multiple drivers: broadcast to all, no assigned driver yet
      loadData.broadcastTo = effectiveDriverIds
    }

    // Create load
    const load = await Load.create(loadData)

    // Populate driver info if assigned
    const populatedLoad = await Load.findById(load._id)
      .populate('createdBy', 'name email')
      .populate('assignedDriver', 'name email phone')
      .populate('broadcastTo', 'name email phone')

    // Send notifications to driver(s)
    try {
      if (effectiveDriverIds.length === 1) {
        // Single driver notification
        await notificationService.notifyDriverLoadAssigned(
          effectiveDriverIds[0],
          populatedLoad,
        )
      } else if (effectiveDriverIds.length > 1) {
        // Broadcast to all drivers
        for (const did of effectiveDriverIds) {
          await notificationService.notifyDriverLoadAssigned(did, populatedLoad)
        }
      }
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    // Emit real-time load_update to all broadcast/assigned drivers and the manager
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()
      for (const did of effectiveDriverIds) {
        io.to(`user:${did}`).emit('load_update', {
          action: 'new',
          load: populatedLoad,
        })
      }
      // Emit to creator manager
      io.to(`user:${populatedLoad.createdBy._id.toString()}`).emit(
        'load_update',
        {
          action: 'new',
          load: populatedLoad,
        },
      )
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr)
    }

    res.status(201).json({
      success: true,
      message: 'Load created successfully',
      load: populatedLoad,
    })
  } catch (err) {
    console.error('❌ Create Load Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    })
  }
}

// @desc    Get all loads
// @route   GET /api/loads
// @access  Private (Manager: all loads, Driver: assigned loads only)
exports.getLoads = async (req, res) => {
  try {
    let query = {}

    // Driver can see: assigned loads OR loads broadcast to them
    if (req.user.role === 'driver') {
      query.$or = [
        { assignedDriver: req.user._id },
        { broadcastTo: req.user._id },
      ]
    } else if (req.user.role === 'manager') {
      // Manager sees loads they created
      query.createdBy = req.user._id
    }

    // Optional status filter
    if (req.query.status) {
      query.status = req.query.status
    }

    const loads = await Load.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedDriver', 'name email phone')
      .populate('broadcastTo', 'name email phone')
      .sort({ createdAt: -1 })

    // Security: If user is a driver, filter broadcastTo to only show themselves
    // and remove assignedDriver if it's not them (for safety)
    if (req.user.role === 'driver') {
      loads.forEach((load) => {
        if (load.broadcastTo) {
          load.broadcastTo = load.broadcastTo.filter(
            (d) => d._id.toString() === req.user._id.toString(),
          )
        }
      })
    }

    res.status(200).json({
      success: true,
      count: loads.length,
      loads,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// Helper function to find load by ID or loadNumber
const findLoadByIdOrNumber = async (identifier) => {
  // Try to find by MongoDB _id first
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    return await Load.findById(identifier)
  }

  // Otherwise, search by matching the last 8 characters of _id (our loadNumber logic)
  const loads = await Load.find({})
  return loads.find((load) => {
    const loadNumber = load._id.toString().slice(-8).toUpperCase()
    return loadNumber === identifier.toUpperCase()
  })
}

// @desc    Get single load
// @route   GET /api/loads/:id
// @access  Private
exports.getLoad = async (req, res) => {
  try {
    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Populate after finding
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')
    await load.populate('broadcastTo', 'name email phone')

    // Driver can only view loads assigned to them OR broadcast to them
    if (req.user.role === 'driver') {
      const driverId = req.user._id.toString()
      const isAssigned =
        load.assignedDriver && load.assignedDriver._id.toString() === driverId
      const isBroadcast =
        load.broadcastTo &&
        load.broadcastTo.some((d) => (d._id || d).toString() === driverId)

      if (!isAssigned && !isBroadcast) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this load',
        })
      }
    }

    // Security: If user is a driver, filter broadcastTo to only show themselves
    if (req.user.role === 'driver') {
      if (load.broadcastTo) {
        load.broadcastTo = load.broadcastTo.filter(
          (d) => d._id.toString() === req.user._id.toString(),
        )
      }
    }

    res.status(200).json({
      success: true,
      load,
    })
  } catch (err) {
    console.error(err)
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Update load (manager only)
// @route   PATCH /api/loads/:id
// @access  Private/Manager
exports.updateLoad = async (req, res) => {
  try {
    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Only allow updating if load is pending or accepted
    if (load.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a completed load',
      })
    }

    const {
      pickupLocation,
      dropoffLocation,
      clientName,
      clientPrice,
      driverPrice,
      shippingType,
      loadWeight,
      pallets,
      loadingDate,
      loadingTime,
      paymentTerms,
      expectedPayoutDate,
      fuel,
      tolls,
      otherExpenses,
      notes,
      initialImages,
      driverIds,
      fuelConsumption,
      fuelPricePerLiter,
      driverDailyCost,
      truckCostPerKm,
    } = req.body

    // Update fields if provided
    if (pickupLocation) load.pickupLocation = pickupLocation
    if (dropoffLocation) load.dropoffLocation = dropoffLocation
    if (clientName) load.clientName = clientName
    if (clientPrice !== undefined) load.clientPrice = clientPrice
    if (driverPrice !== undefined) load.driverPrice = driverPrice
    if (shippingType) load.shippingType = shippingType
    if (loadWeight !== undefined) load.loadWeight = loadWeight
    if (pallets !== undefined) load.pallets = pallets
    if (loadingDate) load.loadingDate = loadingDate
    if (loadingTime) load.loadingTime = loadingTime
    if (paymentTerms !== undefined) load.paymentTerms = paymentTerms
    if (expectedPayoutDate) load.expectedPayoutDate = expectedPayoutDate
    if (fuel !== undefined) load.fuel = fuel
    if (tolls !== undefined) load.tolls = tolls
    if (otherExpenses !== undefined) load.otherExpenses = otherExpenses
    if (notes !== undefined) load.notes = notes
    if (initialImages !== undefined) load.initialImages = initialImages
    if (fuelConsumption !== undefined) load.fuelConsumption = fuelConsumption
    if (fuelPricePerLiter !== undefined)
      load.fuelPricePerLiter = fuelPricePerLiter
    if (driverDailyCost !== undefined) load.driverDailyCost = driverDailyCost
    if (truckCostPerKm !== undefined) load.truckCostPerKm = truckCostPerKm

    // Multi-driver handling in update
    let driversChanged = false
    if (driverIds !== undefined) {
      driversChanged = true
      if (driverIds.length === 1) {
        load.assignedDriver = driverIds[0]
        load.broadcastTo = []
      } else if (driverIds.length > 1) {
        load.assignedDriver = null
        load.broadcastTo = driverIds
      } else {
        load.assignedDriver = null
        load.broadcastTo = []
      }
    }

    // Capture previous recipients for notification cleanup
    const previousRecipients = new Set()
    if (load.assignedDriver)
      previousRecipients.add(load.assignedDriver.toString())
    if (load.broadcastTo && load.broadcastTo.length > 0) {
      load.broadcastTo.forEach((id) => previousRecipients.add(id.toString()))
    }

    await load.save()

    // If load is attached to a route, trigger route recalculation
    if (load.routeId) {
      const Route = require('../models/Route')
      const route = await Route.findById(load.routeId)
      if (route) {
        await route.save()
      }
    }

    const updatedLoad = await Load.findById(load._id)
      .populate('createdBy', 'name email')
      .populate('assignedDriver', 'name email phone')
      .populate('broadcastTo', 'name email phone')

    // Handle notifications for updated loads
    if (driversChanged) {
      try {
        const notificationService = require('../services/notificationService')
        const Notification = require('../models/Notification')
        const { getIO } = require('../config/socket')
        const io = getIO()

        const effectiveDriverIds =
          updatedLoad.broadcastTo.length > 0
            ? updatedLoad.broadcastTo.map((d) => d._id.toString())
            : updatedLoad.assignedDriver
              ? [updatedLoad.assignedDriver._id.toString()]
              : []

        // 1. Notify new/current drivers
        for (const did of effectiveDriverIds) {
          await notificationService.notifyDriverLoadAssigned(did, updatedLoad)
        }

        // 2. Cleanup notifications for REMOVED drivers
        for (const oldDid of previousRecipients) {
          if (!effectiveDriverIds.includes(oldDid)) {
            // This driver was removed from the load
            const deletedNotifs = await Notification.find({
              userId: oldDid,
              loadId: load._id,
            }).select('_id')

            if (deletedNotifs.length > 0) {
              await Notification.deleteMany({
                userId: oldDid,
                loadId: load._id,
              })

              // Inform them UI-side to remove the load and notification
              io.to(`user:${oldDid}`).emit('load_update', {
                action: 'accepted_by_other', // Reuse removal action
                loadId: load._id.toString(),
              })
              io.to(`user:${oldDid}`).emit('notifications_removed', {
                loadId: load._id.toString(),
                notificationIds: deletedNotifs.map((n) => n._id.toString()),
              })
            }
          }
        }
      } catch (notifErr) {
        console.error('Error sending update notifications:', notifErr)
      }
    }

    // Emit real-time load_update to creator manager and current drivers
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()

      // Emit to creator manager
      io.to(`user:${updatedLoad.createdBy._id.toString()}`).emit(
        'load_update',
        {
          action: 'updated',
          load: updatedLoad,
        },
      )

      // Emit to current assigned/broadcast drivers
      const currentDriverIds =
        updatedLoad.broadcastTo.length > 0
          ? updatedLoad.broadcastTo.map((d) => d._id.toString())
          : updatedLoad.assignedDriver
            ? [updatedLoad.assignedDriver._id.toString()]
            : []

      for (const did of currentDriverIds) {
        io.to(`user:${did}`).emit('load_update', {
          action: 'updated',
          load: updatedLoad,
        })
      }
    } catch (socketErr) {
      console.error('Socket emit error in updateLoad:', socketErr)
    }

    res.status(200).json({
      success: true,
      message: 'Load updated successfully',
      load: updatedLoad,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Delete load (manager only)
// @route   DELETE /api/loads/:id
// @access  Private/Manager
exports.deleteLoad = async (req, res) => {
  try {
    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    const previousBroadcastTo = load.broadcastTo
      ? load.broadcastTo.map((id) => id.toString())
      : []
    const previousAssignedDriver = load.assignedDriver
      ? load.assignedDriver.toString()
      : null
    const loadId = load._id.toString()

    await load.deleteOne()

    // Emit WebSocket events to remove this load from drivers and manager
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()
      const recipients = new Set(previousBroadcastTo)
      if (previousAssignedDriver) recipients.add(previousAssignedDriver)

      for (const did of recipients) {
        io.to(`user:${did}`).emit('load_update', {
          action: 'accepted_by_other', // REUSE this action as it triggers removal on frontend
          loadId: loadId,
        })
      }
      if (load.createdBy) {
        io.to(`user:${load.createdBy.toString()}`).emit('load_update', {
          action: 'accepted_by_other',
          loadId: loadId,
        })
      }
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr)
    }

    res.status(200).json({
      success: true,
      message: 'Load deleted successfully',
    })
  } catch (err) {
    console.error(err)
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Assign driver to load (manager only)
// @route   PATCH /api/loads/:id/assign
// @access  Private/Manager
exports.assignDriver = async (req, res) => {
  try {
    const driverId = req.body?.driverId

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required',
      })
    }

    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Check if load is already accepted/completed
    if (load.status === 'accepted' || load.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reassign a load that is already accepted or completed',
      })
    }

    const previousDriverId = load.assignedDriver
      ? load.assignedDriver.toString()
      : null

    load.assignedDriver = driverId
    load.status = 'pending'
    await load.save()

    const updatedLoad = await Load.findById(load._id)
      .populate('createdBy', 'name email')
      .populate('assignedDriver', 'name email phone')

    // Send notification to new driver
    try {
      await notificationService.notifyDriverLoadAssigned(driverId, updatedLoad)

      // Emit real-time load_update for new driver
      const { getIO } = require('../config/socket')
      const io = getIO()
      io.to(`user:${driverId}`).emit('load_update', {
        action: 'new',
        load: updatedLoad,
      })

      // Emit real-time load_update for creator manager
      io.to(`user:${updatedLoad.createdBy._id.toString()}`).emit(
        'load_update',
        {
          action: 'updated',
          load: updatedLoad,
        },
      )

      // Cleanup notifications for PREVIOUS driver
      if (previousDriverId && previousDriverId !== driverId) {
        const Notification = require('../models/Notification')

        const deletedNotifs = await Notification.find({
          userId: previousDriverId,
          loadId: load._id,
        }).select('_id')

        if (deletedNotifs.length > 0) {
          await Notification.deleteMany({
            userId: previousDriverId,
            loadId: load._id,
          })

          // Inform old driver UI to remove
          io.to(`user:${previousDriverId}`).emit('load_update', {
            action: 'accepted_by_other',
            loadId: load._id.toString(),
          })
          io.to(`user:${previousDriverId}`).emit('notifications_removed', {
            loadId: load._id.toString(),
            notificationIds: deletedNotifs.map((n) => n._id.toString()),
          })
        }
      }
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    res.status(200).json({
      success: true,
      message: 'Driver assigned successfully',
      load: updatedLoad,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Accept load (driver only) — ATOMIC to prevent race conditions
// @route   PATCH /api/loads/:id/accept
// @access  Private/Driver
exports.acceptLoad = async (req, res) => {
  try {
    // First, find the load to get its details
    const loadCheck = await findLoadByIdOrNumber(req.params.id)

    if (!loadCheck) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Check if this driver is authorized (assigned directly OR in broadcastTo)
    const driverId = req.user._id.toString()
    const isAssigned =
      loadCheck.assignedDriver &&
      loadCheck.assignedDriver.toString() === driverId
    const isBroadcast =
      loadCheck.broadcastTo &&
      loadCheck.broadcastTo.some((id) => id.toString() === driverId)

    if (!isAssigned && !isBroadcast) {
      return res.status(403).json({
        success: false,
        message: 'This load is not assigned to you',
      })
    }

    // ATOMIC acceptance: only succeeds if status is still 'pending'
    // This prevents two drivers from accepting simultaneously
    const previousBroadcastTo = loadCheck.broadcastTo
      ? loadCheck.broadcastTo.map((id) => id.toString())
      : []

    const load = await Load.findOneAndUpdate(
      { _id: loadCheck._id, status: 'pending' },
      {
        $set: {
          status: 'accepted',
          assignedDriver: req.user._id,
          broadcastTo: [],
        },
      },
      { new: true },
    )

    if (!load) {
      // Another driver already accepted this load
      return res.status(409).json({
        success: false,
        message: 'This load has already been accepted by another driver',
      })
    }

    // Populate load to get driver name
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')

    // Send notification to manager
    try {
      await notificationService.notifyManagerLoadAccepted(
        load.createdBy._id,
        load,
        req.user.name,
      )
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    // Emit WebSocket events to OTHER broadcast drivers to remove this load
    // AND delete their notifications for this load
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()
      const Notification = require('../models/Notification')

      for (const otherDriverId of previousBroadcastTo) {
        if (otherDriverId !== driverId) {
          // Remove the load from their dashboard
          io.to(`user:${otherDriverId}`).emit('load_update', {
            action: 'accepted_by_other',
            loadId: load._id.toString(),
          })

          // Delete notifications for this load from other drivers
          const deletedNotifs = await Notification.find({
            userId: otherDriverId,
            loadId: load._id,
          }).select('_id')

          if (deletedNotifs.length > 0) {
            await Notification.deleteMany({
              userId: otherDriverId,
              loadId: load._id,
            })

            // Notify the frontend to remove these notifications from UI
            io.to(`user:${otherDriverId}`).emit('notifications_removed', {
              loadId: load._id.toString(),
              notificationIds: deletedNotifs.map((n) => n._id.toString()),
            })
          }
        }
      }

      // Emit to manager
      io.to(`user:${load.createdBy._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })

      // Emit to accepting driver
      io.to(`user:${driverId}`).emit('load_update', {
        action: 'updated',
        load,
      })
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr)
    }

    res.status(200).json({
      success: true,
      message: 'Load accepted successfully',
      load,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Decline load (driver only)
// @route   PATCH /api/loads/:id/decline
// @access  Private/Driver
exports.declineLoad = async (req, res) => {
  try {
    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Check if this driver is authorized (assigned directly OR in broadcastTo)
    const driverId = req.user._id.toString()
    const isAssigned =
      load.assignedDriver && load.assignedDriver.toString() === driverId
    const isBroadcast =
      load.broadcastTo &&
      load.broadcastTo.some((id) => id.toString() === driverId)

    if (!isAssigned && !isBroadcast) {
      return res.status(403).json({
        success: false,
        message: 'This load is not assigned to you',
      })
    }

    // Check if load is in pending status
    if (load.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot decline a load with status '${load.status}'`,
      })
    }

    if (isBroadcast && !isAssigned) {
      // Broadcast load: remove this driver from broadcastTo
      load.broadcastTo = load.broadcastTo.filter(
        (id) => id.toString() !== driverId,
      )

      // If no drivers left in broadcastTo, notify manager
      if (load.broadcastTo.length === 0) {
        load.status = 'rejected'
      }
      await load.save()
    } else {
      // Direct assignment: reject as before
      load.status = 'rejected'
      await load.save()
    }

    // Populate load to get manager info
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')

    // Notify manager if load moved to 'rejected'
    try {
      if (load.status === 'rejected') {
        await notificationService.notifyManagerLoadRejected(
          load.createdBy._id,
          load,
          req.user.name,
        )
      }
    } catch (notifErr) {
      console.error(
        'Error sending rejection notification to manager:',
        notifErr,
      )
    }

    // Clean up the driver's own notification for this load since they actioned it
    try {
      const Notification = require('../models/Notification')
      const { getIO } = require('../config/socket')
      const io = getIO()

      const deletedNotifs = await Notification.find({
        userId: driverId,
        loadId: load._id,
      }).select('_id')

      if (deletedNotifs.length > 0) {
        await Notification.deleteMany({
          userId: driverId,
          loadId: load._id,
        })

        // Notify the frontend to remove these from UI
        io.to(`user:${driverId}`).emit('notifications_removed', {
          loadId: load._id.toString(),
          notificationIds: deletedNotifs.map((n) => n._id.toString()),
        })
      }

      // Emit update to creator manager
      io.to(`user:${load.createdBy._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })

      // Emit to declining driver to remove load from dashboard
      io.to(`user:${driverId}`).emit('load_update', {
        action: 'accepted_by_other',
        loadId: load._id.toString(),
      })
    } catch (cleanupErr) {
      console.error('Error cleaning up rejected load notification:', cleanupErr)
    }

    res.status(200).json({
      success: true,
      message: 'Load declined',
      load,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Start load journey (driver only)
// @route   PATCH /api/loads/:id/start
// @access  Private/Driver
exports.startLoad = async (req, res) => {
  try {
    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Check if load is assigned to this driver
    if (
      !load.assignedDriver ||
      load.assignedDriver.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'This load is not assigned to you',
      })
    }

    // Check if load is in accepted status
    if (load.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: `Cannot start a load with status '${load.status}'. It must be 'accepted' first.`,
      })
    }

    load.status = 'in-progress'

    // Add to timeline
    load.timeline.push({
      status: 'in-progress',
      timestamp: new Date(),
      note: `Journey started by driver ${req.user.name}`,
    })

    await load.save()

    // Populate load to get manager info
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')

    // Send notification to manager
    try {
      await notificationService.notifyManagerLoadInTransit(
        load.createdBy._id,
        load,
        req.user.name,
      )
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    // Emit real-time load_update to creator manager and driver
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()

      // Emit to creator manager
      io.to(`user:${load.createdBy._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })

      // Emit to driver
      io.to(`user:${load.assignedDriver._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })
    } catch (socketErr) {
      console.error('Socket emit error in startLoad:', socketErr)
    }

    res.status(200).json({
      success: true,
      message: 'Load journey started successfully',
      load,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Upload POD (Proof of Delivery) image (driver only)
// @route   POST /api/loads/:id/pod
// @access  Private/Driver
exports.uploadPOD = async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image',
      })
    }

    // Validate image URL (Cloudinary or base64)
    const isBase64 = image.startsWith('data:image/')
    const isCloudinaryUrl = image.startsWith('https://res.cloudinary.com/')
    const isHttpUrl =
      image.startsWith('http://') || image.startsWith('https://')

    if (!isBase64 && !isCloudinaryUrl && !isHttpUrl) {
      console.log('Invalid image format received:', image.substring(0, 100))
      return res.status(400).json({
        success: false,
        message:
          'Invalid image format. Expected Cloudinary URL or base64 image.',
      })
    }

    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    // Check if load is assigned to this driver
    if (
      !load.assignedDriver ||
      load.assignedDriver.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'This load is not assigned to you',
      })
    }

    // Check if load is in a state where POD can be uploaded
    if (load.status !== 'accepted' && load.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: 'Can only upload POD for accepted or in-progress loads',
      })
    }

    // Update load with POD image(s) - add to array instead of overwriting
    if (!load.podImages) {
      load.podImages = []
    }
    load.podImages.push(image)
    load.status = 'completed'
    load.completedAt = new Date()
    await load.save()

    // Populate load to get manager info
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')

    // Send notification to manager
    try {
      await notificationService.notifyManagerLoadCompleted(
        load.createdBy._id,
        load,
        req.user.name,
      )
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    // Emit real-time load_update to creator manager and driver
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()

      // Emit to creator manager
      io.to(`user:${load.createdBy._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })

      // Emit to driver
      io.to(`user:${load.assignedDriver._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })
    } catch (socketErr) {
      console.error('Socket emit error in uploadPOD:', socketErr)
    }

    res.status(200).json({
      success: true,
      message: 'POD uploaded successfully. Load marked as completed.',
      load,
    })
  } catch (err) {
    console.error('❌ API Error:', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Upload invoice and documents for load
// @route   POST /api/loads/:id/documents
// @access  Private/Driver
exports.uploadDocuments = async (req, res) => {
  try {
    console.log('=== UPLOAD DOCUMENTS API ===')
    console.log('Load ID:', req.params.id)
    console.log('User:', req.user.name, req.user._id)
    console.log('Request body:', JSON.stringify(req.body, null, 2))

    const { invoices, documents } = req.body

    if (
      (!invoices || invoices.length === 0) &&
      (!documents || documents.length === 0)
    ) {
      console.log('❌ No files provided')
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one invoice or document',
      })
    }

    console.log('Files received:', {
      invoiceCount: invoices?.length || 0,
      documentCount: documents?.length || 0,
    })

    const load = await findLoadByIdOrNumber(req.params.id)

    if (!load) {
      console.log('❌ Load not found')
      return res.status(404).json({
        success: false,
        message: 'Load not found',
      })
    }

    console.log('Load found:', {
      id: load._id,
      status: load.status,
      assignedDriver: load.assignedDriver,
    })

    // Check if load is assigned to this driver
    if (
      !load.assignedDriver ||
      load.assignedDriver.toString() !== req.user._id.toString()
    ) {
      console.log('❌ Load not assigned to this driver')
      return res.status(403).json({
        success: false,
        message: 'This load is not assigned to you',
      })
    }

    // Update load with documents
    if (invoices && invoices.length > 0) {
      load.invoices = [...(load.invoices || []), ...invoices]
      console.log('✅ Added invoices:', invoices.length)
    }
    if (documents && documents.length > 0) {
      load.documents = [...(load.documents || []), ...documents]
      console.log('✅ Added documents:', documents.length)
    }

    // Mark load as completed when documents are uploaded
    const oldStatus = load.status
    load.status = 'completed'
    load.completedAt = new Date()
    console.log('✅ Status changed:', oldStatus, '→', load.status)

    await load.save()
    console.log('✅ Load saved successfully')

    // Populate load to get manager info
    await load.populate('createdBy', 'name email')
    await load.populate('assignedDriver', 'name email phone')

    // Send notification to manager
    try {
      await notificationService.notifyManagerDocumentsUploaded(
        load.createdBy._id,
        load,
        req.user.name,
      )
      console.log('✅ Notification sent to manager')
    } catch (notifError) {
      console.error('⚠️ Error sending notification:', notifError)
    }

    // Emit real-time load_update to creator manager and driver
    try {
      const { getIO } = require('../config/socket')
      const io = getIO()

      // Emit to creator manager
      io.to(`user:${load.createdBy._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })

      // Emit to driver
      io.to(`user:${load.assignedDriver._id.toString()}`).emit('load_update', {
        action: 'updated',
        load,
      })
    } catch (socketErr) {
      console.error('Socket emit error in uploadDocuments:', socketErr)
    }

    console.log('✅ Sending success response')
    res.status(200).json({
      success: true,
      message: 'Documents uploaded successfully',
      load,
    })
  } catch (err) {
    console.error('❌ API Error (uploadDocuments):', err)
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message,
      error: err.message,
    })
  }
}

// @desc    Calculate distance between two locations or with waypoints
// @route   POST /api/loads/calculate-distance
// @access  Private/Manager
exports.calculateDistance = async (req, res) => {
  try {
    const { pickupLocation, dropoffLocation, waypoints } = req.body

    if (!pickupLocation || !dropoffLocation) {
      return res.status(400).json({
        success: false,
        message: 'Both pickup and dropoff locations are required',
      })
    }

    let distanceData

    // If waypoints provided, use waypoint calculation
    if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
      const {
        calculateRouteDistanceWithWaypoints,
      } = require('../services/geocodeService')
      distanceData = await calculateRouteDistanceWithWaypoints(
        pickupLocation,
        dropoffLocation,
        waypoints,
      )
    } else {
      distanceData = await calculateRouteDistance(
        pickupLocation,
        dropoffLocation,
      )
    }

    res.status(200).json({
      success: true,
      distance: distanceData.distance,
      unit: distanceData.unit,
      duration: distanceData.duration,
      origin: distanceData.origin || pickupLocation,
      destination: distanceData.destination || dropoffLocation,
      waypoints: distanceData.waypoints || [],
    })
  } catch (err) {
    console.error('Distance calculation error:', err)
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to calculate distance',
    })
  }
}

// @desc    Calculate cost breakdown for a route
// @route   POST /api/loads/calculate-costs
// @access  Private/Manager
exports.calculateCosts = async (req, res) => {
  try {
    const {
      distance,
      clientPrice,
      driverPrice = 0,
      fuelConsumption = 30,
      fuelPricePerLiter = 0,
      driverDailyCost = 0,
      truckCostPerKm = 0,
      tolls = 0,
      otherExpenses = 0,
    } = req.body

    if (!distance || !clientPrice) {
      return res.status(400).json({
        success: false,
        message: 'Distance and client price are required',
      })
    }

    // Calculate costs using the same formula as the model
    const fuelCost = ((distance * fuelConsumption) / 100) * fuelPricePerLiter
    const driverCost =
      (parseFloat(driverPrice) || 0) + (parseFloat(driverDailyCost) || 0)
    const truckCost = distance * truckCostPerKm
    const totalCost = fuelCost + driverCost + truckCost + tolls + otherExpenses
    const profit = clientPrice - totalCost
    const profitPerKm = distance > 0 ? profit / distance : 0

    res.status(200).json({
      success: true,
      costs: {
        fuelCost: Math.round(fuelCost * 100) / 100,
        driverCost: Math.round(driverCost * 100) / 100,
        truckCost: Math.round(truckCost * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        profitPerKm: Math.round(profitPerKm * 100) / 100,
      },
    })
  } catch (err) {
    console.error('Cost calculation error:', err)
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to calculate costs',
    })
  }
}
