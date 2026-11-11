/**
 * Transformer IQ - Application Logic & Mission Control Engine
 * Multi-Theme SCADA, Digital Twin Component Inspector, Duval Triangle 1, What-If Lab, and AI Studio
 */

// Application State
const state = {
    activeTab: 'tab-alerts-map',
    currentTheme: localStorage.getItem('transformer_iq_theme') || 'aurora',
    fleetData: null,
    substationsData: null,
    alertsData: null,
    activeTransformerId: 'TR-1025',
    activeAlertTxId: 'TR-1025',
    activeTransformerDetails: null,
    chartTelemetry: null,
    chartDga: null,
    chartFeatures: null,
    telemetryChartMode: 'thermal', // 'thermal' or 'health'
    simDebounceTimer: null,
    datasetPage: 1,
    datasetPageSize: 12,
    modelMetrics: null,
    map: null,
    mapMarkers: {},
    proximityLines: [],
    audioAlarmEnabled: true,
    audioContext: null,
    duvalProbeCoords: null,
    hoveredDuvalZone: null
};

// DOM Content Loaded Entry Point
document.addEventListener('DOMContentLoaded', async () => {
    initThemeSwitcher();
    initNavigation();
    initClock();
    initFilterHandlers();
    initSimulationControls();
    initModalHandlers();
    initDuvalInteractivity();
    initDuvalExplainer();
    initTransformerAnatomy();
    initPinnPipeline();
    initUniqueModelModal();
    initAlertSystem();
    voiceEngine.init();
    initDatasetUploadHandlers();
    initSliderControls();

    // Initial Data Fetch
    await fetchFleetData();
    await loadSubstationsAndAlerts();
    await loadActiveTransformer(state.activeTransformerId);
    await fetchModelMetrics();
    await fetchDatasetPage(1);

    // Auto Refresh Telemetry Stream every 3.5 seconds for live real-time monitoring
    setInterval(async () => {
        await refreshLiveTelemetry();
    }, 3500);
});

// --------------------------------------------------------------------------
// Multi-Theme Engine
// --------------------------------------------------------------------------
function initThemeSwitcher() {
    setTheme(state.currentTheme);

    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            setTheme(theme);
        });
    });
}

function setTheme(themeName) {
    state.currentTheme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('transformer_iq_theme', themeName);

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
    });

    // Redraw Duval and charts to match theme palette
    setTimeout(() => {
        if (state.activeTab === 'tab-duval') drawDuvalTriangle();
        if (state.chartTelemetry) renderTelemetryChart();
        if (state.chartDga && state.activeTransformerDetails) {
            renderDgaChart(state.activeTransformerDetails.transformer, state.activeTransformerDetails.ai_diagnosis.ieee_c57_104);
        }
    }, 50);

    showToast(`🎨 Theme switched to ${themeName.toUpperCase()}`);
}

// --------------------------------------------------------------------------
// Navigation & Tabs
// --------------------------------------------------------------------------
function initNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    // Smoothly center active tab button inside the sliding ribbon
    const activeTabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (activeTabBtn) {
        activeTabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Tab-specific trigger updates
    if (tabId === 'tab-alerts-map') {
        if (state.map) {
            setTimeout(() => {
                state.map.invalidateSize();
            }, 100);
        }
    } else if (tabId === 'tab-duval') {
        drawDuvalTriangle();
    } else if (tabId === 'tab-diagnostics') {
        if (state.chartTelemetry) state.chartTelemetry.resize();
        if (state.chartDga) state.chartDga.resize();
    } else if (tabId === 'tab-ai-studio') {
        if (state.chartFeatures) state.chartFeatures.resize();
    }
}

// --------------------------------------------------------------------------
// Clock & SCADA Stream
// --------------------------------------------------------------------------
function initClock() {
    const clockEl = document.getElementById('scadaClock');
    function updateTime() {
        const now = new Date();
        clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC';
    }
    updateTime();
    setInterval(updateTime, 1000);
}

// --------------------------------------------------------------------------
// Fleet Data & Overview Cards
// --------------------------------------------------------------------------
async function fetchFleetData() {
    try {
        const res = await fetch('/api/fleet');
        if (!res.ok) throw new Error('Fleet fetch failed');
        const data = await res.json();
        state.fleetData = data;

        // Update Top Header summary
        if (document.getElementById('summaryHealthy')) document.getElementById('summaryHealthy').textContent = data.healthy_count;
        if (document.getElementById('summaryWarning')) document.getElementById('summaryWarning').textContent = data.warning_count;
        if (document.getElementById('summaryCritical')) document.getElementById('summaryCritical').textContent = data.critical_count;
        if (document.getElementById('summaryEmergency')) document.getElementById('summaryEmergency').textContent = data.emergency_count || 0;
        if (document.getElementById('summaryAvgHI')) document.getElementById('summaryAvgHI').textContent = `${data.average_health_index}%`;

        // Update nav badge
        const pillEl = document.getElementById('navAlertPill');
        if (pillEl) {
            if (data.emergency_count > 0) {
                pillEl.textContent = `${data.emergency_count} EMERG`;
                pillEl.style.background = '#e11d48';
            } else if (data.critical_count > 0) {
                pillEl.textContent = `${data.critical_count} CRIT`;
                pillEl.style.background = '#f43f5e';
            } else if (data.warning_count > 0) {
                pillEl.textContent = `${data.warning_count} WARN`;
                pillEl.style.background = '#f59e0b';
            } else {
                pillEl.textContent = 'ALL SAFE';
                pillEl.style.background = '#10b981';
            }
        }

        renderFleetCards(data.transformers);
        populateTransformerSelects(data.transformers);
    } catch (err) {
        console.error('Error loading fleet:', err);
        showToast('⚠️ Could not connect to Transformer IQ API.');
    }
}

function renderFleetCards(transformers) {
    const grid = document.getElementById('fleetCardsGrid');
    const filter = document.getElementById('fleetStatusFilter').value;

    grid.innerHTML = '';

    transformers.forEach(tx => {
        const ai = tx.ai_diagnosis;
        const riskCat = ai.failure_risk_category;

        if (filter !== 'ALL' && riskCat !== filter) {
            return;
        }

        let cardClass = 'card-healthy';
        let badgeClass = 'badge-healthy';
        if (riskCat === 'Moderate Risk') {
            cardClass = 'card-warning';
            badgeClass = 'badge-warning';
        } else if (riskCat === 'Critical Alert') {
            cardClass = 'card-critical';
            badgeClass = 'badge-critical';
        }

        const card = document.createElement('div');
        card.className = `fleet-card ${cardClass}`;
        card.innerHTML = `
            <div>
                <div class="card-header-row">
                    <div>
                        <span class="tx-id-badge">${tx.id}</span>
                        <h3 class="tx-name">${tx.name}</h3>
                        <span class="tx-location">${tx.location}</span>
                    </div>
                    <span class="card-status-badge ${badgeClass}">${riskCat}</span>
                </div>

                <div class="card-metrics-grid">
                    <div class="card-metric-item">
                        <span class="card-metric-label">Rating & Age</span>
                        <span class="card-metric-val">${tx.mva_rating} MVA (${tx.age_years}y)</span>
                    </div>
                    <div class="card-metric-item">
                        <span class="card-metric-label">Load Factor</span>
                        <span class="card-metric-val ${tx.load_factor_pct > 100 ? 'text-danger' : ''}">${tx.load_factor_pct}%</span>
                    </div>
                    <div class="card-metric-item">
                        <span class="card-metric-label">Winding Hotspot</span>
                        <span class="card-metric-val ${tx.winding_hotspot_temp_c > 110 ? 'text-danger' : (tx.winding_hotspot_temp_c > 90 ? 'text-warning' : '')}">${tx.winding_hotspot_temp_c} °C</span>
                    </div>
                    <div class="card-metric-item">
                        <span class="card-metric-label">Dielectric BDV</span>
                        <span class="card-metric-val ${tx.bdv_kv < 35 ? 'text-danger' : ''}">${tx.bdv_kv} kV</span>
                    </div>
                </div>

                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">
                    <strong>AI Diagnosis:</strong> ${ai.predicted_fault_type}
                </div>
            </div>

            <div class="card-hi-row">
                <div>
                    <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">HEALTH INDEX</span>
                    <span class="card-hi-val" style="color: ${ai.failure_risk_color};">${ai.health_index}%</span>
                </div>
                <button class="btn-card-inspect" onclick="inspectTransformer('${tx.id}')">Inspect Unit →</button>
            </div>
        `;

        grid.appendChild(card);
    });
}

function initFilterHandlers() {
    document.getElementById('fleetStatusFilter').addEventListener('change', () => {
        if (state.fleetData) {
            renderFleetCards(state.fleetData.transformers);
        }
    });

    document.getElementById('activeTransformerSelect').addEventListener('change', (e) => {
        loadActiveTransformer(e.target.value);
    });

    document.getElementById('btnRefreshDiagnostics').addEventListener('click', async () => {
        await loadActiveTransformer(state.activeTransformerId);
        showToast('⚡ Live telemetry feed updated.');
    });

    // Chart toggles
    document.querySelectorAll('.chart-toggles .toggle-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.chart-toggles .toggle-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.telemetryChartMode = chip.getAttribute('data-chart');
            renderTelemetryChart();
        });
    });
}

function populateTransformerSelects(transformers) {
    const select = document.getElementById('activeTransformerSelect');
    select.innerHTML = '';
    transformers.forEach(tx => {
        const opt = document.createElement('option');
        opt.value = tx.id;
        opt.textContent = `${tx.id} - ${tx.name} (${tx.mva_rating} MVA)`;
        if (tx.id === state.activeTransformerId) opt.selected = true;
        select.appendChild(opt);
    });
}

window.inspectTransformer = function(txId) {
    state.activeTransformerId = txId;
    document.getElementById('activeTransformerSelect').value = txId;
    loadActiveTransformer(txId);
    switchTab('tab-diagnostics');
};

// --------------------------------------------------------------------------
// Deep Dive Diagnostics & Digital Twin
// --------------------------------------------------------------------------
async function loadActiveTransformer(txId) {
    try {
        state.activeTransformerId = txId;
        const res = await fetch(`/api/transformer/${txId}`);
        if (!res.ok) throw new Error('Transformer fetch failed');
        const data = await res.json();
        state.activeTransformerDetails = data;

        const tx = data.transformer;
        const ai = data.ai_diagnosis;

        // Update selector badges
        document.getElementById('activeTxRatingBadge').textContent = `${tx.mva_rating} MVA • ${tx.nominal_kv} kV`;
        document.getElementById('activeTxCoolingBadge').textContent = `${tx.cooling_type} • Age ${tx.age_years}y`;

        // Update KPIs
        updateHealthGauge(ai.health_index, ai.failure_risk_category, ai.failure_risk_color);
        
        document.getElementById('kpiRiskProb').textContent = `${ai.failure_probability_pct}%`;
        document.getElementById('kpiRiskCategory').textContent = ai.failure_risk_category;
        document.getElementById('kpiRiskCategory').style.color = ai.failure_risk_color;
        
        const riskFill = document.getElementById('riskProgressBar');
        riskFill.style.width = `${ai.failure_probability_pct}%`;
        riskFill.style.backgroundColor = ai.failure_risk_color;

        document.getElementById('kpiFaultType').textContent = ai.predicted_fault_type;
        document.getElementById('kpiDuvalQuickTag').textContent = `Duval 1: Zone ${ai.duval_triangle_1.zone}`;

        document.getElementById('kpiRulMonths').textContent = `${ai.rul_months} Mos`;
        document.getElementById('kpiRulYears').textContent = `${ai.rul_years} Yrs`;

        // Update Digital Twin SVG & Overlay
        updateDigitalTwin(tx, ai);

        // Update Charts
        renderTelemetryChart();
        renderDgaChart(tx, ai.ieee_c57_104);

        // Update Duval View
        state.duvalProbeCoords = null;
        drawDuvalTriangle();
        updateDuvalZoneInfo(ai.duval_triangle_1);
        updateGasRatioBar(ai.duval_triangle_1.ch4_pct, ai.duval_triangle_1.c2h4_pct, ai.duval_triangle_1.c2h2_pct);
        const duvalUnitEl = document.getElementById('duvalUnitId');
        if (duvalUnitEl) duvalUnitEl.textContent = tx.id;
        const duvalUnitBadge = document.getElementById('duvalActiveUnitBadge');
        if (duvalUnitBadge) duvalUnitBadge.innerHTML = `<span class="live-dot-pulse"></span> Unit: <strong>${tx.id}</strong>`;

        // Update Prescriptive Maintenance Tab
        renderPrescriptiveActions(ai.recommendations, ai.feature_contributions, tx);

        // Sync simulator sliders to active TX
        syncSimulatorSliders(tx);

        // Default component inspection on windings
        inspectComponent('windings');

    } catch (err) {
        console.error('Error loading transformer details:', err);
    }
}

function updateHealthGauge(hi, category, color) {
    document.getElementById('kpiHiValue').textContent = `${hi}%`;
    document.getElementById('kpiHiValue').style.color = color;
    
    const statusEl = document.getElementById('kpiHiStatus');
    statusEl.textContent = category;
    statusEl.style.color = color;

    // Circumference = 2 * PI * 50 = 314.159
    const circumference = 314.159;
    const offset = circumference - (hi / 100) * circumference;
    const progressCircle = document.getElementById('hiGaugeProgress');
    progressCircle.style.strokeDashoffset = offset;
    progressCircle.style.stroke = color;
}

function updateDigitalTwin(tx, ai) {
    const hst = tx.winding_hotspot_temp_c;
    const tot = tx.top_oil_temp_c;

    // Update overlay text
    document.getElementById('overlayHst').textContent = `${hst} °C`;
    document.getElementById('overlayTot').textContent = `${tot} °C`;
    document.getElementById('overlayBdv').textContent = `${tx.bdv_kv} kV`;
    document.getElementById('overlayMoisture').textContent = `${tx.moisture_ppm} ppm`;
    document.getElementById('overlayVibration').textContent = `${tx.vibration_mms} mm/s`;
    
    const coolingEl = document.getElementById('overlayCooling');
    coolingEl.textContent = `${tx.cooling_fans_running}/${tx.cooling_fans_total} Fans Active`;
    if (tx.cooling_fans_running === tx.cooling_fans_total) {
        coolingEl.className = 'text-warning';
    } else {
        coolingEl.className = 'text-success';
    }

    // Update SVG Text labels
    document.getElementById('svgTopOilVal').textContent = `${tot}°C`;
    document.getElementById('svgTempA').textContent = `${roundVal(hst - 3, 1)}°C`;
    document.getElementById('svgTempB').textContent = `${roundVal(hst, 1)}°C`;
    document.getElementById('svgTempC').textContent = `${roundVal(hst - 2, 1)}°C`;

    // Dynamic Heatmap colors for Winding Coils
    function getTempColor(t) {
        if (t >= 120) return '#f43f5e'; // Critical Red
        if (t >= 95) return '#f59e0b';  // Warning Amber
        if (t >= 75) return '#eab308';  // Mild Warm Yellow
        return '#10b981';               // Healthy Green
    }

    const coilA = document.getElementById('svgWindingA');
    const coilB = document.getElementById('svgWindingB');
    const coilC = document.getElementById('svgWindingC');

    const colA = getTempColor(hst - 3);
    const colB = getTempColor(hst);
    const colC = getTempColor(hst - 2);

    coilA.style.fill = colA;
    coilB.style.fill = colB;
    coilC.style.fill = colC;

    coilA.style.filter = `drop-shadow(0 0 10px ${colA})`;
    coilB.style.filter = `drop-shadow(0 0 12px ${colB})`;
    coilC.style.filter = `drop-shadow(0 0 10px ${colC})`;

    // Fan animation toggle
    const fan1 = document.getElementById('fan1');
    const fan2 = document.getElementById('fan2');

    if (tx.cooling_fans_running >= 2) {
        fan1.classList.add('fan-spinning');
        fan2.classList.add('fan-spinning');
    } else if (tx.cooling_fans_running === 1) {
        fan1.classList.add('fan-spinning');
        fan2.classList.remove('fan-spinning');
    } else {
        fan1.classList.remove('fan-spinning');
        fan2.classList.remove('fan-spinning');
    }
}

// Interactive Component Inspection
window.inspectComponent = function(compName) {
    if (!state.activeTransformerDetails) return;
    const tx = state.activeTransformerDetails.transformer;
    const ai = state.activeTransformerDetails.ai_diagnosis;

    const titleEl = document.getElementById('inspCompTitle');
    const descEl = document.getElementById('inspCompDesc');
    const statusEl = document.getElementById('inspCompStatus');

    switch (compName) {
        case 'windings':
            titleEl.textContent = '⚡ Windings & Hotspot Coils (Phase A, B, C)';
            descEl.textContent = `Operating Hotspot: ${tx.winding_hotspot_temp_c}°C. Thermal aging factor: ${Math.exp(0.06 * Math.max(0, tx.winding_hotspot_temp_c - 98)).toFixed(2)}x normal rate.`;
            statusEl.textContent = tx.winding_hotspot_temp_c > 110 ? 'Status: Critical Heat' : (tx.winding_hotspot_temp_c > 95 ? 'Status: Elevated Temp' : 'Status: Optimal');
            statusEl.className = tx.winding_hotspot_temp_c > 110 ? 'badge badge-critical' : (tx.winding_hotspot_temp_c > 95 ? 'badge badge-warning' : 'badge badge-healthy');
            break;
        case 'bushings':
            titleEl.textContent = '🔌 High Voltage Bushings (HV-A, HV-B, HV-C)';
            descEl.textContent = `Nominal Voltage: ${tx.nominal_kv} kV. Operating Voltage: ${tx.voltage_kv} kV. Dielectric breakdown: ${tx.bdv_kv} kV.`;
            statusEl.textContent = tx.c2h2_ppm > 2 ? 'Status: Arcing Alert' : (tx.bdv_kv < 35 ? 'Status: Dielectric Low' : 'Status: Normal');
            statusEl.className = tx.c2h2_ppm > 2 ? 'badge badge-critical' : (tx.bdv_kv < 35 ? 'badge badge-warning' : 'badge badge-healthy');
            break;
        case 'conservator':
            titleEl.textContent = '🛢️ Conservator Tank & Oil Expansion Chamber';
            descEl.textContent = `Moisture content: ${tx.moisture_ppm} ppm. Acidity: ${tx.acidity_mg_koh_g} mg KOH/g. IFT: ${tx.ift_mn_m} mN/m.`;
            statusEl.textContent = tx.moisture_ppm > 30 ? 'Status: High Moisture Ingress' : 'Status: Sealed Good';
            statusEl.className = tx.moisture_ppm > 30 ? 'badge badge-warning' : 'badge badge-healthy';
            break;
        case 'buchholz':
            titleEl.textContent = '🛡️ Buchholz Gas Protection Relay';
            descEl.textContent = `TDCG Total Gas Accumulation: ${ai.ieee_c57_104.tdcg} ppm. Evaluated at IEEE Condition ${ai.ieee_c57_104.overall_condition}.`;
            statusEl.textContent = ai.ieee_c57_104.overall_condition >= 3 ? 'Status: Gas Surge Warning' : 'Status: Normal Gas Flow';
            statusEl.className = ai.ieee_c57_104.overall_condition >= 3 ? 'badge badge-critical' : 'badge badge-healthy';
            break;
        case 'core':
            titleEl.textContent = '🧲 Laminated Magnetic Silicon Steel Core';
            descEl.textContent = `Tank vibration: ${tx.vibration_mms} mm/s. Methane (CH4): ${tx.ch4_ppm} ppm. Ethylene (C2H4): ${tx.c2h4_ppm} ppm.`;
            statusEl.textContent = tx.vibration_mms > 4.5 ? 'Status: High Vibration/Looseness' : 'Status: Magnetic Stability';
            statusEl.className = tx.vibration_mms > 4.5 ? 'badge badge-warning' : 'badge badge-healthy';
            break;
        case 'radiator':
            titleEl.textContent = '❄️ Radiator Cooling Banks & Forced Fans';
            descEl.textContent = `${tx.cooling_fans_running}/${tx.cooling_fans_total} forced-air radiator fans active. Top oil temp: ${tx.top_oil_temp_c}°C.`;
            statusEl.textContent = tx.top_oil_temp_c > 85 ? 'Status: High Thermal Load' : 'Status: Adequate Heat Dissipation';
            statusEl.className = tx.top_oil_temp_c > 85 ? 'badge badge-warning' : 'badge badge-healthy';
            break;
    }
};

// --------------------------------------------------------------------------
// Charts (Telemetry Timeline & DGA Bars)
// --------------------------------------------------------------------------
function renderTelemetryChart() {
    if (!state.activeTransformerDetails) return;
    const history = state.activeTransformerDetails.telemetry_history_24h;
    const labels = history.map(h => h.timestamp);

    const ctx = document.getElementById('telemetryTrendChart').getContext('2d');

    if (state.chartTelemetry) {
        state.chartTelemetry.destroy();
    }

    let datasets = [];

    if (state.telemetryChartMode === 'thermal') {
        datasets = [
            {
                label: 'Winding Hotspot (°C)',
                data: history.map(h => h.winding_hotspot_temp_c),
                borderColor: '#f43f5e',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointRadius: 2
            },
            {
                label: 'Top Oil Temp (°C)',
                data: history.map(h => h.top_oil_temp_c),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.35,
                pointRadius: 2
            },
            {
                label: 'Load Factor (%)',
                data: history.map(h => h.load_factor_pct),
                borderColor: state.currentTheme === 'solar' ? '#ff9f1c' : '#00f2fe',
                borderWidth: 2,
                borderDash: [4, 4],
                fill: false,
                tension: 0.3,
                pointRadius: 1
            }
        ];
    } else {
        datasets = [
            {
                label: 'Health Index (THI %)',
                data: history.map(h => h.health_index),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: 'TDCG Total Gas (ppm)',
                data: history.map(h => h.tdcg_ppm),
                borderColor: '#a855f7',
                borderWidth: 2,
                fill: false,
                tension: 0.3,
                pointRadius: 2,
                yAxisID: 'y1'
            }
        ];
    }

    state.chartTelemetry = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(14, 21, 38, 0.95)',
                    titleFont: { family: 'JetBrains Mono' },
                    bodyFont: { family: 'Inter' },
                    borderColor: '#00f2fe',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                ...(state.telemetryChartMode === 'health' ? {
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#a855f7', font: { size: 10 } }
                    }
                } : {})
            }
        }
    });
}

function renderDgaChart(tx, ieeeEval) {
    const ctx = document.getElementById('dgaBarChart').getContext('2d');
    const gases = ['H₂', 'CH₄', 'C₂H₆', 'C₂H₄', 'C₂H₂', 'CO'];
    const values = [tx.h2_ppm, tx.ch4_ppm, tx.c2h6_ppm, tx.c2h4_ppm, tx.c2h2_ppm, tx.co_ppm];
    const limits = [100, 120, 65, 50, 1, 350]; // IEEE Condition 1 typical limits

    document.getElementById('ieeeConditionBadge').textContent = ieeeEval.condition_label.split(':')[0];
    if (ieeeEval.overall_condition === 1) {
        document.getElementById('ieeeConditionBadge').className = 'badge badge-healthy';
    } else if (ieeeEval.overall_condition <= 2) {
        document.getElementById('ieeeConditionBadge').className = 'badge badge-warning';
    } else {
        document.getElementById('ieeeConditionBadge').className = 'badge badge-critical';
    }

    if (state.chartDga) {
        state.chartDga.destroy();
    }

    state.chartDga = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: gases,
            datasets: [
                {
                    label: 'Measured Gas (ppm)',
                    data: values,
                    backgroundColor: values.map((v, i) => v > limits[i] ? 'rgba(244, 63, 94, 0.85)' : (state.currentTheme === 'solar' ? 'rgba(255, 159, 28, 0.85)' : 'rgba(0, 242, 254, 0.85)')),
                    borderRadius: 4
                },
                {
                    label: 'IEEE Limit (Cond 1)',
                    data: limits,
                    type: 'line',
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [3, 3],
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 10 } } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
                },
                y: {
                    type: 'logarithmic',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b', font: { size: 9 } }
                }
            }
        }
    });
}

// --------------------------------------------------------------------------
// ==========================================================================
// Duval Triangle 1 Canvas Graphical Renderer (Compact & Unique)
// ==========================================================================

function drawDuvalTriangle(customCoords = null, hoveredZone = null, laserCrosshair = null) {
    const canvas = document.getElementById('duvalCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Set decreased compact resolution
    canvas.width = 460;
    canvas.height = 360;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const padding = 34;
    const topX = width / 2;
    const topY = padding;
    const leftX = padding;
    const leftY = height - padding;
    const rightX = width - padding;
    const rightY = height - padding;

    function toCartesian(ch4, c2h4, c2h2) {
        const sum = (ch4 + c2h4 + c2h2) || 1;
        const p1 = ch4 / sum;
        const p2 = c2h4 / sum;
        const p3 = c2h2 / sum;

        const x = p1 * topX + p2 * leftX + p3 * rightX;
        const y = p1 * topY + p2 * leftY + p3 * rightY;
        return { x, y };
    }

    const zones = [
        { name: 'PD', color: 'rgba(56, 189, 248, 0.32)', border: '#38bdf8', poly: [[100, 0, 0], [98, 2, 0], [98, 0, 2]] },
        { name: 'T1', color: 'rgba(52, 211, 153, 0.32)', border: '#34d399', poly: [[98, 2, 0], [76, 20, 4], [96, 0, 4], [98, 0, 2]] },
        { name: 'T2', color: 'rgba(251, 191, 36, 0.32)', border: '#fbbf24', poly: [[76, 20, 4], [46, 50, 4], [72, 24, 4]] },
        { name: 'T3', color: 'rgba(248, 113, 113, 0.32)', border: '#f87171', poly: [[46, 50, 4], [0, 100, 0], [0, 85, 15], [35, 50, 15]] },
        { name: 'D1', color: 'rgba(167, 139, 250, 0.32)', border: '#a78bfa', poly: [[87, 0, 13], [64, 23, 13], [0, 23, 77], [0, 0, 100]] },
        { name: 'D2', color: 'rgba(236, 72, 153, 0.32)', border: '#ec4899', poly: [[71, 0, 29], [48, 23, 29], [0, 71, 29], [0, 0, 100]] },
        { name: 'DT', color: 'rgba(249, 115, 22, 0.32)', border: '#f97316', poly: [[64, 23, 13], [46, 50, 4], [35, 50, 15], [48, 23, 29]] }
    ];

    // Background Triangle Fill with Soft Gradient
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = state.currentTheme === 'light' ? '#ffffff' : '#080d1a';
    ctx.fill();

    const grad = ctx.createRadialGradient(topX, topY + 130, 10, topX, topY + 130, 190);
    grad.addColorStop(0, state.currentTheme === 'solar' ? 'rgba(255, 159, 28, 0.08)' : 'rgba(0, 242, 254, 0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 1. Draw Unique Holographic Precision Ternary Grid Isolines (20%, 40%, 60%, 80%)
    ctx.save();
    ctx.strokeStyle = state.currentTheme === 'solar' ? 'rgba(255, 159, 28, 0.12)' : 'rgba(0, 242, 254, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);

    for (let step = 20; step <= 80; step += 20) {
        // CH4 isoline (horizontal)
        const pA = toCartesian(step, 100 - step, 0);
        const pB = toCartesian(step, 0, 100 - step);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();

        // C2H4 isoline
        const pC = toCartesian(100 - step, step, 0);
        const pD = toCartesian(0, step, 100 - step);
        ctx.beginPath();
        ctx.moveTo(pC.x, pC.y);
        ctx.lineTo(pD.x, pD.y);
        ctx.stroke();

        // C2H2 isoline
        const pE = toCartesian(100 - step, 0, step);
        const pF = toCartesian(0, 100 - step, step);
        ctx.beginPath();
        ctx.moveTo(pE.x, pE.y);
        ctx.lineTo(pF.x, pF.y);
        ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Zones Polygons with Unique Highlight Glow
    zones.forEach(z => {
        ctx.beginPath();
        const startPt = toCartesian(z.poly[0][0], z.poly[0][1], z.poly[0][2]);
        ctx.moveTo(startPt.x, startPt.y);
        for (let i = 1; i < z.poly.length; i++) {
            const pt = toCartesian(z.poly[i][0], z.poly[i][1], z.poly[i][2]);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();

        const isHovered = (hoveredZone === z.name);
        if (isHovered) {
            ctx.save();
            ctx.shadowColor = z.border;
            ctx.shadowBlur = 18;
            ctx.fillStyle = z.color.replace('0.32', '0.78');
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillStyle = z.color;
            ctx.fill();
            ctx.strokeStyle = z.border;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    });

    // 3. Triangle Boundary Border
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.strokeStyle = state.currentTheme === 'solar' ? '#ff9f1c' : '#00f2fe';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // 4. Vertex Labels (Compact, Crisp, Beautiful)
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('100% CH₄ (Methane)', topX, topY - 14);
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.fillText('(Partial Discharge & T1)', topX, topY - 3);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText('100% C₂H₄ (Ethylene)', leftX - 4, leftY + 16);
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
    ctx.fillText('(Thermal T2 / T3)', leftX - 4, leftY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText('100% C₂H₂ (Acetylene)', rightX + 4, rightY + 16);
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = 'rgba(236, 72, 153, 0.75)';
    ctx.fillText('(Arcing D1 / D2)', rightX + 4, rightY + 28);

    // 5. Laser Crosshair on Mouse Hover
    if (laserCrosshair) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        ctx.beginPath();
        ctx.moveTo(laserCrosshair.x - 18, laserCrosshair.y);
        ctx.lineTo(laserCrosshair.x + 18, laserCrosshair.y);
        ctx.moveTo(laserCrosshair.x, laserCrosshair.y - 18);
        ctx.lineTo(laserCrosshair.x, laserCrosshair.y + 18);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(laserCrosshair.x, laserCrosshair.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00f2fe';
        ctx.fill();
        ctx.restore();
    }

    // 6. Active Operating Point & Concentric Radar Reticle
    let coords = customCoords || state.duvalProbeCoords;
    if (!coords && state.activeTransformerDetails) {
        const d = state.activeTransformerDetails.ai_diagnosis.duval_triangle_1;
        coords = { ch4: d.ch4_pct, c2h4: d.c2h4_pct, c2h2: d.c2h2_pct };
    }

    if (coords) {
        const dCh4 = document.getElementById('dispCh4Pct');
        const dC2h4 = document.getElementById('dispC2h4Pct');
        const dC2h2 = document.getElementById('dispC2h2Pct');
        if (dCh4) dCh4.textContent = `${coords.ch4}%`;
        if (dC2h4) dC2h4.textContent = `${coords.c2h4}%`;
        if (dC2h2) dC2h2.textContent = `${coords.c2h2}%`;

        // Update Segmented 3-Gas Proportion Bar
        updateGasRatioBar(coords.ch4, coords.c2h4, coords.c2h2);

        const pt = toCartesian(coords.ch4, coords.c2h4, coords.c2h2);

        // Outer Pulsing Glow
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = state.currentTheme === 'solar' ? 'rgba(255, 159, 28, 0.25)' : 'rgba(0, 242, 254, 0.22)';
        ctx.fill();

        // Middle Ring
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = state.currentTheme === 'solar' ? '#ff9f1c' : '#00f2fe';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Core Dot
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#020617';
        ctx.fill();

        // Reticle Crosshair Ticks
        ctx.save();
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pt.x - 11, pt.y); ctx.lineTo(pt.x - 7, pt.y);
        ctx.moveTo(pt.x + 7, pt.y); ctx.lineTo(pt.x + 11, pt.y);
        ctx.moveTo(pt.x, pt.y - 11); ctx.lineTo(pt.x, pt.y - 7);
        ctx.moveTo(pt.x, pt.y + 7); ctx.lineTo(pt.x, pt.y + 11);
        ctx.stroke();
        ctx.restore();
    }
}

function updateGasRatioBar(ch4, c2h4, c2h2) {
    const sum = (ch4 + c2h4 + c2h2) || 1;
    const pCh4 = roundVal((ch4 / sum) * 100, 1);
    const pC2h4 = roundVal((c2h4 / sum) * 100, 1);
    const pC2h2 = roundVal(Math.max(0, 100 - pCh4 - pC2h4), 1);

    const b1 = document.getElementById('barSegCh4');
    const b2 = document.getElementById('barSegC2h4');
    const b3 = document.getElementById('barSegC2h2');
    const v1 = document.getElementById('barSegCh4Val');
    const v2 = document.getElementById('barSegC2h4Val');
    const v3 = document.getElementById('barSegC2h2Val');

    if (b1) b1.style.width = `${Math.max(4, pCh4)}%`;
    if (b2) b2.style.width = `${Math.max(4, pC2h4)}%`;
    if (b3) b3.style.width = `${Math.max(4, pC2h2)}%`;
    if (v1) v1.textContent = `${pCh4}%`;
    if (v2) v2.textContent = `${pC2h4}%`;
    if (v3) v3.textContent = `${pC2h2}%`;
}

function classifyDuvalPoint(ch4, c2h4, c2h2) {
    if (ch4 >= 98.0) {
        return { zone: 'PD', name: 'Partial Discharge (Corona)', desc: 'Cold plasma discharge in gas bubbles or voids in solid paper insulation.', severity: 15, temp: 'T < 150°C' };
    }
    if (c2h2 < 4.0) {
        if (c2h4 < 20.0 && ch4 >= 76.0) {
            return { zone: 'T1', name: 'Thermal Fault < 300°C', desc: 'Mild overheating in conductor paper or transformer oil below 300°C.', severity: 35, temp: 'T < 300°C' };
        } else if (c2h4 >= 20.0 && c2h4 < 50.0) {
            return { zone: 'T2', name: 'Thermal Fault 300°C–700°C', desc: 'Localized hot spot in copper windings or magnetic iron core.', severity: 65, temp: '300°C–700°C' };
        } else {
            return { zone: 'T3', name: 'Thermal Fault > 700°C', desc: 'Severe carbonization of cellulose, metal fusion risk, and heavy oil pyrolysis.', severity: 90, temp: 'T > 700°C' };
        }
    }
    if (c2h2 >= 29.0) {
        return { zone: 'D2', name: 'Electrical Arcing (High-Energy)', desc: 'Violent high-energy flashover through dielectric oil with severe fire hazard.', severity: 98, temp: 'T > 1000°C' };
    }
    if (c2h2 >= 13.0 && c2h4 < 23.0) {
        return { zone: 'D1', name: 'Low-Energy Sparking', desc: 'Dielectric breakdown tracking, pinhole sparks, and continuous low-energy discharge.', severity: 75, temp: 'Sparking' };
    }
    if (c2h4 >= 50.0 && c2h2 < 15.0) {
        return { zone: 'T3', name: 'Thermal Fault > 700°C', desc: 'Extreme thermal breakdown (>700°C) with metal lamination fusion risk.', severity: 90, temp: 'T > 700°C' };
    }
    if (c2h2 >= 13.0 && c2h2 < 29.0 && c2h4 >= 23.0) {
        return { zone: 'D2', name: 'High-Energy Arcing with Pyrolysis', desc: 'Severe composite fault: high-energy arcing accompanied by intense localized overheating.', severity: 96, temp: 'High Energy' };
    }
    if (c2h2 >= 4.0 && c2h2 < 13.0 && c2h4 < 40.0) {
        return { zone: 'DT', name: 'Thermal & Electrical Mix', desc: 'Concurrent dielectric sparks and thermal hotspot activity.', severity: 82, temp: 'Mixed Modes' };
    }
    return { zone: 'T2', name: 'Thermal Fault 300°C–700°C', desc: 'Localized thermal heating in conductors or core laminations.', severity: 65, temp: '300°C–700°C' };
}

function updateDuvalZoneInfo(duvalInfo) {
    const zoneTag = document.getElementById('duvalZoneTag');
    const zoneTitle = document.getElementById('duvalZoneTitle');
    const zoneDesc = document.getElementById('duvalZoneDesc');
    const activePill = document.getElementById('duvalActiveZonePill');
    const tempBadge = document.getElementById('duvalZoneTempBadge');
    const sevScore = document.getElementById('duvalSeverityScore');
    const sevBar = document.getElementById('duvalSeverityBar');

    const zone = duvalInfo.zone || 'T2';
    if (zoneTag) zoneTag.textContent = zone;
    if (zoneTitle) zoneTitle.textContent = duvalInfo.name || (zone + ' Zone Detected');
    if (zoneDesc) zoneDesc.textContent = duvalInfo.description || duvalInfo.desc || '';
    if (activePill) activePill.textContent = `Zone ${zone}`;

    const severityMap = {
        'PD': { sev: 15, label: 'LOW RISK / CORONA', temp: 'T < 150°C', color: '#38bdf8' },
        'T1': { sev: 35, label: 'MILD THERMAL STRESS', temp: 'T < 300°C', color: '#34d399' },
        'T2': { sev: 65, label: 'LOCALIZED OVERHEAT', temp: '300°C–700°C', color: '#fbbf24' },
        'T3': { sev: 90, label: 'CRITICAL PYROLYSIS', temp: 'T > 700°C', color: '#f87171' },
        'D1': { sev: 75, label: 'SPARKING / TRACKING', temp: 'Low-Energy Spark', color: '#a78bfa' },
        'D2': { sev: 98, label: 'CATASTROPHIC ARCING', temp: 'T > 1000°C Arc', color: '#ec4899' },
        'DT': { sev: 82, label: 'THERMAL & ARC MIX', temp: 'Combined Overheat', color: '#f97316' }
    };

    const s = severityMap[zone] || { sev: 60, label: 'ELEVATED', temp: 'Thermal Activity', color: '#fbbf24' };
    if (tempBadge) tempBadge.textContent = duvalInfo.temp || s.temp;
    if (sevScore) {
        sevScore.textContent = `${s.sev}% — ${s.label}`;
        sevScore.style.color = s.color;
    }
    if (sevBar) {
        sevBar.style.width = `${s.sev}%`;
        if (s.sev >= 85) {
            sevBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #ec4899 50%, #f43f5e 100%)';
        } else if (s.sev >= 50) {
            sevBar.style.background = 'linear-gradient(90deg, #10b981 0%, #fbbf24 60%, #f97316 100%)';
        } else {
            sevBar.style.background = 'linear-gradient(90deg, #00f2fe 0%, #10b981 100%)';
        }
    }

    document.querySelectorAll('.zone-row').forEach(row => {
        row.classList.toggle('highlighted', row.getAttribute('data-zone') === zone);
    });
}

function initDuvalInteractivity() {
    const canvas = document.getElementById('duvalCanvas');
    if (!canvas) return;

    function getBarycentric(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const my = (e.clientY - rect.top) * (canvas.height / rect.height);

        const width = canvas.width;
        const height = canvas.height;
        const padding = 34;
        const x1 = width / 2, y1 = padding;
        const x2 = padding, y2 = height - padding;
        const x3 = width - padding, y3 = height - padding;

        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
        const l1 = ((y2 - y3) * (mx - x3) + (x3 - x2) * (my - y3)) / det;
        const l2 = ((y3 - y1) * (mx - x3) + (x1 - x3) * (my - y3)) / det;
        const l3 = 1 - l1 - l2;

        return { l1, l2, l3, mx, my, isInside: (l1 >= -0.01 && l2 >= -0.01 && l3 >= -0.01) };
    }

    // Mousemove laser tracking & dynamic coordinate HUD
    canvas.addEventListener('mousemove', (e) => {
        const pt = getBarycentric(e);
        if (pt.isInside) {
            const ch4 = roundVal(Math.max(0, pt.l1 * 100), 1);
            const c2h4 = roundVal(Math.max(0, pt.l2 * 100), 1);
            const c2h2 = roundVal(Math.max(0, 100 - ch4 - c2h4), 1);

            drawDuvalTriangle(state.duvalProbeCoords, state.hoveredDuvalZone, { x: pt.mx, y: pt.my });

            const probeStatus = document.getElementById('duvalProbeStatus');
            if (probeStatus) {
                probeStatus.innerHTML = `<span class="probe-icon">🎯</span> <span>Probe: CH₄ <strong>${ch4}%</strong>, C₂H₄ <strong>${c2h4}%</strong>, C₂H₂ <strong>${c2h2}%</strong></span>`;
            }
        }
    });

    canvas.addEventListener('mouseleave', () => {
        drawDuvalTriangle(state.duvalProbeCoords, state.hoveredDuvalZone, null);
        const probeStatus = document.getElementById('duvalProbeStatus');
        if (probeStatus) {
            probeStatus.innerHTML = state.duvalProbeCoords
                ? `<span class="probe-icon">📍</span> <span>Custom Probe Locked</span>`
                : `<span class="probe-icon">🎯</span> <span>Click canvas to probe</span>`;
        }
    });

    // Click to drop probe point and diagnose
    canvas.addEventListener('click', (e) => {
        const pt = getBarycentric(e);
        if (pt.isInside) {
            const ch4 = roundVal(Math.max(0, pt.l1 * 100), 1);
            const c2h4 = roundVal(Math.max(0, pt.l2 * 100), 1);
            const c2h2 = roundVal(Math.max(0, 100 - ch4 - c2h4), 1);

            state.duvalProbeCoords = { ch4, c2h4, c2h2 };
            const classification = classifyDuvalPoint(ch4, c2h4, c2h2);

            drawDuvalTriangle(state.duvalProbeCoords, null, null);
            updateDuvalZoneInfo(classification);
            updateGasRatioBar(ch4, c2h4, c2h2);

            // Update Plain-English Box to match probed coordinates
            updateCustomPlainEnglishBox(classification, ch4, c2h4, c2h2);

            // Update active unit badge
            const badge = document.getElementById('duvalActiveUnitBadge');
            if (badge) badge.innerHTML = `<span class="live-dot-pulse" style="background:#fbbf24;"></span> Custom Probe: <strong>${classification.zone}</strong>`;

            showToast(`🎯 Probed: CH₄ ${ch4}%, C₂H₄ ${c2h4}%, C₂H₂ ${c2h2}% → Zone ${classification.zone}`);
            playAlarmChime(false);
        }
    });

    // Reset button handler
    const btnReset = document.getElementById('btnResetDuvalUnit');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            state.duvalProbeCoords = null;
            if (state.activeTransformerDetails) {
                const d = state.activeTransformerDetails.ai_diagnosis.duval_triangle_1;
                drawDuvalTriangle();
                updateDuvalZoneInfo(d);
                updateGasRatioBar(d.ch4_pct, d.c2h4_pct, d.c2h2_pct);
                const badge = document.getElementById('duvalActiveUnitBadge');
                if (badge) badge.innerHTML = `<span class="live-dot-pulse"></span> Unit: <strong>${state.activeTransformerId}</strong>`;
                showToast(`🔄 Reset Duval Triangle to ${state.activeTransformerId} telemetry.`);
            }
        });
    }

    // Hover-to-highlight zone rows in legend
    document.querySelectorAll('.zone-row').forEach(row => {
        const zName = row.getAttribute('data-zone');
        row.addEventListener('mouseenter', () => {
            state.hoveredDuvalZone = zName;
            drawDuvalTriangle(state.duvalProbeCoords, zName, null);
        });
        row.addEventListener('mouseleave', () => {
            state.hoveredDuvalZone = null;
            drawDuvalTriangle(state.duvalProbeCoords, null, null);
        });
        row.addEventListener('click', () => {
            state.hoveredDuvalZone = zName;
            drawDuvalTriangle(state.duvalProbeCoords, zName, null);
            showToast(`🔍 Highlighting Duval Zone ${zName}`);
        });
    });
}

function updateCustomPlainEnglishBox(c, ch4, c2h4, c2h2) {
    const zBadge = document.getElementById('plainEngZoneBadge');
    if (zBadge) {
        zBadge.textContent = `Zone ${c.zone} Active`;
        zBadge.style.color = '#00f2fe';
        zBadge.style.borderColor = '#00f2fe';
    }
    const iconEl = document.getElementById('plainEngIcon');
    const headEl = document.getElementById('plainEngHeadline');
    const sumEl = document.getElementById('plainEngSummary');
    const expEl = document.getElementById('plainEngExplosionRisk');
    const degEl = document.getElementById('plainEngDegradation');
    const actEl = document.getElementById('plainEngAction');

    if (iconEl) iconEl.textContent = (c.zone === 'D2' ? '⚡' : (c.zone === 'T3' ? '🔥' : (c.zone === 'PD' ? '✨' : '🍳')));
    if (headEl) headEl.textContent = `${c.name} (${c.zone})`;
    if (sumEl) sumEl.innerHTML = `Custom probed point with <strong>CH₄: ${ch4}%</strong>, <strong>C₂H₄: ${c2h4}%</strong>, and <strong>C₂H₂: ${c2h2}%</strong>. ${c.desc}`;
    if (expEl) {
        expEl.textContent = c2h2 >= 20 ? `🚨 High Risk (${c2h2}% C₂H₂)` : (c2h2 >= 4 ? `⚠️ Moderate (${c2h2}% C₂H₂)` : `🟢 Minimal (${c2h2}% C₂H₂)`);
        expEl.style.color = c2h2 >= 20 ? '#f43f5e' : (c2h2 >= 4 ? '#fbbf24' : '#10b981');
    }
    if (degEl) {
        degEl.textContent = c.zone === 'T3' ? '💀 Rapid Pyrolysis' : (c.zone === 'T2' ? '⚠️ Accelerated Thermal Heating' : '🟢 Standard');
        degEl.style.color = c.zone === 'T3' ? '#f43f5e' : (c.zone === 'T2' ? '#fbbf24' : '#10b981');
    }
    if (actEl) actEl.textContent = `Prescriptive Recommendation: Verify DGA gas trending, analyze transformer oil moisture, and inspect cooling circuit.`;
}

// --------------------------------------------------------------------------
// What-If Simulation Lab
// --------------------------------------------------------------------------
function initSimulationControls() {
    const sliders = ['simLoad', 'simAmbient', 'simMoisture', 'simBdv', 'simC2h2', 'simC2h4', 'simCo'];

    sliders.forEach(id => {
        const slider = document.getElementById(id);
        slider.addEventListener('input', () => {
            updateSliderValueLabels();
            debouncedSimulate();
        });
    });

    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            applySimulationPreset(btn.getAttribute('data-preset'));
        });
    });

    document.getElementById('btnResetSim').addEventListener('click', () => {
        if (state.activeTransformerDetails) {
            syncSimulatorSliders(state.activeTransformerDetails.transformer);
            debouncedSimulate();
            showToast('🔄 Simulator reset to active transformer baseline.');
        }
    });
}

function updateSliderValueLabels() {
    document.getElementById('valSimLoad').textContent = `${document.getElementById('simLoad').value} %`;
    document.getElementById('valSimAmbient').textContent = `${document.getElementById('simAmbient').value} °C`;
    document.getElementById('valSimMoisture').textContent = `${document.getElementById('simMoisture').value} ppm`;
    document.getElementById('valSimBdv').textContent = `${document.getElementById('simBdv').value} kV`;
    document.getElementById('valSimC2h2').textContent = `${document.getElementById('simC2h2').value} ppm`;
    document.getElementById('valSimC2h4').textContent = `${document.getElementById('simC2h4').value} ppm`;
    document.getElementById('valSimCo').textContent = `${document.getElementById('simCo').value} ppm`;
}

function syncSimulatorSliders(tx) {
    document.getElementById('simLoad').value = tx.load_factor_pct;
    document.getElementById('simAmbient').value = tx.ambient_temp_c;
    document.getElementById('simMoisture').value = tx.moisture_ppm;
    document.getElementById('simBdv').value = tx.bdv_kv;
    document.getElementById('simC2h2').value = tx.c2h2_ppm;
    document.getElementById('simC2h4').value = tx.c2h4_ppm;
    document.getElementById('simCo').value = tx.co_ppm;
    updateSliderValueLabels();
}

function applySimulationPreset(preset) {
    switch (preset) {
        case 'normal':
            document.getElementById('simLoad').value = 65;
            document.getElementById('simAmbient').value = 25;
            document.getElementById('simMoisture').value = 12;
            document.getElementById('simBdv').value = 68;
            document.getElementById('simC2h2').value = 0;
            document.getElementById('simC2h4').value = 15;
            document.getElementById('simCo').value = 200;
            break;
        case 'summer_overload':
            document.getElementById('simLoad').value = 130;
            document.getElementById('simAmbient').value = 44;
            document.getElementById('simMoisture').value = 20;
            document.getElementById('simBdv').value = 52;
            document.getElementById('simC2h2').value = 2;
            document.getElementById('simC2h4').value = 180;
            document.getElementById('simCo').value = 450;
            break;
        case 'oil_breakdown':
            document.getElementById('simLoad').value = 75;
            document.getElementById('simAmbient').value = 30;
            document.getElementById('simMoisture').value = 58;
            document.getElementById('simBdv').value = 22;
            document.getElementById('simC2h2').value = 1;
            document.getElementById('simC2h4').value = 35;
            document.getElementById('simCo').value = 280;
            break;
        case 'arcing_fault':
            document.getElementById('simLoad').value = 85;
            document.getElementById('simAmbient').value = 32;
            document.getElementById('simMoisture').value = 25;
            document.getElementById('simBdv').value = 28;
            document.getElementById('simC2h2').value = 650;
            document.getElementById('simC2h4').value = 450;
            document.getElementById('simCo').value = 380;
            break;
        case 'paper_aging':
            document.getElementById('simLoad').value = 80;
            document.getElementById('simAmbient').value = 28;
            document.getElementById('simMoisture').value = 38;
            document.getElementById('simBdv').value = 42;
            document.getElementById('simC2h2').value = 0.5;
            document.getElementById('simC2h4').value = 45;
            document.getElementById('simCo').value = 1450;
            break;
        case 'severe_overheat':
            document.getElementById('simLoad').value = 125;
            document.getElementById('simAmbient').value = 38;
            document.getElementById('simMoisture').value = 32;
            document.getElementById('simBdv').value = 35;
            document.getElementById('simC2h2').value = 25;
            document.getElementById('simC2h4').value = 1850;
            document.getElementById('simCo').value = 780;
            break;
    }
    updateSliderValueLabels();
    debouncedSimulate();
}

function debouncedSimulate() {
    clearTimeout(state.simDebounceTimer);
    state.simDebounceTimer = setTimeout(runSimulationInference, 150);
}

async function runSimulationInference() {
    const load = parseFloat(document.getElementById('simLoad').value);
    const ambient = parseFloat(document.getElementById('simAmbient').value);
    const moisture = parseFloat(document.getElementById('simMoisture').value);
    const bdv = parseFloat(document.getElementById('simBdv').value);
    const c2h2 = parseFloat(document.getElementById('simC2h2').value);
    const c2h4 = parseFloat(document.getElementById('simC2h4').value);
    const co = parseFloat(document.getElementById('simCo').value);

    const deltaOil = 35 * Math.pow(load / 100, 1.6);
    const topOil = roundVal(ambient + deltaOil, 1);
    const gradient = 18 * Math.pow(load / 100, 1.8);
    const hotspot = roundVal(topOil + gradient + (c2h4 > 500 ? 25 : 0), 1);

    const payload = {
        mva_rating: 100.0,
        nominal_kv: 132.0,
        age_years: 10.0,
        ambient_temp_c: ambient,
        load_factor_pct: load,
        voltage_kv: 132.0,
        current_a: roundVal((load / 100) * 437.0, 1),
        top_oil_temp_c: topOil,
        winding_hotspot_temp_c: hotspot,
        vibration_mms: hotspot > 120 ? 5.8 : 1.8,
        bdv_kv: bdv,
        moisture_ppm: moisture,
        acidity_mg_koh_g: moisture > 35 ? 0.18 : 0.04,
        ift_mn_m: 35.0,
        h2_ppm: c2h2 > 50 ? 850 : 25,
        ch4_ppm: 35.0,
        c2h6_ppm: 20.0,
        c2h4_ppm: c2h4,
        c2h2_ppm: c2h2,
        co_ppm: co,
        co2_ppm: co * 10
    };

    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Simulation failed');
        const data = await res.json();

        document.getElementById('simOutHi').textContent = `${data.health_index}%`;
        document.getElementById('simOutHi').style.color = data.failure_risk_color;
        document.getElementById('simBarHi').style.width = `${data.health_index}%`;
        document.getElementById('simBarHi').style.backgroundColor = data.failure_risk_color;

        document.getElementById('simOutRisk').textContent = `${data.failure_probability_pct}%`;
        document.getElementById('simOutRisk').style.color = data.failure_risk_color;
        document.getElementById('simOutRiskTag').textContent = data.failure_risk_category;
        document.getElementById('simOutRiskTag').style.color = data.failure_risk_color;

        document.getElementById('simOutFault').textContent = data.predicted_fault_type;
        document.getElementById('simOutDuval').textContent = `Duval 1: Zone ${data.duval_triangle_1.zone}`;

        document.getElementById('simOutHotspot').textContent = `${hotspot} °C`;
        document.getElementById('simOutTopOil').textContent = `${topOil} °C`;

        const listEl = document.getElementById('simPrescriptiveList');
        listEl.innerHTML = '';
        data.recommendations.forEach(r => {
            const item = document.createElement('div');
            item.className = 'sim-action-item';
            item.innerHTML = `
                <div>
                    <strong>[${r.priority}] ${r.action}</strong>
                    <div style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">${r.detail}</div>
                </div>
            `;
            listEl.appendChild(item);
        });

    } catch (err) {
        console.error('Simulation error:', err);
    }
}

// --------------------------------------------------------------------------
// Prescriptive Maintenance & Work Order
// --------------------------------------------------------------------------
function renderPrescriptiveActions(recommendations, contributions, tx) {
    const container = document.getElementById('prescriptiveCardsContainer');
    container.innerHTML = '';

    recommendations.forEach(rec => {
        let pClass = 'p-medium';
        let badgeColor = 'var(--color-violet)';
        if (rec.priority === 'CRITICAL') {
            pClass = 'p-critical';
            badgeColor = 'var(--color-critical)';
        } else if (rec.priority === 'HIGH') {
            pClass = 'p-high';
            badgeColor = 'var(--color-warning)';
        }

        const card = document.createElement('div');
        card.className = `prescriptive-card ${pClass}`;
        card.innerHTML = `
            <div class="p-header">
                <span class="p-badge" style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor};">${rec.badge}</span>
                <span class="p-timeframe">Target: ${rec.timeframe}</span>
            </div>
            <h3 class="p-title">${rec.action}</h3>
            <p class="p-detail">${rec.detail}</p>
        `;
        container.appendChild(card);
    });

    const rootEl = document.getElementById('rootCauseContent');
    rootEl.innerHTML = '';
    contributions.forEach(c => {
        const row = document.createElement('div');
        row.className = 'root-item';
        row.innerHTML = `
            <span>${c.feature} (<strong>${c.value}</strong>)</span>
            <span class="badge ${c.impact === 'Critical' ? 'badge-critical' : (c.impact === 'Warning' || c.impact === 'High' ? 'badge-warning' : 'badge-healthy')}">${c.impact}</span>
        `;
        rootEl.appendChild(row);
    });
}

document.getElementById('btnDispatchWorkOrder').addEventListener('click', () => {
    if (!state.activeTransformerDetails) return;
    const tx = state.activeTransformerDetails.transformer;
    showToast(`🚀 Work order #WO-${Date.now().toString().slice(-6)} dispatched to Substation Maintenance Crew for ${tx.id}!`);
});

// --------------------------------------------------------------------------
// AI Model Studio & Dataset Explorer
// --------------------------------------------------------------------------
async function fetchModelMetrics() {
    try {
        const res = await fetch('/api/model/metrics');
        if (!res.ok) return;
        const metrics = await res.json();
        state.modelMetrics = metrics;

        document.getElementById('metricR2').textContent = metrics.health_index_metrics.r2_score;
        document.getElementById('metricMae').textContent = `${metrics.health_index_metrics.mae} %`;
        document.getElementById('metricAccuracy').textContent = `${roundVal(metrics.fault_classifier_metrics.accuracy * 100, 1)} %`;
        document.getElementById('metricSamples').textContent = metrics.dataset_summary.total_samples.toLocaleString();

        renderFeatureImportanceChart(metrics.top_hi_features);
        renderConfusionMatrix(metrics.fault_classifier_metrics);
    } catch (err) {
        console.error('Error loading metrics:', err);
    }
}

function renderFeatureImportanceChart(features) {
    const ctx = document.getElementById('featureImportanceChart').getContext('2d');
    const labels = features.map(f => f[0].replace(/_/g, ' ').toUpperCase());
    const values = features.map(f => f[1]);

    if (state.chartFeatures) state.chartFeatures.destroy();

    state.chartFeatures = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Gini Feature Importance',
                data: values,
                backgroundColor: state.currentTheme === 'solar' ? 'rgba(255, 159, 28, 0.85)' : 'rgba(0, 242, 254, 0.85)',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: state.currentTheme === 'light' ? '#0f172a' : '#f8fafc', font: { size: 10 } }
                }
            }
        }
    });
}

function renderConfusionMatrix(data) {
    const container = document.getElementById('confusionMatrixContainer');
    const labels = data.labels.map(l => l.length > 15 ? l.slice(0, 14) + '..' : l);
    const cm = data.confusion_matrix;

    let html = '<table class="cm-table"><thead><tr><th>Actual \\ Pred</th>';
    labels.forEach(l => { html += `<th>${l}</th>`; });
    html += '</tr></thead><tbody>';

    cm.forEach((row, i) => {
        html += `<tr><th>${labels[i]}</th>`;
        row.forEach((val, j) => {
            const isDiag = i === j;
            const cls = isDiag ? 'cm-cell-diag' : (val === 0 ? 'cm-cell-zero' : '');
            html += `<td class="${cls}">${val}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function fetchDatasetPage(page) {
    try {
        state.datasetPage = page;
        const res = await fetch(`/api/dataset?page=${page}&page_size=${state.datasetPageSize}`);
        if (!res.ok) return;
        const result = await res.json();

        document.getElementById('pageInfo').textContent = `Page ${result.page} of ${result.total_pages}`;
        document.getElementById('btnPrevPage').disabled = result.page <= 1;
        document.getElementById('btnNextPage').disabled = result.page >= result.total_pages;

        const tbody = document.getElementById('datasetTableBody');
        tbody.innerHTML = '';

        result.data.forEach(row => {
            const tr = document.createElement('tr');
            let riskBadge = 'badge-healthy';
            if (row.failure_risk === 'Moderate Risk') riskBadge = 'badge-warning';
            if (row.failure_risk === 'Critical Alert') riskBadge = 'badge-critical';

            tr.innerHTML = `
                <td><strong>${row.transformer_id}</strong></td>
                <td>${row.mva_rating} MVA</td>
                <td>${row.load_factor_pct}%</td>
                <td>${row.winding_hotspot_temp_c}°C</td>
                <td>${row.bdv_kv} kV</td>
                <td>${row.moisture_ppm}</td>
                <td>${row.c2h2_ppm}</td>
                <td>${row.c2h4_ppm}</td>
                <td style="color:${row.health_index > 80 ? 'var(--color-healthy)' : (row.health_index > 60 ? 'var(--color-warning)' : 'var(--color-critical)')}; font-weight:bold;">${row.health_index}%</td>
                <td><span class="badge ${riskBadge}">${row.failure_risk}</span></td>
                <td>${row.fault_diagnosis}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error('Error fetching dataset:', err);
    }
}

document.getElementById('btnPrevPage').addEventListener('click', () => {
    if (state.datasetPage > 1) fetchDatasetPage(state.datasetPage - 1);
});

document.getElementById('btnNextPage').addEventListener('click', () => {
    fetchDatasetPage(state.datasetPage + 1);
});

// --------------------------------------------------------------------------
// Formal Inspection Audit Certificate & Report
// --------------------------------------------------------------------------
function initModalHandlers() {
    document.getElementById('btnExportReport').addEventListener('click', () => {
        generateInspectionCertificate();
        document.getElementById('reportModal').classList.add('active');
    });

    document.getElementById('btnCloseModal').addEventListener('click', () => {
        document.getElementById('reportModal').classList.remove('active');
    });

    document.getElementById('reportModal').addEventListener('click', (e) => {
        if (e.target.id === 'reportModal') {
            document.getElementById('reportModal').classList.remove('active');
        }
    });
}

function generateInspectionCertificate() {
    if (!state.activeTransformerDetails) return;
    const tx = state.activeTransformerDetails.transformer;
    const ai = state.activeTransformerDetails.ai_diagnosis;
    const dga = ai.ieee_c57_104;

    const body = document.getElementById('reportBodyContent');
    const now = new Date();

    body.innerHTML = `
        <div class="cert-container">
            <div class="cert-header">
                <div>
                    <div class="cert-brand">TRANSFORMER IQ • AI HEALTH AUDIT CERTIFICATE</div>
                    <div style="font-size:0.82rem; color:#64748b;">Substation Power Grid Diagnostic & Asset Management Directorate</div>
                </div>
                <div class="cert-meta">
                    <div><strong>Certificate #:</strong> TIQ-AUD-${Date.now().toString().slice(-8)}</div>
                    <div><strong>Date of Inspection:</strong> ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
                    <div><strong>Standard:</strong> IEEE C57.104™ / IEC 60599</div>
                </div>
            </div>

            <div class="cert-section-title">1. Equipment Identification & Operating Ratings</div>
            <div class="cert-grid">
                <div class="cert-item"><span>Transformer Tag</span><strong>${tx.id}</strong></div>
                <div class="cert-item"><span>Substation Name</span><strong>${tx.name}</strong></div>
                <div class="cert-item"><span>Location</span><strong>${tx.location}</strong></div>
                <div class="cert-item"><span>Rated Power</span><strong>${tx.mva_rating} MVA</strong></div>
                <div class="cert-item"><span>Rated Primary Voltage</span><strong>${tx.nominal_kv} kV</strong></div>
                <div class="cert-item"><span>Service Age</span><strong>${tx.age_years} Years</strong></div>
            </div>

            <div class="cert-section-title">2. AI Health Index & Predictive Risk Synthesis</div>
            <div class="cert-grid">
                <div class="cert-item"><span>AI Transformer Health Index</span><strong style="color:${ai.failure_risk_color}; font-size:1.1rem;">${ai.health_index}%</strong></div>
                <div class="cert-item"><span>Failure Risk Status</span><strong style="color:${ai.failure_risk_color};">${ai.failure_risk_category} (${ai.failure_probability_pct}% Prob)</strong></div>
                <div class="cert-item"><span>AI Fault Diagnosis</span><strong>${ai.predicted_fault_type}</strong></div>
                <div class="cert-item"><span>Duval Triangle 1 Zone</span><strong>Zone ${ai.duval_triangle_1.zone}</strong></div>
                <div class="cert-item"><span>IEEE C57.104 Condition</span><strong>${dga.condition_label}</strong></div>
                <div class="cert-item"><span>Estimated RUL</span><strong>${ai.rul_months} Months (${ai.rul_years} Yrs)</strong></div>
            </div>

            <div class="cert-section-title">3. Measured Oil Dielectric & Dissolved Gas Telemetry</div>
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:16px;">
                <thead>
                    <tr style="background:#f1f5f9; text-align:left;">
                        <th style="padding:6px; border:1px solid #cbd5e1;">Gas / Metric</th>
                        <th style="padding:6px; border:1px solid #cbd5e1;">Reading</th>
                        <th style="padding:6px; border:1px solid #cbd5e1;">IEEE Cond 1 Limit</th>
                        <th style="padding:6px; border:1px solid #cbd5e1;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Hydrogen (H₂)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.h2_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">100 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.h2_ppm > 100 ? '⚠️ Elevated' : '✓ Normal'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Methane (CH₄)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.ch4_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">120 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.ch4_ppm > 120 ? '⚠️ Elevated' : '✓ Normal'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Ethylene (C₂H₄)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.c2h4_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">50 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.c2h4_ppm > 50 ? '⚠️ Elevated' : '✓ Normal'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Acetylene (C₂H₂)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.c2h2_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">1 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.c2h2_ppm > 1 ? '🚨 Critical Arcing' : '✓ Normal'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Carbon Monoxide (CO)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.co_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">350 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.co_ppm > 350 ? '⚠️ Paper Aging' : '✓ Normal'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Dielectric Breakdown (BDV)</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.bdv_kv} kV</td><td style="padding:5px; border:1px solid #e2e8f0;">&gt; 50 kV</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.bdv_kv < 40 ? '⚠️ Poor Dielectric' : '✓ Good'}</td></tr>
                    <tr><td style="padding:5px; border:1px solid #e2e8f0;">Moisture Content</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.moisture_ppm} ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">&lt; 20 ppm</td><td style="padding:5px; border:1px solid #e2e8f0;">${tx.moisture_ppm > 25 ? '⚠️ High Moisture' : '✓ Good'}</td></tr>
                </tbody>
            </table>

            <div class="cert-section-title">4. Prescriptive Action Plan & Engineering Directives</div>
            <ul style="padding-left:20px; font-size:0.85rem; color:#334155; line-height:1.6;">
                ${ai.recommendations.map(r => `<li><strong>[${r.priority}] ${r.action}:</strong> ${r.detail} (Timeframe: ${r.timeframe})</li>`).join('')}
            </ul>

            <div class="cert-sign-box">
                <div>
                    <div><strong>Antigravity AI Diagnostic Engine</strong></div>
                    <div>Transformer IQ Core v1.0.0</div>
                </div>
                <div style="text-align:right;">
                    <div><strong>Principal High-Voltage Asset Engineer</strong></div>
                    <div>______________________________________</div>
                    <div style="font-size:0.72rem;">Authorized Electrical Grid Signature</div>
                </div>
            </div>
        </div>
    `;
}

// --------------------------------------------------------------------------
// Periodic Telemetry Jitter & Live Updates
// --------------------------------------------------------------------------
async function refreshLiveTelemetry() {
    // 1. Diagnostics Tab Telemetry Jitter
    if (state.activeTab === 'tab-diagnostics' && state.activeTransformerDetails) {
        const tx = state.activeTransformerDetails.transformer;
        tx.winding_hotspot_temp_c = roundVal(tx.winding_hotspot_temp_c + (Math.random() - 0.5) * 0.4, 1);
        tx.top_oil_temp_c = roundVal(tx.top_oil_temp_c + (Math.random() - 0.5) * 0.2, 1);
        updateDigitalTwin(tx, state.activeTransformerDetails.ai_diagnosis);
    }

    // 2. Real-Time Alert & Substation Map Jitter & Sync
    if (state.fleetData && state.fleetData.transformers) {
        const activeTx = state.fleetData.transformers.find(t => t.id === state.activeAlertTxId);
        if (activeTx) {
            // Subtle real-time sensor fluctuation
            activeTx.current_a = roundVal(activeTx.current_a + (Math.random() - 0.5) * 1.5, 1);
            activeTx.tank_pressure_psi = roundVal(Math.max(1.0, activeTx.tank_pressure_psi + (Math.random() - 0.5) * 0.02), 2);
            activeTx.vibration_mms = roundVal(Math.max(0.5, activeTx.vibration_mms + (Math.random() - 0.5) * 0.04), 2);
            activeTx.frequency_hz = roundVal(49.85 + Math.random() * 0.3, 2);
            updateMonitoredParamsBar(activeTx);
        }
    }
}

// --------------------------------------------------------------------------
// Utilities
// --------------------------------------------------------------------------
function roundVal(val, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
}

function showToast(msg) {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ==========================================================================
// REAL-TIME TRANSFORMER & NEARBY SUBSTATION ALERT SYSTEM
// ==========================================================================

function initAlertSystem() {
    initSubstationMap();
    initAudioAlarm();
    initAlertActionHandlers();
    initHistoryFilters();
}

// --------------------------------------------------------------------------
// Audio Alarm Siren (Web Audio API Synthesizer)
// --------------------------------------------------------------------------
function initAudioAlarm() {
    const toggleBtn = document.getElementById('btnAudioAlarmToggle');
    const bannerAudioBtn = document.getElementById('btnToggleAlarmSound');

    function toggleAudio() {
        state.audioAlarmEnabled = !state.audioAlarmEnabled;
        const icon = state.audioAlarmEnabled ? '🔊' : '🔇';
        const txt = state.audioAlarmEnabled ? 'ON' : 'OFF';

        if (document.getElementById('audioStatusIcon')) document.getElementById('audioStatusIcon').textContent = icon;
        if (document.getElementById('audioStatusText')) document.getElementById('audioStatusText').textContent = txt;
        if (document.getElementById('alarmSoundIcon')) document.getElementById('alarmSoundIcon').textContent = icon;
        if (toggleBtn) toggleBtn.classList.toggle('active', state.audioAlarmEnabled);

        showToast(state.audioAlarmEnabled ? '🔊 Emergency Audio Siren Enabled' : '🔇 Emergency Audio Siren Muted');
        if (state.audioAlarmEnabled) playAlarmChime(false);
    }

    if (toggleBtn) toggleBtn.addEventListener('click', toggleAudio);
    if (bannerAudioBtn) bannerAudioBtn.addEventListener('click', toggleAudio);
}

function playAlarmChime(force = false) {
    if (!state.audioAlarmEnabled && !force) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!state.audioContext) state.audioContext = new AudioContext();
        if (state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }

        const now = state.audioContext.currentTime;
        // Two-tone warning alert buzzer (880Hz to 660Hz)
        const osc1 = state.audioContext.createOscillator();
        const gain1 = state.audioContext.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(660, now + 0.28);

        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain1);
        gain1.connect(state.audioContext.destination);

        osc1.start(now);
        osc1.stop(now + 0.35);
    } catch (e) {
        console.warn('Audio chime unable to play:', e);
    }
}

// --------------------------------------------------------------------------
// Substation & Alert Data Fetching
// --------------------------------------------------------------------------
async function loadSubstationsAndAlerts() {
    await fetchSubstations();
    await fetchAlerts();
    updateMapMarkers();
}

async function fetchSubstations() {
    try {
        const res = await fetch('/api/substations');
        if (!res.ok) throw new Error('Failed to load substations');
        const data = await res.json();
        state.substationsData = data.substations;
    } catch (err) {
        console.error('Error fetching substations:', err);
    }
}

async function fetchAlerts(severity = null, status = null, txId = null) {
    try {
        let url = '/api/alerts?';
        if (severity && severity !== 'ALL') url += `severity=${encodeURIComponent(severity)}&`;
        if (status && status !== 'ALL') url += `status=${encodeURIComponent(status)}&`;
        if (txId && txId !== 'ALL') url += `transformer_id=${encodeURIComponent(txId)}&`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load alerts');
        const data = await res.json();
        state.alertsData = data;

        // Render Alert History Table
        renderAlertsHistoryTable(data.alerts);

        // Update Dossier & Active Banner
        const primaryAlert = data.alerts.find(a => a.status === 'ACTIVE' && (a.severity === 'Critical' || a.severity === 'Emergency')) || data.alerts[0];
        if (primaryAlert) {
            updateAlertBannerAndDossier(primaryAlert);
        }
    } catch (err) {
        console.error('Error fetching alerts:', err);
    }
}

// --------------------------------------------------------------------------
// Geospatial Leaflet Map Engine
// --------------------------------------------------------------------------
function initSubstationMap() {
    const mapContainer = document.getElementById('substationMap');
    if (!mapContainer || state.map) return;

    // Center on the regional grid corridor
    state.map = L.map('substationMap', {
        center: [17.4475, 78.3680],
        zoom: 13,
        zoomControl: true
    });

    // High-Contrast Cyberpunk / Dark SCADA Base Tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    // Map control buttons
    const btnRecenter = document.getElementById('btnRecenterMap');
    if (btnRecenter) {
        btnRecenter.addEventListener('click', () => {
            state.map.flyTo([17.4475, 78.3680], 13, { duration: 1.0 });
        });
    }

    const btnFocus = document.getElementById('btnFocusAlertTx');
    if (btnFocus) {
        btnFocus.addEventListener('click', () => {
            focusOnAlertTransformer(state.activeAlertTxId);
        });
    }

    const btnBannerView = document.getElementById('btnBannerViewAlert');
    if (btnBannerView) {
        btnBannerView.addEventListener('click', () => {
            switchTab('tab-alerts-map');
            focusOnAlertTransformer(state.activeAlertTxId);
        });
    }

    const btnDismissBanner = document.getElementById('btnDismissBanner');
    if (btnDismissBanner) {
        btnDismissBanner.addEventListener('click', () => {
            document.getElementById('activeEmergencyBanner').style.display = 'none';
        });
    }
}

function updateMapMarkers() {
    if (!state.map) return;

    // Clear old markers
    Object.values(state.mapMarkers).forEach(m => state.map.removeLayer(m));
    state.mapMarkers = {};
    clearProximityLines();

    // 1. Add Substation Markers
    if (state.substationsData) {
        state.substationsData.forEach(ss => {
            const ssIcon = L.divIcon({
                className: 'custom-ss-marker-wrapper',
                html: `
                    <div class="custom-ss-marker" title="${ss.name} (${ss.voltage_kv}kV)">
                        <div class="ss-core">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                        </div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([ss.lat, ss.lng], { icon: ssIcon }).addTo(state.map);
            marker.bindPopup(`
                <div style="font-family:'Inter',sans-serif; min-width:220px;">
                    <div style="font-weight:800; color:#00f2fe; font-size:1.0rem; margin-bottom:4px;">${ss.id} — ${ss.name}</div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:8px;">${ss.address || 'Regional Grid Hub'}</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.78rem; background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; margin-bottom:10px;">
                        <div><span style="color:#64748b;">Voltage:</span> <strong>${ss.voltage_kv} kV</strong></div>
                        <div><span style="color:#64748b;">Capacity:</span> <strong>${ss.total_capacity_mva} MVA</strong></div>
                        <div><span style="color:#64748b;">Spare:</span> <strong style="color:#10b981;">${ss.spare_capacity_mva} MVA</strong></div>
                        <div><span style="color:#64748b;">Crew ETA:</span> <strong style="color:#f59e0b;">${ss.crew_eta_minutes} min</strong></div>
                    </div>
                    <div style="font-size:0.74rem; color:#94a3b8; margin-bottom:10px;">Crew Status: <strong>${ss.crew_status}</strong> | Tel: <code>${ss.control_contact}</code></div>
                    <button onclick="dispatchSubstationCrew('${ss.id}')" style="width:100%; background:linear-gradient(135deg,#00f2fe,#4facfe); color:#020617; border:none; padding:7px; font-weight:800; border-radius:5px; font-size:0.80rem; cursor:pointer;">
                        ⚡ Dispatch Emergency Team (${ss.id})
                    </button>
                </div>
            `);

            state.mapMarkers[`ss_${ss.id}`] = marker;
        });
    }

    // 2. Add Transformer Markers
    if (state.fleetData && state.fleetData.transformers) {
        state.fleetData.transformers.forEach(tx => {
            const ai = tx.ai_diagnosis;
            const level = ai ? ai.alert_condition.level : 'Normal';

            let coreClass = '';
            let hasRadar = false;
            let isEmergency = false;

            if (level === 'Emergency') {
                coreClass = 'emergency';
                hasRadar = true;
                isEmergency = true;
            } else if (level === 'Critical') {
                coreClass = 'critical';
                hasRadar = true;
            } else if (level === 'Warning') {
                coreClass = 'warning';
            }

            const txIcon = L.divIcon({
                className: 'custom-tx-marker-wrapper',
                html: `
                    <div class="custom-tx-marker" title="${tx.id}: ${tx.name} [${level.toUpperCase()}]">
                        ${hasRadar ? `<div class="marker-radar ${isEmergency ? 'emergency' : ''}"></div>` : ''}
                        <div class="marker-core ${coreClass}">
                            <span>${tx.id.replace('TX-', '').replace('TR-', '')}</span>
                        </div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([tx.lat, tx.lng], { icon: txIcon }).addTo(state.map);

            const nearestText = ai && ai.nearest_substations ? ai.nearest_substations.map(s => `${s.substation_id} (${s.distance_km} km)`).join(', ') : 'Calculating...';

            marker.bindPopup(`
                <div style="font-family:'Inter',sans-serif; min-width:240px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="font-size:1.05rem; color:#f8fafc;">${tx.id}</strong>
                        <span style="font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; ${level === 'Emergency' ? 'background:#e11d48; color:#fff;' : (level === 'Critical' ? 'background:#f43f5e; color:#fff;' : 'background:#10b981; color:#000;')}">${level.toUpperCase()}</span>
                    </div>
                    <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:8px;">${tx.name} (${tx.location})</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.78rem; background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; margin-bottom:8px;">
                        <div><span style="color:#64748b;">Temp:</span> <strong>${tx.winding_hotspot_temp_c}°C</strong></div>
                        <div><span style="color:#64748b;">Load:</span> <strong>${tx.load_factor_pct}%</strong></div>
                        <div><span style="color:#64748b;">Voltage:</span> <strong>${tx.voltage_kv} kV</strong></div>
                        <div><span style="color:#64748b;">Pressure:</span> <strong>${tx.tank_pressure_psi} PSI</strong></div>
                        <div><span style="color:#64748b;">Vibration:</span> <strong>${tx.vibration_mms} mm/s</strong></div>
                        <div><span style="color:#64748b;">Oil Level:</span> <strong>${tx.oil_level_pct}%</strong></div>
                    </div>
                    <div style="font-size:0.74rem; color:#00f2fe; margin-bottom:10px;">
                        📍 <strong>Nearest:</strong> ${nearestText}
                    </div>
                    <button onclick="selectTransformerForAlert('${tx.id}')" style="width:100%; background:var(--bg-surface-elevated); color:#00f2fe; border:1px solid #00f2fe; padding:6px; font-weight:700; border-radius:5px; font-size:0.78rem; cursor:pointer;">
                        🔍 Select & Inspect Dossier
                    </button>
                </div>
            `);

            marker.on('click', () => {
                selectTransformerForAlert(tx.id);
            });

            state.mapMarkers[`tx_${tx.id}`] = marker;
        });
    }

    // Select initial active alert unit (TR-1025)
    selectTransformerForAlert(state.activeAlertTxId);
}

function clearProximityLines() {
    if (state.proximityLines) {
        state.proximityLines.forEach(line => state.map.removeLayer(line));
        state.proximityLines = [];
    }
}

function drawProximityLines(tx, nearestSubstations) {
    if (!state.map || !nearestSubstations || nearestSubstations.length === 0) return;
    clearProximityLines();

    nearestSubstations.slice(0, 3).forEach((ss, idx) => {
        const isPrimary = idx === 0;
        const color = isPrimary ? '#00f2fe' : (idx === 1 ? '#38bdf8' : '#818cf8');
        const weight = isPrimary ? 3.5 : 2.0;

        const line = L.polyline([[tx.lat, tx.lng], [ss.lat, ss.lng]], {
            color: color,
            weight: weight,
            opacity: isPrimary ? 0.9 : 0.6,
            dashArray: isPrimary ? '6, 8' : '4, 6'
        }).addTo(state.map);

        line.bindTooltip(`📍 ${ss.name} (${ss.substation_id}) — ${ss.distance_km} km`, {
            sticky: true,
            className: 'leaflet-tooltip-dark'
        });

        state.proximityLines.push(line);
    });
}

function focusOnAlertTransformer(txId) {
    if (!state.fleetData || !state.fleetData.transformers || !state.map) return;
    const tx = state.fleetData.transformers.find(t => t.id === txId);
    if (tx) {
        state.map.flyTo([tx.lat, tx.lng], 14, { duration: 1.2 });
        selectTransformerForAlert(txId);
        const marker = state.mapMarkers[`tx_${txId}`];
        if (marker) marker.openPopup();
    }
}

// --------------------------------------------------------------------------
// Transformer Selection & Dossier Update
// --------------------------------------------------------------------------
function selectTransformerForAlert(txId) {
    state.activeAlertTxId = txId;
    if (!state.fleetData || !state.fleetData.transformers) return;

    const tx = state.fleetData.transformers.find(t => t.id === txId);
    if (!tx) return;

    const ai = tx.ai_diagnosis;
    const level = ai ? ai.alert_condition.level : 'Normal';
    const nearest = ai ? ai.nearest_substations : [];

    // 1. Update 11-Item Monitored Parameters Bar
    updateMonitoredParamsBar(tx);

    // 2. Update Proximity Vector Lines on Map
    drawProximityLines(tx, nearest);

    // 3. Update the Right-Side Alert Dossier Card
    const dossierTitle = document.getElementById('dossierTitle');
    const dossierHeader = document.getElementById('dossierHeader');
    const dossierBadge = document.getElementById('dossierSeverityBadge');

    if (level === 'Emergency') {
        if (dossierTitle) dossierTitle.textContent = '🚨 EMERGENCY TRANSFORMER ALERT';
        if (dossierHeader) dossierHeader.className = 'dossier-header dossier-emergency';
        if (dossierBadge) { dossierBadge.textContent = 'EMERGENCY'; dossierBadge.style.color = '#fff'; dossierBadge.style.background = '#e11d48'; }
    } else if (level === 'Critical') {
        if (dossierTitle) dossierTitle.textContent = '🚨 CRITICAL TRANSFORMER ALERT';
        if (dossierHeader) dossierHeader.className = 'dossier-header dossier-critical';
        if (dossierBadge) { dossierBadge.textContent = 'CRITICAL'; dossierBadge.style.color = '#f43f5e'; dossierBadge.style.background = 'rgba(244, 63, 94, 0.25)'; }
    } else if (level === 'Warning') {
        if (dossierTitle) dossierTitle.textContent = '⚠️ TRANSFORMER WARNING ALERT';
        if (dossierHeader) dossierHeader.className = 'dossier-header';
        if (dossierBadge) { dossierBadge.textContent = 'WARNING'; dossierBadge.style.color = '#f59e0b'; dossierBadge.style.background = 'rgba(245, 158, 11, 0.25)'; }
    } else {
        if (dossierTitle) dossierTitle.textContent = '✅ TRANSFORMER HEALTH STATUS';
        if (dossierHeader) dossierHeader.className = 'dossier-header';
        if (dossierBadge) { dossierBadge.textContent = 'NORMAL'; dossierBadge.style.color = '#10b981'; dossierBadge.style.background = 'rgba(16, 185, 129, 0.25)'; }
    }

    if (document.getElementById('dossierTxId')) document.getElementById('dossierTxId').textContent = tx.id;
    if (document.getElementById('dossierStatus')) {
        const statEl = document.getElementById('dossierStatus');
        statEl.textContent = level.toUpperCase();
        statEl.className = `meta-value text-${level.toLowerCase()}`;
    }
    if (document.getElementById('dossierTemp')) document.getElementById('dossierTemp').textContent = `${tx.winding_hotspot_temp_c}°C`;
    if (document.getElementById('dossierLoad')) document.getElementById('dossierLoad').textContent = `${tx.load_factor_pct}%`;
    if (document.getElementById('dossierLocation')) document.getElementById('dossierLocation').textContent = `${tx.location} [${tx.lat.toFixed(4)}° N, ${tx.lng.toFixed(4)}° E]`;
    if (document.getElementById('dossierTimestamp')) document.getElementById('dossierTimestamp').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    // Nearest Substations List
    const ssListEl = document.getElementById('dossierSubstationsList');
    if (ssListEl && nearest && nearest.length > 0) {
        ssListEl.innerHTML = nearest.slice(0, 3).map((ss, idx) => `
            <div class="ss-rank-item ${idx === 0 ? 'ss-primary' : ''}">
                <div class="ss-rank-num">${idx + 1}</div>
                <div class="ss-rank-info">
                    <strong>Substation ${ss.substation_id}</strong> — <span class="dist-tag">${ss.distance_km} km</span>
                    <div class="ss-sub-info">${ss.name} (${ss.voltage_kv}kV) • Spare: ${ss.spare_capacity_mva} MVA • Crew ETA: ${ss.crew_eta_minutes} min</div>
                </div>
                <button class="btn-dispatch-sm" onclick="dispatchSubstationCrew('${ss.substation_id}')">Dispatch</button>
            </div>
        `).join('');
    }

    // Recommended Action
    const recBox = document.getElementById('dossierRecommendedAction');
    if (recBox && ai) {
        recBox.textContent = ai.recommended_action || `Immediately inspect Transformer ${tx.id} and coordinate with the nearest available substation.`;
    }

    // Update primary dispatch button
    const btnPrimaryDisp = document.getElementById('btnDispatchPrimaryCrew');
    if (btnPrimaryDisp && nearest && nearest.length > 0) {
        btnPrimaryDisp.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            Dispatch Nearest Crew (${nearest[0].substation_id} — ${nearest[0].distance_km} km)
        `;
        btnPrimaryDisp.onclick = () => dispatchSubstationCrew(nearest[0].substation_id);
    }
}

function updateMonitoredParamsBar(tx) {
    const ai = tx.ai_diagnosis;
    const level = ai ? ai.alert_condition.level : 'Normal';
    const nearest = ai && ai.nearest_substations && ai.nearest_substations.length > 0 ? ai.nearest_substations[0] : null;

    if (document.getElementById('barSelectedTxName')) {
        document.getElementById('barSelectedTxName').textContent = `${tx.name} (${tx.id})`;
    }
    if (document.getElementById('barSelectedTxStatus')) {
        const st = document.getElementById('barSelectedTxStatus');
        st.textContent = level.toUpperCase();
        st.className = `status-pill status-${level.toLowerCase()}`;
    }
    if (document.getElementById('barSelectedTxGps')) {
        document.getElementById('barSelectedTxGps').textContent = `${tx.lat.toFixed(4)}° N, ${tx.lng.toFixed(4)}° E`;
    }

    // 11 Parameter Readouts
    if (document.getElementById('pillValTemp')) document.getElementById('pillValTemp').textContent = `${tx.winding_hotspot_temp_c}°C / ${tx.top_oil_temp_c}°C`;
    if (document.getElementById('pillValOil')) document.getElementById('pillValOil').textContent = `${tx.oil_level_pct}%`;
    if (document.getElementById('pillValLoad')) document.getElementById('pillValLoad').textContent = `${tx.load_factor_pct}% (${tx.current_a} A)`;
    if (document.getElementById('pillValVoltage')) document.getElementById('pillValVoltage').textContent = `${tx.voltage_kv} kV`;
    if (document.getElementById('pillValPressure')) document.getElementById('pillValPressure').textContent = `${tx.tank_pressure_psi} PSI`;
    if (document.getElementById('pillValPF')) document.getElementById('pillValPF').textContent = `${tx.power_factor} cos φ`;
    if (document.getElementById('pillValVibration')) document.getElementById('pillValVibration').textContent = `${tx.vibration_mms} mm/s`;
    if (document.getElementById('pillValFreq')) document.getElementById('pillValFreq').textContent = `${tx.frequency_hz} Hz`;
    if (document.getElementById('pillValFault')) document.getElementById('pillValFault').textContent = ai ? ai.predicted_fault_type : 'Normal';
    if (document.getElementById('pillValHI')) document.getElementById('pillValHI').textContent = ai ? `${ai.health_index}%` : 'N/A';
    if (document.getElementById('pillValNearestSS')) {
        document.getElementById('pillValNearestSS').textContent = nearest ? `${nearest.substation_id} (${nearest.distance_km} km)` : 'Computing...';
    }
}

// --------------------------------------------------------------------------
// Top Emergency Alert Banner Update
// --------------------------------------------------------------------------
function updateAlertBannerAndDossier(primaryAlert) {
    const banner = document.getElementById('activeEmergencyBanner');
    if (!banner || !primaryAlert) return;

    if (primaryAlert.status === 'ACTIVE' && (primaryAlert.severity === 'Critical' || primaryAlert.severity === 'Emergency')) {
        banner.style.display = 'flex';
        if (document.getElementById('bannerSeverity')) document.getElementById('bannerSeverity').textContent = `${primaryAlert.severity.toUpperCase()} ALERT`;
        if (document.getElementById('bannerTxId')) document.getElementById('bannerTxId').textContent = `Transformer ${primaryAlert.transformer_id}`;
        if (document.getElementById('bannerReason')) {
            const nearestName = primaryAlert.nearest_substations && primaryAlert.nearest_substations[0] ? `${primaryAlert.nearest_substations[0].substation_id} (${primaryAlert.nearest_substations[0].distance_km} km)` : 'Nearby Hub';
            document.getElementById('bannerReason').textContent = `${primaryAlert.reason} Nearest: ${nearestName}`;
        }
        playAlarmChime();
    } else {
        banner.style.display = 'none';
    }
}

// --------------------------------------------------------------------------
// Incident Audit Log & History Table
// --------------------------------------------------------------------------
function renderAlertsHistoryTable(alerts) {
    const tbody = document.getElementById('alertsHistoryTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!alerts || alerts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">No incident records matching the selected filters.</td></tr>`;
        return;
    }

    alerts.forEach(a => {
        const tr = document.createElement('tr');
        const nearestText = a.nearest_substations && a.nearest_substations[0] ? `${a.nearest_substations[0].substation_id} (${a.nearest_substations[0].distance_km} km)` : 'N/A';

        tr.innerHTML = `
            <td><span class="status-pill status-${a.severity.toLowerCase()}">${a.severity}</span></td>
            <td><code>${a.alert_id}</code></td>
            <td><strong>${a.transformer_id}</strong><div style="font-size:0.74rem; color:var(--text-muted);">${a.transformer_name}</div></td>
            <td style="max-width:260px;"><div style="font-size:0.80rem;">${a.reason}</div></td>
            <td><span class="dist-tag">${a.hotspot_temp_c}°C</span> / <strong>${a.load_pct}%</strong></td>
            <td><span style="font-size:0.75rem; color:var(--primary);">${a.location}</span></td>
            <td><strong class="cyan-glow">${nearestText}</strong></td>
            <td style="font-size:0.76rem; color:var(--text-muted);">${a.detected_at}</td>
            <td><span class="history-status-chip ${a.status}">${a.status}</span></td>
            <td>
                <div class="history-action-btns">
                    ${a.status === 'ACTIVE' ? `
                        <button class="btn-table-action" onclick="acknowledgeAlert('${a.alert_id}')" title="Acknowledge">Ack</button>
                        <button class="btn-table-action" onclick="openDispatchModal('${a.alert_id}', '${a.nearest_substations && a.nearest_substations[0] ? a.nearest_substations[0].substation_id : 'SS-04'}')" title="Dispatch Crew">Dispatch</button>
                    ` : (a.status === 'DISPATCHED' ? `
                        <button class="btn-table-action" onclick="resolveAlert('${a.alert_id}')" title="Mark Resolved">Resolve</button>
                    ` : (a.status === 'ACKNOWLEDGED' ? `
                        <button class="btn-table-action" onclick="resolveAlert('${a.alert_id}')" title="Mark Resolved">Resolve</button>
                    ` : `<span style="font-size:0.72rem; color:#10b981;">Archived</span>`))}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --------------------------------------------------------------------------
// Alert Actions: Acknowledge, Resolve, Dispatch
// --------------------------------------------------------------------------
async function acknowledgeAlert(alertId) {
    try {
        const res = await fetch('/api/alerts/acknowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alert_id: alertId,
                operator_name: 'Lead SCADA Dispatcher',
                notes: 'Telemetry acknowledged by control center. Field team alerted.'
            })
        });
        if (!res.ok) throw new Error('Acknowledge failed');
        const data = await res.json();
        showToast(`✔️ Alert ${alertId} Acknowledged`);
        await fetchAlerts();
    } catch (err) {
        showToast('Error acknowledging alert: ' + err.message);
    }
}

async function resolveAlert(alertId) {
    try {
        const res = await fetch('/api/alerts/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alert_id: alertId,
                operator_name: 'Lead SCADA Dispatcher',
                notes: 'Condition stabilized, thermal loading brought within safe limits.'
            })
        });
        if (!res.ok) throw new Error('Resolution failed');
        const data = await res.json();
        showToast(`✅ Alert ${alertId} Marked Resolved`);
        await fetchAlerts();
    } catch (err) {
        showToast('Error resolving alert: ' + err.message);
    }
}

function dispatchSubstationCrew(substationId) {
    const activeAlert = state.alertsData ? state.alertsData.alerts.find(a => a.transformer_id === state.activeAlertTxId && a.status === 'ACTIVE') : null;
    const alertId = activeAlert ? activeAlert.alert_id : `ALT-LIVE-${state.activeAlertTxId}`;
    openDispatchModal(alertId, substationId);
}

function openDispatchModal(alertId, substationId) {
    const modal = document.getElementById('dispatchModal');
    const body = document.getElementById('dispatchModalBody');
    if (!modal || !body) return;

    const ss = state.substationsData ? state.substationsData.find(s => s.id === substationId) : null;
    const ssName = ss ? ss.name : `Substation ${substationId}`;
    const eta = ss ? ss.crew_eta_minutes : 7;
    const spare = ss ? ss.spare_capacity_mva : 50;

    body.innerHTML = `
        <div class="dispatch-order-card">
            <div class="dispatch-order-row"><span>Target Transformer:</span> <strong>${state.activeAlertTxId}</strong></div>
            <div class="dispatch-order-row"><span>Responding Substation:</span> <strong style="color:#00f2fe;">${substationId} — ${ssName}</strong></div>
            <div class="dispatch-order-row"><span>Emergency Crew ETA:</span> <strong style="color:#f59e0b;">~${eta} minutes</strong></div>
            <div class="dispatch-order-row"><span>Substation Spare Capacity:</span> <strong style="color:#10b981;">${spare} MVA</strong></div>
            <div class="dispatch-order-row"><span>Alert Incident ID:</span> <code>${alertId}</code></div>
        </div>
        <div class="dispatch-form-group">
            <label>Authorizing Control Engineer</label>
            <input type="text" id="dispatchOperatorName" class="dispatch-input" value="Principal Grid Controller" />
        </div>
        <div class="dispatch-form-group">
            <label>Dispatch Directives & Orders</label>
            <input type="text" id="dispatchNotes" class="dispatch-input" value="Dispatch fast-response team for immediate load shedding and cooling verification." />
        </div>
        <button id="btnConfirmDispatch" class="btn-primary-dispatch" style="width:100%;">
            🚀 Authorize & Issue Emergency Dispatch Directive
        </button>
    `;

    document.getElementById('btnConfirmDispatch').onclick = async () => {
        const opName = document.getElementById('dispatchOperatorName').value;
        const notes = document.getElementById('dispatchNotes').value;
        await submitDispatch(alertId, substationId, opName, notes);
    };

    modal.classList.add('active');
}

async function submitDispatch(alertId, substationId, operatorName, notes) {
    try {
        const res = await fetch('/api/alerts/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alert_id: alertId,
                substation_id: substationId,
                operator_name: operatorName,
                notes: notes
            })
        });
        if (!res.ok) throw new Error('Dispatch call failed');
        const data = await res.json();
        document.getElementById('dispatchModal').classList.remove('active');
        showToast(`🚀 Emergency Crew Dispatched from Substation ${substationId}!`);
        await fetchAlerts();
    } catch (err) {
        showToast('Dispatch logged locally. Error syncing API: ' + err.message);
        document.getElementById('dispatchModal').classList.remove('active');
    }
}

// --------------------------------------------------------------------------
// Quick Simulation Scenarios
// --------------------------------------------------------------------------
function initAlertActionHandlers() {
    // Acknowledge & Resolve Active dossier buttons
    const btnAck = document.getElementById('btnAcknowledgeActiveAlert');
    if (btnAck) {
        btnAck.addEventListener('click', () => {
            const activeAlert = state.alertsData ? state.alertsData.alerts.find(a => a.transformer_id === state.activeAlertTxId) : null;
            if (activeAlert) acknowledgeAlert(activeAlert.alert_id);
            else showToast('No active alert for this unit to acknowledge.');
        });
    }

    const btnResolve = document.getElementById('btnResolveActiveAlert');
    if (btnResolve) {
        btnResolve.addEventListener('click', () => {
            const activeAlert = state.alertsData ? state.alertsData.alerts.find(a => a.transformer_id === state.activeAlertTxId) : null;
            if (activeAlert) resolveAlert(activeAlert.alert_id);
            else showToast('Unit is already operating normally.');
        });
    }

    // Modal Close
    const btnCloseDisp = document.getElementById('btnCloseDispatchModal');
    if (btnCloseDisp) {
        btnCloseDisp.addEventListener('click', () => {
            document.getElementById('dispatchModal').classList.remove('active');
        });
    }

    // Quick Simulation Trigger Buttons
    const btnTR1025 = document.getElementById('btnTriggerTR1025');
    if (btnTR1025) {
        btnTR1025.addEventListener('click', () => simulateCondition('TR-1025', 'Critical'));
    }

    const btnTX104 = document.getElementById('btnTriggerTX104');
    if (btnTX104) {
        btnTX104.addEventListener('click', () => simulateCondition('TX-104', 'Emergency'));
    }

    const btnTX103 = document.getElementById('btnTriggerTX103');
    if (btnTX103) {
        btnTX103.addEventListener('click', () => simulateCondition('TX-103', 'Warning'));
    }

    const btnNormAll = document.getElementById('btnTriggerNormalAll');
    if (btnNormAll) {
        btnNormAll.addEventListener('click', async () => {
            showToast('🟢 Resetting all fleet units to normal safe limits...');
            for (const tx of state.fleetData.transformers) {
                await fetch('/api/alerts/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transformer_id: tx.id, preset_condition: 'Normal' })
                });
            }
            await fetchFleetData();
            await fetchAlerts();
            updateMapMarkers();
            showToast('✅ All fleet transformers operating within safe limits.');
        });
    }

    // CSV & JSON Exports
    const btnCsv = document.getElementById('btnExportAlertsCsv');
    if (btnCsv) {
        btnCsv.addEventListener('click', () => exportAlerts('csv'));
    }
    const btnJson = document.getElementById('btnExportAlertsJson');
    if (btnJson) {
        btnJson.addEventListener('click', () => exportAlerts('json'));
    }
}

async function simulateCondition(txId, condition) {
    try {
        showToast(`⚡ Simulating ${condition.toUpperCase()} on Transformer ${txId}...`);
        const res = await fetch('/api/alerts/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformer_id: txId,
                preset_condition: condition
            })
        });
        if (!res.ok) throw new Error('Simulation failed');
        const data = await res.json();

        // Refresh state
        await fetchFleetData();
        await fetchAlerts();
        selectTransformerForAlert(txId);
        updateMapMarkers();
        focusOnAlertTransformer(txId);

        if (condition === 'Critical' || condition === 'Emergency') {
            const nearest = data.ai_diagnosis && data.ai_diagnosis.nearest_substations ? data.ai_diagnosis.nearest_substations[0] : null;
            const reason = (data.generated_alert && data.generated_alert.reason) ? data.generated_alert.reason : `${condition} condition detected`;
            voiceEngine.triggerAlertAnnouncement(txId, condition, reason, nearest);
        }
        showToast(`🚨 ${condition.toUpperCase()} condition triggered on ${txId}! Nearest substations calculated.`);
    } catch (err) {
        showToast('Simulation error: ' + err.message);
    }
}

function exportAlerts(format) {
    window.open(`/api/alerts/export?format=${format}`, '_blank');
}

// --------------------------------------------------------------------------
// Alert History Filter Handlers
// --------------------------------------------------------------------------
function initHistoryFilters() {
    const sevFilter = document.getElementById('historySeverityFilter');
    const statFilter = document.getElementById('historyStatusFilter');

    if (sevFilter) {
        sevFilter.addEventListener('change', () => {
            fetchAlerts(sevFilter.value, statFilter ? statFilter.value : 'ALL');
        });
    }

    if (statFilter) {
        statFilter.addEventListener('change', () => {
            fetchAlerts(sevFilter ? sevFilter.value : 'ALL', statFilter.value);
        });
    }
}

// ==========================================================================
// SCADA SPEECH SYNTHESIZER & CUSTOMIZABLE VOICE ALERT ENGINE
// ==========================================================================

function playKlaxonSiren() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!state.audioContext) state.audioContext = new AudioContext();
        if (state.audioContext.state === 'suspended') state.audioContext.resume();

        const now = state.audioContext.currentTime;
        const osc = state.audioContext.createOscillator();
        const gain = state.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1150, now + 0.14);
        osc.frequency.linearRampToValueAtTime(600, now + 0.28);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

        osc.connect(gain);
        gain.connect(state.audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.30);
    } catch (e) {
        console.warn('Klaxon audio error:', e);
    }
}

const voiceEngine = {
    voices: [],
    selectedVoice: null,
    settings: {
        preset: 'eva',
        rate: 1.05,
        pitch: 1.0,
        volume: 1.0,
        sequenceMode: 'chime_voice',
        vocalAlertsEnabled: true,
        voiceURI: ''
    },

    init() {
        this.loadSavedSettings();
        this.initVoices();
        this.bindEvents();
    },

    loadSavedSettings() {
        try {
            const saved = localStorage.getItem('transformer_iq_voice_settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Voice settings load error:', e);
        }
    },

    saveSettings() {
        try {
            localStorage.setItem('transformer_iq_voice_settings', JSON.stringify(this.settings));
        } catch (e) {}
        this.updateHeaderAndHeroLabels();
    },

    initVoices() {
        if (!('speechSynthesis' in window)) {
            console.warn('Web Speech API not supported in this browser.');
            return;
        }

        const populate = () => {
            this.voices = window.speechSynthesis.getVoices();
            if (this.voices.length > 0) {
                this.populateVoiceDropdown();
                this.applyPreset(this.settings.preset, false);
                this.updateHeaderAndHeroLabels();
            }
        };

        populate();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populate;
        }
    },

    populateVoiceDropdown() {
        const dd = document.getElementById('voiceSelectDropdown');
        const badge = document.getElementById('voiceCountBadge');
        if (!dd) return;

        dd.innerHTML = '';
        if (badge) badge.textContent = `${this.voices.length} voices available`;

        const sorted = [...this.voices].sort((a, b) => {
            const aEn = a.lang.startsWith('en');
            const bEn = b.lang.startsWith('en');
            if (aEn && !bEn) return -1;
            if (!aEn && bEn) return 1;
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.voiceURI;
            opt.textContent = `${v.name} (${v.lang})${v.default ? ' — Default' : ''}`;
            if (this.settings.voiceURI && v.voiceURI === this.settings.voiceURI) {
                opt.selected = true;
                this.selectedVoice = v;
            }
            dd.appendChild(opt);
        });

        if (!this.selectedVoice && sorted.length > 0) {
            const femaleEn = sorted.find(v => v.lang.startsWith('en') && (v.name.includes('Zira') || v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google US English')));
            this.selectedVoice = femaleEn || sorted[0];
            dd.value = this.selectedVoice.voiceURI;
            this.settings.voiceURI = this.selectedVoice.voiceURI;
        }
    },

    applyPreset(presetName, speakTest = false) {
        this.settings.preset = presetName;
        document.querySelectorAll('.voice-preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-preset') === presetName);
        });

        if (presetName === 'tone_only') {
            this.settings.vocalAlertsEnabled = false;
        } else {
            this.settings.vocalAlertsEnabled = true;
        }

        if (presetName === 'eva') {
            const femaleVoice = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('Zira') || v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google US English')));
            if (femaleVoice) this.setVoiceByURI(femaleVoice.voiceURI);
            this.settings.rate = 1.05;
            this.settings.pitch = 1.05;
            this.settings.sequenceMode = 'chime_voice';
        } else if (presetName === 'jarvis') {
            const maleVoice = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('George') || v.name.includes('Guy') || v.name.includes('Male') || v.name.includes('Google UK English Male')));
            if (maleVoice) this.setVoiceByURI(maleVoice.voiceURI);
            this.settings.rate = 1.0;
            this.settings.pitch = 0.85;
            this.settings.sequenceMode = 'chime_voice';
        } else if (presetName === 'hal') {
            const alertVoice = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('Mark') || v.name.includes('David') || v.name.includes('Google')));
            if (alertVoice) this.setVoiceByURI(alertVoice.voiceURI);
            this.settings.rate = 1.20;
            this.settings.pitch = 1.10;
            this.settings.sequenceMode = 'klaxon_voice';
        }

        this.syncSlidersToUI();
        this.saveSettings();

        if (speakTest && this.settings.vocalAlertsEnabled) {
            this.speak(`Voice profile initialized: ${presetName.toUpperCase()}. Speech synthesizer active.`);
        }
    },

    setVoiceByURI(uri) {
        this.settings.voiceURI = uri;
        this.selectedVoice = this.voices.find(v => v.voiceURI === uri) || this.selectedVoice;
        const dd = document.getElementById('voiceSelectDropdown');
        if (dd) dd.value = uri;
    },

    syncSlidersToUI() {
        const rateEl = document.getElementById('voiceRateSlider');
        const pitchEl = document.getElementById('voicePitchSlider');
        const volEl = document.getElementById('voiceVolumeSlider');
        const valRate = document.getElementById('valVoiceRate');
        const valPitch = document.getElementById('valVoicePitch');
        const valVol = document.getElementById('valVoiceVolume');

        if (rateEl) rateEl.value = this.settings.rate;
        if (pitchEl) pitchEl.value = this.settings.pitch;
        if (volEl) volEl.value = this.settings.volume;

        if (valRate) valRate.textContent = `${this.settings.rate.toFixed(2)}x`;
        if (valPitch) valPitch.textContent = this.settings.pitch.toFixed(2);
        if (valVol) valVol.textContent = `${Math.round(this.settings.volume * 100)}%`;

        document.querySelectorAll('input[name="soundSeqMode"]').forEach(r => {
            r.checked = (r.value === this.settings.sequenceMode);
        });
    },

    updateHeaderAndHeroLabels() {
        let label = 'EVA AI';
        if (this.settings.preset === 'jarvis') label = 'JARVIS';
        else if (this.settings.preset === 'hal') label = 'HAL APEX';
        else if (this.settings.preset === 'tone_only') label = 'TONE ONLY';
        else if (this.selectedVoice) {
            label = this.selectedVoice.name.split(' ')[0] || 'EVA AI';
        }

        const headEl = document.getElementById('headerVoiceName');
        const heroEl = document.getElementById('heroVoiceLabel');
        if (headEl) headEl.textContent = label;
        if (heroEl) heroEl.textContent = label;
    },

    speak(text, onEnd = null) {
        if (!('speechSynthesis' in window) || !this.settings.vocalAlertsEnabled) {
            if (onEnd) onEnd();
            return;
        }

        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) utter.voice = this.selectedVoice;
        utter.rate = this.settings.rate;
        utter.pitch = this.settings.pitch;
        utter.volume = this.settings.volume;

        if (onEnd) utter.onend = onEnd;
        window.speechSynthesis.speak(utter);
    },

    stop() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    },

    triggerAlertAnnouncement(txId, severity, reason, nearestSubstation = null) {
        if (!state.audioAlarmEnabled) return;

        if (this.settings.sequenceMode === 'klaxon_voice') {
            playKlaxonSiren();
        } else if (this.settings.sequenceMode === 'chime_voice') {
            playAlarmChime(true);
        }

        if (this.settings.vocalAlertsEnabled) {
            setTimeout(() => {
                const ssName = nearestSubstation ? nearestSubstation.name || `Substation ${nearestSubstation.substation_id}` : '';
                const ssDist = nearestSubstation ? `${nearestSubstation.distance_km} kilometers` : '';
                const ssText = nearestSubstation ? `Nearest response hub is ${ssName} at ${ssDist}.` : '';
                const cleanReason = reason ? reason.replace(/[()°]/g, ' ').replace('C', 'degrees Celsius') : '';
                const phrase = `Attention Grid Control: ${severity} alert detected on Transformer ${txId}. ${cleanReason}. ${ssText} Immediate coordination required.`;
                this.speak(phrase);
            }, 350);
        }
    },

    bindEvents() {
        document.querySelectorAll('.voice-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.getAttribute('data-preset'), true);
            });
        });

        const dd = document.getElementById('voiceSelectDropdown');
        if (dd) {
            dd.addEventListener('change', () => {
                this.setVoiceByURI(dd.value);
                this.saveSettings();
                this.speak(`Voice switched to ${this.selectedVoice ? this.selectedVoice.name : 'selected voice'}.`);
            });
        }

        const rateSlider = document.getElementById('voiceRateSlider');
        if (rateSlider) {
            rateSlider.addEventListener('input', () => {
                this.settings.rate = parseFloat(rateSlider.value);
                document.getElementById('valVoiceRate').textContent = `${this.settings.rate.toFixed(2)}x`;
            });
            rateSlider.addEventListener('change', () => this.saveSettings());
        }

        const pitchSlider = document.getElementById('voicePitchSlider');
        if (pitchSlider) {
            pitchSlider.addEventListener('input', () => {
                this.settings.pitch = parseFloat(pitchSlider.value);
                document.getElementById('valVoicePitch').textContent = this.settings.pitch.toFixed(2);
            });
            pitchSlider.addEventListener('change', () => this.saveSettings());
        }

        const volSlider = document.getElementById('voiceVolumeSlider');
        if (volSlider) {
            volSlider.addEventListener('input', () => {
                this.settings.volume = parseFloat(volSlider.value);
                document.getElementById('valVoiceVolume').textContent = `${Math.round(this.settings.volume * 100)}%`;
            });
            volSlider.addEventListener('change', () => this.saveSettings());
        }

        document.querySelectorAll('input[name="soundSeqMode"]').forEach(r => {
            r.addEventListener('change', () => {
                this.settings.sequenceMode = r.value;
                this.saveSettings();
            });
        });

        const btnTest = document.getElementById('btnTestVoiceSpeech');
        if (btnTest) {
            btnTest.addEventListener('click', () => {
                const script = document.getElementById('voiceTestScript').value;
                if (this.settings.sequenceMode === 'klaxon_voice') playKlaxonSiren();
                else if (this.settings.sequenceMode === 'chime_voice') playAlarmChime(true);
                setTimeout(() => this.speak(script), 300);
            });
        }

        const btnStop = document.getElementById('btnStopVoiceSpeech');
        if (btnStop) {
            btnStop.addEventListener('click', () => this.stop());
        }

        const btnSave = document.getElementById('btnSaveVoiceSettings');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                this.saveSettings();
                document.getElementById('voiceSettingsModal').classList.remove('active');
                showToast(`🎙️ Voice Settings Applied: ${this.settings.preset.toUpperCase()} (${this.settings.rate.toFixed(2)}x speed)`);
            });
        }

        const modal = document.getElementById('voiceSettingsModal');
        const openModal = () => {
            this.populateVoiceDropdown();
            this.syncSlidersToUI();
            if (modal) modal.classList.add('active');
        };

        const btnHead = document.getElementById('btnHeaderVoiceSettings');
        if (btnHead) btnHead.addEventListener('click', openModal);

        const btnHero = document.getElementById('btnOpenVoiceModalFromHero');
        if (btnHero) btnHero.addEventListener('click', openModal);

        const btnClose = document.getElementById('btnCloseVoiceModal');
        if (btnClose) btnClose.addEventListener('click', () => {
            this.stop();
            if (modal) modal.classList.remove('active');
        });
    }
};

// ==========================================================================
// CUSTOM DATASET UPLOAD & INGESTION HANDLERS
// ==========================================================================
let selectedUploadFile = null;

function initDatasetUploadHandlers() {
    const uploadModal = document.getElementById('datasetUploadModal');
    
    // Modal Openers
    const btnHeadUpload = document.getElementById('btnHeaderUploadDataset');
    if (btnHeadUpload) btnHeadUpload.addEventListener('click', () => openDatasetUploadModal());

    const btnHeroUpload = document.getElementById('btnOpenUploadFromHero');
    if (btnHeroUpload) btnHeroUpload.addEventListener('click', () => openDatasetUploadModal());

    const btnCloseModal = document.getElementById('btnCloseUploadModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => {
        if (uploadModal) uploadModal.classList.remove('active');
    });

    // 1. Modal Dropzone & File Input
    const dropzone = document.getElementById('datasetDropzone');
    const fileInput = document.getElementById('modalDatasetFileInput');
    const btnBrowse = document.getElementById('btnBrowseModalFile');
    const btnSubmit = document.getElementById('btnSubmitDatasetUpload');
    const btnRemove = document.getElementById('btnRemoveSelectedFile');

    if (btnBrowse && fileInput) {
        btnBrowse.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFileSelection(e.target.files[0]);
            }
        });
    }

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    if (btnRemove) {
        btnRemove.addEventListener('click', () => {
            selectedUploadFile = null;
            if (fileInput) fileInput.value = '';
            document.getElementById('uploadFileInfoPanel').style.display = 'none';
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = '0.5';
            btnSubmit.style.cursor = 'not-allowed';
            document.getElementById('uploadResultsCard').style.display = 'none';
        });
    }

    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            if (!selectedUploadFile) return;
            const mode = document.querySelector('input[name="uploadIngestMode"]:checked')?.value || 'append';
            await performDatasetUpload(selectedUploadFile, mode, 'modal');
        });
    }

    // 2. In-Studio (Tab 6) Dropzone & File Input
    const studioDropzone = document.getElementById('studioDatasetDropzone');
    const studioFileInput = document.getElementById('studioDatasetFileInput');
    const btnStudioBrowse = document.getElementById('btnStudioBrowse');
    const btnStudioSubmit = document.getElementById('btnStudioUploadSubmit');
    let selectedStudioFile = null;

    if (btnStudioBrowse && studioFileInput) {
        btnStudioBrowse.addEventListener('click', () => studioFileInput.click());
    }
    if (studioFileInput) {
        studioFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                selectedStudioFile = e.target.files[0];
                document.getElementById('studioFileName').textContent = selectedStudioFile.name;
                document.getElementById('studioFileSize').textContent = `(${(selectedStudioFile.size / 1024).toFixed(1)} KB)`;
                document.getElementById('studioFileInfo').style.display = 'block';
                btnStudioSubmit.disabled = false;
                btnStudioSubmit.style.opacity = '1.0';
                btnStudioSubmit.style.cursor = 'pointer';
            }
        });
    }

    if (studioDropzone) {
        ['dragenter', 'dragover'].forEach(name => {
            studioDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                studioDropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            studioDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                studioDropzone.classList.remove('dragover');
            });
        });
        studioDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            studioDropzone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                selectedStudioFile = e.dataTransfer.files[0];
                document.getElementById('studioFileName').textContent = selectedStudioFile.name;
                document.getElementById('studioFileSize').textContent = `(${(selectedStudioFile.size / 1024).toFixed(1)} KB)`;
                document.getElementById('studioFileInfo').style.display = 'block';
                btnStudioSubmit.disabled = false;
                btnStudioSubmit.style.opacity = '1.0';
                btnStudioSubmit.style.cursor = 'pointer';
            }
        });
    }

    if (btnStudioSubmit) {
        btnStudioSubmit.addEventListener('click', async () => {
            if (!selectedStudioFile) return;
            const mode = document.querySelector('input[name="studioIngestMode"]:checked')?.value || 'append';
            await performDatasetUpload(selectedStudioFile, mode, 'studio');
        });
    }
}

function openDatasetUploadModal() {
    const modal = document.getElementById('datasetUploadModal');
    if (modal) modal.classList.add('active');
}

function handleFileSelection(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('⚠️ Please select a valid .csv dataset file.');
        return;
    }
    selectedUploadFile = file;
    document.getElementById('uploadFileName').textContent = file.name;
    document.getElementById('uploadFileSize').textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
    document.getElementById('uploadFileInfoPanel').style.display = 'block';

    const btnSubmit = document.getElementById('btnSubmitDatasetUpload');
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1.0';
        btnSubmit.style.cursor = 'pointer';
    }
}

async function performDatasetUpload(file, mode, source) {
    showToast(`⏳ Ingesting and evaluating ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
        const res = await fetch('/api/dataset/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Upload failed');
        }

        const data = await res.json();
        showToast(`✅ Ingestion Success: ${data.rows_uploaded} records added to repository.`);
        
        voiceEngine.speak(`Dataset successfully ingested. Added ${data.rows_uploaded} inspection records.`);

        if (source === 'modal') {
            document.getElementById('resRowsAdded').textContent = data.rows_uploaded;
            document.getElementById('resTotalScale').textContent = data.total_records;
            document.getElementById('resAvgHi').textContent = `${data.summary.average_health_index}%`;
            document.getElementById('resCritCount').textContent = data.summary.critical_units;
            document.getElementById('uploadResultsCard').style.display = 'block';
        } else {
            document.getElementById('studioResRows').textContent = data.rows_uploaded;
            document.getElementById('studioResTotal').textContent = data.total_records;
            document.getElementById('studioResAvgHi').textContent = `${data.summary.average_health_index}%`;
            document.getElementById('studioResCrit').textContent = data.summary.critical_units;
            document.getElementById('studioResultsCard').style.display = 'block';
        }

        await fetchDatasetPage(1);
        await fetchModelMetrics();
        await fetchFleetData();
    } catch (err) {
        showToast(`❌ Ingestion Error: ${err.message}`);
    }
}

// ==========================================================================
// PLAIN-ENGLISH DUVAL EXPLAINER & DIAGNOSTIC PRESETS
// ==========================================================================
const duvalPresetData = {
    tr1025: {
        ch4: 53.31, c2h4: 46.69, c2h2: 0.0,
        zone: 'T2',
        headline: 'Copper Windings & Core Localized Overheating (TR-1025)',
        icon: '🍳',
        badgeColor: '#fbbf24',
        badgeBg: 'rgba(251, 191, 36, 0.2)',
        summary: 'The copper windings inside Transformer TR-1025 are running like an overloaded electric stove (300°C–700°C). <strong>Good News:</strong> There is 0% Acetylene, meaning NO dangerous lightning arcs or immediate explosion hazard. <strong>Risk:</strong> Paper insulation is cooking 8.4x faster than normal.',
        explosionRisk: '🟢 Minimal (0% C₂H₂)',
        explosionColor: '#10b981',
        agingRate: '⚠️ 8.4x Accelerated Rate',
        agingColor: '#fbbf24',
        action: 'Offload 25 MVA to Substation SS-04 (1.2 km away) and verify radiator cooling fans.'
    },
    tx104_arcing: {
        ch4: 22.0, c2h4: 28.0, c2h2: 50.0,
        zone: 'D2',
        headline: 'High-Energy Electrical Arcing Flashover (TX-104 Emergency)',
        icon: '⚡',
        badgeColor: '#ec4899',
        badgeBg: 'rgba(236, 72, 153, 0.2)',
        summary: 'Violent high-voltage electrical sparks are jumping through the insulating oil like underwater lightning (>1000°C). <strong>Danger:</strong> Massive Acetylene (50%) generation creates gas pressure shockwaves. High risk of tank rupture or fire.',
        explosionRisk: '🚨 HIGH / CRITICAL (50% C₂H₂)',
        explosionColor: '#f43f5e',
        agingRate: '💥 Immediate Dielectric Rupture',
        agingColor: '#f43f5e',
        action: 'EMERGENCY TRIP: Open 220kV circuit breakers immediately and dispatch fire response crew.'
    },
    corona_pd: {
        ch4: 98.5, c2h4: 1.0, c2h2: 0.5,
        zone: 'PD',
        headline: 'Partial Discharge (Microscopic Corona Sparking)',
        icon: '✨',
        badgeColor: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.2)',
        summary: 'Microscopic electric buzzing / static ionization is occurring inside gas bubbles or voids in the solid paper insulation. Temperatures remain cold (<150°C), but voids will slowly erode paper over months.',
        explosionRisk: '🟢 None (Cold Ionization)',
        explosionColor: '#10b981',
        agingRate: 'ℹ️ Slow Chronic Erosion',
        agingColor: '#38bdf8',
        action: 'Schedule acoustic ultrasonic scan and oil degassing during next planned maintenance outage.'
    },
    severe_t3: {
        ch4: 15.0, c2h4: 75.0, c2h2: 10.0,
        zone: 'T3',
        headline: 'Severe Pyrolysis & Metal Fusion Overheat (>700°C)',
        icon: '🔥',
        badgeColor: '#f87171',
        badgeBg: 'rgba(248, 113, 113, 0.2)',
        summary: 'Extreme thermal breakdown (>700°C) with carbonization of paper insulation and potential metal fusion between core laminations. Oil is actively baking into conductive carbon sludge.',
        explosionRisk: '⚠️ Moderate (10% C₂H₂ from Pyrolysis)',
        explosionColor: '#f59e0b',
        agingRate: '💀 Irreversible Cellulose Charring',
        agingColor: '#f87171',
        action: 'Immediately de-energize transformer to prevent catastrophic tank explosion and oil fire.'
    },
    healthy_t1: {
        ch4: 70.0, c2h4: 28.0, c2h2: 2.0,
        zone: 'T1',
        headline: 'Normal Low-Temperature Thermal Equilibrium (<300°C)',
        icon: '🟢',
        badgeColor: '#34d399',
        badgeBg: 'rgba(52, 211, 153, 0.2)',
        summary: 'Benign baseline thermal operation. Minor low-temperature stray gassing from normal load cycling below 85°C hotspot. Insulation paper is healthy and stable.',
        explosionRisk: '🟢 Zero Risk',
        explosionColor: '#10b981',
        agingRate: '🟢 Standard Baseline (1.0x)',
        agingColor: '#10b981',
        action: 'No operational intervention required. Maintain standard SCADA telemetry monitoring.'
    }
};

function updatePlainEnglishExplainer(presetKey) {
    const data = duvalPresetData[presetKey] || duvalPresetData.tr1025;
    
    // Update gas badges
    const bCh4 = document.getElementById('badgeGasCh4');
    const bC2h4 = document.getElementById('badgeGasC2h4');
    const bC2h2 = document.getElementById('badgeGasC2h2');
    if (bCh4) bCh4.textContent = `${data.ch4}%`;
    if (bC2h4) bC2h4.textContent = `${data.c2h4}%`;
    if (bC2h2) bC2h2.textContent = `${data.c2h2}%`;

    // Update Plain English Box
    const zBadge = document.getElementById('plainEngZoneBadge');
    if (zBadge) {
        zBadge.textContent = `Zone ${data.zone} Active`;
        zBadge.style.color = data.badgeColor;
        zBadge.style.background = data.badgeBg;
        zBadge.style.borderColor = data.badgeColor;
    }

    const iconEl = document.getElementById('plainEngIcon');
    const headEl = document.getElementById('plainEngHeadline');
    const sumEl = document.getElementById('plainEngSummary');
    const expEl = document.getElementById('plainEngExplosionRisk');
    const degEl = document.getElementById('plainEngDegradation');
    const actEl = document.getElementById('plainEngAction');

    if (iconEl) iconEl.textContent = data.icon;
    if (headEl) headEl.textContent = data.headline;
    if (sumEl) sumEl.innerHTML = data.summary;
    if (expEl) {
        expEl.textContent = data.explosionRisk;
        expEl.style.color = data.explosionColor;
    }
    if (degEl) {
        degEl.textContent = data.agingRate;
        degEl.style.color = data.agingColor;
    }
    if (actEl) actEl.textContent = data.action;

    // Draw on Duval Canvas & Update Segmented Bar
    state.duvalProbeCoords = { ch4: data.ch4, c2h4: data.c2h4, c2h2: data.c2h2 };
    drawDuvalTriangle(state.duvalProbeCoords);
    updateDuvalZoneInfo({ zone: data.zone, name: data.headline, description: data.summary });
    updateGasRatioBar(data.ch4, data.c2h4, data.c2h2);

    const unitBadge = document.getElementById('duvalActiveUnitBadge');
    if (unitBadge) unitBadge.innerHTML = `<span class="live-dot-pulse" style="background:${data.badgeColor};"></span> Preset: <strong>${data.zone}</strong>`;
}

function initDuvalExplainer() {
    const presetBtns = document.querySelectorAll('.btn-preset-duval');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const key = btn.getAttribute('data-preset');
            updatePlainEnglishExplainer(key);
            playAlarmChime(false);
        });
    });

    const btnAction = document.getElementById('btnApplyDuvalAction');
    if (btnAction) {
        btnAction.addEventListener('click', () => {
            const activePreset = document.querySelector('.btn-preset-duval.active');
            const key = activePreset ? activePreset.getAttribute('data-preset') : 'tr1025';
            const data = duvalPresetData[key];
            showToast(`⚡ Prescriptive Action Dispatched: ${data.action.substring(0, 48)}...`);
            voiceEngine.speak(`Prescriptive action initiated. ${data.action}`);
        });
    }

    // Default to TR-1025 preset
    updatePlainEnglishExplainer('tr1025');
}

// ==========================================================================
// INTERACTIVE TRANSFORMER ANATOMY (COMPONENT HEALTH CUTAWAY)
// ==========================================================================
const transformerAnatomyData = {
    windings: {
        title: 'Copper Windings & Iron Core',
        sub: 'Electromagnetic Induction & Primary Heat Source',
        icon: '🔥',
        status: 'CRITICAL OVERHEAT',
        statusColor: '#f43f5e',
        statusBg: 'rgba(244, 63, 94, 0.2)',
        reading: '98.0 °C / 112% Load',
        gas: 'Ethylene (C₂H₄) + Methane',
        desc: 'The copper coils carry phase currents through the magnetic silicon-steel core. Under 112% continuous overload in TR-1025, the winding hotspot reaches <strong>98.0°C</strong>. This localized heat cracks insulating paper cellulose and generates Ethylene (C₂H₄) gas.',
        failureMode: '<strong>Physical Failure Mode:</strong> Thermal breakdown of Kraft paper insulation; loss of degree of polymerization ($DP < 200$) can cause inter-turn short circuits.'
    },
    bushings: {
        title: 'High-Voltage Bushings (132 kV / 220 kV)',
        sub: 'Porcelain / Polymer Terminal Insulator Bushings',
        icon: '⚡',
        status: 'NORMAL DIELECTRIC',
        statusColor: '#10b981',
        statusBg: 'rgba(16, 185, 129, 0.2)',
        reading: '65.0 kV BDV / Tan δ: 0.003',
        gas: 'Trace Hydrogen (H₂ < 10 ppm)',
        desc: 'Bushings insulate high-voltage lead conductors as they pass through the grounded steel tank. Dielectric oil-impregnated paper (OIP) maintains electrostatic capacitance graded foils.',
        failureMode: '<strong>Physical Failure Mode:</strong> Moisture ingress or surface pollution tracking leading to violent explosive ceramic shatter.'
    },
    oil: {
        title: 'Insulating Mineral Oil & Main Tank',
        sub: 'Dielectric Insulation & Convective Cooling Fluid',
        icon: '🛢️',
        status: 'WARNING / HIGH TEMP',
        statusColor: '#fbbf24',
        statusBg: 'rgba(251, 191, 36, 0.2)',
        reading: '89.2 °C / Moisture: 18 ppm',
        gas: 'TDCG: 1,420 ppm',
        desc: 'Uninhibited naphthenic mineral oil transfers core/coil heat to radiators and provides 60+ kV/2.5mm dielectric barrier. Top oil temperature of <strong>89.2°C</strong> accelerates acid sludge formation.',
        failureMode: '<strong>Physical Failure Mode:</strong> Oxidation and sludge deposition coating radiator tubes, choking cooling flow and dropping BDV dielectric breakdown voltage.'
    },
    buchholz: {
        title: 'Buchholz Relay & Conservator Tank',
        sub: 'Gas Accumulation & Oil Surge Protection Relay',
        icon: '🚨',
        status: 'WATCH / GAS ACCUMULATING',
        statusColor: '#f59e0b',
        statusBg: 'rgba(245, 158, 11, 0.2)',
        reading: '12 ml/hr Gas Evolution',
        gas: 'Combustible Gases Rising',
        desc: 'Mounted on the pipe between the main tank and conservator. Traps internal gas bubbles evolved from oil decomposition and triggers stage 1 alarm or stage 2 emergency surge trip.',
        failureMode: '<strong>Physical Failure Mode:</strong> Sudden pressure pulse from high-energy arcing trips the float mechanism to de-energize the transformer in <50ms.'
    },
    radiator: {
        title: 'Radiator Cooling Banks & Forced Fans',
        sub: 'ONAN / ONAF Heat Exchanger Circulation',
        icon: '🌬️',
        status: 'FANS STAGE 2 ACTIVE',
        statusColor: '#38bdf8',
        statusBg: 'rgba(56, 189, 248, 0.2)',
        reading: '420 kW Heat Dissipated / Ambient 32°C',
        gas: 'N/A (External Mechanical)',
        desc: 'Radiator cooling banks dissipate internal losses through convective air cooling. Stage 2 high-velocity fans are currently running at 100% duty cycle to clamp hotspot temperature rise.',
        failureMode: '<strong>Physical Failure Mode:</strong> Fan motor failure or clogged radiator fins causes rapid runaway overheating above 120°C.'
    },
    oltc: {
        title: 'On-Load Tap Changer (OLTC)',
        sub: 'Dynamic Voltage Regulation Selector Mechanism',
        icon: '⚙️',
        status: 'STEP 7 (132 kV ± 2.5%)',
        statusColor: '#a78bfa',
        statusBg: 'rgba(167, 139, 250, 0.2)',
        reading: 'Contact Resistance: 1.2 mΩ',
        gas: 'Acetylene (C₂H₂ in separate tank)',
        desc: 'Adjusts transformer turn ratios under full load current to maintain grid voltage stability. Operates inside a separate oil compartment to prevent switching arc gases from contaminating the main tank.',
        failureMode: '<strong>Physical Failure Mode:</strong> Mechanical contact erosion, transition resistor burnout, or driving motor jamming between tap steps.'
    }
};

function initTransformerAnatomy() {
    const pins = document.querySelectorAll('.pin-hotspot');
    pins.forEach(pin => {
        pin.addEventListener('click', () => {
            pins.forEach(p => p.classList.remove('active'));
            pin.classList.add('active');
            const compKey = pin.getAttribute('data-component');
            const d = transformerAnatomyData[compKey];
            if (!d) return;

            document.getElementById('anatomyIcon').textContent = d.icon;
            document.getElementById('anatomyTitle').textContent = d.title;
            document.getElementById('anatomySub').textContent = d.sub;

            const badge = document.getElementById('anatomyStatusBadge');
            if (badge) {
                badge.textContent = d.status;
                badge.style.color = d.statusColor;
                badge.style.background = d.statusBg;
                badge.style.borderColor = d.statusColor;
            }

            document.getElementById('anatomyDesc').innerHTML = d.desc;
            document.getElementById('anatomyReading').textContent = d.reading;
            document.getElementById('anatomyGas').textContent = d.gas;
            document.getElementById('anatomyFailureMode').innerHTML = d.failureMode;
            playAlarmChime(false);
        });
    });
}

// ==========================================================================
// PINN ARCHITECTURE PIPELINE & UNIQUE MODEL MODAL
// ==========================================================================
function initPinnPipeline() {
    const nodes = document.querySelectorAll('.pipeline-node');
    nodes.forEach(node => {
        node.addEventListener('click', () => {
            nodes.forEach(n => n.classList.remove('active'));
            node.classList.add('active');
            const stage = node.getAttribute('data-stage');
            showToast(`🔬 PINN-DT Fusion: Stage ${stage} Active — Verified against IEEE & IEC Standards`);
            playAlarmChime(false);
        });
    });
}

function initUniqueModelModal() {
    const modal = document.getElementById('uniqueModelModal');
    if (!modal) return;

    const openBtns = [
        document.getElementById('btnHeaderModelGuide'),
        document.getElementById('btnOpenModelArchModal')
    ];

    openBtns.forEach(b => {
        if (b) b.addEventListener('click', () => {
            modal.classList.add('active');
            playAlarmChime(false);
        });
    });

    const closeBtns = [
        document.getElementById('btnCloseUniqueModelModal'),
        document.getElementById('btnDismissUniqueModelModal')
    ];

    closeBtns.forEach(b => {
        if (b) b.addEventListener('click', () => modal.classList.remove('active'));
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Subtab switching
    const tabBtns = document.querySelectorAll('.model-modal-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tabKey = btn.getAttribute('data-modaltab');

            document.getElementById('paneModalGuide').style.display = tabKey === 'guide' ? 'block' : 'none';
            document.getElementById('paneModalArch').style.display = tabKey === 'architecture' ? 'block' : 'none';
            document.getElementById('paneModalBench').style.display = tabKey === 'benchmarks' ? 'block' : 'none';
        });
    });
}

// ==========================================================================
// HORIZONTAL SLIDER CONTROLS (HEADER & NAVIGATION RIBBON)
// "Slide Option to See All" with Interactive Arrows, Drag & Wheel Scrolling
// ==========================================================================
function initSliderControls() {
    setupHorizontalSlider({
        viewportId: 'headerSlideViewport',
        btnLeftId: 'btnSlideHeaderLeft',
        btnRightId: 'btnSlideHeaderRight',
        stepSize: 260
    });

    setupHorizontalSlider({
        viewportId: 'navRibbonScroll',
        btnLeftId: 'btnSlideNavLeft',
        btnRightId: 'btnSlideNavRight',
        stepSize: 220
    });
}

function setupHorizontalSlider({ viewportId, btnLeftId, btnRightId, stepSize = 240 }) {
    const viewport = document.getElementById(viewportId);
    const btnLeft = document.getElementById(btnLeftId);
    const btnRight = document.getElementById(btnRightId);

    if (!viewport) return;

    function updateArrows() {
        const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const hasOverflow = maxScroll > 4;

        if (btnLeft) {
            const atStart = viewport.scrollLeft <= 4;
            btnLeft.disabled = !hasOverflow || atStart;
            btnLeft.classList.toggle('is-disabled', !hasOverflow || atStart);
        }

        if (btnRight) {
            const atEnd = viewport.scrollLeft >= maxScroll - 4;
            btnRight.disabled = !hasOverflow || atEnd;
            btnRight.classList.toggle('is-disabled', !hasOverflow || atEnd);
        }
    }

    if (btnLeft) {
        btnLeft.addEventListener('click', (e) => {
            e.preventDefault();
            viewport.scrollBy({ left: -stepSize, behavior: 'smooth' });
            setTimeout(updateArrows, 280);
        });
    }

    if (btnRight) {
        btnRight.addEventListener('click', (e) => {
            e.preventDefault();
            viewport.scrollBy({ left: stepSize, behavior: 'smooth' });
            setTimeout(updateArrows, 280);
        });
    }

    viewport.addEventListener('scroll', () => {
        updateArrows();
    }, { passive: true });

    // Wheel horizontal scrolling: convert vertical mouse wheel over container to horizontal scroll
    viewport.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && (viewport.scrollWidth > viewport.clientWidth)) {
            e.preventDefault();
            viewport.scrollLeft += e.deltaY;
            updateArrows();
        }
    }, { passive: false });

    // Click and drag to slide/scroll
    let isDragging = false;
    let startX = 0;
    let scrollLeftStart = 0;

    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, select, a')) return;
        isDragging = true;
        startX = e.pageX - viewport.offsetLeft;
        scrollLeftStart = viewport.scrollLeft;
        viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            viewport.style.cursor = 'grab';
        }
    });

    viewport.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const walk = (x - startX) * 1.5;
        viewport.scrollLeft = scrollLeftStart - walk;
        updateArrows();
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchScrollLeft = 0;
    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = viewport.scrollLeft;
        }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const touchX = e.touches[0].pageX;
            const diff = touchStartX - touchX;
            viewport.scrollLeft = touchScrollLeft + diff;
            updateArrows();
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        updateArrows();
    });

    // Initial arrow state check
    setTimeout(updateArrows, 100);
    setTimeout(updateArrows, 600);
}



