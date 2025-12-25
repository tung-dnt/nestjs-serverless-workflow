# Publishing Guide

This guide outlines the steps to publish the serverless-workflow package to npm.

## Pre-Publishing Checklist

### 1. Version Update

Update the version in `package.json`:

```bash
# For patch release (bug fixes)
npm version patch

# For minor release (new features, backwards compatible)
npm version minor

# For major release (breaking changes)
npm version major
```

### 2. Update CHANGELOG.md

Add release notes following the Keep a Changelog format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes
```

### 3. Build the Package

```bash
bun run build
```

Verify the `dist/` directory contains:
- `workflow/` - Workflow module with .js and .d.ts files
- `event-bus/` - Event bus module with .js and .d.ts files
- `adapter/` - Adapter module with .js and .d.ts files
- `exception/` - Exception module with .js and .d.ts files

### 4. Test the Build

Run tests to ensure everything works:

```bash
bun test
bun run typecheck
```

### 5. Test Package Locally

Test the package in a local project:

```bash
# In the serverless-workflow directory
npm link

# In a test project
npm link serverless-workflow

# Test imports
import { WorkflowModule } from 'serverless-workflow/workflow';
import { IBrokerPublisher } from 'serverless-workflow/event-bus';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { UnretriableException } from 'serverless-workflow/exception';
```

### 6. Verify Package Contents

Preview what will be published:

```bash
npm pack --dry-run
```

This shows which files will be included. Verify:
- ✅ `dist/` directory is included
- ✅ `README.md` is included
- ✅ `LICENSE` is included
- ✅ `docs/` is included (optional, for reference)
- ✅ `examples/` is included (optional, for reference)
- ❌ `src/` is NOT included
- ❌ `tests/` is NOT included
- ❌ `node_modules/` is NOT included

## Publishing

### 1. Login to npm

```bash
npm login
```

### 2. Publish to npm

For first release:

```bash
npm publish --access public
```

For subsequent releases:

```bash
npm publish
```

### 3. Verify Publication

Check the package on npm:

```
https://www.npmjs.com/package/serverless-workflow
```

Test installation:

```bash
npm install serverless-workflow
```

### 4. Create Git Tag

```bash
git tag -a v0.0.1 -m "Release v0.0.1"
git push origin v0.0.1
```

### 5. Create GitHub Release

1. Go to GitHub releases page
2. Create new release from tag
3. Copy changelog content
4. Attach any relevant files
5. Publish release

## Post-Publishing

### 1. Update Documentation

Ensure online documentation is updated:
- Update installation instructions
- Update version numbers in examples
- Update changelog on website

### 2. Announce Release

- Post in relevant communities
- Update social media
- Notify users via email/newsletter

### 3. Monitor for Issues

Watch for:
- Installation issues
- Breaking changes not caught in testing
- Documentation gaps

## Troubleshooting

### Publishing Fails

**Issue**: `ENEEDAUTH` error
**Solution**: Run `npm login` again

**Issue**: Package name already exists
**Solution**: Choose a different package name or contact npm support

**Issue**: Missing files in package
**Solution**: Check `.npmignore` and `files` field in `package.json`

### Type Definitions Not Working

**Issue**: TypeScript can't find types
**Solution**: Verify `typesVersions` in `package.json` and `.d.ts` files in `dist/`

### Subpath Imports Not Working

**Issue**: Can't import from `serverless-workflow/workflow`
**Solution**: 
1. Check `exports` field in `package.json`
2. Ensure user's project supports package exports (Node 12.20+)
3. Verify `type: "module"` in `package.json`

## Version Strategy

### Semantic Versioning

Follow semver (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes (e.g., API changes, removed features)
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Pre-releases

For beta/alpha releases:

```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

Users install with:

```bash
npm install serverless-workflow@beta
```

### Deprecating Versions

If a version has critical issues:

```bash
npm deprecate serverless-workflow@0.0.1 "Critical bug, please upgrade to 0.0.2"
```

## Package Size

Monitor package size to keep it small:

```bash
npm pack
ls -lh serverless-workflow-*.tgz
```

Target: Keep under 500KB for fast installs.

## Tree-Shaking Verification

Test that tree-shaking works correctly:

```typescript
// Test project - only import one module
import { WorkflowModule } from 'serverless-workflow/workflow';

// Build and check bundle size
// Should NOT include event-bus, adapter, or exception code
```

Use tools like:
- `webpack-bundle-analyzer`
- `rollup-plugin-visualizer`
- Bundle size reports in CI

## CI/CD Integration

Automate publishing with GitHub Actions:

```yaml
name: Publish Package

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
      - run: bun run build
      - uses: JS-DevTools/npm-publish@v1
        with:
          token: ${{ secrets.NPM_TOKEN }}
```

## Support

For help with publishing:
- npm documentation: https://docs.npmjs.com/
- Semantic versioning: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/

