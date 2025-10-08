# Twilio Flex Developer Quick Reference

**Last Updated:** 10/7/2025
**Source:** 143 official documentation pages

## What You Can Do with Flex

### 1. Control UI Behavior via Actions Framework
**12 Core Actions** available - invoke, replace, or listen to them:

- **DequeueTask**: Modify task/call/messaging behavior
- **RedirectCallTask**: Modify task/call/messaging behavior
- **SendMessage**: Modify task/call/messaging behavior
- **StartOutboundEmailTask**: Modify task/call/messaging behavior
- **DownloadMedia**: Modify task/call/messaging behavior
- **SetInputText**: Modify task/call/messaging behavior
- **StartEngagement**: Modify task/call/messaging behavior
- **RestartEngagement**: Modify task/call/messaging behavior
- **AcceptTask**: Modify task/call/messaging behavior
- **SelectTask**: Modify task/call/messaging behavior
- **SendMediaMessage**: Modify task/call/messaging behavior
- **AttachFile**: Modify task/call/messaging behavior

**Action Methods:**
- `Actions.invokeAction()` - used 42x in docs
- `Actions.removeListener()` - used 3x in docs
- `Actions.replaceAction()` - used 10x in docs
- `Actions.addListener()` - used 17x in docs
- `Actions.registerAction()` - used 5x in docs

**Pattern:**
```javascript
// Before an action (can cancel):
Actions.addListener("beforeAcceptTask", (payload, abort) => {
  if (!validateAgent()) abort();
});

// Replace behavior:
Actions.replaceAction("AcceptTask", async (payload, original) => {
  await logToExternalCRM(payload);
  return original(payload);
});
```

### 2. Customize UI via Component API
Add, replace, or remove components from any Flex view.

**Pattern:**
```javascript
import { CustomComponent } from './components';

// Add to a container:
Flex.TaskCanvas.Content.add(<CustomComponent key="my-widget" />, {
  sortOrder: 1,
  align: 'end'
});

// Replace existing:
Flex.AgentDesktopView.Content.replace(<MyCustomView key="custom" />);
```

### 3. Plugin Lifecycle Management
**Deploy/Release Workflow** (CRITICAL - this is how you ship):

```bash
# Activate deployed plugin:
twilio flex:plugins:release --plugin plugin-sample@1.0.0 --name "Plugin Sample Release" --description "Testing React upgrade"
```

**Development:**
```bash
twilio flex:plugins:create my-plugin --install
twilio flex:plugins:start  # Local dev server
```

### 4. Real-World Examples

#### Auto-accept chat tasks:
```javascript
Manager.getInstance().workerClient.on('reservationCreated', (reservation) => {
  if (reservation.task.taskChannelUniqueName === 'chat') {
    Actions.invokeAction('AcceptTask', { sid: reservation.sid });
  }
});
```

#### Send message after task completion:
```javascript
Actions.replaceAction("WrapupTask", (payload, original) => {
  if (payload.task.taskChannelUniqueName === "chat") {
    return Actions.invokeAction("SendMessage", {
      body: 'Thanks for chatting!',
      conversationSid: payload.task.attributes.conversationSid
    }).then(() => original(payload));
  }
  return original(payload);
});
```

#### Integrate custom CRM:
```javascript
flex.CRMContainer.defaultProps.uriCallback = (task) =>
  `https://mycrm.com/customer/${task.attributes.customerId}`;
```

## When You Need More

Use `flex_search` tool with specific questions:
- "how to add component to task canvas"
- "deploy plugin without deleting existing"
- "listen to reservation events"
- "customize message input styling"

## Version Notes
- **Current:** Flex UI 2.x (uses Twilio Paste design system)
- **Legacy:** Flex UI 1.x (uses MaterialUI) - migration guide available

---
*Generated from 143 pages, 753 code examples*
