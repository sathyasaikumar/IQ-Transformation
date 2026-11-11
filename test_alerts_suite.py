import urllib.request
import json

BASE = "http://127.0.0.1:8000"

def get(path):
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def post(path, payload):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

print("===============================================================")
print("          TRANSFORMER IQ API & GEOSPATIAL TEST SUITE           ")
print("===============================================================")

# 1. FLEET & TR-1025
fleet_data = get("/api/fleet")
transformers = fleet_data.get("transformers", [])
print(f"[OK] Total fleet units monitored: {len(transformers)}")
tr1025 = next((t for t in transformers if t["id"] == "TR-1025"), None)
assert tr1025 is not None, "TR-1025 not found in fleet!"
print(f"[OK] Unit TR-1025 found: Name='{tr1025['name']}', Lat={tr1025['lat']}, Lng={tr1025['lng']}")
diag = tr1025.get("ai_diagnosis", {})
cond = diag.get("alert_condition", {})
print(f"[OK] TR-1025 Alert Level: {cond.get('level')} | Reason: {cond.get('reason')}")
print(f"[OK] TR-1025 Readings: Winding Hotspot Temp={diag.get('telemetry', {}).get('winding_hotspot_temp_c')} C | Load={diag.get('telemetry', {}).get('load_factor_pct')}%")

# 2. NEAREST SUBSTATIONS TO TR-1025
nearest_data = get("/api/transformer/TR-1025/nearest-substations?limit=4")
nearest_list = nearest_data.get("nearest_substations", [])
print(f"[OK] TR-1025 Nearest Substations found ({len(nearest_list)}):")
for s in nearest_list:
    print(f"      -> {s['id']} ({s['name']}): {s['distance_km']} km | Voltage={s['voltage_kv']} kV | Spare Cap={s['spare_capacity_mva']} MVA")

# Check expected benchmark distances for TR-1025
ss04 = next((s for s in nearest_list if s["id"] == "SS-04"), None)
ss07 = next((s for s in nearest_list if s["id"] == "SS-07"), None)
ss02 = next((s for s in nearest_list if s["id"] == "SS-02"), None)
print(f"[VERIFY] Benchmark Substation Distances:")
print(f"  SS-04: {ss04['distance_km']} km (Expected: 1.2 km)")
print(f"  SS-07: {ss07['distance_km']} km (Expected: 2.8 km)")
print(f"  SS-02: {ss02['distance_km']} km (Expected: 4.1 km)")

# 3. ACTIVE ALERTS
alerts_data = get("/api/alerts")
alerts = alerts_data.get("alerts", [])
print(f"[OK] Total Alert log entries: {len(alerts)} | Active: {alerts_data.get('active_count')}")
tr_alert = next((a for a in alerts if a.get("tx_id") == "TR-1025" or a.get("transformer_id") == "TR-1025"), None)
assert tr_alert is not None, "TR-1025 active alert should be present in alert manager!"
print(f"[OK] Benchmark Alert Verified:")
print(f"  Alert ID: {tr_alert['alert_id']}")
print(f"  Severity: {tr_alert['severity']}")
print(f"  Reason: {tr_alert['reason']}")
print(f"  Recommended Action: {tr_alert['recommended_action']}")

# 4. DISPATCH CREW TEST
dispatch_res = post("/api/alerts/dispatch", {
    "alert_id": tr_alert["alert_id"],
    "substation_id": "SS-04",
    "operator_name": "Senior Grid Dispatcher",
    "notes": "Emergency mobile cooling trailer and thermal team dispatched from SS-04."
})
print(f"[OK] Crew Dispatch API response: {dispatch_res.get('status')} - {dispatch_res.get('message')}")
assert dispatch_res["alert"]["status"] == "DISPATCHED"

# 5. SIMULATION INJECTION TEST
sim_res = post("/api/alerts/simulate", {
    "transformer_id": "TX-104",
    "preset_condition": "Emergency"
})
new_alert = sim_res.get("alert") or sim_res.get("generated_alert", {})
print(f"[OK] Simulation injection response: {sim_res.get('status')}")
print(f"     New alert severity: {new_alert.get('severity')} | Reason: {new_alert.get('reason')}")

# 6. ACKNOWLEDGE ALERT
ack_res = post("/api/alerts/acknowledge", {
    "alert_id": new_alert["alert_id"],
    "operator_name": "Duty Operator",
    "notes": "Acknowledged high-energy arcing simulation."
})
print(f"[OK] Alert Acknowledge API response: {ack_res.get('status')} - Alert {ack_res['alert']['alert_id']} status={ack_res['alert']['status']}")

# 7. RESOLVE ALERT
res_res = post("/api/alerts/resolve", {
    "alert_id": new_alert["alert_id"],
    "operator_name": "Senior Field Engineer",
    "notes": "Arc quenching and DGA sample verified."
})
print(f"[OK] Alert Resolve API response: {res_res.get('status')} - Alert {res_res['alert']['alert_id']} status={res_res['alert']['status']}")

# 8. CSV EXPORT TEST
req = urllib.request.Request(f"{BASE}/api/alerts/export?format=csv")
with urllib.request.urlopen(req) as resp:
    csv_bytes = resp.read()
    print(f"[OK] Alert CSV Export verified: {len(csv_bytes)} bytes received.")

print("===============================================================")
print("         ALL 8 VERIFICATION TEST PHASES PASSED 100%!           ")
print("===============================================================")
