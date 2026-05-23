"""Capture Phase F deliverables: /pricing + /onboard wizard."""
import asyncio
from pathlib import Path

OUT = Path(r"D:/Source/Bumblebee-cli/plans/reports/phase-f-onboarding-pricing-screenshots")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await ctx.new_page()

        for mode in ("light", "dark"):
            print(f"\n[{mode} mode]")
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            await page.evaluate(f"() => localStorage.setItem('bumblebee.theme', '{mode}')")

            # Pricing page
            print(f"  -> {mode}-pricing")
            await page.goto(f"{BASE}/pricing", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(900)
            await page.screenshot(path=OUT / f"01-{mode}-pricing.png", full_page=True)

            # Onboarding step 1
            print(f"  -> {mode}-onboard-step1")
            await page.goto(f"{BASE}/onboard", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(700)
            await page.screenshot(path=OUT / f"02-{mode}-onboard-step1.png", full_page=False)

        await browser.close()
    print(f"\nDone. {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
