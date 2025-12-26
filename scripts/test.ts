import { $ } from 'bun';
import { runModules, type ModuleConfig } from './utils';

const modules: ModuleConfig[] = [
  { name: 'Root', path: '.', command: () => $`bun test` },
  { name: 'Examples (lambda-order-state-machine)', path: 'examples/lambda-order-state-machine', command: () => $`bun test` },
];

const success = await runModules(modules, {
  actionName: '🧪 Running tests for all modules',
  actionVerb: 'Running tests for',
  successMessage: 'tests passed',
  failureMessage: 'Tests failed for',
  allPassedMessage: 'All modules passed tests!',
  handleNoTests: true,
});

if (!success) {
  process.exit(1);
}
