import { Client, ClientStatus, Transaction, TransactionType, TaxRecord, TaxPeriodType, TaxStatus } from './types';

export const ACQUISITION_SOURCES = [
  'Recomendación',
  'Campaña Publicitaria (Ads)',
  'Redes Sociales (Orgánico)',
  'Búsqueda Web (SEO)',
  'Evento / Networking',
  'Llamada en Frío',
  'Email Marketing',
  'Otro'
];

export const MOCK_CLIENTS: Client[] = [
  {
    id: '1',
    name: 'Ana García',
    companyName: 'Soluciones TechFlow',
    email: 'ana@techflow.com',
    phone: '+52 55 1234 5678',
    serviceType: 'Desarrollo Web',
    responsiblePerson: 'Sara Desarrolladora',
    contactMethod: 'Email',
    acquisitionSource: 'Campaña Publicitaria (Ads)',
    contractStartDate: '2023-01-15',
    contractEndDate: '2023-12-31',
    status: ClientStatus.Active,
  },
  {
    id: '2',
    name: 'Roberto Sánchez',
    companyName: 'Bufete Sánchez y Asoc.',
    email: 'r.sanchez@sanchezlegal.com',
    phone: '+52 55 9876 5432',
    serviceType: 'Optimización SEO',
    responsiblePerson: 'Miguel Marketing',
    contactMethod: 'Phone',
    acquisitionSource: 'Recomendación',
    contractStartDate: '2023-03-01',
    status: ClientStatus.Active,
  },
  {
    id: '3',
    name: 'Elena Rodríguez',
    companyName: 'Mercado Fresco',
    email: 'elena@mercadofresco.net',
    phone: '+52 55 4567 8901',
    serviceType: 'Gestión Redes Sociales',
    responsiblePerson: 'Juana Social',
    contactMethod: 'WhatsApp',
    acquisitionSource: 'Redes Sociales (Orgánico)',
    contractStartDate: '2023-06-10',
    contractEndDate: '2023-09-10',
    status: ClientStatus.Inactive,
  },
  {
    id: '4',
    name: 'David Chen',
    companyName: 'Innovaciones Quantum',
    email: 'dchen@quantum.io',
    phone: '+52 55 2222 3333',
    serviceType: 'Consultoría Cloud',
    responsiblePerson: 'Sara Desarrolladora',
    contactMethod: 'LinkedIn',
    acquisitionSource: 'Evento / Networking',
    contractStartDate: '2023-10-01',
    status: ClientStatus.Lead,
  },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 't1',
    date: '2023-10-01',
    amount: 5000,
    type: TransactionType.Income,
    category: 'Retentor Mensual',
    description: 'TechFlow Retentor Octubre',
    clientId: '1',
  },
  {
    id: 't2',
    date: '2023-10-03',
    amount: 150,
    type: TransactionType.Expense,
    category: 'Suscripción Software',
    description: 'Adobe CC Mensual',
  },
  {
    id: 't3',
    date: '2023-10-05',
    amount: 3200,
    type: TransactionType.Income,
    category: 'Hito de Proyecto',
    description: 'Auditoría SEO Sánchez y Asoc.',
    clientId: '2',
  },
  {
    id: 't4',
    date: '2023-10-10',
    amount: 1200,
    type: TransactionType.Expense,
    category: 'Alquiler Oficina',
    description: 'Coworking Octubre',
  },
  {
    id: 't5',
    date: '2023-10-15',
    amount: 2500,
    type: TransactionType.Income,
    category: 'Consultoría',
    description: 'Consulta Inicial Innovaciones Quantum',
    clientId: '4',
  },
  {
    id: 't6',
    date: '2023-10-20',
    amount: 400,
    type: TransactionType.Expense,
    category: 'Marketing',
    description: 'Anuncios LinkedIn',
  },
];

export const MOCK_TAXES: TaxRecord[] = [
  {
    id: 'tx1',
    type: TaxPeriodType.Monthly,
    periodLabel: '2026-01',
    amount: 1200,
    status: TaxStatus.Paid,
    paymentDate: '2026-02-17',
    category: 'IVA Mensual'
  },
  {
    id: 'tx2',
    type: TaxPeriodType.Monthly,
    periodLabel: '2026-01',
    amount: 850,
    status: TaxStatus.Paid,
    paymentDate: '2026-02-17',
    category: 'ISR Mensual'
  },
  {
    id: 'tx3',
    type: TaxPeriodType.Monthly,
    periodLabel: '2026-02',
    amount: 1400,
    status: TaxStatus.Pending,
    category: 'IVA Mensual',
    notes: 'Calcular basándose en facturas pendientes'
  },
  {
    id: 'tx4',
    type: TaxPeriodType.Annual,
    periodLabel: '2025',
    amount: 15000,
    status: TaxStatus.Pending,
    category: 'Declaración Anual'
  }
];

export const SERVICE_TYPES = [
  'Desarrollo Web',
  'Desarrollo Apps Móviles',
  'Optimización SEO',
  'Gestión Redes Sociales',
  'Consultoría Cloud',
  'Diseño Gráfico',
];

export const EXPENSE_CATEGORIES = [
  'Suscripción Software',
  'Alquiler Oficina',
  'Marketing',
  'Contratistas',
  'Servicios Públicos',
  'Viajes',
  'Equipamiento',
  'Impuestos',
  'Artículos de Oficina'
];

export const INCOME_CATEGORIES = [
  'Retentor Mensual',
  'Hito de Proyecto',
  'Consultoría',
  'Venta de Productos',
  'Mantenimiento',
];

export const TAX_CATEGORIES = [
  'IVA Mensual',
  'ISR Mensual',
  'Retenciones de IVA',
  'Retenciones de ISR',
  'Declaración Anual',
  'Otros Impuestos'
];

