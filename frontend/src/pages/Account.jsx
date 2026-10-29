import { useState } from 'react';
import { Alert, Badge, Button, Form, Tab, Tabs } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { authService } from '../services/authService.js';
import { normalizeError } from '../services/api.js';
import { roleLabel, statusLabel } from '../utils/format.js';
import { validateName, validatePassword, validatePhone } from '../utils/validation.js';

function ProfileTab() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const next = { name: validateName(name), phone: validatePhone(phone) };
    setErrors(next);
    setMsg({ type: '', text: '' });
    if (next.name || next.phone) return;
    setBusy(true);
    try {
      const d = await authService.updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setUser(d.user);
      setMsg({ type: 'success', text: 'Profile updated.' });
    } catch (err) {
      const { message, fields } = normalizeError(err);
      setMsg({ type: 'danger', text: message });
      setErrors(fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} noValidate className="vp-panel">
      {msg.text && (
        <Alert variant={msg.type} role={msg.type === 'danger' ? 'alert' : 'status'}>
          {msg.text}
        </Alert>
      )}
      <FormField
        label="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        autoComplete="name"
      />
      <FormField label="Email" value={user.email} readOnly hint="Email cannot be changed here." />
      <FormField
        label="Phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        autoComplete="tel"
      />
      <Button type="submit" variant="dark" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </Form>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const errs = {
      currentPassword: current ? '' : 'Enter your current password',
      newPassword: validatePassword(next),
    };
    setErrors(errs);
    setMsg({ type: '', text: '' });
    if (errs.currentPassword || errs.newPassword) return;
    setBusy(true);
    try {
      await authService.changePassword(current, next);
      setCurrent('');
      setNext('');
      setMsg({
        type: 'success',
        text: 'Password changed. Your other devices have been signed out.',
      });
    } catch (err) {
      const { message, fields, code } = normalizeError(err);
      setMsg({ type: 'danger', text: message });
      setErrors(code === 'WRONG_PASSWORD' ? { currentPassword: message } : fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} noValidate className="vp-panel">
      {msg.text && (
        <Alert variant={msg.type} role={msg.type === 'danger' ? 'alert' : 'status'}>
          {msg.text}
        </Alert>
      )}
      <PasswordField
        label="Current password"
        value={current}
        onChange={setCurrent}
        error={errors.currentPassword}
      />
      <PasswordField
        label="New password"
        value={next}
        onChange={setNext}
        error={errors.newPassword}
        autoComplete="new-password"
        showStrength
      />
      <Button type="submit" variant="dark" disabled={busy}>
        {busy ? 'Updating…' : 'Change password'}
      </Button>
    </Form>
  );
}

function DangerTab() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(kind) {
    if (!password) return setError('Enter your password to confirm');
    setError('');
    setBusy(true);
    try {
      await (kind === 'delete'
        ? authService.deleteAccount(password)
        : authService.deactivate(password));
      // Leave the protected page first, otherwise the route guard bounces to /login.
      navigate('/', { replace: true });
      setUser(null);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vp-panel">
      <Button
        variant="outline-dark"
        className="mb-4"
        onClick={async () => {
          navigate('/', { replace: true });
          await logout();
        }}
      >
        Sign out
      </Button>
      <h2 className="h5">Deactivate or delete</h2>
      <p className="text-secondary">
        Deactivating signs you out everywhere; an administrator must reactivate the account.
        {user.role === 'buyer'
          ? ' Deleting permanently erases your personal details; order records are kept without your identity.'
          : ' Vendor and delivery accounts hold financial records, so closing them is handled by support.'}
      </p>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      <PasswordField label="Confirm with your password" value={password} onChange={setPassword} />
      <div className="d-flex gap-2 flex-wrap">
        <Button variant="outline-danger" disabled={busy} onClick={() => run('deactivate')}>
          Deactivate account
        </Button>
        {user.role === 'buyer' && (
          <Button variant="danger" disabled={busy} onClick={() => run('delete')}>
            Delete account
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Account() {
  const { user } = useAuth();
  return (
    <section className="container py-4 vp-account">
      <header className="mb-3">
        <h1 className="h3 mb-1">Hello, {user.name.split(' ')[0]}</h1>
        <div className="d-flex gap-2 align-items-center">
          <Badge bg="dark">{roleLabel(user.role)}</Badge>
          <Badge
            bg={user.status === 'active' ? 'success' : 'warning'}
            text={user.status === 'active' ? undefined : 'dark'}
          >
            {statusLabel(user.status)}
          </Badge>
        </div>
      </header>
      {user.status === 'pending_approval' && (
        <Alert variant="warning">
          Your {roleLabel(user.role).toLowerCase()} application is awaiting administrator approval.
          You can sign in and manage your account while you wait.
        </Alert>
      )}
      <Tabs defaultActiveKey="profile" className="mb-3" mountOnEnter>
        <Tab eventKey="profile" title="Profile">
          <ProfileTab />
        </Tab>
        <Tab eventKey="security" title="Security">
          <SecurityTab />
        </Tab>
        <Tab eventKey="account" title="Account">
          <DangerTab />
        </Tab>
      </Tabs>
    </section>
  );
}
