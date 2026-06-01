import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type { DeployAdapter, DeployPlan, DeployResult, Workspace } from '@skipper/core';

const exec = promisify(execCb);

export interface CommandDeployOptions {
  /** Shell command that performs the deploy. Defaults to $SKIPPER_DEPLOY_CMD. */
  command?: string;
  /** Deploy strategy reported in the plan. */
  strategy?: string;
  /** Whether to run a canary before full rollout. */
  canary?: boolean;
}

/**
 * The `ci` deploy adapter: hands off to the repo's own deploy command (e.g. a
 * `make deploy`, a CI trigger, or a release script). The command is taken from
 * the constructor option or the `SKIPPER_DEPLOY_CMD` environment variable.
 *
 * When no command is configured, `execute` is a no-op that reports the absence
 * explicitly and succeeds — so a sprint can still close out on a repo that has
 * no deploy wiring yet, without pretending a deploy happened.
 */
export class CommandDeployAdapter implements DeployAdapter {
  private readonly command?: string;
  private readonly strategy: string;
  private readonly canary: boolean;
  private repoPath = process.cwd();

  constructor(opts: CommandDeployOptions = {}) {
    this.command = opts.command ?? process.env['SKIPPER_DEPLOY_CMD'];
    this.strategy = opts.strategy ?? 'rolling';
    this.canary = opts.canary ?? false;
  }

  async plan(workspace: Workspace): Promise<DeployPlan> {
    this.repoPath = workspace.worktreePath ?? workspace.repoPath;
    return {
      sprint: workspace.sprint.id,
      strategy: this.strategy,
      canary: this.canary,
    };
  }

  async execute(plan: DeployPlan): Promise<DeployResult> {
    const ts = new Date().toISOString();

    if (!this.command) {
      return {
        success: true,
        output:
          'no deploy command configured (set SKIPPER_DEPLOY_CMD or the ci adapter command); ' +
          `nothing executed for sprint ${plan.sprint}`,
        ts,
      };
    }

    try {
      const { stdout, stderr } = await exec(this.command, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, output: `$ ${this.command}\n${stdout}${stderr}`.trim(), ts };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const output = `$ ${this.command}\n${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || (e.message ?? 'deploy failed');
      return { success: false, output, ts };
    }
  }
}
