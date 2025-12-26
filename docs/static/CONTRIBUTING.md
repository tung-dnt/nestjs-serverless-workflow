# Contributing to serverless-workflow

Thank you for your interest in contributing to serverless-workflow! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/@nestjs-serverless-workflow.git
   cd nestjs-serverless-workflow
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Run tests**
   ```bash
   bun test
   ```

4. **Build the package**
   ```bash
   bun run build
   ```

## Project Structure

```
nestjs-serverless-workflow/
├── src/                    # Source code
│   ├── workflow/          # Core workflow module
│   ├── event-bus/         # Event bus and brokers
│   ├── adapter/           # Runtime adapters
│   └── exception/         # Custom exceptions
├── tests/                 # Test files
├── examples/              # Example implementations
├── docs/                  # Documentation
└── scripts/               # Build and utility scripts
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Code Style

- Use TypeScript for all new code
- Follow existing code style and conventions
- Use descriptive variable and function names
- Add JSDoc comments for public APIs

### 3. Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Aim for >80% code coverage

```bash
# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:cov
```

### 4. Documentation

- Update documentation for API changes
- Add examples for new features
- Keep README.md up to date

### 5. Commit Messages

Use conventional commit messages:

```
feat: add new workflow decorator
fix: resolve timeout issue in lambda adapter
docs: update getting started guide
test: add tests for retry logic
chore: update dependencies
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test changes
- `chore`: Maintenance tasks
- `refactor`: Code refactoring
- `perf`: Performance improvements

## Pull Request Process

1. **Update your branch**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run tests and linting**
   ```bash
   bun test
   bun run typecheck
   ```

3. **Create Pull Request**
   - Provide a clear description of changes
   - Reference any related issues
   - Include examples if applicable
   - Update CHANGELOG.md

4. **Review Process**
   - Address review comments
   - Keep PR focused and atomic
   - Ensure CI passes

## Package Development

### Building

The package uses TypeScript compiler for ESM output:

```bash
bun run build
```

Output structure:
```
dist/
├── workflow/
│   ├── index.js
│   └── index.d.ts
├── event-bus/
│   ├── index.js
│   └── index.d.ts
├── adapter/
│   ├── index.js
│   └── index.d.ts
└── exception/
    ├── index.js
    └── index.d.ts
```

### Testing Locally

Test the package locally before publishing:

```bash
# Build the package
bun run build

# Link locally
npm link

# In another project
npm link serverless-workflow
```

## Adding New Modules

When adding a new module:

1. Create the module directory under `src/`
2. Add an `index.ts` file with exports
3. Update `package.json` exports field
4. Update `package.json` typesVersions
5. Add documentation in `docs/`
6. Add tests in `tests/`
7. Add examples in `examples/`

Example:

```json
// package.json
{
  "exports": {
    "./your-module": {
      "types": "./dist/your-module/index.d.ts",
      "import": "./dist/your-module/index.js",
      "default": "./dist/your-module/index.js"
    }
  },
  "typesVersions": {
    "*": {
      "your-module": ["./dist/your-module/index.d.ts"]
    }
  }
}
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag
4. Build and test
5. Publish to npm

```bash
# Update version
npm version patch|minor|major

# Build
bun run build

# Publish
npm publish
```

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for questions
- Check existing issues and PRs

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the best solution for users

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

