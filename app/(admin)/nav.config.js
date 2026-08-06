// Single source of truth for admin navigation.
// permission = [module, action] checked against the caller's role grants.
export const NAV = [
  { group: 'Overview', items: [
    { id: 'dashboard',    href: '/admin/dashboard',    label: 'Dashboard',    permission: ['dashboard', 'read'] },
    { id: 'tasks',        href: '/admin/tasks',        label: 'Tasks',        permission: ['tasks', 'read'] },
  ]},
  // People: one person record, surfaced through the lens each team works in.
  // Everything here except Users links back to the same contacts row.
  { group: 'People', items: [
    { id: 'contacts',     href: '/admin/contacts',     label: 'Contacts',     permission: ['contacts', 'read'] },
    { id: 'members',      href: '/admin/members',      label: 'Members',      permission: ['donors', 'read'] },
    { id: 'prospects',    href: '/admin/prospects',    label: 'Prospects',    permission: ['pac_prospects', 'read'] },
    { id: 'volunteers',   href: '/admin/volunteers',   label: 'Volunteers',   permission: ['volunteers', 'read'] },
    { id: 'networking',   href: '/admin/networking',   label: 'Networking',   permission: ['networking', 'read'] },
    { id: 'internships',  href: '/admin/internships',  label: 'Internships',  permission: ['internships', 'read'] },
  ]},
  { group: 'Program', items: [
    { id: 'endorsements', href: '/admin/endorsements', label: 'Endorsements', permission: ['endorsements', 'read'] },
    { id: 'bills',        href: '/admin/bills',        label: 'Bills',        permission: ['bills', 'read'] },
    { id: 'legislators',  href: '/admin/legislators',  label: 'Scorecard',    permission: ['legislators', 'read'] },
    { id: 'pride',        href: '/admin/pride',        label: 'Pride Events', permission: ['pride', 'read'] },
  ]},
  { group: 'Comms', items: [
    { id: 'texting',      href: '/admin/texting',      label: 'Text Blast',   permission: ['texting', 'read'] },
  ]},
  { group: 'Money', items: [
    { id: 'fundraising',  href: '/admin/fundraising',    label: 'Fundraising', permission: ['fundraising', 'read'] },
    { id: 'budget',       href: '/admin/finance/budget', label: 'Budget',      permission: ['finance', 'read'] },
    { id: 'compliance',   href: '/admin/compliance',     label: 'Compliance',  permission: ['finance', 'read'] },
  ]},
  { group: 'System', items: [
    { id: 'users',        href: '/admin/users',        label: 'Users & Access', permission: ['users', 'read'] },
    { id: 'settings',     href: '/admin/settings',     label: 'Settings',       permission: ['settings', 'read'] },
  ]},
];
