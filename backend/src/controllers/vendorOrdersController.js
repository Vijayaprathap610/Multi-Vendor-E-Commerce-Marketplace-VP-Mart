import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Shipment from '../models/Shipment.js';
import { notFound, badRequest } from '../utils/AppError.js';
import { emitToOrder } from '../sockets/socket.js';

// Vendors see only their own shipments. They get the buyer's first name and city (enough to pack
// and plan dispatch) but never the street address or phone number.
export async function listVendorOrders(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const filter = { vendorId: req.user._id, status: { $ne: 'pending_payment' } };
  const [rows, total] = await Promise.all([
    Shipment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Shipment.countDocuments(filter),
  ]);
  const [orders, items] = await Promise.all([
    Order.find({ _id: { $in: rows.map((s) => s.orderId) } }).lean(),
    OrderItem.find({ shipmentId: { $in: rows.map((s) => s._id) } }).lean(),
  ]);
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  res.json({
    items: rows.map((s) => {
      const o = orderOf.get(String(s.orderId));
      return {
        id: String(s._id),
        orderId: String(s.orderId),
        orderNumber: o?.orderNumber,
        status: s.status,
        placedAt: o?.placedAt,
        paymentMethod: o?.paymentMethod,
        shipTo: {
          firstName: o?.address?.name?.split(' ')[0],
          city: o?.address?.city,
          state: o?.address?.state,
        },
        estimate: s.estimate,
        shippingPaise: s.shippingPaise,
        items: items
          .filter((i) => String(i.shipmentId) === String(s._id))
          .map((i) => ({
            id: String(i._id),
            title: i.title,
            variant: i.variant,
            quantity: i.quantity,
            netPaise: i.netPaise,
            commissionPaise: i.commissionPaise,
            vendorSharePaise: i.vendorSharePaise,
          })),
        vendorPayablePaise:
          items
            .filter((i) => String(i.shipmentId) === String(s._id) && i.status === 'active')
            .reduce((n, i) => n + i.vendorSharePaise, 0) +
          (s.status === 'cancelled' ? 0 : s.shippingPaise),
      };
    }),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function getVendorOrder(req, res) {
  const s = await Shipment.findOne({ _id: req.params.id, vendorId: req.user._id }).lean();
  if (!s) throw notFound('Order not found');
  res.json({ shipment: s });
}

export async function updateShipmentStatus(req, res) {
  const shipment = await Shipment.findOne({ _id: req.params.id, vendorId: req.user._id });
  if (!shipment) throw notFound('Shipment not found');

  const { status } = req.body;
  if (status === 'packing' && shipment.status !== 'confirmed') {
    throw badRequest(`Cannot start packing a shipment with status ${shipment.status}`);
  }
  if (status === 'packed' && !['confirmed', 'packing'].includes(shipment.status)) {
    throw badRequest(`Cannot mark packed from status ${shipment.status}`);
  }

  shipment.status = status;
  await shipment.save();

  emitToOrder(String(shipment.orderId), 'shipment:status', {
    shipmentId: String(shipment._id),
    status,
  });

  res.json({ shipment });
}
