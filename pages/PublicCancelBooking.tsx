import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Booking, BookingSettings } from '../types';
import { sendBookingCancellationEmail } from '../services/emailService';
import { LOGO_BLANCO_URL } from '../utils/brandAssets';
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
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#1464B8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#102B4B]/70 text-sm font-medium animate-pulse">Cargando datos de la reservación...</p>
        </div>
      </div>
    );
  }

  const rescheduleUrl = booking ? `/#/book/${booking.platformId || 'interpres-digital'}` : '/#/book';

  return (
    <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-white border border-[#C7D5E2] rounded-3xl shadow-[0_24px_60px_-15px_rgba(16,43,75,0.12)] overflow-hidden">
        <div className="bg-[#071B36] text-center px-6 py-6 space-y-2.5">
          <img 
            src={LOGO_BLANCO_URL} 
            alt="Interpres Digital Labs" 
            className="h-11 w-auto max-w-[210px] mx-auto object-contain"
          />
          <h1 className="font-display text-2xl font-extrabold text-white tracking-tight">Gestión de Cita</h1>
          <p className="text-xs text-slate-300">Cancelación de videollamada agendada</p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {booking && (
            <div className="space-y-5">
              {/* Details Card */}
              <div className="bg-[#F6F9FC] border border-[#C7D5E2] rounded-2xl p-5 space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#C7D5E2]/80">
                  <span className="text-[#102B4B]/65 font-medium">Plataforma:</span>
                  <span className="font-bold text-[#102B4B] text-sm">{booking.platformName}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[#102B4B]/65 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#1464B8]" />
                    Fecha:
                  </span>
                  <span className="font-bold text-[#102B4B]">{booking.date}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[#102B4B]/65 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#00A9B7]" />
                    Horario:
                  </span>
                  <span className="font-bold text-[#102B4B]">{booking.startTime} - {booking.endTime} CDMX</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[#102B4B]/65 font-medium">Cliente:</span>
                  <span className="font-semibold text-[#102B4B]">{booking.clientName}</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#C7D5E2]/80">
                  <span className="text-[#102B4B]/65 font-medium">Estatus Actual:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xxs font-extrabold uppercase ${
                    booking.status === 'Cancelada' 
                      ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                      : 'bg-[#00A9B7]/12 text-[#007B86] border border-[#00A9B7]/35'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              </div>

              {/* If already cancelled */}
              {booking.status === 'Cancelada' || cancelledSuccess ? (
                <div className="space-y-4 text-center animate-fade-in">
                  <div className="p-4 bg-[#00A9B7]/10 border border-[#00A9B7]/35 rounded-2xl text-[#007B86] text-xs font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00A9B7] flex-shrink-0" />
                    <span>Tu cita ha sido cancelada exitosamente en nuestro sistema.</span>
                  </div>

                  <p className="text-xs text-[#102B4B]/70 leading-relaxed">
                    ¿Deseas volver a agendar en un día u horario diferente?
                  </p>

                  <a
                    href={rescheduleUrl}
                    className="w-full bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#1464B8]/20 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>📅 Agendar Nueva Cita</span>
                  </a>
                </div>
              ) : (
                /* Confirmation Prompt */
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-[#102B4B]/70 text-center leading-relaxed">
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
    </div>
  );
};

export default PublicCancelBooking;
