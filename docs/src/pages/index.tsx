import CodeShowcase from '@components/CodeShowcase';
import CommunitySection from '@components/CommunitySection';
import HomepageFeatures from '@components/HomepageFeatures';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import { type JSX, useCallback, useState } from 'react';
import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText('npm install nestjs-serverless-workflow');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title.replace('Workflow', '')}
          <span className={styles.heroTitleAccent}>Workflow</span>
        </Heading>
        <p className={styles.heroSubtitle}>
          A powerful, tree-shakable workflow and state machine library for NestJS
          applications, optimized for serverless environments like AWS Lambda.
        </p>
        <div
          className={styles.installCommand}
          onClick={handleCopy}
          role="button"
          tabIndex={0}
          title="Click to copy"
          onKeyDown={(e) => e.key === 'Enter' && handleCopy()}
        >
          <span className={styles.installPrompt}>$</span>
          <span className={styles.installText}>
            npm install <span className={styles.installPkg}>nestjs-serverless-workflow</span>
          </span>
          <svg
            className={styles.copyIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {copied ? (
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </>
            )}
          </svg>
        </div>
        <div className={styles.buttons}>
          <Link className={styles.primaryBtn} to="/docs/getting-started">
            Get Started
          </Link>
          <Link
            className={styles.outlineBtn}
            href="https://github.com/tung-dnt/nestjs-serverless-workflow"
          >
            GitHub
          </Link>
        </div>
        <div className={styles.badges}>
          <a href="https://www.npmjs.com/package/nestjs-serverless-workflow">
            <img
              className={styles.badge}
              src="https://img.shields.io/npm/v/nestjs-serverless-workflow.svg?style=flat-square"
              alt="npm version"
            />
          </a>
          <a href="https://www.npmjs.com/package/nestjs-serverless-workflow">
            <img
              className={styles.badge}
              src="https://img.shields.io/npm/dm/nestjs-serverless-workflow.svg?style=flat-square"
              alt="npm downloads"
            />
          </a>
          <a href="https://github.com/tung-dnt/nestjs-serverless-workflow/blob/main/LICENSE">
            <img
              className={styles.badge}
              src="https://img.shields.io/npm/l/nestjs-serverless-workflow.svg?style=flat-square"
              alt="license"
            />
          </a>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="A powerful, tree-shakable workflow and state machine library for NestJS applications, optimized for serverless environments like AWS Lambda."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeShowcase />
        <CommunitySection />
      </main>
    </Layout>
  );
}
