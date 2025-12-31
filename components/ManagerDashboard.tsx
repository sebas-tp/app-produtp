import React, { useEffect, useState } from 'react';
import { 
  getLogs, clearLogs, downloadCSV, downloadPDF, 
  getProductivityTarget, saveProductivityTarget, getOperators,
  getPointsMatrix, fixDatabaseData // <--- Importamos la nueva función
} from '../services/dataService';
import { analyzeProductionData } from '../services/geminiService';
import { ProductionLog, Sector, PointRule } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Trash2, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, 
  Pencil, Save, Users, TrendingUp, Box, Lock, BrainCircuit, X, ShieldCheck, Trophy, Hash, Activity, Filter,
  Timer, Layers, LayoutList, Scale, AlertOctagon, Briefcase, Calculator, ChevronDown, ChevronRight, CheckCircle2, Info, Search, Zap, AlertTriangle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export const ManagerDashboard: React.FC = () => {
  // --- ESTADOS DE DATOS ---
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- NAVEGACIÓN ---
  const [activeTab, setActiveTab] = useState<'metrics' | 'efficiency' | 'audit' | 'accounting' | 'simulator'>('metrics');

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [rankingFilter, setRankingFilter] = useState<string>('Global');

  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<string>("24960");

  // --- CONFIG EFICIENCIA ---
  const [globalDays, setGlobalDays] = useState<number>(20); 
  const [shiftHours, setShiftHours] = useState<number>(8.5);
  const [pointsPerHour, setPointsPerHour] = useState<number>(3600);
  const [customDays, setCustomDays] = useState<Record<string, number>>({});
  const [efficiencyView, setEfficiencyView] = useState<'operator' | 'sector'>('operator');
  
  // --- INPUTS TANGO & AUDITORÍA ---
  const [tangoInputs, setTangoInputs] = useState<Record<string, string>>({});
  const [auditSearch, setAuditSearch] = useState('');

  // --- INPUTS SIMULADOR ---
  const [simModel, setSimModel] = useState<string>('');
  const [simQty, setSimQty] = useState<number>(100);
  const [simResources, setSimResources] = useState<Record<string, number>>({
      'CORTE': 2, 'COSTURA': 5, 'ARMADO': 4, 'EMBALAJE': 2
  });

  // --- ESTADO PARA ACORDEÓN CONTABLE ---
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // --- SEGURIDAD ---
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showEngineeringModal, setShowEngineeringModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const MASTER_PASSWORD = "admin";

  // --- INICIALIZACIÓN ---
  
  useEffect(() => {
    const initCatalogs = async () => {
      try {
        const [target, ops, mtx] = await Promise.all([
          getProductivityTarget(), 
          getOperators(), 
          getPointsMatrix() // Usa caché por defecto
        ]);
        setDailyTarget(target || 24960);
        setTempTarget((target || 24960).toString());
        setOperatorList(ops);
        setMatrix(mtx);
      } catch (e) { console.error(e); }
    };
    initCatalogs();
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const logs = await getLogs(startDate, endDate);
        setAllLogs(logs);
        if (selectedOperator === 'all') {
            setFilteredLogs(logs);
        } else {
            setFilteredLogs(logs.filter(l => l.operatorName === selectedOperator));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchLogs();
  }, [startDate, endDate]); 

  useEffect(() => {
      if (selectedOperator === 'all') {
          setFilteredLogs(allLogs);
      } else {
          setFilteredLogs(allLogs.filter(l => l.operatorName === selectedOperator));
      }
  }, [selectedOperator, allLogs]);

  const refreshData = async () => {
    setLoading(true);
    // FORZAMOS LA DESCARGA CON 'true'
    const [logs, mtx] = await Promise.all([
        getLogs(startDate, endDate), 
        getPointsMatrix(true) 
    ]);
    setAllLogs(logs);
    setMatrix(mtx);
    if (selectedOperator === 'all') setFilteredLogs(logs);
    else setFilteredLogs(logs.filter(l => l.operatorName === selectedOperator));
    setLoading(false);
  };

  // --- CÁLCULOS (Mismos de siempre) ---
  const normalizeCostCenter = (sectorName: string) => {
    const s = sectorName.toUpperCase();
    if (s.includes('CORTE')) return 'CORTE';
    if (s.includes('COSTURA')) return 'COSTURA';
    if (s.includes('ARMADO') || s.includes('APARADO')) return 'ARMADO';
    if (s.includes('EMBALAJE') || s.includes('LIMPIEZA') || s.includes('EMPAQUE')) return 'EMBALAJE';
    return 'OTROS';
  };

  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; 
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const rankingStatsForMetrics = Object.values(filteredLogs.filter(log => rankingFilter === 'Global' || log.sector === rankingFilter).reduce((acc, log) => {
    if (!acc[log.operatorName]) acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
    acc[log.operatorName].points += log.totalPoints; acc[log.operatorName].quantity += log.quantity; return acc;
  }, {} as Record<string, { name: string; points: number; quantity: number }>)).map(stat => ({ ...stat, percentage: (stat.points / dailyTarget) * 100 })).sort((a, b) => b.points - a.points);

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 }; acc[log.sector].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>));

  const modelStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { name: log.model, value: 0 }; acc[log.model].value += log.quantity; return acc;
  }, {} as Record<string, { name: string; value: number }>)).sort((a, b) => b.value - a.value).slice(0, 5);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

  const getEfficiencyData = () => {
    const opStats = Object.values(filteredLogs.reduce((acc, log) => {
        if (!acc[log.operatorName]) {
            acc[log.operatorName] = { name: log.operatorName, sector: log.sector || 'General', points: 0 };
        }
        acc[log.operatorName].points += log.totalPoints;
        return acc;
    }, {} as Record<string, { name: string; sector: string; points: number }>));

    const detailedStats = opStats.map(stat => {
        const daysWorked = customDays[stat.name] !== undefined ? customDays[stat.name] : globalDays;
        const potentialPoints = daysWorked * shiftHours * pointsPerHour;
        const difference = stat.points - potentialPoints;
        const performancePct = potentialPoints > 0 ? (stat.points / potentialPoints) * 100 : 0;
        return { ...stat, daysWorked, potentialPoints, difference, performancePct, isSurplus: difference >= 0 };
    });

    if (efficiencyView === 'sector') {
        const sectorStats = detailedStats.reduce((acc, stat) => {
            if (!acc[stat.sector]) acc[stat.sector] = { name: stat.sector, count: 0, points: 0, potentialPoints: 0 };
            acc[stat.sector].count += 1;
            acc[stat.sector].points += stat.points;
            acc[stat.sector].potentialPoints += stat.potentialPoints;
            return acc;
        }, {} as Record<string, any>);

        return Object.values(sectorStats).map((sec: any) => {
            const difference = sec.points - sec.potentialPoints;
            return {
                name: sec.name, operatorsCount: sec.count, points: sec.points, potentialPoints: sec.potentialPoints,
                difference, isSurplus: difference >= 0, performancePct: sec.potentialPoints > 0 ? (sec.points / sec.potentialPoints) * 100 : 0
            };
        }).sort((a, b) => b.performancePct - a.performancePct);
    }
    return detailedStats.sort((a, b) => b.performancePct - a.performancePct);
  };

  const getAuditData = () => {
    const modelsInLogs = Array.from(new Set(filteredLogs.map(l => l.model)));
    return modelsInLogs.map(modelName => {
      const declaredPoints = filteredLogs.filter(l => l.model === modelName).reduce((sum, l) => sum + l.totalPoints, 0);
      const standardValue = matrix.filter(r => r.model === modelName).reduce((sum, r) => sum + r.pointsPerUnit, 0);
      const tangoQty = parseInt(tangoInputs[modelName] || '0');
      const theoreticalPoints = tangoQty * standardValue;
      const difference = declaredPoints - theoreticalPoints;
      const deviationPct = theoreticalPoints > 0 ? ((difference / theoreticalPoints) * 100) : 0;
      return { model: modelName, standardValue, declaredPoints, tangoQty, theoreticalPoints, difference, deviationPct };
    }).sort((a, b) => b.declaredPoints - a.declaredPoints);
  };

  const getAccountingData = () => {
    const opSectorMap: Record<string, string> = {};
    const opPoints: Record<string, number> = {};
    const opPointsPerRawSector: Record<string, Record<string, number>> = {};

    filteredLogs.forEach(log => {
        if (!opPointsPerRawSector[log.operatorName]) opPointsPerRawSector[log.operatorName] = {};
        if (!opPointsPerRawSector[log.operatorName][log.sector]) opPointsPerRawSector[log.operatorName][log.sector] = 0;
        opPointsPerRawSector[log.operatorName][log.sector] += log.totalPoints;
        if (!opPoints[log.operatorName]) opPoints[log.operatorName] = 0;
        opPoints[log.operatorName] += log.totalPoints;
    });

    Object.keys(opPointsPerRawSector).forEach(op => {
        const sectors = opPointsPerRawSector[op];
        const bestRawSector = Object.keys(sectors).reduce((a, b) => sectors[a] > sectors[b] ? a : b);
        opSectorMap[op] = normalizeCostCenter(bestRawSector);
    });

    const sectorRealProd: Record<string, number> = { 'CORTE':0, 'COSTURA':0, 'ARMADO':0, 'EMBALAJE':0, 'OTROS':0 };
    Object.keys(tangoInputs).forEach(model => {
        const qty = parseInt(tangoInputs[model] || '0');
        if (qty > 0) {
            const rules = matrix.filter(r => r.model === model);
            rules.forEach(rule => {
                const cc = normalizeCostCenter(rule.sector);
                sectorRealProd[cc] += (rule.pointsPerUnit * qty);
            });
        }
    });

    const costCenters = ['CORTE', 'COSTURA', 'ARMADO', 'EMBALAJE'];
    
    return costCenters.map(cc => {
        const operatorsInCC = Object.keys(opSectorMap).filter(op => opSectorMap[op] === cc);
        let totalCapacity = 0;
        let totalDeclared = 0;
        const operatorDetails = operatorsInCC.map(op => {
            const days = customDays[op] !== undefined ? customDays[op] : globalDays;
            const capacity = days * shiftHours * pointsPerHour;
            const declared = opPoints[op] || 0;
            totalCapacity += capacity;
            totalDeclared += declared;
            return { name: op, capacity, declared, efficiency: capacity > 0 ? (declared/capacity)*100 : 0 };
        });
        const realProduction = sectorRealProd[cc] || 0;
        const productivity = totalCapacity > 0 ? (realProduction / totalCapacity) * 100 : 0;
        return {
            center: cc, headcount: operatorsInCC.length, capacity: totalCapacity, declared: totalDeclared,
            real: realProduction, productivity, operators: operatorDetails
        };
    });
  };

  const getSimulationData = () => {
    if (!simModel || simQty <= 0) return [];
    const rules = matrix.filter(r => r.model === simModel);
    const loadPerSector: Record<string, number> = { 'CORTE':0, 'COSTURA':0, 'ARMADO':0, 'EMBALAJE':0 };
    rules.forEach(r => {
        const cc = normalizeCostCenter(r.sector);
        if (loadPerSector[cc] !== undefined) loadPerSector[cc] += (r.pointsPerUnit * simQty);
    });
    const singlePersonCapacity = dailyTarget;
    
    return Object.entries(loadPerSector).map(([sector, points]) => {
        const peopleNeeded = points / singlePersonCapacity;
        const peopleRounded = Math.ceil(peopleNeeded);
        const availableResources = simResources[sector] || 0;
        const isBottleneck = peopleRounded > availableResources;
        return { 
            sector, 
            pointsRequired: points, 
            peopleNeeded, 
            peopleRounded, 
            availableResources, 
            isBottleneck 
        };
    });
  };

  const auditData = getAuditData();
  const efficiencyData = getEfficiencyData();
  const accountingData = getAccountingData();
  const simulationData = getSimulationData(); 

  const uniqueModels = Array.from(new Set(matrix.map(m => m.model))).sort();
  const visibleAuditData = auditData.filter(item => item.model.toLowerCase().includes(auditSearch.toLowerCase()));

  const totalTangoPoints = auditData.reduce((sum, item) => sum + item.theoreticalPoints, 0);
  const totalDeclaredPoints = filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0);
  const isGlobalView = selectedOperator === 'all';
  const globalDifference = isGlobalView ? (totalDeclaredPoints - totalTangoPoints) : 0;

  const totalPlantCapacity = accountingData.reduce((sum, item) => sum + item.capacity, 0);
  const totalPlantReal = accountingData.reduce((sum, item) => sum + item.real, 0);
  const plantProductivity = totalPlantCapacity > 0 ? (totalPlantReal / totalPlantCapacity) * 100 : 0;

  // --- HANDLERS ---
  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) { await saveProductivityTarget(newVal); setDailyTarget(newVal); setIsEditingTarget(false); refreshData(); }
  };
  const handleClearData = async () => { if (window.confirm("¡PELIGRO! ¿Borrar historial?")) { setLoading(true); await clearLogs(); await refreshData(); }};
  const handleEngineeringAccess = () => { if (isAuthorized) openEngineeringModal(); else setShowAuthModal(true); };
  const verifyPassword = (e: React.FormEvent) => { e.preventDefault(); if (passwordInput === MASTER_PASSWORD) { setIsAuthorized(true); setShowAuthModal(false); setPasswordInput(''); openEngineeringModal(); } else { alert("Acceso denegado."); }};
  const openEngineeringModal = async () => { setShowEngineeringModal(true); if (!analysisResult) runAnalysis(); };
  const runAnalysis = async () => { setIsAnalyzing(true); try { const result = await analyzeProductionData(filteredLogs, allLogs, operatorList, selectedOperator, dailyTarget); setAnalysisResult(result); } catch (e) { setAnalysisResult("Error al generar análisis."); } finally { setIsAnalyzing(false); }};

  // --- EXPORTADORES ---
  const generateGenericCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSmartExcel = () => {
    if (activeTab === 'metrics') {
        downloadCSV(filteredLogs, `Reporte_Metricas_${startDate}`);
    } else if (activeTab === 'efficiency') {
        const data = getEfficiencyData(); 
        const rows = data.map((d: any) => [d.name, d.daysWorked || '-', d.points.toFixed(2), d.potentialPoints.toFixed(2), d.difference.toFixed(2), d.isSurplus ? "Superavit" : "Deficit"]);
        generateGenericCSV(["Nombre", "Dias Trab", "Pts Real", "Pts Potencial", "Diferencia", "Estado"], rows, `Reporte_Eficiencia_${startDate}`);
    } else if (activeTab === 'audit') {
        const rows = auditData.map(d => [d.model, d.tangoQty, d.difference]);
        generateGenericCSV(["Modelo", "Tango", "Desvio"], rows, `Reporte_Auditoria_${startDate}`);
    } else if (activeTab === 'accounting') {
        const rows = accountingData.map(d => [d.center, d.headcount, d.capacity, d.real, d.productivity.toFixed(2) + '%']);
        generateGenericCSV(["Centro Costo", "Operarios", "Capacidad", "Real (Tango)", "Productividad"], rows, `Reporte_Contable_${startDate}`);
    } else if (activeTab === 'simulator') {
        const rows = simulationData.map(d => [d.sector, d.pointsRequired, d.peopleRounded, d.availableResources, d.isBottleneck ? 'FALTA MAQUINA' : 'OK']);
        generateGenericCSV(["Sector", "Carga Puntos", "Personas Necesarias", "Recursos Disponibles", "Estado"], rows, `Simulacion_${simModel}_${simQty}`);
    }
  };

  const handleSmartPDF = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(30, 41, 59); doc.text(`Informe Técnico`, 14, 20);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`TopSafe S.A. | ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Período: ${startDate} al ${endDate}`, 14, 34);

    if (activeTab === 'audit') {
        doc.text("AUDITORÍA STOCK", 14, 45);
        autoTable(doc, { 
            startY: 50, 
            head: [['Modelo', 'Valor Std', 'Tango', 'Teórico', 'Declarado', 'Desvío', 'Estado']], 
            body: auditData.map(d => [d.model, d.standardValue.toFixed(1), d.tangoQty, d.theoreticalPoints.toFixed(0), d.declaredPoints.toFixed(0), d.difference.toFixed(0), Math.abs(d.deviationPct)<5?"OK":(d.difference > 0 ? "Exceso" : "Faltante")]) 
        });
    } else if (activeTab === 'efficiency') {
        doc.text("EFICIENCIA Y OCIO", 14, 45);
        const data = getEfficiencyData();
        if (efficiencyView === 'sector') {
            autoTable(doc, { startY: 50, head: [['Sector', 'Real', 'Potencial', 'Diferencia', 'Rendimiento', 'Estado']], body: data.map((s:any) => [s.name, s.points.toFixed(0), s.potentialPoints.toFixed(0), s.difference.toFixed(0), s.performancePct.toFixed(1) + '%', s.isSurplus ? 'Positivo' : 'Negativo']) });
        } else {
            autoTable(doc, { startY: 50, head: [['Operario', 'Días', 'Real', 'Potencial', 'Diferencia', 'Rendimiento']], body: data.map((s:any) => [s.name, s.daysWorked, s.points.toFixed(0), s.potentialPoints.toFixed(0), s.difference.toFixed(0), s.performancePct.toFixed(1) + '%']) });
        }
    } else if (activeTab === 'accounting') {
        doc.text("REPORTE DE PRODUCTIVIDAD (CONTABLE)", 14, 45);
        autoTable(doc, {
            startY: 55,
            head: [['Centro de Costo', 'Cant. Op', 'Capacidad (Pts)', 'Prod. Real (Pts)', 'Productividad']],
            body: accountingData.map(r => [r.center, r.headcount, r.capacity.toLocaleString('es-AR'), r.real.toLocaleString('es-AR'), r.productivity.toFixed(1) + '%']),
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] } 
        });
    } else if (activeTab === 'simulator') {
        doc.text(`SIMULACIÓN DE DOTACIÓN: Modelo ${simModel} (${simQty} u.)`, 14, 45);
        doc.text(`Capacidad Base: ${dailyTarget.toLocaleString()} pts/persona`, 14, 52);
        autoTable(doc, {
            startY: 60,
            head: [['Centro de Costo', 'Carga (Pts)', 'Personas Necesarias', 'Recursos Disp.', 'Estado']],
            body: simulationData.map(r => [
                r.sector, 
                r.pointsRequired.toLocaleString(), 
                `${r.peopleRounded} (${r.peopleNeeded.toFixed(2)})`,
                r.availableResources,
                r.isBottleneck ? 'FALTA MAQ.' : 'OK'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [249, 115, 22] },
            bodyStyles: { textColor: [0, 0, 0] },
            columnStyles: { 4: { fontStyle: 'bold' } }
        });
    } else {
        doc.text("Resumen de Métricas Generales", 14, 45);
        autoTable(doc, { 
            startY: 50, 
            head: [['Fecha', 'Operario', 'Modelo', 'Cant', 'Pts', 'Obs']], 
            body: filteredLogs.slice(0, 100).map(l => [new Date(l.timestamp).toLocaleDateString(), l.operatorName, l.model, l.quantity, l.totalPoints.toFixed(1), l.comments||'-']),
            columnStyles: { 5: { cellWidth: 50 } }
        });
    }
    doc.save(`Reporte_${activeTab}_${startDate}.pdf`); setIsGeneratingPDF(false);
  };

  const handleFullEngineeringReport = async () => {
    setIsGeneratingPDF(true);
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text(`Informe Ingeniería`, 14, 20);
    if(analysisResult) { doc.setFontSize(10); doc.text(doc.splitTextToSize(analysisResult.replace(/\*\*/g, ''), 180), 14, 40); }
    doc.save(`Analisis_Ing.pdf`); setIsGeneratingPDF(false);
  }

  if (loading && allLogs.length === 0) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-6 p-4 md:p-8 pb-20">
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h2>
           {/* PESTAÑAS */}
           <div className="flex gap-2 mt-2 bg-slate-100 p-1 rounded-full w-fit flex-wrap">
             <button onClick={() => setActiveTab('metrics')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'metrics' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Métricas</button>
             <button onClick={() => setActiveTab('efficiency')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'efficiency' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Eficiencia</button>
             <button onClick={() => setActiveTab('audit')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'audit' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Auditoría</button>
             <button onClick={() => setActiveTab('accounting')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'accounting' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Contabilidad</button>
             <button onClick={() => setActiveTab('simulator')} className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${activeTab === 'simulator' ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Zap className="w-3 h-3 inline mr-1"/> Simulador</button>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
            {activeTab === 'metrics' && (
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <Users className="w-4 h-4 text-slate-500" />
                    <select value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700 font-medium">
                        <option value="all">Global (Todos)</option>
                        <option disabled>──────────</option>
                        {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                </div>
            )}
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-500" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
                <span className="text-slate-400">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
            </div>
            <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if(confirm("⚠ ¿Estás seguro de ejecutar la CORRECCIÓN AUTOMÁTICA de datos?\n\nEsto buscará operaciones como '2m', '10m', etc., y las moverá al nombre del Modelo.\n\nEsta acción modificará la base de datos.")) {
                      fixDatabaseData().then(() => refreshData());
                    }
                  }} 
                  className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 border border-purple-200 font-bold" 
                  title="🪄 Corregir Datos Malos (2m, 4m...)"
                >
                  🪄 Corregir Datos
                </button>
                <button onClick={handleSmartExcel} className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200" title="Excel"><FileDown className="w-5 h-5" /></button>
                <button onClick={handleSmartPDF} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" title="PDF"><FileText className="w-5 h-5" /></button>
                <button onClick={refreshData} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Refrescar Datos (Forzar descarga)"><RefreshCw className="w-5 h-5" /></button>
                <div className="h-8 w-px bg-slate-300 mx-1"></div>
                <button onClick={handleEngineeringAccess} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isAuthorized ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isAuthorized ? <BrainCircuit className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>

      {/* RESTO DE TABS (SIN CAMBIOS) */}
      {/* ... PESTAÑA 1: MÉTRICAS ... */}
      {activeTab === 'metrics' && (
        <div className="space-y-6 animate-in fade-in">
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl shadow-md border border-slate-700 text-white md:col-span-1">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Target className="w-4 h-4 text-amber-500" /> Meta Diaria</p>
                        {!isEditingTarget ? <button onClick={() => setIsEditingTarget(true)}><Pencil className="w-4 h-4 text-slate-400 hover:text-white" /></button> : <button onClick={handleSaveTarget}><Save className="w-4 h-4 text-emerald-400" /></button>}
                    </div>
                    {isEditingTarget ? <input type="number" value={tempTarget} onChange={(e) => setTempTarget(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xl font-bold w-full text-white" autoFocus /> : <p className="text-3xl font-black mt-1 tracking-tight">{dailyTarget.toLocaleString()} <span className="text-sm font-normal text-slate-400">pts</span></p>}
                </div>
                {/* ... Resto de KPIs ... */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2"><Box className="w-4 h-4 text-blue-500"/> Declarado (App)</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{totalDeclaredPoints.toLocaleString('es-AR', {maximumFractionDigits:0})}</p>
                </div>
                {isGlobalView ? (
                    <>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500">
                            <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2"><Scale className="w-4 h-4 text-indigo-500"/> Real (Tango)</p>
                            <p className="text-3xl font-bold text-indigo-700 mt-2">{totalTangoPoints.toLocaleString('es-AR', {maximumFractionDigits:0})}</p>
                        </div>
                        <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${globalDifference >= 0 ? 'border-red-500' : 'border-green-500'}`}>
                            <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-2">Balance Global</p>
                            <p className={`text-3xl font-bold mt-2 ${globalDifference >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {globalDifference > 0 ? '+' : ''}{globalDifference.toLocaleString('es-AR', {maximumFractionDigits:0})}
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="md:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 gap-2">
                        <Info className="w-5 h-5"/>
                        <p className="text-sm">Para ver Balance vs Tango, seleccione "Global".</p>
                    </div>
                )}
            </div>

            {/* GRÁFICOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col h-96">
                    {selectedOperator === 'all' ? (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking</h3>
                                <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                                    <Filter className="w-3 h-3 text-slate-500"/>
                                    <select value={rankingFilter} onChange={(e) => setRankingFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"><option value="Global">Global</option><option disabled>──────</option>{Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                                {rankingStatsForMetrics.map((stat, idx) => (
                                <div key={stat.name} className="bg-slate-50 p-3 rounded-lg border border-slate-100 relative overflow-hidden">
                                    {idx < 3 && <div className={`absolute top-0 right-0 p-1 px-2 text-[10px] font-bold text-white rounded-bl-lg ${idx===0?'bg-amber-400':(idx===1?'bg-slate-400':'bg-orange-400')}`}>#{idx+1}</div>}
                                    <div className="flex justify-between items-center mb-1"><span className="font-bold text-slate-700">{stat.name}</span><span className="text-sm font-bold text-slate-600">{stat.points.toFixed(0)} pts</span></div>
                                    <div className="w-full bg-slate-200 rounded-full h-2"><div className="h-full bg-amber-500" style={{ width: `${Math.min(stat.percentage, 100)}%` }}></div></div>
                                </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600" /> Rendimiento Diario</h3>
                            <div className="overflow-y-auto flex-1 border rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Pts</th><th className="p-2 text-right">%</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dailyTrend.map((day) => {
                                            const eff = (day.points / dailyTarget) * 100;
                                            return (
                                                <tr key={day.fullDate} className="hover:bg-slate-50">
                                                    <td className="p-2 font-medium">{day.name}</td>
                                                    <td className="p-2 text-right font-bold text-blue-600">{day.points.toFixed(0)}</td>
                                                    <td className="p-2 text-right"><span className={`px-1.5 py-0.5 rounded ${eff>=100?'bg-green-100 text-green-700':(eff>=80?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700')}`}>{eff.toFixed(0)}%</span></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                <div id="chart-trend" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 lg:col-span-2">
                    <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600"/> Evolución Diaria</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize: 12}} /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="points" name="Puntos" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} /><Line type="monotone" dataKey="quantity" name="Unidades" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" /></LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
                <div id="chart-sector" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
                    <h3 className="text-md font-bold text-slate-700 mb-4">Producción por Sector</h3>
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={countBySector} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">{countBySector.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
                </div>
                <div id="chart-models" className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
                    <h3 className="text-md font-semibold text-slate-700 mb-4">Top 5 Modelos</h3>
                    <ResponsiveContainer width="100%" height="100%"><BarChart data={modelStats} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false}/><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} /><Tooltip /><Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} name="Unidades" /></BarChart></ResponsiveContainer>
                </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-8">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between"><h3 className="font-semibold text-slate-800">Historial Detallado</h3><button onClick={handleClearData} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5"/></button></div>
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0"><tr><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">Operario</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3 text-right">Pts</th><th className="px-6 py-3 w-48">Obs.</th></tr></thead>
                        <tbody>
                            {filteredLogs.slice(0, 100).map(log => (
                                <tr key={log.id} className="border-b hover:bg-slate-50">
                                    <td className="px-6 py-4">{new Date(log.timestamp).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 font-bold">{log.operatorName}</td>
                                    <td className="px-6 py-4">{log.model}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600">{log.totalPoints.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500" title={log.comments}>{log.comments || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* PESTAÑA 2: EFICIENCIA */}
      {activeTab === 'efficiency' && (
         <div className="animate-in fade-in space-y-6">
            {/* Contenido eficiencia (sin cambios) */}
            <div className="bg-indigo-50 p-6 rounded-xl shadow-md border-l-4 border-indigo-600">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Timer className="w-6 h-6 text-indigo-600"/> Eficiencia de Planta</h3>
                        <p className="text-slate-600 text-sm mt-1">Detección de superávit de producción y tiempo ocioso.</p>
                    </div>
                    <div className="bg-white p-1 rounded-lg border border-indigo-100 flex">
                        <button onClick={() => setEfficiencyView('operator')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${efficiencyView === 'operator' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutList className="w-4 h-4 inline mr-1"/> Detalle Operario</button>
                        <button onClick={() => setEfficiencyView('sector')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${efficiencyView === 'sector' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Layers className="w-4 h-4 inline mr-1"/> Resumen Sector</button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border border-indigo-100 mt-4 items-end">
                     <div><label className="text-[10px] text-indigo-500 font-bold block mb-1">DÍAS ESTÁNDAR</label><input type="number" value={globalDays} onChange={e => setGlobalDays(Number(e.target.value))} className="w-24 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-lg font-bold text-slate-800 outline-none"/></div>
                     <div><label className="text-[10px] text-indigo-500 font-bold block mb-1">HORAS TURNO</label><input type="number" value={shiftHours} onChange={e => setShiftHours(Number(e.target.value))} className="w-24 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-lg font-bold text-slate-800 outline-none"/></div>
                     <div><label className="text-[10px] text-slate-400 font-bold block mb-1">CAPACIDAD BASE</label><div className="bg-indigo-100 px-4 py-2 rounded text-lg font-black text-indigo-700 border border-indigo-200">{(globalDays * shiftHours * pointsPerHour).toLocaleString()} pts</div></div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">{efficiencyView === 'operator' ? 'Análisis Individual (Días Editables)' : 'Rendimiento por Sector'}</h3>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                            <tr>
                                <th className="px-6 py-4">{efficiencyView === 'operator' ? 'Operario' : 'Sector'}</th>
                                {efficiencyView === 'operator' && <th className="px-6 py-4 text-center w-32">Días Trab.</th>}
                                {efficiencyView === 'sector' && <th className="px-6 py-4 text-center">Cant. Op.</th>}
                                <th className="px-6 py-4 text-right">Prod. Real</th>
                                <th className="px-6 py-4 text-right text-indigo-600">Capacidad</th>
                                <th className="px-6 py-4 text-right font-bold">Balance</th>
                                <th className="px-6 py-4 text-center">Rendimiento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getEfficiencyData().map((stat:any, idx: number) => (
                                <tr key={stat.name} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white ${idx<3 ? 'bg-indigo-500' : 'bg-slate-400'}`}>{idx+1}</div>
                                        {stat.name}
                                    </td>
                                    {efficiencyView === 'operator' && (
                                        <td className="px-6 py-4 text-center">
                                            <input type="number" className="w-16 text-center border border-slate-200 rounded bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700" value={stat.daysWorked} onChange={(e) => setCustomDays({ ...customDays, [stat.name]: Number(e.target.value) })}/>
                                        </td>
                                    )}
                                    {efficiencyView === 'sector' && <td className="px-6 py-4 text-center font-mono text-slate-500">{stat.operatorsCount}</td>}
                                    <td className="px-6 py-4 text-right font-medium">{stat.points.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-right text-indigo-600 bg-indigo-50/30 font-mono">{stat.potentialPoints.toLocaleString('es-AR')}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${stat.isSurplus ? 'text-green-600 bg-green-50/30' : 'text-red-600 bg-red-50/30'}`}>{stat.isSurplus ? '+' : ''}{stat.difference.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-center">{stat.isSurplus ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">SUPERÁVIT</span> : <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200">DÉFICIT {(100 - stat.performancePct).toFixed(0)}%</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>
         </div>
      )}

      {/* PESTAÑA 3: AUDITORÍA */}
      {activeTab === 'audit' && (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Scale className="w-6 h-6 text-red-600"/> Conciliación vs. Tango / Stock</h3>
                    <p className="text-slate-500 text-sm mt-1">Comparativa entre producción declarada y stock real.</p>
                </div>
                {/* BUSCADOR */}
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                    <input type="text" placeholder="Buscar modelo..." className="pl-9 pr-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-sm" value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)}/>
                </div>
            </div>
            {/* ... Resto de la tabla de auditoría ... */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-bold border-b border-slate-200">
                            <tr><th className="px-6 py-4">Modelo</th><th className="px-6 py-4 text-right bg-blue-50/50">Valor Std</th><th className="px-6 py-4 text-right bg-blue-50/50">Declarado</th><th className="px-6 py-4 text-center bg-red-50/50 w-48">Cant. Real (Tango)</th><th className="px-6 py-4 text-right bg-red-50/50">Teórico</th><th className="px-6 py-4 text-right">Desvío</th><th className="px-6 py-4 text-center">Estado</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getAuditData().filter(item => item.model.toLowerCase().includes(auditSearch.toLowerCase())).map((row) => (
                                <tr key={row.model} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-800">{row.model}</td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-blue-50/30">{row.standardValue.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600 bg-blue-50/30">{row.declaredPoints.toLocaleString()}</td>
                                    <td className="px-6 py-4 bg-red-50/30"><div className="flex items-center justify-center"><input type="number" className="w-24 border border-red-200 rounded p-1 text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-500" placeholder="0" value={tangoInputs[row.model] || ''} onChange={(e) => setTangoInputs({...tangoInputs, [row.model]: e.target.value})}/><span className="text-xs text-slate-400 ml-1">u.</span></div></td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 bg-red-50/30">{row.theoreticalPoints.toLocaleString()}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${row.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>{row.difference > 0 ? '+' : ''}{row.difference.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">{Math.abs(row.deviationPct) < 5 ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">OK</span> : <span className={`px-2 py-1 rounded text-xs font-bold border ${row.difference > 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>{row.difference > 0 ? 'Exceso' : 'Faltante'} ({Math.abs(row.deviationPct).toFixed(0)}%)</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* PESTAÑA 4: CONTABILIDAD (SIN CAMBIOS) */}
      {activeTab === 'accounting' && (
        <div className="animate-in fade-in space-y-6">
            {/* KPI Cards Contables */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-slate-400">
                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Briefcase className="w-4 h-4"/> Capacidad Instalada (Total)</p>
                    <p className="text-2xl font-black text-slate-700 mt-2">{totalPlantCapacity.toLocaleString('es-AR')} <span className="text-xs font-medium text-slate-400">pts</span></p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500"/> Producción Validada (Tango)</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2">{totalPlantReal.toLocaleString('es-AR')} <span className="text-xs font-medium text-slate-400">pts</span></p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500">
                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500"/> Eficiencia Global</p>
                    <p className="text-2xl font-black text-indigo-700 mt-2">{plantProductivity.toFixed(1)}%</p>
                </div>
            </div>

            <div className="bg-emerald-50 p-6 rounded-xl shadow-md border-l-4 border-emerald-600">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Calculator className="w-6 h-6 text-emerald-600"/> Reporte de Costos por Centro</h3>
                <p className="text-slate-600 text-sm mt-1">Desglose de capacidad vs. producción real por Centro de Costo.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <tr>
                            <th className="px-6 py-4">Centro de Costo</th>
                            <th className="px-6 py-4 text-center">Cant. Op.</th>
                            <th className="px-6 py-4 text-right text-slate-500">Capacidad (Pts)</th>
                            <th className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/50">Prod. Real (Tango)</th>
                            <th className="px-6 py-4 text-right font-bold">Productividad</th>
                            <th className="px-6 py-4 text-center">Detalle</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {accountingData.map((row) => (
                            <React.Fragment key={row.center}>
                                <tr className={row.center === 'TOTAL PLANTA' ? "bg-slate-100 font-bold border-t-2 border-slate-300" : "hover:bg-slate-50 cursor-pointer"} onClick={() => row.center !== 'TOTAL PLANTA' && setExpandedSector(expandedSector === row.center ? null : row.center)}>
                                    <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2">
                                        {row.center !== 'TOTAL PLANTA' && <div className={`w-3 h-3 rounded-full ${row.productivity >= 80 ? 'bg-green-500' : (row.productivity >= 50 ? 'bg-yellow-500' : 'bg-red-500')}`}></div>}
                                        {row.center}
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-slate-600">{row.headcount || '-'}</td>
                                    <td className="px-6 py-4 text-right text-slate-500 font-mono">{row.capacity.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/30 font-mono font-bold">{row.real.toLocaleString('es-AR')}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${row.productivity < 50 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {row.productivity.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center text-slate-400">
                                        {row.center !== 'TOTAL PLANTA' && (expandedSector === row.center ? <ChevronDown className="w-5 h-5 mx-auto"/> : <ChevronRight className="w-5 h-5 mx-auto"/>)}
                                    </td>
                                </tr>
                                {expandedSector === row.center && row.operators && (
                                    <tr>
                                        <td colSpan={6} className="bg-slate-50 p-4 border-b border-slate-200 shadow-inner">
                                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-100 text-slate-500 uppercase">
                                                        <tr>
                                                            <th className="px-4 py-2">Operario</th>
                                                            <th className="px-4 py-2 text-right">Capacidad Indiv.</th>
                                                            <th className="px-4 py-2 text-right">Declarado</th>
                                                            <th className="px-4 py-2 text-right">Eficiencia Indiv.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {row.operators.map(op => (
                                                            <tr key={op.name}>
                                                                <td className="px-4 py-2 font-medium text-slate-700">{op.name}</td>
                                                                <td className="px-4 py-2 text-right text-slate-500">{op.capacity.toLocaleString()}</td>
                                                                <td className="px-4 py-2 text-right text-blue-600">{op.declared.toLocaleString()}</td>
                                                                <td className="px-4 py-2 text-right font-bold">{op.efficiency.toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* PESTAÑA 5: SIMULADOR (SIN CAMBIOS) */}
      {activeTab === 'simulator' && (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-orange-50 p-6 rounded-xl shadow-md border-l-4 border-orange-600">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Zap className="w-6 h-6 text-orange-600"/> Simulador de Dotación</h3>
                <p className="text-slate-600 text-sm mt-1 mb-4">Calcula el personal y verifica la disponibilidad de máquinas.</p>
                
                <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border border-orange-100 items-end">
                     <div className="flex-1 min-w-[200px]">
                        <label className="text-[10px] text-orange-500 font-bold block mb-1">MODELO A FABRICAR</label>
                        <select className="w-full border border-slate-300 rounded px-3 py-2 text-slate-800 font-bold outline-none focus:ring-2 focus:ring-orange-500" value={simModel} onChange={e => setSimModel(e.target.value)}>
                            <option value="">-- Seleccionar --</option>
                            {Array.from(new Set(matrix.map(m => m.model))).sort().map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                     </div>
                     <div className="w-32">
                        <label className="text-[10px] text-orange-500 font-bold block mb-1">CANTIDAD (u.)</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-slate-800 font-black text-center outline-none focus:ring-2 focus:ring-orange-500" value={simQty} onChange={e => setSimQty(Number(e.target.value))}/>
                     </div>
                     <div className="pb-2 text-sm text-slate-400 font-medium">Base cálculo: 1 persona = {dailyTarget.toLocaleString()} pts/día</div>
                </div>
            </div>

            {/* PANEL DE RECURSOS (MÁQUINAS) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Recursos Disponibles (Máquinas/Mesas)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['CORTE', 'COSTURA', 'ARMADO', 'EMBALAJE'].map(sector => (
                        <div key={sector} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-500 w-16">{sector}</span>
                            <input 
                                type="number" 
                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-700 outline-none focus:ring-1 focus:ring-orange-500"
                                value={simResources[sector] || 0}
                                onChange={(e) => setSimResources({...simResources, [sector]: Number(e.target.value)})}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {simModel && simQty > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                            <tr>
                                <th className="px-6 py-4">Centro de Costo</th>
                                <th className="px-6 py-4 text-right">Carga (Pts)</th>
                                <th className="px-6 py-4 text-center">Gente Necesaria</th>
                                <th className="px-6 py-4 text-center">Maq. Disp.</th>
                                <th className="px-6 py-4 text-center font-bold">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(() => {
                                const rules = matrix.filter(r => r.model === simModel);
                                const loadPerSector: Record<string, number> = { 'CORTE':0, 'COSTURA':0, 'ARMADO':0, 'EMBALAJE':0 };
                                rules.forEach(r => {
                                    const cc = normalizeCostCenter(r.sector);
                                    if (loadPerSector[cc] !== undefined) loadPerSector[cc] += (r.pointsPerUnit * simQty);
                                });
                                const singlePersonCapacity = dailyTarget; // USAMOS LA META DIARIA
                                
                                return Object.entries(loadPerSector).map(([sector, points]) => {
                                    const peopleNeeded = points / singlePersonCapacity;
                                    const peopleRounded = Math.ceil(peopleNeeded);
                                    
                                    // CORRECCIÓN: Definimos la variable ANTES de usarla en el return
                                    const availableResources = simResources[sector] || 0;
                                    
                                    const isBottleneck = peopleRounded > availableResources;

                                    return (
                                    <tr key={sector} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-bold text-slate-800">{sector}</td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-600">{points.toLocaleString('es-AR')}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-xl font-black text-slate-700">{peopleRounded}</span>
                                            <span className="text-xs text-slate-400 ml-2">({peopleNeeded.toFixed(1)})</span>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-500">{availableResources}</td>
                                        <td className="px-6 py-4 text-center">
                                            {isBottleneck ? (
                                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3"/> FALTA MAQ</span>
                                            ) : (
                                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">OK</span>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}

      {/* MODALES (SIN CAMBIOS) */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-6 text-white text-center"><Lock className="w-10 h-10 mx-auto mb-2 text-orange-500" /><h3 className="text-lg font-bold">Acceso Ingeniería</h3></div>
            <form onSubmit={verifyPassword} className="p-6">
              <input type="password" autoFocus className="w-full border rounded-lg p-3 outline-none mb-4 text-center tracking-widest font-mono text-xl" placeholder="••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
              <div className="flex gap-2"><button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-100 py-3 rounded-lg font-bold">Cancelar</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700">Entrar</button></div>
            </form>
          </div>
        </div>
      )}

      {showEngineeringModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-4"><div className="bg-indigo-500/20 p-2 rounded-lg"><BrainCircuit className="w-8 h-8 text-indigo-400"/></div><div><h3 className="text-2xl font-bold">Modo Ingeniería</h3><p className="text-slate-400 text-sm flex items-center gap-2"><ShieldCheck className="w-3 h-3"/> Sesión Segura Activa</p></div></div>
              <button onClick={() => setShowEngineeringModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
                    <h4 className="text-lg font-bold text-indigo-900 mb-4 border-b pb-2">Análisis de Inteligencia Artificial</h4>
                    {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500"><Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" /><p className="animate-pulse">Generando reporte avanzado...</p></div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Reporte Automático</span><button onClick={runAnalysis} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Regenerar</button></div>
                        {analysisResult || "No hay datos suficientes para generar un análisis."}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-4">Exportación Avanzada</h4>
                    <button onClick={handleFullEngineeringReport} disabled={isGeneratingPDF} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] disabled:opacity-50">
                      {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin"/> : <FileText className="w-5 h-5" />} {isGeneratingPDF ? 'GENERANDO...' : 'DESCARGAR REPORTE COMPLETO'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white border-t p-4 flex justify-end shrink-0"><button onClick={() => setShowEngineeringModal(false)} className="text-slate-500 hover:text-slate-800 font-medium px-6">Volver al Dashboard</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
