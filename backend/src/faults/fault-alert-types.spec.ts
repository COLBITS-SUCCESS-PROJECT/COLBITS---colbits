import {
  ALERT_TYPE_DEFINITIONS,
  ALERT_TYPES,
  AlertType,
  classifyEventCode,
  EventCodeClass,
  UNRECOGNIZED,
} from './fault-alert-types';

const WITH_CODE: AlertType[] = [
  'FUSE_OPENING',
  'NO_VOLTAGE',
  'FREE_FALL',
  'PHASE_LOSS',
  'PHASE_OUT_OF_RANGE',
];
const WITHOUT_CODE: AlertType[] = [
  'SOLAR_PANEL_FAILURE',
  'OVERLOAD_UNBALANCE',
  'LOW_ENERGY',
  'DEVICE_INACTIVITY',
];

describe('ALERT_TYPES (US10 · F-47, Scope v6.0 §3.2)', () => {
  it('has the nine supported types and no others', () => {
    expect([...ALERT_TYPES].sort()).toEqual(
      [
        'DEVICE_INACTIVITY',
        'FREE_FALL',
        'FUSE_OPENING',
        'LOW_ENERGY',
        'NO_VOLTAGE',
        'OVERLOAD_UNBALANCE',
        'PHASE_LOSS',
        'PHASE_OUT_OF_RANGE',
        'SOLAR_PANEL_FAILURE',
      ].sort(),
    );
    expect(ALERT_TYPES).toHaveLength(9);
  });

  it('leaves out Tampering, which is deferred', () => {
    for (const type of ALERT_TYPES) expect(type).not.toMatch(/TAMPER/);
    expect(Object.keys(ALERT_TYPE_DEFINITIONS)).toHaveLength(9);
  });

  it('reuses the names the frontend already has', () => {
    for (const name of [
      'FUSE_OPENING',
      'NO_VOLTAGE',
      'PHASE_LOSS',
      'OVERLOAD_UNBALANCE',
    ]) {
      expect(ALERT_TYPES).toContain(name);
    }
  });

  it('defines every type, with the device that originates it', () => {
    for (const type of ALERT_TYPES) {
      expect(ALERT_TYPE_DEFINITIONS[type].devices.length).toBeGreaterThan(0);
    }
    expect(ALERT_TYPE_DEFINITIONS.FUSE_OPENING.devices).toEqual(['FALCON']);
    expect(ALERT_TYPE_DEFINITIONS.PHASE_LOSS.devices).toEqual(['SMAC']);
    expect(ALERT_TYPE_DEFINITIONS.LOW_ENERGY.devices).toEqual([
      'FALCON',
      'SMAC',
    ]);
  });

  it.each(WITH_CODE)('%s has a documented event code', (type) => {
    expect(ALERT_TYPE_DEFINITIONS[type].eventCodePattern).not.toBeNull();
  });

  it.each(WITHOUT_CODE)(
    '%s has no documented event code, so none is invented',
    (type) => {
      expect(ALERT_TYPE_DEFINITIONS[type].eventCodePattern).toBeNull();
    },
  );

  it('keeps the patterns anchored and valid in both JavaScript and PostgreSQL', () => {
    for (const type of WITH_CODE) {
      const pattern = ALERT_TYPE_DEFINITIONS[type].eventCodePattern as string;
      expect(pattern.startsWith('^')).toBe(true);
      expect(pattern.endsWith('$')).toBe(true);
      expect(pattern).not.toMatch(/[\\]|\(\?/);
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});

describe('classifyEventCode (US10 · F-47, Technical Annex v1.1 §4.2)', () => {
  it.each<[string, AlertType]>([
    ['131420', 'FUSE_OPENING'],
    ['130020', 'FUSE_OPENING'],
    ['139920', 'FUSE_OPENING'],
    ['131421', 'NO_VOLTAGE'],
    ['131401', 'FREE_FALL'],
    ['051420A', 'PHASE_OUT_OF_RANGE'],
    ['051420C', 'PHASE_OUT_OF_RANGE'],
    ['0514201', 'PHASE_OUT_OF_RANGE'],
    ['051421C', 'PHASE_LOSS'],
    ['051421B', 'PHASE_LOSS'],
    ['0514213', 'PHASE_LOSS'],
  ])('maps %s to %s', (code, expected) => {
    expect(classifyEventCode(code)).toBe(expected);
  });

  it('accepts the channel letter in either case', () => {
    expect(classifyEventCode('051421c')).toBe('PHASE_LOSS');
    expect(classifyEventCode('051420b')).toBe('PHASE_OUT_OF_RANGE');
  });

  describe('exact matching: no normalization, so SQL `~` and this function agree', () => {
    const DOCUMENTED = ['131420', '131421', '131401', '051420A', '051421C'];
    const AROUND = [
      ['trailing LF', '', '\n'],
      ['trailing CRLF', '', '\r\n'],
      ['trailing CR', '', '\r'],
      ['trailing line separator U+2028', '', ' '],
      ['trailing paragraph separator U+2029', '', ' '],
      ['trailing next-line U+0085', '', '\u0085'],
      ['trailing vertical tab', '', '\v'],
      ['trailing form feed', '', '\f'],
      ['trailing tab', '', '\t'],
      ['trailing space', '', ' '],
      ['trailing no-break space', '', ' '],
      ['trailing zero-width space', '', '​'],
      ['leading LF', '\n', ''],
      ['leading space', ' ', ''],
      ['leading tab', '\t', ''],
      ['both sides', ' ', ' '],
    ] as const;

    it.each(
      DOCUMENTED.flatMap((code) =>
        AROUND.map(([label, before, after]) => [
          `${code} with ${label}`,
          `${before}${code}${after}`,
        ]),
      ),
    )('returns UNRECOGNIZED for %s', (_label, code) => {
      expect(classifyEventCode(code)).toBe(UNRECOGNIZED);
    });

    it('returns UNRECOGNIZED for a newline inside the code or a second code after a newline', () => {
      expect(classifyEventCode('1314\n20')).toBe(UNRECOGNIZED);
      expect(classifyEventCode('131420\n131420')).toBe(UNRECOGNIZED);
    });

    it('does not match a trailing line terminator at the regular-expression level either', () => {
      // `$` matches only at the very end in JavaScript without the `m` flag (unlike Python or
      // PCRE), and in PostgreSQL; the e2e test checks the PostgreSQL side against a real database.
      for (const type of ALERT_TYPES) {
        const pattern = ALERT_TYPE_DEFINITIONS[type].eventCodePattern;
        if (pattern === null) continue;
        const matcher = new RegExp(pattern);
        const sample = {
          FUSE_OPENING: '131420',
          NO_VOLTAGE: '131421',
          FREE_FALL: '131401',
          PHASE_OUT_OF_RANGE: '051420A',
          PHASE_LOSS: '051421A',
        }[type as string] as string;
        expect(matcher.test(sample)).toBe(true);
        for (const end of ['\n', '\r\n', '\r', ' ', ' ']) {
          expect(matcher.test(`${sample}${end}`)).toBe(false);
        }
      }
    });
  });

  it.each([
    ['dotless i', '051421ı'],
    ['long s', '051420ſ'],
    ['accented letter', '051421É'],
  ])(
    'does not accept a non-ASCII channel character (%s), even if case-folding would turn it into ASCII',
    (_label, code) => {
      expect(classifyEventCode(code)).toBe(UNRECOGNIZED);
    },
  );

  it.each([
    ['the undocumented code of the seed', '139999'],
    ['a Falcon code with an unknown event', '131422'],
    ['a Falcon event next to the abnormal-movement one', '131402'],
    ['a Falcon event next to the fuse one', '131419'],
    ['a SMAC code with an unknown event', '051422A'],
    ['a SMAC code with the movement event', '051401A'],
    ['too short', '13142'],
    ['too long', '1314200'],
    ['a Falcon code with a channel character', '131420A'],
    ['a SMAC fuse-alarm code without channel', '051420'],
    ['a SMAC phase-drop code without channel', '051421'],
    ['a SMAC code with a two-character channel', '051421AB'],
    ['a non-numeric firmware version', '13A420'],
    ['a non-numeric firmware version on SMAC', '05AB21A'],
    ['another device type', '141420'],
    ['another device type, SMAC length', '061420A'],
    ['an inner space', '131 420'],
    ['a separator', '13-1420'],
    ['letters where the event digits go', '1314AB'],
    ['a letter O instead of zero', '13142O'],
    ['full-width digits', '１３１４２０'],
    ['empty text', ''],
    ['only spaces', '   '],
  ])('returns UNRECOGNIZED for %s (%j)', (_label, code) => {
    expect(classifyEventCode(code)).toBe(UNRECOGNIZED);
  });

  it.each([[null], [undefined], [131420], [{}], [['131420']]])(
    'returns UNRECOGNIZED for the non-text value %j',
    (value) => {
      expect(classifyEventCode(value as unknown as string)).toBe(UNRECOGNIZED);
    },
  );

  it('never returns the types that have no documented event code, nor Tampering', () => {
    const results = new Set<EventCodeClass>();
    const channels = ['A', 'B', 'C', '0', '1', '9'];
    for (let firmware = 0; firmware < 100; firmware++) {
      const version = String(firmware).padStart(2, '0');
      for (let event = 0; event < 100; event++) {
        const eventDigits = String(event).padStart(2, '0');
        results.add(classifyEventCode(`13${version}${eventDigits}`));
        results.add(classifyEventCode(`05${version}${eventDigits}`));
        for (const channel of channels) {
          results.add(
            classifyEventCode(`13${version}${eventDigits}${channel}`),
          );
          results.add(
            classifyEventCode(`05${version}${eventDigits}${channel}`),
          );
        }
      }
    }

    expect([...results].sort()).toEqual([...WITH_CODE, UNRECOGNIZED].sort());
    for (const type of WITHOUT_CODE) expect(results.has(type)).toBe(false);
  });

  it('classifies each code under at most one type', () => {
    const matchers = WITH_CODE.map(
      (type) =>
        new RegExp(ALERT_TYPE_DEFINITIONS[type].eventCodePattern as string),
    );
    for (const code of [
      '131420',
      '131421',
      '131401',
      '051420A',
      '051421A',
      '139999',
    ]) {
      expect(
        matchers.filter((matcher) => matcher.test(code)).length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('classifies the event codes the seed and the generator produce', () => {
    // backend/database/02_dummy_inserts.sql and generator/src/scenarios.ts
    expect(classifyEventCode('131420')).toBe('FUSE_OPENING');
    expect(classifyEventCode('131421')).toBe('NO_VOLTAGE');
    expect(classifyEventCode('131401')).toBe('FREE_FALL');
    expect(classifyEventCode('051420A')).toBe('PHASE_OUT_OF_RANGE');
    expect(classifyEventCode('051421C')).toBe('PHASE_LOSS');
    expect(classifyEventCode('139999')).toBe(UNRECOGNIZED);
  });
});
