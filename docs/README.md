# Documentation

This directory contains the Docusaurus documentation site for NestJS Serverless Workflow.

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run start

# Build for production
bun run build

# Serve production build locally
bun run serve
```

## Structure

- `docs/` - Documentation markdown files
- `src/` - React components and custom pages
- `static/` - Static assets (images, etc.)
- `docusaurus.config.ts` - Docusaurus configuration
- `sidebars.ts` - Sidebar navigation configuration

## Deployment

Documentation is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the `main` branch.

The site is available at: https://tung-dnt.github.io/nestjs-serverless-workflow/

