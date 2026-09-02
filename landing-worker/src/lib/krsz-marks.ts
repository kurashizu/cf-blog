/**
 * Ten alternate block-letter renderings of KRSZ (different figlet fonts),
 * one picked at random per page load so the mark isn't always identical --
 * generated offline with figlet, each letter composed separately so the
 * per-letter color ranges (see stores/theme.ts's KRSZ_LETTER_COLORS) stay
 * exact regardless of the font's own per-letter kerning.
 */

export interface KrszMark {
	font: string;
	art: string;
	colorRanges: { from: number; to: number; letter: 'K' | 'R' | 'S' | 'Z' }[];
}

export const KRSZ_MARKS: KrszMark[] = [
	{
		font: "ANSI Shadow",
		art: "██╗  ██╗██████╗ ███████╗███████╗\n██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝\n█████╔╝ ██████╔╝███████╗  ███╔╝ \n██╔═██╗ ██╔══██╗╚════██║ ███╔╝  \n██║  ██╗██║  ██║███████║███████╗\n╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝",
		colorRanges: [{"letter":"K","from":0,"to":7},{"letter":"R","from":8,"to":15},{"letter":"S","from":16,"to":23},{"letter":"Z","from":24,"to":31}]
	},
	{
		font: "Doom",
		art: " _   ________  _____  ______\n| | / /| ___ \\/  ___||___  /\n| |/ / | |_/ /\\ `--.    / / \n|    \\ |    /  `--. \\  / /  \n| |\\  \\| |\\ \\ /\\__/ /./ /___\n\\_| \\_/\\_| \\_|\\____/ \\_____/",
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":13},{"letter":"S","from":14,"to":20},{"letter":"Z","from":21,"to":27}]
	},
	{
		font: "Big",
		art: "  _  __  _____     _____   ______\n | |/ / |  __ \\   / ____| |___  /\n | ' /  | |__) | | (___      / / \n |  <   |  _  /   \\___ \\    / /  \n | . \\  | | \\ \\   ____) |  / /__ \n |_|\\_\\ |_|  \\_\\ |_____/  /_____|",
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":15},{"letter":"S","from":16,"to":24},{"letter":"Z","from":25,"to":32}]
	},
	{
		font: "Standard",
		art: "  _  __  ____    ____    _____\n | |/ / |  _ \\  / ___|  |__  /\n | ' /  | |_) | \\___ \\    / / \n | . \\  |  _ <   ___) |  / /_ \n |_|\\_\\ |_| \\_\\ |____/  /____|",
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":14},{"letter":"S","from":15,"to":22},{"letter":"Z","from":23,"to":29}]
	},
	{
		font: "Chunky",
		art: " __  __  ______  _______  _______ \n|  |/  ||   __ \\|     __||__     |\n|     < |      <|__     ||     __|\n|__|\\__||___|__||_______||_______|",
		colorRanges: [{"letter":"K","from":0,"to":7},{"letter":"R","from":8,"to":15},{"letter":"S","from":16,"to":24},{"letter":"Z","from":25,"to":33}]
	},
	{
		font: "Ogre",
		art: "          __   __     _____\n  /\\ /\\  /__\\ / _\\   / _  /\n / //_/ / \\// \\ \\    \\// / \n/ __ \\ / _  \\ _\\ \\    / //\\\n\\/  \\/ \\/ \\_/ \\__/   /____/",
		colorRanges: [{"letter":"K","from":0,"to":6},{"letter":"R","from":7,"to":13},{"letter":"S","from":14,"to":20},{"letter":"Z","from":21,"to":26}]
	},
	{
		font: "Slant",
		art: "    __ __    ____    _____ _____\n   / //_/   / __ \\  / ___//__  /\n  / ,<     / /_/ /  \\__ \\   / / \n / /| |   / _, _/  ___/ /  / /__\n/_/ |_|  /_/ |_|  /____/  /____/",
		colorRanges: [{"letter":"K","from":0,"to":8},{"letter":"R","from":9,"to":17},{"letter":"S","from":18,"to":25},{"letter":"Z","from":26,"to":31}]
	},
	{
		font: "Block",
		art: " _|    _|   _|_|_|       _|_|_|   _|_|_|_|_|  \n _|  _|     _|    _|   _|               _|    \n _|_|       _|_|_|       _|_|         _|      \n _|  _|     _|    _|         _|     _|        \n _|    _|   _|    _|   _|_|_|     _|_|_|_|_|  ",
		colorRanges: [{"letter":"K","from":0,"to":10},{"letter":"R","from":11,"to":21},{"letter":"S","from":22,"to":32},{"letter":"Z","from":33,"to":45}]
	},
	{
		font: "Bulbhead",
		art: " _  _  ____  ___  ____ \n( )/ )(  _ \\/ __)(_   )\n )  (  )   /\\__ \\ / /_ \n(_)\\_)(_)\\_)(___/(____)",
		colorRanges: [{"letter":"K","from":0,"to":5},{"letter":"R","from":6,"to":11},{"letter":"S","from":12,"to":16},{"letter":"Z","from":17,"to":22}]
	},
	{
		font: "Modular",
		art: " ___   _  ______    _______  _______ \n|   | | ||    _ |  |       ||       |\n|   |_| ||   | ||  |  _____||____   |\n|      _||   |_||_ | |_____  ____|  |\n|     |_ |    __  ||_____  || ______|\n|    _  ||   |  | | _____| || |_____ \n|___| |_||___|  |_||_______||_______|",
		colorRanges: [{"letter":"K","from":0,"to":8},{"letter":"R","from":9,"to":18},{"letter":"S","from":19,"to":27},{"letter":"Z","from":28,"to":36}]
	},
];
