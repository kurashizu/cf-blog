/**
 * Ten alternate block-letter renderings of KRSZ (different figlet fonts),
 * one picked at random per page load so the mark isn't always identical --
 * generated offline with figlet, each letter composed separately so the
 * per-letter color ranges (see stores/theme.ts's KRSZ_LETTER_COLORS) stay
 * exact regardless of the font's own per-letter kerning.
 *
 * Laid out two-by-two -- K R over S Z -- rather than as one line. Across the
 * ten fonts the single-line forms ran from 23 to 46 columns wide, so the mark
 * changed size on every load and the widest ones simply did not fit the
 * sidebar they sit in. Folding halves the width and squares the block, which
 * both keeps them in the panel and makes the ten agree with each other.
 *
 * Because the two halves are stacked, a column range now names a letter in
 * BOTH rows: columns 0..cellW-1 are K on the top row and S on the bottom.
 * Consumers colour by column and row -- see `rowsPerHalf`.
 */

export interface KrszMark {
	font: string;
	art: string;
	/** Rows in each half: art.split('\n').slice(0, rowsPerHalf) is the K R row. */
	rowsPerHalf: number;
	colorRanges: { from: number; to: number; letter: 'K' | 'R' | 'S' | 'Z' }[];
}

export const KRSZ_MARKS: KrszMark[] = [
	{
		font: "ANSI Shadow",
		art: "██╗  ██╗██████╗ \n██║ ██╔╝██╔══██╗\n█████╔╝ ██████╔╝\n██╔═██╗ ██╔══██╗\n██║  ██╗██║  ██║\n╚═╝  ╚═╝╚═╝  ╚═╝\n███████╗███████╗\n██╔════╝╚══███╔╝\n███████╗  ███╔╝ \n╚════██║ ███╔╝  \n███████║███████╗\n╚══════╝╚══════╝",
		rowsPerHalf: 6,
		colorRanges: [{"letter":"K","from":0,"to":7},{"letter":"R","from":8,"to":15},{"letter":"S","from":0,"to":7},{"letter":"Z","from":8,"to":15}]
	},
	{
		font: "Doom",
		art: " _   ________ \n| | / /| ___ \\\n| |/ / | |_/ /\n|    \\ |    / \n| |\\  \\| |\\ \\ \n\\_| \\_/\\_| \\_|\n _____  ______\n/  ___||___  /\n\\ `--.    / / \n `--. \\  / /  \n/\\__/ /./ /___\n\\____/ \\_____/",
		rowsPerHalf: 6,
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":13},{"letter":"S","from":0,"to":6},{"letter":"Z","from":7,"to":13}]
	},
	{
		font: "Big",
		art: "  _  __    _____  \n | |/ /   |  __ \\ \n | ' /    | |__) |\n |  <     |  _  / \n | . \\    | | \\ \\ \n |_|\\_\\   |_|  \\_\\\n   _____   ______ \n  / ____| |___  / \n | (___      / /  \n  \\___ \\    / /   \n  ____) |  / /__  \n |_____/  /_____| ",
		rowsPerHalf: 6,
		colorRanges: [{"letter":"K","from":0,"to":8},{"letter":"R","from":9,"to":17},{"letter":"S","from":0,"to":8},{"letter":"Z","from":9,"to":17}]
	},
	{
		font: "Standard",
		art: "  _  __   ____  \n | |/ /  |  _ \\ \n | ' /   | |_) |\n | . \\   |  _ < \n |_|\\_\\  |_| \\_\\\n  ____    _____ \n / ___|  |__  / \n \\___ \\    / /  \n  ___) |  / /_  \n |____/  /____| ",
		rowsPerHalf: 5,
		colorRanges: [{"letter":"K","from":0,"to":7},{"letter":"R","from":8,"to":15},{"letter":"S","from":0,"to":7},{"letter":"Z","from":8,"to":15}]
	},
	{
		font: "Chunky",
		art: " __  __   ______  \n|  |/  | |   __ \\ \n|     <  |      < \n|__|\\__| |___|__| \n _______  _______ \n|     __||__     |\n|__     ||     __|\n|_______||_______|",
		rowsPerHalf: 4,
		colorRanges: [{"letter":"K","from":0,"to":8},{"letter":"R","from":9,"to":17},{"letter":"S","from":0,"to":8},{"letter":"Z","from":9,"to":17}]
	},
	{
		font: "Ogre",
		art: "          __  \n  /\\ /\\  /__\\ \n / //_/ / \\// \n/ __ \\ / _  \\ \n\\/  \\/ \\/ \\_/ \n __     _____ \n/ _\\   / _  / \n\\ \\    \\// /  \n_\\ \\    / //\\ \n\\__/   /____/ ",
		rowsPerHalf: 5,
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":13},{"letter":"S","from":0,"to":6},{"letter":"Z","from":7,"to":13}]
	},
	{
		font: "Slant",
		art: "    __ __    ____ \n   / //_/   / __ \\\n  / ,<     / /_/ /\n / /| |   / _, _/ \n/_/ |_|  /_/ |_|  \n   _____  _____   \n  / ___/ /__  /   \n  \\__ \\    / /    \n ___/ /   / /__   \n/____/   /____/   ",
		rowsPerHalf: 5,
		colorRanges: [{"letter":"K","from":0,"to":8},{"letter":"R","from":9,"to":17},{"letter":"S","from":0,"to":8},{"letter":"Z","from":9,"to":17}]
	},
	{
		font: "Block",
		art: " _|    _|   _|_|_|    \n _|  _|     _|    _|  \n _|_|       _|_|_|    \n _|  _|     _|    _|  \n _|    _|   _|    _|  \n   _|_|_|   _|_|_|_|_|\n _|               _|  \n   _|_|         _|    \n       _|     _|      \n _|_|_|     _|_|_|_|_|",
		rowsPerHalf: 5,
		colorRanges: [{"letter":"K","from":0,"to":10},{"letter":"R","from":11,"to":21},{"letter":"S","from":0,"to":10},{"letter":"Z","from":11,"to":21}]
	},
	{
		font: "Bulbhead",
		art: " _  _  ____ \n( )/ )(  _ \\\n )  (  )   /\n(_)\\_)(_)\\_)\n ___   ____ \n/ __) (_   )\n\\__ \\  / /_ \n(___/ (____)",
		rowsPerHalf: 4,
		colorRanges: [{"letter":"K","from":0,"to":5},{"letter":"R","from":6,"to":11},{"letter":"S","from":0,"to":5},{"letter":"Z","from":6,"to":11}]
	},
	{
		font: "Modular",
		art: " ___   _   ______   \n|   | | | |    _ |  \n|   |_| | |   | ||  \n|      _| |   |_||_ \n|     |_  |    __  |\n|    _  | |   |  | |\n|___| |_| |___|  |_|\n _______   _______  \n|       | |       | \n|  _____| |____   | \n| |_____   ____|  | \n|_____  | | ______| \n _____| | | |_____  \n|_______| |_______| ",
		rowsPerHalf: 7,
		colorRanges: [{"letter":"K","from":0,"to":9},{"letter":"R","from":10,"to":19},{"letter":"S","from":0,"to":9},{"letter":"Z","from":10,"to":19}]
	}
];
