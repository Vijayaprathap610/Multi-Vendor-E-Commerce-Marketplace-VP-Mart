import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import FormField from './FormField.jsx';
import { normalizeError } from '../services/api.js';
import { validateName } from '../utils/validation.js';

const blank = {
  label: '',
  name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

export function validateAddress(f) {
  const e = {};
  if (validateName(f.name)) e.name = 'Enter the recipient’s name';
  if (!/^\+?[0-9]{10,15}$/.test(f.phone.trim()))
    e.phone = 'Enter a valid phone number (10-15 digits)';
  if (f.line1.trim().length < 3) e.line1 = 'Enter the street address';
  if (f.city.trim().length < 2) e.city = 'Enter the city';
  if (f.state.trim().length < 2) e.state = 'Enter the state';
  if (!/^[1-9][0-9]{5}$/.test(f.pincode)) e.pincode = 'Enter a valid 6-digit PIN code';
  return e;
}

export default function AddressForm({ initial, onSave, onCancel, idPrefix = 'addr' }) {
  const [f, setF] = useState({ ...blank, ...(initial || {}) });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    e.stopPropagation();
    const v = validateAddress(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr('');
    try {
      const payload = {
        name: f.name.trim(),
        phone: f.phone.trim(),
        line1: f.line1.trim(),
        city: f.city.trim(),
        state: f.state.trim(),
        pincode: f.pincode,
        isDefault: !!f.isDefault,
      };
      if (f.line2?.trim()) payload.line2 = f.line2.trim();
      if (f.label?.trim()) payload.label = f.label.trim();
      await onSave(payload);
    } catch (e2) {
      const n = normalizeError(e2);
      setErrors(n.fields);
      setErr(n.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      onSubmit={submit}
      noValidate
      className="vp-addr-form"
      aria-label={initial?.id ? 'Edit address' : 'New address'}
    >
      {err && (
        <Alert variant="danger" role="alert">
          {err}
        </Alert>
      )}
      <div className="vp-two">
        <FormField
          label="Full name"
          value={f.name}
          onChange={set('name')}
          error={errors.name}
          autoComplete="name"
        />
        <FormField
          label="Phone number"
          type="tel"
          value={f.phone}
          onChange={set('phone')}
          error={errors.phone}
          autoComplete="tel"
        />
      </div>
      <FormField
        label="Address line 1"
        value={f.line1}
        onChange={set('line1')}
        error={errors.line1}
        autoComplete="address-line1"
      />
      <FormField
        label="Address line 2 (optional)"
        value={f.line2}
        onChange={set('line2')}
        autoComplete="address-line2"
      />
      <div className="vp-three">
        <FormField
          label="City"
          value={f.city}
          onChange={set('city')}
          error={errors.city}
          autoComplete="address-level2"
        />
        <FormField
          label="State"
          value={f.state}
          onChange={set('state')}
          error={errors.state}
          autoComplete="address-level1"
        />
        <FormField
          label="PIN code"
          value={f.pincode}
          onChange={(e) =>
            setF((x) => ({ ...x, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))
          }
          error={errors.pincode}
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </div>
      <FormField
        label="Label (optional)"
        value={f.label}
        onChange={set('label')}
        hint="For example Home or Office"
      />
      <Form.Check
        id={`${idPrefix}-default`}
        className="mb-3"
        label="Make this my default address"
        checked={!!f.isDefault}
        onChange={set('isDefault')}
      />
      <div className="d-flex gap-2">
        <Button type="submit" variant="dark" disabled={busy}>
          {busy ? 'Saving…' : 'Save address'}
        </Button>
        {onCancel && (
          <Button variant="outline-secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Form>
  );
}
