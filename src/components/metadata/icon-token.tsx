import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  CircleHelp,
  ClipboardCheck,
  Compass,
  Copy,
  CornerLeftUp,
  CornerRightDown,
  Database,
  Download,
  FileBox,
  FlaskConical,
  FolderOutput,
  GitBranch,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Layers,
  Library,
  LibraryBig,
  Lightbulb,
  Link as LinkIcon,
  ListChecks,
  LucideIcon,
  MessagesSquare,
  PanelTop,
  PanelsTopLeft,
  Plug,
  Replace,
  Rows3,
  Scale,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TableProperties,
  TriangleAlert,
  Upload,
  Zap,
  Workflow
} from "lucide-react";

const iconTokens: Record<string, LucideIcon> = {
  activity: Activity,
  "arrow-up-right": ArrowUpRight,
  "badge-check": BadgeCheck,
  blocks: Blocks,
  "book-open": BookOpen,
  bot: Bot,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "circle-dollar-sign": CircleDollarSign,
  "circle-help": CircleHelp,
  "clipboard-check": ClipboardCheck,
  compass: Compass,
  copy: Copy,
  "corner-left-up": CornerLeftUp,
  "corner-right-down": CornerRightDown,
  database: Database,
  download: Download,
  "file-box": FileBox,
  "flask-conical": FlaskConical,
  "folder-output": FolderOutput,
  "git-branch": GitBranch,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  house: House,
  landmark: Landmark,
  layers: Layers,
  library: Library,
  "library-big": LibraryBig,
  lightbulb: Lightbulb,
  link: LinkIcon,
  "list-checks": ListChecks,
  "messages-square": MessagesSquare,
  "panel-top": PanelTop,
  "panels-top-left": PanelsTopLeft,
  plug: Plug,
  replace: Replace,
  "rows-3": Rows3,
  scale: Scale,
  "scan-search": ScanSearch,
  search: Search,
  "shield-check": ShieldCheck,
  "table-properties": TableProperties,
  "triangle-alert": TriangleAlert,
  upload: Upload,
  zap: Zap,
  workflow: Workflow
};

export function IconToken({
  token,
  className
}: {
  token?: string;
  className?: string;
}) {
  const Icon = token ? iconTokens[token] : undefined;

  return Icon ? (
    <Icon className={className} aria-hidden="true" />
  ) : (
    <Sparkles className={className} aria-hidden="true" />
  );
}
