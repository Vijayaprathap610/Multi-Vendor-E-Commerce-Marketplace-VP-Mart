import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { isValidPincode, useLocationPin } from '../context/LocationContext.jsx';

export default function LocationModal() {
  const { pincode, setPincode, open, closePicker } = useLocationPin();
  const [v, setV] = useState(pincode);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setV(pincode);
      setErr('');
    }
  }, [open, pincode]);

  function save(e) {
    e.preventDefault();
    if (!isValidPincode(v)) return setErr('Enter a valid 6-digit PIN code');
    setPincode(v);
    closePicker();
  }
  return (
    <Modal show={open} onHide={closePicker} centered>
      <Form onSubmit={save} noValidate>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Choose your delivery location
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary">
            Delivery dates and availability depend on where the order is going. Enter your PIN code.
          </p>
          <Form.Group controlId="vp-pin">
            <Form.Label>PIN code</Form.Label>
            <Form.Control
              inputMode="numeric"
              maxLength={6}
              value={v}
              onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
              isInvalid={!!err}
              autoFocus
            />
            <Form.Control.Feedback type="invalid">{err}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          {pincode && (
            <Button
              variant="link"
              className="me-auto"
              onClick={() => {
                setPincode('');
                closePicker();
              }}
            >
              Clear location
            </Button>
          )}
          <Button variant="outline-secondary" onClick={closePicker}>
            Cancel
          </Button>
          <Button type="submit" variant="dark">
            Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
