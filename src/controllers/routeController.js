const Route = require('../models/Route');
const Load = require('../models/Load');
const notificationService = require('../services/notificationService');

// @desc    Create route (manager only)
// @route   POST /api/routes
// @access  Private/Manager
const createRoute = async (req, res) => {
    try {
        const {
            routeName,
            origin,
            destination,
            totalDistance,
            assignedDriverId,
            driverIds, // NEW: array for multi-broadcast
            assignedTruck,
            startDate,
            endDate,
            fuelConsumption,
            fuelPricePerLiter,
            driverDailyCost,
            truckCostPerKm,
            tolls,
            otherExpenses,
            notes,
            loadIds,
            originCoords,
            destinationCoords,
            driverStartingCoords,
            preRouteDistance,
            routeDistance,
            driverStartingLocation
        } = req.body;

        // Resolve effective driver IDs (support both old single and new multi)
        const effectiveDriverIds = (driverIds && driverIds.length > 0)
            ? driverIds
            : (assignedDriverId ? [assignedDriverId] : []);

        // Validate required fields
        if (!routeName || !startDate || effectiveDriverIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Route name, at least one driver, and start date are required',
            });
        }

        // Build route data
        const routeData = {
            routeName,
            origin: origin || '',
            destination: destination || '',
            totalDistance: totalDistance || 0,
            preRouteDistance: preRouteDistance || 0,
            routeDistance: routeDistance || 0,
            originCoords,
            destinationCoords,
            driverStartingCoords,
            driverStartingLocation,
            assignedTruck: assignedTruck || {},
            startDate,
            endDate,
            fuelConsumption: fuelConsumption || 30,
            fuelPricePerLiter: fuelPricePerLiter || 0,
            driverDailyCost: driverDailyCost || 0,
            truckCostPerKm: truckCostPerKm || 0,
            tolls: tolls || 0,
            otherExpenses: otherExpenses || 0,
            notes: notes || '',
            createdBy: req.user._id,
            status: 'pending',
            loads: [],
        };

        // Single driver → direct assign; multiple → broadcast
        if (effectiveDriverIds.length === 1) {
            routeData.assignedDriver = effectiveDriverIds[0];
        } else {
            routeData.broadcastTo = effectiveDriverIds;
            routeData.assignedDriver = null;
        }

        const route = await Route.create(routeData);

        // Attach loads if provided
        if (loadIds && loadIds.length > 0) {
            const driverForLoads = effectiveDriverIds.length === 1 ? effectiveDriverIds[0] : null;
            await Load.updateMany(
                { _id: { $in: loadIds } },
                { $set: { routeId: route._id, ...(driverForLoads && { assignedDriver: driverForLoads }) } }
            );
            route.loads = loadIds;

            const loads = await Load.find({ _id: { $in: loadIds } });
            if (!totalDistance) route.totalDistance = loads.reduce((sum, l) => sum + (l.distance || 0), 0);
            if (!routeDistance) route.routeDistance = route.totalDistance;
            route.totalRevenue = loads.reduce((sum, l) => sum + (l.clientPrice || 0), 0);
            await route.save();
        }

        // Populate
        const populatedRoute = await Route.findById(route._id)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('broadcastTo', 'name email phone')
            .populate('loads');

        // Notify + WebSocket to all drivers and creator manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            for (const did of effectiveDriverIds) {
                await notificationService.notifyDriverRouteAssigned(did, populatedRoute);
                io.to(`user:${did}`).emit('route_update', { action: 'new', route: populatedRoute });
            }
            // Emit to creator manager
            io.to(`user:${populatedRoute.createdBy._id.toString()}`).emit('route_update', { action: 'new', route: populatedRoute });
        } catch (notifError) {
            console.error('Error sending notifications:', notifError);
        }

        res.status(201).json({
            success: true,
            message: 'Route created successfully',
            route: populatedRoute,
        });
    } catch (err) {
        console.error('❌ Create Route Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Get all routes
// @route   GET /api/routes
// @access  Private
const getRoutes = async (req, res) => {
    try {
        let query = {};

        // Driver can see: assigned routes OR routes broadcast to them
        if (req.user.role === 'driver') {
            query.$or = [
                { assignedDriver: req.user._id },
                { broadcastTo: req.user._id }
            ];
        } else if (req.user.role === 'manager') {
            query.createdBy = req.user._id;
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const routes = await Route.find(query)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('broadcastTo', 'name email phone')
            .populate('loads')
            .sort({ createdAt: -1 });

        // Privacy: drivers only see themselves in broadcastTo
        if (req.user.role === 'driver') {
            routes.forEach(route => {
                if (route.broadcastTo) {
                    route.broadcastTo = route.broadcastTo.filter(d =>
                        d._id.toString() === req.user._id.toString()
                    );
                }
            });
        }

        res.status(200).json({
            success: true,
            count: routes.length,
            routes,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Get single route
// @route   GET /api/routes/:id
// @access  Private
const getRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('broadcastTo', 'name email phone')
            .populate('loads');

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        // Driver access: assignedDriver OR in broadcastTo
        if (req.user.role === 'driver') {
            const driverId = req.user._id.toString();
            const isAssigned = route.assignedDriver && route.assignedDriver._id.toString() === driverId;
            const isBroadcast = route.broadcastTo && route.broadcastTo.some(d => d._id.toString() === driverId);

            if (!isAssigned && !isBroadcast) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view this route',
                });
            }

            // Privacy: only show this driver in broadcastTo
            if (route.broadcastTo) {
                route.broadcastTo = route.broadcastTo.filter(d => d._id.toString() === driverId);
            }
        }

        res.status(200).json({
            success: true,
            route,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Update route (manager only)
// @route   PATCH /api/routes/:id
// @access  Private/Manager
const updateRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        const {
            routeName,
            origin,
            destination,
            assignedTruck,
            startDate,
            endDate,
            fuelConsumption,
            fuelPricePerLiter,
            driverDailyCost,
            truckCostPerKm,
            tolls,
            otherExpenses,
            notes,
        } = req.body;

        // Update fields if provided
        if (routeName) route.routeName = routeName;
        if (origin !== undefined) route.origin = origin;
        if (destination !== undefined) route.destination = destination;
        if (assignedTruck) route.assignedTruck = assignedTruck;
        if (startDate) route.startDate = startDate;
        if (endDate) route.endDate = endDate;
        if (fuelConsumption !== undefined) route.fuelConsumption = fuelConsumption;
        if (fuelPricePerLiter !== undefined) route.fuelPricePerLiter = fuelPricePerLiter;
        if (driverDailyCost !== undefined) route.driverDailyCost = driverDailyCost;
        if (truckCostPerKm !== undefined) route.truckCostPerKm = truckCostPerKm;
        if (tolls !== undefined) route.tolls = tolls;
        if (otherExpenses !== undefined) route.otherExpenses = otherExpenses;
        if (notes !== undefined) route.notes = notes;

        await route.save();

        const updatedRoute = await Route.findById(route._id)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('loads');

        // Emit real-time route_update to creator manager and assigned driver
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${updatedRoute.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            if (updatedRoute.assignedDriver) {
                io.to(`user:${updatedRoute.assignedDriver._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            }
        } catch (socketErr) {
            console.error('Socket emit error in updateRoute:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: 'Route updated successfully',
            route: updatedRoute,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Delete route (manager only)
// @route   DELETE /api/routes/:id
// @access  Private/Manager
const deleteRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        // Capture recipients before deleting
        const previousBroadcastTo = route.broadcastTo ? route.broadcastTo.map(id => id.toString()) : [];
        const previousAssignedDriver = route.assignedDriver ? route.assignedDriver.toString() : null;
        const routeId = route._id.toString();

        // Remove routeId from all loads
        await Load.updateMany(
            { routeId: route._id },
            { $unset: { routeId: '' } }
        );

        await route.deleteOne();

        // Notify affected drivers + manager via WebSocket and clean up their notifications
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            const Notification = require('../models/Notification');

            // Notify manager: route deleted
            const managerId = route.createdBy ? route.createdBy.toString() : null;
            if (managerId) {
                io.to(`user:${managerId}`).emit('route_update', { action: 'deleted', routeId });
            }

            const recipients = new Set(previousBroadcastTo);
            if (previousAssignedDriver) recipients.add(previousAssignedDriver);

            for (const did of recipients) {
                io.to(`user:${did}`).emit('route_update', {
                    action: 'accepted_by_other',
                    routeId,
                });
                // Clean up notifications
                const deletedNotifs = await Notification.find({ userId: did, routeId: route._id }).select('_id');
                if (deletedNotifs.length > 0) {
                    await Notification.deleteMany({ userId: did, routeId: route._id });
                    io.to(`user:${did}`).emit('notifications_removed', {
                        routeId,
                        notificationIds: deletedNotifs.map(n => n._id.toString()),
                    });
                }
            }
        } catch (socketErr) {
            console.error('Socket emit error:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: 'Route deleted successfully',
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Add loads to route (manager only)
// @route   POST /api/routes/:id/loads
// @access  Private/Manager
const addLoadsToRoute = async (req, res) => {
    try {
        const { loadIds } = req.body;

        if (!loadIds || loadIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide load IDs',
            });
        }

        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        // Update loads with routeId and driver
        await Load.updateMany(
            { _id: { $in: loadIds } },
            {
                $set: {
                    routeId: route._id,
                    assignedDriver: route.assignedDriver
                }
            }
        );

        // Add loads to route
        route.loads = [...new Set([...route.loads, ...loadIds])]; // Avoid duplicates

        // Recalculate total distance and revenue
        const loads = await Load.find({ _id: { $in: route.loads } });
        route.totalDistance = loads.reduce((sum, load) => sum + (load.distance || 0), 0);
        route.totalRevenue = loads.reduce((sum, load) => sum + (load.clientPrice || 0), 0);

        await route.save();

        const updatedRoute = await Route.findById(route._id)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('loads');

        // Emit real-time update to manager and driver
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${updatedRoute.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            if (updatedRoute.assignedDriver) {
                io.to(`user:${updatedRoute.assignedDriver._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            }
        } catch (socketErr) {
            console.error('Socket emit error in addLoadsToRoute:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: 'Loads added to route successfully',
            route: updatedRoute,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Remove load from route (manager only)
// @route   DELETE /api/routes/:id/loads/:loadId
// @access  Private/Manager
const removeLoadFromRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        // Remove load from route
        route.loads = route.loads.filter(
            loadId => loadId.toString() !== req.params.loadId
        );

        // Remove routeId from load
        await Load.findByIdAndUpdate(req.params.loadId, {
            $unset: { routeId: '' }
        });

        // Recalculate totals
        const loads = await Load.find({ _id: { $in: route.loads } });
        route.totalDistance = loads.reduce((sum, load) => sum + (load.distance || 0), 0);
        route.totalRevenue = loads.reduce((sum, load) => sum + (load.clientPrice || 0), 0);

        await route.save();

        const updatedRoute = await Route.findById(route._id)
            .populate('createdBy', 'name email')
            .populate('assignedDriver', 'name email phone')
            .populate('loads');

        // Emit real-time update to manager and driver
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${updatedRoute.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            if (updatedRoute.assignedDriver) {
                io.to(`user:${updatedRoute.assignedDriver._id.toString()}`).emit('route_update', { action: 'updated', route: updatedRoute });
            }
        } catch (socketErr) {
            console.error('Socket emit error in removeLoadFromRoute:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: 'Load removed from route successfully',
            route: updatedRoute,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

// @desc    Accept route (driver only)
// @route   PATCH /api/routes/:id/accept
// @access  Private/Driver
const acceptRoute = async (req, res) => {
    try {
        // First fetch to check authorization
        const routeCheck = await Route.findById(req.params.id);

        if (!routeCheck) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        const driverId = req.user._id.toString();
        const isAssigned = routeCheck.assignedDriver && routeCheck.assignedDriver.toString() === driverId;
        const isBroadcast = routeCheck.broadcastTo && routeCheck.broadcastTo.some(id => id.toString() === driverId);

        if (!isAssigned && !isBroadcast) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        // Save previous broadcast list before clearing it
        const previousBroadcastTo = routeCheck.broadcastTo
            ? routeCheck.broadcastTo.map(id => id.toString())
            : [];

        // ATOMIC: only succeeds if status is still 'pending' — prevents race conditions
        const route = await Route.findOneAndUpdate(
            { _id: routeCheck._id, status: 'pending' },
            { $set: { status: 'accepted', assignedDriver: req.user._id, broadcastTo: [] } },
            { new: true }
        );

        if (!route) {
            return res.status(409).json({
                success: false,
                message: 'This route has already been accepted by another driver',
            });
        }

        await route.populate('createdBy', 'name email');
        await route.populate('assignedDriver', 'name email phone');
        await route.populate('loads');

        // Notify manager
        try {
            await notificationService.notifyManagerRouteAccepted(
                route.createdBy._id,
                route,
                req.user.name
            );
        } catch (notifError) {
            console.error('Error sending notification:', notifError);
        }

        // Emit to all OTHER broadcast drivers: remove this route from their dashboard
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            const Notification = require('../models/Notification');

            for (const otherDriverId of previousBroadcastTo) {
                if (otherDriverId !== driverId) {
                    io.to(`user:${otherDriverId}`).emit('route_update', {
                        action: 'accepted_by_other',
                        routeId: route._id.toString(),
                    });

                    // Delete their notifications for this route
                    const deletedNotifs = await Notification.find({
                        userId: otherDriverId,
                        routeId: route._id,
                    }).select('_id');

                    if (deletedNotifs.length > 0) {
                        await Notification.deleteMany({ userId: otherDriverId, routeId: route._id });
                        io.to(`user:${otherDriverId}`).emit('notifications_removed', {
                            routeId: route._id.toString(),
                            notificationIds: deletedNotifs.map(n => n._id.toString()),
                        });
                    }
                }
            }
            // Also notify the manager that the route was accepted
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
        } catch (socketErr) {
            console.error('Socket emit error:', socketErr);
        }

        res.status(200).json({ success: true, message: 'Route accepted successfully', route });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message, error: err.message });
    }
};

// @desc    Reject route (driver only)
// @route   PATCH /api/routes/:id/reject
// @access  Private/Driver
const rejectRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        const driverId = req.user._id.toString();
        const isAssigned = route.assignedDriver && route.assignedDriver.toString() === driverId;
        const isBroadcast = route.broadcastTo && route.broadcastTo.some(id => id.toString() === driverId);

        if (!isAssigned && !isBroadcast) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        if (route.status !== 'pending') {
            return res.status(400).json({ success: false, message: `Cannot reject a route with status '${route.status}'` });
        }

        if (isBroadcast && !isAssigned) {
            // Broadcast route: just remove this one driver from the list
            route.broadcastTo = route.broadcastTo.filter(id => id.toString() !== driverId);
            if (route.broadcastTo.length === 0) {
                route.status = 'rejected';
            }
            await route.save();
        } else {
            // Direct assignment: reject entirely
            route.status = 'rejected';
            await route.save();
        }

        await route.populate('createdBy', 'name email');
        await route.populate('assignedDriver', 'name email phone');
        await route.populate('loads');

        // Notify manager only if route is fully rejected
        if (route.status === 'rejected') {
            try {
                await notificationService.notifyManagerRouteRejected(
                    route.createdBy._id,
                    route,
                    req.user.name
                );
            } catch (notifError) {
                console.error('Error sending notification:', notifError);
            }
        }

        // Clean up this driver's own notification for this route
        try {
            const Notification = require('../models/Notification');
            const { getIO } = require('../config/socket');
            const io = getIO();

            const deletedNotifs = await Notification.find({
                userId: driverId,
                routeId: route._id,
            }).select('_id');

            if (deletedNotifs.length > 0) {
                await Notification.deleteMany({ userId: driverId, routeId: route._id });
                io.to(`user:${driverId}`).emit('notifications_removed', {
                    routeId: route._id.toString(),
                    notificationIds: deletedNotifs.map(n => n._id.toString()),
                });
            }
            // Notify manager of the rejection
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
        } catch (cleanupErr) {
            console.error('Error cleaning up rejected route notification:', cleanupErr);
        }

        res.status(200).json({ success: true, message: 'Route rejected', route });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message, error: err.message });
    }
};

// @desc    Start route (driver only) - accepted -> in-progress
// @route   PATCH /api/routes/:id/start
// @access  Private/Driver
const startRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        if (route.assignedDriver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        if (route.status !== 'accepted') {
            return res.status(400).json({ success: false, message: `Cannot start a route with status '${route.status}'` });
        }

        route.status = 'in-progress';
        await route.save();

        await route.populate('createdBy', 'name email');
        await route.populate('assignedDriver', 'name email phone');
        await route.populate('loads');

        // Emit real-time update to manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
        } catch (socketErr) {
            console.error('Socket emit error in startRoute:', socketErr);
        }

        res.status(200).json({ success: true, message: 'Route started', route });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

// @desc    Complete route (driver only) - in-progress -> completed
// @route   PATCH /api/routes/:id/complete
// @access  Private/Driver
const completeRoute = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id).populate('loads');
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        if (route.assignedDriver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        if (route.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: `Cannot complete a route with status '${route.status}'` });
        }

        // Check if all loads are completed
        const incompleteLoads = route.loads.filter(l => l.status !== 'completed');
        if (incompleteLoads.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot complete route: ${incompleteLoads.length} load(s) are not yet completed`,
            });
        }

        route.status = 'completed';
        route.completedAt = new Date();
        await route.save();

        await route.populate('createdBy', 'name email');
        await route.populate('assignedDriver', 'name email phone');

        // Emit real-time update to manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
        } catch (socketErr) {
            console.error('Socket emit error in completeRoute:', socketErr);
        }

        res.status(200).json({ success: true, message: 'Route completed', route });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

// @desc    Start a specific load within a route (driver only)
// @route   PATCH /api/routes/:id/loads/:loadId/start
// @access  Private/Driver
const startRouteLoad = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        if (route.assignedDriver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        if (route.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: 'Route must be in-progress to start loads' });
        }

        const load = await Load.findById(req.params.loadId);
        if (!load) {
            return res.status(404).json({ success: false, message: 'Load not found' });
        }

        if (!route.loads.includes(load._id.toString()) && !route.loads.some(l => l.toString() === load._id.toString())) {
            return res.status(400).json({ success: false, message: 'This load is not part of this route' });
        }

        if (load.status !== 'pending' && load.status !== 'accepted') {
            return res.status(400).json({ success: false, message: `Cannot start a load with status '${load.status}'` });
        }

        load.status = 'in-progress';
        await load.save();

        // Re-populate the route
        await route.populate('createdBy', 'name email');
        await route.populate('loads');

        // Emit real-time update to manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
            io.to(`user:${route.createdBy._id.toString()}`).emit('load_update', { action: 'updated', load });
        } catch (socketErr) {
            console.error('Socket emit error in startRouteLoad:', socketErr);
        }

        res.status(200).json({ success: true, message: 'Load started', load, route });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

// @desc    Complete a specific load within a route (driver only)
// @route   PATCH /api/routes/:id/loads/:loadId/complete
// @access  Private/Driver
const completeRouteLoad = async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }

        if (route.assignedDriver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'This route is not assigned to you' });
        }

        if (route.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: 'Route must be in-progress to complete loads' });
        }

        const load = await Load.findById(req.params.loadId);
        if (!load) {
            return res.status(404).json({ success: false, message: 'Load not found' });
        }

        if (load.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: `Cannot complete a load with status '${load.status}'` });
        }

        load.status = 'completed';
        await load.save();

        // Re-populate the route
        await route.populate('createdBy', 'name email');
        await route.populate('loads');

        // Check if all loads are now completed
        const allCompleted = route.loads.every(l => l.status === 'completed');

        // Emit real-time update to manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
            io.to(`user:${route.createdBy._id.toString()}`).emit('load_update', { action: 'updated', load });
        } catch (socketErr) {
            console.error('Socket emit error in completeRouteLoad:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: allCompleted ? 'Load completed. All loads are done! You can now complete the route.' : 'Load completed',
            load,
            route,
            allLoadsCompleted: allCompleted,
        });
    } catch (err) {
        console.error('❌ API Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

// @desc    Upload invoices and documents for route (driver only)
// @route   POST /api/routes/:id/documents
// @access  Private/Driver
const uploadDocuments = async (req, res) => {
    try {
        console.log('=== UPLOAD ROUTE DOCUMENTS API ===');
        const { invoices, documents, podImage } = req.body;

        if ((!invoices || invoices.length === 0) && (!documents || documents.length === 0) && !podImage) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one invoice, document, or POD image',
            });
        }

        const route = await Route.findById(req.params.id);

        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'Route not found',
            });
        }

        // Check if route is assigned to this driver
        if (route.assignedDriver.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'This route is not assigned to you',
            });
        }

        // Update route with documents
        if (podImage) route.podImage = podImage;
        if (invoices && invoices.length > 0) {
            route.invoices = [...(route.invoices || []), ...invoices];
        }
        if (documents && documents.length > 0) {
            route.documents = [...(route.documents || []), ...documents];
        }

        // Mark route as completed
        route.status = 'completed';
        route.completedAt = new Date();

        await route.save();

        // Populate route to get manager info
        await route.populate('createdBy', 'name email');
        await route.populate('assignedDriver', 'name email phone');

        // Send notification to manager
        try {
            await notificationService.notifyManagerRouteDocumentsUploaded(
                route.createdBy._id,
                route,
                req.user.name
            );
        } catch (notifError) {
            console.error('Error sending notification:', notifError);
        }

        // Emit real-time update to manager
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to(`user:${route.createdBy._id.toString()}`).emit('route_update', { action: 'updated', route });
        } catch (socketErr) {
            console.error('Socket emit error in uploadDocuments:', socketErr);
        }

        res.status(200).json({
            success: true,
            message: 'Route documents uploaded and route completed successfully',
            route,
        });
    } catch (err) {
        console.error('❌ API Error (uploadRouteDocuments):', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message,
            error: err.message
        });
    }
};

module.exports = {
    createRoute,
    getRoutes,
    getRoute,
    updateRoute,
    deleteRoute,
    addLoadsToRoute,
    removeLoadFromRoute,
    acceptRoute,
    rejectRoute,
    startRoute,
    completeRoute,
    startRouteLoad,
    completeRouteLoad,
    uploadDocuments,
};
