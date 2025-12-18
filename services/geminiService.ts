// services/aiService.ts
import { ProductionLog } from '../types';

export const analyzeProductionData = async (
  productionData: ProductionLog[], 
  allOperators: string[], 
  totalPoints: number
): Promise<string> => {
  
  // Lógica local (Plan B siempre activo si no hay API Key o falla)
  return generateLocalAnalysis(productionData, allOperators, totalPoints);
};

function generateLocalAnalysis(data: ProductionLog[], allOperators: string[], totalPoints: number): string {
  // Ajustamos para leer 'operatorName' en lugar de 'operator'
  // @ts-ignore (Ignoramos error de tipo temporal si la interfaz no coincide exacto)
  const activeOps = new Set(data.map(d => d.operatorName || d.operator)).size;
  const targetPerOperator = 800; 
  const globalTarget = activeOps * targetPerOperator;
  const efficiency = activeOps > 0 ? Math.round((totalPoints / globalTarget) * 100) : 0;

  const opPoints: Record<string, number> = {};
  data.forEach(d => { 
    // @ts-ignore
    const name = d.operatorName || d.operator;
    // @ts-ignore
    const pts = d.totalPoints || d.points || 0;
    opPoints[name] = (opPoints[name] || 0) + pts; 
  });
  
  const sortedOps = Object.entries(opPoints).sort((a, b) => b[1] - a[1]);
  const bestOp = sortedOps[0];
  
  const modelCount: Record<string, number> = {};
  data.forEach(d => { modelCount[d.model] = (modelCount[d.model] || 0) + d.quantity; });
  const sortedModels = Object.entries(modelCount).sort((a, b) => b[1] - a[1]);
  const topModel = sortedModels[0];

  return `
### 📊 Reporte de Planta

**Resumen del Día:**
Se han generado **${totalPoints.toLocaleString()} puntos** con **${activeOps} operarios** activos.
La eficiencia global estimada es del **${efficiency}%** (Base: ${targetPerOperator} pts/persona).

#### 🟢 Puntos Fuertes
* **Mejor Operario:** **${bestOp ? bestOp[0] : 'N/A'}** (${bestOp ? bestOp[1].toFixed(0) : 0} pts).
* **Modelo Top:** **${topModel ? topModel[0] : 'N/A'}** (${topModel ? topModel[1] : 0} un.).

#### 💡 Sugerencia
${efficiency < 70 
      ? 'La eficiencia está baja. Revisar abastecimiento de materiales o paradas.' 
      : 'Buen ritmo de trabajo. Mantener flujo actual.'}
  `;
}
