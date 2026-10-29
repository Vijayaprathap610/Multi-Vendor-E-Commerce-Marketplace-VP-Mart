import { useId, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { FiTrash2, FiUploadCloud } from 'react-icons/fi';
import { normalizeError } from '../services/api.js';
import { uploadService } from '../services/vendorService.js';

const OK = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

// Uploads each file straight to the API (which validates the real image content and re-encodes
// it). The form only keeps the returned keys. `items` = [{ key, url, thumbUrl, alt }].
export default function ImageUploader({
  purpose,
  items,
  onChange,
  max = 1,
  withAlt = false,
  label = 'Images',
}) {
  const id = useId();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e) {
    const files = [...e.target.files].slice(0, max - items.length);
    e.target.value = '';
    setError('');
    const added = [];
    setBusy(true);
    for (const f of files) {
      if (!OK.includes(f.type)) {
        setError('Only JPEG, PNG or WebP images are allowed.');
        continue;
      }
      if (f.size > MAX) {
        setError('Each image must be 5 MB or smaller.');
        continue;
      }
      try {
        const r = await uploadService.image(f, purpose);
        added.push({ key: r.key, url: r.url, thumbUrl: r.thumbUrl, alt: '' });
      } catch (err) {
        setError(normalizeError(err).message);
      }
    }
    setBusy(false);
    if (added.length) onChange([...items, ...added]);
  }

  return (
    <fieldset className="vp-uploader">
      <legend className="form-label">{label}</legend>
      <ul className="vp-up-list">
        {items.map((it, i) => (
          <li key={it.key}>
            <img src={it.thumbUrl || it.url} alt="" width="96" height="96" />
            {withAlt && (
              <Form.Control
                size="sm"
                aria-label={`Description for image ${i + 1}`}
                placeholder="Describe the image"
                value={it.alt || ''}
                maxLength={140}
                onChange={(e) =>
                  onChange(items.map((x) => (x.key === it.key ? { ...x, alt: e.target.value } : x)))
                }
              />
            )}
            <Button
              variant="link"
              size="sm"
              className="text-danger p-0"
              onClick={() => onChange(items.filter((x) => x.key !== it.key))}
              aria-label={`Remove image ${i + 1}`}
            >
              <FiTrash2 aria-hidden="true" /> Remove
            </Button>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <>
          <input
            ref={input}
            aria-label={`Choose ${label.toLowerCase()} files`}
            id={id}
            type="file"
            accept={OK.join(',')}
            multiple={max > 1}
            onChange={pick}
            className="visually-hidden"
          />
          <Button
            variant="outline-dark"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <FiUploadCloud aria-hidden="true" />{' '}
            {busy ? 'Uploading…' : items.length ? 'Add more' : 'Choose image'}
          </Button>
          <small className="text-secondary ms-2">
            JPEG, PNG or WebP, up to 5 MB{max > 1 ? `, up to ${max} images` : ''}
          </small>
        </>
      )}
      {error && (
        <Alert variant="danger" className="py-1 mt-2 small" role="alert">
          {error}
        </Alert>
      )}
    </fieldset>
  );
}
