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
    return 0


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', type=Path, default=Path(__file__).resolve().parent.parent / 'sample-data')
    args = p.parse_args()
    raise SystemExit(run(args.dir))
