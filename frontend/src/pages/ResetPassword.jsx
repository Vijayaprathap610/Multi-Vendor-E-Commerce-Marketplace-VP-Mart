import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { authService } from '../services/authService.js';
import { normalizeError } from '../services/api.js';
import { validatePassword } from '../utils/validation.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const v = validatePassword(password);
    setError(v);
    setFormError('');
    if (v) return;
    setBusy(true);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const { message, fields } = normalizeError(err);
      setFormError(message);
      if (fields.newPassword) setError(fields.newPassword);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
      {!token ? (
        <Alert variant="warning" role="alert">
          This reset link is incomplete. Request a new one from the sign-in page.
        </Alert>
      ) : done ? (
        <Alert variant="success" role="status">
          Password updated. You can now <Link to="/login">sign in</Link>.
        </Alert>
      ) : (
        <Form onSubmit={onSubmit} noValidate>
          {formError && (
            <Alert variant="danger" role="alert">
              {formError}
            </Alert>
          )}
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            error={error}
            autoComplete="new-password"
            showStrength
            hint="At least 10 characters with letters and numbers."
          />
          <Button type="submit" variant="dark" className="w-100" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </Form>
      )}
    </AuthLayout>
  );
}
