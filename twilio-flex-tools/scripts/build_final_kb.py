#!/usr/bin/env python3
"""
Build FINAL comprehensive Twilio Flex knowledge base
From sitemap-based crawl of all 143 developer pages
"""

import json
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, UTC

def build_final_kb():
    """Build the final comprehensive knowledge base"""

    print("🔨 Building final Flex knowledge base...")

    files = list(Path('docs/final_crawl').glob('*.json'))

    # Aggregate all data
    all_cli_commands = []
    all_actions = []
    all_code_blocks = []
    all_text = []
    all_tables = []
    url_index = []

    for filepath in files:
        with open(filepath) as f:
            data = json.load(f)

        url = data['url']
        content = data['content']
        url_index.append(url)

        # Collect CLI commands
        all_cli_commands.extend(content.get('cli_commands', []))

        # Collect actions
        all_actions.extend(content.get('actions', []))

        # Collect code blocks
        for code in content.get('code_blocks', []):
            if isinstance(code, dict):
                code_text = code.get('content', '')
                if code_text and 20 < len(code_text) < 5000:
                    all_code_blocks.append({
                        'code': code_text,
                        'language': code.get('language', 'unknown'),
                        'source_url': url
                    })

        # Collect text
        text = content.get('text_content', '')
        if text and len(text) > 200:
            all_text.append({
                'text': text,
                'url': url,
                'title': content.get('title', 'Unknown')
            })

        # Collect tables
        for table in content.get('tables', []):
            if table.get('headers') or table.get('rows'):
                all_tables.append({
                    'table': table,
                    'source_url': url
                })

    # Count frequencies
    cli_counter = Counter(all_cli_commands)
    action_counter = Counter(all_actions)

    # Build knowledge base
    kb = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "source": "sitemap_based_parallel_crawl",
            "total_pages": len(files),
            "total_code_blocks": len(all_code_blocks),
            "total_cli_commands": len(all_cli_commands),
            "unique_cli_commands": len(cli_counter),
            "total_actions": len(all_actions),
            "unique_actions": len(action_counter),
            "total_tables": len(all_tables)
        },

        "cli_commands": {
            "all_by_frequency": sorted(cli_counter.items(), key=lambda x: x[1], reverse=True),
            "unique_count": len(cli_counter),
            "deployment": [(cmd, count) for cmd, count in cli_counter.items()
                          if any(word in cmd.lower() for word in ['deploy', 'release', 'build', 'validate'])],
            "plugin_management": [(cmd, count) for cmd, count in cli_counter.items()
                                 if 'plugins:' in cmd and 'deploy' not in cmd.lower()],
            "flags": [(cmd, count) for cmd, count in cli_counter.items() if cmd.startswith('--')]
        },

        "flex_actions": {
            "all_by_frequency": sorted(action_counter.items(), key=lambda x: x[1], reverse=True),
            "unique_count": len(action_counter),
            "core_actions": [(action, count) for action, count in action_counter.items()
                            if count >= 2 and not action.startswith(('before', 'after')) and action[0].isupper()],
            "hooks": [(action, count) for action, count in action_counter.items()
                     if action.startswith(('before', 'after'))],
            "methods": [(action, count) for action, count in action_counter.items()
                       if action in ['registerAction', 'replaceAction', 'invokeAction', 'addListener', 'removeListener']]
        },

        "code_examples": all_code_blocks[:300],  # Top 300 code blocks

        "documentation_pages": all_text[:150],  # Top 150 substantial pages

        "parameter_tables": all_tables[:100],  # Top 100 parameter tables

        "url_index": sorted(url_index)
    }

    # Save
    output_path = Path("data/FINAL_FLEX_KNOWLEDGE.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(kb, f, indent=2)

    print(f"✅ Knowledge base saved to: {output_path}")
    print(f"\n📊 Final Statistics:")
    print(f"   Pages crawled: {kb['metadata']['total_pages']}")
    print(f"   Unique URLs: {len(kb['url_index'])}")
    print(f"   Code examples: {kb['metadata']['total_code_blocks']}")
    print(f"   Unique CLI commands: {kb['metadata']['unique_cli_commands']}")
    print(f"   Unique actions: {kb['metadata']['unique_actions']}")
    print(f"   Parameter tables: {kb['metadata']['total_tables']}")

    print(f"\n🔧 Top 10 CLI Commands:")
    for cmd, count in kb['cli_commands']['all_by_frequency'][:10]:
        if len(cmd) < 80:
            print(f"   ({count:3d}x) {cmd}")

    print(f"\n⚡ Top 15 Actions:")
    for action, count in kb['flex_actions']['all_by_frequency'][:15]:
        print(f"   ({count:3d}x) {action}")

    # Calculate quality score
    pages_with_code = sum(1 for cb in all_code_blocks if cb)
    quality_score = (pages_with_code / len(files)) * 100

    print(f"\n📈 Quality Score: {quality_score:.1f}%")
    print(f"   ({pages_with_code} pages have useful code)")

    return kb

if __name__ == "__main__":
    kb = build_final_kb()
