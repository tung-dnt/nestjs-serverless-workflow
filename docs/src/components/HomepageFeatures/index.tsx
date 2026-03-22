import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import type { JSX, ReactNode } from 'react';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: ReactNode;
  description: string;
  link: string;
};

function FeatureIcon({ children }: { children: ReactNode }) {
  return <div className={styles.iconWrapper}>{children}</div>;
}

const FeatureList: FeatureItem[] = [
  {
    title: 'State Machine Engine',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    description:
      'Define workflows with states, transitions, and events. Built-in support for final states, idle states, and failure handling.',
    link: '/docs/workflow',
  },
  {
    title: 'Serverless Optimized',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    description:
      'Built for AWS Lambda with automatic timeout handling, batch processing, and graceful shutdown. Minimal cold start overhead.',
    link: '/docs/adapters',
  },
  {
    title: 'Durable Execution',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    description:
      'Checkpoint and replay execution with the Durable Lambda Adapter. Survive timeouts and resume exactly where you left off.',
    link: '/docs/event-bus',
  },
  {
    title: 'Fully Type-Safe',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    description:
      'Full TypeScript support with comprehensive type definitions. Catch workflow configuration errors at compile time, not runtime.',
    link: '/docs/workflow',
  },
  {
    title: 'Tree-Shakable',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      </svg>
    ),
    description:
      'Subpath exports ensure minimal bundle sizes. Import only what you need for faster cold starts in serverless environments.',
    link: '/docs/getting-started',
  },
  {
    title: 'Retry & Error Handling',
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
      </svg>
    ),
    description:
      'Built-in retry with exponential and linear backoff. Handle transient failures gracefully with configurable @WithRetry policies.',
    link: '/docs/api-reference/decorators',
  },
];

function Feature({ title, icon, description, link }: FeatureItem) {
  return (
    <Link className={styles.card} to={link}>
      <FeatureIcon>{icon}</FeatureIcon>
      <Heading as="h3" className={styles.cardTitle}>
        {title}
      </Heading>
      <p className={styles.cardDesc}>{description}</p>
    </Link>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <Heading as="h2" className="sectionTitle">
          Why NestJS Serverless Workflow?
        </Heading>
        <p className="sectionSubtitle">
          A modern workflow engine that gets out of your way and lets you focus on business logic
        </p>
        <div className={styles.grid}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
