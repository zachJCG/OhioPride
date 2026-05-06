import type { MetadataRoute } from 'next';
import { listIssueSlugs } from '@/lib/page-content';

const BASE = 'https://www.ohiopride.org';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: Array<{ path: string; priority: number }> = [
    { path: '/',                          priority: 1.0 },
    { path: '/issues',                    priority: 0.9 },
    { path: '/scorecard',                 priority: 0.9 },
    { path: '/launch-day',                priority: 0.85 },
    { path: '/founding-members',          priority: 0.8 },
    { path: '/donate',                    priority: 0.8 },
    { path: '/donate/founding-member',    priority: 0.8 },
    { path: '/about',                     priority: 0.7 },
    { path: '/board',                     priority: 0.7 },
    { path: '/connect',                   priority: 0.6 },
    { path: '/contact',                   priority: 0.6 },
    { path: '/methodology',               priority: 0.5 },
    { path: '/privacy',                   priority: 0.3 },
    { path: '/terms',                     priority: 0.3 },
  ];

  const issueRoutes = listIssueSlugs().map(slug => ({
    url: `${BASE}/issues/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    ...staticRoutes.map(r => ({
      url: `${BASE}${r.path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: r.priority,
    })),
    ...issueRoutes,
  ];
}
