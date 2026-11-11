"""
Transformer IQ - Machine Learning Model Training & Evaluation Pipeline
Trains Health Index (THI) Regressor and Fault Classification models.
Computes and serializes feature importances, confusion matrix, and evaluation metrics.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier, GradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error, accuracy_score, classification_report, confusion_matrix

FEATURE_COLS = [
    'mva_rating', 'nominal_kv', 'age_years', 'ambient_temp_c',
    'load_factor_pct', 'voltage_kv', 'current_a', 'top_oil_temp_c',
    'winding_hotspot_temp_c', 'vibration_mms', 'bdv_kv', 'moisture_ppm',
    'acidity_mg_koh_g', 'ift_mn_m', 'h2_ppm', 'ch4_ppm', 'c2h6_ppm',
    'c2h4_ppm', 'c2h2_ppm', 'co_ppm', 'co2_ppm', 'tdcg_ppm',
    'co2_co_ratio', 'duval_ch4_pct', 'duval_c2h4_pct', 'duval_c2h2_pct'
]

def train_pipeline():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data', 'transformer_dataset.csv')
    models_dir = os.path.join(base_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    print(f"Loading dataset from {data_path}...")
    df = pd.read_csv(data_path)
    
    X = df[FEATURE_COLS]
    y_hi = df['health_index']
    y_risk = df['failure_risk']
    y_fault = df['fault_diagnosis']
    
    # Split
    X_train, X_test, y_hi_train, y_hi_test, y_fault_train, y_fault_test, y_risk_train, y_risk_test = train_test_split(
        X, y_hi, y_fault, y_risk, test_size=0.20, random_state=42, stratify=y_fault
    )
    
    # Scaler
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    print("\n--- Training Health Index Regressor (Random Forest + Gradient Boosting) ---")
    hi_model = RandomForestRegressor(n_estimators=150, max_depth=16, random_state=42, n_jobs=-1)
    hi_model.fit(X_train, y_hi_train)
    
    y_hi_pred = hi_model.predict(X_test)
    hi_r2 = r2_score(y_hi_test, y_hi_pred)
    hi_mae = mean_absolute_error(y_hi_test, y_hi_pred)
    hi_rmse = np.sqrt(mean_squared_error(y_hi_test, y_hi_pred))
    
    print(f"Health Index R² Score: {hi_r2:.4f}")
    print(f"Health Index MAE: {hi_mae:.2f} %")
    print(f"Health Index RMSE: {hi_rmse:.2f} %")
    
    print("\n--- Training Fault Type Classifier ---")
    fault_model = RandomForestClassifier(n_estimators=150, max_depth=16, random_state=42, n_jobs=-1)
    fault_model.fit(X_train, y_fault_train)
    
    y_fault_pred = fault_model.predict(X_test)
    fault_acc = accuracy_score(y_fault_test, y_fault_pred)
    print(f"Fault Classification Accuracy: {fault_acc * 100:.2f}%")
    
    labels = sorted(list(df['fault_diagnosis'].unique()))
    cm = confusion_matrix(y_fault_test, y_fault_pred, labels=labels)
    cm_norm = confusion_matrix(y_fault_test, y_fault_pred, labels=labels, normalize='true')
    
    # Feature Importances for HI
    hi_importances = dict(zip(FEATURE_COLS, [round(float(v), 4) for v in hi_model.feature_importances_]))
    sorted_hi_importances = sorted(hi_importances.items(), key=lambda item: item[1], reverse=True)
    
    # Feature Importances for Fault
    fault_importances = dict(zip(FEATURE_COLS, [round(float(v), 4) for v in fault_model.feature_importances_]))
    sorted_fault_importances = sorted(fault_importances.items(), key=lambda item: item[1], reverse=True)
    
    # Save artifacts
    print("\nSaving models and scaler to disk...")
    joblib.dump(hi_model, os.path.join(models_dir, 'transformer_hi_model.joblib'))
    joblib.dump(fault_model, os.path.join(models_dir, 'transformer_fault_model.joblib'))
    joblib.dump(scaler, os.path.join(models_dir, 'scaler.joblib'))
    joblib.dump(FEATURE_COLS, os.path.join(models_dir, 'feature_cols.joblib'))
    
    metrics = {
        'health_index_metrics': {
            'r2_score': round(float(hi_r2), 4),
            'mae': round(float(hi_mae), 2),
            'rmse': round(float(hi_rmse), 2),
            'model_type': 'Random Forest Regressor (150 trees)'
        },
        'fault_classifier_metrics': {
            'accuracy': round(float(fault_acc), 4),
            'labels': labels,
            'confusion_matrix': cm.tolist(),
            'confusion_matrix_norm': np.round(cm_norm, 3).tolist(),
            'model_type': 'Random Forest Classifier (150 trees)'
        },
        'top_hi_features': sorted_hi_importances[:10],
        'top_fault_features': sorted_fault_importances[:10],
        'feature_names': FEATURE_COLS,
        'dataset_summary': {
            'total_samples': len(df),
            'train_samples': len(X_train),
            'test_samples': len(X_test),
            'num_features': len(FEATURE_COLS)
        }
    }
    
    with open(os.path.join(models_dir, 'metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Metrics saved to {os.path.join(models_dir, 'metrics.json')}")
    print("Training pipeline completed successfully!")

if __name__ == '__main__':
    train_pipeline()
