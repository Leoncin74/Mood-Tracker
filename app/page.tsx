'use client';

import React, { useState, useEffect } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  isToday,
  getWeeksInMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Info, ChevronLeft, ChevronRight, Grid, Calendar as CalendarIcon, BarChart2, User as UserIcon, Sparkles, Camera, Trash2, Image as ImageIcon, Cloud, CloudOff, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { auth, db, googleProvider } from '../lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility to compress images
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

type Mood = 'Horrible' | 'Mal' | 'Normal' | 'Bien' | 'Increíble';
type Energy = 'Baja' | 'Media' | 'Alta';

interface MoodEntry {
  emoji: Mood;
  note: string;
  energy: Energy | null;
  word: string;
  timestamp: number;
}

const MOODS: { label: Mood; emoji: string; colorClass: string; score: number }[] = [
  { label: 'Horrible', emoji: '😢', colorClass: 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] text-white', score: -2 },
  { label: 'Mal', emoji: '😞', colorClass: 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-white', score: -1 },
  { label: 'Normal', emoji: '😐', colorClass: 'bg-slate-500 shadow-[0_0_15px_rgba(100,116,139,0.3)] text-white', score: 0 },
  { label: 'Bien', emoji: '😊', colorClass: 'bg-sky-500 shadow-[0_0_15px_rgba(52,181,250,0.3)] text-white', score: 1 },
  { label: 'Increíble', emoji: '😄', colorClass: 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-white', score: 2 },
];
const ENERGIES: Energy[] = ['Baja', 'Media', 'Alta'];

export default function MoodTracker() {
  // App State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<Record<string, MoodEntry>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [isMounted, setIsMounted] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');

  // Firebase/Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(true);

  // Form State
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [note, setNote] = useState('');
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [word, setWord] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load from local storage initially
  useEffect(() => {
    setIsMounted(true);
    const savedMoods = localStorage.getItem('gb_moods');
    const savedPhotos = localStorage.getItem('gb_photos');
    if (savedMoods) { try { setEntries(JSON.parse(savedMoods)); } catch (e) {} }
    if (savedPhotos) { try { setPhotos(JSON.parse(savedPhotos)); } catch (e) {} }
  }, []);

  // Sync with Firestore when auth changes
  useEffect(() => {
    const checkConfig = () => {
      if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        setIsFirebaseConfigured(false);
      }
    };
    checkConfig();

    if (!isFirebaseConfigured || !auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser && db) {
        try {
          // Fetch cloud data
          const userDocRef = doc(db, 'users', currentUser.uid);
          const moodsRef = collection(userDocRef, 'moods');
          const photosRef = collection(userDocRef, 'photos');
          
          const [moodDocs, photoDocs] = await Promise.all([
            getDocs(moodsRef),
            getDocs(photosRef)
          ]);

          const cloudMoods: Record<string, MoodEntry> = {};
          moodDocs.forEach(doc => { cloudMoods[doc.id] = doc.data() as MoodEntry; });
          
          const cloudPhotos: Record<string, string> = {};
          photoDocs.forEach(doc => { 
             const data = doc.data();
             if (data.base64) cloudPhotos[doc.id] = data.base64; 
          });

          // Read current local state (to avoid replacing with older hook closures)
          const currentLocalMoodsStr = localStorage.getItem('gb_moods');
          const currentLocalPhotosStr = localStorage.getItem('gb_photos');
          
          const currentLocalMoods = currentLocalMoodsStr ? JSON.parse(currentLocalMoodsStr) : {};
          const currentLocalPhotos = currentLocalPhotosStr ? JSON.parse(currentLocalPhotosStr) : {};

          // Merge: Cloud overwrites local
          const mergedMoods = { ...currentLocalMoods, ...cloudMoods };
          const mergedPhotos = { ...currentLocalPhotos, ...cloudPhotos };
          
          setEntries(mergedMoods);
          setPhotos(mergedPhotos);
          localStorage.setItem('gb_moods', JSON.stringify(mergedMoods));
          localStorage.setItem('gb_photos', JSON.stringify(mergedPhotos));
          
          // Optionally push local-only data to cloud here if needed for robust sync, 
          // but for simplicity we rely on Cloud being the main source of truth once logged in.
        } catch (error) {
          console.error("Error al sincronizar con Firebase:", error);
        }
      }
    });

    return () => unsubscribe();
  }, [isFirebaseConfigured]);

  // Update form fields when date changes
  useEffect(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const entry = entries[dateKey];
    if (entry) {
      setSelectedMood(entry.emoji);
      setNote(entry.note || '');
      setEnergy(entry.energy || null);
      setWord(entry.word || '');
    } else {
      setSelectedMood(null); setNote(''); setEnergy(null); setWord('');
    }
  }, [selectedDate, entries]);

  // Actions
  const handleLogin = async () => {
    if (!isFirebaseConfigured || !auth) {
      alert("⚠️ ¡Ateción! Para usar la Nube debes completar la configuración.\n\nVe al panel izquierdo de AI Studio (Settings > Secrets / Variables) y añade las variables de tu proyecto de Firebase. \n\nEjemplo: NEXT_PUBLIC_FIREBASE_API_KEY");
      return;
    }
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { console.error("Error login:", error); }
  };

  const handleLogout = async () => {
    try { if (auth) await signOut(auth); } catch (error) { console.error("Error logout:", error); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMood) return;

    setIsSaving(true);
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const newEntry: MoodEntry = { emoji: selectedMood, note, energy, word, timestamp: Date.now() };

    // Update Local
    const newEntries = { ...entries, [dateKey]: newEntry };
    setEntries(newEntries);
    localStorage.setItem('gb_moods', JSON.stringify(newEntries));

    // Update Cloud
    if (user && db) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'moods', dateKey), newEntry);
      } catch (error) {
        console.error("Error guardando en la nube", error);
      }
    }

    setTimeout(() => setIsSaving(false), 600);
  };

  const handlePhotoUpload = async (weekIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      const base64 = await compressImage(file);
      const photoKey = `${format(currentMonth, 'yyyy-MM')}-W${weekIndex}`;
      
      // Update Local
      const newPhotos = { ...photos, [photoKey]: base64 };
      setPhotos(newPhotos);
      localStorage.setItem('gb_photos', JSON.stringify(newPhotos));

      // Update Cloud
      if (user && db) {
        await setDoc(doc(db, 'users', user.uid, 'photos', photoKey), { base64 });
      }
    } catch (err) {
      console.error("Error comprimiendo/guardando imagen", err);
      alert("Hubo un error al procesar la imagen.");
    }
  };

  const handleRemovePhoto = async (weekIndex: number) => {
    const photoKey = `${format(currentMonth, 'yyyy-MM')}-W${weekIndex}`;
    
    // Update Local
    const newPhotos = { ...photos };
    delete newPhotos[photoKey];
    setPhotos(newPhotos);
    localStorage.setItem('gb_photos', JSON.stringify(newPhotos));

    // Update Cloud (Empty doc or delete logic, here we overwrite with empty info to keep simple)
    if (user && db) {
      try {
         await setDoc(doc(db, 'users', user.uid, 'photos', photoKey), { deleted: true });
      } catch(e) { console.error(e) }
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const weeksCount = getWeeksInMonth(currentMonth, { weekStartsOn: 1 });

  const getMonthlyInsights = () => {
    const monthPrefix = format(currentMonth, 'yyyy-MM');
    const monthEntries = Object.entries(entries).filter(([date]) => date.startsWith(monthPrefix));
    let totalScore = 0; let count = monthEntries.length;
    monthEntries.forEach(([_, entry]) => { totalScore += MOODS.find(m => m.label === entry.emoji)?.score || 0; });
    if (count === 0) return { title: 'Aún no hay datos suficientes', tip: 'Registra tus estados de animo este mes.' };
    const avg = totalScore / count;
    if (avg > 0.5) return { title: '¡Energía Positiva!', tip: 'Ha sido un gran mes. Comparte tu buena energía.' };
    if (avg < -0.5) return { title: 'Tiempo para Cuidarte', tip: 'Días difíciles. Dedica 5 minutos al día a respirar.' };
    return { title: 'Equilibrio Estable', tip: 'Mes equilibrado. Introduce un pequeño nuevo hábito.' };
  };

  if (!isMounted) return null;
  const insights = getMonthlyInsights();

  return (
    <>
      {/* TopAppBar */}
      <nav className="fixed top-0 w-full flex justify-between items-center px-6 py-4 bg-background/60 backdrop-blur-xl z-50 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]">
        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-2xl font-bold text-on-surface tracking-tighter font-headline">G.B MoodTracker</span>
          {/* Cloud/Local Indicator */}
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-label font-bold px-3 py-1.5 rounded-full border border-outline-variant/30 bg-surface-container shadow-inner">
            {user ? (
              <><Cloud size={14} className="text-emerald-400" /> <span className="text-emerald-400">En la nube</span></>
            ) : (
              <><CloudOff size={14} className="text-on-surface-variant" /> <span className="text-on-surface-variant">Modo Local</span></>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <button onClick={() => setViewMode('daily')} className={cn("font-headline transition-all", viewMode === 'daily' ? "text-primary font-semibold" : "text-on-surface-variant hover:text-on-surface")}>Inicio</button>
          <button onClick={() => setViewMode('monthly')} className={cn("font-headline transition-all px-3 py-1 rounded-lg", viewMode === 'monthly' ? "text-primary font-semibold bg-surface-container-high" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Resumen</button>
        </div>
        
        {/* Auth Button */}
        {user ? (
          <div className="flex items-center gap-3">
             <div className="hidden sm:block text-right">
                <p className="text-sm font-headline text-on-surface leading-tight">{user.displayName?.split(' ')[0]}</p>
             </div>
             {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-primary/30" />
             ) : (
                <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-primary"><UserIcon size={16}/></div>
             )}
             <button onClick={handleLogout} className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:text-rose-400 transition-colors ml-2" title="Cerrar sesión">
                 <LogOut size={18} />
             </button>
          </div>
        ) : (
          <button onClick={handleLogin} className="bg-surface-container-high text-primary font-medium px-5 py-2 rounded-full border border-primary/20 hover:bg-primary hover:text-on-primary transition-all duration-300 active:scale-95">
            Conectar con Google
          </button>
        )}
      </nav>

      {/* Main Content */}
      <main className="pt-28 pb-32 px-6 max-w-7xl mx-auto min-h-[100dvh]">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0">
          <div className="max-w-2xl">
            <h1 className="text-5xl font-headline font-light tracking-tight text-on-surface mb-4">
              Tu <span className="text-primary font-semibold">Santuario</span> Digital
            </h1>
            <p className="text-on-surface-variant text-lg max-w-md">Reflexiona sobre tu día, captura tus emociones y observa el flujo de tu bienestar mental.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-10">
          {/* Calendar Left */}
          <section className="lg:col-span-6 xl:col-span-7 flex flex-col gap-6">
            <div className="glass-panel p-8 rounded-[2.5rem] border border-outline-variant/5 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>
              
              <div className="flex justify-between items-center mb-10 relative z-10">
                <div>
                  <h2 className="text-2xl font-headline font-semibold text-on-surface capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</h2>
                  <p className="text-on-surface-variant font-label text-xs uppercase tracking-widest mt-1">Vista Mensual</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"><ChevronLeft size={20} /></button>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"><ChevronRight size={20} /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-y-6 gap-x-4 relative z-10">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                  <div key={day} className="text-center text-outline font-label text-[10px] uppercase tracking-tighter">{day}</div>
                ))}
                {calendarDays.map((day, i) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const entry = entries[dateKey];
                  const moodConfig = entry ? MOODS.find(m => m.label === entry.emoji) : null;
                  const isSelected = isSameDay(day, selectedDate) && viewMode === 'daily';
                  const isCurrentMonth = isSameMonth(day, monthStart);

                  return (
                    <motion.div key={day.toString()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => { setSelectedDate(day); setViewMode('daily'); }}
                      className={cn(
                        "aspect-square flex items-center justify-center rounded-2xl text-sm cursor-pointer transition-all relative",
                        !isCurrentMonth ? "text-outline/30" : "text-on-surface",
                        !entry && isCurrentMonth && "bg-surface-container-highest border border-outline-variant/10 hover:border-primary/40",
                        entry && moodConfig && moodConfig.colorClass,
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background font-bold"
                      )}
                    >
                      {format(day, 'd')}
                      {isToday(day) && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
                    </motion.div>
                  );
                })}
              </div>
            </div>

             <button onClick={() => setViewMode(viewMode === 'monthly' ? 'daily' : 'monthly')} className="w-full flex items-center justify-center gap-3 py-4 rounded-[2rem] bg-surface-container-highest border border-outline-variant/10 text-on-surface hover:bg-surface-container-high hover:border-primary/30 transition-all font-headline">
               {viewMode === 'monthly' ? <CalendarIcon size={20} className="text-primary"/> : <Sparkles size={20} className="text-primary" />}
               {viewMode === 'monthly' ? "Volver al registro diario" : `Ver los recuerdos y consejos del mes`}
             </button>
          </section>

          {/* Form / Summary Right */}
          <section className="lg:col-span-6 xl:col-span-5 relative">
            <AnimatePresence mode="wait">
              {viewMode === 'daily' ? (
                <motion.div key="daily" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-panel p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-xl relative overflow-hidden">
                  <h3 className="text-xl font-headline font-semibold text-on-surface mb-2">{isToday(selectedDate) ? '¿Cómo te sientes hoy?' : `Reflexión del ${format(selectedDate, "d 'de' MMMM", { locale: es })}`}</h3>
                  <p className="text-sm text-on-surface-variant mb-8 font-label">{entries[format(selectedDate, 'yyyy-MM-dd')] ? 'Editando tu registro' : 'Crea un nuevo registro'}</p>

                  <form onSubmit={handleSave} className="space-y-8 relative z-10">
                    <div className="flex justify-between items-center gap-2">
                      {MOODS.map(mood => {
                        const isSelected = selectedMood === mood.label;
                        return (
                          <button key={mood.label} type="button" onClick={() => setSelectedMood(mood.label)} className="group flex flex-col items-center gap-2 relative">
                            <motion.span animate={{ scale: isSelected ? 1.3 : 1, filter: isSelected ? 'grayscale(0%)' : 'grayscale(100%)' }} whileHover={{ scale: 1.2, filter: 'grayscale(0%)' }} className="text-4xl transition-all block">{mood.emoji}</motion.span>
                            <span className={cn("text-[10px] uppercase tracking-widest font-label transition-opacity absolute -bottom-5 whitespace-nowrap", isSelected ? "text-primary opacity-100" : "text-on-surface-variant opacity-0 group-hover:opacity-100")}>{mood.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-3 pt-4">
                      <label className="block text-sm font-label text-on-surface-variant ml-1">¿Qué ha pasado hoy?</label>
                      <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={150} className="w-full bg-surface-container-highest border-none rounded-2xl p-4 text-on-surface focus:ring-1 focus:ring-primary/40 min-h-[120px] placeholder:text-outline-variant/50 transition-all resize-none" placeholder="Escribe tus reflexiones aquí..." />
                      <div className="text-right text-[10px] font-label text-outline uppercase tracking-widest">{note.length}/150 caracteres</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <label className="block text-sm font-label text-on-surface-variant ml-1">Energía</label>
                        <div className="flex bg-surface-container-highest rounded-full p-1 border border-outline-variant/10">
                          {ENERGIES.map(e => <button key={e} type="button" onClick={() => setEnergy(e)} className={cn("flex-1 py-2 text-xs font-label rounded-full transition-colors", energy === e ? "bg-primary/20 text-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container-high")}>{e}</button>)}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="block text-sm font-label text-on-surface-variant ml-1">Palabra del día</label>
                        <input type="text" value={word} onChange={e => setWord(e.target.value)} maxLength={30} className="w-full bg-surface-container-highest border-none rounded-full px-4 py-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/40 placeholder:text-outline-variant/50 transition-all" placeholder="Escribe la palabra del día" />
                      </div>
                    </div>

                    <motion.button whileTap={{ scale: 0.95 }} animate={isSaving ? { scale: [1, 1.02, 1], backgroundColor: ['#10b981', '#34d399', '#10b981'] } : {}} type="submit" disabled={!selectedMood} className={cn("w-full py-4 font-headline font-bold text-lg rounded-2xl transition-all duration-300 relative overflow-hidden", selectedMood ? "bg-gradient-to-tr from-primary to-primary-dim text-[#060e20] shadow-[0_20px_40px_rgba(16,185,129,0.2)] hover:shadow-[0_25px_50px_rgba(16,185,129,0.4)]" : "bg-surface-container-highest text-outline-variant cursor-not-allowed")}>
                      <span className="relative z-10">{isSaving ? 'Guardado ✨' : 'Guardar reflexión'}</span>
                    </motion.button>
                  </form>
                </motion.div>
              ) : (
                <motion.div key="monthly" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-xl relative flex flex-col h-[700px]">
                  <div className="flex items-center gap-3 mb-6 shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><Sparkles size={20} /></div>
                    <div><h3 className="text-2xl font-headline font-semibold text-on-surface capitalize">Resumen de {format(currentMonth, 'MMMM', { locale: es })}</h3></div>
                  </div>

                  <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-6 pb-6">
                    <div className="bg-gradient-to-br from-surface-container-high to-surface-container hover:to-surface-container-highest border border-primary/20 rounded-2xl p-5 shadow-lg transition-all group">
                       <h4 className="font-headline font-semibold text-primary mb-2 flex items-center gap-2">{insights.title}</h4>
                       <p className="font-label text-sm text-on-surface leading-relaxed opacity-90">{insights.tip}</p>
                    </div>

                    <div>
                      <h4 className="font-headline text-lg font-medium text-on-surface mb-4 flex items-center gap-2"><ImageIcon size={18} className="text-on-surface-variant"/>Recuerdos Semanales</h4>
                      <p className="text-xs text-on-surface-variant mb-4 font-label">Guarda una foto especial que resuma cada semana de este mes.</p>
                      <div className="grid grid-cols-2 gap-4">
                        {Array.from({ length: weeksCount }).map((_, i) => {
                          const weekNum = i + 1;
                          const photoKey = `${format(currentMonth, 'yyyy-MM')}-W${weekNum}`;
                          const currentPhoto = photos[photoKey];

                          return (
                            <div key={weekNum} className="bg-surface-container-highest rounded-2xl p-3 border border-outline-variant/10">
                              <div className="text-[10px] font-label text-on-surface-variant mb-2 uppercase tracking-widest text-center">Semana {weekNum}</div>
                              {currentPhoto && !currentPhoto.startsWith('deleted') ? (
                                <div className="relative aspect-square rounded-xl overflow-hidden group">
                                  <img src={currentPhoto} alt={`Recuerdo ${weekNum}`} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                                  <button onClick={() => handleRemovePhoto(weekNum)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white hover:text-rose-400"><Trash2 size={24} /></button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center aspect-square bg-surface rounded-xl border-2 border-dashed border-outline-variant/30 cursor-pointer hover:border-primary/50 hover:bg-surface-container transition-colors group">
                                  <Camera className="text-outline-variant mb-2 group-hover:text-primary transition-colors" size={24} />
                                  <span className="text-[10px] text-on-surface-variant font-label text-center px-2">Subir foto</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(weekNum, e)} />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}} />
    </>
  );
}
