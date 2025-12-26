import { $ } from 'bun';
import { join } from 'path';

const modules = [
  { name: 'Root', path: '.', command: () => $`bun test` },
  { name: 'Examples (lambda-order-state-machine)', path: 'examples/lambda-order-state-machine', command: () => $`bun test` },
];

console.log('🧪 Running tests for all modules...\n');

let hasErrors = false;

for (const module of modules) {
  console.log(`📦 Running tests for ${module.name}...`);
  
  const originalCwd = process.cwd();
  try {
    if (module.path !== '.') {
      process.chdir(join(originalCwd, module.path));
    }
    const result = await module.command().nothrow();
    
    const output = result.stdout.toString() + result.stderr.toString();
    const noTestsFound = output.includes('No tests found');
    
    if (result.exitCode !== 0 && !noTestsFound) {
      console.error(`❌ Tests failed for ${module.name}:`);
      console.error(result.stderr.toString());
      hasErrors = true;
    } else if (noTestsFound) {
      console.log(`ℹ️  ${module.name} has no tests (skipped)\n`);
    } else {
      console.log(`✅ ${module.name} tests passed\n`);
    }
  } finally {
    process.chdir(originalCwd);
  }
}

if (hasErrors) {
  console.error('❌ Some modules failed tests');
  process.exit(1);
}

console.log('✅ All modules passed tests!');

