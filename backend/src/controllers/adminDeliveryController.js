import mongoose from 'mongoose';
import User from '../models/User.js';
import DeliveryAgentProfile from '../models/DeliveryAgentProfile.js';
import Shipment, { SHIPMENT_STATUSES } from '../models/Shipment.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import { hashPassword } from '../services/userService.js';
import { passwordRule } from '../validators/auth.js';
import { AppError, badRequest, conflict, notFound } from '../utils/AppError.js';
import { emitToOrder, emitToRole, emitToUser } from '../sockets/socket.js';

// Helper to calculate agent availability
function computeAvailability(userStatus, isAvailable, activeCount) {
  if (userStatus !== 'active' || isAvailable === false) return 'offline';
  if (activeCount > 0) return 'busy';
  return 'available';
}

// 1. List all delivery agents with search, status & availability filters and metrics
export async function listAgents(req, res, next) {
  try {
    const { search = '', status, availability, page = 1, limit = 20 } = req.query;
    const filter = { role: 'delivery_agent' };

    if (status) {
      filter.status = status;
    } else {
      filter.status = { $ne: 'deleted' };
    }

    if (search.trim()) {
      const reg = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: reg }, { email: reg }, { phone: reg }];
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const totalUsers = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean();

    const userIds = users.map((u) => u._id);

    // Fetch profiles
    const profiles = await DeliveryAgentProfile.find({ userId: { $in: userIds } }).lean();
    const profileMap = new Map(profiles.map((pr) => [String(pr.userId), pr]));

    // Aggregate deliveries per agent
    const deliveryAgg = await Shipment.aggregate([
      { $match: { deliveryAgentId: { $in: userIds } } },
      {
        $group: {
          _id: '$deliveryAgentId',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          active: {
            $sum: {
              $cond: [
                { $in: ['$status', ['assigned', 'picked_up', 'out_for_delivery']] },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed_delivery'] }, 1, 0] },
          },
        },
      },
    ]);
    const deliveryMap = new Map(deliveryAgg.map((d) => [String(d._id), d]));

    let items = users.map((u) => {
      const pr = profileMap.get(String(u._id)) || {};
      const stats = deliveryMap.get(String(u._id)) || { total: 0, completed: 0, active: 0, failed: 0 };
      const avail = computeAvailability(u.status, pr.isAvailable ?? true, stats.active);

      return {
        id: String(u._id),
        name: u.name,
        username: u.email.split('@')[0],
        email: u.email,
        phone: u.phone || '–',
        status: u.status,
        availability: avail,
        isAvailable: pr.isAvailable ?? true,
        vehicleType: pr.vehicleType || 'bike',
        vehicleNumber: pr.vehicleNumber || '–',
        drivingLicense: pr.drivingLicense || '–',
        servicePincodes: pr.servicePincodes || [],
        rating: pr.rating ?? 5.0,
        ratingCount: pr.ratingCount ?? 0,
        totalAssigned: stats.total,
        completedDeliveries: stats.completed,
        pendingDeliveries: stats.active,
        failedDeliveries: stats.failed,
        earningsPaise: pr.earningsPaise ?? 0,
        createdAt: u.createdAt,
      };
    });

    if (availability) {
      items = items.filter((it) => it.availability === availability);
    }

    res.json({
      items,
      total: totalUsers,
      page: p,
      pages: Math.ceil(totalUsers / l) || 1,
    });
  } catch (err) {
    next(err);
  }
}

// 2. Get single delivery agent profile & assigned shipments
export async function getAgent(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid delivery agent ID');

    const user = await User.findOne({ _id: id, role: 'delivery_agent' }).lean();
    if (!user) throw notFound('Delivery agent not found');

    const profile = (await DeliveryAgentProfile.findOne({ userId: id }).lean()) || {};

    const activeShipments = await Shipment.find({
      deliveryAgentId: id,
      status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
    })
      .populate('orderId', 'orderNumber paymentMethod paymentStatus createdAt')
      .sort({ assignedAt: -1 })
      .lean();

    const recentDeliveries = await Shipment.find({
      deliveryAgentId: id,
      status: { $in: ['delivered', 'failed_delivery', 'returned'] },
    })
      .populate('orderId', 'orderNumber paymentMethod paymentStatus createdAt')
      .sort({ deliveredAt: -1, updatedAt: -1 })
      .limit(15)
      .lean();

    const agg = await Shipment.aggregate([
      { $match: { deliveryAgentId: user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          active: {
            $sum: {
              $cond: [
                { $in: ['$status', ['assigned', 'picked_up', 'out_for_delivery']] },
                1,
                0,
              ],
            },
          },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed_delivery'] }, 1, 0] } },
        },
      },
    ]);
    const stats = agg[0] || { total: 0, completed: 0, active: 0, failed: 0 };
    const availability = computeAvailability(user.status, profile.isAvailable ?? true, stats.active);

    res.json({
      agent: {
        id: String(user._id),
        name: user.name,
        username: user.email.split('@')[0],
        email: user.email,
        phone: user.phone || '',
        status: user.status,
        availability,
        isAvailable: profile.isAvailable ?? true,
        vehicleType: profile.vehicleType || 'bike',
        vehicleNumber: profile.vehicleNumber || '',
        drivingLicense: profile.drivingLicense || '',
        servicePincodes: profile.servicePincodes || [],
        rating: profile.rating ?? 5.0,
        ratingCount: profile.ratingCount ?? 0,
        earningsPaise: profile.earningsPaise ?? 0,
        incentivesPaise: profile.incentivesPaise ?? 0,
        totalAssigned: stats.total,
        completedDeliveries: stats.completed,
        pendingDeliveries: stats.active,
        failedDeliveries: stats.failed,
        createdAt: user.createdAt,
      },
      activeShipments,
      recentDeliveries,
    });
  } catch (err) {
    next(err);
  }
}

// 3. Create a new delivery agent
export async function createAgent(req, res, next) {
  try {
    const {
      name,
      email,
      phone,
      password,
      status = 'active',
      vehicleType = 'bike',
      vehicleNumber = '',
      drivingLicense = '',
      servicePincodes = [],
      isAvailable = true,
    } = req.body;

    if (!name || name.trim().length < 2) throw badRequest('Name is required (at least 2 characters)');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('A valid email address is required');
    if (!password) throw badRequest('Password is required');

    const check = passwordRule.safeParse(password);
    if (!check.success) {
      throw badRequest(`Password invalid: ${check.error.issues[0].message} (min 10 characters, letters & numbers)`);
    }

    const emailClean = email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailClean });
    if (existing) throw conflict('A user with this email address already exists', 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name: name.trim(),
      email: emailClean,
      phone: phone ? phone.trim() : undefined,
      role: 'delivery_agent',
      status: ['active', 'pending_approval'].includes(status) ? status : 'active',
      passwordHash,
      passwordChangedAt: new Date(),
    });

    const cleanPincodes = Array.isArray(servicePincodes)
      ? servicePincodes.map((s) => String(s).trim()).filter(Boolean)
      : typeof servicePincodes === 'string'
      ? servicePincodes.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const profile = await DeliveryAgentProfile.create({
      userId: user._id,
      vehicleType,
      vehicleNumber: vehicleNumber.trim(),
      drivingLicense: drivingLicense.trim(),
      servicePincodes: cleanPincodes,
      isAvailable: Boolean(isAvailable),
    });

    res.status(201).json({
      message: 'Delivery Agent created successfully',
      agent: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        vehicleType: profile.vehicleType,
        isAvailable: profile.isAvailable,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 4. Update delivery agent info & profile
export async function updateAgent(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid delivery agent ID');

    const user = await User.findOne({ _id: id, role: 'delivery_agent' });
    if (!user) throw notFound('Delivery agent not found');

    const {
      name,
      phone,
      status,
      password,
      vehicleType,
      vehicleNumber,
      drivingLicense,
      servicePincodes,
      isAvailable,
    } = req.body;

    const prevStatus = user.status;
    if (name && name.trim().length >= 2) user.name = name.trim();
    if (phone !== undefined) user.phone = phone ? phone.trim() : undefined;
    if (status && ['active', 'pending_approval', 'suspended', 'deactivated'].includes(status)) {
      user.status = status;
    }

    if (password && password.trim()) {
      const check = passwordRule.safeParse(password);
      if (!check.success) {
        throw badRequest(`Password invalid: ${check.error.issues[0].message}`);
      }
      user.passwordHash = await hashPassword(password);
      user.passwordChangedAt = new Date();
    }

    await user.save();

    const profileUpdate = {};
    if (vehicleType) profileUpdate.vehicleType = vehicleType;
    if (vehicleNumber !== undefined) profileUpdate.vehicleNumber = vehicleNumber.trim();
    if (drivingLicense !== undefined) profileUpdate.drivingLicense = drivingLicense.trim();
    if (isAvailable !== undefined) {
      profileUpdate.isAvailable = Boolean(isAvailable);
    } else if (status === 'active' && prevStatus !== 'active') {
      profileUpdate.isAvailable = true;
    }
    if (servicePincodes !== undefined) {
      profileUpdate.servicePincodes = Array.isArray(servicePincodes)
        ? servicePincodes.map((s) => String(s).trim()).filter(Boolean)
        : typeof servicePincodes === 'string'
        ? servicePincodes.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    }

    const profile = await DeliveryAgentProfile.findOneAndUpdate(
      { userId: user._id },
      { $set: profileUpdate },
      { new: true, upsert: true },
    );

    // If newly approved/activated, notify the agent
    if (user.status === 'active' && prevStatus !== 'active') {
      try {
        await Notification.create({
          userId: user._id,
          type: 'account_approved',
          title: 'Account Approved!',
          body: 'Your Delivery Agent account has been approved by the Website Admin. You are now authorized to accept delivery assignments.',
          data: { role: 'delivery_agent', status: 'active' },
        });
        emitToUser(user._id, 'agent:approved', {
          status: 'active',
          message: 'Your Delivery Agent account has been approved.',
        });
      } catch {
        // notification failure shouldn't abort response
      }
    }

    res.json({
      message: 'Delivery Agent updated successfully',
      agent: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        vehicleType: profile.vehicleType,
        isAvailable: profile.isAvailable,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 5. Delete delivery agent with safeguards
export async function deleteAgent(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid delivery agent ID');

    const user = await User.findOne({ _id: id, role: 'delivery_agent' });
    if (!user) throw notFound('Delivery agent not found');

    // Safeguard: Check for active in-progress deliveries
    const activeDeliveries = await Shipment.find({
      deliveryAgentId: id,
      status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
    })
      .populate('orderId', 'orderNumber')
      .lean();

    if (activeDeliveries.length > 0) {
      const orderNums = activeDeliveries.map((d) => d.orderId?.orderNumber || String(d._id)).join(', ');
      throw conflict(
        `Cannot delete delivery agent: they currently have ${activeDeliveries.length} active delivery assignment(s) (${orderNums}). Reassign or complete these orders before deleting this agent.`,
        'ACTIVE_DELIVERIES_EXIST',
      );
    }

    // Mark user as deleted and offline
    user.status = 'deleted';
    user.deletedAt = new Date();
    await user.save();

    await DeliveryAgentProfile.updateOne({ userId: id }, { isAvailable: false });

    res.json({
      message: `Delivery agent “${user.name}” has been safely removed and anonymized.`,
    });
  } catch (err) {
    next(err);
  }
}

// 6. List all deliveries / assignments for the Admin Delivery Management table
export async function listDeliveries(req, res, next) {
  try {
    const { status, agentId, search = '', page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) {
      if (status === 'pending_assignment') {
        filter.status = { $in: ['packed', 'pickup_requested'] };
      } else if (status === 'active') {
        filter.status = { $in: ['assigned', 'picked_up', 'out_for_delivery'] };
      } else if (status === 'completed') {
        filter.status = 'delivered';
      } else if (status === 'failed') {
        filter.status = { $in: ['failed_delivery', 'returned'] };
      } else if (SHIPMENT_STATUSES.includes(status)) {
        filter.status = status;
      }
    }

    if (agentId) {
      if (agentId === 'unassigned') {
        filter.deliveryAgentId = { $exists: false };
      } else if (mongoose.Types.ObjectId.isValid(agentId)) {
        filter.deliveryAgentId = agentId;
      }
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Handle search by order number or customer name/phone
    if (search.trim()) {
      const reg = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchingOrders = await Order.find({ orderNumber: reg }).select('_id').lean();
      const orderIds = matchingOrders.map((o) => o._id);

      filter.$or = [
        { orderId: { $in: orderIds } },
        { 'destinationAddress.name': reg },
        { 'destinationAddress.phone': reg },
        { 'destinationAddress.pincode': reg },
        { vendorName: reg },
        { deliveryAgentName: reg },
      ];
    }

    const total = await Shipment.countDocuments(filter);
    const shipments = await Shipment.find(filter)
      .populate('orderId', 'orderNumber paymentMethod paymentStatus createdAt')
      .populate('buyerId', 'name email phone')
      .populate('deliveryAgentId', 'name phone email')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean();

    const items = shipments.map((s) => ({
      id: String(s._id),
      orderId: String(s.orderId?._id || s.orderId),
      orderNumber: s.orderId?.orderNumber || '–',
      orderDate: s.orderId?.createdAt || s.createdAt,
      status: s.status,
      vendorName: s.vendorName || s.pickupAddress?.shopName || 'Vendor',
      pickupLocation: s.pickupAddress
        ? `${s.pickupAddress.shopName || ''}, ${s.pickupAddress.address || ''}, ${s.pickupAddress.city || ''} (${s.pickupAddress.pincode || ''})`.trim()
        : 'Vendor Pickup',
      pickupContact: s.pickupAddress?.phone || '–',
      customerName: s.destinationAddress?.name || s.buyerId?.name || 'Customer',
      customerPhone: s.destinationAddress?.phone || s.buyerId?.phone || '–',
      deliveryDestination: s.destinationAddress
        ? `${s.destinationAddress.line1 || ''}, ${s.destinationAddress.city || ''}, ${s.destinationAddress.state || ''} - ${s.destinationAddress.pincode || ''}`
        : 'Customer Address',
      destinationPincode: s.destinationAddress?.pincode || '–',
      deliveryAgentId: s.deliveryAgentId?._id ? String(s.deliveryAgentId._id) : null,
      deliveryAgentName: s.deliveryAgentId?.name || s.deliveryAgentName || 'Unassigned',
      deliveryAgentPhone: s.deliveryAgentId?.phone || '–',
      assignedAt: s.assignedAt,
      pickedUpAt: s.pickedUpAt,
      deliveredAt: s.deliveredAt,
      estimate: s.estimate,
      subtotalPaise: s.subtotalPaise,
      shippingPaise: s.shippingPaise,
      codAmountDuePaise: s.codAmountDuePaise,
      codCollected: s.codCollected,
      timeline: s.timeline || [],
    }));

    res.json({
      items,
      total,
      page: p,
      pages: Math.ceil(total / l) || 1,
    });
  } catch (err) {
    next(err);
  }
}

// 7. Assign or reassign a shipment to a delivery agent
export async function assignDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const { agentId, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid shipment ID');
    if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
      throw badRequest('A valid Delivery Agent ID is required');
    }

    const shipment = await Shipment.findById(id).populate('orderId', 'orderNumber');
    if (!shipment) throw notFound('Shipment not found');

    const agent = await User.findOne({ _id: agentId, role: 'delivery_agent', status: { $ne: 'deleted' } });
    if (!agent) throw notFound('Delivery Agent not found or deactivated');

    const prevAgentName = shipment.deliveryAgentName;
    shipment.deliveryAgentId = agent._id;
    shipment.deliveryAgentName = agent.name;
    shipment.assignedAt = new Date();

    // If currently awaiting assignment, advance status to 'assigned'
    if (['confirmed', 'packing', 'packed', 'pickup_requested'].includes(shipment.status)) {
      shipment.status = 'assigned';
    }

    const auditNote = note
      ? note.trim()
      : prevAgentName
      ? `Reassigned from ${prevAgentName} to ${agent.name} by Platform Admin`
      : `Assigned to ${agent.name} by Platform Admin`;

    shipment.timeline.push({
      status: shipment.status,
      at: new Date(),
      by: req.user._id,
      note: auditNote,
    });

    await shipment.save();

    // Create persistent notification for the assigned Delivery Agent
    await Notification.create({
      userId: agent._id,
      type: 'delivery_assigned',
      title: 'New Delivery Assignment',
      body: `You have been assigned order #${shipment.orderId?.orderNumber || shipment._id} from ${shipment.vendorName || 'Vendor'}.`,
      data: { shipmentId: shipment._id, orderId: shipment.orderId?._id },
    });

    // Real-time socket broadcast
    emitToUser(agent._id, 'pickup:requested', {
      shipmentId: String(shipment._id),
      orderNumber: shipment.orderId?.orderNumber,
      vendorName: shipment.vendorName,
    });

    emitToOrder(String(shipment.orderId?._id || shipment.orderId), 'order:status_changed', {
      shipmentId: String(shipment._id),
      status: shipment.status,
      agentName: agent.name,
    });

    res.json({
      message: `Shipment assigned to ${agent.name} successfully.`,
      shipment: {
        id: String(shipment._id),
        status: shipment.status,
        deliveryAgentId: String(agent._id),
        deliveryAgentName: agent.name,
        assignedAt: shipment.assignedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 8. Update shipment delivery status by Platform Admin
export async function updateDeliveryStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, note, failedReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid shipment ID');
    if (!status || !SHIPMENT_STATUSES.includes(status)) {
      throw badRequest(`Invalid status. Must be one of: ${SHIPMENT_STATUSES.join(', ')}`);
    }

    const shipment = await Shipment.findById(id).populate('orderId', 'orderNumber');
    if (!shipment) throw notFound('Shipment not found');

    const prevStatus = shipment.status;
    shipment.status = status;

    if (status === 'picked_up' && !shipment.pickedUpAt) {
      shipment.pickedUpAt = new Date();
    } else if (status === 'delivered') {
      shipment.deliveredAt = new Date();
      if (shipment.deliveryAgentId) {
        await DeliveryAgentProfile.updateOne(
          { userId: shipment.deliveryAgentId },
          { $inc: { completedDeliveries: 1 } },
        );
      }
    } else if (status === 'failed_delivery' && failedReason) {
      shipment.failedReason = failedReason.trim();
    }

    const auditNote = note
      ? note.trim()
      : `Status changed from ${prevStatus} to ${status} by Platform Admin`;

    shipment.timeline.push({
      status,
      at: new Date(),
      by: req.user._id,
      note: auditNote,
    });

    await shipment.save();

    // Sockets & notifications
    emitToOrder(String(shipment.orderId?._id || shipment.orderId), 'order:status_changed', {
      shipmentId: String(shipment._id),
      status,
      note: auditNote,
    });

    if (shipment.deliveryAgentId) {
      emitToUser(shipment.deliveryAgentId, 'order:status_changed', {
        shipmentId: String(shipment._id),
        status,
      });
    }

    res.json({
      message: `Delivery status updated to ${status}.`,
      shipment: {
        id: String(shipment._id),
        status: shipment.status,
        deliveredAt: shipment.deliveredAt,
        pickedUpAt: shipment.pickedUpAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 9. Quick lookup of available agents for assignment dropdown
export async function listAvailableAgents(req, res, next) {
  try {
    const agents = await User.find({
      role: 'delivery_agent',
      status: 'active',
    })
      .select('name email phone')
      .sort({ name: 1 })
      .lean();

    const agentIds = agents.map((a) => a._id);
    const profiles = await DeliveryAgentProfile.find({ userId: { $in: agentIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

    const activeCounts = await Shipment.aggregate([
      {
        $match: {
          deliveryAgentId: { $in: agentIds },
          status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
        },
      },
      { $group: { _id: '$deliveryAgentId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(activeCounts.map((c) => [String(c._id), c.count]));

    const items = agents.map((a) => {
      const pr = profileMap.get(String(a._id)) || {};
      const active = countMap.get(String(a._id)) || 0;
      return {
        id: String(a._id),
        name: a.name,
        phone: a.phone || '–',
        vehicleType: pr.vehicleType || 'bike',
        activeDeliveries: active,
        isAvailable: pr.isAvailable ?? true,
      };
    });

    res.json({ agents: items });
  } catch (err) {
    next(err);
  }
}
