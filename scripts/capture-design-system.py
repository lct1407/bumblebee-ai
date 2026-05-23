"""Capture light/dark mode screenshots after design system refactor."""
import asyncio
from pathlib import Path

OUT_DIR = Path(r"D:/Source/Bumblebee-cli/plans/reports/design-system-260522-screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def shoot_mode(page, mode: str, name_prefix: str):
    """Switch theme via localStorage, reload, and capture core pages."""
    # Need to be on the site origin before touching localStorage
    await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded", timeout=30000)
    await page.evaluate(f"""
        () => {{
            localStorage.setItem('bumblebee.theme', '{mode}');
        }}
    """)
    pages = [
        ("dashboard", "/dashboard", 1500),
        ("issues-list", "/issues", 1500),
        ("issues-board", "/issues", 1500),
        ("issues-stats", "/issues", 1500),
        ("plugins", "/plugins", 1200),
        ("notifications", "/notifications", 1200),
    ]
    for name, path, wait in pages:
        await page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(wait)
        if name == "issues-board":
            try:
                await page.click('button:has-text("Board")', timeout=3000)
                await page.wait_for_timeout(700)
            except Exception:
                pass
        elif name == "issues-stats":
            try:
                await page.click('button:has-text("Stats")', timeout=3000)
                await page.wait_for_timeout(700)
            except Exception:
                pass
        out = OUT_DIR / f"{name_prefix}-{name}.png"
        await page.screenshot(path=out, full_page=True)
        print(f"  -> {out.name}")

    # Cmd+K command palette
    await page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    await page.wait_for_timeout(800)
    await page.keyboard.press("Control+k")
    await page.wait_for_timeout(700)
    await page.screenshot(path=OUT_DIR / f"{name_prefix}-cmd-palette.png")
    await page.keyboard.press("Escape")


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await context.new_page()

        print("\n[light mode]")
        await shoot_mode(page, "light", "01-light")
        print("\n[dark mode]")
        await shoot_mode(page, "dark", "02-dark")

        await browser.close()
    print(f"\nDone. Screenshots in {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
