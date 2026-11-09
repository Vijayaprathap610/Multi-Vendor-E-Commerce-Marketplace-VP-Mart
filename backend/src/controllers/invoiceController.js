import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Shipment from '../models/Shipment.js';
import { generateOrderInvoice } from '../services/invoiceService.js';
import { AppError } from '../utils/AppError.js';

export async function downloadInvoice(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');

    const isOwner = String(order.buyerId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view this invoice');
    }

    const items = await OrderItem.find({ orderId: order._id }).lean();
    const shipments = await Shipment.find({ orderId: order._id }).lean();

    const pdfBuffer = await generateOrderInvoice(order, items, shipments);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="vpmart-invoice-${order.orderNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}
