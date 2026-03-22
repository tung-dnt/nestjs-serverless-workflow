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
  name: 'order',
  states: {
    finals: ['delivered', 'cancelled'],
    idles: ['pending_payment', 'processing'],
    failed: ['cancelled'],
  },
  transitions: [
    { from: 'pending_payment', to: 'processing', event: 'PAYMENT_RECEIVED' },
    { from: 'processing', to: 'shipped', event: 'SHIP_ORDER' },
    { from: 'shipped', to: 'delivered', event: 'CONFIRM_DELIVERY' },
    { from: '*', to: 'cancelled', event: 'CANCEL', condition: 'canCancel' },
  ],
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
    label: 'Entity',
    code: `import { IWorkflowEntity } from 'nestjs-serverless-workflow/core';

export class Order implements IWorkflowEntity<Order, OrderState> {
  id: string;
  status: OrderState;
  paidAt?: Date;
  shippedAt?: Date;

  getState(): OrderState {
    return this.status;
  }

  setState(state: OrderState): void {
    this.status = state;
  }
}

type OrderState =
  | 'pending_payment'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';`,
  },
];

const usageTabs = [
  {
    label: 'Service',
    code: `import { OrchestratorService } from 'nestjs-serverless-workflow/core';

@Injectable()
export class OrderService {
  constructor(
    private readonly orchestrator: OrchestratorService,
  ) {}

  async processPayment(orderId: string, payload: PaymentDto) {
    const result = await this.orchestrator.transit({
      workflow: 'order',
      entityId: orderId,
      event: 'PAYMENT_RECEIVED',
      payload,
    });

    // result.status: 'final' | 'idle' | 'continued' | 'no_transition'
    return result;
  }
}`,
  },
  {
    label: 'Lambda',
    code: `import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';

const app = await NestFactory.createApplicationContext(AppModule);

export const handler = DurableLambdaEventHandler(app, {
  workflow: 'order',
  // Automatic checkpoint & replay on timeout
  // Batch item failure reporting for SQS
  // Graceful shutdown handling
});

// Deploy with SQS event source mapping
// Each message triggers a workflow transition
// Failed items are automatically retried`,
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
