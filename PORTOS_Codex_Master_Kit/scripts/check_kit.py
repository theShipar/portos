#!/usr/bin/env python3
"""Check this PORTOS kit includes the complete instructional and JSON contract pack."""
from pathlib import Path
import json, sys
from collections import Counter
root=Path(__file__).resolve().parent.parent
expected={'01-product':5,'02-design-system':6,'03-earth-and-map':7,'04-maritime-3d':7,'05-map-interactions':5,'06-intelligence':6,'07-screens':6,'08-data-simulation':5,'09-workflows':4,'10-testing':4}
errors=[]
for module,count in expected.items():
    docs=sorted((root/'instructions'/module).glob('*.md'))
    if len(docs)!=count:errors.append(f'{module}: {len(docs)} instead of {count}')
    for doc in docs:
        txt=doc.read_text('utf-8')
        if len(txt)<3000:errors.append(doc.name+' unexpectedly short')
        for heading in ['## Goal and product relevance','## Implementation requirements','## Interface / data contracts','## Interaction and system states','## Acceptance checks','## Build instructions for Codex']:
            if heading not in txt:errors.append(doc.name+' missing '+heading)
for filename in ['AGENTS.md','START_HERE.md','README.md','CODEX_MASTER_PROMPT.md','04_DATA_CONTRACTS.md','instructions/INDEX.md','docs/DEMO_RUNBOOK.md','docs/IMPLEMENTATION_ORDER.md','assets/tokens.json']:
    if not (root/filename).is_file():errors.append('missing '+filename)
files=sorted((root/'sample-data').glob('*.json'))
if len(files)!=16: errors.append(f'expected 16 JSON sample/manifest files, found {len(files)}')
for f in files:
    try:json.loads(f.read_text('utf-8'))
    except Exception as e:errors.append(str(f)+': '+str(e))
for f in (root/'schemas').glob('*.json'):
    try:json.loads(f.read_text('utf-8'))
    except Exception as e:errors.append(str(f)+': '+str(e))
print('PORTOS KIT:', 'PASS' if not errors else 'FAIL')
print('Instruction files:',sum(expected.values()),'/ 55; supplemental Markdown and scripts provided')
print('JSON files:',len(files),'dataset,',len(list((root/'schemas').glob('*.json'))),'schemas')
for e in errors:print('ERROR:',e,file=sys.stderr)
raise SystemExit(1 if errors else 0)
