import type { PixelIconName } from '../components/pixel/icons';

export interface ModuleSpec {
	id: string;
	name: string;
	url: string;
	tag: string;
	badge: string;
	desc: string;
	tech: string[];
	/** Short, verified real facts — no invented precision (latency numbers, fake %s, etc). */
	facts: string[];
	/** Real request/data-flow as a Mermaid flowchart definition. */
	topology: string;
	color: string;
	bgTint: string;
	borderColor: string;
	icon: PixelIconName;
}

export const MODULES: ModuleSpec[] = [
	{
		id: 'blog',
		name: 'blog.krsz.in',
		url: 'https://blog.krsz.in',
		tag: 'NEXTJS_D1_VECTORIZE',
		badge: 'NODE_01',
		desc: 'Technical research log with real semantic search — full article bodies in D1, embedded and indexed for retrieval, not just tagged.',
		tech: ['Next.js 15 + OpenNext on Workers', 'D1 SQL (full article body)', 'Vectorize 768-D (gemini-embedding-2)', 'R2 + KV + per-route rate limits'],
		facts: [
			'D1 stores the complete article body, not just metadata',
			'Semantic search via Vectorize, embedded with Gemini Embedding 2 (768-D)',
			'Per-route rate limiting and a full audit log on every write'
		],
		topology: `flowchart LR
    A(["Client"]) --> B["Next.js Worker"]
    B --> C[("D1: article body")]
    B --> D[("Vectorize 768-D")]
    E{{"Gemini Embedding 2"}} -->|embeds| D
    B --> F[("R2 / KV")]`,
		color: '#e06c75',
		bgTint: 'rgba(224, 108, 117, 0.08)',
		borderColor: 'rgba(224, 108, 117, 0.4)',
		icon: 'blog'
	},
	{
		id: 'agent',
		name: 'agent.krsz.in',
		url: 'https://agent.krsz.in',
		tag: 'AUTONOMOUS_LLM_AGENT',
		badge: 'NODE_02',
		desc: 'An actual multi-step tool-calling agent, not a single prompt-and-response wrapper — runs its own tool loop with real fallback logic.',
		tech: ['gemma-4-31b-it → gemma-4-26b-a4b-it fallback', 'Brave Search + hand-written AST evaluator', 'KV session store, 1h TTL'],
		facts: [
			'5 real tools: web_search (Brave), eval_expression (a hand-written parser, not raw eval), get_time, blog_read, blog_search',
			'Automatic model fallback: gemma-4-31b-it → gemma-4-26b-a4b-it',
			'Up to 5 tool-call iterations per request, 5s timeout per call'
		],
		topology: `sequenceDiagram
    participant C as Client
    participant W as Agent Worker
    participant K as KV Session
    participant M as Model Pool
    participant T as Tools

    C->>W: chat message
    W->>K: load last 20 turns (1h TTL)
    W->>M: generate (gemma-4-31b-it)
    alt daily quota hit
        M-->>W: TPD limit
        W->>M: retry (gemma-4-26b-a4b-it)
    end
    loop up to 5 tool calls
        M->>T: web_search / eval_expression / blog_search
        T-->>M: tool result
    end
    M-->>W: final answer
    W->>K: save turn
    W-->>C: streamed response`,
		color: '#61afef',
		bgTint: 'rgba(97, 175, 239, 0.08)',
		borderColor: 'rgba(97, 175, 239, 0.4)',
		icon: 'agent'
	},
	{
		id: 'share',
		name: 'share.krsz.in',
		url: 'https://share.krsz.in',
		tag: 'S3_COMPATIBLE_RELAY',
		badge: 'NODE_03',
		desc: 'Ephemeral file and clipboard relay. Presigned direct-to-storage uploads, 4-character codes, links that actually expire.',
		tech: ['SvelteKit on Cloudflare Workers', 'Self-hosted S3-compatible storage', 'D1 quotas + audit log', 'Cron TTL purge every 5 min'],
		facts: [
			'Uploads go straight to storage via presigned PUT/multipart — the Worker never touches file bytes',
			'Up to 5 GB per file (100 GB for admin uploads); links expire 5 minutes to 7 days',
			'Password-protected downloads, plus an admin panel with a full audit log'
		],
		topology: `sequenceDiagram
    participant C as Client
    participant W as SvelteKit Worker
    participant D as D1
    participant S as Oracle VPS Store

    C->>W: POST /api/upload/init
    W->>D: check quota
    D-->>W: ok
    W-->>C: presigned PUT/multipart URL
    C->>S: PUT file bytes (direct)
    S-->>C: 200 OK
    C->>W: POST /api/upload/complete
    W->>D: record share + TTL
    W-->>C: 4-char code + link
    Note over W,S: cron sweep every 5 min purges expired shares`,
		color: '#e5c07b',
		bgTint: 'rgba(229, 192, 123, 0.08)',
		borderColor: 'rgba(229, 192, 123, 0.4)',
		icon: 'vault'
	},
	{
		id: 'sharetube',
		name: 'sharetube.krsz.in',
		url: 'https://sharetube.krsz.in',
		tag: 'YTDLP_FFMPEG_PIPELINE',
		badge: 'NODE_04',
		desc: 'Paste a video URL, get a shareable link. A real yt-dlp → ffmpeg pipeline runs on GitHub Actions and hands the result to share.krsz.in.',
		tech: [
			'SvelteKit job queue (D1) on Cloudflare Workers',
			'yt-dlp → ffmpeg, macOS VideoToolbox by default',
			'Cloudflare WARP (WireGuard) egress, Oracle proxy fallback',
			'Delivered via share.krsz.in’s own upload API'
		],
		facts: [
			'Up to 4 parallel GitHub Actions runners handle download / transcode / watermark',
			'Every video gets a burned-in, CJK-capable watermark — the job fails loudly if no CJK font is found',
			'Egress through Cloudflare WARP (WireGuard) by default, with an Oracle-hosted proxy as fallback'
		],
		topology: `sequenceDiagram
    participant C as Client
    participant W as SvelteKit Worker
    participant D as D1 Job Queue
    participant R as GH Actions Runner
    participant SH as share.krsz.in

    C->>W: paste video URL
    W->>D: enqueue job
    W-->>C: job id (client polls)
    D->>R: dispatch (≤4 parallel runners)
    Note over R: yt-dlp (WARP/proxy) → ffmpeg (VideoToolbox) → CJK watermark
    R->>SH: upload finished video
    SH-->>R: share link
    R->>D: mark job complete
    C->>W: poll status
    W-->>C: share link`,
		color: '#c678dd',
		bgTint: 'rgba(198, 120, 221, 0.08)',
		borderColor: 'rgba(198, 120, 221, 0.4)',
		icon: 'video'
	},
	{
		id: 'mail',
		name: 'mail.krsz.in',
		url: 'https://mail.krsz.in',
		tag: 'SELFHOSTED_WEBMAIL',
		badge: 'NODE_05',
		desc: 'A real private mailbox with its own webmail UI — not a routing gateway. Open signup, no tracking.',
		tech: ['SvelteKit SSR on Cloudflare Workers', 'D1 (accounts/folders/messages) + R2 (bodies/attachments)', 'Email Routing triggers inbound parsing only', 'Resend (external) + in-Worker delivery (internal)'],
		facts: [
			'Full webmail UI — inbox/sent/drafts/trash/junk/starred, drag-drop attachments, search',
			'Open signup, PBKDF2-SHA256 password hashing, JWT sessions in KV',
			'Per-account quotas (200 MiB / 1,000 messages) with a nightly cleanup cron'
		],
		topology: `flowchart LR
    A(["Inbound: *@krsz.in"]) --> B["Email Routing"]
    B --> C["Worker parses MIME"]
    C --> D[("D1: accounts / messages")]
    C --> E[("R2: bodies / attachments")]
    F(["Webmail UI"]) -->|external| G{{"Resend API"}}
    F -->|internal| C`,
		color: '#98c379',
		bgTint: 'rgba(152, 195, 121, 0.08)',
		borderColor: 'rgba(152, 195, 121, 0.4)',
		icon: 'mail'
	},
	{
		id: 'skill',
		name: 'skill.krsz.in',
		url: 'https://skill.krsz.in/rules',
		tag: 'ENGINEERING_RULES',
		badge: 'NODE_06',
		desc: 'The actual engineering rulebook these projects follow — not a mission statement, a working style guide.',
		tech: ['SvelteKit for all web work', 'uv for Python', 'ffmpeg for all media processing', 'Pre-authenticated wrangler / gh / hf CLIs'],
		facts: [
			'Code and docs default to English; chat defaults to Chinese unless switched',
			'ffmpeg is the standard for every audio/video/image operation, no exceptions',
			'Background jobs run in tmux panes, not nohup; long tasks get polled, not blocked on'
		],
		topology: `flowchart LR
    A[("kurashizu/rules repo")] --> B["skill.krsz.in"]
    B -->|"referenced by"| C["blog / agent / share / sharetube / mail"]`,
		color: '#56b6c2',
		bgTint: 'rgba(86, 182, 194, 0.08)',
		borderColor: 'rgba(86, 182, 194, 0.4)',
		icon: 'rules'
	}
];
