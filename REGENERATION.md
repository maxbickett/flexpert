# Flexpert Knowledge Base Regeneration Guide

**Purpose:** Clear instructions for when and how to regenerate Flexpert's enriched knowledge base.

---

## When to Regenerate

### ✅ You SHOULD regenerate when:

1. **Twilio releases major Flex updates**
   - New Flex UI version (e.g., 2.x → 3.x)
   - New components or actions added
   - Significant API changes

2. **Documentation has been updated significantly**
   - Twilio updates official docs with new patterns
   - New examples or best practices published
   - Gotchas or known issues documented

3. **Production template gets major updates**
   - New features added to `flex-project-template`
   - Pattern changes or improvements
   - New best practices emerge

### ❌ You should NOT regenerate for:

- Minor doc typo fixes
- Small clarifications
- Internal refactoring that doesn't change patterns

---

## Full Regeneration Process

### Step 1: Update Raw Knowledge Base

**If Twilio docs changed:**

```bash
cd twilio-flex-tools/scripts

# Recrawl official docs (takes ~35 seconds)
python final_parallel_sitemap_crawler.py

# Rebuild knowledge base
python build_final_kb.py
```

**If production template changed:**

```bash
cd twilio-flex-tools

# Update the repo
cd repos/flex-project-template
git pull origin main
cd ../..

# Re-analyze patterns
python scripts/analyze_repos.py
python scripts/github_pattern_extractor.py

# Rebuild
python scripts/build_ultimate_kb.py
```

### Step 2: Test Enrichment on Sample

**ALWAYS test on a small sample first!**

```bash
cd twilio-flex-tools

# Activate venv (required for anthropic SDK)
source venv/bin/activate

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Test on first 20 examples
cd scripts
python enrich_knowledge.py --limit 20

# Verify quality
python enrich_knowledge.py --verify --limit 20
```

**Check the results:**
1. Open `../data/FINAL_FLEX_KNOWLEDGE.json`
2. Look at enriched examples
3. Verify:
   - Light enrichment has `pattern`, `location`, `for` tags
   - Deep enrichment has detailed gotchas with solutions
   - Tags are specific (not generic)
   - Locations are accurate

**If quality is bad:**
- Update prompts in `enrich_knowledge.py`
- Refine mental model in `FLEX_MENTAL_MODEL.md`
- Test again with `--force --limit 20`

### Step 3: Enrich Full Dataset

**Once sample looks good:**

```bash
# Phase 1: Light enrich ALL examples (~$1, ~10 minutes)
python enrich_knowledge.py --light-only

# Review results
python enrich_knowledge.py --verify

# Phase 2: Deep enrich selected examples (~$3, ~5 minutes)
python enrich_knowledge.py
# (Will skip light since already done, only do deep)
```

**Expected results:**
- ~753 examples with light enrichment
- ~100-150 examples with deep enrichment
- Total cost: ~$4-5
- Time: ~15-20 minutes

### Step 4: Update MCP Server

The MCP server automatically loads the enriched data - no code changes needed!

**But you should:**

```bash
cd ../mcp-server

# Restart the MCP server
# In Claude Code: reload the MCP server or restart Claude
```

### Step 5: Test End-to-End

Test with real queries:

1. In Claude Code, ask: "add CRM panel to task sidebar"
2. Verify Flexpert returns:
   - Relevant examples (component registration, not actions)
   - Context about visual location
   - Gotchas about null task
   - Good ranking (best result first)

3. Test more queries:
   - "how do I replace AcceptTask action"
   - "add button to task canvas header"
   - "get customer data from task attributes"

**Quality checklist:**
- [ ] Correct pattern types returned
- [ ] Visual locations are described
- [ ] Gotchas are specific and helpful
- [ ] Top result is genuinely the best match
- [ ] No duplicate/near-duplicate results

---

## Partial Regeneration (Just Enrichment)

If you want to re-enrich WITHOUT recrawling docs:

```bash
cd twilio-flex-tools/scripts

# Re-enrich everything (keeps raw data, regenerates context)
python enrich_knowledge.py --force

# Or just re-do deep enrichment
python enrich_knowledge.py --force
# (Will prompt: light then deep)
```

---

## Troubleshooting

### Enrichment fails with JSON errors

**Problem:** Claude returns malformed JSON or adds explanation text

**Fix:**
1. Check prompts in `enrich_knowledge.py`
2. Make sure they say "JSON only, no explanation"
3. Test with `--limit 5` to debug specific examples

### Cost is higher than expected

**Problem:** Enriching more examples than needed

**Fix:**
1. Check `should_deep_enrich()` function
2. Make sure it's not over-selecting examples
3. Run `--verify` to see deep enrichment count before proceeding

### Quality is inconsistent

**Problem:** Some enrichments are great, others are generic

**Fix:**
1. Update `FLEX_MENTAL_MODEL.md` with better context
2. Refine prompts to be more specific
3. Add more validation rules in `validate_quality()`
4. Re-run just the bad examples with `--force`

### MCP server not using new enrichment

**Problem:** Query results haven't changed after enrichment

**Fix:**
1. Verify `FINAL_FLEX_KNOWLEDGE.json` actually has `context` fields
2. Restart Claude Code to reload MCP server
3. Check MCP server logs for errors loading data

---

## File Locations Reference

```
flexpert/
├── FLEX_MENTAL_MODEL.md           # Mental model (update if patterns change)
├── REGENERATION.md                 # This file
├── twilio-flex-tools/
│   ├── data/
│   │   ├── FINAL_FLEX_KNOWLEDGE.json        # Main knowledge base (enriched in-place)
│   │   ├── ULTIMATE_FLEX_KNOWLEDGE.json     # Summary knowledge
│   │   ├── component_registry.json          # Component metadata
│   │   └── action_payloads.json             # Action schemas
│   ├── scripts/
│   │   ├── enrich_knowledge.py              # Two-tier enrichment script
│   │   ├── final_parallel_sitemap_crawler.py # Recrawl docs
│   │   ├── build_final_kb.py                # Build knowledge base
│   │   └── ...                              # Other build scripts
│   └── ENRICHMENT_SCHEMA.md                  # Schema documentation
└── mcp-server/
    └── index.js                              # MCP server (auto-loads enriched data)
```

---

## Cost Tracking

Keep track of enrichment costs:

| Date | Action | Examples | Cost | Notes |
|------|--------|----------|------|-------|
| 2025-01-07 | Initial full enrichment | 753 | $4.12 | Light: 753, Deep: 142 |
| | | | | |

---

## Version History

- **v1.0.0** (2025-01-07): Initial two-tier enrichment system
  - Light enrichment for all 753 examples
  - Deep enrichment for ~150 important patterns
  - Total cost: ~$4

---

## Quick Reference Commands

```bash
# Test sample
python enrich_knowledge.py --limit 20

# Verify quality
python enrich_knowledge.py --verify

# Full enrichment (light + deep)
python enrich_knowledge.py

# Light only (skip deep)
python enrich_knowledge.py --light-only

# Force re-enrich all
python enrich_knowledge.py --force

# Recrawl docs
python final_parallel_sitemap_crawler.py
python build_final_kb.py
```

---

**Questions?** Check:
1. `ENRICHMENT_SCHEMA.md` for schema details
2. `FLEX_MENTAL_MODEL.md` for Flex concepts
3. `enrich_knowledge.py` script comments
