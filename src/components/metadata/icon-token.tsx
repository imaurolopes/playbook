import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  Compass,
  Copy,
  Database,
  FileBox,
  FlaskConical,
  FolderOutput,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Layers,
  Library,
  LibraryBig,
  Lightbulb,
  ListChecks,
  LucideIcon,
  MessagesSquare,
  PanelTop,
  PanelsTopLeft,
  Plug,
  Rows3,
  Scale,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Workflow
} from "lucide-react";

const iconTokens: Record<string, LucideIcon> = {
  activity: Activity,
  "arrow-up-right": ArrowUpRight,
  "badge-check": BadgeCheck,
  "book-open": BookOpen,
  bot: Bot,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "circle-dollar-sign": CircleDollarSign,
  "clipboard-check": ClipboardCheck,
  compass: Compass,
  copy: Copy,
  database: Database,
  "file-box": FileBox,
  "flask-conical": FlaskConical,
  "folder-output": FolderOutput,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  house: House,
  landmark: Landmark,
  layers: Layers,
  library: Library,
  "library-big": LibraryBig,
  lightbulb: Lightbulb,
  "list-checks": ListChecks,
  "messages-square": MessagesSquare,
  "panel-top": PanelTop,
  "panels-top-left": PanelsTopLeft,
  plug: Plug,
  "rows-3": Rows3,
  scale: Scale,
  "scan-search": ScanSearch,
  search: Search,
  "shield-check": ShieldCheck,
  "table-properties": TableProperties,
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
