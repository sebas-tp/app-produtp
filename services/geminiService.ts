import { ProductionLog } from '../types';

export const analyzeProductionData = async (
  currentData: ProductionLog[],      // Datos filtrados (lo que se ve en tabla)
  allData: ProductionLog[],          // Datos globales (para comparar/contexto)
  operatorList: string[],            // Lista de nombres
  selectedOperator: string           // Nombre del filtro ('all' o un nombre)
): Promise<string> => {
  
  // Simulamos "pensando..."
  await new Promise(resolve => setTimeout(resolve, 1500));

  return generateSmartReport(currentData, allData, selectedOperator);
};

function generateSmartReport(currentData: ProductionLog[], allData: ProductionLog[], selectedOp: string): string {
  // 1. CÁLCULOS GLOBALES (Contexto de Planta)
  const globalPoints = allData.reduce((sum, d) => sum + (d.points || 0), 0);
  
  // Agrupamos puntos por operario (Global)
  const globalOpStats: Record<string, number> = {};
  allData.forEach(d => {
    const name = d.operator || d.operatorName || 'N/A';
    const pts = Number(d.points || d.totalPoints || 0);
    globalOpStats[name] = (globalOpStats[name] || 0) + pts;
  });

  const activeOpsCount = Object.keys(globalOpStats).length;
  const plantAverage = activeOpsCount > 0 ? globalPoints / activeOpsCount : 0;

  // Ranking Global
  const ranking = Object.entries(globalOpStats)
    .sort((a, b) => b[1] - a[1]) // De mayor a menor
    .map((entry, index) => ({ name: entry[0], points: entry[1], rank: index + 1 }));

  const topPerformer = ranking[0];
  
  // 2. GENERACIÓN DEL REPORTE SEGÚN EL CASO
  let report = "";

  // --- CASO A: REPORTE INDIVIDUAL (Comparativo) ---
  if (selectedOp !== 'all') {
    const opData = ranking.find(r => r.name === selectedOp);
    const opPoints = opData ? opData.points : 0;
    const opRank = opData ? opData.rank : '-';
    
    // Comparación con promedio
    const diffPercent = plantAverage > 0 ? ((opPoints - plantAverage) / plantAverage) * 100 : 0;
    const statusIcon = diffPercent >= 0 ? "🟢" : (diffPercent > -15 ? "🟡" : "🔴");
    const statusText = diffPercent >= 0 ? "Supera el promedio" : "Debajo del promedio";

    report += `### 👤 Análisis de Desempeño: ${selectedOp}\n\n`;
    
    report += `**METRICAS CLAVE:**\n`;
    report += `* **Puntos Totales:** ${opPoints.toLocaleString()} pts\n`;
    report += `* **Ranking en Planta:** Puesto #${opRank} de ${activeOpsCount} operarios.\n`;
    report += `* **Comparativa:** ${statusIcon} **${Math.abs(diffPercent).toFixed(1)}%** ${diffPercent >= 0 ? 'arriba' : 'abajo'} del promedio de planta (${plantAverage.toFixed(0)} pts).\n\n`;

    report += `**📊 DIAGNÓSTICO:**\n`;
    if (diffPercent >= 10) {
      report += `El operario muestra un **rendimiento excepcional**. Su productividad tracciona el promedio general hacia arriba. Es un candidato ideal para mentorías o tareas complejas.\n`;
    } else if (diffPercent <= -20) {
      report += `⚠️ **Atención:** El rendimiento está significativamente lejos del estándar del equipo. \n`;
      report += `**Posibles Causas:** Falta de material, problemas mecánicos en su puesto o necesidad de re-capacitación en el modelo actual.\n`;
    } else {
      report += `El desempeño es **estable y consistente** con el resto del equipo. Cumple con el estándar operativo normal.\n`;
    }

    report += `\n> *Referencia: El líder actual es ${topPerformer?.name} con ${topPerformer?.points.toFixed(0)} pts.*`;
  
  } 
  
  // --- CASO B: REPORTE GLOBAL (Gerencial) ---
  else {
    const efficiency = (globalPoints / (activeOpsCount * 800)) * 100; // Meta base 800 como ejemplo
    
    report += `### 🏭 Reporte Global de Planta\n\n`;
    
    report += `**ESTADO GENERAL:**\n`;
    report += `La planta opera con **${activeOpsCount} operarios** activos, generando un total de **${globalPoints.toLocaleString()} puntos**.\n`;
    report += `El promedio de producción por persona es de **${plantAverage.toFixed(0)} puntos**.\n\n`;

    report += `**🏆 PODIO DEL DÍA:**\n`;
    ranking.slice(0, 3).forEach((r, i) => {
      const medal = i===0 ? "🥇" : i===1 ? "🥈" : "🥉";
      report += `* ${medal} **${r.name}:** ${r.points.toFixed(0)} pts\n`;
    });

    report += `\n**📉 OPORTUNIDADES DE MEJORA:**\n`;
    // Buscamos los 3 últimos (que tengan puntos > 0 para no contar ausentes)
    const bottom performers = ranking.filter(r => r.points > 0).slice(-3).reverse();
    if (bottom performers.length > 0) {
      report += `Se detecta rendimiento bajo en: **${bottom performers.map(r => r.name).join(", ")}**. `;
      report += `Estos operarios están alejados del líder por más de un ${(topPerformer ? ((topPerformer.points - bottom performers[0].points)/topPerformer.points * 100).toFixed(0) : 0)}%.\n`;
    } else {
      report += `La dispersión entre operarios es baja. ¡Excelente balanceo de línea!\n`;
    }

    report += `\n**💡 RECOMENDACIÓN GERENCIAL:**\n`;
    if (efficiency < 70) {
      report += `🔴 **Prioridad Alta:** La eficiencia global es baja. Revisar si hubo paradas de línea generales o falta de insumos críticos en el sector de Corte.`;
    } else {
      report += `🟢 **Sostener Ritmo:** La planta fluye correctamente. Enfocar supervisión en los operarios del cuartil inferior para elevar el promedio general.`;
    }
  }

  return report;
}
