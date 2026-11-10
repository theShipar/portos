#!/usr/bin/env python3
"""Build flat, bounded JSON schemas from normalized PORTOS fixtures. No recursive union nesting."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;SAMPLE=ROOT/'sample-data';OUT=ROOT/'schemas';OUT.mkdir(exist_ok=True)
ID_KEY={'regions':'regionId','ports':'portId','terminals':'terminalId','berths':'berthId','anchorages':'anchorageId','routes':'routeId','vessels':'vesselId','voyages':'voyageId','positions':'positionId','portCalls':'portCallId','incidents':'incidentId','evidence':'evidenceId','weatherHazards':'hazardId','events':'eventId','users':'userId'}

def infer(values,key='',depth=0):
    if depth>10:return {}
    kinds={('null' if v is None else 'boolean' if isinstance(v,bool) else 'integer' if isinstance(v,int) else 'number' if isinstance(v,float) else 'string' if isinstance(v,str) else 'array' if isinstance(v,list) else 'object' if isinstance(v,dict) else 'unknown') for v in values}
    if kinds <= {'integer','number'}:return {'type':'number' if 'number' in kinds else 'integer'}
    if kinds=={'null'}:return {'type':'null'}
    if kinds <= {'string','null'}:
        b={'type':['string','null'] if 'null' in kinds else 'string'}
        if key.endswith('Utc'):b.update({'pattern':r'Z$'})
        return b
    if kinds<= {'integer','number','null'}:return {'type':['number' if 'number' in kinds else 'integer','null']}
    if kinds <= {'boolean','null'}:return {'type':['boolean','null'] if 'null' in kinds else 'boolean'}
    if kinds<= {'object','null'}:
        dicts=[v for v in values if isinstance(v,dict)]
        keys=sorted(set().union(*(set(v.keys()) for v in dicts)))
        props={k:infer([v[k] for v in dicts if k in v],k,depth+1) for k in keys}
        return {'type':['object','null'] if 'null' in kinds else 'object','properties':props,'required':sorted(set.intersection(*(set(v) for v in dicts))) if dicts else [],'additionalProperties':False}
    if kinds <= {'array','null'}:
        arrays=[v for v in values if isinstance(v,list)];children=[v for a in arrays for v in a]
        out={'type':['array','null'] if 'null' in kinds else 'array'}
        if children:out['items']=infer(children,key,depth+1)
        return out
    if kinds <= {'integer','number','string','null'}:return {'type':sorted('number' if k=='integer' else k for k in kinds)}
    return {'description':'Polymorphic scenario event payload','type':sorted(k for k in kinds if k!='unknown')}

for name,idkey in ID_KEY.items():
    rows=json.loads((SAMPLE/(name+'.json')).read_text('utf-8'))
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':f'https://portos.example.invalid/schemas/{name}.schema.json','title':f'PORTOS synthetic {name} collection','description':'Synthetic scenario fixtures. Not live AIS or navigational data.','type':'array','minItems':1,'items':infer(rows)}
    if name=='ports':schema['items']['properties']['countryIso2']={'type':'string','pattern':'^[A-Z]{2}$'}
    if name=='berths':
        bp=schema['items']['properties'];bp['scheduledVesselId']={'type':['string','null']}
        for k in ('scheduledWindowStartUtc','scheduledWindowEndUtc'):bp[k]={'type':['string','null'],'pattern':'Z$'}
    (OUT/(name+'.schema.json')).write_text(json.dumps(schema,indent=2,ensure_ascii=False)+'\n')
manifest={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'PORTOS fixture manifest','type':'object','properties':{'dataset':{'type':'string'},'version':{'type':'string'},'seed':{'type':'integer'},'fixedScenarioTimeUtc':{'type':'string','format':'date-time'},'sourceDisclosure':{'type':'string'},'counts':{'type':'object'},'scenario':{'type':'object'}},'required':['dataset','version','seed','fixedScenarioTimeUtc','counts','scenario'],'additionalProperties':True}
(OUT/'manifest.schema.json').write_text(json.dumps(manifest,indent=2)+'\n')
# V2 scenario module (sample-data/v2): keyframe samples are positional tuples [lon, lat, sogKn, cogDeg|null, navStatus].
V2=['scenario','flagshipTracks','portLayouts','berthSchedule'];(OUT/'v2').mkdir(exist_ok=True)
for name in V2:
    data=json.loads((SAMPLE/'v2'/(name+'.json')).read_text('utf-8'))
    body=infer([data]) if isinstance(data,dict) else {'type':'array','minItems':1,'items':infer(data)}
    if name=='flagshipTracks':
        tup={'type':'array','prefixItems':[{'type':'number','minimum':-180,'maximum':180},{'type':'number','minimum':-90,'maximum':90},{'type':'number','minimum':0},{'type':['integer','null'],'minimum':0,'maximum':359},{'enum':['underway','at_anchor','moored','not_under_command','unknown']}],'items':False,'minItems':5}
        for part in ('history','forecast'):body['items']['properties'][part]['properties']['samples']={'type':'array','items':tup}
    if name=='berthSchedule':
        m=body['items']['properties']['milestones']['items']['properties']
        m['classifier']={'enum':['EST','REQ','PLN','ACT']};m['eventType']={'enum':['ARRIVAL','DEPARTURE']};m['location']={'enum':['BERTH','PBP']}
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':f'https://portos.example.invalid/schemas/v2/{name}.schema.json','title':f'PORTOS V2 scenario {name}','description':'Versioned V2 scenario extension (simulated). Additive to the base fixture; never live data.',**body}
    (OUT/'v2'/(name+'.schema.json')).write_text(json.dumps(schema,indent=2,ensure_ascii=False)+'\n')
print('Generated',len(ID_KEY)+1,'schemas +',len(V2),'V2 schemas')
