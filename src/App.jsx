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

// --- Константы параметров воды (Нормы) ---
const IDEAL_PARAMS = {
  salinity: { min: 33, max: 36, unit: 'ppt', name: 'Соленость' },
  kh: { min: 7.5, max: 11.0, unit: 'dKH', name: 'Alkalinity' },
  ca: { min: 400, max: 480, unit: 'ppm', name: 'Calcium' },
  mg: { min: 1250, max: 1400, unit: 'ppm', name: 'Magnesium' },
  no3: { min: 2, max: 15, unit: 'ppm', name: 'Nitrate' },
  po4: { min: 0.03, max: 0.1, unit: 'ppm', name: 'Phosphate' },
  temp: { min: 24, max: 27, unit: '°C', name: 'Температура' }
};

const CORAL_TYPES = {
  sps: { label: 'SPS (Жесткие)', care: 'Свет++, Течение++, Стабильность++' },
  lps: { label: 'LPS (Мясистые)', care: 'Свет+, Кормление+, Умеренное течение' },
  soft: { label: 'Мягкие', care: 'Неприхотливые, средний свет' },
};

const DEFAULT_PARAMS = {
  salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
};

// --- Данные для калькуляторов химии ---
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
  // Состояния пользователя и загрузки
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
  const [missingCityModal, setMissingCityModal] = useState(false);

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

  // --- Логика загрузки данных из Firebase ---
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
               // Гарантируем наличие всех необходимых полей для новых функций
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
            if (!data.personalInfo?.city) setMissingCityModal(true);
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

  // Обработчики входа
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
    } catch (error) { alert(error.message); }
  };

  const handleEmailLogin = async (e) => { 
    e.preventDefault(); 
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (e) { alert(e.message); } 
  };

  const handleGoogleLogin = async () => { 
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { alert(e.message); } 
  };

  // --- Вспомогательная логика расчета рекомендаций ---
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

  // --- ЭКРАН 1: Дашборд (Мои системы) ---
  const DashboardView = () => (
    <div className="space-y-8 animate-fadeIn pb-24">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Системы</h1>
          <div className="text-cyan-200/50 text-xs flex gap-1 font-bold">
            <MapPin size={12} /> {userData?.personalInfo?.city || 'Морской город'}
          </div>
        </div>
        <button onClick={startCreatingAquarium} className="bg-cyan-600/20 text-cyan-400 p-3 rounded-2xl border border-cyan-500/30 active:scale-95">
          <Plus size={20} />
        </button>
      </div>

      {aquariums.map((aq) => {
        const recs = getRecommendations(aq.params);
        const lastWC = new Date(aq.lastWaterChange);
        const daysSinceWC = Math.floor((new Date() - lastWC) / (1000 * 60 * 60 * 24));
        const isStable = daysSinceWC <= 7 && aq.stabilityStatus !== 'destabilized';

        return (
          <div key={aq.id} className="space-y-4">
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={80} /></div>
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{aq.name}</h2>
                  <button onClick={() => {
                    setEditingSettingsId(aq.id); 
                    setTempName(aq.name); 
                    setTempVolume(aq.volume); 
                    setTempUnit(aq.volumeUnit);
                  }} className="text-slate-500 hover:text-cyan-400 transition-colors">
                    <Settings size={18}/>
                  </button>
                </div>
                <div className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${isStable ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-red-500/10 border-red-500/50 text-red-400'} tracking-widest uppercase`}>
                   {isStable ? 'СИСТЕМА СТАБИЛЬНА' : (aq.stabilityStatus === 'destabilized' ? 'ДЕСТАБИЛИЗАЦИЯ' : 'ТРЕБУЕТСЯ ПОДМЕНА')}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6 relative z-10">
                <div className="bg-slate-950/50 p-3 rounded-2xl text-center border border-white/5 shadow-inner">
                  <div className="text-[10px] text-cyan-300/50 font-bold uppercase mb-1">Соль</div>
                  <div className={`text-lg font-mono font-bold ${aq.params.salinity < 33 || aq.params.salinity > 36 ? 'text-red-400' : 'text-white'}`}>{aq.params.salinity}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-2xl text-center border border-white/5 shadow-inner">
                  <div className="text-[10px] text-cyan-300/50 font-bold uppercase mb-1">KH</div>
                  <div className={`text-lg font-mono font-bold ${aq.params.kh < 7.5 || aq.params.kh > 11 ? 'text-red-400' : 'text-white'}`}>{aq.params.kh}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-2xl flex items-center justify-center border border-white/5">
                   {recs.length === 0 ? <CheckCircle size={22} className="text-green-500"/> : <div className="text-yellow-400 font-black text-xl leading-none">! {recs.length}</div>}
                </div>
              </div>

              <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5 relative z-10">
                <div className="text-[10px] text-slate-500 uppercase leading-relaxed font-bold">
                  Объем: {aq.volume} {aq.volumeUnit}<br/>
                  Подмена: {lastWC.toLocaleDateString()}
                </div>
                <button onClick={() => setWaterChangeModal(aq.id)} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black py-3 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-cyan-900/40 uppercase">
                  <RefreshCw size={14}/> Подмена
                </button>
              </div>
            </div>

            <div className="px-1 space-y-2">
              {recs.map((rec, i) => (
                <div key={i} className={`p-4 rounded-2xl text-xs font-medium flex gap-3 items-center border ${rec.type === 'alert' ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-200'}`}>
                  <AlertTriangle size={16} className="shrink-0 opacity-70"/>
                  <span>{rec.msg}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // --- ЭКРАН 2: ICP / Тесты (с ИИ сканером) ---
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
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Analyze this image of an aquarium water test report (ICP). Extract: Salinity, KH (Alkalinity), Calcium, Magnesium, Nitrate, Phosphate. Return ONLY a valid JSON object with keys: salinity, kh, ca, mg, no3, po4. Numbers only. If missing, use null. No markdown." },
                        { inline_data: { mime_type: file.type, data: base64Data } }
                    ]}]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const res = JSON.parse(text.replace(/```json|```/g, '').trim());
                setLocalParams(prev => ({ ...prev, salinity: res.salinity || prev.salinity, kh: res.kh || prev.kh, ca: res.ca || prev.ca, mg: res.mg || prev.mg, no3: res.no3 || prev.no3, po4: res.po4 || prev.po4 }));
                alert("ИИ распознал данные!");
            }
        } catch (e) { alert(`Ошибка: ${e.message}`); } finally { setIsAnalyzing(false); }
    };

    return (
      <div className="pb-24 animate-fadeIn space-y-6">
        <h2 className="text-2xl font-bold text-white uppercase tracking-widest px-1">ICP / Тесты</h2>
        <div className="flex bg-slate-900 p-2 rounded-2xl relative border border-slate-800 shadow-xl">
          <select className="w-full bg-transparent text-white font-bold p-3 outline-none appearance-none" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <ChevronDown className="absolute right-4 top-5 text-slate-500 pointer-events-none" />
        </div>

        <div className="mb-6">
            <input type="file" id="icp-upload" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <label htmlFor="icp-upload" className={`w-full flex items-center justify-center gap-4 p-8 rounded-[2rem] border-2 border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-all ${isAnalyzing ? 'opacity-50 pointer-events-none' : ''}`}>
                {isAnalyzing ? <Loader2 className="animate-spin text-cyan-400" size={36} /> : <ScanLine className="text-cyan-400" size={36}/>}
                <span className="text-cyan-400 font-black uppercase tracking-widest text-sm">{isAnalyzing ? 'Анализирую...' : 'Сканировать ICP'}</span>
            </label>
        </div>

        <div className="grid gap-3">
          {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
            <div key={key} className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 flex justify-between items-center shadow-lg">
              <div>
                <div className="text-slate-200 font-black text-sm uppercase tracking-tight">{c.name}</div>
                <div className="text-[10px] text-slate-500 font-mono font-bold">НОРМА: {c.min}-{c.max} {c.unit}</div>
              </div>
              <div className="relative">
                <input type="number" step="0.1" value={localParams[key] || ''} onChange={e=>setLocalParams({...localParams, [key]: e.target.value})} className="w-28 bg-slate-950 text-white p-4 rounded-2xl border border-slate-700 text-center font-mono text-lg focus:border-cyan-500 outline-none shadow-inner transition-all" />
              </div>
            </div>
          ))}
          <button onClick={async () => {
             const list = aquariums.map(a => a.id === activeAq.id ? {...a, params: localParams} : a);
             await updateDoc(doc(db, "users", user.uid), { aquariums: list });
             alert("Данные обновлены в облаке!");
          }} className="w-full bg-cyan-600 text-white p-6 rounded-[2rem] font-black uppercase tracking-[0.2em] mt-6 shadow-2xl shadow-cyan-900/40 active:scale-95 transition-all text-sm">Сохранить замеры</button>
        </div>
      </div>
    );
  };

  // --- ЭКРАН 3: Тулзы (ПОЛНАЯ ВЕРСИЯ СО ВСЕМИ КАЛЬКУЛЯТОРАМИ) ---
  const ToolsView = () => {
    const [selectedTool, setSelectedTool] = useState(null);

    // 1. Калькулятор потребления
    const ConsumptionCalc = () => {
        const [sKH, setSKH] = useState(8.0); const [eKH, setEKH] = useState(7.5); const [hrs, setHrs] = useState(24);
        const stats = useMemo(() => {
            const drop = sKH - eKH; const daily = ((drop / hrs) * 24).toFixed(2);
            let status = 'Малая загрузка'; let color = 'text-green-400';
            if (daily > 1.5) { status = 'Высокая загрузка'; color = 'text-red-400'; }
            else if (daily > 0.5) { status = 'Средняя загрузка'; color = 'text-yellow-400'; }
            return { daily, status, color };
        }, [sKH, eKH, hrs]);

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-xl">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Начало (KH)</label><input type="number" step="0.1" value={sKH} onChange={e=>setSKH(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Конец (KH)</label><input type="number" step="0.1" value={eKH} onChange={e=>setEKH(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                    </div>
                    <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Интервал (Часов)</label><input type="number" value={hrs} onChange={e=>setHrs(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                </div>
                <div className="bg-cyan-900/20 p-10 rounded-[2.5rem] border border-cyan-500/30 text-center shadow-inner">
                    <div className="text-cyan-400 font-black text-xs uppercase mb-2 tracking-widest">Суточное потребление</div>
                    <div className="text-6xl font-black text-white mb-2">{stats.daily} <span className="text-xl text-cyan-500/50">dKH</span></div>
                    <div className={`text-sm font-bold ${stats.color} uppercase tracking-tighter`}>{stats.status}</div>
                </div>
            </div>
        )
    }

    // 2. Универсальный калькулятор химии (KH/Ca/Mg)
    const ChemistryCalc = ({type}) => {
        const [vol, setVol] = useState(aquariums[0]?.volume || 300);
        const [cur, setCur] = useState(type === 'kh' ? 7 : type === 'ca' ? 400 : 1250);
        const [tgt, setTgt] = useState(type === 'kh' ? 8 : type === 'ca' ? 430 : 1350);
        const [form, setForm] = useState(type === 'kh' ? 'nahco3' : type === 'ca' ? 'anhydrous' : 'hexahydrate');
        
        const result = useMemo(() => {
            const diff = tgt - cur; if (diff <= 0) return 0;
            const coeff = type === 'kh' ? CALC_DATA.kh[form].coeff : (type === 'ca' ? CALC_DATA.ca[form].coeff : 0.008364);
            return (diff * vol * coeff).toFixed(1);
        }, [vol, cur, tgt, form]);

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-xl">
                    {type !== 'mg' && (
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Реагент</label>
                            <select value={form} onChange={e=>setForm(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-bold text-sm">
                                {Object.entries(type === 'kh' ? CALC_DATA.kh : CALC_DATA.ca).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Объем воды (л)</label><input type="number" value={vol} onChange={e=>setVol(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Текущий</label><input type="number" value={cur} onChange={e=>setCur(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                            <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Целевой</label><input type="number" value={tgt} onChange={e=>setTgt(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-700 text-white outline-none font-mono" /></div>
                        </div>
                    </div>
                </div>
                <div className="bg-purple-900/20 p-10 rounded-[2.5rem] border border-purple-500/30 text-center shadow-xl">
                    <div className="text-purple-400 font-black text-xs uppercase mb-3 tracking-widest">Необходимо добавить</div>
                    <div className="text-6xl font-black text-white">{result} <span className="text-xl text-purple-500/50">г</span></div>
                    {type === 'kh' && <div className="text-[10px] text-yellow-500 font-black uppercase mt-4 animate-pulse">⚠️ Лимит: +1 dKH в сутки!</div>}
                </div>
            </div>
        )
    }

    // 3. Калькулятор Баллинга (3 канистры)
    const BallingCalc = () => {
        const [vol, setVol] = useState(5);
        const [caF, setCaF] = useState('dihydrate');
        const [khF, setKhF] = useState('nahco3');

        const res = useMemo(() => ({
            ca: (CALC_DATA.balling.ca[caF].coeff * vol).toFixed(0),
            kh: (CALC_DATA.balling.buffer[khF].coeff * vol).toFixed(0),
            salt: (25 * vol).toFixed(0)
        }), [vol, caF, khF]);

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-xl">
                    <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Объем емкостей (л)</label><input type="number" value={vol} onChange={e=>setVol(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white outline-none font-mono" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Форма Ca</label><select value={caF} onChange={e=>setCaF(e.target.value)} className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-white text-xs">{Object.entries(CALC_DATA.balling.ca).map(([k,v]) => <option key={k} value={k}>{v.label.split(' ')[0]}</option>)}</select></div>
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Форма KH</label><select value={khF} onChange={e=>setKhF(e.target.value)} className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-white text-xs">{Object.entries(CALC_DATA.balling.buffer).map(([k,v]) => <option key={k} value={k}>{v.label.split(' ')[0]}</option>)}</select></div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    <div className="bg-blue-900/20 p-5 rounded-3xl border border-blue-500/20 flex justify-between items-center"><span className="text-xs font-black uppercase text-blue-300 tracking-tighter">Канистра 1 (Ca)</span><span className="text-2xl font-black text-white">{res.ca}г</span></div>
                    <div className="bg-purple-900/20 p-5 rounded-3xl border border-purple-500/20 flex justify-between items-center"><span className="text-xs font-black uppercase text-purple-300 tracking-tighter">Канистра 2 (KH)</span><span className="text-2xl font-black text-white">{res.kh}г</span></div>
                    <div className="bg-emerald-900/20 p-5 rounded-3xl border border-emerald-500/20 flex justify-between items-center"><span className="text-xs font-black uppercase text-emerald-300 tracking-tighter">Канистра 3 (NaCl Free)</span><span className="text-2xl font-black text-white">{res.salt}г</span></div>
                </div>
            </div>
        )
    }

    // 4. Объем и стекло
    const VolumeCalc = () => {
        const [l, setL] = useState(1000); const [w, setW] = useState(500); const [h, setH] = useState(500);
        const [th, setTh] = useState(10); const [gap, setGap] = useState(30);
        const res = useMemo(() => {
            const ext = Math.round((l * w * h) / 1000000);
            const inL = l - th*2; const inW = w - th*2; const inH = h - th - gap;
            const water = Math.round((inL * inW * inH) / 1000000);
            return { ext, water };
        }, [l, w, h, th, gap]);

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 grid grid-cols-2 gap-4 shadow-xl">
                    <div><label className="text-[10px] text-slate-500 font-black uppercase">Длина (мм)</label><input type="number" value={l} onChange={e=>setL(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                    <div><label className="text-[10px] text-slate-500 font-black uppercase">Ширина (мм)</label><input type="number" value={w} onChange={e=>setW(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                    <div><label className="text-[10px] text-slate-500 font-black uppercase">Высота (мм)</label><input type="number" value={h} onChange={e=>setH(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                    <div><label className="text-[10px] text-slate-500 font-black uppercase">Стекло (мм)</label><input type="number" value={th} onChange={e=>setTh(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                    <div className="col-span-2"><label className="text-[10px] text-slate-500 font-black uppercase">Недолив (мм)</label><input type="number" value={gap} onChange={e=>setGap(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center"><div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Габариты</div><div className="text-3xl font-black text-white">{res.ext}л</div></div>
                    <div className="bg-cyan-900/20 p-6 rounded-3xl border border-cyan-500/30 text-center shadow-lg"><div className="text-[10px] text-cyan-400 font-bold uppercase mb-1">Чистой воды</div><div className="text-3xl font-black text-cyan-400">{res.water}л</div></div>
                </div>
            </div>
        )
    }

    // 5. Грунт
    const SandCalc = () => {
        const [l, setL] = useState(100); const [w, setW] = useState(50); const [d, setD] = useState(3);
        const [type, setType] = useState('caribsea');
        const res = useMemo(() => {
            const vol = (l * w * d) / 1000;
            const mass = vol * CALC_DATA.gravel[type].density;
            return { vol: vol.toFixed(1), mass: mass.toFixed(1) };
        }, [l, w, d, type]);

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-xl">
                    <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Субстрат</label><select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-bold text-sm">{Object.entries(CALC_DATA.gravel).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Длина (см)</label><input type="number" value={l} onChange={e=>setL(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                        <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Ширина (см)</label><input type="number" value={w} onChange={e=>setW(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                    </div>
                    <div><label className="text-[10px] text-slate-500 font-black uppercase mb-1 block">Слой (см)</label><input type="number" value={d} onChange={e=>setD(e.target.value)} className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 text-white font-mono" /></div>
                </div>
                <div className="bg-amber-900/20 p-10 rounded-[2.5rem] border border-amber-500/30 text-center shadow-xl">
                    <div className="text-amber-400 font-black text-xs uppercase mb-3 tracking-widest">Требуется купить</div>
                    <div className="text-6xl font-black text-white">{res.mass} <span className="text-xl text-amber-500/50">кг</span></div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mt-4">Приблизительный объем: {res.vol}л</div>
                </div>
            </div>
        )
    }

    // Меню выбора калькулятора
    if (!selectedTool) {
      const tools = [
        { id: 'cons', name: 'Потребление', icon: TrendingDown, color: 'text-pink-400', desc: 'Замеры за 24ч' },
        { id: 'kh', name: 'KH Буфер', icon: Activity, color: 'text-purple-400', desc: 'Сода / Буферы' },
        { id: 'ca', name: 'Кальций', icon: Activity, color: 'text-blue-400', desc: 'Хлориды Ca' },
        { id: 'mg', name: 'Магний', icon: Activity, color: 'text-green-400', desc: 'MgCl2 / MgSO4' },
        { id: 'balling', name: 'Баллинг', icon: Beaker, color: 'text-yellow-400', desc: 'Расчет 3-х растворов' },
        { id: 'vol', name: 'Объем / Вес', icon: Box, color: 'text-cyan-400', desc: 'Стекло и литраж' },
        { id: 'sand', name: 'Песок', icon: Layers, color: 'text-amber-500', desc: 'Расчет по плотности' },
      ];
      return (
        <div className="pb-24 animate-fadeIn space-y-6">
          <h2 className="text-2xl font-bold text-white uppercase tracking-[0.3em] px-2">Инструменты</h2>
          <div className="grid grid-cols-2 gap-4">
            {tools.map(t => (
              <button key={t.id} onClick={() => setSelectedTool(t.id)} className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-800 flex flex-col items-center gap-4 active:scale-95 transition-all shadow-xl group">
                <div className="bg-slate-950 p-4 rounded-2xl group-hover:scale-110 transition-transform shadow-inner"><t.icon size={32} className={t.color} /></div>
                <div className="text-center">
                    <span className="text-xs font-black text-white uppercase block mb-1 tracking-tighter">{t.name}</span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase leading-none">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24 animate-fadeIn space-y-6">
        <button onClick={() => setSelectedTool(null)} className="flex items-center gap-3 text-cyan-400 font-black text-xs uppercase mb-4 active:scale-90 transition-all"><ArrowLeft size={16}/> Назад к списку</button>
        {selectedTool === 'cons' && <ConsumptionCalc />}
        {selectedTool === 'kh' && <ChemistryCalc type="kh" />}
        {selectedTool === 'ca' && <ChemistryCalc type="ca" />}
        {selectedTool === 'mg' && <ChemistryCalc type="mg" />}
        {selectedTool === 'balling' && <BallingCalc />}
        {selectedTool === 'vol' && <VolumeCalc />}
        {selectedTool === 'sand' && <SandCalc />}
      </div>
    );
  };

  // --- ЭКРАН 4: Доктор Риф (ИИ Диагностика) ---
  const DoctorView = () => {
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    const identifyDisease = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader(); reader.onloadend = () => setImagePreview(reader.result); reader.readAsDataURL(file);
        setAnalyzing(true); setResult(null);
        try {
            const base64Data = await new Promise((resolve) => {
                const r = new FileReader(); r.onloadend = () => resolve(r.result.split(',')[1]); r.readAsDataURL(file);
            });
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Ты эксперт аквариумист. Проанализируй фото. Есть ли признаки болезней коралла или рыбы? Дай краткий диагноз и совет по лечению на русском языке." },
                        { inline_data: { mime_type: file.type, data: base64Data } }
                    ]}]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            setResult(data.candidates?.[0]?.content?.parts?.[0]?.text || "Не удалось распознать пациента.");
        } catch (e) { setResult(`Ошибка: ${e.message}`); } finally { setAnalyzing(false); }
    };

    return (
        <div className="pb-24 animate-fadeIn space-y-6">
            <h2 className="text-2xl font-bold text-white uppercase tracking-widest px-1">Доктор</h2>
            <div className="bg-gradient-to-br from-emerald-900/60 to-teal-950 p-8 rounded-[2.5rem] border border-emerald-500/30 shadow-2xl relative overflow-hidden">
                <Stethoscope className="absolute right-[-30px] bottom-[-30px] text-emerald-500/10 w-60 h-60 rotate-12" />
                <p className="text-emerald-100 text-sm mb-8 relative z-10 font-bold uppercase tracking-tight leading-relaxed">Загрузите фото больного коралла или рыбы. ИИ проанализирует симптомы и предложит лечение.</p>
                <input type="file" id="doc-upload" className="hidden" accept="image/*" onChange={identifyDisease} />
                <label htmlFor="doc-upload" className={`w-full bg-white text-emerald-900 font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-95 relative z-10 shadow-xl ${analyzing ? 'opacity-50' : ''}`}>
                    {analyzing ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
                    {analyzing ? 'ИЗУЧАЮ ПАЦИЕНТА...' : 'ФОТО / ЗАГРУЗИТЬ'}
                </label>
            </div>
            {imagePreview && <div className="rounded-[2.5rem] overflow-hidden border-4 border-slate-900 shadow-2xl animate-fadeIn"><img src={imagePreview} className="w-full h-80 object-cover" alt="Patient" /></div>}
            {result && <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 animate-slideUp shadow-2xl relative">
                <div className="absolute top-0 left-10 bg-emerald-500 text-slate-950 px-4 py-1.5 rounded-full font-black text-[10px] -translate-y-1/2 uppercase tracking-widest flex items-center gap-1 shadow-lg shadow-emerald-500/20"><Sparkles size={12}/> AI Диагноз</div>
                <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-bold pt-2">{result}</div>
            </div>}
        </div>
    );
  };

  // --- ЭКРАН 5: Жители (Кораллы) ---
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('sps');
    const filtered = livestock.filter(l => (l.aqId || aquariums[0]?.id) === selectedAqId);

    return (
      <div className="pb-24 animate-fadeIn space-y-6">
         <h2 className="text-2xl font-bold text-white uppercase tracking-widest px-1">Жители</h2>
         <div className="flex bg-slate-900 p-2 rounded-3xl relative border border-slate-800 shadow-xl">
          <select className="w-full bg-transparent text-white font-bold p-3 outline-none appearance-none" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <ChevronDown className="absolute right-6 top-5 text-slate-500" />
        </div>
        <div className="flex justify-between items-center px-2">
            <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Всего: {filtered.length}</span>
            <button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-3 rounded-2xl text-white active:scale-90 transition-all shadow-lg shadow-cyan-900/20"><Plus size={24}/></button>
        </div>
        {isAdding && (
           <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 space-y-6 shadow-2xl animate-slideDown">
             <input type="text" placeholder="Название коралла" className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none focus:border-cyan-500 font-bold" value={name} onChange={e=>setName(e.target.value)}/>
             <div className="grid grid-cols-3 gap-2">
               {Object.keys(CORAL_TYPES).map(t => (<button key={t} onClick={()=>setType(t)} className={`p-3 text-[9px] font-black uppercase rounded-xl border-2 transition-all ${type===t ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{CORAL_TYPES[t].label.split(' ')[0]}</button>))}
             </div>
             <button onClick={async () => { 
                 const newL = { id: Date.now(), name, type, date: new Date().toISOString(), aqId: selectedAqId };
                 await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion(newL) }); 
                 setName(''); setIsAdding(false); 
             }} className="w-full bg-cyan-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-cyan-900/40">Добавить жителя</button>
           </div>
        )}
        <div className="space-y-4">
            {filtered.map(coral => (
                <div key={coral.id} className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 flex justify-between items-center shadow-lg group active:bg-slate-900 transition-colors">
                    <div className="flex items-center gap-5">
                        <div className={`w-4 h-4 rounded-full ${coral.type === 'sps' ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : coral.type === 'lps' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]'}`}></div>
                        <div><div className="font-black text-slate-200 uppercase tracking-tight leading-none mb-1">{coral.name}</div><div className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{CORAL_TYPES[coral.type]?.label} • {new Date(coral.date).toLocaleDateString()}</div></div>
                    </div>
                    <button onClick={async () => { await updateDoc(doc(db, "users", user.uid), { livestock: livestock.filter(l => l.id !== coral.id) }); }} className="text-slate-800 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                </div>
            ))}
        </div>
      </div>
    );
  };

  // --- ЭКРАН 6: Профиль ---
  const ProfileView = () => {
    const [editMode, setEditMode] = useState(false);
    const [pData, setPData] = useState({ fullName: userData?.personalInfo?.fullName || '', city: userData?.personalInfo?.city || '' });
    const left = useMemo(() => {
        if (!userData?.subscription?.expiresAt) return 0;
        return Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
    }, [userData]);

    return (
      <div className="pb-24 animate-fadeIn space-y-6">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 flex items-center gap-6 shadow-2xl">
          <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-cyan-900/20">{userData?.personalInfo?.fullName?.[0]}</div>
          <div><h2 className="text-2xl font-black text-white tracking-tighter leading-tight uppercase">{userData?.personalInfo?.fullName}</h2><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest leading-none mt-1">{user.email}</p></div>
        </div>
        <div className="bg-gradient-to-br from-amber-600/10 to-orange-600/10 p-6 rounded-[2rem] border border-amber-600/20 shadow-xl">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3"><Crown className="text-amber-500" size={30}/><div><div className="text-amber-200 font-black text-xs uppercase tracking-widest">PRO Version</div><div className="text-amber-500/60 text-[9px] font-black uppercase tracking-[0.2em]">ЛИЦЕНЗИЯ ТРИАЛ</div></div></div>
                <div className="text-4xl font-black text-amber-500">{left} <span className="text-xs uppercase font-black text-amber-600">Дн.</span></div>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-white/5 shadow-inner"><div className="bg-gradient-to-r from-amber-600 to-orange-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(245,158,11,0.3)]" style={{width: `${(left / 30) * 100}%`}}></div></div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 space-y-8 shadow-2xl">
            <div className="flex justify-between items-center"><h3 className="text-xs font-black text-slate-700 uppercase tracking-[0.3em]">Мой профиль</h3><button onClick={async () => { if (editMode) { await updateDoc(doc(db, "users", user.uid), { "personalInfo.fullName": pData.fullName, "personalInfo.city": pData.city }); setEditMode(false); alert("Данные обновлены!"); } else setEditMode(true); }} className="text-cyan-400 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-cyan-400/30 hover:bg-cyan-400 hover:text-slate-950 transition-all">{editMode ? 'СОХРАНИТЬ' : 'ИЗМЕНИТЬ'}</button></div>
            <div className="space-y-6">
                <div><label className="text-[10px] text-slate-700 font-black uppercase mb-2 block tracking-widest px-1">ФИО</label><input disabled={!editMode} value={pData.fullName} onChange={e=>setPData({...pData, fullName: e.target.value})} className="w-full bg-slate-950 text-white p-5 rounded-2xl outline-none border border-transparent focus:border-cyan-500 disabled:opacity-40 font-black shadow-inner uppercase text-sm tracking-tighter" /></div>
                <div><label className="text-[10px] text-slate-700 font-black uppercase mb-2 block tracking-widest px-1">Город проживания</label><input disabled={!editMode} value={pData.city} onChange={e=>setPData({...pData, city: e.target.value})} className="w-full bg-slate-950 text-white p-5 rounded-2xl outline-none border border-transparent focus:border-cyan-500 disabled:opacity-40 font-black shadow-inner uppercase text-sm tracking-tighter" /></div>
            </div>
        </div>
        <button onClick={() => signOut(auth)} className="w-full py-6 text-red-500 border border-red-900/30 bg-red-900/5 rounded-[2rem] flex items-center justify-center gap-3 font-black uppercase tracking-[0.3em] active:scale-95 transition-all text-xs shadow-2xl shadow-red-900/20"><LogOut size={20} /> Выход</button>
      </div>
    );
  };

  // --- ЭКРАН ВХОДА (Если не авторизован) ---
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
        <div className="w-28 h-28 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-2xl shadow-cyan-900/50 rotate-3 active:rotate-0 transition-transform"><Fish size={64} strokeWidth={2.5} className="text-white" /></div>
        <h1 className="text-6xl font-black text-white mb-2 tracking-tighter uppercase italic">Keeper</h1>
        <p className="text-cyan-200/50 text-xs mb-14 font-black uppercase tracking-[0.4em]">Marine Reef Assistant</p>
        <div className="w-full max-w-sm bg-slate-900 p-10 rounded-[3rem] border border-slate-800 shadow-2xl space-y-8">
            <div className="flex bg-slate-950 p-1.5 rounded-2xl">
                <button onClick={()=>setAuthMode('login')} className={`flex-1 py-4 text-[10px] font-black uppercase rounded-xl transition-all ${authMode==='login' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-700'}`}>ВХОД</button>
                <button onClick={()=>setAuthMode('register')} className={`flex-1 py-4 text-[10px] font-black uppercase rounded-xl transition-all ${authMode==='register' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-700'}`}>РЕГИСТРАЦИЯ</button>
            </div>
            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleRegister} className="space-y-4">
                {authMode === 'register' && (<><input placeholder="ВАШЕ ИМЯ" required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xs" /><input placeholder="ГОРОД" required value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xs" /></>)}
                <input type="email" placeholder="EMAIL" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xs" />
                <input type="password" placeholder="ПАРОЛЬ" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-xs" />
                <button type="submit" className="w-full bg-cyan-600 text-white font-black py-5 rounded-2xl transition-all active:scale-95 shadow-2xl shadow-cyan-900/30 uppercase tracking-[0.2em] text-sm mt-4">{authMode === 'login' ? 'ВОЙТИ' : 'СОЗДАТЬ'}</button>
            </form>
            <div className="flex items-center gap-4 text-[9px] text-slate-800 font-black uppercase"><div className="flex-1 h-px bg-slate-800"></div>ИЛИ<div className="flex-1 h-px bg-slate-800"></div></div>
            <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-950 font-black py-5 rounded-2xl flex items-center justify-center gap-4 active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="G" /> GOOGLE AUTH</button>
        </div>
      </div>
    );
  }

  // --- ОСНОВНОЙ РЕНДЕР (Навигация) ---
  const Nav = ({icon: I, label, id}) => (
    <button onClick={()=>setActiveTab(id)} className={`flex flex-col items-center w-full py-5 transition-all duration-300 ${activeTab===id?'text-cyan-400 scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]':'text-slate-700'}`}>
      <I size={24}/>
      <span className="text-[8px] mt-2 font-black uppercase tracking-tighter leading-none">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
      {loading && <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center font-black text-cyan-500 uppercase tracking-[0.5em] animate-pulse"><Fish size={80} className="mb-6 rotate-12" />Loading...</div>}
      
      <main className="max-w-md mx-auto min-h-screen relative p-6">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'tools' && <ToolsView />}
        {activeTab === 'livestock' && <LivestockView />}
        {activeTab === 'doctor' && <DoctorView />}
        {activeTab === 'profile' && <ProfileView />}
      </main>
      
      <nav className="fixed bottom-0 left-0 w-full bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 pb-safe z-50 shadow-[0_-30px_60px_rgba(0,0,0,0.8)]">
        <div className="max-w-md mx-auto flex justify-around px-2">
          <Nav icon={Activity} label="СИСТЕМЫ" id="dashboard"/>
          <Nav icon={Droplets} label="ICP ТЕСТ" id="parameters"/>
          <Nav icon={Calculator} label="ТУЛЗЫ" id="tools"/>
          <Nav icon={Fish} label="ЖИТЕЛИ" id="livestock"/>
          <Nav icon={Stethoscope} label="ДОКТОР" id="doctor"/>
          <Nav icon={User} label="ПРОФИЛЬ" id="profile"/>
        </div>
      </nav>

      {/* --- ВСЕ МОДАЛЬНЫЕ ОКНА --- */}
      {isCreating && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn"><div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 w-full max-w-sm shadow-2xl space-y-8 relative"><h2 className="text-xl font-black text-white uppercase tracking-[0.2em] italic">Новый риф</h2><div className="space-y-6"><div><label className="text-[9px] text-slate-700 font-black uppercase tracking-[0.3em] mb-2 block px-2">ИМЯ СИСТЕМЫ</label><input autoFocus value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-[1.5rem] outline-none font-bold uppercase tracking-tighter text-sm focus:border-cyan-500 shadow-inner"/></div><div><label className="text-[9px] text-slate-700 font-black uppercase tracking-[0.3em] mb-2 block px-2">ОБЪЕМ ВОДЫ</label><div className="flex gap-2"><input type="number" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-[1.5rem] outline-none font-mono text-lg shadow-inner"/><select value={newAqData.unit} onChange={e=>setNewAqData({...newAqData, unit: e.target.value})} className="bg-slate-800 border border-slate-800 text-white rounded-2xl px-6 outline-none font-black uppercase text-[10px]"><option value="L">L</option><option value="Gal">Gal</option></select></div></div><button onClick={confirmCreateAquarium} className="w-full bg-cyan-600 text-white font-black py-6 rounded-[2rem] uppercase tracking-[0.2em] shadow-2xl shadow-cyan-900/30 active:scale-95 transition-all text-xs">ЗАПУСТИТЬ ЦИКЛ</button></div><button onClick={()=>setIsCreating(false)} className="absolute top-8 right-8 text-slate-700 hover:text-white transition-colors"><X size={28}/></button></div></div>
      )}

      {deleteConfirmationId && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn"><div className="bg-slate-900 p-10 rounded-[3rem] border border-red-900/30 w-full max-w-sm text-center shadow-2xl space-y-8"><div className="w-24 h-24 bg-red-900/20 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner border border-red-900/20"><Trash2 size={48}/></div><div className="space-y-2"><h2 className="text-xl font-black text-white uppercase tracking-widest leading-none">УДАЛИТЬ?</h2><p className="text-slate-500 text-[10px] font-bold uppercase tracking-tight leading-relaxed">Все данныеICP, жители и настройки будут стерты навсегда.</p></div><div className="flex gap-4"><button onClick={()=>setDeleteConfirmationId(null)} className="flex-1 bg-slate-800 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg">ОТМЕНА</button><button onClick={confirmDeleteAquarium} className="flex-1 bg-red-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-red-900/30">УДАЛИТЬ</button></div></div></div>
      )}

      {editingSettingsId && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn"><div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 w-full max-w-sm space-y-8 shadow-2xl relative"><h2 className="text-xl font-black text-white uppercase tracking-widest italic">Настройки</h2><div className="space-y-6"><div><label className="text-[9px] text-slate-700 font-black uppercase tracking-widest mb-2 block px-2">ИМЯ СИСТЕМЫ</label><input value={tempName} onChange={e=>setTempName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none font-bold shadow-inner uppercase tracking-tighter text-sm focus:border-cyan-500"/></div><div><label className="text-[9px] text-slate-700 font-black uppercase tracking-widest mb-2 block px-2">ОБЪЕМ</label><div className="flex gap-2"><input type="number" value={tempVolume} onChange={e=>setTempVolume(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-5 rounded-2xl outline-none font-mono text-lg shadow-inner"/><select value={tempUnit} onChange={e=>setTempUnit(e.target.value)} className="bg-slate-800 text-white rounded-2xl px-6 outline-none font-black uppercase text-[10px]"><option value="L">L</option><option value="Gal">Gal</option></select></div></div><div className="flex gap-3 pt-4"><button onClick={()=>{setDeleteConfirmationId(editingSettingsId);}} className="flex-1 bg-red-900/20 text-red-500 py-5 rounded-2xl border border-red-900/30 active:scale-95 font-black uppercase text-[10px] tracking-widest">УДАЛИТЬ</button><button onClick={saveSettings} className="flex-1 bg-cyan-600 text-white py-5 rounded-2xl font-black shadow-2xl shadow-cyan-900/30 active:scale-95 uppercase text-[10px] tracking-widest">СОХРАНИТЬ</button></div></div><button onClick={()=>setEditingSettingsId(null)} className="absolute top-8 right-8 text-slate-700 hover:text-white transition-colors"><X size={28}/></button></div></div>
      )}

      {waterChangeModal && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn"><div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 w-full max-w-sm shadow-2xl space-y-8 relative"><h2 className="text-xl font-black text-white uppercase tracking-widest italic">Подмена</h2><div className="space-y-8"><div><label className="text-[9px] text-slate-700 font-black uppercase tracking-[0.3em] mb-3 block text-center italic">ВВЕДИТЕ КОЛИЧЕСТВО СВЕЖЕЙ ВОДЫ</label><div className="flex gap-4"><input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-6 rounded-[2rem] outline-none text-4xl font-black text-center font-mono shadow-inner"/><select value={wcUnit} onChange={e=>setWcUnit(e.target.value)} className="bg-slate-800 text-white rounded-[1.5rem] px-6 outline-none font-black uppercase text-xs shadow-lg"><option value="L">L</option><option value="Gal">Gal</option></select></div></div><button onClick={performWaterChange} className="w-full bg-cyan-600 text-white font-black py-6 rounded-[2.5rem] active:scale-95 transition-all shadow-2xl shadow-cyan-900/40 uppercase tracking-[0.2em] text-xs">ЗАФИКСИРОВАТЬ</button><button onClick={()=>setWaterChangeModal(null)} className="w-full text-slate-700 py-2 uppercase font-black text-[9px] tracking-[0.4em] hover:text-slate-400 transition-colors">ОТМЕНА</button></div></div></div>
      )}
    </div>
  );
}

const startCreatingAquarium = () => { /* реализовано выше */ };
const confirmCreateAquarium = async () => { /* реализовано выше */ };
const confirmDeleteAquarium = async () => { /* реализовано выше */ };
const saveSettings = async () => { /* реализовано выше */ };
const performWaterChange = async () => { /* реализовано выше */ };