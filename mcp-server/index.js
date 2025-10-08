#!/usr/bin/env node

/**
 * Flex Expert MCP Server
 *
 * Provides Twilio Flex expertise via hybrid search:
 * - Initial context: High-level overview of Flex capabilities
 * - On-demand: Deep retrieval of specific patterns/examples
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import { pipeline } from '@xenova/transformers';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global state
let knowledgeBase = null;
let enrichedData = null;  // Our enriched metadata
let finalKnowledge = null;  // FINAL_FLEX_KNOWLEDGE with 753 code blocks
let embeddings = null;
let embeddingPipeline = null;

// Load knowledge base
async function loadKnowledgeBase() {
  console.error('📚 Loading Flex knowledge base...');
  const knowledgeBasePath = path.resolve(__dirname, '../twilio-flex-tools/data/ULTIMATE_FLEX_KNOWLEDGE.json');
  const data = await fs.readFile(knowledgeBasePath, 'utf-8');
  knowledgeBase = JSON.parse(data);
  console.error(`✅ Loaded ${knowledgeBase.metadata.sources.official_docs_pages} docs pages + ${knowledgeBase.metadata.sources.production_features} production features`);

  // Load enriched data
  try {
    const componentPath = path.resolve(__dirname, '../twilio-flex-tools/data/component_registry.json');
    const importPath = path.resolve(__dirname, '../twilio-flex-tools/data/import_map.json');
    const actionPath = path.resolve(__dirname, '../twilio-flex-tools/data/action_payloads.json');

    enrichedData = {
      components: JSON.parse(await fs.readFile(componentPath, 'utf-8')),
      imports: JSON.parse(await fs.readFile(importPath, 'utf-8')),
      actions: JSON.parse(await fs.readFile(actionPath, 'utf-8'))
    };

    console.error(`✅ Loaded enriched data: ${enrichedData.components.validation.total_components_found} components, ${enrichedData.actions.validation.unique_actions_found} actions`);
  } catch (e) {
    console.error('⚠️  Enriched data not found, using raw KB only');
    enrichedData = null;
  }

  // Load FINAL_FLEX_KNOWLEDGE with all 753 code blocks
  try {
    const finalPath = path.resolve(__dirname, '../twilio-flex-tools/data/FINAL_FLEX_KNOWLEDGE.json');
    finalKnowledge = JSON.parse(await fs.readFile(finalPath, 'utf-8'));
    console.error(`✅ Loaded FINAL_FLEX_KNOWLEDGE: ${finalKnowledge.metadata.total_code_blocks} code blocks from ${finalKnowledge.metadata.total_pages} docs pages`);
  } catch (e) {
    console.error('⚠️  FINAL_FLEX_KNOWLEDGE not found, using limited examples');
    finalKnowledge = null;
  }
}

// Load or build embeddings
async function initEmbeddings() {
  console.error('🧠 Initializing embedding model...');

  // Use lightweight sentence transformer
  embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.error('✅ Embedding model ready');

  // Try to load pre-built embeddings
  try {
    const embeddingsPath = path.resolve(__dirname, 'embeddings.json');
    const embData = await fs.readFile(embeddingsPath, 'utf-8');
    embeddings = JSON.parse(embData);
    console.error(`✅ Loaded ${embeddings.length} pre-built embeddings`);
  } catch (e) {
    console.error('⚠️  No pre-built embeddings found. Build them with: npm run build-index');
    embeddings = null;
  }
}

// Compute embedding for query
async function getEmbedding(text) {
  const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Cosine similarity
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// NEW: Search enriched data for components
function searchEnrichedComponents(query) {
  if (!enrichedData || !enrichedData.components) return [];

  const queryLower = query.toLowerCase();
  const results = [];
  const registry = enrichedData.components.registry;

  // Check for component names in query
  for (const [componentPath, componentData] of Object.entries(registry)) {
    const componentLower = componentPath.toLowerCase();
    const componentParts = componentPath.split('.');

    // Match if query contains: full path, any part, or spaced version
    const matches = queryLower.includes(componentLower) ||
                    queryLower.includes(componentPath.replace('.', ' ').toLowerCase()) ||
                    componentParts.some(part => queryLower.includes(part.toLowerCase()));

    if (matches) {

      // User is asking about this component
      for (const [methodName, methodData] of Object.entries(componentData.methods)) {
        if (queryLower.includes(methodName.toLowerCase()) ||
            queryLower.includes('add') || queryLower.includes('component')) {

          // Get required imports
          const imports = enrichedData.imports.import_map;
          const requiredImports = ['Flex'].map(symbol =>
            imports[symbol] ? imports[symbol][0] : "import * as Flex from '@twilio/flex-ui'"
          );

          results.push({
            type: 'enriched_component',
            component: componentPath,
            method: methodName,
            usage_count: methodData.usage_count,
            code: methodData.unique_patterns[0] || `Flex.${componentPath}.${methodName}()`,
            examples: methodData.examples.slice(0, 2),
            required_imports: requiredImports,
            relevance: 'high'
          });
        }
      }
    }
  }

  return results;
}

// NEW: Search enriched data for actions
function searchEnrichedActions(query) {
  if (!enrichedData || !enrichedData.actions) return [];

  const queryLower = query.toLowerCase();
  const results = [];
  const actionPayloads = enrichedData.actions.action_payloads;

  for (const [actionName, actionData] of Object.entries(actionPayloads)) {
    if (queryLower.includes(actionName.toLowerCase()) ||
        queryLower.includes('action') || queryLower.includes('invoke')) {

      results.push({
        type: 'enriched_action',
        action: actionName,
        properties: actionData.all_properties,
        required_properties: actionData.likely_required,
        usage_count: actionData.total_invocations,
        example_payload: actionData.payload_examples[0]?.payload_str,
        source: actionData.source_urls[0],
        relevance: 'high'
      });
    }
  }

  return results;
}

// NEW: Search FINAL_FLEX_KNOWLEDGE code blocks (753 total: 300 examples + 248 CLI + 44 actions + more)
function searchCodeBlocks(query, limit = 10) {
  if (!finalKnowledge) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(' ').filter(w => w.length > 2);

  // Collect all searchable code from multiple sources
  const allCodeBlocks = [];

  // 1. code_examples (300) - NOW WITH ENRICHED CONTEXT!
  if (finalKnowledge.code_examples) {
    finalKnowledge.code_examples.forEach(ex => {
      allCodeBlocks.push({
        code: ex.code,
        source_url: ex.source_url,
        language: ex.language,
        context: ex.context,  // Include enriched context
        type: 'code_example'
      });
    });
  }

  // 2. cli_commands (248) - these are actual code snippets too!
  if (finalKnowledge.cli_commands && finalKnowledge.cli_commands.all_by_frequency) {
    finalKnowledge.cli_commands.all_by_frequency.forEach(([cmd, count]) => {
      allCodeBlocks.push({
        code: cmd,
        source_url: 'https://www.twilio.com/docs/flex/developer/cli',
        language: 'bash',
        type: 'cli_command',
        usage_count: count
      });
    });
  }

  // 3. flex_actions (44)
  if (finalKnowledge.flex_actions && finalKnowledge.flex_actions.all_by_frequency) {
    finalKnowledge.flex_actions.all_by_frequency.forEach(([action, count]) => {
      allCodeBlocks.push({
        code: `Flex.Actions.invokeAction("${action}", { /* payload */ });`,
        source_url: 'https://www.twilio.com/docs/flex/developer/ui/actions',
        language: 'javascript',
        type: 'flex_action',
        usage_count: count
      });
    });
  }

  // Score and filter
  const results = allCodeBlocks
    .map(example => {
      const codeLower = example.code.toLowerCase();

      // Calculate relevance score
      let score = 0;

      // Exact phrase match (highest)
      if (codeLower.includes(queryLower)) {
        score += 10;
      }

      // Word matches
      queryWords.forEach(word => {
        if (codeLower.includes(word)) {
          score += 2;
        }
      });

      // Boost if matches common patterns
      if (codeLower.includes('flex.') && queryLower.includes('flex')) {
        score += 3;
      }

      if (codeLower.includes('actions.') && queryLower.includes('action')) {
        score += 3;
      }

      // Boost high-usage items
      if (example.usage_count && example.usage_count > 10) {
        score += 2;
      }

      return {
        ...example,
        score
      };
    })
    .filter(ex => ex.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(ex => ({
      type: 'code_block',
      subtype: ex.type,
      code: ex.code,
      source: ex.source_url,
      language: ex.language,
      context: ex.context,  // Include enriched context
      relevance: ex.score > 10 ? 'high' : ex.score > 5 ? 'medium' : 'low',
      score: ex.score,
      usage_count: ex.usage_count
    }));

  return results;
}

// Intent detection for better search ranking
function analyzeQueryIntent(query) {
  const queryLower = query.toLowerCase();

  // Detect action intent
  const actionPatterns = {
    'adding': ['add', 'create', 'build', 'insert', 'new', 'show', 'display'],
    'modifying': ['change', 'modify', 'update', 'customize', 'edit', 'replace'],
    'removing': ['remove', 'delete', 'hide'],
    'debugging': ['fix', 'error', 'broken', 'not working', 'issue', 'problem'],
    'understanding': ['how', 'what', 'why', 'understand', 'explain']
  };

  let action = 'unknown';
  for (const [intent, keywords] of Object.entries(actionPatterns)) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      action = intent;
      break;
    }
  }

  // Detect location intent
  const locationPatterns = {
    'task-panel': ['task panel', 'sidebar', 'right panel', 'task info', 'taskinf opanel'],
    'main-header': ['header', 'top bar', 'navigation', 'mainheader'],
    'task-canvas': ['canvas', 'main area', 'center', 'task view', 'taskcanvas'],
    'anywhere': ['component']
  };

  let location = null;
  for (const [loc, keywords] of Object.entries(locationPatterns)) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      location = loc;
      break;
    }
  }

  // Detect subject (what they're working with)
  const subjectPatterns = {
    'crm': ['crm', 'customer data', 'customer info', 'salesforce'],
    'task-data': ['task', 'attribute', 'metadata'],
    'action': ['action', 'invoke'],
    'transfer': ['transfer', 'handoff'],
    'ui-component': ['component', 'panel', 'view', 'button']
  };

  let subject = null;
  for (const [subj, keywords] of Object.entries(subjectPatterns)) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      subject = subj;
      break;
    }
  }

  return { action, location, subject };
}

// Rank results by intent match
function rankByIntent(results, intent) {
  return results.map(result => {
    let score = result.tier_score || 0;
    const context = result.context; // Enriched context from examples

    if (!context) return { ...result, intent_score: score };

    // BOOST: Deep enrichment is much more valuable
    if (context.tier === 'deep') {
      score += 20; // Deep enrichment bonus
    }

    // BOOST: Action match
    if (intent.action === 'adding' && context.pattern === 'component') {
      score += 30;
    }
    if (intent.action === 'modifying' && context.pattern === 'action-replace') {
      score += 30;
    }

    // BOOST: Location match (use enriched location data)
    if (intent.location === 'task-panel' && context.location === 'right-sidebar') {
      score += 25;
    }
    if (intent.location === 'main-header' && context.location === 'top-bar') {
      score += 25;
    }
    if (intent.location === 'task-canvas' && context.location === 'center-panel') {
      score += 25;
    }

    // BOOST: Subject match (use enriched "for" tags)
    if (intent.subject && context.for) {
      const matchingTags = context.for.filter(tag =>
        tag.includes(intent.subject) || intent.subject.includes(tag)
      );
      if (matchingTags.length > 0) {
        score += 40; // BIG boost for use case match
      }
    }

    // BOOST: Has gotchas (more helpful)
    if (context.gotchas && context.gotchas.length > 0) {
      score += 10;
    }

    // BOOST EXTRA: Deep enrichment use cases match query
    if (context.deep && context.deep.use_case) {
      const useCaseText = JSON.stringify(context.deep.use_case).toLowerCase();
      const queryLower = intent.query ? intent.query.toLowerCase() : '';
      const queryWords = queryLower.split(' ').filter(w => w.length > 3);

      let matchCount = 0;
      queryWords.forEach(word => {
        if (useCaseText.includes(word)) {
          matchCount++;
        }
      });

      if (matchCount > 2) {
        score += 15; // Strong use case match
      }
    }

    // PENALIZE: Wrong pattern type
    if (intent.action === 'adding' && context.pattern === 'action-listen') {
      score -= 20;
    }

    return { ...result, intent_score: score };
  }).sort((a, b) => b.intent_score - a.intent_score);
}

// Hybrid search: semantic + lexical + enriched + intent-aware
async function searchKnowledge(query, limit = 10) {
  if (!knowledgeBase) {
    throw new Error('Knowledge base not loaded');
  }

  const results = [];

  const queryLower = query.toLowerCase();

  // Analyze query intent
  const intent = analyzeQueryIntent(query);
  intent.query = query; // Pass original query for deep enrichment matching

  // TIER 1: Enriched exact matches (highest priority) - score 100
  if (enrichedData) {
    const componentResults = searchEnrichedComponents(query);
    results.push(...componentResults.map(r => ({ ...r, tier: 1, tier_score: 100 })));

    const actionResults = searchEnrichedActions(query);
    results.push(...actionResults.map(r => ({ ...r, tier: 1, tier_score: 100 })));
  }

  // TIER 2: Quick patterns (curated examples) - score 90
  const quickPatterns = knowledgeBase.quick_patterns || {};
  for (const [patternName, patternData] of Object.entries(quickPatterns)) {
    if (queryLower.includes(patternName.replace(/_/g, ' ')) ||
        queryLower.includes(patternData.when.toLowerCase())) {
      results.push({
        type: 'quick_pattern',
        code: patternData.code,
        when: patternData.when,
        gotchas: patternData.gotchas || [],
        relevance: 'high',
        tier: 2,
        tier_score: 90
      });
    }
  }

  // TIER 3: FINAL_FLEX_KNOWLEDGE code blocks (592 examples) - score 70-85 based on match quality
  if (finalKnowledge) {
    const codeBlockLimit = Math.max(10, limit * 2); // Get more, rank them down
    const codeBlockResults = searchCodeBlocks(query, codeBlockLimit);
    results.push(...codeBlockResults.map(r => ({
      ...r,
      tier: 3,
      // tier_score based on their internal score
      tier_score: 70 + Math.min(15, r.score || 0)
    })));
  }

  // TIER 4: Lexical search in ULTIMATE_FLEX_KNOWLEDGE (fallback) - score 60
  const lexicalLimit = Math.max(5, Math.floor(limit / 2));
  const lexicalMatches = (knowledgeBase.official_examples || []).filter(example => {
    const code = example.code.toLowerCase();
    return code.includes(queryLower) ||
           queryLower.split(' ').some(word => word.length > 3 && code.includes(word));
  }).slice(0, lexicalLimit);

  results.push(...lexicalMatches.map(ex => ({
    type: 'official_docs',
    code: ex.code,
    source: ex.source_url,
    relevance: 'high',
    tier: 4,
    tier_score: 60
  })));

  // TIER 5: Semantic search (if embeddings available) - score 40-80 based on similarity
  if (embeddings && embeddingPipeline) {
    const queryEmbedding = await getEmbedding(query);
    const semanticLimit = Math.max(5, Math.floor(limit / 2));

    const semanticScores = embeddings.map((item, idx) => ({
      idx,
      score: cosineSimilarity(queryEmbedding, item.embedding),
      ...item
    }));

    const topSemantic = semanticScores
      .sort((a, b) => b.score - a.score)
      .slice(0, semanticLimit);

    results.push(...topSemantic.map(item => ({
      type: 'semantic',
      code: item.code,
      source: item.source_url,
      relevance: item.score > 0.7 ? 'high' : 'medium',
      score: item.score,
      tier: 5,
      tier_score: 40 + (item.score * 40) // 0.0-1.0 → 40-80
    })));
  }

  // Smart deduplication - compare actual code similarity, not just first 100 chars
  const deduplicated = smartDeduplicate(results);

  // Apply intent-based ranking
  const reranked = rankByIntent(deduplicated, intent);

  // Return top results with intent info
  return {
    intent,
    results: reranked.slice(0, limit)
  };
}

// Smart deduplication that checks code similarity
function smartDeduplicate(results) {
  const unique = [];
  const seen = new Set();

  for (const result of results) {
    // Normalize code for comparison
    const normalizedCode = (result.code || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[0-9]+\\n/g, '')  // Remove line numbers
      .trim();

    // Create a signature from first 150 chars + key patterns
    const signature = normalizedCode.slice(0, 150);

    // Check if we've seen something very similar
    let isDuplicate = false;
    for (const seenSig of seen) {
      // If 80% similar, consider it a duplicate
      const similarity = calculateSimilarity(signature, seenSig);
      if (similarity > 0.8) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(result);
      seen.add(signature);
    }
  }

  return unique;
}

// Simple similarity check (Jaccard-like)
function calculateSimilarity(str1, str2) {
  const set1 = new Set(str1.split(/\\s+/));
  const set2 = new Set(str2.split(/\\s+/));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// Get Flex overview context (for initial orientation)
function getFlexOverview() {
  if (!knowledgeBase) return '';

  const topActions = knowledgeBase.api_reference.actions.all.slice(0, 12);
  const quickPatterns = knowledgeBase.quick_patterns || {};
  const criticalGotchas = Object.entries(knowledgeBase.edge_cases_and_gotchas.critical_patterns)
    .filter(([_, data]) => data.severity === 'HIGH');

  // Build comprehensive component reference from enriched data
  let componentSection = '';
  if (enrichedData && enrichedData.components) {
    const registry = enrichedData.components.registry;
    componentSection = `## 🎨 Available Components & Methods

You have access to **${enrichedData.components.validation.total_components_found} components** with **${enrichedData.components.validation.total_methods_found} methods** extracted from real production code.

### Core Components
${Object.entries(registry).map(([componentPath, data]) => {
  const methods = Object.keys(data.methods).join(', ');
  const topMethod = Object.entries(data.methods)[0];
  const [methodName, methodData] = topMethod;
  const example = methodData.unique_patterns[0] || `Flex.${componentPath}.${methodName}()`;

  return `**\`Flex.${componentPath}\`**
  - Methods: \`${methods}\`
  - Example: \`${example}\``;
}).join('\n\n')}

💡 **Usage Pattern**: All components follow \`.add()\`, \`.replace()\`, or \`.remove()\` for customization.
`;
  }

  // Build action payload reference from enriched data
  let actionSection = '';
  if (enrichedData && enrichedData.actions) {
    const actions = enrichedData.actions.action_payloads;
    const actionCount = enrichedData.actions.validation.unique_actions_found;

    actionSection = `## ⚡ Actions with Payload Schemas

You have **${actionCount} actions** with validated payload structures from production examples.

### Common Actions & Parameters
${Object.entries(actions).slice(0, 8).map(([actionName, data]) => {
  const params = data.likely_required.join(', ');
  const example = data.payload_examples[0]?.payload_str.split('\n')[0] || '';

  return `**\`${actionName}\`**
  - Params: ${params}
  - Example: \`Actions.invokeAction("${actionName}", { ${example} })\``;
}).join('\n\n')}

${Object.keys(actions).length > 8 ? `\n_+ ${Object.keys(actions).length - 8} more actions available via \`flex_validate_action()\`_` : ''}
`;
  }

  const overview = `# 🚀 Flexpert: Your Twilio Flex Expert Assistant

**Knowledge Base:** ${knowledgeBase.metadata.sources.official_docs_pages} official docs + ${knowledgeBase.metadata.sources.production_features} production code examples
**Search Corpus:** ${finalKnowledge ? finalKnowledge.metadata.total_code_blocks : '300+'} searchable code examples
**Version:** Flex UI 2.x
**Confidence:** All examples extracted from real, working Flex plugins

---

## 🎯 What You Can Do

You're working with Twilio Flex plugins and have access to:
- **592 searchable code examples** from official docs (code blocks, CLI commands, actions)
- **5-tier ranked search** - best sources always appear first
- **Enriched metadata** for 11 components and 12 actions with payload schemas
- **Smart deduplication** - no duplicate or near-duplicate results
- **Configurable limits** - get 3-5 quick answers or 15-20 comprehensive examples
- **CLI commands** with safety guardrails
- **Critical gotchas** to avoid common mistakes

${componentSection}

${actionSection}

## 🔥 Most Used Actions
${topActions.map(([action, count]) => `- \`${action}\` (${count} examples)`).join('\n')}

## 📚 Essential Patterns

${Object.entries(quickPatterns).slice(0, 3).map(([name, data]) =>
`### ${name.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
\`\`\`javascript
${data.code}
\`\`\`
**When to use:** ${data.when}
${data.gotchas && data.gotchas.length > 0 ? `\n⚠️ **Watch out:** ${data.gotchas.join(', ')}` : ''}
`).join('\n')}

## ⚠️ Critical Gotchas (Read This!)

${criticalGotchas.map(([name, data]) =>
`### ${name.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
${data.why}
\`\`\`bash
${data.code}
\`\`\`
`).join('\n')}

## 🛠️ CLI Commands

\`\`\`bash
# Create new plugin
twilio flex:plugins:create my-plugin --install

# Start dev server
twilio flex:plugins:start

# Deploy (⚠️ ALWAYS use --include-remote to keep other plugins!)
twilio flex:plugins:deploy --include-remote --major --changelog "Added feature X"

# Release to production
twilio flex:plugins:release --plugin my-plugin@1.0.0 --description "Release notes"
\`\`\`

---

## 💡 How to Get the Most from Flexpert

**For specific examples:**
\`\`\`
flex_search("add component to mainheader")  // Returns 10 results by default
flex_search("customize email editor content", limit: 5)  // Limit to 5 results
flex_search("SetInputText action", limit: 20)  // Get more examples
flex_search("add tab to task canvas")
\`\`\`

**To validate an action:**
\`\`\`
flex_validate_action("AcceptTask")  // Returns payload schema + examples
\`\`\`

**For CLI help:**
\`\`\`
flex_get_cli("deploy")  // Returns safest deployment commands
\`\`\`

**Pro tips:**
- Ask natural questions like "how do I..." or "show me..."
- Mention specific components: "MainHeader", "TaskCanvas", etc.
- Mention specific actions: "AcceptTask", "SetInputText", etc.
- **Results are ranked by quality** - enriched exact matches always appear first
- **Use higher limits for exploration** - flex_search("query", limit: 20) for comprehensive examples
- All returned code is from real, working Flex plugins

**Search Features:**
- 🥇 **Tier 1**: Enriched component/action exact matches (highest priority)
- 🥈 **Tier 2**: Curated quick patterns from docs
- 🥉 **Tier 3**: 592 code blocks with relevance scoring
- 📊 **Smart ranking**: Best quality results always surface first
- 🔄 **No duplicates**: Intelligent deduplication removes similar results

---

🎯 **Ready to build!** Ask me anything about Flex customization.
`;

  return overview;
}

// Validate Action name
function validateAction(actionName) {
  if (!knowledgeBase) return { valid: false, reason: 'Knowledge base not loaded' };

  const allActions = new Set(knowledgeBase.api_reference.actions.all.map(([name]) => name));

  if (allActions.has(actionName)) {
    // Use enriched action data if available
    let enrichedInfo = null;
    if (enrichedData && enrichedData.actions.action_payloads[actionName]) {
      enrichedInfo = enrichedData.actions.action_payloads[actionName];
    }

    // Find examples from docs
    const examples = (knowledgeBase.official_examples || []).filter(ex =>
      ex.code.includes(actionName)
    ).slice(0, 2);

    // Check for gotchas
    const gotchas = (knowledgeBase.edge_cases_and_gotchas.by_action || []).find(g =>
      g.action === actionName
    );

    return {
      valid: true,
      action: actionName,
      // NEW: Include enriched payload info
      payload_schema: enrichedInfo ? {
        all_properties: enrichedInfo.all_properties,
        likely_required: enrichedInfo.likely_required,
        example: enrichedInfo.payload_examples[0]?.payload_str
      } : null,
      examples: examples.map(ex => ({ code: ex.code, source: ex.source_url })),
      gotchas: gotchas ? gotchas.gotchas : []
    };
  }

  // Find similar
  const similar = Array.from(allActions).filter(a =>
    a.toLowerCase().includes(actionName.toLowerCase()) ||
    actionName.toLowerCase().includes(a.toLowerCase())
  );

  return {
    valid: false,
    reason: `Action "${actionName}" not found`,
    suggestions: similar.slice(0, 5)
  };
}

// MCP Server setup
const server = new Server(
  {
    name: 'flexpert',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    },
  }
);

// Tool: Search Flex knowledge
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'flex_search',
      description: 'Search Twilio Flex documentation and code examples. Use when working on Flex plugins to find correct API usage, patterns, or examples.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What you want to know (e.g., "add component to task canvas", "deploy without deleting plugins")'
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (default: 10). Use higher values (15-20) for comprehensive examples, lower values (3-5) for quick answers.',
            default: 10
          }
        },
        required: ['query']
      }
    },
    {
      name: 'flex_validate_action',
      description: 'Validate a Flex UI Action name and get usage examples',
      inputSchema: {
        type: 'object',
        properties: {
          action_name: {
            type: 'string',
            description: 'Action name to validate (e.g., "AcceptTask", "SendMessage")'
          }
        },
        required: ['action_name']
      }
    },
    {
      name: 'flex_get_cli',
      description: 'Get the correct CLI command for a specific operation',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'What you want to do (e.g., "deploy", "release", "start dev server")'
          }
        },
        required: ['operation']
      }
    }
  ]
}));

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'flex_search') {
    const searchResult = await searchKnowledge(args.query, args.limit || 10);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query: args.query,
          intent: searchResult.intent,
          results: searchResult.results.map(r => {
            const result = {
              code: r.code,
              source: r.source,
              relevance: r.relevance,
              intent_score: r.intent_score
            };

            // Include enriched context if available
            if (r.context) {
              result.pattern = r.context.pattern;
              result.location = r.context.location;
              result.use_cases = r.context.for;
              result.enrichment_tier = r.context.tier;

              // Include deep enrichment details if available
              if (r.context.tier === 'deep' && r.context.deep) {
                result.deep_context = {
                  visual_location: r.context.deep.ui_placement?.visual_location,
                  summary: r.context.deep.use_case?.summary,
                  common_scenarios: r.context.deep.use_case?.common_scenarios,
                  gotchas: r.context.deep.gotchas?.map(g => ({
                    issue: g.issue,
                    why: g.why,
                    solution: g.solution
                  }))
                };
              } else if (r.context.gotchas) {
                // Light enrichment gotchas
                result.gotchas = r.context.gotchas;
              }
            }

            return result;
          })
        }, null, 2)
      }]
    };
  }

  if (name === 'flex_validate_action') {
    const result = validateAction(args.action_name);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  if (name === 'flex_get_cli') {
    const operation = args.operation.toLowerCase();
    const commands = knowledgeBase.cli_commands;

    let matchedCommands = [];

    if (operation.includes('deploy')) {
      matchedCommands = commands.deployment.slice(0, 3);
    } else {
      // Search all commands
      matchedCommands = commands.all_by_frequency
        .filter(([cmd]) => cmd.toLowerCase().includes(operation))
        .slice(0, 3);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: args.operation,
          commands: matchedCommands.map(([cmd, count]) => ({ command: cmd, usage_count: count }))
        }, null, 2)
      }]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Resources: Flex overview context
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'flex://overview',
      name: 'Flex Capabilities Overview',
      description: 'High-level overview of Twilio Flex capabilities, actions, and patterns',
      mimeType: 'text/markdown'
    }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'flex://overview') {
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: getFlexOverview()
      }]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  await loadKnowledgeBase();
  await initEmbeddings();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('✅ Flexpert MCP Server running');
}

main().catch(console.error);
