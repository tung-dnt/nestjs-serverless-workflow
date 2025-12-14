# SAGA Pattern Flow Diagrams

Visual representations of how SAGA pattern works in the orchestrator.

## Table of Contents
- [Successful Workflow Flow](#successful-workflow-flow)
- [Failed Workflow with Compensation](#failed-workflow-with-compensation)
- [SAGA Context Lifecycle](#saga-context-lifecycle)
- [Rollback Strategy Comparison](#rollback-strategy-comparison)
- [Component Interaction](#component-interaction)

---

## Successful Workflow Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUCCESSFUL WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

   Client Request
        │
        ▼
   ┌─────────────────┐
   │  Orchestrator   │
   │  .transit()     │
   └────────┬────────┘
            │
            ▼
   ┌───────────────────────────────────────────────┐
   │ 1. Initialize SAGA Context                    │
   │    - Generate sagaId: "saga-1234567890-0.123" │
   │    - Status: RUNNING                          │
   │    - executedSteps: []                        │
   └────────┬──────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────┐
   │ 2. Load Entity                                   │
   │    - Order: { id: "ORD-123", status: "pending" } │
   └────────┬─────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ STEP 1: Reserve Inventory                                   ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ├─── Store beforeState: { status: "pending" }
            │
            ▼
   ┌─────────────────┐
   │ @OnEvent        │
   │ 'reserve'       │──▶ Execute: reserveInventory()
   └────────┬────────┘      └─▶ Return: { reservationId: "RES-456" }
            │
            ▼
   ┌─────────────────┐
   │ Update Entity   │──▶ Status: "pending" → "reserved"
   └────────┬────────┘
            │
            ▼
   ┌───────────────────────────────────────────┐
   │ Record SAGA Step                          │
   │  {                                        │
   │    event: "reserve",                      │
   │    beforeState: { status: "pending" },    │
   │    afterState: { status: "reserved" },    │
   │    payload: { reservationId: "RES-456" }, │
   │    compensated: false                     │
   │  }                                        │
   └────────┬──────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════╗
   ║ STEP 2: Process Payment ║
   ╚═════════════════════════╝
            │
            ├─── Store beforeState: { status: "reserved" }
            │
            ▼
   ┌─────────────────┐
   │ @OnEvent        │
   │ 'pay'           │──▶ Execute: processPayment()
   └────────┬────────┘      └─▶ Return: { transactionId: "TXN-789" }
            │
            ▼
   ┌─────────────────┐
   │ Update Entity   │──▶ Status: "reserved" → "paid"
   └────────┬────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Record SAGA Step                                             │
   │  {                                                           │
   │    event: "pay",                                             │
   │    beforeState: { status: "reserved" },                     │
   │    afterState: { status: "paid" },                          │
   │    payload: { transactionId: "TXN-789" },                   │
   │    compensated: false                                        │
   │  }                                                           │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════╗
   ║ STEP 3: Complete Order  ║
   ╚═════════════════════════╝
            │
            ▼
   ┌─────────────────┐
   │ @OnEvent        │
   │ 'complete'      │──▶ Execute: completeOrder()
   └────────┬────────┘      └─▶ Return: void
            │
            ▼
   ┌─────────────────┐
   │ Update Entity   │──▶ Status: "paid" → "completed"
   └────────┬────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Mark SAGA as COMPLETED                                       │
   │    - Status: COMPLETED                                       │
   │    - completedAt: 2024-01-15T10:30:00Z                      │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐
   │   SUCCESS ✓     │
   └─────────────────┘
```

---

## Failed Workflow with Compensation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   FAILED WORKFLOW WITH COMPENSATION                      │
└─────────────────────────────────────────────────────────────────────────┘

   Client Request
        │
        ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ STEP 1: Reserve Inventory (SUCCESS)                          ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ SAGA Context:                                                │
   │   executedSteps: [                                           │
   │     { event: "reserve", compensated: false, ... }           │
   │   ]                                                          │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ STEP 2: Process Payment (SUCCESS)                            ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ SAGA Context:                                                │
   │   executedSteps: [                                           │
   │     { event: "reserve", compensated: false, ... },          │
   │     { event: "pay", compensated: false, ... }               │
   │   ]                                                          │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ STEP 3: Complete Order (FAILED ✗)                            ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Error Caught!                                                │
   │   - Error: "Email service unavailable"                      │
   │   - Update entity status → "failed"                         │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Mark SAGA as COMPENSATING                                    │
   │   - Status: COMPENSATING                                     │
   │   - error: Error("Email service unavailable")               │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Execute Compensations (REVERSE_ORDER)                        │
   │   - Get steps to compensate: ["pay", "reserve"]             │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ COMPENSATION 1: Refund Payment                               ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ▼
   ┌─────────────────┐
   │ @OnCompensation │
   │ 'pay'           │──▶ Execute: refundPayment()
   └────────┬────────┘      └─▶ Refund: TXN-789
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Mark step as compensated                                     │
   │   { event: "pay", compensated: true }                       │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ╔═════════════════════════════════════════════════════════════╗
   ║ COMPENSATION 2: Release Inventory                            ║
   ╚═════════════════════════════════════════════════════════════╝
            │
            ▼
   ┌─────────────────┐
   │ @OnCompensation │
   │ 'reserve'       │──▶ Execute: releaseInventory()
   └────────┬────────┘      └─▶ Release: RES-456
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Mark step as compensated                                     │
   │   { event: "reserve", compensated: true }                   │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Mark SAGA as COMPENSATED                                     │
   │   - Status: COMPENSATED                                      │
   │   - completedAt: 2024-01-15T10:30:05Z                       │
   └────────┬────────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐
   │ Throw Error ✗   │
   └─────────────────┘
```

---

## SAGA Context Lifecycle

```
┌────────────────────────────────────────────────────────────────┐
│                    SAGA CONTEXT LIFECYCLE                       │
└────────────────────────────────────────────────────────────────┘

    Workflow Start
         │
         ▼
    ┌─────────┐
    │  INIT   │  sagaService.initializeSaga()
    └────┬────┘
         │     • Generate sagaId
         │     • Set status: RUNNING
         │     • Save to history store
         │
         ▼
    ┌──────────┐
    │ RUNNING  │◀─┐
    └────┬─────┘  │
         │        │
         ├────────┘  sagaService.recordStep()
         │           • Add step to executedSteps[]
         │           • Save updated context
         │
         │
         ├──────────────────────────────┐
         │                              │
    SUCCESS PATH                   FAILURE PATH
         │                              │
         ▼                              ▼
    ┌───────────┐              ┌───────────────┐
    │ COMPLETED │              │ COMPENSATING  │
    └───────────┘              └───────┬───────┘
         │                             │
         │                             │  sagaService.executeCompensations()
         │                             │  • Execute compensations
         │                             │  • Mark steps as compensated
         │                             │
         │                             ├───────────────┬──────────────┐
         │                             │               │              │
         │                             ▼               ▼              ▼
         │                      ┌─────────────┐  ┌─────────┐  ┌──────────┐
         │                      │ COMPENSATED │  │ FAILED  │  │ RUNNING  │
         │                      └─────────────┘  └─────────┘  └──────────┘
         │                             │              │             │
         │                             │              │             │
         │                      (All compensations  (Compensation  (Resume)
         │                       succeeded)          failed)
         │                             │              │             │
         ▼                             ▼              ▼             ▼
    ┌────────────────────────────────────────────────────────────┐
    │              History Store Retention                        │
    │  • Auto-delete after TTL (e.g., 1 hour)                    │
    │  • Or keep for audit/debugging                             │
    └────────────────────────────────────────────────────────────┘
```

---

## Rollback Strategy Comparison

### REVERSE_ORDER Strategy

```
Execution Order:
    Step 1 ──▶ Step 2 ──▶ Step 3 ──▶ Step 4 ✗ FAIL

Compensation Order:
    Step 3 ◀── Step 2 ◀── Step 1

Timeline:
    t0: Execute Step 1  ✓
    t1: Execute Step 2  ✓
    t2: Execute Step 3  ✓
    t3: Execute Step 4  ✗ FAIL!
    t4: Compensate Step 3  ✓
    t5: Compensate Step 2  ✓
    t6: Compensate Step 1  ✓

Use Case: Default choice - undo operations in reverse order
Example: Reserve → Pay → Ship → Email ✗
         Undo:   Email ← Ship ← Pay ← Reserve
```

### IN_ORDER Strategy

```
Execution Order:
    Step 1 ──▶ Step 2 ──▶ Step 3 ──▶ Step 4 ✗ FAIL

Compensation Order:
    Step 1 ──▶ Step 2 ──▶ Step 3

Timeline:
    t0: Execute Step 1  ✓
    t1: Execute Step 2  ✓
    t2: Execute Step 3  ✓
    t3: Execute Step 4  ✗ FAIL!
    t4: Compensate Step 1  ✓
    t5: Compensate Step 2  ✓
    t6: Compensate Step 3  ✓

Use Case: When cleanup order matters
Example: Lock → Allocate → Process → Commit ✗
         Undo: Lock → Allocate → Process (in order)
```

### PARALLEL Strategy

```
Execution Order:
    Step 1 ──▶ Step 2 ──▶ Step 3 ──▶ Step 4 ✗ FAIL

Compensation Order (Parallel):
    ┌─ Step 1 ─┐
    ├─ Step 2 ─┤  All execute simultaneously
    └─ Step 3 ─┘

Timeline:
    t0: Execute Step 1  ✓
    t1: Execute Step 2  ✓
    t2: Execute Step 3  ✓
    t3: Execute Step 4  ✗ FAIL!
    t4: Compensate Step 1 ∥ Step 2 ∥ Step 3  ✓

Use Case: Independent compensations, fastest rollback
Example: Reserve Hotel ∥ Reserve Car ∥ Reserve Flight
         All can be cancelled independently and simultaneously
```

---

## Component Interaction

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT INTERACTION                            │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Client     │
│   Request    │
└──────┬───────┘
       │
       │ IWorkflowEvent { urn, payload, topic, attempt }
       │
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        OrchestratorService                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ transit(params: IWorkflowEvent)                                 │ │
│  │  1. Load route configuration                                    │ │
│  │  2. Initialize SAGA (if enabled)                               │ │
│  │  3. Execute workflow transitions                               │ │
│  │  4. Record SAGA steps                                          │ │
│  │  5. Handle errors & compensations                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────┬───────────────────┬──────────────────┬──────────────────────┘
        │                   │                  │
        │                   │                  │
        ▼                   ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ SagaService  │   │RouteHelper   │   │ Entity Service   │
└──────┬───────┘   └──────┬───────┘   └────────┬─────────┘
       │                  │                     │
       │ initializeSaga() │                     │ load()
       │ recordStep()     │ findTransition()    │ update()
       │ markFailed()     │ validate()          │ status()
       │ compensate()     │                     │
       │                  │                     │
       ▼                  │                     │
┌─────────────────┐       │                     │
│ History Store   │       │                     │
│  (Redis/DB)     │       │                     │
└─────────────────┘       │                     │
       │                  │                     │
       │ save/get/delete  │                     │
       │ SagaContext      │                     │
       │                  │                     │
       ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────┐
│              Workflow Handler (Your Code)                 │
│  ┌────────────────────┐  ┌──────────────────────────┐   │
│  │ @OnEvent           │  │ @OnCompensation          │   │
│  │ async forward()    │  │ async compensate()       │   │
│  └────────────────────┘  └──────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
       │                              │
       │ Call external services       │ Undo operations
       │                              │
       ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│            External Services / APIs                       │
│  • Payment Service                                        │
│  • Inventory Service                                      │
│  • Notification Service                                   │
│  • etc.                                                   │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow: SAGA Step Recording

```
┌────────────────────────────────────────────────────────────┐
│              SAGA STEP RECORDING DATA FLOW                  │
└────────────────────────────────────────────────────────────┘

Before Step Execution:
┌──────────────────────────────────────┐
│ Entity State (Before)                │
│ {                                    │
│   id: "ORD-123",                    │
│   status: "pending",                 │
│   amount: 100                        │
│ }                                    │
└──────────────┬───────────────────────┘
               │
               │ Deep clone
               │
               ▼
        Store as beforeState
               │
               │
Step Execution │
               │
               ▼
┌──────────────────────────────────────┐
│ Handler Execution                     │
│ @OnEvent('reserve')                   │
│ async reserveInventory() {            │
│   return { reservationId: "RES-456" }│
│ }                                     │
└──────────────┬───────────────────────┘
               │
               │ Returns payload
               │
               ▼
┌──────────────────────────────────────┐
│ Update Entity                         │
│ {                                     │
│   id: "ORD-123",                     │
│   status: "reserved", ← Updated      │
│   amount: 100,                        │
│   reservationId: "RES-456" ← Added   │
│ }                                     │
└──────────────┬───────────────────────┘
               │
               │
After Step     │
Execution      │
               ▼
┌───────────────────────────────────────────────────────────┐
│ SagaService.recordStep()                                  │
│                                                            │
│ Create SagaStep:                                          │
│ {                                                          │
│   event: "reserve",                                       │
│   executedAt: 2024-01-15T10:30:00Z,                      │
│   beforeState: { id: "ORD-123", status: "pending" },     │
│   afterState: { id: "ORD-123", status: "reserved" },     │
│   payload: { reservationId: "RES-456" },                 │
│   compensated: false                                      │
│ }                                                          │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Add to context.executedSteps[]
               │
               ▼
┌───────────────────────────────────────────────────────────┐
│ Updated SAGA Context                                       │
│ {                                                          │
│   sagaId: "saga-123",                                     │
│   status: "RUNNING",                                       │
│   executedSteps: [                                        │
│     {                                                      │
│       event: "reserve",                                   │
│       beforeState: {...},                                 │
│       afterState: {...},                                  │
│       payload: {...},                                     │
│       compensated: false                                  │
│     }                                                      │
│   ]                                                        │
│ }                                                          │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Persist
               │
               ▼
┌──────────────────────────────────────┐
│ History Store                         │
│ (Redis / DynamoDB / PostgreSQL)      │
└──────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────────────┐
│                   ERROR HANDLING FLOW                       │
└────────────────────────────────────────────────────────────┘

                    Error Occurs
                         │
                         ▼
              ┌──────────────────────┐
              │   Catch Block in     │
              │   Orchestrator       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Update Entity Status │
              │ to "failed"          │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ SAGA enabled?        │
              └──────────┬───────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
           YES                       NO
            │                         │
            ▼                         ▼
┌──────────────────────┐    ┌─────────────────┐
│ markSagaFailed()     │    │ Throw error     │
│ - Set status to      │    └─────────────────┘
│   COMPENSATING       │
│ - Store error        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Collect Compensation Handlers        │
│ - Iterate through routes             │
│ - Find matching sagaConfig           │
│ - Build Map<event, handler>          │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ executeCompensations()               │
│ - Filter uncompensated steps         │
│ - Apply rollback strategy            │
└──────────┬───────────────────────────┘
           │
           ├─────────────┬─────────────┬─────────────┐
           │             │             │             │
           ▼             ▼             ▼             ▼
    REVERSE_ORDER   IN_ORDER      PARALLEL     Custom
           │             │             │             │
           └─────────────┴─────────────┴─────────────┘
                         │
                         ▼
           ┌──────────────────────────┐
           │ Execute Each             │
           │ Compensation Handler     │
           └──────────┬───────────────┘
                      │
                      ├───────────────┐
                      │               │
                   SUCCESS         FAILURE
                      │               │
                      ▼               ▼
           ┌──────────────┐  ┌──────────────┐
           │ Mark step    │  │ failFast?    │
           │ compensated  │  └──────┬───────┘
           └──────────────┘         │
                                    ├─────────┬────────┐
                                   YES        NO       │
                                    │         │        │
                                    ▼         ▼        │
                              Throw error  Continue    │
                                           (collect    │
                                            errors)    │
                                              │        │
                                              └────────┘
                                                │
                                                ▼
                                    ┌──────────────────┐
                                    │ All compensations│
                                    │ completed        │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ Update Context   │
                                    │ Status:          │
                                    │ COMPENSATED      │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ Throw original   │
                                    │ error            │
                                    └──────────────────┘
```

---

## Configuration Resolution

```
┌────────────────────────────────────────────────────────────┐
│            SAGA CONFIGURATION RESOLUTION                    │
└────────────────────────────────────────────────────────────┘

Application Bootstrap
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ OrchestratorService.onModuleInit()                       │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ Discover All Providers                                    │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼ For each provider
┌──────────────────────────────────────────────────────────┐
│ Read Metadata:                                            │
│  1. WORKFLOW_DEFINITION_KEY                              │
│     └─▶ IWorkflowDefinition with saga config            │
│  2. WORKFLOW_HANDLER_KEY                                 │
│     └─▶ IWorkflowHandler[] with sagaConfig              │
│  3. WORKFLOW_DEFAULT_EVENT                               │
│     └─▶ Default handler                                  │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ Resolve Services:                                         │
│  • brokerPublisher (by injection token)                  │
│  • entityService (by injection token)                    │
│  • historyService (by injection token, if saga enabled)  │
│  • retryConfig (by property key)                         │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ Build Route Map:                                          │
│                                                           │
│ routes.set(event, {                                      │
│   handler: Function,                                     │
│   definition: IWorkflowDefinition,                       │
│   instance: WorkflowService,                             │
│   handlerName: string,                                   │
│   retryConfig: IBackoffRetryConfig,                      │
│   sagaConfig: ISagaConfig,      ← From @OnCompensation  │
│   historyService: ISagaHistoryStore,                     │
│   entityService: IWorkflowEntity,                        │
│   brokerPublisher: IBrokerPublisher                      │
│ })                                                        │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ Ready to handle requests                                  │
│ routes.size = N events registered                        │
└──────────────────────────────────────────────────────────┘
```

---

## Summary

These diagrams illustrate:

1. **Successful Flow**: Step-by-step execution with SAGA tracking
2. **Failed Flow**: Error handling and automatic compensation
3. **Lifecycle**: How SAGA context transitions through states
4. **Strategies**: Different rollback approaches and when to use them
5. **Components**: How all pieces interact
6. **Data Flow**: How SAGA steps are recorded and stored
7. **Error Handling**: Comprehensive error and compensation flow
8. **Configuration**: How everything is wired together at startup

Use these diagrams as reference when implementing or debugging your SAGA workflows!
