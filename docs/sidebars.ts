import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'quick-start',
    {
      type: 'category',
      label: 'Key Concepts',
      items: [
        'concepts/workflow',
        'concepts/transit-result',
        'concepts/adapters',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      items: [
        'recipes/human-in-the-loop',
        'recipes/custom-adapter',
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
