import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { normalizeError } from '../services/api.js';
import { validateEmail } from '../utils/validation.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      email: validateEmail(email),
      password: password ? '' : 'Enter your password',
    };
    setErrors(next);
    setFormError('');
    if (next.email || next.password) return;
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      navigate(location.state?.from || '/account', { replace: true });
    } catch (err) {
      const { message, fields } = normalizeError(err);
      setFormError(message);
      setErrors(fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to continue."
      footer={
        <>
          New to VP Mart? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <Form onSubmit={onSubmit} noValidate>
        {formError && (
          <Alert variant="danger" role="alert">
            {formError}
          </Alert>
        )}
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <PasswordField value={password} onChange={setPassword} error={errors.password} />
        <div className="d-flex justify-content-between align-items-center mb-3">
          <Link to="/forgot-password" className="small">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="dark" className="w-100" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Form>
    </AuthLayout>
  );
}
