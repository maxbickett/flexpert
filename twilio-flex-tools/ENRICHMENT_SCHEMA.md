# Enrichment Schema Design
**Version:** 1.0.0
**Purpose:** Define the structure for AI-generated context to enrich code examples

---

## Schema Definition

Each code example in `FINAL_FLEX_KNOWLEDGE.json` will gain a `context` field with the following structure:

```typescript
interface EnrichedContext {
  // CLASSIFICATION (what kind of code is this?)
  pattern_type: "component_registration" | "action_invocation" | "action_replacement" |
                "action_listener" | "utility" | "configuration" | "state_management" | "unknown";

  // LOCATION (where does this code execute/affect?)
  execution_context: {
    file_type: "plugin_init" | "component" | "hook" | "utility" | "serverless" | "config";
    runs_when: string;  // "On plugin initialization", "When task is selected", etc.
  };

  // UI COMPONENTS (if registering/modifying UI)
  ui_placement?: {
    component_path: string;      // "Flex.TaskInfoPanel.Content"
    visual_location: string;     // "Right sidebar when task selected"
    component_hierarchy: string; // "AgentDesktopView > TaskInfoPanel > Content"
    always_visible: boolean;
  };

  // PURPOSE (what does this accomplish?)
  use_case: {
    summary: string;              // 1-sentence description
    common_scenarios: string[];   // Real-world use cases
    solves_problem: string;       // What problem does this solve?
  };

  // PREREQUISITES (what's needed for this to work?)
  requirements: {
    imports: string[];            // Required imports
    dependencies: string[];       // NPM packages if any
    must_exist_first: string[];   // "Task must be assigned", "Worker must be logged in"
    flex_version: string;         // "2.x", "1.x", "both"
  };

  // GOTCHAS (what can go wrong?)
  gotchas: Array<{
    issue: string;
    why: string;
    solution: string;
  }>;

  // RELATIONSHIPS (how does this relate to other patterns?)
  related_patterns: {
    alternatives: string[];       // Other ways to accomplish same thing
    complements: string[];        // Patterns often used together
    supersedes: string[];         // Older patterns this replaces
  };

  // METADATA (quality and confidence)
  enrichment_metadata: {
    confidence: "high" | "medium" | "low";
    enriched_at: string;          // ISO timestamp
    version: string;              // Schema version
  };
}
```

---

## Two-Tier Enrichment Strategy

**Philosophy:** Light enrichment for ALL examples (enables intent detection), deep enrichment for important patterns (provides comprehensive guidance).

### Tier 1: Light Enrichment (ALL 753 examples - fast, cheap)

**Purpose:** Enable intent detection and relevance ranking
**Cost:** ~$0.50-1.00 for all examples
**Model:** Claude Haiku (fast, cheap)

```typescript
interface LightContext {
  // Pattern classification (for filtering)
  pattern: "component" | "action-invoke" | "action-replace" | "action-listen" |
           "utility" | "config" | "cli" | "import";

  // Visual location (for UI placement queries)
  location?: "right-sidebar" | "top-bar" | "center-panel" | "left-nav" | "modal" | "none";

  // Use case tags (for semantic matching - KEY FOR INTENT DETECTION)
  for: string[];  // ["crm", "task-data", "customer-info", "analytics", "transfer", etc.]

  // Top 2-3 gotchas only (most critical)
  gotchas?: string[];  // ["task can be null", "must return original()"]

  // Confidence
  confidence: "high" | "medium" | "low";

  // Tier marker
  tier: "light";
}
```

**Example:**
```json
{
  "code": "flex.TaskInfoPanel.Content.add(<CRMPanel />)",
  "context": {
    "pattern": "component",
    "location": "right-sidebar",
    "for": ["crm", "customer-data", "task-info"],
    "gotchas": ["task can be null", "check task?.attributes"],
    "confidence": "high",
    "tier": "light"
  }
}
```

### Tier 2: Deep Enrichment (~100-150 examples - detailed, moderate cost)

**Purpose:** Provide comprehensive guidance for complex/common patterns
**Cost:** ~$2-3 for selected examples
**Model:** Claude Sonnet (better quality)

Uses full `EnrichedContext` schema (defined above) with all fields.

**Which Examples Get Deep Enrichment:**

1. ✅ **Component registration patterns**
   - TaskInfoPanel, TaskCanvas, MainHeader, etc.
   - Conditional rendering examples
   - sortOrder and positioning examples

2. ✅ **Action patterns**
   - replaceAction (critical gotchas)
   - Common actions: AcceptTask, SelectTask, WrapupTask, TransferTask
   - addListener with abort() patterns

3. ✅ **High-usage patterns**
   - Examples with usage_count > 5
   - Patterns from production template features

4. ✅ **Complex/gotcha-heavy patterns**
   - State management with Redux
   - Task validation patterns
   - Async operations with proper error handling

5. ❌ **Skip deep enrichment:**
   - Simple imports
   - API response examples
   - CLI commands
   - Trivial utility functions

**Result:**
- ~100-150 examples get deep enrichment (2%)
- ~600+ examples get light enrichment (98%)
- Total cost: ~$1.50-4.00

---

## Example Enrichments

### Example 1: Component Registration

**Original:**
```json
{
  "code": "flex.TaskInfoPanel.Content.add(<CRMPanel key=\"crm-panel\"/>)",
  "language": "javascript",
  "source_url": "https://..."
}
```

**Enriched:**
```json
{
  "code": "flex.TaskInfoPanel.Content.add(<CRMPanel key=\"crm-panel\"/>)",
  "language": "javascript",
  "source_url": "https://...",
  "context": {
    "pattern_type": "component_registration",
    "execution_context": {
      "file_type": "plugin_init",
      "runs_when": "Once during plugin initialization"
    },
    "ui_placement": {
      "component_path": "Flex.TaskInfoPanel.Content",
      "visual_location": "Right sidebar, visible only when a task is selected",
      "component_hierarchy": "AgentDesktopView > TaskInfoPanel > Content",
      "always_visible": false
    },
    "use_case": {
      "summary": "Adds a custom component to the task information panel",
      "common_scenarios": [
        "Display CRM customer data for the selected task",
        "Show order history or account details",
        "Add custom task-specific forms or actions"
      ],
      "solves_problem": "Agents need to see customer context without leaving Flex"
    },
    "requirements": {
      "imports": [
        "import * as Flex from '@twilio/flex-ui';",
        "import CRMPanel from './components/CRMPanel';"
      ],
      "dependencies": [],
      "must_exist_first": [
        "CRMPanel React component must be defined",
        "Plugin init() method must have access to flex instance"
      ],
      "flex_version": "2.x"
    },
    "gotchas": [
      {
        "issue": "Component receives null task when reservation ends",
        "why": "Task is removed from state when reservation completes, but component may still be mounted briefly",
        "solution": "Always check: if (!props.task) return null;"
      },
      {
        "issue": "Task attributes may not exist",
        "why": "Not all tasks have custom attributes populated",
        "solution": "Use optional chaining: task?.attributes?.customer_id"
      },
      {
        "issue": "Key prop warning in console",
        "why": "React requires unique keys for dynamically added components",
        "solution": "Always provide unique key prop: <Component key=\"unique-id\" />"
      }
    ],
    "related_patterns": {
      "alternatives": [
        "TaskCanvas.Content for main interaction area instead of sidebar",
        "MainHeader.Content for global, always-visible panel"
      ],
      "complements": [
        "TaskCanvasHeader.Content for adding control buttons alongside this panel",
        "Custom Redux state management for sharing data between components"
      ],
      "supersedes": []
    },
    "enrichment_metadata": {
      "confidence": "high",
      "enriched_at": "2025-01-07T...",
      "version": "1.0.0"
    }
  }
}
```

### Example 2: Action Replacement

**Original:**
```json
{
  "code": "Actions.replaceAction(\"AcceptTask\", async (payload, original) => { /* custom */ return original(payload); })",
  "language": "javascript",
  "source_url": "https://..."
}
```

**Enriched:**
```json
{
  "code": "Actions.replaceAction(\"AcceptTask\", async (payload, original) => { /* custom */ return original(payload); })",
  "language": "javascript",
  "source_url": "https://...",
  "context": {
    "pattern_type": "action_replacement",
    "execution_context": {
      "file_type": "plugin_init",
      "runs_when": "When AcceptTask action is invoked anywhere in Flex"
    },
    "use_case": {
      "summary": "Intercepts and modifies the AcceptTask action behavior",
      "common_scenarios": [
        "Validate task before accepting (check agent skills)",
        "Log acceptance to external system",
        "Set custom task attributes before accepting",
        "Add business logic requirements before acceptance"
      ],
      "solves_problem": "Need to add validation or side effects to built-in Flex actions"
    },
    "requirements": {
      "imports": [
        "import { Actions } from '@twilio/flex-ui';"
      ],
      "dependencies": [],
      "must_exist_first": [
        "Must be called in plugin init() after Flex is ready",
        "AcceptTask action must exist (built-in to Flex)"
      ],
      "flex_version": "both"
    },
    "gotchas": [
      {
        "issue": "CRITICAL: Not returning original(payload) breaks the action completely",
        "why": "replaceAction expects you to return the promise from original() so Flex can handle the result",
        "solution": "ALWAYS return original(payload) at the end: return original(payload);"
      },
      {
        "issue": "Async logic before original() can cause timing issues",
        "why": "If your async code takes too long, Flex UI may show stale state",
        "solution": "Keep pre-logic fast, or use beforeAcceptTask listener instead"
      },
      {
        "issue": "Payload validation errors not shown to user",
        "why": "If you throw an error, Flex doesn't know how to display it",
        "solution": "Use Notifications.showNotification() to display error messages"
      }
    ],
    "related_patterns": {
      "alternatives": [
        "Actions.addListener('beforeAcceptTask') for validation without replacement",
        "Actions.addListener('afterAcceptTask') for post-acceptance logic"
      ],
      "complements": [
        "Notifications API for showing validation errors to user",
        "Task attribute updates to store custom data"
      ],
      "supersedes": []
    },
    "enrichment_metadata": {
      "confidence": "high",
      "enriched_at": "2025-01-07T...",
      "version": "1.0.0"
    }
  }
}
```

---

## Enrichment Prompt Template

```
You are a Twilio Flex expert analyzing code examples. For the following code snippet, provide enrichment context.

CODE:
{code}

SOURCE: {source_url}
LANGUAGE: {language}

Analyze this code and provide enriched context following this schema:
1. Pattern type (component_registration, action_replacement, etc.)
2. Execution context (where/when this runs)
3. UI placement (if applicable - where in Flex UI hierarchy)
4. Use case (what problem does this solve, common scenarios)
5. Requirements (imports, dependencies, prerequisites)
6. Gotchas (3-5 specific issues that can go wrong, with WHY and SOLUTION)
7. Related patterns (alternatives, complements, supersedes)

Focus on:
- Practical, real-world use cases
- Specific gotchas with concrete solutions
- Clear visual descriptions of UI locations
- Prerequisites that might not be obvious

Return as JSON matching the EnrichedContext schema.
```

---

## Quality Validation Criteria

An enrichment is GOOD if:
1. ✅ Use case is specific and actionable (not generic)
2. ✅ Gotchas include WHY and SOLUTION (not just the issue)
3. ✅ UI placement is visually descriptive (not just component path)
4. ✅ Related patterns are genuinely useful (not obvious)
5. ✅ Requirements are complete (not missing critical imports)

An enrichment is BAD if:
1. ❌ Generic descriptions ("This code does X")
2. ❌ Missing gotchas or solutions
3. ❌ No specific use cases
4. ❌ Incomplete prerequisites
5. ❌ Wrong pattern classification

---

## Processing Strategy

1. **Sample first** - Enrich 20 examples, validate quality manually
2. **Batch process** - Process in batches of 100 to manage API costs
3. **Save checkpoints** - Save after each batch in case of failure
4. **Validate quality** - Check confidence scores, review low-confidence results
5. **Iterate** - Refine prompt based on quality of results

**Estimated Cost:**
- 753 code examples
- ~500 tokens per example (code + prompt + response)
- ~377,000 tokens total
- ~$4-5 using Claude Haiku for enrichment

---

## Next: Implementation Script

See `enrich_knowledge.py` for the actual enrichment script.
