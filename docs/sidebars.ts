import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Creating a sidebar enables you to:
 - create an order group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'README',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'workflow',
        'event-bus',
        'adapters',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/workflow-module',
        'api-reference/decorators',
        'api-reference/services',
        'api-reference/interfaces',
        'api-reference/adapters',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/lambda-order-state-machine',
      ],
    },
  ],
};

export default sidebars;

