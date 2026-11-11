"""
Transformer IQ - DGA (Dissolved Gas Analysis) & Diagnostic Standards Engine
Implements IEEE C57.104, IEC 60599, and Duval Triangle 1 graphical algorithms.
"""

from typing import Dict, Any, Tuple, List

# IEEE C57.104 90th & 95th Percentile Typical Gas Limits (ppm)
# Condition 1: Normal, Condition 2: Caution / Trending, Condition 3: Warning, Condition 4: Excessive
IEEE_GAS_THRESHOLDS = {
    'h2': [100, 200, 300],
    'ch4': [120, 400, 1000],
    'c2h6': [65, 100, 150],
    'c2h4': [50, 100, 200],
    'c2h2': [1, 2, 5],
    'co': [350, 570, 1400],
    'co2': [2500, 4000, 10000],
    'tdcg': [720, 1920, 4630]
}

def evaluate_ieee_c57_104(gases: Dict[str, float]) -> Dict[str, Any]:
    """
    Evaluates individual gas levels and TDCG according to IEEE C57.104 standard.
    Returns overall Condition level (1: Normal, 2: Caution, 3: Warning, 4: Critical).
    """
    tdcg = sum([
        gases.get('h2', 0),
        gases.get('ch4', 0),
        gases.get('c2h6', 0),
        gases.get('c2h4', 0),
        gases.get('c2h2', 0),
        gases.get('co', 0)
    ])
    
    gas_eval = {}
    max_cond = 1
    
    for gas_name, limits in IEEE_GAS_THRESHOLDS.items():
        val = tdcg if gas_name == 'tdcg' else gases.get(gas_name, 0)
        if val <= limits[0]:
            cond = 1
            status = 'Normal'
        elif val <= limits[1]:
            cond = 2
            status = 'Caution'
        elif val <= limits[2]:
            cond = 3
            status = 'Warning'
        else:
            cond = 4
            status = 'Critical'
            
        gas_eval[gas_name] = {
            'value': round(val, 1),
            'condition': cond,
            'status': status,
            'limits': limits
        }
        if cond > max_cond:
            max_cond = cond
            
    cond_labels = {
        1: 'Condition 1: Satisfactory / Normal',
        2: 'Condition 2: Elevated Gas Levels (Increase Sampling Rate)',
        3: 'Condition 3: Significant Decomposition (Active Fault Possible)',
        4: 'Condition 4: Excessive Decomposition (Immediate De-energization / Action Required)'
    }
    
    return {
        'overall_condition': max_cond,
        'condition_label': cond_labels[max_cond],
        'tdcg': round(tdcg, 1),
        'gas_breakdown': gas_eval
    }

def calculate_duval_triangle_1(ch4: float, c2h4: float, c2h2: float) -> Tuple[float, float, float, str, str]:
    """
    Calculates Duval Triangle 1 percentages (%CH4, %C2H4, %C2H2) and determines the exact fault zone:
    - PD: Partial Discharge (%CH4 >= 98%)
    - T1: Thermal fault < 300°C (%CH4 >= 76%, %C2H4 < 20%, %C2H2 < 4%)
    - T2: Thermal fault 300°C to 700°C (20% <= %C2H4 < 50%, %C2H2 < 4%)
    - T3: Thermal fault > 700°C (%C2H4 >= 50%, %C2H2 < 15%)
    - D1: Low energy discharge / Sparking (%C2H2 >= 13%, %C2H4 < 23%, %CH4 is remainder)
    - D2: High energy discharge / Arcing (%C2H2 >= 29% OR (%C2H2 >= 13% and %C2H4 >= 23%))
    - DT: Thermal & Electrical mixture (Other intermediate zones)
    """
    total = ch4 + c2h4 + c2h2
    if total <= 0:
        return (33.33, 33.33, 33.33, "Normal / Undetermined", "No combustible gas signatures present.")
        
    pct_ch4 = round((ch4 / total) * 100.0, 2)
    pct_c2h4 = round((c2h4 / total) * 100.0, 2)
    pct_c2h2 = round((c2h2 / total) * 100.0, 2)
    
    # Duval Triangle 1 standard zones classification
    if pct_ch4 >= 98.0:
        zone = "PD"
        zone_desc = "Partial Discharge (Cold plasma, void discharge in solid insulation)"
    elif pct_c2h2 < 4.0:
        if pct_c2h4 < 20.0 and pct_ch4 >= 76.0:
            zone = "T1"
            zone_desc = "Thermal Fault T1 (T < 300°C - Overheating of wiring/oil)"
        elif 20.0 <= pct_c2h4 < 50.0:
            zone = "T2"
            zone_desc = "Thermal Fault T2 (300°C < T < 700°C - Localized overheating of core/windings)"
        else:
            zone = "T3"
            zone_desc = "Thermal Fault T3 (T > 700°C - Severe overheating of core & paper carbonization)"
    elif pct_c2h2 >= 29.0:
        zone = "D2"
        zone_desc = "Electrical Discharge D2 (High-energy arcing, flashover, breakdown)"
    elif pct_c2h2 >= 13.0 and pct_c2h4 < 23.0:
        zone = "D1"
        zone_desc = "Electrical Discharge D1 (Low-energy discharge, sparking, tracking)"
    elif pct_c2h4 >= 50.0 and pct_c2h2 < 15.0:
        zone = "T3"
        zone_desc = "Thermal Fault T3 (T > 700°C - Severe thermal stress)"
    elif 13.0 <= pct_c2h2 < 29.0 and pct_c2h4 >= 23.0:
        zone = "D2"
        zone_desc = "Electrical Discharge D2 (High energy arcing with severe localized thermal fault)"
    elif 4.0 <= pct_c2h2 < 13.0 and pct_c2h4 < 40.0:
        zone = "DT"
        zone_desc = "Thermal & Electrical Mixture (Combination of arcing and localized thermal fault)"
    else:
        zone = "T2"
        zone_desc = "Thermal Fault T2 (Medium-temperature thermal fault)"
        
    return (pct_ch4, pct_c2h4, pct_c2h2, zone, zone_desc)

def generate_prescriptive_maintenance(telemetry: Dict[str, Any], hi: float, fault_diagnosis: str, ieee_cond: int) -> List[Dict[str, Any]]:
    """
    Generates structured, actionable prescriptive maintenance tasks based on AI & physical parameters.
    """
    actions = []
    
    # Immediate critical actions
    if hi < 50 or ieee_cond == 4 or 'D2' in fault_diagnosis or 'T3' in fault_diagnosis:
        actions.append({
            'priority': 'CRITICAL',
            'badge': 'Urgent Action',
            'action': 'Schedule Emergency De-energization & Internal Tank Inspection',
            'detail': 'High-energy electrical arcing (D2) or severe overheating (T3) detected. Continued operation risks catastrophic tank rupture or flashover fire.',
            'category': 'Emergency Dispatch',
            'timeframe': '< 24 Hours'
        })
        
    # Dielectric Oil Actions
    bdv = telemetry.get('bdv_kv', 60.0)
    moisture = telemetry.get('moisture_ppm', 15.0)
    acidity = telemetry.get('acidity_mg_koh_g', 0.03)
    
    if bdv < 35.0 or moisture > 30.0:
        actions.append({
            'priority': 'HIGH',
            'badge': 'Dielectric Restoration',
            'action': 'Vacuum Oil Dehydration & Online Oil Centrifuging',
            'detail': f'Moisture level ({moisture} ppm) exceeds threshold and BDV is degraded ({bdv} kV). Perform vacuum degassing and filter paper change.',
            'category': 'Oil Treatment',
            'timeframe': '1 - 3 Days'
        })
        
    if acidity > 0.15:
        actions.append({
            'priority': 'MEDIUM',
            'badge': 'Chemical Reconditioning',
            'action': 'Fuller\'s Earth Oil Reclamation or Oil Replacement',
            'detail': f'Acidity ({acidity} mg KOH/g) indicates severe oil oxidation and sludge formation risk. Neutralize oil and replace antioxidant inhibitors.',
            'category': 'Oil Reclamation',
            'timeframe': '1 - 2 Weeks'
        })
        
    # Thermal & Cooling Actions
    hst = telemetry.get('winding_hotspot_temp_c', 75.0)
    tot = telemetry.get('top_oil_temp_c', 60.0)
    load = telemetry.get('load_factor_pct', 70.0)
    
    if hst > 115.0 or tot > 85.0:
        actions.append({
            'priority': 'HIGH',
            'badge': 'Cooling System Overhaul',
            'action': 'Inspect Forced Air (FA) Radiator Fans and Oil Pump Circulation',
            'detail': f'Winding hotspot reached {hst}°C (Top oil {tot}°C) under {load}% load. Check radiator cleanliness, thermostatic fan switches, and pump impeller bearings.',
            'category': 'Thermal Subsystem',
            'timeframe': '48 Hours'
        })
        
    # Paper / Cellulose Aging Actions
    co = telemetry.get('co_ppm', 200)
    co2 = telemetry.get('co2_ppm', 2000)
    if co > 700 or (co > 0 and (co2 / co) < 3.0):
        actions.append({
            'priority': 'MEDIUM',
            'badge': 'Insulation Assessment',
            'action': 'Furan Analysis (HPLC 2-FAL) & Degree of Polymerization (DP) Test',
            'detail': f'Elevated Carbon Oxides (CO: {co} ppm, CO2: {co2} ppm) indicates accelerated solid paper cellulose insulation degradation.',
            'category': 'Solid Insulation',
            'timeframe': '1 Week'
        })
        
    # Vibration / Mechanical Actions
    vib = telemetry.get('vibration_mms', 2.0)
    if vib > 4.5:
        actions.append({
            'priority': 'MEDIUM',
            'badge': 'Mechanical Integrity',
            'action': 'Core Clamp Tightening & Sweep Frequency Response Analysis (SFRA)',
            'detail': f'Vibration level {vib} mm/s is abnormal. Check core clamp bolt torques, winding looseness, and electromagnetic tank resonance.',
            'category': 'Mechanical Subsystem',
            'timeframe': 'Next Planned Outage'
        })
        
    # Routine / Baseline action if healthy
    if len(actions) == 0:
        actions.append({
            'priority': 'LOW',
            'badge': 'Routine Health Check',
            'action': 'Standard 6-Month DGA & Thermal Camera Thermography',
            'detail': 'All telemetry and gas parameters are within normal IEEE C57.104 limits. Maintain standard scheduled quarterly sampling.',
            'category': 'Routine Surveillance',
            'timeframe': 'Quarterly'
        })
        
    return actions
