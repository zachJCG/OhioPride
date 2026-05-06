/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vanilla JS files served from /public/js still call /.netlify/functions/*.
  // Rewriting keeps those clients working without modifying the JS source.
  async rewrites() {
    return [
      { source: '/.netlify/functions/:path*', destination: '/api/:path*' },
    ];
  },
  async redirects() {
    return [
      // Legacy URLs preserved from netlify.toml
      { source: '/scorecard/methodology', destination: '/methodology', permanent: true },
      { source: '/scorecard/methodology.html', destination: '/methodology', permanent: true },
      { source: '/gala', destination: '/', permanent: true },
      { source: '/gala.html', destination: '/', permanent: true },
      { source: '/sponsorship', destination: '/', permanent: true },
      { source: '/priorities', destination: '/', permanent: true },
      // .html → clean URLs (anyone arriving at /about.html etc. lands on /about)
      { source: '/about.html', destination: '/about', permanent: true },
      { source: '/board.html', destination: '/board', permanent: true },
      { source: '/connect.html', destination: '/connect', permanent: true },
      { source: '/contact.html', destination: '/contact', permanent: true },
      { source: '/donate.html', destination: '/donate', permanent: true },
      { source: '/donate/founding-member.html', destination: '/donate/founding-member', permanent: true },
      { source: '/founding-members.html', destination: '/founding-members', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/issues.html', destination: '/issues', permanent: true },
      { source: '/launch-day.html', destination: '/launch-day', permanent: true },
      { source: '/methodology.html', destination: '/methodology', permanent: true },
      { source: '/privacy.html', destination: '/privacy', permanent: true },
      { source: '/scorecard.html', destination: '/scorecard', permanent: true },
      { source: '/terms.html', destination: '/terms', permanent: true },
      { source: '/issues/:slug.html', destination: '/issues/:slug', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
