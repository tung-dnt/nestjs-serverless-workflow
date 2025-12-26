import { $ } from 'bun';
import { runModules, type ModuleConfig } from './utils';

const modules: ModuleConfig[] = [
  { name: 'Root', path: '.', command: () => $`bun run typecheck` },
  { name: 'Docs', path: 'docs', command: () => $`bun run typecheck` },
];

const success = await runModules(modules, {
  actionName: '🔍 Running typecheck for all modules',
  actionVerb: 'Typechecking',
  successMessage: 'typecheck passed',
  failureMessage: 'Typecheck failed for',
  allPassedMessage: 'All modules passed typecheck!',
});

if (!success) {
  process.exit(1);
}
