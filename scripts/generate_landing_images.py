"""Generate landing page images via Vertex AI Imagen 4.

Usage:
    export VERTEX_AI_PROJECT=...
    export VERTEX_AI_API_KEY=AQ....
    python scripts/generate_landing_images.py

Outputs PNG files to web/public/images/.
Uses Vertex AI Express Mode (API key auth, no service account needed).
"""
from __future__ import annotations
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


PROJECT = os.environ.get("VERTEX_AI_PROJECT", "")
API_KEY = os.environ.get("VERTEX_AI_API_KEY", "")
LOCATION = os.environ.get("VERTEX_AI_LOCATION", "global")

OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "images"
OUT_DIR.mkdir(parents=True, exist_ok=True)


IMAGES = [
    {
        "filename": "hero-orchestration.png",
        "prompt": (
            "Photorealistic dark cinematic 3D render of a futuristic AI orchestration hub. "
            "Multiple glowing amber and orange honeycomb-shaped data nodes connected by flowing "
            "particle streams of light. Each hexagonal cell represents an AI agent working on "
            "different code modules in parallel. Deep navy/black background with subtle grid "
            "pattern. Soft volumetric lighting. Bokeh depth of field. Professional product "
            "photography style for a tech SaaS landing page. Ultra-realistic, 4k quality, "
            "tasteful, minimal text-free composition. Color palette: amber #f59e0b, deep purple, "
            "midnight black."
        ),
        "aspect": "16:9",
    },
    {
        "filename": "feature-multi-agent.png",
        "prompt": (
            "Clean isometric 3D illustration of multiple AI agent avatars (stylized as glowing "
            "honey-amber bees with translucent wings) collaborating on a shared blueprint with "
            "code snippets floating around them. Each bee is connected by light beams to a "
            "different section of the blueprint. Modern tech aesthetic, soft gradient background "
            "(deep navy to black), professional product illustration style. Color: amber, "
            "purple, electric blue accents."
        ),
        "aspect": "1:1",
    },
    {
        "filename": "feature-scope-lease.png",
        "prompt": (
            "Photorealistic 3D rendered glowing translucent shield made of hexagonal cells, "
            "protecting a stylized file/folder icon. Streams of light passing through. Dark "
            "navy background, amber rim lighting. Clean modern tech product photography style, "
            "minimal composition. Professional landing page asset. No text."
        ),
        "aspect": "1:1",
    },
    {
        "filename": "og-social.png",
        "prompt": (
            "Modern dark-themed open graph social card. Centered: a glowing amber bee silhouette "
            "with subtle honeycomb pattern emanating outward. Bottom right small text reads "
            "'bumblebee-ai'. Deep midnight black background with subtle radial gradient. Clean, "
            "minimal, professional SaaS branding aesthetic. 1200x630 dimensions."
        ),
        "aspect": "16:9",
    },
]


def try_imagen_express(prompt: str, aspect: str) -> bytes | None:
    """Vertex AI Express Mode — API key auth."""
    endpoint = (
        f"https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}"
        f"/publishers/google/models/imagen-4.0-generate-001:predict"
    )
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": aspect,
            "safetyFilterLevel": "block_only_high",
            "personGeneration": "allow_adult",
        },
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            predictions = data.get("predictions", [])
            if predictions and predictions[0].get("bytesBase64Encoded"):
                return base64.b64decode(predictions[0]["bytesBase64Encoded"])
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  imagen-4 HTTP {e.code}: {msg}", file=sys.stderr)
    except Exception as e:
        print(f"  imagen-4 error: {e}", file=sys.stderr)
    return None


def try_gemini_image(prompt: str, aspect: str) -> bytes | None:
    """Fallback: Gemini 2.5 Flash Image (Nano Banana) via Generative Language API."""
    # The AQ. prefix key may not work here; try x-goog-api-key
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash-image-preview:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": f"Generate image: {prompt}. Aspect ratio {aspect}."}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                for p in parts:
                    inline = p.get("inlineData")
                    if inline and inline.get("data"):
                        return base64.b64decode(inline["data"])
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  gemini-image HTTP {e.code}: {msg}", file=sys.stderr)
    except Exception as e:
        print(f"  gemini-image error: {e}", file=sys.stderr)
    return None


def generate(prompt: str, aspect: str) -> bytes | None:
    # Try Vertex Imagen 4 first; fallback to Gemini 2.5 Flash Image
    img = try_imagen_express(prompt, aspect)
    if img:
        return img
    print("  → falling back to Gemini 2.5 Flash Image…")
    return try_gemini_image(prompt, aspect)


def main() -> int:
    if not API_KEY:
        print("ERROR: VERTEX_AI_API_KEY not set", file=sys.stderr)
        return 1
    if not PROJECT:
        print("WARN: VERTEX_AI_PROJECT not set; Imagen 4 may fail (try Gemini fallback)", file=sys.stderr)

    print(f"Output dir: {OUT_DIR}")
    succeeded = 0
    failed = []
    for spec in IMAGES:
        # Skip if already generated (idempotent)
        out_path = OUT_DIR / spec["filename"]
        if out_path.exists() and out_path.stat().st_size > 10_000:
            print(f"\n[skip] {spec['filename']} already exists ({out_path.stat().st_size} bytes)")
            succeeded += 1
            continue
        print(f"\n[*] {spec['filename']} ({spec['aspect']})")
        print(f"    prompt: {spec['prompt'][:100]}...")
        img = generate(spec["prompt"], spec["aspect"])
        if img:
            out = OUT_DIR / spec["filename"]
            out.write_bytes(img)
            print(f"    [ok] saved {out} ({len(img)} bytes)")
            succeeded += 1
        else:
            failed.append(spec["filename"])
            print(f"    [fail] generation failed")
        time.sleep(2)  # polite rate limit

    print(f"\n{'='*60}")
    print(f"Generated {succeeded}/{len(IMAGES)} images")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    return 0 if succeeded > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
