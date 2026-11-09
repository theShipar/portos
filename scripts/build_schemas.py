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
    (OUT/(name+'.schema.json')).write_text(json.dumps(schema,indent=2,ensure_ascii=False)+'\n')
manifest={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'PORTOS fixture manifest','type':'object','properties':{'dataset':{'type':'string'},'version':{'type':'string'},'seed':{'type':'integer'},'fixedScenarioTimeUtc':{'type':'string','format':'date-time'},'sourceDisclosure':{'type':'string'},'counts':{'type':'object'},'scenario':{'type':'object'}},'required':['dataset','version','seed','fixedScenarioTimeUtc','counts','scenario'],'additionalProperties':True}
(OUT/'manifest.schema.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Generated',len(ID_KEY)+1,'schemas')
