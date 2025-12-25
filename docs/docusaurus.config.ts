import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'NestJS Serverless Workflow',
  tagline: 'Workflow and State Machines for NestJS',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://tung-dnt.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/nestjs-serverless-workflow/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'tung-dnt', // Usually your GitHub org/user name.
  projectName: 'nestjs-serverless-workflow', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'NestJS Serverless Workflow',
      logo: {
        alt: 'NestJS Serverless Workflow Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/tung-dnt/nestjs-serverless-workflow',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/nestjs-serverless-workflow',
          label: 'NPM',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'Workflow Module',
              to: '/docs/workflow',
            },
            {
              label: 'Event Bus',
              to: '/docs/event-bus',
            },
            {
              label: 'Adapters',
              to: '/docs/adapters',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'Examples',
              to: '/docs/examples/lambda-order-state-machine',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference/workflow-module',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/tung-dnt/nestjs-serverless-workflow',
            },
            {
              label: 'NPM',
              href: 'https://www.npmjs.com/package/nestjs-serverless-workflow',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Contributing',
              href: 'https://github.com/tung-dnt/nestjs-serverless-workflow/blob/main/CONTRIBUTING.md',
            },
            {
              label: 'Changelog',
              href: 'https://github.com/tung-dnt/nestjs-serverless-workflow/blob/main/CHANGELOG.md',
            },
            {
              label: 'License',
              href: 'https://github.com/tung-dnt/nestjs-serverless-workflow/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Thomas Do (tung-dnt). Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript'],
    },
  },

  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],
};

export default config;

