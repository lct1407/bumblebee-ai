"""Capture screenshots of the new sidebar/board/stats/command-palette UI."""
import asyncio
import os
import sys
from pathlib import Path

OUT_DIR = Path(r"D:/Source/Bumblebee-cli/plans/reports/ui-overhaul-260521-screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await context.new_page()

        shots = [
            ("01-dashboard", "/dashboard", 1500),
            ("02-issues-list", "/issues", 1500),
            ("03-plugins", "/plugins", 1200),
            ("04-notifications", "/notifications", 1200),
        ]
        for name, path, wait in shots:
            print(f"  -> {name} ({path})")
            await page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(wait)
            await page.screenshot(path=OUT_DIR / f"{name}.png", full_page=True)

        # Issues board view
        print("  -> 05-issues-board")
        await page.goto(f"{BASE}/issues", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.click('button:has-text("Board")')
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT_DIR / "05-issues-board.png", full_page=True)

        print("  -> 06-issues-stats")
        await page.click('button:has-text("Stats")')
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT_DIR / "06-issues-stats.png", full_page=True)

        # Command palette via Ctrl+K
        print("  -> 07-cmd-palette")
        await page.goto(f"{BASE}/dashboard", wait_until="networkidle")
        await page.wait_for_timeout(800)
        await page.keyboard.press("Control+k")
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT_DIR / "07-cmd-palette.png")
        await page.keyboard.press("Escape")

        # Filter combobox open
        print("  -> 08-filter-combo")
        await page.goto(f"{BASE}/issues", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        # Click the Status filter button
        status_btn = page.locator('button:has-text("Status")').first
        await status_btn.click()
        await page.wait_for_timeout(600)
        await page.screenshot(path=OUT_DIR / "08-filter-combo.png")
        await page.keyboard.press("Escape")

        # Issue detail sheet
        print("  -> 09-issue-sheet")
        await page.wait_for_timeout(400)
        first_row = page.locator('tbody tr').first
        if await first_row.count() > 0:
            await first_row.click()
            await page.wait_for_timeout(800)
            await page.screenshot(path=OUT_DIR / "09-issue-sheet.png")

        await browser.close()
    print(f"\nDone. Screenshots in {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
