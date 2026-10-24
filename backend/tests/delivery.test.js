import './helpers.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateDelivery, isValidPincode, zoneFor } from '../src/services/deliveryEstimate.js';

// Mon 26 Oct 2026, 10:00 IST. Calendar: Tue 27, Wed 28, Thu 29, Fri 30, Sat 31, Sun 1 Nov, Mon 2 Nov.
const MON_10AM = new Date('2026-10-26T04:30:00Z');
const MON_5PM = new Date('2026-10-26T11:30:00Z');
const vendor = (over = {}) => ({
  pickupAddress: { pincode: '641001' },
  delivery: { processingDays: 1, dispatchCutoffHour: 16, shippingChargePaise: 4900, ...over },
});
const est = (o) => estimateDelivery({ vendor: vendor(), pincode: '600001', now: MON_10AM, ...o });

describe('PIN code zones', () => {
  it('classifies local, circle, region and national', () => {
    assert.equal(zoneFor('641001', '641042'), 'local');
    assert.equal(zoneFor('641001', '643001'), 'circle');
    assert.equal(zoneFor('641001', '600001'), 'region');
    assert.equal(zoneFor('641001', '110001'), 'national');
    assert.equal(isValidPincode('600001'), true);
    for (const bad of ['060001', '6000', 'abcdef', '', undefined])
      assert.equal(isValidPincode(bad), false);
  });
});

describe('delivery estimate', () => {
  it('Coimbatore vendor to Chennai buyer: processing + regional transit, skipping Sunday', () => {
    const r = est();
    assert.equal(r.serviceable, true);
    assert.equal(r.zone, 'region');
    assert.equal(r.dispatchDate, '2026-10-27');
    assert.equal(r.earliest, '2026-10-30');
    assert.equal(r.latest, '2026-11-02');
    assert.equal(r.shippingChargePaise, 4900);
  });

  it('orders after the dispatch cut-off start processing the next day', () => {
    const r = est({ now: MON_5PM });
    assert.equal(r.dispatchDate, '2026-10-28');
    assert.equal(r.earliest, '2026-10-31');
    assert.equal(r.latest, '2026-11-03');
  });

  it('is not distance alone: processing time, vendor closed days and category change the result', () => {
    const base = est();
    assert.notEqual(est({ vendor: vendor({ processingDays: 4 }) }).earliest, base.earliest);
    const closedTue = est({ vendor: vendor({ closedWeekdays: [2] }) });
    assert.equal(closedTue.dispatchDate, '2026-10-28');
    const bulky = est({ category: { shipping: { maxZone: 'national', extraDays: 3 } } });
    assert.equal(bulky.dispatchDate, base.dispatchDate);
    assert.notEqual(bulky.earliest, base.earliest);
    assert.equal(est({ holidays: ['2026-10-27'] }).dispatchDate, '2026-10-28');
  });

  it('same-day dispatch is possible with zero processing days and an open vendor', () => {
    assert.equal(est({ vendor: vendor({ processingDays: 0 }) }).dispatchDate, '2026-10-26');
  });

  it('moves dispatch past a vendor vacation', () => {
    const r = est({ vendor: vendor({ unavailableUntil: '2026-11-05T00:00:00Z' }) });
    assert.ok(r.dispatchDate >= '2026-11-05');
  });

  it('refuses destinations outside the category’s range (cold chain) but serves nearby ones', () => {
    const iceCream = { shipping: { maxZone: 'local', extraDays: 0 } };
    const far = est({ category: iceCream });
    assert.equal(far.serviceable, false);
    assert.equal(far.reason, 'CATEGORY_RANGE_LIMIT');
    const near = est({ category: iceCream, pincode: '641042' });
    assert.equal(near.serviceable, true);
    assert.equal(near.zone, 'local');
  });

  it('honours vendor delivery coverage', () => {
    const v = vendor({ coverage: { mode: 'prefixes', pincodePrefixes: ['641', '6410'] } });
    assert.equal(est({ vendor: v, pincode: '600001' }).reason, 'OUTSIDE_VENDOR_COVERAGE');
    assert.equal(est({ vendor: v, pincode: '641002' }).serviceable, true);
  });

  it('handles invalid input and vendors with no dispatch location', () => {
    assert.equal(est({ pincode: '12' }).reason, 'INVALID_PINCODE');
    assert.equal(
      estimateDelivery({ vendor: { delivery: {} }, pincode: '600001', now: MON_10AM }).reason,
      'VENDOR_LOCATION_UNKNOWN',
    );
  });

  it('uses the configured national holidays (DELIVERY_HOLIDAYS) when delivering', () => {
    // 2026-11-12 is configured as a holiday in the test environment: no delivery on that day.
    const r = estimateDelivery({
      vendor: vendor({ processingDays: 0 }),
      pincode: '110001',
      now: new Date('2026-11-09T04:30:00Z'),
    });
    assert.notEqual(r.earliest, '2026-11-12');
    assert.notEqual(r.latest, '2026-11-12');
  });

  it('reports free-shipping thresholds for the cart to use', () => {
    assert.equal(
      est({ vendor: vendor({ freeShippingAbovePaise: 99900 }) }).freeShippingAbovePaise,
      99900,
    );
  });
});
