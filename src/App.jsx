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

const IDEAL_PARAMS = {
  salinity: { min: 33, max: 36, unit: 'ppt', name: 'Соленость' },
  kh: { min: 7.5, max: 11.0, unit: 'dKH', name: 'Alkalinity (KH)' },
  ca: { min: 400, max: 480, unit: 'ppm', name: 'Calcium (Ca)' },
  mg: { min: 1250, max: 1400, unit: 'ppm', name: 'Magnesium (Mg)' },
  no3: { min: 2, max: 15, unit: 'ppm', name: 'Nitrate (NO3)' },
  po4: { min: 0.03, max: 0.1, unit: 'ppm', name: 'Phosphate (PO4)' },
  temp: { min: 24, max: 27, unit: '°C', name: 'Температура' }
};

const CORAL_TYPES = {
  sps: { label: 'SPS (Жесткие)', care: 'Свет++, Течение++, Стабильность++' },
  lps: { label: 'LPS (Крупнополипные)', care: 'Свет+, Кормление+, Умеренное течение' },
  soft: { label: 'Мягкие', care: 'Неприхотливые, средний свет' },
};

const DEFAULT_PARAMS = {
  salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
};

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
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Auth States
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');

  // Aquarium States
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

  // --- Эффекты Firebase ---
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

  // --- ОБРАБОТЧИКИ ---

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
    } catch (error) { alert("Ошибка: " + error.message); }
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

  const confirmCreateAquarium = async () => {
    if (!newAqData.name) { alert("Введите название"); return; }
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
      alert(`Подмена ${pct.toFixed(1)}% зафиксирована.`);
  };

  // --- VIEW COMPONENTS ---

  const DashboardView = () => (
    <div className="space-y-8 animate-fadeIn pb-24 italic leading-none font-black">
      <div className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">Reef Hub</h1>
          <div className="text-cyan-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-60 mt-1">
            <MapPin size={10} /> {userData?.personalInfo?.city || 'Offline'}
          </div>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-cyan-600/20 text-cyan-400 p-4 rounded-[2rem] border border-cyan-500/30 active:scale-90 transition-all shadow-2xl">
          <Plus size={28} />
        </button>
      </div>

      {aquariums.map((aq) => {
        const recs = getRecommendations(aq.params);
        const lastWC = new Date(aq.lastWaterChange);
        const daysSinceWC = Math.floor((new Date() - lastWC) / (1000 * 60 * 60 * 24));
        const isStable = daysSinceWC <= 7 && aq.stabilityStatus !== 'destabilized';

        return (
          <div key={aq.id} className="space-y-6 animate-slideUp">
            <div className="bg-slate-900 p-10 rounded-[4rem] border border-slate-800 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden group">
              <div className="absolute -top-20 -right-20 p-4 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Activity size={350} /></div>
              
              <div className="flex justify-between items-start mb-12 relative z-10 leading-none">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-10 bg-cyan-500 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.6)]"></div>
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic leading-none">{aq.name}</h2>
                  <button onClick={() => {setEditingSettingsId(aq.id); setTempName(aq.name); setTempVolume(aq.volume); setTempUnit(aq.volumeUnit);}} className="text-slate-700 hover:text-cyan-400 transition-colors p-2">
                    <Settings size={24}/>
                  </button>
                </div>
                <div className={`text-[10px] font-black px-6 py-3 rounded-full border-2 ${isStable ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-red-500/10 border-red-500/50 text-red-400'} tracking-[0.3em] uppercase italic leading-none shadow-2xl`}>
                   {isStable ? 'SYNC: OK' : 'SYNC: FAIL'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 mb-12 relative z-10">
                <div className="bg-slate-950 p-6 rounded-[2.5rem] text-center border border-white/5 shadow-inner">
                  <div className="text-[11px] text-cyan-300/20 font-black uppercase mb-2 tracking-widest leading-none">Salt</div>
                  <div className={`text-2xl font-mono font-black ${aq.params.salinity < 33 || aq.params.salinity > 36 ? 'text-red-400' : 'text-white'}`}>{aq.params.salinity}</div>
                </div>
                <div className="bg-slate-950 p-6 rounded-[2.5rem] text-center border border-white/5 shadow-inner">
                  <div className="text-[11px] text-cyan-300/20 font-black uppercase mb-2 tracking-widest leading-none">KH</div>
                  <div className={`text-2xl font-mono font-black ${aq.params.kh < 7.5 || aq.params.kh > 11 ? 'text-red-400' : 'text-white'}`}>{aq.params.kh}</div>
                </div>
                <div className="bg-slate-950 p-6 rounded-[2.5rem] flex items-center justify-center border border-white/5 shadow-inner">
                   {recs.length === 0 ? <CheckCircle size={36} className="text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]"/> : <div className="text-yellow-400 font-black text-4xl italic animate-pulse">!{recs.length}</div>}
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/80 p-8 rounded-[3.5rem] border border-white/5 relative z-10 shadow-2xl leading-none italic font-black">
                <div className="text-[11px] text-slate-700 uppercase font-black tracking-widest leading-relaxed italic">
                  Volume: {aq.volume}{aq.volumeUnit}<br/>
                  Cycle: {lastWC.toLocaleDateString()}
                </div>
                <button onClick={() => setWaterChangeModal(aq.id)} className="bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-black py-5 px-10 rounded-[1.5rem] flex items-center gap-3 transition-all active:scale-95 shadow-2xl shadow-cyan-900/50 uppercase tracking-[0.2em] italic">
                  <RefreshCw size={16}/> Refresh
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const ParametersView = () => {
    const activeAq = aquariums.find(a => a.id === selectedAqId) || aquariums[0];
    const [localParams, setLocalParams] = useState(activeAq ? activeAq.params : DEFAULT_PARAMS);
    const [isAnalyzing, setIsAnalyzing] = useState(false); 

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsAnalyzing(true);
        try {
            const base64Data = await new Promise((resolve) => {
                const r = new FileReader(); r.onloadend = () => resolve(r.result.split(',')[1]); r.readAsDataURL(file);
            });
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
                alert("Data extracted successfully!");
            }
        } catch (e) { alert(`Error: ${e.message}`); } finally { setIsAnalyzing(false); }
    };

    return (
      <div className="pb-24 animate-fadeIn space-y-10 leading-none font-black italic">
        <h2 className="text-4xl font-black text-white uppercase tracking-tighter px-1 italic">Neural Scanner</h2>
        <div className="flex bg-slate-900 p-3 rounded-[2.5rem] relative border border-slate-800 shadow-2xl">
          <select className="w-full bg-transparent text-white font-black p-6 outline-none appearance-none uppercase tracking-[0.3em] text-[11px]" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <ChevronDown className="absolute right-10 top-9 text-slate-600" />
        </div>
        <div className="relative">
            <input type="file" id="icp-upload" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <label htmlFor="icp-upload" className={`w-full flex flex-col items-center justify-center gap-6 p-16 rounded-[5rem] border-4 border-dashed border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-all ${isAnalyzing ? 'opacity-50' : 'active:scale-95'}`}>
                {isAnalyzing ? <Loader2 className="animate-spin text-cyan-400" size={48} /> : <ScanLine className="text-cyan-400" size={48}/>}
                <span className="text-white text-sm font-black uppercase tracking-[0.5em]">{isAnalyzing ? 'Analyzing...' : 'Scan Report'}</span>
            </label>
        </div>
        <div className="grid gap-6">
          {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
            <div key={key} className="bg-slate-900 p-8 rounded-[3.5rem] border border-slate-800 flex justify-between items-center shadow-xl">
              <div className="space-y-2">
                <div className="text-slate-200 font-black text-lg uppercase tracking-tight italic">{c.name}</div>
                <div className="text-[11px] text-slate-800 font-black uppercase tracking-[0.2em]">Norm: {c.min}-{c.max} {c.unit}</div>
              </div>
              <input type="number" step="0.1" value={localParams[key] || ''} onChange={e=>setLocalParams({...localParams, [key]: e.target.value})} className="w-36 bg-slate-950 text-white p-6 rounded-3xl border border-slate-800 text-center font-mono text-2xl font-black focus:border-cyan-500 outline-none shadow-inner" />
            </div>
          ))}
          <button onClick={async () => {
             const list = aquariums.map(a => a.id === activeAq.id ? {...a, params: localParams} : a);
             await updateDoc(doc(db, "users", user.uid), { aquariums: list });
             alert("Database updated.");
          }} className="w-full bg-cyan-600 text-white p-10 rounded-[4rem] font-black uppercase tracking-[0.5em] mt-10 shadow-2xl active:scale-95">AUTHORIZED COMMIT</button>
        </div>
      </div>
    );
  };

  const ToolsView = () => {
    const [selectedTool, setSelectedTool] = useState(null);

    const BallingCalc = () => {
        const [vol, setVol] = useState(5);
        const [caF, setCaF] = useState('dihydrate');
        const [khF, setKhF] = useState('nahco3');
        const res = useMemo(() => ({
            ca: (CALC_DATA.balling.ca[caF].coeff * vol).toFixed(1),
            kh: (CALC_DATA.balling.buffer[khF].coeff * vol).toFixed(1),
            salt: (25.0 * vol).toFixed(1)
        }), [vol, caF, khF]);
        return (
            <div className="space-y-10 animate-fadeIn leading-none font-black italic">
                <div className="bg-slate-900 p-14 rounded-[5rem] border border-slate-800 shadow-2xl leading-none">
                    <label className="text-[11px] text-slate-800 font-black uppercase tracking-[0.8em] mb-6 block leading-none italic font-black">CANISTER VOLUME (L)</label>
                    <input type="number" value={vol} onChange={e=>setVol(e.target.value)} className="w-full bg-slate-950 p-10 rounded-[3rem] border border-slate-800 text-white font-black text-center text-7xl font-mono shadow-inner italic outline-none leading-none" />
                </div>
                <div className="space-y-6 leading-none">
                    <div className="bg-blue-900/20 p-10 rounded-[3.5rem] border border-blue-500/20 flex justify-between items-center shadow-xl"><span className="text-sm uppercase text-blue-300">Solution 1 (Ca)</span><span className="text-4xl text-white">{res.ca}g</span></div>
                    <div className="bg-purple-900/20 p-10 rounded-[3.5rem] border border-purple-500/20 flex justify-between items-center shadow-xl"><span className="text-sm uppercase text-purple-300">Solution 2 (KH)</span><span className="text-4xl text-white">{res.kh}g</span></div>
                    <div className="bg-emerald-900/20 p-10 rounded-[3.5rem] border border-emerald-500/20 flex justify-between items-center shadow-xl"><span className="text-sm uppercase text-emerald-300">Free Salt</span><span className="text-4xl text-white">{res.salt}g</span></div>
                </div>
            </div>
        )
    }

    const SandCalc = () => {
        const [l, setL] = useState(100); const [w, setW] = useState(50); const [d, setD] = useState(3);
        const [type, setType] = useState('caribsea');
        const res = useMemo(() => {
            const volL = (l * w * d) / 1000;
            const mass = volL * CALC_DATA.gravel[type].density;
            return { vol: volL.toFixed(1), mass: mass.toFixed(1) };
        }, [l, w, d, type]);
        return (
            <div className="space-y-10 animate-fadeIn leading-none italic font-black">
                <div className="bg-slate-900 p-14 rounded-[5.5rem] border border-slate-800 space-y-12 shadow-[0_60px_120px_rgba(0,0,0,1)] ring-1 ring-white/5">
                    <div><label className="text-[12px] text-slate-800 font-black uppercase mb-6 block px-4 leading-none">SUBSTRATE</label><select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-slate-950 p-9 rounded-[2.5rem] border border-slate-800 text-white font-black uppercase text-sm italic outline-none">{Object.entries(CALC_DATA.gravel).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-8 leading-none">
                        <div><label className="text-[11px] text-slate-800 font-black uppercase mb-6 block px-4 leading-none">L (CM)</label><input type="number" value={l} onChange={e=>setL(e.target.value)} className="w-full bg-slate-950 p-9 rounded-[2.5rem] border border-slate-800 text-white font-black text-center text-2xl italic outline-none" /></div>
                        <div><label className="text-[11px] text-slate-800 font-black uppercase mb-6 block px-4 leading-none">W (CM)</label><input type="number" value={w} onChange={e=>setW(e.target.value)} className="w-full bg-slate-950 p-9 rounded-[2.5rem] border border-slate-800 text-white font-black text-center text-2xl italic outline-none" /></div>
                    </div>
                    <div><label className="text-[12px] text-slate-800 font-black uppercase mb-6 block px-4 leading-none">DEPTH (CM)</label><input type="number" value={d} onChange={e=>setD(e.target.value)} className="w-full bg-slate-950 p-10 rounded-[3.5rem] border border-slate-800 text-white font-black text-center text-6xl shadow-inner italic" /></div>
                </div>
                <div className="bg-amber-900/20 p-20 rounded-[6rem] border border-amber-500/30 text-center shadow-2xl relative leading-none">
                    <div className="text-amber-400 font-black text-[14px] uppercase mb-10 tracking-[1.5em] italic">ORDER MASS</div>
                    <div className="text-[160px] font-black text-white relative z-10 italic leading-none">{res.mass} <span className="text-5xl text-amber-500/30 uppercase not-italic tracking-tighter">kg</span></div>
                    <div className="text-[14px] text-slate-800 font-black uppercase mt-16 tracking-[0.5em] opacity-50">Volume: {res.vol} Liters</div>
                </div>
            </div>
        )
    }

    if (!selectedTool) {
      const tools = [
        { id: 'bal', name: 'Balling', icon: Beaker, color: 'text-yellow-400', desc: 'Mix logic' },
        { id: 'sand', name: 'Substrate', icon: Layers, color: 'text-amber-500', desc: 'Mass calc' },
        { id: 'glass', name: 'Glass', icon: Box, color: 'text-cyan-400', desc: 'Architecture' },
      ];
      return (
        <div className="pb-24 animate-fadeIn space-y-12 leading-none italic font-black">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter px-2 italic">The Lab</h2>
          <div className="grid grid-cols-2 gap-8">
            {tools.map(t => (
              <button key={t.id} onClick={() => setSelectedTool(t.id)} className="bg-slate-900 p-12 rounded-[4rem] border border-slate-800 flex flex-col items-center gap-8 active:scale-95 transition-all shadow-2xl group relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:scale-150 transition-transform duration-1000 pointer-events-none"><t.icon size={200} /></div>
                <div className="bg-slate-950 p-8 rounded-[3rem] shadow-inner group-hover:bg-slate-800 transition-colors"><t.icon size={56} className={t.color} /></div>
                <div className="text-center relative z-10 leading-none font-black italic">
                    <span className="text-sm font-black text-white uppercase block mb-3 tracking-tighter italic font-black">{t.name}</span>
                    <span className="text-[10px] font-bold text-slate-700 uppercase leading-none italic opacity-40 font-black">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24 animate-fadeIn space-y-10 leading-none font-black italic">
        <button onClick={() => setSelectedTool(null)} className="flex items-center gap-6 text-cyan-400 font-black text-[14px] uppercase tracking-[1em] mb-10 active:scale-90 transition-all hover:text-white">
          <ArrowLeft size={32}/> RETURN
        </button>
        {selectedTool === 'bal' && <BallingCalc />}
        {selectedTool === 'sand' && <SandCalc />}
        {selectedTool === 'glass' && <VolumeGlassCalc />}
      </div>
    );
  };

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
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Analyze this aquarium photo. Is the specimen healthy? Identify pathologies (RTN/STN, parasites, ich, diseases). Response in Russian. Clinical tone. Maximum 100 words. Be specific about treatments." },
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
        <div className="pb-24 animate-fadeIn space-y-12 leading-none italic font-black">
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic px-2">AI Doctor</h2>
            <div className="bg-gradient-to-br from-emerald-900/60 to-teal-950 p-20 rounded-[6rem] border border-emerald-500/20 shadow-2xl relative overflow-hidden ring-2 ring-emerald-500/10">
                <Stethoscope className="absolute right-[-100px] bottom-[-100px] text-emerald-500/5 w-[600px] h-[600px] rotate-[25deg] pointer-events-none" />
                <p className="text-emerald-100/60 text-[14px] mb-20 relative z-10 font-black uppercase tracking-[0.5em] leading-loose text-center">Neural specimen analysis. Detect cellular pathogens and biological degradation protocols.</p>
                <input type="file" id="doc-upload" className="hidden" accept="image/*" onChange={identifyDisease} />
                <label htmlFor="doc-upload" className={`w-full bg-white text-emerald-950 font-black py-12 rounded-[3rem] flex items-center justify-center gap-8 cursor-pointer transition-all active:scale-95 relative z-10 shadow-2xl ${analyzing ? 'opacity-50' : 'hover:bg-emerald-50 shadow-emerald-900/50'}`}>
                    {analyzing ? <Loader2 className="animate-spin text-emerald-900" size={48} /> : <Camera size={48} />}
                    {analyzing ? 'SCANNING...' : 'IDENTIFY TARGET'}
                </label>
            </div>
            {imagePreview && <div className="rounded-[6rem] overflow-hidden border-[16px] border-slate-900 shadow-2xl ring-2 ring-white/10 animate-fadeIn"><img src={imagePreview} className="w-full h-[650px] object-cover" alt="Subject" /></div>}
            {result && <div className="bg-slate-900 p-16 rounded-[5.5rem] border border-slate-800 animate-slideUp shadow-2xl relative leading-none ring-2 ring-white/5">
                <div className="absolute top-0 left-20 bg-emerald-500 text-slate-950 px-12 py-5 rounded-full font-black text-[14px] -translate-y-1/2 uppercase tracking-[0.8em] flex items-center gap-6 shadow-[0_20px_60px_rgba(16,185,129,0.6)] italic"><Sparkles size={24}/> AI Diagnosis</div>
                <div className="text-slate-100 text-xl leading-relaxed whitespace-pre-wrap font-bold pt-12 italic leading-loose opacity-90">{result}</div>
            </div>}
        </div>
    );
  };

  const ProfileView = () => {
    const [editMode, setEditMode] = useState(false);
    const [pData, setPData] = useState({ fullName: userData?.personalInfo?.fullName || '', city: userData?.personalInfo?.city || '' });
    const leftDays = useMemo(() => {
        if (!userData?.subscription?.expiresAt) return 0;
        return Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
    }, [userData]);
    return (
      <div className="pb-24 animate-fadeIn space-y-12 leading-none font-black italic">
        <div className="bg-slate-900 p-20 rounded-[6rem] border border-slate-800 flex flex-col items-center text-center shadow-2xl relative overflow-hidden italic leading-none ring-2 ring-white/5">
          <div className="absolute top-0 left-0 w-full h-5 bg-gradient-to-r from-cyan-600 to-blue-800 shadow-2xl"></div>
          <div className="w-60 h-60 rounded-[4.5rem] bg-gradient-to-tr from-cyan-600 to-blue-900 flex items-center justify-center text-white font-black text-[100px] shadow-[0_60px_120px_rgba(8,145,178,0.8)] ring-[20px] ring-slate-950 mb-16 italic leading-none">{userData?.personalInfo?.fullName?.[0]}</div>
          <h2 className="text-7xl font-black text-white tracking-tighter leading-none uppercase italic">{userData?.personalInfo?.fullName}</h2>
          <p className="text-[18px] text-slate-800 font-black uppercase tracking-[1em] mt-16 leading-none italic opacity-30">{user.email}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-600/10 to-orange-900/10 p-20 rounded-[6.5rem] border border-amber-600/20 shadow-2xl relative overflow-hidden leading-none italic font-black">
            <div className="flex items-center justify-between mb-16 relative z-10 leading-none">
                <div className="flex items-center gap-12 leading-none"><Crown className="text-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.6)]" size={80}/><div><div className="text-amber-100 font-black text-2xl uppercase tracking-[0.8em] mb-4 font-black italic">ELITE UNIT</div><div className="text-amber-900 text-[14px] font-black uppercase tracking-[1em] leading-none italic">UNLIMITED SECTOR ACCESS</div></div></div>
                <div className="text-[150px] font-black text-amber-500 tracking-tighter italic leading-none">{leftDays}</div>
            </div>
            <div className="w-full bg-slate-950 h-10 rounded-full overflow-hidden border-[6px] border-white/5 shadow-inner p-3 leading-none italic"><div className="bg-gradient-to-r from-amber-600 to-orange-500 h-full rounded-full transition-all duration-[2000ms] shadow-[0_0_80px_rgba(245,158,11,0.9)]" style={{width: `${(leftDays / 30) * 100}%`}}></div></div>
        </div>
        <div className="bg-slate-900 p-20 rounded-[7rem] border border-slate-800 space-y-20 shadow-2xl leading-none italic font-black ring-1 ring-white/5">
            <div className="flex justify-between items-center leading-none italic font-black"><h3 className="text-[18px] text-slate-800 font-black uppercase tracking-[1.5em] italic leading-none">Dossier</h3><button onClick={async () => { if (editMode) { await updateDoc(doc(db, "users", user.uid), { "personalInfo.fullName": pData.fullName, "personalInfo.city": pData.city }); setEditMode(false); alert("Verified."); } else setEditMode(true); }} className="text-cyan-400 text-[14px] font-black uppercase tracking-[1em] px-16 py-6 rounded-full border-4 border-cyan-400/30 active:scale-95 transition-all leading-none italic">MOD</button></div>
            <div className="space-y-20 leading-none italic font-black">
                <div><label className="text-[14px] text-slate-800 font-black uppercase mb-10 block tracking-[1em] px-6 leading-none italic">Codename</label><input disabled={!editMode} value={pData.fullName} onChange={e=>setPData({...pData, fullName: e.target.value})} className="w-full bg-slate-950 text-white p-12 rounded-[3.5rem] border border-transparent focus:border-cyan-500 disabled:opacity-20 font-black shadow-inner uppercase text-2xl tracking-[0.2em] italic leading-none" /></div>
                <div><label className="text-[14px] text-slate-800 font-black uppercase mb-10 block tracking-[1em] px-6 leading-none italic">Home Port</label><input disabled={!editMode} value={pData.city} onChange={e=>setPData({...pData, city: e.target.value})} className="w-full bg-slate-950 text-white p-12 rounded-[3.5rem] border border-transparent focus:border-cyan-500 disabled:opacity-20 font-black shadow-inner uppercase text-2xl tracking-[0.2em] italic leading-none" /></div>
            </div>
        </div>
        <button onClick={() => signOut(auth)} className="w-full py-20 text-red-500 border border-red-900/10 bg-red-900/5 rounded-[8rem] flex items-center justify-center gap-14 font-black uppercase tracking-[2em] active:scale-95 transition-all text-sm shadow-[0_50px_150px_rgba(0,0,0,1)] shadow-red-950/50 italic leading-none ring-2 ring-red-500/10"><LogOut size={56} /> SHUTDOWN</button>
      </div>
    );
  };

  // --- MAIN RENDER LOGIC ---

  if (loading) return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center font-black text-cyan-500 uppercase tracking-[2em] animate-pulse italic leading-none">
        <Fish size={200} className="mb-24 rotate-[25deg] shadow-cyan-500/50" strokeWidth={5} />
        <div className="text-center leading-none">INITIALIZING CORE...</div>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-fadeIn selection:bg-cyan-500/50 leading-none italic font-black font-black italic leading-none">
        <div className="w-64 h-64 bg-gradient-to-tr from-cyan-600 to-blue-800 rounded-[7rem] flex items-center justify-center mb-24 shadow-[0_100px_200px_rgba(0,0,0,1)] rotate-12 hover:rotate-0 transition-all duration-[2000ms] ring-[24px] ring-slate-900/50 leading-none italic font-black ring-offset-16 ring-offset-slate-950 font-black italic">
            <Fish size={200} strokeWidth={5} className="text-white drop-shadow-[0_20px_50px_rgba(0,0,0,1)] italic leading-none font-black font-black italic" />
        </div>
        <h1 className="text-[180px] font-black text-white mb-10 tracking-tighter uppercase italic leading-none drop-shadow-[0_40px_100px_rgba(0,0,0,1)] font-black italic underline decoration-cyan-500/50 decoration-[16px]">Keeper</h1>
        <p className="text-cyan-200/50 text-[18px] mb-32 font-black uppercase tracking-[2em] italic leading-none font-black italic opacity-20">Premium Hub v3.0</p>
        <div className="w-full max-w-2xl bg-slate-900 p-24 rounded-[10rem] border border-slate-800 shadow-[0_150px_300px_rgba(0,0,0,1)] space-y-24 ring-4 ring-white/5 leading-none italic font-black font-black italic shadow-cyan-950/20">
            <div className="flex bg-slate-950 p-6 rounded-[4rem] leading-none italic font-black font-black italic shadow-inner ring-1 ring-white/5">
                <button onClick={()=>setAuthMode('login')} className={`flex-1 py-14 text-[24px] font-black uppercase rounded-[3rem] transition-all duration-[1000ms] leading-none italic font-black font-black italic ${authMode==='login' ? 'bg-slate-800 text-white shadow-[0_0_100px_rgba(255,255,255,0.1)] ring-2 ring-white/10' : 'text-slate-800 opacity-20'}`}>IDENTIFY</button>
                <button onClick={()=>setAuthMode('register')} className={`flex-1 py-14 text-[24px] font-black uppercase rounded-[3rem] transition-all duration-[1000ms] leading-none italic font-black font-black italic ${authMode==='register' ? 'bg-slate-800 text-white shadow-[0_0_100px_rgba(255,255,255,0.1)] ring-2 ring-white/10' : 'text-slate-800 opacity-20'}`}>RECRUIT</button>
            </div>
            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleRegister} className="space-y-12 leading-none italic font-black font-black italic">
                {authMode === 'register' && (<><input placeholder="CODE NAME" required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-2xl shadow-inner italic leading-none font-black" /><input placeholder="SECTOR" required value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-2xl shadow-inner italic leading-none font-black" /></>)}
                <input type="email" placeholder="ACCESS EMAIL" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-2xl shadow-inner italic leading-none font-black" />
                <input type="password" placeholder="KEY CODE" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none focus:border-cyan-500 font-black uppercase tracking-tighter text-2xl shadow-inner italic leading-none font-black" />
                <button type="submit" className="w-full bg-cyan-600 text-white font-black py-14 rounded-[5rem] transition-all active:scale-95 shadow-[0_80px_160px_rgba(8,145,178,1)] uppercase tracking-[1.5em] text-sm mt-24 italic leading-none ring-4 ring-cyan-400/30">EXECUTE SEQUENCE</button>
            </form>
            <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-950 font-black py-14 rounded-[5rem] flex items-center justify-center gap-16 active:scale-95 transition-all text-sm uppercase tracking-[1.5em] shadow-[0_50px_100px_rgba(255,255,255,0.1)] italic leading-none"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-14 h-14 shadow-2xl" alt="G" /> BIOMETRIC LINK</button>
        </div>
      </div>
    );
  }

  const NavItemRender = ({icon: I, label, id}) => (
    <button onClick={()=>setActiveTab(id)} className={`flex flex-col items-center w-full py-12 transition-all duration-[1000ms] ${activeTab===id?'text-cyan-400 scale-150 drop-shadow-[0_0_40px_rgba(34,211,238,1)] font-black italic':'text-slate-900 opacity-20'}`}>
      <I size={36} strokeWidth={5}/>
      <span className="text-[7px] mt-4 font-black uppercase tracking-tighter whitespace-nowrap italic">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans italic leading-none selection:bg-cyan-500/50 scroll-smooth italic font-black">
      <main className="max-w-md mx-auto min-h-screen relative p-12 font-black italic">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'tools' && <ToolsView />}
        {activeTab === 'doctor' && <DoctorView />}
        {activeTab === 'profile' && <ProfileView />}
      </main>
      
      <nav className="fixed bottom-0 left-0 w-full bg-slate-950/98 backdrop-blur-[100px] border-t-8 border-white/5 pb-safe z-50 shadow-[0_-100px_200px_rgba(0,0,0,1)] rounded-t-[10rem] ring-1 ring-white/10 font-black italic">
        <div className="max-w-md mx-auto flex justify-around px-12 leading-none font-black italic">
          <NavItemRender icon={Activity} label="SYS" id="dashboard"/>
          <NavItemRender icon={Droplets} label="LAB" id="parameters"/>
          <NavItemRender icon={Calculator} label="APP" id="tools"/>
          <NavItemRender icon={Stethoscope} label="DOC" id="doctor"/>
          <NavItemRender icon={User} label="SELF" id="profile"/>
        </div>
      </nav>

      {/* --- MODALS --- */}
      {isCreating && (
          <div className="fixed inset-0 bg-black/98 z-[1000] flex items-center justify-center p-6 backdrop-blur-[150px] animate-fadeIn italic font-black leading-none"><div className="bg-slate-900 p-16 rounded-[7rem] border border-slate-800 w-full max-w-xl shadow-[0_200px_400px_rgba(0,0,0,1)] space-y-20 relative ring-4 ring-white/5 shadow-cyan-900/20 italic font-black animate-slideUp font-black"><h2 className="text-7xl font-black text-white uppercase tracking-tighter italic leading-none">Spawn Core</h2><div className="space-y-16 leading-none italic font-black"><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 italic font-black leading-none">ID</label><input autoFocus value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none font-black uppercase tracking-tighter text-2xl focus:border-cyan-500 shadow-inner italic leading-none ring-2 ring-cyan-500/30 font-black"/></div><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 italic font-black leading-none">CAPACITY</label><div className="flex gap-8"><input type="number" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white p-14 rounded-[4rem] outline-none font-mono text-7xl font-black shadow-inner italic leading-none ring-2 ring-cyan-500/30 font-black"/><select value={newAqData.unit} onChange={e=>setNewAqData({...newAqData, unit: e.target.value})} className="bg-slate-800 border border-slate-800 text-white rounded-[4rem] px-16 outline-none font-black uppercase text-[28px] shadow-2xl ring-2 ring-white/10 font-black"><option value="L">L</option><option value="Gal">G</option></select></div></div><button onClick={confirmCreateAquarium} className="w-full bg-cyan-600 text-white font-black py-16 rounded-[6rem] uppercase tracking-[1.5em] shadow-[0_80px_160px_rgba(8,145,178,1)] active:scale-95 transition-all text-sm italic leading-none ring-[16px] ring-cyan-400/20 font-black">INITIALIZE</button></div><button onClick={()=>setIsCreating(false)} className="absolute top-24 right-24 text-slate-800 hover:text-white transition-all"><X size={80}/></button></div></div>
      )}

      {deleteConfirmationId && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[150px] animate-fadeIn italic font-black leading-none"><div className="bg-slate-900 p-24 rounded-[10rem] border border-red-900/50 w-full max-w-2xl text-center shadow-[0_200px_400px_rgba(239,68,68,0.5)] space-y-24 relative ring-8 ring-red-900/20 leading-none italic font-black animate-bounceIn font-black"><div className="w-72 h-72 bg-red-900/10 text-red-500 rounded-[6rem] flex items-center justify-center mx-auto shadow-inner border border-red-900/30 leading-none shadow-red-950/60 font-black"><Trash2 size={160}/></div><div className="space-y-14"><h2 className="text-[100px] font-black text-white uppercase tracking-tighter leading-none italic font-black">Wipe?</h2><p className="text-slate-800 text-[18px] font-black uppercase tracking-[1.5em] leading-loose italic font-black opacity-40 px-16 font-black">SYSTEM PURGE PROTOCOL. BIOLOGY LOGS AND NEURAL METRICS WILL BE ERADICATED FOREVER.</p></div><div className="flex gap-12"><button onClick={()=>setDeleteConfirmationId(null)} className="flex-1 bg-slate-800 text-white py-16 rounded-[4rem] font-black uppercase text-sm tracking-[0.8em] ring-2 ring-white/10 active:scale-90 transition-all font-black">ABORT</button><button onClick={confirmDeleteAquarium} className="flex-1 bg-red-600 text-white py-16 rounded-[4rem] font-black uppercase text-sm tracking-[0.8em] shadow-[0_60px_120px_rgba(239,68,68,1)] ring-[12px] ring-red-400/30 active:scale-90 transition-all font-black">PURGE</button></div></div></div>
      )}

      {editingSettingsId && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[100px] animate-fadeIn italic font-black leading-none font-black"><div className="bg-slate-900 p-20 rounded-[8rem] border border-slate-800 w-full max-w-lg space-y-20 shadow-[0_150px_300px_rgba(0,0,0,1)] relative italic font-black ring-2 ring-white/5 animate-slideUp"><h2 className="text-5xl font-black text-white uppercase tracking-widest italic leading-none font-black italic underline decoration-cyan-500 decoration-8 underline-offset-[20px]">Re-Config</h2><div className="space-y-16 leading-none italic font-black"><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 italic font-black leading-none">IDENTIFIER</label><input value={tempName} onChange={e=>setTempName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-black shadow-inner uppercase tracking-tighter text-xl focus:border-cyan-500 italic leading-none ring-1 ring-cyan-500/20"/></div><div><label className="text-[14px] text-slate-800 font-black uppercase tracking-[1em] mb-8 block px-6 font-black font-black">NET VOL</label><div className="flex gap-8"><input type="number" value={tempVolume} onChange={e=>setTempVolume(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-12 rounded-[3.5rem] outline-none font-mono text-6xl font-black shadow-inner italic leading-none ring-1 ring-cyan-500/20"/><select value={tempUnit} onChange={e=>setTempUnit(e.target.value)} className="bg-slate-800 text-white rounded-[3rem] px-14 outline-none font-black uppercase text-[24px] leading-none shadow-2xl ring-1 ring-white/10"><option value="L">L</option><option value="Gal">G</option></select></div></div><div className="flex gap-8 pt-16 leading-none italic font-black"><button onClick={()=>{setDeleteConfirmationId(editingSettingsId);}} className="flex-1 bg-red-900/20 text-red-500 py-12 rounded-[3.5rem] border-4 border-red-900/30 active:scale-95 font-black uppercase text-[14px] tracking-[1em] leading-none ring-1 ring-red-500/20">WIPE</button><button onClick={saveSettings} className="flex-1 bg-cyan-600 text-white py-12 rounded-[3.5rem] font-black shadow-[0_40px_80px_rgba(8,145,178,1)] active:scale-95 uppercase text-[14px] tracking-[1em] leading-none font-black ring-4 ring-cyan-400/30">PATCH</button></div></div><button onClick={()=>setEditingSettingsId(null)} className="absolute top-24 right-24 text-slate-800 hover:text-white transition-colors leading-none"><X size={60}/></button></div></div>
      )}

      {waterChangeModal && (
          <div className="fixed inset-0 bg-black/99 z-[1000] flex items-center justify-center p-6 backdrop-blur-[150px] animate-fadeIn leading-none italic font-black leading-none font-black italic font-black"><div className="bg-slate-900 p-24 rounded-[10rem] border border-slate-800 w-full max-w-2xl shadow-[0_200px_400px_rgba(0,0,0,1)] space-y-24 relative italic leading-none leading-none font-black font-black ring-4 ring-white/5 font-black italic font-black"><h2 className="text-[100px] font-black text-white uppercase tracking-tighter italic font-black italic font-black font-black leading-none font-black font-black font-black leading-none font-black font-black font-black leading-none font-black font-black italic">Refresh</h2><div className="space-y-24 leading-none font-black font-black italic"><div><label className="text-[18px] text-slate-800 font-black uppercase tracking-[2em] mb-20 block text-center italic opacity-20 font-black italic">INPUT FRESH LOAD</label><div className="flex gap-10 leading-none font-black font-black italic"><input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-20 rounded-[6rem] outline-none text-[160px] font-black text-center font-mono shadow-inner border-cyan-500/30 italic leading-none font-black leading-none font-black"/><select value={wcUnit} onChange={e=>setWcUnit(e.target.value)} className="bg-slate-800 text-white rounded-[5rem] px-20 outline-none font-black uppercase text-2xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] border-8 border-white/5 leading-none font-black ring-4 ring-white/10 font-black italic"><option value="L">L</option><option value="Gal">G</option></select></div></div><button onClick={performWaterChange} className="w-full bg-cyan-600 text-white font-black py-20 rounded-[6rem] active:scale-95 transition-all shadow-[0_120px_240px_rgba(8,145,178,1)] uppercase tracking-[2em] italic font-black leading-none ring-[16px] ring-cyan-400/40 font-black italic">EXECUTE</button><button onClick={()=>setWaterChangeModal(null)} className="w-full text-slate-800 py-8 uppercase font-black text-[18px] tracking-[3em] hover:text-slate-400 transition-all italic leading-none font-black opacity-20 font-black italic">ABORT</button></div></div></div>
      )}
    </div>
  );
}