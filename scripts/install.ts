import { $ } from 'bun';
import { runModules, type ModuleConfig } from './utils';

const modules: ModuleConfig[] = [
  { name: 'Root', path: '.', command: () => $`bun install` },
  { name: 'Docs', path: 'docs', command: () => $`bun install` },
];

const success = await runModules(modules, {
  actionName: '🔍 Installing dependencies all modules',
  actionVerb: 'Installing',
  successMessage: 'All dependencies installed for',
  failureMessage: 'Installation failed for',
  allPassedMessage: 'All modules passed typecheck!',
});

if (!success) {
  process.exit(1);
}
