"""
Transformer IQ - Physics-Informed Synthetic Dataset Generator
Simulates realistic power transformer operational telemetry, oil degradation,
and Dissolved Gas Analysis (DGA) data based on IEEE C57.104, IEEE C57.91, and IEC 60599.
"""

import os
import numpy as np
import pandas as pd

def generate_transformer_dataset(num_samples: int = 1600, random_seed: int = 42) -> pd.DataFrame:
    np.random.seed(random_seed)
    
    records = []
    
    # Fault distribution profile:
    # 0: Healthy / Normal (~50%)
    # 1: Partial Discharge (PD) (~7%)
    # 2: Low-Temp Thermal Fault T1 (<300°C) (~8%)
    # 3: Medium-Temp Thermal Fault T2 (300-700°C) (~9%)
    # 4: High-Temp Thermal Fault T3 (>700°C) (~10%)
    # 5: Low-Energy Electrical Arcing D1 (~6%)
    # 6: High-Energy Electrical Arcing D2 (~5%)
    # 7: Cellulose / Paper Degradation (~5%)
    
    categories = [
        'Normal',
        'Partial Discharge (PD)',
        'Thermal Fault T1 (<300°C)',
        'Thermal Fault T2 (300-700°C)',
        'Thermal Fault T3 (>700°C)',
        'Electrical Discharge D1 (Low Energy)',
        'Electrical Discharge D2 (High Energy)',
        'Cellulose Degradation'
    ]
    probabilities = [0.48, 0.07, 0.08, 0.09, 0.10, 0.06, 0.06, 0.06]
    
    transformer_ratings = [25, 40, 63, 100, 160] # MVA
    
    for i in range(num_samples):
        # Pick category
        fault_type = np.random.choice(categories, p=probabilities)
        mva_rating = np.random.choice(transformer_ratings)
        age_years = np.random.uniform(1.0, 35.0)
        
        # Ambient temperature (15 to 45 °C)
        ambient_temp = np.random.normal(28, 6)
        ambient_temp = np.clip(ambient_temp, 10, 48)
        
        # Load factor (% of rating)
        if fault_type == 'Normal':
            load_factor = np.random.uniform(40, 85)
        elif fault_type in ['Thermal Fault T2 (300-700°C)', 'Thermal Fault T3 (>700°C)']:
            load_factor = np.random.uniform(85, 135) # Overloading causes thermal stress
        elif fault_type == 'Thermal Fault T1 (<300°C)':
            load_factor = np.random.uniform(70, 110)
        else:
            load_factor = np.random.uniform(45, 95)
            
        load_factor = np.clip(load_factor, 20, 140)
        
        # Electrical Voltage (nominal 132kV / 220kV / 400kV with minor fluctuations)
        nominal_kv = np.random.choice([66.0, 132.0, 220.0, 400.0])
        voltage_deviation = np.random.normal(0, 1.5) # %
        operating_voltage_kv = nominal_kv * (1 + voltage_deviation / 100)
        
        # Primary Load Current (Amperes)
        operating_current_a = (load_factor / 100) * (mva_rating * 1000) / (np.sqrt(3) * nominal_kv)
        operating_current_a += np.random.normal(0, operating_current_a * 0.02)
        
        # Vibration (mm/s) (Normal: 1-3 mm/s, Fault: 4-12 mm/s)
        if fault_type in ['Thermal Fault T3 (>700°C)', 'Electrical Discharge D2 (High Energy)']:
            vibration = np.random.uniform(4.5, 12.0)
        elif fault_type in ['Thermal Fault T2 (300-700°C)', 'Electrical Discharge D1 (Low Energy)']:
            vibration = np.random.uniform(3.0, 6.5)
        else:
            vibration = np.random.uniform(0.8, 2.8)
            
        # Top Oil Temperature & Hotspot Winding Temperature (IEEE C57.91)
        # Delta top-oil proportional to load^1.6
        delta_oil = 35 * (load_factor / 100)**1.6 + np.random.normal(0, 2)
        if fault_type == 'Thermal Fault T3 (>700°C)':
            delta_oil += np.random.uniform(20, 40)
        elif fault_type == 'Thermal Fault T2 (300-700°C)':
            delta_oil += np.random.uniform(10, 25)
            
        top_oil_temp = ambient_temp + delta_oil
        top_oil_temp = np.clip(top_oil_temp, 30, 125)
        
        # Winding Hotspot Temp is higher than Top Oil Temp by gradient (typically 15-35°C)
        gradient = 18 * (load_factor / 100)**1.8 + np.random.normal(0, 1.5)
        if fault_type == 'Thermal Fault T3 (>700°C)':
            gradient += np.random.uniform(25, 60)
        elif fault_type == 'Thermal Fault T2 (300-700°C)':
            gradient += np.random.uniform(15, 35)
            
        winding_hotspot_temp = top_oil_temp + gradient
        winding_hotspot_temp = np.clip(winding_hotspot_temp, 40, 175)
        
        # Oil Dielectric & Physical Properties
        # Breakdown Voltage BDV (kV) (Good > 50, Fair 35-50, Poor < 35)
        # Moisture in oil (ppm) (Good < 15, Fair 15-30, Poor > 30)
        # Acidity (mg KOH/g) (Good < 0.05, Fair 0.05-0.15, Poor > 0.20)
        # Interfacial Tension IFT (mN/m) (Good > 35, Fair 25-35, Poor < 22)
        
        if fault_type == 'Normal':
            moisture_ppm = np.random.uniform(8, 22) + (age_years * 0.3)
            bdv_kv = np.random.uniform(55, 75) - (moisture_ppm * 0.4)
            acidity = np.random.uniform(0.01, 0.06) + (age_years * 0.002)
            ift = np.random.uniform(38, 48) - (age_years * 0.3)
        elif fault_type == 'Cellulose Degradation':
            moisture_ppm = np.random.uniform(28, 55)
            bdv_kv = np.random.uniform(25, 45)
            acidity = np.random.uniform(0.12, 0.40)
            ift = np.random.uniform(16, 26)
        elif fault_type in ['Electrical Discharge D1 (Low Energy)', 'Electrical Discharge D2 (High Energy)']:
            moisture_ppm = np.random.uniform(18, 40)
            bdv_kv = np.random.uniform(20, 38)
            acidity = np.random.uniform(0.08, 0.22)
            ift = np.random.uniform(20, 32)
        else: # Thermal faults
            moisture_ppm = np.random.uniform(15, 35)
            bdv_kv = np.random.uniform(32, 52)
            acidity = np.random.uniform(0.06, 0.25)
            ift = np.random.uniform(22, 34)
            
        moisture_ppm = np.clip(moisture_ppm, 5, 70)
        bdv_kv = np.clip(bdv_kv, 12, 80)
        acidity = np.clip(acidity, 0.01, 0.65)
        ift = np.clip(ift, 12, 50)
        
        # Dissolved Gas Analysis (DGA) Concentrations (ppm)
        # Based on IEEE C57.104 & Duval Triangle 1 Zones:
        # PD: High H2 (>90% of CH4+C2H4+C2H2 is CH4 or mostly H2, low C2H2)
        # T1: Thermal < 300°C -> CH4 dominant, C2H4 < 20%, C2H2 < 4%
        # T2: Thermal 300-700°C -> 20% < C2H4 < 50%, C2H2 < 4%
        # T3: Thermal > 700°C -> C2H4 > 50%, C2H2 < 15%
        # D1: Sparking / Low energy arc -> C2H2 > 13%, C2H4 < 23%
        # D2: Heavy Arcing / High energy arc -> C2H2 > 29% or C2H2 & C2H4 dominant
        # Cellulose: CO > 700 ppm, CO2 > 5000 ppm, CO2/CO < 3 or > 12
        
        if fault_type == 'Normal':
            h2 = np.random.uniform(5, 60)
            ch4 = np.random.uniform(5, 45)
            c2h6 = np.random.uniform(5, 30)
            c2h4 = np.random.uniform(5, 35)
            c2h2 = np.random.uniform(0, 2)
            co = np.random.uniform(100, 350)
            co2 = np.random.uniform(1200, 3000)
        elif fault_type == 'Partial Discharge (PD)':
            h2 = np.random.uniform(300, 2500)
            ch4 = np.random.uniform(40, 150)
            c2h6 = np.random.uniform(10, 40)
            c2h4 = np.random.uniform(5, 25)
            c2h2 = np.random.uniform(0, 3)
            co = np.random.uniform(150, 400)
            co2 = np.random.uniform(1500, 3500)
        elif fault_type == 'Thermal Fault T1 (<300°C)':
            h2 = np.random.uniform(50, 250)
            ch4 = np.random.uniform(220, 950) # CH4 dominant
            c2h6 = np.random.uniform(80, 400)
            c2h4 = np.random.uniform(30, 120)
            c2h2 = np.random.uniform(0, 4)
            co = np.random.uniform(200, 500)
            co2 = np.random.uniform(2000, 4500)
        elif fault_type == 'Thermal Fault T2 (300-700°C)':
            h2 = np.random.uniform(80, 450)
            ch4 = np.random.uniform(150, 600)
            c2h6 = np.random.uniform(120, 500)
            c2h4 = np.random.uniform(280, 1100) # C2H4 elevated
            c2h2 = np.random.uniform(1, 10)
            co = np.random.uniform(300, 700)
            co2 = np.random.uniform(2500, 6000)
        elif fault_type == 'Thermal Fault T3 (>700°C)':
            h2 = np.random.uniform(120, 800)
            ch4 = np.random.uniform(100, 700)
            c2h6 = np.random.uniform(50, 350)
            c2h4 = np.random.uniform(800, 3500) # C2H4 very high
            c2h2 = np.random.uniform(10, 90)
            co = np.random.uniform(400, 1000)
            co2 = np.random.uniform(3000, 8000)
        elif fault_type == 'Electrical Discharge D1 (Low Energy)':
            h2 = np.random.uniform(200, 1200)
            ch4 = np.random.uniform(50, 300)
            c2h6 = np.random.uniform(20, 100)
            c2h4 = np.random.uniform(40, 200)
            c2h2 = np.random.uniform(45, 300) # C2H2 present
            co = np.random.uniform(150, 500)
            co2 = np.random.uniform(1800, 4500)
        elif fault_type == 'Electrical Discharge D2 (High Energy)':
            h2 = np.random.uniform(500, 4000)
            ch4 = np.random.uniform(200, 1500)
            c2h6 = np.random.uniform(50, 400)
            c2h4 = np.random.uniform(300, 2200)
            c2h2 = np.random.uniform(350, 3200) # C2H2 extremely high
            co = np.random.uniform(300, 900)
            co2 = np.random.uniform(2500, 7000)
        elif fault_type == 'Cellulose Degradation':
            h2 = np.random.uniform(30, 180)
            ch4 = np.random.uniform(30, 150)
            c2h6 = np.random.uniform(20, 120)
            c2h4 = np.random.uniform(20, 100)
            c2h2 = np.random.uniform(0, 3)
            co = np.random.uniform(850, 2200) # Very high CO
            co2 = np.random.uniform(7500, 18000) # Very high CO2
            
        # Total Dissolved Combustible Gas (TDCG)
        tdcg = h2 + ch4 + c2h6 + c2h4 + c2h2 + co
        
        # Gas ratios
        co2_co_ratio = co2 / max(co, 1.0)
        
        # Duval Triangle 1 coordinates
        dga_sum = ch4 + c2h4 + c2h2
        if dga_sum > 0:
            duval_ch4_pct = (ch4 / dga_sum) * 100
            duval_c2h4_pct = (c2h4 / dga_sum) * 100
            duval_c2h2_pct = (c2h2 / dga_sum) * 100
        else:
            duval_ch4_pct = 33.33
            duval_c2h4_pct = 33.33
            duval_c2h2_pct = 33.33
            
        # Transformer Health Index (THI) calculation (0 to 100%)
        # Weighted penalty formulation according to IEEE standard indices
        thi = 100.0
        
        # Thermal penalties
        if winding_hotspot_temp > 120:
            thi -= min(35.0, (winding_hotspot_temp - 120) * 0.9)
        elif winding_hotspot_temp > 98:
            thi -= (winding_hotspot_temp - 98) * 0.4
            
        if top_oil_temp > 90:
            thi -= min(20.0, (top_oil_temp - 90) * 0.7)
            
        # DGA TDCG penalties
        if tdcg > 4630: # IEEE Condition 4
            thi -= 35.0
        elif tdcg > 1920: # IEEE Condition 3
            thi -= 22.0
        elif tdcg > 720: # IEEE Condition 2
            thi -= 12.0
            
        # Arcing penalty
        if c2h2 > 35:
            thi -= min(40.0, 15 + c2h2 * 0.05)
        elif c2h2 > 2:
            thi -= (c2h2 * 2.0)
            
        # Oil quality penalties
        if bdv_kv < 30:
            thi -= min(25.0, (30 - bdv_kv) * 1.0)
        elif bdv_kv < 45:
            thi -= (45 - bdv_kv) * 0.3
            
        if moisture_ppm > 35:
            thi -= min(20.0, (moisture_ppm - 35) * 0.6)
        elif moisture_ppm > 20:
            thi -= (moisture_ppm - 20) * 0.3
            
        if acidity > 0.2:
            thi -= min(15.0, (acidity - 0.2) * 40.0)
            
        # Age penalty
        thi -= age_years * 0.4
        
        # Vibration penalty
        if vibration > 4.5:
            thi -= min(15.0, (vibration - 4.5) * 2.0)
            
        thi = np.clip(thi + np.random.normal(0, 1.5), 5.0, 99.0)
        thi = round(float(thi), 2)
        
        # Failure Risk Category
        if thi >= 80.0:
            risk_category = 'Normal'
            failure_prob = round(float(np.random.uniform(1.0, 12.0)), 2)
        elif thi >= 60.0:
            risk_category = 'Moderate Risk'
            failure_prob = round(float(np.random.uniform(15.0, 45.0)), 2)
        else:
            risk_category = 'Critical Alert'
            failure_prob = round(float(np.random.uniform(50.0, 98.0)), 2)
            
        # Remaining Useful Life (RUL) estimation in months (Arrhenius relation)
        # Base life: 40 years = 480 months. Degraded by aging acceleration factor.
        aging_factor = np.exp(0.06 * max(0, winding_hotspot_temp - 98))
        if thi > 80:
            rul_months = max(12, int(480 - (age_years * 12 * aging_factor * 0.6)))
        elif thi > 60:
            rul_months = max(6, int(180 - (age_years * 4 * aging_factor)))
        else:
            rul_months = max(1, int(48 / (aging_factor + 0.5)))
            
        records.append({
            'transformer_id': f'TX-{1000 + i}',
            'mva_rating': mva_rating,
            'nominal_kv': nominal_kv,
            'age_years': round(float(age_years), 1),
            'ambient_temp_c': round(float(ambient_temp), 1),
            'load_factor_pct': round(float(load_factor), 1),
            'voltage_kv': round(float(operating_voltage_kv), 2),
            'current_a': round(float(operating_current_a), 1),
            'top_oil_temp_c': round(float(top_oil_temp), 1),
            'winding_hotspot_temp_c': round(float(winding_hotspot_temp), 1),
            'vibration_mms': round(float(vibration), 2),
            'bdv_kv': round(float(bdv_kv), 1),
            'moisture_ppm': round(float(moisture_ppm), 1),
            'acidity_mg_koh_g': round(float(acidity), 3),
            'ift_mn_m': round(float(ift), 1),
            'h2_ppm': round(float(h2), 1),
            'ch4_ppm': round(float(ch4), 1),
            'c2h6_ppm': round(float(c2h6), 1),
            'c2h4_ppm': round(float(c2h4), 1),
            'c2h2_ppm': round(float(c2h2), 1),
            'co_ppm': round(float(co), 1),
            'co2_ppm': round(float(co2), 1),
            'tdcg_ppm': round(float(tdcg), 1),
            'co2_co_ratio': round(float(co2_co_ratio), 2),
            'duval_ch4_pct': round(float(duval_ch4_pct), 2),
            'duval_c2h4_pct': round(float(duval_c2h4_pct), 2),
            'duval_c2h2_pct': round(float(duval_c2h2_pct), 2),
            'health_index': thi,
            'failure_risk': risk_category,
            'failure_probability_pct': failure_prob,
            'rul_months': rul_months,
            'fault_diagnosis': fault_type
        })
        
    df = pd.DataFrame(records)
    return df

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    out_path = os.path.join(data_dir, 'transformer_dataset.csv')
    df = generate_transformer_dataset(num_samples=1800)
    df.to_csv(out_path, index=False)
    print(f"Generated {len(df)} transformer records saved to: {out_path}")
    print("\nClass Distribution:")
    print(df['fault_diagnosis'].value_counts())
    print("\nRisk Category Distribution:")
    print(df['failure_risk'].value_counts())
    print(f"\nHealth Index Mean: {df['health_index'].mean():.2f} (Min: {df['health_index'].min():.2f}, Max: {df['health_index'].max():.2f})")
