import { $ } from 'bun';

console.log('🧹 Cleaning dist directory...');
await $`rm -rf dist`;

console.log('📦 Building library with TypeScript compiler...');

// Use TypeScript compiler for proper ESM output with declarations
const tscResult = await $`bun tsgo -p tsconfig.build.json`.nothrow();

if (tscResult.exitCode !== 0) {
  console.error('❌ TypeScript compilation failed:');
  console.error(tscResult.stderr.toString());
  process.exit(1);
}

console.log('✅ Built successfully!');
console.log('');
console.log('📦 Package exports:');
console.log('  - serverless-workflow/workflow');
console.log('  - serverless-workflow/event-bus');
console.log('  - serverless-workflow/exception');
console.log('  - serverless-workflow/adapter');
console.log('');
console.log('💡 The library is now ready for publishing!');
