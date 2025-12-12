import React, { useState, useEffect } from 'react';
import { 
  getOperators, saveOperators, 
  getModels, saveModels, 
  getOperations, saveOperations, 
  getPointsMatrix, addPointRule, deletePointRule, updatePointRule,
  addNews, deleteNews, getActiveNews, NewsItem 
} from '../services/dataService';
import { Sector, PointRule } from '../types';
import { Trash2, Plus, Users, Box, Layers, Calculator, AlertTriangle, Loader2, Pencil, RefreshCw, X, Megaphone, Clock, Upload, Database } from 'lucide-react';

// --- SUB COMPONENTS FOR LIST MANAGEMENT ---
const ListManager = ({ title, data, onSave, icon: Icon }: { title: string, data: string[], onSave: (d: string[]) => void, icon: any }) => {
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (newItem.trim() && !data.includes(newItem)) {
      setSaving(true);
      await onSave([...data, newItem]);
      setNewItem('');
      setSaving(false);
    }
  };

  const handleDelete = async (item: string) => {
    if (window.confirm(`¿Está seguro de eliminar "${item}"?`)) {
      setSaving(true);
      const updatedList = data.filter(i => i !== item);
      await onSave(updatedList);
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full relative">
      {saving && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"><Loader2 className="animate-spin text-orange-600"/></div>}
      <div className="flex items-center gap-2 mb-4 text-slate-800">
        <Icon className="w-5 h-5 text-orange-600" />
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="flex gap-2 mb-4">
        <input 
          type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Nuevo ${title.slice(0, -1)}...`}
          className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 placeholder-slate-400"
        />
        <button onClick={handleAdd} type="button" disabled={!newItem} className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {data.map((item) => (
          <div key={item} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded text-sm group">
            <span className="text-slate-700 font-medium">{item}</span>
            <button onClick={() => handleDelete(item)} type="button" className="text-slate-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {data.length === 0 && <p className="text-slate-400 text-xs italic">Sin elementos</p>}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lists' | 'matrix' | 'news' | 'import'>('lists');
  const [loading, setLoading] = useState(true);
  
  // Lists Data
  const [operators, setOperators] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  
  // Matrix Data
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<Partial<PointRule>>({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 });

  // News Data
  const [activeNews, setActiveNews] = useState<NewsItem[]>([]);
  const [newsForm, setNewsForm] = useState({ title: '', content: '', duration: '24' });

  // Bulk Import State
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

  // ... Funciones de Listas ...
  const handleSaveOperators = async (newList: string[]) => { await saveOperators(newList); setOperators(newList); };
  const handleSaveModels = async (newList: string[]) => { await saveModels(newList); setModels(newList); };
  const handleSaveOperations = async (newList: string[]) => { await saveOperations(newList); setOperations(newList); };

  // ... Funciones de Matriz ...
  const handleEditClick = (rule: PointRule) => {
    setEditingId(rule.id!); 
    setNewRule({ sector: rule.sector, model: rule.model, operation: rule.operation, pointsPerUnit: rule.pointsPerUnit });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleCancelEdit = () => { setEditingId(null); setNewRule({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 }); };

  const handleSaveRule = async () => {
    if (!newRule.model || !newRule.operation || !newRule.pointsPerUnit) { alert("Complete todos los campos"); return; }
    const ruleData = { sector: newRule.sector as Sector, model: newRule.model, operation: newRule.operation, pointsPerUnit: Number(newRule.pointsPerUnit) };
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
    if (!id) return;
    if (window.confirm("¿Eliminar regla?")) { setLoading(true); await deletePointRule(id); await loadData(); }
  };

  // ... Funciones de Noticias ...
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

  // ... Función de Carga Masiva (MEJORADA) ...
  const handleBulkImport = async () => {
    if (!jsonImport) return;
    if (!window.confirm("¿Importar datos? Esto agregará reglas nuevas y actualizará las listas de modelos y operaciones.")) return;

    setImporting(true);
    try {
      const data = JSON.parse(jsonImport);
      if (!Array.isArray(data)) { alert("El formato debe ser una lista [...]"); return; }

      let addedCount = 0;
      let skippedCount = 0;

      // 1. Procesar Reglas de Puntos
      for (const item of data) {
        if (item.sector && item.model && item.operation && item.pointsPerUnit) {
          const formattedSector = item.sector.charAt(0).toUpperCase() + item.sector.slice(1).toLowerCase();
          
          // Verificar si ya existe para no duplicar
          const exists = matrix.some(r => 
            r.sector === formattedSector && 
            r.model === item.model.toString() && 
            r.operation === item.operation
          );

          if (!exists) {
            await addPointRule({
              sector: formattedSector as Sector,
              model: item.model.toString(),
              operation: item.operation,
              pointsPerUnit: Number(item.pointsPerUnit)
            });
            addedCount++;
          } else {
            skippedCount++;
          }
        }
      }

      // 2. Actualizar Catálogos (Listas) Automáticamente
      // Extraemos modelos y operaciones únicos del JSON
      const jsonModels = data.map((i: any) => i.model.toString());
      const jsonOperations = data.map((i: any) => i.operation);

      // Combinamos con los que ya existían para no borrar nada
      const updatedModels = Array.from(new Set([...models, ...jsonModels])).sort();
      const updatedOperations = Array.from(new Set([...operations, ...jsonOperations])).sort();

      // Guardamos en Firebase
      await saveModels(updatedModels);
      await saveOperations(updatedOperations);

      alert(`Proceso finalizado:\n- Reglas agregadas: ${addedCount}\n- Reglas omitidas (ya existían): ${skippedCount}\n- Catálogos actualizados correctamente.`);
      
      setJsonImport('');
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Error al leer el JSON.");
    } finally {
      setImporting(false);
    }
  };

  if (loading && matrix.length === 0) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>;

  const borderColor = editingId ? 'border-blue-500' : 'border-orange-100';
  const buttonColor = editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700';

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-slate-800 text-white p-6 rounded-xl shadow-md border-l-4 border-orange-600">
        <h2 className="text-2xl font-bold mb-2">Configuración TopSafe</h2>
        <p className="text-slate-300 text-sm">Administre catálogos, reglas y comunicados.</p>
        <div className="flex flex-wrap gap-4 mt-6">
          <button onClick={() => setActiveTab('lists')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'lists' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Catálogos</button>
          <button onClick={() => setActiveTab('matrix')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'matrix' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Matriz de Puntos</button>
          <button onClick={() => setActiveTab('news')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'news' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Comunicados</button>
          <button onClick={() => setActiveTab('import')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'import' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Carga Masiva</button>
        </div>
      </div>

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ListManager title="Operarios" data={operators} onSave={handleSaveOperators} icon={Users} />
          <ListManager title="Modelos" data={models} onSave={handleSaveModels} icon={Box} />
          <ListManager title="Operaciones" data={operations} onSave={handleSaveOperations} icon={Layers} />
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className={`bg-white p-6 rounded-xl shadow-sm border ${borderColor} transition-colors`}>
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
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500" value={newRule.sector} onChange={e => setNewRule({...newRule, sector: e.target.value as Sector})}>
                  {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label>
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500" value={newRule.model} onChange={e => setNewRule({...newRule, model: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Operación</label>
                <select className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500" value={newRule.operation} onChange={e => setNewRule({...newRule, operation: e.target.value})}>
                   <option value="">Seleccionar...</option>
                  {operations.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Puntos (Unitario)</label>
                <input type="number" step="0.1" className="w-full border border-slate-300 p-2 rounded font-bold text-slate-800 bg-white outline-none focus:border-blue-500" value={newRule.pointsPerUnit} onChange={e => setNewRule({...newRule, pointsPerUnit: parseFloat(e.target.value)})}/>
              </div>
              <div className="flex gap-2">
                {editingId && <button onClick={handleCancelEdit} type="button" className="bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded hover:bg-slate-300" title="Cancelar Edición"><X className="w-4 h-4" /></button>}
                <button onClick={handleSaveRule} disabled={loading} type="button" className={`${buttonColor} text-white font-bold py-2 px-4 rounded flex-1 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}>
                  {loading ? <Loader2 className="animate-spin w-4 h-4"/> : (editingId ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />)} 
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
                    <td className="px-6 py-3 text-slate-700">{rule.sector}</td><td className="px-6 py-3 font-medium text-slate-800">{rule.model}</td><td className="px-6 py-3 text-slate-600">{rule.operation}</td><td className="px-6 py-3 text-right font-bold text-orange-600">{rule.pointsPerUnit}</td>
                    <td className="px-6 py-3 text-center flex justify-center gap-2">
                      <button onClick={() => handleEditClick(rule)} type="button" className="text-slate-400 hover:text-blue-600 p-1 transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteRule(rule.id)} type="button" className="text-slate-400 hover:text-red-600 p-1 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                 {matrix.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 flex flex-col items-center gap-2"><AlertTriangle className="w-8 h-8 text-yellow-400" /><span>No hay reglas definidas.</span></td></tr>}
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
               <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Título</label><input className="w-full border border-slate-300 p-2 rounded bg-slate-50 focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ej: Mantenimiento Preventivo" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})}/></div>
               <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Mensaje</label><textarea className="w-full border border-slate-300 p-2 rounded bg-slate-50 focus:ring-2 focus:ring-orange-500 outline-none h-24 resize-none" placeholder="El día viernes..." value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})}/></div>
               <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Visible Por</label><select className="w-full border border-slate-300 p-2 rounded bg-slate-50 focus:ring-2 focus:ring-orange-500 outline-none" value={newsForm.duration} onChange={e => setNewsForm({...newsForm, duration: e.target.value})}><option value="24">24 Horas</option><option value="48">48 Horas</option><option value="72">3 Días</option><option value="168">1 Semana</option></select></div>
               <button onClick={handleAddNews} disabled={loading} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700 flex justify-center items-center gap-2">{loading ? <Loader2 className="animate-spin w-5 h-5"/> : <Plus className="w-5 h-5" />} Publicar Noticia</button>
             </div>
          </div>
          <div className="space-y-4">
             <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600" /> Comunicados Vigentes</h3>
             {activeNews.length === 0 && <p className="text-slate-400 text-sm italic">No hay noticias activas.</p>}
             {activeNews.map(item => (
               <div key={item.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 relative">
                 <button onClick={() => handleDeleteNews(item.id)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                 <h4 className="font-bold text-slate-800">{item.title}</h4>
                 <p className="text-slate-600 text-sm mt-1">{item.content}</p>
                 <div className="mt-3 text-xs text-slate-400 flex gap-4"><span>Creado: {new Date(item.createdAt).toLocaleDateString()}</span><span className="text-orange-600 font-semibold">Vence: {new Date(item.expiresAt).toLocaleString()}</span></div>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* --- PESTAÑA CARGA MASIVA --- */}
      {activeTab === 'import' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600"/> Importar Matriz desde JSON
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Pega aquí el array JSON generado. Asegúrate de usar las claves: <code className="bg-slate-100 px-1">sector</code>, <code className="bg-slate-100 px-1">model</code>, <code className="bg-slate-100 px-1">operation</code>, <code className="bg-slate-100 px-1">pointsPerUnit</code>.
          </p>
          <textarea
            className="w-full h-64 border border-slate-300 p-4 rounded-lg font-mono text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder='[ {"sector": "Corte", "model": "10404", "operation": "Corte", "pointsPerUnit": 72.12}, ... ]'
            value={jsonImport}
            onChange={(e) => setJsonImport(e.target.value)}
          />
          <button 
            onClick={handleBulkImport} 
            disabled={importing || !jsonImport}
            className="mt-4 bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 disabled:opacity-50 w-full flex justify-center items-center gap-2"
          >
            {importing ? <Loader2 className="animate-spin w-5 h-5"/> : <Upload className="w-5 h-5"/>} 
            {importing ? 'Procesando...' : 'IMPORTAR DATOS Y ACTUALIZAR LISTAS'}
          </button>
        </div>
      )}
    </div>
  );
};
