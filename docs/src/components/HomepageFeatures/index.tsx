import Heading from '@theme/Heading';
import clsx from 'clsx';
import { JSX } from 'react/jsx-runtime';

import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg?: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'State Machine Engine',
    description: (
      <>
        Define workflows with states, transitions, and events. Built-in support for
        final states, idle states, and failure handling.
      </>
    ),
  },
  {
    title: 'Event-Driven Architecture',
    description: (
      <>
        Integrate with message brokers like SQS, Kafka, or RabbitMQ. Publish and
        consume workflow events seamlessly.
      </>
    ),
  },
  {
    title: 'Serverless Optimized',
    description: (
      <>
        Built specifically for AWS Lambda with automatic timeout handling, batch
        processing, and graceful shutdown capabilities.
      </>
    ),
  },
  {
    title: 'Tree-Shakable',
    description: (
      <>
        Subpath exports ensure minimal bundle sizes. Import only what you need
        for faster cold starts in serverless environments.
      </>
    ),
  },
  {
    title: 'Type-Safe',
    description: (
      <>
        Full TypeScript support with comprehensive type definitions. Catch errors
        at compile time, not runtime.
      </>
    ),
  },
  {
    title: 'Retry Logic',
    description: (
      <>
        Built-in retry mechanisms with exponential backoff. Handle transient
        failures gracefully with configurable retry policies.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
