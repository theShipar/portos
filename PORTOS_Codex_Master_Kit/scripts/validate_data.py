#!/usr/bin/env python3
"""PORTOS offline synthetic fixture integrity checks; Python standard library only."""
import json, math, argparse, sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

def run(folder:Path):
    errors=[];datasets={}
    for filename in ['regions','ports','terminals','berths','anchorages','routes','vessels','voyages','positions','portCalls','incidents','evidence','weatherHazards','events','users']:
        try:
            rows=json.loads((folder/(filename+'.json')).read_text('utf-8'))
            if not isinstance(rows,list): raise ValueError('must be a list')
            datasets[filename]=rows
        except Exception as e:errors.append(f'{filename}: {e}');datasets[filename]=[]
    try:manifest=json.loads((folder/'manifest.json').read_text('utf-8'))
    except Exception as e:errors.append('manifest: '+str(e));manifest={'counts':{},'scenario':{}}
    id_fields={'regions':'regionId','ports':'portId','terminals':'terminalId','berths':'berthId','anchorages':'anchorageId','routes':'routeId','vessels':'vesselId','voyages':'voyageId','positions':'positionId','portCalls':'portCallId','incidents':'incidentId','evidence':'evidenceId','weatherHazards':'hazardId','events':'eventId','users':'userId'}
    by={}
    for n,rows in datasets.items():
        fld=id_fields[n];ids=[]
        for j,r in enumerate(rows):
            if not isinstance(r,dict) or not isinstance(r.get(fld),str) or not r[fld]:errors.append(f'{n}[{j}] missing {fld}');continue
            ids.append(r[fld])
        if len(ids)!=len(set(ids)):errors.append(f'{n} duplicate {fld}')
        by[n]={r.get(fld):r for r in rows if isinstance(r,dict) and r.get(fld)}
        if manifest.get('counts',{}).get(n)!=len(rows):errors.append(f'{n}: count mismatch in manifest')
    for n,target in [('vessels',500),('ports',100),('voyages',200),('incidents',50),('positions',6500)]:
        if len(datasets[n])!=target:errors.append(f'{n} expected {target} got {len(datasets[n])}')
    def ref(obj,key,collection,context,optional=False):
        v=obj.get(key)
        if v is None and optional:return
        if v not in by[collection]:errors.append(f'{context} references missing {collection} ID: {key}={v}')
    def utc(v,context):
        if v is None:return
        try:
            if not isinstance(v,str) or not v.endswith('Z'):raise ValueError('not ISO UTC Z')
            datetime.fromisoformat(v.replace('Z','+00:00'))
        except Exception:errors.append(f'{context}: invalid UTC time {v}')
    def loc(p,context):
        if not isinstance(p,dict): errors.append(f'{context}: not a geopoint');return
        if any(not isinstance(p.get(k),(int,float)) for k in ('lon','lat')): errors.append(f'{context}: missing coords');return
        if not(-180<=p['lon']<=180 and -90<=p['lat']<=90):errors.append(f'{context}: coords out of range {p}')
    for p in datasets['ports']:
        loc(p.get('location'),p['portId']);utc(p.get('lastUpdatedUtc'),p['portId'])
    for r in datasets['regions']:loc(r.get('center'),r['regionId'])
    for t in datasets['terminals']:ref(t,'portId','ports',t['terminalId'])
    for b in datasets['berths']:
        ref(b,'portId','ports',b['berthId']);ref(b,'terminalId','terminals',b['berthId']);utc(b.get('lastUpdatedUtc'),b['berthId'])
    for a in datasets['anchorages']:
        ref(a,'portId','ports',a['anchorageId'])
        for i,p in enumerate(a.get('polygon',[])):loc(p,f'{a["anchorageId"]}[{i}]')
    for r in datasets['routes']:
        ref(r,'originPortId','ports',r['routeId']);ref(r,'destinationPortId','ports',r['routeId'])
        if len(r.get('waypoints',[]))<2:errors.append(f'{r["routeId"]}: route needs >=2 waypoints')
        for i,p in enumerate(r.get('waypoints',[])):loc(p,f'{r["routeId"]} waypoint {i}')
    for v in datasets['vessels']:
        ref(v,'currentVoyageId','voyages',v['vesselId'],optional=True)
        loc(v.get('lastKnownPosition'),v['vesselId']);utc(v.get('lastReportedAtUtc'),v['vesselId'])
    for v in datasets['voyages']:
        for f,c in [('vesselId','vessels'),('originPortId','ports'),('destinationPortId','ports'),('routeId','routes')]:ref(v,f,c,v['voyageId'])
        for f in ['plannedArrivalUtc','estimatedArrivalUtc','estimatedAsOfUtc','departedAtUtc']:utc(v.get(f),v['voyageId']+'/'+f)
        r=by['routes'].get(v.get('routeId'))
        if r and (r['originPortId']!=v.get('originPortId') or r['destinationPortId']!=v.get('destinationPortId')):errors.append(v['voyageId']+' route mismatch')
        vessel=by['vessels'].get(v.get('vesselId'))
        if vessel and vessel.get('currentVoyageId')!=v['voyageId']:errors.append(v['voyageId']+' vessel currentVoyage mismatch')
    vessel_time=defaultdict(list)
    for p in datasets['positions']:
        ref(p,'vesselId','vessels',p['positionId']);loc(p.get('location'),p['positionId']);utc(p.get('timestampUtc'),p['positionId'])
        vessel_time[p.get('vesselId')].append(p.get('timestampUtc'))
    for vid,seq in vessel_time.items():
        if seq!=sorted(seq) or len(seq)!=len(set(seq)):errors.append(vid+' positions not strictly chronologically sorted')
    for c in datasets['portCalls']:
        for f,d,optional in [('portId','ports',False),('vesselId','vessels',False),('voyageId','voyages',True),('terminalId','terminals',True),('berthId','berths',True)]:ref(c,f,d,c['portCallId'],optional)
        for f in ['arrivalAtUtc','waitingSinceUtc','estimatedBerthUtc']:utc(c.get(f),c['portCallId']+'/'+f)
        try:
            if c.get('waitingSinceUtc') and c['waitingSinceUtc'] < c['arrivalAtUtc']:
                errors.append(c['portCallId']+' waiting begins before arrival')
            if c.get('status')=='awaiting_berth':
                ship=by['vessels'].get(c.get('vesselId'));port=by['ports'].get(c.get('portId'))
                if ship and port:
                    a=ship['lastKnownPosition'];b=port['location']
                    if abs(a['lat']-b['lat'])>1 or abs(((a['lon']-b['lon']+180)%360)-180)>1:
                        errors.append(c['portCallId']+' awaiting vessel geographically remote from port')
        except (KeyError,TypeError):pass
    for e in datasets['evidence']:
        ent=e.get('entityRef',{});coll={'voyage':'voyages','vessel':'vessels','port':'ports','incident':'incidents'}.get(ent.get('kind'))
        if coll and ent.get('id') not in by[coll]:errors.append(e['evidenceId']+' invalid entity')
        utc(e.get('observedAtUtc'),e['evidenceId']);utc(e.get('receivedAtUtc'),e['evidenceId'])
    for i in datasets['incidents']:
        for f,c in [('vesselId','vessels'),('voyageId','voyages'),('portId','ports')]:ref(i,f,c,i['incidentId'])
        for ev in i.get('evidenceIds',[]):
            if ev not in by['evidence']:errors.append(i['incidentId']+' invalid evidence ID '+str(ev))
        ref(i,'ownerUserId','users',i['incidentId'],optional=True);utc(i.get('openedAtUtc'),i['incidentId'])
    for w in datasets['weatherHazards']:
        for r in w.get('affectedRouteIds',[]):
            if r not in by['routes']:errors.append(w['hazardId']+' invalid route '+r)
        for k in ['issuedAtUtc','validFromUtc','validToUtc']:utc(w.get(k),w['hazardId']+'/'+k)
        for i,p in enumerate(w.get('polygon',[])):loc(p,w['hazardId']+f' polygon {i}')
    for ev in datasets['events']:
        for k in ['occurredAtUtc','ingestedAtUtc']:utc(ev.get(k),ev['eventId']+'/'+k)
        for er in ev.get('entityRefs',[]):
            c={'vessel':'vessels','voyage':'voyages','port':'ports','incident':'incidents','weather':'weatherHazards','route':'routes'}.get(er.get('kind'))
            if not c or er.get('id') not in by[c]:errors.append(ev['eventId']+' invalid entityRef '+str(er))
    one=by['vessels'].get('VSL-0001');voyage=by['voyages'].get('VYG-0001');inc=by['incidents'].get('INC-0001')
    if not all([one,voyage,inc]):errors.append('missing Singapore demo ID(s)')
    else:
        if one['name']!='MV Pacific Horizon' or one['currentVoyageId']!='VYG-0001':errors.append('vessel scenario mismatch')
        if voyage['originPortId']!='PRT-SIN' or voyage['destinationPortId']!='PRT-RTM':errors.append('voyage scenario mismatch')
        dt=(datetime.fromisoformat(voyage['estimatedArrivalUtc'].replace('Z','+00:00'))-datetime.fromisoformat(voyage['plannedArrivalUtc'].replace('Z','+00:00'))).total_seconds()/3600
        cost=max(dt,0)/24*voyage['dailyDelayCostUsd']
        if dt!=18 or cost!=24000:errors.append(f'Singapore economic scenario mismatch {dt}h ${cost}')
        if inc['vesselId']!='VSL-0001' or inc['voyageId']!='VYG-0001':errors.append('incident scenario mismatch')
    if len(datasets['events'])!=len(by['events']):errors.append('event ID uniqueness failed')
    print('PORTOS fixture integrity:', 'PASS' if not errors else 'FAIL')
    for n,rows in datasets.items():print(f'  {n:15s}: {len(rows):>5} records')
    if errors:
        for s in errors[:100]:print('ERROR:',s,file=sys.stderr)
        if len(errors)>100:print(f'... additional {len(errors)-100} errors omitted',file=sys.stderr)
        return 1
    print('Scenario: MV Pacific Horizon +18h, USD 24,000 modeled delay exposure — verified')
    return 0

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dir',type=Path,default=Path(__file__).resolve().parent.parent/'sample-data');args=p.parse_args()
    raise SystemExit(run(args.dir))
