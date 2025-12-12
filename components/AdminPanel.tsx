import React, { useState, useEffect } from 'react';
import { 
  getOperators, saveOperators, 
  getModels, saveModels, 
  getOperations, saveOperations, 
  getPointsMatrix, addPointRule, deletePointRule,
  updatePointRule // <--- IMPORTANTE: Asegúrate de tener esto en dataService
} from '../services/dataService';
import { Sector, PointRule } from '../types';
import { Trash2, Plus, Users, Box, Layers, Calculator, AlertTriangle, Loader2, Pencil, RefreshCw, X } from 'lucide-react';

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
          type="text" 
          value={newItem} 
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Nuevo ${title.slice(0, -1)}...`}
          className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 placeholder-slate-400"
        />
        <button 
          onClick={handleAdd}
          type="button" 
          disabled={!newItem}
          className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {data.map((item) => (
          <div key={item} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded text-sm group">
            <span className="text-slate-700 font-medium">{item}</span>
            <button 
              onClick={() => handleDelete(item)} 
              type="button"
              className="text-slate-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition-colors"
              title="Eliminar"
            >
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
  const [activeTab, setActiveTab] = useState<'lists' | 'matrix'>('lists');
  const [loading, setLoading] = useState(true);
  
  // Lists Data
  const [operators, setOperators] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  
  // Matrix Data
  const [matrix, setMatrix] = useState<PointRule[]>([]);
  
  // Matrix Form State
  const [editingId, setEditingId] = useState<string | null>(null); // Estado para saber si editamos
  const [newRule, setNewRule] = useState<Partial<PointRule>>({
    sector: Sector.CORTE,
    model: '',
    operation: '',
    pointsPerUnit: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ops, mods, opers, mtx] = await Promise.all([
        getOperators(),
        getModels(),
        getOperations(),
        getPointsMatrix()
      ]);
      setOperators(ops);
      setModels(mods);
      setOperations(opers);
      setMatrix(mtx);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Wrapper functions to ensure state updates trigger re-renders correctly
  const handleSaveOperators = async (newList: string[]) => {
    await saveOperators(newList);
    setOperators(newList);
  };

  const handleSaveModels = async (newList: string[]) => {
    await saveModels(newList);
    setModels(newList);
  };

  const handleSaveOperations = async (newList: string[]) => {
    await saveOperations(newList);
    setOperations(newList);
  };

  // --- LÓGICA DE EDICIÓN ---
  const handleEditClick = (rule: PointRule) => {
    setEditingId(rule.id!); // Guardamos el ID que se edita
    setNewRule({
      sector: rule.sector,
      model: rule.model,
      operation: rule.operation,
      pointsPerUnit: rule.pointsPerUnit
    });
    // Hacemos scroll suave hacia arriba
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewRule({ sector: Sector.CORTE, model: '', operation: '', pointsPerUnit: 0 });
  };
  // -------------------------

  const handleSaveRule = async () => {
    if (!newRule.model || !newRule.operation || !newRule.pointsPerUnit) {
      alert("Complete todos los campos de la regla");
      return;
    }

    const ruleData = {
      sector: newRule.sector as Sector,
      model: newRule.model,
      operation: newRule.operation,
      pointsPerUnit: Number(newRule.pointsPerUnit)
    };

    // Validación de Duplicados (Ignoramos el ID actual si estamos editando)
    const exists = matrix.some(r => 
      r.id !== editingId && // Si editamos, ignoramos nuestra propia regla vieja
      r.sector === ruleData.sector && 
      r.model === ruleData.model && 
      r.operation === ruleData.operation
    );

    if (exists) {
      alert("Ya existe una regla para esta combinación.");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        // ACTUALIZAR
        await updatePointRule({ id: editingId, ...ruleData });
      } else {
        // AGREGAR NUEVO
        await addPointRule(ruleData as PointRule);
      }
      
      await loadData();
      // Resetear Formulario
      setEditingId(null);
      setNewRule(prev => ({ ...prev, pointsPerUnit: 0 }));
    } catch (e) {
      console.error(e);
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (id?: string) => {
    if (!id) return;
    if (window.confirm("¿Eliminar esta regla de puntuación?")) {
      setLoading(true);
      await deletePointRule(id);
      await loadData();
    }
  };

  if (loading && matrix.length === 0) {
      return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-8 h-8 text-orange-600"/></div>
  }

  // Estilos dinámicos para modo edición
  const borderColor = editingId ? 'border-blue-500' : 'border-orange-100';
  const buttonColor = editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700';

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-slate-800 text-white p-6 rounded-xl shadow-md border-l-4 border-orange-600">
        <h2 className="text-2xl font-bold mb-2">Configuración TopSafe</h2>
        <p className="text-slate-300 text-sm">Administre los catálogos y la lógica de negocio.</p>
        
        <div className="flex gap-4 mt-6">
          <button 
            onClick={() => setActiveTab('lists')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'lists' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Catálogos (Listas)
          </button>
          <button 
             onClick={() => setActiveTab('matrix')}
             className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'matrix' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Matriz de Puntos
          </button>
        </div>
      </div>

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ListManager 
            title="Operarios" 
            data={operators} 
            onSave={handleSaveOperators} 
            icon={Users} 
          />
          <ListManager 
            title="Modelos" 
            data={models} 
            onSave={handleSaveModels} 
            icon={Box} 
          />
          <ListManager 
            title="Operaciones" 
            data={operations} 
            onSave={handleSaveOperations} 
            icon={Layers} 
          />
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* Add / Edit Rule Form */}
          <div className={`bg-white p-6 rounded-xl shadow-sm border ${borderColor} transition-colors`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {editingId ? <RefreshCw className="w-5 h-5 text-blue-600" /> : <Calculator className="w-5 h-5 text-orange-600" />}
                {editingId ? 'Editando Regla' : 'Nueva Regla de Cálculo'}
              </h3>
              {editingId && (
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                  MODO EDICIÓN
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Sector</label>
                <select 
                  className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500"
                  value={newRule.sector}
                  onChange={e => setNewRule({...newRule, sector: e.target.value as Sector})}
                >
                  {Object.values(Sector).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label>
                <select 
                  className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500"
                  value={newRule.model}
                  onChange={e => setNewRule({...newRule, model: e.target.value})}
                >
                  <option value="">Seleccionar...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Operación</label>
                <select 
                  className="w-full border border-slate-300 p-2 rounded bg-slate-50 text-slate-900 outline-none focus:border-blue-500"
                  value={newRule.operation}
                  onChange={e => setNewRule({...newRule, operation: e.target.value})}
                >
                   <option value="">Seleccionar...</option>
                  {operations.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Puntos (Unitario)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="w-full border border-slate-300 p-2 rounded font-bold text-slate-800 bg-white outline-none focus:border-blue-500"
                  value={newRule.pointsPerUnit}
                  onChange={e => setNewRule({...newRule, pointsPerUnit: parseFloat(e.target.value)})}
                />
              </div>
              
              <div className="flex gap-2">
                {editingId && (
                  <button 
                    onClick={handleCancelEdit}
                    type="button"
                    className="bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded hover:bg-slate-300"
                    title="Cancelar Edición"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={handleSaveRule}
                  disabled={loading}
                  type="button"
                  className={`${buttonColor} text-white font-bold py-2 px-4 rounded flex-1 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}
                >
                  {loading ? <Loader2 className="animate-spin w-4 h-4"/> : (editingId ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />)} 
                  {editingId ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border-t-2 border-orange-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                <tr>
                  <th className="px-6 py-3">Sector</th>
                  <th className="px-6 py-3">Modelo</th>
                  <th className="px-6 py-3">Operación</th>
                  <th className="px-6 py-3 text-right">Pts/Unidad</th>
                  <th className="px-6 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrix.map((rule) => (
                  <tr key={rule.id} className={`hover:bg-slate-50 ${editingId === rule.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-3 text-slate-700">{rule.sector}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{rule.model}</td>
                    <td className="px-6 py-3 text-slate-600">{rule.operation}</td>
                    <td className="px-6 py-3 text-right font-bold text-orange-600">{rule.pointsPerUnit}</td>
                    <td className="px-6 py-3 text-center flex justify-center gap-2">
                      <button 
                        onClick={() => handleEditClick(rule)}
                        type="button"
                        className="text-slate-400 hover:text-blue-600 p-1 transition-colors"
                        title="Editar Puntos"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        type="button"
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                 {matrix.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 flex flex-col items-center gap-2">
                      <AlertTriangle className="w-8 h-8 text-yellow-400" />
                      <span>No hay reglas definidas. El sistema no calculará puntos.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
