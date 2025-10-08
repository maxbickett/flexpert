#!/usr/bin/env node

/**
 * Build high-quality Flex overview from knowledge base
 *
 * Goal: Give LLM the "I know what's possible" foundation in <5K tokens
 * Quality criteria:
 * 1. Actionable (shows WHAT you can do, not just concepts)
 * 2. Complete (covers all major capabilities)
 * 3. Accurate (uses real API patterns from our crawl)
 * 4. Concise (no fluff, just what matters)
 */

import fs from 'fs/promises';

async function buildFlexOverview() {
  const kb = JSON.parse(await fs.readFile('../twilio-flex-tools/data/FINAL_FLEX_KNOWLEDGE.json', 'utf-8'));

  console.log('🔨 Building high-quality Flex overview...\n');

  // Extract ACTIONABLE patterns, not just lists
  const coreActions = kb.flex_actions.core_actions.slice(0, 12);
  const actionMethods = kb.flex_actions.methods;
  const deploymentCommands = kb.cli_commands.deployment.slice(0, 8);

  // Find the BEST code examples (ones that show complete patterns)
  const exemplars = kb.code_examples
    .filter(ex => {
      const code = ex.code;
      // Good examples have: imports, real logic, and are self-contained
      return code.length > 100 &&
             code.length < 800 &&
             (code.includes('Actions.') || code.includes('Flex.') || code.includes('twilio flex:'));
    })
    .slice(0, 15);

  // Build the overview
  const overview = `# Twilio Flex Developer Quick Reference

**Last Updated:** ${new Date(kb.metadata.generated_at).toLocaleDateString()}
**Source:** ${kb.metadata.total_pages} official documentation pages

## What You Can Do with Flex

### 1. Control UI Behavior via Actions Framework
**${coreActions.length} Core Actions** available - invoke, replace, or listen to them:

${coreActions.map(([action, count]) => `- **${action}**: Modify task/call/messaging behavior`).join('\n')}

**Action Methods:**
${actionMethods.map(([method, count]) => `- \`Actions.${method}()\` - used ${count}x in docs`).join('\n')}

**Pattern:**
\`\`\`javascript
// Before an action (can cancel):
Actions.addListener("beforeAcceptTask", (payload, abort) => {
  if (!validateAgent()) abort();
});

// Replace behavior:
Actions.replaceAction("AcceptTask", async (payload, original) => {
  await logToExternalCRM(payload);
  return original(payload);
});
\`\`\`

### 2. Customize UI via Component API
Add, replace, or remove components from any Flex view.

**Pattern:**
\`\`\`javascript
import { CustomComponent } from './components';

// Add to a container:
Flex.TaskCanvas.Content.add(<CustomComponent key="my-widget" />, {
  sortOrder: 1,
  align: 'end'
});

// Replace existing:
Flex.AgentDesktopView.Content.replace(<MyCustomView key="custom" />);
\`\`\`

### 3. Plugin Lifecycle Management
**Deploy/Release Workflow** (CRITICAL - this is how you ship):

${deploymentCommands.slice(0, 5).map(([cmd]) => {
  if (cmd.includes('deploy') && cmd.includes('include-remote')) {
    return `\`\`\`bash\n# Deploy without deleting existing plugins (CRITICAL FLAG):\n${cmd}\n\`\`\``;
  }
  if (cmd.includes('release')) {
    return `\`\`\`bash\n# Activate deployed plugin:\n${cmd}\n\`\`\``;
  }
  return null;
}).filter(Boolean).join('\n\n')}

**Development:**
\`\`\`bash
twilio flex:plugins:create my-plugin --install
twilio flex:plugins:start  # Local dev server
\`\`\`

### 4. Real-World Examples

#### Auto-accept chat tasks:
\`\`\`javascript
Manager.getInstance().workerClient.on('reservationCreated', (reservation) => {
  if (reservation.task.taskChannelUniqueName === 'chat') {
    Actions.invokeAction('AcceptTask', { sid: reservation.sid });
  }
});
\`\`\`

#### Send message after task completion:
\`\`\`javascript
Actions.replaceAction("WrapupTask", (payload, original) => {
  if (payload.task.taskChannelUniqueName === "chat") {
    return Actions.invokeAction("SendMessage", {
      body: 'Thanks for chatting!',
      conversationSid: payload.task.attributes.conversationSid
    }).then(() => original(payload));
  }
  return original(payload);
});
\`\`\`

#### Integrate custom CRM:
\`\`\`javascript
flex.CRMContainer.defaultProps.uriCallback = (task) =>
  \`https://mycrm.com/customer/\${task.attributes.customerId}\`;
\`\`\`

## When You Need More

Use \`flex_search\` tool with specific questions:
- "how to add component to task canvas"
- "deploy plugin without deleting existing"
- "listen to reservation events"
- "customize message input styling"

## Version Notes
- **Current:** Flex UI 2.x (uses Twilio Paste design system)
- **Legacy:** Flex UI 1.x (uses MaterialUI) - migration guide available

---
*Generated from ${kb.metadata.total_pages} pages, ${kb.metadata.total_code_blocks} code examples*
`;

  // Save overview
  await fs.writeFile('./flex-overview.md', overview);

  // Quality checks
  console.log('📊 Quality Metrics:');
  console.log(`   Length: ${overview.length} chars (~${Math.floor(overview.length / 4)} tokens)`);
  console.log(`   Code examples: ${(overview.match(/```/g) || []).length / 2} blocks`);
  console.log(`   Actionable items: ${(overview.match(/^-|\d\./gm) || []).length}`);
  console.log(`   Contains critical flags: ${overview.includes('--include-remote') ? '✅' : '❌'}`);
  console.log(`   Contains real examples: ${overview.includes('Manager.getInstance()') ? '✅' : '❌'}`);
  console.log(`   Token efficiency: ${overview.length < 6000 ? '✅ <6K chars' : '⚠️  too long'}`);

  console.log(`\n✅ Flex overview saved to: flex-overview.md`);
  console.log(`\n📝 Preview (first 500 chars):`);
  console.log(overview.slice(0, 500) + '...\n');

  return overview;
}

buildFlexOverview().catch(console.error);
