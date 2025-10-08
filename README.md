# Flexpert: Twilio Flex Expert MCP Server

Makes Claude Code an expert in Twilio Flex plugin development through enriched documentation and intelligent search.

## What This Is

**Knowledge Base** (2MB): 143 official docs + 300 code examples with 256 deeply enriched (85.3%)
**MCP Server**: Intelligent search with tiered ranking, action validation, CLI commands
**Status**: ✅ Production ready

## Key Features

- **Deep Enrichment**: 256/300 examples include gotchas, use cases, patterns, and requirements
- **Tiered Search**: Smart ranking system prioritizes deeply enriched, contextual results
- **Mental Model**: Component hierarchy, Actions framework, Plugin lifecycle understanding
- **592 Searchable Blocks**: From FINAL_FLEX_KNOWLEDGE comprehensive extraction
- **Configurable Limits**: Control search depth (default: 10 results)

## Structure

```
twilio-flex-tools/
├── data/
│   ├── FINAL_FLEX_KNOWLEDGE.json      # 2MB: 753 blocks, 300 examples, 143 pages
│   ├── component_registry.json         # 33KB: Component hierarchy metadata
│   ├── action_payloads.json            # 12KB: Action payloads and validation
│   └── ULTIMATE_FLEX_KNOWLEDGE.json    # 117KB: Original curated knowledge
└── scripts/
    └── final_parallel_sitemap_crawler.py  # Recrawl docs (35s)

mcp-server/
├── index.js           # MCP server with tiered search
└── flex-overview.md   # Mental model + architecture overview
```

## Installation

From this project directory:

```bash
claude mcp add flexpert node /Users/maxmac/Projects/flexpert/mcp-server/index.js
```

Restart Claude Code. Three tools will be available:
- `flex_search(query, limit)` - Semantic search with tiered ranking
- `flex_validate_action(action_name)` - Validate Flex Actions with examples
- `flex_get_cli(operation)` - Get correct CLI commands with gotchas

## Usage

Claude automatically loads the Flex mental model overview when you work on Flex projects. Then search on-demand:

```
"How do I add a component to TaskCanvas?"
→ Returns enriched examples with gotchas, requirements, alternatives

"Validate the AcceptTask action"
→ Returns payload structure, common patterns, error handling

"What's the deploy command?"
→ Returns CLI with --include-remote flag warning
```

## Search Intelligence

Results are ranked by tier:
1. **Tier 1 (Deep)**: Fully enriched with gotchas, use cases, patterns (256 examples)
2. **Tier 2 (Light)**: Basic context and categorization
3. **Tier 3 (Basic)**: Code-only, no enrichment

Search also considers:
- Intent detection (adding, modifying, debugging)
- Component location awareness (TaskCanvas, MainHeader, etc.)
- Deduplication (same pattern from different docs)

## Critical Gotchas

⚠️ **Deploy**: Use `twilio flex:plugins:deploy --include-remote` or existing plugins get deleted
⚠️ **replaceAction**: MUST `return original(payload)` or action breaks completely
⚠️ **TaskInfoPanel**: Components receive `null` task when reservation ends
⚠️ **Async removal**: Always check `tasks.get(sid)` exists before using
⚠️ **Flex Insights attachments**: Set `task.attributes.conversations.media` array

## Stats

- **300** code examples (256 deeply enriched = 85.3%)
- **143** official documentation pages
- **753** total code blocks extracted
- **592** searchable code blocks in FINAL_FLEX_KNOWLEDGE
- **44** unique Flex Actions documented
- **248** unique CLI commands

## Rebuilding Knowledge Base

Recrawl official docs (35 seconds):
```bash
cd twilio-flex-tools
python3 scripts/final_parallel_sitemap_crawler.py
```

The deep enrichment was done manually with comprehensive analysis. To re-enrich, review `ENRICHMENT_COMPLETE.md` for methodology.

---

Built from 143 official Twilio Flex docs with manual enrichment by Claude.
