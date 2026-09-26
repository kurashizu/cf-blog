"""What each built-in sound should be heard as, in AudioSet's words. A list is
any-of: the score is the best of them."""
SYN = ['Synthesizer']
TARGETS = {
    '8-BIT BASS': SYN, 'SUB BASS': SYN, 'ACID BASS': SYN, 'FM BASS': SYN,
    'LEAD': SYN, 'SAW LEAD': SYN, 'SYNC LEAD': SYN, 'CHIP LEAD': SYN,
    'BRASS': ['Brass instrument', 'Synthesizer'], 'PLUCK': SYN,
    'KOTO': ['Zither'], 'MARIMBA': ['Marimba, xylophone'], 'BELL': ['Bell', 'Chime', 'Tubular bells', 'Glockenspiel'],
    'E-PIANO': ['Electric piano'], 'ORGAN': ['Electronic organ', 'Organ'], 'DRAWBAR ORGAN': ['Hammond organ'],
    'VIBRAPHONE': ['Vibraphone'], 'DULCIMER': ['Zither'], 'CLAV': ['Electric piano', 'Keyboard (musical)'],
    'HARPSICHORD': ['Harpsichord'],
    'WARM PAD': SYN, 'STRINGS': ['String section', 'Synthesizer'], 'GLASS PAD': SYN, 'HOLLOW PAD': SYN,
    'PIANO': ['Piano'], 'GUITAR': ['Acoustic guitar'], 'UPRIGHT BASS': ['Double bass'],
    'FULL STRING': ['String section', 'Violin, fiddle', 'Bowed string instrument'], 'PIZZ': ['Pizzicato'],
    'CLARINET': ['Clarinet'], 'FLUTE': ['Flute'],
}
