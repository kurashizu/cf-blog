/**
 * CRAP (Change Risk Anti-Patterns) per function.
 *
 *   CRAP(m) = CC(m)^2 * (1 - cov(m)/100)^3 + CC(m)
 *
 * Complexity comes from the TypeScript parser; coverage from the v8 report
 * `vitest run --coverage` writes to coverage/coverage-final.json. A function
 * with no coverage data counts as 0% covered, which is the honest reading:
 * nothing exercises it.
 *
 * When reports/mutation/report.json exists, each file's mutation score is
 * shown alongside. Coverage says a line ran; the mutation score says the
 * tests would have noticed it change — a file can sit at 100% coverage and
 * still score badly, which is the case worth seeing.
 *
 *   node scripts/crap.mjs            # top 40 by CRAP
 *   node scripts/crap.mjs --all      # every function
 *   node scripts/crap.mjs --covered  # only files in the coverage report
 *
 * Run from landing-worker/ — it resolves typescript from the local install.
 */
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const ONLY_COVERED = args.includes('--covered');
const SHOW_ALL = args.includes('--all');

/* ---- 1. coverage ------------------------------------------------------- */

/** file -> [{ startLine, endLine, covered }] from the v8 report. */
function loadCoverage() {
	const path = resolve(ROOT, 'coverage/coverage-final.json');
	if (!existsSync(path)) {
		console.error('No coverage/coverage-final.json — run `npm run test:coverage` first.\n');
		return new Map();
	}
	const raw = JSON.parse(readFileSync(path, 'utf8'));
	const byFile = new Map();
	for (const [absPath, entry] of Object.entries(raw)) {
		const rel = relative(ROOT, absPath);
		const fns = [];
		for (const [id, meta] of Object.entries(entry.fnMap ?? {})) {
			const hits = entry.f?.[id] ?? 0;
			const loc = meta.loc ?? meta.decl;
			if (!loc) continue;
			fns.push({ start: loc.start.line, end: loc.end.line, hits });
		}
		// statement hits, for a per-line covered/total within a function body
		const stmts = [];
		for (const [id, loc] of Object.entries(entry.statementMap ?? {})) {
			stmts.push({ start: loc.start.line, end: loc.end.line, hits: entry.s?.[id] ?? 0 });
		}
		byFile.set(rel, { fns, stmts });
	}
	return byFile;
}

/** Percentage of statements inside [startLine, endLine] that ran. */
function coverageFor(cov, startLine, endLine) {
	if (!cov) return null;
	const inside = cov.stmts.filter((s) => s.start >= startLine && s.end <= endLine);
	if (!inside.length) return null;
	const covered = inside.filter((s) => s.hits > 0).length;
	return (covered / inside.length) * 100;
}

/* ---- 2. complexity ----------------------------------------------------- */

const DECISION = new Set([
	ts.SyntaxKind.IfStatement,
	ts.SyntaxKind.ForStatement,
	ts.SyntaxKind.ForInStatement,
	ts.SyntaxKind.ForOfStatement,
	ts.SyntaxKind.WhileStatement,
	ts.SyntaxKind.DoStatement,
	ts.SyntaxKind.CaseClause,
	ts.SyntaxKind.CatchClause,
	ts.SyntaxKind.ConditionalExpression
]);

const isFn = (n) =>
	ts.isFunctionDeclaration(n) ||
	ts.isFunctionExpression(n) ||
	ts.isArrowFunction(n) ||
	ts.isMethodDeclaration(n) ||
	ts.isConstructorDeclaration(n) ||
	ts.isGetAccessor(n) ||
	ts.isSetAccessor(n);

function analyseFile(file) {
	let src = readFileSync(file, 'utf8');
	if (file.endsWith('.svelte')) {
		const blocks = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
		if (!blocks.length) return [];
		// keep line numbers meaningful: blank out everything outside <script>
		let out = src.split('\n').map(() => '');
		for (const b of blocks) {
			const startLine = src.slice(0, b.index).split('\n').length - 1;
			b[1].split('\n').forEach((line, i) => (out[startLine + i + 1] = line));
		}
		src = out.join('\n');
	}
	const sf = ts.createSourceFile(
		file,
		src,
		ts.ScriptTarget.ESNext,
		true,
		file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS
	);

	function complexity(fn) {
		let cc = 1;
		(function walk(n) {
			if (n !== fn && isFn(n)) return;
			if (DECISION.has(n.kind)) cc++;
			if (ts.isBinaryExpression(n)) {
				const k = n.operatorToken.kind;
				if (
					k === ts.SyntaxKind.AmpersandAmpersandToken ||
					k === ts.SyntaxKind.BarBarToken ||
					k === ts.SyntaxKind.QuestionQuestionToken
				)
					cc++;
			}
			ts.forEachChild(n, walk);
		})(fn);
		return cc;
	}

	function nameOf(n) {
		if (n.name) return n.name.getText(sf);
		const p = n.parent;
		if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && p.name)
			return p.name.getText(sf);
		if (p && ts.isCallExpression(p)) return '<callback>';
		return '<anonymous>';
	}

	const rows = [];
	(function scan(n) {
		if (isFn(n)) {
			const start = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
			const end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
			rows.push({ name: nameOf(n), line: start, endLine: end, cc: complexity(n) });
		}
		ts.forEachChild(n, scan);
	})(sf);
	return rows;
}

/* ---- 3. mutation score (optional) -------------------------------------- */

/** file -> mutation score %, from Stryker's JSON report if one exists. */
function loadMutationScores() {
	const path = resolve(ROOT, 'reports/mutation/report.json');
	if (!existsSync(path)) return new Map();
	const raw = JSON.parse(readFileSync(path, 'utf8'));
	const scores = new Map();
	for (const [file, entry] of Object.entries(raw.files ?? {})) {
		const mutants = entry.mutants ?? [];
		// Stryker's own formula: timeouts count as detected, no-coverage does not.
		const killed = mutants.filter((m) => m.status === 'Killed' || m.status === 'Timeout').length;
		const total = mutants.filter((m) => m.status !== 'Ignored').length;
		if (total) scores.set(relative(ROOT, resolve(ROOT, file)), (killed / total) * 100);
	}
	return scores;
}

/* ---- 4. report --------------------------------------------------------- */

const crap = (cc, covPct) => cc * cc * Math.pow(1 - covPct / 100, 3) + cc;

const files = execSync(
	"find src -name '*.ts' -o -name '*.js' -o -name '*.svelte' | grep -v 'i18n/messages\\|/songs/\\|\\.d\\.ts'",
	{ encoding: 'utf8', cwd: ROOT }
)
	.trim()
	.split('\n')
	.filter(Boolean);

const coverage = loadCoverage();
const mutation = loadMutationScores();
const rows = [];

for (const file of files) {
	const cov = coverage.get(file);
	if (ONLY_COVERED && !cov) continue;
	for (const fn of analyseFile(resolve(ROOT, file))) {
		const measured = coverageFor(cov, fn.line, fn.endLine);
		const covPct = measured ?? 0;
		rows.push({
			file,
			...fn,
			cov: covPct,
			measured: measured !== null,
			crap: crap(fn.cc, covPct)
		});
	}
}

rows.sort((a, b) => b.crap - a.crap);

const shown = SHOW_ALL ? rows : rows.slice(0, 40);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('CRAP', 8)}${pad('CC', 5)}${pad('cov%', 7)}${pad('mut%', 7)}${pad('location', 60)}name`);
console.log('-'.repeat(118));
for (const r of shown) {
	const cov = r.measured ? r.cov.toFixed(0) : '—';
	const mut = mutation.has(r.file) ? mutation.get(r.file).toFixed(0) : '—';
	console.log(
		`${pad(r.crap.toFixed(1), 8)}${pad(r.cc, 5)}${pad(cov, 7)}${pad(mut, 7)}${pad(`${r.file}:${r.line}`, 60)}${r.name}`
	);
}

const over30 = rows.filter((r) => r.crap > 30);
console.log(
	`\n${rows.length} functions · ${over30.length} above the CRAP-30 threshold · ` +
		`${rows.filter((r) => r.measured).length} with coverage data`
);
if (mutation.size) {
	console.log('mut% is per file, not per function — Stryker reports at file level.');
}
