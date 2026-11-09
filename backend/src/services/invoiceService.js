import PDFDocument from 'pdfkit';

const formatMoney = (paise) => `INR ${(Number(paise || 0) / 100).toFixed(2)}`;

export function generateOrderInvoice(order, items, shipments = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', (buf) => buffers.push(buf));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header Branding
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor('#d62839')
        .text('V', { continued: true })
        .fillColor('#1d4ed8')
        .text('P', { continued: true })
        .fillColor('#111827')
        .text(' Mart');

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#4b5563')
        .text('Multi-Vendor E-Commerce Marketplace', 40, doc.y + 2)
        .text('Tax Invoice / Cash Receipt', { align: 'right' });

      doc.moveDown(1.5);
      doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // Invoice & Customer Info
      const startY = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Invoice Details:');
      doc.font('Helvetica').fillColor('#374151');
      doc.text(`Order Number: ${order.orderNumber}`);
      doc.text(`Order Date: ${new Date(order.placedAt || order.createdAt).toLocaleDateString()}`);
      doc.text(`Payment Method: ${order.paymentMethod.toUpperCase()}`);
      doc.text(`Payment Status: ${order.paymentStatus.toUpperCase()}`);

      doc.y = startY;
      doc.x = 300;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Delivered To:');
      doc.font('Helvetica').fillColor('#374151');
      doc.text(order.address?.name || 'Customer');
      doc.text(`${order.address?.line1 || ''} ${order.address?.line2 || ''}`);
      doc.text(`${order.address?.city || ''}, ${order.address?.state || ''} - ${order.address?.pincode || ''}`);
      doc.text(`Phone: ${order.address?.phone || ''}`);

      doc.x = 40;
      doc.moveDown(2);
      doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // Table Header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
      doc.text('Item Description', 40, tableTop, { width: 230 });
      doc.text('Vendor', 275, tableTop, { width: 100 });
      doc.text('Qty', 380, tableTop, { width: 35, align: 'center' });
      doc.text('Unit Price', 420, tableTop, { width: 65, align: 'right' });
      doc.text('Total', 490, tableTop, { width: 65, align: 'right' });

      doc.moveDown(0.8);
      doc.strokeColor('#9ca3af').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Table Rows
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      for (const item of items) {
        const y = doc.y;
        if (y > 700) {
          doc.addPage();
        }
        doc.text(item.productName || item.listingName || 'Product', 40, doc.y, { width: 230 });
        doc.text(item.vendorName || 'Vendor', 275, y, { width: 100 });
        doc.text(String(item.quantity || 1), 380, y, { width: 35, align: 'center' });
        doc.text(formatMoney(item.unitPricePaise), 420, y, { width: 65, align: 'right' });
        doc.text(formatMoney(item.totalPaise), 490, y, { width: 65, align: 'right' });
        doc.moveDown(0.8);
      }

      doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // Financial Summary
      const summaryX = 350;
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
      doc.text('Subtotal:', summaryX, doc.y, { width: 100 });
      doc.text(formatMoney(order.subtotalPaise), 460, doc.y - 10, { width: 95, align: 'right' });

      if (order.discountPaise > 0) {
        doc.text(`Coupon Discount (${order.couponCode || 'PROMO'}):`, summaryX, doc.y, { width: 100 });
        doc.text(`-${formatMoney(order.discountPaise)}`, 460, doc.y - 10, { width: 95, align: 'right' });
      }

      doc.text('Shipping:', summaryX, doc.y, { width: 100 });
      doc.text(order.shippingPaise ? formatMoney(order.shippingPaise) : 'Free', 460, doc.y - 10, { width: 95, align: 'right' });

      if (order.taxPaise > 0) {
        doc.text(`Tax (${order.taxMode}):`, summaryX, doc.y, { width: 100 });
        doc.text(formatMoney(order.taxPaise), 460, doc.y - 10, { width: 95, align: 'right' });
      }

      doc.moveDown(0.5);
      doc.strokeColor('#111827').lineWidth(1).moveTo(summaryX, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
      doc.text('Total Payable:', summaryX, doc.y, { width: 100 });
      doc.text(formatMoney(order.totalPaise), 460, doc.y - 12, { width: 95, align: 'right' });

      // Footer notice
      doc.moveDown(3);
      doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
        .text('This is a computer-generated tax invoice. No signature is required.', 40, 780, { align: 'center', width: 515 })
        .text('VP Mart Marketplace · Built for Vijaya Prathap · Support: support@vpmart.example', 40, 792, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
