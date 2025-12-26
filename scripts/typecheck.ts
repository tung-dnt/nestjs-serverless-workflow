import { $ } from 'bun';
import { join } from 'path';

const modules = [
  { name: 'Root', path: '.', command: () => $`bun run typecheck` },
  { name: 'Docs', path: 'docs', command: () => $`bun run typecheck` },
  { name: 'Examples (lambda-order-state-machine)', path: 'examples/lambda-order-state-machine', command: () => $`bun run typecheck` },
];

console.log('🔍 Running typecheck for all modules...\n');

let hasErrors = false;

for (const module of modules) {
  console.log(`📦 Typechecking ${module.name}...`);

  const originalCwd = process.cwd();
  try {
    if (module.path !== '.') {
      process.chdir(join(originalCwd, module.path));
    }
    const result = await module.command().nothrow();

    if (result.exitCode !== 0) {
      console.error(`❌ Typecheck failed for ${module.name}:`);
      console.error(result.stderr.toString());
      hasErrors = true;
    } else {
      console.log(`✅ ${module.name} typecheck passed\n`);
    }
  } finally {
    process.chdir(originalCwd);
  }
}

if (hasErrors) {
  console.error('❌ Some modules failed typecheck');
  process.exit(1);
}

console.log('✅ All modules passed typecheck!');
