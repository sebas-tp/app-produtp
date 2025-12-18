export enum Sector {
  CORTE = 'Corte',
  ARMADO = 'Armado',
  COSTURA = 'Costura',
  MONTAJE = 'Montaje',
  LIMPIEZA = 'Limpieza',
  EMBALAJE = 'Embalaje',
}

export interface PointRule {
  id?: string;
  sector: Sector | string;
  model: string;
  operation: string;
  pointsPerUnit: number;
}

export interface ProductionLog {
  id: string;
  timestamp: string; // ISO String (Fecha y Hora)
  startTime: string;
  endTime: string;
  
  // Datos del Operario
  operatorName: string;
  
  // Datos de Producción
  sector: Sector | string;
  model: string;
  operation: string;
  quantity: number;
  totalPoints: number;
  
  // --- CAMPOS NUEVOS ---
  orderNumber?: string; 
  comments?: string; // <--- NUEVO CAMPO DE OBSERVACIONES
  
  // Campos de compatibilidad (opcionales)
  date?: string; 
  operator?: string;
  points?: number;
}

export interface DashboardStats {
  totalProduction: number;
  totalPoints: number;
  topOperator: { name: string; points: number } | null;
  efficiencyBySector: { name: string; value: number }[];
}

export type UserRole = 'admin' | 'operator';

export interface User {
  name: string;
  role: UserRole;
}

// --- INTERFAZ PARA LAS NOTICIAS ---
export interface NewsItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string;
  priority: 'normal' | 'high';
}
