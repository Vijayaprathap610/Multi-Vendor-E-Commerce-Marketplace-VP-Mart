import ContactMessage from '../models/ContactMessage.js';

export async function submit(req, res) {
  const m = await ContactMessage.create(req.valid.body);
  res.status(201).json({ ok: true, id: String(m._id) });
}
