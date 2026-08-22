import React, { useState, useMemo } from 'react';

export type TopologyFilter = 'ALL' | 'REQUEST_FLOW' | 'SEARCH_RAG' | 'AI_AGENT' | 'STORAGE';

export interface TopologyNode {
  id: string;
  category: 'ingress' | 'compute' | 'storage' | 'ai';
  title: string;
  subtitle: string;
  protocol: string;
  latency: string;
  sla: string;
  x: number;
  y: number;
  width: number;
  height: number;
  iconType: string;
  techSpecs: string[];
  metrics: { label: string; value: string }[];
  bindings?: string[];
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  path: string;
  category: 'ingress' | 'compute' | 'storage' | 'ai';
  animated: boolean;
  label?: string;
  speedSec?: number;
}

export interface TopologyDiagramProps {
  /** Width of the SVG component (default: 100%) */
  width?: string | number;
  /** Height of the SVG component (default: auto) */
  height?: string | number;
  /** Initial filter flow mode */
  initialFilter?: TopologyFilter;
  /** Interactive node selection callback */
  onSelectNode?: (node: TopologyNode | null) => void;
  /** Custom class name */
  className?: string;
  /** Show interactive filter toolbar */
  showToolbar?: boolean;
}

export const TopologyDiagram: React.FC<TopologyDiagramProps> = ({
  width = '100%',
  height = 'auto',
  initialFilter = 'ALL',
  onSelectNode,
  className = '',
  showToolbar = true,
}) => {
  const [activeFilter, setActiveFilter] = useState<TopologyFilter>(initialFilter);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('cf-workers');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Nodes Definition
  const nodes: TopologyNode[] = useMemo(
    () => [
      // 1. INGRESS TIER
      {
        id: 'client-ingress',
        category: 'ingress',
        title: 'Global Anycast DNS',
        subtitle: '300+ Edge PoPs (Tokyo NRT / SJC / FRA)',
        protocol: 'HTTP/3 // QUIC // TLS 1.3',
        latency: '< 15 ms',
        sla: '100% SLA',
        x: 40,
        y: 80,
        width: 175,
        height: 80,
        iconType: 'globe',
        techSpecs: ['Anycast Routing', 'DDoS L3/L4/L7 Shield', 'Brotli/Zstd Compression', 'Smart Shield 0-RTT'],
        metrics: [
          { label: 'Ingress PoPs', value: '330+ Cities' },
          { label: 'Edge Latency', value: '8.4 ms avg' },
          { label: 'Security', value: 'Strict SSL / WAF' },
        ],
      },
      {
        id: 'cf-cdn',
        category: 'ingress',
        title: 'Cloudflare Edge CDN',
        subtitle: 'Tiered Cache & Static Assets',
        protocol: 'Cache-Control: s-maxage',
        latency: '< 2 ms',
        sla: '99.99%',
        x: 40,
        y: 230,
        width: 175,
        height: 80,
        iconType: 'shield',
        techSpecs: ['Tiered Cache Mesh', 'Zero-Egress Routing', 'Early Hints (103)', 'HTTP/3 Multiplexing'],
        metrics: [
          { label: 'Hit Ratio', value: '96.8%' },
          { label: 'Bandwidth', value: '0 Egress Cost' },
          { label: 'Purge Time', value: '< 150 ms' },
        ],
      },
      {
        id: 'oracle-vps',
        category: 'ingress',
        title: 'Oracle Cloud VPS',
        subtitle: 'Static Fixed IP & Egress Gateway',
        protocol: 'Fixed IPv4 // WireGuard Mesh',
        latency: '< 8 ms',
        sla: '99.95%',
        x: 40,
        y: 350,
        width: 175,
        height: 75,
        iconType: 'shield',
        techSpecs: ['Dedicated Fixed Egress IPv4', 'Secure WireGuard Proxy Tunnel', 'Zero-Cost Free Tier Cloud', 'Static IP Whitelisting'],
        metrics: [
          { label: 'Egress IP', value: 'Dedicated Static' },
          { label: 'Tunnel', value: 'WireGuard / TLS' },
        ],
      },

      // 2. COMPUTE TIER (Workers V8 Isolates + GitHub Runner)
      {
        id: 'cf-workers',
        category: 'compute',
        title: 'CF Workers V8 Engine',
        subtitle: 'Isolate Cluster (0ms Cold Start)',
        protocol: 'V8 Isolate / WASM / OpenNext',
        latency: '< 1 ms Boot',
        sla: '99.999%',
        x: 275,
        y: 140,
        width: 205,
        height: 115,
        iconType: 'cpu',
        techSpecs: ['100% Serverless Edge', 'No Cold Start Latency', 'Multi-Worker Monorepo', 'TypeScript 5.7 Strict'],
        metrics: [
          { label: 'Cold Start', value: '0.00 ms' },
          { label: 'Compute Isolates', value: '4 Active' },
          { label: 'Execution RAM', value: '128 MB' },
        ],
        bindings: ['DB (D1)', 'VECTORIZE', 'KV_CACHE', 'R2_BUCKET', 'AI_ENGINE'],
      },
      {
        id: 'worker-cron',
        category: 'compute',
        title: 'Cache & Sync Cron',
        subtitle: '3-Min Heartbeat & Audit Logger',
        protocol: 'CRON_TRIGGER: */3 * * * *',
        latency: 'Background',
        sla: '99.99%',
        x: 275,
        y: 280,
        width: 205,
        height: 75,
        iconType: 'clock',
        techSpecs: ['Dirty Queue Worker', 'HN Top-30 Ingest', 'GitHub Metrics Sync', '30-Day Auto Audit Prune'],
        metrics: [
          { label: 'Tick Interval', value: '3 min & 30 min' },
          { label: 'Quota Guard', value: 'Max 5 Chunks/Item' },
          { label: 'Audit Trail', value: 'D1 audit_log' },
        ],
      },
      {
        id: 'github-runner',
        category: 'compute',
        title: 'GitHub Actions Runner',
        subtitle: 'CI/CD Matrix & Heavy Compute',
        protocol: 'GitHub Actions // Ubuntu-Latest',
        latency: 'On-Demand',
        sla: '99.9%',
        x: 275,
        y: 380,
        width: 205,
        height: 75,
        iconType: 'cpu',
        techSpecs: ['Parallel Multi-Worker CI Matrix', 'Automated Vector Indexing', 'D1 Schema Migration', 'Static Asset Pipelines'],
        metrics: [
          { label: 'Compute Unit', value: '2-Core / 7GB' },
          { label: 'Trigger', value: 'Git Push / Cron' },
        ],
      },

      // 3. STORAGE & STATE TIER
      {
        id: 'cf-d1',
        category: 'storage',
        title: 'Cloudflare D1 (SQL)',
        subtitle: 'Distributed SQLite @ Edge',
        protocol: 'SQL // SQLite 3 Dialect',
        latency: '< 4 ms',
        sla: '99.99%',
        x: 545,
        y: 40,
        width: 185,
        height: 75,
        iconType: 'database',
        techSpecs: ['Read-Replication Mesh', 'Time Travel Backup', 'Prepared Statements', 'ACID Transactions'],
        metrics: [
          { label: 'Tables', value: 'posts, news, repos, audit' },
          { label: 'Replication', value: 'Global Read Edge' },
          { label: 'Write Consistency', value: 'Strong' },
        ],
        bindings: ['env.DB'],
      },
      {
        id: 'cf-vectorize',
        category: 'storage',
        title: 'Cloudflare Vectorize',
        subtitle: '768-Dim Vector Search Index',
        protocol: 'HNSW // Cosine Distance',
        latency: '< 18 ms',
        sla: '99.95%',
        x: 545,
        y: 145,
        width: 185,
        height: 75,
        iconType: 'vector',
        techSpecs: ['Index: blog-search', '768 Dimensions (Gemini)', 'Top-K: 15 with Metadata', 'Sub-20ms Search'],
        metrics: [
          { label: 'Index Dims', value: '768 Float32' },
          { label: 'Metric', value: 'Cosine Distance' },
          { label: 'Recall Rate', value: '99.4%' },
        ],
        bindings: ['env.VECTORIZE'],
      },
      {
        id: 'cf-kv',
        category: 'storage',
        title: 'Cloudflare KV Cache',
        subtitle: 'Global Low-Latency Key-Value',
        protocol: 'Sub-ms Read Cache',
        latency: '< 1 ms',
        sla: '99.99%',
        x: 545,
        y: 250,
        width: 185,
        height: 70,
        iconType: 'keyvalue',
        techSpecs: ['Global Fast Read Tier', 'Edge Session Store', 'Rate Limit Registry', 'TTL Invalidation'],
        metrics: [
          { label: 'Read Latency', value: 'Sub-millisecond' },
          { label: 'Replication', value: 'Tier 1 Global' },
        ],
        bindings: ['env.KV_STORE'],
      },
      {
        id: 'cf-r2',
        category: 'storage',
        title: 'Cloudflare R2 Storage',
        subtitle: 'S3-Compatible Zero-Egress Vault',
        protocol: 'S3 API // Zero Egress Fee',
        latency: '< 12 ms',
        sla: '99.999%',
        x: 545,
        y: 350,
        width: 185,
        height: 70,
        iconType: 'box',
        techSpecs: ['Static Media Artifacts', 'Zero Egress Multi-Cloud', 'Direct Worker Streaming', 'Custom CDN Domain'],
        metrics: [
          { label: 'Egress Fee', value: '$0.00 / GB' },
          { label: 'Durability', value: '99.999999999%' },
        ],
        bindings: ['env.R2_BUCKET'],
      },

      // 4. AI & INFERENCE TIER
      {
        id: 'ai-embedding',
        category: 'ai',
        title: 'Gemini Embedding 2',
        subtitle: 'Text-Embedding Pipeline (768-D)',
        protocol: 'task: search result | query: {q}',
        latency: '~ 45 ms',
        sla: '99.9%',
        x: 790,
        y: 110,
        width: 180,
        height: 80,
        iconType: 'sparkles',
        techSpecs: ['Document & Query Tasks', '768 Dimensions', '1000 Requests/Day Free', 'Audit-Tracked Quota'],
        metrics: [
          { label: 'Token Window', value: '2048 Tokens' },
          { label: 'Batch Sizing', value: 'Max 5 Chunks' },
        ],
      },
      {
        id: 'ai-llm',
        category: 'ai',
        title: 'Gemini / Gemma-4',
        subtitle: 'Autonomous Reasoning & Tools',
        protocol: 'Streaming SSE / Tool Calling',
        latency: '~ 80 ms TTFT',
        sla: '99.9%',
        x: 790,
        y: 250,
        width: 180,
        height: 100,
        iconType: 'bot',
        techSpecs: ['Function / Tool Calling', 'Streaming Tokens (SSE)', 'Agentic Search & Synth', 'Multi-Turn Memory'],
        metrics: [
          { label: 'Reasoning Mode', value: 'Autonomous Agent' },
          { label: 'Context Engine', value: 'Hybrid RAG + D1' },
          { label: 'Stream Latency', value: 'Sub-100ms TTFT' },
        ],
      },
    ],
    []
  );

  // Link Connections
  const links: TopologyLink[] = useMemo(
    () => [
      // Ingress -> Compute
      {
        id: 'link-dns-workers',
        source: 'client-ingress',
        target: 'cf-workers',
        path: 'M 215 120 C 240 120, 245 180, 275 180',
        category: 'ingress',
        animated: true,
        label: 'HTTP/3 (0-RTT)',
        speedSec: 2.2,
      },
      {
        id: 'link-cdn-workers',
        source: 'cf-cdn',
        target: 'cf-workers',
        path: 'M 215 270 C 245 270, 245 210, 275 210',
        category: 'ingress',
        animated: true,
        label: 'Edge Cache Miss',
        speedSec: 2.6,
      },
      {
        id: 'link-oracle-workers',
        source: 'oracle-vps',
        target: 'cf-workers',
        path: 'M 215 385 C 245 385, 245 235, 275 235',
        category: 'ingress',
        animated: true,
        label: 'Fixed IP Proxy Tunnel',
        speedSec: 2.5,
      },

      // Cron / GitHub Runner -> State
      {
        id: 'link-cron-d1',
        source: 'worker-cron',
        target: 'cf-d1',
        path: 'M 480 315 C 510 315, 510 80, 545 80',
        category: 'compute',
        animated: true,
        label: 'Sync Batch',
        speedSec: 3.5,
      },
      {
        id: 'link-cron-vectorize',
        source: 'worker-cron',
        target: 'cf-vectorize',
        path: 'M 480 325 C 510 325, 510 185, 545 185',
        category: 'compute',
        animated: true,
        label: 'Dirty Item Index',
        speedSec: 3.2,
      },
      {
        id: 'link-github-d1',
        source: 'github-runner',
        target: 'cf-d1',
        path: 'M 480 415 C 520 415, 520 90, 545 90',
        category: 'compute',
        animated: true,
        label: 'CI Batch Sync',
        speedSec: 3.0,
      },

      // Workers -> Storage
      {
        id: 'link-workers-d1',
        source: 'cf-workers',
        target: 'cf-d1',
        path: 'M 480 170 C 510 170, 510 70, 545 70',
        category: 'storage',
        animated: true,
        label: 'D1 SQL Query',
        speedSec: 2.0,
      },
      {
        id: 'link-workers-vectorize',
        source: 'cf-workers',
        target: 'cf-vectorize',
        path: 'M 480 190 C 510 190, 515 180, 545 180',
        category: 'storage',
        animated: true,
        label: 'Vector Top-K Query',
        speedSec: 2.4,
      },
      {
        id: 'link-workers-kv',
        source: 'cf-workers',
        target: 'cf-kv',
        path: 'M 480 215 C 510 215, 510 280, 545 280',
        category: 'storage',
        animated: true,
        label: 'KV Get / Put',
        speedSec: 2.1,
      },
      {
        id: 'link-workers-r2',
        source: 'cf-workers',
        target: 'cf-r2',
        path: 'M 480 235 C 510 235, 510 380, 545 380',
        category: 'storage',
        animated: true,
        label: 'R2 Blob Read',
        speedSec: 2.8,
      },

      // Storage / Compute -> AI
      {
        id: 'link-vec-embed',
        source: 'cf-vectorize',
        target: 'ai-embedding',
        path: 'M 730 170 C 755 170, 760 145, 790 145',
        category: 'ai',
        animated: true,
        label: '768-D Vectors',
        speedSec: 2.3,
      },
      {
        id: 'link-workers-llm',
        source: 'cf-workers',
        target: 'ai-llm',
        path: 'M 480 250 C 600 250, 680 290, 790 290',
        category: 'ai',
        animated: true,
        label: 'Streaming Agent LLM',
        speedSec: 1.8,
      },
      {
        id: 'link-d1-llm',
        source: 'cf-d1',
        target: 'ai-llm',
        path: 'M 730 80 C 760 80, 760 260, 790 260',
        category: 'ai',
        animated: false,
        label: 'Context Feed',
        speedSec: 3.0,
      },
    ],
    []
  );

  // Filter Active Nodes & Links
  const isNodeActive = (node: TopologyNode) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'REQUEST_FLOW') {
      return ['client-ingress', 'cf-cdn', 'cf-workers', 'cf-d1', 'cf-kv'].includes(node.id);
    }
    if (activeFilter === 'SEARCH_RAG') {
      return ['worker-cron', 'cf-d1', 'cf-vectorize', 'ai-embedding', 'cf-workers'].includes(node.id);
    }
    if (activeFilter === 'AI_AGENT') {
      return ['client-ingress', 'cf-workers', 'cf-vectorize', 'ai-embedding', 'ai-llm'].includes(node.id);
    }
    if (activeFilter === 'STORAGE') {
      return ['cf-workers', 'cf-d1', 'cf-vectorize', 'cf-kv', 'cf-r2', 'worker-cron'].includes(node.id);
    }
    return true;
  };

  const isLinkActive = (link: TopologyLink) => {
    if (activeFilter === 'ALL') return true;
    const sourceNode = nodes.find((n) => n.id === link.source);
    const targetNode = nodes.find((n) => n.id === link.target);
    if (!sourceNode || !targetNode) return false;
    return isNodeActive(sourceNode) && isNodeActive(targetNode);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[2];

  const handleNodeClick = (node: TopologyNode) => {
    setSelectedNodeId(node.id);
    onSelectNode?.(node);
  };

  const getCategoryColor = (cat: TopologyNode['category']) => {
    switch (cat) {
      case 'ingress':
        return {
          stroke: 'rgba(157, 178, 164, 0.6)',
          accent: '#9db2a4',
          bg: 'rgba(157, 178, 164, 0.08)',
          tag: 'INGRESS',
        };
      case 'compute':
        return {
          stroke: 'rgba(180, 200, 190, 0.8)',
          accent: '#c1decb',
          bg: 'rgba(180, 200, 190, 0.12)',
          tag: 'COMPUTE',
        };
      case 'storage':
        return {
          stroke: 'rgba(160, 175, 195, 0.65)',
          accent: '#a2b4c8',
          bg: 'rgba(160, 175, 195, 0.08)',
          tag: 'STATE/DB',
        };
      case 'ai':
        return {
          stroke: 'rgba(215, 185, 150, 0.7)',
          accent: '#d8b996',
          bg: 'rgba(215, 185, 150, 0.09)',
          tag: 'AI NEURAL',
        };
    }
  };

  return (
    <div className={`flex flex-col gap-3 font-mono text-xs select-none ${className}`}>
      {/* 1. Filter / Control Bar */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-matte-border bg-matte-card/60 backdrop-blur">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-matte-faint uppercase tracking-wider px-1">FLOW FILTER:</span>
            {(
              [
                { key: 'ALL', label: '1. ALL TOPOLOGY' },
                { key: 'REQUEST_FLOW', label: '2. USER REQUEST' },
                { key: 'SEARCH_RAG', label: '3. VECTOR RAG' },
                { key: 'AI_AGENT', label: '4. AGENT LLM' },
                { key: 'STORAGE', label: '5. EDGE STORAGE' },
              ] as { key: TopologyFilter; label: string }[]
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveFilter(item.key)}
                className={`px-2 py-0.5 rounded text-[10px] transition-all border ${
                  activeFilter === item.key
                    ? 'bg-matte-tag border-matte-accent text-matte-highlight font-semibold'
                    : 'bg-transparent border-transparent text-matte-muted hover:text-matte-text hover:border-matte-border'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-matte-muted">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-matte-highlight">EDGE ISOLATES: ACTIVE</span>
            </span>
            <span className="text-matte-faint">|</span>
            <span>TOPOLOGY REV 2.4</span>
          </div>
        </div>
      )}

      {/* 2. Interactive SVG Canvas */}
      <div className="relative rounded border border-matte-border bg-matte-bg/90 overflow-hidden shadow-inner">
        {/* Background Schematic Registration Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-20 schematic-grid" />

        {/* SVG Drawing Canvas */}
        <svg
          viewBox="0 0 1010 455"
          width={width}
          height={height}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto block select-none"
        >
          <defs>
            {/* Glow Filter */}
            <filter id="node-glow" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Circuit Line Gradients */}
            <linearGradient id="link-grad-ingress" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9db2a4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#c1decb" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="link-grad-storage" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c1decb" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#a2b4c8" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="link-grad-ai" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a2b4c8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#d8b996" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Tier Label Column Badges */}
          <g className="text-[9px] font-mono fill-matte-faint uppercase" opacity="0.6">
            <text x="40" y="24" letterSpacing="0.1em">STAGE 01 // INGRESS</text>
            <text x="275" y="24" letterSpacing="0.1em">STAGE 02 // COMPUTE (V8)</text>
            <text x="545" y="24" letterSpacing="0.1em">STAGE 03 // STATE & STORAGE</text>
            <text x="790" y="24" letterSpacing="0.1em">STAGE 04 // AI REASONING</text>

            <line x1="40" y1="30" x2="215" y2="30" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1="275" y1="30" x2="480" y2="30" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1="545" y1="30" x2="730" y2="30" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1="790" y1="30" x2="970" y2="30" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" />
          </g>

          {/* Connecting Circuit Links */}
          <g className="links-layer">
            {links.map((link) => {
              const active = isLinkActive(link);
              const isSelected = selectedNodeId === link.source || selectedNodeId === link.target;

              let strokeColor = 'rgba(255, 255, 255, 0.08)';
              if (active) {
                if (link.category === 'ingress') strokeColor = 'url(#link-grad-ingress)';
                else if (link.category === 'storage') strokeColor = 'url(#link-grad-storage)';
                else strokeColor = 'url(#link-grad-ai)';
              }

              return (
                <g key={link.id} className="transition-opacity duration-300" opacity={active ? (isSelected ? 1 : 0.75) : 0.12}>
                  {/* Background Path Track */}
                  <path
                    d={link.path}
                    stroke={active ? 'var(--matte-border, rgba(255,255,255,0.1))' : 'rgba(255,255,255,0.04)'}
                    strokeWidth={isSelected ? 2 : 1.2}
                    fill="none"
                  />

                  {/* Highlight Animated Flow */}
                  {active && link.animated && (
                    <path
                      d={link.path}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2 : 1.2}
                      strokeDasharray="6 12"
                      fill="none"
                      className="animate-topology-dash"
                      style={{
                        animation: `topologyPulse ${link.speedSec || 2.5}s linear infinite`,
                      }}
                    />
                  )}

                  {/* Solder connection dots */}
                  {active && (
                    <>
                      <circle cx={link.path.split(' ')[1]} cy={link.path.split(' ')[2]} r="2" fill="var(--matte-accent)" />
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* Architectural Nodes */}
          <g className="nodes-layer">
            {nodes.map((node) => {
              const active = isNodeActive(node);
              const isSelected = selectedNodeId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const styleTheme = getCategoryColor(node.category);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer transition-all duration-200"
                  opacity={active ? 1 : 0.22}
                  filter={isSelected ? 'url(#node-glow)' : 'none'}
                >
                  {/* Card Base */}
                  <rect
                    x="0"
                    y="0"
                    width={node.width}
                    height={node.height}
                    rx="3"
                    fill="var(--matte-card, #15181e)"
                    stroke={isSelected ? styleTheme.accent : isHovered ? 'var(--matte-border-hover)' : 'var(--matte-border)'}
                    strokeWidth={isSelected ? '1.5' : '1'}
                    className="transition-colors duration-150"
                  />

                  {/* Header Sub-bar */}
                  <rect
                    x="0"
                    y="0"
                    width={node.width}
                    height="18"
                    rx="3"
                    fill={styleTheme.bg}
                    stroke="none"
                  />

                  {/* Category Tag */}
                  <text
                    x="8"
                    y="12"
                    fontSize="7"
                    fontFamily="JetBrains Mono, monospace"
                    letterSpacing="0.08em"
                    fontWeight="700"
                    fill={styleTheme.accent}
                  >
                    {styleTheme.tag}
                  </text>

                  {/* Latency SLA Indicator */}
                  <text
                    x={node.width - 8}
                    y="12"
                    textAnchor="end"
                    fontSize="7"
                    fontFamily="JetBrains Mono, monospace"
                    fill="var(--matte-muted)"
                  >
                    {node.latency}
                  </text>

                  {/* Node Title */}
                  <text
                    x="10"
                    y="36"
                    fontSize="10.5"
                    fontFamily="Space Grotesk, Inter, sans-serif"
                    fontWeight="600"
                    fill={isSelected ? styleTheme.accent : 'var(--matte-text)'}
                  >
                    {node.title}
                  </text>

                  {/* Node Subtitle */}
                  <text
                    x="10"
                    y="50"
                    fontSize="7.5"
                    fontFamily="JetBrains Mono, monospace"
                    fill="var(--matte-muted)"
                  >
                    {node.subtitle}
                  </text>

                  {/* Bindings / Protocol details */}
                  <text
                    x="10"
                    y={node.height - 10}
                    fontSize="7"
                    fontFamily="JetBrains Mono, monospace"
                    fill="var(--matte-faint)"
                  >
                    {node.protocol}
                  </text>

                  {/* Registration corner ticks */}
                  <path
                    d="M 2 2 L 6 2 M 2 2 L 2 6"
                    stroke={styleTheme.accent}
                    strokeWidth="0.75"
                    opacity={isSelected ? 1 : 0.4}
                  />
                  <path
                    d={`M ${node.width - 2} 2 L ${node.width - 6} 2 M ${node.width - 2} 2 L ${node.width - 2} 6`}
                    stroke={styleTheme.accent}
                    strokeWidth="0.75"
                    opacity={isSelected ? 1 : 0.4}
                  />
                  <path
                    d={`M 2 ${node.height - 2} L 6 ${node.height - 2} M 2 ${node.height - 2} L 2 ${node.height - 6}`}
                    stroke={styleTheme.accent}
                    strokeWidth="0.75"
                    opacity={isSelected ? 1 : 0.4}
                  />
                  <path
                    d={`M ${node.width - 2} ${node.height - 2} L ${node.width - 6} ${node.height - 2} M ${node.width - 2} ${node.height - 2} L ${node.width - 2} ${node.height - 6}`}
                    stroke={styleTheme.accent}
                    strokeWidth="0.75"
                    opacity={isSelected ? 1 : 0.4}
                  />

                  {/* Selection Indicator Pulse Ring */}
                  {isSelected && (
                    <circle
                      cx={node.width - 10}
                      cy="28"
                      r="3.5"
                      fill={styleTheme.accent}
                      className="animate-ping"
                      opacity="0.7"
                    />
                  )}
                  <circle
                    cx={node.width - 10}
                    cy="28"
                    r="2"
                    fill={isSelected ? styleTheme.accent : 'var(--matte-border)'}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* 3. Deep-Dive Node Telemetry Inspector */}
      {selectedNode && (
        <div className="p-3.5 rounded border border-matte-border bg-matte-card transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-matte-border/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-matte-tag text-matte-accent border border-matte-border">
                  {selectedNode.category.toUpperCase()}
                </span>
                <h4 className="font-display font-semibold text-sm text-matte-text">{selectedNode.title}</h4>
                <span className="text-[11px] text-matte-muted">({selectedNode.subtitle})</span>
              </div>
              <p className="text-[11px] text-matte-muted mt-1 font-mono">{selectedNode.protocol}</p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="bg-matte-bg/80 px-2.5 py-1 rounded border border-matte-border/60">
                <span className="text-matte-faint text-[10px] block">LATENCY:</span>
                <span className="text-matte-highlight font-bold">{selectedNode.latency}</span>
              </div>
              <div className="bg-matte-bg/80 px-2.5 py-1 rounded border border-matte-border/60">
                <span className="text-matte-faint text-[10px] block">UPTIME / SLA:</span>
                <span className="text-emerald-400 font-bold">{selectedNode.sla}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {/* Tech Specs */}
            <div className="bg-matte-bg/50 p-2.5 rounded border border-matte-border/40">
              <span className="text-[10px] text-matte-faint font-semibold uppercase tracking-wider block mb-1.5">
                ARCHITECTURE HIGHLIGHTS
              </span>
              <ul className="space-y-1 text-[11px] text-matte-muted">
                {selectedNode.techSpecs.map((spec, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-matte-accent">▸</span>
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Performance Metrics */}
            <div className="bg-matte-bg/50 p-2.5 rounded border border-matte-border/40">
              <span className="text-[10px] text-matte-faint font-semibold uppercase tracking-wider block mb-1.5">
                LIVE METRICS
              </span>
              <div className="space-y-1.5 text-[11px]">
                {selectedNode.metrics.map((m, i) => (
                  <div key={i} className="flex justify-between border-b border-matte-border/20 pb-0.5">
                    <span className="text-matte-muted">{m.label}:</span>
                    <span className="text-matte-text font-medium">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CF Bindings & TypeScript API */}
            <div className="bg-matte-bg/50 p-2.5 rounded border border-matte-border/40">
              <span className="text-[10px] text-matte-faint font-semibold uppercase tracking-wider block mb-1.5">
                WORKER BINDINGS & APIS
              </span>
              {selectedNode.bindings && selectedNode.bindings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.bindings.map((b, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 bg-matte-tag border border-matte-border text-matte-accent rounded text-[10px] font-mono"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-matte-faint italic">Edge routing tier / External API gateway</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for animated dashed flow lines */}
      <style>{`
        @keyframes topologyPulse {
          0% {
            stroke-dashoffset: 24;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default TopologyDiagram;
