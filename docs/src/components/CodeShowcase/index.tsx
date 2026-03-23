import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import { type JSX, useState } from 'react';
import styles from './styles.module.css';

const definitionTabs = [
  {
    label: 'Workflow',
    code: `import { Workflow, OnEvent, Entity, Payload } from 'nestjs-serverless-workflow/core';

@Workflow({
  name: 'OrderWorkflow',
  states: {
    finals: ['delivered', 'cancelled'],
    idles: ['pending_payment'],
    failed: 'cancelled',
  },
  transitions: [
    { event: 'PAYMENT_RECEIVED', from: ['pending_payment'], to: 'processing' },
    { event: 'SHIP_ORDER', from: ['processing'], to: 'shipped' },
    { event: 'CONFIRM_DELIVERY', from: ['shipped'], to: 'delivered' },
    { event: 'CANCEL', from: ['pending_payment', 'processing'], to: 'cancelled' },
  ],
  entityService: 'entity.order',
})
export class OrderWorkflow {
  @OnEvent('PAYMENT_RECEIVED')
  async onPayment(@Entity() order, @Payload() payload) {
    order.paidAt = new Date();
    return order;
  }
}`,
  },
  {
    label: 'Entity Service',
    code: `import { Injectable } from '@nestjs/common';
import { IWorkflowEntity } from 'nestjs-serverless-workflow/core';

@Injectable()
export class OrderEntityService
  implements IWorkflowEntity<Order, OrderState> {

  async create() {
    return { id: uuid(), status: 'pending_payment' };
  }

  async load(urn: string) {
    return this.repo.findOne(urn);
  }

  async update(order: Order, status: OrderState) {
    order.status = status;
    return this.repo.save(order);
  }

  status(order: Order) { return order.status; }
  urn(order: Order) { return order.id; }
}`,
  },
];

const usageTabs = [
  {
    label: 'Service',
    code: `import { OrchestratorService } from 'nestjs-serverless-workflow/core';

@Injectable()
export class OrderService {
  constructor(private orchestrator: OrchestratorService) {}

  async processPayment(orderId: string, payload: PaymentDto) {
    const result = await this.orchestrator.transit({
      event: 'PAYMENT_RECEIVED',
      urn: orderId,
      payload,
      attempt: 0,
    });

    // result.status: 'final' | 'idle' | 'continued' | 'no_transition'
    return result;
  }
}`,
  },
  {
    label: 'Lambda',
    code: `import { NestFactory } from '@nestjs/core';
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);

export const handler = DurableLambdaEventHandler(app, withDurableExecution);
// Automatic checkpoint & replay across Lambda invocations
// Idle states pause via waitForCallback()
// Final states end the durable execution`,
  },
];

function TabbedCode({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className={styles.column}>
      <div className={styles.tabs}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            className={clsx(styles.tab, i === active && styles.tabActive)}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.codeBlock}>
        <CodeBlock language="typescript">{tabs[active].code}</CodeBlock>
      </div>
    </div>
  );
}

export default function CodeShowcase(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2" className="sectionTitle">
          Define, Transit, Done
        </Heading>
        <p className="sectionSubtitle">
          Define workflows with decorators, transit states with a clean type-safe API
        </p>
        <div className={styles.columns}>
          <TabbedCode tabs={definitionTabs} />
          <TabbedCode tabs={usageTabs} />
        </div>
      </div>
    </section>
  );
}
