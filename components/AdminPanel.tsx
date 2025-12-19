import React, { useState, useEffect } from 'react';
import { 
  getOperators, saveOperators, 
  getModels, saveModels, 
  getOperations, saveOperations, 
  getPointsMatrix, addPointRule, deletePointRule, updatePointRule,
  addNews, deleteNews, getActiveNews, NewsItem,
  deleteOperatorWithData 
} from '../services/dataService';
import { Sector, PointRule } from '../types';
import { Trash2, Plus, Users, Box, Layers, Calculator, AlertTriangle, Loader2, Pencil, RefreshCw, X, Megaphone, Clock, Upload, Database, Check, AlertCircle, FileSearch } from 'lucide-react';

// --- COMPONENTE GESTOR DE LISTAS (Igual que antes) ---
interface ListManagerProps {
  title: string;
  data: string[];
  onSave: (d: string[]) => Promise<void>;
  icon: any;
  customDelete?: (item: string) => Promise<void>;
}

const ListManager = ({ title, data, onSave, icon: Icon, customDelete }: ListManagerProps) => {
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async () => {
    if (newItem.trim() && !data.includes(newItem)) {
      setSaving(true);
      await onSave([...data, newItem]);
      setNewItem('');
      setSaving(false);
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

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full relative">
      {saving && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"><Loader2 className="animate-spin text-orange-600"/></div>}
      <div className="flex items-center gap-2 mb-4 text-slate-800"><Icon className="w-5 h-5 text-orange-600" /><h3 className="font-bold">{title}</h3></div>
      <div className="flex gap-2 mb-4">
        <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={`Nuevo...`} className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm outline-none text-slate-900" />
        <button onClick={handleAdd} disabled={!newItem} className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"><Plus className="w-5 h-5" /></button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
        {data.map((item) => (
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
                  <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(item)} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {data.length === 0 && <p className="text-slate-400 text-xs italic text-center py-4">Lista vacía</p>}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lists' | 'matrix' | 'news' | 'import'>('lists');
  const [loading, setLoading] = useState(true);
  
  const [operators, setOperators] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<Partial<PointRule>>({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 });

  const [activeNews, setActiveNews] = useState<NewsItem[]>([]);
  const [newsForm, setNewsForm] = useState({ title: '', content: '', duration: '24' });

  const [jsonImport, setJsonImport] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ops, mods, opers, mtx, news] = await Promise.all([
        getOperators(), getModels(), getOperations(), getPointsMatrix(), getActiveNews()
      ]);
      setOperators(ops); setModels(mods); setOperations(opers); setMatrix(mtx); setActiveNews(news);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSaveOperators = async (newList: string[]) => { await saveOperators(newList); setOperators(newList); };
  const handleSaveModels = async (newList: string[]) => { await saveModels(newList); setModels(newList); };
  const handleSaveOperations = async (newList: string[]) => { await saveOperations(newList); setOperations(newList); };

  const handleSpecialDeleteOperator = async (name: string) => {
    if (window.confirm(`⚠️ ALERTA DE SEGURIDAD ⚠️\n\n¿Eliminar a "${name}" y TODO su historial?`)) {
      setLoading(true);
      await deleteOperatorWithData(name);
      setOperators(prev => prev.filter(op => op !== name));
      setLoading(false);
    }
  };

  // --- LÓGICA DE AUDITORÍA ---
  // Calculamos qué modelos no tienen reglas y qué reglas valen 0
  const auditData = React.useMemo(() => {
    const modelsWithoutRules = models.filter(m => !matrix.some(r => r.model === m));
    const rulesWithZeroPoints = matrix.filter(r => r.pointsPerUnit === 0);
    return { modelsWithoutRules, rulesWithZeroPoints };
  }, [models, matrix]);

  const handleEditClick = (rule: PointRule) => {
    setEditingId(rule.id!); 
    setNewRule({ sector: rule.sector, model: rule.model, operation: rule.operation, pointsPerUnit: rule.pointsPerUnit });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleCancelEdit = () => { setEditingId(null); setNewRule({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 }); };

  const handleSaveRule = async () => {
    if (!newRule.model || !newRule.operation) { alert("Complete todos los campos"); return; }
    const ruleData = { sector: newRule.sector as Sector, model: newRule.model, operation: newRule.operation, pointsPerUnit: Number(newRule.pointsPerUnit || 0) };
    const exists = matrix.some(r => r.id !== editingId && r.sector === ruleData.sector && r.model === ruleData.model && r.operation === ruleData.operation);
    if (exists) { alert("Ya existe esta regla."); return; }

    setLoading(true);
    try {
      if (editingId) await updatePointRule({ id: editingId, ...ruleData });
      else await addPointRule(ruleData as PointRule);
      await loadData();
      setEditingId(null); setNewRule(prev => ({ ...prev, pointsPerUnit: 0 }));
    } catch (e) { alert("Error al guardar"); } finally { setLoading(false); }
  };

  const handleDeleteRule = async (id?: string) => {
    if (id && window.confirm("¿Eliminar regla?")) { setLoading(true); await deletePointRule(id); await loadData(); }
  };

  const handleAddNews = async () => {
    if (!newsForm.title || !newsForm.content) { alert("Complete título y mensaje"); return; }
    setLoading(true);
    const now = new Date();
    const expires = new Date(now);
    expires.setHours(expires.getHours() + parseInt(newsForm.duration));
    const newItem: NewsItem = { id: crypto.randomUUID(), title: newsForm.title, content: newsForm.content, createdAt: now.toISOString(), expiresAt: expires.toISOString(), priority: 'normal' };
    await addNews(newItem);
    setNewsForm({ title: '', content: '', duration: '24' });
    await loadData(); setLoading(false);
  };

  const handleDeleteNews = async (id: string) => {
    if (window.confirm("¿Borrar comunicado?")) { setLoading(true); await deleteNews(id); await loadData(); setLoading(false); }
  };

  const handleBulkImport = async () => {
    if (!jsonImport || !window.confirm("¿Importar datos?")) return;
    setImporting(true);
    try {
      const data = JSON.parse(jsonImport);
      if (!Array.isArray(data)) throw new Error("Formato inválido");
      let added = 0;
      for (const item of data) {
        if (item.sector && item.model && item.operation) {
          const exists = matrix.some(r => r.sector === item.sector && r.model === item.model.toString() && r.operation === item.operation);
          if (!exists) {
            await addPointRule({ ...item, model: item.model.toString(), pointsPerUnit: Number(item.pointsPerUnit) });
            added++;
          }
        }
      }
      await loadData(); alert(`Importados: ${added}`); setJsonImport('');
    } catch (e) { alert("Error en JSON"); } finally { setImporting(false); }
  };

  if (loading && matrix.length === 0) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-slate-800 text-white p-6 rounded-xl shadow-md border-l-4 border-orange-600">
        <h2 className="text-2xl font-bold mb-2">Configuración TopSafe</h2>
        <div className="flex flex-wrap gap-4 mt-6">
          <button onClick={() => setActiveTab('lists')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'lists' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'}`}>Catálogos</button>
          <button onClick={() => setActiveTab('matrix')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'matrix' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'}`}>Matriz de Puntos</button>
          <button onClick={() => setActiveTab('news')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'news' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'}`}>Comunicados</button>
          <button onClick={() => setActiveTab('import')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'import' ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-600'}`}>Carga Masiva</button>
        </div>
      </div>

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ListManager title="Operarios" data={operators} onSave={handleSaveOperators} icon={Users} customDelete={handleSpecialDeleteOperator} />
          <ListManager title="Modelos" data={models} onSave={handleSaveModels} icon={Box} />
          <ListManager title="Operaciones" data={operations} onSave={handleSaveOperations} icon={Layers} />
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* --- PANEL DE AUDITORÍA --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
               <div className="bg-red-100 p-2 rounded-full"><AlertTriangle className="w-5 h-5 text-red-600"/></div>
               <div>
                 <h4 className="font-bold text-red-800 text-sm">Productos sin Puntos Asignados </h4>
                 <p className="text-xs text-red-600 mb-2">Modelos en catálogo que no tienen ninguna regla en la matriz.</p>
                 <div className="text-2xl font-black text-red-700">{auditData.modelsWithoutRules.length}</div>
                 {auditData.modelsWithoutRules.length > 0 && (
                   <div className="mt-2 text-xs text-red-800 bg-red-100 p-2 rounded max-h-20 overflow-y-auto">
                     {auditData.modelsWithoutRules.join(', ')}
                   </div>
                 )}
               </div>
             </div>

             <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3">
               <div className="bg-orange-100 p-2 rounded-full"><FileSearch className="w-5 h-5 text-orange-600"/></div>
               <div>
                 <h4 className="font-bold text-orange-800 text-sm">Reglas con Valor 0</h4>
                 <p className="text-xs text-orange-600 mb-2">Operaciones configuradas pero que valen 0 puntos.</p>
                 <div className="text-2xl font-black text-orange-700">{auditData.rulesWithZeroPoints.length}</div>
                 {auditData.rulesWithZeroPoints.length > 0 && (
                   <div className="mt-2 text-xs text-orange-800 bg-orange-100 p-2 rounded max-h-20 overflow-y-auto">
                     {auditData.rulesWithZeroPoints.map(r => `${r.model} (${r.operation})`).join(', ')}
                   </div>
                 )}
               </div>
             </div>
          </div>

          <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-blue-500' : 'border-orange-100'} transition-colors`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {editingId ? <RefreshCw className="w-5 h-5 text-blue-600" /> : <Calculator className="w-5 h-5 text-orange-600" />}
                {editingId ? 'Editando Regla' : 'Nueva Regla de Cálculo'}
              </h3>
              {editingId && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">MODO EDICIÓN</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Sector</label>
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none" value={newRule.sector} onChange={e => setNewRule({...newRule, sector: e.target.value as Sector})}>
                  {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label>
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none" value={newRule.model} onChange={e => setNewRule({...newRule, model: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Operación</label>
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none" value={newRule.operation} onChange={e => setNewRule({...newRule, operation: e.target.value})}>
                   <option value="">Seleccionar...</option>
                  {operations.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Puntos (Unitario)</label>
                <input type="number" step="0.1" className="w-full border border-slate-300 p-2 rounded font-bold text-slate-800 bg-white outline-none" value={newRule.pointsPerUnit} onChange={e => setNewRule({...newRule, pointsPerUnit: parseFloat(e.target.value)})}/>
              </div>
              <div className="flex gap-2">
                {editingId && <button onClick={handleCancelEdit} className="bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded hover:bg-slate-300"><X className="w-4 h-4" /></button>}
                <button onClick={handleSaveRule} disabled={loading} className={`${editingId ? 'bg-blue-600' : 'bg-orange-600'} text-white font-bold py-2 px-4 rounded flex-1 flex items-center justify-center gap-2 hover:opacity-90`}>
                  {editingId ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border-t-2 border-orange-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                <tr><th className="px-6 py-3">Sector</th><th className="px-6 py-3">Modelo</th><th className="px-6 py-3">Operación</th><th className="px-6 py-3 text-right">Pts/Unidad</th><th className="px-6 py-3 text-center">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrix.map((rule) => (
                  <tr key={rule.id} className={`hover:bg-slate-50 ${editingId === rule.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-3">{rule.sector}</td><td className="px-6 py-3 font-medium">{rule.model}</td><td className="px-6 py-3">{rule.operation}</td><td className="px-6 py-3 text-right font-bold text-orange-600">{rule.pointsPerUnit}</td>
                    <td className="px-6 py-3 text-center flex justify-center gap-2">
                      <button onClick={() => handleEditClick(rule)} className="text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'news' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

      {activeTab === 'import' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-600"/> Importar JSON</h3>
          <textarea className="w-full h-64 border p-4 rounded-lg font-mono text-xs bg-slate-50" value={jsonImport} onChange={(e) => setJsonImport(e.target.value)} />
          <button onClick={handleBulkImport} disabled={importing || !jsonImport} className="mt-4 bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 w-full">{importing ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : 'IMPORTAR'}</button>
        </div>
      )}
    </div>
  );
};
