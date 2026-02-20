import { runPipeline, getCapabilities } from './pipeline.js';
import { formatReport } from './report.js';

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function printUsage(): void {
  console.log('Cournot Proof-of-Reasoning CLI');
  console.log('');
  console.log('Usage:');
  console.log('  cournot-por resolve  --query "..." --code "..." [options]');
  console.log('  cournot-por capabilities --code "..."');
  console.log('');
  console.log('Options:');
  console.log('  --query            The question or market to resolve');
  console.log('  --code             Cournot access code');
  console.log('  --strict           Enable strict mode');
  console.log('  --collectors       Comma-separated list of collectors');
  console.log('  --include-raw      Include raw content from collectors');
  console.log('  --json             Output raw JSON instead of formatted report');
  console.log('  --help             Show this help message');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const code = getArg(args, 'code');
  if (!code) {
    console.error('Error: --code is required. Provide your Cournot access code.');
    process.exit(1);
    return; // unreachable, helps TypeScript narrow
  }

  if (command === 'capabilities') {
    try {
      const result = await getCapabilities(code);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (command === 'resolve') {
    const query = getArg(args, 'query');
    if (!query) {
      console.error('Error: --query is required.');
      process.exit(1);
      return; // unreachable, helps TypeScript narrow
    }

    const collectorsArg = getArg(args, 'collectors');
    const collectors = collectorsArg ? collectorsArg.split(',') : undefined;

    try {
      const report = await runPipeline({
        query,
        code,
        strict_mode: hasFlag(args, 'strict'),
        collectors,
        include_raw_content: hasFlag(args, 'include-raw'),
      });

      if (hasFlag(args, 'json')) {
        // Omit raw data from JSON output to keep it concise
        const { raw: _raw, ...summary } = report;
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(formatReport(report));
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run with --help for usage information.');
  process.exit(1);
}

main();
