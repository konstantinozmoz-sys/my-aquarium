import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, Activity, Fish, Plus, Save, AlertTriangle, 
  CheckCircle, Trash2, User, LogOut, Crown, Mail, MapPin, Lock,
  Edit2, X, ChevronDown, Calendar, RefreshCw, Settings, Info,
  Camera, FileText, UploadCloud, Loader2, Stethoscope, Sparkles, 
  ScanLine, Wrench, Calculator, ArrowLeft, Beaker, Box, Layers, TrendingDown
} from 'lucide-react';

// --- Подключение Firebase ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  onSnapshot 
} from "firebase/firestore";

// --- КОНФИГУРАЦИЯ FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAje8rftBvZuC0cFJSh5He4oHsUVT0xZnU",
  authDomain: "marinekeeper.firebaseapp.com",
  projectId: "marinekeeper",
  storageBucket: "marinekeeper.firebasestorage.app",
  messagingSenderId: "3819422761",
  appId: "1:3819422761:web:3f40c57060ea878987c838",
  measurementId: "G-RDWEZCWREF"
};

// --- Google Gemini API Key ---
const GOOGLE_API_KEY = "AIzaSyBH2CWzRv4vmJsnX1_j15MbKAE4lDgABn8"; 

// Инициализация сервисов
let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Error:", e);
}

// --- КОНСТАНТЫ И СПРАВОЧНИКИ ---

// Идеальные диапазоны для морской воды
const IDEAL_PARAMS = {
  salinity: { min: 33, max: 36, unit: 'ppt', name: 'Соленость' },
  kh: { min: 7.5, max: 11.0, unit: 'dKH', name: 'Alkalinity' },
  ca: { min: 400, max: 480, unit: 'ppm', name: 'Calcium' },
  mg: { min: 1250, max: 1400, unit: 'ppm', name: 'Magnesium' },
  no3: { min: 2, max: 15, unit: 'ppm', name: 'Nitrate' },
  po4: { min: 0.03, max: 0.1, unit: 'ppm', name: 'Phosphate' },
  temp: { min: 24, max: 27, unit: '°C', name: 'Температура' }
};

// Типы кораллов и краткие советы по уходу
const CORAL_TYPES = {
  sps: { label: 'SPS (Жесткие)', care: 'Свет++, Течение++, Стабильность++' },
  lps: { label: 'LPS (Мясистые)', care: 'Свет+, Кормление+, Умеренное течение' },
  soft: { label: 'Мягкие', care: 'Неприхотливые, умеренный свет' },
};

// Начальные значения для новой системы
const DEFAULT_PARAMS = {
  salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
};

// Коэффициенты для химических калькуляторов (на грамм/литр)
const CALC_DATA = {
  kh: {
    'nahco3': { label: 'Сода пищевая (NaHCO3)', coeff: 0.03 },
    'na2co3': { label: 'Сода кальцинированная (Na2CO3)', coeff: 0.01884 }
  },
  ca: {
    'anhydrous': { label: 'Безводный (CaCl2)', coeff: 0.00277 },
    'dihydrate': { label: 'Дигидрат (CaCl2•2H2O)', coeff: 0.003665 },
    'hexahydrate': { label: 'Гексагидрат (CaCl2•6H2O)', coeff: 0.005465 }
  },
  balling: {
    ca: {
      'anhydrous': { label: 'Безводный (CaCl2)', coeff: 53.9 },
      'dihydrate': { label: 'Дигидрат (CaCl2•2H2O)', coeff: 71.2 },
      'hexahydrate': { label: 'Гексагидрат (CaCl2•6H2O)', coeff: 106.15 }
    },
    buffer: {
      'nahco3': { label: 'Сода пищевая (NaHCO3)', coeff: 82.0 },
      'na2co3': { label: 'Сода кальцинированная (Na2CO3)', coeff: 51.5 }
    }
  },
  gravel: {
    'arbitrary': { label: 'Обычный грунт', density: 1.4 },
    'caribsea': { label: 'Арагонит (CaribSea)', density: 1.6 },
    'quartz': { label: 'Кварцевый песок', density: 1.5 },
    'marble': { label: 'Мраморная крошка', density: 2.6 }
  }
};

export default function App() {
  // Основные состояния приложения
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Состояния авторизации
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');

  // Состояния аквариумов
  const [aquariums, setAquariums] = useState([]); 
  const [selectedAqId, setSelectedAqId] = useState(null); 
  const [editingSettingsId, setEditingSettingsId] = useState(null);
  const [tempName, setTempName] = useState('');
  const [tempVolume, setTempVolume] = useState('');
  const [tempUnit, setTempUnit] = useState('L');
  const [isCreating, setIsCreating] = useState(false);
  const [newAqData, setNewAqData] = useState({ name: '', volume: '100', unit: 'L' });
  const [deleteConfirmationId, setDeleteConfirmationId] = useState(null);
  const [waterChangeModal, setWaterChangeModal] = useState(null); 
  const [wcAmount, setWcAmount] = useState('');
  const [wcUnit, setWcUnit] = useState('L');
  const [livestock, setLivestock] = useState([]);

  // --- 1. Работа с Firebase (Авторизация и Подписка на данные) ---
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.aquariums) {
               // Исправление данных в реальном времени (миграция)
               const fixed = data.aquariums.map(aq => ({
                   ...aq,
                   volume: aq.volume || 100,
                   volumeUnit: aq.volumeUnit || 'L',
                   lastWaterChange: aq.lastWaterChange || new Date().toISOString(),
                   stabilityStatus: aq.stabilityStatus || 'stable'
               }));
               setAquariums(fixed);
               if (!selectedAqId && fixed.length > 0) setSelectedAqId(fixed[0].id);
            }
            setUserData(data);
            if (data.livestock) setLivestock(data.livestock);
          } else {
            createGoogleProfile(currentUser);
          }
          setLoading(false);
        });
        return () => unsubDoc();
      } else {
        setUserData(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [selectedAqId]);

  // Функция первичного создания профиля (для Google Auth)
  const createGoogleProfile = async (userAuth) => {
    const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
    const newUser = {
      email: userAuth.email, uid: userAuth.uid, registeredAt: new Date().toISOString(),
      subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
      personalInfo: { fullName: userAuth.displayName || 'Aquarist', city: '' },
      aquariums: [{ id: Date.now().toString(), name: 'Основной Риф', params: DEFAULT_PARAMS, volume: 100, volumeUnit: 'L', lastWaterChange: new Date().toISOString(), stabilityStatus: 'stable' }],
      livestock: []
    };
    await setDoc(doc(db, "users", userAuth.uid), newUser);
  };

  // --- 2. Обработчики Авторизации ---
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
      await setDoc(doc(db, "users", cred.user.uid), {
        email, uid: cred.user.uid, registeredAt: new Date().toISOString(),
        subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
        personalInfo: { fullName, city, dob: '' },
        aquariums: [{ id: Date.now().toString(), name: 'Мой Риф', params: DEFAULT_PARAMS, volume: 100, volumeUnit: 'L', lastWaterChange: new Date().toISOString(), stabilityStatus: 'stable' }],
        livestock: []
      });
    } catch (error) { alert("Ошибка регистрации: " + error.message); }
  };

  const handleEmailLogin = async (e) => { 
    e.preventDefault(); 
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (e) { alert("Ошибка входа: " + e.message); } 
  };

  const handleGoogleLogin = async () => { 
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { alert("Ошибка Google: " + e.message); } 
  };

  // --- 3. Логика управления аквариумами ---
  const confirmCreateAquarium = async () => {
    if (!newAqData.name) { alert("Введите название системы"); return; }
    const n = { id: Date.now().toString(), name: newAqData.name, params: DEFAULT_PARAMS, volume: parseFloat(newAqData.volume), volumeUnit: newAqData.unit, lastWaterChange: new Date().toISOString(), stabilityStatus: 'stable' };
    await updateDoc(doc(db, "users", user.uid), { aquariums: [...aquariums, n] });
    setIsCreating(false);
  };

  const confirmDeleteAquarium = async () => {
    if (aquariums.length <= 1) { alert("Нельзя удалить последний аквариум."); return; }
    const l = aquariums.filter(aq => aq.id !== deleteConfirmationId);
    await updateDoc(doc(db, "users", user.uid), { aquariums: l });
    if (selectedAqId === deleteConfirmationId) setSelectedAqId(l[0]?.id || null);
    setDeleteConfirmationId(null);
  };

  const saveSettings = async () => {
    const l = aquariums.map(aq => aq.id === editingSettingsId ? { ...aq, name: tempName, volume: parseFloat(tempVolume), volumeUnit: tempUnit } : aq );
    await updateDoc(doc(db, "users", user.uid), { aquariums: l });
    setEditingSettingsId(null);
  };

  const performWaterChange = async () => {
      const aq = aquariums.find(a => a.id === waterChangeModal);
      if (!aq) return;
      let am = parseFloat(wcAmount); if (wcUnit !== aq.volumeUnit) am = wcUnit === 'Gal' ? am * 3.785 : am / 3.785;
      const pct = (am / aq.volume) * 100;
      const l = aquariums.map(a => a.id === waterChangeModal ? { ...a, lastWaterChange: new Date().toISOString(), stabilityStatus: pct > 10 ? 'destabilized' : 'stable' } : a);
      await updateDoc(doc(db, "users", user.uid), { aquariums: l });
      setWaterChangeModal(null); setWcAmount('');
      alert(`Подмена ${pct.toFixed(1)}% успешно записана в журнал.`);
  };

  // Анализ параметров для вывода алертов
  const getRecommendations = (p) => {
    const r = [];
    Object.keys(p).forEach(k => {
      if (!IDEAL_PARAMS[k]) return;
      const v = parseFloat(p[k]); const { min, max, name, unit } = IDEAL_PARAMS[k];
      if (v < min) r.push({ type: 'warning', msg: `${name} низко: ${v}. Норма: ${min}-${max} ${unit}` });
      else if (v > max) r.push({ type: 'alert', msg: `${name} высоко: ${v}. Норма: ${min}-${max} ${unit}` });
    });
    return r;
  };

  // --- 4. Представление: Дашборд (Главный экран) ---
  const DashboardView = () => (
    <div className="space-y-8 animate-fadeIn pb-24 leading-none">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic">Keeper Terminal</h1>
          <div className="text-cyan-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-80 italic">
            <MapPin size={10} /> {userData?.personalInfo?.city || 'Novi Sad'}
          </div>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-cyan-600/20 text-cyan-400 p-3 rounded-2xl border border-cyan-500/30 active:scale-90 transition-all shadow-lg ring-1 ring-cyan-500/10">
          <Plus size={24} />
        </button>
      </div>

      {aquariums.map((aq) => {
        const recs = getRecommendations(aq.params);
        const lastWC = new Date(aq.lastWaterChange);
        const daysSinceWC = Math.floor((new Date() - lastWC) / (1000 * 60 * 60 * 24));
        const isStable = daysSinceWC <= 7 && aq.stabilityStatus !== 'destabilized';

        return (
          <div key={aq.id} className="space-y-4 animate-slideUp">
            <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-10 -right-10 p-4 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Activity size={240} /></div>
              
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-8 bg-cyan-500 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.4)]"></div>
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">{aq.name}</h2>
                  <button onClick={() => {setEditingSettingsId(aq.id); setTempName(aq.name); setTempVolume(aq.volume); setTempUnit(aq.volumeUnit);}} className="text-slate-700 hover:text-cyan-400 transition-colors p-1">
                    <Settings size={20}/>
                  </button>
                </div>
                <div className={`text-[9px] font-black px-4 py-2 rounded-full border-2 ${isStable ? 'bg-green-500/10 border-green-500/40 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-red-500/10 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'} tracking-[0.2em] uppercase italic`}>
                   {isStable ? 'Status: Stable' : (aq.stabilityStatus === 'destabilized' ? 'Alert: Shock' : 'Alert: Maintenance')}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8 relative z-10">
                <div className="bg-slate-950 p-5 rounded-[2rem] text-center border border-white/5 shadow-inner">
                  <div className="text-[10px] text-cyan-300/30 font-black uppercase mb-1 tracking-widest leading-none">Salinity</div>
                  <div className={`text-xl font-mono font-black ${aq.params.salinity < 33 || aq.params.salinity > 36 ? 'text-red-400' : 'text-white'}`}>{aq.params.salinity}</div>
                </div>
                <div className="bg-slate-950 p-5 rounded-[2rem] text-center border border-white/5 shadow-inner">
                  <div className="text-[10px] text-cyan-300/30 font-black uppercase mb-1 tracking-widest leading-none">KH</div>
                  <div className={`text-xl font-mono font-black ${aq.params.kh < 7.5 || aq.params.kh > 11 ? 'text-red-400' : 'text-white'}`}>{aq.params.kh}</div>
                </div>
                <div className="bg-slate-950 p-5 rounded-[2rem] flex items-center justify-center border border-white/5 shadow-inner">
                   {recs.length === 0 ? <CheckCircle size={30} className="text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]"/> : <div className="text-yellow-400 font-black text-3xl leading-none italic animate-pulse">!{recs.length}</div>}
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/80 p-6 rounded-[2.5rem] border border-white/5 relative z-10 shadow-2xl">
                <div className="text-[9px] text-slate-600 uppercase font-black tracking-widest leading-relaxed font-bold italic">
                  Volume: {aq.volume}{aq.volumeUnit}<br/>
                  Last Change: {lastWC.toLocaleDateString()}
                </div>
                <button onClick={() => setWaterChangeModal(aq.id)} className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black py-4 px-8 rounded-2xl flex items-center gap-2 transition-all active:scale-95 shadow-xl shadow-cyan-900/40 uppercase tracking-widest italic">
                  <RefreshCw size={14}/> Change
                </button>
              </div>
            </div>

            <div className="px-2 space-y-3">
              {recs.map((rec, i) => (
                <div key={i} className={`p-5 rounded-[2rem] text-[11px] font-black uppercase tracking-tight flex gap-4 items-center border shadow-xl ${rec.type === 'alert' ? 'bg-red-500/5 border-red-500/20 text-red-400 shadow-red-900/10' : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-300 shadow-yellow-900/10'}`}>
                  <AlertTriangle size={18} className="shrink-0 opacity-50"/>
                  <span className="leading-tight">{rec.msg}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // --- 5. Представление: ICP Сканнер ---
  const ParametersView = () => {
    const activeAq = aquariums.find(a => a.id === selectedAqId) || aquariums[0];
    const [localParams, setLocalParams] = useState(activeAq ? activeAq.params : DEFAULT_PARAMS);
    const [isAnalyzing, setIsAnalyzing] = useState(false); 

    useEffect(() => { if(activeAq) setLocalParams(activeAq.params); }, [activeAq]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsAnalyzing(true);
        try {
            const base64Data = await new Promise((resolve) => {
                const r = new FileReader(); r.onloadend = () => resolve(r.result.split(',')[1]); r.readAsDataURL(file);
            });
            
            // ИСПРАВЛЕНО: используем правильную модель
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Analyze this image of an aquarium water test report (ICP). Extract: Salinity, KH (Alkalinity), Calcium, Magnesium, Nitrate, Phosphate. Return ONLY a valid JSON object with keys: salinity, kh, ca, mg, no3, po4. Use numbers only. If a value is missing, use null. No markdown, no extra text." },
                        { inline_data: { mime_type: file.type, data: base64Data } }
                    ]}]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const cleanJson = text.replace(/```json|```/g, '').trim();
                const res = JSON.parse(cleanJson);
                setLocalParams(prev => ({ ...prev, salinity: res.salinity || prev.salinity, kh: res.kh || prev.kh, ca: res.ca || prev.ca, mg: res.mg || prev.mg, no3: res.no3 || prev.no3, po4: res.po4 || prev.po4 }));
                alert("Данные успешно распознаны ИИ!");
            }
        } catch (e) { alert(`Scan Error: ${e.message}`); } finally { setIsAnalyzing(false); }
    };

    return (
      <div className="pb-24 animate-fadeIn space-y-6 leading-none">
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter px-1 italic">ICP Analysis</h2>
        <div className="flex bg-slate-900 p-2 rounded-[2rem] relative border border-slate-800 shadow-2xl">
          <select className="w-full bg-transparent text-white font-black p-4 outline-none appearance-none uppercase tracking-[0.2em] text-[10px] italic" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <ChevronDown className="absolute right-8 top-7 text-slate-500 pointer-events-none" />
        </div>

        <div className="relative">
            <input type="file" id="icp-upload" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <label htmlFor="icp-upload" className={`w-full flex flex-col items-center justify-center gap-4 p-12 rounded-[3.5rem] border-4 border-dashed border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-all ${isAnalyzing ? 'opacity-50 pointer-events-none' : 'active:scale-95 shadow-2xl shadow-cyan-950/40'}`}>
                <div className="bg-slate-950 p-6 rounded-full shadow-inner ring-1 ring-white/10">
                    {isAnalyzing ? <Loader2 className="animate-spin text-cyan-400" size={40} /> : <ScanLine className="text-cyan-400" size={40}/>}
                </div>
                <div className="text-center">
                    <span className="text-white font-black uppercase tracking-[0.3em] text-xs block mb-1 leading-none">{isAnalyzing ? 'Decoding...' : 'Scanner'}</span>
                    <span className="text-slate-600 font-bold uppercase text-[9px] tracking-widest leading-none">Feed image for auto-sync</span>
                </div>
            </label>
        </div>

        <div className="grid gap-4">
          {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
            <div key={key} className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 flex justify-between items-center shadow-xl transition-all focus-within:border-cyan-500/30 ring-1 ring-white/5">
              <div className="space-y-1">
                <div className="text-slate-100 font-black text-sm uppercase tracking-tight italic leading-none">{c.name}</div>
                <div className="text-[9px] text-slate-700 font-black uppercase tracking-widest leading-none">Normal: {c.min}-{c.max} {c.unit}</div>
              </div>
              <input type="number" step="0.1" value={localParams[key] || ''} onChange={e=>setLocalParams({...localParams, [key]: e.target.value})} className="w-32 bg-slate-950 text-white p-5 rounded-2xl border border-slate-800 text-center font-mono text-xl font-black focus:border-cyan-500 outline-none shadow-inner italic" />
            </div>
          ))}
          <button onClick={async () => {
             const list = aquariums.map(a => a.id === activeAq.id ? {...a, params: localParams} : a);
             await updateDoc(doc(db, "users", user.uid), { aquariums: list });
             alert("Cloud Synced!");
          }} className="w-full bg-cyan-600 text-white p-8 rounded-[3rem] font-black uppercase tracking-[0.4em] mt-8 shadow-2xl shadow-cyan-900/50 active:scale-95 transition-all text-[11px] italic">Commit to History</button>
        </div>
      </div>
    );
  };

  // --- 6. Представление: Тулзы (ПОЛНАЯ ВЕРСИЯ - 7 инструментов) ---
  const ToolsView = () => {
    const [selectedTool, setSelectedTool] = useState(null);

    // Вложенные калькуляторы
    const ConsumptionCalc = () => {
        const [sKH, setSKH] = useState(8.0); const [eKH, setEKH] = useState(7.5); const [hrs, setHrs] = useState(24);
        const stats = useMemo(() => {
            const drop = sKH - eKH; const daily = ((drop / hrs) * 24).toFixed(2);
            let status = 'LOW LOAD'; let color = 'text-green-400';
            if (daily > 1.5) { status = 'HIGH LOAD'; color = 'text-red-400'; }
            else if (daily > 0.5) { status = 'MEDIUM LOAD'; color = 'text-yellow-400'; }
            return { daily, status, color };
        }, [sKH, eKH, hrs]);
        return (
            <div className="space-y-6 animate-fadeIn leading-none">
                <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 space-y-8 shadow-2xl">
                    <div className="grid grid-cols-2 gap-6">
                        <div><label className="text-[10px] text-slate-800 font-black uppercase tracking-widest mb-3 block px-2 leading-none italic">START KH</label><input type="number" step="0.1" value={sKH} onChange={e=>setSKH(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white outline-none font-black text-center text-xl italic" /></div>
                        <div><label className="text-[10px] text-slate-800 font-black uppercase tracking-widest mb-3 block px-2 leading-none italic">END KH</label><input type="number" step="0.1" value={eKH} onChange={e=>setEKH(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white outline-none font-black text-center text-xl italic" /></div>
                    </div>
                    <div><label className="text-[10px] text-slate-800 font-black uppercase tracking-widest mb-3 block px-2 leading-none italic">INTERVAL (HRS)</label><input type="number" value={hrs} onChange={e=>setHrs(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white outline-none font-black text-center text-xl italic" /></div>
                </div>
                <div className="bg-cyan-900/20 p-14 rounded-[4rem] border border-cyan-500/30 text-center shadow-inner relative overflow-hidden ring-1 ring-cyan-500/10">
                    <TrendingDown className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-cyan-500/5 rotate-[-15deg] pointer-events-none" />
                    <div className="text-cyan-400 font-black text-xs uppercase mb-4 tracking-[0.3em] relative z-10 italic leading-none">Daily Demand</div>
                    <div className="text-8xl font-black text-white mb-4 tracking-tighter relative z-10 italic leading-none">{stats.daily} <span className="text-3xl text-cyan-500/30 font-mono not-italic uppercase tracking-widest leading-none">dKH</span></div>
                    <div className={`text-sm font-black ${stats.color} uppercase tracking-[0.2em] relative z-10 leading-none`}>{stats.status}</div>
                </div>
            </div>
        );
    }

    const ChemCalc = ({type}) => {
        const [vol, setVol] = useState(aquariums[0]?.volume || 300);
        const [cur, setCur] = useState(type==='kh'?7:type==='ca'?400:1250);
        const [tgt, setTgt] = useState(type==='kh'?8:type==='ca'?430:1350);
        const [form, setForm] = useState(type==='kh'?'nahco3':type==='ca'?'dihydrate':'hexahydrate');
        const res = useMemo(() => {
            const d = tgt-cur; if (d<=0) return 0;
            const c = type==='kh'?CALC_DATA.kh[form].coeff:(type==='ca'?CALC_DATA.ca[form].coeff:0.008364);
            return (d*vol*c).toFixed(1);
        }, [vol,cur,tgt,form]);
        return (
            <div className="space-y-6 animate-fadeIn leading-none">
                <div className="bg-slate-900 p-10 rounded-[4rem] border border-slate-800 space-y-10 shadow-2xl">
                    {type!=='mg' && (<div><label className="text-[11px] text-slate-800 font-black mb-4 block uppercase tracking-widest px-4 leading-none italic">REAGENT FORMULA</label><select value={form} onChange={e=>setForm(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black uppercase text-sm tracking-tighter shadow-inner italic outline-none">{Object.entries(type==='kh'?CALC_DATA.kh:CALC_DATA.ca).map(([k,v])=> <option key={k} value={k}>{v.label}</option>)}</select></div>)}
                    <div className="space-y-8 leading-none">
                        <div><label className="text-[11px] text-slate-800 font-black mb-4 block uppercase tracking-widest px-4 leading-none italic">NET WATER (L)</label><input type="number" value={vol} onChange={e=>setVol(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-2xl font-mono shadow-inner italic" /></div>
                        <div className="grid grid-cols-2 gap-8 leading-none">
                            <div><label className="text-[10px] text-slate-800 font-black mb-4 block uppercase tracking-widest px-4 leading-none italic">CUR</label><input type="number" value={cur} onChange={e=>setCur(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-xl shadow-inner italic" /></div>
                            <div><label className="text-[10px] text-slate-800 font-black mb-4 block uppercase tracking-widest px-4 leading-none italic">TGT</label><input type="number" value={tgt} onChange={e=>setTgt(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-xl shadow-inner italic" /></div>
                        </div>
                    </div>
                </div>
                <div className="bg-indigo-900/20 p-16 rounded-[5rem] border border-indigo-500/30 text-center shadow-2xl relative overflow-hidden leading-none ring-1 ring-indigo-500/10">
                    <Beaker className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 text-indigo-500/5 pointer-events-none italic" />
                    <div className="text-indigo-400 font-black text-[11px] uppercase mb-5 tracking-[0.6em] relative z-10 italic leading-none">REAGENT DOSE</div>
                    <div className="text-[100px] font-black text-white relative z-10 italic leading-none">{res} <span className="text-3xl text-indigo-500/40 uppercase not-italic tracking-tighter font-black">g</span></div>
                    {type==='kh' && <div className="text-[10px] text-yellow-500 font-black uppercase mt-10 tracking-[0.3em] relative z-10 animate-pulse italic leading-none">SAFETY: LIMIT RISE TO 1 dKH PER 24H</div>}
                </div>
            </div>
        )
    }

    const VolumeGlassCalc = () => {
        const [l, setL] = useState(1000); const [w, setW] = useState(500); const [h, setH] = useState(500);
        const [th, setTh] = useState(10); const [gap, setGap] = useState(30);
        const res = useMemo(() => {
            const ext = Math.round((l*w*h)/1000000);
            const inL = l-th*2; const inW = w-th*2; const inH = h-th-gap;
            const water = Math.round((inL*inW*inH)/1000000);
            return { ext, water };
        }, [l,w,h,th,gap]);
        return (
            <div className="space-y-8 animate-fadeIn leading-none">
                <div className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 grid grid-cols-2 gap-8 shadow-2xl ring-1 ring-white/5">
                    <div className="col-span-2 leading-none"><label className="text-[11px] text-slate-800 font-black uppercase mb-4 block tracking-[0.5em] px-2 italic font-black">DESIGN SPECS (MM)</label></div>
                    <div className="space-y-3">
                        <label className="text-[10px] text-slate-700 uppercase font-black px-2 leading-none italic font-black tracking-widest">Length</label>
                        <input type="number" value={l} onChange={e=>setL(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white font-mono font-black text-xl italic shadow-inner outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] text-slate-700 uppercase font-black px-2 leading-none italic font-black tracking-widest">Width</label>
                        <input type="number" value={w} onChange={e=>setW(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white font-mono font-black text-xl italic shadow-inner outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] text-slate-700 uppercase font-black px-2 leading-none italic font-black tracking-widest">Height</label>
                        <input type="number" value={h} onChange={e=>setH(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white font-mono font-black text-xl italic shadow-inner outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] text-slate-700 uppercase font-black px-2 leading-none italic font-black tracking-widest">Glass</label>
                        <input type="number" value={th} onChange={e=>setTh(e.target.value)} className="w-full bg-slate-950 p-6 rounded-[1.5rem] border border-slate-800 text-white font-mono font-black text-xl italic shadow-inner outline-none" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                    <div className="bg-slate-900 p-12 rounded-[3rem] border border-slate-800 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] italic font-black"><div className="text-[10px] text-slate-700 font-black uppercase mb-4 tracking-[0.3em] leading-none">Gross Vol</div><div className="text-6xl text-white leading-none tracking-tighter">{res.ext}L</div></div>
                    <div className="bg-cyan-600 p-12 rounded-[3rem] text-center shadow-[0_25px_60px_rgba(8,145,178,0.4)] transition-all active:scale-95 italic font-black ring-1 ring-cyan-400/20 leading-none">
                        <div className="text-[10px] text-cyan-200 font-black uppercase mb-4 tracking-[0.3em] leading-none font-black italic">Net Water</div>
                        <div className="text-6xl text-white leading-none tracking-tighter italic font-black">{res.water}L</div>
                    </div>
                </div>
            </div>
        )
    }

    const BallingCalc = () => {
        const [vol, setVol] = useState(5);
        const res = useMemo(() => ({
            ca: (71.2 * vol).toFixed(0),
            kh: (82.0 * vol).toFixed(0),
            salt: (25 * vol).toFixed(0)
        }), [vol]);
        return (
            <div className="space-y-8 animate-fadeIn leading-none font-black italic">
                <div className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 shadow-2xl leading-none">
                    <label className="text-[11px] text-slate-800 font-black uppercase tracking-[0.6em] mb-6 block leading-none italic font-black">CANISTER VOLUME (L)</label>
                    <input type="number" value={vol} onChange={e=>setVol(e.target.value)} className="w-full bg-slate-950 p-10 rounded-[3rem] border border-slate-800 text-white font-black text-center text-6xl font-mono shadow-inner italic outline-none leading-none" />
                </div>
                <div className="space-y-6 leading-none">
                    <div className="bg-blue-900/20 p-10 rounded-[3.5rem] border border-blue-500/20 flex justify-between items-center shadow-xl italic font-black leading-none"><span className="text-sm uppercase text-blue-400 tracking-widest">Ca Cl2 Mix</span><span className="text-4xl text-white leading-none">{res.ca}g</span></div>
                    <div className="bg-purple-900/20 p-10 rounded-[3.5rem] border border-purple-500/20 flex justify-between items-center shadow-xl italic font-black leading-none"><span className="text-sm uppercase text-purple-400 tracking-widest">Buffer Mix</span><span className="text-4xl text-white leading-none">{res.kh}g</span></div>
                    <div className="bg-emerald-900/20 p-10 rounded-[3.5rem] border border-emerald-500/20 flex justify-between items-center shadow-xl italic font-black leading-none"><span className="text-sm uppercase text-emerald-400 tracking-widest">Na-Free Salt</span><span className="text-4xl text-white leading-none">{res.salt}g</span></div>
                </div>
            </div>
        )
    }

    const SandCalcComp = () => {
        const [l, setL] = useState(100); const [w, setW] = useState(50); const [d, setD] = useState(3);
        const [type, setType] = useState('caribsea');
        const res = useMemo(() => {
            const vol = (l * w * d) / 1000;
            const mass = vol * CALC_DATA.gravel[type].density;
            return { vol: vol.toFixed(1), mass: mass.toFixed(1) };
        }, [l, w, d, type]);
        return (
            <div className="space-y-8 animate-fadeIn leading-none italic font-black">
                <div className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 space-y-10 shadow-2xl">
                    <div><label className="text-[11px] text-slate-800 font-black uppercase mb-4 block px-2 leading-none italic">SUBSTRATE TYPE</label><select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black uppercase text-sm italic outline-none">{Object.entries(CALC_DATA.gravel).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-6">
                        <div><label className="text-[10px] text-slate-800 font-black uppercase mb-4 block px-2 leading-none italic italic">L (CM)</label><input type="number" value={l} onChange={e=>setL(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-xl italic outline-none shadow-inner" /></div>
                        <div><label className="text-[10px] text-slate-800 font-black uppercase mb-4 block px-2 leading-none italic italic">W (CM)</label><input type="number" value={w} onChange={e=>setW(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-xl italic outline-none shadow-inner" /></div>
                    </div>
                    <div><label className="text-[11px] text-slate-800 font-black uppercase mb-4 block px-2 leading-none italic font-black">DEPTH (CM)</label><input type="number" value={d} onChange={e=>setD(e.target.value)} className="w-full bg-slate-950 p-7 rounded-[2rem] border border-slate-800 text-white font-black text-center text-3xl shadow-inner italic outline-none" /></div>
                </div>
                <div className="bg-amber-900/20 p-16 rounded-[5rem] border border-amber-500/20 text-center shadow-2xl relative leading-none ring-1 ring-amber-500/10">
                    <div className="text-amber-400 font-black text-[12px] uppercase mb-6 tracking-[0.8em] italic leading-none">ORDER MASS</div>
                    <div className="text-[120px] font-black text-white relative z-10 italic leading-none">{res.mass} <span className="text-3xl text-amber-500/40 uppercase not-italic tracking-tighter font-black">kg</span></div>
                    <div className="text-[11px] text-slate-700 font-black uppercase mt-12 tracking-[0.4em] italic leading-none">Volumetric Weight: {res.vol} Liters</div>
                </div>
            </div>
        )
    }

    if (!selectedTool) {
      const toolsList = [
        { id: 'cons', name: 'Rates', icon: TrendingDown, color: 'text-pink-400', desc: 'Daily demand' },
        { id: 'kh', name: 'Buffer', icon: Activity, color: 'text-purple-400', desc: 'Carbonate dose' },
        { id: 'ca', name: 'Calcium', icon: Activity, color: 'text-blue-400', desc: 'CaCl2 balance' },
        { id: 'mg', name: 'Magnesium', icon: Activity, color: 'text-green-400', desc: 'Ionic sync' },
        { id: 'balling', name: 'Balling', icon: Beaker, color: 'text-yellow-400', desc: '3-Part classic' },
        { id: 'vol', name: 'Volume', icon: Box, color: 'text-cyan-400', desc: 'Glass weight' },
        { id: 'sand', name: 'Substrate', icon: Layers, color: 'text-amber-500', desc: 'Sand mass/depth' },
      ];
      return (
        <div className="pb-24 animate-fadeIn space-y-12 leading-none italic font-black">
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic px-2 leading-none">Terminal</h2>
          <div className="grid grid-cols-2 gap-8 leading-none">
            {toolsList.map(t => (
              <button key={t.id} onClick={() => setSelectedTool(t.id)} className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 flex flex-col items-center gap-8 active:scale-95 transition-all shadow-2xl group relative overflow-hidden leading-none ring-1 ring-white/5">
                <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:scale-150 transition-transform duration-1000 pointer-events-none italic font-black"><t.icon size={160} /></div>
                <div className="bg-slate-950 p-8 rounded-[3rem] shadow-inner group-hover:bg-slate-800 transition-colors ring-2 ring-white/5"><t.icon size={56} className={t.color} /></div>
                <div className="text-center relative z-10 leading-none">
                    <span className="text-sm font-black text-white uppercase block mb-3 tracking-tighter italic leading-none">{t.name}</span>
                    <span className="text-[10px] font-bold text-slate-700 uppercase leading-none tracking-widest leading-none font-black italic">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24 animate-fadeIn space-y-10 leading-none font-black italic">
        <button onClick={() => setSelectedTool(null)} className="flex items-center gap-6 text-cyan-400 font-black text-[12px] uppercase tracking-[0.6em] mb-6 active:scale-90 transition-all hover:text-white leading-none italic"><ArrowLeft size={24}/> Return Directory</button>
        {selectedTool === 'cons' && <ConsumptionCalc />}
        {selectedTool === 'kh' && <ChemCalc type="kh" />}
        {selectedTool === 'ca' && <ChemCalc type="ca" />}
        {selectedTool === 'mg' && <ChemCalc type="mg" />}
        {selectedTool === 'vol' && <VolumeGlassCalc />}
        {selectedTool === 'balling' && <BallingCalc />}
        {selectedTool === 'sand' && <SandCalcComp />}
      </div>
    );
  };

  // --- 7. Представление: Доктор ---
  const DoctorView = () => {
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    const testApi = async () => {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}`);
            const data = await response.json();
            console.log("Available models:", data.models?.map(m => m.name));
            if (data.models) alert("✅ Neural Core Authorized. Check console for available models.");
            else alert("❌ Error: " + JSON.stringify(data.error));
        } catch (e) { alert("❌ Error: " + e.message); }
    };

    const identifyDisease = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader(); reader.onloadend = () => setImagePreview(reader.result); reader.readAsDataURL(file);
        setAnalyzing(true); setResult(null);
        try {
            const base64Data = await new Promise((resolve) => {
                const r = new FileReader(); r.onloadend = () => resolve(r.result.split(',')[1]); r.readAsDataURL(file);
            });
            
            // ИСПРАВЛЕНО: используем правильную модель
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Analyze this aquarium photo. Identify health issues (RTN/STN, parasites, ich, diseases). Reply in Russian. Be clinical but concise. Focus on treatment and recommendations." },
                        { inline_data: { mime_type: file.type, data: base64Data } }
                    ]}]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            setResult(data.candidates?.[0]?.content?.parts?.[0]?.text || "Diagnostic data unavailable.");
        } catch (e) { setResult(`Protocol Error: ${e.message}`); } finally { setAnalyzing(false); }
    };

    return (
        <div className="pb-24 animate-fadeIn space-y-10 leading-none italic font-black">
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic px-1 leading-none">AI Doctor</h2>
            <div className="bg-gradient-to-br from-emerald-900/60 to-teal-950 p-16 rounded-[5rem] border border-emerald-500/20 shadow-2xl relative overflow-hidden leading-none ring-1 ring-emerald-500/10 shadow-emerald-950/50">
                <Stethoscope className="absolute right-[-80px] bottom-[-80px] text-emerald-500/5 w-[500px] h-[500px] rotate-[25deg] pointer-events-none" />
                <p className="text-emerald-100/60 text-[12px] mb-14 relative z-10 font-black uppercase tracking-[0.5em] leading-relaxed italic opacity-80 text-center">Submit photographic evidence for specimen diagnosis. Neural analysis identifying pathogens and biology status.</p>
                <input type="file" id="doc-upload" className="hidden" accept="image/*" onChange={identifyDisease} />
                <label htmlFor="doc-upload" className={`w-full bg-white text-emerald-950 font-black py-10 rounded-[2.5rem] flex items-center justify-center gap-6 cursor-pointer transition-all active:scale-95 relative z-10 shadow-2xl italic leading-none ${analyzing ? 'opacity-50' : 'hover:bg-emerald-50 shadow-emerald-900/50'}`}>
                    {analyzing ? <Loader2 className="animate-spin text-emerald-900" size={36} /> : <Camera size={36} />}
                    {analyzing ? 'SCANNING CORE...' : 'INITIATE ANALYSIS'}
                </label>
                <button onClick={testApi} className="mt-12 text-[10px] text-emerald-500/30 font-black uppercase tracking-[0.8em] w-full text-center hover:text-white transition-colors relative z-10 italic">Core Status Check</button>
            </div>
            {imagePreview && <div className="rounded-[5rem] overflow-hidden border-[12px] border-slate-900 shadow-[0_60px_120px_rgba(0,0,0,1)] animate-fadeIn ring-1 ring-white/10"><img src={imagePreview} className="w-full h-[600px] object-cover" alt="Specimen" /></div>}
            {result && <div className="bg-slate-900 p-14 rounded-[4.5rem] border border-slate-800 animate-slideUp shadow-[0_80px_160px_rgba(0,0,0,1)] relative leading-none ring-1 ring-white/5">
                <div className="absolute top-0 left-16 bg-emerald-500 text-slate-950 px-10 py-4 rounded-full font-black text-[12px] -translate-y-1/2 uppercase tracking-[0.6em] flex items-center gap-4 shadow-[0_15px_40px_rgba(16,185,129,0.5)] italic leading-none"><Sparkles size={20}/> Result</div>
                <div className="text-slate-100 text-lg leading-relaxed whitespace-pre-wrap font-bold pt-8 italic leading-loose opacity-90">{result}</div>
            </div>}
        </div>
    );
  };

  // --- 8. Представление: Жители ---
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('sps');
    const filtered = livestock.filter(l => (l.aqId || aquariums[0]?.id) === selectedAqId);

    return (
      <div className="pb-24 animate-fadeIn space-y-12 leading-none italic font-black">
         <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic px-1 leading-none">Specimens</h2>
         <div className="flex bg-slate-900 p-3 rounded-[3rem] relative border border-slate-800 shadow-2xl ring-1 ring-white/5 leading-none">
          <select className="w-full bg-transparent text-white font-black p-6 outline-none appearance-none uppercase tracking-[0.4em] text-[11px] italic leading-none" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <ChevronDown className="absolute right-12 top-9 text-slate-600" />
        </div>
        <div className="flex justify-between items-center px-10 leading-none italic font-black">
            <span className="text-slate-800 text-[14px] font-black uppercase tracking-[0.8em] italic opacity-50">Log: {filtered.length} units</span>
            <button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-6 rounded-[2rem] text-white active:scale-90 transition-all shadow-[0_20px_40px_rgba(8,145,178,0.5)] ring-1 ring-cyan-400/20"><Plus size={40}/></button>
        </div>
        {isAdding && (
           <div className="bg-slate-900 p-14 rounded-[5rem] border border-slate-800 space-y-12 shadow-[0_60px_120px_rgba(0,0,0,1)] animate-slideDown ring-1 ring-white/5 leading-none font-black italic">
             <input type="text" placeholder="SCIENTIFIC NAME" className="w-full bg-slate-950 border border-slate-800 text-white p-9 rounded-[2.5rem] outline-none focus:border-cyan-500 font-black uppercase tracking-widest text-lg shadow-inner italic leading-none" value={name} onChange={e=>setName(e.target.value)}/>
             <div className="grid grid-cols-3 gap-6 leading-none">
               {Object.keys(CORAL_TYPES).map(t => (<button key={t} onClick={()=>setType(t)} className={`p-8 text-[11px] font-black uppercase rounded-[2.5rem] border-2 transition-all duration-700 ring-offset-4 ring-offset-slate-900 ${type===t ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_15px_30px_rgba(8,145,178,0.4)] scale-110' : 'bg-slate-950 border-slate-800 text-slate-800 opacity-50'}`}>{CORAL_TYPES[t].label.split(' ')[0]}</button>))}
             </div>
             <button onClick={async () => { 
                 if (!name) return;
                 const newL = { id: Date.now(), name, type, date: new Date().toISOString(), aqId: selectedAqId };
                 await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion(newL) }); 
                 setName(''); setIsAdding(false); 
             }} className="w-full bg-cyan-600 text-white p-9 rounded-[3.5rem] font-black uppercase tracking-[0.6em] shadow-[0_40px_80px_rgba(8,145,178,0.6)] italic text-sm leading-none ring-1 ring-cyan-400/30 active:scale-95">AUTHORIZED REGISTRATION</button>
           </div>
        )}
        <div className="space-y-8 px-2 leading-none font-black italic">
            {filtered.length === 0 ? (
                <div className="text-center py-32 opacity-[0.03] leading-none italic font-black"><Fish size={200} className="mx-auto" /></div>
            ) : filtered.map(coral => (
                <div key={coral.id} className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 flex justify-between items-center shadow-2xl group active:bg-slate-950 transition-all duration-700 ring-1 ring-white/5 leading-none italic font-black">
                    <div className="flex items-center gap-12 leading-none italic font-black">
                        <div className={`w-10 h-10 rounded-full ${coral.type === 'sps' ? 'bg-purple-500 shadow-[0_0_40px_rgba(168,85,247,0.8)]' : coral.type === 'lps' ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.8)]' : 'bg-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.8)]'} transition-shadow duration-1000 ring-4 ring-slate-950`}></div>
                        <div>
                            <div className="font-black text-slate-100 uppercase tracking-tighter leading-none mb-4 text-3xl italic leading-none">{coral.name}</div>
                            <div className="text-[12px] text-slate-800 font-black uppercase tracking-[0.6em] leading-none italic">{CORAL_TYPES[coral.type]?.label} • Entry {new Date(coral.date).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <button onClick={async () => { await updateDoc(doc(db, "users", user.uid), { livestock: livestock.filter(l => l.id !== coral.id) }); }} className="text-slate-800 hover:text-red-500 transition-colors p-6 opacity-30 group-hover:opacity-100"><Trash2 size={32}/></button>
                </div>
            ))}
        </div>
      </div>
    );
  };

  // --- 9. Представление: Профиль ---
  const ProfileView = () => {
    const [editMode, setEditMode] = useState(false);
    const [pData, setPData] = useState({ fullName: userData?.personalInfo?.fullName || '', city: userData?.personalInfo?.city || '' });
    const leftDays = useMemo(() => {
        if (!userData?.subscription?.expiresAt) return 0;
        return Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
    }, [userData]);
    return (
      <div className="pb-24 animate-fadeIn space-y-12 leading-none font-black italic">
        <div className="bg-slate-900 p-16 rounded-[5rem] border border-slate-800 flex flex-col items-center text-center shadow-2xl relative overflow-hidden italic leading-none ring-1 ring-white/5 shadow-cyan-950/20">
          <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-cyan-600 to-blue-800 shadow-xl"></div>
          <div className="w-48 h-48 rounded-[4rem] bg-gradient-to-tr from-cyan-600 to-blue-800 flex items-center justify-center text-white font-black text-7xl shadow-[0_50px_100px_rgba(8,145,178,0.6)] ring-[12px] ring-slate-950 mb-12 italic leading-none">{userData?.personalInfo?.fullName?.[0]}</div>
          <h2 className="text-6xl font-black text-white tracking-tighter leading-none uppercase italic leading-none">{userData?.personalInfo?.fullName}</h2>
          <p className="text-[14px] text-slate-800 font-black uppercase tracking-[0.8em] mt-12 leading-none italic leading-none opacity-50">{user.email}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-600/10 to-orange-800/10 p-16 rounded-[5rem] border border-amber-600/20 shadow-2xl relative overflow-hidden leading-none italic font-black">
            <div className="absolute -top-20 -left-20 w-80 h-80 bg-amber-500/10 rounded-full blur-[100px]"></div>
            <div className="flex items-center justify-between mb-12 relative z-10 leading-none">
                <div className="flex items-center gap-10 leading-none"><Crown className="text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]" size={64}/><div><div className="text-amber-100 font-black text-lg uppercase tracking-[0.5em] leading-none mb-3 font-black italic leading-none">Terminal Elite</div><div className="text-amber-800 text-[12px] font-black uppercase tracking-[0.6em] leading-none italic">Unlimited Sector License</div></div></div>
                <div className="text-[100px] font-black text-amber-500 tracking-tighter italic leading-none shadow-amber-950/50">{leftDays}</div>
            </div>
            <div className="w-full bg-slate-950 h-8 rounded-full overflow-hidden border-4 border-white/5 shadow-inner p-2.5 leading-none italic font-black"><div className="bg-gradient-to-r from-amber-600 to-orange-500 h-full rounded-full transition-all duration-1500 shadow-[0_0_60px_rgba(245,158,11,0.7)]" style={{width: `${(leftDays / 30) * 100}%`}}></div></div>
        </div>
        <div className="bg-slate-900 p-16 rounded-[5rem] border border-slate-800 space-y-16 shadow-2xl leading-none italic font-black ring-1 ring-white/5">
            <div className="flex justify-between items-center leading-none"><h3 className="text-[14px] font-black text-slate-800 uppercase tracking-[1em] italic leading-none">OPERATOR</h3><button onClick={async () => { if (editMode) { await updateDoc(doc(db, "users", user.uid), { "personalInfo.fullName": pData.fullName, "personalInfo.city": pData.city }); setEditMode(false); alert("Access Verified"); } else setEditMode(true); }} className="text-cyan-400 text-[12px] font-black uppercase tracking-[0.8em] px-12 py-5 rounded-full border border-cyan-400/30 active:scale-95 transition-all leading-none italic">MODIFY</button></div>
            <div className="space-y-14 leading-none italic font-black">
                <div><label className="text-[12px] text-slate-800 font-black uppercase mb-6 block tracking-[0.8em] px-4 leading-none italic">Codename</label><input disabled={!editMode} value={pData.fullName} onChange={e=>setPData({...pData, fullName: e.target.value})} className="w-full bg-slate-950 text-white p-9 rounded-[2.5rem] outline-none border border-transparent focus:border-cyan-500 disabled:opacity-20 font-black shadow-inner uppercase text-xl tracking-widest italic leading-none italic" /></div>
                <div><label className="text-[12px] text-slate-800 font-black uppercase mb-6 block tracking-[0.8em] px-4 leading-none italic">Sector Hub</label><input disabled={!editMode} value={pData.city} onChange={e=>setPData({...pData, city: e.target.value})} className="w-full bg-slate-950 text-white p-9 rounded-[2.5rem] outline-none border border-transparent focus:border-cyan-500 disabled:opacity-20 font-black shadow-inner uppercase text-xl tracking-widest italic leading-none italic" /></div>
            </div>
        </div>
        <button onClick={() => signOut(auth)} className="w-full py-14 text-red-500 border border-red-900/10 bg-red-900/5 rounded-[6rem] flex items-center justify-center gap-10 font-black uppercase tracking-[1.5em] active:scale-95 transition-all text-sm shadow-2xl italic leading-none ring-1 ring-red-500/10"><LogOut size={40} /> TERMINATE</button>
      </div>
    );
  };

  // --- 10. Рендер окон входа ---
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-fadeIn selection:bg-cyan-500/50 leading-none">
        <div className="w-56 h-56 bg-gradient-to-tr from-cyan-600 to-blue-800 rounded-[6rem] flex items-center justify-center mb-20 shadow-[0_80px_160px_rgba(0,0,0,1)] rotate-12 hover:rotate-0 transition-transform duration-1000 ring-[16px] ring-slate-900/50 leading-none ring-offset-8 ring-offset-slate-950">
            <Fish size={160} strokeWidth={4} className="text-white drop-shadow-2xl italic leading-none" />
        </div>
        <h1 className="text-[130px] font-black text-white mb-8 tracking-tighter uppercase italic leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,1)] font-black">Keeper</h1>
        <p className="text-cyan-200/50 text-[14px] mb-28 font-black uppercase tracking-[1.5em] italic leading-none opacity-30">Neural Hub v2.5</p>
        <div className="w-full max-w-xl bg-slate-900 p-20 rounded-[7rem] border border-slate-800 shadow-[0_100px_200px_rgba(0,0,0,1)] space-y-20 ring-1 ring-white/5 leading-none shadow-cyan-950/20">
            <div className="flex bg-slate-950 p-4 rounded-[3rem] leading-none italic font-black shadow-inner">
                <button onClick={()=>setAuthMode('login')} className={`flex-1 py-10 text-[18px] font-black uppercase rounded-[2.5rem] transition-all duration-1000 leading-none italic font-black ${authMode==='login' ? 'bg-slate-800 text-white shadow-[0_0_60px_rgba(255,255,255,0.05)] ring-1 ring-white/10' : 'text-slate-800'}`}>IDENTIFY</button>
                <button onClick={()=>setAuthMode('register')} className={`flex-1 py-10 text-[18px] font-black uppercase rounded-[2.5rem] transition-all duration-1000 leading-none italic font-black ${authMode==='register' ? 'bg-slate-800 text-white shadow-[0_0_60px_rgba(255,255,255,0.05)] ring-1 ring-white/10' : 'text-slate-800'}`}>RECRUIT</button>
            </div>
            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleRegister} className="space-y-10 leading-none italic font-black font-black">
                {authMode === 'register' && (<><input placeholder="ASSIGN CODE NAME" required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-11 rounded-[3rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xl shadow-inner italic leading-none font-black font-black" /><input placeholder="ASSIGN SECTOR" required value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-11 rounded-[3rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xl shadow-inner italic leading-none font-black font-black" /></>)}
                <input type="email" placeholder="ACCESS EMAIL" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-11 rounded-[3rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xl shadow-inner italic leading-none font-black font-black" />
                <input type="password" placeholder="ACCESS KEY" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-11 rounded-[3rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xl shadow-inner italic leading-none font-black font-black" />
                <button type="submit" className="w-full bg-cyan-600 text-white font-black py-12 rounded-[4rem] transition-all active:scale-95 shadow-[0_50px_100px_rgba(8,145,178,0.8)] uppercase tracking-[1em] text-sm mt-16 italic leading-none font-black font-black ring-2 ring-cyan-400/30">EXECUTE SEQUENCE</button>
            </form>
            <div className="flex items-center gap-12 text-[12px] text-slate-800 font-black uppercase tracking-[1.5em] leading-none font-black font-black opacity-30"><div className="flex-1 h-px bg-slate-800"></div>OR<div className="flex-1 h-px bg-slate-800"></div></div>
            <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-950 font-black py-12 rounded-[4rem] flex items-center justify-center gap-12 active:scale-95 transition-all text-sm uppercase tracking-[1em] shadow-[0_40px_80px_rgba(255,255,255,0.1)] italic leading-none font-black font-black"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10 shadow-2xl" alt="G" /> GOOGLE LINK</button>
        </div>
      </div>
    );
  }

  // --- 11. Навигация (Нижний бар) ---
  const NavItemRender = ({icon: I, label, id}) => (
    <button onClick={()=>setActiveTab(id)} className={`flex flex-col items-center w-full py-10 transition-all duration-1000 ${activeTab===id?'text-cyan-400 scale-150 drop-shadow-[0_0_40px_rgba(34,211,238,1)] font-black italic':'text-slate-800 hover:text-slate-600 opacity-30'}`}>
      <I size={32} strokeWidth={4}/>
      <span className="text-[8px] mt-3 font-black uppercase tracking-tighter leading-none whitespace-nowrap leading-none font-black italic">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans italic leading-none selection:bg-cyan-500/50 scroll-smooth">
      <main className="max-w-md mx-auto min-h-screen relative p-10 leading-none font-black italic">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'tools' && <ToolsView />}
        {activeTab === 'livestock' && <LivestockView />}
        {activeTab === 'doctor' && <DoctorView />}
        {activeTab === 'profile' && <ProfileView />}
      </main>
      
      <nav className="fixed bottom-0 left-0 w-full bg-slate-950/98 backdrop-blur-[60px] border-t-4 border-white/5 pb-safe z-50 shadow-[0_-80px_160px_rgba(0,0,0,1)] rounded-t-[7rem] leading-none ring-1 ring-white/5">
        <div className="max-w-md mx-auto flex justify-around px-10 leading-none font-black italic">
          <NavItemRender icon={Activity} label="COR" id="dashboard"/>
          <NavItemRender icon={Droplets} label="ICP" id="parameters"/>
          <NavItemRender icon={Calculator} label="APP" id="tools"/>
          <NavItemRender icon={Fish} label="BIO" id="livestock"/>
          <NavItemRender icon={Stethoscope} label="DOC" id="doctor"/>
          <NavItemRender icon={User} label="ME" id="profile"/>
        </div>
      </nav>

      {/* --- 12. МОДАЛЬНЫЙ ДВИЖОК --- */}
      {isCreating && (
          <div className="fixed inset-0 bg-black/98 z-[1000] flex items-center justify-center p-6 backdrop-blur-[100px] animate-fadeIn italic font-black"><div className="bg-slate-900 p-16 rounded-[7rem] border border-slate-800 w-full max-w-md shadow-[0_150px_300px_rgba(0,0,0,1)] space-y-20 relative ring-2 ring-white/10 leading-none shadow-cyan-900/10 animate-slideUp"><h2 className="text-6xl font-black text-white uppercase tracking-tighter italic leading-none font-black italic">New Reef</h2><div className="space-y-16 leading-none italic font-black"><div><label className="text-[12px] text-slate-800 font-black uppercase tracking-[1em] mb-6 block px-4 italic font-black leading-none">PROJECT ID</label><input autoFocus value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-black uppercase tracking-tighter text-xl focus:border-cyan-500 shadow-inner italic leading-none ring-1 ring-cyan-500/20"/></div><div><label className="text-[12px] text-slate-800 font-black uppercase tracking-[1em] mb-6 block px-4 italic font-black leading-none">VOLUME</label><div className="flex gap-6 leading-none"><input type="number" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-mono text-5xl font-black shadow-inner italic leading-none ring-1 ring-cyan-500/20"/><select value={newAqData.unit} onChange={e=>setNewAqData({...newAqData, unit: e.target.value})} className="bg-slate-800 border border-slate-800 text-white rounded-[3rem] px-12 outline-none font-black uppercase text-[20px] italic leading-none shadow-2xl ring-1 ring-white/10"><option value="L">L</option><option value="Gal">G</option></select></div></div><button onClick={confirmCreateAquarium} className="w-full bg-cyan-600 text-white font-black py-12 rounded-[5rem] uppercase tracking-[1em] shadow-[0_60px_120px_rgba(8,145,178,1)] active:scale-95 transition-all text-sm italic leading-none font-black ring-4 ring-cyan-400/30">INITIATE</button></div><button onClick={()=>setIsCreating(false)} className="absolute top-20 right-20 text-slate-800 hover:text-white transition-colors leading-none italic font-black"><X size={60}/></button></div></div>
      )}

      {deleteConfirmationId && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[100px] animate-fadeIn italic font-black"><div className="bg-slate-900 p-20 rounded-[8rem] border border-red-900/40 w-full max-w-lg text-center shadow-[0_150px_300px_rgba(239,68,68,0.4)] space-y-20 relative font-black ring-4 ring-red-900/20 leading-none animate-bounceIn"><div className="w-56 h-56 bg-red-900/10 text-red-500 rounded-[5rem] flex items-center justify-center mx-auto shadow-inner border border-red-900/20 leading-none shadow-red-950/50"><Trash2 size={120}/></div><div className="space-y-10 leading-none italic font-black"><h2 className="text-7xl font-black text-white uppercase tracking-tighter leading-none italic font-black font-black">Wipe?</h2><p className="text-slate-700 text-[14px] font-black uppercase tracking-[1em] leading-loose italic font-black opacity-50 px-10">Neural deletion protocol. Biology logs and metrics will be eradicated forever.</p></div><div className="flex gap-10 leading-none font-black italic"><button onClick={()=>setDeleteConfirmationId(null)} className="flex-1 bg-slate-800 text-white py-14 rounded-[3.5rem] font-black uppercase text-sm tracking-[0.5em] italic leading-none ring-1 ring-white/5 active:scale-90 transition-all">ABORT</button><button onClick={confirmDeleteAquarium} className="flex-1 bg-red-600 text-white py-14 rounded-[3.5rem] font-black uppercase text-sm tracking-[0.5em] shadow-[0_40px_80px_rgba(239,68,68,1)] italic leading-none font-black ring-4 ring-red-400/30 active:scale-90 transition-all">PURGE</button></div></div></div>
      )}

      {editingSettingsId && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[100px] animate-fadeIn italic font-black"><div className="bg-slate-900 p-20 rounded-[8rem] border border-slate-800 w-full max-w-lg space-y-20 shadow-[0_150px_300px_rgba(0,0,0,1)] relative italic font-black ring-2 ring-white/5 animate-slideUp"><h2 className="text-5xl font-black text-white uppercase tracking-widest italic leading-none font-black italic underline decoration-cyan-500 decoration-8 underline-offset-[20px]">Re-Config</h2><div className="space-y-16 leading-none italic font-black"><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 leading-none italic font-black">IDENTIFIER</label><input value={tempName} onChange={e=>setTempName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-black shadow-inner uppercase tracking-tighter text-xl focus:border-cyan-500 italic font-black leading-none italic ring-1 ring-cyan-500/20"/></div><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 leading-none italic font-black font-black">NET VOL</label><div className="flex gap-8 leading-none italic font-black"><input type="number" value={tempVolume} onChange={e=>setTempVolume(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-mono text-6xl font-black shadow-inner italic leading-none font-black ring-1 ring-cyan-500/20"/><select value={tempUnit} onChange={e=>setTempUnit(e.target.value)} className="bg-slate-800 text-white rounded-[3rem] px-14 outline-none font-black uppercase text-[24px] italic leading-none shadow-2xl ring-1 ring-white/10"><option value="L">L</option><option value="Gal">G</option></select></div></div><div className="flex gap-8 pt-16 leading-none italic font-black"><button onClick={()=>{setDeleteConfirmationId(editingSettingsId);}} className="flex-1 bg-red-900/20 text-red-500 py-12 rounded-[3.5rem] border-4 border-red-900/30 active:scale-95 font-black uppercase text-[14px] tracking-[1em] italic leading-none ring-1 ring-red-500/20">WIPE</button><button onClick={saveSettings} className="flex-1 bg-cyan-600 text-white py-12 rounded-[3.5rem] font-black shadow-[0_40px_80px_rgba(8,145,178,1)] active:scale-95 uppercase text-[14px] tracking-[1em] italic leading-none font-black ring-4 ring-cyan-400/30">PATCH</button></div></div><button onClick={()=>setEditingSettingsId(null)} className="absolute top-24 right-24 text-slate-800 hover:text-white transition-colors leading-none italic font-black"><X size={60}/></button></div></div>
      )}

      {waterChangeModal && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[100px] animate-fadeIn leading-none italic font-black"><div className="bg-slate-900 p-20 rounded-[8rem] border border-slate-800 w-full max-w-lg shadow-[0_150px_300px_rgba(0,0,0,1)] space-y-20 relative italic leading-none leading-none font-black font-black ring-2 ring-white/5"><h2 className="text-7xl font-black text-white uppercase tracking-tighter italic font-black italic font-black font-black leading-none font-black font-black font-black leading-none font-black font-black font-black leading-none font-black">Refresh</h2><div className="space-y-20 leading-none font-black font-black"><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1.5em] mb-14 block text-center italic leading-none font-black font-black font-black font-black opacity-30">INPUT FRESH MASS</label><div className="flex gap-8 leading-none font-black font-black italic"><input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-16 rounded-[5rem] outline-none text-[120px] font-black text-center font-mono shadow-inner border-cyan-500/20 italic leading-none font-black leading-none"/><select value={wcUnit} onChange={e=>setWcUnit(e.target.value)} className="bg-slate-800 text-white rounded-[4rem] px-16 outline-none font-black uppercase text-xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] border-4 border-white/5 italic leading-none font-black ring-1 ring-white/10"><option value="L">L</option><option value="Gal">G</option></select></div></div><button onClick={performWaterChange} className="w-full bg-cyan-600 text-white font-black py-16 rounded-[5rem] active:scale-95 transition-all shadow-[0_80px_160px_rgba(8,145,178,1)] uppercase tracking-[1.5em] text-sm italic font-black leading-none ring-[12px] ring-cyan-400/30">LOG</button><button onClick={()=>setWaterChangeModal(null)} className="w-full text-slate-800 py-6 uppercase font-black text-[14px] tracking-[2em] hover:text-slate-400 transition-colors italic leading-none font-black opacity-20">ABORT</button></div></div></div>
      )}
    </div>
  );
}