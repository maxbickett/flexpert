#!/usr/bin/env python3
"""
TWO-TIER Enrichment: Light enrichment for ALL examples, deep for important ones.

Tier 1 (Light): Fast, cheap classification for intent detection (~$1 for all 753)
Tier 2 (Deep): Comprehensive context for complex patterns (~$3 for ~100)

Usage:
    # Enrich all with light, then deep enrich selected examples
    python enrich_knowledge.py

    # Force re-enrich
    python enrich_knowledge.py --force

    # Test on first N examples
    python enrich_knowledge.py --limit 20

    # Verify quality
    python enrich_knowledge.py --verify

    # Light enrichment only (skip deep)
    python enrich_knowledge.py --light-only
"""

import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import anthropic

# Configuration
SCHEMA_VERSION = "1.0.0"
DATA_DIR = Path(__file__).parent.parent / "data"
KNOWLEDGE_FILE = DATA_DIR / "FINAL_FLEX_KNOWLEDGE.json"
CHECKPOINT_FILE = DATA_DIR / ".enrichment_checkpoint.json"
MENTAL_MODEL_FILE = Path(__file__).parent.parent.parent / "FLEX_MENTAL_MODEL.md"

# Load mental model for context
MENTAL_MODEL_CONTEXT = ""
if MENTAL_MODEL_FILE.exists():
    with open(MENTAL_MODEL_FILE) as f:
        MENTAL_MODEL_CONTEXT = f.read()


def load_knowledge_base() -> Dict:
    """Load the knowledge base."""
    with open(KNOWLEDGE_FILE) as f:
        return json.load(f)


def save_knowledge_base(data: Dict) -> None:
    """Save the knowledge base with backup."""
    backup_file = KNOWLEDGE_FILE.with_suffix('.json.backup')
    if KNOWLEDGE_FILE.exists():
        import shutil
        shutil.copy(KNOWLEDGE_FILE, backup_file)

    with open(KNOWLEDGE_FILE, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"✅ Saved to {KNOWLEDGE_FILE}")


def should_deep_enrich(code: str, source_url: str) -> bool:
    """Determine if example deserves deep enrichment."""
    code_lower = code.lower()

    # Component registration patterns
    if any(comp in code_lower for comp in [
        'taskinf opanel', 'taskcanvas', 'mainheader', 'teamsview',
        '.content.add', '.content.replace', '.content.remove'
    ]):
        return True

    # Action patterns (critical ones)
    if any(action in code_lower for action in [
        'replaceaction', 'addlistener', 'beforeaccept', 'afteraccept',
        'accepttask', 'selecttask', 'wrapuptask', 'transfertask'
    ]):
        return True

    # Production template
    if 'flex-project-template' in source_url:
        return True

    # Skip simple stuff
    if len(code) < 100:  # Too short to be complex
        return False

    if any(skip in code_lower for skip in [
        '"url":', 'const twilio', 'twilio flex:plugins',
        'import {', 'import *'
    ]) and '.add(' not in code_lower and 'actions' not in code_lower:
        return False

    return False


def build_light_prompt(code: str, source_url: str, language: str) -> str:
    """Build prompt for light enrichment - fast and cheap."""
    return f"""Quick Flex code classification. Return ONLY JSON, no explanation.

CODE:
```{language}
{code[:500]}
```

Return:
{{
  "pattern": "component|action-invoke|action-replace|action-listen|utility|config|cli|import",
  "location": "right-sidebar|top-bar|center-panel|left-nav|modal|none",
  "for": ["2-4 specific tags: crm, task-data, customer-info, transfer, etc"],
  "gotchas": ["top 2 specific issues only"],
  "confidence": "high|medium|low",
  "tier": "light"
}}

Rules:
- Pattern: component (UI), action-invoke, action-replace, action-listen, utility, config, cli, import
- Location: Where in Flex UI? (or "none" if not UI)
- For: Specific use cases (NOT generic like "data" - be specific like "customer-data")
- Gotchas: Top 2 ONLY, concrete issues
- Be fast, be specific

JSON only:
"""


def build_deep_prompt(code: str, source_url: str, language: str) -> str:
    """Build prompt for deep enrichment - detailed and comprehensive."""
    return f"""Twilio Flex expert analysis. Provide comprehensive enrichment.

REFERENCE:
{MENTAL_MODEL_CONTEXT[:1500]}

CODE:
```{language}
{code}
```
SOURCE: {source_url}

Return detailed JSON:
{{
  "pattern_type": "component_registration|action_invocation|action_replacement|action_listener|utility|configuration|state_management",
  "execution_context": {{
    "file_type": "plugin_init|component|hook|utility",
    "runs_when": "When this executes"
  }},
  "ui_placement": {{  // Only if UI code
    "component_path": "Flex.TaskInfoPanel.Content",
    "visual_location": "Right sidebar when task is selected",
    "component_hierarchy": "AgentDesktopView > TaskInfoPanel > Content",
    "always_visible": false
  }},
  "use_case": {{
    "summary": "One sentence what this does",
    "common_scenarios": ["Real scenario 1", "Real scenario 2", "Real scenario 3"],
    "solves_problem": "What problem this solves"
  }},
  "requirements": {{
    "imports": ["Required imports"],
    "dependencies": [],
    "must_exist_first": ["Prerequisites"],
    "flex_version": "2.x|1.x|both"
  }},
  "gotchas": [
    {{
      "issue": "Specific problem",
      "why": "Root cause",
      "solution": "How to fix"
    }}
  ],
  "related_patterns": {{
    "alternatives": ["Other ways"],
    "complements": ["Used with"],
    "supersedes": []
  }},
  "enrichment_metadata": {{
    "confidence": "high|medium|low",
    "enriched_at": "{datetime.utcnow().isoformat()}Z",
    "version": "{SCHEMA_VERSION}",
    "tier": "deep"
  }}
}}

CRITICAL:
- Gotchas MUST have why + solution
- UI placement must be visual ("right sidebar") not just technical
- Use cases must be specific and real
- Omit fields if not applicable

JSON only:
"""


def enrich_example_light(client: anthropic.Anthropic, example: Dict) -> Dict:
    """Light enrichment - fast and cheap."""
    if 'context' in example and example['context'].get('tier') in ['light', 'deep']:
        return example  # Already enriched

    code = example['code']
    source_url = example.get('source_url', '')
    language = example.get('language', 'javascript')

    try:
        prompt = build_light_prompt(code, source_url, language)

        message = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=500,  # Light enrichment is short
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text.strip()

        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0]
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0]

        context = json.loads(response_text.strip())
        example['context'] = context
        return example

    except Exception as e:
        print(f"⚠️  Error: {e}")
        example['context'] = {
            "pattern": "unknown",
            "for": [],
            "confidence": "error",
            "tier": "light",
            "error": str(e)
        }
        return example


def enrich_example_deep(client: anthropic.Anthropic, example: Dict) -> Dict:
    """Deep enrichment - detailed and comprehensive."""
    if 'context' in example and example['context'].get('tier') == 'deep':
        return example  # Already deep enriched

    code = example['code']
    source_url = example.get('source_url', '')
    language = example.get('language', 'javascript')

    try:
        prompt = build_deep_prompt(code, source_url, language)

        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",  # Better model for deep
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text.strip()

        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0]
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0]

        context = json.loads(response_text.strip())
        example['context'] = context
        return example

    except Exception as e:
        print(f"⚠️  Error: {e}")
        # Keep light enrichment if it exists
        if 'context' not in example or example['context'].get('tier') != 'light':
            example['context'] = {
                "pattern_type": "unknown",
                "confidence": "error",
                "tier": "deep",
                "error": str(e)
            }
        return example


def validate_quality(example: Dict) -> Tuple[bool, List[str]]:
    """Validate enrichment quality."""
    issues = []
    context = example.get('context', {})

    tier = context.get('tier')

    if tier == 'light':
        # Light validation
        if 'pattern' not in context:
            issues.append("Missing pattern")
        if not context.get('for'):
            issues.append("Missing 'for' tags")

    elif tier == 'deep':
        # Deep validation
        deep = context.get('deep', {})
        if 'use_case' not in deep or not deep['use_case'].get('summary'):
            issues.append("Missing use_case.summary")

        gotchas = deep.get('gotchas', [])
        for i, gotcha in enumerate(gotchas):
            if isinstance(gotcha, dict):
                if not gotcha.get('why'):
                    issues.append(f"Gotcha {i} missing 'why'")
                if not gotcha.get('solution'):
                    issues.append(f"Gotcha {i} missing 'solution'")

    return (len(issues) == 0, issues)


def enrich_knowledge_base(force: bool = False, limit: Optional[int] = None,
                          verify_only: bool = False, light_only: bool = False):
    """Main enrichment function."""
    print("🚀 Two-Tier Flex Knowledge Enrichment")
    print("=" * 60)

    kb = load_knowledge_base()
    examples = kb.get('code_examples', [])

    if limit:
        examples = examples[:limit]
        print(f"🔬 Testing on first {limit} examples")

    print(f"📚 Total examples: {len(examples)}")

    if verify_only:
        print("\n🔍 VERIFICATION MODE\n")
        stats = {"total": 0, "light": 0, "deep": 0, "none": 0, "valid": 0, "issues": 0}

        for ex in examples:
            stats["total"] += 1
            tier = ex.get('context', {}).get('tier')
            if tier == 'light':
                stats["light"] += 1
            elif tier == 'deep':
                stats["deep"] += 1
            else:
                stats["none"] += 1

            if 'context' in ex:
                is_valid, issues_list = validate_quality(ex)
                if is_valid:
                    stats["valid"] += 1
                else:
                    stats["issues"] += 1
                    print(f"⚠️  {ex.get('source_url', '')[:60]}")
                    for issue in issues_list:
                        print(f"     - {issue}")

        print(f"\n📊 Results:")
        print(f"   Total: {stats['total']}")
        print(f"   Light enriched: {stats['light']} ({stats['light']/stats['total']*100:.1f}%)")
        print(f"   Deep enriched: {stats['deep']} ({stats['deep']/stats['total']*100:.1f}%)")
        print(f"   Not enriched: {stats['none']} ({stats['none']/stats['total']*100:.1f}%)")
        print(f"   Valid: {stats['valid']}")
        print(f"   With issues: {stats['issues']}")
        return

    # Initialize Claude
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Phase 1: Light enrichment for ALL
    to_light_enrich = []
    for i, ex in enumerate(examples):
        if force or 'context' not in ex:
            to_light_enrich.append((i, ex))

    print(f"\n📝 Phase 1: Light enrichment for {len(to_light_enrich)} examples")
    light_cost = len(to_light_enrich) * 0.001  # Rough estimate
    print(f"💰 Estimated cost: ${light_cost:.2f}")

    if to_light_enrich and input("Proceed? (y/n): ").lower() == 'y':
        for i, (idx, ex) in enumerate(to_light_enrich):
            print(f"[{i+1}/{len(to_light_enrich)}] Light enriching {idx}...", end=" ")
            examples[idx] = enrich_example_light(client, ex)
            is_valid, _ = validate_quality(examples[idx])
            print("✅" if is_valid else "⚠️")

            if (i + 1) % 50 == 0:
                kb['code_examples'] = examples
                save_knowledge_base(kb)
                print("   💾 Checkpoint saved")

        kb['code_examples'] = examples
        save_knowledge_base(kb)
        print("✅ Light enrichment complete!")

    if light_only:
        print("\n✨ Light enrichment done (skipped deep enrichment)")
        return

    # Phase 2: Deep enrichment for selected examples
    to_deep_enrich = []
    for i, ex in enumerate(examples):
        tier = ex.get('context', {}).get('tier')
        if tier != 'deep' and should_deep_enrich(ex['code'], ex.get('source_url', '')):
            to_deep_enrich.append((i, ex))

    print(f"\n📝 Phase 2: Deep enrichment for {len(to_deep_enrich)} examples")
    deep_cost = len(to_deep_enrich) * 0.025  # Sonnet pricing
    print(f"💰 Estimated cost: ${deep_cost:.2f}")

    if to_deep_enrich and input("Proceed? (y/n): ").lower() == 'y':
        for i, (idx, ex) in enumerate(to_deep_enrich):
            print(f"[{i+1}/{len(to_deep_enrich)}] Deep enriching {idx}...", end=" ")
            examples[idx] = enrich_example_deep(client, ex)
            is_valid, _ = validate_quality(examples[idx])
            print("✅" if is_valid else "⚠️")

            if (i + 1) % 10 == 0:
                kb['code_examples'] = examples
                save_knowledge_base(kb)
                print("   💾 Checkpoint saved")

        kb['code_examples'] = examples
        kb['metadata']['enriched_at'] = datetime.utcnow().isoformat() + "Z"
        save_knowledge_base(kb)
        print("✅ Deep enrichment complete!")

    print("\n✨ All enrichment complete!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Two-tier enrichment")
    parser.add_argument("--force", action="store_true", help="Re-enrich all")
    parser.add_argument("--limit", type=int, help="Test on first N examples")
    parser.add_argument("--verify", action="store_true", help="Verify quality")
    parser.add_argument("--light-only", action="store_true", help="Skip deep enrichment")

    args = parser.parse_args()

    enrich_knowledge_base(
        force=args.force,
        limit=args.limit,
        verify_only=args.verify,
        light_only=args.light_only
    )
