import { $, build } from 'bun';

await $`rm -rf dist`;

const optionalRequirePackages = [
  '@fastify/static',
  '@fastify/view',
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/platform-express',
  '@nestjs/websockets/socket-module',
  '@nestjs/websockets',
  '@nestjs/microservices',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  'amqp-connection-manager',
  'amqplib',
  'cache-manager',
  'cache-manager/package.json',
  'class-transformer',
  'class-validator',
  'hbs',
  'ioredis',
  'kafkajs',
  'mqtt',
  'nats',
];

const result = await build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  target: 'bun',
  external: optionalRequirePackages,
  splitting: true,
  bytecode: true,
});

if (!result.success) {
  console.log(result.logs[0]);
  process.exit(1);
}

console.log('Built successfully!');
