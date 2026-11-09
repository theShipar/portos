#!/usr/bin/env python3
"""PORTOS deterministic OFFLINE demo data generator. Fictitious operational figures; not for navigation.
Original map skill is separately licensed GPL-3.0-or-later and is not redistributed in this kit.
"""
import argparse, json, random, math
from datetime import datetime,timedelta,timezone
from pathlib import Path

UTC=timezone.utc
ANCHOR=datetime(2026,11,9,12,tzinfo=UTC)
iso=lambda d: d.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00','Z')

def point(lon,lat): return {'lon':round(lon,6),'lat':round(lat,6)}

def interpolate(a,b,t):
    delta=((b['lon']-a['lon']+180)%360)-180
    lon=((a['lon']+delta*t+180)%360)-180
    return point(lon, a['lat']+(b['lat']-a['lat'])*t)

def path_at(waypoints,progress):
    # Conceptual projection for prototype; precise nautical routing requires licensed hydrographic data.
    if not waypoints:return point(0,0)
    u=max(0,min(0.99999,progress))*(len(waypoints)-1)
    i=min(len(waypoints)-2,int(u));return interpolate(waypoints[i],waypoints[i+1],u-i)

# Names and approximate port centers ONLY. NOT terminal / anchorage / navigation geometry.
PORT_ROWS='''
PRT-SIN|Singapore|SG|103.83|1.27|Asia/Singapore
PRT-RTM|Rotterdam|NL|4.48|51.92|Europe/Amsterdam
PRT-SHA|Shanghai|CN|121.49|31.23|Asia/Shanghai
PRT-SZX|Shenzhen|CN|114.12|22.53|Asia/Shanghai
PRT-NGB|Ningbo|CN|121.56|29.88|Asia/Shanghai
PRT-BUS|Busan|KR|129.04|35.10|Asia/Seoul
PRT-HKG|Hong Kong|HK|114.17|22.30|Asia/Hong_Kong
PRT-JEA|Jebel Ali|AE|55.07|24.99|Asia/Dubai
PRT-LAX|Los Angeles|US|-118.27|33.73|America/Los_Angeles
PRT-LGB|Long Beach|US|-118.19|33.75|America/Los_Angeles
PRT-NYC|New York New Jersey|US|-74.05|40.67|America/New_York
PRT-HAM|Hamburg|DE|9.96|53.54|Europe/Berlin
PRT-ANR|Antwerp|BE|4.40|51.26|Europe/Brussels
PRT-VLC|Valencia|ES|-0.32|39.44|Europe/Madrid
PRT-ALG|Algeciras|ES|-5.45|36.13|Europe/Madrid
PRT-FLX|Felixstowe|GB|1.35|51.96|Europe/London
PRT-SOU|Southampton|GB|-1.40|50.90|Europe/London
PRT-LHV|Le Havre|FR|0.12|49.49|Europe/Paris
PRT-MRS|Marseille|FR|5.36|43.30|Europe/Paris
PRT-PIR|Piraeus|GR|23.63|37.94|Europe/Athens
PRT-IST|Istanbul|TR|28.97|41.01|Europe/Istanbul
PRT-GOA|Genoa|IT|8.92|44.40|Europe/Rome
PRT-BCN|Barcelona|ES|2.16|41.35|Europe/Madrid
PRT-ALX|Alexandria|EG|29.88|31.20|Africa/Cairo
PRT-PSD|Port Said|EG|32.31|31.26|Africa/Cairo
PRT-DUR|Durban|ZA|31.03|-29.87|Africa/Johannesburg
PRT-CPT|Cape Town|ZA|18.44|-33.92|Africa/Johannesburg
PRT-LAG|Lagos|NG|3.39|6.45|Africa/Lagos
PRT-MBA|Mombasa|KE|39.66|-4.06|Africa/Nairobi
PRT-DJB|Djibouti|DJ|43.14|11.59|Africa/Djibouti
PRT-CMB|Colombo|LK|79.85|6.94|Asia/Colombo
PRT-MUM|Mumbai|IN|72.85|18.94|Asia/Kolkata
PRT-MAA|Chennai|IN|80.30|13.09|Asia/Kolkata
PRT-MUN|Mundra|IN|69.70|22.74|Asia/Kolkata
PRT-KHI|Karachi|PK|67.01|24.85|Asia/Karachi
PRT-CGP|Chattogram|BD|91.82|22.32|Asia/Dhaka
PRT-RGN|Yangon|MM|96.17|16.78|Asia/Yangon
PRT-BKK|Bangkok|TH|100.57|13.70|Asia/Bangkok
PRT-LCH|Laem Chabang|TH|100.88|13.09|Asia/Bangkok
PRT-PKG|Port Klang|MY|101.36|3.00|Asia/Kuala_Lumpur
PRT-TPP|Tanjung Pelepas|MY|103.55|1.36|Asia/Kuala_Lumpur
PRT-JKT|Jakarta|ID|106.88|-6.11|Asia/Jakarta
PRT-SBY|Surabaya|ID|112.73|-7.21|Asia/Jakarta
PRT-MNL|Manila|PH|120.96|14.59|Asia/Manila
PRT-HCM|Ho Chi Minh City|VN|106.75|10.79|Asia/Ho_Chi_Minh
PRT-HPH|Haiphong|VN|106.70|20.85|Asia/Ho_Chi_Minh
PRT-TAO|Qingdao|CN|120.38|36.07|Asia/Shanghai
PRT-TSN|Tianjin|CN|117.74|38.98|Asia/Shanghai
PRT-DLC|Dalian|CN|121.62|38.91|Asia/Shanghai
PRT-XMN|Xiamen|CN|118.08|24.48|Asia/Shanghai
PRT-KHH|Kaohsiung|TW|120.28|22.62|Asia/Taipei
PRT-TYO|Tokyo|JP|139.77|35.61|Asia/Tokyo
PRT-YOK|Yokohama|JP|139.64|35.45|Asia/Tokyo
PRT-UKB|Kobe|JP|135.18|34.69|Asia/Tokyo
PRT-OSA|Osaka|JP|135.43|34.65|Asia/Tokyo
PRT-NGO|Nagoya|JP|136.88|35.09|Asia/Tokyo
PRT-MEL|Melbourne|AU|144.92|-37.84|Australia/Melbourne
PRT-SYD|Sydney|AU|151.20|-33.86|Australia/Sydney
PRT-BNE|Brisbane|AU|153.03|-27.38|Australia/Brisbane
PRT-FRE|Fremantle|AU|115.75|-32.05|Australia/Perth
PRT-AKL|Auckland|NZ|174.77|-36.84|Pacific/Auckland
PRT-TRG|Tauranga|NZ|176.17|-37.66|Pacific/Auckland
PRT-WLG|Wellington|NZ|174.78|-41.27|Pacific/Auckland
PRT-YVR|Vancouver|CA|-123.11|49.30|America/Vancouver
PRT-PRR|Prince Rupert|CA|-130.32|54.31|America/Vancouver
PRT-SEA|Seattle|US|-122.35|47.60|America/Los_Angeles
PRT-TAC|Tacoma|US|-122.44|47.26|America/Los_Angeles
PRT-OAK|Oakland|US|-122.31|37.80|America/Los_Angeles
PRT-SFO|San Francisco|US|-122.40|37.79|America/Los_Angeles
PRT-HOU|Houston|US|-95.28|29.73|America/Chicago
PRT-MSY|New Orleans|US|-90.06|29.96|America/Chicago
PRT-MIA|Miami|US|-80.18|25.76|America/New_York
PRT-SAV|Savannah|US|-81.09|32.08|America/New_York
PRT-CHS|Charleston|US|-79.94|32.78|America/New_York
PRT-ORF|Norfolk|US|-76.30|36.85|America/New_York
PRT-BAL|Baltimore|US|-76.60|39.27|America/New_York
PRT-HFX|Halifax|CA|-63.57|44.65|America/Halifax
PRT-YMQ|Montreal|CA|-73.54|45.51|America/Toronto
PRT-SSZ|Santos|BR|-46.33|-23.94|America/Sao_Paulo
PRT-RIO|Rio de Janeiro|BR|-43.18|-22.91|America/Sao_Paulo
PRT-BUE|Buenos Aires|AR|-58.36|-34.59|America/Argentina/Buenos_Aires
PRT-MVD|Montevideo|UY|-56.21|-34.90|America/Montevideo
PRT-VAP|Valparaiso|CL|-71.62|-33.04|America/Santiago
PRT-SAI|San Antonio Chile|CL|-71.61|-33.59|America/Santiago
PRT-CLL|Callao|PE|-77.15|-12.04|America/Lima
PRT-GYE|Guayaquil|EC|-79.92|-2.22|America/Guayaquil
PRT-CTG|Cartagena|CO|-75.53|10.39|America/Bogota
PRT-BALB|Balboa|PA|-79.57|8.95|America/Panama
PRT-CRB|Cristobal|PA|-79.91|9.35|America/Panama
PRT-KIN|Kingston|JM|-76.79|17.97|America/Jamaica
PRT-VER|Veracruz|MX|-96.14|19.19|America/Mexico_City
PRT-MAN|Manzanillo Mexico|MX|-104.32|19.06|America/Mexico_City
PRT-ENS|Ensenada|MX|-116.62|31.86|America/Tijuana
PRT-LZC|Lazaro Cardenas|MX|-102.18|17.96|America/Mexico_City
PRT-COL|Colon|PA|-79.90|9.36|America/Panama
PRT-TNG|Tangier Med|MA|-5.50|35.88|Africa/Casablanca
PRT-CAS|Casablanca|MA|-7.61|33.61|Africa/Casablanca
PRT-ABJ|Abidjan|CI|-4.01|5.31|Africa/Abidjan
PRT-TEM|Tema|GH|0.01|5.63|Africa/Accra
PRT-LAD|Luanda|AO|13.23|-8.82|Africa/Luanda
PRT-DAR|Dar es Salaam|TZ|39.30|-6.82|Africa/Dar_es_Salaam
PRT-MPM|Maputo|MZ|32.58|-25.97|Africa/Maputo
PRT-RCB|Richards Bay|ZA|32.06|-28.78|Africa/Johannesburg
PRT-SUE|Suez|EG|32.55|29.95|Africa/Cairo
PRT-AQJ|Aqaba|JO|35.00|29.52|Asia/Amman
PRT-SLL|Salalah|OM|54.08|16.95|Asia/Muscat
PRT-DOH|Doha|QA|51.53|25.29|Asia/Qatar
PRT-DMM|Dammam|SA|50.10|26.43|Asia/Riyadh
PRT-JUB|Jubail|SA|49.65|27.00|Asia/Riyadh
PRT-SOH|Sohar|OM|56.75|24.34|Asia/Muscat
PRT-FUJ|Fujairah|AE|56.35|25.14|Asia/Dubai
PRT-KWI|Kuwait|KW|47.98|29.38|Asia/Kuwait
'''.strip().splitlines()

# Selected conceptual maritime corridors; waypoints are illustrative and NOT navigational.
CORRIDORS=[
('RTE-SIN-RTM','PRT-SIN','PRT-RTM','Asia–Europe via Suez',[(103.83,1.27),(100.0,3.0),(94.0,6.2),(84.0,7.0),(76.0,9.0),(67.0,12.0),(58.0,12.0),(45.0,12.5),(43.0,13.2),(38.0,18.0),(33.0,27.0),(32.3,31.2),(28.0,34.2),(21.0,35.5),(12.0,37.0),(3.0,37.0),(-5.5,36.1),(-9.0,40.0),(-5.0,49.5),(2.0,51.3),(4.48,51.92)]),
('RTE-SHA-SIN','PRT-SHA','PRT-SIN','East Asia–Singapore',[(121.49,31.23),(122.0,28.0),(120.0,24.0),(116.0,18.0),(111.0,12.0),(106.0,5.0),(103.83,1.27)]),
('RTE-SIN-JEA','PRT-SIN','PRT-JEA','Singapore–Gulf',[(103.83,1.27),(98.0,4.5),(90.0,6.0),(80.0,8.0),(72.0,12.0),(65.0,16.0),(59.0,22.0),(55.07,24.99)]),
('RTE-SIN-CPT','PRT-SIN','PRT-CPT','Singapore–Cape',[(103.83,1.27),(98.0,-2.0),(89.0,-8.0),(78.0,-13.0),(60.0,-18.0),(43.0,-23.0),(32.0,-28.0),(20.0,-35.0),(18.44,-33.92)]),
('RTE-LAX-SHA','PRT-LAX','PRT-SHA','Trans-Pacific', [(-118.27,33.73),(-130.0,33.0),(-150.0,35.0),(-170.0,38.0),(173.0,40.0),(160.0,40.0),(145.0,37.0),(130.0,33.0),(121.49,31.23)]),
('RTE-RTM-NYC','PRT-RTM','PRT-NYC','North Atlantic',[(4.48,51.92),(1.0,51.0),(-9.0,50.0),(-25.0,49.0),(-45.0,45.0),(-62.0,42.0),(-74.05,40.67)]),
('RTE-HAM-SIN','PRT-HAM','PRT-SIN','Europe–Asia via Suez',[(9.96,53.54),(3.0,51.0),(-7.0,45.0),(-5.5,36.2),(4.0,37.0),(22.0,35.0),(32.3,31.2),(39.0,19.0),(45.0,12.5),(60.0,12.0),(80.0,8.0),(94.0,5.0),(103.83,1.27)]),
('RTE-MUM-SIN','PRT-MUM','PRT-SIN','India–Southeast Asia',[(72.85,18.94),(75.0,15.0),(80.0,10.0),(88.0,7.0),(95.0,5.0),(103.83,1.27)]),
('RTE-BUS-LAX','PRT-BUS','PRT-LAX','Korea–US West Coast',[(129.04,35.10),(138.0,37.0),(150.0,39.0),(168.0,40.0),(-175.0,42.0),(-150.0,42.0),(-130.0,37.0),(-118.27,33.73)]),
('RTE-MEL-SIN','PRT-MEL','PRT-SIN','Australia–Singapore',[(144.92,-37.84),(145.0,-34.0),(139.0,-25.0),(129.0,-16.0),(116.0,-10.0),(105.0,-4.0),(103.83,1.27)]),
('RTE-SIN-MNL','PRT-SIN','PRT-MNL','Singapore–Philippines',[(103.83,1.27),(109.0,4.0),(115.0,8.0),(119.0,11.0),(120.96,14.59)]),
('RTE-ALG-VLC','PRT-ALG','PRT-VLC','Western Mediterranean', [(-5.45,36.13),(-3.0,36.5),(-0.32,39.44)])
]
REGION_ROWS=[
('REG-SEA','Southeast Asia','maritime-region',75,-13,142,26,110,7),
('REG-EAS','East Asia','maritime-region',103,15,155,52,128,33),
('REG-IO','Indian Ocean','maritime-region',34,-41,110,27,75,-6),
('REG-MED','Mediterranean','maritime-region',-8,28,38,46,18,37),
('REG-NS','North Sea','maritime-region',-12,48,18,61,3,54),
('REG-ATL','Atlantic Ocean','maritime-region',-85,-48,15,58,-35,8),
('REG-PAC','Pacific Ocean','maritime-region',120,-45,-110,60,-165,12),
('REG-GULF','Arabian Gulf','maritime-region',42,17,62,33,51,25),
]

def dist_km(a,b):
    r=6371.0; a1,a2=math.radians(a['lat']),math.radians(b['lat'])
    dlat=a2-a1;dlon=math.radians(((b['lon']-a['lon']+180)%360)-180)
    x=math.sin(dlat/2)**2+math.cos(a1)*math.cos(a2)*math.sin(dlon/2)**2
    return r*2*math.asin(min(1,math.sqrt(x)))

def route_nm(waypoints):return round(sum(dist_km(a,b)/1.852 for a,b in zip(waypoints,waypoints[1:])),1)

def zone_polygon(lon,lat,rad=0.16):
    return [point(lon+rad*math.cos(math.pi*2*i/12),lat+rad*math.sin(math.pi*2*i/12)) for i in range(12)]

def gen(seed=92026):
    rng=random.Random(seed)
    ports=[]
    for row in PORT_ROWS[:100]:
        pid,name,country,lon,lat,tz=row.strip().split('|')
        ports.append({'portId':pid,'name':name,'countryIso2':country,'location':point(float(lon),float(lat)),'timeZone':tz,'regionId':'REG-SEA' if country in ['SG','MY','TH','ID','VN','PH','MM'] else 'REG-EAS' if country in ['CN','TW','JP','KR','HK'] else 'REG-MED' if country in ['ES','IT','GR','TR','EG'] else 'REG-NS' if country in ['NL','DE','GB','BE','FR'] else 'REG-IO' if country in ['IN','LK','PK','BD','ZA','AU'] else 'REG-ATL' if country in ['US','CA','BR','AR','UY','CL','PE','CO','EC','PA','JM','MX','MA','NG','GH','CI','AO'] else 'REG-GULF','sourceType':'approximate-demo-centroid','syntheticOperationalData':True,'lastUpdatedUtc':iso(ANCHOR-timedelta(minutes=rng.randint(1,90)))})
    assert len(ports)==100,len(ports)
    port_map={p['portId']:p for p in ports}
    regions=[]
    for rid,name,kind,lon1,lat1,lon2,lat2,clon,clat in REGION_ROWS:
        regions.append({'regionId':rid,'name':name,'kind':kind,'bounds':{'west':lon1,'south':lat1,'east':lon2,'north':lat2},'center':point(clon,clat),'sourceType':'conceptual-bounds'})
    terminals=[];berths=[];anchorages=[]
    for p in ports:
        termid='TRM-'+p['portId'][4:]
        terminals.append({'terminalId':termid,'portId':p['portId'],'name':p['name']+' Demo Terminal','sourceType':'synthetic-layout'})
        for b in range(1,3):
            berths.append({'berthId':f'BRH-{p["portId"][4:]}-{b}','portId':p['portId'],'terminalId':termid,'status':rng.choice(['occupied','scheduled','free','unknown']),'lastUpdatedUtc':iso(ANCHOR-timedelta(minutes=rng.randint(1,45))),'sourceType':'synthetic-layout'})
        l=p['location']
        anchorages.append({'anchorageId':'ANC-'+p['portId'][4:],'portId':p['portId'],'name':p['name']+' Demo Anchorage','polygon':zone_polygon(l['lon']+0.14,l['lat']-0.12),'sourceType':'synthetic-not-for-navigation'})
    routes=[]
    for rid,orig,dest,corridor,co in CORRIDORS:
        w=[point(a,b) for a,b in co]
        routes.append({'routeId':rid,'originPortId':orig,'destinationPortId':dest,'corridorId':corridor.lower().replace(' ','-'),'corridorName':corridor,'waypoints':w,'distanceNmEstimate':route_nm(w),'sourceType':'conceptual-synthetic-not-for-navigation'})
    # Ensure first route and vessel are always the anchored Singapore story.
    vessels=[];voyages=[];positions=[];portcalls=[];events=[];incidents=[];evidence=[];weather=[]
    vessel_types=['Container ship','Bulk carrier','Oil tanker','LNG carrier','General cargo','RoRo']
    prefix=['Pacific','Ocean','Northern','Blue','Silver','Atlas','Horizon','Meridian','Coastal','Emerald','Evergreen','Seabright','Arctic','Coral','Harbor','Cobalt','Eastern','Southern','Amber','Voyager']
    suffix=['Explorer','Pioneer','Crest','Navigator','Spirit','Fortune','Promise','Orion','Dawn','Enterprise','Bridge','Harrier','Alliance','Star','Guardian','Merchant','Voyage','Odyssey']
    for i in range(1,501):
        vid=f'VSL-{i:04d}';typ='Container ship' if i==1 else rng.choice(vessel_types)
        name='MV Pacific Horizon' if i==1 else f'MV {prefix[(i*7)%len(prefix)]} {suffix[(i*11)%len(suffix)]} {i:03d}'
        has_voyage=i<=200
        route=routes[(i-1)%len(routes)] if has_voyage else None
        st='at_anchor' if i==1 or (201<=i<=240) else 'underway' if has_voyage else rng.choice(['moored','at_anchor','underway','unknown'])
        voyage_id=f'VYG-{i:04d}' if has_voyage else None
        if i==1:
            current_progress=0.0
            loc=point(103.91,1.18)
        elif 201<=i<=240:
            loc=point(103.90+rng.uniform(-0.065,0.065),1.17+rng.uniform(-0.055,0.055))
        elif route:
            current_progress=rng.uniform(.07,.87)
            loc=path_at(route['waypoints'],current_progress)
        else:
            home=ports[(i*13)%len(ports)]['location']
            loc=point(home['lon']+rng.uniform(-0.12,0.12),home['lat']+rng.uniform(-0.12,0.12))
        sog=0.1 if st=='at_anchor' else 0.0 if st=='moored' else round(rng.uniform(9,20),1) if st=='underway' else None
        last_report=ANCHOR-timedelta(minutes=0 if i==1 else rng.randint(0,75))
        vessel={'vesselId':vid,'name':name,'vesselType':typ,'flagCountryIso2':rng.choice(['SG','NL','GB','PA','MH','LR','HK','GR']),'lengthMeters':rng.randint(120,365),'beamMeters':rng.randint(20,60),'navStatus':st,'currentVoyageId':voyage_id,'lastKnownPosition':loc,'sogKn':sog,'cogDeg':rng.randint(0,359) if st=='underway' else None,'lastReportedAtUtc':iso(last_report),'sourceType':'synthetic-track'}
        vessels.append(vessel)
        if has_voyage:
            planned=ANCHOR+timedelta(days=rng.randint(1,19),hours=rng.randint(0,23))
            shift=18 if i==1 else rng.choice([-3,-1,0,0,0,1,2,4,6,12,18,22,31])
            if i==1:planned=datetime(2026,11,28,8,tzinfo=UTC)
            rate=32000 if i==1 else rng.choice([18000,22000,26000,32000,42000,54000])
            voyages.append({'voyageId':voyage_id,'vesselId':vid,'originPortId':route['originPortId'],'destinationPortId':route['destinationPortId'],'routeId':route['routeId'],'departedAtUtc':iso(ANCHOR-timedelta(days=rng.randint(1,4))),'plannedArrivalUtc':iso(planned),'estimatedArrivalUtc':iso(planned+timedelta(hours=shift)),'estimatedAsOfUtc':iso(ANCHOR-timedelta(minutes=rng.randint(0,20))),'etaConfidence':'medium' if shift else 'high','dailyDelayCostUsd':rate,'currentStage':'awaiting_departure' if i==1 else 'in_transit','sourceType':'synthetic-scenario'})
        # Time samples end at the actual per-vessel lastReport time, never beyond it.
        for t in range(13):
            ts=last_report-timedelta(minutes=5*(12-t))
            if i==1:pos=loc
            elif st in ['at_anchor','moored','unknown']:pos=loc
            elif route:
                prog=min(.99,max(.01,current_progress + ((t-12)*5/60) * (float(sog or 0) / max(1.0,route['distanceNmEstimate']))))
                pos=path_at(route['waypoints'],prog)
            else:pos=point(loc['lon']+(t-12)*.001,loc['lat']+(t-12)*.0001)
            positions.append({'positionId':f'POS-{i:04d}-{t:02d}','vesselId':vid,'timestampUtc':iso(ts),'location':pos,'sogKn':sog,'cogDeg':vessel['cogDeg'],'navStatus':st,'sourceType':'synthetic-track'})
    assert len(vessels)==500 and len(voyages)==200
    for i,v in enumerate(vessels[:240]):
        port_id='PRT-SIN' if i==0 or 200<=i<240 else voyages[i]['originPortId'] if i<200 else ports[(i*13)%100]['portId']
        arrived_at=ANCHOR-timedelta(hours=8 if i==0 else 4+i%17) if i==0 or i>=200 else ANCHOR+timedelta(hours=i%25)
        waiting_at=arrived_at if i==0 else max(arrived_at,ANCHOR-timedelta(hours=(i%13)+1)) if i>=200 else None
        pcall={'portCallId':f'PCL-{i+1:04d}','portId':port_id,'vesselId':v['vesselId'],'voyageId':v['currentVoyageId'],'arrivalAtUtc':iso(arrived_at),'waitingSinceUtc':iso(waiting_at) if waiting_at else None,'estimatedBerthUtc':iso(ANCHOR+timedelta(hours=26)) if i==0 else iso(ANCHOR+timedelta(hours=i%40+1)),'status':'awaiting_berth' if i==0 or i>=200 else 'scheduled','terminalId':'TRM-'+port_id[4:],'berthId':None,'sourceType':'synthetic-port-event'}
        portcalls.append(pcall)
    for i in range(1,51):
        incid=f'INC-{i:04d}';vi=1 if i==1 else i+1;vid=f'VSL-{vi:04d}';voy=f'VYG-{vi:04d}'
        port_id='PRT-SIN' if i==1 else voyages[vi-1]['destinationPortId']
        eid=f'EVD-{i:04d}'
        evidence.append({'evidenceId':eid,'sourceType':'synthetic-scenario','sourceId':f'EVT-{i:04d}','observedAtUtc':iso(ANCHOR-timedelta(hours=2)),'receivedAtUtc':iso(ANCHOR-timedelta(hours=1,minutes=50)),'entityRef':{'kind':'voyage','id':voy},'field':'estimatedArrivalUtc','value':voyages[vi-1]['estimatedArrivalUtc'],'unit':None,'quality':'synthetic'})
        incidents.append({'incidentId':incid,'vesselId':vid,'voyageId':voy,'portId':port_id,'category':'port_congestion' if i==1 else rng.choice(['schedule_variance','weather_exposure','port_delay','data_quality']),'severity':'high' if i==1 else rng.choice(['medium','medium','high','critical']),'status':'open','openedAtUtc':iso(ANCHOR-timedelta(hours=1,minutes=i%50)),'ownerUserId':None,'evidenceIds':[eid],'scenarioId':'SCENARIO_SINGAPORE_CONGESTION' if i==1 else 'SCENARIO_GENERAL_DISRUPTION','sourceType':'synthetic-incident'})
    for i in range(15):
        rid=routes[i%len(routes)]
        wp=rid['waypoints'][min(4,len(rid['waypoints'])-2)]
        lon=wp['lon'];lat=wp['lat'];delta=3.5 if i==0 else 2.3
        weather.append({'hazardId':f'WX-{i+1:04d}','type':rng.choice(['high_waves','high_wind','storm_warning','poor_visibility']),'severity':'high' if i==0 else rng.choice(['moderate','high','severe']),'polygon':[point(lon-delta,lat-delta),point(lon+delta,lat-delta),point(lon+delta,lat+delta),point(lon-delta,lat+delta)],'issuedAtUtc':iso(ANCHOR-timedelta(hours=6)),'validFromUtc':iso(ANCHOR-timedelta(hours=1)),'validToUtc':iso(ANCHOR+timedelta(hours=24)),'affectedRouteIds':[rid['routeId']],'sourceType':'synthetic-forecast','confidence':'medium'})
    # Replay contains coherent Singapore case progression, historic source events and general alerts.
    scenario=[
        ('ETA_REVISED',ANCHOR-timedelta(hours=3),{'voyageId':'VYG-0001','previousEtaShiftHours':8,'newEtaShiftHours':18}),
        ('ANCHORAGE_ENTER',ANCHOR-timedelta(hours=2,minutes=45),{'portId':'PRT-SIN','vesselId':'VSL-0001'}),
        ('WEATHER_WARNING_ISSUED',ANCHOR-timedelta(hours=2,minutes=20),{'hazardId':'WX-0001'}),
        ('INCIDENT_OPENED',ANCHOR-timedelta(hours=1,minutes=1),{'incidentId':'INC-0001'}),
        ('PORT_WAIT_UPDATED',ANCHOR-timedelta(minutes=38),{'portId':'PRT-SIN','waitingEstimateHours':26}),
        ('AIS_REPORT',ANCHOR-timedelta(minutes=5),{'vesselId':'VSL-0001','location':point(103.91,1.18)}),
    ]
    for i,(typ,at,payload) in enumerate(scenario,1):
        events.append({'eventId':f'EVT-{i:04d}','type':typ,'occurredAtUtc':iso(at),'ingestedAtUtc':iso(at+timedelta(minutes=3)),'entityRefs':[{'kind':'vessel','id':'VSL-0001'},{'kind':'voyage','id':'VYG-0001'},{'kind':'port','id':'PRT-SIN'}],'payload':payload,'sourceType':'synthetic-event'})
    for i in range(7,251):
        vi=2+(i%199)
        at=ANCHOR-timedelta(minutes=rng.randint(5,360))
        events.append({'eventId':f'EVT-{i:04d}','type':rng.choice(['AIS_REPORT','ETA_REVISED','PORT_WAIT_UPDATED','INCIDENT_OPENED']),'occurredAtUtc':iso(at),'ingestedAtUtc':iso(at+timedelta(minutes=2)),'entityRefs':[{'kind':'vessel','id':f'VSL-{vi:04d}'},{'kind':'voyage','id':f'VYG-{vi:04d}'}],'payload':{'reason':'synthetic scheduled event'},'sourceType':'synthetic-event'})
    events.sort(key=lambda x:(x['occurredAtUtc'],x['eventId']))
    users=[{'userId':f'USR-{i:03d}','displayName':n,'role':role,'organizationId':'ORG-DEMO-01','sourceType':'fictional-demo-user'} for i,(n,role) in enumerate([('Avery Morgan','manager'),('Jordan Lee','dispatcher'),('Mina Rahman','analyst'),('Sam Ellis','viewer'),('Taylor Cruz','dispatcher')],1)]
    data={'regions.json':regions,'ports.json':ports,'terminals.json':terminals,'berths.json':berths,'anchorages.json':anchorages,'routes.json':routes,'vessels.json':vessels,'voyages.json':voyages,'positions.json':positions,'portCalls.json':portcalls,'incidents.json':incidents,'evidence.json':evidence,'weatherHazards.json':weather,'events.json':events,'users.json':users}
    return data

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--seed',type=int,default=92026)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'sample-data')
    args=parser.parse_args();out=args.output;out.mkdir(parents=True,exist_ok=True)
    datasets=gen(args.seed)
    for name,rows in datasets.items():
        (out/name).write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest={'dataset':'PORTOS Synthetic Maritime Operations Demo','version':'1.0.0','seed':args.seed,'fixedScenarioTimeUtc':iso(ANCHOR),'sourceDisclosure':'Illustrative simulation, not live AIS, port, weather or nautical navigation data','counts':{name.replace('.json',''):len(rows) for name,rows in datasets.items()},'scenario':{'vesselId':'VSL-0001','vesselName':'MV Pacific Horizon','voyageId':'VYG-0001','incidentId':'INC-0001','portId':'PRT-SIN','destinationPortId':'PRT-RTM','etaShiftHours':18,'dailyDelayCostUsd':32000,'expectedEstimatedExposureUsd':24000}}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Generated',len(datasets),'datasets:',manifest['counts'])
if __name__=='__main__': main()
