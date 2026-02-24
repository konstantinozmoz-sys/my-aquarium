import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, Activity, Fish, Plus, RefreshCw, Settings, 
  Camera, Loader2, Stethoscope, Sparkles, ScanLine, 
  Calculator, ArrowLeft, Beaker, Box, Layers, TrendingDown,
  LogOut, Crown, MapPin, X, CheckCircle, AlertTriangle, Save, Trash2, User, 
  ChevronDown, Calendar, Globe, Info, Edit2
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

const firebaseConfig = {
  apiKey: "AIzaSyAje8rftBvZuC0cFJSh5He4oHsUVT0xZnU",
  authDomain: "marinekeeper.firebaseapp.com",
  projectId: "marinekeeper",
  storageBucket: "marinekeeper.firebasestorage.app",
  messagingSenderId: "3819422761",
  appId: "1:3819422761:web:3f40c57060ea878987c838",
  measurementId: "G-RDWEZCWREF"
};

/**
 * КОНФИГУРАЦИЯ API (VERCEL)
 * Ключ OpenAI теперь полностью скрыт на стороне сервера Vercel.
 * Приложение обращается к локальному эндпоинту /api/analyze
 */
const API_ENDPOINT = "/api/analyze"; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- СПРАВОЧНИКИ И ОПИСАНИЯ ---
const IDEAL_PARAMS = {
  salinity: { 
    min: 33, max: 36, unit: 'ppt', name: 'Соленость', 
    desc: 'Концентрация соли в воде. Оптимально — 35 ppt. Низкая соленость мешает росту кораллов, высокая — угнетает рыб.' 
  },
  kh: { 
    min: 7.5, max: 11.0, unit: 'dKH', name: 'Щелочность', 
    desc: 'Буферная емкость воды. Главный параметр для роста скелетов жестких кораллов и стабильности pH.' 
  },
  ca: { 
    min: 400, max: 480, unit: 'ppm', name: 'Кальций', 
    desc: 'Строительный материал для рифа. Должен быть в балансе с щелочностью.' 
  },
  mg: { 
    min: 1250, max: 1400, unit: 'ppm', name: 'Магний', 
    desc: 'Удерживает кальций и карбонаты в растворенном виде. Без него параметры будут "скакать".' 
  },
  no3: { 
    min: 2, max: 15, unit: 'ppm', name: 'Нитраты', 
    desc: 'Показатель органического загрязнения. В малых дозах — еда для кораллов, в больших — причина роста водорослей.' 
  },
  po4: { 
    min: 0.03, max: 0.1, unit: 'ppm', name: 'Фосфаты', 
    desc: 'Продукт жизнедеятельности. Избыток блокирует рост кораллов и портит вид аквариума.' 
  },
  temp: { 
    min: 24, max: 27, unit: '°C', name: 'Температура', 
    desc: 'Риф любит прохладу. Скачки выше 28°C могут привести к гибели всей системы.' 
  }
};

const REAGENTS = {
  kh: [
    { brand: "Reef Exclusive", potency: 0.03 },
    { brand: "Red Sea", potency: 0.033 },
    { brand: "Tropic Marin", potency: 0.028 }
  ],
  ca: [
    { brand: "Reef Exclusive", potency: 0.0036 },
    { brand: "Red Sea", potency: 0.0038 }
  ]
};

const CORAL_TYPES = {
  sps: { label: 'SPS (Жесткие)', care: 'Свет++, Течение++, Стабильность++' },
  lps: { label: 'LPS (Мясистые)', care: 'Средний свет, умеренное течение' },
  soft: { label: 'Мягкие', care: 'Неприхотливые, средний свет' },
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
  
  // Auth States
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // UI States
  const [isCreating, setIsCreating] = useState(false);
  const [newAqData, setNewAqData] = useState({ name: '', volume: '100' });
  const [waterChangeModal, setWaterChangeModal] = useState(null);
  const [wcAmount, setWcAmount] = useState('');
  const [editingAqId, setEditingAqId] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingCoral, setIsAddingCoral] = useState(false);
  const [newCoral, setNewCoral] = useState({ name: '', type: 'sps' });

  // OpenAI Vision API Logic (Vercel Proxy)
  const callVision = async (imageData, mimeType, prompt) => {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageData}` } }] }],
          model: "gpt-4o",
          max_tokens: 800
        })
      });
      
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "ИИ не вернул результат анализа.";
    } catch (e) { 
      return `Ошибка связи с ИИ: ${e.message}. Убедитесь, что серверная функция на Vercel активна.`; 
    }
  };

  // Sync Firebase
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
            initProfile(u);
          }
          setLoading(false);
        });
      } else { setLoading(false); }
    });
  }, [selectedAqId]);

  const initProfile = async (u) => {
    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    await setDoc(doc(db, "users", u.uid), {
      email: u.email, 
      personalInfo: { fullName: u.displayName || 'Аквариумист', city: 'Нови-Сад', country: 'Сербия', dob: '' },
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
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { }
  };

  const handleAqAction = async (type, payload) => {
    if (!user) return;
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

  const handleAddCoral = async () => {
    if (!newCoral.name) return;
    const item = { ...newCoral, id: Date.now(), aqId: selectedAqId, date: new Date().toISOString() };
    await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion(item) });
    setNewCoral({ name: '', type: 'sps' });
    setIsAddingCoral(false);
  };

  const updateProfileData = async (data) => {
    await updateDoc(doc(db, "users", user.uid), { personalInfo: data });
    setIsEditingProfile(false);
  };

  // --- Views ---
  const NavItem = ({ icon: Icon, id, label }) => (
    <button onClick={() => setActiveTab(id)} className={`nav-btn ${activeTab === id ? 'active' : ''}`}>
      <Icon size={20} strokeWidth={2.5} />
      <span className="nav-label">{label}</span>
    </button>
  );

  const Dashboard = () => {
    const coralsInAq = livestock.filter(l => l.aqId === selectedAqId).length;
    const bioLoad = coralsInAq > 15 ? 'Высокая' : coralsInAq > 5 ? 'Средняя' : 'Низкая';

    return (
      <div className="view-container animate-fadeIn italic font-black leading-none">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="header-title uppercase tracking-tighter italic font-black">Терминал</h1>
            <p className="header-subtitle flex items-center gap-1 mt-2 italic font-black">
              <MapPin size={10}/> {userData?.personalInfo?.city || 'СЕКТОР-АВТОНОМНО'}
            </p>
          </div>
          <div className="text-[10px] text-slate-800 opacity-40 font-bold italic font-black">V 4.3</div>
        </header>

        <div className="space-y-6">
          {aquariums.map(aq => (
            <div key={aq.id} className="premium-card">
              <Activity className="card-bg-icon" size={160}/>
              <div className="flex justify-between items-start mb-6 relative z-10 leading-none italic font-black">
                <div className="flex items-center gap-3">
                  <div className="accent-bar shadow-cyan-400/50"></div>
                  <h2 className="text-lg font-black text-white uppercase italic truncate max-w-[150px] leading-none">{aq.name}</h2>
                  <button onClick={() => setEditingAqId(aq.id)} className="text-slate-800 hover:text-cyan-400 p-1 transition-colors leading-none"><Settings size={18}/></button>
                </div>
                <div className="status-badge italic font-black">СТАБИЛЬНО</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 relative z-10 font-black italic">
                <div className="stat-pill shadow-inner">
                  <p className="stat-pill-label font-black italic leading-none">Щелочность</p>
                  <p className="stat-pill-num mt-2 font-mono leading-none italic">{aq.params?.kh || '0'}</p>
                </div>
                <div className="stat-pill shadow-inner">
                  <p className="stat-pill-label font-black italic leading-none">Соленость</p>
                  <p className="stat-pill-num mt-2 font-mono leading-none italic">{aq.params?.salinity || '0'}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-between px-2 italic font-black opacity-30 items-center leading-none">
                 <span className="text-[8px] text-slate-700 uppercase tracking-widest italic font-black">Био-нагрузка: {bioLoad}</span>
                 <span className="text-[8px] text-slate-800 uppercase italic font-black leading-none">Подмена: {new Date(aq.lastWaterChange).toLocaleDateString()}</span>
              </div>

              <button onClick={() => setWaterChangeModal(aq.id)} className="action-btn-main mt-8 shadow-xl shadow-cyan-950/40 uppercase italic font-black leading-none italic font-black">
                Записать обслуживание
              </button>
            </div>
          ))}

          <button onClick={() => setIsCreating(true)} className="w-full py-8 border-2 border-dashed border-slate-900 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 text-slate-700 hover:text-cyan-400 hover:border-cyan-400/30 transition-all active:scale-95 group bg-slate-900/10 shadow-inner leading-none italic font-black">
            <div className="p-2 bg-slate-900 rounded-full group-hover:bg-cyan-900/20 leading-none italic font-black"><Plus size={20}/></div>
            <span className="text-[9px] font-black uppercase tracking-widest italic font-black leading-none">Инициировать систему</span>
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
        const resText = await callVision(base64, file.type, "Extract ICP: salinity, kh, ca, mg, no3, po4. Return JSON only.");
        if (resText && !resText.includes("Ошибка")) {
          setLocal({ ...local, ...JSON.parse(resText.replace(/```json|```/g, '').trim()) });
          alert("✅ Данные распознаны!");
        } else {
          alert(resText || "Ошибка распознавания данных.");
        }
      } catch (err) { alert("Ошибка сканнера."); }
      setBusy(false);
    };

    return (
      <div className="view-container animate-fadeIn font-black italic leading-none font-black italic font-black">
        <h2 className="text-xl font-black text-white uppercase mb-8 leading-none italic font-black">Лаборатория</h2>
        <input type="file" id="lab-scan" className="hidden" onChange={scan} />
        <label htmlFor="lab-scan" className={`upload-box shadow-cyan-950/20 ${busy ? 'busy' : ''} italic font-black`}>
          {busy ? <Loader2 className="animate-spin text-cyan-400 italic font-black" size={32} /> : <ScanLine size={40} className="text-cyan-400 shadow-xl italic font-black" />}
          <div className="text-center mt-2 italic font-black leading-none italic font-black">
            <p className="text-white text-[10px] font-black uppercase tracking-widest leading-none font-black italic">СКАНЕР ИЦП ТЕСТОВ</p>
            <p className="text-[8px] text-slate-700 uppercase font-black mt-1 italic font-black leading-none">Vision GPT-4o заполнит всё сам</p>
          </div>
        </label>
        <div className="mt-8 space-y-3 leading-none italic font-black">
          {Object.entries(IDEAL_PARAMS).map(([k, v]) => (
            <div key={k} className="premium-card !p-4 flex justify-between items-center shadow-lg bg-slate-900/40 border-none leading-none italic font-black">
              <div className="flex items-center gap-3 italic font-black">
                <button onClick={() => setInfoModal(k)} className="text-slate-800 hover:text-cyan-500 active:scale-110 p-1 leading-none italic font-black"><Info size={16}/></button>
                <div className="leading-tight italic font-black italic">
                    <p className="text-slate-100 text-[11px] font-black uppercase leading-none italic font-black">{v.name}</p>
                    <p className="text-[8px] text-slate-700 font-black uppercase mt-1 italic opacity-40 leading-none italic font-black">Цель: {v.min}-{v.max}</p>
                </div>
              </div>
              <input type="number" step="0.1" value={local[k]} onChange={e => setLocal({...local, [k]: e.target.value})} className="param-input italic shadow-inner italic font-black" />
            </div>
          ))}
          <button onClick={async () => {
            const list = aquariums.map(a => a.id === selectedAqId ? { ...a, params: local } : a);
            await updateDoc(doc(db, "users", user.uid), { aquariums: list }); alert("Обновлено!");
          }} className="action-btn-main !mt-8 shadow-cyan-900/50 uppercase italic font-black leading-none italic font-black italic">Применить параметры</button>
        </div>
      </div>
    );
  };

  const Tools = () => {
    const [tool, setTool] = useState(null);
    const [v, setV] = useState({ v: 300, c: 7, t: 8 });
    const [brand, setBrand] = useState('Reef Exclusive');

    const selectedReagent = useMemo(() => {
        const list = tool === 'kh' ? REAGENTS.kh : REAGENTS.ca;
        return list?.find(r => r.brand === brand) || list?.[0];
    }, [brand, tool]);

    const resCalc = useMemo(() => {
        if (!selectedReagent || !v.v) return { total: 0, daily: 0, days: 1 };
        const diff = v.t - v.c;
        if (diff <= 0) return { total: 0, daily: 0, days: 1 };
        const totalNeeded = diff * v.v * selectedReagent.potency;
        const days = Math.ceil(diff / (tool === 'kh' ? 0.5 : 20.0));
        return { total: totalNeeded.toFixed(1), daily: (totalNeeded / days).toFixed(1), days };
    }, [v, selectedReagent, tool]);

    if (!tool) return (
      <div className="view-container animate-fadeIn italic font-black leading-none italic font-black italic font-black">
        <h2 className="text-xl font-bold text-white uppercase mb-10 tracking-tighter leading-none italic font-black italic">Инструменты</h2>
        <div className="grid grid-cols-2 gap-5 leading-none font-black italic font-black">
          {[
            { id:'kh', n:'KH Буфер', i:Activity, c:'text-purple-400' },
            { id:'ca', n:'Кальций', i:Beaker, c:'text-blue-400' },
            { id:'bal', n:'Баллинг', i:Droplets, c:'text-yellow-400' },
            { id:'vol', n:'Объем', i:Box, c:'text-cyan-400' }
          ].map(i => (
            <button key={i.id} onClick={()=>setTool(i.id)} className="premium-card !p-8 flex flex-col items-center gap-4 active:scale-95 transition-all shadow-xl leading-none italic font-black italic">
              <div className="p-4 bg-slate-950 rounded-2xl shadow-inner leading-none italic font-black italic font-black"><i.i className={i.c} size={28} /></div>
              <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest leading-none italic font-black italic font-black">{i.n}</span>
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div className="view-container animate-fadeIn italic font-black leading-none font-black leading-none italic font-black italic font-black">
        <button onClick={()=>setTool(null)} className="flex items-center gap-2 text-cyan-400 text-[10px] uppercase font-bold mb-8 active:scale-90 transition-all leading-none italic font-black italic font-black"><ArrowLeft size={16}/> Назад</button>
        <div className="premium-card !p-8 space-y-10 shadow-2xl leading-none font-black italic shadow-inner font-black italic font-black">
          <div className="space-y-6 italic font-black leading-none italic font-black">
            <label className="text-[10px] text-slate-600 uppercase font-black tracking-widest px-4 leading-none italic font-black font-black">Объем системы (Л)</label>
            <input type="number" value={v.v} onChange={e => setV({...v, v: e.target.value})} className="w-full bg-[#020617] text-center text-5xl font-mono font-black text-white outline-none border-b-2 border-slate-900 focus:border-cyan-500 transition-all pb-2 shadow-inner leading-none italic font-black italic font-black" placeholder="000" />
            
            {(tool === 'kh' || tool === 'ca') && (
               <div className="space-y-6 italic leading-none font-black font-black italic leading-none italic font-black">
                 <div className="font-black italic">
                    <label className="text-[10px] text-slate-700 uppercase font-black px-4 italic mb-2 block leading-none font-black font-black">Марка средства</label>
                    <select value={brand} onChange={e => setBrand(e.target.value)} className="w-full bg-[#020617] border border-white/5 p-4 rounded-xl text-white font-black uppercase text-xs italic outline-none shadow-xl leading-none italic font-black italic font-black">
                        {(tool === 'kh' ? REAGENTS.kh : REAGENTS.ca).map(r => <option key={r.brand} value={r.brand}>{r.brand}</option>)}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-4 italic font-black leading-none italic font-black">
                   <div className="bg-[#020617] p-5 rounded-2xl border border-white/5 text-center shadow-inner leading-none italic font-black font-black italic leading-none font-black italic font-black">
                     <label className="text-[8px] text-slate-800 uppercase font-black mb-2 block leading-none font-black italic italic font-black">Было</label>
                     <input type="number" value={v.c} onChange={e => setV({...v, c: e.target.value})} className="bg-transparent text-white text-2xl font-black w-full text-center outline-none italic leading-none font-black italic font-black italic font-black" />
                   </div>
                   <div className="bg-[#020617] p-5 rounded-2xl border border-white/5 text-center shadow-inner leading-none italic font-black font-black italic leading-none font-black italic font-black">
                     <label className="text-[8px] text-slate-800 uppercase font-black mb-2 block leading-none font-black italic italic font-black">Цель</label>
                     <input type="number" value={v.t} onChange={e => setV({...v, t: e.target.value})} className="bg-transparent text-white text-2xl font-black w-full text-center outline-none italic leading-none font-black italic font-black italic font-black" />
                   </div>
                 </div>
               </div>
            )}
          </div>
          <div className="bg-cyan-900/10 p-10 rounded-3xl border border-cyan-500/20 text-center shadow-inner relative overflow-hidden leading-none italic font-black leading-none font-black italic leading-none font-black">
            <Calculator className="absolute -right-4 -bottom-4 opacity-5 rotate-12 italic font-black shadow-inner italic font-black" size={150}/>
            <p className="text-[9px] text-cyan-400 font-bold uppercase mb-4 tracking-widest italic opacity-60 leading-none font-black italic italic font-black">Схема поднятия</p>
            <div className="text-6xl font-black text-white italic tracking-tighter leading-none relative z-10 mb-4 font-black italic leading-none font-black italic font-black">
              {resCalc.total} <span className="text-2xl text-cyan-500/30 ml-1 font-normal not-italic uppercase tracking-widest leading-none italic font-black italic font-black">г</span>
            </div>
            <p className="text-[9px] text-slate-300 font-black uppercase tracking-widest opacity-60 leading-relaxed italic leading-none font-black italic font-black italic leading-none font-black italic font-black">
                Вносить по {resCalc.daily}г в день<br/>
                в течение {resCalc.days} дней
            </p>
          </div>
        </div>
      </div>
    );
  };

  const Livestock = () => {
    const list = livestock.filter(l => l.aqId === selectedAqId);
    return (
      <div className="view-container animate-fadeIn italic font-black leading-none italic font-black italic font-black leading-none italic font-black italic font-black">
        <div className="flex justify-between items-center mb-10 leading-none italic font-black italic italic font-black">
          <h2 className="text-xl font-bold text-white uppercase italic tracking-tighter leading-none italic font-black italic">Био-сфера</h2>
          <button onClick={() => setIsAddingCoral(true)} className="p-3 bg-cyan-600 rounded-2xl text-white shadow-lg active:scale-90 transition-all leading-none shadow-cyan-950/40 italic font-black italic font-black"><Plus size={24}/></button>
        </div>
        <div className="space-y-4 font-black italic leading-none italic font-black">
           {list.length === 0 ? (
               <div className="py-24 text-center opacity-10 leading-none italic font-black leading-none italic font-black italic font-black italic font-black"><Fish size={80} className="mx-auto mb-4 italic font-black font-black"/><p className="text-[10px] uppercase font-black italic leading-none font-black italic font-black italic font-black italic">Сектор пуст</p></div>
           ) : list.map(item => (
               <div key={item.id} className="premium-card !p-5 flex justify-between items-center group leading-none italic shadow-xl bg-slate-900/40 border-none italic font-black font-black font-black italic font-black italic font-black">
                  <div className="flex items-center gap-4 italic leading-none font-black font-black italic font-black font-black italic font-black italic font-black">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.type === 'sps' ? 'bg-purple-500 shadow-[0_0_15px_purple]' : item.type === 'lps' ? 'bg-emerald-500 shadow-[0_0_15px_#10b981]' : 'bg-yellow-500'} italic font-black italic font-black`}></div>
                      <div className="leading-none italic font-black font-black italic font-black italic font-black italic font-black">
                          <h3 className="text-white font-black text-sm uppercase italic leading-none italic font-black font-black italic font-black italic font-black">{item.name}</h3>
                          <p className="text-[9px] text-slate-700 uppercase mt-1.5 font-black leading-none italic opacity-40 italic font-black italic font-black italic font-black italic">{CORAL_TYPES[item.type]?.label}</p>
                      </div>
                  </div>
                  <button onClick={async () => {
                      const updated = livestock.filter(l => l.id !== item.id);
                      await updateDoc(doc(db, "users", user.uid), { livestock: updated });
                  }} className="text-slate-800 hover:text-red-500 p-2 opacity-30 group-hover:opacity-100 transition-opacity italic leading-none font-black italic font-black italic font-black leading-none font-black italic font-black"><Trash2 size={16}/></button>
               </div>
           ))}
        </div>
      </div>
    );
  };

  const Doctor = () => {
    const [img, setImg] = useState(null);
    const [res, setRes] = useState('');
    const [busy, setBusy] = useState(false);
    
    const handleDoc = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setBusy(true); setRes(''); setImg(URL.createObjectURL(f));
      try {
        const reader = new FileReader();
        const base64 = await new Promise(r => { reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(f); });
        const txt = await callVision(base64, f.type, "Identify diseases in this aquarium photo. Reply briefly in Russian.");
        setRes(txt);
      } catch (err) { alert("Ошибка связи."); }
      setBusy(false);
    };

    return (
      <div className="view-container animate-fadeIn font-black italic leading-none italic font-black leading-none italic font-black italic font-black leading-none italic font-black">
        <h2 className="text-xl font-black uppercase text-white mb-10 italic underline decoration-emerald-500 decoration-4 underline-offset-8 tracking-tighter leading-none italic font-black italic font-black italic font-black">ИИ Доктор</h2>
        <div className="bg-emerald-950/5 p-10 rounded-[2.5rem] border border-emerald-500/20 text-center relative overflow-hidden mb-10 shadow-2xl shadow-emerald-950/40 italic font-black font-black italic font-black">
          <Stethoscope className="absolute -right-8 -bottom-8 opacity-5 rotate-12 text-emerald-500 shadow-xl italic font-black font-black italic font-black" size={200}/>
          <p className="text-[9px] text-emerald-500/60 uppercase font-black tracking-widest mb-10 z-10 relative italic font-black italic font-black italic font-black italic font-black leading-relaxed italic font-black">Биометрический анализ патогенов обитателей рифа</p>
          <input type="file" id="ai-doc" className="hidden" onChange={handleDoc} />
          <label htmlFor="ai-doc" className={`w-full py-5 bg-white text-emerald-950 rounded-2xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 cursor-pointer shadow-xl active:scale-95 transition-all z-10 relative leading-none italic font-black font-black italic font-black italic font-black ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? <Loader2 className="animate-spin italic font-black font-black italic font-black" size={16}/> : <Camera size={16} className="italic font-black font-black italic font-black"/>}
            <span className="italic font-black font-black leading-none italic font-black">Анализ...</span>
          </label>
        </div>
        {img && <div className="rounded-[2.5rem] overflow-hidden border-8 border-slate-950 shadow-2xl h-80 mb-10 italic leading-none shadow-inner italic font-black leading-none shadow-inner italic font-black leading-none italic font-black shadow-inner italic font-black"><img src={img} className="w-full h-full object-cover leading-none italic font-black leading-none shadow-inner italic font-black leading-none italic font-black" /></div>}
        {res && <div className="bg-slate-900/60 p-8 rounded-3xl border border-emerald-500/20 shadow-xl animate-slideUp relative italic leading-none font-black shadow-inner font-black italic font-black italic font-black italic font-black">
            <div className="absolute top-0 left-10 -translate-y-1/2 bg-emerald-500 text-slate-950 px-8 py-2 rounded-full font-black text-[9px] uppercase italic shadow-lg italic font-black italic font-black italic font-black">Вердикт ИИ</div>
          <p className="text-slate-200 text-xs font-medium leading-relaxed italic opacity-90 leading-loose italic font-black leading-none italic font-black italic font-black leading-loose italic font-black">{res}</p>
        </div>}
      </div>
    );
  };

  const Profile = () => {
    const leftDays = useMemo(() => userData?.subscription?.expiresAt ? Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / 86400000)) : 0, [userData]);
    const [editData, setEditData] = useState({ fullName: '', city: '', country: '', dob: '' });
    useEffect(() => { if (userData?.personalInfo) setEditData(userData.personalInfo); }, [userData]);

    return (
      <div className="view-container animate-fadeIn italic font-black leading-none font-black italic font-black italic font-black leading-none italic font-black italic font-black leading-none italic font-black italic font-black leading-none">
        <div className="premium-card !p-12 flex flex-col items-center text-center relative shadow-cyan-950/30 italic font-black font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600 to-blue-800 shadow-xl leading-none italic font-black font-black italic font-black italic font-black italic font-black"></div>
          <div className="avatar-circle italic shadow-cyan-900/50 flex items-center justify-center italic font-black font-black italic font-black leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">
              {userData?.personalInfo?.fullName?.[0]?.toUpperCase() || 'H'}
          </div>
          {!isEditingProfile ? (
            <div className="mt-12 space-y-4 w-full italic font-black leading-none italic font-black font-black italic font-black italic font-black">
                <h2 className="text-xl font-bold text-white uppercase italic tracking-tight leading-none italic font-black italic font-black italic font-black italic font-black italic font-black italic font-black">{userData?.personalInfo?.fullName || 'ХРАНИТЕЛЬ'}</h2>
                <p className="text-[10px] text-slate-700 uppercase tracking-[0.4em] mb-10 font-black leading-none italic opacity-50 font-black italic font-black italic font-black italic font-black italic font-black">{user?.email}</p>
                <div className="grid grid-cols-2 gap-3 pt-6 leading-none font-black italic font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black italic font-black">
                    <div className="bg-slate-950/50 p-5 rounded-3xl border border-white/5 text-left italic leading-none shadow-inner font-black italic font-black leading-none italic font-black font-black leading-none italic font-black italic font-black">
                        <p className="text-[7px] text-slate-800 uppercase font-black mb-2 opacity-30 leading-none italic font-black font-black leading-none italic font-black italic font-black italic font-black leading-none italic font-black italic font-black">Локация</p>
                        <p className="text-xs text-slate-300 truncate font-black leading-none italic font-black font-black leading-none italic font-black italic font-black italic font-black leading-none italic font-black italic font-black font-black">{userData?.personalInfo?.city || '-'}, {userData?.personalInfo?.country || '-'}</p>
                    </div>
                    <div className="bg-slate-950/50 p-5 rounded-3xl border border-white/5 text-left italic leading-none shadow-inner font-black italic font-black leading-none italic font-black font-black leading-none italic font-black italic font-black">
                        <p className="text-[7px] text-slate-800 uppercase font-black mb-2 opacity-30 leading-none italic font-black font-black leading-none italic font-black italic font-black italic font-black leading-none italic font-black italic font-black">Рождение</p>
                        <p className="text-xs text-slate-300 font-bold font-black leading-none italic font-black font-black leading-none italic font-black italic font-black italic font-black leading-none italic font-black italic font-black font-black">{userData?.personalInfo?.dob || '-'}</p>
                    </div>
                </div>
                <button onClick={() => setIsEditingProfile(true)} className="flex items-center gap-2 text-cyan-400 text-[9px] font-black uppercase tracking-widest pt-12 mx-auto hover:text-cyan-300 transition-colors leading-none italic shadow-inner font-black font-black italic font-black leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black font-black italic font-black italic font-black"><Edit2 size={12} className="italic font-black leading-none italic font-black font-black italic font-black italic font-black"/> Редактировать профиль</button>
            </div>
          ) : (
            <div className="mt-12 space-y-6 w-full text-left font-black leading-none italic font-black font-black leading-none italic font-black italic font-black italic font-black leading-none italic font-black italic font-black">
                <div className="space-y-2 leading-none italic font-black italic leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black"><label className="text-[7px] text-slate-800 uppercase px-4 leading-none italic font-black font-black font-black italic font-black leading-none font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">Позывной</label><input value={editData.fullName} onChange={e=>setEditData({...editData, fullName: e.target.value})} className="profile-input italic shadow-inner border-cyan-500/10 font-black italic font-black font-black italic font-black leading-none shadow-inner italic font-black font-black italic font-black leading-none italic font-black italic font-black italic font-black" /></div>
                <div className="grid grid-cols-2 gap-4 italic leading-none font-black italic font-black italic leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">
                    <div className="space-y-2 leading-none italic font-black italic font-black italic leading-none font-black italic font-black font-black italic font-black leading-none font-black italic font-black italic font-black"><label className="text-[7px] text-slate-800 uppercase px-4 leading-none italic font-black font-black italic font-black leading-none font-black font-black italic font-black italic font-black leading-none italic font-black italic font-black">Страна</label><input value={editData.country} onChange={e=>setEditData({...editData, country: e.target.value})} className="profile-input italic shadow-inner border-cyan-500/10 font-black italic font-black font-black font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black" /></div>
                    <div className="space-y-2 leading-none italic font-black italic font-black italic leading-none font-black italic font-black font-black italic font-black leading-none font-black italic font-black italic font-black"><label className="text-[7px] text-slate-800 uppercase px-4 leading-none italic font-black font-black italic font-black leading-none font-black font-black italic font-black italic font-black leading-none italic font-black italic font-black">Город</label><input value={editData.city} onChange={e=>setEditData({...editData, city: e.target.value})} className="profile-input italic shadow-inner border-cyan-500/10 font-black italic font-black font-black font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black" /></div>
                </div>
                <div className="space-y-2 leading-none italic font-black italic font-black italic leading-none font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black font-black leading-none font-black italic font-black"><label className="text-[7px] text-slate-800 uppercase px-4 leading-none italic font-black font-black italic font-black leading-none font-black font-black italic font-black italic font-black leading-none italic font-black italic font-black leading-none font-black italic font-black">Дата рождения</label><input type="date" value={editData.dob} onChange={e=>setEditData({...editData, dob: e.target.value})} className="profile-input italic shadow-inner border-cyan-500/10 font-black italic font-black italic font-black font-black leading-none italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black" /></div>
                <div className="flex gap-3 pt-8 leading-none italic font-black font-black italic font-black leading-none italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black">
                    <button onClick={() => setIsEditingProfile(false)} className="flex-1 py-5 bg-slate-900 border border-white/5 rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-all italic leading-none opacity-40 italic font-black font-black leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">Отмена</button>
                    <button onClick={() => updateProfileData(editData)} className="flex-1 py-5 bg-cyan-600 rounded-2xl text-[10px] font-black uppercase italic text-white shadow-lg shadow-cyan-900/30 active:scale-95 transition-all leading-none italic font-black italic font-black font-black leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">Сохранить</button>
                </div>
            </div>
          )}
        </div>
        <div className="bg-amber-950/10 p-10 rounded-3xl mt-10 border border-amber-500/20 shadow-2xl relative overflow-hidden group italic leading-none font-black shadow-inner leading-none font-black italic font-black italic leading-none font-black font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black">
           <Crown className="absolute -right-4 -bottom-4 opacity-[0.03] text-amber-500 group-hover:scale-110 transition-transform duration-700 italic font-black font-black italic font-black leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black" size={120}/>
           <div className="flex justify-between items-center mb-6 leading-none italic font-black font-black font-black italic leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">
              <div className="flex items-center gap-4 leading-none font-bold italic font-black font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black shadow-inner italic font-black"><Crown className="text-amber-500 shadow-xl shadow-amber-900/30 italic font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black shadow-inner italic font-black" size={32}/><div><p className="text-amber-200 uppercase text-[9px] font-bold italic leading-none italic font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black">ТЕРМИНАЛ ПРО</p></div></div>
              <div className="text-6xl font-black text-amber-500 tracking-tighter leading-none italic drop-shadow-2xl italic font-black font-black italic leading-none italic font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">{leftDays}</div>
           </div>
           <div className="progress-track leading-none italic shadow-inner leading-none font-black font-black italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black shadow-inner italic font-black"><div className="progress-fill shadow-amber-500/50 leading-none font-black italic font-black font-black leading-none font-black italic font-black font-black italic font-black leading-none font-black italic font-black shadow-inner italic font-black" style={{width:`${(leftDays/30)*100}%`}}></div></div>
        </div>
        <button onClick={() => signOut(auth)} className="shutdown-btn mt-12 active:scale-95 transition-all shadow-xl leading-none italic font-bold uppercase shadow-red-900/20 italic font-black border-none cursor-pointer leading-none font-black italic font-black italic font-black leading-none font-black italic font-black font-black italic font-black leading-none italic font-black italic font-black">
          <LogOut size={16} className="italic font-black leading-none italic font-black font-black italic font-black leading-none italic font-black italic font-black"/> Завершить сессию
        </button>
      </div>
    );
  };

  return (
    <div className="app-shell italic font-black leading-none font-black italic font-black italic font-black leading-none italic font-black italic font-black leading-none italic font-black italic font-black">
      <style>{`
        .app-shell { min-height: 100vh; background: #020617; color: #f8fafc; font-family: sans-serif; overflow-x: hidden; }
        .view-container { max-width: 480px; margin: 0 auto; padding: 2rem 1.5rem 15rem 1.5rem; }
        .header-title { font-size: 1.75rem; font-weight: 800; text-transform: uppercase; font-style: italic; color: white; letter-spacing: -0.02em; }
        .header-subtitle { color: #06b6d4; font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.1em; opacity: 0.8; margin-top: 4px; }
        .premium-card { background: rgba(15, 23, 42, 0.6); border-radius: 2.5rem; border: 1px solid rgba(255,255,255,0.05); padding: 2rem; position: relative; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
        .card-bg-icon { position: absolute; bottom: -2rem; right: -2rem; opacity: 0.03; pointer-events: none; }
        .accent-bar { width: 4px; height: 1.5rem; background: #06b6d4; border-radius: 99px; box-shadow: 0 0 10px #06b6d4; }
        .stat-box { background: #020617; padding: 1.5rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.03); text-align: center; }
        .stat-label { font-size: 8px; font-weight: 800; color: #475569; text-transform: uppercase; display: block; margin-bottom: 4px; }
        .stat-value { font-size: 2rem; font-weight: 900; color: white; font-family: monospace; }
        .action-btn-main { width: 100%; padding: 1.5rem; background: #0891b2; color: white; border: none; border-radius: 2rem; font-weight: 900; text-transform: uppercase; font-size: 0.75rem; cursor: pointer; shadow-2xl; letter-spacing: 0.2em; font-style: italic; }
        .nav-bar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 94%; max-width: 480px; background: rgba(15, 23, 42, 0.98); backdrop-filter: blur(80px); border: 1px solid rgba(255,255,255,0.05); padding: 0.6rem 1rem; z-index: 2000; margin-bottom: 1.5rem; border-radius: 3.5rem; box-shadow: 0 -20px 40px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: space-around; flex-direction: row; }
        .nav-btn { display: flex; flex-direction: column; align-items: center; background: none; border: none; color: #334155; cursor: pointer; transition: 0.3s; flex: 1; }
        .nav-btn.active { color: #06b6d4; transform: translateY(-3px); filter: drop-shadow(0 0 10px rgba(6,182,212,0.6)); }
        .nav-label { font-size: 7px; font-weight: 800; text-transform: uppercase; margin-top: 4px; font-style: italic; opacity: 0.5; }
        .status-badge { font-size: 8px; font-weight: 800; padding: 4px 10px; border-radius: 99px; border: 1px solid rgba(16,185,129,0.3); color: #10b981; background: rgba(16,185,129,0.05); text-transform: uppercase; font-style: italic; }
        .param-input { width: 6rem; background: #020617 !important; border: 1px solid #1e293b; border-radius: 1rem; color: white !important; text-align: center; font-family: monospace; font-size: 1.1rem; padding: 0.6rem; outline: none; }
        .upload-box { width: 100%; padding: 4rem 1rem; border: 4px dashed #164e63; background: rgba(15, 23, 42, 0.4); border-radius: 3rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; cursor: pointer; }
        .avatar-circle { width: 8rem; height: 8rem; background: linear-gradient(135deg, #06b6d4, #1e40af); border-radius: 3rem; display: flex; align-items: center; justify-content: center; color: white; font-size: 5rem; font-weight: 900; margin: 0 auto; border: 10px solid #020617; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .profile-input { width: 100%; background: #020617 !important; border: 1px solid #1e293b; border-radius: 1.5rem; padding: 1.5rem; color: white !important; outline: none; font-size: 1rem; font-style: italic; shadow-inner; font-weight: 700; transition: 0.3s; text-align: center; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(25px); display: flex; align-items: center; justify-content: center; p: 2rem; z-index: 5000; }
        .modal-card { background: #0f172a; border-radius: 3.5rem; p: 5rem 3rem 3rem 3rem; width: 100%; max-width: 420px; border: 1px solid rgba(255,255,255,0.05); shadow-[0_50px_100px_rgba(0,0,0,1)]; text-align: center; }
        .auth-input { width: 100%; background: #020617 !important; border: 1px solid #1e293b; border-radius: 1.5rem; padding: 1.5rem; color: white !important; text-align: center; font-weight: 900; font-size: 1.1rem; outline: none; transition: 0.3s; }
        .stat-pill { background: #020617; padding: 1.5rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.03); text-align: center; }
        .stat-pill-label { font-size: 8px; font-weight: 800; color: #475569; text-transform: uppercase; display: block; margin-bottom: 4px; }
        .stat-pill-num { font-size: 1.75rem; font-weight: 900; color: white; font-family: monospace; }
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
      
      <nav className="nav-bar shadow-2xl italic font-black">
        <NavItem icon={Activity} id="dashboard" label="ХАБ"/>
        <NavItem icon={Droplets} id="parameters" label="ЛАБ"/>
        <NavItem icon={Calculator} id="tools" label="ДОЗ"/>
        <NavItem icon={Fish} id="livestock" label="БИО"/>
        <NavItem icon={Stethoscope} id="doctor" label="ДОК"/>
        <NavItem icon={User} id="profile" label="Я"/>
      </nav>

      {/* МОДАЛКИ */}
      {isCreating && (
        <div className="modal-overlay animate-fadeIn italic font-black leading-none shadow-inner italic font-black">
          <div className="modal-card italic shadow-cyan-950/20 shadow-inner italic font-black">
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-12 underline decoration-cyan-500 decoration-4 underline-offset-8 leading-none font-black italic">Новая система</h2>
            <div className="space-y-8 leading-none italic font-black shadow-inner italic font-black shadow-inner font-black">
              <div className="space-y-4 leading-none italic shadow-inner italic font-black shadow-inner italic font-black"><label className="text-[10px] text-slate-700 uppercase font-black px-2 italic shadow-inner leading-none italic font-black font-black shadow-inner font-black">Идентификатор</label><input autoFocus placeholder="Проект Зеро" className="auth-input italic shadow-inner !p-5 !text-lg font-black leading-none border-cyan-500/10 shadow-inner font-black italic font-black shadow-inner font-black" value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} /></div>
              <div className="space-y-4 leading-none italic shadow-inner italic font-black shadow-inner italic font-black"><label className="text-[10px] text-slate-700 uppercase font-black px-2 italic shadow-inner leading-none italic font-black font-black shadow-inner font-black">Объем воды (Л)</label><input type="number" placeholder="100" className="auth-input italic shadow-inner !p-5 !text-4xl font-black leading-none border-cyan-500/10 shadow-inner font-black italic font-black shadow-inner font-black" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} /></div>
              <div className="flex flex-col gap-3 pt-6 leading-none italic font-black shadow-inner font-black italic leading-none shadow-inner font-black">
                  <button onClick={()=>handleAqAction('add', newAqData)} className="w-full py-5 bg-cyan-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all shadow-inner border-none cursor-pointer leading-none font-black italic font-black">Активировать</button>
                  <button onClick={()=>setIsCreating(false)} className="w-full py-4 text-slate-700 font-black uppercase text-[9px] tracking-widest italic opacity-40 leading-none shadow-inner border-none cursor-pointer leading-none font-black italic font-black">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {waterChangeModal && (
        <div className="modal-overlay animate-fadeIn italic font-black leading-none shadow-inner italic font-black italic font-black shadow-inner font-black">
          <div className="modal-card text-center italic font-black leading-none shadow-cyan-950/20 shadow-inner italic font-black shadow-inner italic font-black italic font-black">
            <h2 className="text-4xl text-white uppercase italic mb-12 font-black underline decoration-cyan-500 decoration-4 underline-offset-8 italic leading-none italic font-black shadow-inner italic font-black leading-none italic font-black italic font-black">Refresh</h2>
            <div className="my-12 flex items-center justify-center gap-4 leading-none shadow-inner italic font-black italic font-black italic font-black leading-none shadow-inner font-black">
              <input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-[#020617] text-white text-7xl font-mono font-black text-center outline-none border-b border-slate-900 focus:border-cyan-500 transition-all pb-2 shadow-inner leading-none italic font-black shadow-inner italic font-black italic font-black leading-none shadow-inner font-black" />
              <span className="text-4xl text-slate-800 italic leading-none uppercase italic italic font-black shadow-inner font-black italic font-black italic font-black leading-none shadow-inner font-black">Л</span>
            </div>
            <div className="flex flex-col gap-4 pt-6 italic font-black leading-none italic shadow-inner font-black italic shadow-inner font-black italic shadow-inner leading-none italic font-black italic font-black leading-none shadow-inner font-black">
                <button onClick={()=>handleAqAction('wc', {id: waterChangeModal})} className="w-full py-6 bg-cyan-600 text-white rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] shadow-2xl active:scale-95 leading-none shadow-inner border-none cursor-pointer italic font-black shadow-inner font-black italic font-black italic font-black">Логировать</button>
                <button onClick={()=>setWaterChangeModal(null)} className="w-full py-4 text-slate-700 font-black uppercase text-[9px] tracking-widest italic opacity-30 leading-none italic leading-none shadow-inner border-none cursor-pointer italic font-black shadow-inner font-black italic font-black italic font-black">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {infoModal && (
          <div className="modal-overlay animate-fadeIn italic font-black leading-none shadow-inner italic font-black shadow-inner font-black">
              <div className="modal-card relative italic font-black leading-none shadow-cyan-950/30 shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black shadow-inner">
                  <div className="flex items-center gap-4 mb-10 leading-none italic font-black leading-none shadow-inner italic font-black shadow-inner italic font-black leading-none italic font-black italic font-black leading-none font-black shadow-inner">
                      <div className="w-1 h-12 bg-cyan-500 rounded-full shadow-[0_0_20px_#06b6d4] italic font-black shadow-inner font-black italic font-black italic leading-none font-black shadow-inner"></div>
                      <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black shadow-inner">{IDEAL_PARAMS[infoModal].name}</h3>
                  </div>
                  <div className="bg-[#020617] p-10 rounded-[3rem] border border-white/5 mb-10 shadow-inner leading-none italic font-black leading-none italic font-black font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic shadow-inner font-black italic leading-none font-black shadow-inner">
                      <p className="text-sm text-slate-300 leading-relaxed italic font-bold opacity-90 leading-relaxed italic font-black shadow-inner font-black italic font-black italic font-black leading-relaxed italic font-black shadow-inner">{IDEAL_PARAMS[infoModal].desc}</p>
                  </div>
                  <div className="flex justify-between items-center px-4 leading-none italic font-black leading-none italic font-black italic leading-none font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic shadow-inner font-black italic font-black leading-none font-black shadow-inner">
                      <span className="text-[10px] text-cyan-400/50 uppercase font-black tracking-[0.1em] italic leading-none uppercase italic font-black font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic shadow-inner font-black italic font-black leading-none font-black shadow-inner">Идеал: {IDEAL_PARAMS[infoModal].min}-{IDEAL_PARAMS[infoModal].max} {IDEAL_PARAMS[infoModal].unit}</span>
                      <button onClick={() => setInfoModal(null)} className="py-5 px-12 bg-cyan-600 rounded-2xl font-black uppercase active:scale-90 transition-all leading-none shadow-xl shadow-cyan-900/40 text-white text-[9px] italic leading-none uppercase italic font-black italic border-none cursor-pointer shadow-inner font-black italic font-black font-black italic leading-none font-black shadow-inner">Понял</button>
                  </div>
              </div>
          </div>
      )}

      {isAddingCoral && (
          <div className="modal-overlay animate-fadeIn italic font-black leading-none shadow-inner italic font-black font-black italic leading-none shadow-inner font-black">
              <div className="modal-card italic font-black shadow-cyan-950/20 leading-none shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic font-black italic font-black leading-none font-black shadow-inner">
                  <h2 className="text-2xl font-black text-white uppercase italic mb-10 underline decoration-cyan-500 decoration-4 underline-offset-8 tracking-tighter leading-none italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic font-black italic font-black leading-none font-black shadow-inner">Новый житель</h2>
                  <div className="space-y-8 leading-none italic font-black leading-none shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic shadow-inner leading-none font-black italic leading-none italic font-black shadow-inner font-black italic leading-none font-black shadow-inner">
                      <div className="space-y-3 leading-none italic font-black leading-none shadow-inner font-black italic font-black italic font-black italic leading-none font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic shadow-inner leading-none font-black italic leading-none italic font-black shadow-inner font-black italic leading-none italic font-black font-black shadow-inner"><label className="text-[9px] text-slate-700 uppercase px-4 italic opacity-40 leading-none font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic font-black italic font-black italic leading-none italic font-black font-black italic leading-none font-black shadow-inner">Вид (напр. Acropora)</label><input placeholder="Scientific name" className="auth-input italic shadow-inner !p-5 !text-lg font-black leading-none italic font-black shadow-inner border-cyan-500/10 font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black italic font-black font-black italic leading-none font-black shadow-inner" value={newCoral.name} onChange={e=>setNewCoral({...newCoral, name: e.target.value})} /></div>
                      <div className="space-y-4 leading-none italic font-black leading-none shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic leading-none font-black italic shadow-inner font-black italic leading-none font-black shadow-inner">
                          <label className="text-[9px] text-slate-700 uppercase px-4 italic opacity-40 leading-none shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black shadow-inner">Классификация</label>
                          <div className="grid grid-cols-3 gap-3 leading-none font-black italic shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black shadow-inner">
                              {['sps', 'lps', 'soft'].map(t => (<button key={t} onClick={()=>setNewCoral({...newCoral, type: t})} className={`p-4 rounded-3xl border-2 text-[9px] font-black uppercase transition-all duration-300 leading-none italic ${newCoral.type === t ? 'bg-cyan-600 border-cyan-400 text-white shadow-xl scale-110 shadow-cyan-900/40 shadow-inner font-black italic font-black font-black shadow-inner' : 'bg-slate-950 border-white/5 text-slate-800 opacity-40 shadow-inner font-black italic font-black font-black shadow-inner'}`}>{t}</button>))}
                          </div>
                      </div>
                      <div className="flex flex-col gap-4 pt-10 leading-none italic font-black leading-none shadow-inner font-black italic font-black italic font-black italic leading-none italic font-black shadow-inner font-black italic font-black italic font-black italic font-black italic font-black italic shadow-inner leading-none font-black italic font-black italic leading-none font-black italic font-black italic leading-none font-black shadow-inner">
                          <button onClick={handleAddCoral} className="w-full py-5 bg-cyan-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-cyan-900/40 active:scale-95 transition-all leading-none italic font-black font-black italic leading-none border-none cursor-pointer shadow-inner font-black italic font-black font-black italic leading-none font-black shadow-inner">Регистрация</button>
                          <button onClick={()=>setIsAddingCoral(false)} className="w-full py-3 text-slate-700 font-black uppercase text-[9px] italic opacity-30 leading-none italic font-black shadow-inner font-black italic leading-none border-none cursor-pointer shadow-inner font-black italic font-black font-black italic leading-none font-black shadow-inner">Отмена</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}