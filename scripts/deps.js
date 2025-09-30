#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function executeCommand(command, cwd = process.cwd()) {
  console.log(`\n🔄 Executing: ${command}`);
  console.log(`📂 Working directory: ${cwd}`);

  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
    });
    console.log(`✅ Command completed successfully`);
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  console.log('🚀 Starting dist setup process...\n');

  const rootDir = process.cwd();
  const distPath = path.join(rootDir, 'dist');

  // Step 1: Check if dist directory exists
  if (!fs.existsSync(distPath)) {
    console.log('❌ dist directory does not exist. Please run build first.');
    process.exit(1);
  }

  console.log('✅ Found dist directory');

  // Step 2: npm init -y (correcting "npm int -y" to "npm init -y")
  console.log('\n📦 Step 2: Running npm init -y in dist directory...');
  executeCommand('npm init -y', distPath);

  // Step 3: Copy and install packages from root package.json
  console.log('\n📦 Step 3: Installing all packages from root package.json...');

  // Read root package.json to get all dependencies
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  // Install only dependencies (excluding devDependencies)
  const deps = rootPackageJson.dependencies || {};

  if (Object.keys(deps).length > 0) {
    const packageList = Object.keys(deps).join(' ');
    executeCommand(`npm install ${packageList}`, distPath);
  } else {
    console.log('ℹ️ No dependencies found in root package.json');
  }

  console.log('\n🎉 Setup completed successfully!');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };
