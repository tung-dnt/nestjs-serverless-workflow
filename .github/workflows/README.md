# GitHub Actions Workflows

Automated CI/CD pipelines for nestjs-serverless-workflow package.

## 🔄 Workflows

### 1. CI (`ci.yml`)

**Triggers**: Push to `main`/`develop`, Pull Requests

**What it does**:
- ✅ Type checking with TypeScript
- ✅ Runs tests
- ✅ Builds the package
- ✅ Validates package.json
- ✅ Checks package exports
- ✅ Dry-run publish test
- ✅ Uploads build artifacts

**Status**: ![CI](https://github.com/tung-dnt/nestjs-serverless-workflow/workflows/CI/badge.svg)

### 2. Publish (`publish.yml`)

**Triggers**: Push tags matching `v*` (e.g., `v0.0.2`)

**What it does**:
- ✅ Type checks the code
- ✅ Builds the package
- ✅ Publishes to NPM
- ✅ Creates GitHub Release
- ✅ Announces success

**Usage**:
```bash
# Create and push tag
git tag v0.0.2
git push origin v0.0.2
```

**Status**: ![Publish](https://github.com/tung-dnt/nestjs-serverless-workflow/workflows/Publish%20to%20NPM/badge.svg)

### 3. Release (`release.yml`)

**Triggers**: Manual workflow dispatch

**What it does**:
- ✅ Bumps version (patch/minor/major)
- ✅ Runs tests
- ✅ Updates CHANGELOG.md
- ✅ Commits version bump
- ✅ Creates git tag
- ✅ Publishes to NPM
- ✅ Creates GitHub Release

**Usage**:
1. Go to: Actions → Release → Run workflow
2. Select version type: `patch` / `minor` / `major`
3. Click "Run workflow"

## 🔧 Setup Instructions

### Step 1: Create NPM Access Token

1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click your profile → **Access Tokens**
3. Click **Generate New Token** → **Granular Access Token**
4. Configure:
   - **Name**: `github-actions-nestjs-serverless-workflow`
   - **Expiration**: 1 year (or longer)
   - **Packages and scopes**: Select packages → `nestjs-serverless-workflow`
   - **Permissions**: **Read and write**
   - **Automation**: ✅ Enable (bypasses 2FA)
5. Copy the token (starts with `npm_...`)

### Step 2: Add Token to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

### Step 3: Verify Setup

The workflows are now ready! Test by:

```bash
# Option 1: Push a tag
git tag v0.0.2
git push origin v0.0.2

# Option 2: Use the Release workflow
# Go to Actions → Release → Run workflow
```

## 📋 Workflow Details

### Environment Variables

All workflows use:
- `NPM_TOKEN`: NPM authentication (from secrets)
- `GITHUB_TOKEN`: Automatically provided by GitHub

### Permissions

Workflows have:
- `contents: write` - Push commits and tags
- `id-token: write` - NPM provenance

### Build Process

1. **Checkout code**
2. **Setup Bun** (latest version)
3. **Install dependencies** (`bun install --frozen-lockfile`)
4. **Type check** (`bun run typecheck`)
5. **Build** (`bun run build`)
6. **Publish** (`npm publish --access public`)

## 🚀 Publishing Flow

### Automatic (Tag Push)

```bash
# 1. Bump version locally
bun pm version patch  # or minor/major

# 2. This creates a commit and tag automatically

# 3. Push with tags
git push origin main --tags

# 4. GitHub Actions automatically publishes
```

### Manual (Release Workflow)

1. Go to **Actions** tab
2. Click **Release** workflow
3. Click **Run workflow**
4. Select version type
5. Click **Run workflow** button
6. Automation handles everything!

### Semi-Automatic (CI → Tag → Publish)

```bash
# 1. Create a release branch
git checkout -b release/v0.0.2

# 2. Update version
npm version patch --no-git-tag-version

# 3. Update CHANGELOG.md

# 4. Commit and push
git add .
git commit -m "chore: prepare release v0.0.2"
git push origin release/v0.0.2

# 5. Create PR and merge

# 6. After merge, tag and push
git tag v0.0.2
git push origin v0.0.2
```

## 🔍 Monitoring

### View Workflow Runs

Go to: **Actions** tab → Select workflow → View runs

### Check Published Package

```bash
# View on NPM
open https://www.npmjs.com/package/nestjs-serverless-workflow

# Check version
npm view nestjs-serverless-workflow version

# Test installation
npm install nestjs-serverless-workflow@latest
```

### Verify Release

```bash
# List releases
gh release list

# View specific release
gh release view v0.0.2
```

## 🐛 Troubleshooting

### Issue: Publish fails with authentication error

**Solution**: Check NPM_TOKEN secret
```bash
# Verify token works locally
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN" > ~/.npmrc
npm whoami
```

### Issue: Build fails

**Solution**: Run build locally first
```bash
bun install
bun run build
```

### Issue: Tag already exists

**Solution**: Delete and recreate
```bash
git tag -d v0.0.2
git push origin :refs/tags/v0.0.2
```

### Issue: Permission denied

**Solution**: Check repository settings
- Settings → Actions → General
- Workflow permissions → **Read and write**

## 📊 Badge Status

Add to README.md:

```markdown
![CI](https://github.com/tung-dnt/nestjs-serverless-workflow/workflows/CI/badge.svg)
![Publish](https://github.com/tung-dnt/nestjs-serverless-workflow/workflows/Publish%20to%20NPM/badge.svg)
![npm version](https://img.shields.io/npm/v/nestjs-serverless-workflow.svg)
![npm downloads](https://img.shields.io/npm/dm/nestjs-serverless-workflow.svg)
```

## 🔒 Security Best Practices

1. **Use Granular Tokens**: Only grant necessary permissions
2. **Set Expiration**: Tokens should expire and be rotated
3. **Enable Automation**: Bypasses 2FA for CI/CD
4. **Limit Scope**: Only specific packages
5. **Monitor Usage**: Check npm token activity regularly

## 📝 Changelog Management

Update `CHANGELOG.md` before release:

```markdown
## [0.0.2] - 2024-12-26

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix Z

### Changed
- Updated dependency A
```

## 🎯 Best Practices

1. **Always test locally** before pushing
2. **Update CHANGELOG.md** for each release
3. **Use semantic versioning** (MAJOR.MINOR.PATCH)
4. **Tag releases** for traceability
5. **Monitor Actions** for failures
6. **Keep dependencies updated**

## 📚 References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Bun Documentation](https://bun.sh/docs)

## 🆘 Support

For issues with workflows:
- Check [Actions logs](https://github.com/tung-dnt/nestjs-serverless-workflow/actions)
- Review [workflow files](./)
- Open an [issue](https://github.com/tung-dnt/nestjs-serverless-workflow/issues)

