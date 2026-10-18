import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MailService } from './mail.service';
import { invitationEmail } from './templates';

test('modo log no envia SMTP y devuelve preview con el enlace', async () => {
  process.env.MAIL_MODE = 'log';
  const svc = new MailService();
  const res = await svc.send('a@b.com', 'Hola', '<p>http://x/?t=1</p>');
  assert.equal(res.mode, 'log');
  assert.match(res.preview!, /http:\/\/x/);
});

test('plantilla de invitacion incluye el enlace', () => {
  const { subject, html } = invitationEmail('http://app/accept-invite?token=XYZ');
  assert.match(subject, /invitaci/i);
  assert.match(html, /accept-invite\?token=XYZ/);
});
