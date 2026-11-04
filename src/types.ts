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
  modifiedTime?: string;
  daysSinceModified?: number;
}

export interface ScanProgressEvent {
  scanId: string;
  parentPath: string;
  node: FileNode;
  isDone: boolean;
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

export type BigFileCategory = "disk_image" | "media" | "model" | "archive" | "executable" | "database" | "other";

export interface BigFileInfo {
  name: string;
  path: string;
  size: number;
  category: BigFileCategory | string;
  extension: string;
  modifiedTime: string;
  isReadOnly: boolean;
}

export interface DuplicateFileItem {
  name: string;
  path: string;
  size: number;
  modifiedTime: string;
  isPrimary: boolean;
}

export interface DuplicateGroup {
  groupId: string;
  hash: string;
  sizeEach: number;
  wastedBytes: number;
  files: DuplicateFileItem[];
}

export interface ScanStatusEvent {
  taskType: "big_file" | "dup_scan" | string;
  currentPath: string;
  scannedFiles: number;
  message: string;
  isDone: boolean;
}

export type SocialAppType = "weChat" | "wXWork" | "dingTalk" | "qQ";

export interface SocialAccountInfo {
  accountId: string;
  displayName: string;
  path: string;
  totalBytes: number;
}

export interface SocialAppInfo {
  appType: SocialAppType;
  name: string;
  isInstalled: boolean;
  dataRoot: string;
  accounts: SocialAccountInfo[];
}

export interface SocialAssetSummary {
  totalBytes: number;
  cacheBytes: number;
  cacheFiles: number;
  videoBytes: number;
  videoFiles: number;
  imageBytes: number;
  imageFiles: number;
  fileBytes: number;
  fileFiles: number;
  protectedDbBytes: number;
  protectedDbFiles: number;
  cachePaths: string[];
}

export interface MediaArchiveItem {
  path: string;
  name: string;
  size: number;
  daysSinceModified: number;
  month: string;
}

export interface ArchiveResult {
  movedCount: number;
  freedBytes: number;
  failedCount: number;
  errors: string[];
}

export interface SocialDuplicateGroup {
  groupId: string;
  hash: string;
  name: string;
  sizeEach: number;
  wastedBytes: number;
  files: string[];
}

export interface SocialFolderDetail {
  path: string;
  folderName: string;
  size: number;
  fileCount: number;
  purposeTitle: string;
  purposeDesc: string;
  riskLevel: "safe" | "caution" | "protected" | string;
  actionRecommendation: string;
}
