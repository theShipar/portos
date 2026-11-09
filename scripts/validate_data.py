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
               'INCIDENT_OPENED', 'INCIDENT_ACKNOWLEDGED', 'ACTION_ASSIGNED', 'INCIDENT_RESOLVED', 'PORT_WAIT_UPDATED'}
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
    for vid, seq in vessel_samples.items():
        ts = [s['timestampUtc'] for s in seq]
        if ts != sorted(ts) or len(ts) != len(set(ts)):
            errors.append(vid + ' positions not strictly chronologically sorted')
            continue
        if replay_start and (parse(ts[0]) < replay_start or parse(ts[-1]) > replay_end):
            errors.append(vid + ' positions outside replay range')
        for a, b in zip(ts, ts[1:]):
            if (parse(b) - parse(a)) > timedelta(minutes=MAX_GAP_MIN):
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
        if not any(s['navStatus'] == 'underway' for s in samples):
            errors.append('VSL-0001 track must include the approach (underway) segment')
        scen_events = [e for e in datasets['events'] if any(r.get('id') == 'VSL-0001' for r in e.get('entityRefs', []))]
        if len(scen_events) < 6:
            errors.append('Singapore case needs >= 6 linked events')
        wx = by['weatherHazards'].get('WX-0001')
        if not wx or 'RTE-SIN-RTM' not in wx.get('affectedRouteIds', []):
            errors.append('WX-0001 must intersect RTE-SIN-RTM')
    if len(datasets['events']) != len(by['events']):
        errors.append('event ID uniqueness failed')

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
    return 0


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', type=Path, default=Path(__file__).resolve().parent.parent / 'sample-data')
    args = p.parse_args()
    raise SystemExit(run(args.dir))
