import csv
import json

features = []

with open("CA.txt", encoding="utf-8") as f:
    for row in csv.reader(f, delimiter="\t"):
        feature_class = row[6]
        population = int(row[14] or 0)

        if feature_class != "P" or population < 5000:
            continue

        features.append({
            "type": "Feature",
            "properties": {
                "name": row[1],
                "population": population,
                "geonameid": row[0],
                "province": row[10]
            },
            "geometry": {
                "type": "Point",
                "coordinates": [
                    float(row[5]),
                    float(row[4])
                ]
            }
        })

with open("cities.geojson", "w", encoding="utf-8") as f:
    json.dump(
        {
            "type": "FeatureCollection",
            "features": features
        },
        f,
        ensure_ascii=False
    )

print(f"Generated {len(features)} cities")