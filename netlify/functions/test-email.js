// Temporary diagnostic — tests Resend config independently of SAM logic.
// Delete after email is confirmed working.
exports.handler = async () => {
  const key  = process.env.RESEND_API_KEY   || '';
  const from = process.env.ALERT_EMAIL_FROM || '';
  const to   = process.env.ALERT_EMAIL_TO   || '';

  if (!key || !from || !to) {
    return { statusCode: 400, body: JSON.stringify({
      error: 'Missing env vars',
      has_key: !!key, has_from: !!from, has_to: !!to
    })};
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: to.split(',').map(s => s.trim()),
      subject: 'SAM Monitor — Email Config Test',
      html: '<p>✓ Resend is configured correctly for the SAM.gov opportunity monitor.</p>'
    })
  });

  const body = await res.text();
  return { statusCode: res.status, body };
};
