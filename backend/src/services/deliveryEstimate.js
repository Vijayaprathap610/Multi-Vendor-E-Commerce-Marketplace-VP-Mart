import env from '../config/env.js';

// Delivery estimate from several factors: pincode zone, vendor processing time, vendor
// dispatch cut-off, vendor closed days/holidays/vacation, category handling (cold chain,
// bulky goods) and vendor coverage. Distance alone is never used.
// All date maths is done in India Standard Time (UTC+5:30).
const IST_MS = 5.5 * 3600 * 1000;
const DAY = 86400000;
export const ZONES = ['local', 'circle', 'region', 'national'];
const TRANSIT = { local: [1, 2], circle: [2, 3], region: [3, 5], national: [4, 7] };

export const isValidPincode = (p) => /^[1-9][0-9]{5}$/.test(String(p ?? ''));

export function zoneFor(originPin, destPin) {
  if (originPin.slice(0, 3) === destPin.slice(0, 3)) return 'local';
  if (originPin.slice(0, 2) === destPin.slice(0, 2)) return 'circle';
  if (originPin[0] === destPin[0]) return 'region';
  return 'national';
}

const holidaySet = (extra = []) =>
  new Set([
    ...env.DELIVERY_HOLIDAYS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...extra,
  ]);

// A "local date" is a Date at 00:00 UTC that stands for an IST calendar day.
const localDate = (instant) => {
  const t = new Date(instant.getTime() + IST_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};
const istHour = (instant) => new Date(instant.getTime() + IST_MS).getUTCHours();
export const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

export function estimateDelivery({ vendor, category, pincode, now = new Date(), holidays = [] }) {
  if (!isValidPincode(pincode)) {
    return {
      serviceable: false,
      reason: 'INVALID_PINCODE',
      message: 'Enter a valid 6-digit PIN code',
    };
  }
  const originPin = vendor?.pickupAddress?.pincode;
  const d = vendor?.delivery ?? {};
  if (!originPin) {
    return {
      serviceable: false,
      reason: 'VENDOR_LOCATION_UNKNOWN',
      message: 'Seller has not set a dispatch location',
    };
  }

  const cov = d.coverage ?? { mode: 'all' };
  if (cov.mode === 'prefixes' && !(cov.pincodePrefixes ?? []).some((p) => pincode.startsWith(p))) {
    return {
      serviceable: false,
      reason: 'OUTSIDE_VENDOR_COVERAGE',
      message: 'This seller does not deliver to your PIN code',
    };
  }

  const zone = zoneFor(originPin, pincode);
  const maxZone = category?.shipping?.maxZone ?? 'national';
  if (ZONES.indexOf(zone) > ZONES.indexOf(maxZone)) {
    return {
      serviceable: false,
      reason: 'CATEGORY_RANGE_LIMIT',
      message: 'This product can only be delivered to nearby locations',
      zone,
    };
  }

  const off = holidaySet(holidays);
  const closedWeekdays = new Set(d.closedWeekdays ?? []);
  const vendorClosed = (day) => closedWeekdays.has(day.getUTCDay()) || off.has(iso(day));
  const nextOpen = (day) => {
    let x = day;
    for (let i = 0; i < 60 && vendorClosed(x); i++) x = addDays(x, 1);
    return x;
  };

  let start = localDate(now);
  if (istHour(now) >= (d.dispatchCutoffHour ?? 16)) start = addDays(start, 1);
  let dispatch = nextOpen(start);
  for (let i = 0; i < (d.processingDays ?? 1); i++) dispatch = nextOpen(addDays(dispatch, 1));
  if (d.unavailableUntil) {
    const back = localDate(new Date(d.unavailableUntil));
    if (back > dispatch) dispatch = nextOpen(back);
  }

  // Couriers do not deliver on Sundays or listed holidays.
  const deliverable = (day) => day.getUTCDay() !== 0 && !off.has(iso(day));
  const advance = (from, n) => {
    let x = from;
    let left = n;
    while (left > 0) {
      x = addDays(x, 1);
      if (deliverable(x)) left--;
    }
    return x;
  };
  const extra = category?.shipping?.extraDays ?? 0;
  const [min, max] = TRANSIT[zone];
  return {
    serviceable: true,
    zone,
    processingDays: d.processingDays ?? 1,
    dispatchDate: iso(dispatch),
    earliest: iso(advance(dispatch, min + extra)),
    latest: iso(advance(dispatch, max + extra)),
    shippingChargePaise: d.shippingChargePaise ?? 0,
    freeShippingAbovePaise: d.freeShippingAbovePaise ?? null,
  };
}
