#!/usr/bin/env python3
"""
Final Parallel Sitemap Crawler - Crawl all 143 Flex dev pages in parallel
Uses pre-extracted URL list split into batches
"""

import asyncio
import json
import hashlib
from datetime import datetime, UTC
from playwright.async_api import async_playwright
from pathlib import Path
import sys

class BatchCrawler:
    def __init__(self, batch_file, batch_id):
        self.batch_file = batch_file
        self.batch_id = batch_id
        self.docs_dir = Path("docs/final_crawl")
        self.docs_dir.mkdir(parents=True, exist_ok=True)
        self.pages_crawled = 0

        # Load URLs from batch file
        with open(batch_file, 'r') as f:
            self.urls = [line.strip() for line in f if line.strip()]

    def url_to_filename(self, url):
        """Convert URL to safe filename"""
        url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
        path_part = url.split('/docs/')[-1] if '/docs/' in url else url.split('/')[-1]
        path_part = path_part.replace('/', '_')[:60]
        return f"batch{self.batch_id}_{url_hash}_{path_part}.json"

    async def extract_page(self, page, url):
        """Proven extraction logic from test_single_page.py"""
        try:
            content = await page.evaluate('''() => {
                const data = {
                    title: document.title,
                    url: window.location.href,
                    text_content: '',
                    cli_commands: [],
                    actions: [],
                    code_blocks: [],
                    tables: []
                };

                // Get main content
                const main = document.querySelector('main, article, [role="main"], .docs-content');
                if (main) {
                    data.text_content = main.innerText;
                } else {
                    const content = document.querySelector('.content, #content, .documentation');
                    data.text_content = content ? content.innerText : document.body.innerText;
                }

                // Extract code blocks
                const codeSelectors = ['pre code', 'pre', '.highlight', '[class*="code"]'];
                const seenCodes = new Set();

                codeSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(block => {
                        const code = block.innerText || block.textContent;
                        if (code && code.length > 15 && code.length < 10000 && !seenCodes.has(code)) {
                            seenCodes.add(code);
                            data.code_blocks.push({
                                content: code,
                                language: block.className || 'unknown'
                            });

                            if (code.includes('twilio') || code.includes('flex:') || code.includes('npm')) {
                                const lines = code.split('\\n');
                                lines.forEach(line => {
                                    const trimmed = line.trim();
                                    if (trimmed && (trimmed.includes('twilio') || trimmed.includes('npm') || trimmed.includes('flex:')) &&
                                        !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
                                        data.cli_commands.push(trimmed);
                                    }
                                });
                            }
                        }
                    });
                });

                // Extract Actions
                const fullText = document.body.innerText;
                const patterns = [
                    /Actions\\.(\\w+)/g,
                    /before([A-Z][a-zA-Z]+)/g,
                    /after([A-Z][a-zA-Z]+)/g,
                    /"([A-Z][a-zA-Z]+Task)"/g,
                    /'([A-Z][a-zA-Z]+Task)'/g,
                    /registerAction\\s*\\(\\s*['"](\\w+)['"]/g,
                    /replaceAction\\s*\\(\\s*['"](\\w+)['"]/g,
                    /invokeAction\\s*\\(\\s*['"](\\w+)['"]/g,
                ];

                patterns.forEach(pattern => {
                    const matches = fullText.matchAll(pattern);
                    for (const match of matches) {
                        const action = match[1];
                        if (action && action.length > 2 && action.length < 50) {
                            data.actions.push(action);
                        }
                    }
                });

                // Extract tables
                document.querySelectorAll('table').forEach(table => {
                    const tableData = { headers: [], rows: [] };
                    table.querySelectorAll('th').forEach(th => tableData.headers.push(th.innerText.trim()));
                    table.querySelectorAll('tbody tr').forEach(tr => {
                        const row = [];
                        tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim()));
                        if (row.length > 0) tableData.rows.push(row);
                    });
                    if (tableData.headers.length > 0 || tableData.rows.length > 0) {
                        data.tables.push(tableData);
                    }
                });

                return data;
            }''')

            return content

        except Exception as e:
            print(f"[Batch {self.batch_id}] ❌ Extract error: {e}")
            return None

    async def crawl_batch(self):
        """Crawl all URLs in this batch"""
        print(f"[Batch {self.batch_id}] 🚀 Starting with {len(self.urls)} URLs")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            page.set_default_timeout(30000)

            for i, url in enumerate(self.urls, 1):
                print(f"[Batch {self.batch_id}] [{i}/{len(self.urls)}] 📄 {url.split('/')[-1][:40]}")

                try:
                    response = await page.goto(url, wait_until='domcontentloaded')

                    if response.status != 200:
                        print(f"[Batch {self.batch_id}]    ⚠️  Status {response.status}")
                        continue

                    await page.wait_for_timeout(1500)

                    # Extract content
                    content = await self.extract_page(page, url)

                    if content:
                        # Save to file
                        filename = self.url_to_filename(url)
                        filepath = self.docs_dir / filename

                        with open(filepath, 'w') as f:
                            json.dump({
                                'url': url,
                                'batch_id': self.batch_id,
                                'crawled_at': datetime.now(UTC).isoformat(),
                                'content': content
                            }, f, indent=2)

                        self.pages_crawled += 1

                        # Show stats
                        actions = len(set(content.get('actions', [])))
                        cmds = len(content.get('cli_commands', []))
                        codes = len(content.get('code_blocks', []))
                        print(f"[Batch {self.batch_id}]    ✅ {actions} actions, {cmds} cmds, {codes} code blocks")

                except Exception as e:
                    print(f"[Batch {self.batch_id}]    ❌ Error: {e}")

                await asyncio.sleep(0.3)

            await browser.close()

        print(f"[Batch {self.batch_id}] ✅ Complete! Crawled {self.pages_crawled}/{len(self.urls)} pages")
        return self.pages_crawled

async def main():
    # Find all batch files
    batch_files = sorted(Path('.').glob('flex_batch_*'))

    if not batch_files:
        print("❌ No batch files found! Run: split -l 15 flex_developer_urls.txt flex_batch_")
        sys.exit(1)

    print("="*70)
    print(f"🚀 LAUNCHING {len(batch_files)} PARALLEL CRAWLERS")
    print("="*70)

    # Create crawlers
    crawlers = [BatchCrawler(str(batch_file), i+1) for i, batch_file in enumerate(batch_files)]

    # Run all in parallel
    tasks = [crawler.crawl_batch() for crawler in crawlers]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Calculate totals
    total_pages = sum(r for r in results if isinstance(r, int))

    print("\n" + "="*70)
    print("✅ ALL CRAWLERS COMPLETE!")
    print("="*70)
    print(f"Total pages crawled: {total_pages}")
    print(f"Saved to: docs/final_crawl/")

    return total_pages

if __name__ == "__main__":
    import time
    start = time.time()

    total = asyncio.run(main())

    elapsed = time.time() - start
    print(f"\n⏱️  Total time: {elapsed:.1f}s")
    print(f"📊 Average: {elapsed/max(total,1):.2f}s per page")
