// Temporary diagnostic — tests aiflowdeskpro.com as the from domain.
exports.handler = async () => {
  const key = process.env.RESEND_API_KEY || '';
  const to  = process.env.ALERT_EMAIL_TO || '';

  if (!key || !to) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing RESEND_API_KEY or ALERT_EMAIL_TO' }) };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'alerts@aiflowdeskpro.com',
      to: to.split(',').map(s => s.trim()),
      subject: 'SAM Monitor — Email Test (aiflowdeskpro.com)',
      html: '<p>✓ Email working. SAM.gov digest will send from alerts@aiflowdeskpro.com.</p>'
    })
  });

  const body = await res.text();
  return { statusCode: res.status, body };
};
