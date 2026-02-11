import React, { useState, useEffect, useMemo } from 'react';
import { 
  getOperators, saveOperators, 
  getModels, saveModels, 
  getOperations, saveOperations, 
  getPointsMatrix, addPointRule, deletePointRule, updatePointRule,
  addNews, deleteNews, getActiveNews, NewsItem,
  deleteOperatorWithData, 
  restoreSystemFromBackup,
  recalculateAllHistory,
  getProductivityTarget,
  setOperatorPin 
} from '../services/dataService';
import { db } from '../services/dataService'; 
import { collection, getDocs, query, orderBy } from 'firebase/firestore'; 
import { Sector, PointRule, ProductionLog } from '../types';
import { 
  Trash2, Plus, Users, Box, Layers, Calculator, AlertTriangle, Loader2, 
  Pencil, RefreshCw, X, Megaphone, Clock, Upload, Database, Check, 
  FileSearch, AlertOctagon, ArrowRight, Download, Shield, FileJson, Search,
  BarChart3, Filter, Target, Calendar, Key, Keyboard 
} from 'lucide-react';

// IMPORTAMOS EL FORMULARIO (Asegúrate de que el archivo exista en la misma carpeta)
import { OperatorForm } from './OperatorForm';

// --- UTILIDAD PARA FECHAS ---
const formatDateUTC = (dateString: string) => {
  if (!dateString) return '-';
  const parts = dateString.split('-'); 
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateString;
};

// --- COMPONENTE GESTOR DE LISTAS ---
interface ListManagerProps {
  title: string;
  data: string[];
  onSave: (d: string[]) => Promise<void>;
  icon: any;
  customDelete?: (item: string) => Promise<void>;
  allowPin?: boolean; // Prop para activar gestión de claves
}

const ListManager = ({ title, data, onSave, icon: Icon, customDelete, allowPin }: ListManagerProps) => {
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const handleAdd = async () => {
    if (newItem.trim() && !data.includes(newItem)) {
      setSaving(true);
      await onSave([...data, newItem]);
      
      // Si es operario, pedimos crear PIN de una vez
      if (allowPin) {
        const pin = prompt(`Ingrese un PIN de 4 dígitos para el nuevo operario "${newItem}":`, "1234");
        if (pin) {
             try {
                await setOperatorPin(newItem, pin);
             } catch (e) {
                console.error("Error guardando PIN", e);
             }
        }
      }

      setNewItem('');
      setSaving(false);
    }
  };

  // Función para cambiar PIN manualmente
  const handleSetPin = async (item: string) => {
    const newPin = prompt(`Ingrese el NUEVO PIN de 4 dígitos para "${item}":`);
    if (newPin && newPin.length >= 4) {
      setSaving(true);
      await setOperatorPin(item, newPin);
      setSaving(false);
      alert(`✅ PIN actualizado correctamente para ${item}`);
    } else if (newPin) {
      alert("⚠️ El PIN debe tener al menos 4 caracteres.");
    }
  };

  const handleDelete = async (item: string) => {
    if (customDelete) { await customDelete(item); return; }
    if (window.confirm(`¿Está seguro de eliminar "${item}"?`)) {
      setSaving(true);
      const updatedList = data.filter(i => i !== item);
      await onSave(updatedList);
      setSaving(false);
    }
  };

  const startEdit = (item: string) => { setEditingItem(item); setEditValue(item); };

  const saveEdit = async () => {
    if (!editValue.trim() || editValue === editingItem) { setEditingItem(null); return; }
    if (data.includes(editValue)) { alert("Ya existe."); return; }
    setSaving(true);
    const updatedList = data.map(item => item === editingItem ? editValue : item);
    await onSave(updatedList);
    setEditingItem(null); setEditValue(''); setSaving(false);
  };

  const filteredData = data.filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full relative flex flex-col">
      {saving && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"><Loader2 className="animate-spin text-orange-600"/></div>}
      <div className="flex items-center gap-2 mb-4 text-slate-800">
          <Icon className="w-5 h-5 text-orange-600" />
          <h3 className="font-bold">{title}</h3>
          <span className="ml-auto text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded">{data.length}</span>
      </div>
      <div className="flex gap-2 mb-4">
        <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={`Nuevo...`} className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm outline-none text-slate-900 focus:ring-2 focus:ring-orange-200" />
        <button onClick={handleAdd} disabled={!newItem} className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"><Plus className="w-5 h-5" /></button>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-blue-300 transition-colors"/>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar flex-1">
        {filteredData.map((item) => (
          <div key={item} className={`flex justify-between items-center px-3 py-2 rounded text-sm group transition-colors ${editingItem === item ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 hover:bg-slate-100'}`}>
            {editingItem === item ? (
              <div className="flex w-full items-center gap-2">
                <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-slate-900 outline-none text-xs font-bold" autoFocus />
                <button onClick={saveEdit} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check className="w-4 h-4"/></button>
                <button onClick={() => setEditingItem(null)} className="text-red-500 hover:bg-red-100 p-1 rounded"><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <>
                <span className="text-slate-700 font-medium truncate flex-1">{item}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* BOTÓN DE CLAVE */}
                  {allowPin && (
                    <button onClick={() => handleSetPin(item)} className="text-slate-400 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50 transition-colors" title="Asignar PIN">
                        <Key className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(item)} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {filteredData.length === 0 && <p className="text-slate-400 text-xs italic text-center py-4">No se encontraron resultados</p>}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lists' | 'matrix' | 'news' | 'import' | 'stats' | 'manual'>('stats');
  const [loading, setLoading] = useState(true);
  
  const [operators, setOperators] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [dailyTarget, setDailyTarget] = useState<number>(24960);

  // Estados para Edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<Partial<PointRule>>({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 });
  const [matrixSearch, setMatrixSearch] = useState(''); 

  // Estados para Noticias
  const [activeNews, setActiveNews] = useState<NewsItem[]>([]);
  const [newsForm, setNewsForm] = useState({ title: '', content: '', duration: '24' });

  // Estados para Import/Export
  const [jsonImport, setJsonImport] = useState('');
  const [importing, setImporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Estados para REPORTES
  const [statsOperator, setStatsOperator] = useState(''); 
  const [statsMonth, setStatsMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allLogsQuery = query(collection(db, 'production_logs'), orderBy('timestamp', 'desc'));
      const allLogsSnapshot = await getDocs(allLogsQuery);
      const allProductionLogs = allLogsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionLog));

      const [ops, mods, opers, mtx, news, target] = await Promise.all([
        getOperators(), getModels(), getOperations(), getPointsMatrix(), getActiveNews(), getProductivityTarget()
      ]);
      
      setOperators(ops); setModels(mods); setOperations(opers); 
      setMatrix(mtx); setActiveNews(news); setDailyTarget(target);
      setLogs(allProductionLogs); 

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const operatorStats = useMemo(() => {
    if (!statsOperator || logs.length === 0) return null;
    const opLogs = logs.filter(l => l.operatorName === statsOperator && l.timestamp.substring(0, 7) === statsMonth);
    const groupedData: Record<string, { points: number, hasUnrated: boolean }> = {};
    opLogs.forEach(log => {
      const date = log.timestamp.split('T')[0]; 
      if (!groupedData[date]) groupedData[date] = { points: 0, hasUnrated: false };
      groupedData[date].points += log.totalPoints;
      if (log.totalPoints === 0 && log.quantity > 0) groupedData[date].hasUnrated = true;
    });
    const historyArray = Object.entries(groupedData).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)); 
    if (historyArray.length === 0) return { history: [], avgGeneral: 0, avgProductive: 0 };
    const totalPointsAll = historyArray.reduce((acc, day) => acc + day.points, 0);
    const avgGeneral = (totalPointsAll / historyArray.length / dailyTarget) * 100;
    const pureDays = historyArray.filter(day => day.points > 0 && !day.hasUnrated);
    const totalPointsPure = pureDays.reduce((acc, day) => acc + day.points, 0);
    const avgProductive = pureDays.length > 0 ? (totalPointsPure / pureDays.length / dailyTarget) * 100 : 0;
    return { history: historyArray, avgGeneral, avgProductive };
  }, [logs, statsOperator, statsMonth, dailyTarget]);

  const handleForceUpdate = () => { localStorage.removeItem('cached_matrix'); localStorage.removeItem('cached_matrix_time'); window.location.reload(); };
  const handleSaveOperators = async (l: string[]) => { await saveOperators(l); setOperators(l); };
  const handleSaveModels = async (l: string[]) => { await saveModels(l); setModels(l); };
  const handleSaveOperations = async (l: string[]) => { await saveOperations(l); setOperations(l); };
  const handleSpecialDeleteOperator = async (n: string) => { if(confirm("¿Borrar?")) { await deleteOperatorWithData(n); setOperators(prev => prev.filter(op => op !== n)); } };
  const fixMissingRule = (item: any) => { setNewRule({ sector: item.sector, model: item.model, operation: item.operation, pointsPerUnit: 0 }); setActiveTab('matrix'); window.scrollTo(0,0); };
  const handleEditClick = (r: PointRule) => { setEditingId(r.id!); setNewRule(r); window.scrollTo(0,0); };
  const handleCancelEdit = () => { setEditingId(null); setNewRule({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 }); };
  const handleSaveRule = async () => { if(newRule.model) { setLoading(true); await (editingId ? updatePointRule({id: editingId, ...newRule} as PointRule) : addPointRule(newRule as PointRule)); await loadData(); setEditingId(null); setNewRule({ ...newRule, pointsPerUnit: 0 }); setLoading(false); }};
  const handleDeleteRule = async (id?: string) => { if(id && confirm("¿Borrar?")) { setLoading(true); await deletePointRule(id); await loadData(); setLoading(false); } };
  const handleAddNews = async () => { if(newsForm.title) { setLoading(true); await addNews({...newsForm, id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + parseInt(newsForm.duration)*3600000).toISOString()} as any); await loadData(); setLoading(false); }};
  const handleDeleteNews = async (id: string) => { await deleteNews(id); await loadData(); };
  const handleFullBackup = async () => { setBackingUp(true); const blob = new Blob([JSON.stringify({ meta: { date: new Date().toISOString(), app: "TopSafe" }, config: { operators, models, operations }, matrix, logs, news: activeNews }, null, 2)], {type: "application/json"}); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `BACKUP_TOPSAFE_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); setBackingUp(false); };
  const handleBulkImport = async () => { if (!jsonImport || !confirm("¿Importar?")) return; setImporting(true); try { const data = JSON.parse(jsonImport); for (const item of data) if(item.model) await addPointRule({...item, model: item.model.toString(), pointsPerUnit: Number(item.pointsPerUnit)}); await loadData(); setJsonImport(''); } catch(e) { alert("Error JSON"); } finally { setImporting(false); } };

  // --- AGRUPAMIENTO INTELIGENTE DE ALERTAS (INCLUYE COMENTARIOS) ---
  const auditData = useMemo(() => {
    const modelsWithoutRules = models.filter(m => !matrix.some(r => r.model === m));
    const zeroPointIncidents = logs.filter(l => l.totalPoints === 0 && l.quantity > 0);
    const groupedIncidents: Record<string, { sector: string, model: string, operation: string, count: number, operators: Set<string>, comments: Set<string> }> = {};
    
    zeroPointIncidents.forEach(inc => {
      const key = `${inc.sector}-${inc.model}-${inc.operation}`;
      if (!groupedIncidents[key]) {
        groupedIncidents[key] = { 
            sector: inc.sector as string, 
            model: inc.model, 
            operation: inc.operation, 
            count: 0, 
            operators: new Set(),
            comments: new Set() 
        };
      }
      groupedIncidents[key].count++;
      groupedIncidents[key].operators.add(inc.operatorName);
      if (inc.comments && inc.comments.trim() !== "") {
          groupedIncidents[key].comments.add(inc.comments);
      }
    });
    return { modelsWithoutRules, missingRules: Object.values(groupedIncidents) };
  }, [models, matrix, logs]);

  // --- FUNCIÓN DE DESCARGA (EXCEL CON OBSERVACIONES) ---
  const handleDownloadAudit = () => {
    if (auditData.missingRules.length === 0) { alert("No hay alertas."); return; }
    
    const headers = ["Sector", "Modelo", "Operacion", "Frecuencia", "Operarios", "Observaciones (Detalle)"];
    const rows = auditData.missingRules.map((item: any) => [
      item.sector,
      item.model,
      item.operation,
      item.count,
      Array.from(item.operators).join(', '),
      Array.from(item.comments).join(' | ') 
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ALERTAS_SIN_PRECIO_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredMatrix = matrix.filter(r => r.model.toLowerCase().includes(matrixSearch.toLowerCase()));

  if (loading && matrix.length === 0) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-slate-800 text-white p-6 rounded-xl shadow-md border-l-4 border-orange-600">
        <div className="flex justify-between items-start"><h2 className="text-2xl font-bold">Configuración TopSafe</h2><button onClick={handleForceUpdate} className="bg-slate-700 px-3 py-1 rounded text-xs"><RefreshCw className="w-4 h-4"/></button></div>
        <div className="flex flex-wrap gap-4 mt-6">
            {['stats', 'manual', 'lists', 'matrix', 'news', 'import'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize flex items-center gap-2 ${activeTab === tab ? (tab==='manual'?'bg-indigo-600':'bg-orange-600') : 'bg-slate-700'}`}>
                    {tab==='stats'?<><BarChart3 className="w-4 h-4"/>Reportes</> : tab==='manual'?<><Keyboard className="w-4 h-4"/>Carga Manual</> : tab}
                </button>
            ))}
        </div>
      </div>

      {/* --- NUEVA PESTAÑA: CARGA MANUAL --- */}
      {activeTab === 'manual' && (
        <div className="animate-in fade-in zoom-in-95 duration-300">
           <OperatorForm isManager={true} />
        </div>
      )}

      {/* --- PESTAÑA: REPORTES Y ESTADÍSTICAS --- */}
      {activeTab === 'stats' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in zoom-in-95 duration-300">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-orange-600"/> Reporte Mensual de Productividad</h3>
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Operario</label><select className="w-full p-3 border rounded-lg font-bold" value={statsOperator} onChange={(e) => setStatsOperator(e.target.value)}><option value="">-- Seleccionar --</option>{operators.map(op => <option key={op} value={op}>{op}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mes</label><input type="month" className="w-full p-3 border rounded-lg font-bold" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} /></div>
            </div>
            {statsOperator && operatorStats ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-4 rounded-xl border text-center"><div className="text-xs uppercase font-bold text-slate-400">Promedio Bruto</div><div className="text-3xl font-black text-slate-600">{operatorStats.avgGeneral.toFixed(0)}%</div></div>
                   <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-center relative overflow-hidden"><div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-2 py-1 rounded-bl">LIQUIDACIÓN</div><div className="text-xs uppercase font-bold text-blue-600">Promedio Puro</div><div className="text-4xl font-black text-blue-700">{operatorStats.avgProductive.toFixed(0)}%</div></div>
                </div>
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase"><tr><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-right">Pts</th><th className="px-4 py-2 text-right">%</th><th className="px-4 py-2 text-center">Estado</th></tr></thead>
                    <tbody className="divide-y">
                      {operatorStats.history.map((day, idx) => {
                        const eff = (day.points / dailyTarget) * 100;
                        return (<tr key={idx} className={`hover:bg-slate-50 ${day.hasUnrated || day.points === 0 ? 'bg-slate-50/60 text-slate-400' : ''}`}><td className="px-4 py-2 font-mono">{formatDateUTC(day.date)}</td><td className="px-4 py-2 text-right font-bold">{day.points.toLocaleString()}</td><td className="px-4 py-2 text-right">{eff.toFixed(0)}%</td><td className="px-4 py-2 text-center text-[10px] font-bold">{day.hasUnrated ? <span className="text-orange-500">MIXTO</span> : (day.points === 0 ? "SIN PROD" : <span className="text-green-600">PURO</span>)}</td></tr>)
                      })}
                    </tbody>
                </table>
              </div>
            ) : <div className="text-center py-10 text-slate-400 italic">Seleccione operario y mes.</div>}
        </div>
      )}

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
          <ListManager title="Operarios" data={operators} onSave={handleSaveOperators} icon={Users} customDelete={handleSpecialDeleteOperator} allowPin={true} />
          <ListManager title="Modelos" data={models} onSave={handleSaveModels} icon={Box} />
          <ListManager title="Operaciones" data={operations} onSave={handleSaveOperations} icon={Layers} />
        </div>
      )}
      
      {/* --- PESTAÑA: MATRIZ --- */}
      {activeTab === 'matrix' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-start gap-3"><div className="bg-slate-200 p-2 rounded-full"><FileSearch className="w-5 h-5 text-slate-600"/></div>
             <div className="flex-1">
                 <h4 className="font-bold text-slate-800 text-sm">Productos sin Configurar</h4>
                 <p className="text-xs text-slate-500 mb-2">Modelos que no tienen ninguna regla de precio.</p>
                 <div className="text-2xl font-black text-slate-700">{auditData.modelsWithoutRules.length}</div>
                 {/* LISTADO DE MODELOS RESTAURADO */}
                 {auditData.modelsWithoutRules.length > 0 && <div className="mt-2 text-xs text-slate-600 bg-slate-100 p-2 rounded max-h-24 overflow-y-auto custom-scrollbar">{auditData.modelsWithoutRules.join(', ')}</div>}
             </div>
             </div>
             
             {/* --- TARJETA DE ALERTAS CON BOTÓN DE EXPORTAR --- */}
             <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col gap-4 shadow-sm">
                <div className="flex items-start gap-3">
                   <div className="bg-red-100 p-2 rounded-full animate-pulse"><AlertOctagon className="w-5 h-5 text-red-600"/></div>
                   <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-red-800 text-sm">Alertas (0 Pts)</h4>
                          <p className="text-xs text-red-600 mb-2">Operaciones reportadas sin valor.</p>
                        </div>
                        {/* BOTÓN NUEVO DE DESCARGA */}
                        <button 
                            onClick={handleDownloadAudit}
                            disabled={auditData.missingRules.length === 0}
                            className="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="w-3 h-3"/> Excel
                        </button>
                      </div>
                      
                      {auditData.missingRules.length === 0 ? <div className="text-sm font-bold text-green-700">¡Todo en orden!</div> : (
                        <div className="space-y-2 mt-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {auditData.missingRules.map((item: any, idx: number) => (
                                <div key={idx} className="bg-white p-2 rounded border border-red-100 flex justify-between items-center group">
                                    <div>
                                        <div className="text-xs font-bold text-slate-800">{item.model}</div>
                                        <div className="text-[10px] text-slate-500">{item.operation} • {item.count}x</div>
                                    </div>
                                    <button onClick={() => fixMissingRule(item)} className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded hover:bg-red-700">Arreglar</button>
                                </div>
                            ))}
                        </div>
                      )}
                   </div>
                </div>
             </div>
          </div>

          <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-blue-500' : 'border-orange-100'} transition-colors`}>
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2">{editingId ? <RefreshCw className="w-5 h-5 text-blue-600" /> : <Calculator className="w-5 h-5 text-orange-600" />}{editingId ? 'Editando' : 'Nueva Regla'}</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Sector</label><select className="w-full border p-2 rounded" value={newRule.sector} onChange={e => setNewRule({...newRule, sector: e.target.value as Sector})}>{Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label><select className="w-full border p-2 rounded" value={newRule.model} onChange={e => setNewRule({...newRule, model: e.target.value})}><option value="">Select...</option>{models.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Operación</label><select className="w-full border p-2 rounded" value={newRule.operation} onChange={e => setNewRule({...newRule, operation: e.target.value})}><option value="">Select...</option>{operations.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Puntos (Unitario)</label><input type="number" step="0.1" className="w-full border p-2 rounded font-bold" value={newRule.pointsPerUnit} onChange={e => setNewRule({...newRule, pointsPerUnit: parseFloat(e.target.value)})}/></div>
              <div className="flex gap-2">{editingId && <button onClick={handleCancelEdit} className="bg-slate-200 px-3 rounded font-bold text-slate-600">X</button>}<button onClick={handleSaveRule} disabled={loading} className={`${editingId ? 'bg-blue-600' : 'bg-orange-600'} text-white font-bold py-2 px-4 rounded flex-1`}>{editingId ? 'Update' : 'Add'}</button></div>
            </div>
          </div>
          <div className="bg-white p-3 rounded-lg border flex items-center gap-3"><Search className="w-5 h-5 text-slate-400"/><input type="text" placeholder="Buscar..." className="flex-1 outline-none text-sm" value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)}/></div>
          <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border-t-2 border-orange-200">
            <table className="w-full text-sm text-left"><thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold"><tr><th className="px-6 py-3">Sector</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3">Operación</th><th className="px-6 py-3 text-right">Pts/U</th><th className="px-6 py-3 text-center">Acción</th></tr></thead>
              <tbody className="divide-y">{filteredMatrix.map((rule) => (<tr key={rule.id} className="hover:bg-slate-50"><td className="px-6 py-3">{rule.sector}</td><td className="px-6 py-3 font-medium">{rule.model}</td><td className="px-6 py-3">{rule.operation}</td><td className="px-6 py-3 text-right font-bold text-orange-600">{rule.pointsPerUnit}</td><td className="px-6 py-3 text-center flex justify-center gap-2"><button onClick={() => handleEditClick(rule)}><Pencil className="w-4 h-4 text-blue-400"/></button><button onClick={() => handleDeleteRule(rule.id)}><Trash2 className="w-4 h-4 text-red-400"/></button></td></tr>))}</tbody></table>
          </div>
        </div>
      )}

      {activeTab === 'news' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-300">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Megaphone className="w-5 h-5 text-orange-600" /> Nuevo Comunicado</h3>
              <div className="space-y-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">TÍTULO</label><input className="w-full border p-2 rounded bg-slate-50" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})}/></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">MENSAJE</label><textarea className="w-full border p-2 rounded bg-slate-50 h-24" value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})}/></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">DURACIÓN</label><select className="w-full border p-2 rounded bg-slate-50" value={newsForm.duration} onChange={e => setNewsForm({...newsForm, duration: e.target.value})}><option value="24">24 Horas</option><option value="48">48 Horas</option><option value="168">1 Semana</option></select></div>
                <button onClick={handleAddNews} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700">Publicar</button>
              </div>
          </div>
          <div className="space-y-4">
              {activeNews.map(item => (
                <div key={item.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 relative">
                  <button onClick={() => handleDeleteNews(item.id)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  <h4 className="font-bold text-slate-800">{item.title}</h4>
                  <p className="text-slate-600 text-sm mt-1">{item.content}</p>
                  <div className="mt-3 text-xs text-slate-400">Vence: {new Date(item.expiresAt).toLocaleString()}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* --- PESTAÑA: DATOS & BACKUP --- */}
      {activeTab === 'import' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* SECCIÓN 1: SEGURIDAD Y RESPALDO */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Shield className="w-6 h-6 text-emerald-600"/> Zona de Seguridad: Respaldo Completo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 1. EXPORTAR */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-700 mb-2">1. Descargar Copia de Seguridad</h4>
                  <p className="text-sm text-slate-500 mb-6">Genera un archivo único (.json) con TODOS los datos del sistema: Registros de producción, historial, configuraciones y noticias. Guarde este archivo en un lugar seguro (Drive/PC) semanalmente.</p>
                </div>
                <button onClick={handleFullBackup} disabled={backingUp} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50">
                  {backingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  {backingUp ? 'Generando Archivo...' : 'DESCARGAR BACKUP'}
                </button>
              </div>

              {/* 2. RESTAURAR */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-bl">PELIGRO</div>
                <h4 className="font-bold text-slate-700 mb-2">2. Restaurar Sistema</h4>
                <p className="text-sm text-slate-500 mb-4">Recupera el sistema subiendo un archivo de respaldo previo. <span className="text-red-500 font-bold">Atención: Esto modificará la base de datos actual.</span></p>
                
                <label className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed ${importing ? 'border-slate-300 bg-slate-50' : 'border-red-200 hover:bg-red-50 cursor-pointer'} rounded-lg p-4 transition-colors`}>
                  {importing ? (
                    <><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="text-sm font-bold text-slate-500">Restaurando...</span></>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-red-300" />
                      <span className="text-sm font-bold text-red-600">Subir archivo .JSON</span>
                      <input 
                        type="file" accept=".json" className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          if (!window.confirm(`¿ESTÁS SEGURO?\n\nVas a restaurar el sistema usando el archivo:\n"${file.name}"\n\nEsta acción modificará la base de datos actual.`)) {
                            e.target.value = ''; 
                            return;
                          }

                          setImporting(true);
                          try {
                            const text = await file.text();
                            const data = JSON.parse(text);
                            
                            if (!data.meta || !data.meta.app || data.meta.app !== 'TopSafe Production') {
                              throw new Error("El archivo no es un backup válido de TopSafe.");
                            }

                            const success = await restoreSystemFromBackup(data);

                            if (success) {
                              alert("¡Sistema restaurado con éxito! Se recargará la página.");
                              window.location.reload();
                            } else {
                              throw new Error("Falló la escritura en base de datos.");
                            }

                          } catch (err: any) {
                            console.error(err);
                            alert(`Error al restaurar: ${err.message}`);
                            setImporting(false);
                          }
                          e.target.value = ''; 
                        }}
                      />
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* SECCIÓN NUEVA: RECÁLCULO DE PUNTOS */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-600"/> Mantenimiento: Recálculo de Puntos
            </h3>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
              <p className="text-sm text-slate-500 mb-4">
                Utilice esta función si modificó valores en la Matriz de Puntos y desea que esos cambios 
                <span className="font-bold text-blue-600"> se apliquen retroactivamente </span> 
                a todo el historial de producción ya cargado.
              </p>
              
              <button 
                onClick={async () => {
                  if(window.confirm("¿Recalcular TODO el historial basándose en la Matriz actual?")) {
                    setLoading(true);
                    try {
                      const count = await recalculateAllHistory();
                      alert(`✅ Proceso terminado.\n\nSe actualizaron ${count} registros con los nuevos valores.`);
                      await loadData(); // Recargamos para ver cambios
                    } catch (e) {
                      alert("Error al recalcular.");
                    } finally {
                      setLoading(false);
                    }
                  }
                }} 
                disabled={loading}
                className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5"/> : <RefreshCw className="w-5 h-5"/>} 
                {loading ? 'Calculando...' : 'RECALCULAR HISTORIAL COMPLETO'}
              </button>
            </div>
          </div>
          
          <hr className="border-slate-200" />

          {/* SECCIÓN 2: CARGA MASIVA */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><FileJson className="w-6 h-6 text-indigo-600"/> Gestión Diaria: Importar Catálogo</h3>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
              <p className="text-sm text-slate-500 mb-4">
                Use esta herramienta para agregar nuevos modelos o reglas de precios de forma masiva copiando y pegando un texto JSON. 
                <span className="font-bold text-indigo-600"> Esto NO borra datos, solo agrega los nuevos.</span>
              </p>
              <textarea
                className="w-full h-40 border border-slate-300 p-4 rounded-lg font-mono text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder='[ {"sector": "Corte", "model": "10404", "operation": "Corte", "pointsPerUnit": 72.12}, ... ]'
                value={jsonImport}
                onChange={(e) => setJsonImport(e.target.value)}
              />
              <button 
                onClick={handleBulkImport} 
                disabled={importing || !jsonImport}
                className="mt-4 bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 w-full flex justify-center items-center gap-2"
              >
                {importing ? <Loader2 className="animate-spin w-5 h-5"/> : <Database className="w-5 h-5"/>} 
                {importing ? 'Procesando...' : 'AGREGAR AL CATÁLOGO'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
