export enum TaskStatus {
  ToDo = 'Por desarrollar',
  InProgress = 'En ejecución',
  Done = 'Finalizada',
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  clientId?: string;
  startDate: string; // ISO date string (YYYY-MM-DD)
  startTime?: string; // HH:mm
  endDate: string; // ISO date string (YYYY-MM-DD)
  endTime?: string; // HH:mm
  status: TaskStatus;
  googleEventId?: string; // For Google Calendar Sync
}

export enum ClientStatus {
  Active = 'Activo',
  Inactive = 'Inactivo',
  Lead = 'Prospecto',
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName?: string; // Nombre Comercial
  businessName?: string; // Razón Social
  serviceType: string;
  responsiblePerson: string;
  contactMethod: 'Email' | 'Phone' | 'WhatsApp' | 'LinkedIn';
  acquisitionSource?: string; // New field for "Origen del Cliente"
  contractStartDate: string; // ISO date string
  contractEndDate?: string; // ISO date string
  status: ClientStatus;
  notes?: string;
  rfc?: string;
  website?: string;
  deliveryDate?: string;
  platformIds?: string[];
  address?: string;
  whatsapp?: string;
  legalRepresentative?: string;
  googleContactResourceName?: string;
  hasMultipleBranches?: 'Sí' | 'No';
  primaryBranchName?: string;
  aiAvatarName?: string;
  branches?: any[];
  monthlyMaintenanceFee?: number; // Cuota fija de mantenimiento configurada por defecto ($)
}

export enum TransactionType {
  Income = 'Ingreso',
  Expense = 'Gasto',
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: TransactionType;
  category: string;
  description: string;
  entity?: string; // New field: Empresa / Persona
  clientId?: string; // Optional link to a client
  locationType?: 'Nacional' | 'Internacional'; // New field for expenses
  paymentMethod?: 'Efectivo' | 'Transferencia' | 'Tarjeta de Débito' | 'Tarjeta de Crédito' | 'Cuenta' | 'Otro'; // New field: Medio de pago
}

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  netIncome: number;
}

// --- NEW TAX TYPES ---

export enum TaxPeriodType {
  Monthly = 'Mensual',
  Annual = 'Anual',
}

export enum TaxStatus {
  Pending = 'Pendiente',
  Paid = 'Pagado',
}

export interface TaxRecord {
  id: string;
  type: TaxPeriodType;
  periodLabel: string; // e.g., "2023-10" for October 2023, or "2023" for Annual
  amount: number;
  status: TaxStatus;
  paymentDate?: string; // ISO date string when paid
  notes?: string;
  category: string; // e.g., ISR, IVA, Retenciones
}

export interface CompanyInfo {
  commercialName: string;
  businessName: string;
  address: string;
  email: string;
  rfc?: string;
  website?: string;
  signatureBaseUrl?: string;
  legalRepresentative?: string;
  signatureDataUrl?: string;
}

export interface Agreement {
  id: string;
  clientId: string;
  clientName: string;
  clientCompanyName?: string;
  title: string;
  content: string;
  createdAt: string;
  status: 'Pendiente' | 'Firmado' | 'Con Observaciones';
  signedAt?: string;
  clientIP?: string;
  signedByName?: string;
  signatureDataUrl?: string;
  feedback?: string;
  rejectedAt?: string;
  quoteId?: string;
  includeRepSignature?: boolean;
  reviewConfirmed?: boolean;
  attachments?: { name: string; url: string }[];
}

export interface SaaSPlatform {
  id: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  status: 'Desarrollo' | 'Activo' | 'Mantenimiento';
  createdAt: string;
}

export interface QuoteItem {
  description: string;
  details?: string;
  quantity: number;
  price: number;
  promoPrice?: number;
  billingType?: 'once' | 'monthly';
}

export interface PaymentMilestone {
  concept: string;
  percentage: number;
  amount: number;
  timeframe?: string;
}

export interface Quotation {
  id: string;
  clientId: string;
  clientName: string;
  clientCompanyName?: string;
  clientEmail?: string;
  items: QuoteItem[];
  subtotal: number;
  discount?: number;
  total: number;
  subtotalMonthly?: number;
  totalMonthly?: number;
  notes?: string;
  createdAt: string;
  validUntil?: string;
  status: 'Pendiente' | 'Aceptada' | 'Rechazada';
  acceptedAt?: string;
  rejectedAt?: string;
  feedback?: string;
  hasIva?: boolean;
  paymentMilestones?: PaymentMilestone[];
  deliveryTime?: string;
}
export interface TimeRange {
  id: string;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "13:00"
}

export interface DaySchedule {
  dayOfWeek: number; // 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab, 0=Dom
  enabled: boolean;
  timeRanges: TimeRange[];
}

export interface CustomDateSchedule {
  date: string; // YYYY-MM-DD
  enabled: boolean;
  timeRanges: TimeRange[];
}

export interface BookingAvailability {
  daysOfWeek: number[]; // 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab, 0=Dom
  dailySchedules?: DaySchedule[]; // Horarios independientes por cada día de la semana
  customDateSchedules?: CustomDateSchedule[]; // Disponibilidad específica por fechas concretas
  timeRanges?: TimeRange[]; // Franjas horarias globales (fallback)
  startTime: string;    // fallback "09:00"
  endTime: string;      // fallback "18:00"
  slotDurationMinutes: number; // 30, 45, 60
  bufferMinutes: number;       // 15
  breakStartTime?: string;     // deprecated
  breakEndTime?: string;       // deprecated
}

export interface BookingPlatform {
  id: string;
  name: string;   // "Interpres Digital", "Lumina Core"
  slug: string;   // "interpres-digital", "lumina-core"
  color: string;  // Hex color tag
  description?: string;
}

export interface ZoomConfig {
  accountId: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface EmailConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  senderEmail?: string;
  subject?: string;
  bodyTemplate?: string;
  enabled?: boolean;
}

export interface GoogleGmailConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  userEmail?: string;
  connected?: boolean;
  enabled?: boolean;
  tokenObtainedAt?: number;
  connectedAt?: string;
}

export interface CustomEmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
}

export interface GeminiConfig {
  apiKey: string;
  enabled: boolean;
}

export interface BookingSettings {
  availability: BookingAvailability;
  platforms: BookingPlatform[];
  zoomConfig: ZoomConfig;
  telegramConfig: TelegramConfig;
  emailConfig?: EmailConfig;
  emailTemplates?: Record<string, CustomEmailTemplate>;
  googleConfig?: GoogleGmailConfig;
  blackoutDates: string[]; // ISO date strings "YYYY-MM-DD"
  geminiConfig?: GeminiConfig;
}

export interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  platformId: string;
  platformName: string;
  topic?: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "10:00"
  endTime: string; // "10:45"
  zoomJoinUrl?: string;
  zoomStartUrl?: string;
  zoomMeetingId?: string;
  zoomPassword?: string;
  status: 'Programada' | 'Completada' | 'Cancelada' | 'Reagendada';
  createdAt: string;
}

export interface DocumentSigner {
  name: string;
  email: string;
  role: string;
  hasSigned: boolean;
  signedAt?: string;
  ipAddress?: string;
  signatureDataUrl?: string;
}

export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  status: 'Pendiente' | 'Firmado' | 'Rechazado';
  createdAt: string;
  signers: DocumentSigner[];
  attachments?: { name: string; url: string }[];
  feedback?: string;
}

export enum WorkLogType {
  Development = 'Desarrollo',
  Maintenance = 'Mantenimiento',
}

export interface WorkLog {
  id: string;
  clientId: string;
  clientName: string;
  clientCompanyName?: string;
  title: string;
  description: string;
  timeSpent: number; // In minutes
  type: WorkLogType;
  date: string; // ISO date string (YYYY-MM-DD)
  createdAt: string; // ISO timestamp
}

export interface MaintenanceLog {
  id: string;
  clientId: string;
  clientName: string;
  clientCompanyName?: string;
  period: string; // Formato "YYYY-MM" (ej. "2026-08")
  monthlyFee: number; // Cuota fija acordada que paga el cliente mensualmente ($)
  actualCost: number; // Consumo real pagado en servicios/APIs/infraestructura ($ Gasto)
  balance: number; // Saldo (monthlyFee - actualCost) -> Positivo (A favor) / Negativo (En contra)
  marginPercentage: number; // Porcentaje de margen/cobertura ((actualCost / monthlyFee) * 100)
  notes?: string; // Conceptos de APIs / Servicios consumidos
  syncToFinances: boolean; // Si sincroniza el GASTO a Finanzas
  expenseTransactionId?: string; // ID transacción del gasto en Finanzas
  createdAt: string;
}



