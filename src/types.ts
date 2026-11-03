export interface DriveInfo {
  letter: string;
  root: string;
  label: string;
  kind: string;
  total: number;
  free: number;
}

export type RiskLevel = "safe" | "caution" | "danger";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  fileCount: number;
  isLink: boolean;
  linkTarget?: string;
  purpose?: string;
  risk?: RiskLevel;
  riskNote?: string;
  cleanable: boolean;
  migratable: boolean;
  isHeuristic: boolean;
  hasChildren: boolean;
}

export interface CleanItemSummary {
  path: string;
  name: string;
  category: string;
  bytes: number;
  fileCount: number;
  risk: RiskLevel;
  riskNote: string;
  processes: string[];
}

export interface CleanResult {
  success: boolean;
  freedBytes: number;
  deletedFiles: number;
  skippedFiles: number;
  errors: string[];
}

export interface CleanProgress {
  currentIndex: number;
  totalItems: number;
  currentPath: string;
  currentName: string;
  freedBytes: number;
  deletedFiles: number;
  skippedFiles: number;
  percent: number;
  message: string;
}

export interface ProcInfo {
  pid: number;
  name: string;
  source: string;
}

export interface MigrateCandidate {
  ruleId: string;
  name: string;
  category: string;
  path: string;
  bytes: number;
  fileCount: number;
  purpose: string;
  migrateNote: string;
  isLinked: boolean;
  linkTarget?: string;
  processes: string[];
}

export interface MigratePrecheck {
  canMigrate: boolean;
  sourcePath: string;
  targetPath: string;
  sourceBytes: number;
  sourceFiles: number;
  targetDriveFree: number;
  blockingProcesses: ProcInfo[];
  warnings: string[];
}

export interface MigrateProgress {
  phase: string;
  currentBytes: number;
  totalBytes: number;
  currentFile: string;
  percent: number;
  message: string;
}

export interface LinkDetail {
  id: string;
  sourcePath: string;
  targetPath: string;
  linkType: string;
  createdAt: string;
  exists: boolean;
  targetExists: boolean;
  isBroken: boolean;
  isManaged: boolean;
}

export interface AppSettings {
  defaultVaultDir: string;
  autoUac: boolean;
  cleanToRecycleBin: boolean;
  excludePatterns: string[];
}

export interface Rule {
  id: string;
  name: string;
  category: string;
  paths: string[];
  purpose: string;
  risk: RiskLevel;
  riskNote: string;
  cleanable: boolean;
  migratable: boolean;
  processes: string[];
}

