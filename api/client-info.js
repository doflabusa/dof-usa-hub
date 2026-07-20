
export default function handler(req, res) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || '';

  res.status(200).json({
    ip,
    userAgent: req.headers['user-agent'] || '',
    country: req.headers['x-vercel-ip-country'] || '',
    region: req.headers['x-vercel-ip-country-region'] || '',
    city: req.headers['x-vercel-ip-city'] || ''
  });
}
