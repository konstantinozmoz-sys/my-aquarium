import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, Activity, Fish, Plus, RefreshCw, Settings, 
  Camera, Loader2, Stethoscope, Sparkles, ScanLine, 
  Calculator, ArrowLeft, Beaker, Box, Layers, TrendingDown,
  LogOut, Crown, MapPin, X, CheckCircle, AlertTriangle, Save, Trash2, User, 
  ChevronDown, Calendar, Globe, Edit2
} from 'lucide-react';

// --- Инициализация Firebase ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, 
  onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, updateProfile 
} from "firebase/auth";
import { 
  getFirestore, doc, setDoc, updateDoc, arrayUnion, onSnapshot 
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

// OpenAI API Key (GPT-4o)
const OPENAI_API_KEY = "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";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- КОНСТАНТЫ ---
const IDEAL_PARAMS = {
  salinity: { min: 33, max: 36, unit: 'ppt', name: 'Соленость' },
  kh: { min: 7.5, max: 11.0, unit: 'dKH', name: 'Щелочность' },
  ca: { min: 400, max: 480, unit: 'ppm', name: 'Кальций' },
  mg: { min: 1250, max: 1400, unit: 'ppm', name: 'Магний' },
  no3: { min: 2, max: 15, unit: 'ppm', name: 'Нитраты' },
  po4: { min: 0.03, max: 0.1, unit: 'ppm', name: 'Фосфаты' },
  temp: { min: 24, max: 27, unit: '°C', name: 'Температура' }
};

const CORAL_TYPES = {
  sps: { label: 'SPS (Жесткие)', care: 'Сильный свет и течение' },
  lps: { label: 'LPS (Мясистые)', care: 'Средний свет, подкормка' },
  soft: { label: 'Мягкие', care: 'Неприхотливые' },
};

const CALC_DATA = {
  kh: { 'nahco3': { label: 'Сода NaHCO3', coeff: 0.03 }, 'na2co3': { label: 'Сода Na2CO3', coeff: 0.01884 } },
  ca: { 'anhydrous': { label: 'CaCl2 Безводный', coeff: 0.00277 }, 'dihydrate': { label: 'CaCl2 Дигидрат', coeff: 0.003665 } },
  balling: { ca: 71.2, kh: 82.0, salt: 25.0 }
};

const DEFAULT_PARAMS = { salinity: 35, kh: 8.5, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.5 };

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [aquariums, setAquariums] = useState([]);
  const [selectedAqId, setSelectedAqId] = useState(null);
  const [livestock, setLivestock] = useState([]);
  
  // Auth
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // UI
  const [isCreating, setIsCreating] = useState(false);
  const [newAqData, setNewAqData] = useState({ name: '', volume: '100', unit: 'L' });
  const [waterChangeModal, setWaterChangeModal] = useState(null);
  const [wcAmount, setWcAmount] = useState('');
  const [editingAqId, setEditingAqId] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingCoral, setIsAddingCoral] = useState(false);
  const [newCoral, setNewCoral] = useState({ name: '', type: 'sps' });

  // OpenAI Vision Logic
  const callVision = async (imageData, mimeType, prompt) => {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } }] }],
          max_tokens: 500
        })
      });
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (e) { alert("Ошибка нейросети."); return null; }
  };

  // Firebase Sync
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData(data);
            setAquariums(data.aquariums || []);
            setLivestock(data.livestock || []);
            if (!selectedAqId && data.aquariums?.length) setSelectedAqId(data.aquariums[0].id);
          } else {
            initNewUser(u);
          }
          setLoading(false);
        });
      } else { setLoading(false); }
    });
  }, [selectedAqId]);

  const initNewUser = async (u) => {
    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    await setDoc(doc(db, "users", u.uid), {
      email: u.email, personalInfo: { fullName: u.displayName || 'Аквариумист', city: '', country: '', dob: '' },
      subscription: { name: 'PRO Trial', expiresAt: exp.toISOString() },
      aquariums: [{ id: Date.now().toString(), name: 'Мой Риф', params: DEFAULT_PARAMS, volume: 100, volumeUnit: 'L', lastWaterChange: new Date().toISOString(), stabilityStatus: 'stable' }],
      livestock: []
    });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: fullName });
      }
    } catch (err) { alert("Ошибка доступа: " + err.message); }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { alert("Ошибка Google."); }
  };

  const handleAqAction = async (type, payload) => {
    const userRef = doc(db, "users", user.uid);
    if (type === 'add') {
      const n = { id: Date.now().toString(), name: payload.name, volume: parseFloat(payload.volume), volumeUnit: 'L', params: DEFAULT_PARAMS, lastWaterChange: new Date().toISOString(), stabilityStatus: 'stable' };
      await updateDoc(userRef, { aquariums: [...aquariums, n] });
      setIsCreating(false);
    } else if (type === 'delete') {
      await updateDoc(userRef, { aquariums: aquariums.filter(a => a.id !== payload) });
      setEditingAqId(null);
    } else if (type === 'wc') {
      const list = aquariums.map(a => a.id === payload.id ? { ...a, lastWaterChange: new Date().toISOString() } : a);
      await updateDoc(userRef, { aquariums: list });
      setWaterChangeModal(null);
    }
  };

  const updateProfileData = async (data) => {
    await updateDoc(doc(db, "users", user.uid), { personalInfo: data });
    setIsEditingProfile(false);
  };

  const handleAddCoral = async () => {
    if (!newCoral.name) return;
    const item = { ...newCoral, id: Date.now(), aqId: selectedAqId, date: new Date().toISOString() };
    await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion(item) });
    setNewCoral({ name: '', type: 'sps' });
    setIsAddingCoral(false);
  };

  // --- Views ---
  const NavItem = ({ icon: Icon, id, label }) => (
    <button onClick={() => setActiveTab(id)} className={`nav-btn ${activeTab === id ? 'active' : ''}`}>
      <Icon size={20} strokeWidth={2} />
      <span className="nav-label">{label}</span>
    </button>
  );

  const Dashboard = () => {
    const bioLoad = livestock.filter(l => l.aqId === selectedAqId).length;
    return (
      <div className="animate-fadeIn max-w-md mx-auto px-5 pt-8 pb-10 italic font-black">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight italic">ТЕРМИНАЛ</h1>
            <p className="text-[9px] text-cyan-500 uppercase tracking-[0.2em] font-medium flex items-center gap-1 opacity-70">
              <MapPin size={10}/> {userData?.personalInfo?.city || 'СЕКТОР-АВТОНОМНО'}
            </p>
          </div>
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest italic leading-none">V 4.2</div>
        </div>

        <div className="space-y-5">
          {aquariums.map(aq => (
            <div key={aq.id} className="glass-card p-6 relative overflow-hidden group">
              <Activity className="absolute -right-4 -bottom-4 opacity-[0.02] text-cyan-400 group-hover:scale-110 transition-transform duration-1000" size={160}/>
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 bg-cyan-500 rounded-full"></div>
                  <h2 className="text-base font-bold text-white uppercase tracking-tight italic">{aq.name}</h2>
                  <button onClick={() => setEditingAqId(aq.id)} className="text-slate-700 hover:text-cyan-400 transition-colors p-1"><Settings size={16}/></button>
                </div>
                <div className="text-[8px] font-bold px-2.5 py-1 rounded-full border border-green-500/20 text-green-500 uppercase tracking-widest leading-none">Стабильно</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 relative z-10 leading-none">
                <div className="bg-[#020617]/60 p-4 rounded-2xl border border-white/5 shadow-inner">
                  <p className="text-[8px] text-cyan-400/60 font-bold mb-1 uppercase tracking-widest">Щелочность</p>
                  <p className="text-xl font-mono font-bold text-white leading-none">{aq.params?.kh || '0'}</p>
                </div>
                <div className="bg-[#020617]/60 p-4 rounded-2xl border border-white/5 shadow-inner">
                  <p className="text-[8px] text-cyan-400/60 font-bold mb-1 uppercase tracking-widest">Соленость</p>
                  <p className="text-xl font-mono font-bold text-white leading-none">{aq.params?.salinity || '0'}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-between items-center px-2">
                 <span className="text-[8px] text-slate-600 uppercase font-bold tracking-widest">Био-нагрузка: {bioLoad} ед.</span>
                 <span className="text-[8px] text-slate-800 uppercase font-bold italic">Подмена: {new Date(aq.lastWaterChange).toLocaleDateString()}</span>
              </div>

              <button 
                onClick={() => setWaterChangeModal(aq.id)} 
                className="w-full mt-6 py-3.5 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white rounded-xl text-[9px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-cyan-900/20 active:scale-95 transition-all relative z-10"
              >
                Записать обслуживание
              </button>
            </div>
          ))}

          <button 
            onClick={() => setIsCreating(true)}
            className="w-full py-6 border border-dashed border-slate-800 rounded-[2rem] flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-cyan-400 hover:border-cyan-400/30 transition-all active:scale-95 group"
          >
            <div className="p-2 bg-slate-900 rounded-full group-hover:bg-cyan-900/20 transition-colors leading-none"><Plus size={20}/></div>
            <span className="text-[9px] font-bold uppercase tracking-widest italic leading-none">Инициировать систему</span>
          </button>
        </div>
      </div>
    );
  };

  const Lab = () => {
    const active = aquariums.find(a => a.id === selectedAqId) || aquariums[0];
    const [local, setLocal] = useState(active?.params || DEFAULT_PARAMS);
    const [busy, setBusy] = useState(false);

    const scan = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setBusy(true);
      try {
        const reader = new FileReader();
        const base64 = await new Promise(r => { reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(file); });
        const resText = await callVision(base64, file.type, "Extract ICP params: salinity, kh, ca, mg, no3, po4. Return JSON only.");
        setLocal({ ...local, ...JSON.parse(resText.replace(/```json|```/g, '').trim()) });
        alert("✅ Данные распознаны!");
      } catch (err) { alert("Ошибка сканнера."); }
      setBusy(false);
    };

    return (
      <div className="max-w-md mx-auto px-5 pt-8 pb-12 animate-fadeIn italic font-black">
        <h2 className="text-xl font-bold text-white uppercase italic mb-8 tracking-tighter">Нейро-Лаборатория</h2>
        <input type="file" id="lab-scan" className="hidden" onChange={scan} />
        <label htmlFor="lab-scan" className={`w-full p-8 border border-dashed border-cyan-900/40 bg-cyan-950/5 rounded-3xl flex flex-col items-center gap-4 cursor-pointer hover:bg-cyan-950/10 transition-all ${busy ? 'opacity-50' : ''}`}>
          {busy ? <Loader2 className="animate-spin text-cyan-400" size={24} /> : <ScanLine size={32} className="text-cyan-400" />}
          <div className="text-center">
            <p className="text-white text-[10px] font-bold uppercase tracking-widest">СКАНЕР ИЦП</p>
            <p className="text-[8px] text-slate-600 uppercase font-bold mt-1 leading-none italic">Авто-синхронизация Vision GPT-4</p>
          </div>
        </label>
        <div className="mt-8 space-y-2.5">
          {Object.entries(IDEAL_PARAMS).map(([k, v]) => (
            <div key={k} className="glass-card !p-4 flex justify-between items-center leading-none">
              <div className="leading-tight">
                <p className="text-slate-100 text-xs font-bold uppercase italic leading-none">{v.name}</p>
                <p className="text-[8px] text-slate-700 font-bold uppercase mt-1 leading-none">Норма: {v.min}-{v.max}</p>
              </div>
              <input type="number" step="0.1" value={local[k]} onChange={e => setLocal({...local, [k]: e.target.value})} className="w-20 bg-slate-950 border border-white/5 rounded-lg p-2.5 text-center text-white font-mono text-sm outline-none focus:border-cyan-500 italic font-black leading-none" />
            </div>
          ))}
          <button onClick={async () => {
            const list = aquariums.map(a => a.id === selectedAqId ? { ...a, params: local } : a);
            await updateDoc(doc(db, "users", user.uid), { aquariums: list }); alert("Обновлено!");
          }} className="w-full mt-6 py-4 bg-cyan-600 text-white rounded-xl font-bold uppercase text-[9px] tracking-widest shadow-xl">Применить параметры</button>
        </div>
      </div>
    );
  };

  const Livestock = () => {
    const list = livestock.filter(l => l.aqId === selectedAqId);
    return (
      <div className="max-w-md mx-auto px-5 pt-8 pb-12 animate-fadeIn italic font-black leading-none">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-white uppercase italic tracking-tighter">Био-Сфера</h2>
          <button onClick={() => setIsAddingCoral(true)} className="p-2.5 bg-cyan-600 rounded-xl text-white shadow-lg active:scale-90 transition-all leading-none"><Plus size={20}/></button>
        </div>

        <div className="space-y-4">
           {list.length === 0 ? (
               <div className="py-20 text-center opacity-10"><Fish size={60} className="mx-auto mb-4"/><p className="text-[9px] uppercase font-bold">Журнал пуст</p></div>
           ) : list.map(item => (
               <div key={item.id} className="glass-card !p-4 flex justify-between items-center group leading-none">
                  <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${item.type === 'sps' ? 'bg-purple-500 shadow-[0_0_10px_purple]' : item.type === 'lps' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-yellow-500'}`}></div>
                      <div className="leading-none">
                          <h3 className="text-white font-bold text-sm uppercase italic leading-none">{item.name}</h3>
                          <p className="text-[9px] text-slate-700 uppercase mt-1.5 font-bold leading-none">{CORAL_TYPES[item.type]?.label}</p>
                      </div>
                  </div>
                  <button onClick={async () => {
                      const updated = livestock.filter(l => l.id !== item.id);
                      await updateDoc(doc(db, "users", user.uid), { livestock: updated });
                  }} className="text-slate-800 hover:text-red-500 p-2 opacity-30 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
               </div>
           ))}
        </div>
      </div>
    );
  };

  const Tools = () => {
    const [tool, setTool] = useState(null);
    const [v, setV] = useState({ v: 300, c: 7, t: 8, f: 'nahco3' });
    const res = useMemo(() => ((v.t - v.c) * v.v * (tool==='kh'?CALC_DATA.kh[v.f].coeff:0.003665)).toFixed(1), [v, tool]);

    if (!tool) return (
      <div className="max-w-md mx-auto px-5 pt-8 pb-12 animate-fadeIn italic font-black leading-none">
        <h2 className="text-xl font-bold text-white uppercase mb-10 tracking-tighter">Инструменты</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { id:'kh', n:'KH Буфер', i:Activity, c:'text-purple-400' },
            { id:'ca', n:'Кальций', i:Beaker, c:'text-blue-400' },
            { id:'bal', n:'Баллинг', i:Droplets, c:'text-yellow-400' },
            { id:'vol', n:'Объем', i:Box, c:'text-cyan-400' }
          ].map(i => (
            <button key={i.id} onClick={()=>setTool(i.id)} className="glass-card !p-6 flex flex-col items-center gap-3 active:scale-95 transition-all">
              <div className="p-3.5 bg-slate-950 rounded-xl shadow-inner"><i.i className={i.c} size={22} /></div>
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">{i.n}</span>
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div className="max-w-md mx-auto px-5 pt-8 animate-fadeIn italic font-black leading-none">
        <button onClick={()=>setTool(null)} className="flex items-center gap-2 text-cyan-400 text-[10px] uppercase font-bold mb-8 active:scale-90 transition-all leading-none italic"><ArrowLeft size={16}/> Вернуться</button>
        <div className="glass-card !p-8 space-y-10 shadow-2xl leading-none">
          <div className="space-y-6 leading-none italic">
            <label className="text-[9px] text-slate-600 uppercase font-bold tracking-widest px-4 italic">Масса системы (Л)</label>
            <input type="number" value={v.v} onChange={e => setV({...v, v: e.target.value})} className="w-full bg-transparent text-center text-4xl font-mono font-bold text-white outline-none border-b border-slate-800 focus:border-cyan-500 transition-all pb-2 shadow-inner" placeholder="000" />
            <div className="grid grid-cols-2 gap-4 leading-none font-bold">
              <div className="bg-slate-950 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                <label className="text-[7px] text-slate-700 uppercase font-bold mb-2 block">Было</label>
                <input type="number" value={v.c} onChange={e => setV({...v, c: e.target.value})} className="bg-transparent text-white text-lg font-bold w-full text-center outline-none" />
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                <label className="text-[7px] text-slate-700 uppercase font-bold mb-2 block">Цель</label>
                <input type="number" value={v.t} onChange={e => setV({...v, t: e.target.value})} className="bg-transparent text-white text-lg font-bold w-full text-center outline-none" />
              </div>
            </div>
          </div>
          <div className="bg-cyan-900/10 p-10 rounded-3xl border border-cyan-500/20 text-center shadow-inner relative overflow-hidden leading-none font-black">
            <p className="text-[9px] text-cyan-400 font-bold uppercase mb-4 tracking-[0.2em] italic opacity-60">Дозировка</p>
            <div className="text-6xl font-black text-white italic tracking-tighter leading-none relative z-10">
              {res} <span className="text-xl text-cyan-500/20 ml-2 font-normal not-italic uppercase">г</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Doctor = () => {
    const [img, setImg] = useState(null);
    const [res, setRes] = useState('');
    const [busy, setBusy] = useState(false);
    const handle = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setBusy(true); setImg(URL.createObjectURL(f));
      try {
        const reader = new FileReader();
        const base64 = await new Promise(r => { reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(f); });
        const txt = await callVision(base64, f.type, "Analyze this aquarium specimen photo. Identify diseases RTN/STN or parasites. Reply briefly in Russian.");
        setRes(txt);
      } catch (err) { alert("Ошибка ИИ."); }
      setBusy(false);
    };
    return (
      <div className="max-w-md mx-auto px-5 pt-8 animate-fadeIn font-black italic leading-none">
        <h2 className="text-xl font-bold uppercase text-white mb-10 italic underline decoration-emerald-500 decoration-4 underline-offset-8">ИИ Доктор</h2>
        <div className="bg-emerald-950/5 p-10 rounded-3xl border border-emerald-500/20 text-center relative overflow-hidden mb-10 shadow-2xl">
          <Stethoscope className="absolute -right-8 -bottom-8 opacity-5 rotate-12" size={200}/>
          <input type="file" id="ai-doc" className="hidden" onChange={handle} />
          <label htmlFor="ai-doc" className={`w-full py-4 bg-white text-emerald-950 rounded-xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-3 cursor-pointer shadow-xl active:scale-95 transition-all z-10 relative ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            <span>{busy ? 'Анализ...' : 'Изучить пациента'}</span>
          </label>
        </div>
        {img && <div className="rounded-3xl overflow-hidden border-4 border-slate-900 shadow-2xl h-64 mb-10 italic"><img src={img} className="w-full h-full object-cover" /></div>}
        {res && <div className="bg-slate-900/60 p-8 rounded-[2rem] border border-emerald-500/20 shadow-xl animate-slideUp">
          <p className="text-slate-300 text-xs font-medium leading-relaxed italic opacity-80">{res}</p>
        </div>}
      </div>
    );
  };

  const Profile = () => {
    const left = useMemo(() => userData?.subscription?.expiresAt ? Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / 86400000)) : 0, [userData]);
    const [editData, setEditData] = useState({ fullName: '', city: '', country: '', dob: '' });
    useEffect(() => { if (userData?.personalInfo) setEditData(userData.personalInfo); }, [userData]);

    return (
      <div className="max-w-md mx-auto px-5 pt-8 pb-12 animate-fadeIn italic font-black leading-none">
        <div className="glass-card !p-10 flex flex-col items-center text-center relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600 to-blue-800 shadow-lg shadow-cyan-900/30"></div>
          <div className="w-20 h-20 bg-gradient-to-tr from-cyan-600 to-blue-800 rounded-3xl flex items-center justify-center text-white font-bold text-4xl shadow-xl ring-8 ring-slate-950 uppercase italic">
              {user?.email?.[0] || 'H'}
          </div>
          {!isEditingProfile ? (
            <div className="mt-8 space-y-4 w-full leading-none">
                <h2 className="text-xl font-bold text-white uppercase italic tracking-tight">{userData?.personalInfo?.fullName || 'ХРАНИТЕЛЬ'}</h2>
                <p className="text-[10px] text-slate-700 uppercase tracking-[0.4em] mb-10 font-bold">{user?.email}</p>
                <div className="grid grid-cols-2 gap-3 pt-4">
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 text-left italic leading-none">
                        <p className="text-[7px] text-slate-800 uppercase font-bold mb-2">Локация</p>
                        <p className="text-xs text-slate-300 truncate font-black">{userData?.personalInfo?.city || '-'}, {userData?.personalInfo?.country || '-'}</p>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 text-left italic leading-none">
                        <p className="text-[7px] text-slate-800 uppercase font-bold mb-2">Реестр</p>
                        <p className="text-xs text-slate-300 font-bold font-black">{userData?.personalInfo?.dob || '-'}</p>
                    </div>
                </div>
                <button onClick={() => setIsEditingProfile(true)} className="flex items-center gap-2 text-cyan-400 text-[9px] font-bold uppercase tracking-widest pt-8 mx-auto hover:text-cyan-300 transition-colors leading-none italic"><Settings size={12}/> Редактировать профиль</button>
            </div>
          ) : (
            <div className="mt-8 space-y-4 w-full text-left font-bold leading-none">
                <div className="space-y-1.5 leading-none"><label className="text-[7px] text-slate-700 uppercase px-2">Позывной</label><input value={editData.fullName} onChange={e=>setEditData({...editData, fullName: e.target.value})} className="profile-input" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 leading-none"><label className="text-[7px] text-slate-700 uppercase px-2">Страна</label><input value={editData.country} onChange={e=>setEditData({...editData, country: e.target.value})} className="profile-input" /></div>
                    <div className="space-y-1.5 leading-none"><label className="text-[7px] text-slate-700 uppercase px-2">Сектор</label><input value={editData.city} onChange={e=>setEditData({...editData, city: e.target.value})} className="profile-input" /></div>
                </div>
                <div className="space-y-1.5 leading-none"><label className="text-[7px] text-slate-700 uppercase px-2">Дата в реестре</label><input type="date" value={editData.dob} onChange={e=>setEditData({...editData, dob: e.target.value})} className="profile-input" /></div>
                <div className="flex gap-3 pt-6 leading-none">
                    <button onClick={() => setIsEditingProfile(false)} className="flex-1 py-3.5 bg-slate-800 rounded-xl text-[9px] font-bold uppercase italic active:scale-95 transition-all">Отмена</button>
                    <button onClick={() => updateProfileData(editData)} className="flex-1 py-3.5 bg-cyan-600 rounded-xl text-[9px] font-bold uppercase italic text-white shadow-lg active:scale-95 transition-all">Сохранить</button>
                </div>
            </div>
          )}
        </div>
        
        <div className="bg-amber-950/10 p-8 rounded-3xl mt-6 border border-amber-500/20 shadow-2xl relative overflow-hidden group">
           <Crown className="absolute -right-4 -bottom-4 opacity-[0.03] text-amber-500 group-hover:scale-110 transition-transform duration-700" size={120}/>
           <div className="flex justify-between items-center mb-6 italic leading-none">
              <div className="flex items-center gap-4 leading-none font-bold"><Crown className="text-amber-500 shadow-lg shadow-amber-900/30" size={32}/><div><p className="text-amber-200 uppercase text-[9px] font-bold italic">ТЕРМИНАЛ ПРО</p></div></div>
              <div className="text-[60px] font-black text-amber-500 tracking-tighter leading-none shadow-amber-950/50">{left}</div>
           </div>
           <div className="progress-track leading-none shadow-inner"><div className="progress-fill shadow-amber-500/50" style={{width:`${(left/30)*100}%`}}></div></div>
        </div>
        <button onClick={() => signOut(auth)} className="shutdown-btn mt-10 active:scale-95 transition-all shadow-xl leading-none">
          <LogOut size={16}/> Завершить сессию
        </button>
      </div>
    );
  };

  // --- Auth Screen ---
  if (!user && !loading) return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-8 selection:bg-cyan-500/50 italic font-black">
      <div className="w-full max-w-sm text-center space-y-12">
        <div className="w-24 h-24 bg-gradient-to-tr from-cyan-600 to-blue-900 rounded-[2rem] flex items-center justify-center mx-auto shadow-[0_40px_80px_rgba(0,0,0,1)] rotate-12 transition-transform duration-1000 ring-[10px] ring-slate-900/50 leading-none">
            <Fish size={50} strokeWidth={4} className="text-white drop-shadow-2xl" />
        </div>
        <h1 className="text-6xl font-black text-white italic tracking-tighter uppercase drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] leading-none">Keeper</h1>
        <div className="bg-slate-900/80 p-8 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-8 backdrop-blur-xl ring-1 ring-white/5 leading-none">
           <div className="flex bg-slate-950 p-1.5 rounded-2xl leading-none shadow-inner italic">
             <button onClick={()=>setAuthMode('login')} className={`flex-1 py-4 rounded-xl text-[11px] font-bold uppercase italic transition-all leading-none ${authMode==='login'?'bg-slate-800 text-white shadow-xl':'text-slate-800'}`}>ВХОД</button>
             <button onClick={()=>setAuthMode('reg')} className={`flex-1 py-4 rounded-xl text-[11px] font-bold uppercase italic transition-all leading-none ${authMode==='reg'?'bg-slate-800 text-white shadow-xl':'text-slate-800'}`}>РЕКРУТ</button>
           </div>
           <form onSubmit={handleAuthSubmit} className="space-y-4 font-bold italic leading-none">
             {authMode==='reg' && <input placeholder="ПОЗЫВНОЙ" required className="auth-input shadow-inner !p-5 !text-lg leading-none" value={fullName} onChange={e=>setFullName(e.target.value)} />}
             <input type="email" placeholder="ACCESS EMAIL" required className="auth-input shadow-inner !p-5 !text-lg leading-none" value={email} onChange={e=>setEmail(e.target.value)} />
             <input type="password" placeholder="ACCESS KEY" required className="auth-input shadow-inner !p-5 !text-lg leading-none" value={password} onChange={e=>setPassword(e.target.value)} />
             <button className="w-full py-5 bg-cyan-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-cyan-900/30 active:scale-95 transition-all mt-6 italic leading-none">АКТИВИРОВАТЬ</button>
           </form>
           <button onClick={handleGoogleLogin} className="w-full py-5 bg-white text-slate-950 rounded-2xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-6 active:scale-95 transition-all shadow-xl leading-none italic"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5 shadow-2xl" alt="G" /> Google Link</button>
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center font-black text-cyan-400 uppercase tracking-widest text-[10px] animate-pulse italic leading-none gap-6 italic">
      <Fish size={60} className="rotate-12" strokeWidth={5}/>
      <span>BOOTING CORE...</span>
  </div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200">
      <style>{`
        .glass-card { background: rgba(15, 23, 42, 0.6); border-radius: 2.5rem; border: 1px solid rgba(255,255,255,0.05); padding: 2rem; box-shadow: 0 30px 60px rgba(0,0,0,0.4); position: relative; transition: 0.4s ease; }
        .nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; color: #1e293b; background: none; border: none; cursor: pointer; transition: 0.5s; padding: 12px 0; }
        .nav-btn.active { color: #06b6d4; filter: drop-shadow(0 0 15px rgba(6,182,212,0.8)); transform: scale(1.15); }
        .nav-label { font-size: 7px; font-weight: 800; text-transform: uppercase; margin-top: 5px; font-style: italic; opacity: 0.6; }
        .auth-input { width: 100%; background: #020617; border: 1px solid #1e293b; border-radius: 1.5rem; padding: 1.5rem; color: white; text-align: center; font-weight: 900; font-size: 1.1rem; outline: none; transition: 0.3s; }
        .profile-input { width: 100%; background: #020617; border: 1px solid #1e293b; border-radius: 1rem; padding: 1.25rem; color: white; outline: none; font-size: 0.9rem; font-style: italic; shadow-inner; font-weight: 700; transition: 0.3s; }
        .profile-input:focus { border-color: #06b6d4; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(25px); display: flex; align-items: center; justify-content: center; p: 2rem; z-index: 5000; }
        .modal-card { background: #0f172a; border-radius: 3rem; p: 2.5rem; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.05); shadow-[0_50px_100px_rgba(0,0,0,1)]; }
        .progress-track { width: 100%; height: 8px; background: #020617; border-radius: 99px; overflow: hidden; padding: 2px; ring: 1px rgba(255,255,255,0.05); }
        .progress-fill { height: 100%; background: linear-gradient(to right, #f59e0b, #ef4444); border-radius: 99px; transition: width 2s; shadow: 0 0 20px #f59e0b; }
        .shutdown-btn { width: 100%; padding: 1.25rem; background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.1); border-radius: 1.5rem; color: #ef4444; font-weight: 900; letter-spacing: 0.3em; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: 0.3s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-slideUp { animation: slideUp 0.5s ease-out; }
      `}</style>

      <main>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'parameters' && <Lab />}
        {activeTab === 'tools' && <Tools />}
        {activeTab === 'livestock' && <Livestock />}
        {activeTab === 'doctor' && <Doctor />}
        {activeTab === 'profile' && <Profile />}
      </main>
      
      <nav className="fixed bottom-0 left-0 w-full bg-slate-900/90 backdrop-blur-2xl border-t border-white/5 z-[2000] flex justify-around items-center px-4 rounded-t-[2.5rem] shadow-[0_-20px_40px_rgba(0,0,0,1)] ring-1 ring-white/5">
        <NavItem icon={Activity} id="dashboard" label="ХАБ"/>
        <NavItem icon={Droplets} id="parameters" label="ЛАБ"/>
        <NavItem icon={Calculator} id="tools" label="ДОЗ"/>
        <NavItem icon={Fish} id="livestock" label="БИО"/>
        <NavItem icon={Stethoscope} id="doctor" label="ДОК"/>
        <NavItem icon={User} id="profile" label="Я"/>
      </nav>

      {/* МОДАЛКИ (ФИКС) */}
      {isCreating && (
        <div className="modal-overlay animate-fadeIn italic font-black leading-none">
          <div className="modal-card">
            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-8 leading-none">Новая система</h2>
            <div className="space-y-6">
              <div className="space-y-2 leading-none"><label className="text-[10px] text-slate-700 uppercase font-black px-2 italic leading-none">Идентификатор</label><input autoFocus placeholder="Проект Зеро" className="auth-input italic shadow-inner !p-5 !text-lg font-black leading-none" value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} /></div>
              <div className="space-y-2 leading-none"><label className="text-[10px] text-slate-700 uppercase font-black px-2 italic leading-none">Чистый объем (Л)</label><input type="number" placeholder="100" className="auth-input italic shadow-inner !p-5 !text-4xl font-black leading-none" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} /></div>
              <div className="flex flex-col gap-3 pt-6 leading-none italic">
                  <button onClick={()=>handleAqAction('add', newAqData)} className="w-full py-5 bg-cyan-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all">Активировать</button>
                  <button onClick={()=>setIsCreating(false)} className="w-full py-4 text-slate-700 font-black uppercase text-[9px] tracking-widest italic opacity-40">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {waterChangeModal && (
        <div className="modal-overlay animate-fadeIn italic font-black">
          <div className="modal-card text-center italic font-black leading-none">
            <h2 className="text-4xl text-white uppercase italic mb-8 leading-none font-black underline decoration-cyan-500 decoration-4 underline-offset-8">Обслуживание</h2>
            <div className="my-10 flex items-center justify-center gap-4 leading-none">
              <input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-transparent text-white text-7xl font-mono font-black text-center outline-none border-b border-slate-800 focus:border-cyan-500 transition-all pb-2 italic shadow-inner leading-none" />
              <span className="text-3xl text-slate-800 italic leading-none">Л</span>
            </div>
            <div className="flex flex-col gap-3 pt-4 italic font-black leading-none">
                <button onClick={()=>handleAqAction('wc', {id: waterChangeModal})} className="w-full py-6 bg-cyan-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-95 shadow-xl shadow-cyan-900/30 ring-1 ring-cyan-400/20 italic leading-none">Записать данные</button>
                <button onClick={()=>setWaterChangeModal(null)} className="w-full py-4 text-slate-700 font-black uppercase text-[9px] tracking-widest italic opacity-40 leading-none">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {editingAqId && (
        <div className="modal-overlay italic font-black leading-none">
          <div className="modal-card text-center !border-red-900/30 shadow-red-950/20 ring-1 ring-red-900/10">
            <Trash2 size={60} className="mx-auto text-red-500 mb-8 opacity-20"/>
            <h2 className="text-2xl text-white uppercase italic leading-none mb-8 font-black">Удалить ядро?</h2>
            <p className="text-slate-600 text-[10px] font-black uppercase mb-12 tracking-widest leading-relaxed opacity-40 px-4">Все биологические данные и логи будут стерты из облака.</p>
            <div className="flex gap-4 italic font-black">
              <button onClick={()=>setEditingAqId(null)} className="flex-1 py-4 bg-slate-800 rounded-xl text-white font-bold text-[9px] uppercase italic">Отмена</button>
              <button onClick={()=>handleAqAction('delete', editingAqId)} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-bold text-[9px] uppercase shadow-lg shadow-red-900/40 active:scale-95 italic">Стереть</button>
            </div>
          </div>
        </div>
      )}

      {/* Добавление жителя */}
      {isAddingCoral && (
          <div className="modal-overlay animate-fadeIn italic font-black leading-none">
              <div className="modal-card italic font-black leading-none">
                  <h2 className="text-xl font-black text-white uppercase italic mb-8 underline decoration-cyan-500 decoration-4 underline-offset-8">Новый образец</h2>
                  <div className="space-y-6 italic font-black leading-none">
                      <div className="space-y-2 italic font-black leading-none"><label className="text-[8px] text-slate-700 uppercase px-2 italic font-black">Название вида</label><input placeholder="Acropora Sp." className="auth-input italic shadow-inner !p-4 !text-base font-black leading-none" value={newCoral.name} onChange={e=>setNewCoral({...newCoral, name: e.target.value})} /></div>
                      <div className="space-y-2 italic font-black leading-none">
                          <label className="text-[8px] text-slate-700 uppercase px-2 italic font-black">Тип коралла</label>
                          <div className="grid grid-cols-3 gap-2 leading-none font-bold">
                              {['sps', 'lps', 'soft'].map(t => (<button key={t} onClick={()=>setNewCoral({...newCoral, type: t})} className={`p-3 rounded-xl border text-[9px] font-bold uppercase transition-all ${newCoral.type === t ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-950 border-white/5 text-slate-700'}`}>{t}</button>))}
                          </div>
                      </div>
                      <div className="flex flex-col gap-3 pt-6 leading-none italic font-black">
                          <button onClick={handleAddCoral} className="w-full py-4 bg-cyan-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest active:scale-95 shadow-xl shadow-cyan-900/40 italic">Регистрация</button>
                          <button onClick={()=>setIsAddingCoral(false)} className="w-full py-3 text-slate-700 font-bold uppercase text-[9px] italic opacity-40">Отмена</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}