import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { normalizeError } from '../services/api.js';
import {
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from '../utils/validation.js';

const ROLES = [
  { value: 'buyer', label: 'Buyer', help: 'Shop from many sellers' },
  { value: 'vendor', label: 'Vendor', help: 'Sell your products (needs approval)' },
  { value: 'delivery_agent', label: 'Delivery agent', help: 'Deliver orders (needs approval)' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'buyer' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
    };
    setErrors(next);
    setFormError('');
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      await register(payload);
      navigate('/account', { replace: true });
    } catch (err) {
      const { message, fields, code } = normalizeError(err);
      setFormError(message);
      setErrors(code === 'EMAIL_TAKEN' ? { email: message } : fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Choose how you want to use VP Mart."
      footer={
        <>
          Already registered? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <Form onSubmit={onSubmit} noValidate>
        {formError && (
          <Alert variant="danger" role="alert">
            {formError}
          </Alert>
        )}
        <fieldset className="vp-roles mb-3">
          <legend className="form-label">I want to</legend>
          {ROLES.map((r) => (
            <label key={r.value} className={`vp-role ${form.role === r.value ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={form.role === r.value}
                onChange={() => set('role')(r.value)}
              />
              <span className="vp-role-t">{r.label}</span>
              <span className="vp-role-h">{r.help}</span>
            </label>
          ))}
        </fieldset>
        <FormField
          label="Full name"
          value={form.name}
          onChange={(e) => set('name')(e.target.value)}
          error={errors.name}
          autoComplete="name"
        />
        <FormField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <FormField
          label="Phone (optional)"
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
          error={errors.phone}
          autoComplete="tel"
        />
        <PasswordField
          label="Password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="new-password"
          showStrength
          hint="At least 10 characters with letters and numbers."
        />
        <Button type="submit" variant="dark" className="w-100" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </Form>
    </AuthLayout>
  );
}
