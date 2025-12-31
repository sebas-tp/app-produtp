import { ProductionLog } from '../types';

export const analyzeProductionData = async (
  logs: ProductionLog[], 
  allLogs: ProductionLog[], 
  operators: string[], 
  selectedOperator: string,
  dailyTarget: number // <--- Recibimos la meta para calcular %
): Promise<string> => {
  
  // Simulación de "pensando"
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (logs.length === 0) return "No hay datos suficientes para analizar.";

  // --- 1. PREPARACIÓN DE DATOS MATEMÁTICOS ---

  // Obtener días únicos trabajados en el periodo filtrado
  const uniqueDays = new Set(logs.map(l => l.timestamp.split('T')[0])).size || 1;
  
  // Calcular métricas del operario/selección actual
  const totalPoints = logs.reduce((sum, log) => sum + log.totalPoints, 0);
  const totalQty = logs.reduce((sum, log) => sum + log.quantity, 0);
  const avgDailyPoints = totalPoints / uniqueDays;
  const efficiency = (avgDailyPoints / dailyTarget) * 100;

  // Calcular métricas GLOBALES (Promedio de la planta para comparar)
  // Filtramos logs dentro del mismo rango de fechas pero de TODOS los operarios
  const datesInFilter = new Set(logs.map(l => l.timestamp.split('T')[0]));
  const globalLogsInPeriod = allLogs.filter(l => datesInFilter.has(l.timestamp.split('T')[0]));
  const globalTotalPoints = globalLogsInPeriod.reduce((sum, l) => sum + l.totalPoints, 0);
  // Un "Día-Operario" es cada vez que un operario trabajó un día
  const operatorDaysCount = new Set(globalLogsInPeriod.map(l => `${l.operatorName}-${l.timestamp.split('T')[0]}`)).size || 1;
  const plantAverageDaily = globalTotalPoints / operatorDaysCount;

  // Agrupación por Operario (Para Ranking)
  const opStats: Record<string, number> = {};
  globalLogsInPeriod.forEach(l => {
    opStats[l.operatorName] = (opStats[l.operatorName] || 0) + l.totalPoints;
  });
  // Normalizamos por días trabajados de cada uno para ser justos
  const opAverageDaily: Record<string, number> = {};
  Object.keys(opStats).forEach(opName => {
    const daysWorked = new Set(globalLogsInPeriod.filter(l => l.operatorName === opName).map(l => l.timestamp.split('T')[0])).size || 1;
    opAverageDaily[opName] = opStats[opName] / daysWorked;
  });

  // Ordenar operarios por rendimiento promedio diario
  const sortedOps = Object.entries(opAverageDaily).sort((a, b) => b[1] - a[1]);
  const topPerformer = sortedOps[0];
  const bottomPerformer = sortedOps[sortedOps.length - 1];

  // Agrupación por Sector (Para detectar cuellos de botella)
  const sectorStats: Record<string, number> = {};
  logs.forEach(l => { sectorStats[l.sector] = (sectorStats[l.sector] || 0) + l.totalPoints; });
  const sortedSectors = Object.entries(sectorStats).sort((a, b) => a[1] - b[1]); // Menor a mayor
  const weakSector = sortedSectors.length > 0 ? sortedSectors[0][0] : "N/A";
  const strongSector = sortedSectors.length > 0 ? sortedSectors[sortedSectors.length - 1][0] : "N/A";


  // --- 2. GENERACIÓN DEL INFORME INTELIGENTE ---
  let report = `### 🧠 Informe de Inteligencia Operativa\n\n`;

  // === A. ANÁLISIS GLOBAL (Si seleccionó "Todos") ===
  if (selectedOperator === 'all') {
    report += `**Visión General de Planta:**\n`;
    report += `La eficiencia promedio de la planta es del **${((plantAverageDaily / dailyTarget) * 100).toFixed(1)}%** respecto a la meta de ${dailyTarget.toLocaleString()} pts.\n\n`;
    
    report += `**⚖️ Dispersión de Rendimiento:**\n`;
    report += `Existe una brecha notable entre el mejor y el menor rendimiento:\n`;
    report += `• 🥇 **Líder:** ${topPerformer[0]} con un promedio de ${topPerformer[1].toFixed(0)} pts/día.\n`;
    report += `• 📉 **Atención:** ${bottomPerformer[0]} con un promedio de ${bottomPerformer[1].toFixed(0)} pts/día.\n\n`;

    report += `**🚩 Detección de Cuellos de Botella:**\n`;
    report += `El sector **${weakSector}** presenta el menor volumen de puntos acumulados. Se sugiere auditar si faltan operarios en esta estación o si los tiempos asignados en la Matriz de Puntos son correctos.\n`;
  
  } 
  // === B. ANÁLISIS INDIVIDUAL (Si seleccionó a Juan, Benjamin, etc.) ===
  else {
    const diffVsAverage = ((avgDailyPoints - plantAverageDaily) / plantAverageDaily) * 100;
    const diffSign = diffVsAverage > 0 ? "+" : "";

    report += `**Diagnóstico Individual: ${selectedOperator.toUpperCase()}**\n`;
    report += `Rendimiento Promedio: **${avgDailyPoints.toFixed(0)} pts/día** (${efficiency.toFixed(1)}% de la Meta).\n`;
    report += `Comparativa con Planta: **${diffSign}${diffVsAverage.toFixed(1)}%** vs el promedio del equipo.\n\n`;

    // --- LÓGICA CONDICIONAL FUERTE (Aquí cambia el mensaje según el %) ---
    
    // CASO 1: SUPER ESTRELLA (> 100%)
    if (efficiency >= 100) {
      report += `**🌟 Estado: EXCELENTE (High Performer)**\n`;
      report += `Este operario supera consistentemente la meta diaria. Es un motor clave para la producción.\n`;
      report += `**Recomendaciones:**\n`;
      report += `1. **Retención de Talento:** Considere un bono de productividad o reconocimiento público.\n`;
      report += `2. **Rol de Mentor:** ${selectedOperator} tiene potencial para capacitar a operarios nuevos, especialmente en el sector de ${strongSector}.\n`;
      report += `3. **Revisión de Calidad:** Solo verifique que la alta velocidad no esté comprometiendo la calidad en ${strongSector}.\n`;
    }
    // CASO 2: RENDIMIENTO NORMAL (80% - 99%)
    else if (efficiency >= 80) {
      report += `**✅ Estado: ESTÁNDAR (Solid Performer)**\n`;
      report += `El operario mantiene un ritmo constante y aceptable, aunque hay margen para alcanzar la meta óptima.\n`;
      report += `**Recomendaciones:**\n`;
      report += `1. **Ajuste Fino:** El sector ${weakSector} es su punto más bajo. Una breve capacitación técnica podría cerrar la brecha del 20% restante.\n`;
      report += `2. **Feedback Positivo:** Reconozca su consistencia para mantener la moral alta.\n`;
    }
    // CASO 3: BAJO RENDIMIENTO (< 60% - 79%)
    else {
      report += `**⚠️ Estado: CRÍTICO (Low Performer)**\n`;
      report += `El rendimiento está significativamente por debajo de la meta y del promedio de la planta. Esto requiere intervención inmediata.\n`;
      report += `**Posibles Causas y Acciones:**\n`;
      report += `1. **Curva de Aprendizaje:** Si es nuevo, ¿está recibiendo el soporte adecuado?\n`;
      report += `2. **Problema Técnico:** Verifique si las máquinas en ${weakSector} (donde menos produce) tienen fallas frecuentes que él no esté reportando.\n`;
      report += `3. **Supervisión Directa:** Se recomienda un acompañamiento durante 2 jornadas completas para identificar "tiempos muertos".\n`;
      report += `4. **Revisión de Datos:** Verifique si está olvidando cargar planillas al final del día (compare con stock físico).\n`;
    }
  }

  return report;
};
