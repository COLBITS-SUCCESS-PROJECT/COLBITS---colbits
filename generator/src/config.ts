// Generator configuration: every count, the periodicity and the time range are parameters (F-91, F-92).

export type GeneratorConfig = {
  seed: number;
  /** Network size. Totals for the whole network, spread evenly over the level above (F-91). */
  zones: number;
  substations: number;
  circuits: number;
  nodes: number;
  /** How many of the nodes have two fuse sets (branches A and B). */
  twoBranchNodes: number;
  /** Fraction of nodes that also have a transformer monitored by a SMAC. */
  trafoRatio: number;
  /** Fraction of transformers that are two-phase (the rest are three-phase). */
  twoPhaseTrafoRatio: number;
  /** Telemetry period in minutes and time range to populate (F-92). */
  intervalMinutes: number;
  start: Date;
  end: Date;
  /** Devices that stop reporting 10 h before `end`, so the inactivity rule (gray node) has data to work on. */
  silentDevices: number;
};

export const DEFAULTS = {
  seed: 42,
  zones: 2,
  substations: 3,
  circuits: 5,
  nodes: 50,
  twoBranchNodes: 5,
  trafoRatio: 0.3,
  twoPhaseTrafoRatio: 0.2,
  intervalMinutes: 15,
  days: 7,
  silentDevices: 0,
} as const;

const HELP = `COLBITS synthetic data generator

Usage: npm run generate -- [options]

Network size (F-91)
  --zones <n>              zones in total                      (default ${DEFAULTS.zones})
  --substations <n>        substations in total                (default ${DEFAULTS.substations})
  --circuits <n>           circuits in total                   (default ${DEFAULTS.circuits})
  --nodes <n>              nodes (poles) in total              (default ${DEFAULTS.nodes})
  --two-branch-nodes <n>   nodes with two fuse sets (A and B)  (default ${DEFAULTS.twoBranchNodes})
  --trafo-ratio <0..1>     share of nodes with a transformer   (default ${DEFAULTS.trafoRatio})
  --two-phase-ratio <0..1> share of two-phase transformers     (default ${DEFAULTS.twoPhaseTrafoRatio})

Telemetry (F-92)
  --interval <minutes>     one record per device every N min   (default ${DEFAULTS.intervalMinutes})
  --days <n>               range length, ending at --end       (default ${DEFAULTS.days})
  --start <ISO date>       range start (overrides --days)
  --end <ISO date>         range end                           (default: today 00:00 UTC)
  --silent-devices <n>     devices with no data in the last 10 h (default ${DEFAULTS.silentDevices})

Reproducibility (F-96)
  --seed <n>               same seed + same options = same dataset (default ${DEFAULTS.seed})

Database
  --db <url>               PostgreSQL URL (default: $DATABASE_URL)
  --create-schema          create Colbits' tables first if they do not exist
  --reset                  delete all generated data before inserting
  --dry-run                build the dataset and print counts, no database needed
  -h, --help               show this help
`;

export type CliOptions = {
  config: GeneratorConfig;
  databaseUrl: string | undefined;
  createSchema: boolean;
  reset: boolean;
  dryRun: boolean;
  help: boolean;
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env): CliOptions {
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  const valueFlags = new Set([
    '--seed', '--zones', '--substations', '--circuits', '--nodes', '--two-branch-nodes', '--trafo-ratio',
    '--two-phase-ratio', '--interval', '--days', '--start', '--end', '--silent-devices', '--db',
  ]);
  const switchFlags = new Set(['--create-schema', '--reset', '--dry-run', '--help', '-h']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const [name, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (switchFlags.has(name)) {
      switches.add(name);
    } else if (valueFlags.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${name}`);
      flags.set(name, value);
    } else {
      throw new Error(`Unknown option: ${arg} (see --help)`);
    }
  }

  const num = (name: string, fallback: number): number => {
    const raw = flags.get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
    return value;
  };
  const date = (name: string): Date | undefined => {
    const raw = flags.get(name);
    if (raw === undefined) return undefined;
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) throw new Error(`${name} must be an ISO date, got "${raw}"`);
    return value;
  };

  const end = date('--end') ?? startOfTodayUtc();
  const start = date('--start') ?? new Date(end.getTime() - num('--days', DEFAULTS.days) * 86_400_000);

  const config: GeneratorConfig = {
    seed: num('--seed', DEFAULTS.seed),
    zones: num('--zones', DEFAULTS.zones),
    substations: num('--substations', DEFAULTS.substations),
    circuits: num('--circuits', DEFAULTS.circuits),
    nodes: num('--nodes', DEFAULTS.nodes),
    twoBranchNodes: num('--two-branch-nodes', DEFAULTS.twoBranchNodes),
    trafoRatio: num('--trafo-ratio', DEFAULTS.trafoRatio),
    twoPhaseTrafoRatio: num('--two-phase-ratio', DEFAULTS.twoPhaseTrafoRatio),
    intervalMinutes: num('--interval', DEFAULTS.intervalMinutes),
    start,
    end,
    silentDevices: num('--silent-devices', DEFAULTS.silentDevices),
  };

  const help = switches.has('--help') || switches.has('-h');
  if (!help) validateConfig(config);

  return {
    config,
    databaseUrl: flags.get('--db') ?? env['DATABASE_URL'],
    createSchema: switches.has('--create-schema'),
    reset: switches.has('--reset'),
    dryRun: switches.has('--dry-run'),
    help,
  };
}

export function validateConfig(c: GeneratorConfig): void {
  const wholePositive: Array<[string, number]> = [
    ['zones', c.zones], ['substations', c.substations], ['circuits', c.circuits], ['nodes', c.nodes],
  ];
  for (const [name, value] of wholePositive) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a whole number >= 1`);
  }
  if (c.substations < c.zones) throw new Error('substations must be >= zones (every zone needs one)');
  if (c.circuits < c.substations) throw new Error('circuits must be >= substations (every substation needs one)');
  if (c.nodes < c.circuits) throw new Error('nodes must be >= circuits (every circuit needs one)');
  if (c.nodes > 99_999 * c.circuits) throw new Error('too many nodes per circuit for 10-character node names');
  if (!Number.isInteger(c.twoBranchNodes) || c.twoBranchNodes < 0 || c.twoBranchNodes > c.nodes) {
    throw new Error('two-branch-nodes must be between 0 and nodes');
  }
  for (const [name, value] of [['trafo-ratio', c.trafoRatio], ['two-phase-ratio', c.twoPhaseTrafoRatio]] as const) {
    if (value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  }
  if (!(c.intervalMinutes > 0)) throw new Error('interval must be > 0 minutes');
  if (!(c.end.getTime() > c.start.getTime())) throw new Error('end must be after start');
  if (!Number.isInteger(c.silentDevices) || c.silentDevices < 0) throw new Error('silent-devices must be >= 0');
  if (!Number.isInteger(c.seed)) throw new Error('seed must be a whole number');
}

export { HELP };
