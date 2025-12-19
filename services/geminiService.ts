import { ProductionLog } from '../types';

// Función para simular un análisis inteligente local (o conectar a API real)
export const analyzeProductionData = async (
  logs: ProductionLog[], 
  allLogs: ProductionLog[], 
  operators: string[], 
  selectedOperator: string
): Promise<string> => {
  
  // Simulación de retardo de red para parecer que "piensa"
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (logs.length === 0) return "No hay suficientes datos en este período para generar un análisis confiable.";

  // --- 1. CÁLCULOS MATEMÁTICOS REALES ---
  const totalPoints = logs.reduce((sum, log) => sum + log.totalPoints, 0);
  const totalQty = logs.reduce((sum, log) => sum + log.quantity, 0);
  
  // Agrupar por Sector
  const sectorPerformance: Record<string, number> = {};
  logs.forEach(log => {
    sectorPerformance[log.sector] = (sectorPerformance[log.sector] || 0) + log.totalPoints;
  });
  
  // Encontrar Sector con menor rendimiento (Cuello de botella)
  const sortedSectors = Object.entries(sectorPerformance).sort((a, b) => a[1] - b[1]);
  const lowestSector = sortedSectors.length > 0 ? sortedSectors[0][0] : 'N/A';
  const highestSector = sortedSectors.length > 0 ? sortedSectors[sortedSectors.length - 1][0] : 'N/A';

  // Agrupar por Operario
  const opPerformance: Record<string, number> = {};
  logs.forEach(log => {
    opPerformance[log.operatorName] = (opPerformance[log.operatorName] || 0) + log.totalPoints;
  });
  const topOperator = Object.entries(opPerformance).sort((a, b) => b[1] - a[1])[0];

  // Detectar Tendencia (Primeros 3 días vs Últimos 3 días)
  // (Lógica simplificada para el ejemplo)
  const isTrendUp = logs.length > 10; // Placeholder lógico

  // --- 2. GENERACIÓN DEL TEXTO "INTELIGENTE" ---
  let report = `### 🏭 Informe de Rendimiento Operativo\n\n`;

  // Resumen Ejecutivo
  report += `**Resumen General:**\n`;
  report += `En el período analizado se han procesado un total de **${totalQty.toLocaleString()} unidades**, generando **${totalPoints.toLocaleString()} puntos de valor**. `;
  
  if (selectedOperator !== 'all') {
    report += `El análisis se centra específicamente en el desempeño de **${selectedOperator}**.\n\n`;
  } else {
    report += `El análisis abarca la eficiencia global de la planta.\n\n`;
  }

  // Análisis de Sectores
  report += `**📊 Análisis de Flujo y Sectores:**\n`;
  report += `• **Punto Fuerte:** El sector de **${highestSector}** está liderando la producción, mostrando la mayor carga de trabajo completada.\n`;
  report += `• **Atención Requerida:** Se detecta menor volumen de puntos en **${lowestSector}**. Esto podría indicar un cuello de botella, falta de personal o tiempos de ciclo más lentos en esta etapa.\n\n`;

  // Análisis de Talento
  if (selectedOperator === 'all' && topOperator) {
    report += `**🏆 Desempeño del Personal:**\n`;
    report += `El operario más destacado del período es **${topOperator[0]}** con ${topOperator[1].toFixed(0)} puntos. Se recomienda analizar su técnica de trabajo para estandarizar buenas prácticas en el equipo.\n\n`;
  }

  // Recomendaciones (Lógica condicional)
  report += `**💡 Recomendaciones de Ingeniería:**\n`;
  if (lowestSector === 'Costura' || lowestSector === 'Armado') {
    report += `1. **Balanceo de Línea:** El sector de ${lowestSector} parece estar restringiendo el flujo. Considere asignar horas extra o mover un operario polivalente a esta estación.\n`;
  } else {
    report += `1. **Revisión de Estándares:** Verifique si los tiempos estándar del sector ${lowestSector} están actualizados en la Matriz de Puntos.\n`;
  }
  
  report += `2. **Control de Calidad:** Asegúrese de que el aumento de velocidad en ${highestSector} no esté generando retrabajos aguas abajo.\n`;
  
  if (selectedOperator !== 'all') {
    report += `3. **Feedback Individual:** Reúinase con ${selectedOperator} para revisar las observaciones cargadas en los días de baja productividad.\n`;
  }

  return report;
};
