import { ProductionLog } from '../types';

export const analyzeProductionData = async (
  currentData: ProductionLog[],      
  allData: ProductionLog[],          
  operatorList: string[],            
  selectedOperator: string           
): Promise<string> => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return generateSmartReport(currentData, allData, selectedOperator);
};

function generateSmartReport(currentData: ProductionLog[], allData: ProductionLog[], selectedOp: string): string {
  
  // DATOS DEL FILTRO ACTUAL
  const filteredPoints = currentData.reduce((sum, d) => sum + (Number((d as any).totalPoints || (d as any).points || 0)), 0);
  
  // Contamos Órdenes Únicas
  const uniqueOrders = new Set(currentData.map(d => d.orderNumber).filter(o => o && o.length > 2)).size;

  // CÁLCULOS GLOBALES (Contexto)
  const globalPoints = allData.reduce((sum, d) => sum + (Number((d as any).totalPoints || (d as any).points || 0)), 0);
  const globalOpStats: Record<string, number> = {};
  allData.forEach(d => {
    // @ts-ignore
    const name = d.operator || d.operatorName || 'N/A';
    // @ts-ignore
    const pts = Number(d.totalPoints || d.points || 0);
    globalOpStats[name] = (globalOpStats[name] || 0) + pts;
  });

  const activeOpsCount = Object.keys(globalOpStats).length;
  const plantAverage = activeOpsCount > 0 ? globalPoints / activeOpsCount : 0;

  // Ranking
  const ranking = Object.entries(globalOpStats)
    .sort((a, b) => b[1] - a[1])
    .map((entry, index) => ({ name: entry[0], points: entry[1], rank: index + 1 }));

  const topPerformer = ranking[0];
  
  // GENERAR REPORTE
  let report = "";

  if (selectedOp !== 'all') {
    const opData = ranking.find(r => r.name === selectedOp);
    const opPoints = opData ? opData.points : 0;
    const opRank = opData ? opData.rank : '-';
    const diffPercent = plantAverage > 0 ? ((opPoints - plantAverage) / plantAverage) * 100 : 0;
    const statusIcon = diffPercent >= 0 ? "🟢" : (diffPercent > -15 ? "🟡" : "🔴");
    
    report += `### 👤 Análisis de Desempeño: ${selectedOp}\n\n`;
    report += `**MÉTRICAS CLAVE:**\n`;
    report += `* **Puntos Totales:** ${opPoints.toLocaleString()} pts\n`;
    report += `* **Órdenes Trabajadas:** ${uniqueOrders} lotes distintos.\n`;
    report += `* **Ranking:** #${opRank} de ${activeOpsCount}.\n`;
    report += `* **Vs Promedio:** ${statusIcon} **${Math.abs(diffPercent).toFixed(1)}%** ${diffPercent >= 0 ? 'arriba' : 'abajo'}.\n\n`;

    report += `**📊 DIAGNÓSTICO:**\n`;
    if (diffPercent >= 10) report += `Rendimiento destacado. `;
    else if (diffPercent <= -20) report += `Rendimiento bajo. Verificar si hubo cambios de orden frecuentes (${uniqueOrders} lotes) que afectaron el ritmo. `;
    else report += `Rendimiento estable. `;

    if (topPerformer) report += `\n> *Líder: ${topPerformer.name} (${topPerformer.points.toFixed(0)} pts).*`;
  
  } else {
    const efficiency = activeOpsCount > 0 ? (globalPoints / (activeOpsCount * 800)) * 100 : 0;
    
    report += `### 🏭 Reporte Global de Planta\n\n`;
    report += `**RESUMEN:**\n`;
    report += `Producción: **${globalPoints.toLocaleString()} pts** | Operarios: **${activeOpsCount}**\n`;
    report += `Se han procesado **${uniqueOrders} órdenes de trabajo** diferentes en el período.\n\n`;

    report += `**🏆 PODIO:**\n`;
    ranking.slice(0, 3).forEach((r, i) => {
      report += `* ${i===0?"🥇":i===1?"🥈":"🥉"} **${r.name}:** ${r.points.toFixed(0)} pts\n`;
    });

    report += `\n**💡 ESTADO:**\n`;
    if (efficiency < 70) report += `🔴 Eficiencia Baja. `;
    else report += `🟢 Ritmo Sostenido. `;
    
    if (uniqueOrders > 10) report += `Alta rotación de lotes (${uniqueOrders}), lo cual puede impactar en los tiempos de puesta a punto.`;
  }

  return report;
}
