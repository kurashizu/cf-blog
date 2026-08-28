// Crisp pixel-style icon path data (16x16 viewBox unless noted). Mechanical port of the
// original PixelIcons.tsx — only icons actually rendered somewhere in the app are kept.
export const PIXEL_ICON_PATHS = {
	blog: 'M3 1h8l3 3v11H3V1zm2 2v10h8V5h-3V3H5zm2 4h4v1H7V7zm0 2h4v1H7V9zm0 2h3v1H7v-1z',
	agent: 'M7 1h2v2H7V1zm-4 3h10v9H3V4zm2 2v5h6V6H5zm1 1h1v1H6V7zm3 0h1v1H9V7zm-2 2h2v1H7V9zm-6-2h1v3H1V7zm14 0h1v3h-1V7z',
	vault: 'M2 2h12v12H2V2zm2 2v8h8V4H4zm3 2h2v1H7V6zm-1 2h1v1H6V8zm3 0h1v1H9V8zm-2 1h2v1H7V9zm1-5h1v1H8V4zm0 6h1v1H8v-1z',
	video: 'M1 3h14v10H1V3zm2 2v6h10V5H3zm3 1l4 2-4 2V6z',
	mail: 'M1 3h14v10H1V3zm2 2v1l5 4 5-4V5H3zm0 3v3h10V8L8 12 3 8z',
	rules: 'M2 2h12v12H2V2zm2 2v8h3V4H4zm5 0v8h3V4H9zm-1 0v8h1V4H8zm-3 2h1v1H5V6zm0 2h1v1H5V8zm5-2h1v1h-1V6zm0 2h1v1h-1V8z',
	audio: 'M1 6h2v4H1V6zm3-2h2v8H4V4zm3-3h2v14H7V1zm3 3h2v10h-2V4zm3 2h2v4h-2V6z',
	arrowUpRight: 'M6 3h7v7h-2V6.4L4.4 13 3 11.6 9.6 5H6V3z',
	github: 'M5 1h6v1H5V1zm-2 2h2v1H3V3zm8 0h2v1h-2V3zM2 4h1v3H2V4zm11 0h1v3h-1V4zM1 7h1v4H1V7zm13 0h1v4h-1V7zM2 11h1v2H2v-2zm11 0h1v2h-1v-2zm-9 2h1v1H4v-1zm7 0h1v1h-1v-1zm-6 1h6v1H5v-1zm0-7h2v2H5V7zm4 0h2v2H9V7zm-2 4h2v1H7v-1z',
	huggingface:
		'M4 2h8v1H4V2zM2 3h2v1H2V3zm10 0h2v1h-2V3zM1 4h1v8H1V4zm13 0h1v8h-1V4zM2 12h2v1H2v-1zm10 0h2v1h-2v-1zM4 13h8v1H4v-1zM4 6h2v2H4V6zm6 0h2v2h-2V6zm-3 3h2v1H7V9zm-2 1h1v1H5v-1zm5 0h1v1h-1v-1zm-3 1h2v1H7v-1z',
	help: 'M5 2h6v1H5V2zM4 3h1v2H4V3zm7 0h1v3h-1V3zM9 6h2v1H9V6zM8 7h2v1H8V7zm-1 1h2v3H7V8zm0 4h2v2H7v-2z',
	hardware:
		'M2 1h1v2h2V1h1v2h4V1h1v2h2V1h1v2h1v10h-1v2h-1v-2h-2v2h-1v-2H6v2H5v-2H3v2H2v-2H1V3h1V1zm1 3v8h10V4H3zm2 2h3v3H5V6zm4 0h2v1H9V6zm0 2h2v1H9V8zm-4 2h6v1H5v-1z'
} as const;

export type PixelIconName = keyof typeof PIXEL_ICON_PATHS;
