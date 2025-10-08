# Flexpert: Twilio Flex Expert MCP Server

Makes Claude Code an expert in Twilio Flex plugin development through enriched documentation and intelligent search.

## What This Is

**Knowledge Base** (2MB): 143 official docs + 300 code examples with 256 deeply enriched (85.3%)
**MCP Server**: Intelligent search with tiered ranking, action validation, CLI commands
**Status**: ✅ Working (semantic search TODO)

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

### From GitHub

```bash
# 1. Clone the repository
git clone https://github.com/maxbickett/flexpert.git
cd flexpert/mcp-server

# 2. Install dependencies
npm install

# 3. Add to Claude Code (replace /path/to/ with your actual path)
claude mcp add flexpert node /path/to/flexpert/mcp-server/index.js

# 4. Restart Claude Code
```

### Run Without Permissions (Optional)

To allow the MCP tools to run without requiring approval each time:

```bash
# Add with allowed patterns for all tools
claude mcp add flexpert node /path/to/flexpert/mcp-server/index.js \
  --allow-tool flex_search \
  --allow-tool flex_validate_action \
  --allow-tool flex_get_cli
```

### Available Tools

After installation, three tools will be available:
- `flex_search(query, limit)` - Intelligent search with tiered ranking
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
1. **Tier 1 (Deep)**: Enriched component/action exact matches (highest priority)
2. **Tier 2 (Medium)**: Curated quick patterns from docs
3. **Tier 3 (Light)**: Code blocks with relevance scoring (592 examples)
4. **Tier 4 (Basic)**: Lexical search in curated knowledge
5. **Tier 5 (Semantic)**: 🚧 TODO - Vector embeddings for semantic search

Search also considers:
- Intent detection (adding, modifying, debugging)
- Component location awareness (TaskCanvas, MainHeader, etc.)
- Deduplication (same pattern from different docs)

**Note**: Currently running on Tiers 1-4. Semantic search (Tier 5) requires building embeddings index.

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
