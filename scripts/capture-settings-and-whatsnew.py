"""Capture post-MVP polish: settings pages + What's-new modal."""
import asyncio
from pathlib import Path

OUT = Path(r"D:/Source/Bumblebee-cli/plans/reports/post-mvp-polish-screenshots")
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
            # Clear the "seen this version" flag so What's New shows
            await page.evaluate(
                "(m) => { localStorage.setItem('bumblebee.theme', m);"
                "localStorage.removeItem('bumblebee.whatsNew.lastSeen'); }",
                mode,
            )

            print(f"  -> {mode}-settings-workspace")
            await page.goto(f"{BASE}/settings/workspace", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1200)
            await page.screenshot(path=OUT / f"01-{mode}-settings-workspace.png", full_page=False)

            print(f"  -> {mode}-settings-members")
            await page.goto(f"{BASE}/settings/members", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1200)
            await page.screenshot(path=OUT / f"02-{mode}-settings-members.png", full_page=False)

            print(f"  -> {mode}-whatsnew-modal")
            await page.goto(f"{BASE}/dashboard", wait_until="networkidle")
            await page.wait_for_timeout(1500)  # Modal triggers on mount
            await page.screenshot(path=OUT / f"03-{mode}-whatsnew-modal.png", full_page=False)

        await browser.close()
    print(f"\nDone. {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
