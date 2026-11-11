#!/usr/bin/env python3
"""PORTOS deterministic OFFLINE demo data generator. Fictitious operational figures; not for navigation.

Derived from the PORTOS Codex Master Kit generator (seed 92026). Changes are logged in docs/DECISIONS.md:
12h replay window, water-only corridor waypoints, region registry fields, extended event vocabulary,
coherent Singapore scenario timeline, computed weather/voyage intersections.

Fixture v2.0 (D-029): the Singapore case is realigned to the original kit (VSL-0001 holds at anchor, PCL-0001 queue
since 04:00 with no berth), VSL-0047 is restored as the kit's LNG carrier, and a separate versioned V2 scenario module
(sample-data/v2/) adds flagship movement keyframes, port twin layouts and DCSA-style berth milestones.
"""
import argparse, json, random, math
from datetime import datetime, timedelta, timezone
from pathlib import Path

UTC = timezone.utc
ANCHOR = datetime(2026, 11, 9, 12, tzinfo=UTC)
REPLAY_START = datetime(2026, 11, 9, 0, tzinfo=UTC)
FIXTURE_VERSION = '2.0.0'
SCENARIO_VERSION = '2.0'
V2_MIN = datetime(2026, 11, 5, 12, tzinfo=UTC)
V2_MAX = datetime(2026, 11, 12, 12, tzinfo=UTC)
# Kit facts preserved by fixture v2.0 (PORTOS_V2 spec 21).
VSL1_HOLD = (103.91, 1.18)
VSL1_QUEUE_SINCE = datetime(2026, 11, 9, 4, 0, tzinfo=UTC)
VSL47_FIX = (108.056644, 3.501864)
VSL47_FIX_AT = datetime(2026, 11, 9, 11, 15, tzinfo=UTC)
VSL47_SOG = 13.5
# Phase V2-6 demo: one AIS reporting outage (samples removed, nothing interpolated) for the "position unverified" path.
GAP_VESSEL = 59
GAP_FROM = datetime(2026, 11, 9, 5, 15, tzinfo=UTC)
GAP_TO = datetime(2026, 11, 9, 8, 15, tzinfo=UTC)
FLAGSHIP_COUNT = 30
iso = lambda d: d.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z')


def point(lon, lat):
    return {'lon': round(lon, 6), 'lat': round(lat, 6)}


def norm_lon(lon):
    return ((lon + 180) % 360) - 180


def interpolate(a, b, t):
    delta = norm_lon(b['lon'] - a['lon'])
    return point(norm_lon(a['lon'] + delta * t), a['lat'] + (b['lat'] - a['lat']) * t)


def dist_nm(a, b):
    r = 6371.0
    a1, a2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat = a2 - a1
    dlon = math.radians(norm_lon(b['lon'] - a['lon']))
    x = math.sin(dlat / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.asin(min(1, math.sqrt(x))) / 1.852


def route_nm(waypoints):
    return round(sum(dist_nm(a, b) for a, b in zip(waypoints, waypoints[1:])), 1)


def path_at(waypoints, progress):
    """Distance-weighted position along conceptual waypoints (not navigational)."""
    progress = max(0.0, min(1.0, progress))
    legs = [dist_nm(a, b) for a, b in zip(waypoints, waypoints[1:])]
    total = sum(legs)
    target = progress * total
    for i, leg in enumerate(legs):
        if target <= leg or i == len(legs) - 1:
            return interpolate(waypoints[i], waypoints[i + 1], 0 if leg == 0 else min(1, target / leg))
        target -= leg
    return waypoints[-1]


def progress_of_waypoint(waypoints, wp):
    """Progress (0–1, distance-weighted like path_at) at which the path passes exactly through waypoint `wp`."""
    legs = [dist_nm(a, b) for a, b in zip(waypoints, waypoints[1:])]
    k = next(j for j, w in enumerate(waypoints) if w == wp)
    return sum(legs[:k]) / sum(legs)


def bearing_deg(a, b):
    la1, la2 = math.radians(a['lat']), math.radians(b['lat'])
    dl = math.radians(norm_lon(b['lon'] - a['lon']))
    y = math.sin(dl) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl)
    return round((math.degrees(math.atan2(y, x)) + 360) % 360)


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


# Names and approximate port centers ONLY. NOT terminal / anchorage / navigation geometry.
PORT_ROWS = '''
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
'''.strip().splitlines()

# Conceptual maritime corridors. Waypoints were reviewed to stay in open water or at port nodes;
# they are illustrative and NOT navigational.
MALACCA_WEST = [(103.83, 1.27), (103.45, 1.12), (102.2, 1.95), (101.0, 2.75), (99.6, 3.9), (97.8, 5.6)]
CORRIDORS = [
    ('RTE-SIN-RTM', 'PRT-SIN', 'PRT-RTM', 'Asia–Europe via Suez', MALACCA_WEST + [(94.5, 6.3), (88.0, 6.0), (81.0, 5.4), (76.0, 8.6), (67.0, 12.0), (58.0, 13.0), (51.0, 12.6), (45.5, 12.3), (43.4, 12.6), (41.5, 14.6), (39.6, 18.5), (37.5, 22.5), (35.2, 26.2), (33.8, 27.7), (32.6, 29.7), (32.35, 30.6), (32.3, 31.4), (28.0, 33.9), (21.0, 35.2), (12.0, 37.0), (3.0, 37.6), (-2.0, 36.4), (-5.5, 35.95), (-10.0, 37.0), (-10.0, 40.0), (-9.6, 43.6), (-5.4, 48.6), (-2.0, 49.9), (1.6, 51.0), (3.3, 51.8), (4.05, 51.98), (4.48, 51.92)]),
    ('RTE-SIN-RTM-CAPE', 'PRT-SIN', 'PRT-RTM', 'Asia–Europe via Cape of Good Hope (scenario)', MALACCA_WEST + [(95.0, 5.4), (93.0, 1.0), (88.0, -8.0), (78.0, -14.0), (60.0, -22.0), (45.0, -30.0), (33.5, -31.0), (25.0, -35.2), (19.0, -35.6), (15.0, -33.0), (10.0, -25.0), (2.0, -8.0), (-12.0, 4.0), (-19.5, 12.0), (-20.0, 25.0), (-15.0, 36.0), (-11.0, 44.0), (-5.4, 48.6), (-2.0, 49.9), (1.6, 51.0), (3.3, 51.8), (4.05, 51.98), (4.48, 51.92)]),
    ('RTE-SHA-SIN', 'PRT-SHA', 'PRT-SIN', 'East Asia–Singapore', [(121.49, 31.23), (122.4, 30.6), (122.0, 28.0), (119.8, 24.4), (117.5, 21.5), (113.5, 15.0), (109.5, 8.0), (105.5, 3.0), (104.4, 1.33), (104.0, 1.24), (103.83, 1.27)]),
    ('RTE-SIN-JEA', 'PRT-SIN', 'PRT-JEA', 'Singapore–Gulf', MALACCA_WEST + [(94.5, 6.3), (88.0, 6.0), (81.0, 5.4), (75.0, 9.0), (66.0, 16.0), (60.6, 22.7), (58.2, 24.6), (56.7, 26.4), (55.6, 25.9), (55.07, 24.99)]),
    ('RTE-SIN-CPT', 'PRT-SIN', 'PRT-CPT', 'Singapore–Cape', MALACCA_WEST + [(95.0, 5.4), (93.0, 1.0), (88.0, -8.0), (78.0, -14.0), (60.0, -22.0), (45.0, -30.0), (33.5, -31.0), (25.0, -35.2), (19.0, -35.6), (18.2, -34.2), (18.44, -33.92)]),
    ('RTE-LAX-SHA', 'PRT-LAX', 'PRT-SHA', 'Trans-Pacific', [(-118.27, 33.73), (-119.5, 33.3), (-130.0, 33.0), (-150.0, 35.0), (-170.0, 38.0), (173.0, 39.0), (160.0, 37.0), (145.0, 34.0), (136.0, 32.5), (130.5, 30.5), (125.0, 30.8), (122.4, 30.8), (121.49, 31.23)]),
    ('RTE-RTM-NYC', 'PRT-RTM', 'PRT-NYC', 'North Atlantic', [(4.48, 51.92), (4.05, 51.98), (3.3, 51.8), (1.6, 51.0), (-2.0, 49.9), (-6.0, 49.3), (-25.0, 47.5), (-45.0, 43.5), (-62.0, 41.0), (-72.5, 40.2), (-74.05, 40.67)]),
    ('RTE-HAM-SIN', 'PRT-HAM', 'PRT-SIN', 'Europe–Asia via Suez', [(9.96, 53.54), (8.6, 53.95), (7.0, 54.0), (4.0, 52.6), (1.6, 51.0), (-2.0, 49.9), (-5.4, 48.6), (-9.6, 43.6), (-10.0, 37.0), (-5.5, 35.95), (-2.0, 36.4), (3.0, 37.6), (12.0, 37.0), (21.0, 35.2), (28.0, 33.9), (32.3, 31.4), (32.35, 30.6), (32.6, 29.7), (33.8, 27.7), (35.2, 26.2), (37.5, 22.5), (39.6, 18.5), (41.5, 14.6), (43.4, 12.6), (45.5, 12.3), (51.0, 12.6), (58.0, 13.0), (67.0, 12.0), (76.0, 8.6), (81.0, 5.4), (88.0, 6.0), (94.5, 6.3), (97.8, 5.6), (99.6, 3.9), (101.0, 2.75), (102.2, 1.95), (103.45, 1.12), (103.83, 1.27)]),
    ('RTE-MUM-SIN', 'PRT-MUM', 'PRT-SIN', 'India–Southeast Asia', [(72.85, 18.94), (72.2, 17.5), (73.5, 13.0), (75.5, 8.5), (78.5, 6.2), (81.0, 5.4), (88.0, 6.0), (94.5, 6.3), (97.8, 5.6), (99.6, 3.9), (101.0, 2.75), (102.2, 1.95), (103.45, 1.12), (103.83, 1.27)]),
    ('RTE-BUS-LAX', 'PRT-BUS', 'PRT-LAX', 'Korea–US West Coast', [(129.04, 35.10), (129.4, 34.6), (131.0, 33.3), (133.5, 32.4), (136.0, 33.0), (140.5, 34.5), (150.0, 38.5), (168.0, 41.0), (-175.0, 42.0), (-150.0, 41.0), (-130.0, 36.0), (-119.5, 33.3), (-118.27, 33.73)]),
    ('RTE-MEL-SIN', 'PRT-MEL', 'PRT-SIN', 'Australia–Singapore', [(144.92, -37.84), (144.7, -38.3), (143.0, -39.4), (136.0, -36.6), (125.0, -35.2), (115.0, -35.4), (113.5, -30.0), (112.5, -22.0), (110.0, -12.0), (105.9, -6.8), (106.0, -5.0), (105.8, -3.0), (106.6, -1.5), (105.0, 0.5), (104.4, 1.2), (104.0, 1.24), (103.83, 1.27)]),
    # Passes through the kit's VSL-0047 fix (108.056644E 3.501864N), south of the Natuna islands.
    ('RTE-SIN-MNL', 'PRT-SIN', 'PRT-MNL', 'Singapore–Philippines', [(103.83, 1.27), (104.0, 1.24), (104.4, 1.33), (105.6, 2.2), VSL47_FIX, (109.6, 4.3), (114.5, 8.6), (118.6, 11.4), (119.8, 13.6), (120.55, 14.35), (120.96, 14.59)]),
    ('RTE-ALG-VLC', 'PRT-ALG', 'PRT-VLC', 'Western Mediterranean', [(-5.45, 36.13), (-5.2, 36.05), (-3.0, 36.4), (-0.5, 37.5), (0.4, 38.8), (-0.32, 39.44)]),
]

# Operational regions (not sovereign boundaries). countryIso3 lists drive region-group highlighting.
REGIONS = [
    ('REG-SEA', 'Southeast Asia', (92, -11, 128, 22), (108, 5), ['SGP', 'MYS', 'IDN', 'THA', 'VNM', 'PHL', 'MMR', 'KHM', 'LAO', 'BRN', 'TLS'], {'distance': 210, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-EAS', 'East Asia', (105, 18, 146, 45), (125, 31), ['CHN', 'TWN', 'JPN', 'KOR', 'PRK', 'HKG', 'MAC'], {'distance': 220, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-IO', 'Indian Ocean', (40, -35, 100, 25), (72, -2), ['IND', 'LKA', 'PAK', 'BGD', 'MDV', 'KEN', 'TZA', 'MOZ', 'MDG', 'SOM'], {'distance': 260, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-GULF', 'Arabian Gulf & Red Sea', (32, 10, 62, 31), (47, 21), ['ARE', 'SAU', 'QAT', 'OMN', 'KWT', 'BHR', 'IRN', 'JOR', 'DJI', 'YEM', 'ERI'], {'distance': 200, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-MED', 'Mediterranean', (-8, 29, 37, 47), (16, 38), ['ESP', 'ITA', 'GRC', 'TUR', 'EGY', 'MAR', 'TUN', 'DZA', 'LBY', 'FRA', 'HRV', 'CYP', 'MLT', 'ISR', 'LBN'], {'distance': 210, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-NEU', 'North Europe', (-12, 47, 16, 61), (3, 53), ['NLD', 'DEU', 'GBR', 'BEL', 'FRA', 'DNK', 'NOR', 'IRL'], {'distance': 190, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-NAP', 'North America Pacific', (-135, 15, -100, 58), (-120, 37), ['USA', 'CAN', 'MEX'], {'distance': 230, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-NAA', 'North America Atlantic', (-100, 15, -55, 50), (-78, 33), ['USA', 'CAN', 'CUB', 'BHS'], {'distance': 230, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-LAT', 'Latin America', (-92, -45, -30, 20), (-65, -12), ['BRA', 'ARG', 'URY', 'CHL', 'PER', 'ECU', 'COL', 'PAN', 'JAM', 'MEX', 'VEN', 'CRI'], {'distance': 270, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-WAF', 'West & Southern Africa', (-25, -36, 20, 37), (-2, 4), ['NGA', 'GHA', 'CIV', 'AGO', 'MAR', 'ZAF', 'SEN', 'CMR', 'NAM'], {'distance': 260, 'headingDeg': 0, 'pitchDeg': 0}),
    ('REG-OCE', 'Oceania', (110, -48, -178, -8), (150, -30), ['AUS', 'NZL', 'PNG', 'FJI'], {'distance': 260, 'headingDeg': 0, 'pitchDeg': 0}),
]

COUNTRY_REGION = {
    'SG': 'REG-SEA', 'MY': 'REG-SEA', 'TH': 'REG-SEA', 'ID': 'REG-SEA', 'VN': 'REG-SEA', 'PH': 'REG-SEA', 'MM': 'REG-SEA',
    'CN': 'REG-EAS', 'TW': 'REG-EAS', 'JP': 'REG-EAS', 'KR': 'REG-EAS', 'HK': 'REG-EAS',
    'IN': 'REG-IO', 'LK': 'REG-IO', 'PK': 'REG-IO', 'BD': 'REG-IO', 'KE': 'REG-IO', 'TZ': 'REG-IO', 'MZ': 'REG-IO',
    'AE': 'REG-GULF', 'SA': 'REG-GULF', 'QA': 'REG-GULF', 'OM': 'REG-GULF', 'KW': 'REG-GULF', 'JO': 'REG-GULF', 'DJ': 'REG-GULF',
    'ES': 'REG-MED', 'IT': 'REG-MED', 'GR': 'REG-MED', 'TR': 'REG-MED', 'EG': 'REG-MED',
    'NL': 'REG-NEU', 'DE': 'REG-NEU', 'GB': 'REG-NEU', 'BE': 'REG-NEU',
    'BR': 'REG-LAT', 'AR': 'REG-LAT', 'UY': 'REG-LAT', 'CL': 'REG-LAT', 'PE': 'REG-LAT', 'EC': 'REG-LAT', 'CO': 'REG-LAT', 'PA': 'REG-LAT', 'JM': 'REG-LAT',
    'NG': 'REG-WAF', 'GH': 'REG-WAF', 'CI': 'REG-WAF', 'AO': 'REG-WAF',
    'AU': 'REG-OCE', 'NZ': 'REG-OCE',
}
PORT_REGION_OVERRIDE = {
    'PRT-MRS': 'REG-MED', 'PRT-LHV': 'REG-NEU', 'PRT-TNG': 'REG-MED', 'PRT-CAS': 'REG-WAF',
    'PRT-CPT': 'REG-WAF', 'PRT-DUR': 'REG-IO', 'PRT-VER': 'REG-LAT', 'PRT-MAN': 'REG-NAP', 'PRT-ENS': 'REG-NAP', 'PRT-LZC': 'REG-NAP',
}

# Singapore showcase geometry: approximate demonstrator positions in open water of the Singapore Strait
# (Eastern anchorage area) and terminal frontage. Not official hydrographic data.
SIN_ANCHORAGE = [(103.875, 1.228), (104.025, 1.226), (104.03, 1.262), (103.985, 1.282), (103.9, 1.284), (103.872, 1.262)]
# Published ANC-SIN polygon: the core above plus a southern lobe containing the kit's VSL-0001 holding position.
# Anchorage vessels are still sampled inside the core so the seeded sequence (and every later record) is unchanged.
SIN_ANCHORAGE_V2 = [(103.872, 1.262), (103.875, 1.228), (103.885, 1.165), (103.96, 1.163), (104.0, 1.2), (104.025, 1.226), (104.03, 1.262), (103.985, 1.282), (103.9, 1.284)]
# Second, illustrative anchorage for the port twin (no vessels assigned in the fixture).
SIN_WEST_ANCHORAGE = [(103.66, 1.205), (103.735, 1.2), (103.745, 1.228), (103.69, 1.236), (103.655, 1.226)]
SIN_TERMINALS = [
    ('TRM-SIN-W', 'Singapore Demo Terminal West', (103.762, 1.272), [(103.752, 1.276), (103.758, 1.274), (103.764, 1.272), (103.770, 1.270)]),
    ('TRM-SIN-C', 'Singapore Demo Terminal Central', (103.834, 1.262), [(103.828, 1.263), (103.834, 1.261), (103.840, 1.259)]),
    ('TRM-SIN-E', 'Singapore Demo Terminal East', (103.853, 1.262), [(103.848, 1.262), (103.853, 1.261), (103.858, 1.260)]),
]

def anchorage_polygon(lon, lat, rad=0.07):
    return [point(lon + rad * math.cos(math.pi * 2 * i / 10), lat + rad * 0.8 * math.sin(math.pi * 2 * i / 10)) for i in range(10)]


def sample_times(last_report, interval_min):
    out = []
    t = last_report
    while t >= REPLAY_START:
        out.append(t)
        t -= timedelta(minutes=interval_min)
    return list(reversed(out))


def gen(seed=92026):
    rng = random.Random(seed)

    # ---------------- ports / regions ----------------
    ports = []
    for row in PORT_ROWS[:100]:
        pid, name, country, lon, lat, tz = row.strip().split('|')
        lon, lat = float(lon), float(lat)
        region = PORT_REGION_OVERRIDE.get(pid) or COUNTRY_REGION.get(country)
        if region is None and country in ('US', 'CA'):
            region = 'REG-NAP' if lon < -100 else 'REG-NAA'
        if region is None and country == 'MX':
            region = 'REG-NAP' if lon < -100 else 'REG-LAT'
        ports.append({'portId': pid, 'name': name, 'countryIso2': country, 'location': point(lon, lat), 'timeZone': tz,
                      'regionId': region, 'terminalIds': [], 'sourceType': 'approximate-demo-centroid',
                      'syntheticOperationalData': True, 'lastUpdatedUtc': iso(ANCHOR - timedelta(minutes=rng.randint(1, 90)))})
    assert len(ports) == 100 and all(p['regionId'] for p in ports)
    port_map = {p['portId']: p for p in ports}

    regions = []
    for rid, name, (w, s, e, n), (clon, clat), iso3, preset in REGIONS:
        regions.append({'regionId': rid, 'name': name, 'kind': 'maritime-region',
                        'bounds': {'west': w, 'south': s, 'east': e, 'north': n}, 'center': point(clon, clat),
                        'countryIso3': iso3, 'portIds': sorted(p['portId'] for p in ports if p['regionId'] == rid),
                        'cameraPreset': preset, 'sourceType': 'conceptual-bounds'})

    # ---------------- terminals / berths / anchorages ----------------
    terminals, berths, anchorages = [], [], []
    for p in ports:
        l = p['location']
        if p['portId'] == 'PRT-SIN':
            for tid, tname, (tlon, tlat), bpts in SIN_TERMINALS:
                bids = []
                for bi, (blon, blat) in enumerate(bpts, 1):
                    bid = f'BRH-{tid[4:]}-{bi}'
                    bids.append(bid)
                    berths.append({'berthId': bid, 'portId': 'PRT-SIN', 'terminalId': tid, 'name': f'{tname.split()[-1]} Berth {bi}',
                                   'location': point(blon, blat), 'status': 'occupied', 'occupiedByVesselId': None,
                                   'scheduledVesselId': None, 'scheduledWindowStartUtc': None, 'scheduledWindowEndUtc': None,
                                   'lastUpdatedUtc': iso(ANCHOR - timedelta(minutes=rng.randint(4, 40))), 'sourceType': 'synthetic-layout'})
                terminals.append({'terminalId': tid, 'portId': 'PRT-SIN', 'name': tname, 'location': point(tlon, tlat), 'berthIds': bids, 'sourceType': 'synthetic-layout'})
                p['terminalIds'].append(tid)
            anchorages.append({'anchorageId': 'ANC-SIN', 'portId': 'PRT-SIN', 'name': 'Singapore Eastern Demo Anchorage',
                               'polygon': [point(a, b) for a, b in SIN_ANCHORAGE_V2], 'capacityEstimate': 45, 'sourceType': 'synthetic-not-for-navigation'})
            continue
        tid = 'TRM-' + p['portId'][4:]
        bids = []
        for b in range(1, 3):
            bid = f'BRH-{p["portId"][4:]}-{b}'
            bids.append(bid)
            berths.append({'berthId': bid, 'portId': p['portId'], 'terminalId': tid, 'name': f'Berth {b}',
                           'location': point(l['lon'] + 0.01 * b, l['lat'] + 0.005), 'status': rng.choice(['occupied', 'scheduled', 'free', 'unknown']),
                           'occupiedByVesselId': None, 'scheduledVesselId': None, 'scheduledWindowStartUtc': None, 'scheduledWindowEndUtc': None,
                           'lastUpdatedUtc': iso(ANCHOR - timedelta(minutes=rng.randint(1, 45))), 'sourceType': 'synthetic-layout'})
        terminals.append({'terminalId': tid, 'portId': p['portId'], 'name': p['name'] + ' Demo Terminal', 'location': point(l['lon'] + 0.015, l['lat'] + 0.005), 'berthIds': bids, 'sourceType': 'synthetic-layout'})
        p['terminalIds'].append(tid)
        anchorages.append({'anchorageId': 'ANC-' + p['portId'][4:], 'portId': p['portId'], 'name': p['name'] + ' Demo Anchorage',
                           'polygon': anchorage_polygon(l['lon'] + 0.14, l['lat'] - 0.12), 'capacityEstimate': None, 'sourceType': 'synthetic-not-for-navigation'})
    berth_map = {b['berthId']: b for b in berths}
    berth_map['BRH-SIN-C-3']['status'] = 'unavailable'
    berth_map['BRH-SIN-E-3']['status'] = 'unknown'

    # ---------------- routes ----------------
    routes = []
    for rid, orig, dest, corridor, co in CORRIDORS:
        w = [point(a, b) for a, b in co]
        routes.append({'routeId': rid, 'originPortId': orig, 'destinationPortId': dest,
                       'corridorId': corridor.lower().split(' (')[0].replace(' ', '-'), 'corridorName': corridor, 'waypoints': w,
                       'distanceNmEstimate': route_nm(w), 'isScenarioAlternative': rid.endswith('-CAPE'),
                       'provenance': 'synthetic', 'sourceType': 'conceptual-synthetic-not-for-navigation'})
    route_map = {r['routeId']: r for r in routes}
    voyage_routes = [r for r in routes if not r['isScenarioAlternative']]

    # ---------------- vessels / voyages / positions ----------------
    vessels, voyages, positions = [], [], []
    vessel_types = ['Container ship', 'Bulk carrier', 'Oil tanker', 'LNG carrier', 'General cargo', 'RoRo']
    prefix = ['Pacific', 'Ocean', 'Northern', 'Blue', 'Silver', 'Atlas', 'Horizon', 'Meridian', 'Coastal', 'Emerald', 'Evergreen', 'Seabright', 'Arctic', 'Coral', 'Harbor', 'Cobalt', 'Eastern', 'Southern', 'Amber', 'Voyager']
    suffix = ['Explorer', 'Pioneer', 'Crest', 'Navigator', 'Spirit', 'Fortune', 'Promise', 'Orion', 'Dawn', 'Enterprise', 'Bridge', 'Harrier', 'Alliance', 'Star', 'Guardian', 'Merchant', 'Voyage', 'Odyssey']
    class_dims = {'Container ship': (220, 366, 32, 51), 'Bulk carrier': (180, 300, 30, 50), 'Oil tanker': (180, 333, 32, 60),
                  'LNG carrier': (250, 345, 42, 55), 'General cargo': (110, 190, 18, 30), 'RoRo': (150, 230, 26, 34)}
    sin_berths_moored = [b for b in berths if b['portId'] == 'PRT-SIN' and b['status'] == 'occupied']
    voyage_kinematics = {}

    for i in range(1, 501):
        vid = f'VSL-{i:04d}'
        typ = 'Container ship' if i == 1 else rng.choice(vessel_types)
        if i == 47:
            typ = 'LNG carrier'
        name = 'MV Pacific Horizon' if i == 1 else f'MV {prefix[(i * 7) % len(prefix)]} {suffix[(i * 11) % len(suffix)]} {i:03d}'
        lmin, lmax, bmin, bmax = class_dims[typ]
        length, beam = (229, 32) if i == 1 else (rng.randint(lmin, lmax), rng.randint(bmin, bmax))
        has_voyage = i <= 200
        route = voyage_routes[(i - 1) % len(voyage_routes)] if has_voyage else None
        voyage_id = f'VYG-{i:04d}' if has_voyage else None
        last_report = ANCHOR - timedelta(minutes=0 if i <= 1 else rng.choice([0, 2, 5, 8, 12, 15, 20, 25, 35, 50, 75, 95]))
        if i == 47:
            last_report = VSL47_FIX_AT
        cog = None

        if i == 1:
            # Kit fact: MV Pacific Horizon holds at anchor for the whole window (no approach leg, no wake).
            st, sog = 'at_anchor', 0.1
            loc = point(*VSL1_HOLD)
            samples = [(ts, loc, 0.1, None, 'at_anchor') for ts in sample_times(last_report, 5)]
        elif 201 <= i <= 240:
            st, sog = 'at_anchor', 0.1
            while True:
                loc = point(rng.uniform(103.885, 104.02), rng.uniform(1.232, 1.278))
                if point_in_polygon(loc, [point(a, b) for a, b in SIN_ANCHORAGE]):
                    break
            samples = [(ts, loc, 0.1, None, 'at_anchor') for ts in sample_times(last_report, 15)]
        elif 241 <= i <= 252:
            # Inbound to Singapore within the next 24h (scheduled port calls, no voyage record).
            st = 'underway'
            sog = round(rng.uniform(10, 15), 1)
            approach_routes = [[(108.5, 5.5), (105.5, 3.0), (104.4, 1.33), (104.1, 1.27)],
                               [(98.5, 4.8), (101.0, 2.75), (102.2, 1.95), (103.45, 1.12)],
                               [(106.6, -1.5), (105.0, 0.5), (104.4, 1.2), (104.1, 1.25)]]
            ar = [point(a, b) for a, b in approach_routes[i % 3]]
            total = route_nm(ar)
            p_last = rng.uniform(0.35, 0.8)
            samples = []
            for ts in sample_times(last_report, 30):
                prog = max(0, p_last - ((last_report - ts).total_seconds() / 3600) * sog / total)
                pos = path_at(ar, prog)
                samples.append((ts, pos, sog, bearing_deg(pos, path_at(ar, min(1, prog + 0.02))), 'underway'))
            loc = samples[-1][1]
            cog = samples[-1][3]
        elif 253 <= i <= 252 + len(sin_berths_moored):
            st, sog = 'moored', 0.0
            b = sin_berths_moored[i - 253]
            loc = b['location']
            samples = [(ts, loc, 0.0, None, 'moored') for ts in sample_times(last_report, 30)]
        elif route:
            st = 'underway'
            sog = round(rng.uniform(11, 19), 1)
            p_last = rng.uniform(0.07, 0.87)
            total = route['distanceNmEstimate']
            if i == 47:
                sog = VSL47_SOG
                p_last = progress_of_waypoint(route['waypoints'], point(*VSL47_FIX))
            samples = []
            for ts in sample_times(last_report, 30):
                prog = max(0.0, p_last - ((last_report - ts).total_seconds() / 3600) * sog / total)
                pos = path_at(route['waypoints'], prog)
                samples.append((ts, pos, sog, bearing_deg(pos, path_at(route['waypoints'], min(1, prog + 0.004))), 'underway'))
            loc = samples[-1][1]
            cog = samples[-1][3]
            voyage_kinematics[voyage_id] = {'progressAtLastReport': p_last, 'sogKn': sog, 'lastReport': last_report, 'route': route}
        else:
            st = rng.choice(['moored', 'at_anchor', 'underway', 'unknown'])
            home = ports[(i * 13) % len(ports)]['location']
            base = point(home['lon'] + 0.12 + rng.uniform(-0.05, 0.05), home['lat'] - 0.1 + rng.uniform(-0.05, 0.05))
            sog = 0.1 if st == 'at_anchor' else 0.0 if st == 'moored' else round(rng.uniform(6, 12), 1) if st == 'underway' else None
            heading = rng.randint(0, 359)
            samples = []
            times = sample_times(last_report, 30)
            for k, ts in enumerate(times):
                if st == 'underway':
                    back_h = (last_report - ts).total_seconds() / 3600
                    d_deg = back_h * sog / 60.0
                    pos = point(base['lon'] - d_deg * math.sin(math.radians(heading)) / max(0.2, math.cos(math.radians(base['lat']))),
                                base['lat'] - d_deg * math.cos(math.radians(heading)))
                    samples.append((ts, pos, sog, heading, st))
                else:
                    samples.append((ts, base, sog, None, st))
            loc = samples[-1][1]
            cog = heading if st == 'underway' else None

        if i == 1:
            cog = None
        if i == GAP_VESSEL:
            samples = [smp for smp in samples if not (GAP_FROM < smp[0] < GAP_TO)]
        vessel = {'vesselId': vid, 'name': name, 'vesselType': typ, 'imoDemo': f'DEMO{9100000 + i * 37:07d}',
                  'flagCountryIso2': 'MH' if i == 1 else rng.choice(['SG', 'NL', 'GB', 'PA', 'MH', 'LR', 'HK', 'GR']),
                  'lengthMeters': length, 'beamMeters': beam, 'draughtMeters': round(beam * 0.29, 1),
                  'navStatus': st, 'currentVoyageId': voyage_id, 'lastKnownPosition': loc,
                  'sogKn': sog, 'cogDeg': cog, 'lastReportedAtUtc': iso(last_report),
                  'fleet': 'own' if i <= 260 else 'ambient', 'sourceType': 'synthetic-track'}
        vessels.append(vessel)
        for k, (ts, pos, s, c, ns) in enumerate(samples):
            positions.append({'positionId': f'POS-{i:04d}-{k:03d}', 'vesselId': vid, 'timestampUtc': iso(ts), 'location': pos,
                              'sogKn': s, 'cogDeg': c, 'navStatus': ns, 'sourceType': 'synthetic-track'})

        if has_voyage:
            if i == 1:
                planned = datetime(2026, 11, 28, 8, tzinfo=UTC)
                shift, rate = 18, 32000
            else:
                planned = ANCHOR + timedelta(days=rng.randint(1, 19), hours=rng.randint(0, 23))
                shift = rng.choice([-3, -1, 0, 0, 0, 1, 2, 4, 6, 12, 18, 22, 31])
                rate = rng.choice([18000, 22000, 26000, 32000, 42000, 54000])
            kin = voyage_kinematics.get(voyage_id)
            if i == 1:
                departed, stage = None, 'awaiting_berth'
                planned_dep, est_dep = datetime(2026, 11, 10, 14, tzinfo=UTC), datetime(2026, 11, 11, 8, tzinfo=UTC)
                progress, remaining = 0.0, route['distanceNmEstimate']
            else:
                elapsed_h = kin['progressAtLastReport'] * route['distanceNmEstimate'] / kin['sogKn']
                departed = kin['lastReport'] - timedelta(hours=elapsed_h)
                stage, planned_dep, est_dep = 'in_transit', departed, departed
                progress = round(kin['progressAtLastReport'], 4)
                remaining = round((1 - progress) * route['distanceNmEstimate'], 1)
            voyages.append({'voyageId': voyage_id, 'vesselId': vid, 'originPortId': route['originPortId'], 'destinationPortId': route['destinationPortId'],
                            'routeId': route['routeId'], 'plannedDepartureUtc': iso(planned_dep), 'estimatedDepartureUtc': iso(est_dep),
                            'departedAtUtc': iso(departed) if departed else None,
                            'plannedArrivalUtc': iso(planned), 'estimatedArrivalUtc': iso(planned + timedelta(hours=shift)),
                            'estimatedAsOfUtc': iso(datetime(2026, 11, 9, 11, 42, tzinfo=UTC) if i == 1 else ANCHOR - timedelta(minutes=rng.randint(0, 20))),
                            'etaConfidence': 'medium' if shift else 'high', 'dailyDelayCostUsd': rate,
                            'routeProgressAsOf': progress, 'remainingNmAsOf': remaining,
                            'currentStage': stage, 'sourceType': 'synthetic-scenario'})
    assert len(vessels) == 500 and len(voyages) == 200
    vessel_map = {v['vesselId']: v for v in vessels}
    voyage_map = {v['voyageId']: v for v in voyages}

    # Moored vessels at Singapore berths. The showcase vessel has no berth assignment (kit fact): only an estimate.
    for k, b in enumerate(sin_berths_moored):
        b['occupiedByVesselId'] = f'VSL-{253 + k:04d}'

    # Flagship vessels get dense V2 movement keyframes; their voyage ETA follows the same kinematic model so the
    # follow demo (VSL-0047) reaches its destination when the inspector says it will.
    flagship = flagship_vessels(voyage_kinematics)
    for vid in flagship:
        vo = voyage_map[f'VYG-{vid[4:]}']
        kin = voyage_kinematics[vo['voyageId']]
        remaining_h = (1 - kin['progressAtLastReport']) * kin['route']['distanceNmEstimate'] / kin['sogKn']
        est = (kin['lastReport'] + timedelta(hours=remaining_h)).replace(second=0, microsecond=0)
        est = est.replace(minute=0) + timedelta(hours=1 if est.minute >= 30 else 0)
        planned = datetime.fromisoformat(vo['plannedArrivalUtc'].replace('Z', '+00:00'))
        shift = datetime.fromisoformat(vo['estimatedArrivalUtc'].replace('Z', '+00:00')) - planned
        vo['estimatedArrivalUtc'] = iso(est)
        vo['plannedArrivalUtc'] = iso(est - shift)

    # ---------------- port calls ----------------
    portcalls = []
    pcl = 0

    def add_call(**kw):
        nonlocal pcl
        pcl += 1
        rec = {'portCallId': f'PCL-{pcl:04d}', 'portId': kw['portId'], 'vesselId': kw['vesselId'], 'voyageId': kw.get('voyageId'),
               'arrivalAtUtc': kw['arrivalAtUtc'], 'waitingSinceUtc': kw.get('waitingSinceUtc'), 'estimatedBerthUtc': kw.get('estimatedBerthUtc'),
               'status': kw['status'], 'terminalId': kw.get('terminalId'), 'berthId': kw.get('berthId'), 'sourceType': 'synthetic-port-event'}
        portcalls.append(rec)
        return rec

    add_call(portId='PRT-SIN', vesselId='VSL-0001', voyageId='VYG-0001', arrivalAtUtc=iso(VSL1_QUEUE_SINCE), waitingSinceUtc=iso(VSL1_QUEUE_SINCE),
             estimatedBerthUtc='2026-11-10T14:00:00Z', status='awaiting_berth', terminalId='TRM-SIN-W', berthId=None)
    for i in range(201, 241):
        v = vessel_map[f'VSL-{i:04d}']
        arrived = ANCHOR - timedelta(hours=rng.randint(2, 44), minutes=rng.choice([0, 15, 30, 45]))
        waiting = None if i % 9 == 0 else arrived
        berth_eta = None if i % 7 == 0 else ANCHOR + timedelta(hours=rng.randint(3, 52))
        add_call(portId='PRT-SIN', vesselId=v['vesselId'], arrivalAtUtc=iso(arrived), waitingSinceUtc=iso(waiting) if waiting else None,
                 estimatedBerthUtc=iso(berth_eta) if berth_eta else None, status='awaiting_berth',
                 terminalId=rng.choice(['TRM-SIN-W', 'TRM-SIN-C', 'TRM-SIN-E']))
    for i in range(241, 253):
        v = vessel_map[f'VSL-{i:04d}']
        eta = ANCHOR + timedelta(hours=rng.randint(2, 23), minutes=rng.choice([0, 20, 40]))
        add_call(portId='PRT-SIN', vesselId=v['vesselId'], arrivalAtUtc=iso(eta), status='scheduled', terminalId=rng.choice(['TRM-SIN-W', 'TRM-SIN-C', 'TRM-SIN-E']))
    for k, b in enumerate(sin_berths_moored):
        vid = b['occupiedByVesselId']
        if not vid:
            continue
        arrived = ANCHOR - timedelta(hours=rng.randint(14, 60))
        add_call(portId='PRT-SIN', vesselId=vid, arrivalAtUtc=iso(arrived), waitingSinceUtc=iso(arrived),
                 estimatedBerthUtc=iso(arrived + timedelta(hours=rng.randint(6, 12))), status='at_berth', terminalId=b['terminalId'], berthId=b['berthId'])
    for v in voyages:
        dest = port_map[v['destinationPortId']]
        add_call(portId=dest['portId'], vesselId=v['vesselId'], voyageId=v['voyageId'], arrivalAtUtc=v['estimatedArrivalUtc'],
                 status='scheduled', terminalId=dest['terminalIds'][0])

    # ---------------- weather ----------------
    weather = []
    hazard_types = ['high_waves', 'high_wind', 'storm_warning', 'poor_visibility']
    for i in range(15):
        r = voyage_routes[i % len(voyage_routes)]
        idx = min(len(r['waypoints']) - 2, 10 if i == 0 else 4 + (i % 3))
        wp = r['waypoints'][idx]
        lon, lat = (76.0, 8.6) if i == 0 else (wp['lon'], wp['lat'])
        delta = 4.0 if i == 0 else 2.3
        issued = ANCHOR - timedelta(hours=6 if i == 0 else rng.randint(2, 11))
        vfrom = ANCHOR - timedelta(hours=4) if i == 0 else issued + timedelta(hours=rng.randint(0, 4))
        vto = ANCHOR + timedelta(hours=30) if i == 0 else vfrom + timedelta(hours=rng.choice([6, 12, 18, 24, 36]))
        weather.append({'hazardId': f'WX-{i + 1:04d}', 'type': 'high_waves' if i == 0 else rng.choice(hazard_types),
                        'severity': 'high' if i == 0 else rng.choice(['moderate', 'high', 'severe']),
                        'polygon': [point(lon - delta, lat - delta * 0.8), point(lon + delta, lat - delta * 0.8), point(lon + delta, lat + delta * 0.8), point(lon - delta, lat + delta * 0.8)],
                        'issuedAtUtc': iso(issued), 'validFromUtc': iso(vfrom), 'validToUtc': iso(vto),
                        'affectedRouteIds': [], 'affectedVoyageIds': [], 'sourceType': 'synthetic-forecast', 'confidence': 'medium' if i == 0 else rng.choice(['low', 'medium', 'high'])})
    # Route/voyage intersection computed with the same model the app uses: progress advances at SOG along waypoints.
    for w in weather:
        poly = w['polygon']
        vfrom = datetime.fromisoformat(w['validFromUtc'].replace('Z', '+00:00'))
        vto = datetime.fromisoformat(w['validToUtc'].replace('Z', '+00:00'))
        for r in routes:
            dense = [path_at(r['waypoints'], k / 400) for k in range(401)]
            if any(point_in_polygon(p, poly) for p in dense):
                w['affectedRouteIds'].append(r['routeId'])
        for v in voyages:
            kin = voyage_kinematics.get(v['voyageId'])
            if not kin or v['routeId'] not in w['affectedRouteIds']:
                continue
            t = max(vfrom, kin['lastReport'])
            while t <= vto:
                prog = kin['progressAtLastReport'] + ((t - kin['lastReport']).total_seconds() / 3600) * kin['sogKn'] / kin['route']['distanceNmEstimate']
                if prog >= 1:
                    break
                if point_in_polygon(path_at(kin['route']['waypoints'], prog), poly):
                    w['affectedVoyageIds'].append(v['voyageId'])
                    break
                t += timedelta(minutes=30)
    wx1_voyages = [v for v in weather[0]['affectedVoyageIds'] if v != 'VYG-0001']

    # ---------------- users ----------------
    users = []
    for k, (n, role, title, ws) in enumerate([('Avery Morgan', 'manager', 'Fleet Operations Manager', 'operations'),
                                               ('Jordan Lee', 'dispatcher', 'Fleet Ops Dispatcher', 'operations'),
                                               ('Mina Rahman', 'analyst', 'Marine Operations Analyst', 'compare'),
                                               ('Sam Ellis', 'viewer', 'Customer Service Coordinator', 'operations'),
                                               ('Taylor Cruz', 'dispatcher', 'Port Call Coordinator', 'port')], 1):
        flags = {'viewer': ['action.entity.view'],
                 'analyst': ['action.entity.view', 'action.incident.acknowledge', 'action.incident.note', 'action.scenario.propose'],
                 'dispatcher': ['action.entity.view', 'action.incident.acknowledge', 'action.incident.note', 'action.incident.assign', 'action.incident.transition', 'action.task.create', 'action.scenario.propose'],
                 'manager': ['action.entity.view', 'action.incident.acknowledge', 'action.incident.note', 'action.incident.assign', 'action.incident.transition', 'action.incident.resolve', 'action.task.create', 'action.scenario.propose', 'action.scenario.accept']}[role]
        users.append({'userId': f'USR-{k:03d}', 'displayName': n, 'role': role, 'title': title, 'organizationId': 'ORG-DEMO-01',
                      'defaultWorkspace': ws, 'permissionFlags': flags, 'locale': 'en-GB', 'timeZone': 'UTC', 'sourceType': 'fictional-demo-user'})

    # ---------------- events (scenario first, stable IDs) ----------------
    events = []

    def add_event(typ, at, refs, payload, quality='synthetic'):
        events.append({'eventId': None, 'type': typ, 'occurredAtUtc': iso(at), 'ingestedAtUtc': iso(at + timedelta(minutes=3)),
                       'entityRefs': refs, 'payload': payload, 'sourceType': 'synthetic-event', 'quality': quality})
        return events[-1]

    s_refs = [{'kind': 'vessel', 'id': 'VSL-0001'}, {'kind': 'voyage', 'id': 'VYG-0001'}, {'kind': 'port', 'id': 'PRT-SIN'}]
    planned1 = datetime(2026, 11, 28, 8, tzinfo=UTC)
    # Stable scenario IDs (V2 spec 21): EVT-0001 is the ETA revision, EVT-0002 the anchorage entry; the berth queue
    # (since 04:00, EVT-0004) is a separate fact from the formal anchorage assignment at 09:15.
    scenario_events = [
        ('ETA_REVISED', datetime(2026, 11, 9, 9, 0, tzinfo=UTC), s_refs, {'voyageId': 'VYG-0001', 'previousEtaShiftHours': 8, 'newEtaShiftHours': 18,
                                                                         'previousEstimatedArrivalUtc': iso(planned1 + timedelta(hours=8)), 'newEstimatedArrivalUtc': iso(planned1 + timedelta(hours=18)),
                                                                         'driver': 'port_waiting_forecast'}),
        ('ANCHORAGE_ENTER', datetime(2026, 11, 9, 9, 15, tzinfo=UTC), s_refs, {'portId': 'PRT-SIN', 'vesselId': 'VSL-0001', 'anchorageId': 'ANC-SIN',
                                                                              'assignment': 'formal', 'note': 'Formal anchorage assignment; the vessel was already holding at this position'}),
        ('INCIDENT_OPENED', datetime(2026, 11, 9, 10, 59, tzinfo=UTC), s_refs + [{'kind': 'incident', 'id': 'INC-0001'}], {'incidentId': 'INC-0001', 'ruleKey': 'eta_shift_over_12h'}),
        ('PORT_QUEUE_JOINED', VSL1_QUEUE_SINCE, s_refs, {'portId': 'PRT-SIN', 'vesselId': 'VSL-0001', 'portCallId': 'PCL-0001', 'terminalId': 'TRM-SIN-W'}),
        ('WEATHER_WARNING_ISSUED', datetime(2026, 11, 9, 6, 0, tzinfo=UTC), s_refs + [{'kind': 'weather', 'id': 'WX-0001'}, {'kind': 'route', 'id': 'RTE-SIN-RTM'}], {'hazardId': 'WX-0001'}),
        ('PORT_WAIT_UPDATED', datetime(2026, 11, 9, 7, 30, tzinfo=UTC), [{'kind': 'port', 'id': 'PRT-SIN'}], {'portId': 'PRT-SIN', 'waitingEstimateHours': 14, 'previousWaitingEstimateHours': 9}),
        ('PORT_WAIT_UPDATED', datetime(2026, 11, 9, 11, 22, tzinfo=UTC), [{'kind': 'port', 'id': 'PRT-SIN'}] + s_refs[:2], {'portId': 'PRT-SIN', 'waitingEstimateHours': 26, 'previousWaitingEstimateHours': 14}),
        ('BERTH_ESTIMATE_UPDATED', datetime(2026, 11, 9, 11, 40, tzinfo=UTC), s_refs, {'portId': 'PRT-SIN', 'vesselId': 'VSL-0001', 'portCallId': 'PCL-0001', 'terminalId': 'TRM-SIN-W',
                                                                                     'estimatedBerthUtc': '2026-11-10T14:00:00Z', 'confirmed': False}),
        ('AIS_REPORT', datetime(2026, 11, 9, 11, 55, tzinfo=UTC), s_refs, {'vesselId': 'VSL-0001', 'location': point(*VSL1_HOLD), 'sogKn': 0.1}),
    ]
    for k, (typ, at, refs, payload) in enumerate(scenario_events, 1):
        add_event(typ, at, refs, payload)['eventId'] = f'EVT-{k:04d}'

    # ETA revisions consistent with voyage estimates (one per shifted voyage, inside replay window).
    for v in voyages[1:]:
        planned = datetime.fromisoformat(v['plannedArrivalUtc'].replace('Z', '+00:00'))
        est = datetime.fromisoformat(v['estimatedArrivalUtc'].replace('Z', '+00:00'))
        shift_h = round((est - planned).total_seconds() / 3600)
        if shift_h == 0:
            continue
        prev_shift = shift_h - rng.choice([2, 4, 6]) if shift_h > 0 else 0
        at = ANCHOR - timedelta(minutes=rng.randint(30, 700))
        add_event('ETA_REVISED', at, [{'kind': 'vessel', 'id': v['vesselId']}, {'kind': 'voyage', 'id': v['voyageId']}],
                  {'voyageId': v['voyageId'], 'previousEtaShiftHours': prev_shift, 'newEtaShiftHours': shift_h,
                   'previousEstimatedArrivalUtc': iso(planned + timedelta(hours=prev_shift)), 'newEstimatedArrivalUtc': v['estimatedArrivalUtc'],
                   'driver': rng.choice(['port_waiting_forecast', 'scheduled_speed_change', 'weather_corridor_exposure', 'source_correction'])})
    # Singapore anchorage movements.
    for c in portcalls:
        if c['portId'] != 'PRT-SIN' or c['vesselId'] == 'VSL-0001':
            continue
        refs = [{'kind': 'vessel', 'id': c['vesselId']}, {'kind': 'port', 'id': 'PRT-SIN'}]
        if c['status'] == 'awaiting_berth' and c['waitingSinceUtc']:
            at = datetime.fromisoformat(c['waitingSinceUtc'].replace('Z', '+00:00'))
            if at >= REPLAY_START:
                add_event('ANCHORAGE_ENTER', at, refs, {'portId': 'PRT-SIN', 'vesselId': c['vesselId'], 'anchorageId': 'ANC-SIN'})
        if c['status'] == 'at_berth':
            at = ANCHOR - timedelta(minutes=rng.randint(60, 690))
            add_event('ANCHORAGE_EXIT', at, refs, {'portId': 'PRT-SIN', 'vesselId': c['vesselId'], 'anchorageId': 'ANC-SIN'})
            add_event('BERTH_OCCUPIED', at + timedelta(minutes=50), refs, {'portId': 'PRT-SIN', 'vesselId': c['vesselId'], 'berthId': c['berthId']})
    # Other port wait updates (non-Singapore) and generic AIS reports.
    for k in range(24):
        p = ports[1 + (k * 7) % 99]
        add_event('PORT_WAIT_UPDATED', ANCHOR - timedelta(minutes=rng.randint(10, 700)), [{'kind': 'port', 'id': p['portId']}],
                  {'portId': p['portId'], 'waitingEstimateHours': rng.choice([2, 4, 6, 9, 12, 18])})
    for k in range(40):
        v = vessels[1 + (k * 11) % 499]
        add_event('AIS_REPORT', ANCHOR - timedelta(minutes=rng.randint(5, 700)), [{'kind': 'vessel', 'id': v['vesselId']}],
                  {'vesselId': v['vesselId'], 'reason': 'synthetic scheduled report'})
    for w in weather[1:]:
        add_event('WEATHER_WARNING_ISSUED', datetime.fromisoformat(w['issuedAtUtc'].replace('Z', '+00:00')),
                  [{'kind': 'weather', 'id': w['hazardId']}] + [{'kind': 'route', 'id': r} for r in w['affectedRouteIds'][:2]], {'hazardId': w['hazardId']})

    # ---------------- incidents / evidence ----------------
    incidents, evidence = [], []
    ev_n = 0

    def add_evidence(source_id, observed, entity_ref, field, value, unit=None, quality='synthetic'):
        nonlocal ev_n
        ev_n += 1
        eid = f'EVD-{ev_n:04d}'
        evidence.append({'evidenceId': eid, 'sourceType': 'synthetic-scenario', 'sourceId': source_id, 'observedAtUtc': iso(observed),
                         'receivedAtUtc': iso(observed + timedelta(minutes=3)), 'entityRef': entity_ref, 'field': field, 'value': value, 'unit': unit, 'quality': quality})
        return eid

    special = {
        2: ('weather_exposure', 'high', 'SCENARIO_INDIAN_OCEAN_WEATHER', wx1_voyages[0] if wx1_voyages else 'VYG-0003'),
        3: ('berth_equipment', 'medium', 'SCENARIO_ROTTERDAM_BERTH', None),
        4: ('schedule_variance', 'medium', 'SCENARIO_NORTH_SEA_TRANSIT', None),
    }
    rtm_inbound = [v['voyageId'] for v in voyages[1:] if v['destinationPortId'] == 'PRT-RTM']
    neu_voyages = [v['voyageId'] for v in voyages[1:] if v['routeId'] == 'RTE-RTM-NYC']
    used_voyages = set()
    titles = {'port_congestion': 'Forecast ETA shift after anchorage wait', 'weather_exposure': 'Route crosses forecast hazard window',
              'port_delay': 'Port wait forecast above plan', 'data_quality': 'Position reports stale', 'schedule_variance': 'Forecast ETA deviates from schedule',
              'berth_equipment': 'Berth equipment availability issue'}
    for i in range(1, 51):
        incid = f'INC-{i:04d}'
        if i == 1:
            voy, cat, sev, scen = 'VYG-0001', 'port_congestion', 'high', 'SCENARIO_SINGAPORE_CONGESTION'
            port_id = 'PRT-SIN'
            opened = datetime(2026, 11, 9, 10, 59, tzinfo=UTC)
        elif i == 50:
            voy, cat, sev, scen = 'VYG-0001', 'schedule_variance', 'medium', 'SCENARIO_SINGAPORE_CONGESTION'
            port_id = 'PRT-SIN'
            opened = datetime(2026, 11, 9, 11, 30, tzinfo=UTC)
        else:
            if i in special:
                cat, sev, scen, voy = special[i]
                if i == 3:
                    voy = rtm_inbound[0]
                if i == 4:
                    voy = neu_voyages[0] if neu_voyages else rtm_inbound[1]
            else:
                cat = rng.choice(['schedule_variance', 'weather_exposure', 'port_delay', 'data_quality'])
                sev = rng.choice(['medium', 'medium', 'high', 'critical'])
                scen = 'SCENARIO_GENERAL_DISRUPTION'
                voy = f'VYG-{(i * 3) % 199 + 2:04d}'
                while voy in used_voyages or voy == 'VYG-0001':
                    voy = f'VYG-{(int(voy[4:]) % 199) + 2:04d}'
            port_id = 'PRT-RTM' if i == 3 else voyage_map[voy]['destinationPortId']
            opened = ANCHOR - timedelta(minutes=rng.randint(20, 690))
        used_voyages.add(voy)
        voyage = voyage_map[voy]
        vid = voyage['vesselId']
        refs = [{'kind': 'vessel', 'id': vid}, {'kind': 'voyage', 'id': voy}, {'kind': 'port', 'id': port_id}]
        ev_ids = []
        if i == 1:
            eta_evt = next(e for e in events if e['type'] == 'ETA_REVISED' and e['payload'].get('voyageId') == 'VYG-0001')
            ev_ids.append(add_evidence('EVT-ETA-VYG-0001', datetime(2026, 11, 9, 9, 0, tzinfo=UTC), {'kind': 'voyage', 'id': 'VYG-0001'}, 'estimatedArrivalUtc', voyage['estimatedArrivalUtc']))
            ev_ids.append(add_evidence('EVT-WAIT-PRT-SIN', datetime(2026, 11, 9, 11, 22, tzinfo=UTC), {'kind': 'port', 'id': 'PRT-SIN'}, 'waitingEstimateHours', 26, 'h'))
            ev_ids.append(add_evidence('EVT-AIS-VSL-0001', datetime(2026, 11, 9, 11, 55, tzinfo=UTC), {'kind': 'vessel', 'id': 'VSL-0001'}, 'lastKnownPosition', point(*VSL1_HOLD)))
            ev_ids.append(add_evidence('EVT-BERTH-VSL-0001', datetime(2026, 11, 9, 11, 40, tzinfo=UTC), {'kind': 'port', 'id': 'PRT-SIN'}, 'estimatedBerthUtc', '2026-11-10T14:00:00Z'))
            ev_ids.append(add_evidence('VYG-0001', datetime(2026, 11, 6, 0, 0, tzinfo=UTC), {'kind': 'voyage', 'id': 'VYG-0001'}, 'dailyDelayCostUsd', 32000, 'USD/day', 'assumption'))
        elif cat == 'weather_exposure':
            hz = next((w for w in weather if voy in w['affectedVoyageIds']), weather[0])
            ev_ids.append(add_evidence(hz['hazardId'], datetime.fromisoformat(hz['issuedAtUtc'].replace('Z', '+00:00')), {'kind': 'voyage', 'id': voy}, 'hazardIntersection', hz['hazardId']))
        elif cat == 'data_quality':
            ev_ids.append(add_evidence(vid, datetime.fromisoformat(vessel_map[vid]['lastReportedAtUtc'].replace('Z', '+00:00')), {'kind': 'vessel', 'id': vid}, 'lastReportedAtUtc', vessel_map[vid]['lastReportedAtUtc']))
        elif cat in ('port_delay', 'berth_equipment'):
            ev_ids.append(add_evidence(port_id, opened - timedelta(minutes=30), {'kind': 'port', 'id': port_id}, 'waitingEstimateHours', rng.choice([8, 12, 16, 20]), 'h'))
        else:
            ev_ids.append(add_evidence(voy, opened - timedelta(minutes=20), {'kind': 'voyage', 'id': voy}, 'estimatedArrivalUtc', voyage['estimatedArrivalUtc']))

        status, owner, ack_at, res_at = 'open', None, None, None
        if i not in (1, 2, 50):
            if i % 13 == 0:
                status = 'resolved'
            elif i % 11 == 0:
                status = 'investigating'
            elif i % 7 == 0:
                status = 'acknowledged'
        if status != 'open':
            ack_at = min(ANCHOR - timedelta(minutes=2), opened + timedelta(minutes=rng.randint(8, 40)))
            owner = rng.choice(['USR-001', 'USR-002', 'USR-005'])
        if status == 'resolved':
            res_at = min(ANCHOR - timedelta(minutes=1), ack_at + timedelta(minutes=rng.randint(20, 90)))
        incidents.append({'incidentId': incid, 'title': titles[cat], 'vesselId': vid, 'voyageId': voy, 'portId': port_id, 'entityRefs': refs,
                          'category': cat, 'severity': sev, 'status': status, 'openedAtUtc': iso(opened), 'detectedAtUtc': iso(opened - timedelta(minutes=2)),
                          'acknowledgedAtUtc': iso(ack_at) if ack_at else None, 'resolvedAtUtc': iso(res_at) if res_at else None,
                          'ownerUserId': owner, 'evidenceIds': ev_ids, 'actionIds': [], 'scenarioId': scen, 'sourceType': 'synthetic-incident'})
        inc_refs = refs + [{'kind': 'incident', 'id': incid}]
        if i != 1:
            add_event('INCIDENT_OPENED', opened, inc_refs, {'incidentId': incid, 'ruleKey': cat})
        if ack_at:
            add_event('INCIDENT_ACKNOWLEDGED', ack_at, inc_refs, {'incidentId': incid, 'userId': owner})
            add_event('ACTION_ASSIGNED', ack_at + timedelta(minutes=1), inc_refs, {'incidentId': incid, 'assigneeUserId': owner, 'note': 'Historical fixture assignment'})
        if res_at:
            add_event('INCIDENT_RESOLVED', res_at, inc_refs, {'incidentId': incid, 'userId': owner, 'reason': 'Resolved in simulation fixture'})

    # Stable IDs: scenario events keep EVT-0001..0009 in listed order; the rest are numbered by time.
    events.sort(key=lambda x: (x['occurredAtUtc'], x['type'], json.dumps(x['entityRefs'], sort_keys=True)))
    n = len(scenario_events)
    for e in events:
        if e['eventId'] is None:
            n += 1
            e['eventId'] = f'EVT-{n:04d}'
    alias = {'EVT-ETA-VYG-0001': 'EVT-0001', 'EVT-WAIT-PRT-SIN': 'EVT-0007', 'EVT-AIS-VSL-0001': 'EVT-0009', 'EVT-BERTH-VSL-0001': 'EVT-0008'}
    for ev in evidence:
        ev['sourceId'] = alias.get(ev['sourceId'], ev['sourceId'])

    data = {'regions.json': regions, 'ports.json': ports, 'terminals.json': terminals, 'berths.json': berths, 'anchorages.json': anchorages,
            'routes.json': routes, 'vessels.json': vessels, 'voyages.json': voyages, 'positions.json': positions, 'portCalls.json': portcalls,
            'incidents.json': incidents, 'evidence.json': evidence, 'weatherHazards.json': weather, 'events.json': events, 'users.json': users}
    ctx = {'voyageKinematics': voyage_kinematics, 'flagship': flagship, 'portMap': port_map, 'vesselMap': vessel_map, 'voyageMap': voyage_map,
           'berthMap': berth_map, 'positions': positions}
    return data, ctx


SEA_ROUTES = {'RTE-SIN-MNL', 'RTE-SHA-SIN', 'RTE-MEL-SIN', 'RTE-MUM-SIN', 'RTE-HAM-SIN', 'RTE-SIN-RTM', 'RTE-SIN-JEA', 'RTE-SIN-CPT'}


def flagship_vessels(kinematics):
    """VSL-0047 plus in-transit vessels: up to 20 on Southeast Asia corridors, the rest spread over other corridors."""
    ids = sorted(int(v[4:]) for v in kinematics)
    sea = [i for i in ids if i != 47 and kinematics[f'VYG-{i:04d}']['route']['routeId'] in SEA_ROUTES][:20]
    other = [i for i in ids if i != 47 and i not in sea][:FLAGSHIP_COUNT - 1 - len(sea)]
    return ['VSL-0047'] + [f'VSL-{i:04d}' for i in sorted(sea + other)]


def model_sample(kin, t, port_map):
    """Position on the voyage's kinematic model (same model as the base samples); clamps to the port at either end."""
    route = kin['route']
    prog = kin['progressAtLastReport'] + ((t - kin['lastReport']).total_seconds() / 3600) * kin['sogKn'] / route['distanceNmEstimate']
    if prog <= 0:
        p = port_map[route['originPortId']]['location']
        return [p['lon'], p['lat'], 0.0, None, 'moored']
    if prog >= 1:
        p = port_map[route['destinationPortId']]['location']
        return [p['lon'], p['lat'], 0.0, None, 'moored']
    pos = path_at(route['waypoints'], prog)
    return [pos['lon'], pos['lat'], kin['sogKn'], bearing_deg(pos, path_at(route['waypoints'], min(1, prog + 0.004))), 'underway']


def berth_bearing(points):
    a, b = points[0], points[-1]
    return bearing_deg(a, b) if a != b else 90


def gen_v2(data, ctx, seed):
    """Versioned V2 scenario module. Never rewrites base records: it only adds keyframes, layouts and milestones."""
    rng = random.Random(seed + 2)
    port_map, vessel_map, berth_map = ctx['portMap'], ctx['vesselMap'], ctx['berthMap']
    kin_by_vessel = {f'VSL-{v[4:]}': k for v, k in ctx['voyageKinematics'].items()}
    base_times = {}
    for p in ctx['positions']:
        base_times.setdefault(p['vesselId'], []).append(datetime.fromisoformat(p['timestampUtc'].replace('Z', '+00:00')))

    tracks = []
    for vid in ctx['flagship']:
        kin = kin_by_vessel[vid]
        interval = 15 if vid == 'VSL-0047' else 30
        step = timedelta(minutes=interval)
        first_base = min(base_times[vid])
        history, t = [], V2_MIN
        while t < first_base:
            history.append(model_sample(kin, t, port_map))
            t += step
        forecast, t = [], kin['lastReport'] + step
        forecast_start = t
        while t <= V2_MAX:
            forecast.append(model_sample(kin, t, port_map))
            t += step
        tracks.append({'vesselId': vid, 'voyageId': vessel_map[vid]['currentVoyageId'], 'routeId': kin['route']['routeId'], 'intervalMinutes': interval,
                       'history': {'startUtc': iso(V2_MIN), 'samples': [[round(s[0], 6), round(s[1], 6), s[2], s[3], s[4]] for s in history]},
                       'forecast': {'startUtc': iso(forecast_start), 'samples': [[round(s[0], 6), round(s[1], 6), s[2], s[3], s[4]] for s in forecast]},
                       'sourceType': 'synthetic-v2-keyframes'})

    # ---------------- port twin layouts ----------------
    # Declared simulated yard box counts (drawn as instanced stacks); never inferred from TEU capacity.
    yard_containers = {'TRM-SIN-W': 2400, 'TRM-SIN-C': 2000, 'TRM-SIN-E': 1600}

    def terminal_layout(t, quay_depth_m, cranes):
        bpts = [berth_map[b]['location'] for b in t['berthIds']]
        bearing = berth_bearing(bpts)
        berths_out = []
        for k, bid in enumerate(t['berthIds']):
            b = berth_map[bid]
            berths_out.append({'berthId': bid, 'center': b['location'], 'quayBearingDeg': bearing,
                               'lengthMeters': 300 + 40 * ((k + len(bid)) % 3), 'depthMeters': round(quay_depth_m + 0.5 * (k % 3), 1),
                               'craneCount': 0 if b['status'] == 'unavailable' else cranes - (k % 2), 'constraintsValidated': False})
        return {'terminalId': t['terminalId'], 'name': t['name'], 'quayBearingDeg': bearing, 'quayLine': bpts, 'landSide': 'north' if t['portId'] == 'PRT-SIN' else 'east',
                'yardDepthMeters': 420 if t['portId'] == 'PRT-SIN' else 260, 'yardContainers': yard_containers.get(t['terminalId'], 600), 'berths': berths_out}

    terminals = {t['terminalId']: t for t in data['terminals.json']}
    layouts = [{
        'portId': 'PRT-SIN', 'detail': 'flagship', 'cityId': 'CTY-SIN',
        'bounds': {'west': 103.62, 'south': 1.12, 'east': 104.08, 'north': 1.34},
        'terminals': [terminal_layout(terminals[tid], 16.0, 5) for tid in ('TRM-SIN-W', 'TRM-SIN-C', 'TRM-SIN-E')],
        'anchorages': [{'anchorageId': 'ANC-SIN', 'name': 'Singapore Eastern Demo Anchorage', 'polygon': [point(a, b) for a, b in SIN_ANCHORAGE_V2], 'usage': 'waiting'},
                       {'anchorageId': 'ANC-SIN-WEST', 'name': 'Singapore Western Demo Anchorage', 'polygon': [point(a, b) for a, b in SIN_WEST_ANCHORAGE], 'usage': 'illustrative'}],
        'pilotBoardingPlace': point(104.08, 1.245),
        'sourceType': 'synthetic-illustrative-layout-not-for-navigation',
    }]
    for pid, city in (('PRT-RTM', 'CTY-RTM'), ('PRT-GOA', 'CTY-GOA')):
        p = port_map[pid]
        l = p['location']
        layouts.append({'portId': pid, 'detail': 'procedural', 'cityId': city,
                        'bounds': {'west': l['lon'] - 0.12, 'south': l['lat'] - 0.16, 'east': l['lon'] + 0.32, 'north': l['lat'] + 0.08},
                        'terminals': [terminal_layout(terminals[tid], 14.5, 3) for tid in p['terminalIds']],
                        'anchorages': [{'anchorageId': a['anchorageId'], 'name': a['name'], 'polygon': a['polygon'], 'usage': 'waiting'}
                                       for a in data['anchorages.json'] if a['portId'] == pid],
                        'pilotBoardingPlace': point(l['lon'] + 0.2, l['lat'] - 0.14),
                        'sourceType': 'synthetic-illustrative-layout-not-for-navigation'})

    # ---------------- DCSA-style berth milestones (Singapore) ----------------
    def ms(event, location, classifier, at, recorded):
        return {'eventType': event, 'location': location, 'classifier': classifier, 'atUtc': iso(at), 'recordedAtUtc': iso(min(recorded, ANCHOR))}

    sin_layout = {b['berthId']: b for t in layouts[0]['terminals'] for b in t['berths']}
    calls = [c for c in data['portCalls.json'] if c['portId'] == 'PRT-SIN']
    bookings, free_at = [], {}
    parse = lambda v: datetime.fromisoformat(v.replace('Z', '+00:00'))
    buffer_min = 60
    for c in calls:
        if c['status'] != 'at_berth':
            continue
        berthed = parse(c['estimatedBerthUtc'])
        dep = berthed + timedelta(hours=rng.randint(20, 34))
        if dep <= ANCHOR + timedelta(hours=2):
            # Still alongside at the anchor, so the planned departure lies ahead (deterministic, no extra draws).
            dep = ANCHOR + timedelta(hours=3 + (berthed.hour * 7 + berthed.day) % 16)
        free_at[c['berthId']] = dep
        bookings.append({'bookingId': None, 'portCallId': c['portCallId'], 'vesselId': c['vesselId'], 'berthId': c['berthId'], 'terminalId': c['terminalId'],
                         'status': 'at_berth', 'bufferMinutes': buffer_min,
                         'milestones': [ms('ARRIVAL', 'BERTH', 'ACT', berthed, berthed), ms('DEPARTURE', 'BERTH', 'PLN', dep, berthed + timedelta(hours=2)),
                                        ms('DEPARTURE', 'BERTH', 'EST', dep + timedelta(minutes=rng.choice([0, 30, 90])), ANCHOR - timedelta(minutes=rng.randint(5, 50)))]})
    waiting = sorted((c for c in calls if c['status'] == 'awaiting_berth' and c['estimatedBerthUtc'] and c['vesselId'] != 'VSL-0001'),
                     key=lambda c: (c['estimatedBerthUtc'], c['portCallId']))
    conflict_made = False
    for c in waiting:
        eta_berth = parse(c['estimatedBerthUtc'])
        stay = timedelta(hours=rng.randint(16, 30))
        options = [bid for bid, b in sin_layout.items() if bid.startswith('BRH-' + c['terminalId'][4:]) and berth_map[bid]['status'] != 'unavailable']
        bid = min(options, key=lambda b: (free_at.get(b, ANCHOR), b))
        planned = eta_berth <= ANCHOR + timedelta(hours=30)
        start = max(eta_berth, free_at.get(bid, ANCHOR) + timedelta(minutes=buffer_min))
        if planned and not conflict_made and bid in free_at:
            # One deliberate overlap with the occupant's planned departure + buffer, for the berth-conflict engine demo.
            start = free_at[bid] - timedelta(hours=2)
            conflict_made = True
        miles = [ms('ARRIVAL', 'BERTH', 'REQ', eta_berth, parse(c['arrivalAtUtc']) + timedelta(hours=1)),
                 ms('ARRIVAL', 'BERTH', 'EST', start, ANCHOR - timedelta(minutes=rng.randint(10, 90))),
                 ms('DEPARTURE', 'BERTH', 'EST', start + stay, ANCHOR - timedelta(minutes=rng.randint(10, 90)))]
        if planned:
            miles += [ms('ARRIVAL', 'BERTH', 'PLN', start, ANCHOR - timedelta(hours=rng.randint(1, 4))), ms('DEPARTURE', 'BERTH', 'PLN', start + stay, ANCHOR - timedelta(hours=rng.randint(1, 4)))]
            free_at[bid] = start + stay
        bookings.append({'bookingId': None, 'portCallId': c['portCallId'], 'vesselId': c['vesselId'], 'berthId': bid if planned else None, 'terminalId': c['terminalId'],
                         'status': 'awaiting_berth', 'bufferMinutes': buffer_min, 'milestones': miles})
    one = next(c for c in calls if c['vesselId'] == 'VSL-0001')
    voyage1 = ctx['voyageMap']['VYG-0001']
    bookings.append({'bookingId': None, 'portCallId': one['portCallId'], 'vesselId': 'VSL-0001', 'berthId': None, 'terminalId': one['terminalId'],
                     'status': 'awaiting_berth', 'bufferMinutes': buffer_min,
                     'milestones': [ms('ARRIVAL', 'BERTH', 'EST', parse(one['estimatedBerthUtc']), datetime(2026, 11, 9, 11, 40, tzinfo=UTC)),
                                    ms('DEPARTURE', 'BERTH', 'EST', parse(voyage1['estimatedDepartureUtc']), datetime(2026, 11, 9, 11, 40, tzinfo=UTC))]})
    # JIT demo (spec 16 optional): the earliest scheduled call arriving 12-36 h after the anchor gets requested and
    # planned berth times later than its pilot-boarding estimate. Fixed offsets, so no extra random draws.
    jit_call = min((c for c in calls if c['status'] == 'scheduled' and c['vesselId'] != 'VSL-0001'
                    and ANCHOR + timedelta(hours=12) <= parse(c['arrivalAtUtc']) <= ANCHOR + timedelta(hours=36)),
                   key=lambda c: (c['arrivalAtUtc'], c['portCallId']))
    for c in calls:
        if c['status'] == 'scheduled':
            eta = parse(c['arrivalAtUtc'])
            miles = [ms('ARRIVAL', 'PBP', 'EST', eta, ANCHOR - timedelta(minutes=rng.randint(5, 60)))]
            if c is jit_call:
                miles += [ms('ARRIVAL', 'BERTH', 'REQ', eta + timedelta(hours=9), ANCHOR - timedelta(hours=20)),
                          ms('ARRIVAL', 'BERTH', 'PLN', eta + timedelta(hours=9), ANCHOR - timedelta(hours=3)),
                          ms('DEPARTURE', 'BERTH', 'PLN', eta + timedelta(hours=31), ANCHOR - timedelta(hours=3))]
            bookings.append({'bookingId': None, 'portCallId': c['portCallId'], 'vesselId': c['vesselId'], 'berthId': None, 'terminalId': c['terminalId'],
                             'status': 'scheduled', 'bufferMinutes': buffer_min, 'milestones': miles})
    for k, b in enumerate(sorted(bookings, key=lambda b: b['portCallId']), 1):
        b['bookingId'] = f'BKG-{k:04d}'
    bookings.sort(key=lambda b: b['bookingId'])

    scenario = {
        'scenarioVersion': SCENARIO_VERSION, 'baseFixtureVersion': FIXTURE_VERSION, 'seed': seed,
        'window': {'minUtc': iso(V2_MIN), 'maxUtc': iso(V2_MAX)}, 'anchorUtc': iso(ANCHOR),
        'baseReplayRange': {'startUtc': iso(REPLAY_START), 'endUtc': iso(ANCHOR)},
        'flagshipVesselIds': ctx['flagship'],
        'followDemo': {'vesselId': 'VSL-0047', 'voyageId': 'VYG-0047', 'routeId': 'RTE-SIN-MNL'},
        'positionGapDemo': {'vesselId': f'VSL-{GAP_VESSEL:04d}', 'fromUtc': iso(GAP_FROM), 'toUtc': iso(GAP_TO)},
        'jitDemo': {'vesselId': jit_call['vesselId'], 'portCallId': jit_call['portCallId'], 'pilotBoardingEstUtc': jit_call['arrivalAtUtc'],
                    'plannedBerthUtc': iso(parse(jit_call['arrivalAtUtc']) + timedelta(hours=9))},
        'singaporeCase': {'vesselId': 'VSL-0001', 'portCallId': 'PCL-0001', 'incidentId': 'INC-0001', 'queueSinceUtc': iso(VSL1_QUEUE_SINCE),
                          'anchorageEnterUtc': '2026-11-09T09:15:00Z', 'estimatedBerthUtc': '2026-11-10T14:00:00Z', 'berthAssigned': False},
        'precedence': ['baseFixtureRecords', 'v2IllustrativeLayouts', 'versionedFutureMovementSamples', 'scenarioBranchEvents'],
        'disclosure': 'Simulated scenario extension. Keyframes, layouts and milestones are illustrative; not live AIS, port or navigation data.',
    }
    return {'scenario.json': scenario, 'flagshipTracks.json': tracks, 'portLayouts.json': layouts, 'berthSchedule.json': bookings}


# ---------------- V3 cargo module ----------------
V3_CARGO_VERSION = '3.0'
CONTAINER_CATEGORIES = [('consumer electronics', 9000, 19000), ('apparel', 5000, 12000), ('furniture', 6000, 14000), ('machinery parts', 12000, 26000),
                        ('auto parts', 10000, 22000), ('chemicals (non-hazardous)', 14000, 24000), ('frozen food', 18000, 27000),
                        ('paper products', 15000, 25000), ('plastics resin', 16000, 26000), ('household goods', 6000, 13000)]
BULK_COMMODITIES = {'bulk': ('iron ore', 't'), 'tanker': ('crude oil', 'm3'), 'lng': ('liquefied natural gas', 'm3'),
                    'roro': ('passenger vehicles', 'units'), 'general': ('project cargo', 't')}


def iso6346_check(code):
    """ISO 6346 check digit for a 10-character owner code + serial (synthetic container numbers)."""
    letters = {c: v for c, v in zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38])}
    total = sum((letters[ch] if ch.isalpha() else int(ch)) * (2 ** i) for i, ch in enumerate(code))
    return total % 11 % 10


def gen_v3(data, ctx, v2, seed):
    """Versioned V3 cargo module (spec 05 / 13): containers, stowage, shipments, transfers and yard slots.

    Locations are event-sourced: every unit has one initial location at the window start and an ordered list of
    non-overlapping transfer events, so containerLocationAt(t) always resolves to exactly one place.
    """
    rng = random.Random(seed + 3)
    vessel_map, voyage_map = ctx['vesselMap'], ctx['voyageMap']
    window_start = V2_MIN
    units, shipments, events, plans = [], [], [], []
    serial = [100000]

    def container_no():
        serial[0] += 7
        body = f'PRSU{serial[0]:06d}'
        return f'{body}{iso6346_check(body)}'

    def container_cargo():
        cat, lo, hi = rng.choice(CONTAINER_CATEGORIES)
        reefer = cat == 'frozen food'
        return {'category': cat, 'netMassKg': rng.randrange(lo, hi, 50), 'reefer': reefer,
                'hazardClass': '9' if cat.startswith('chemicals') and rng.random() < 0.3 else None,
                'detailsVisibility': 'restricted' if rng.random() < 0.08 else 'summary'}, ('45R1' if reefer else '45G1')

    def slot_id(bay, row, tier):
        return f'{bay:02d}{row:02d}{tier:02d}'

    def container_grid(bays, rows, below, above):
        return [{'slotId': slot_id(b, r, t), 'bay': b, 'row': r, 'tier': t, 'deck': 'below' if t < 80 else 'above', 'sizeFt': 40}
                for b in bays for r in rows for t in below + above]

    def add_shipments(unit_ids, origin, dest, vessel_id, voyage_id, commodity_of, status):
        k = 0
        while k < len(unit_ids):
            n = min(len(unit_ids) - k, rng.choice([1, 1, 2, 2, 3, 4, 6]))
            ids = unit_ids[k:k + n]
            sid = f'SHP-{len(shipments) + 1:05d}'
            for uid in ids:
                unit_by_id[uid]['shipmentId'] = sid
            shipments.append({'shipmentId': sid, 'bookingRef': f'BKD-{seed % 1000:03d}-{len(shipments) + 1:05d}', 'shipper': f'Simulated Shipper {rng.randint(1, 60):03d}',
                              'consignee': f'Simulated Consignee {rng.randint(1, 60):03d}', 'commodity': commodity_of(ids[0]),
                              'originPortId': origin, 'destinationPortId': dest, 'vesselId': vessel_id, 'voyageId': voyage_id,
                              'cargoUnitIds': ids, 'declaredValueUsd': rng.randrange(20000, 400000, 500) * len(ids), 'status': status,
                              'sourceType': 'synthetic-cargo'})
            k += n

    unit_by_id = {}

    def add_unit(u):
        units.append(u)
        unit_by_id[u['cargoUnitId']] = u
        return u

    def new_container(vessel_id, voyage_id, origin, dest, location):
        cargo, iso_type = container_cargo()
        return add_unit({'cargoUnitId': f'CU-{len(units) + 1:05d}', 'kind': 'container', 'containerNo': container_no(), 'isoType': iso_type, 'sizeFt': 40,
                         'vesselId': vessel_id, 'shipmentId': None, 'originPortId': origin, 'destinationPortId': dest, 'cargo': cargo,
                         'initialLocation': location, 'sourceType': 'synthetic-cargo'})

    # ---- Singapore West yard slots (import blocks A-D, export blocks E-H) ----
    yard = []
    for blk in 'ABCDEFGH':
        for bay in range(1, 11):
            for row in range(1, 7):
                for tier in (1, 2):
                    yard.append({'yardSlotId': f'YRD-SINW-{blk}{bay:02d}{row}{tier}', 'portId': 'PRT-SIN', 'terminalId': 'TRM-SIN-W', 'block': blk,
                                 'bay': bay, 'row': row, 'tier': tier, 'use': 'import' if blk in 'ABCD' else 'export', 'sourceType': 'synthetic-layout'})
    tier_first = lambda use: sorted((y for y in yard if y['use'] == use), key=lambda y: (y['tier'], y['block'], y['bay'], y['row']))
    import_slots, export_slots = iter(tier_first('import')), iter(tier_first('export'))

    # ---- Flagship: VSL-0001, 800 slots (16 forty-foot bays x 10 rows x 3 below + 2 above) ----
    v1, voy1 = vessel_map['VSL-0001'], voyage_map['VYG-0001']
    bays = list(range(2, 66, 4))
    rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    below, above = [2, 4, 6], [82, 84]
    grid = container_grid(bays, rows, below, above)
    plans.append({'stowagePlanId': 'STW-VSL-0001', 'vesselId': 'VSL-0001', 'voyageId': 'VYG-0001', 'archetype': 'container', 'asOfUtc': iso(window_start),
                  'grid': {'bays': bays, 'rows': rows, 'tiersBelow': below, 'tiersAbove': above, 'slotCount': len(grid)},
                  'slots': grid, 'compartments': [], 'sourceType': 'synthetic-stowage'})
    prior_ports = ['PRT-SHA', 'PRT-NGB', 'PRT-BUS', 'PRT-HKG', 'PRT-SZX']
    vloc = lambda vid, sid: {'type': 'vessel_slot', 'vesselId': vid, 'slotId': sid}
    stacks_below = [(b, r) for b in bays for r in rows]
    rng.shuffle(stacks_below)
    through, imports = [], []
    # Through cargo for Rotterdam fills the holds bottom-up (360 of 480); hatch-top stacks are left short.
    heights = [3] * 40 + [2] * 120
    for (b, r), h in zip(stacks_below, heights):
        origin = rng.choice(prior_ports)
        for t in below[:h]:
            through.append(new_container('VSL-0001', 'VYG-0001', origin, 'PRT-RTM', vloc('VSL-0001', slot_id(b, r, t)))['cargoUnitId'])
    # Singapore imports sit on deck (260 of 320): 100 stacks two high, 60 one high.
    stacks_above = [(b, r) for b in bays for r in rows]
    rng.shuffle(stacks_above)
    for k, (b, r) in enumerate(stacks_above):
        origin = rng.choice(prior_ports)
        for t in above[:2 if k < 100 else 1]:
            imports.append(new_container('VSL-0001', 'VYG-0001', origin, 'PRT-SIN', vloc('VSL-0001', slot_id(b, r, t)))['cargoUnitId'])
    exports = [new_container('VSL-0001', 'VYG-0001', 'PRT-SIN', 'PRT-RTM', {'type': 'yard_slot', 'yardSlotId': next(export_slots)['yardSlotId']})['cargoUnitId']
               for _ in range(200)]

    # Quay crane plan: 4 cranes, 4 bays each; per bay discharge deck (top tier first), then load hold, then deck.
    berth_est = datetime(2026, 11, 10, 14, tzinfo=UTC)
    work_start = berth_est + timedelta(hours=1)
    occupied = {u['initialLocation']['slotId']: uid for uid, u in unit_by_id.items() if u['initialLocation']['type'] == 'vessel_slot'}
    export_queue = list(exports)
    deck_quota = 5
    ev_rows = []
    for c in range(4):
        crane = f'QC-SIN-W-{c + 1}'
        t = work_start
        for b in bays[c * 4:(c + 1) * 4]:
            for tier in reversed(above):
                for r in rows:
                    sid = slot_id(b, r, tier)
                    uid = occupied.get(sid)
                    if uid and unit_by_id[uid]['destinationPortId'] == 'PRT-SIN':
                        dur = timedelta(seconds=rng.randint(110, 170))
                        ev_rows.append((uid, 'discharge', crane, t, t + dur, vloc('VSL-0001', sid), {'type': 'yard_slot', 'yardSlotId': None}))
                        del occupied[sid]
                        t += dur + timedelta(seconds=rng.randint(10, 40))
            for tier in below:
                for r in rows:
                    sid = slot_id(b, r, tier)
                    if sid not in occupied and export_queue:
                        uid = export_queue.pop(0)
                        dur = timedelta(seconds=rng.randint(120, 180))
                        ev_rows.append((uid, 'load', crane, t, t + dur, unit_by_id[uid]['initialLocation'], vloc('VSL-0001', sid)))
                        occupied[sid] = uid
                        t += dur + timedelta(seconds=rng.randint(10, 40))
            placed = 0
            for r in rows:
                sid = slot_id(b, r, above[0])
                if placed < deck_quota and sid not in occupied and export_queue:
                    uid = export_queue.pop(0)
                    dur = timedelta(seconds=rng.randint(120, 180))
                    ev_rows.append((uid, 'load', crane, t, t + dur, unit_by_id[uid]['initialLocation'], vloc('VSL-0001', sid)))
                    occupied[sid] = uid
                    placed += 1
                    t += dur + timedelta(seconds=rng.randint(10, 40))
    # Yard slots for imports are handed out in discharge-completion order, so stacks grow bottom-up.
    ev_rows.sort(key=lambda e: (e[3], e[2]))
    for k, e in enumerate(ev_rows):
        if e[1] == 'discharge':
            e[6]['yardSlotId'] = next(import_slots)['yardSlotId']
    # A few imports leave by truck through the gate later in the window (only uncovered yard stacks).
    covered = {y[:-1] for y in (e[6]['yardSlotId'] for e in ev_rows if e[1] == 'discharge') if y.endswith('2')}
    dis = [e for e in ev_rows if e[1] == 'discharge' and e[6]['yardSlotId'].endswith('1') and e[6]['yardSlotId'][:-1] not in covered]
    gate_rows = []
    for k, e in enumerate(dis[:40]):
        start = max(e[4] + timedelta(hours=3), datetime(2026, 11, 10, 20, tzinfo=UTC)) + timedelta(minutes=9 * k)
        gate_rows.append((e[0], 'gate_out', None, start, start + timedelta(minutes=rng.randint(18, 35)), e[6], {'type': 'gate', 'portId': 'PRT-SIN', 'gateId': 'GATE-SIN-W'}))
    for k, e in enumerate(sorted(ev_rows + gate_rows, key=lambda e: (e[3], e[0])), 1):
        uid, kind, crane, start, end, frm, to = e
        events.append({'transferEventId': f'TRF-{k:05d}', 'cargoUnitId': uid, 'kind': kind, 'portId': 'PRT-SIN', 'terminalId': 'TRM-SIN-W',
                       'craneId': crane, 'via': 'quay_crane' if crane else 'truck', 'from': frm, 'to': to,
                       'startUtc': iso(start), 'endUtc': iso(end), 'classifier': 'EST', 'sourceType': 'synthetic-transfer-plan'})
    add_shipments(imports, 'mixed', 'PRT-SIN', 'VSL-0001', 'VYG-0001', lambda u: unit_by_id[u]['cargo']['category'], 'in_transit')
    add_shipments(through, 'mixed', 'PRT-RTM', 'VSL-0001', 'VYG-0001', lambda u: unit_by_id[u]['cargo']['category'], 'in_transit')
    add_shipments(exports, 'PRT-SIN', 'PRT-RTM', 'VSL-0001', 'VYG-0001', lambda u: unit_by_id[u]['cargo']['category'], 'booked')
    for s in shipments:
        if s['originPortId'] == 'mixed':
            s['originPortId'] = unit_by_id[s['cargoUnitIds'][0]]['originPortId']
            for uid in s['cargoUnitIds']:
                unit_by_id[uid]['originPortId'] = s['originPortId']

    # ---- Four more container ships: 192-slot grids, 45 boxes each, on board throughout the window ----
    for vid in ('VSL-0012', 'VSL-0023', 'VSL-0024', 'VSL-0027'):
        v, voy = vessel_map[vid], voyage_map[vessel_map[vid]['currentVoyageId']]
        bays_s, rows_s, below_s, above_s = list(range(2, 34, 4)), [1, 2, 3, 4, 5, 6], [2, 4], [82, 84]
        g = container_grid(bays_s, rows_s, below_s, above_s)
        plans.append({'stowagePlanId': f'STW-{vid}', 'vesselId': vid, 'voyageId': voy['voyageId'], 'archetype': 'container', 'asOfUtc': iso(window_start),
                      'grid': {'bays': bays_s, 'rows': rows_s, 'tiersBelow': below_s, 'tiersAbove': above_s, 'slotCount': len(g)},
                      'slots': g, 'compartments': [], 'sourceType': 'synthetic-stowage'})
        ids = []
        for b in bays_s:
            for r in rows_s:
                if len(ids) >= 45:
                    break
                for t in below_s[:1 + (b + r) % 2]:
                    if len(ids) < 45:
                        ids.append(new_container(vid, voy['voyageId'], voy['originPortId'], voy['destinationPortId'], vloc(vid, slot_id(b, r, t)))['cargoUnitId'])
        add_shipments(ids, voy['originPortId'], voy['destinationPortId'], vid, voy['voyageId'], lambda u: unit_by_id[u]['cargo']['category'], 'in_transit')

    # ---- Non-container archetypes: holds, tanks and decks with one lot each ----
    for vid, arche, count, cap in (('VSL-0047', 'lng', 4, 43500), ('VSL-0003', 'bulk', 7, 22000), ('VSL-0006', 'tanker', 6, 18500),
                                   ('VSL-0002', 'roro', 6, 650), ('VSL-0016', 'general', 4, 5200)):
        v, voy = vessel_map[vid], voyage_map[vessel_map[vid]['currentVoyageId']]
        commodity, unit = BULK_COMMODITIES[arche]
        kind = {'lng': 'tank', 'tanker': 'tank', 'roro': 'deck'}.get(arche, 'hold')
        comps, lot_ids = [], []
        for k in range(count):
            cid = f'CMP-{vid[4:]}-{kind[0].upper()}{k + 1}'
            fill = round(rng.uniform(0.9, 0.98) if arche in ('lng', 'tanker') else rng.uniform(0.6, 0.95), 3)
            lot = add_unit({'cargoUnitId': f'CU-{len(units) + 1:05d}', 'kind': {'lng': 'liquid_lot', 'tanker': 'liquid_lot', 'roro': 'vehicle_lot'}.get(arche, 'bulk_lot'),
                            'vesselId': vid, 'shipmentId': None, 'originPortId': voy['originPortId'], 'destinationPortId': voy['destinationPortId'],
                            'quantity': round(cap * fill) if unit != 'units' else int(cap * fill), 'unit': unit,
                            'cargo': {'category': commodity, 'detailsVisibility': 'summary', 'hazardClass': {'lng': '2.1', 'tanker': '3'}.get(arche)},
                            'initialLocation': {'type': 'compartment', 'vesselId': vid, 'compartmentId': cid}, 'sourceType': 'synthetic-cargo'})
            comps.append({'compartmentId': cid, 'kind': kind, 'index': k + 1, 'label': f'{kind.title()} {k + 1}', 'capacity': cap, 'unit': unit,
                          'fillFraction': fill, 'cargoUnitIds': [lot['cargoUnitId']]})
            lot_ids.append(lot['cargoUnitId'])
        plans.append({'stowagePlanId': f'STW-{vid}', 'vesselId': vid, 'voyageId': voy['voyageId'], 'archetype': arche, 'asOfUtc': iso(window_start),
                      'grid': None, 'slots': [], 'compartments': comps, 'sourceType': 'synthetic-stowage'})
        add_shipments(lot_ids, voy['originPortId'], voy['destinationPortId'], vid, voy['voyageId'], lambda u: commodity, 'in_transit')

    used_yard = {u['initialLocation'].get('yardSlotId') for u in units} | {e['to'].get('yardSlotId') for e in events}
    return {'cargoUnits.json': units, 'stowagePlans.json': plans, 'shipments.json': shipments, 'transferEvents.json': events,
            'yardSlots.json': [dict(y, occupiedInWindow=y['yardSlotId'] in used_yard) for y in yard]}


COMPACT = {'positions.json', 'flagshipTracks.json', 'cargoUnits.json', 'stowagePlans.json', 'shipments.json', 'transferEvents.json', 'yardSlots.json'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', type=int, default=92026)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'sample-data')
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    datasets, ctx = gen(args.seed)
    v2 = gen_v2(datasets, ctx, args.seed)
    v3 = gen_v3(datasets, ctx, v2, args.seed)

    def write(path, rows):
        if path.name in COMPACT:
            text = '[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n]\n'
        else:
            text = json.dumps(rows, ensure_ascii=False, indent=2) + '\n'
        path.write_text(text, encoding='utf-8')

    for name, rows in datasets.items():
        write(out / name, rows)
    (out / 'v2').mkdir(exist_ok=True)
    for name, rows in v2.items():
        write(out / 'v2' / name, rows)
    (out / 'v3').mkdir(exist_ok=True)
    for name, rows in v3.items():
        write(out / 'v3' / name, rows)
    manifest = {'dataset': 'PORTOS Synthetic Maritime Operations Demo', 'version': FIXTURE_VERSION, 'scenarioVersion': SCENARIO_VERSION, 'seed': args.seed,
                'fixedScenarioTimeUtc': iso(ANCHOR), 'generatedAtUtc': iso(ANCHOR),
                'replayRange': {'startUtc': iso(REPLAY_START), 'endUtc': iso(ANCHOR)},
                'sourceDisclosure': 'Illustrative simulation, not live AIS, port, weather or nautical navigation data',
                'counts': {name.replace('.json', ''): len(rows) for name, rows in datasets.items()},
                'scenario': {'vesselId': 'VSL-0001', 'vesselName': 'MV Pacific Horizon', 'voyageId': 'VYG-0001', 'incidentId': 'INC-0001',
                             'portId': 'PRT-SIN', 'destinationPortId': 'PRT-RTM', 'routeId': 'RTE-SIN-RTM', 'alternativeRouteId': 'RTE-SIN-RTM-CAPE',
                             'weatherHazardId': 'WX-0001', 'etaShiftHours': 18, 'dailyDelayCostUsd': 32000, 'expectedEstimatedExposureUsd': 24000},
                'scenarios': ['SCENARIO_SINGAPORE_CONGESTION', 'SCENARIO_INDIAN_OCEAN_WEATHER', 'SCENARIO_ROTTERDAM_BERTH', 'SCENARIO_NORTH_SEA_TRANSIT', 'SCENARIO_GENERAL_DISRUPTION'],
                'v2Module': {'path': 'v2/', 'files': sorted(v2.keys()), 'window': v2['scenario.json']['window'], 'flagshipVessels': len(ctx['flagship'])},
                'v3Module': {'path': 'v3/', 'version': V3_CARGO_VERSION, 'files': sorted(v3.keys()),
                             'counts': {name.replace('.json', ''): len(rows) for name, rows in v3.items()},
                             'flagshipStowage': {'vesselId': 'VSL-0001', 'stowagePlanId': 'STW-VSL-0001', 'slotCount': 800, 'terminalId': 'TRM-SIN-W'},
                             'disclosure': 'Simulated cargo, stowage and transfer plan. Not a real manifest, booking or terminal operating system record.'}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Generated', len(datasets), 'datasets:', manifest['counts'])
    print('V2 module:', {k: len(v) if isinstance(v, list) else 'object' for k, v in v2.items()})
    print('V3 module:', {k: len(v) for k, v in v3.items()})


if __name__ == '__main__':
    main()
