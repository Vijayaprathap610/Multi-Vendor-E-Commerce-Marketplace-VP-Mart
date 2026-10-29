import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FormField from '../../components/FormField.jsx';
import ImageUploader from '../../components/ImageUploader.jsx';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useCategories } from '../../hooks/useCategories.js';
import { normalizeError } from '../../services/api.js';
import { vendorService } from '../../services/vendorService.js';
import { paiseToRupeesString, rupeesToPaise } from '../../utils/money.js';

const empty = {
  name: '',
  brand: '',
  categoryId: '',
  subcategoryId: '',
  sku: '',
  variant: '',
  description: '',
  price: '',
  mrp: '',
  stock: '',
  model: '',
  version: '',
  deviceType: '',
  expiryDate: '',
  prescriptionRequired: '',
  manualOutOfStock: false,
};

// Rules that depend on the chosen category (mirrors the server, which is the authority).
export function categoryRules(tree, categoryId, subcategoryId) {
  const top = tree.find((c) => c.id === categoryId);
  const sub = top?.children.find((c) => c.id === subcategoryId);
  const leaf = sub || top;
  const regulation = sub
    ? sub.regulation === 'inherit'
      ? top.regulation
      : sub.regulation
    : top?.regulation || 'none';
  return { top, sub, regulation, deviceFields: !!leaf?.deviceFields };
}

export function buildListingPayload(f, rules, { edit, images, attrs }) {
  const errors = {};
  const price = rupeesToPaise(f.price);
  const mrp = rupeesToPaise(f.mrp);
  if (price == null || price < 1) errors.price = 'Enter a valid price';
  if (mrp == null || mrp < 1) errors.mrp = 'Enter a valid MRP';
  if (price != null && mrp != null && mrp < price)
    errors.mrp = 'MRP cannot be lower than the price';
  if (!/^\d+$/.test(String(f.stock))) errors.stock = 'Enter a whole number';
  if (!f.sku.trim()) errors.sku = 'SKU is required';
  if (!edit) {
    if (f.name.trim().length < 2) errors.name = 'Enter the product name';
    if (!f.categoryId) errors.categoryId = 'Choose a category';
  }
  if (rules.regulation !== 'none' && !f.expiryDate) errors.expiryDate = 'Expiry date is required';
  if (rules.regulation === 'medicine' && f.prescriptionRequired === '')
    errors.prescriptionRequired = 'Choose yes or no';
  if (Object.keys(errors).length) return { errors };
  const attributes = Object.fromEntries(
    attrs.filter((a) => a.k.trim() && a.v.trim()).map((a) => [a.k.trim(), a.v.trim()]),
  );
  const common = {
    sku: f.sku.trim(),
    pricePaise: price,
    mrpPaise: mrp,
    stock: Number(f.stock),
    images: images.map((i) => ({ key: i.key, ...(i.alt ? { alt: i.alt } : {}) })),
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(rules.regulation !== 'none' ? { expiryDate: new Date(f.expiryDate).toISOString() } : {}),
    ...(rules.regulation === 'medicine'
      ? { prescriptionRequired: f.prescriptionRequired === 'yes' }
      : {}),
  };
  if (edit) return { payload: { ...common, manualOutOfStock: !!f.manualOutOfStock } };
  const product = {
    name: f.name.trim(),
    categoryId: f.categoryId,
    ...(f.subcategoryId ? { subcategoryId: f.subcategoryId } : {}),
    ...(f.brand.trim() ? { brand: { name: f.brand.trim() } } : {}),
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    ...(rules.deviceFields
      ? Object.fromEntries(
          [
            ['model', f.model],
            ['version', f.version],
            ['deviceType', f.deviceType],
          ]
            .filter(([, v]) => v.trim())
            .map(([k, v]) => [k, v.trim()]),
        )
      : {}),
  };
  const { description: _d, ...rest } = common;
  return {
    payload: {
      product,
      ...rest,
      ...(f.variant.trim() ? { variant: f.variant.trim() } : {}),
      ...(common.description ? { description: common.description } : {}),
    },
  };
}

export default function ProductForm() {
  const { id } = useParams();
  const edit = !!id;
  const navigate = useNavigate();
  const tree = useCategories();
  const [f, setF] = useState(empty);
  const [images, setImages] = useState([]);
  const [attrs, setAttrs] = useState([]);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const loaded = useAsync(() => (edit ? vendorService.listing(id) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const l = loaded.data;
    if (!l) return;
    setInfo(l);
    setF({
      ...empty,
      name: l.title,
      sku: l.sku,
      variant: l.variant || '',
      description: l.description || '',
      price: paiseToRupeesString(l.pricePaise),
      mrp: paiseToRupeesString(l.mrpPaise),
      stock: String(l.stock),
      expiryDate: l.expiryDate ? l.expiryDate.slice(0, 10) : '',
      prescriptionRequired: l.prescriptionRequired ? 'yes' : l.categoryName ? 'no' : '',
      manualOutOfStock: l.manualOutOfStock,
    });
    setImages((l.images || []).map((i) => ({ ...i })));
    setAttrs(Object.entries(l.attributes || {}).map(([k, v]) => ({ k, v })));
  }, [loaded.data]);

  const rules = useMemo(() => {
    if (edit && info) {
      const flat = tree.flatMap((t) => [t, ...t.children]);
      const leaf = flat.find((c) => c.name === info.categoryName);
      const top = leaf?.parent ? tree.find((t) => t.id === leaf.parent) : leaf;
      return {
        regulation: leaf
          ? leaf.regulation === 'inherit'
            ? top?.regulation || 'none'
            : leaf.regulation
          : 'none',
        deviceFields: false,
      };
    }
    return categoryRules(tree, f.categoryId, f.subcategoryId);
  }, [tree, f.categoryId, f.subcategoryId, edit, info]);

  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const subs = tree.find((c) => c.id === f.categoryId)?.children || [];

  async function submit(e) {
    e.preventDefault();
    const { payload, errors: er } = buildListingPayload(f, rules, { edit, images, attrs });
    setErrors(er || {});
    setMsg(null);
    if (er) return;
    setBusy(true);
    try {
      if (edit) {
        await vendorService.update(id, payload);
        setMsg({ v: 'success', t: 'Changes saved.' });
      } else {
        await vendorService.create(payload);
        navigate('/vendor/products');
      }
    } catch (err) {
      const n = normalizeError(err);
      setErrors(
        Object.fromEntries(
          Object.entries(n.fields).map(([k, v]) => [
            k
              .replace(/^product\./, '')
              .replace('pricePaise', 'price')
              .replace('mrpPaise', 'mrp'),
            v,
          ]),
        ),
      );
      setMsg({ v: 'danger', t: n.code === 'PROFILE_INCOMPLETE' ? n.message : n.message });
    } finally {
      setBusy(false);
    }
  }

  if (edit && loaded.loading) return <Skeleton style={{ width: '100%', height: 300 }} />;
  if (edit && loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  const locked = edit && info?.status === 'hidden';

  return (
    <>
      <p className="mb-2">
        <Link to="/vendor/products">← Products</Link>
      </p>
      <h1 className="vp-dash-h1">{edit ? 'Edit product' : 'Add a product'}</h1>
      {locked && (
        <Alert variant="danger">
          An administrator hid this listing{info.hiddenReason ? `: ${info.hiddenReason}` : ''}. You
          can edit details but only an administrator can restore it.
        </Alert>
      )}
      {msg && (
        <Alert variant={msg.v} role={msg.v === 'danger' ? 'alert' : 'status'}>
          {msg.t}
        </Alert>
      )}
      {errors.compliance && (
        <Alert variant="warning" role="alert">
          {errors.compliance} <Link to="/vendor/profile">Open shop profile</Link>
        </Alert>
      )}
      <Form noValidate onSubmit={submit} className="vp-form-grid">
        <section>
          <h2 className="h6">Product</h2>
          {edit ? (
            <FormField
              label="Product"
              value={f.name}
              readOnly
              hint="Product identity is shared across sellers and cannot be changed here."
            />
          ) : (
            <>
              <FormField
                label="Product name"
                value={f.name}
                onChange={set('name')}
                error={errors.name}
              />
              <FormField
                label="Brand (optional)"
                value={f.brand}
                onChange={set('brand')}
                error={errors.brand}
                hint="If another seller already sells the same product, your listing links to it automatically."
              />
              <Form.Group className="mb-3" controlId="cat">
                <Form.Label>Category</Form.Label>
                <Form.Select
                  value={f.categoryId}
                  isInvalid={!!errors.categoryId}
                  onChange={(e) =>
                    setF((x) => ({ ...x, categoryId: e.target.value, subcategoryId: '' }))
                  }
                >
                  <option value="">Choose…</option>
                  {tree.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.categoryId}</Form.Control.Feedback>
              </Form.Group>
              {subs.length > 0 && (
                <Form.Group className="mb-3" controlId="sub">
                  <Form.Label>Sub-category</Form.Label>
                  <Form.Select value={f.subcategoryId} onChange={set('subcategoryId')}>
                    <option value="">Choose…</option>
                    {subs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}
              {rules.deviceFields && (
                <div className="vp-device">
                  <FormField
                    label="Model"
                    value={f.model}
                    onChange={set('model')}
                    error={errors.model}
                  />
                  <FormField
                    label="Version / generation"
                    value={f.version}
                    onChange={set('version')}
                  />
                  <FormField
                    label="Device type"
                    value={f.deviceType}
                    onChange={set('deviceType')}
                  />
                </div>
              )}
              <FormField
                label="Variant (optional)"
                value={f.variant}
                onChange={set('variant')}
                hint="For example size, colour or storage"
              />
            </>
          )}
          <FormField
            label="Description"
            as="textarea"
            rows={4}
            value={f.description}
            onChange={set('description')}
            error={errors.description}
          />
          <fieldset className="mb-3">
            <legend className="form-label">Specifications (optional)</legend>
            {attrs.map((a, i) => (
              <div key={i} className="d-flex gap-2 mb-1">
                <Form.Control
                  size="sm"
                  aria-label={`Specification name ${i + 1}`}
                  placeholder="e.g. Material"
                  value={a.k}
                  onChange={(e) =>
                    setAttrs((s) => s.map((x, n) => (n === i ? { ...x, k: e.target.value } : x)))
                  }
                />
                <Form.Control
                  size="sm"
                  aria-label={`Specification value ${i + 1}`}
                  placeholder="Cotton"
                  value={a.v}
                  onChange={(e) =>
                    setAttrs((s) => s.map((x, n) => (n === i ? { ...x, v: e.target.value } : x)))
                  }
                />
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => setAttrs((s) => s.filter((_, n) => n !== i))}
                  aria-label={`Remove specification ${i + 1}`}
                >
                  ×
                </Button>
              </div>
            ))}
            {attrs.length < 10 && (
              <Button
                size="sm"
                variant="link"
                className="p-0"
                onClick={() => setAttrs((s) => [...s, { k: '', v: '' }])}
              >
                + Add specification
              </Button>
            )}
          </fieldset>
        </section>
        <section>
          <h2 className="h6">Price and stock</h2>
          <FormField
            label="SKU"
            value={f.sku}
            onChange={set('sku')}
            error={errors.sku}
            hint="Your own unique code for this item"
          />
          <div className="d-flex gap-2">
            <div className="flex-fill">
              <FormField
                label="Selling price (₹)"
                inputMode="decimal"
                value={f.price}
                onChange={set('price')}
                error={errors.price}
              />
            </div>
            <div className="flex-fill">
              <FormField
                label="MRP (₹)"
                inputMode="decimal"
                value={f.mrp}
                onChange={set('mrp')}
                error={errors.mrp}
              />
            </div>
          </div>
          <FormField
            label="Stock (units)"
            inputMode="numeric"
            value={f.stock}
            onChange={set('stock')}
            error={errors.stock}
          />
          {edit && (
            <Form.Check
              id="oos"
              className="mb-3"
              label="Mark as out of stock (hides the buy button even if units remain)"
              checked={!!f.manualOutOfStock}
              onChange={set('manualOutOfStock')}
            />
          )}
          {rules.regulation !== 'none' && (
            <div className="vp-regulated">
              <p className="small mb-2">
                <strong>{rules.regulation === 'food' ? 'Food product' : 'Medicine'}:</strong>{' '}
                {rules.regulation === 'food'
                  ? 'requires an FSSAI licence on your shop profile and an expiry date.'
                  : 'requires a drug licence on your shop profile and an expiry date.'}
              </p>
              <FormField
                label="Expiry / best-before date"
                type="date"
                value={f.expiryDate}
                onChange={set('expiryDate')}
                error={errors.expiryDate}
              />
              {rules.regulation === 'medicine' && (
                <Form.Group className="mb-2" controlId="rx">
                  <Form.Label>Prescription required?</Form.Label>
                  <Form.Select
                    value={f.prescriptionRequired}
                    isInvalid={!!errors.prescriptionRequired}
                    onChange={set('prescriptionRequired')}
                  >
                    <option value="">Choose…</option>
                    <option value="no">No, over the counter</option>
                    <option value="yes">Yes, prescription required</option>
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">
                    {errors.prescriptionRequired}
                  </Form.Control.Feedback>
                </Form.Group>
              )}
            </div>
          )}
        </section>
        <section>
          <h2 className="h6">Images</h2>
          <ImageUploader
            purpose="listing"
            label="Product images"
            items={images}
            onChange={setImages}
            max={8}
            withAlt
          />
        </section>
        <div className="vp-form-actions">
          <Button type="submit" variant="dark" disabled={busy}>
            {busy ? 'Saving…' : edit ? 'Save changes' : 'Create listing'}
          </Button>
        </div>
      </Form>
    </>
  );
}
