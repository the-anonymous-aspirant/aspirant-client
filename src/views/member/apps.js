// The Member area's app roster (#4184) — the ONE definition of the
// shared/personal split, consumed by both the Member index page
// (views/MemberView.vue) and the sidebar (components/sidebar/Sidebar.vue) so the
// two cannot drift. The operator ratified this classification verbatim on #3617;
// a hardcoded list is the sanctioned shape here (a per-app `scope` metadata
// field was explicitly ruled out of scope for ~12 apps).
//
// `route` is the path suffix under `/member/<section>/`; `icon` is an
// asset-manager key; `person` (personal apps only) is the intended user the
// index and sidebar surface next to the app.

export const SHARED_APPS = [
  { title: 'Files', description: 'Upload, download, and share files.', route: 'files', icon: 'home_icon' },
  { title: 'Message Board', description: 'Leave messages for the crew.', route: 'message-board', icon: 'message_board_icon' },
  { title: 'Translator', description: 'Translate text between languages', route: 'translator', icon: 'home_icon' },
  { title: 'Wikipedia', description: 'Browse the English Wikipedia offline', route: 'wikipedia', icon: 'home_icon' },
  { title: 'Goal Trees', description: 'Plan and track your goals', route: 'goals', icon: 'home_icon' },
  { title: 'Remarkable PDFs', description: 'Generate PDFs for your Remarkable tablet', route: 'remarkable-pdfs', icon: 'home_icon' },
  { title: 'Scratchpad', description: 'A personal note that syncs live across your devices', route: 'scratchpad', icon: 'home_icon' },
];

export const PERSONAL_APPS = [
  { title: 'Ludde Meal Tracker', description: "Track Ludde's meals. Bonus analytics included.", route: 'ludde-analytics', icon: 'ludde_meal_tracker_icon', person: 'sister (Ludde)' },
  { title: 'Den Stökiga Väggen', description: 'Om bara någon kunde bringa ordning i kaoset...', route: '30-year-gift', icon: '30year_gift_icon', person: 'sister Jenny' },
  { title: 'Värdeutlåtande', description: 'Fyll i värdeutlåtanden från PDF-underlag', route: 'valuation-statement', icon: 'home_icon', person: 'sister (värdering)' },
  { title: 'Pappas pushups', description: '60 dagars utmaning — 1000 armhävningar', route: 'pappas-pushups', icon: 'home_icon', person: 'father' },
  { title: 'Jobs', description: 'Berlin part-time English-job feed across scraped boards', route: 'jobs', icon: 'home_icon', person: 'Viktor' },
];
