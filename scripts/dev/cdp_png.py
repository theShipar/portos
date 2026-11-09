#!/usr/bin/env python3
"""Decode a saved CDP Page.captureScreenshot JSON response into a PNG (dev QA helper)."""
import base64
import json
import sys

if len(sys.argv) != 3:
    sys.exit("usage: cdp_png.py <cdp-response.json> <out.png>")
with open(sys.argv[1]) as f:
    data = json.load(f)
payload = data.get("data") or data.get("result", {}).get("data")
if not payload:
    sys.exit("no screenshot data in response")
with open(sys.argv[2], "wb") as f:
    f.write(base64.b64decode(payload))
print(sys.argv[2])
