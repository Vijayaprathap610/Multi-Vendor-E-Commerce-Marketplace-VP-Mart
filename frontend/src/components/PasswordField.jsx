import { useId, useState } from 'react';
import { Form, InputGroup } from 'react-bootstrap';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { passwordStrength } from '../utils/validation.js';

const LABELS = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];

export default function PasswordField({
  label = 'Password',
  value,
  onChange,
  error,
  autoComplete = 'current-password',
  showStrength = false,
  hint,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  return (
    <Form.Group className="mb-3" controlId={id}>
      <Form.Label>{label}</Form.Label>
      <InputGroup hasValidation>
        <Form.Control
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          isInvalid={!!error}
          autoComplete={autoComplete}
          aria-describedby={`${id}-help`}
        />
        <button
          type="button"
          className="btn btn-outline-secondary vp-eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
        </button>
        <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      </InputGroup>
      <div id={`${id}-help`} className="form-text">
        {showStrength && value ? (
          <span className={`vp-strength vp-strength-${strength}`}>
            <span className="vp-strength-bar" aria-hidden="true">
              <i />
            </span>
            Strength: {LABELS[strength]}
          </span>
        ) : (
          hint
        )}
      </div>
    </Form.Group>
  );
}
