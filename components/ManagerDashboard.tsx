import React, { useEffect, useState } from 'react';
import { getLogs, clearLogs, downloadCSV, downloadPDF, getProductivityTarget, saveProductivityTarget, getOperators } from '../services/dataService';
import { ProductionLog } from '../types';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { Trash2, BrainCircuit, RefreshCw, FileDown, FileText, Calendar, Loader2, Target, Pencil, Save, Trophy, Users, TrendingUp, Box } from 'lucide-react';
import { analyzeProductionData } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

export const ManagerDashboard: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- FILTROS ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Últimos 7 días por defecto
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedOperator, setSelectedOperator] = useState<string>('all'); // 'all' o nombre del operario

  // --- META ---
  const [dailyTarget, setDailyTarget] = useState<number>(24960);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<string>("24960");

  // --- IA ---
  const [analysis, setAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [logs, target, ops] = await Promise.all([
        getLogs(),
        getProductivityTarget(),
        getOperators()
      ]);
      setAllLogs(logs);
      setDailyTarget(target);
      setTempTarget(target.toString());
      setOperatorList(ops);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allLogs, startDate, endDate, selectedOperator]);

  const refreshData = async () => {
    setLoading(true);
    const logs = await getLogs();
    setAllLogs(logs);
    setLoading(false);
  };

  const applyFilters = () => {
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      const dateMatch = logDate >= startDate && logDate <= endDate;
      const operatorMatch = selectedOperator === 'all' || log.operatorName === selectedOperator;
      return dateMatch && operatorMatch;
    });
    setFilteredLogs(filtered);
  };

  const handleSaveTarget = async () => {
    const newVal = parseInt(tempTarget);
    if (!isNaN(newVal) && newVal > 0) {
      await saveProductivityTarget(newVal);
      setDailyTarget(newVal);
      setIsEditingTarget(false);
      refreshData(); 
    } else {
      alert("Ingrese un número válido mayor a 0");
    }
  };

  const handleClearData = async () => {
    if (window.confirm("¡PELIGRO! ¿Está seguro de eliminar TODOS los registros históricos? Esta acción no se puede deshacer.")) {
      setLoading(true);
      await clearLogs();
      await refreshData();
    }
  };

  const handleDownloadExcel = () => {
    const filename = `Reporte_${selectedOperator === 'all' ? 'Global' : selectedOperator}_${startDate}_al_${endDate}`;
    downloadCSV(filteredLogs, filename);
  };

  const handleDownloadPDF = () => {
    const title = `Reporte: ${startDate} al ${endDate} (${selectedOperator === 'all' ? 'Global' : selectedOperator})`;
    const filename = `Reporte_${startDate}_al_${endDate}`;
    downloadPDF(filteredLogs, title, filename);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await analyzeProductionData(filteredLogs);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  // --- PREPARACIÓN DE DATOS PARA GRÁFICOS ---

  // 1. Puntos por Operario (Solo visible en modo Global)
  const operatorStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.operatorName]) {
      acc[log.operatorName] = { name: log.operatorName, points: 0, quantity: 0 };
    }
    acc[log.operatorName].points += log.totalPoints;
    acc[log.operatorName].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; points: number; quantity: number }>))
  .map(stat => ({ ...stat, percentage: (stat.points / dailyTarget) * 100 }))
  .sort((a, b) => b.points - a.points);

  // 2. Producción por Sector (Pie Chart)
  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 };
    acc[log.sector].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>));

  // 3. TENDENCIA DIARIA (Line Chart) - NUEVO
  const dailyTrend = Object.values(filteredLogs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; // Agrupar por fecha 'YYYY-MM-DD'
    // Formatear fecha corta DD/MM
    const shortDate = new Date(log.timestamp).toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'});
    
    if (!acc[date]) acc[date] = { fullDate: date, name: shortDate, points: 0, quantity: 0 };
    acc[date].points += log.totalPoints;
    acc[date].quantity += log.quantity;
    return acc;
  }, {} as Record<string, { fullDate:string, name: string; points: number; quantity: number }>))
  .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  // 4. TOP MODELOS (Bar Chart Horizontal) - NUEVO
  const modelStats = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { name: log.model, value: 0 };
    acc[log.model].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>))
  .sort((a, b) => b.value - a.value)
  .slice(0, 5); // Top 5 modelos

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

  if (loading && allLogs.length === 0) {
    return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* Header and Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h2>
           <p className="text-slate-500 text-sm">Resumen de producción y métricas</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center w-full xl:w-auto flex-wrap">
          
          {/* SELECTOR DE OPERARIO */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <Users className="w-4 h-4 text-slate-500" />
             <select 
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="bg-transparent text-sm outline-none text-slate-700 font-medium"
             >
                <option value="all">Vista Global (Todos)</option>
                <option disabled>──────────</option>
                {operatorList.map(op => <option key={op} value={op}>{op}</option>)}
             </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <Calendar className="w-4 h-4 text-slate-500" />
             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
             <span className="text-slate-400">-</span>
             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm outline-none text-slate-700"/>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
             <button onClick={handleDownloadExcel} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors" title="Descargar Excel">
              <FileDown className="w-4 h-4" /> Excel
            </button>
             <button onClick={handleDownloadPDF} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors" title="Descargar PDF">
              <FileText className="w-4 h-4" /> PDF
            </button>
            <button onClick={refreshData} className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50" title="Actualizar Datos">
               <RefreshCw className="w-5 h-5 text-slate-600" />
            </button>
            <button onClick={handleClearData} className="p-2 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 text-red-600" title="Borrar Historial">
               <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Tarjeta META */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl shadow-md border border-slate-700 text-white md:col-span-1">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-500" /> Meta Diaria
            </p>
            {!isEditingTarget ? (
              <button onClick={() => setIsEditingTarget(true)} className="text-slate-400 hover:text-white transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSaveTarget} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                <Save className="w-4 h-4" />
              </button>
            )}
          </div>
          {isEditingTarget ? (
            <div className="flex items-center gap-2 mt-1">
              <input type="number" value={tempTarget} onChange={(e) => setTempTarget(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xl font-bold w-full text-white outline-none focus:border-amber-500" autoFocus />
            </div>
          ) : (
            <p className="text-3xl font-black mt-1 tracking-tight">{dailyTarget.toLocaleString()} <span className="text-sm font-normal text-slate-400">pts</span></p>
          )}
          <p className="text-xs text-slate-500 mt-2">Objetivo base para cálculo de eficiencia.</p>
        </div>

        {/* KPIs Dinámicos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Producción Total (u)</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">
            {filteredLogs.reduce((sum, log) => sum + log.quantity, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Puntos Generados</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0).toFixed(1)}
          </p>
          {selectedOperator !== 'all' && (
             <p className="text-xs text-slate-400 mt-1">
               {((filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0) / dailyTarget) * 100).toFixed(1)}% de la meta diaria
             </p>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Registros</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{filteredLogs.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 1. Tabla de Eficiencia (Solo en vista GLOBAL) */}
        {selectedOperator === 'all' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col h-96">
            <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Cumplimiento
            </h3>
            <div className="overflow-y-auto flex-1 pr-2 space-y-3">
               {operatorStats.map((stat) => (
                 <div key={stat.name} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                   <div className="flex justify-between items-center mb-1">
                     <span className="font-bold text-slate-700">{stat.name}</span>
                     {stat.percentage >= 100 ? (
                       <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">¡CUMPLIDO!</span>
                     ) : (
                       <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-bold border border-orange-100">EN PROCESO</span>
                     )}
                   </div>
                   <div className="flex justify-between items-end text-sm mb-1">
                     <span className="text-slate-500">{stat.points.toFixed(0)} pts</span>
                     <span className={`font-black ${stat.percentage >= 100 ? 'text-green-600' : 'text-slate-600'}`}>
                       {stat.percentage.toFixed(1)}%
                     </span>
                   </div>
                   <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full ${stat.percentage >= 100 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(stat.percentage, 100)}%` }}></div>
                   </div>
                 </div>
               ))}
               {operatorStats.length === 0 && <div className="text-center text-slate-400 py-8 text-sm italic">Sin datos.</div>}
            </div>
          </div>
        )}

        {/* 2. Gráfico de TENDENCIA (Línea) - Siempre visible, ocupa más espacio si es individual */}
        <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 ${selectedOperator === 'all' ? 'lg:col-span-2' : 'lg:col-span-2'}`}>
          <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600"/> 
            Evolución Diaria de Puntos
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize: 12}} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="points" name="Puntos Totales" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
              {selectedOperator === 'all' && <Line type="monotone" dataKey="quantity" name="Unidades" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Gráfico de TOP MODELOS (Barras) - Ocupa el espacio lateral si estamos filtrando */}
        {selectedOperator !== 'all' && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1 h-96">
             <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2">
               <Box className="w-5 h-5 text-purple-600"/> 
               Top 5 Modelos
             </h3>
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={modelStats} layout="vertical">
                 <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false}/>
                 <XAxis type="number" hide />
                 <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} />
                 <Tooltip />
                 <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} name="Unidades" label={{ position: 'right', fill: '#666', fontSize: 10 }} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        )}
      </div>

      {/* Charts Row 2 - Distribución por Sector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm h-80">
          <h3 className="text-md font-semibold text-slate-700 mb-4">Producción por Sector</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={countBySector} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                {countBySector.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="middle" align="right" layout="vertical" />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Si estamos en GLOBAL, mostramos la comparativa de Operarios en Barras */}
        {selectedOperator === 'all' && (
          <div className="bg-white p-6 rounded-xl shadow-sm h-80">
            <h3 className="text-md font-semibold text-slate-700 mb-4">Comparativa Puntos por Operario</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={operatorStats.slice(0, 10) /* Top 10 para no saturar */}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="points" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Puntos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* AI Analysis Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
            <BrainCircuit className="w-6 h-6" /> IA Plant Manager
          </h3>
          <button onClick={handleAnalyze} disabled={isAnalyzing || filteredLogs.length === 0} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isAnalyzing ? 'Analizando...' : 'Generar Reporte Inteligente'}
          </button>
        </div>
        {analysis ? (
          <div className="prose prose-sm prose-indigo max-w-none bg-white p-4 rounded-lg shadow-sm"><ReactMarkdown>{analysis}</ReactMarkdown></div>
        ) : (
          <p className="text-indigo-400 text-sm italic">{filteredLogs.length === 0 ? "No hay datos en el rango seleccionado." : "Presione el botón para detectar ineficiencias automáticamente."}</p>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Detalle de Registros ({selectedOperator === 'all' ? 'Todos' : selectedOperator})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Operario</th>
                <th className="px-6 py-3">Sector</th>
                <th className="px-6 py-3">Modelo</th>
                <th className="px-6 py-3 text-right">Cant.</th>
                <th className="px-6 py-3 text-right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 50).map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium">{new Date(log.timestamp).toLocaleDateString()}</td>
                  <td className="px-6 py-4">{log.operatorName}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold">{log.sector}</span></td>
                  <td className="px-6 py-4">{log.model} - {log.operation}</td>
                  <td className="px-6 py-4 text-right font-bold">{log.quantity}</td>
                  <td className="px-6 py-4 text-right text-blue-600 font-bold">{log.totalPoints.toFixed(1)}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No se encontraron registros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
