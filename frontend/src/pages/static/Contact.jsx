import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import FormField from '../../components/FormField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSeo } from '../../hooks/useSeo.js';
import { normalizeError } from '../../services/api.js';
import { catalogService } from '../../services/catalogService.js';
import { validateEmail, validateName } from '../../utils/validation.js';

export default function Contact() {
  useSeo({
    title: 'Contact us',
    description: 'Send a message to the VP Mart support team.',
    path: '/contact',
  });
  const { user } = useAuth();
  const [f, setF] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const next = {
      name: validateName(f.name),
      email: validateEmail(f.email),
      message: f.message.trim().length >= 10 ? '' : 'Please write at least 10 characters',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setState({ busy: true, done: false, error: '' });
    try {
      await catalogService.contact({
        name: f.name.trim(),
        email: f.email.trim(),
        subject: f.subject.trim() || undefined,
        message: f.message.trim(),
      });
      setState({ busy: false, done: true, error: '' });
    } catch (err) {
      const { message, fields } = normalizeError(err);
      setErrors(fields);
      setState({ busy: false, done: false, error: message });
    }
  }

  return (
    <section className="container vp-static">
      <h1 className="vp-h1-page">Contact us</h1>
      <p className="text-secondary">
        Send us a message and the support team will follow up by email.
      </p>
      {state.done ? (
        <Alert variant="success" role="status">
          Thanks, your message has been sent.
        </Alert>
      ) : (
        <Form onSubmit={submit} noValidate className="vp-panel">
          {state.error && (
            <Alert variant="danger" role="alert">
              {state.error}
            </Alert>
          )}
          <FormField
            label="Your name"
            value={f.name}
            onChange={set('name')}
            error={errors.name}
            autoComplete="name"
          />
          <FormField
            label="Email"
            type="email"
            value={f.email}
            onChange={set('email')}
            error={errors.email}
            autoComplete="email"
          />
          <FormField
            label="Subject (optional)"
            value={f.subject}
            onChange={set('subject')}
            error={errors.subject}
          />
          <FormField
            label="Message"
            as="textarea"
            rows={5}
            value={f.message}
            onChange={set('message')}
            error={errors.message}
          />
          <Button type="submit" variant="dark" disabled={state.busy}>
            {state.busy ? 'Sending…' : 'Send message'}
          </Button>
        </Form>
      )}
    </section>
  );
}
