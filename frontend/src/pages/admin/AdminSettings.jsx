import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { FiSave } from 'react-icons/fi';

const TAX_MODES = [
  { value: 'inclusive', label: 'Inclusive — tax is included in the displayed price' },
  { value: 'exclusive', label: 'Exclusive — tax is added on top of the displayed price' },
];

const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'online', label: 'Online (Razorpay)' },
];

export default function AdminSettings() {
  const settings = useAsync(() => adminService.settings(), []);
  const [form, setForm] = useState(null);
  const [busy, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  // Populate form once settings load
  if (settings.data && form === null) {
    setForm({
      commissionPercent: settings.data.commissionPercent ?? 10,
      taxMode: settings.data.taxMode ?? 'inclusive',
      taxPercent: settings.data.taxPercent ?? 18,
      paymentMethods: settings.data.paymentMethods ?? ['cod'],
      currency: settings.data.currency ?? 'INR',
      freeShippingThresholdPaise: settings.data.freeShippingThresholdPaise
        ? settings.data.freeShippingThresholdPaise / 100
        : '',
      defaultShippingPaise: settings.data.defaultShippingPaise
        ? settings.data.defaultShippingPaise / 100
        : '',
      maxCartItems: settings.data.maxCartItems ?? 10,
      maxQtyPerItem: settings.data.maxQtyPerItem ?? 20,
    });
  }

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function togglePayment(method) {
    setForm((f) => {
      const methods = f.paymentMethods.includes(method)
        ? f.paymentMethods.filter((m) => m !== method)
        : [...f.paymentMethods, method];
      return { ...f, paymentMethods: methods };
    });
    setSaved(false);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      await adminService.saveSettings({
        ...form,
        commissionPercent: Number(form.commissionPercent),
        taxPercent: Number(form.taxPercent),
        freeShippingThresholdPaise: form.freeShippingThresholdPaise
          ? Math.round(Number(form.freeShippingThresholdPaise) * 100)
          : 0,
        defaultShippingPaise: form.defaultShippingPaise
          ? Math.round(Number(form.defaultShippingPaise) * 100)
          : 0,
        maxCartItems: Number(form.maxCartItems),
        maxQtyPerItem: Number(form.maxQtyPerItem),
      });
      setSaved(true);
      settings.reload();
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setSaving(false);
    }
  }

  if (settings.loading && !form) return <Skeleton style={{ width: '100%', height: 200 }} />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (!form) return null;

  return (
    <>
      <h1 className="vp-dash-h1">Marketplace settings</h1>
      <p className="text-secondary small mb-4">
        Configure marketplace commission rates, tax modes, supported payment methods, and shipping rules.
      </p>

      <Form onSubmit={save} style={{ maxWidth: 760 }}>
        {err && <Alert variant="danger" className="mb-3">{err.message}</Alert>}
        {saved && <Alert variant="success" className="mb-3">Settings saved successfully.</Alert>}

        <section className="vp-admin-card">
          <h2 className="vp-admin-card-title">Commission &amp; Tax</h2>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Platform commission (%)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.commissionPercent}
                  onChange={(e) => set('commissionPercent', e.target.value)}
                />
                <Form.Text className="text-secondary">
                  Percentage of each order retained by VP Mart.
                </Form.Text>
              </Form.Group>
            </div>
            <div className="col-12 col-md-6">
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">GST rate (%)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  max={100}
                  value={form.taxPercent}
                  onChange={(e) => set('taxPercent', e.target.value)}
                />
                <Form.Text className="text-secondary">Standard tax rate applied to catalog items.</Form.Text>
              </Form.Group>
            </div>
          </div>

          <Form.Group className="mb-1">
            <Form.Label className="fw-semibold">Tax mode</Form.Label>
            <div className="d-flex flex-column gap-2 mt-1">
              {TAX_MODES.map((t) => (
                <Form.Check
                  key={t.value}
                  type="radio"
                  id={`tax-${t.value}`}
                  name="taxMode"
                  label={t.label}
                  value={t.value}
                  checked={form.taxMode === t.value}
                  onChange={() => set('taxMode', t.value)}
                />
              ))}
            </div>
          </Form.Group>
        </section>

        <section className="vp-admin-card">
          <h2 className="vp-admin-card-title">Payment methods</h2>
          <p className="text-secondary small mb-3">Enable customer checkout payment methods on VP Mart.</p>
          <div className="d-flex flex-column gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Form.Check
                key={m.value}
                type="checkbox"
                id={`pay-${m.value}`}
                label={m.label}
                checked={form.paymentMethods.includes(m.value)}
                onChange={() => togglePayment(m.value)}
              />
            ))}
          </div>
        </section>

        <section className="vp-admin-card">
          <h2 className="vp-admin-card-title">Shipping &amp; Delivery</h2>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <Form.Group>
                <Form.Label className="fw-semibold">Default shipping charge (₹)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  value={form.defaultShippingPaise}
                  onChange={(e) => set('defaultShippingPaise', e.target.value)}
                  placeholder="e.g. 49"
                />
                <Form.Text className="text-secondary">Standard shipping fee when below free shipping.</Form.Text>
              </Form.Group>
            </div>
            <div className="col-12 col-md-6">
              <Form.Group>
                <Form.Label className="fw-semibold">Free shipping above (₹)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  value={form.freeShippingThresholdPaise}
                  onChange={(e) => set('freeShippingThresholdPaise', e.target.value)}
                  placeholder="e.g. 499"
                />
                <Form.Text className="text-secondary">Orders above this get free delivery.</Form.Text>
              </Form.Group>
            </div>
          </div>
        </section>

        <section className="vp-admin-card">
          <h2 className="vp-admin-card-title">Cart &amp; Order limits</h2>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <Form.Group>
                <Form.Label className="fw-semibold">Max unique items in cart</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  value={form.maxCartItems}
                  onChange={(e) => set('maxCartItems', e.target.value)}
                />
              </Form.Group>
            </div>
            <div className="col-12 col-md-6">
              <Form.Group>
                <Form.Label className="fw-semibold">Max quantity per item</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  value={form.maxQtyPerItem}
                  onChange={(e) => set('maxQtyPerItem', e.target.value)}
                />
              </Form.Group>
            </div>
          </div>
        </section>

        <div className="d-flex justify-content-end gap-2 mt-4 mb-5">
          <Button type="submit" variant="dark" size="lg" disabled={busy} className="px-4">
            <FiSave className="me-2" />
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Form>
    </>
  );
}
