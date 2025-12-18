import { ProductionLog } from '../types';

export const analyzeProductionData = async (
  productionData: ProductionLog[], 
  allOperators: string[], 
  totalPoints: number
): Promise<string> => {
  // Simulamos un pequeño tiempo de "pensamiento" para dar feedback visual
  await new Promise(resolve => setTimeout(resolve, 1500));
  return generateAdvancedLocalAnalysis(productionData, allOperators, totalPoints);
};

function generateAdvancedLocalAnalysis(data: ProductionLog[], allOperators: string[], totalPoints: number): string {
  // 1. CÁLCULOS AVANZADOS
  const activeOps = new Set(data.map(d => getOpName(d))).size;
  const targetPerOperator = 800; // Meta estándar
  const globalTarget = activeOps * targetPerOperator;
  const efficiency = activeOps > 0 ? ((totalPoints / globalTarget) * 100) : 0;
  
  // Análisis por Operario
  const opPoints: Record<string, number> = {};
  data.forEach(d => { 
    const name = getOpName(d);
    const pts = getPoints(d);
    opPoints[name] = (opPoints[name] || 0) + pts; 
  });
  
  const sortedOps = Object.entries(opPoints).sort((a, b) => b[1] - a[1]);
  const bestOp = sortedOps[0];
  const lowPerformanceOps = sortedOps.filter(([_, pts]) => pts < (targetPerOperator * 0.5)); // Menos del 50% de la meta

  // Análisis por Sector
  const sectorPoints: Record<string, number> = {};
  data.forEach(d => { sectorPoints[d.sector] = (sectorPoints[d.sector] || 0) + getPoints(d); });
  const bestSector = Object.entries(sectorPoints).sort((a, b) => b[1] - a[1])[0];

  // Análisis de Modelos
  const modelCount: Record<string, number> = {};
  data.forEach(d => { modelCount[d.model] = (modelCount[d.model] || 0) + d.quantity; });
  const topModel = Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0];

  // 2. GENERACIÓN DEL REPORTE PROFESIONAL
  let report = `### 🏭 Informe Técnico de Producción\n\n`;
  
  // Sección Resumen
  report += `**RESUMEN EJECUTIVO**\n`;
  report += `El rendimiento actual de la planta es del **${efficiency.toFixed(1)}%** respecto a la capacidad instalada activa. `;
  report += `Se han procesado **${data.length} lotes** generando un total de **${totalPoints.toLocaleString()} puntos**.\n\n`;

  // Sección Detalles
  report += `**🔍 DETALLE OPERATIVO**\n`;
  report += `* **Cuellos de Botella:** ${lowPerformanceOps.length > 0 ? `Se detectaron ${lowPerformanceOps.length} operarios por debajo del umbral crítico de eficiencia (50%).` : 'No se detectan cuellos de botella individuales críticos.'}\n`;
  report += `* **Carga por Sector:** El sector con mayor volumen de trabajo hoy es **${bestSector ? bestSector[0] : 'N/A'}** (${bestSector ? bestSector[1].toFixed(0) : 0} pts), lo que indica dónde se concentra el flujo productivo.\n`;
  report += `* **Producto Estrella:** El modelo **${topModel ? topModel[0] : 'N/A'}** representa la mayor parte del volumen físico (${topModel ? topModel[1] : 0} unidades).\n\n`;

  // Sección Recomendaciones (Lógica condicional)
  report += `**💡 PLAN DE ACCIÓN RECOMENDADO**\n`;
  if (efficiency < 60) {
    report += `1.  🔴 **Alerta de Eficiencia:** La planta opera al ${efficiency.toFixed(0)}%. Se recomienda auditar inmediatamente disponibilidad de materia prima en el sector de Corte.\n`;
    report += `2.  Revisar si los ${lowPerformanceOps.length} operarios de bajo rendimiento tienen incidencias técnicas con sus máquinas.\n`;
  } else if (efficiency < 85) {
    report += `1.  🟡 **Optimización:** El ritmo es estable pero mejorable. Evaluar balanceo de línea para apoyar al sector de ${bestSector ? bestSector[0] : 'producción'}.\n`;
    report += `2.  Incentivar al personal para alcanzar el objetivo diario antes del cierre de turno.\n`;
  } else {
    report += `1.  🟢 **Alto Rendimiento:** La planta opera a ritmo óptimo. Se sugiere preparar logística de expedición para evitar acumulación de stock terminado.\n`;
  }

  return report;
}

// Helpers para evitar errores de tipo si los nombres varían
function getOpName(d: any): string { return d.operatorName || d.operator || 'Desconocido'; }
function getPoints(d: any): number { return Number(d.totalPoints || d.points || 0); }
