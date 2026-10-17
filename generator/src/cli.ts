#!/usr/bin/env node
// Command-line entry point: runs without the platform UI (F-97).
import pg from 'pg';
import { HELP, parseArgs } from './config.ts';
import { applySchema, resetData, writeDataset } from './db.ts';
import { buildNetwork } from './network.ts';
import { pickSilentDevices, recordsPerDevice } from './telemetry.ts';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const { config } = options;
  const network = buildNetwork(config);
  const perDevice = recordsPerDevice(config);

  console.log(`COLBITS generator · seed ${config.seed} · ${config.start.toISOString()} → ${config.end.toISOString()} every ${config.intervalMinutes} min`);
  console.log(`  ${network.zones.length} zones · ${network.substations.length} substations · ${network.circuits.length} circuits · ${network.nodes.length} nodes`);
  console.log(`  ${network.fuseSets.length} fuse sets · ${network.fuses.length} fuses (Falcon) · ${network.trafos.length} transformers (SMAC)`);
  console.log(`  ~${perDevice} records per device · ${pickSilentDevices(network, config).size} silent device(s)`);

  if (options.dryRun) return;
  if (!options.databaseUrl) {
    throw new Error('No database. Pass --db postgres://user:pass@host:5432/db or set DATABASE_URL (or use --dry-run).');
  }

  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    if (options.createSchema) {
      console.log('Creating schema (if missing)…');
      await applySchema(client);
    }
    if (options.reset) {
      console.log('Deleting previous data…');
      await resetData(client);
    }
    console.log('Inserting:');
    const started = Date.now();
    await writeDataset(client, network, config, (msg) => console.log(msg));
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
