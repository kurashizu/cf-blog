/**
 * Tools the model can call.
 *
 * The model decides when to call these; the page runs them and hands back the
 * result. Everything here executes in the visitor's own browser, so a tool is
 * only as safe as what it is allowed to touch — which is why the one tool that
 * runs code runs it inside a worker with no DOM, no network of consequence, and
 * a wall-clock limit, rather than in this page.
 */

/** The JSON-schema shape the runtime expects for a callable function. */
export interface ToolSpec {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, { type: string; description?: string }>;
			required?: string[];
		};
	};
}

export const TOOLS: ToolSpec[] = [
	{
		type: 'function',
		function: {
			name: 'run_js',
			description:
				'Evaluate a JavaScript expression and return its value. Use this only for ' +
				'computation the model cannot do reliably in its head — arithmetic on large ' +
				'numbers, date arithmetic, string transformation. Do not use it to restate ' +
				'something already known, and never to answer a question about an image. ' +
				'The code runs in an isolated sandbox with no access to the page, the ' +
				'network, or storage.',
			parameters: {
				type: 'object',
				properties: {
					code: {
						type: 'string',
						description: 'A JavaScript expression or statements ending in a return value.'
					}
				},
				required: ['code']
			}
		}
	}
];

/** How long a snippet may run before it is killed, in ms. */
const TIME_LIMIT = 2000;
/** Long results are of no use to a 2B model and cost context. */
const MAX_RESULT = 2000;

/**
 * Runs a snippet in a throwaway worker.
 *
 * A worker is the isolation boundary that matters here: it has no `document`,
 * cannot reach into this page, and can be terminated mid-loop, which `eval` on
 * the main thread cannot. `while(true){}` from the model stalls the worker for
 * two seconds and then the worker dies, rather than freezing the tab.
 */
export function runJs(code: string): Promise<string> {
	return new Promise((resolve) => {
		let worker: Worker | null = null;
		let url = '';
		const done = (text: string) => {
			clearTimeout(timer);
			worker?.terminate();
			if (url) URL.revokeObjectURL(url);
			resolve(text.length > MAX_RESULT ? text.slice(0, MAX_RESULT) + '\n[truncated]' : text);
		};
		const timer = setTimeout(() => done(`Error: timed out after ${TIME_LIMIT} ms`), TIME_LIMIT);

		try {
			// The snippet is wrapped so a bare expression and a statement block with
			// an explicit `return` both work, which is how models tend to write.
			const src = `onmessage = (e) => {
				try {
					const fn = new Function('"use strict"; return (' + JSON.stringify(e.data) + ')');
					let out;
					try { out = eval?.(e.data); } catch (inner) { out = new Function(e.data)(); }
					postMessage({ ok: true, value: format(out) });
				} catch (err) {
					postMessage({ ok: false, value: String(err && err.message || err) });
				}
			};
			function format(v) {
				if (v === undefined) return 'undefined';
				if (typeof v === 'string') return v;
				try { return JSON.stringify(v, null, 2) ?? String(v); } catch { return String(v); }
			}`;
			url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
			worker = new Worker(url);
			worker.onmessage = (e: MessageEvent<{ ok: boolean; value: string }>) =>
				done(e.data.ok ? e.data.value : `Error: ${e.data.value}`);
			worker.onerror = (e) => done(`Error: ${e.message || 'the snippet failed'}`);
			worker.postMessage(code);
		} catch (err) {
			done(`Error: ${(err as Error).message}`);
		}
	});
}

/** Dispatches one call by name. Unknown names are reported, not thrown. */
export async function callTool(name: string, argsJson: string): Promise<string> {
	if (name !== 'run_js') return `Error: no tool named ${name}`;
	let code = '';
	try {
		code = String(JSON.parse(argsJson || '{}').code ?? '');
	} catch {
		return 'Error: arguments were not valid JSON';
	}
	if (!code.trim()) return 'Error: no code given';
	return runJs(code);
}
