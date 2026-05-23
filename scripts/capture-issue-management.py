"""Capture screenshots showcasing the new issue create/edit/detail UI."""
import asyncio
from pathlib import Path

OUT = Path(r"D:/Source/Bumblebee-cli/plans/reports/issue-management-260522-screenshots")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def select_combobox(page, near_label: str, value: str):
    """Open a combobox by clicking near its label, search, click result."""
    trigger = page.locator(f'label:text-is("{near_label}") + div button, label:has-text("{near_label}") + button').first
    await trigger.click()
    await page.wait_for_timeout(300)
    await page.keyboard.type(value)
    await page.wait_for_timeout(200)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(300)


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await ctx.new_page()

        # Light mode
        await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
        await page.evaluate("() => localStorage.setItem('bumblebee.theme', 'light')")

        # Create form (task type) — Overview tab
        print("  -> 01-create-overview")
        await page.goto(f"{BASE}/issues", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.click('button:has-text("New issue")')
        await page.wait_for_timeout(900)
        await page.screenshot(path=OUT / "01-create-overview.png", full_page=False)

        # Acceptance tab (still task)
        print("  -> 02-create-acceptance")
        await page.click('button:has-text("Acceptance")')
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT / "02-create-acceptance.png", full_page=False)

        # Switch type to bug to reveal Diagnostics tab
        print("  -> 03-create-bug-diagnostics")
        try:
            await select_combobox(page, "Type", "Bug")
        except Exception as e:
            print(f"     skipping type-switch: {e}")
        await page.wait_for_timeout(500)
        # Click Diagnostics if present
        try:
            await page.click('button:has-text("Diagnostics")', timeout=3000)
            await page.wait_for_timeout(400)
        except Exception:
            pass
        await page.screenshot(path=OUT / "03-create-bug-diagnostics.png", full_page=False)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)

        # Detail page — BB-3
        print("  -> 04-detail-overview")
        await page.goto(f"{BASE}/issues/3", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=OUT / "04-detail-overview.png", full_page=True)

        print("  -> 05-detail-activity")
        await page.click('button:has-text("Activity")')
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT / "05-detail-activity.png", full_page=True)

        print("  -> 06-detail-runs")
        await page.click('button:has-text("Runs")')
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT / "06-detail-runs.png", full_page=True)

        # Edit sheet
        print("  -> 07-edit-sheet")
        await page.click('button:has-text("Overview")')
        await page.wait_for_timeout(300)
        await page.click('button:has-text("Edit")')
        await page.wait_for_timeout(900)
        await page.screenshot(path=OUT / "07-edit-sheet.png", full_page=False)
        await page.keyboard.press("Escape")

        # Dark mode
        print("\n[dark mode]")
        await page.evaluate("() => localStorage.setItem('bumblebee.theme', 'dark')")

        print("  -> 08-dark-detail")
        await page.goto(f"{BASE}/issues/3", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=OUT / "08-dark-detail.png", full_page=True)

        print("  -> 09-dark-create")
        await page.goto(f"{BASE}/issues", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.click('button:has-text("New issue")')
        await page.wait_for_timeout(900)
        await page.screenshot(path=OUT / "09-dark-create.png", full_page=False)

        await browser.close()
    print(f"\nDone. {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
