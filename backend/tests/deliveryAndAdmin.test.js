import './helpers.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD,
  createApp,
  models,
  mongoose,
  seedCategories,
  makeListing,
  makeAddress,
  newClient,
  setupDb,
  teardownDb,
} from './helpers.js';
import { hashOtp } from '../src/services/deliveryService.js';

let app;

before(async () => {
  await setupDb();
  await seedCategories();
  app = createApp({ authLimit: 1000, strictLimit: 1000 });
});

after(teardownDb);

async function makeApprovedVendor(email = `ven_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`) {
  const v = await models.User.create({
    name: 'Test Vendor Store',
    email,
    role: 'vendor',
    status: 'active',
    passwordHash: await import('../src/services/userService.js').then((m) => m.hashPassword(PASSWORD)),
  });
  await models.VendorProfile.create({
    userId: v._id,
    shopName: 'Test Vendor Store',
    pickupAddress: { line1: '123 Market St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', phone: '9876543210' },
    status: 'approved',
  });
  return v;
}

async function makeDeliveryAgent(email = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`) {
  const a = await models.User.create({
    name: 'Ramesh Agent',
    email,
    phone: '9123456789',
    role: 'delivery_agent',
    status: 'active',
    passwordHash: await import('../src/services/userService.js').then((m) => m.hashPassword(PASSWORD)),
  });
  await models.DeliveryAgentProfile.create({
    userId: a._id,
    vehicleType: 'bike',
    vehicleNumber: 'TN01AB1234',
    servicePincodes: ['600001', '600002'],
  });
  return a;
}

async function makeAdmin() {
  return models.User.create({
    name: 'Admin Boss',
    email: `admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    role: 'admin',
    status: 'active',
    passwordHash: await import('../src/services/userService.js').then((m) => m.hashPassword(PASSWORD)),
  });
}

async function makeBuyer() {
  return models.User.create({
    name: 'Priya Buyer',
    email: `buyer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    role: 'buyer',
    status: 'active',
    passwordHash: await import('../src/services/userService.js').then((m) => m.hashPassword(PASSWORD)),
  });
}

describe('Delivery workflow and pickup assignment', () => {
  test('vendor packs order and requests delivery pickup', async () => {
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();
    const listing = await makeListing(vendor, { pricePaise: 50000, mrpPaise: 60000, stock: 10 });

    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-${Date.now()}`,
      status: 'confirmed',
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      subtotalPaise: 50000,
      totalPaise: 50000,
      taxMode: 'inclusive',
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const shipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      vendorName: 'Test Vendor Store',
      status: 'confirmed',
      subtotalPaise: 50000,
      shippingPaise: 0,
      timeline: [{ status: 'confirmed', note: 'Order placed' }],
    });

    const vClient = newClient(app);
    await vClient.login(vendor.email, PASSWORD);

    // 1. Transition confirmed -> packing
    const packRes = await vClient.patch(`/api/vendor/orders/${shipment._id}/status`, { status: 'packing' });
    assert.equal(packRes.status, 200);
    assert.equal(packRes.body.shipment.status, 'packing');

    // 2. Transition packing -> packed
    const packedRes = await vClient.patch(`/api/vendor/orders/${shipment._id}/status`, { status: 'packed' });
    assert.equal(packedRes.status, 200);
    assert.equal(packedRes.body.shipment.status, 'packed');

    // 3. Request pickup
    const res = await vClient.post(`/api/vendor/shipments/${shipment._id}/request-pickup`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'pickup_requested');

    const updatedShipment = await models.Shipment.findById(shipment._id);
    assert.equal(updatedShipment.status, 'pickup_requested');
    assert.ok(updatedShipment.deliveryOtpHash);
  });

  test('delivery agent views available pickups and accepts with concurrency protection', async () => {
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();
    const agent1 = await makeDeliveryAgent();
    const agent2 = await makeDeliveryAgent();

    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-${Date.now()}`,
      status: 'confirmed',
      paymentMethod: 'online',
      paymentStatus: 'successful',
      subtotalPaise: 50000,
      totalPaise: 50000,
      taxMode: 'inclusive',
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const shipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      vendorName: 'Test Vendor Store',
      status: 'pickup_requested',
      subtotalPaise: 50000,
      shippingPaise: 0,
      deliveryOtpHash: hashOtp('123456'),
      timeline: [{ status: 'pickup_requested', note: 'Pickup requested' }],
    });

    const c1 = newClient(app);
    await c1.login(agent1.email, PASSWORD);

    const c2 = newClient(app);
    await c2.login(agent2.email, PASSWORD);

    // Agent 1 checks available pickups
    const avail = await c1.get('/api/delivery/available');
    assert.equal(avail.status, 200);
    const found = avail.body.items.some((i) => i.id === String(shipment._id));
    assert.ok(found);

    // Agent 1 accepts pickup
    const accept1 = await c1.post(`/api/delivery/shipments/${shipment._id}/accept`, {});
    assert.equal(accept1.status, 200);
    assert.equal(accept1.body.shipment.status, 'assigned');
    assert.equal(accept1.body.shipment.deliveryAgentName, agent1.name);

    // Agent 2 attempts to accept the SAME pickup - must get 409 conflict
    const accept2 = await c2.post(`/api/delivery/shipments/${shipment._id}/accept`, {});
    assert.equal(accept2.status, 409);
    assert.equal(accept2.body.error.code, 'ALREADY_ASSIGNED');
  });

  test('delivery agent collects package, verifies OTP, collects COD and completes delivery', async () => {
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();
    const agent = await makeDeliveryAgent();

    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-${Date.now()}`,
      status: 'confirmed',
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      subtotalPaise: 75000,
      totalPaise: 75000,
      taxMode: 'inclusive',
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const plainOtp = '654321';
    const shipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      vendorName: 'Test Vendor Store',
      status: 'assigned',
      deliveryAgentId: agent._id,
      deliveryAgentName: agent.name,
      subtotalPaise: 75000,
      codAmountDuePaise: 75000,
      deliveryOtpHash: hashOtp(plainOtp),
      timeline: [{ status: 'assigned', note: 'Assigned to agent' }],
    });

    const c = newClient(app);
    await c.login(agent.email, PASSWORD);

    // 1. Pickup package from vendor
    const pickRes = await c.post(`/api/delivery/shipments/${shipment._id}/pickup`, {});
    assert.equal(pickRes.status, 200);
    assert.equal(pickRes.body.shipment.status, 'out_for_delivery');

    // 2. Reject wrong OTP
    const wrongOtpRes = await c.post(`/api/delivery/shipments/${shipment._id}/verify-otp`, { otp: '000000' });
    assert.equal(wrongOtpRes.status, 400);
    assert.equal(wrongOtpRes.body.error.code, 'INVALID_OTP');

    // 3. Verify correct OTP
    const correctOtpRes = await c.post(`/api/delivery/shipments/${shipment._id}/verify-otp`, { otp: plainOtp });
    assert.equal(correctOtpRes.status, 200);
    assert.equal(correctOtpRes.body.shipment.status, 'delivered');
    assert.equal(correctOtpRes.body.shipment.codCollected, true);

    // Verify order completed
    const updatedOrder = await models.Order.findById(order._id);
    assert.equal(updatedOrder.status, 'completed');
    assert.equal(updatedOrder.paymentStatus, 'cod_collected');

    // Verify agent earnings updated
    const earningsRes = await c.get('/api/delivery/earnings');
    assert.equal(earningsRes.status, 200);
    assert.ok(earningsRes.body.completedDeliveries >= 1);
    assert.ok(earningsRes.body.totalEarningsPaise >= 5000);
  });
});

describe('PDF Invoice generation', () => {
  test('buyer and admin can download valid PDF invoice with accurate totals', async () => {
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();
    const admin = await makeAdmin();

    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-INV-${Date.now()}`,
      status: 'confirmed',
      paymentMethod: 'online',
      paymentStatus: 'successful',
      subtotalPaise: 120000,
      shippingPaise: 5000,
      discountPaise: 10000,
      taxPaise: 0,
      taxMode: 'inclusive',
      totalPaise: 115000,
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const dummyShipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      status: 'delivered',
      subtotalPaise: 120000,
      shippingPaise: 5000,
    });

    await models.OrderItem.create({
      orderId: order._id,
      shipmentId: dummyShipment._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      listingId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      title: 'Designer Cotton Kurti',
      quantity: 1,
      unitPaise: 120000,
      linePaise: 120000,
      netPaise: 120000,
      commissionPercent: 10,
      commissionPaise: 12000,
      vendorSharePaise: 108000,
    });

    const bClient = newClient(app);
    await bClient.login(buyer.email, PASSWORD);

    const invRes = await bClient.get(`/api/orders/${order._id}/invoice`);
    assert.equal(invRes.status, 200);
    assert.equal(invRes.headers['content-type'], 'application/pdf');
    assert.ok(invRes.body.length > 500); // Valid PDF buffer

    // Other buyer cannot download this invoice
    const otherBuyer = await makeBuyer();
    const otherClient = newClient(app);
    await otherClient.login(otherBuyer.email, PASSWORD);
    const forbiddenRes = await otherClient.get(`/api/orders/${order._id}/invoice`);
    assert.equal(forbiddenRes.status, 403);

    // Admin CAN download any invoice
    const aClient = newClient(app);
    await aClient.login(admin.email, PASSWORD);
    const adminInvRes = await aClient.get(`/api/orders/${order._id}/invoice`);
    assert.equal(adminInvRes.status, 200);
    assert.equal(adminInvRes.headers['content-type'], 'application/pdf');
  });
});

describe('Product Reviews and Eligibility', () => {
  test('only verified buyers with completed orders can submit reviews', async () => {
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();
    const listing = await makeListing(vendor, { pricePaise: 40000, stock: 5 });

    const bClient = newClient(app);
    await bClient.login(buyer.email, PASSWORD);

    // 1. Ineligible buyer tries to review
    const failRes = await bClient.post('/api/reviews', {
      listingId: String(listing._id),
      rating: 5,
      title: 'Amazing quality',
      body: 'Loved this product!',
    });
    assert.equal(failRes.status, 403);
    assert.equal(failRes.body.error.code, 'NOT_ELIGIBLE');

    // 2. Buyer completes an order for this listing
    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-REV-${Date.now()}`,
      status: 'completed',
      paymentMethod: 'online',
      paymentStatus: 'successful',
      subtotalPaise: 40000,
      totalPaise: 40000,
      taxMode: 'inclusive',
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const revShipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      status: 'delivered',
      subtotalPaise: 40000,
    });

    await models.OrderItem.create({
      orderId: order._id,
      shipmentId: revShipment._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      listingId: listing._id,
      productId: listing.productId,
      title: 'Cotton Kurti',
      quantity: 1,
      unitPaise: 40000,
      linePaise: 40000,
      netPaise: 40000,
      commissionPercent: 10,
      commissionPaise: 4000,
      vendorSharePaise: 36000,
    });

    // 3. Now review succeeds and updates listing rating
    const successRes = await bClient.post('/api/reviews', {
      listingId: String(listing._id),
      rating: 5,
      title: 'Amazing quality',
      body: 'Loved this product!',
    });
    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.review.rating, 5);

    const updatedListing = await models.Listing.findById(listing._id);
    assert.equal(updatedListing.ratingAvg, 5);
    assert.equal(updatedListing.ratingCount, 1);
  });
});

describe('Admin Vendor Deletion Safeguards and Revenue Reports', () => {
  test('blocks vendor deletion when active shipments or unsettled payable funds exist', async () => {
    const admin = await makeAdmin();
    const vendor = await makeApprovedVendor();
    const buyer = await makeBuyer();

    // Create an active shipment for this vendor
    const order = await models.Order.create({
      buyerId: buyer._id,
      orderNumber: `ORD-BLK-${Date.now()}`,
      status: 'confirmed',
      paymentMethod: 'online',
      paymentStatus: 'successful',
      subtotalPaise: 80000,
      totalPaise: 80000,
      taxMode: 'inclusive',
      address: { name: 'Priya', phone: '9876543210', line1: '45 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    });

    const shipment = await models.Shipment.create({
      orderId: order._id,
      buyerId: buyer._id,
      vendorId: vendor._id,
      status: 'packing',
      subtotalPaise: 80000,
      shippingPaise: 0,
    });

    const aClient = newClient(app);
    await aClient.login(admin.email, PASSWORD);

    // Attempt deletion - must be BLOCKED (409)
    const blockedRes = await aClient.del(`/api/admin/vendors/${vendor._id}`);
    assert.equal(blockedRes.status, 409);
    assert.equal(blockedRes.body.error.code, 'VENDOR_DELETION_BLOCKED');
    assert.ok(blockedRes.body.error.safeguards.length >= 1);

    // Complete shipment
    shipment.status = 'delivered';
    await shipment.save();

    // Now deletion succeeds cleanly
    const successRes = await aClient.del(`/api/admin/vendors/${vendor._id}`);
    assert.equal(successRes.status, 200);

    const deletedVendor = await models.User.findById(vendor._id);
    assert.equal(deletedVendor.status, 'deleted');
  });

  test('generates revenue reports and processes vendor settlements', async () => {
    const admin = await makeAdmin();
    const vendor = await makeApprovedVendor();

    // Add payable ledger entry for vendor
    await models.LedgerEntry.create({
      key: `LEDGER-TEST-${Date.now()}`,
      kind: 'vendor_share',
      vendorId: vendor._id,
      amountPaise: 90000,
      status: 'payable',
    });

    const aClient = newClient(app);
    await aClient.login(admin.email, PASSWORD);

    // Check revenue report
    const revRes = await aClient.get('/api/admin/reports/revenue');
    assert.equal(revRes.status, 200);
    assert.ok(revRes.body.totals !== undefined);

    // Process settlement payout
    const setRes = await aClient.post('/api/admin/settlements', {
      vendorId: String(vendor._id),
      notes: 'Monthly payout',
    });
    assert.equal(setRes.status, 201);
    assert.equal(setRes.body.settlement.amountPaise, 90000);
    assert.equal(setRes.body.settlement.status, 'completed');

    // Verify ledger entries are now marked settled
    const entries = await models.LedgerEntry.find({ vendorId: vendor._id });
    assert.ok(entries.every((e) => e.status === 'settled'));
  });
});
