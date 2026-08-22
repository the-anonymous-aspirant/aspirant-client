import { createRouter, createWebHistory } from 'vue-router';
import AboutView from '../views/AboutView.vue';
import HomeView from '../views/HomeView.vue';
import MessageBoardView from '../views/member/shared/MessageBoardView.vue';
import ApplicationsView from '../views/applications/Applications.vue';
import QuizHubView from '../views/applications/QuizHub.vue';
import GameHubView from '../views/applications/GameHub.vue';
import GameRBGuesserView from '../views/applications/GameRBGuesser.vue';
import GameSql from '../views/applications/GameSql.vue';
import AdminView from '../views/admin/AdminView.vue';
import MemberView from '../views/MemberView.vue';
import LuddeAnalytics from '../views/member/personal/LuddeAnalytics.vue';
import GameWordWeaverView from '../views/applications/GameWordWeaver.vue';
import EmotionalExcellenceView from '../views/applications/EmotionalExcellence.vue';
import GameFlappyDuoView from '../views/applications/GameFlappyDuo.vue';
import GameTimelineTechView from '../views/applications/GameTimelineTech.vue';
import GameTimelinePeopleView from '../views/applications/GameTimelinePeople.vue';
import GameTimelineConflictsView from '../views/applications/GameTimelineConflicts.vue';
import TransparencyMapperView from '../views/applications/TransparencyMapper.vue';
import RemarkablePdfsView from '../views/member/shared/RemarkablePdfs.vue';
import UserAdmin from '../views/admin/UserAdmin.vue';
import Assets from '../views/admin/Assets.vue';
import VoiceCommander from '../views/admin/VoiceCommander.vue';
import SystemHealth from '../views/admin/SystemHealth.vue';
import Finance from '../views/admin/Finance.vue';
import EasterHuntView from '../views/applications/EasterHuntView.vue';
import QrGeneratorView from '../views/applications/QrGenerator.vue';
import FilesManagerView from '../views/member/shared/FilesManager.vue';
import SupportView from '../views/SupportView.vue';
import ProfileView from '../views/ProfileView.vue';
import ThirtyYearGiftView from '../views/member/personal/ThirtyYearGift.vue';
import Translator from '../views/member/shared/Translator.vue';
import Wikipedia from '../views/member/shared/Wikipedia.vue';
import Goals from '../views/member/shared/Goals.vue';
import GoalTreeCanvas from '../views/member/shared/GoalTreeCanvas.vue';
import ValuationStatement from '../views/member/personal/ValuationStatement.vue';
import PappasPushups from '../views/member/personal/PappasPushups.vue';
import JobsView from '../views/member/personal/JobsView.vue';
import Scratchpad from '../views/member/shared/Scratchpad.vue';
import Advisor from '../views/admin/Advisor.vue';
import BrowserFlows from '../views/admin/BrowserFlows.vue';
import FlowDetail from '../views/admin/browser-flows/FlowDetail.vue';
import RunForensic from '../views/admin/browser-flows/RunForensic.vue';
import KvittoMaker from '../views/admin/tools/KvittoMaker.vue';
import LoginView from '../views/LoginView.vue';
import NotFound from '../views/NotFound.vue';

// Member gate: the same role set that guarded the former /trusted/* routes. The
// role IDENTIFIER stays 'Trusted' on purpose — renaming the role is an
// auth-model change (server + session), explicitly out of scope for the #4184
// IA reshuffle. Only the URLs, directory layout and sidebar label move.
const MEMBER_ROLES = { roles: ['Trusted', 'Admin'] };

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', component: LoginView },
  { path: '/admin', component: AdminView, meta: { roles: ['Admin'] } },
  { path: '/admin/users', component: UserAdmin, meta: { roles: ['Admin'] } },
  { path: '/admin/assets', component: Assets, meta: { roles: ['Admin'] } },
  { path: '/admin/voice-commander', component: VoiceCommander, meta: { roles: ['Admin'] } },
  { path: '/admin/system-health', component: SystemHealth, meta: { roles: ['Admin'] } },
  { path: '/admin/finance', component: Finance, meta: { roles: ['Admin'] } },
  { path: '/admin/advisor', component: Advisor, meta: { roles: ['Admin'] } },
  { path: '/admin/browser-flows', component: BrowserFlows, meta: { roles: ['Admin'] } },
  { path: '/admin/browser-flows/:id', component: FlowDetail, meta: { roles: ['Admin'] } },
  { path: '/admin/browser-flows/:id/runs/:run_id', component: RunForensic, meta: { roles: ['Admin'] } },
  { path: '/admin/tools/kvitto', component: KvittoMaker, meta: { roles: ['Admin'] } },

  { path: '/about', component: AboutView },

  { path: '/applications', component: ApplicationsView },
  { path: '/applications/emotional-excellence', component: EmotionalExcellenceView },
  { path: '/applications/transparencymapper', component: TransparencyMapperView },
  { path: '/applications/qr-generator', component: QrGeneratorView },

  // Quiz routes
  { path: '/applications/quizzes', component: QuizHubView },
  { path: '/quizzes', component: QuizHubView },
  { path: '/quizzes/rbguesser', component: GameRBGuesserView },
  { path: '/quizzes/sql', component: GameSql },
  { path: '/quizzes/timeline-tech', component: GameTimelineTechView },
  { path: '/quizzes/timeline-people', component: GameTimelinePeopleView },
  { path: '/quizzes/timeline-conflicts', component: GameTimelineConflictsView },

  // Game routes
  { path: '/applications/games', component: GameHubView },
  { path: '/games', component: GameHubView },
  { path: '/games/wordweaver', component: GameWordWeaverView },
  { path: '/games/flappyduo', component: GameFlappyDuoView },
  { path: '/games/easter-hunt', component: EasterHuntView, meta: { roles: ['Trusted', 'Admin'] } },

  // Member area (#4184): the former /trusted area, renamed and split into a
  // Shared sub-area (logged-in, multi-person / general utilities) and a
  // Personal sub-area (apps built for one specific person). Every entry keeps
  // the member gate.
  { path: '/member', component: MemberView, meta: MEMBER_ROLES },

  // Shared
  { path: '/member/shared/files', component: FilesManagerView, meta: MEMBER_ROLES },
  { path: '/member/shared/message-board', component: MessageBoardView, meta: MEMBER_ROLES },
  { path: '/member/shared/translator', component: Translator, meta: MEMBER_ROLES },
  { path: '/member/shared/wikipedia', component: Wikipedia, meta: MEMBER_ROLES },
  { path: '/member/shared/goals', component: Goals, meta: MEMBER_ROLES },
  { path: '/member/shared/goals/:id', component: GoalTreeCanvas, meta: MEMBER_ROLES },
  { path: '/member/shared/remarkable-pdfs', component: RemarkablePdfsView, meta: MEMBER_ROLES },
  { path: '/member/shared/scratchpad', component: Scratchpad, meta: MEMBER_ROLES },

  // Personal
  { path: '/member/personal/ludde-analytics', component: LuddeAnalytics, meta: MEMBER_ROLES },
  { path: '/member/personal/30-year-gift', component: ThirtyYearGiftView, meta: MEMBER_ROLES },
  { path: '/member/personal/valuation-statement', component: ValuationStatement, meta: MEMBER_ROLES },
  { path: '/member/personal/pappas-pushups', component: PappasPushups, meta: MEMBER_ROLES },
  { path: '/member/personal/jobs', component: JobsView, meta: MEMBER_ROLES },

  // Redirects for the old /trusted/* bookmarks (and remarkable-pdfs, which moved
  // out of /applications). One per moved route so existing links keep working;
  // the goals/:id redirect carries the param through.
  { path: '/trusted', redirect: '/member' },
  { path: '/trusted/ludde-analytics', redirect: '/member/personal/ludde-analytics' },
  { path: '/trusted/files', redirect: '/member/shared/files' },
  { path: '/trusted/message-board', redirect: '/member/shared/message-board' },
  { path: '/trusted/30-year-gift', redirect: '/member/personal/30-year-gift' },
  { path: '/trusted/translator', redirect: '/member/shared/translator' },
  { path: '/trusted/wikipedia', redirect: '/member/shared/wikipedia' },
  { path: '/trusted/goals', redirect: '/member/shared/goals' },
  { path: '/trusted/goals/:id', redirect: (to) => `/member/shared/goals/${to.params.id}` },
  { path: '/trusted/valuation-statement', redirect: '/member/personal/valuation-statement' },
  { path: '/trusted/pappas-pushups', redirect: '/member/personal/pappas-pushups' },
  { path: '/trusted/jobs', redirect: '/member/personal/jobs' },
  { path: '/trusted/scratchpad', redirect: '/member/shared/scratchpad' },
  { path: '/applications/remarkable-pdfs', redirect: '/member/shared/remarkable-pdfs' },

  { path: '/support', component: SupportView },

  // Own profile — any authenticated user (the three real roles). An anonymous
  // visitor has no cached user_role and is bounced to '/' by the guard below;
  // the server enforces the real boundary on /api/profile regardless.
  { path: '/profile', component: ProfileView, meta: { roles: ['User', 'Trusted', 'Admin'] } },

  // Catch-all for unknown paths. Kept public (no role meta) so anonymous
  // visitors see a graceful 404 instead of being silently redirected to /.
  // The nginx layer 301s known renames before they reach Vue (see
  // default.conf); this is the safety net for typos and unmapped paths.
  { path: '/:pathMatch(.*)*', component: NotFound },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const requiredRoles = to.meta.roles;
  if (!requiredRoles) return true;

  // Cached display state, not a credential: the session is an HttpOnly
  // cookie this script cannot read (system_3 #2564). This guard only keeps
  // the UI honest — it is trivially bypassed from devtools and always was,
  // so every gated route stays enforced server-side by the /api/ auth
  // middleware and, for the embedded surfaces, the nginx auth_request gate.
  const role = localStorage.getItem('user_role');

  if (!role || !requiredRoles.includes(role)) {
    return '/';
  }
  return true;
});

export default router;
