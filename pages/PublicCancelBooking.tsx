import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Booking, BookingSettings } from '../types';
import { sendBookingCancellationEmail } from '../services/emailService';
import { Calendar, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

const PublicCancelBooking: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledSuccess, setCancelledSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) {
        setErrorMsg("Enlace de cancelación no válido.");
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "bookings", bookingId));
        if (snap.exists()) {
          const data = snap.data() as Booking;
          setBooking({
            ...data,
            id: snap.id
          });
        } else {
          setErrorMsg("No se encontró la reservación indicada o ya fue eliminada.");
        }
      } catch (err: any) {
        console.error("Error al cargar la cita:", err);
        setErrorMsg("Error al conectar con la base de datos.");
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  const handleConfirmCancel = async () => {
    if (!booking) return;

    setCancelling(true);
    setErrorMsg(null);

    try {
      // 1. Actualizar estatus en Firestore
      const updatedBooking: Booking = {
        ...booking,
        status: 'Cancelada'
      };

      await updateDoc(doc(db, "bookings", booking.id), {
        status: 'Cancelada',
        cancelledByClient: true,
        cancelledAt: new Date().toISOString()
      });

      // 2. Cargar configuraciones para enviar notificaciones
      const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
      if (settingsSnap.exists()) {
        const settings = settingsSnap.data() as BookingSettings;

        // Enviar notificación a Telegram al administrador
        if (settings.telegramConfig?.enabled && settings.telegramConfig?.botToken && settings.telegramConfig?.chatId) {
          try {
            const msg = `🚨 *CANCELACIÓN POR CLIENTE*\n\n` +
              `👤 *Cliente:* ${booking.clientName}\n` +
              `📧 *Email:* ${booking.clientEmail}\n` +
              `📌 *Plataforma:* ${booking.platformName}\n` +
              `📅 *Fecha:* ${booking.date}\n` +
              `⏰ *Horario:* ${booking.startTime} - ${booking.endTime} CDMX\n\n` +
              `_El cliente ha cancelado la cita desde el enlace de su correo._`;

            fetch(`https://api.telegram.org/bot${settings.telegramConfig.botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: settings.telegramConfig.chatId,
                text: msg,
                parse_mode: 'Markdown'
              })
            }).catch(e => console.warn("Telegram error:", e));
          } catch (e) {
            console.warn(e);
          }
        }

        // Enviar correo de cancelación y enlace para reprogramar
        sendBookingCancellationEmail(updatedBooking, settings.emailConfig, settings.googleConfig);
      }

      setBooking(updatedBooking);
      setCancelledSuccess(true);
    } catch (err: any) {
      console.error("Error al cancelar la cita:", err);
      setErrorMsg("Ocurrió un error al procesar la cancelación. Inténtalo de nuevo.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium animate-pulse">Cargando datos de la reservación...</p>
        </div>
      </div>
    );
  }

  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";
  const rescheduleUrl = booking ? `/#/book/${booking.platformId || 'interpres-digital'}` : '/#/book';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="text-center space-y-3">
          <img 
            src={logoUrl} 
            alt="Interpres Digital" 
            className="h-10 w-auto max-w-[200px] mx-auto object-contain mb-2"
          />
          
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Gestión de Cita</h1>
          <p className="text-xs text-slate-400">Cancelación de videollamada agendada</p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {booking && (
          <div className="space-y-5">
            {/* Details Card */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-850">
                <span className="text-slate-400 font-medium">Plataforma:</span>
                <span className="font-bold text-white text-sm">{booking.platformName}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary-400" />
                  Fecha:
                </span>
                <span className="font-bold text-white">{booking.date}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Horario:
                </span>
                <span className="font-bold text-white">{booking.startTime} - {booking.endTime} CDMX</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Cliente:</span>
                <span className="font-semibold text-slate-200">{booking.clientName}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-850">
                <span className="text-slate-400 font-medium">Estatus Actual:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xxs font-extrabold uppercase ${
                  booking.status === 'Cancelada' 
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {booking.status}
                </span>
              </div>
            </div>

            {/* If already cancelled */}
            {booking.status === 'Cancelada' || cancelledSuccess ? (
              <div className="space-y-4 text-center animate-fade-in">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Tu cita ha sido cancelada exitosamente en nuestro sistema.</span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  ¿Deseas volver a agendar en un día u horario diferente?
                </p>

                <a
                  href={rescheduleUrl}
                  className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>📅 Agendar Nueva Cita</span>
                </a>
              </div>
            ) : (
              /* Confirmation Prompt */
              <div className="space-y-4 pt-2">
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Al confirmar, la reservación se cancelará en el panel y se liberará la sala de Zoom.
                </p>

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleConfirmCancel}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  {cancelling ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>{cancelling ? "Cancelando Cita..." : "❌ Confirmar Cancelación de Cita"}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicCancelBooking;
