"""Capture the Phase D /settings/billing page in both modes."""
import asyncio
from pathlib import Path

OUT = Path(r"D:/Source/Bumblebee-cli/plans/reports/phase-d-billing-screenshots")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await ctx.new_page()

        for mode in ("light", "dark"):
            print(f"\n[{mode}]")
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            await page.evaluate("(m) => localStorage.setItem('bumblebee.theme', m)", mode)

            await page.goto(f"{BASE}/settings/billing", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1500)
            await page.screenshot(path=OUT / f"01-{mode}-billing.png", full_page=True)
            print(f"  -> 01-{mode}-billing")

        await browser.close()
    print(f"\nDone. {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
