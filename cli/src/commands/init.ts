import { Command } from 'commander';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { getCore } from '../client.js';

const GLOBAL_CONFIG_CONTENT = `# Skipper global config
# Set your Anthropic API key:
#   export ANTHROPIC_API_KEY=sk-ant-...
# or fill in below (not recommended for shared machines)
api_key: ""
default_models:
  conductor: claude-sonnet-4-6
  coder: claude-sonnet-4-6
  reviewer: claude-opus-4-7
`;

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize Skipper in the current (or given) repository')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(async (opts: { repo?: string }) => {
      try {
        const repoPath = opts.repo ? path.resolve(opts.repo) : process.cwd();

        // 1. Initialize .skipper/ layout in the repo
        const core = await getCore(opts.repo);
        await core.initProject(repoPath);

        // 2. Provision ~/.skipper/ global directory
        const globalDir = path.join(os.homedir(), '.skipper');
        const runtimeDir = path.join(globalDir, 'runtime');
        const globalConfig = path.join(globalDir, 'config.yaml');

        await fs.mkdir(globalDir, { recursive: true });
        await fs.mkdir(runtimeDir, { recursive: true });

        // Write global config only if it doesn't already exist
        try {
          await fs.access(globalConfig);
        } catch {
          await fs.writeFile(globalConfig, GLOBAL_CONFIG_CONTENT, 'utf8');
        }

        // 3. Check for ANTHROPIC_API_KEY
        if (process.env.ANTHROPIC_API_KEY) {
          console.log('✓ ANTHROPIC_API_KEY found — Claude adapters enabled');
        } else {
          console.log(
            '⚠  ANTHROPIC_API_KEY not set. Stub adapters will be used.\n' +
              '  Set it with: export ANTHROPIC_API_KEY=sk-ant-...'
          );
        }

        // 4. Summary and next steps
        console.log(`Skipper initialized at ${repoPath}`);
        console.log(
          "Next: skipper attach <repo>  (to run intake on an existing repo)\n" +
            "       skipper sprint plan '<goal>'  (to start a sprint)"
        );
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
