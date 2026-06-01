import { Command } from 'commander';
import { registerProject } from './commands/project.js';
import { registerRoadmap } from './commands/roadmap.js';
import { registerSprint } from './commands/sprint.js';
import { registerTask } from './commands/task.js';
import { registerSignoff } from './commands/signoff.js';
import { registerInbox } from './commands/inbox.js';
import { registerCheck } from './commands/check.js';
import { registerDeploy } from './commands/deploy.js';
import { registerAgent } from './commands/agent.js';
import { registerAdapter } from './commands/adapter.js';
import { registerInit } from './commands/init.js';
import { registerUp } from './commands/up.js';
import { registerAttach } from './commands/attach.js';

const program = new Command();

program
  .name('skipper')
  .description('Self-contained SDLC agent')
  .version('0.1.0');

registerInit(program);
registerUp(program);
registerAttach(program);
registerProject(program);
registerRoadmap(program);
registerSprint(program);
registerTask(program);
registerSignoff(program);
registerInbox(program);
registerCheck(program);
registerDeploy(program);
registerAgent(program);
registerAdapter(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
