export type StatusLevel = 'operational' | 'degraded' | 'experimental' | 'maintenance';

export interface Destination {
  id: string;
  name: string;
  url: string;
  domain: string;
  category: 'core' | 'storage' | 'media' | 'comms' | 'ai' | 'developer' | 'sound';
  description: string;
  badge?: string;
  status: StatusLevel;
  latencyMs?: number;
  highlight?: boolean;
}

export type EdgeColo = 'NRT' | 'KIX' | 'SIN' | 'SJC' | 'FRA' | 'LHR';

export interface LatencyProbe {
  code: EdgeColo;
  city: string;
  country: string;
  flag: string;
  latency: number;
  jitter: number;
  status: 'optimal' | 'good' | 'fair' | 'rerouting';
  history: number[];
  p50: number;
  p99: number;
}

export interface SystemMetrics {
  uptime: string;
  requests24h: number;
  r2Bandwidth: string;
  activeNodes: number;
  edgeCacheRatio: number;
  globalCpuLoad: number;
  tlsVersion: string;
  httpVersion: string;
}

export interface TerminalCommand {
  command: string;
  description: string;
  output: string | string[];
  category: 'navigation' | 'diagnostic' | 'system' | 'easter-egg';
  action?: () => void;
}

export interface BlogPostPreview {
  slug: string;
  title: string;
  snippet: string;
  tags: string[];
  readTimeMin: number;
  publishDate: string;
  views: number;
  url: string;
}

export type AgentToolName = 'eval_expression' | 'web_search' | 'blog_search' | 'get_time' | 'r2_lookup';

export interface AgentToolSimulation {
  id: AgentToolName;
  label: string;
  description: string;
  inputExample: string;
  outputPreview: string;
  executionMs: number;
  tokensUsed: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export interface AgentLogStreamItem {
  id: string;
  timestamp: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'chunk' | 'complete';
  tool?: AgentToolName;
  content: string;
}

export interface ShareFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadProgress: number;
  speedMBs: number;
  expiration: '1h' | '24h' | '7d' | '30d' | 'never';
  shareUrl?: string;
  isCompleted?: boolean;
}

export interface VideoResolutionConfig {
  resolution: '1080p' | '720p' | '480p' | '360p';
  bitrate: string;
  fps: number;
  codec: 'av01' | 'vp9' | 'h264';
  approxSizeMb: number;
}

export interface ModelHubItem {
  id: string;
  name: string;
  repo: string;
  paramSize: '31B' | '9B' | '2B';
  type: 'Base' | 'Instruct' | 'LoRA' | 'GGUF';
  downloads: number;
  likes: number;
  contextLength: string;
  quantization: string;
  url: string;
}

export interface GitLanguage {
  name: string;
  percentage: number;
  color: string;
  files: number;
}

export interface GitRepoStats {
  repo: string;
  owner: string;
  branch: string;
  commitHash: string;
  commitMessage: string;
  languages: GitLanguage[];
  totalStars: number;
  totalForks: number;
  openIssues: number;
  lastCommitTime: string;
  url: string;
}

export interface MailPingMessage {
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  pgpVerified: boolean;
  dkimStatus: 'pass' | 'fail';
  spamScore: number;
  timestamp: number;
}

export interface SynthPadNote {
  id: string;
  padIndex: number;
  label: string;
  sublabel: string;
  key: string;
  frequency: number;
  color: string;
  type: 'kick' | 'snare' | 'hihat' | 'blip' | 'synthA' | 'synthB';
}
