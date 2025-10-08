# Twilio Flex Mental Model
**Created:** 2025-01-07
**Purpose:** Document understanding of Flex architecture before enriching knowledge base

---

## Core Architecture

### 1. Flex UI Component Tree
Flex UI is a React application with a hierarchical component structure:

```
FlexRootContainer
├── MainHeader (global, always visible)
│   ├── Content (extensible area)
│   └── Various built-in components
├── AgentDesktopView
│   ├── TaskCanvas (center panel, task-specific)
│   │   ├── TaskCanvasHeader
│   │   ├── TaskCanvasT abs
│   │   └── Content areas
│   └── TaskInfoPanel (right sidebar, task-specific)
│       └── Content (extensible area)
├── TeamsView (supervisor view)
└── Other views...
```

**Key Insight:** Components follow `.Content.add()`, `.Content.replace()`, `.Content.remove()` pattern for customization.

### 2. The Plugin Lifecycle

**Plugin Structure:**
```typescript
export default class MyPlugin extends FlexPlugin {
  constructor() {
    super('MyPlugin');
  }

  init(flex: typeof Flex, manager: Flex.Manager) {
    // All customizations happen here
    // This runs ONCE when plugin loads
  }
}
```

**Initialization Flow:**
1. Plugin loads
2. `init()` called with `flex` (UI library) and `manager` (runtime state)
3. Register components, actions, event listeners
4. Plugin is "active" - customizations are live

### 3. Actions Framework

**Three ways to work with actions:**

```typescript
// 1. Invoke an action (trigger it)
Flex.Actions.invokeAction("AcceptTask", { sid: "WTxxx" });

// 2. Replace action (intercept and modify)
Flex.Actions.replaceAction("AcceptTask", async (payload, original) => {
  // Custom logic before
  await customValidation(payload);
  // MUST call original or action breaks
  return original(payload);
});

// 3. Listen to actions (before/after hooks)
Flex.Actions.addListener("beforeAcceptTask", (payload, abort) => {
  if (!isValid(payload)) abort(); // Cancel action
});

Flex.Actions.addListener("afterAcceptTask", async (payload) => {
  await logToCRM(payload); // React to completion
});
```

**Critical Gotchas:**
- `replaceAction` MUST return `original(payload)` promise or action breaks
- `beforeX` listeners can `abort()` to cancel
- `afterX` listeners cannot cancel (already happened)
- Payload validation: always check if required props exist

### 4. Component Placement Patterns

**From flex-project-template analysis:**

```typescript
// Pattern: Add to component's Content area
flex.TaskCanvasHeader.Content.add(<MyComponent key="unique-key" />, {
  sortOrder: 1,  // Controls position
  if: (props) => props.task.taskStatus === 'assigned'  // Conditional rendering
});
```

**Common locations:**
- `TaskCanvasHeader` - Top of task panel, per-task controls
- `TaskInfoPanel.Content` - Right sidebar, task details/CRM data
- `MainHeader.Content` - Top bar, global controls
- `TaskCanvas.Content` - Main interaction area

### 5. Production Feature Pattern (Twilio template)

**Standard structure:**
```
feature-name/
├── config.ts                    # Feature configuration
├── index.ts                     # Feature registration
├── flex-hooks/
│   ├── actions/                 # Action replacements/listeners
│   ├── components/              # Component registrations
│   ├── states/                  # Redux state slices
│   ├── strings/                 # Localization
│   ├── notifications/           # Custom notifications
│   └── events/                  # Event listeners
├── custom-components/           # React components
├── utils/                       # Helper functions
└── types/                       # TypeScript types
```

**Example from chat-transfer:**
- `flex-hooks/components/TaskCanvasHeader.tsx` - Registers UI component
- `custom-components/TransferButton.tsx` - The actual React component
- `flex-hooks/actions/TransferTask.ts` - Intercepts transfer action
- `utils/` - Business logic

**Pattern:** Hooks files export `componentName` and `componentHook` function

### 6. Data Flow

```
Task arrives
  ↓
Task Router assigns to worker
  ↓
Flex creates Reservation
  ↓
UI shows task in TaskCanvas
  ↓
Agent can access:
  - task.attributes (customer data, context)
  - task.sid (unique ID)
  - manager.workerClient (agent info)
  - manager.store.getState() (global Flex state)
```

**Key objects:**
- `Task` - The work item (call, chat, email)
- `Reservation` - Assignment of task to worker
- `Worker` - The agent
- `Manager` - Flex runtime instance (singleton)

### 7. Common Patterns Observed

**Pattern 1: Conditional Component**
```typescript
flex.TaskInfoPanel.Content.add(<CRMPanel key="crm" />, {
  if: (props) => Flex.TaskHelper.isChatBasedTask(props.task)
});
```

**Pattern 2: Action Validation**
```typescript
Flex.Actions.addListener("beforeAcceptTask", (payload, abort) => {
  if (!payload.task || !payload.sid) {
    console.error("Invalid payload");
    abort();
  }
});
```

**Pattern 3: Task Null Check**
```typescript
// Task can be null if reservation ended
const task = props.task;
if (!task) return null;

// Always check attributes exist
const customerId = task.attributes?.customer_id;
```

**Pattern 4: Manager Instance**
```typescript
// Get manager (singleton)
const manager = Flex.Manager.getInstance();

// Access worker data
const worker = manager.workerClient;
const { full_name, email } = worker.attributes;
```

### 8. Component Methods by Type

**All extensible components support:**
- `.Content.add(component, options)` - Add to component
- `.Content.replace(component, options)` - Replace content
- `.Content.remove(key)` - Remove by key

**Options:**
- `sortOrder`: number - Controls position (lower = earlier)
- `if`: function - Conditional rendering
- `align`: string - Alignment ("start", "end")

### 9. Critical Gotchas from Knowledge Base

1. **Deploy without `--include-remote`** - Deletes all other plugins!
2. **Task validation** - Always check `if (!payload.task && !payload.sid) return;`
3. **replaceAction return** - MUST return `original(payload)` promise
4. **Task removal timing** - Check `tasks.get(sid)` before use (async)
5. **Null task in SelectTask** - Null means reservation ended
6. **Payload immutability** - Don't mutate, create new object
7. **Event listener cleanup** - Remove listeners in cleanup function
8. **State updates** - Use Redux properly, don't mutate state

---

## Knowledge Base Files Analysis

### ULTIMATE_FLEX_KNOWLEDGE.json (117KB)
- 44 actions with usage counts
- Quick patterns (curated examples)
- CLI commands (deployment, essential)
- Edge cases and gotchas
- Production features metadata

### FINAL_FLEX_KNOWLEDGE.json (1.4MB)
- 753 total code blocks
- 300 code examples from docs
- 248 unique CLI commands
- 44 unique actions
- Raw examples, no context

### component_registry.json (14KB)
- 11 components with methods
- Usage counts per method
- Code snippets with source URLs
- Unique patterns extracted

### action_payloads.json (12KB)
- 12 actions with payload schemas
- Required vs optional properties
- Example payloads
- Usage frequencies

---

## What Makes a Good Enrichment

Based on analysis, enriched context should include:

1. **Visual Location** - "Right sidebar when task selected"
2. **When to Use** - "Adding per-task customer data"
3. **Component Hierarchy** - Where it sits in tree
4. **Common Use Cases** - Real-world scenarios
5. **Gotchas** - Things that break
6. **Related Patterns** - Alternative approaches
7. **Prerequisites** - What needs to exist first
8. **Payload Requirements** - For actions

**Example Enriched Entry:**
```json
{
  "code": "flex.TaskInfoPanel.Content.add(<CRMPanel />)",
  "context": {
    "visual_location": "Right sidebar, visible when task is selected",
    "component_hierarchy": "AgentDesktopView > TaskInfoPanel > Content",
    "when_to_use": "Display per-task information like customer details, order history, or notes",
    "common_use_cases": [
      "CRM integration panels",
      "Customer context displays",
      "Task-specific forms or actions"
    ],
    "gotchas": [
      "Component receives props.task which can be null if reservation ended",
      "Always check task?.attributes existence before accessing",
      "sortOrder controls position (lower number = higher up)"
    ],
    "related_patterns": {
      "alternatives": [
        "TaskCanvas.Content for main interaction area",
        "MainHeader.Content for always-visible global panel"
      ],
      "complements": [
        "Use TaskCanvasHeader for per-task controls/buttons"
      ]
    },
    "prerequisites": {
      "imports": ["import * as Flex from '@twilio/flex-ui'"],
      "component_must_exist": "Yes, React component with props interface"
    }
  }
}
```

---

## Next Steps

1. Design enrichment schema (JSON structure for context)
2. Create enrichment script that calls Claude API
3. Process in batches to manage cost
4. Validate quality on sample before full run
5. Update MCP server to use enriched data
