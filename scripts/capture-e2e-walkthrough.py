"""End-to-end walkthrough capture for the user guide.

Captures a brand-new user's journey: landing -> register -> onboard -> first issue ->
trigger workflow. Each step gets a numbered screenshot. The user guide doc embeds
these in order.

Resilient version: each step wraps in try/except so partial failure leaves
captured screenshots for the doc.
"""
import asyncio
import uuid
from pathlib import Path

OUT = Path(r"D:/Source/Bumblebee-cli/docs/guide-screenshots")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:3000"


async def screenshot(page, name: str, *, full_page: bool = False, wait: int = 800):
    await page.wait_for_timeout(wait)
    path = OUT / f"{name}.png"
    await page.screenshot(path=path, full_page=full_page)
    print(f"  -> {path.name}")


async def try_click(page, selector: str, label: str, timeout: int = 5000) -> bool:
    """Click best-effort; log + continue on failure."""
    try:
        await page.click(selector, timeout=timeout)
        return True
    except Exception as exc:
        print(f"    skip {label}: {type(exc).__name__}")
        return False


async def main():
    from playwright.async_api import async_playwright

    suffix = uuid.uuid4().hex[:6]
    username = f"walkthrough_{suffix}"
    email = f"{username}@example.com"
    password = "WalkthroughPass!1"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await ctx.new_page()

        print(f"[walkthrough] simulating user '{username}'")
        print(f"[walkthrough] output -> {OUT}\n")

        await page.goto(f"{BASE}/", wait_until="networkidle", timeout=30000)
        await page.evaluate("() => localStorage.setItem('bumblebee.theme', 'light')")

        # ---- Step 1: Landing
        print("Step 1 - Landing")
        await page.goto(f"{BASE}/", wait_until="networkidle")
        await screenshot(page, "01-landing-page", full_page=True, wait=1200)

        # ---- Step 2: Pricing
        print("Step 2 - Pricing")
        await page.goto(f"{BASE}/pricing", wait_until="networkidle")
        await screenshot(page, "02-pricing-page", full_page=True, wait=900)

        # ---- Step 3: Register
        print("Step 3 - Register form")
        await page.goto(f"{BASE}/register", wait_until="networkidle")
        await screenshot(page, "03-register-empty")
        await page.fill('input[type="text"]', username)
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)
        await screenshot(page, "04-register-filled", wait=400)

        # ---- Step 4: Submit -> onboarding
        print("Step 4 - Submit register")
        await page.click('button[type="submit"]')
        try:
            await page.wait_for_url("**/onboard*", timeout=15000)
        except Exception:
            print("    (no redirect; capturing current page)")
        await screenshot(page, "05-onboard-step1-workspace")

        # Step 4a: workspace name
        try:
            await page.fill('input[placeholder*="Acme"]', "Walkthrough Demo")
            await page.click('button:has-text("Next")', timeout=5000)
            await page.wait_for_timeout(800)
            await screenshot(page, "06-onboard-step2-invites")
        except Exception as e:
            print(f"    workspace step skipped: {e}")

        # Step 4b: skip invites
        if await try_click(page, 'button:has-text("Skip")', "skip invites"):
            await page.wait_for_timeout(700)
            await screenshot(page, "07-onboard-step3-templates")

        # Step 4c: pick a template — Playwright text-selector
        if await try_click(page, 'text=/Add/i', "Add template button"):
            await page.wait_for_timeout(400)
            await screenshot(page, "08-onboard-step3-feature-picked")
        else:
            # Fallback: pick the first template button
            if await try_click(page, '.grid button:first-child', "first template"):
                await page.wait_for_timeout(400)
                await screenshot(page, "08-onboard-step3-feature-picked")

        if await try_click(page, 'button:has-text("Create issue")', "create issue"):
            await page.wait_for_timeout(2500)
            await screenshot(page, "09-onboard-step4-complete")

        # ---- Step 5: Dashboard
        print("Step 5 - Dashboard")
        if not await try_click(page, 'button:has-text("Open dashboard")', "open dashboard"):
            await try_click(page, 'a:has-text("Open dashboard")', "open dashboard link")
        try:
            await page.wait_for_url("**/dashboard*", timeout=10000)
        except Exception:
            await page.goto(f"{BASE}/dashboard", wait_until="networkidle")
        await screenshot(page, "10-dashboard", full_page=True, wait=1500)

        # ---- Step 6: Issues list
        print("Step 6 - Issues")
        await page.goto(f"{BASE}/issues", wait_until="networkidle")
        await screenshot(page, "11-issues-list", full_page=True, wait=1200)

        # ---- Step 7: Issue detail
        print("Step 7 - Issue detail")
        if await try_click(page, 'tbody tr:first-child', "first issue row"):
            await page.wait_for_timeout(1000)
            await screenshot(page, "12-issue-detail-sheet")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)

        # Try the full detail page
        await page.goto(f"{BASE}/issues/1", wait_until="networkidle")
        await screenshot(page, "13-issue-detail-page", full_page=True, wait=1500)

        # Activity tab
        if await try_click(page, 'button:has-text("Activity")', "activity tab"):
            await page.wait_for_timeout(800)
            await screenshot(page, "14-issue-activity-tab")

        # ---- Step 8: Settings members
        print("Step 8 - Members")
        await page.goto(f"{BASE}/settings/members", wait_until="networkidle")
        await screenshot(page, "15-settings-members", full_page=True, wait=1200)

        # ---- Step 9: Settings billing
        print("Step 9 - Billing")
        await page.goto(f"{BASE}/settings/billing", wait_until="networkidle")
        await screenshot(page, "16-settings-billing", full_page=True, wait=1200)

        # ---- Step 10: Command palette
        print("Step 10 - Command palette")
        await page.goto(f"{BASE}/dashboard", wait_until="networkidle")
        await page.wait_for_timeout(800)
        await page.keyboard.press("Control+k")
        await page.wait_for_timeout(700)
        await screenshot(page, "17-command-palette")
        await page.keyboard.press("Escape")

        # ---- Step 11: Login page (sign back in)
        print("Step 11 - Login")
        await page.evaluate("() => { localStorage.removeItem('bumblebee.token'); }")
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await screenshot(page, "18-login-page", wait=900)

        await browser.close()

    n = len(list(OUT.glob("*.png")))
    print(f"\n[done] captured {n} screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
