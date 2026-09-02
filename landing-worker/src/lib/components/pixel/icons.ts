// Crisp pixel-style icon path data (16x16 viewBox unless noted). Mechanical port of the
// original PixelIcons.tsx — only icons actually rendered somewhere in the app are kept.
export const PIXEL_ICON_PATHS = {
	blog: 'M3 1h8l3 3v11H3V1zm2 2v10h8V5h-3V3H5zm2 4h4v1H7V7zm0 2h4v1H7V9zm0 2h3v1H7v-1z',
	agent: 'M7 1h2v2H7V1zm-4 3h10v9H3V4zm2 2v5h6V6H5zm1 1h1v1H6V7zm3 0h1v1H9V7zm-2 2h2v1H7V9zm-6-2h1v3H1V7zm14 0h1v3h-1V7z',
	// share.krsz.in: a file going up into storage. Scattered pixels in a box
	// read as a stray logo rather than an upload relay.
	vault: 'M7 1h2v1h-2zM6 2h4v1h-4zM5 3h6v1h-6zM4 4h2v1h-2zM7 4h2v1h-2zM10 4h2v1h-2zM7 5h2v1h-2zM7 6h2v1h-2zM2 8h11v1h-11zM2 9h1v1h-1zM12 9h1v1h-1zM2 10h1v1h-1zM4 10h3v1h-3zM8 10h3v1h-3zM12 10h1v1h-1zM2 11h1v1h-1zM12 11h1v1h-1zM2 12h1v1h-1zM4 12h3v1h-3zM8 12h3v1h-3zM12 12h1v1h-1zM2 13h1v1h-1zM12 13h1v1h-1zM2 14h11v1h-11z',
	video: 'M1 3h14v10H1V3zm2 2v6h10V5H3zm3 1l4 2-4 2V6z',
	mail: 'M1 3h14v10H1V3zm2 2v1l5 4 5-4V5H3zm0 3v3h10V8L8 12 3 8z',
	// A solid ruled document, the rule lines cut through the fill as gaps
	// rather than drawn as a hollow outline with thin separate strokes --
	// the earlier version only used about two-thirds of the 16x16 canvas
	// and read noticeably thinner/smaller than the other footer icons at
	// the same render size.
	rules: 'M1 1h13v1h-13zM1 2h13v1h-13zM1 3h13v1h-13zM1 4h3v1h-3zM11 4h3v1h-3zM1 5h13v1h-13zM1 6h13v1h-13zM1 7h3v1h-3zM11 7h3v1h-3zM1 8h13v1h-13zM1 9h13v1h-13zM1 10h3v1h-3zM11 10h3v1h-3zM1 11h13v1h-13zM1 12h13v1h-13zM1 13h13v1h-13z',
	audio: 'M1 6h2v4H1V6zm3-2h2v8H4V4zm3-3h2v14H7V1zm3 3h2v10h-2V4zm3 2h2v4h-2V6z',
	arrowUpRight: 'M6 3h7v7h-2V6.4L4.4 13 3 11.6 9.6 5H6V3z',
	// The Octocat's head: rounded skull, two pointed ears, two eyes, two
	// curled legs beneath -- the ears and curled legs are what make this
	// read as GitHub's mark specifically rather than a generic round face
	// (the previous version, despite its comment's intent, still rendered
	// as a featureless blob with straight peg legs).
	github: 'M2 2h2v1h-2zM12 2h2v1h-2zM2 3h3v1h-3zM11 3h3v1h-3zM2 4h4v1h-4zM10 4h4v1h-4zM3 5h10v1h-10zM2 6h12v1h-12zM1 7h14v1h-14zM1 8h2v1h-2zM4 8h8v1h-8zM13 8h2v1h-2zM0 9h16v1h-16zM0 10h2v1h-2zM3 10h10v1h-10zM14 10h2v1h-2zM0 11h16v1h-16zM0 12h16v1h-16zM1 13h14v1h-14zM2 14h3v1h-3zM6 14h4v1h-4zM11 14h3v1h-3zM3 15h2v1h-2zM11 15h2v1h-2z',
	// The hugging-face emoji: a round face with a horizontal band across
	// it, and two separate curled shapes at the bottom corners standing
	// in for the hugging-face emoji's hands -- disconnected from the face
	// by design so the eye reads them as a separate hand element rather
	// than part of the face outline.
	huggingface: 'M6 1h4v1h-4zM5 2h6v1h-6zM4 3h8v1h-8zM3 4h10v1h-10zM2 5h12v1h-12zM1 6h2v1h-2zM5 6h6v1h-6zM13 6h2v1h-2zM1 7h14v1h-14zM1 8h2v1h-2zM5 8h6v1h-6zM13 8h2v1h-2zM2 9h12v1h-12zM3 10h2v1h-2zM11 10h2v1h-2zM0 12h2v1h-2zM14 12h2v1h-2zM0 13h3v1h-3zM13 13h3v1h-3zM1 14h3v1h-3zM12 14h3v1h-3zM2 15h2v1h-2zM12 15h2v1h-2z',
	help: 'M5 2h6v1H5V2zM4 3h1v2H4V3zm7 0h1v3h-1V3zM9 6h2v1H9V6zM8 7h2v1H8V7zm-1 1h2v3H7V8zm0 4h2v2H7v-2z',
	// A solid IC chip with block pins on all four sides -- the earlier
	// version was a thin single-pixel outline with hairline pins that read
	// noticeably lighter than the other footer icons at the same size.
	hardware:
		'M2 0h2v1h-2zM6 0h2v1h-2zM10 0h2v1h-2zM2 1h2v1h-2zM6 1h2v1h-2zM10 1h2v1h-2zM1 3h14v1h-14zM1 4h14v1h-14zM1 5h14v1h-14zM1 6h14v1h-14zM1 7h14v1h-14zM1 8h14v1h-14zM1 9h14v1h-14zM1 10h14v1h-14zM1 11h14v1h-14zM2 13h2v1h-2zM6 13h2v1h-2zM10 13h2v1h-2zM2 14h2v1h-2zM6 14h2v1h-2zM10 14h2v1h-2z'
} as const;

export type PixelIconName = keyof typeof PIXEL_ICON_PATHS;
