import { describe, expect, it } from 'vitest';
import { validateBanner } from '../pages/admin/AdminBanners.jsx';
import { buildPayload } from '../pages/vendor/VendorProfile.jsx';
import { buildListingPayload, categoryRules } from '../pages/vendor/ProductForm.jsx';

const tree = [
  {
    id: 'fash',
    name: 'Fashion',
    regulation: 'none',
    deviceFields: false,
    children: [{ id: 'mens', regulation: 'inherit', deviceFields: false }],
  },
  {
    id: 'food',
    name: 'Groceries',
    regulation: 'food',
    deviceFields: false,
    children: [{ id: 'rice', regulation: 'inherit' }],
  },
  {
    id: 'med',
    name: 'Medicines',
    regulation: 'medicine',
    deviceFields: false,
    children: [
      { id: 'otc', regulation: 'inherit' },
      { id: 'dev', regulation: 'none' },
    ],
  },
  {
    id: 'elec',
    name: 'Electronics',
    regulation: 'none',
    deviceFields: true,
    children: [{ id: 'mob', regulation: 'inherit', deviceFields: true }],
  },
];
const base = {
  name: 'Linen Shirt',
  brand: 'Acme',
  categoryId: 'fash',
  subcategoryId: '',
  sku: 'LS-1',
  variant: '',
  description: '',
  price: '499',
  mrp: '600',
  stock: '5',
  model: '',
  version: '',
  deviceType: '',
  expiryDate: '',
  prescriptionRequired: '',
};

describe('category rules', () => {
  it('inherits regulation from the parent unless the sub-category overrides it', () => {
    expect(categoryRules(tree, 'food', 'rice').regulation).toBe('food');
    expect(categoryRules(tree, 'med', 'otc').regulation).toBe('medicine');
    expect(categoryRules(tree, 'med', 'dev').regulation).toBe('none');
    expect(categoryRules(tree, 'fash', 'mens').regulation).toBe('none');
  });
  it('enables device fields only for electronics-type categories', () => {
    expect(categoryRules(tree, 'elec', 'mob').deviceFields).toBe(true);
    expect(categoryRules(tree, 'fash', '').deviceFields).toBe(false);
  });
});

describe('listing payload', () => {
  const rules = (c, s = '') => categoryRules(tree, c, s);
  it('converts rupees to integer paise and builds the product block', () => {
    const { payload } = buildListingPayload(base, rules('fash'), {
      edit: false,
      images: [{ key: 'k1', alt: 'Front' }],
      attrs: [
        { k: 'Material', v: 'Linen' },
        { k: '', v: 'x' },
      ],
    });
    expect(payload.pricePaise).toBe(49900);
    expect(payload.mrpPaise).toBe(60000);
    expect(payload.stock).toBe(5);
    expect(payload.product).toMatchObject({
      name: 'Linen Shirt',
      categoryId: 'fash',
      brand: { name: 'Acme' },
    });
    expect(payload.images).toEqual([{ key: 'k1', alt: 'Front' }]);
    expect(payload.attributes).toEqual({ Material: 'Linen' });
    expect(payload.expiryDate).toBeUndefined();
  });
  it('rejects bad money and stock values with field errors', () => {
    const r = buildListingPayload(
      { ...base, price: '12.345', mrp: '10', stock: '-1', sku: ' ' },
      rules('fash'),
      { edit: false, images: [], attrs: [] },
    );
    expect(r.errors.price).toBeTruthy();
    expect(r.errors.stock).toBeTruthy();
    expect(r.errors.sku).toBeTruthy();
    expect(
      buildListingPayload({ ...base, price: '500', mrp: '400' }, rules('fash'), {
        edit: false,
        images: [],
        attrs: [],
      }).errors.mrp,
    ).toMatch(/lower/);
  });
  it('requires an expiry date for food, and a prescription choice for medicines', () => {
    const food = buildListingPayload(base, rules('food', 'rice'), {
      edit: false,
      images: [],
      attrs: [],
    });
    expect(food.errors.expiryDate).toBeTruthy();
    const med = buildListingPayload({ ...base, expiryDate: '2030-01-01' }, rules('med', 'otc'), {
      edit: false,
      images: [],
      attrs: [],
    });
    expect(med.errors.prescriptionRequired).toBeTruthy();
    const ok = buildListingPayload(
      { ...base, expiryDate: '2030-01-01', prescriptionRequired: 'no' },
      rules('med', 'otc'),
      { edit: false, images: [], attrs: [] },
    );
    expect(ok.payload.prescriptionRequired).toBe(false);
    expect(ok.payload.expiryDate).toMatch(/^2030-01-01/);
  });
  it('only sends device fields for device categories', () => {
    const f = {
      ...base,
      categoryId: 'elec',
      subcategoryId: 'mob',
      model: 'N5',
      version: 'Gen 2',
      deviceType: 'Phone',
    };
    expect(
      buildListingPayload(f, rules('elec', 'mob'), { edit: false, images: [], attrs: [] }).payload
        .product,
    ).toMatchObject({ model: 'N5', version: 'Gen 2', deviceType: 'Phone' });
    const shirt = buildListingPayload({ ...base, model: 'N5' }, rules('fash'), {
      edit: false,
      images: [],
      attrs: [],
    }).payload.product;
    expect(shirt.model).toBeUndefined();
  });
  it('in edit mode does not resend product identity and includes the out-of-stock flag', () => {
    const { payload } = buildListingPayload({ ...base, manualOutOfStock: true }, rules('fash'), {
      edit: true,
      images: [],
      attrs: [],
    });
    expect(payload.product).toBeUndefined();
    expect(payload.manualOutOfStock).toBe(true);
  });
});

describe('vendor profile payload', () => {
  const f = {
    shopName: 'Green Basket',
    description: '',
    businessName: 'GB LLP',
    gstin: '',
    fssaiLicense: '',
    drugLicense: '',
    line1: '12 Mill Rd',
    line2: '',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641001',
    accountHolder: 'R Kumar',
    ifsc: 'HDFC0001234',
    accountNumber: '',
    processingDays: '2',
    dispatchCutoffHour: '15',
    shipping: '49',
    freeAbove: '999.50',
    coverageMode: 'prefixes',
    prefixes: '641, 600',
    closed: [0],
    unavailableUntil: '',
  };
  it('converts money to paise and splits PIN prefixes', () => {
    const { payload } = buildPayload(f);
    expect(payload.delivery.shippingChargePaise).toBe(4900);
    expect(payload.delivery.freeShippingAbovePaise).toBe(99950);
    expect(payload.delivery.coverage).toEqual({
      mode: 'prefixes',
      pincodePrefixes: ['641', '600'],
    });
    expect(payload.delivery.closedWeekdays).toEqual([0]);
    expect(payload.pickupAddress).toMatchObject({ pincode: '641001', city: 'Coimbatore' });
  });
  it('sends the account number only when the user typed a new one', () => {
    expect(buildPayload(f).payload.accountNumber).toBeUndefined();
    expect(buildPayload({ ...f, accountNumber: '123456789012' }).payload.accountNumber).toBe(
      '123456789012',
    );
  });
  it('flags invalid delivery inputs', () => {
    expect(buildPayload({ ...f, shipping: 'abc' }).errors.shipping).toBeTruthy();
    expect(buildPayload({ ...f, prefixes: '12x' }).errors.prefixes).toBeTruthy();
    expect(
      buildPayload({ ...f, coverageMode: 'prefixes', prefixes: '' }).errors.prefixes,
    ).toBeTruthy();
    expect(buildPayload({ ...f, processingDays: '30' }).errors.processingDays).toBeTruthy();
  });
});

describe('banner validation', () => {
  const ok = {
    title: 'Sale',
    destination: '/c/fashion',
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-10T10:00',
  };
  it('accepts internal paths and https URLs', () => {
    expect(validateBanner(ok, [{ key: 'k' }])).toEqual({});
    expect(validateBanner({ ...ok, destination: 'https://example.com/x' }, [{ key: 'k' }])).toEqual(
      {},
    );
  });
  it('rejects unsafe destinations, bad dates and a missing image', () => {
    for (const bad of [
      'javascript:alert(1)',
      '//evil.example',
      'http://insecure.example',
      'fashion',
    ])
      expect(validateBanner({ ...ok, destination: bad }, [{ key: 'k' }]).destination).toBeTruthy();
    expect(validateBanner({ ...ok, endAt: '2026-10-01T10:00' }, [{ key: 'k' }]).endAt).toBeTruthy();
    expect(validateBanner(ok, []).image).toBeTruthy();
  });
});
