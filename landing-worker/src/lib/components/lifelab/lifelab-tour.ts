import type { Step } from '../chrome/Onboarding.svelte';

/**
 * LIFE.LAB's own walkthrough, shown by the `?` beside the board controls.
 *
 * Conway's rule is the one thing a newcomer has to be told -- everything after
 * it follows from watching -- so it goes first, stated exactly. The rest names
 * the four things on screen that are not self-evident. Every anchor is a
 * `data-tour` attribute, set in the markup or, for the toolbar, in main.js
 * where those controls are built.
 */
export const LIFELAB_TOUR: Step[] = [
	{
		target: 'll-dish',
		title: 'THE DISH',
		body: 'A 320x200 bounded grid running Conway’s Life. Every generation, each cell looks at its eight neighbours: a live cell with two or three stays alive, a dead cell with exactly three comes to life, and everything else dies. That single rule is the whole simulation — nothing here is scripted.',
		keys: [{ key: 'B3/S23', desc: 'born on 3 neighbours, survives on 2 or 3' }],
		color: '#56b6c2'
	},
	{
		target: 'll-run',
		title: 'RUNNING IT',
		body: 'RUN advances continuously, STEP moves exactly one generation so you can follow a pattern cell by cell, and BACK rewinds. SOUP fills the dish with noise, which is the quickest way to see what the rule does on its own. SPD cycles the rate.',
		keys: [
			{ key: 'SPD', desc: '2, 8, 30, 120 or 480 generations a second' },
			{ key: 'CLEAR', desc: 'empty the dish and start over' }
		],
		color: '#98c379'
	},
	{
		target: 'll-tools',
		title: 'DRAWING',
		body: 'PAN drags the view. DRAW paints live cells, and clears one you click on, so you can seed a shape by hand and watch what it becomes. SELECT drags a box around cells and picks them up: drag to move, R and F to turn, Delete to remove, Enter to drop. Pick a pattern from the tray instead and it follows the cursor until you click. Ctrl+Z undoes any of it.',
		color: '#e5c07b'
	},
	{
		target: 'll-tray',
		title: 'THE LIBRARY',
		body: 'Verified patterns, from still lifes that never change through oscillators and gliders to the Gosper gun that emits one forever. Click one to pick it up, click the dish to place it, and click the same entry again to put it down.',
		color: '#c678dd'
	},
	{
		target: 'll-stats',
		title: 'WHAT TO WATCH',
		body: 'GEN counts generations elapsed and POP the cells currently alive. POP settling to a constant means the dish has reached a still life or a loop; POP falling to zero means it died out. Both are read off the board, not estimated.',
		color: '#61afef'
	},
	{
		target: 'll-log',
		title: 'THE LOG',
		body: 'A record of what the dish just did, floating over the bottom-left corner so it never takes room from the board. Collapse it with the button in its heading when you want the whole dish.',
		color: '#d19a66'
	}
];
