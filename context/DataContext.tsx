import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Client, Transaction, ClientStatus, TransactionType, TaxRecord, Task, 
  TaxPeriodType, TaxStatus, CompanyInfo, Agreement, SaaSPlatform, Quotation,
  Booking, BookingSettings, WorkLog, WorkLogType, MaintenanceLog
} from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { syncTransactionToSheet, syncClientToSheet, fetchDataFromSheet, syncFinancesAndTaxesToGoogleSheets } from '../services/sheetsService';
import { syncClientToGoogleContacts } from '../services/googleContactsService';
import { db } from '../services/firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

interface DataContextType {
  clients: Client[];
  transactions: Transaction[];
  taxes: TaxRecord[]; 
  tasks: Task[];
  incomeCategories: string[];
  expenseCategories: string[];
  companyInfo: CompanyInfo;
  agreements: Agreement[];
  platforms: SaaSPlatform[];
  quotations: Quotation[];
  bookings: Booking[];
  bookingSettings: BookingSettings;
  workLogs: WorkLog[];
  maintenanceLogs: MaintenanceLog[];
  loading: boolean;
  addClient: (client: Client) => Promise<void>;
  updateClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  updateTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addCategory: (type: TransactionType, category: string) => Promise<void>;
  updateCategory: (type: TransactionType, oldCategory: string, newCategory: string) => Promise<void>;
  deleteCategory: (type: TransactionType, category: string) => Promise<void>;
  addTaxRecord: (record: TaxRecord) => Promise<void>;
  updateTaxRecord: (record: TaxRecord) => Promise<void>;
  deleteTaxRecord: (id: string) => Promise<void>;
  addTask: (task: Task) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateCompanyInfo: (info: CompanyInfo) => Promise<void>;
  updateMasterPassword: (password: string) => Promise<void>;
  addAgreement: (agreement: Agreement) => Promise<void>;
  updateAgreement: (agreement: Agreement) => Promise<void>;
  deleteAgreement: (id: string) => Promise<void>;
  addPlatform: (platform: SaaSPlatform) => Promise<void>;
  updatePlatform: (platform: SaaSPlatform) => Promise<void>;
  deletePlatform: (id: string) => Promise<void>;
  addQuotation: (quotation: Quotation) => Promise<void>;
  updateQuotation: (quotation: Quotation) => Promise<void>;
  deleteQuotation: (id: string) => Promise<void>;
  addBooking: (booking: Booking) => Promise<void>;
  updateBooking: (booking: Booking) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  updateBookingSettings: (settings: BookingSettings) => Promise<void>;
  addWorkLog: (workLog: WorkLog) => Promise<void>;
  updateWorkLog: (workLog: WorkLog) => Promise<void>;
  deleteWorkLog: (id: string) => Promise<void>;
  addMaintenanceLog: (log: MaintenanceLog) => Promise<void>;
  updateMaintenanceLog: (log: MaintenanceLog) => Promise<void>;
  deleteMaintenanceLog: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const defaultCompanyInfo: CompanyInfo = {
  commercialName: '',
  businessName: '',
  address: '',
  email: '',
  rfc: '',
  website: '',
  signatureBaseUrl: '',
  legalRepresentative: '',
  signatureDataUrl: ''
};

const defaultBookingSettings: BookingSettings = {
  availability: {
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    slotDurationMinutes: 45,
    bufferMinutes: 15,
    breakStartTime: "14:00",
    breakEndTime: "15:00"
  },
  platforms: [
    { id: "p1", name: "Interpres Digital", slug: "interpres-digital", color: "#06a0a2", description: "Infraestructura Digital y Agentes de IA" },
    { id: "p2", name: "Lúmina Core", slug: "lumina-core", color: "#930687", description: "Plataforma Inteligente" },
    { id: "p3", name: "TKD Register", slug: "tkd-register", color: "#f59e0b", description: "Plataforma Deportiva" },
    { id: "p4", name: "Check-up financiero", slug: "check-up-financiero", color: "#6366f1", description: "Diagnóstico Financiero" }
  ],
  zoomConfig: {
    accountId: "",
    clientId: "",
    clientSecret: "",
    enabled: false
  },
  telegramConfig: {
    botToken: "",
    chatId: "",
    enabled: false
  },
  blackoutDates: []
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(defaultCompanyInfo);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [platforms, setPlatforms] = useState<SaaSPlatform[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>(defaultBookingSettings);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load initial data from Firestore, fallback to Google Sheets if Firestore is empty
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const clientsSnapshot = await getDocs(collection(db, "clients"));
        const transactionsSnapshot = await getDocs(collection(db, "transactions"));
        const tasksSnapshot = await getDocs(collection(db, "tasks"));
        const taxesSnapshot = await getDocs(collection(db, "taxes"));
        const agreementsSnapshot = await getDocs(collection(db, "agreements"));
        const platformsSnapshot = await getDocs(collection(db, "platforms"));
        const quotationsSnapshot = await getDocs(collection(db, "quotations"));
        const bookingsSnapshot = await getDocs(collection(db, "bookings"));
        const workLogsSnapshot = await getDocs(collection(db, "work_logs"));
        const maintenanceLogsSnapshot = await getDocs(collection(db, "maintenance_logs"));
        const categoriesDoc = await getDoc(doc(db, "settings", "categories"));
        const companyInfoDoc = await getDoc(doc(db, "settings", "company_info"));
        const bookingSettingsDoc = await getDoc(doc(db, "settings", "booking_settings"));

        let loadedClients: Client[] = [];
        let loadedTransactions: Transaction[] = [];
        let loadedTasks: Task[] = [];
        let loadedTaxes: TaxRecord[] = [];
        let loadedAgreements: Agreement[] = [];
        let loadedPlatforms: SaaSPlatform[] = [];
        let loadedQuotations: Quotation[] = [];
        let loadedBookings: Booking[] = [];
        let loadedWorkLogs: WorkLog[] = [];
        let loadedMaintenanceLogs: MaintenanceLog[] = [];
        let loadedIncomeCats: string[] = [];
        let loadedExpenseCats: string[] = [];
        let loadedCompanyInfo: CompanyInfo = defaultCompanyInfo;
        let loadedBookingSettings: BookingSettings = defaultBookingSettings;

        if (companyInfoDoc.exists()) {
          loadedCompanyInfo = companyInfoDoc.data() as CompanyInfo;
        }

        if (bookingSettingsDoc.exists()) {
          loadedBookingSettings = {
            ...defaultBookingSettings,
            ...(bookingSettingsDoc.data() as BookingSettings),
            googleConfig: {
              ...((bookingSettingsDoc.data() as BookingSettings)?.googleConfig || {}),
              customSpreadsheetId: (bookingSettingsDoc.data() as BookingSettings)?.googleConfig?.customSpreadsheetId || '1Yptl3rHzrFBdaULdmbc9r-N-4x1ZwOgZy4kITqyiHGU',
              customSpreadsheetUrl: (bookingSettingsDoc.data() as BookingSettings)?.googleConfig?.customSpreadsheetUrl || 'https://docs.google.com/spreadsheets/d/1Yptl3rHzrFBdaULdmbc9r-N-4x1ZwOgZy4kITqyiHGU/edit'
            }
          };
        } else {
          loadedBookingSettings.googleConfig = {
            ...loadedBookingSettings.googleConfig,
            customSpreadsheetId: '1Yptl3rHzrFBdaULdmbc9r-N-4x1ZwOgZy4kITqyiHGU',
            customSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1Yptl3rHzrFBdaULdmbc9r-N-4x1ZwOgZy4kITqyiHGU/edit'
          };
        }

        agreementsSnapshot.forEach(docSnap => loadedAgreements.push({ ...(docSnap.data() as Agreement), id: docSnap.id }));
        platformsSnapshot.forEach(docSnap => loadedPlatforms.push({ ...(docSnap.data() as SaaSPlatform), id: docSnap.id }));
        quotationsSnapshot.forEach(docSnap => loadedQuotations.push({ ...(docSnap.data() as Quotation), id: docSnap.id }));
        bookingsSnapshot.forEach(docSnap => loadedBookings.push({ ...(docSnap.data() as Booking), id: docSnap.id }));

        // Check if there is data in Firestore
        const hasFirestoreData = !clientsSnapshot.empty || !transactionsSnapshot.empty || !tasksSnapshot.empty || !taxesSnapshot.empty;

        if (hasFirestoreData) {
          clientsSnapshot.forEach(docSnap => loadedClients.push({ ...(docSnap.data() as Client), id: docSnap.id }));
          transactionsSnapshot.forEach(docSnap => loadedTransactions.push({ ...(docSnap.data() as Transaction), id: docSnap.id }));
          tasksSnapshot.forEach(docSnap => loadedTasks.push({ ...(docSnap.data() as Task), id: docSnap.id }));
          taxesSnapshot.forEach(docSnap => loadedTaxes.push({ ...(docSnap.data() as TaxRecord), id: docSnap.id }));
          
          if (categoriesDoc.exists()) {
            const catData = categoriesDoc.data();
            loadedIncomeCats = catData.income || [];
            loadedExpenseCats = catData.expense || [];
          } else {
            loadedIncomeCats = INCOME_CATEGORIES;
            loadedExpenseCats = EXPENSE_CATEGORIES;
          }
        } else {
          // Firestore is empty. Attempt to import from Google Sheets history
          console.log("Firestore empty. Attempting to fetch from Google Sheets...");
          const sheetData = await fetchDataFromSheet();
          
          if (sheetData && (sheetData.clients.length > 0 || sheetData.transactions.length > 0)) {
            loadedClients = sheetData.clients;
            loadedTransactions = sheetData.transactions;
            loadedIncomeCats = INCOME_CATEGORIES;
            loadedExpenseCats = EXPENSE_CATEGORIES;

            // Upload sheet data to Firestore so it is saved there permanently
            for (const client of loadedClients) {
              await setDoc(doc(db, "clients", client.id), client);
            }
            for (const transaction of loadedTransactions) {
              await setDoc(doc(db, "transactions", transaction.id), transaction);
            }
            await setDoc(doc(db, "settings", "categories"), {
              income: loadedIncomeCats,
              expense: loadedExpenseCats
            });
            console.log("Successfully migrated history from Google Sheets to Firestore.");
          } else {
            // Both Firestore and Sheets are empty. Initialize with default categories
            console.log("No data found in Firestore or Google Sheets. Initializing empty collections.");
            loadedClients = [];
            loadedTransactions = [];
            loadedTasks = [];
            loadedTaxes = [];
            loadedIncomeCats = INCOME_CATEGORIES;
            loadedExpenseCats = EXPENSE_CATEGORIES;

            await setDoc(doc(db, "settings", "categories"), {
              income: loadedIncomeCats,
              expense: loadedExpenseCats
            });
          }
        }

        workLogsSnapshot.forEach(docSnap => {
          loadedWorkLogs.push({ ...docSnap.data(), id: docSnap.id } as WorkLog);
        });
        maintenanceLogsSnapshot.forEach(docSnap => {
          loadedMaintenanceLogs.push({ ...docSnap.data(), id: docSnap.id } as MaintenanceLog);
        });

        setClients(loadedClients);
        setTransactions(loadedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setTasks(loadedTasks);
        setTaxes(loadedTaxes.sort((a, b) => b.periodLabel.localeCompare(a.periodLabel)));
        setAgreements(loadedAgreements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setPlatforms(loadedPlatforms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setQuotations(loadedQuotations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setBookings(loadedBookings.sort((a, b) => new Date(`${b.date}T${b.startTime}`).getTime() - new Date(`${a.date}T${a.startTime}`).getTime()));
        setWorkLogs(loadedWorkLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setMaintenanceLogs(loadedMaintenanceLogs.sort((a, b) => b.period.localeCompare(a.period)));
        setBookingSettings(loadedBookingSettings);
        setIncomeCategories(loadedIncomeCats);
        setExpenseCategories(loadedExpenseCats);
        setCompanyInfo(loadedCompanyInfo);
      } catch (error) {
        console.error("Error loading data from Firestore:", error);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  // Actions
  const addClient = async (client: Client) => {
    try {
      await setDoc(doc(db, "clients", client.id), client);
      setClients(prev => [client, ...prev]);
      syncClientToSheet(client);

      // Sincronizar automáticamente con Google Contacts si está conectado
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        const res = await syncClientToGoogleContacts(client, bookingSettings.googleConfig);
        if (res.freshToken) {
          await updateBookingSettings({
            ...bookingSettings,
            googleConfig: {
              ...bookingSettings.googleConfig,
              accessToken: res.freshToken,
              tokenObtainedAt: Date.now()
            }
          });
        }
        if (res.success && res.resourceName) {
          const updated = { ...client, googleContactResourceName: res.resourceName };
          await setDoc(doc(db, "clients", client.id), updated);
          setClients(prev => prev.map(c => c.id === client.id ? updated : c));
        }
      }
    } catch (e) {
      console.error("Error adding client to Firestore:", e);
    }
  };

  const updateClient = async (updatedClient: Client) => {
    try {
      await setDoc(doc(db, "clients", updatedClient.id), updatedClient);
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      syncClientToSheet(updatedClient);

      // Sincronizar automáticamente con Google Contacts si está conectado
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        const res = await syncClientToGoogleContacts(updatedClient, bookingSettings.googleConfig);
        if (res.freshToken) {
          await updateBookingSettings({
            ...bookingSettings,
            googleConfig: {
              ...bookingSettings.googleConfig,
              accessToken: res.freshToken,
              tokenObtainedAt: Date.now()
            }
          });
        }
        if (res.success && res.resourceName && res.resourceName !== updatedClient.googleContactResourceName) {
          const updated = { ...updatedClient, googleContactResourceName: res.resourceName };
          await setDoc(doc(db, "clients", updatedClient.id), updated);
          setClients(prev => prev.map(c => c.id === updatedClient.id ? updated : c));
        }
      }
    } catch (e) {
      console.error("Error updating client in Firestore:", e);
    }
  };

  const deleteClient = async (id: string) => {
    try {
      await deleteDoc(doc(db, "clients", id));
      const clientToDelete = clients.find(c => c.id === id);
      setClients(prev => prev.filter(c => c.id !== id));
      if (clientToDelete) {
        syncClientToSheet(clientToDelete, 'delete_client');
      }
    } catch (e) {
      console.error("Error deleting client in Firestore:", e);
    }
  };

  const addTransaction = async (transaction: Transaction) => {
    try {
      await setDoc(doc(db, "transactions", transaction.id), transaction);
      const nextTxs = [transaction, ...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(nextTxs);
      syncTransactionToSheet(transaction);
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        syncFinancesAndTaxesToGoogleSheets(bookingSettings.googleConfig, nextTxs, taxes).catch(() => {});
      }
    } catch (e) {
      console.error("Error adding transaction to Firestore:", e);
    }
  };

  const updateTransaction = async (updatedTransaction: Transaction) => {
    try {
      await setDoc(doc(db, "transactions", updatedTransaction.id), updatedTransaction);
      const nextTxs = transactions.map(t => t.id === updatedTransaction.id ? updatedTransaction : t).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(nextTxs);
      syncTransactionToSheet(updatedTransaction, 'update_transaction');
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        syncFinancesAndTaxesToGoogleSheets(bookingSettings.googleConfig, nextTxs, taxes).catch(() => {});
      }
    } catch (e) {
      console.error("Error updating transaction in Firestore:", e);
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, "transactions", id));
      const transactionToDelete = transactions.find(t => t.id === id);
      const nextTxs = transactions.filter(t => t.id !== id);
      setTransactions(nextTxs);
      if (transactionToDelete) {
        syncTransactionToSheet(transactionToDelete, 'delete_transaction');
      }
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        syncFinancesAndTaxesToGoogleSheets(bookingSettings.googleConfig, nextTxs, taxes).catch(() => {});
      }
    } catch (e) {
      console.error("Error deleting transaction from Firestore:", e);
    }
  };

  const addCategory = async (type: TransactionType, category: string) => {
    let updatedIncome = incomeCategories;
    let updatedExpense = expenseCategories;

    if (type === TransactionType.Income) {
      if (!incomeCategories.includes(category)) {
        updatedIncome = [...incomeCategories, category];
        setIncomeCategories(updatedIncome);
      }
    } else {
      if (!expenseCategories.includes(category)) {
        updatedExpense = [...expenseCategories, category];
        setExpenseCategories(updatedExpense);
      }
    }

    try {
      await setDoc(doc(db, "settings", "categories"), {
        income: updatedIncome,
        expense: updatedExpense
      });
    } catch (e) {
      console.error("Error saving categories to Firestore:", e);
    }
  };

  const updateCategory = async (type: TransactionType, oldCategory: string, newCategory: string) => {
    if (!newCategory.trim()) return;
    
    let updatedIncome = incomeCategories;
    let updatedExpense = expenseCategories;

    if (type === TransactionType.Income) {
      updatedIncome = incomeCategories.map(c => c === oldCategory ? newCategory : c);
      setIncomeCategories(updatedIncome);
    } else {
      updatedExpense = expenseCategories.map(c => c === oldCategory ? newCategory : c);
      setExpenseCategories(updatedExpense);
    }

    try {
      await setDoc(doc(db, "settings", "categories"), {
        income: updatedIncome,
        expense: updatedExpense
      });

      const batchUpdates = transactions.map(async (t) => {
        if (t.type === type && t.category === oldCategory) {
          await setDoc(doc(db, "transactions", t.id), { ...t, category: newCategory });
        }
      });
      await Promise.all(batchUpdates);

      setTransactions(prev => prev.map(t => {
        if (t.type === type && t.category === oldCategory) {
          return { ...t, category: newCategory };
        }
        return t;
      }));
    } catch (e) {
      console.error("Error updating category in Firestore:", e);
    }
  };

  const deleteCategory = async (type: TransactionType, category: string) => {
    let updatedIncome = incomeCategories;
    let updatedExpense = expenseCategories;

    if (type === TransactionType.Income) {
      updatedIncome = incomeCategories.filter(c => c !== category);
      setIncomeCategories(updatedIncome);
    } else {
      updatedExpense = expenseCategories.filter(c => c !== category);
      setExpenseCategories(updatedExpense);
    }

    try {
      await setDoc(doc(db, "settings", "categories"), {
        income: updatedIncome,
        expense: updatedExpense
      });
    } catch (e) {
      console.error("Error deleting category from Firestore:", e);
    }
  };

  const addTaxRecord = async (record: TaxRecord) => {
    try {
      await setDoc(doc(db, "taxes", record.id), record);
      setTaxes(prev => [record, ...prev].sort((a, b) => b.periodLabel.localeCompare(a.periodLabel)));
    } catch (e) {
      console.error("Error adding tax record to Firestore:", e);
    }
  };

  const updateTaxRecord = async (record: TaxRecord) => {
    try {
      await setDoc(doc(db, "taxes", record.id), record);
      setTaxes(prev => prev.map(t => t.id === record.id ? record : t).sort((a, b) => b.periodLabel.localeCompare(a.periodLabel)));
    } catch (e) {
      console.error("Error updating tax record in Firestore:", e);
    }
  };

  const deleteTaxRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, "taxes", id));
      setTaxes(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error("Error deleting tax record from Firestore:", e);
    }
  };

  const addTask = async (task: Task) => {
    try {
      await setDoc(doc(db, "tasks", task.id), task);
      setTasks(prev => [...prev, task]);
    } catch (e) {
      console.error("Error adding task to Firestore:", e);
    }
  };

  const updateTask = async (updatedTask: Task) => {
    try {
      await setDoc(doc(db, "tasks", updatedTask.id), updatedTask);
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    } catch (e) {
      console.error("Error updating task in Firestore:", e);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, "tasks", id));
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error("Error deleting task from Firestore:", e);
    }
  };

  const updateCompanyInfo = async (info: CompanyInfo) => {
    try {
      await setDoc(doc(db, "settings", "company_info"), info);
      setCompanyInfo(info);
    } catch (e) {
      console.error("Error updating company info in Firestore:", e);
    }
  };

  const updateMasterPassword = async (password: string) => {
    try {
      await setDoc(doc(db, "settings", "auth"), { masterPassword: password });
    } catch (e) {
      console.error("Error updating master password in Firestore:", e);
    }
  };

  const addAgreement = async (agreement: Agreement) => {
    try {
      await setDoc(doc(db, "agreements", agreement.id), agreement);
      setAgreements(prev => [agreement, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error adding agreement to Firestore:", e);
    }
  };

  const updateAgreement = async (updatedAgreement: Agreement) => {
    try {
      await setDoc(doc(db, "agreements", updatedAgreement.id), updatedAgreement);
      setAgreements(prev => prev.map(a => a.id === updatedAgreement.id ? updatedAgreement : a).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error updating agreement in Firestore:", e);
    }
  };

  const deleteAgreement = async (id: string) => {
    try {
      await deleteDoc(doc(db, "agreements", id));
      setAgreements(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error("Error deleting agreement from Firestore:", e);
    }
  };

  const addPlatform = async (platform: SaaSPlatform) => {
    try {
      await setDoc(doc(db, "platforms", platform.id), platform);
      setPlatforms(prev => [platform, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error adding platform to Firestore:", e);
    }
  };

  const updatePlatform = async (updatedPlatform: SaaSPlatform) => {
    try {
      await setDoc(doc(db, "platforms", updatedPlatform.id), updatedPlatform);
      setPlatforms(prev => prev.map(p => p.id === updatedPlatform.id ? updatedPlatform : p).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error updating platform in Firestore:", e);
    }
  };

  const deletePlatform = async (id: string) => {
    try {
      await deleteDoc(doc(db, "platforms", id));
      setPlatforms(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error("Error deleting platform from Firestore:", e);
    }
  };

  const addQuotation = async (quotation: Quotation) => {
    try {
      await setDoc(doc(db, "quotations", quotation.id), quotation);
      setQuotations(prev => [quotation, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error adding quotation to Firestore:", e);
    }
  };

  const updateQuotation = async (updatedQuotation: Quotation) => {
    try {
      await setDoc(doc(db, "quotations", updatedQuotation.id), updatedQuotation);
      setQuotations(prev => prev.map(q => q.id === updatedQuotation.id ? updatedQuotation : q).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error("Error updating quotation in Firestore:", e);
    }
  };

  const deleteQuotation = async (id: string) => {
    try {
      await deleteDoc(doc(db, "quotations", id));
      setQuotations(prev => prev.filter(q => q.id !== id));
    } catch (e) {
      console.error("Error deleting quotation from Firestore:", e);
    }
  };

  const addBooking = async (booking: Booking) => {
    try {
      await setDoc(doc(db, "bookings", booking.id), booking);
      setBookings(prev => [booking, ...prev].sort((a, b) => new Date(`${b.date}T${b.startTime}`).getTime() - new Date(`${a.date}T${a.startTime}`).getTime()));
    } catch (e) {
      console.error("Error adding booking to Firestore:", e);
    }
  };

  const updateBooking = async (updatedBooking: Booking) => {
    try {
      await setDoc(doc(db, "bookings", updatedBooking.id), updatedBooking);
      setBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b).sort((a, b) => new Date(`${b.date}T${b.startTime}`).getTime() - new Date(`${a.date}T${a.startTime}`).getTime()));
    } catch (e) {
      console.error("Error updating booking in Firestore:", e);
    }
  };

  const deleteBooking = async (id: string) => {
    try {
      await deleteDoc(doc(db, "bookings", id));
      setBookings(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      console.error("Error deleting booking from Firestore:", e);
    }
  };

  const updateBookingSettings = async (newSettings: BookingSettings) => {
    try {
      await setDoc(doc(db, "settings", "booking_settings"), newSettings);
      setBookingSettings(newSettings);
    } catch (e) {
      console.error("Error saving booking settings to Firestore:", e);
    }
  };

  const addWorkLog = async (workLog: WorkLog) => {
    try {
      await setDoc(doc(db, "work_logs", workLog.id), workLog);
      setWorkLogs(prev => [workLog, ...prev.filter(w => w.id !== workLog.id)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) {
      console.error("Error adding work log to Firestore:", e);
    }
  };

  const updateWorkLog = async (updatedWorkLog: WorkLog) => {
    try {
      await setDoc(doc(db, "work_logs", updatedWorkLog.id), updatedWorkLog);
      setWorkLogs(prev => [updatedWorkLog, ...prev.filter(w => w.id !== updatedWorkLog.id)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) {
      console.error("Error updating work log in Firestore:", e);
    }
  };

  const deleteWorkLog = async (id: string) => {
    try {
      await deleteDoc(doc(db, "work_logs", id));
      setWorkLogs(prev => prev.filter(w => w.id !== id));
    } catch (e) {
      console.error("Error deleting work log from Firestore:", e);
    }
  };

  const addMaintenanceLog = async (log: MaintenanceLog) => {
    try {
      let expenseTxId = log.expenseTransactionId;

      if (log.syncToFinances && log.actualCost > 0) {
        expenseTxId = expenseTxId || `tx_exp_maint_${log.id}`;
        const expenseTx: Transaction = {
          id: expenseTxId,
          date: `${log.period}-01`,
          amount: log.actualCost,
          type: TransactionType.Expense,
          category: 'Mantenimiento',
          description: `Consumo Operativo de Mantenimiento / APIs - ${log.clientCompanyName || log.clientName} (${log.period})`,
          clientId: log.clientId,
          locationType: 'Nacional',
          paymentMethod: 'Transferencia'
        };
        await setDoc(doc(db, "transactions", expenseTxId), expenseTx);
        setTransactions(prev => [expenseTx, ...prev.filter(t => t.id !== expenseTxId)]);
      } else if (expenseTxId) {
        await deleteDoc(doc(db, "transactions", expenseTxId));
        setTransactions(prev => prev.filter(t => t.id !== expenseTxId));
        expenseTxId = undefined;
      }

      const finalLog: MaintenanceLog = {
        ...log,
        expenseTransactionId: expenseTxId
      };

      await setDoc(doc(db, "maintenance_logs", finalLog.id), finalLog);
      setMaintenanceLogs(prev => [finalLog, ...prev.filter(m => m.id !== finalLog.id)].sort((a, b) => b.period.localeCompare(a.period)));
    } catch (e) {
      console.error("Error adding maintenance log to Firestore:", e);
    }
  };

  const updateMaintenanceLog = async (log: MaintenanceLog) => {
    await addMaintenanceLog(log);
  };

  const deleteMaintenanceLog = async (id: string) => {
    try {
      const existing = maintenanceLogs.find(m => m.id === id);
      if (existing && existing.expenseTransactionId) {
        await deleteDoc(doc(db, "transactions", existing.expenseTransactionId));
        setTransactions(prev => prev.filter(t => t.id !== existing.expenseTransactionId));
      }
      await deleteDoc(doc(db, "maintenance_logs", id));
      setMaintenanceLogs(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error("Error deleting maintenance log from Firestore:", e);
    }
  };

  return (
    <DataContext.Provider value={{
      clients,
      transactions,
      taxes,
      tasks,
      incomeCategories,
      expenseCategories,
      companyInfo,
      agreements,
      platforms,
      quotations,
      bookings,
      bookingSettings,
      workLogs,
      maintenanceLogs,
      loading,
      addClient,
      updateClient,
      deleteClient,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
      updateCategory,
      deleteCategory,
      addTaxRecord,
      updateTaxRecord,
      deleteTaxRecord,
      addTask,
      updateTask,
      deleteTask,
      updateCompanyInfo,
      updateMasterPassword,
      addAgreement,
      updateAgreement,
      deleteAgreement,
      addPlatform,
      updatePlatform,
      deletePlatform,
      addQuotation,
      updateQuotation,
      deleteQuotation,
      addBooking,
      updateBooking,
      deleteBooking,
      updateBookingSettings,
      addWorkLog,
      updateWorkLog,
      deleteWorkLog,
      addMaintenanceLog,
      updateMaintenanceLog,
      deleteMaintenanceLog
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
