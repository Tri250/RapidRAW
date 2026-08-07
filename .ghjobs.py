import sys, json
d = json.load(sys.stdin)
for j in d['jobs']:
    c = j.get("conclusion") or "-"
    print(f'{j["status"]:12s} {c:10s} {j["name"]}')
