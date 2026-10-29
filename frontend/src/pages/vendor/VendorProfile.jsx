import { useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import FormField from '../../components/FormField.jsx';
import ImageUploader from '../../components/ImageUploader.jsx';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { vendorService } from '../../services/vendorService.js';
import { paiseToRupeesString, rupeesToPaise } from '../../utils/money.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = {
  shopName: '',
  description: '',
  businessName: '',
  gstin: '',
  fssaiLicense: '',
  drugLicense: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  accountHolder: '',
  ifsc: '',
  accountNumber: '',
  processingDays: '1',
  dispatchCutoffHour: '16',
  shipping: '',
  freeAbove: '',
  coverageMode: 'all',
  prefixes: '',
  closed: [],
  unavailableUntil: '',
};

function fromProfile(p) {
  if (!p) return blank;
  const a = p.pickupAddress || {};
  const d = p.delivery || {};
  return {
    ...blank,
    shopName: p.shopName || '',
    description: p.description || '',
    businessName: p.businessName || '',
    gstin: p.gstin || '',
    fssaiLicense: p.fssaiLicense || '',
    drugLicense: p.drugLicense || '',
    line1: a.line1 || '',
    line2: a.line2 || '',
    city: a.city || '',
    state: a.state || '',
    pincode: a.pincode || '',
    accountHolder: p.payout?.accountHolder || '',
    ifsc: p.payout?.ifsc || '',
    processingDays: String(d.processingDays ?? 1),
    dispatchCutoffHour: String(d.dispatchCutoffHour ?? 16),
    shipping: paiseToRupeesString(d.shippingChargePaise || 0),
    freeAbove: paiseToRupeesString(d.freeShippingAbovePaise),
    coverageMode: d.coverage?.mode || 'all',
    prefixes: (d.coverage?.pincodePrefixes || []).join(', '),
    closed: d.closedWeekdays || [],
    unavailableUntil: d.unavailableUntil ? d.unavailableUntil.slice(0, 10) : '',
  };
}

export function buildPayload(f, logo) {
  const errors = {};
  const ship = f.shipping === '' ? 0 : rupeesToPaise(f.shipping);
  if (ship == null) errors.shipping = 'Enter a valid amount';
  const free = f.freeAbove === '' ? null : rupeesToPaise(f.freeAbove);
  if (f.freeAbove !== '' && free == null) errors.freeAbove = 'Enter a valid amount';
  if (!/^\d+$/.test(f.processingDays) || Number(f.processingDays) > 14)
    errors.processingDays = '0 to 14 days';
  const prefixes = f.prefixes.split(/[,\s]+/).filter(Boolean);
  if (prefixes.some((x) => !/^[1-9]\d{0,5}$/.test(x)))
    errors.prefixes = 'Use PIN prefixes such as 641 or 6000';
  if (f.coverageMode === 'prefixes' && !prefixes.length)
    errors.prefixes = 'Add at least one PIN prefix';
  if (Object.keys(errors).length) return { errors };
  const addr = {
    line1: f.line1,
    line2: f.line2 || undefined,
    city: f.city,
    state: f.state,
    pincode: f.pincode,
  };
  const payload = {
    shopName: f.shopName,
    description: f.description,
    businessName: f.businessName,
    gstin: f.gstin,
    fssaiLicense: f.fssaiLicense,
    drugLicense: f.drugLicense,
    ...(logo !== undefined ? { logoKey: logo } : {}),
    pickupAddress: Object.fromEntries(
      Object.entries(addr).filter(([, v]) => v !== '' && v !== undefined),
    ),
    payout: Object.fromEntries(
      Object.entries({ accountHolder: f.accountHolder, ifsc: f.ifsc }).filter(([, v]) => v),
    ),
    ...(f.accountNumber ? { accountNumber: f.accountNumber } : {}),
    delivery: {
      processingDays: Number(f.processingDays),
      dispatchCutoffHour: Number(f.dispatchCutoffHour),
      shippingChargePaise: ship,
      freeShippingAbovePaise: free,
      coverage: { mode: f.coverageMode, pincodePrefixes: prefixes },
      closedWeekdays: f.closed,
      unavailableUntil: f.unavailableUntil ? new Date(f.unavailableUntil).toISOString() : null,
    },
  };
  if (!payload.payout || !Object.keys(payload.payout).length) delete payload.payout;
  for (const k of ['description', 'gstin', 'fssaiLicense', 'drugLicense'])
    if (payload[k] === '') delete payload[k];
  return { payload };
}

export default function VendorProfile() {
  const loaded = useAsync(() => vendorService.profile(), []);
  const [f, setF] = useState(blank);
  const [logo, setLogo] = useState([]);
  const [logoChanged, setLogoChanged] = useState(false);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [masked, setMasked] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    const p = loaded.data?.profile;
    if (!p) return;
    setF(fromProfile(p));
    setMasked(p.payout?.accountMasked || null);
    setSubmitted(p.submittedAt || null);
    if (p.logoUrl) setLogo([{ key: p.logoKey, url: p.logoUrl, thumbUrl: p.logoUrl }]);
  }, [loaded.data]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const field = (k, label, extra = {}) => (
    <FormField
      label={label}
      value={f[k]}
      onChange={set(k)}
      error={errors[k] || errors[`pickupAddress.${k}`]}
      {...extra}
    />
  );

  async function save(thenSubmit) {
    const { payload, errors: e } = buildPayload(
      f,
      logoChanged ? (logo[0]?.key ?? null) : undefined,
    );
    setErrors(e || {});
    setMsg(null);
    if (e) return;
    setBusy(true);
    try {
      const r = await vendorService.saveProfile(payload);
      setMasked(r.profile.payout?.accountMasked || null);
      setF((x) => ({ ...x, accountNumber: '' }));
      setLogoChanged(false);
      if (thenSubmit) {
        const s = await vendorService.submitProfile();
        setSubmitted(s.profile.submittedAt);
        setMsg({
          v: 'success',
          t: 'Submitted for approval. An administrator will review your shop.',
        });
      } else setMsg({ v: 'success', t: 'Profile saved.' });
    } catch (err) {
      const n = normalizeError(err);
      const flat = Object.fromEntries(
        Object.entries(n.fields).map(([k, v]) => [
          k.replace(/^(payout|delivery|pickupAddress)\./, ''),
          v,
        ]),
      );
      setErrors(flat);
      setMsg({
        v: 'danger',
        t:
          n.code === 'PROFILE_INCOMPLETE'
            ? `Complete these first: ${Object.keys(n.fields).join(', ')}.`
            : n.message,
      });
    } finally {
      setBusy(false);
    }
  }

  if (loaded.loading) return <Skeleton style={{ width: '100%', height: 300 }} />;
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;

  return (
    <>
      <h1 className="vp-dash-h1">Shop profile</h1>
      {submitted && (
        <Alert variant="info">
          Submitted for review on {new Date(submitted).toLocaleDateString('en-IN')}. You can still
          update details; administrators see the latest version.
        </Alert>
      )}
      {msg && (
        <Alert variant={msg.v} role={msg.v === 'danger' ? 'alert' : 'status'}>
          {msg.t}
        </Alert>
      )}
      <Form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="vp-form-grid"
      >
        <section>
          <h2 className="h6">Shop</h2>
          {field('shopName', 'Shop name')}
          {field('description', 'About your shop (optional)', { as: 'textarea', rows: 3 })}
          <ImageUploader
            purpose="logo"
            label="Shop logo (optional)"
            items={logo}
            onChange={(v) => {
              setLogo(v);
              setLogoChanged(true);
            }}
            max={1}
          />
        </section>
        <section>
          <h2 className="h6">Business and licences</h2>
          {field('businessName', 'Registered business name')}
          {field('gstin', 'GSTIN (optional)', { placeholder: '22AAAAA0000A1Z5' })}
          {field('fssaiLicense', 'FSSAI licence (needed to sell food)', {
            hint: '14-digit licence number',
          })}
          {field('drugLicense', 'Drug licence (needed to sell medicines)')}
        </section>
        <section>
          <h2 className="h6">Pickup address</h2>
          {field('line1', 'Address line 1')}
          {field('line2', 'Address line 2 (optional)')}
          <div className="d-flex gap-2">
            <div className="flex-fill">{field('city', 'City')}</div>
            <div className="flex-fill">{field('state', 'State')}</div>
          </div>
          {field('pincode', 'PIN code', {
            inputMode: 'numeric',
            maxLength: 6,
            hint: 'Delivery estimates start from this PIN code',
          })}
        </section>
        <section>
          <h2 className="h6">Payout details</h2>
          {field('accountHolder', 'Account holder name')}
          {field('ifsc', 'IFSC code')}
          {field('accountNumber', 'Bank account number', {
            inputMode: 'numeric',
            autoComplete: 'off',
            hint: masked
              ? `On file: ${masked}. Leave blank to keep it. Only the last 4 digits are stored.`
              : 'Only the last 4 digits are stored.',
          })}
        </section>
        <section>
          <h2 className="h6">Delivery settings</h2>
          <div className="d-flex gap-2">
            <div className="flex-fill">
              {field('processingDays', 'Processing time (days)', { inputMode: 'numeric' })}
            </div>
            <div className="flex-fill">
              <Form.Group className="mb-3" controlId="cutoff">
                <Form.Label>Daily dispatch cut-off</Form.Label>
                <Form.Select value={f.dispatchCutoffHour} onChange={set('dispatchCutoffHour')}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <div className="d-flex gap-2">
            <div className="flex-fill">
              {field('shipping', 'Shipping charge (₹)', { inputMode: 'decimal' })}
            </div>
            <div className="flex-fill">
              {field('freeAbove', 'Free shipping above (₹)', { inputMode: 'decimal' })}
            </div>
          </div>
          <Form.Group className="mb-3" controlId="cov">
            <Form.Label>Delivery coverage</Form.Label>
            <Form.Select value={f.coverageMode} onChange={set('coverageMode')}>
              <option value="all">All of India</option>
              <option value="prefixes">Only listed PIN prefixes</option>
            </Form.Select>
          </Form.Group>
          {f.coverageMode === 'prefixes' &&
            field('prefixes', 'PIN prefixes', {
              placeholder: '641, 600, 64',
              hint: 'Comma separated',
            })}
          <fieldset className="mb-3">
            <legend className="form-label">Days you do not dispatch</legend>
            {DAYS.map((d, i) => (
              <Form.Check
                inline
                key={d}
                id={`closed-${i}`}
                label={d}
                type="checkbox"
                checked={f.closed.includes(i)}
                onChange={(e) =>
                  setF((x) => ({
                    ...x,
                    closed: e.target.checked ? [...x.closed, i] : x.closed.filter((n) => n !== i),
                  }))
                }
              />
            ))}
          </fieldset>
          {field('unavailableUntil', 'Away until (optional)', { type: 'date' })}
        </section>
        <div className="vp-form-actions">
          <Button type="submit" variant="outline-dark" disabled={busy}>
            {busy ? 'Saving…' : 'Save draft'}
          </Button>
          <Button type="button" variant="dark" disabled={busy} onClick={() => save(true)}>
            {submitted ? 'Save and resubmit' : 'Save and submit for approval'}
          </Button>
        </div>
      </Form>
    </>
  );
}
