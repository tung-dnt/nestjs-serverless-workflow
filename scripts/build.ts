import { $ } from 'bun';

console.log('🧹 Cleaning dist directory...');
await $`rm -rf dist`;

console.log('📦 Building library with TypeScript compiler...');

// Use TypeScript compiler for proper ESM output with declarations
const tscResult = await $`tsgo -p tsconfig.build.json`.nothrow();

if (tscResult.exitCode !== 0) {
  console.error('❌ TypeScript compilation failed:');
  console.error(tscResult.stderr.toString());
  process.exit(1);
}

console.log('✅ Built successfully!');
console.log('');
console.log('📦 Package exports:');
console.log('  - nestjs-serverless-workflow/core');
console.log('  - nestjs-serverless-workflow/event-bus');
console.log('  - nestjs-serverless-workflow/exception');
console.log('  - nestjs-serverless-workflow/adapter');
console.log('');
console.log('💡 The library is now ready for publishing!');
