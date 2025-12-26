import { $ } from 'bun';
import { join } from 'path';

export interface ModuleConfig {
  name: string;
  path: string;
  command: () => ReturnType<typeof $>;
}

export interface RunModulesOptions {
  actionName: string;
  actionVerb: string;
  successMessage: string;
  failureMessage: string;
  allPassedMessage: string;
  handleNoTests?: boolean;
  customResultHandler?: (result: Awaited<ReturnType<typeof $>>, module: ModuleConfig) => boolean;
}

export async function runModules(
  modules: ModuleConfig[],
  options: RunModulesOptions
): Promise<boolean> {
  const {
    actionName,
    actionVerb,
    successMessage,
    failureMessage,
    allPassedMessage,
    handleNoTests = false,
    customResultHandler,
  } = options;

  console.log(`${actionName}...\n`);

  let hasErrors = false;

  for (const module of modules) {
    console.log(`📦 ${actionVerb} ${module.name}...`);

    const originalCwd = process.cwd();
    try {
      if (module.path !== '.') {
        process.chdir(join(originalCwd, module.path));
      }
      const result = await module.command().nothrow();

      if (customResultHandler) {
        const shouldMarkAsError = customResultHandler(result, module);
        if (shouldMarkAsError) {
          hasErrors = true;
        }
      } else {
        const output = result.stdout.toString() + result.stderr.toString();
        const noTestsFound = handleNoTests && output.includes('No tests found');

        if (result.exitCode !== 0 && !noTestsFound) {
          console.error(`❌ ${failureMessage} ${module.name}:`);
          console.error(result.stderr.toString());
          hasErrors = true;
        } else if (noTestsFound) {
          console.log(`ℹ️  ${module.name} has no tests (skipped)\n`);
        } else {
          console.log(`✅ ${module.name} ${successMessage}\n`);
        }
      }
    } finally {
      process.chdir(originalCwd);
    }
  }

  if (hasErrors) {
    console.error(`❌ Some modules failed`);
    return false;
  }

  console.log(`✅ ${allPassedMessage}`);
  return true;
}

