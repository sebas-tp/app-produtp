import React, { useEffect, useState } from 'react';
import { getLogs, clearLogs, downloadCSV, downloadPDF } from '../services/dataService';
import { ProductionLog } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Trash2, BrainCircuit, RefreshCw, FileDown, FileText, Calendar, Loader2 } from 'lucide-react';
import { analyzeProductionData } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

export const ManagerDashboard: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ProductionLog[]>([]); 
  const [filteredLogs, setFilteredLogs] = useState<ProductionLog[]>([]); 
  const [loading, setLoading] = useState(true);
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); 
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [analysis, setAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allLogs, startDate, endDate]);

  const refreshData = async () => {
    setLoading(true);
    const logs = await getLogs();
    setAllLogs(logs);
    setLoading(false);
  };

  const applyFilters = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const filtered = allLogs.filter(log => {
      const logDate = log.timestamp.split('T')[0];
      return logDate >= startDate && logDate <= endDate;
    });
    
    setFilteredLogs(filtered);
  };

  const handleClearData = async () => {
    if (window.confirm("¡PELIGRO! ¿Está seguro de eliminar TODOS los registros históricos? Esta acción no se puede deshacer.")) {
      setLoading(true);
      await clearLogs();
      await refreshData();
    }
  };

  const handleDownloadExcel = () => {
    const filename = `Reporte_Fabrica_${startDate}_al_${endDate}`;
    downloadCSV(filteredLogs, filename);
  };

  const handleDownloadPDF = () => {
    const title = `Reporte de Producción: ${startDate} al ${endDate}`;
    const filename = `Reporte_Fabrica_${startDate}_al_${endDate}`;
    downloadPDF(filteredLogs, title, filename);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await analyzeProductionData(filteredLogs);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const pointsByOperator = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.operatorName]) acc[log.operatorName] = { name: log.operatorName, points: 0 };
    acc[log.operatorName].points += log.totalPoints;
    return acc;
  }, {} as Record<string, { name: string; points: number }>));

  const countBySector = Object.values(filteredLogs.reduce((acc, log) => {
    if (!acc[log.sector]) acc[log.sector] = { name: log.sector, value: 0 };
    acc[log.sector].value += log.quantity;
    return acc;
  }, {} as Record<string, { name: string; value: number }>));

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

        <div className="flex flex-col md:flex-row gap-4 items-center w-full xl:w-auto">
          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <Calendar className="w-4 h-4 text-slate-500" />
             <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-sm outline-none text-slate-700"
             />
             <span className="text-slate-400">-</span>
             <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-sm outline-none text-slate-700"
             />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
             <button 
              onClick={handleDownloadExcel}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              title="Descargar Excel"
            >
              <FileDown className="w-4 h-4" /> Excel
            </button>
             <button 
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              title="Descargar PDF"
            >
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Producción Periodo (u)</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">
            {filteredLogs.reduce((sum, log) => sum + log.quantity, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Puntos Generados</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {filteredLogs.reduce((sum, log) => sum + log.totalPoints, 0).toFixed(1)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium uppercase">Registros Filtrados</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">
            {filteredLogs.length}
          </p>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
            <BrainCircuit className="w-6 h-6" /> IA Plant Manager
          </h3>
          <button 
            onClick={handleAnalyze} 
            disabled={isAnalyzing || filteredLogs.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isAnalyzing ? 'Analizando...' : 'Generar Reporte Inteligente'}
          </button>
        </div>
        {analysis ? (
          <div className="prose prose-sm prose-indigo max-w-none bg-white p-4 rounded-lg shadow-sm">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-indigo-400 text-sm italic">
            {filteredLogs.length === 0 ? "No hay datos en el rango seleccionado." : "Presione el botón para detectar ineficiencias automáticamente."}
          </p>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm h-80">
          <h3 className="text-md font-semibold text-slate-700 mb-4">Puntos por Operario</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pointsByOperator}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize: 12}} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="points" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm h-80">
          <h3 className="text-md font-semibold text-slate-700 mb-4">Producción por Sector</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={countBySector}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {countBySector.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Detalle de Registros ({startDate} al {endDate})</h3>
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
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold">{log.sector}</span>
                  </td>
                  <td className="px-6 py-4">{log.model} - {log.operation}</td>
                  <td className="px-6 py-4 text-right font-bold">{log.quantity}</td>
                  <td className="px-6 py-4 text-right text-blue-600 font-bold">{log.totalPoints.toFixed(1)}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No se encontraron registros en estas fechas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};