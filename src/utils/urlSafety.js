function isPrivateHostname(hostname) {
  if (!hostname) return true;

  const h = String(hostname).trim().toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true;

  const blocked = [
    '127.0.0.1', '0.0.0.0', '::1', '[::1]',
    '10.0.0.0', '172.16.0.0', '192.168.0.0', '169.254.0.0', '100.64.0.0', '198.18.0.0', '198.19.0.0'
  ];

  if (blocked.includes(h)) return true;

  if (h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.') || h.startsWith('100.64.')) {
    return true;
  }

  if (h.startsWith('172.')) {
    const second = Number(h.split('.')[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }

  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;

  return false;
}

function normalizeExternalImageUrl(raw) {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (!value) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const allowedProtocols = new Set(['http:', 'https:']);
  if (!allowedProtocols.has(url.protocol)) return null;

  if (url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
  if (isPrivateHostname(hostname)) return null;

  const pathname = url.pathname.toLowerCase();
  const hasImageExtension = /\.(png|jpe?g|gif|webp|bmp|avif|svg)(?:$|[?#])/i.test(pathname);
  const isDiscordAttachment = /(?:cdn\.discordapp\.com|media\.discordapp\.net)/i.test(hostname) && pathname.includes('/attachments/');
  const isTrustedStaticPath = /(?:catbox\.moe|imgur\.com|i\.imgur\.com|images\.unsplash\.com|cdn\.pixabay\.com|images\.pexels\.com|giphy\.com|i\.giphy\.com|tenor\.com|media\.tenor\.com)/i.test(hostname);

  if (!hasImageExtension && !isDiscordAttachment && !isTrustedStaticPath) {
    return null;
  }

  url.search = '';
  url.hash = '';
  return url.toString();
}

module.exports = {
  normalizeExternalImageUrl,
  isPrivateHostname,
};
