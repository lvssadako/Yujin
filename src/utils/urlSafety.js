const { isIP } = require('node:net');

// Conservative policy: exclude special-purpose assignments, including those
// marked globally reachable. Registries reviewed for S02:
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const SPECIAL_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.31.196.0', 24],
  ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ['168.63.129.16', 32], // Azure platform virtual IP
];
const SPECIAL_V6 = [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16],
  ['2620:4f:8000::', 48], ['3fff::', 20],
];

function ipv4Number(address) {
  return address.split('.').reduce((n, part) => (n << 8n) + BigInt(part), 0n);
}

function ipv6Number(address) {
  // WHATWG canonicalizes dotted IPv4 tails to hex; isIP validated the input.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const parts = canonical.includes('::')
    ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
    : head;
  return parts.reduce((n, part) => (n << 16n) + BigInt(`0x${part}`), 0n);
}

function inRange(value, base, prefix, bits) {
  const shift = BigInt(bits - prefix);
  return (value >> shift) === (base >> shift);
}

function isPublicIp(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return !SPECIAL_V4.some(([base, prefix]) => inRange(value, ipv4Number(base), prefix, 32));
  }
  if (family === 6) {
    const value = ipv6Number(address);
    // Only global unicast; excludes mapped/compatible IPv4, NAT64, loopback,
    // ULA, link/site-local, multicast and unallocated address space.
    if (!inRange(value, ipv6Number('2000::'), 3, 128)) return false;
    const interfacePrefix = (value >> 32n) & 0xffffffffn;
    // ISATAP can also embed IPv4 in an otherwise global IPv6 address.
    if (interfacePrefix === 0x5efen || interfacePrefix === 0x2005efen) return false;
    return !SPECIAL_V6.some(([base, prefix]) => inRange(value, ipv6Number(base), prefix, 128));
  }
  return false;
}

function isPrivateHostname(hostname) {
  if (typeof hostname !== 'string' || !hostname.trim()) return true;
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(h)) return !isPublicIp(h);
  return !h.includes('.') || h.includes(':') || h.includes('%') ||
    ['localhost', 'local', 'internal', 'home.arpa', 'metadata.google.internal', 'metadata.goog']
      .some(domain => h === domain || h.endsWith(`.${domain}`));
}

// Syntactic check only. Network callers MUST also validate DNS and pin it.
function parsePublicHttpUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (isPrivateHostname(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function matchesHost(hostname, hosts) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return hosts.some(host => h === host || h.endsWith(`.${host}`));
}

function normalizeExternalImageUrl(raw) {
  const url = parsePublicHttpUrl(raw);
  if (!url) return null;
  const discordHosts = ['cdn.discordapp.com', 'media.discordapp.net'];
  const queryHosts = [...discordHosts, 'images.unsplash.com', 'cdn.pixabay.com', 'images.pexels.com'];
  const staticHosts = ['catbox.moe', 'imgur.com', 'images.unsplash.com', 'cdn.pixabay.com',
    'images.pexels.com', 'giphy.com', 'tenor.com'];

  const pathname = url.pathname.toLowerCase();
  const hasImageExtension = /\.(png|jpe?g|gif|webp|bmp|avif|svg)(?:$|[?#])/i.test(pathname);
  const isDiscordAttachment = matchesHost(url.hostname, discordHosts) && pathname.includes('/attachments/');
  const isTrustedStaticPath = matchesHost(url.hostname, staticHosts);

  if (!hasImageExtension && !isDiscordAttachment && !isTrustedStaticPath) {
    return null;
  }

  // Preserve query parameters for hosts that require them (CDN auth tokens,
  // image sizing params, etc.).  Only strip the fragment.
  if (!matchesHost(url.hostname, queryHosts)) {
    url.search = '';
  }
  url.hash = '';
  return url.toString();
}

module.exports = {
  normalizeExternalImageUrl,
  isPrivateHostname,
  isPublicIp,
  parsePublicHttpUrl,
};
