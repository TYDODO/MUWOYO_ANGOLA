import express from 'express';
import bodyParser from 'body-parser';
import webpush from 'web-push';
import dotenv from 'dotenv';
import { timingSafeEqual } from 'node:crypto';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const publicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const backendToken = process.env.WEB_PUSH_BACKEND_TOKEN || '';
if (!publicKey || !privateKey) {
  console.warn('VAPID keys not configured in environment. Set VITE_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.local');
}
webpush.setVapidDetails('mailto:you@yourdomain.com', publicKey, privateKey);

app.post('/api/push/send', async (req, res) => {
  if (!backendToken) return res.status(503).json({ error: 'Push backend token is not configured' });
  const suppliedToken = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(backendToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { subscription, data } = req.body;
    if (!subscription) return res.status(400).json({ error: 'subscription required' });

    const payload = JSON.stringify(data || { title: 'Muwoyo', body: '' });
    await webpush.sendNotification(subscription, payload);
    return res.json({ ok: true });
  } catch (err) {
    console.error('push send error', err);
    return res.status(500).json({ error: err?.message || 'internal' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Push backend listening on http://localhost:${port}`));
