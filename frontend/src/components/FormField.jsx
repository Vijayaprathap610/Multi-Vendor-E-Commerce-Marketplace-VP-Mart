import { useId } from 'react';
import { Form } from 'react-bootstrap';

export default function FormField({ label, error, hint, ...props }) {
  const id = useId();
  return (
    <Form.Group className="mb-3" controlId={id}>
      <Form.Label>{label}</Form.Label>
      <Form.Control isInvalid={!!error} {...props} />
      <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      {hint && !error && <div className="form-text">{hint}</div>}
    </Form.Group>
  );
}
