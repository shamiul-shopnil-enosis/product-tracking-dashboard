import type { IconType } from 'react-icons';
import {
  MdOutlineDashboard, MdOutlineTrendingUp, MdOutlineArticle, MdOutlineBolt, MdOutlineFlag, MdOutlineHelpOutline,
  MdOutlineStorage, MdOutlinePeople, MdOutlineLightMode, MdOutlineDarkMode, MdOutlineLogout, MdOutlinePersonOutline,
  MdOutlineSchedule, MdOutlineVisibility, MdOutlineTouchApp, MdOutlineSwipeVertical, MdOutlineTimer, MdOutlineExitToApp,
  MdOutlineStarBorder, MdOutlineSentimentVeryDissatisfied, MdOutlineAdsClick, MdOutlineWarningAmber, MdOutlineUndo,
  MdOutlineSensors, MdOutlineAdd, MdOutlineBarChart, MdOutlineSearch, MdOutlinePublic,
  MdOutlineSpeed, MdOutlineManageAccounts, MdOutlineVisibilityOff, MdOutlineContentCopy, MdOutlineLink, MdOutlineCheck,
  MdOutlineCalendarToday, MdOutlineChevronLeft, MdOutlineChevronRight, MdOutlineExpandMore, MdOutlineClose, MdOutlineFileDownload, MdOutlineOpenInNew
} from 'react-icons/md';

// Google Material Design icons (outlined set) via react-icons. Colour comes from currentColor.
const ICONS = {
  overview: MdOutlineDashboard,
  traffic: MdOutlineTrendingUp,
  pages: MdOutlineArticle,
  friction: MdOutlineBolt,
  findings: MdOutlineFlag,
  help: MdOutlineHelpOutline,
  database: MdOutlineStorage,
  users: MdOutlinePeople,
  sun: MdOutlineLightMode,
  moon: MdOutlineDarkMode,
  logout: MdOutlineLogout,
  visitors: MdOutlinePersonOutline,
  sessions: MdOutlineSchedule,
  views: MdOutlineVisibility,
  click: MdOutlineTouchApp,
  scroll: MdOutlineSwipeVertical,
  time: MdOutlineTimer,
  bounce: MdOutlineExitToApp,
  event: MdOutlineStarBorder,
  rage: MdOutlineSentimentVeryDissatisfied,
  dead: MdOutlineAdsClick,
  error: MdOutlineWarningAmber,
  quickback: MdOutlineUndo,
  live: MdOutlineSensors,
  plus: MdOutlineAdd,
  seo: MdOutlineSearch,
  audience: MdOutlinePublic,
  speed: MdOutlineSpeed,
  account: MdOutlineManageAccounts,
  eye: MdOutlineVisibility,
  eyeOff: MdOutlineVisibilityOff,
  copy: MdOutlineContentCopy,
  link: MdOutlineLink,
  check: MdOutlineCheck,
  calendar: MdOutlineCalendarToday,
  chevronLeft: MdOutlineChevronLeft,
  chevronRight: MdOutlineChevronRight,
  chevronDown: MdOutlineExpandMore,
  close: MdOutlineClose,
  download: MdOutlineFileDownload,
  external: MdOutlineOpenInNew,
  generic: MdOutlineBarChart,
} satisfies Record<string, IconType>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph: IconType = ICONS[name] ?? ICONS.generic;
  return <Glyph className={`icon${className ? ` ${className}` : ''}`} size={size} aria-hidden="true" focusable="false" />;
}

/** Pick a metric icon and accent from its key and label; unknown metrics get a neutral chart icon. */
export function metricStyle(key: string, label: string): { icon: IconName; accent: string } {
  const s = `${key} ${label}`.toLowerCase();
  const rule = (re: RegExp, icon: IconName, accent: string) => (re.test(s) ? { icon, accent } : null);
  return (
    rule(/rage/, 'rage', 'var(--bad)') ||
    rule(/dead/, 'dead', 'var(--s2)') ||
    rule(/quick.?back/, 'quickback', 'var(--s2)') ||
    rule(/error|exception|crash/, 'error', 'var(--bad)') ||
    rule(/bounce/, 'bounce', 'var(--s4)') ||
    rule(/scroll/, 'scroll', 'var(--s3)') ||
    rule(/time|duration|engag/, 'time', 'var(--s4)') ||
    rule(/active|live|now|realtime/, 'live', 'var(--good)') ||
    rule(/key.?event|conversion|event|goal/, 'event', 'var(--s4)') ||
    rule(/user|visitor|people/, 'visitors', 'var(--s1)') ||
    rule(/organic/, 'seo', 'var(--s3)') ||
    rule(/session|visit/, 'sessions', 'var(--s1)') ||
    rule(/page|view|screen/, 'views', 'var(--s3)') ||
    rule(/click/, 'click', 'var(--s2)') ||
    { icon: 'generic' as IconName, accent: 'var(--s1)' }
  );
}
