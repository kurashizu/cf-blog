<script lang="ts">
	import { PORT_STYLE } from './port-style';
	/**
	 * The patch bay: modules on a canvas, cables between ports.
	 *
	 * Laid out like LIFE.LAB because the problem is the same -- a palette of
	 * pieces on the right, a workspace in the middle you can pan and zoom, and
	 * the pieces keep the site's own panel styling rather than becoming generic
	 * boxes. The camera is {x, y, s} and the wheel zooms about the pointer, so
	 * the thing under the cursor stays under it.
	 *
	 * Cables are drawn as bezier curves in an SVG layer beneath the modules, so
	 * a cable never covers a knob and a module never hides a cable's endpoint.
	 */
	import { get } from 'svelte/store';
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { currentTrack } from '../../../stores/synth-tracks';
	import { activeTrackId } from '../../../stores/synth-transport';
	import {
		graphOf,
		addNode,
		moveNode,
		removeNode,
		addCable,
		removeCable,
		setGraphParam,
		setGraphWave,
		setGraphLabel,
		selectedNode,
		selectedNodes,
		graphClipboard,
		moveSelection,
		beginGraphDrag,
		endGraphDrag,
		undoGraph,
		redoGraph,
		canUndo,
		canRedo,
		historyVersion,
		deleteSelection,
		copySelection,
		pasteClipboard,
		nodesInRect,
		isFixedNode,
		roleOf,
		rolesCompatible,
		groupSelection,
		ungroupSelection,
		groupMembers,
		moveGroupBy,
		resizeGroupTo,
		refitGroupTo,
		ungroupById,
		setGroupLabel,
		deleteGroupAndMembers,
		dropPrefab,
		saveSelectionAsPrefab,
		macroPath,
		editedView,
		enterMacro,
		leaveMacro,
		renameMacro,
		collapseSelection,
		expandSelection,
		allowedInMacro,
		GROUP_HEADER,
		type GraphNode,
		type GraphCable,
		type PortKind,
		type PortRole
	} from '../../../stores/synth-graph';
	import { allPrefabs, deletePrefab } from '../../../stores/synth-prefabs';
	import {
		PALETTE_SPECS,
		MODULE_GROUPS,
		nodeSpec,
		moduleWidth,
		CONST_KINDS,
		type ModuleSpec
	} from '../../../stores/synth-modules';
	import { laneSocketId, VELOCITY_LANE_ID } from '../../../stores/note-lanes';
	import { createResolver, type EvalGraph } from '../../../stores/node-graph';
	import { trackLanes } from '../../../stores/lane-edit';
	import ModuleCard from './ModuleCard.svelte';
	import WaveDrawDialog from '../WaveDrawDialog.svelte';
	import { saveCustomWave, updateCustomWave } from '../../../stores/synth-waves';
	import type { CustomWave } from '../../../track-data';
	import ModuleIcon from './ModuleIcon.svelte';

	/* What the canvas shows: the track's patch, or the macro definition it
	   has been opened into (`macroPath`). Every edit goes back the same way. */
	let view = $derived(editedView($currentTrack, $macroPath));
	let graph = $derived(view.graph);
	let graphParams = $derived(view.params);
	let graphWaves = $derived(view.waves);
	let graphLabels = $derived(view.labels);
	/* The definition being edited, for the breadcrumb and its name. */
	let insideMacro = $derived(
		$macroPath.length
			? graphOf($currentTrack).macros?.[$macroPath[$macroPath.length - 1]]
			: undefined
	);
	/** A node's card, macro instances included. */
	const specOf = (n: { type: string; macro?: string }) => nodeSpec(n, graph);
	/* KEY-EVENT's palette cap: a UI affordance rather than a rule the graph
	   itself enforces (see `isFixedNode`, which only refuses deleting the
	   *last* one) -- a second KEY-EVENT is legal data, just not something the
	   palette hands out while a live one already exists. */
	let hasKeyEvent = $derived(graph.nodes.some((n) => n.type === 'in'));

	/* What each inlet is actually carrying, resolved the way the engine does.
	
	   A card cannot answer this on its own: PWM's width is an inlet, so the
	   shape it should draw depends on whatever is patched into PW, and the
	   module only knows its own id. The canvas has the graph, so it resolves
	   once and hands the answer down -- the same `createResolver` the voice
	   builder uses, so a card cannot disagree with the sound. */
	let resolver = $derived(
		createResolver(
			graph as unknown as EvalGraph,
			graphParams ?? {},
			{
				pitch: 0,
				velocity: 1,
				noteIndex: 48,
				lanes: {},
				tuning: 440
			},
			'in'
		)
	);
	const inletOf = (nodeId: string, port: string, def: number) => {
		try {
			return resolver.input(nodeId, port, def);
		} catch {
			return def;
		}
	};

	/* Has a signal taken this knob over?
	
	   A signal landing on an AudioParam sums with the knob, so the engine reads
	   a claimed knob as zero and lets the cable decide alone. The card has to
	   say the same thing or the number shown is a number that does nothing --
	   which is how a GAIN reading LVL 1 under a live cable came to sound like it
	   was ignoring the patch. */
	const claimedOf = (nodeId: string, key: string) => {
		try {
			return resolver.isDrivenBySignal(nodeId, key);
		} catch {
			return false;
		}
	};

	/* Is anything plugged into this socket?
	
	   A probe needs to know which of its two inlets has a cable on it, because
	   that is what decides the scale it draws against -- and the cable is the
	   only reliable answer: a control value sitting inside -1..1 is
	   indistinguishable from audio by its samples alone. */
	const wiredOf = (nodeId: string, port: string) => {
		try {
			return resolver.isWired(nodeId, port);
		} catch {
			return false;
		}
	};

	/* The wave editor, opened from a card's picker. Keyed by node and param
	   rather than by oscillator number, since a patch may hold any number of
	   oscillators -- and the saved table is written back to the node that
	   asked for it, so drawing from one card cannot retune another. */
	let drawFor = $state<{ node: string; key: string } | null>(null);
	let drawEditing = $state<CustomWave | null>(null);

	function openWaveDraw(node: string, key: string, editing?: CustomWave) {
		drawFor = { node, key };
		drawEditing = editing ?? null;
		playSound('click');
	}

	function onSaveWave(name: string, samples: number[], id?: string) {
		let waveId = id;
		if (id) updateCustomWave(id, { name, samples });
		else waveId = saveCustomWave(name, samples).id;
		if (drawFor) setGraphWave(graphWaves, drawFor.node, drawFor.key, `custom:${waveId}`);
		drawFor = null;
		drawEditing = null;
	}

	/** Camera: pan in px, scale about the pointer. Same shape LIFE.LAB uses. */
	let cam = $state({ x: 40, y: 40, s: 1 });
	let canvasEl = $state<HTMLDivElement | undefined>();

	const GRID = 16;
	/* Wide enough for the widest selector row AND the port labels drawn inside
	   the card's edges.
	
	   136 was measured against the selectors alone, before the sockets carried
	   names: with IN and OUT taking a gutter either side, a four-knob module had
	   about 100px left for two columns of knobs and their captions, so the
	   longer ones (DECAY, DEPTH, RESO) crowded and clipped. 176 gives each knob
	   column room for its caption at the size the rest of the synth uses. */
	const NODE_W = 176;

	/* How wide a card is.
	
	   Not one width for everything. A card is 176 wide because that is what two
	   knobs side by side need, but OUT takes no settings at all -- giving it the
	   same width made a long thin strip with one socket on it, which reads as a
	   bar rather than as a module. A card with nothing to show is as wide as its
	   own name needs, which is also what makes it obvious at a glance that there
	   is nothing to set on it. */
	const NARROW_W = 96;

	/* Defined beside the catalogue, so a preset laying itself out and the canvas
	   drawing it cannot disagree about how much room a card takes. */
	const nodeWidth = moduleWidth;
	/* Port geometry, in one place because two formulas have to agree exactly:
	   the dots are laid out by CSS inside the node, and the cables are drawn in
	   SVG from portPos(). When they disagreed, every cable ended in mid-air a
	   few pixels off its socket -- so both now come from portOffset(), and the
	   header is given a fixed height rather than being left to whatever its
	   text and padding happen to measure (it came out 29px, not the 18 the
	   cables assumed).

	   BORDER is counted because `left`/`top` place the node's border box while
	   the ports are positioned inside its content box, and PORT_R is half a
	   w-3 dot, which straddles the edge so a cable meets a socket, not a wall. */
	const BORDER = 2;
	const HEADER_H = 20;
	const PORT_R = 6;
	/* Half the side of a socket's hit area: 16px, a third wider than the 12px
	   glyph, centred on the same point so a cable still meets the glyph. */
	const PORT_HIT = 8;

	/* A card is as tall as its own controls, so the ports have to be spread over
	   a height that varies per module. Computing it rather than measuring the
	   DOM keeps the cables right on the first frame, before layout has happened
	   -- but it only works if the numbers match what the card actually renders,
	   so these were measured off the rendered cards rather than estimated:
	   a knob row is 42, a segmented selector 30, the LFO curve 26 and the
	   compact ADSR panel 58, with a 4px gap between parts and 4px of padding
	   either end. */
	const KNOB_ROW_H = 42;
	const SELECTOR_H = 30;
	const FIELD_H = 18;
	const GAP = 4;
	const BODY_PAD = 4;
	/* A picture is the module, not a decoration on it.
	
	   SCOPE and FFT exist only to be looked at -- their audio passes through
	   untouched -- so 26px of trace told you a signal was present and nothing
	   else, which is what the level meter already does. A waveform needs height
	   to show its shape and a spectrum needs it to separate the bands.
	
	   The others stay small on purpose: ADSR and the LFO's curve are read
	   alongside knobs that set them, and a large one would push the controls
	   apart for no more information. */
	const VIZ_H: Record<string, number> = {
		adsr: 58,
		wave: 26,
		curve: 26,
		scope: 96,
		fft: 96,
		meter: 40
	};

	function bodyHeight(spec: ModuleSpec): number {
		const knobs = spec.params.filter((p) => !p.choices && !p.field).length;
		const fields = spec.params.filter((p) => !p.choices && p.field).length;
		const selectors = spec.params.filter((p) => p.choices).length;
		const rows = Math.ceil(knobs / 2);
		const parts: number[] = [];
		for (let i = 0; i < selectors; i++) parts.push(SELECTOR_H);
		// A typed field is one line, not a dial's two.
		if (fields) parts.push(fields * FIELD_H + (fields - 1) * 2);
		if (spec.viz) parts.push(VIZ_H[spec.viz] ?? 26);
		if (rows) parts.push(rows * KNOB_ROW_H + (rows - 1) * 2);
		/* A module with no controls still needs a card.
		
		   OUT and MONO have nothing to show -- they do one thing and take no
		   settings -- and the padding alone left an 8px sliver under the header
		   with a socket floating off its edge. A knob row is what every other
		   card is at least as tall as, so an empty one matches it. */
		/* The two text cards draw an input where their params would be, and they
		   have no params -- so the "nothing to show" fallback below would size
		   them as an empty card and leave the field hanging out of the bottom.
		   A terminal is one line; a comment is three. */
		if (spec.id === 'nodept' || spec.id === 'nodecv') return BODY_PAD * 2 + FIELD_H;
		if (spec.id === 'note') return BODY_PAD * 2 + FIELD_H * 3 + 4;
		if (!parts.length) return KNOB_ROW_H;
		return BODY_PAD * 2 + parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * GAP;
	}

	/* The computed height is only an estimate for the very first frame. Once a
	   card has laid out it reports its real height here, and the ports and
	   cables follow that instead -- so restyling a card can no longer silently
	   pull the cables off their sockets, which is exactly what the hand-counted
	   constants above did twice. */
	let measured = $state<Record<string, number>>({});

	function bodyOf(node: GraphNode, spec: ModuleSpec): number {
		/* Never below the computed height.
		
		   The measurement is what the card actually rendered as, which is the
		   right answer whenever the card has something in it -- but a module
		   with no controls renders as nothing at all, and taking that literally
		   collapsed OUT to a title bar with its socket hanging off the edge. */
		return Math.max(measured[node.id] ?? 0, bodyHeight(spec));
	}

	function nodeHeight(node: GraphNode, spec: ModuleSpec): number {
		return 2 * BORDER + HEADER_H + bodySpaced(node, spec);
	}

	/* bodyOf() is what both the ports and the cables measure against, so a card
	   whose sockets need more room than its controls take grows here rather
	   than having the ports overflow it. */
	function bodySpaced(node: GraphNode, spec: ModuleSpec): number {
		return Math.max(bodyOf(node, spec), portsHeight(spec, node));
	}

	/** Watch a card's box, so the ports track whatever it actually renders as. */
	function measure(el: HTMLElement, id: string) {
		const ro = new ResizeObserver(() => {
			const h = el.getBoundingClientRect().height / cam.s;
			if (h > 0 && Math.abs((measured[id] ?? -1) - h) > 0.5) measured = { ...measured, [id]: h };
		});
		ro.observe(el);
		return {
			destroy() {
				ro.disconnect();
			}
		};
	}

	/* Sockets never sit closer than this. Spreading them evenly over the body
	   was fine for two, but ENTRY now publishes one per lane, and four over a
	   short card put them touching -- an unlabelled column of identical dots
	   nobody could aim at or tell apart. Below this spacing the card grows
	   instead. */
	const PORT_GAP = 22;
	/* A reroute point's frame. Big enough to hold a 12px socket with a border
	   either side and still be grabbable, and no bigger -- it has to read as a
	   corner on a cable rather than as a small module. */
	const REROUTE_W = 28;
	const REROUTE_H = 24;
	/* How wide a comment is allowed to get before it wraps. Wide enough for a
	   sentence, narrow enough that one never spans the canvas. */
	const NOTE_MAX_W = 240;

	/** The centre of port i, measured from the node's border-box top-left. */
	function portOffset(node: GraphNode, spec: ModuleSpec, count: number, i: number) {
		const body = bodySpaced(node, spec);
		const even = (body / (count + 1)) * (i + 1);
		if (count < 2 || body / (count + 1) >= PORT_GAP) return BORDER + HEADER_H + even;
		// Too tight to spread: stack from the top at a fixed pitch instead.
		return BORDER + HEADER_H + PORT_GAP * (i + 0.5);
	}

	/** How tall a card must be for its own sockets to fit at PORT_GAP apart. */
	function portsHeight(spec: ModuleSpec, n: GraphNode): number {
		const count = Math.max(spec.inputs.length, outletsOf(n, spec).length);
		return count < 2 ? 0 : PORT_GAP * count;
	}

	/** Drag state: a module being moved, or a cable being pulled. */
	let dragNode = $state<{ id: string; dx: number; dy: number } | null>(null);
	let pullFrom = $state<{
		node: string;
		port: string;
		kind: PortKind;
		role: PortRole;
		x: number;
		y: number;
	} | null>(null);
	let pointer = $state({ x: 0, y: 0 });
	let paletteOpen = $state(true);
	let message = $state('');
	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	/* Says something and then stops saying it.
	
	   `message` was only ever overwritten, never cleared on a timer, and the two
	   paths that matter -- a role mismatch and a refused cycle -- leave it set.
	   So a red box parked itself over the bottom-left of the patch bay and
	   stayed there until the user happened to make a *successful* connection.
	   Every other transient on this screen clears itself. */
	function say(text: string) {
		clearTimeout(messageTimer);
		message = text;
		if (text) messageTimer = setTimeout(() => (message = ''), 2600);
	}
	/** The palette entry being dragged, for browsers that withhold dataTransfer. */
	let dragType = $state<string | null>(null);

	function toCanvas(clientX: number, clientY: number) {
		const r = canvasEl?.getBoundingClientRect();
		if (!r) return { x: 0, y: 0 };
		return { x: (clientX - r.left - cam.x) / cam.s, y: (clientY - r.top - cam.y) / cam.s };
	}

	/** Where a port sits in canvas space, so a cable can be drawn to it. */
	function portPos(nodeId: string, port: string, isOutput: boolean) {
		const n = graph.nodes.find((m) => m.id === nodeId);
		if (!n) return { x: 0, y: 0 };
		const spec = specOf(n);
		if (!spec) return { x: 0, y: 0 };
		/* A reroute has one dot standing for both its ports, so both ends of a
		   cable meet at its centre. Asking the port list would put the inlet on
		   the left edge and the outlet on the right of a 14px square, which reads
		   as a tiny card rather than as a point on a wire. */
		if (n.type === 'nodept' || n.type === 'nodecv') {
			return { x: n.x + REROUTE_W / 2 - BORDER, y: n.y + REROUTE_H / 2 - BORDER };
		}
		// The same list the sockets are drawn from, so a cable lands on its dot.
		const list = isOutput ? outletsOf(n, spec) : spec.inputs;
		const i = Math.max(
			0,
			list.findIndex((p) => p.id === port)
		);
		return {
			// The dots straddle the border, so their centres land on the node's
			// two vertical edges -- a cable meets the socket, not the wall.
			x: n.x + (isOutput ? nodeWidth(spec) : 0),
			y: n.y + portOffset(n, spec, list.length, i)
		};
	}

	/* The editing keys, LIFE.LAB's set: Delete removes, Ctrl+C/V copy and paste,
	   Ctrl+A takes everything, Escape clears. Only while the canvas has focus,
	   so they cannot fire while a name is being typed somewhere else. */
	function onKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		if (!canvasEl?.contains(target) && target !== canvasEl) return;

		const sel = $selectedNodes;
		if (e.key === 'Escape') {
			selectedNodes.set(new Set());
			selectedNode.set(null);
			selectedCable = null;
			dropSearch = null;
			e.preventDefault();
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCable !== null) {
			const at = graph.cables.findIndex((c) => cableKey(c) === selectedCable);
			if (at >= 0) removeCable(graph, at);
			selectedCable = null;
			playSound('click');
			e.preventDefault();
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) {
			deleteSelection(graph, sel, graphParams);
			playSound('click');
			e.preventDefault();
			return;
		}
		if (!(e.ctrlKey || e.metaKey)) return;
		const k = e.key.toLowerCase();
		if (k === 'z') {
			// Shift+Ctrl+Z redoes, the binding every editor on the machine uses.
			if (e.shiftKey) redoGraph();
			else undoGraph();
			playSound('click');
			e.preventDefault();
			return;
		}
		if (k === 'y') {
			redoGraph();
			playSound('click');
			e.preventDefault();
			return;
		}
		if (k === 'a') {
			selectedNodes.set(new Set(graph.nodes.map((n) => n.id)));
			e.preventDefault();
		} else if (k === 'c' && sel.size) {
			const n = copySelection(graph, sel);
			say(n ? $t('synthPatch.copied', { count: n }) : '');
			playSound('click');
			e.preventDefault();
		} else if (k === 'v') {
			const n = pasteClipboard(graph, graphParams);
			if (n) {
				say($t('synthPatch.pasted', { count: n }));
				playSound('click');
			}
			e.preventDefault();
		} else if (k === 'd' && sel.size) {
			// Duplicate: copy and paste in one gesture, which is what it is.
			copySelection(graph, sel);
			const n = pasteClipboard(graph, graphParams);
			if (n) playSound('click');
			e.preventDefault();
		} else if (k === 'g') {
			/* Blueprint's pair, and the shift key is the whole difference:
			   Ctrl+G draws a box around the selection, Ctrl+Shift+G takes the box
			   away and leaves every node where it stands. Neither moves anything,
			   because a group is scenery. */
			if (e.shiftKey) {
				/* Ungroup whichever boxes the selection is sitting in. Nothing
				   selected means nothing to ungroup -- the alternative, clearing
				   every box on the canvas, is not something anyone means by a
				   keystroke. */
				const inside = (graph.groups ?? []).filter((g) => {
					const members = groupMembers(graph, g.id, sizeOf);
					return [...members].some((id) => sel.has(id));
				});
				for (const g of inside) ungroupById(graph, g.id);
				if (inside.length) playSound('click');
			} else if (sel.size >= 2) {
				const id = groupSelection(graph, sel, $t('synthPatch.groupNamePrompt'), sizeOf);
				if (id) {
					// Straight into the title, so a new box is named rather than
					// left reading GROUP until someone thinks to rename it.
					renamingGroup = id;
					playSound('click');
				}
			} else {
				say($t('synthPatch.groupNeedsTwo'));
			}
			e.preventDefault();
		}
	}

	function onWheel(e: WheelEvent) {
		/* Zoom only when the wheel is over the canvas itself.
		
		   This is bound on the canvas and preventDefault'd unconditionally, so a
		   scrollable child inside it -- the drop-search list -- could not scroll:
		   the wheel zoomed the patch behind it instead, and a list longer than
		   its box had no way to reach the rest. Anything that wants its own
		   scrolling stops the event; this checks for that having happened. */
		/* Leave the event alone when it belongs to something that scrolls itself.
		
		   preventDefault here is what stops a scrollable child from scrolling, and
		   stopPropagation on that child cannot undo it: this handler sits on the
		   canvas, an ancestor, so by the time the child speaks the default is
		   already cancelled. Deciding from the target is the only order that
		   works -- the drop-search list is 800px of modules in a 160px box, and
		   the wheel zoomed the patch behind it instead of reaching the rest. */
		const scrollable = (e.target as HTMLElement | null)?.closest?.('[data-scrollable]');
		if (scrollable) return;
		e.preventDefault();
		const r = canvasEl?.getBoundingClientRect();
		if (!r) return;
		const mx = e.clientX - r.left;
		const my = e.clientY - r.top;
		// Zoom about the pointer: the thing under the cursor stays under it.
		const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
		const ns = Math.max(0.35, Math.min(3, cam.s * k));
		const kk = ns / cam.s;
		cam = { x: mx - (mx - cam.x) * kk, y: my - (my - cam.y) * kk, s: ns };
	}

	let panning = $state<{ x: number; y: number } | null>(null);
	/* A box being dragged on empty canvas, in canvas coordinates. */
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
	/* Where a multi-node drag started, so the whole selection moves together. */
	let groupDrag = $state<{ x: number; y: number } | null>(null);

	/* How a node measures, which is the question every geometric test on this
	   canvas asks. Written once because the marquee, the group catchment and the
	   box drawn around a dropped prefab all have to agree: three copies of this
	   is three chances for a node to be inside a box by one test and outside it
	   by another. */
	/** The text a node carries, or '' -- a reroute's name, a comment's body. */
	const labelOf = (id: string) => graphLabels?.[id] ?? '';

	/** The comment being edited inline, or null. */
	let editingNote = $state<string | null>(null);

	const sizeOf = (n: GraphNode) => {
		/* The chrome-less nodes are not cards and must not be measured as ones.
		   A reroute is its dot; a comment is however tall its text runs. Reporting
		   a card's 176x74 for either would make every group box drawn around them
		   far bigger than what it visibly encloses. */
		if (n.type === 'nodept' || n.type === 'nodecv') {
			return { w: REROUTE_W, h: REROUTE_H };
		}
		if (n.type === 'note') {
			const text = labelOf(n.id) || ' ';
			const lines = text.split('\n').length;
			/* Rough, and deliberately so: the measured height replaces this as soon
			   as the element lays out. It only has to be close enough that a box
			   drawn in the same frame is not wildly wrong. */
			return { w: Math.min(NOTE_MAX_W, 10 + text.length * 6), h: 8 + lines * 15 };
		}
		const spec = specOf(n);
		return { w: spec ? nodeWidth(spec) : NODE_W, h: spec ? nodeHeight(n, spec) : 74 };
	};

	/* A group box being dragged by its title bar.

	   `members` is captured here, on pointer-down, and held for the whole
	   gesture. Recomputing it per frame is the bug this shape exists to prevent:
	   a node stops being enclosed the moment the moving edge passes it, so the
	   box would shed its contents one at a time as it travelled and arrive
	   empty. See `moveGroup`. */
	let groupBoxDrag = $state<{
		id: string;
		members: Set<string>;
		x: number;
		y: number;
	} | null>(null);

	/* A group box being resized by its bottom-right corner.

	   No `members` here, and that is the difference from `groupBoxDrag`. A
	   resize is *how* you change what a box owns: drag the corner past a card
	   and the card joins the group, pull it back and the card is released. So
	   membership must be recomputed from the new rectangle rather than captured,
	   which is the exact opposite of what a move needs. `resizeGroup` stores
	   only the rectangle and the nodes never move. */
	let groupResize = $state<{
		id: string;
		/* Pointer offset from the corner, so the box does not jump on grab. */
		dx: number;
		dy: number;
	} | null>(null);

	/** The group whose title is being edited inline, or null. */
	let renamingGroup = $state<string | null>(null);

	/* The box as a rectangle. Shared so the live hit test, the commit and the
	   drawn outline cannot disagree about what is inside it. */
	function rectOf(m: { x0: number; y0: number; x1: number; y1: number }) {
		return {
			x: Math.min(m.x0, m.x1),
			y: Math.min(m.y0, m.y1),
			w: Math.abs(m.x1 - m.x0),
			h: Math.abs(m.y1 - m.y0)
		};
	}

	/* What was selected before the drag began: Shift adds to it, so the live
	   update has to start from it rather than from whatever the last move set. */
	let marqueeBase = $state<Set<string>>(new Set());

	/* The cable under the cursor's last click, by index. Cables are selected
	   rather than deleted on contact so you can see which one you have before it
	   goes -- one of them is the difference between a patch and silence. */
	/* The chosen cable, held as its identity rather than its position.
	
	   This was an index into `graph.cables`, and every path that removes a cable
	   -- removeCable, deleteSelection, undo, redo -- reindexes the array beneath
	   it. Selecting one cable and then deleting an earlier one left the white
	   highlight drawn on a *different* wire, and Delete then unwired that one
	   instead. A cable is what it connects, so say that. */
	let selectedCable = $state<string | null>(null);
	const cableKey = (c: { from: string; fromPort: string; to: string; toPort: string }) =>
		`${c.from}:${c.fromPort}>${c.to}:${c.toPort}`;

	let marqueeRect = $derived(
		marquee
			? {
					x: Math.min(marquee.x0, marquee.x1),
					y: Math.min(marquee.y0, marquee.y1),
					w: Math.abs(marquee.x1 - marquee.x0),
					h: Math.abs(marquee.y1 - marquee.y0)
				}
			: null
	);

	function onPointerDown(e: PointerEvent) {
		/* Right button pans, anywhere -- including over a module, since wanting to
		   move the view should not depend on finding a gap between modules. Left
		   on empty canvas pans too, which is what a hand cursor promises. */
		if (e.button === 2) {
			e.preventDefault();
			panning = { x: e.clientX - cam.x, y: e.clientY - cam.y };
			return;
		}
		if (e.button !== 0) return;
		if (e.target === canvasEl || (e.target as HTMLElement)?.dataset?.canvas === 'bg') {
			/* Left-drag on empty canvas selects, the way LIFE.LAB's does. Panning
			   is the right button, which works over a module too, so nothing is
			   lost by giving the left one to the marquee. */
			const p = toCanvas(e.clientX, e.clientY);
			marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
			if (!e.shiftKey) {
				selectedNode.set(null);
				selectedNodes.set(new Set());
			}
			// Shift keeps what was already chosen and adds to it.
			marqueeBase = e.shiftKey ? new Set(get(selectedNodes)) : new Set();
			selectedCable = null;
		}
		/* Pressing anywhere dismisses the drop-search, which otherwise had no way
		   out but Escape while its input still had focus -- click away once and it
		   was stuck on screen over the patch. */
		if (dropSearch) {
			dropSearch = null;
		}
	}

	function onPointerMove(e: PointerEvent) {
		pointer = { x: e.clientX, y: e.clientY };
		if (marquee) {
			const p = toCanvas(e.clientX, e.clientY);
			marquee = { ...marquee, x1: p.x, y1: p.y };
			/* Select as the box grows, not on release. Waiting for pointerup meant
			   dragging across six modules while nothing lit up, so there was no
			   way to tell what you were about to get until you had already got
			   it. Recomputed from the base each move rather than accumulated, so
			   shrinking the box drops what it no longer covers. */
			const hit = nodesInRect(graph, rectOf(marquee), sizeOf);
			selectedNodes.set(new Set([...marqueeBase, ...hit]));
			return;
		}
		if (groupBoxDrag) {
			const p = toCanvas(e.clientX, e.clientY);
			const nx = Math.round((p.x - groupBoxDrag.x) / GRID) * GRID;
			const ny = Math.round((p.y - groupBoxDrag.y) / GRID) * GRID;
			const box = graph.groups?.find((g) => g.id === groupBoxDrag!.id);
			if (box && (nx !== box.x || ny !== box.y)) {
				/* The members captured on press, not a fresh lookup -- the box must
				   arrive carrying what it set out with. */
				moveGroupBy(graph, groupBoxDrag.id, groupBoxDrag.members, nx - box.x, ny - box.y);
			}
			return;
		}
		if (groupResize) {
			const p = toCanvas(e.clientX, e.clientY);
			const box = graph.groups?.find((g) => g.id === groupResize!.id);
			if (box) {
				/* Only the far corner moves: x and y stay put, so the box grows and
				   shrinks from the corner under the pointer rather than sliding. */
				const w = Math.round((p.x - groupResize.dx - box.x) / GRID) * GRID;
				const h = Math.round((p.y - groupResize.dy - box.y) / GRID) * GRID;
				if (w !== box.w || h !== box.h) {
					resizeGroupTo(graph, groupResize.id, { x: box.x, y: box.y, w, h });
				}
			}
			return;
		}
		if (groupDrag && dragNode) {
			const p = toCanvas(e.clientX, e.clientY);
			const nx = Math.round((p.x - dragNode.dx) / GRID) * GRID;
			const ny = Math.round((p.y - dragNode.dy) / GRID) * GRID;
			const anchor = graph.nodes.find((n) => n.id === dragNode!.id);
			if (anchor && (nx !== anchor.x || ny !== anchor.y)) {
				moveSelection(graph, $selectedNodes, nx - anchor.x, ny - anchor.y);
			}
			return;
		}
		if (panning) {
			cam = { ...cam, x: e.clientX - panning.x, y: e.clientY - panning.y };
			return;
		}
		if (dragNode) {
			const p = toCanvas(e.clientX, e.clientY);
			// Snap to the grid, so a patch stays legible without being fiddly.
			const nx = Math.round((p.x - dragNode.dx) / GRID) * GRID;
			const ny = Math.round((p.y - dragNode.dy) / GRID) * GRID;
			moveNode(graph, dragNode.id, nx, ny);
		}
	}

	/* The browser took the pointer away mid-drag -- a touch gesture claimed by
	   scroll or zoom, a palm rejected, an OS interruption. `pointerup` never
	   arrives in that case, so without this the card kept following the cursor
	   with nothing held down and the drag's undo entry was left open. The three
	   other drag surfaces in the synth all handle it; this one did not. Ends the
	   gesture without acting on it: a cancelled drop is not a drop, so the
	   drop-search must not open. */
	function onPointerCancel() {
		marquee = null;
		panning = null;
		groupDrag = null;
		groupBoxDrag = null;
		groupResize = null;
		dragNode = null;
		pullFrom = null;
		endGraphDrag();
	}

	function onPointerUp() {
		if (marquee) {
			/* The selection is already correct -- onPointerMove has been keeping
			   it up to date as the box grew. All that is left is to name the
			   single-module case, so its knobs show without a second click. */
			const rect = rectOf(marquee);
			if (rect.w > 3 || rect.h > 3) {
				const hit = nodesInRect(graph, rect, sizeOf);
				if (hit.length === 1) selectedNode.set(hit[0]);
			}
			marquee = null;
		}
		panning = null;
		groupDrag = null;
		groupBoxDrag = null;
		groupResize = null;
		dragNode = null;
		endGraphDrag();
		/* A cable dropped on empty canvas asks what to connect, rather than
		   being thrown away.
		
		   Dropping it was the honest reading of the gesture and the least useful
		   one: you drag out of a socket because you know what you want next, and
		   the old behaviour made you cancel, find it in the palette, place it,
		   then come back and draw the cable again. The search lists only modules
		   with a socket that can take what is being held, so the answer is
		   always a working connection. */
		if (pullFrom) {
			const overNode = graph.nodes.some((n) => {
				const spec = specOf(n);
				if (!spec) return false;
				const h = nodeHeight(n, spec);
				const p = toCanvas(pointer.x, pointer.y);
				return (
					p.x >= n.x - PORT_R &&
					p.x <= n.x + nodeWidth(spec) + PORT_R &&
					p.y >= n.y &&
					p.y <= n.y + h
				);
			});
			if (!overNode) {
				const p = toCanvas(pointer.x, pointer.y);
				dropSearch = { from: pullFrom, x: p.x, y: p.y, screenX: pointer.x, screenY: pointer.y };
				searchQuery = '';
			}
		}
		pullFrom = null;
	}

	/* The drop-search: where the cable was let go, and what it is carrying. */
	let dropSearch = $state<{
		from: { node: string; port: string; kind: PortKind; role: PortRole };
		x: number;
		y: number;
		screenX: number;
		screenY: number;
	} | null>(null);
	let searchQuery = $state('');

	/** Modules with an inlet this cable could land on, filtered by the query. */
	let searchHits = $derived.by(() => {
		const d = dropSearch;
		if (!d) return [];
		const q = searchQuery.trim().toLowerCase();
		return PALETTE_SPECS.filter((spec) => {
			if (insideMacro && !allowedInMacro(spec.id)) return false;
			const takes = landingOn(spec, d.from.role) !== null;
			if (!takes) return false;
			if (!q) return true;
			return spec.label.toLowerCase().includes(q) || spec.id.toLowerCase().includes(q);
		}).slice(0, 40);
	});

	/* Where a cable of this role would land on a module, or null if nowhere.
	
	   A knob counts. Every parameter is reachable by cable now, so a value
	   dragged into empty space should offer the modules whose *knobs* it could
	   drive, not only those with a matching socket -- otherwise ENTRY's VEL
	   offers almost nothing, which is the opposite of the truth. */
	function landingOn(spec: ModuleSpec, role: PortRole): { id: string; kind: PortKind } | null {
		const inlet = spec.inputs.find((i) => rolesCompatible(role, roleOf(i)));
		if (inlet) return { id: inlet.id, kind: inlet.kind };
		/* A knob a cable can actually drive: not a selector, not a typed literal,
		   and not one read once when the note starts. It used to take whichever
		   knob was declared first, so dropping a cable on SEQ offered its GAP and
		   on SCOPE its SPAN -- neither of which the engine reads through a param
		   at all, so the cable landed and did nothing. */
		const knob = spec.params.find((q) => !q.choices && !q.field && !q.fixed);
		if (knob && rolesCompatible(role, 'cv')) return { id: knob.key, kind: 'mod' };
		return null;
	}

	/** Place the chosen module where the cable was dropped and wire it up. */
	function placeFromSearch(spec: ModuleSpec) {
		const d = dropSearch;
		if (!d) return;
		const inlet = landingOn(spec, d.from.role);
		if (!inlet) return;
		const x = Math.round((d.x - 8) / GRID) * GRID;
		const y = Math.round((d.y - 20) / GRID) * GRID;
		const id = addNode(graph, spec.id, x, y);
		// addNode committed a new graph; wire against that one, not the stale copy.
		const next = editedView(get(currentTrack), get(macroPath)).graph;
		addCable(
			next,
			{ from: d.from.node, fromPort: d.from.port, to: id, toPort: inlet.id },
			inlet.kind
		);
		selectedNode.set(id);
		dropSearch = null;
		playSound('click');
	}

	function startDrag(e: PointerEvent, n: GraphNode) {
		// Right button belongs to the canvas: panning must work wherever the
		// pointer happens to be, and a module under it is not a reason to refuse.
		if (e.button === 2) return;
		e.stopPropagation();
		const p = toCanvas(e.clientX, e.clientY);
		// One history entry for the whole drag, not one per frame.
		beginGraphDrag();
		dragNode = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
		selectedNode.set(n.id);
		/* Shift adds to the selection; clicking a module already in one keeps it,
		   so a group can be dragged by any of its members. Clicking outside the
		   selection starts a new one. */
		selectedNodes.update((prev) => {
			if (e.shiftKey) {
				const next = new Set(prev);
				if (next.has(n.id)) next.delete(n.id);
				else next.add(n.id);
				return next;
			}
			return prev.has(n.id) ? prev : new Set([n.id]);
		});
		groupDrag = get(selectedNodes).size > 1 ? { x: p.x, y: p.y } : null;
	}

	function startCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
		if (e.button === 2) return;
		e.stopPropagation();
		const p = portPos(nodeId, port, true);
		const n = graph.nodes.find((m) => m.id === nodeId);
		const spec = n && specOf(n);
		const socket = spec && outletsOf(n, spec).find((o) => o.id === port);
		pullFrom = {
			node: nodeId,
			port,
			kind,
			role: socket ? roleOf(socket) : 'signal',
			x: p.x,
			y: p.y
		};
	}

	function endCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
		e.stopPropagation();
		if (!pullFrom) return;
		/* Roles, not just families.
		
		   This compared `kind` alone, and exec is carried on cables whose ends
		   are exec pins -- so ENTRY's THEN landed happily on OUTPUT's audio
		   inlet, drawing a cable that could never carry anything. canLand()
		   already knew better and was only being used to dim the sockets, which
		   is the worst of both: the interface said no and the drop said yes. */
		const node = graph.nodes.find((n) => n.id === nodeId);
		const target = (node && specOf(node))?.inputs.find((p) => p.id === port);
		if (!target || !rolesCompatible(pullFrom.role, roleOf(target))) {
			// Audio into a mod inlet is not a patching mistake worth guessing at:
			// they are different signals with different ranges.
			say($t('synthPatch.mismatch'));
			pullFrom = null;
			return;
		}
		const res = addCable(
			graph,
			{ from: pullFrom.node, fromPort: pullFrom.port, to: nodeId, toPort: port },
			kind
		);
		say(
			res === 'cycle'
				? $t('synthPatch.cycle')
				: res === 'duplicate'
					? $t('synthPatch.duplicate')
					: res === 'shared-activation'
						? $t('synthPatch.sharedActivation')
						: ''
		);
		if (res === 'ok') playSound('click');
		pullFrom = null;
	}

	function place(type: string) {
		/* Clicking the palette drops into the first free cell of a grid rather
		   than onto a fixed point: the old 12px stagger was smaller than a card
		   is wide, so clicking several entries buried them in a pile. Columns
		   run left to right, then wrap. */
		const r = canvasEl?.getBoundingClientRect();
		const origin = toCanvas((r?.left ?? 0) + 40, (r?.top ?? 0) + 40);
		const COL = NODE_W + 48;
		const ROW = 200;
		const perRow = Math.max(1, Math.floor(((r?.width ?? 800) / cam.s - 40) / COL));
		const taken = new Set(graph.nodes.map((n) => `${n.x},${n.y}`));
		for (let i = 0; i < 200; i++) {
			const x = Math.round((origin.x + (i % perRow) * COL) / GRID) * GRID;
			const y = Math.round((origin.y + Math.floor(i / perRow) * ROW) / GRID) * GRID;
			if (taken.has(`${x},${y}`)) continue;
			selectedNode.set(addNode(graph, type, x, y));
			playSound('click');
			return;
		}
	}

	function portStyle(p: { kind: PortKind; role?: PortRole }) {
		return PORT_STYLE[roleOf(p)];
	}

	/* Can the cable being dragged land here? Answered while dragging rather than
	   on release, so an inlet that cannot take what you are holding dims before
	   you try it instead of returning an error afterwards. */
	function canLand(p: { kind: PortKind; role?: PortRole }): boolean {
		if (!pullFrom) return false;
		return rolesCompatible(pullFrom.role, roleOf(p));
	}

	/* ENTRY's outlets are not fixed: it publishes one CV socket per lane the
	   track carries, so a curve drawn in the roll can be cabled to any knob.
	   Every other module's ports come straight from its spec. */
	function outletsOf(n: GraphNode, spec: ModuleSpec) {
		/* CONST's outlet is whatever type it was set to, so a pitch constant
		   carries a pitch socket and will not drop onto an amount. */
		if (n.type === 'const') {
			const k = CONST_KINDS[Math.round(graphParams?.[`${n.id}.kind`] ?? 0)] ?? CONST_KINDS[0];
			return spec.outputs.map((p) => ({ ...p, role: k.role, label: k.label }));
		}
		if (n.type !== 'in') return spec.outputs;
		/* One VEL, not two.
		
		   The velocity lane and a key's own velocity are the same quantity read
		   two ways: the engine takes the lane when the part is playing back and
		   the key press when it is played live. Drawing both put two sockets
		   reading "VEL" next to each other that could only ever carry the same
		   number, so the lane's own outlet is dropped and ENTRY's VEL pin is it.
		   Every other lane still gets a socket, because those have no pin. */
		return [
			...spec.outputs,
			...$trackLanes
				.filter((l) => l.id !== VELOCITY_LANE_ID)
				.map((l) => ({
					id: laneSocketId(l.id),
					label: l.name,
					kind: 'mod' as const,
					role: 'cv' as const
				}))
		];
	}

	/* A cable is drawn as what it carries.
	
	   The sockets say this already; the cables did not -- they only split mod
	   from audio, and a lane outlet is not in spec.outputs at all so it fell
	   through to the default grey. On a patch with a dozen cables that made the
	   interesting ones (an envelope into a cutoff, a lane into a level) the
	   hardest to follow. Same palette as the sockets, so a wire and the socket
	   it leaves are obviously the same thing. */
	function cableRole(c: GraphCable): PortRole {
		const from = graph.nodes.find((n) => n.id === c.from);
		const spec = from && specOf(from);
		if (!spec) return 'signal';
		const socket = outletsOf(from, spec).find((o) => o.id === c.fromPort);
		return socket ? roleOf(socket) : 'signal';
	}

	/** A cable's path: horizontal-ish bezier, so it reads as a cable not a line. */
	function cablePath(a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
		return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
	}

	let liveEnd = $derived(pullFrom ? toCanvas(pointer.x, pointer.y) : null);
</script>

<svelte:window
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerCancel}
/>

<div class="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden">
	<!-- The editing toolbar.
	
	     The canvas has had LIFE.LAB's editing set for a while -- marquee, group
	     move, copy, paste, duplicate, delete -- but every one of them was a
	     keyboard shortcut with nothing on screen to say so, which is the same as
	     not having them unless you already knew. The buttons name the gestures
	     and carry the bindings in their tooltips. -->
	<div class="flex items-center gap-1 shrink-0 text-[10px] font-mono">
		{#key $historyVersion}
			<button
				onclick={() => {
					undoGraph();
					playSound('click');
				}}
				disabled={!canUndo($activeTrackId)}
				class="press px-1.5 py-0.5 border rounded-xs font-bold transition-colors {canUndo(
					$activeTrackId
				)
					? 'border-white/25 text-white/70 hover:text-white hover:border-white/60 cursor-pointer'
					: 'border-white/10 text-white/20 cursor-default'}"
				title={$t('synthPatch.undoHint')}>UNDO</button
			>
			<button
				onclick={() => {
					redoGraph();
					playSound('click');
				}}
				disabled={!canRedo($activeTrackId)}
				class="press px-1.5 py-0.5 border rounded-xs font-bold transition-colors {canRedo(
					$activeTrackId
				)
					? 'border-white/25 text-white/70 hover:text-white hover:border-white/60 cursor-pointer'
					: 'border-white/10 text-white/20 cursor-default'}"
				title={$t('synthPatch.redoHint')}>REDO</button
			>
		{/key}

		<div class="w-px h-3.5 bg-white/15 mx-0.5"></div>

		{#each [['COPY', () => copySelection(graph, $selectedNodes), $t('synthPatch.copyHint')], ['PASTE', () => pasteClipboard(graph, graphParams), $t('synthPatch.pasteHint')], ['DUPE', () => {
					copySelection(graph, $selectedNodes);
					pasteClipboard(graph, graphParams);
				}, $t('synthPatch.dupeHint')]] as [label, run, hint] (label)}
			<button
				onclick={() => {
					(run as () => void)();
					playSound('click');
				}}
				class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
				title={hint as string}>{label}</button
			>
		{/each}

		<button
			onclick={() => {
				deleteSelection(graph, $selectedNodes, graphParams);
				playSound('click');
			}}
			class="press px-1.5 py-0.5 border border-[#e06c75]/50 text-[#e06c75] hover:border-[#e06c75] rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.deleteHint')}>DEL</button
		>

		<div class="w-px h-3.5 bg-white/15 mx-0.5"></div>

		<!-- Grouping and saving, the two halves of this feature.

		     GROUP draws a box around what is selected; PREFAB saves the same
		     selection to the shelf so it can be dropped into another patch. They
		     sit together because they are the same question asked at two
		     timescales -- "these belong together here" and "these belong
		     together always". -->
		<button
			onclick={() => {
				const id = groupSelection(graph, $selectedNodes, $t('synthPatch.groupNamePrompt'), sizeOf);
				if (id) {
					renamingGroup = id;
					playSound('click');
				} else say($t('synthPatch.groupNeedsTwo'));
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.groupHint')}>GROUP</button
		>
		<!-- The other half of the pair. A node belongs to one box and only
		     ungrouping releases it, so this is how you get a node out of a group
		     as well as how you remove the box -- which makes it the more
		     load-bearing of the two buttons, not an afterthought. -->
		<button
			onclick={() => {
				const n = ungroupSelection(graph, $selectedNodes);
				if (n) playSound('click');
				else say($t('synthPatch.ungroupNothing'));
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.ungroupHint')}>UNGRP</button
		>
		<button
			onclick={() => {
				const saved = saveSelectionAsPrefab(
					graph,
					$selectedNodes,
					$t('synthPatch.prefabNamePrompt'),
					graphParams
				);
				if (saved) {
					say($t('synthPatch.prefabSaved'));
					playSound('click');
				} else say($t('synthPatch.groupNeedsTwo'));
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.savePrefabHint')}>PREFAB</button
		>
		<!-- A macro: the selection as one card, used as many times as it is
		     placed. MACRO collapses it, EXPAND puts an instance's insides back,
		     and a double-click opens one to edit every instance at once. -->
		<button
			onclick={() => {
				const r = collapseSelection(graph, $selectedNodes, graphParams, graphWaves, graphLabels);
				if (r === 'exec') say($t('synthPatch.macroExec'));
				else if (r === 'empty') say($t('synthPatch.macroEmpty'));
				else playSound('click');
			}}
			class="press px-1.5 py-0.5 border border-[#56b6c2]/50 text-[#56b6c2] hover:border-[#56b6c2] rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.macroHint')}>MACRO</button
		>
		<button
			onclick={() => {
				const n = expandSelection(graph, $selectedNodes, graphParams, graphWaves, graphLabels);
				if (n) playSound('click');
				else say($t('synthPatch.expandNothing'));
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.expandHint')}>EXPAND</button
		>

		<div class="w-px h-3.5 bg-white/15 mx-0.5"></div>

		<button
			onclick={() => {
				selectedNodes.set(new Set(graph.nodes.map((n) => n.id)));
				playSound('click');
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.selectAllHint')}>ALL</button
		>
		<button
			onclick={() => {
				selectedNodes.set(new Set());
				selectedNode.set(null);
				playSound('click');
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.selectNoneHint')}>NONE</button
		>

		<span class="text-white/35 ml-1">{$selectedNodes.size ? `${$selectedNodes.size} SEL` : ''}</span
		>

		<span class="flex-1"></span>

		<button
			onclick={() => {
				cam = { x: 40, y: 40, s: 1 };
				playSound('click');
			}}
			class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white hover:border-white/60 rounded-xs font-bold cursor-pointer transition-colors"
			title={$t('synthPatch.resetViewHint')}>FIT</button
		>
	</div>

	{#if insideMacro}
		<!-- Where the canvas is: inside a macro's definition, which every
		     instance of it shares. The name edits in place. -->
		<div
			class="flex items-center gap-1.5 px-1.5 py-0.5 border border-[#56b6c2]/50 bg-[#56b6c2]/10 rounded-xs text-[10px] font-mono"
		>
			<button
				onclick={() => {
					leaveMacro(true);
					playSound('click');
				}}
				class="press px-1.5 py-0.5 border border-white/25 text-white/70 hover:text-white rounded-xs font-bold cursor-pointer"
				title={$t('synthPatch.macroTopHint')}>{$t('synthPatch.macroTop')}</button
			>
			{#each $macroPath as defId, i (defId + i)}
				<span class="text-white/35">/</span>
				{#if i === $macroPath.length - 1}
					<input
						value={insideMacro.name}
						maxlength="4"
						onchange={(e) => renameMacro(defId, (e.target as HTMLInputElement).value)}
						onkeydown={(e) => e.stopPropagation()}
						class="w-12 bg-black/60 border border-[#56b6c2]/60 rounded-xs px-1 text-[#56b6c2] font-black uppercase outline-none"
						title={$t('synthPatch.macroRenameHint')}
					/>
				{:else}
					<button
						onclick={() => {
							macroPath.set($macroPath.slice(0, i + 1));
							playSound('click');
						}}
						class="text-[#56b6c2] font-black cursor-pointer hover:underline"
						>{graphOf($currentTrack).macros?.[defId]?.name ?? '?'}</button
					>
				{/if}
			{/each}
			<span class="text-white/45 ml-1">{$t('synthPatch.macroInsideNote')}</span>
			<span class="flex-1"></span>
			<button
				onclick={() => {
					leaveMacro();
					playSound('click');
				}}
				class="press px-1.5 py-0.5 border border-[#56b6c2]/60 text-[#56b6c2] rounded-xs font-bold cursor-pointer"
				title={$t('synthPatch.macroBackHint')}>{$t('synthPatch.macroBack')}</button
			>
		</div>
	{/if}

	<div class="flex-1 min-h-0 flex gap-1.5 overflow-hidden">
		<!-- The workspace. role="application" with a tabindex is what a canvas that
	     takes keys is: the rule is written for plain divs. -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={canvasEl}
			data-canvas="bg"
			data-tour="synth-canvas"
			role="application"
			tabindex="-1"
			onwheel={onWheel}
			onkeydown={onKeyDown}
			onpointerdown={onPointerDown}
			oncontextmenu={(e) => e.preventDefault()}
			ondragover={(e) => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			}}
			ondrop={(e) => {
				e.preventDefault();
				const type = e.dataTransfer?.getData('text/plain') || dragType;
				if (!type) return;
				/* A prefab and a module both arrive as a string on the same drag,
				   so the payload says which it is. Prefixed rather than guessed
				   from the id: a prefab key the player named the same as a module
				   would otherwise place the module. */
				if (type.startsWith('prefab:')) {
					const p = toCanvas(e.clientX, e.clientY);
					const dropped = dropPrefab(
						graph,
						type.slice(7),
						{
							x: Math.round((p.x - NODE_W / 2) / GRID) * GRID,
							y: Math.round((p.y - 40) / GRID) * GRID
						},
						graphParams,
						sizeOf
					);
					/* The box was sized from `bodyHeight`'s estimate, because at the
					   moment of the drop none of these cards existed to measure. Once
					   they have laid out, grow it to whatever they turned out to be --
					   MAP renders taller than its estimate, and a member that pokes
					   out of the bottom is disowned by full containment and left
					   behind when the box is dragged. See `refitGroup`. */
					/* `groupId` is null for a one-node prefab, which gets no box -- and
					   with no box there is nothing to refit. */
					if (dropped?.groupId) {
						const { ids, groupId } = dropped;
						/* Two frames, not one. `measured` is written by a ResizeObserver,
						   which does not report until after the frame that laid the cards
						   out -- so a single rAF still reads the spec estimates and the
						   refit is a no-op. Waiting for the observer is what makes this
						   fire against real heights. */
						requestAnimationFrame(() =>
							requestAnimationFrame(() => refitGroupTo(graph, groupId, ids, sizeOf))
						);
					}
					dragType = null;
					playSound('click');
					return;
				}
				// Where it was dropped, snapped -- so a patch stays legible.
				const p = toCanvas(e.clientX, e.clientY);
				selectedNode.set(
					addNode(
						graph,
						type,
						Math.round((p.x - NODE_W / 2) / GRID) * GRID,
						Math.round((p.y - 40) / GRID) * GRID
					)
				);
				dragType = null;
				playSound('click');
			}}
			class="relative flex-1 min-w-0 overflow-hidden rounded-xs border border-white/10 bg-black/60 cursor-grab active:cursor-grabbing"
			style="background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px); background-size: {GRID *
				cam.s}px {GRID * cam.s}px; background-position: {cam.x}px {cam.y}px"
		>
			<!-- Group boxes, under everything.

		     Behind the cables as well as the cards, which is the only stacking
		     that works: a box is a region of the canvas, so anything drawn on
		     that region has to sit on top of it or the box hides the patch it is
		     describing. Blueprint draws comment boxes the same way.

		     Only the title bar takes pointer events. The body stays transparent
		     to them, so clicking inside a box still reaches the canvas
		     underneath -- a marquee started in the middle of a group must select
		     nodes rather than drag the box. -->
			<div
				class="absolute inset-0 pointer-events-none"
				style="transform: translate({cam.x}px, {cam.y}px) scale({cam.s}); transform-origin: 0 0"
			>
				{#each graph.groups ?? [] as g (g.id)}
					{@const tint = g.color ?? '#61afef'}
					<div
						class="absolute rounded-xs border-2"
						style="left: {g.x}px; top: {g.y}px; width: {g.w}px; height: {g.h}px; border-color: color-mix(in srgb, {tint} 45%, transparent); background: color-mix(in srgb, {tint} 7%, transparent)"
					>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute left-0 right-0 top-0 flex items-center px-1.5 font-black text-[10px] font-mono truncate pointer-events-auto cursor-move select-none"
							style="height: {GROUP_HEADER}px; background: color-mix(in srgb, {tint} 22%, transparent); color: {tint}"
							onpointerdown={(e) => {
								if (e.button !== 0) return;
								e.stopPropagation();
								const p = toCanvas(e.clientX, e.clientY);
								beginGraphDrag();
								/* Membership read once, here. See groupBoxDrag. */
								groupBoxDrag = {
									id: g.id,
									members: groupMembers(graph, g.id, sizeOf),
									x: p.x - g.x,
									y: p.y - g.y
								};
							}}
							ondblclick={() => (renamingGroup = g.id)}
						>
							{#if renamingGroup === g.id}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									autofocus
									value={g.label}
									onblur={(e) => {
										setGroupLabel(graph, g.id, (e.target as HTMLInputElement).value);
										renamingGroup = null;
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
										if (e.key === 'Escape') renamingGroup = null;
										e.stopPropagation();
									}}
									onpointerdown={(e) => e.stopPropagation()}
									class="flex-1 min-w-0 bg-black/60 outline-none font-black text-[10px] px-0.5"
									style="color: {tint}"
								/>
							{:else}
								<span class="flex-1 truncate">{g.label}</span>
								<!-- Two buttons, and the difference between them is the
								     whole design: one removes the box, the other removes
								     the box and what it holds. Separating them is why
								     deleting a group cannot silently take a patch with
								     it. -->
								<button
									onpointerdown={(e) => e.stopPropagation()}
									onclick={() => {
										ungroupById(graph, g.id);
										playSound('click');
									}}
									title={$t('synthPatch.ungroupHint')}
									class="press px-1 hover:text-white cursor-pointer">⊘</button
								>
								<button
									onpointerdown={(e) => e.stopPropagation()}
									onclick={() => {
										deleteGroupAndMembers(graph, g.id, sizeOf, graphParams);
										playSound('click');
									}}
									title={$t('synthPatch.deleteHint')}
									class="press px-1 text-[#e06c75] hover:text-white cursor-pointer">×</button
								>
							{/if}
						</div>
						<!-- The resize grip. Bottom-right only: one corner is enough to
						     size a box, and four would each need their own anchor rule
						     for a gesture nobody performs on a comment box. It is how a
						     box's *membership* is edited too -- drag it over a card and
						     the card joins, pull back and it is released, which is why
						     `groupResize` deliberately does not capture members. -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute bottom-0 right-0 pointer-events-auto cursor-nwse-resize"
							style="width: 14px; height: 14px; background: linear-gradient(135deg, transparent 50%, color-mix(in srgb, {tint} 60%, transparent) 50%)"
							title={$t('synthPatch.resizeHint')}
							onpointerdown={(e) => {
								if (e.button !== 0) return;
								e.stopPropagation();
								const p = toCanvas(e.clientX, e.clientY);
								beginGraphDrag();
								groupResize = { id: g.id, dx: p.x - (g.x + g.w), dy: p.y - (g.y + g.h) };
							}}
						></div>
					</div>
				{/each}
			</div>

			<!-- Cables sit under the modules: a cable must never cover a knob. -->
			<svg class="absolute inset-0 w-full h-full pointer-events-none" style="overflow: visible">
				<g transform="translate({cam.x} {cam.y}) scale({cam.s})">
					{#each graph.cables as c, i (i)}
						{@const a = portPos(c.from, c.fromPort, true)}
						{@const b = portPos(c.to, c.toPort, false)}
						{@const role = cableRole(c)}
						{@const isControl = role === 'cv'}
						<!-- A wide invisible path takes the clicks. A cable is 1.5-2.5px
					     wide, which is far below what anyone can reliably hit with a
					     mouse, so the visible line is left to look right and this
					     carries the hit area. -->
						<path
							d={cablePath(a, b)}
							fill="none"
							stroke="transparent"
							stroke-width="14"
							class="pointer-events-auto cursor-pointer"
							role="button"
							tabindex="-1"
							aria-label={$t('synthPatch.cableHint')}
							onclick={(e) => {
								/* Click selects; a second click on the same cable, or Delete,
							   removes it. Deleting outright meant a mis-aimed click on a
							   crowded patch silently unwired something, with nothing shown
							   first and only undo to notice it by. */
								if (selectedCable === cableKey(c)) {
									removeCable(graph, i);
									selectedCable = null;
								} else {
									selectedCable = cableKey(c);
									selectedNodes.set(new Set());
									selectedNode.set(null);
								}
								e.stopPropagation();
								playSound('click');
							}}
							onkeydown={() => {}}
						/>
						<path
							d={cablePath(a, b)}
							fill="none"
							stroke={selectedCable === cableKey(c) ? '#ffffff' : PORT_STYLE[role].color}
							stroke-width={selectedCable === cableKey(c)
								? 3.5
								: role === 'exec'
									? 3
									: isControl
										? 1.5
										: 2.5}
							stroke-dasharray={role === 'cv' ? '4 3' : undefined}
							opacity={selectedCable === cableKey(c) ? 1 : 0.8}
							class="pointer-events-none"
						/>
					{/each}
					{#if pullFrom && liveEnd}
						<path
							d={cablePath({ x: pullFrom.x, y: pullFrom.y }, liveEnd)}
							fill="none"
							stroke={PORT_STYLE[pullFrom.role].color}
							stroke-width="2"
							stroke-dasharray="5 4"
							opacity="0.7"
						/>
					{/if}
				</g>
			</svg>

			<!-- Modules.
		
		     pointer-events-none on the layer, restored on each card. The layer
		     stretches over the whole canvas, so it was swallowing every press
		     that landed between the cards: onPointerDown only starts a marquee
		     when the target is the canvas itself, and the target was always this
		     div instead. Dragging on empty canvas did nothing at all, which is
		     the bug -- the cards still get their own events because each one
		     turns them back on. -->
			<div
				class="absolute inset-0 pointer-events-none"
				style="transform: translate({cam.x}px, {cam.y}px) scale({cam.s}); transform-origin: 0 0"
			>
				{#each graph.nodes as n (n.id)}
					{@const spec = specOf(n)}
					{#if spec && (n.type === 'nodept' || n.type === 'nodecv')}
						<!-- A reroute point: a mini card, not a bare dot.

						     The frame is what makes the two gestures separable. With only
						     a socket drawn, a press on it had to mean either "move this"
						     or "pull a cable from here" and there was nowhere to put the
						     other one. So the border is the handle you drag and the dot in
						     the middle is the thing you pull from -- the same division of
						     labour every other card already has, shrunk to fit.

						     Still far smaller than a module, because that is the point: it
						     is a corner on a wire, and a corner that looked like a filter
						     would make a tidy patch less readable rather than more. -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute border-2 bg-black/85 rounded-xs select-none pointer-events-auto cursor-grab {$selectedNode ===
								n.id || $selectedNodes.has(n.id)
								? 'shadow-[0_0_0_2px_#61afef,0_0_10px_rgba(97,175,239,0.5)]'
								: ''}"
							style="left: {n.x}px; top: {n.y}px; width: {REROUTE_W}px; height: {REROUTE_H}px; border-color: {spec.color}{$selectedNode ===
							n.id
								? ''
								: '80'}"
							onpointerdown={(e) => startDrag(e, n)}
						>
							<!-- The socket, centred. Inlet and outlet at one point, which is
							     what makes this a reroute rather than a two-port module: a
							     cable arrives and a cable leaves from the same place. -->
							<button
								onpointerdown={(e) => {
									e.stopPropagation();
									startCable(e, n.id, 'out', n.type === 'nodept' ? 'audio' : 'mod');
								}}
								onpointerup={(e) =>
									endCable(
										e,
										n.id,
										n.type === 'nodept' ? 'in' : 'a',
										n.type === 'nodept' ? 'audio' : 'mod'
									)}
								title={labelOf(n.id) || spec.label}
								class="absolute flex items-center justify-center cursor-crosshair pointer-events-auto"
								style="left: {REROUTE_W / 2 - PORT_HIT - BORDER}px; top: {REROUTE_H / 2 -
									PORT_HIT -
									BORDER}px; width: {PORT_HIT * 2}px; height: {PORT_HIT * 2}px"
							>
								<!-- Drawn as what it carries, like every other socket: a
								     sound reroute is a signal circle, a value one a cv diamond. -->
								<span
									class="block w-3 h-3 pointer-events-none transition-all {portStyle(spec.inputs[0])
										.shape} {pullFrom && !canLand(spec.inputs[0]) ? 'opacity-25' : ''} {pullFrom &&
									canLand(spec.inputs[0])
										? 'scale-125 shadow-[0_0_6px_currentColor]'
										: ''}"
									style="color: {portStyle(spec.inputs[0]).color}; background: {portStyle(
										spec.inputs[0]
									).color}"
								></span>
							</button>
							<!-- The name, outside the frame so it never crowds the socket. -->
							{#if labelOf(n.id)}
								<span
									class="absolute text-[8px] font-mono font-bold leading-none whitespace-nowrap pointer-events-none"
									style="left: {REROUTE_W + 4}px; top: {REROUTE_H / 2 -
										4 -
										BORDER}px; color: {spec.color}">{labelOf(n.id)}</span
								>
							{/if}
						</div>
					{:else if spec && n.type === 'note'}
						<!-- A comment: a mini window, for the same reason the reroute has
						     one. Without a frame there is nowhere to press that means
						     "move this" as opposed to "edit this", and a label you cannot
						     reposition is a label in the wrong place forever.

						     So the frame drags and a double-click edits. It is deliberately
						     plainer than a module -- no header, no glyph, no delete button
						     in the corner -- because it is not in the signal path and
						     should not compete with the cards that are. -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute border bg-black/85 rounded-xs select-none pointer-events-auto {editingNote ===
							n.id
								? 'cursor-text'
								: 'cursor-grab'} {$selectedNode === n.id || $selectedNodes.has(n.id)
								? 'shadow-[0_0_0_2px_#61afef,0_0_10px_rgba(97,175,239,0.5)]'
								: ''}"
							style="left: {n.x}px; top: {n.y}px; max-width: {NOTE_MAX_W}px; border-color: {spec.color}80"
							onpointerdown={(e) => {
								if (editingNote !== n.id) startDrag(e, n);
							}}
							ondblclick={() => (editingNote = n.id)}
						>
							{#if editingNote === n.id}
								<!-- svelte-ignore a11y_autofocus -->
								<textarea
									autofocus
									value={labelOf(n.id)}
									oninput={(e) => {
										const el = e.target as HTMLTextAreaElement;
										setGraphLabel(graphLabels, n.id, el.value);
										/* Grow to fit. Reset first, or the box can only ever get
										   taller -- the scrollHeight of an over-tall element is its
										   own height, so deleting a line would never shrink it. */
										el.style.height = 'auto';
										el.style.height = `${el.scrollHeight}px`;
									}}
									onblur={() => (editingNote = null)}
									onkeydown={(e) => {
										/* Enter inserts a newline rather than committing: a comment
										   is allowed to be several lines, and there is nothing here
										   that a stray line break can break. Escape is how you
										   leave. */
										if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
										e.stopPropagation();
									}}
									onpointerdown={(e) => e.stopPropagation()}
									placeholder={$t('synthPatch.notePlaceholder')}
									class="block bg-transparent px-1 py-0.5 font-mono text-[11px] leading-snug outline-none resize-none overflow-hidden"
									style="color: {spec.color}; width: {NOTE_MAX_W}px"></textarea>
							{:else}
								<!-- `whitespace-pre`, not `pre-wrap`. The box around this has a
								     max-width but the text itself has no width of its own, so it
								     shrink-wraps to its narrowest possible layout -- and with
								     wrapping on, that is one word per line. "LFO OUT" came out
								     as two lines, which reads as though the space had been typed
								     as a newline. Explicit newlines still break, because `pre`
								     honours them; what it will not do is invent one. -->
								<div
									class="px-1 py-0.5 font-mono text-[11px] leading-snug whitespace-pre min-w-[40px]"
									style="color: {spec.color}{labelOf(n.id) ? '' : '60'}"
								>
									{labelOf(n.id) || $t('synthPatch.notePlaceholder')}
								</div>
							{/if}
						</div>
					{:else if spec}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute border-2 bg-black/85 rounded-xs select-none pointer-events-auto {$selectedNodes.has(
								n.id
							)
								? 'shadow-[0_0_0_2px_#61afef,0_0_10px_rgba(97,175,239,0.5)]'
								: $selectedNode === n.id
									? 'shadow-[0_0_10px_rgba(97,175,239,0.5)]'
									: ''}"
							style="left: {n.x}px; top: {n.y}px; width: {nodeWidth(spec)}px; height: {nodeHeight(
								n,
								spec
							)}px; border-color: {spec.color}{$selectedNode === n.id ? '' : '80'}"
							onpointerdown={(e) => startDrag(e, n)}
							ondblclick={() => {
								// A macro opens on a double-click, as a collapsed graph does in Blueprint.
								if (n.type === 'macro' && n.macro) {
									enterMacro(n.macro);
									playSound('click');
								}
							}}
						>
							<div
								class="flex items-center justify-between px-1 border-b text-[10px] font-black cursor-grab overflow-hidden"
								style="height: {HEADER_H}px; color: {spec.color}; border-color: {spec.color}40"
							>
								<span>{spec.label}</span>
								<span class="flex items-center gap-1">
									<!-- The same glyph the palette shows, so a placed module is
								     recognisable at a glance on a crowded canvas. -->
									<ModuleIcon type={n.type} size={9} color={spec.color} />
									{#if !isFixedNode(graph, n.id)}
										<button
											onpointerdown={(e) => {
												if (e.button !== 2) e.stopPropagation();
											}}
											onclick={() => {
												removeNode(graph, n.id, graphParams);
												playSound('click');
											}}
											class="text-[#e06c75] hover:text-white cursor-pointer leading-none"
											title={$t('synthPatch.removeHint')}>×</button
										>
									{/if}
								</span>
							</div>

							<!-- Ports: inputs down the left, outputs down the right. Positioned
						     from portOffset() against the node's own top, which is what
						     portPos() draws the cables to -- one formula, one place. -->
							<div
								class="absolute pointer-events-none"
								style="left: {-BORDER}px; top: {-BORDER}px; width: {nodeWidth(
									spec
								)}px; height: {nodeHeight(n, spec)}px"
							>
								<!-- Each socket carries its own name. Four identical dots in a
							     column cannot be told apart or aimed at, and the tooltip only
							     helped once you had already found the right one. Inlets label
							     to the right of the dot, outlets to the left, both inside the
							     card where there is room. Shape says the family: a round dot
							     is audio, a diamond is control. -->
								{#each spec.inputs as p, i (p.id)}
									{@const y = portOffset(n, spec, spec.inputs.length, i)}
									<!-- The hit area is a plain square; the glyph inside it carries
									     the shape. A clip-path clips hit testing too, so a socket
									     that was its own glyph could only be caught on the glyph --
									     half of PITCH's step, a sliver of BOOL's tick. -->
									<button
										onpointerdown={(e) => {
											if (e.button !== 2) e.stopPropagation();
										}}
										onpointerup={(e) => endCable(e, n.id, p.id, p.kind)}
										title={p.label}
										class="absolute flex items-center justify-center cursor-crosshair pointer-events-auto"
										style="left: {-PORT_HIT}px; top: {y - PORT_HIT}px; width: {PORT_HIT *
											2}px; height: {PORT_HIT * 2}px"
									>
										<span
											class="block w-3 h-3 pointer-events-none transition-opacity {portStyle(p)
												.shape} {pullFrom && !canLand(p) ? 'opacity-25' : ''} {pullFrom &&
											canLand(p)
												? 'scale-125 shadow-[0_0_6px_currentColor]'
												: ''}"
											style="color: {portStyle(p).color}; background: {portStyle(p).color}"
										></span>
									</button>
									<span
										class="absolute text-[7px] font-mono font-bold leading-none pointer-events-none whitespace-nowrap"
										style="left: {PORT_R + 8}px; top: {y - 3.5}px; color: {portStyle(p).color}99"
										>{p.label}</span
									>
								{/each}
								{#each outletsOf(n, spec) as p, i (p.id)}
									{@const y = portOffset(n, spec, outletsOf(n, spec).length, i)}
									<button
										onpointerdown={(e) => startCable(e, n.id, p.id, p.kind)}
										title={p.label}
										class="absolute flex items-center justify-center cursor-crosshair pointer-events-auto"
										style="left: {nodeWidth(spec) - PORT_HIT}px; top: {y -
											PORT_HIT}px; width: {PORT_HIT * 2}px; height: {PORT_HIT * 2}px"
									>
										<span
											class="block w-3 h-3 pointer-events-none {portStyle(p).shape}"
											style="color: {portStyle(p).color}; background: {portStyle(p).color}"
										></span>
									</button>
									<span
										class="absolute text-[7px] font-mono font-bold leading-none pointer-events-none whitespace-nowrap text-right"
										style="right: {PORT_R + 8}px; top: {y - 3.5}px; color: {portStyle(p).color}99"
										>{p.label}</span
									>
								{/each}
							</div>
							<div use:measure={n.id}>
								<ModuleCard
									{spec}
									nodeId={n.id}
									params={graphParams}
									waves={graphWaves}
									labels={graphLabels}
									inlet={inletOf}
									claimed={claimedOf}
									wired={wiredOf}
									onParam={(key, value) => setGraphParam(graphParams, n.id, key, value)}
									onWave={(key, value) => setGraphWave(graphWaves, n.id, key, value)}
									onLabel={(value) => setGraphLabel(graphLabels, n.id, value)}
									onDrawWave={(key, editing) => openWaveDraw(n.id, key, editing)}
								/>
							</div>
						</div>
					{/if}
				{/each}
			</div>

			<!-- Dropped a cable on empty canvas: what should it connect to?
		     Only modules with a socket that can take what is held, so whatever is
		     picked is wired and working rather than merely placed. -->
			<!-- The selection box, in its own layer above the modules.
		
		     It lived in the cable SVG, which is deliberately under the cards so a
		     cable never covers a knob -- which meant the marquee was drawn under
		     them too and vanished behind every module it was being dragged
		     across, exactly where you most need to see it. -->
			{#if marqueeRect}
				<svg
					class="absolute inset-0 w-full h-full pointer-events-none z-10"
					style="overflow: visible"
				>
					<g transform="translate({cam.x} {cam.y}) scale({cam.s})">
						<rect
							x={marqueeRect.x}
							y={marqueeRect.y}
							width={marqueeRect.w}
							height={marqueeRect.h}
							fill="rgba(97,175,239,0.10)"
							stroke="#61afef"
							stroke-width="1"
							stroke-dasharray="4 3"
							vector-effect="non-scaling-stroke"
						/>
					</g>
				</svg>
			{/if}

			{#if dropSearch}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute z-30 w-44 border border-white/25 rounded-xs bg-black shadow-lg"
					style="left: {Math.min(
						dropSearch.screenX - (canvasEl?.getBoundingClientRect().left ?? 0),
						(canvasEl?.clientWidth ?? 400) - 180
					)}px; top: {Math.min(
						dropSearch.screenY - (canvasEl?.getBoundingClientRect().top ?? 0),
						(canvasEl?.clientHeight ?? 400) - 220
					)}px"
					onpointerdown={(e) => e.stopPropagation()}
				>
					<div class="flex items-center border-b border-white/15">
						<!-- svelte-ignore a11y_autofocus -->
						<input
							autofocus
							bind:value={searchQuery}
							onkeydown={(e) => {
								if (e.key === 'Escape') dropSearch = null;
								if (e.key === 'Enter' && searchHits[0]) placeFromSearch(searchHits[0]);
								e.stopPropagation();
							}}
							placeholder={$t('synthPatch.searchPlaceholder')}
							class="flex-1 min-w-0 px-1.5 py-1 bg-black text-white text-[10px] font-mono outline-none placeholder:text-white/30"
						/>
						<button
							onclick={() => {
								dropSearch = null;
								playSound('click');
							}}
							class="press px-1.5 py-1 text-[#e06c75] hover:text-white cursor-pointer leading-none text-xs"
							title={$t('synthPatch.searchCloseHint')}>×</button
						>
					</div>
					<div data-scrollable class="max-h-40 overflow-y-auto custom-scrollbar">
						{#each searchHits as spec (spec.id)}
							<button
								onclick={() => placeFromSearch(spec)}
								class="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10px] font-mono font-bold text-left hover:bg-white/10 cursor-pointer transition-colors"
								style="color: {spec.color}"
							>
								<ModuleIcon type={spec.id} size={9} color={spec.color} />
								<span>{spec.label}</span>
							</button>
						{:else}
							<div class="px-1.5 py-2 text-[10px] text-white/35">{$t('synthPatch.searchNone')}</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if message}
				<div
					class="absolute bottom-1 left-1 text-[10px] text-[#e06c75] bg-black/80 px-1.5 py-0.5 rounded-xs"
				>
					{message}
				</div>
			{/if}
			{#if !graph.nodes.length}
				<div
					class="absolute inset-0 flex items-center justify-center text-[11px] text-white/30 pointer-events-none"
				>
					{$t('synthPatch.emptyCanvas')}
				</div>
			{/if}
		</div>

		<!-- The palette, on the right like LIFE.LAB's library. -->
		<!-- Two columns: thirty modules in one column ran past the height of the
	     canvas beside it, so most of the palette was below the fold.

	     200px, not 168: at 168 each button gave its name 49px, and TO-PITCH
	     wants 64, so the two converters were the only modules in the palette
	     the user could not read the name of -- they rendered as TO-PIT… and
	     TO-FRE…. The names are what the column is scanned by, so the column
	     is sized to the longest one rather than the names cut to the column. -->
		<div
			data-tour="synth-palette"
			class="shrink-0 flex flex-col gap-1 {paletteOpen ? 'w-[200px]' : 'w-6'} transition-all"
		>
			<button
				onclick={() => (paletteOpen = !paletteOpen)}
				class="press text-[9px] text-white/40 hover:text-white border border-white/15 rounded-xs py-0.5 cursor-pointer"
				>{paletteOpen ? '▶' : '◀'}</button
			>
			{#if paletteOpen}
				<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
					<!-- The prefab shelf, above the primitives.

					     First in the column on purpose. A prefab is where most
					     patches actually start -- it is the shape you wanted, and the
					     primitives below are what you reach for to change it. Putting
					     it under thirty modules would make it the thing you find
					     after rebuilding it by hand.

					     Listed apart from MODULE_GROUPS rather than as another group
					     in it, because these are not modules. A prefab has no ports,
					     no spec, and nothing in the graph after it lands. -->
					{#if $allPrefabs.length}
						<div>
							<div
								class="text-[8px] uppercase tracking-wider text-white/30 border-b border-white/10 pb-0.5 mb-1"
							>
								{$t('synthPatch.prefabsTitle')}
							</div>
							<div class="grid grid-cols-2 gap-0.5">
								{#each $allPrefabs as p (p.key)}
									{@const tint = p.color ?? '#abb2bf'}
									<div class="flex items-center gap-0.5 min-w-0">
										<button
											draggable="true"
											ondragstart={(e) => {
												e.dataTransfer?.setData('text/plain', `prefab:${p.key}`);
												dragType = `prefab:${p.key}`;
											}}
											ondragend={() => (dragType = null)}
											onclick={() => {
												/* Placed in the middle of the view when clicked
												   rather than dragged -- the same shortcut the
												   module buttons offer, for when you do not care
												   where it lands yet. */
												const r = canvasEl?.getBoundingClientRect();
												const p0 = toCanvas(
													(r?.left ?? 0) + (r?.width ?? 400) / 2,
													(r?.top ?? 0) + (r?.height ?? 400) / 2
												);
												dropPrefab(
													graph,
													p.key,
													{
														x: Math.round(p0.x / GRID) * GRID,
														y: Math.round(p0.y / GRID) * GRID
													},
													graphParams,
													sizeOf
												);
												playSound('click');
											}}
											title={p.note ? $t(p.note) : $t('synthPatch.prefabDropHint')}
											class="press flex-1 min-w-0 px-1.5 py-0.5 border rounded-xs text-[10px] font-black cursor-grab active:cursor-grabbing bg-black/40 hover:bg-white/10 text-left truncate"
											style="border-color: {tint}55; color: {tint}">{p.label}</button
										>
										{#if p.custom}
											<button
												onclick={() => {
													deletePrefab(p.key);
													playSound('click');
												}}
												title={$t('synthPatch.prefabDeleteHint')}
												class="press px-1 text-[#e06c75]/70 hover:text-[#e06c75] cursor-pointer text-[10px]"
												>×</button
											>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
					{#each MODULE_GROUPS as g (g)}
						{@const mods = PALETTE_SPECS.filter(
							(m) => m.group === g && (!insideMacro || allowedInMacro(m.id))
						)}
						{#if mods.length}
							<div>
								<div
									class="text-[8px] uppercase tracking-wider text-white/30 border-b border-white/10 pb-0.5 mb-1"
								>
									{g}
								</div>
								<div class="grid grid-cols-2 gap-0.5">
									{#each mods as m (m.id)}
										{@const capped = m.id === 'in' && hasKeyEvent}
										<!-- Draggable as well as clickable: dragging says where it goes,
									     clicking is the shortcut when you do not care yet. KEY-EVENT
									     stops being either once one already exists on the canvas --
									     `place`/`ondragstart` both no-op under the same condition, so
									     greying it out here is not just cosmetic. -->
										<button
											draggable={!capped}
											ondragstart={(e) => {
												if (capped) return;
												e.dataTransfer?.setData('text/plain', m.id);
												dragType = m.id;
											}}
											ondragend={() => (dragType = null)}
											onclick={() => {
												if (capped) return;
												place(m.id);
											}}
											disabled={capped}
											title={capped ? $t('synthPatch.keyEventCapped') : $t(m.descKey)}
											class="press w-full px-1.5 py-0.5 border rounded-xs text-[10px] font-black flex items-center justify-between gap-1 {capped
												? 'opacity-30 cursor-not-allowed'
												: 'cursor-grab active:cursor-grabbing bg-black/40 hover:bg-white/10'}"
											style="border-color: {m.color}55; color: {m.color}"
										>
											<!-- Name left, glyph right: the eye scans the column of names
										     and the icons line up as a second column of shapes. -->
											<span class="truncate">{m.label}</span>
											<ModuleIcon type={m.id} />
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

{#if drawFor}
	<WaveDrawDialog
		initial={drawEditing}
		forLabel={drawFor.node.toUpperCase()}
		onSave={onSaveWave}
		onClose={() => {
			drawFor = null;
			drawEditing = null;
		}}
	/>
{/if}

<style>
	/* Blueprint's execution pin: a chevron rather than a dot, because execution
	   is the one thing on the canvas that has a direction. A round socket says
	   "something connects here"; this says which way it goes. */
	:global(.clip-chevron) {
		clip-path: polygon(0% 0%, 55% 0%, 100% 50%, 55% 100%, 0% 100%, 40% 50%);
	}

	/* Two channels on one cable, drawn as two rings. Countable at a glance,
	   which is the question a stereo socket is actually answering. */
	:global(.port-stereo) {
		box-shadow:
			0 0 0 1px #000,
			0 0 0 2.5px currentColor;
	}

	/* A pitch is discrete -- a step on a scale, not a point on a continuum. */
	:global(.clip-step) {
		clip-path: polygon(0% 50%, 50% 50%, 50% 0%, 100% 0%, 100% 50%, 50% 50%, 50% 100%, 0% 100%);
	}

	/* A frequency points somewhere on a continuum. */
	:global(.clip-triangle) {
		clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
	}

	/* A count -- discrete, so a shape with sides you could number. */
	:global(.clip-hex) {
		clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
	}

	/* A length of time: a bar, as a duration is drawn on any timeline. */
	:global(.clip-capsule) {
		clip-path: inset(24% 0% round 999px);
	}

	/* True or false: a tick. */
	:global(.clip-tick) {
		clip-path: polygon(0% 52%, 20% 32%, 40% 52%, 80% 10%, 100% 30%, 40% 92%);
	}
</style>
