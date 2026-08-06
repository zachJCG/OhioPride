// Single source of truth for admin navigation. permission = [module, action] checked via has_permission.
// tab: true marks the five bottom-bar slots on mobile (Dashboard, Contacts, Endorsements, Tasks, More).
export const NAV = [
  { group: 'Overview', items: [
    { id: 'dashboard',    href: '/admin/dashboard',    label: 'Dashboard',    permission: ['dashboard', 'read'], tab: true },
    { id: 'tasks',        href: '/admin/tasks',        label: 'Tasks',        permission: ['tasks', 'read'],     tab: true },
  ]},
  { group: 'People', items: [
    { id: 'contacts',     href: '/admin/contacts',     label: 'Contacts',     permission: ['contacts', 'read'],  tab: true },
    { id: 'volunteers',   href: '/admin/volunteers',   label: 'Volunteers',   permission: ['volunteers', 'read'] },
    { id: 'internships',  href: '/admin/internships',  label: 'Internships',  permission: ['internships', 'read'] },
    { id: 'events',       href: '/admin/pride',        label: 'Events',       permission: ['pride', 'read'] },
    { id: 'texting',      href: '/admin/texting',      label: 'Texting',      permission: ['texting', 'read'] },
  ]},
  { group: 'Program', items: [
    { id: 'endorsements', href: '/admin/endorsements', label: 'Endorsements', permission: ['endorsements', 'read'], tab: true },
    { id: 'bills',        href: '/admin/bills',        label: 'Bills',        permission: ['bills', 'read'] },
    { id: 'scorecard',    href: '/admin/legislators',  label: 'Scorecard',    permission: ['legislators', 'read'] },
  ]},
  { group: 'Money', items: [
    { id: 'fundraising',  href: '/admin/fundraising',  label: 'Fundraising',  permission: ['fundraising', 'read'] },
    { id: 'budget',       href: '/admin/finance/budget', label: 'Budget',     permission: ['finance', 'read'] },
    { id: 'compliance',   href: '/admin/compliance',   label: 'Compliance',   permission: ['finance', 'read'] },
  ]},
  { group: 'System', items: [
    { id: 'users',        href: '/admin/users',        label: 'Users & Access', permission: ['users', 'read'] },
    { id: 'settings',     href: '/admin/settings',     label: 'Settings',       permission: ['settings', 'read'] },
  ]},
];
