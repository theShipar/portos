#!/usr/bin/env python3
"""PORTOS offline synthetic fixture integrity checks; Python standard library only.

Extends the kit validator with the v1.1 fixture contract (regions registry, replay window,
scenario timeline, event vocabulary, weather/voyage links). See docs/DECISIONS.md.
"""
import json, argparse, sys
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

COLLECTIONS = ['regions', 'ports', 'terminals', 'berths', 'anchorages', 'routes', 'vessels', 'voyages', 'positions',
               'portCalls', 'incidents', 'evidence', 'weatherHazards', 'events', 'users']
ID_FIELDS = {'regions': 'regionId', 'ports': 'portId', 'terminals': 'terminalId', 'berths': 'berthId', 'anchorages': 'anchorageId',
             'routes': 'routeId', 'vessels': 'vesselId', 'voyages': 'voyageId', 'positions': 'positionId', 'portCalls': 'portCallId',
             'incidents': 'incidentId', 'evidence': 'evidenceId', 'weatherHazards': 'hazardId', 'events': 'eventId', 'users': 'userId'}
REF_KIND = {'vessel': 'vessels', 'voyage': 'voyages', 'port': 'ports', 'incident': 'incidents', 'weather': 'weatherHazards', 'route': 'routes'}
EVENT_TYPES = {'AIS_REPORT', 'ETA_REVISED', 'ANCHORAGE_ENTER', 'ANCHORAGE_EXIT', 'BERTH_SCHEDULED', 'BERTH_OCCUPIED', 'WEATHER_WARNING_ISSUED',
               'INCIDENT_OPENED', 'INCIDENT_ACKNOWLEDGED', 'ACTION_ASSIGNED', 'INCIDENT_RESOLVED', 'PORT_WAIT_UPDATED',
               'PORT_QUEUE_JOINED', 'BERTH_ESTIMATE_UPDATED'}
NAV_STATUS = {'underway', 'at_anchor', 'moored', 'not_under_command', 'unknown'}
DCSA_CLASSIFIERS = {'EST', 'REQ', 'PLN', 'ACT'}
V2_FILES = ['scenario', 'flagshipTracks', 'portLayouts', 'berthSchedule']
INCIDENT_STATUS = {'open', 'acknowledged', 'investigating', 'mitigation_planned', 'monitoring', 'resolved'}
BERTH_STATUS = {'occupied', 'scheduled', 'unavailable', 'free', 'unknown'}
MAX_GAP_MIN = 30


def parse(v):
    return datetime.fromisoformat(v.replace('Z', '+00:00'))


def point_in_polygon(p, poly):
    x, y = p['lon'], p['lat']
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi, xj, yj = poly[i]['lon'], poly[i]['lat'], poly[j]['lon'], poly[j]['lat']
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def validate_v2(folder: Path, by, vessel_samples, manifest):
    """V2 scenario module (sample-data/v2): additive keyframes, layouts and milestones that never contradict base records."""
    errors = []
    v2 = {}
    for name in V2_FILES:
        try:
            v2[name] = json.loads((folder / (name + '.json')).read_text('utf-8'))
        except Exception as e:
            errors.append(f'v2/{name}: {e}')
    if errors:
        return errors
    sc = v2['scenario']
    if sc.get('scenarioVersion') != manifest.get('scenarioVersion') or sc.get('baseFixtureVersion') != manifest.get('version'):
        errors.append('v2/scenario: version does not match manifest')
    try:
        w_min, w_max = parse(sc['window']['minUtc']), parse(sc['window']['maxUtc'])
        anchor = parse(sc['anchorUtc'])
        if not (w_min < anchor < w_max):
            errors.append('v2/scenario: anchor must lie inside the scenario window')
    except Exception:
        errors.append('v2/scenario: window invalid')
        return errors
    flagship = sc.get('flagshipVesselIds', [])
    if not (10 <= len(flagship) <= 30) or 'VSL-0047' not in flagship:
        errors.append('v2/scenario: 10-30 flagship vessels including VSL-0047 required')
    if 'VSL-0001' in flagship:
        errors.append('v2/scenario: VSL-0001 is anchored and must not receive movement keyframes')
    if sc.get('followDemo', {}).get('vesselId') != 'VSL-0047':
        errors.append('v2/scenario: follow demo must use VSL-0047')
    gap = sc.get('positionGapDemo')
    if gap:
        g_from, g_to = parse(gap['fromUtc']), parse(gap['toUtc'])
        inside = [r for r in vessel_samples.get(gap['vesselId'], []) if g_from < parse(r['timestampUtc']) < g_to]
        ends = {parse(r['timestampUtc']) for r in vessel_samples.get(gap['vesselId'], [])}
        if gap['vesselId'] in flagship:
            errors.append('v2/scenario: the position gap demo must use a vessel without keyframes')
        if inside or g_from not in ends or g_to not in ends or (g_to - g_from) <= timedelta(minutes=MAX_GAP_MIN):
            errors.append(f'v2/scenario: position gap demo for {gap["vesselId"]} must be bounded by samples and longer than {MAX_GAP_MIN} min')

    tracks = {t['vesselId']: t for t in v2['flagshipTracks']}
    if set(tracks) != set(flagship):
        errors.append('v2/flagshipTracks: vessels do not match scenario flagship list')
    for vid, t in tracks.items():
        if vid not in by['vessels']:
            errors.append(f'v2 track for unknown vessel {vid}')
            continue
        step = timedelta(minutes=t['intervalMinutes'])
        if t['intervalMinutes'] > MAX_GAP_MIN:
            errors.append(f'{vid}: keyframe interval above {MAX_GAP_MIN} min')
        base = vessel_samples.get(vid, [])
        if not base:
            continue
        first_base, last_base = parse(base[0]['timestampUtc']), parse(base[-1]['timestampUtc'])
        hist, fc = t['history'], t['forecast']
        h0 = parse(hist['startUtc'])
        h_last = h0 + step * (len(hist['samples']) - 1)
        if h0 != w_min or not hist['samples'] or h_last >= first_base or first_base - h_last > timedelta(minutes=MAX_GAP_MIN):
            errors.append(f'{vid}: history keyframes must start at the window and join the base samples within {MAX_GAP_MIN} min')
        f0 = parse(fc['startUtc'])
        f_last = f0 + step * (len(fc['samples']) - 1)
        if f0 <= last_base or f0 - last_base > timedelta(minutes=MAX_GAP_MIN) or f_last > w_max or w_max - f_last >= step:
            errors.append(f'{vid}: forecast keyframes must follow the last base sample and run to the window end')
        for s in hist['samples'] + fc['samples']:
            if len(s) != 5 or not (-180 <= s[0] <= 180 and -90 <= s[1] <= 90) or s[4] not in NAV_STATUS:
                errors.append(f'{vid}: malformed keyframe {s}')
                break
            if s[4] == 'underway' and not s[2]:
                errors.append(f'{vid}: underway keyframe without speed')
                break
            if s[4] in ('moored', 'at_anchor') and (s[2] or 0) > 0.5:
                errors.append(f'{vid}: stationary keyframe with speed (sailing and anchored at once)')
                break
    k47 = tracks.get('VSL-0047')
    if k47 and (k47['intervalMinutes'] > 15 or k47['routeId'] != 'RTE-SIN-MNL'):
        errors.append('VSL-0047 keyframes must be <= 15 min on RTE-SIN-MNL')

    layouts = {l['portId']: l for l in v2['portLayouts']}
    sin = layouts.get('PRT-SIN')
    if not sin:
        errors.append('v2/portLayouts: Singapore twin layout missing')
    else:
        berths = [b for t in sin['terminals'] for b in t['berths']]
        if len(sin['terminals']) < 2 or len(berths) < 6 or len(sin['anchorages']) < 2:
            errors.append('v2/portLayouts: Singapore needs >= 2 terminals, 6 berths, 2 anchorages')
        sin_vessels = {c['vesselId'] for c in by['portCalls'].values() if c['portId'] == 'PRT-SIN' and c['status'] != 'scheduled'}
        if len(sin_vessels) < 15:
            errors.append('v2/portLayouts: Singapore twin needs >= 15 vessels in port')
    for pid, l in layouts.items():
        if pid not in by['ports']:
            errors.append(f'v2/portLayouts: unknown port {pid}')
        for t in l['terminals']:
            if t['terminalId'] not in by['terminals']:
                errors.append(f'v2/portLayouts: unknown terminal {t["terminalId"]}')
            if not isinstance(t.get('yardContainers'), int) or t['yardContainers'] < 0:
                errors.append(f'v2/portLayouts: {t["terminalId"]} needs a declared yardContainers count')
            for b in t['berths']:
                if b['berthId'] not in by['berths'] or by['berths'][b['berthId']]['terminalId'] != t['terminalId']:
                    errors.append(f'v2/portLayouts: berth link invalid {b["berthId"]}')
                if b.get('constraintsValidated') is not False:
                    errors.append(f'v2/portLayouts: {b["berthId"]} must not claim validated constraints')

    ids = set()
    for bk in v2['berthSchedule']:
        bid = bk['bookingId']
        if bid in ids:
            errors.append(f'v2/berthSchedule duplicate {bid}')
        ids.add(bid)
        call = by['portCalls'].get(bk['portCallId'])
        if not call or call['vesselId'] != bk['vesselId']:
            errors.append(f'{bid}: port call link invalid')
        if bk.get('berthId') and bk['berthId'] not in by['berths']:
            errors.append(f'{bid}: unknown berth {bk["berthId"]}')
        for m in bk['milestones']:
            if m['classifier'] not in DCSA_CLASSIFIERS or m['eventType'] not in ('ARRIVAL', 'DEPARTURE') or m['location'] not in ('BERTH', 'PBP'):
                errors.append(f'{bid}: invalid milestone {m}')
            if m['classifier'] == 'ACT' and parse(m['atUtc']) > anchor:
                errors.append(f'{bid}: actual milestone after the scenario anchor')
            if parse(m['recordedAtUtc']) > anchor:
                errors.append(f'{bid}: milestone recorded after the scenario anchor')
        if bk['vesselId'] == 'VSL-0001':
            if bk.get('berthId') is not None or any(m['classifier'] in ('PLN', 'ACT') for m in bk['milestones']):
                errors.append('VSL-0001 berth booking must stay estimate-only (no planned or actual berth)')

    jit = sc.get('jitDemo')
    if jit:
        bk = next((b for b in v2['berthSchedule'] if b['portCallId'] == jit['portCallId']), None)
        if not bk or bk['vesselId'] != jit['vesselId'] or bk['status'] != 'scheduled':
            errors.append('v2/scenario: JIT demo must reference a scheduled berth booking')
        else:
            pbp = [parse(m['atUtc']) for m in bk['milestones'] if m['location'] == 'PBP' and m['classifier'] == 'EST']
            pln = [parse(m['atUtc']) for m in bk['milestones'] if m['location'] == 'BERTH' and m['eventType'] == 'ARRIVAL' and m['classifier'] == 'PLN']
            if not pbp or not pln or (pln[0] - pbp[0]) < timedelta(hours=3) or pln[0] != parse(jit['plannedBerthUtc']):
                errors.append('v2/scenario: JIT demo needs a planned berth at least 3 h after the pilot boarding estimate')
    return errors


V3_FILES = {'cargoUnits': 'cargoUnitId', 'stowagePlans': 'stowagePlanId', 'shipments': 'shipmentId', 'transferEvents': 'transferEventId', 'yardSlots': 'yardSlotId'}
ARCHETYPE_OF = {'Container ship': 'container', 'LNG carrier': 'lng', 'Oil tanker': 'tanker', 'Bulk carrier': 'bulk', 'RoRo': 'roro', 'General cargo': 'general'}
LOCATION_TYPES = {'vessel_slot', 'compartment', 'yard_slot', 'truck', 'gate', 'unknown'}
TRANSFER_KINDS = {'load': ('yard_slot', 'vessel_slot'), 'discharge': ('vessel_slot', 'yard_slot'), 'gate_out': ('yard_slot', 'gate')}


def iso6346_ok(no):
    if not isinstance(no, str) or len(no) != 11 or not no[:4].isalpha() or not no[4:].isdigit():
        return False
    letters = {c: v for c, v in zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38])}
    total = sum((letters[ch] if ch.isalpha() else int(ch)) * (2 ** i) for i, ch in enumerate(no[:10]))
    return total % 11 % 10 == int(no[10])


def delay_exposure_usd(eta_shift_hours, daily_rate_usd):
    """Spec formula: max(0, etaShiftHours) / 24 x dailyDelayRateUsd (mirrors src/engines/cargo.ts)."""
    return max(0.0, eta_shift_hours) / 24 * daily_rate_usd


def location_at(unit, evs, t):
    """Every location the unit could be in at t (mirrors containerLocationAt); a valid timeline yields exactly one."""
    out = []
    if not evs or t < parse(evs[0]['startUtc']):
        out.append(unit['initialLocation'])
    for k, e in enumerate(evs):
        s, en = parse(e['startUtc']), parse(e['endUtc'])
        nxt = parse(evs[k + 1]['startUtc']) if k + 1 < len(evs) else None
        if s <= t < en:
            out.append({'type': 'truck' if e['via'] == 'truck' else 'crane', 'craneId': e.get('craneId'), 'transferEventId': e['transferEventId']})
        if en <= t and (nxt is None or t < nxt):
            out.append(e['to'])
    return out


def loc_key(loc):
    if loc['type'] == 'vessel_slot':
        return ('vessel_slot', loc['vesselId'], loc['slotId'])
    if loc['type'] == 'yard_slot':
        return ('yard_slot', loc['yardSlotId'])
    if loc['type'] == 'compartment':
        return ('compartment', loc['vesselId'], loc['compartmentId'])
    return None


TERMINAL_TYPES = {'container', 'dry_bulk', 'lng', 'roro'}
TERMINAL_VESSEL_TYPE = {'dry_bulk': 'Bulk carrier', 'lng': 'LNG carrier', 'roro': 'RoRo'}
TERMINAL_UNITS = {'dry_bulk': ('t', 't/h'), 'lng': ('m3', 'm3/h'), 'roro': ('vehicles', 'vehicles/h')}
OP_STATUS = {'moored', 'transferring', 'paused', 'hazard'}
EQUIPMENT_KINDS = {'sts_crane', 'ship_loader', 'conveyor', 'stockpile', 'silo', 'loading_arm', 'vapour_arm', 'pipeline', 'lng_tank', 'ramp', 'staging_lanes'}


def offset_m(p, bearing, metres):
    import math
    r = 6371008.8
    b = math.radians(bearing)
    return {'lon': p['lon'] + math.degrees(metres * math.sin(b) / (r * math.cos(math.radians(p['lat'])))),
            'lat': p['lat'] + math.degrees(metres * math.cos(b) / r)}


def validate_v3_terminals(root: Path, by, manifest, window, vessel_samples):
    """Typed terminal module (sample-data/v3/terminalOps.json)."""
    errors = []
    try:
        m = json.loads((root / 'v3' / 'terminalOps.json').read_text('utf-8'))
        v2_bookings = json.loads((root / 'v2' / 'berthSchedule.json').read_text('utf-8'))
        v2_layouts = json.loads((root / 'v2' / 'portLayouts.json').read_text('utf-8'))
        transfers = json.loads((root / 'v3' / 'transferEvents.json').read_text('utf-8'))
    except Exception as e:
        return [f'v3/terminalOps: {e}']
    w_min, w_max = window
    meta = manifest.get('v3Terminals') or {}
    if meta.get('version') != m.get('version') or any(meta.get('counts', {}).get(k) != len(m.get(k, [])) for k in ('layouts', 'berthCalls', 'equipment', 'operations', 'hazardZones')):
        errors.append('v3/terminalOps: version or counts differ from manifest.v3Terminals')
    types = m.get('terminalTypes', {})
    for l in v2_layouts:
        for t in l['terminals']:
            if types.get(t['terminalId']) != 'container':
                errors.append(f'v3/terminalOps: V2 layout terminal {t["terminalId"]} must be typed container')
    layout_berths = {}
    for l in m['layouts']:
        if l['portId'] in {x['portId'] for x in v2_layouts} or l['portId'] not in by['ports']:
            errors.append(f'v3/terminalOps: layout {l["portId"]} must be a new port with a base record')
        for t in l['terminals']:
            tt = t.get('terminalType')
            if tt not in TERMINAL_TYPES or types.get(t['terminalId']) != tt or tt == 'container':
                errors.append(f'v3/terminalOps: terminal {t["terminalId"]} needs a non-container type that matches terminalTypes')
            base = by['terminals'].get(t['terminalId'])
            if not base or base['portId'] != l['portId'] or [b['berthId'] for b in t['berths']] != base['berthIds']:
                errors.append(f'v3/terminalOps: terminal {t["terminalId"]} berths must equal the base terminal record')
            for b in t['berths']:
                rec = by['berths'].get(b['berthId'])
                if not rec or rec['location'] != b['center'] or b['craneCount'] != 0 or b['constraintsValidated'] is not False:
                    errors.append(f'v3/terminalOps: berth {b["berthId"]} must sit at the base berth location, without STS cranes')
                layout_berths[b['berthId']] = (t, b)
    calls = {}
    occupancy = defaultdict(list)
    for bk in v2_bookings:
        ms = {(x['eventType'], x['classifier']): parse(x['atUtc']) for x in bk['milestones']}
        a, d = ms.get(('ARRIVAL', 'ACT')) or ms.get(('ARRIVAL', 'PLN')), ms.get(('DEPARTURE', 'PLN'))
        if bk.get('berthId') and a and d:
            occupancy[bk['berthId']].append((a, d, bk['vesselId']))
    for c in m['berthCalls']:
        tb = layout_berths.get(c['berthId'])
        v = by['vessels'].get(c['vesselId'])
        ms = {(x['eventType'], x['classifier']): parse(x['atUtc']) for x in c['milestones']}
        a, d = ms.get(('ARRIVAL', 'ACT')), ms.get(('DEPARTURE', 'PLN'))
        if not tb or not v or c['status'] != 'at_berth' or not a or not d or not (w_min <= a < d <= w_max):
            errors.append(f'v3/terminalOps {c["bookingId"]}: call needs a typed berth, a vessel, ACT arrival < PLN departure inside the window')
            continue
        if TERMINAL_VESSEL_TYPE.get(tb[0]['terminalType']) != v['vesselType']:
            errors.append(f'v3/terminalOps {c["bookingId"]}: {v["vesselType"]} cannot call at a {tb[0]["terminalType"]} terminal')
        if v['lengthMeters'] > tb[1]['lengthMeters'] + 40:
            errors.append(f'v3/terminalOps {c["bookingId"]}: {v["lengthMeters"]} m vessel exceeds berth length envelope')
        for a2, d2, other in occupancy[c['berthId']]:
            if a < d2 and a2 < d:
                errors.append(f'v3/terminalOps {c["bookingId"]}: berth {c["berthId"]} also holds {other}')
        occupancy[c['berthId']].append((a, d, c['vesselId']))
        if any(bk['vesselId'] == c['vesselId'] for bk in v2_bookings):
            errors.append(f'v3/terminalOps {c["bookingId"]}: vessel {c["vesselId"]} also has a V2 booking')
        calls[c['bookingId']] = (c, a, d)
        # Alongside fixes: every base sample inside the call sits at the moored pose (beam / 2 + 4 m fenders).
        t, b = tb
        pose = offset_m(b['center'], (t['quayBearingDeg'] - 90) % 360, v['beamMeters'] / 2 + 4)
        for s in vessel_samples.get(c['vesselId'], []):
            ts = parse(s['timestampUtc'])
            if a <= ts <= d and (abs(s['location']['lon'] - pose['lon']) > 2e-5 or abs(s['location']['lat'] - pose['lat']) > 2e-5 or s['navStatus'] != 'moored'):
                errors.append(f'v3/terminalOps {c["bookingId"]}: {s["positionId"]} is not at the alongside pose')
                break
    equipment = {e['equipmentId']: e for e in m['equipment']}
    if len(equipment) != len(m['equipment']):
        errors.append('v3/terminalOps: duplicate equipmentId')
    for e in m['equipment']:
        if e['kind'] not in EQUIPMENT_KINDS or e['terminalId'] not in by['terminals'] or (e['berthId'] and by['berths'].get(e['berthId'], {}).get('terminalId') != e['terminalId']):
            errors.append(f'v3/terminalOps {e["equipmentId"]}: unknown kind or terminal/berth mismatch')
    for tr in transfers:
        crane = tr.get('craneId')
        if crane and (equipment.get(crane, {}).get('kind') != 'sts_crane' or equipment[crane]['berthId'] != tr.get('berthId')):
            errors.append(f'v3/terminalOps: transfer {tr["transferEventId"]} crane {crane} is not an STS crane at {tr.get("berthId")}')
            break
    by_berth = defaultdict(list)
    for o in m['operations']:
        ctx = calls.get(o['bookingId'])
        tag = f'v3/terminalOps {o["operationId"]}'
        if not ctx or ctx[0]['vesselId'] != o['vesselId'] or ctx[0]['berthId'] != o['berthId']:
            errors.append(f'{tag}: must belong to a berth call with the same vessel and berth')
            continue
        c, a, d = ctx
        tt = layout_berths[o['berthId']][0]['terminalType']
        if o['terminalType'] != tt or (o['unit'], o['rateUnit']) != TERMINAL_UNITS[tt]:
            errors.append(f'{tag}: {o["unit"]} and {o["rateUnit"]} are not the units of a {tt} terminal')
        segs = o['segments']
        times = [(parse(s['startUtc']), parse(s['endUtc'])) for s in segs]
        if not segs or times[0][0] < a or times[-1][1] > d or any(x[0] >= x[1] for x in times) or any(times[i][1] != times[i + 1][0] for i in range(len(times) - 1)):
            errors.append(f'{tag}: segments must be contiguous and inside the berth call')
            continue
        by_berth[o['berthId']].append((times[0][0], times[-1][1], o['operationId']))
        stores = {s['equipmentId']: s['startQuantity'] for s in o['shoreStores']}
        for sid in list(stores) + o['equipmentIds']:
            if equipment.get(sid, {}).get('terminalId') != o['terminalId']:
                errors.append(f'{tag}: equipment {sid} is not at {o["terminalId"]}')
        ship_cap = sum(x['capacity'] for x in o['shipCompartments'])
        ship_qty = sum(x['startQuantity'] for x in o['shipCompartments'])
        total = ship_qty + sum(stores.values())
        sign = 1 if o['direction'] == 'load' else -1
        for s, (t0, t1) in zip(segs, times):
            if s['status'] not in OP_STATUS or (s['status'] == 'transferring') != (s['ratePerHour'] > 0) or (s['status'] == 'transferring') != (s['shoreStoreId'] is not None):
                errors.append(f'{tag}: segment {s["startUtc"]} status, rate and shore store disagree')
                continue
            if s['shoreStoreId'] and s['shoreStoreId'] not in stores:
                errors.append(f'{tag}: segment routes to undeclared store {s["shoreStoreId"]}')
                continue
            qty = s['ratePerHour'] * (t1 - t0).total_seconds() / 3600
            if s['shoreStoreId']:
                stores[s['shoreStoreId']] -= sign * qty
                ship_qty += sign * qty
                cap = equipment[s['shoreStoreId']]['ratedCapacity']
                if not (-1e-6 <= stores[s['shoreStoreId']] <= cap + 1e-6) or not (-1e-6 <= ship_qty <= ship_cap + 1e-6):
                    errors.append(f'{tag}: segment {s["startUtc"]} takes a store or the ship outside 0 … capacity')
            if abs(ship_qty + sum(stores.values()) - total) > 1e-6:
                errors.append(f'{tag}: ship + shore quantity not conserved at {s["endUtc"]}')
    for bid, spans in by_berth.items():
        spans.sort()
        if any(spans[i][1] > spans[i + 1][0] for i in range(len(spans) - 1)):
            errors.append(f'v3/terminalOps: operations overlap at {bid}')
    for z in m.get('hazardZones', []):
        if z['berthId'] not in layout_berths or layout_berths[z['berthId']][0]['terminalType'] != 'lng' or 'Simulated' not in z['label']:
            errors.append(f'v3/terminalOps {z["zoneId"]}: hazard zones belong to LNG berths and say Simulated')
    return errors


def validate_v3(folder: Path, by, manifest, window):
    errors, data, idx = [], {}, {}
    for name, fld in V3_FILES.items():
        try:
            rows = json.loads((folder / f'{name}.json').read_text('utf-8'))
            if not isinstance(rows, list):
                raise ValueError('must be a list')
        except Exception as e:
            errors.append(f'v3/{name}: {e}')
            rows = []
        ids = [r.get(fld) for r in rows]
        if any(not isinstance(i, str) for i in ids) or len(ids) != len(set(ids)):
            errors.append(f'v3/{name}: missing or duplicate {fld}')
        if (manifest.get('v3Module') or {}).get('counts', {}).get(name) != len(rows):
            errors.append(f'v3/{name}: count mismatch in manifest.v3Module')
        data[name], idx[name] = rows, {r.get(fld): r for r in rows}
    if errors:
        return errors
    units, plans, ships, evs, yard = (data[n] for n in V3_FILES)
    containers = [u for u in units if u['kind'] == 'container']
    if not 900 <= len(containers) <= 1100:
        errors.append(f'v3/cargoUnits: expected ~1,000 containers, got {len(containers)}')

    plan_of = {}
    for p in plans:
        v = by['vessels'].get(p['vesselId'])
        if not v:
            errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: unknown vessel')
            continue
        if p['voyageId'] != v['currentVoyageId']:
            errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: voyage is not the vessel current voyage')
        if p['archetype'] != ARCHETYPE_OF.get(v['vesselType']):
            errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: archetype {p["archetype"]} does not match {v["vesselType"]}')
        if p['archetype'] == 'container':
            sids = [s['slotId'] for s in p['slots']]
            if not sids or len(sids) != len(set(sids)) or p['compartments'] or p['grid']['slotCount'] != len(sids):
                errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: container plan needs unique slots, a matching grid count and no compartments')
            for s in p['slots']:
                if s['slotId'] != f'{s["bay"]:02d}{s["row"]:02d}{s["tier"]:02d}' or s['deck'] != ('above' if s['tier'] >= 80 else 'below'):
                    errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: slot {s["slotId"]} is not bay-row-tier coded')
                    break
        elif p['slots'] or not p['compartments']:
            errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: {p["archetype"]} plans use compartments, never container slots')
        plan_of[p['vesselId']] = p
    for vid in ('VSL-0255', 'VSL-0001'):
        if not plan_of.get(vid) or len(plan_of[vid]['slots']) != 800:
            errors.append(f'v3/stowagePlans: {vid} needs an 800-slot stowage plan')
    if (plan_of.get('VSL-0047') or {}).get('archetype') != 'lng':
        errors.append('v3/stowagePlans: VSL-0047 must carry LNG tanks, not containers')

    slot_sets = {vid: {s['slotId']: s for s in p['slots']} for vid, p in plan_of.items()}
    comp_sets = {vid: {c['compartmentId']: c for c in p['compartments']} for vid, p in plan_of.items()}
    yard_ids = idx['yardSlots']
    for u in units:
        uid = u['cargoUnitId']
        if u['vesselId'] not in plan_of:
            errors.append(f'v3/cargoUnits {uid}: vessel has no stowage plan')
            continue
        for k in ('originPortId', 'destinationPortId'):
            if u[k] not in by['ports']:
                errors.append(f'v3/cargoUnits {uid}: unknown {k} {u[k]}')
        sh = idx['shipments'].get(u['shipmentId'])
        if not sh or uid not in sh['cargoUnitIds']:
            errors.append(f'v3/cargoUnits {uid}: shipment link broken')
        loc = u['initialLocation']
        if loc['type'] not in LOCATION_TYPES:
            errors.append(f'v3/cargoUnits {uid}: unknown location type {loc["type"]}')
        if u['kind'] == 'container':
            if plan_of[u['vesselId']]['archetype'] != 'container':
                errors.append(f'v3/cargoUnits {uid}: container on a non-container vessel')
            if not iso6346_ok(u['containerNo']):
                errors.append(f'v3/cargoUnits {uid}: containerNo fails the ISO 6346 check digit')
            if loc['type'] == 'vessel_slot' and loc['slotId'] not in slot_sets.get(loc['vesselId'], {}):
                errors.append(f'v3/cargoUnits {uid}: slot {loc["slotId"]} not in stowage plan')
            if loc['type'] == 'yard_slot' and loc['yardSlotId'] not in yard_ids:
                errors.append(f'v3/cargoUnits {uid}: unknown yard slot')
        elif loc['type'] != 'compartment' or loc['compartmentId'] not in comp_sets.get(u['vesselId'], {}):
            errors.append(f'v3/cargoUnits {uid}: lot must sit in a declared compartment')
    for s in ships:
        if any(c not in idx['cargoUnits'] for c in s['cargoUnitIds']) or not s['cargoUnitIds']:
            errors.append(f'v3/shipments {s["shipmentId"]}: unknown or empty cargo units')
        vessel = by['vessels'].get(s['vesselId'])
        # A null voyage is only valid for a vessel between voyages (alongside with no current voyage).
        if not vessel or (s['voyageId'] not in by['voyages'] if s['voyageId'] is not None else vessel.get('currentVoyageId') is not None):
            errors.append(f'v3/shipments {s["shipmentId"]}: unknown vessel/voyage')

    # ---- transfer timeline: chains, crane exclusivity, single occupancy, gravity, exactly-one location ----
    w_min, w_max = window
    per_unit = defaultdict(list)
    for e in evs:
        try:
            s, en = parse(e['startUtc']), parse(e['endUtc'])
        except Exception:
            errors.append(f'v3/transferEvents {e["transferEventId"]}: bad timestamps')
            continue
        if not (w_min <= s < en <= w_max):
            errors.append(f'v3/transferEvents {e["transferEventId"]}: must lie inside the scenario window with start < end')
        exp = TRANSFER_KINDS.get(e['kind'])
        if not exp or (e['from']['type'], e['to']['type']) != exp:
            errors.append(f'v3/transferEvents {e["transferEventId"]}: {e["kind"]} must move {exp}')
        if e['cargoUnitId'] not in idx['cargoUnits'] or e['terminalId'] not in by['terminals']:
            errors.append(f'v3/transferEvents {e["transferEventId"]}: unknown unit or terminal')
            continue
        per_unit[e['cargoUnitId']].append(e)
    for uid, lst in per_unit.items():
        lst.sort(key=lambda e: e['startUtc'])
        cur = idx['cargoUnits'][uid]['initialLocation']
        for k, e in enumerate(lst):
            if e['from'] != cur:
                errors.append(f'v3/transferEvents {e["transferEventId"]}: from does not match the unit location before the move')
            if k and parse(lst[k - 1]['endUtc']) > parse(e['startUtc']):
                errors.append(f'v3/transferEvents {e["transferEventId"]}: overlaps the previous move of {uid}')
            cur = e['to']
    by_crane = defaultdict(list)
    for e in evs:
        if e.get('craneId'):
            by_crane[e['craneId']].append((parse(e['startUtc']), parse(e['endUtc']), e['transferEventId']))
    for crane, lst in by_crane.items():
        lst.sort()
        for a, b in zip(lst, lst[1:]):
            if b[0] < a[1]:
                errors.append(f'v3/transferEvents: crane {crane} handles {a[2]} and {b[2]} at once')

    occ = {}
    for u in units:
        k = loc_key(u['initialLocation'])
        if k:
            if k in occ:
                errors.append(f'v3: {k} doubly occupied at the window start')
            occ[k] = u['cargoUnitId']

    def neighbour(k, delta):
        if k[0] == 'vessel_slot':
            s = slot_sets[k[1]].get(k[2])
            sid = f'{s["bay"]:02d}{s["row"]:02d}{s["tier"] + 2 * delta:02d}'
            return ('vessel_slot', k[1], sid) if sid in slot_sets[k[1]] else None
        if k[0] == 'yard_slot':
            t = int(k[1][-1]) + delta
            return ('yard_slot', k[1][:-1] + str(t)) if 1 <= t <= 2 else None
        return None

    actions = sorted([(parse(e['endUtc']), 0, e) for e in evs] + [(parse(e['startUtc']), 1, e) for e in evs], key=lambda a: (a[0], a[1], a[2]['transferEventId']))
    in_transfer = set()
    for at, phase, e in actions:
        uid = e['cargoUnitId']
        if phase == 1:
            k = loc_key(e['from'])
            if occ.get(k) != uid:
                errors.append(f'v3/transferEvents {e["transferEventId"]}: {uid} is not at {k} when the move starts')
            above = neighbour(k, 1)
            if above and above in occ:
                errors.append(f'v3/transferEvents {e["transferEventId"]}: lifts {k} from under {above}')
            occ.pop(k, None)
            in_transfer.add(uid)
        else:
            in_transfer.discard(uid)
            k = loc_key(e['to'])
            if k is None:
                continue
            if k in occ:
                errors.append(f'v3/transferEvents {e["transferEventId"]}: {k} already holds {occ[k]}')
            below = neighbour(k, -1)
            if below and below not in occ:
                errors.append(f'v3/transferEvents {e["transferEventId"]}: places {k} with nothing underneath')
            occ[k] = uid
    for p in plans:
        if p['archetype'] != 'container':
            continue
        for s in p['slots']:
            k = ('vessel_slot', p['vesselId'], s['slotId'])
            nb = neighbour(k, -1)
            if k in occ and nb and nb not in occ:
                errors.append(f'v3/stowagePlans {p["stowagePlanId"]}: floating container at {s["slotId"]} at the window end')
                break

    probe = sorted({w_min, w_max - timedelta(seconds=1)} | {parse(e['startUtc']) + (parse(e['endUtc']) - parse(e['startUtc'])) / 2 for e in evs}
                   | {parse(e['endUtc']) for e in evs})
    moved = [u for u in units if u['cargoUnitId'] in per_unit]
    for t in probe[::max(1, len(probe) // 60)]:
        for u in moved:
            n = len(location_at(u, per_unit[u['cargoUnitId']], t))
            if n != 1:
                errors.append(f'v3: containerLocationAt({u["cargoUnitId"]}, {t.isoformat()}) resolved {n} locations')
                break

    # Crane unload flagship (kit scenario 4): VSL-0255, alongside BRH-SIN-W-3 through the anchor.
    flag_dis = [e for e in evs if e['kind'] == 'discharge' and e['from'].get('vesselId') == 'VSL-0255']
    arrivals = sum(1 for u in containers if u['vesselId'] == 'VSL-0255' and u['initialLocation']['type'] == 'vessel_slot')
    if arrivals < 500 or len(flag_dis) < 200:
        errors.append(f'v3: VSL-0255 needs a full arrival stow and a discharge plan (got {arrivals} on board, {len(flag_dis)} discharges)')
    bookings = json.loads((folder.parent / 'v2' / 'berthSchedule.json').read_text(encoding='utf-8'))
    bk = next((b for b in bookings if b['vesselId'] == 'VSL-0255' and b['status'] == 'at_berth'), None)
    mile = lambda b, ev, cls: next((parse(m['atUtc']) for m in b['milestones'] if m['eventType'] == ev and m['classifier'] == cls), None)
    if not bk or bk['berthId'] != 'BRH-SIN-W-3' or not mile(bk, 'ARRIVAL', 'ACT') or not mile(bk, 'DEPARTURE', 'PLN'):
        errors.append('v3: VSL-0255 must be alongside BRH-SIN-W-3 (actual arrival, planned departure) for the crane plan')
    else:
        arr, dep = mile(bk, 'ARRIVAL', 'ACT'), mile(bk, 'DEPARTURE', 'PLN')
        # The base timeline is canonical: no lift before the vessel's BERTH_OCCUPIED event, or the berth queue still
        # counts it as waiting while cargo moves.
        occupied = [parse(e['occurredAtUtc']) for e in by['events'].values()
                    if e['type'] == 'BERTH_OCCUPIED' and e['payload'].get('vesselId') == 'VSL-0255']
        arr = max([arr, *occupied])
        for e in evs:
            if e.get('craneId') and (e.get('berthId') != bk['berthId'] or not (arr <= parse(e['startUtc']) and parse(e['endUtc']) <= dep)):
                errors.append(f'v3: crane move {e["transferEventId"]} must be at BRH-SIN-W-3 between its actual arrival and planned departure')
                break
    # Anchored exception (kit scenario 3): VSL-0001 has no berth, so nothing is lifted on or off it.
    touched = [e['transferEventId'] for e in evs if 'VSL-0001' in (e['from'].get('vesselId'), e['to'].get('vesselId'))]
    if touched:
        errors.append(f'v3: VSL-0001 waits at anchor with no berth; transfers {touched[:3]} must not touch it')

    for vo in by['voyages'].values():
        if vo.get('dailyDelayCostUsd') is None or not vo.get('estimatedArrivalUtc') or not vo.get('plannedArrivalUtc'):
            continue
        shift = (parse(vo['estimatedArrivalUtc']) - parse(vo['plannedArrivalUtc'])).total_seconds() / 3600
        expo = delay_exposure_usd(shift, vo['dailyDelayCostUsd'])
        if expo < 0 or (shift <= 0 and expo != 0):
            errors.append(f'v3: delay exposure formula broken for {vo["voyageId"]}')
    v1 = by['voyages'].get('VYG-0001') or {}
    shift1 = (parse(v1['estimatedArrivalUtc']) - parse(v1['plannedArrivalUtc'])).total_seconds() / 3600 if v1 else 0
    if shift1 != 18 or delay_exposure_usd(shift1, v1.get('dailyDelayCostUsd', 0)) != 24000 \
            or manifest.get('scenario', {}).get('expectedEstimatedExposureUsd') != 24000:
        errors.append(f'v3: VYG-0001 delay exposure must be max(0, 18 h)/24 x 32,000 = 24,000 (got shift {shift1})')
    return errors


def run(folder: Path):
    errors = []
    datasets = {}
    for filename in COLLECTIONS:
        try:
            rows = json.loads((folder / (filename + '.json')).read_text('utf-8'))
            if not isinstance(rows, list):
                raise ValueError('must be a list')
            datasets[filename] = rows
        except Exception as e:
            errors.append(f'{filename}: {e}')
            datasets[filename] = []
    try:
        manifest = json.loads((folder / 'manifest.json').read_text('utf-8'))
    except Exception as e:
        errors.append('manifest: ' + str(e))
        manifest = {'counts': {}, 'scenario': {}}

    by = {}
    for n, rows in datasets.items():
        fld = ID_FIELDS[n]
        ids = []
        for j, r in enumerate(rows):
            if not isinstance(r, dict) or not isinstance(r.get(fld), str) or not r[fld]:
                errors.append(f'{n}[{j}] missing {fld}')
                continue
            ids.append(r[fld])
        if len(ids) != len(set(ids)):
            errors.append(f'{n} duplicate {fld}')
        by[n] = {r.get(fld): r for r in rows if isinstance(r, dict) and r.get(fld)}
        if manifest.get('counts', {}).get(n) != len(rows):
            errors.append(f'{n}: count mismatch in manifest')
    for n, target in [('vessels', 500), ('ports', 100), ('voyages', 200)]:
        if len(datasets[n]) != target:
            errors.append(f'{n} expected {target} got {len(datasets[n])}')
    for n, minimum in [('incidents', 50), ('positions', 2000), ('regions', 6), ('routes', 12), ('portCalls', 100), ('weatherHazards', 15), ('events', 200)]:
        if len(datasets[n]) < minimum:
            errors.append(f'{n} expected >= {minimum} got {len(datasets[n])}')

    rr = manifest.get('replayRange') or {}
    try:
        replay_start, replay_end = parse(rr['startUtc']), parse(rr['endUtc'])
    except Exception:
        errors.append('manifest.replayRange missing/invalid')
        replay_start = replay_end = None

    def ref(obj, key, collection, context, optional=False):
        v = obj.get(key)
        if v is None and optional:
            return
        if v not in by[collection]:
            errors.append(f'{context} references missing {collection} ID: {key}={v}')

    def utc(v, context):
        if v is None:
            return
        try:
            if not isinstance(v, str) or not v.endswith('Z'):
                raise ValueError('not ISO UTC Z')
            parse(v)
        except Exception:
            errors.append(f'{context}: invalid UTC time {v}')

    def loc(p, context):
        if not isinstance(p, dict):
            errors.append(f'{context}: not a geopoint')
            return
        if any(not isinstance(p.get(k), (int, float)) for k in ('lon', 'lat')):
            errors.append(f'{context}: missing coords')
            return
        if not (-180 <= p['lon'] <= 180 and -90 <= p['lat'] <= 90):
            errors.append(f'{context}: coords out of range {p}')

    # Regions registry
    for r in datasets['regions']:
        loc(r.get('center'), r['regionId'])
        b = r.get('bounds') or {}
        if any(not isinstance(b.get(k), (int, float)) for k in ('west', 'south', 'east', 'north')):
            errors.append(r['regionId'] + ': bounds incomplete')
        elif b['south'] >= b['north']:
            errors.append(r['regionId'] + ': south must be < north')
        if not r.get('countryIso3') or any(len(c) != 3 for c in r['countryIso3']):
            errors.append(r['regionId'] + ': countryIso3 must be ISO alpha-3 list')
        if not isinstance(r.get('cameraPreset'), dict):
            errors.append(r['regionId'] + ': cameraPreset missing')
        for pid in r.get('portIds', []):
            if pid not in by['ports']:
                errors.append(f'{r["regionId"]} lists unknown port {pid}')
            elif by['ports'][pid]['regionId'] != r['regionId']:
                errors.append(f'{r["regionId"]} lists {pid} which belongs to {by["ports"][pid]["regionId"]}')
    for p in datasets['ports']:
        loc(p.get('location'), p['portId'])
        utc(p.get('lastUpdatedUtc'), p['portId'])
        ref(p, 'regionId', 'regions', p['portId'])
        reg = by['regions'].get(p.get('regionId'))
        if reg and p['portId'] not in reg.get('portIds', []):
            errors.append(f'{p["portId"]} missing from region {reg["regionId"]} portIds')
        for t in p.get('terminalIds', []):
            if t not in by['terminals']:
                errors.append(f'{p["portId"]} lists unknown terminal {t}')
    for t in datasets['terminals']:
        ref(t, 'portId', 'ports', t['terminalId'])
        for b in t.get('berthIds', []):
            if b not in by['berths'] or by['berths'][b]['terminalId'] != t['terminalId']:
                errors.append(f'{t["terminalId"]} berth link invalid {b}')
    for b in datasets['berths']:
        ref(b, 'portId', 'ports', b['berthId'])
        ref(b, 'terminalId', 'terminals', b['berthId'])
        ref(b, 'occupiedByVesselId', 'vessels', b['berthId'], optional=True)
        ref(b, 'scheduledVesselId', 'vessels', b['berthId'], optional=True)
        utc(b.get('lastUpdatedUtc'), b['berthId'])
        if b.get('status') not in BERTH_STATUS:
            errors.append(f'{b["berthId"]} invalid status {b.get("status")}')
        if b.get('occupiedByVesselId') and b.get('status') != 'occupied':
            errors.append(f'{b["berthId"]} has occupant but status {b.get("status")}')
    for a in datasets['anchorages']:
        ref(a, 'portId', 'ports', a['anchorageId'])
        for i, p in enumerate(a.get('polygon', [])):
            loc(p, f'{a["anchorageId"]}[{i}]')
    for r in datasets['routes']:
        ref(r, 'originPortId', 'ports', r['routeId'])
        ref(r, 'destinationPortId', 'ports', r['routeId'])
        if len(r.get('waypoints', [])) < 2:
            errors.append(f'{r["routeId"]}: route needs >=2 waypoints')
        for i, p in enumerate(r.get('waypoints', [])):
            loc(p, f'{r["routeId"]} waypoint {i}')
    for v in datasets['vessels']:
        ref(v, 'currentVoyageId', 'voyages', v['vesselId'], optional=True)
        loc(v.get('lastKnownPosition'), v['vesselId'])
        utc(v.get('lastReportedAtUtc'), v['vesselId'])
    for v in datasets['voyages']:
        for f, c in [('vesselId', 'vessels'), ('originPortId', 'ports'), ('destinationPortId', 'ports'), ('routeId', 'routes')]:
            ref(v, f, c, v['voyageId'])
        for f in ['plannedArrivalUtc', 'estimatedArrivalUtc', 'estimatedAsOfUtc', 'departedAtUtc', 'plannedDepartureUtc', 'estimatedDepartureUtc']:
            utc(v.get(f), v['voyageId'] + '/' + f)
        r = by['routes'].get(v.get('routeId'))
        if r and (r['originPortId'] != v.get('originPortId') or r['destinationPortId'] != v.get('destinationPortId')):
            errors.append(v['voyageId'] + ' route mismatch')
        if r and r.get('isScenarioAlternative'):
            errors.append(v['voyageId'] + ' must not use a scenario-only route')
        vessel = by['vessels'].get(v.get('vesselId'))
        if vessel and vessel.get('currentVoyageId') != v['voyageId']:
            errors.append(v['voyageId'] + ' vessel currentVoyage mismatch')
        if v.get('currentStage') == 'in_transit' and not v.get('departedAtUtc'):
            errors.append(v['voyageId'] + ' in transit without departure time')
        if v.get('currentStage') in ('awaiting_berth', 'awaiting_departure') and v.get('departedAtUtc'):
            errors.append(v['voyageId'] + ' has departure time but has not departed')

    # Positions: chronology, replay window, interpolation gaps, last sample == vessel last known
    vessel_samples = defaultdict(list)
    for p in datasets['positions']:
        ref(p, 'vesselId', 'vessels', p['positionId'])
        loc(p.get('location'), p['positionId'])
        utc(p.get('timestampUtc'), p['positionId'])
        vessel_samples[p.get('vesselId')].append(p)
    # The V2 scenario may declare one reporting outage; it is checked against its bounds in validate_v2.
    declared_gap = None
    try:
        g = json.loads((folder / 'v2' / 'scenario.json').read_text('utf-8')).get('positionGapDemo')
        if g:
            declared_gap = (g['vesselId'], g['fromUtc'], g['toUtc'])
    except (OSError, ValueError, KeyError):
        pass
    for vid, seq in vessel_samples.items():
        ts = [s['timestampUtc'] for s in seq]
        if ts != sorted(ts) or len(ts) != len(set(ts)):
            errors.append(vid + ' positions not strictly chronologically sorted')
            continue
        if replay_start and (parse(ts[0]) < replay_start or parse(ts[-1]) > replay_end):
            errors.append(vid + ' positions outside replay range')
        for a, b in zip(ts, ts[1:]):
            if (parse(b) - parse(a)) > timedelta(minutes=MAX_GAP_MIN) and declared_gap != (vid, a, b):
                errors.append(f'{vid} sample gap > {MAX_GAP_MIN} min between {a} and {b}')
                break
        vessel = by['vessels'].get(vid)
        if vessel and (seq[-1]['timestampUtc'] != vessel['lastReportedAtUtc'] or seq[-1]['location'] != vessel['lastKnownPosition']):
            errors.append(vid + ' last position sample does not match vessel lastKnownPosition/lastReportedAtUtc')
    for v in datasets['vessels']:
        if v['vesselId'] not in vessel_samples:
            errors.append(v['vesselId'] + ' has no position samples')

    for c in datasets['portCalls']:
        for f, d, optional in [('portId', 'ports', False), ('vesselId', 'vessels', False), ('voyageId', 'voyages', True), ('terminalId', 'terminals', True), ('berthId', 'berths', True)]:
            ref(c, f, d, c['portCallId'], optional)
        for f in ['arrivalAtUtc', 'waitingSinceUtc', 'estimatedBerthUtc']:
            utc(c.get(f), c['portCallId'] + '/' + f)
        try:
            if c.get('waitingSinceUtc') and c['waitingSinceUtc'] < c['arrivalAtUtc']:
                errors.append(c['portCallId'] + ' waiting begins before arrival')
            if c.get('status') == 'awaiting_berth':
                ship = by['vessels'].get(c.get('vesselId'))
                port = by['ports'].get(c.get('portId'))
                if ship and port:
                    a = ship['lastKnownPosition']
                    b = port['location']
                    if abs(a['lat'] - b['lat']) > 1 or abs(((a['lon'] - b['lon'] + 180) % 360) - 180) > 1:
                        errors.append(c['portCallId'] + ' awaiting vessel geographically remote from port')
        except (KeyError, TypeError):
            pass

    for e in datasets['evidence']:
        ent = e.get('entityRef', {})
        coll = REF_KIND.get(ent.get('kind'))
        if not coll or ent.get('id') not in by[coll]:
            errors.append(e['evidenceId'] + ' invalid entity')
        utc(e.get('observedAtUtc'), e['evidenceId'])
        utc(e.get('receivedAtUtc'), e['evidenceId'])
    for i in datasets['incidents']:
        for f, c in [('vesselId', 'vessels'), ('voyageId', 'voyages'), ('portId', 'ports')]:
            ref(i, f, c, i['incidentId'])
        for er in i.get('entityRefs', []):
            c = REF_KIND.get(er.get('kind'))
            if not c or er.get('id') not in by[c]:
                errors.append(i['incidentId'] + ' invalid entityRef ' + str(er))
        for ev in i.get('evidenceIds', []):
            if ev not in by['evidence']:
                errors.append(i['incidentId'] + ' invalid evidence ID ' + str(ev))
        if i.get('status') not in INCIDENT_STATUS:
            errors.append(i['incidentId'] + ' invalid status ' + str(i.get('status')))
        if i.get('status') != 'open' and not i.get('acknowledgedAtUtc'):
            errors.append(i['incidentId'] + ' progressed without acknowledgedAtUtc')
        if i.get('status') == 'resolved' and not i.get('resolvedAtUtc'):
            errors.append(i['incidentId'] + ' resolved without resolvedAtUtc')
        ref(i, 'ownerUserId', 'users', i['incidentId'], optional=True)
        for f in ['openedAtUtc', 'detectedAtUtc', 'acknowledgedAtUtc', 'resolvedAtUtc']:
            utc(i.get(f), i['incidentId'] + '/' + f)
    for w in datasets['weatherHazards']:
        for r in w.get('affectedRouteIds', []):
            if r not in by['routes']:
                errors.append(w['hazardId'] + ' invalid route ' + r)
        for v in w.get('affectedVoyageIds', []):
            if v not in by['voyages']:
                errors.append(w['hazardId'] + ' invalid voyage ' + v)
            elif by['voyages'][v]['routeId'] not in w.get('affectedRouteIds', []):
                errors.append(f'{w["hazardId"]} affected voyage {v} not on an affected route')
        for k in ['issuedAtUtc', 'validFromUtc', 'validToUtc']:
            utc(w.get(k), w['hazardId'] + '/' + k)
        if w.get('validFromUtc', '') > w.get('validToUtc', ''):
            errors.append(w['hazardId'] + ' validity window inverted')
        for i, p in enumerate(w.get('polygon', [])):
            loc(p, w['hazardId'] + f' polygon {i}')

    last_eta = {}
    for ev in sorted(datasets['events'], key=lambda e: (e.get('occurredAtUtc', ''), e.get('eventId', ''))):
        for k in ['occurredAtUtc', 'ingestedAtUtc']:
            utc(ev.get(k), ev['eventId'] + '/' + k)
        if ev.get('type') not in EVENT_TYPES:
            errors.append(ev['eventId'] + ' unknown event type ' + str(ev.get('type')))
        if not ev.get('quality'):
            errors.append(ev['eventId'] + ' missing quality')
        if replay_start and ev.get('occurredAtUtc') and not (replay_start <= parse(ev['occurredAtUtc']) <= replay_end):
            errors.append(ev['eventId'] + ' outside replay range')
        for er in ev.get('entityRefs', []):
            c = REF_KIND.get(er.get('kind'))
            if not c or er.get('id') not in by[c]:
                errors.append(ev['eventId'] + ' invalid entityRef ' + str(er))
        if ev.get('type') == 'ETA_REVISED':
            last_eta[ev['payload'].get('voyageId')] = ev['payload'].get('newEstimatedArrivalUtc')
    for vid, eta in last_eta.items():
        voyage = by['voyages'].get(vid)
        if voyage and voyage['estimatedArrivalUtc'] != eta:
            errors.append(f'{vid}: latest ETA_REVISED does not match voyage estimatedArrivalUtc')

    # Singapore showcase scenario
    one = by['vessels'].get('VSL-0001')
    voyage = by['voyages'].get('VYG-0001')
    inc = by['incidents'].get('INC-0001')
    if not all([one, voyage, inc]):
        errors.append('missing Singapore demo ID(s)')
    else:
        if one['name'] != 'MV Pacific Horizon' or one['currentVoyageId'] != 'VYG-0001':
            errors.append('vessel scenario mismatch')
        if voyage['originPortId'] != 'PRT-SIN' or voyage['destinationPortId'] != 'PRT-RTM':
            errors.append('voyage scenario mismatch')
        dt = (parse(voyage['estimatedArrivalUtc']) - parse(voyage['plannedArrivalUtc'])).total_seconds() / 3600
        cost = max(dt, 0) / 24 * voyage['dailyDelayCostUsd']
        if dt != 18 or cost != 24000:
            errors.append(f'Singapore economic scenario mismatch {dt}h ${cost}')
        if inc['vesselId'] != 'VSL-0001' or inc['voyageId'] != 'VYG-0001' or inc['status'] != 'open':
            errors.append('incident scenario mismatch')
        anc = by['anchorages'].get('ANC-SIN')
        if not anc or not point_in_polygon(one['lastKnownPosition'], anc['polygon']):
            errors.append('VSL-0001 not inside ANC-SIN demo anchorage polygon')
        samples = vessel_samples.get('VSL-0001', [])
        if not samples or parse(samples[0]['timestampUtc']) > parse('2026-11-09T09:00:00Z'):
            errors.append('VSL-0001 track must cover the 09:00 ETA revision for replay')
        # Fixture v2.0 (D-029): the showcase vessel never moves and never shows a wake.
        if any(s['location'] != {'lon': 103.91, 'lat': 1.18} or s['navStatus'] != 'at_anchor' or (s.get('sogKn') or 0) > 0.5 for s in samples):
            errors.append('VSL-0001 must hold at anchor at 1.18N 103.91E for the whole window')
        scen_events = [e for e in datasets['events'] if any(r.get('id') == 'VSL-0001' for r in e.get('entityRefs', []))]
        if len(scen_events) < 6:
            errors.append('Singapore case needs >= 6 linked events')
        wx = by['weatherHazards'].get('WX-0001')
        if not wx or 'RTE-SIN-RTM' not in wx.get('affectedRouteIds', []):
            errors.append('WX-0001 must intersect RTE-SIN-RTM')
        pcl = by['portCalls'].get('PCL-0001') or {}
        if pcl.get('vesselId') != 'VSL-0001' or pcl.get('waitingSinceUtc') != '2026-11-09T04:00:00Z' or pcl.get('berthId') is not None:
            errors.append('PCL-0001 must queue VSL-0001 since 04:00Z with no berth assigned')
        elif replay_end:
            total_h = (parse(pcl['estimatedBerthUtc']) - parse(pcl['waitingSinceUtc'])).total_seconds() / 3600
            remaining_h = (parse(pcl['estimatedBerthUtc']) - replay_end).total_seconds() / 3600
            if total_h != 34 or remaining_h != 26:
                errors.append(f'PCL-0001 queue interval must be 34 h with 26 h remaining at the anchor (got {total_h}/{remaining_h})')
        e1, e2 = by['events'].get('EVT-0001') or {}, by['events'].get('EVT-0002') or {}
        if e1.get('type') != 'ETA_REVISED' or e1.get('occurredAtUtc') != '2026-11-09T09:00:00Z':
            errors.append('EVT-0001 must be the 09:00 ETA revision')
        if e2.get('type') != 'ANCHORAGE_ENTER' or e2.get('occurredAtUtc') != '2026-11-09T09:15:00Z':
            errors.append('EVT-0002 must be the 09:15 anchorage entry')
        if any(b.get('scheduledVesselId') == 'VSL-0001' for b in datasets['berths']):
            errors.append('VSL-0001 must not hold a berth schedule (estimate only)')
    s47 = by['vessels'].get('VSL-0047')
    if not s47 or s47['vesselType'] != 'LNG carrier' or s47['lastKnownPosition'] != {'lon': 108.056644, 'lat': 3.501864} or s47['sogKn'] != 13.5 \
            or s47['navStatus'] != 'underway' or s47['lastReportedAtUtc'] != '2026-11-09T11:15:00Z':
        errors.append('VSL-0047 must keep the kit fix (LNG carrier, 108.056644E 3.501864N, 13.5 kn, underway at 11:15Z)')
    elif (by['voyages'].get('VYG-0047') or {}).get('routeId') != 'RTE-SIN-MNL':
        errors.append('VYG-0047 must follow RTE-SIN-MNL')
    if len(datasets['events']) != len(by['events']):
        errors.append('event ID uniqueness failed')

    errors += validate_v2(folder / 'v2', by, vessel_samples, manifest)
    w = (manifest.get('v2Module') or {}).get('window') or {}
    try:
        window = (parse(w['minUtc']), parse(w['maxUtc']))
        errors += validate_v3(folder / 'v3', by, manifest, window)
        errors += validate_v3_terminals(folder, by, manifest, window, vessel_samples)
    except KeyError:
        errors.append('manifest.v2Module.window missing; cannot validate the v3 module')

    print('PORTOS fixture integrity:', 'PASS' if not errors else 'FAIL')
    for n, rows in datasets.items():
        print(f'  {n:15s}: {len(rows):>6} records')
    if errors:
        for s in errors[:100]:
            print('ERROR:', s, file=sys.stderr)
        if len(errors) > 100:
            print(f'... additional {len(errors) - 100} errors omitted', file=sys.stderr)
        return 1
    print('Scenario: MV Pacific Horizon +18h, USD 24,000 modeled delay exposure — verified')
    print('V2 module: VSL-0001 holds at anchor, PCL-0001 34 h queue / 26 h remaining, VSL-0047 follow demo keyframes — verified')
    print('V3 module: VSL-0255 800-slot crane unload at BRH-SIN-W-3, VSL-0001 static stow at anchor, single-occupancy transfers, one location per unit per instant, delay exposure formula — verified')
    print('V3 terminals: dry bulk Santos, LNG Dalian, Ro-Ro Southampton; ship types match terminals, exclusive berths, '
          'contiguous rate segments, ship + shore quantities conserved within capacity, alongside fixes at the berth — verified')
    return 0


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', type=Path, default=Path(__file__).resolve().parent.parent / 'sample-data')
    args = p.parse_args()
    raise SystemExit(run(args.dir))
