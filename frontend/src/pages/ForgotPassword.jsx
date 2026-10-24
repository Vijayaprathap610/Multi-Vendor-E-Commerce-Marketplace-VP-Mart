import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';
import { authService } from '../services/authService.js';
import { normalizeError } from '../services/api.js';
import { validateEmail } from '../utils/validation.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const v = validateEmail(email);
    setError(v);
    if (v) return;
    setBusy(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We’ll email you a link if the address is registered."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {sent ? (
        <Alert variant="success" role="status">
          If that email is registered, a reset link has been sent. It expires in 30 minutes.
        </Alert>
      ) : (
        <Form onSubmit={onSubmit} noValidate>
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            autoComplete="email"
          />
          <Button type="submit" variant="dark" className="w-100" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </Form>
      )}
    </AuthLayout>
  );
}
