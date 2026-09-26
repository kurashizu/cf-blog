"""What each tuned preset is compared with, and which knobs the tuner may turn."""
SPECS = {
    'FULL STRING': {
        'name': 'FULL STRING',
        'labels': ['Violin, fiddle', 'String section', 'Bowed string instrument'],
        'avoid': ['Synthesizer', 'Keyboard (musical)'],
        'ref': 'vsco/Strings/Violin Section/susVib/*v1.wav', 'ref_midi': 60, 'base': 48,
        'space': [
            ('vk.value', 0.003, 0.02, True),
            ('vf.envA', 0.05, 0.8, True),
            ('ae.envA', 0.03, 0.2, True),
            ('ae.envD', 0.05, 1.0, True),
            ('ae.envS', 50, 100),
            ('ae.envR', 0.08, 1.0, True),
            ('vln.irMix', 30, 100),
            ('hall.spaceMix', 3, 35),
            ('hall.spaceDecay', 20, 90),
            ('r2.value', 0.995, 1.005),
            ('r3.value', 0.995, 1.005),
        ],
        'start': {'vk.value': 0.0105, 'vf.envA': 0.4, 'ae.envA': 0.12, 'ae.envD': 0.4, 'ae.envS': 85, 'ae.envR': 0.35, 'vln.irMix': 100, 'hall.spaceMix': 28, 'hall.spaceDecay': 65, 'r2.value': 1.00231, 'r3.value': 0.99712},
    },
}

SPECS['PIZZ'] = {
    'name': 'PIZZ',
    'labels': ['Pizzicato'],
    'avoid': ['Synthesizer', 'Electric guitar', 'Keyboard (musical)', 'Piano', 'Electric piano'],
    'ref': 'vsco/Strings/Violin Section/Pizz/*.wav', 'ref_midi': 60, 'base': 48,
    'space': [
        ('fin.hardness', 20, 95),
        ('fin.exTone', 1000, 10000, True),
        ('plk.outHi', 3, 20, True),
        ('w1.wireDamp|w2.wireDamp|w3.wireDamp|w4.wireDamp', 5, 60),
        ('w1.wirePos|w2.wirePos|w3.wirePos|w4.wirePos', 5, 40),
        ('dec.outLo', 0.3, 3, True),
        ('dec.outHi', 0.08, 1.0, True),
        ('vln.irMix|cel.irMix', 40, 100),
        ('sng.level', 0.01, 0.6, True),
        ('sne.envD', 0.005, 0.06, True),
        ('hall.spaceMix', 3, 40),
        ('dmp.envR', 0.03, 0.4, True),
    ],
    'start': {'fin.hardness': 60, 'fin.exTone': 4000, 'plk.outHi': 12, 'w1.wireDamp': 25, 'w1.wirePos': 15, 'dec.outLo': 1.8, 'dec.outHi': 0.4, 'vln.irMix': 80, 'sng.level': 0.1, 'sne.envD': 0.02, 'hall.spaceMix': 10, 'dmp.envR': 0.08},
}

SPECS['FLUTE'] = {
    'name': 'FLUTE',
    'labels': ['Flute'],
    'avoid': ['Theremin', 'Sine wave', 'Synthesizer', 'Violin, fiddle', 'Whistle'],
    'ref': 'vsco/Woodwinds/Flute/susvib/*.wav', 'ref_midi': 72, 'base': 36,
    'space': [
        ('vib.lfoRate', 4.0, 6.5),
        ('pdk.value', 0.001, 0.015, True),
        ('adk.value', 0.02, 0.5, True),
        ('vf.envA', 0.05, 0.8, True),
        ('ae.envA', 0.02, 0.15, True),
        ('ae.envR', 0.04, 0.3, True),
        ('be.envS', 10, 100),
        ('bl.outLo', 0.02, 0.6, True),
        ('bl.outHi', 0.005, 0.3, True),
        ('bp.q', 0.3, 4, True),
        ('fk.value', 1, 4),
        ('l2.outHi', 0.1, 1.0, True),
        ('l3.outHi', 0.02, 0.6, True),
        ('rm.spaceMix', 3, 35),
    ],
    'start': {'vib.lfoRate': 4.8, 'pdk.value': 0.0075, 'adk.value': 0.3, 'vf.envA': 0.45, 'ae.envA': 0.06, 'ae.envR': 0.1, 'be.envS': 55, 'bl.outLo': 0.22, 'bl.outHi': 0.02, 'bp.q': 1, 'fk.value': 2, 'l2.outHi': 0.355, 'l3.outHi': 0.224, 'rm.spaceMix': 12},
}

SPECS['CLARINET'] = {
    'name': 'CLARINET',
    'labels': ['Clarinet'],
    'avoid': ['Sine wave', 'Synthesizer', 'Theremin', 'Harmonica', 'Saxophone', 'Accordion'],
    'ref': 'vsco/Woodwinds/Clarinet/susLong/*v2_rr1_sum.wav', 'ref_midi': 60, 'base': 48,
    'space': [
        ('bore.irMix', 30, 100),
        ('ag.level', 0.003, 0.3, True),
        ('abp.q', 0.3, 5, True),
        ('k3.value', 1, 6),
        ('ae.envA', 0.015, 0.15, True),
        ('ae.envD', 0.02, 0.5, True),
        ('ae.envS', 50, 100),
        ('ae.envR', 0.03, 0.3, True),
        ('dk.value', 0.0002, 0.006, True),
        ('rm.spaceMix', 3, 35),
    ],
    'start': {'bore.irMix': 100, 'ag.level': 0.04, 'abp.q': 1.5, 'k3.value': 3, 'ae.envA': 0.04, 'ae.envD': 0.1, 'ae.envS': 90, 'ae.envR': 0.08, 'dk.value': 0.002, 'rm.spaceMix': 12},
}

SPECS['HARPSICHORD'] = {
    'name': 'HARPSICHORD', 'keyboard': True, 'ceil': 0.85,
    'labels': ['Harpsichord'],
    'avoid': ['Synthesizer', 'Zither', 'Guitar', 'Cowbell', 'Electric piano'],
    'base': 48,
    'space': [
        ('qul.hardness', 40, 100),
        ('qul.exLength', 0.3, 5, True),
        ('qul.exTone', 1500, 12000, True),
        ('s1.wireDamp', 2, 60, True),
        ('s1.wirePos', 3, 20),
        ('s2.wireDamp', 2, 60, True),
        ('s1.wireStiff', 0, 40),
        ('dec.outLo', 2, 12, True),
        ('dec.outHi', 0.4, 4, True),
        ('g4.level', 0.05, 1.0, True),
        ('dk.value', 1.0, 1.003),
        ('board.irMix', 0, 100),
        ('board.irBody', 0, 4),
        ('jg.level', 0.005, 0.3, True),
        ('rm.spaceMix', 3, 35),
    ],
    'start': {'qul.hardness': 90, 'qul.exLength': 1.2, 'qul.exTone': 7000, 's1.wireDamp': 12, 's1.wirePos': 8, 's2.wireDamp': 12, 's1.wireStiff': 6, 'dec.outLo': 6, 'dec.outHi': 1.5, 'g4.level': 0.45, 'dk.value': 1.0006, 'board.irMix': 60, 'board.irBody': 1, 'jg.level': 0.08, 'rm.spaceMix': 14},
}

SPECS['DRAWBAR ORGAN'] = {
    'name': 'DRAWBAR ORGAN', 'keyboard': 'chords', 'ceil': 0.8,
    'labels': ['Hammond organ', 'Organ'],
    'avoid': ['Synthesizer', 'Dial tone', 'Sine wave', 'Accordion', 'Harmonica'],
    'base': 48,
    'space': [
        ('g16.level', 0, 1), ('g8.level', 0.2, 1), ('g5.level', 0, 1), ('g4.level', 0, 1), ('g3.level', 0, 1),
        ('pg.level', 0, 1.5), ('pe.envD', 0.08, 0.6, True),
        ('cg.level', 0.01, 0.6, True),
        ('od.shapeDrive', 0, 80),
        ('hr.lfoAmt', 0.005, 0.2, True), ('ha.lfoAmt', 5, 60), ('da.lfoAmt', 2, 40),
        ('cab.spaceMix', 3, 35),
    ],
    'start': {'g16.level': 0.8, 'g8.level': 0.8, 'g5.level': 0.6, 'g4.level': 0.4, 'g3.level': 0.2, 'pg.level': 0.5, 'pe.envD': 0.25, 'cg.level': 0.15, 'od.shapeDrive': 30, 'hr.lfoAmt': 0.05, 'ha.lfoAmt': 40, 'da.lfoAmt': 20, 'cab.spaceMix': 18},
}

SPECS['PIANO'] = {
    'name': 'PIANO', 'keyboard': True, 'ceil': 0.55,
    'labels': ['Piano'], 'avoid': ['Synthesizer', 'Electric piano'], 'base': 48, 'space': [], 'start': {},
}
