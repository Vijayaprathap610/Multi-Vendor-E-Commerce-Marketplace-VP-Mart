import * as deliveryService from '../services/deliveryService.js';
import DeliveryAgentProfile from '../models/DeliveryAgentProfile.js';

export async function vendorRequestPickup(req, res, next) {
  try {
    const { shipment, plainOtp } = await deliveryService.requestPickup(req.user, req.params.id);
    res.json({
      message: 'Pickup request created successfully. Delivery agents notified.',
      shipmentId: shipment._id,
      status: shipment.status,
    });
  } catch (err) {
    next(err);
  }
}

export async function listAvailable(req, res, next) {
  try {
    const items = await deliveryService.listAvailablePickups();
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function acceptPickup(req, res, next) {
  try {
    const shipment = await deliveryService.acceptPickup(req.user, req.params.id);
    res.json({
      message: 'Pickup accepted successfully.',
      shipment,
    });
  } catch (err) {
    next(err);
  }
}

export async function pickupPackage(req, res, next) {
  try {
    const shipment = await deliveryService.pickupFromVendor(req.user, req.params.id);
    res.json({
      message: 'Package picked up from vendor. Out for delivery.',
      shipment,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { otp } = req.body;
    const shipment = await deliveryService.verifyDeliveryOtp(req.user, req.params.id, otp);
    res.json({
      message: 'OTP verified. Delivery marked as complete.',
      shipment,
    });
  } catch (err) {
    next(err);
  }
}

export async function reportFailed(req, res, next) {
  try {
    const shipment = await deliveryService.reportFailedDelivery(req.user, req.params.id, req.body);
    res.json({
      message: 'Failed delivery status recorded.',
      shipment,
    });
  } catch (err) {
    next(err);
  }
}

export async function returnToVendor(req, res, next) {
  try {
    const { reason } = req.body;
    const shipment = await deliveryService.returnToVendor(req.user, req.params.id, reason);
    res.json({
      message: 'Package return recorded.',
      shipment,
    });
  } catch (err) {
    next(err);
  }
}

export async function myDeliveries(req, res, next) {
  try {
    const items = await deliveryService.listAgentDeliveries(req.user, req.query);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function myEarnings(req, res, next) {
  try {
    const earnings = await deliveryService.getAgentEarnings(req.user);
    res.json(earnings);
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    let profile = await DeliveryAgentProfile.findOne({ userId: req.user._id }).lean();
    if (!profile) {
      profile = await DeliveryAgentProfile.create({
        userId: req.user._id,
        vehicleType: 'bike',
      });
    }
    res.json({ profile, user: req.user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { vehicleType, vehicleNumber, drivingLicense, servicePincodes, isAvailable } = req.body;
    const profile = await DeliveryAgentProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...(vehicleType && { vehicleType }),
          ...(vehicleNumber && { vehicleNumber }),
          ...(drivingLicense && { drivingLicense }),
          ...(servicePincodes && { servicePincodes }),
          ...(isAvailable !== undefined && { isAvailable }),
        },
      },
      { new: true, upsert: true },
    );
    res.json({ profile });
  } catch (err) {
    next(err);
  }
}
