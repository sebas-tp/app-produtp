import { PointRule, Sector } from './types';

// Simulando la "Hoja Oculta" de Excel - La Matriz de Puntos
export const POINTS_MATRIX: PointRule[] = [
  { sector: Sector.COSTURA, model: 'Modelo-X', operation: 'Costura Recta', pointsPerUnit: 10 },
  { sector: Sector.COSTURA, model: 'Modelo-X', operation: 'Remalle', pointsPerUnit: 8 },
  { sector: Sector.COSTURA, model: 'Modelo-Y', operation: 'Costura Recta', pointsPerUnit: 12 },
  { sector: Sector.ARMADO, model: 'Modelo-Z', operation: 'Ensamblaje Base', pointsPerUnit: 15 },
  { sector: Sector.CORTE, model: 'Modelo-X', operation: 'Corte Laser', pointsPerUnit: 5 },
  { sector: Sector.EMBALAJE, model: 'Modelo-X', operation: 'Etiquetado', pointsPerUnit: 2 },
  { sector: Sector.EMBALAJE, model: 'Modelo-Y', operation: 'Etiquetado', pointsPerUnit: 2.5 },
];

export const OPERATORS = [
  "Juan Pérez",
  "María González",
  "Carlos López",
  "Ana Martínez",
  "Luis Rodríguez"
];

export const MODELS = ['Modelo-X', 'Modelo-Y', 'Modelo-Z', 'Modelo-Alpha'];
export const OPERATIONS = ['Costura Recta', 'Remalle', 'Ensamblaje Base', 'Corte Laser', 'Etiquetado', 'Control Calidad'];