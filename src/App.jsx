import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, Activity, Fish, Plus, Save, AlertTriangle, 
  CheckCircle, Trash2, User, LogOut, Crown, Mail, MapPin, Lock,
  Edit2, X, ChevronDown, Calendar, RefreshCw, Settings, Info
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

// Инициализация
let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Error:", e);
}

// --- Константы ---
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
  sps: { label: 'SPS', care: 'Свет++, Течение++' },
  lps: { label: 'LPS', care: 'Свет+, Корм+' },
  soft: { label: 'Мягкие', care: 'Неприхотливые' },
};

// Значения по умолчанию для нового аквариума
const DEFAULT_PARAMS = {
  salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Состояния для Auth
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [missingCityModal, setMissingCityModal] = useState(false);

  // Состояния для управления аквариумами
  const [aquariums, setAquariums] = useState([]); 
  const [selectedAqId, setSelectedAqId] = useState(null); 
  
  // Редактирование настроек (Имя, Объем)
  const [editingSettingsId, setEditingSettingsId] = useState(null);
  const [tempName, setTempName] = useState('');
  const [tempVolume, setTempVolume] = useState('');
  const [tempUnit, setTempUnit] = useState('L');

  // Модалка создания аквариума
  const [isCreating, setIsCreating] = useState(false);
  const [newAqData, setNewAqData] = useState({ name: '', volume: '100', unit: 'L' });

  // Модалка подтверждения удаления
  const [deleteConfirmationId, setDeleteConfirmationId] = useState(null);

  // Модалка подмены воды
  const [waterChangeModal, setWaterChangeModal] = useState(null); // ID аквариума
  const [wcAmount, setWcAmount] = useState('');
  const [wcUnit, setWcUnit] = useState('L');

  // Состояния для кораллов
  const [livestock, setLivestock] = useState([]);

  // --- 1. Логика Авторизации и Загрузки ---
  useEffect(() => {
    if (!auth) { setLoading(false); return; }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // МИГРАЦИЯ ДАННЫХ
            if (data.aquariums) {
               const fixedAquariums = data.aquariums.map(aq => ({
                   ...aq,
                   volume: aq.volume || 100,
                   volumeUnit: aq.volumeUnit || 'L',
                   lastWaterChange: aq.lastWaterChange || null,
                   stabilityStatus: aq.stabilityStatus || 'unknown'
               }));
               setAquariums(fixedAquariums);
               if (!selectedAqId && fixedAquariums.length > 0) setSelectedAqId(fixedAquariums[0].id);
            } else if (data.currentParams) {
               const defaultAq = {
                 id: 'default_1',
                 name: 'Мой Риф',
                 params: data.currentParams,
                 volume: 100,
                 volumeUnit: 'L'
               };
               updateDoc(userRef, { aquariums: [defaultAq] });
               setAquariums([defaultAq]);
               setSelectedAqId('default_1');
            }

            setUserData(data);
            if (data.livestock) setLivestock(data.livestock);
            if (!data.personalInfo?.city) setMissingCityModal(true);
            else setMissingCityModal(false);

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
    const trialDate = new Date(); 
    trialDate.setDate(trialDate.getDate() + 30);
    const newUser = {
      email: userAuth.email,
      uid: userAuth.uid,
      registeredAt: new Date().toISOString(),
      subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
      personalInfo: { fullName: userAuth.displayName || 'Aquarist', city: '' },
      aquariums: [{
        id: Date.now().toString(),
        name: 'Основной Риф',
        params: DEFAULT_PARAMS,
        volume: 100,
        volumeUnit: 'L',
        lastWaterChange: new Date().toISOString()
      }],
      livestock: []
    };
    await setDoc(doc(db, "users", userAuth.uid), newUser);
  };

  // --- Auth Handlers ---
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!city) { alert("Укажите город!"); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      await sendEmailVerification(cred.user);
      const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
      await setDoc(doc(db, "users", cred.user.uid), {
        email, uid: cred.user.uid, registeredAt: new Date().toISOString(),
        subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
        personalInfo: { fullName, city, dob: '' },
        aquariums: [{ id: Date.now().toString(), name: 'Мой Аквариум', params: DEFAULT_PARAMS, volume: 100, volumeUnit: 'L' }],
        livestock: []
      });
    } catch (error) { alert("Ошибка: " + error.message); }
  };
  const handleEmailLogin = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { alert(e.message); } };
  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert(e.message); } };
  const saveMissingCity = async () => { if(!city) return; await updateDoc(doc(db, "users", user.uid), { "personalInfo.city": city }); setMissingCityModal(false); };

  // --- Управление Аквариумами ---
  
  // 1. Открыть модалку создания
  const startCreatingAquarium = () => {
    if (aquariums.length >= 3) { alert("Максимум 3 аквариума."); return; }
    setNewAqData({ name: `Аквариум #${aquariums.length + 1}`, volume: '100', unit: 'L' });
    setIsCreating(true);
  };

  // 2. Сохранить новый аквариум
  const confirmCreateAquarium = async () => {
    if (!newAqData.name) { alert("Введите название"); return; }
    if (!newAqData.volume || parseFloat(newAqData.volume) <= 0) { alert("Введите корректный объем"); return; }

    const newAq = {
      id: Date.now().toString(),
      name: newAqData.name,
      params: DEFAULT_PARAMS,
      volume: parseFloat(newAqData.volume),
      volumeUnit: newAqData.unit,
      lastWaterChange: new Date().toISOString(),
      stabilityStatus: 'stable'
    };
    await updateDoc(doc(db, "users", user.uid), { aquariums: [...aquariums, newAq] });
    setIsCreating(false);
  };

  // 3. Запрос на удаление
  const requestDeleteAquarium = (id) => {
    if (aquariums.length <= 1) { alert("Нельзя удалить единственный аквариум."); return; }
    setDeleteConfirmationId(id);
  };

  // 4. Подтверждение удаления
  const confirmDeleteAquarium = async () => {
    if (!deleteConfirmationId) return;
    const list = aquariums.filter(aq => aq.id !== deleteConfirmationId);
    await updateDoc(doc(db, "users", user.uid), { aquariums: list });
    
    // Если удалили выбранный, переключаемся на первый доступный
    if (selectedAqId === deleteConfirmationId) {
        setSelectedAqId(list.length > 0 ? list[0].id : null);
    }
    
    setDeleteConfirmationId(null);
    setEditingSettingsId(null); // Закрыть настройки, если были открыты
  };

  // Редактирование имени и объема существующего
  const openSettings = (aq) => {
      setEditingSettingsId(aq.id);
      setTempName(aq.name);
      setTempVolume(aq.volume);
      setTempUnit(aq.volumeUnit);
  };

  const saveSettings = async () => {
    const updatedList = aquariums.map(aq => 
      aq.id === editingSettingsId ? { ...aq, name: tempName, volume: tempVolume, volumeUnit: tempUnit } : aq
    );
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
    setEditingSettingsId(null);
  };

  const saveParamsForAquarium = async (aqId, newParams) => {
    const updatedList = aquariums.map(aq => aq.id === aqId ? { ...aq, params: newParams } : aq);
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
    alert("Данные сохранены!");
  };

  // --- ПОДМЕНА ВОДЫ ---
  const performWaterChange = async () => {
      if (!wcAmount || wcAmount <= 0) return;
      const aq = aquariums.find(a => a.id === waterChangeModal);
      if (!aq) return;

      let amountInAqUnits = parseFloat(wcAmount);
      if (wcUnit !== aq.volumeUnit) {
          if (wcUnit === 'Gal' && aq.volumeUnit === 'L') amountInAqUnits = amountInAqUnits * 3.785;
          if (wcUnit === 'L' && aq.volumeUnit === 'Gal') amountInAqUnits = amountInAqUnits / 3.785;
      }

      const percent = (amountInAqUnits / aq.volume) * 100;
      let status = 'stable';
      if (percent > 10) status = 'destabilized';

      const updatedList = aquariums.map(a => 
          a.id === waterChangeModal ? { ...a, lastWaterChange: new Date().toISOString(), stabilityStatus: status } : a
      );

      await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
      setWaterChangeModal(null);
      setWcAmount('');
      
      if (percent > 10) alert(`Внимание! Вы подменили ${percent.toFixed(1)}%. Это риск для стабильности.`);
      else alert(`Подмена ${percent.toFixed(1)}% записана.`);
  };

  // --- Кораллы ---
  const addCoral = async (name, type) => {
     if (!user || !name) return;
     const targetAqId = selectedAqId || (aquariums.length > 0 ? aquariums[0].id : null);
     if (!targetAqId) { alert("Создайте аквариум!"); return; }
     await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion({ id: Date.now(), name, type, date: new Date().toISOString(), aqId: targetAqId }) });
  };
  const removeCoral = async (id) => {
     await updateDoc(doc(db, "users", user.uid), { livestock: livestock.filter(l => l.id !== id) });
  };

  // --- Helpers ---
  const getRecommendations = (params) => {
    const recs = [];
    Object.keys(params).forEach(key => {
      if (!IDEAL_PARAMS[key]) return;
      const val = parseFloat(params[key]);
      const { min, max, name, unit } = IDEAL_PARAMS[key];
      if (val < min) recs.push({ type: 'warning', msg: `${name} низко: ${val}. Норма: ${min}-${max} ${unit}` });
      else if (val > max) recs.push({ type: 'alert', msg: `${name} высоко: ${val}. Норма: ${min}-${max} ${unit}` });
    });
    return recs;
  };

  const getStabilityInfo = (aq) => {
      if (!aq.lastWaterChange) return { status: 'bad', text: 'Нет данных', color: 'text-red-400' };
      const lastDate = new Date(aq.lastWaterChange);
      const diffDays = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
      
      if (aq.stabilityStatus === 'destabilized' && diffDays < 2) return { status: 'warning', text: 'Риск дестабилизации', color: 'text-yellow-400' };
      if (diffDays > 7) return { status: 'bad', text: `Просрочено (${diffDays} дн.)`, color: 'text-red-400' };
      return { status: 'good', text: 'Стабильно', color: 'text-green-400' };
  };

  // --- ЭКРАНЫ ---

  // 1. DASHBOARD
  const DashboardView = () => (
    <div className="space-y-8 animate-fadeIn pb-24">
      <div className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Мои системы</h1>
          <div className="flex gap-2 text-cyan-200/70 text-sm">
             <MapPin size={14} className="mt-0.5" /> {userData?.personalInfo?.city || 'Город'}
          </div>
        </div>
        <button onClick={startCreatingAquarium} className="bg-cyan-600/20 text-cyan-400 p-2 rounded-xl border border-cyan-600/50 hover:bg-cyan-600 hover:text-white transition-colors">
          <Plus size={24} />
        </button>
      </div>

      {aquariums.map((aq) => {
        const recs = getRecommendations(aq.params);
        const stability = getStabilityInfo(aq);

        return (
          <div key={aq.id} className="space-y-3">
            <div className="bg-gradient-to-br from-cyan-900 to-blue-950 p-6 rounded-2xl shadow-lg border border-cyan-800/50 relative group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white">{aq.name}</h2>
                    <button onClick={() => openSettings(aq)} className="text-cyan-400 opacity-80 hover:opacity-100"><Settings size={18} /></button>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded border ${stability.status === 'good' ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-red-900/30 border-red-500 text-red-400'}`}>
                    {stability.text}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center">
                  <div className="text-cyan-200 text-[10px] font-bold uppercase">Соленость</div>
                  <div className="text-xl font-mono font-bold text-white">{aq.params.salinity}</div>
                </div>
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center">
                  <div className="text-cyan-200 text-[10px] font-bold uppercase">KH</div>
                  <div className="text-xl font-mono font-bold text-white">{aq.params.kh}</div>
                </div>
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center flex items-center justify-center">
                   {recs.length === 0 ? <CheckCircle size={24} className="text-green-400"/> : <span className="text-yellow-400 font-bold text-xl">! {recs.length}</span>}
                </div>
              </div>

              <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-slate-400">
                      Объем: {aq.volume} {aq.volumeUnit}<br/>
                      Подмена: {aq.lastWaterChange ? new Date(aq.lastWaterChange).toLocaleDateString() : 'Нет'}
                  </div>
                  <button onClick={() => setWaterChangeModal(aq.id)} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                      <RefreshCw size={14}/> Подмена
                  </button>
              </div>
            </div>

            <div className="px-2 space-y-2">
              {recs.map((rec, i) => (
                <div key={i} className={`p-3 rounded-xl text-sm flex gap-2 items-start ${rec.type === 'alert' ? 'bg-red-900/20 border border-red-900/50 text-red-200' : 'bg-yellow-900/20 border border-yellow-900/50 text-yellow-200'}`}>
                  <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                  <span>{rec.msg}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // 2. PARAMETERS VIEW (Без изменений)
  const ParametersView = () => {
    const activeAq = aquariums.find(a => a.id === selectedAqId) || aquariums[0];
    const [localParams, setLocalParams] = useState(activeAq ? activeAq.params : DEFAULT_PARAMS);
    useEffect(() => { if(activeAq) setLocalParams(activeAq.params); }, [activeAq]);
    const handleSave = () => { if(activeAq) saveParamsForAquarium(activeAq.id, localParams); };
    if (!activeAq) return <div className="text-center mt-10">Создайте аквариум</div>;
    return (
      <div className="pb-24 animate-fadeIn">
        <h2 className="text-2xl font-bold text-white mb-4">Ввод данных</h2>
        <div className="mb-6 bg-slate-800 p-2 rounded-xl flex items-center relative">
          <div className="absolute left-4 text-slate-400 pointer-events-none"><Fish size={20}/></div>
          <select className="w-full bg-transparent text-white font-bold p-3 pl-10 outline-none appearance-none" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <div className="absolute right-4 text-slate-400 pointer-events-none"><ChevronDown size={20}/></div>
        </div>
        <div className="space-y-3">
          {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
            <div key={key} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
              <div><div className="text-slate-300 font-medium">{c.name}</div><div className="text-[10px] text-slate-500">Норма: {c.min}-{c.max} {c.unit}</div></div>
              <div className="relative w-24"><input type="number" step="0.1" value={localParams[key]} onChange={e=>setLocalParams({...localParams, [key]: e.target.value})} className="w-full bg-slate-900 text-white p-2 rounded text-center border border-slate-600 outline-none focus:border-cyan-500" /></div>
            </div>
          ))}
          <button onClick={handleSave} className="w-full bg-cyan-600 text-white p-4 rounded-xl font-bold flex justify-center gap-2 mt-4"><Save size={20}/> Сохранить</button>
        </div>
      </div>
    );
  };

  // 3. LIVESTOCK VIEW (Без изменений)
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('sps');
    const filteredLivestock = livestock.filter(l => {
      const itemAqId = l.aqId || (aquariums.length > 0 ? aquariums[0].id : null);
      return itemAqId === selectedAqId;
    });
    return (
      <div className="pb-24 animate-fadeIn">
         <h2 className="text-2xl font-bold text-white mb-4">Жители</h2>
         <div className="mb-6 bg-slate-800 p-2 rounded-xl flex items-center relative">
          <div className="absolute left-4 text-slate-400 pointer-events-none"><Fish size={20}/></div>
          <select className="w-full bg-transparent text-white font-bold p-3 pl-10 outline-none appearance-none" value={selectedAqId || ''} onChange={(e) => setSelectedAqId(e.target.value)}>
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <div className="absolute right-4 text-slate-400 pointer-events-none"><ChevronDown size={20}/></div>
        </div>
        <div className="flex justify-between items-center mb-4"><span className="text-slate-400 text-sm">Всего: {filteredLivestock.length}</span><button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-2 rounded-lg text-white"><Plus size={24}/></button></div>
        {isAdding && (
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
             <div className="text-cyan-400 text-xs font-bold mb-2 uppercase">Добавление в: {aquariums.find(a=>a.id===selectedAqId)?.name}</div>
             <input type="text" placeholder="Название" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3" value={name} onChange={e=>setName(e.target.value)}/>
             <div className="grid grid-cols-3 gap-2 mb-4">
               {Object.keys(CORAL_TYPES).map(t => (<button key={t} onClick={()=>setType(t)} className={`p-2 text-xs rounded border ${type===t ? 'bg-cyan-900 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{CORAL_TYPES[t].label}</button>))}
             </div>
             <button onClick={() => { addCoral(name, type); setIsAdding(false); setName(''); }} className="w-full bg-cyan-600 text-white p-3 rounded-lg font-bold">Сохранить</button>
           </div>
        )}
        <div className="space-y-3">
          {filteredLivestock.map(coral => (
            <div key={coral.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
              <div><div className="font-bold text-slate-200">{coral.name}</div><div className="text-xs text-slate-400">{CORAL_TYPES[coral.type]?.label} • {coral.date?.split('T')[0]}</div></div>
              <button onClick={() => removeCoral(coral.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={18}/></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 4. PROFILE VIEW (Без изменений)
  const ProfileView = () => {
    const [editMode, setEditMode] = useState(false);
    const [profileData, setProfileData] = useState({ fullName: userData?.personalInfo?.fullName || '', city: userData?.personalInfo?.city || '', dob: userData?.personalInfo?.dob || '' });
    const daysLeft = useMemo(() => {
        if (!userData?.subscription?.expiresAt) return 0;
        return Math.max(0, Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
    }, [userData]);
    const handleSaveProfile = async () => {
        if (!user) return;
        await updateDoc(doc(db, "users", user.uid), { "personalInfo.fullName": profileData.fullName, "personalInfo.city": profileData.city, "personalInfo.dob": profileData.dob });
        setEditMode(false);
        alert("Профиль обновлен!");
    };
    return (
      <div className="pb-24 animate-fadeIn space-y-6">
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400 font-bold text-xl shrink-0">{userData?.personalInfo?.fullName?.[0] || user.email[0].toUpperCase()}</div>
          <div><h2 className="text-xl font-bold text-white">{userData?.personalInfo?.fullName || 'Пользователь'}</h2><p className="text-sm text-slate-400">{user.email}</p></div>
        </div>
        <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 p-4 rounded-xl border border-amber-900/50 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3"><div className="bg-amber-500/10 p-2 rounded-lg"><Crown className="text-amber-500" size={24}/></div><div><div className="text-amber-200 font-bold text-sm">Подписка {userData?.subscription?.name}</div><div className="text-amber-500/60 text-xs">{daysLeft > 0 ? `Осталось дней: ${daysLeft}` : 'Срок действия истек'}</div></div></div>
                <div className="text-2xl font-bold text-amber-500">{daysLeft}</div>
            </div>
            <div className="w-full bg-amber-900/30 h-1.5 rounded-full mt-3"><div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{width: `${Math.min(100, (daysLeft / 30) * 100)}%`}}></div></div>
        </div>
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white flex items-center gap-2"><User size={18}/> Личные данные</h3><button onClick={() => { if (editMode) handleSaveProfile(); else setEditMode(true); }} className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${editMode ? 'bg-cyan-600 text-white' : 'text-cyan-400 hover:bg-slate-700'}`}>{editMode ? 'Сохранить' : 'Изменить'}</button></div>
            <div className="space-y-4">
                <div><label className="text-xs text-slate-500 uppercase font-bold block mb-1">Имя</label><input type="text" disabled={!editMode} value={profileData.fullName} onChange={(e) => setProfileData({...profileData, fullName: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white disabled:opacity-50 disabled:border-transparent transition-all focus:border-cyan-500 outline-none"/></div>
                <div><label className="text-xs text-slate-500 uppercase font-bold block mb-1">Город</label><div className="relative"><MapPin size={16} className="absolute left-3 top-3.5 text-slate-500"/><input type="text" disabled={!editMode} value={profileData.city} onChange={(e) => setProfileData({...profileData, city: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 pl-10 text-white disabled:opacity-50 disabled:border-transparent transition-all focus:border-cyan-500 outline-none"/></div></div>
                <div><label className="text-xs text-slate-500 uppercase font-bold block mb-1">Дата рождения</label><input type="date" disabled={!editMode} value={profileData.dob} onChange={(e) => setProfileData({...profileData, dob: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white disabled:opacity-50 disabled:border-transparent transition-all focus:border-cyan-500 outline-none"/></div>
            </div>
        </div>
        <button onClick={() => signOut(auth)} className="w-full py-4 text-red-400 border border-slate-800 rounded-xl flex items-center justify-center gap-2 hover:bg-red-900/10 transition-colors"><LogOut size={20} /> Выйти из аккаунта</button>
      </div>
    );
  };

  // --- LOGIN/REGISTER FORMS (Без изменений) ---
  if (!user) {
    if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Загрузка...</div>;
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4"><Fish size={40} className="text-cyan-400" /></div>
        <h1 className="text-3xl font-bold text-white mb-6">MarineKeeper</h1>
        <div className="w-full max-w-sm bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <div className="flex bg-slate-950 p-1 rounded-lg mb-6"><button onClick={()=>setAuthMode('login')} className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${authMode==='login' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Вход</button><button onClick={()=>setAuthMode('register')} className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${authMode==='register' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Регистрация</button></div>
            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleRegister} className="space-y-4">
                {authMode === 'register' && (<><input type="text" placeholder="Ваше Имя" required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 rounded-xl outline-none focus:border-cyan-500" /><div className="relative"><MapPin size={18} className="absolute left-3 top-3.5 text-slate-500" /><input type="text" placeholder="Город (Обязательно)" required value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" /></div></>)}
                <div className="relative"><Mail size={18} className="absolute left-3 top-3.5 text-slate-500" /><input type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" /></div>
                <div className="relative"><Lock size={18} className="absolute left-3 top-3.5 text-slate-500" /><input type="password" placeholder="Пароль" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" /></div>
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all">{authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
            </form>
            <div className="mt-6"><div className="relative flex py-2 items-center"><div className="flex-grow border-t border-slate-800"></div><span className="flex-shrink-0 mx-4 text-slate-600 text-xs">ИЛИ ЧЕРЕЗ GOOGLE</span><div className="flex-grow border-t border-slate-800"></div></div><button onClick={handleGoogleLogin} className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 hover:bg-slate-100"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />Google</button></div>
        </div>
      </div>
    );
  }

  // --- МОДАЛКИ (Render) ---
  
  // 1. Заполнить город
  if (missingCityModal) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"><div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm"><h2 className="text-xl font-bold text-white mb-2">Заполните профиль</h2><p className="text-slate-400 text-sm mb-4">Укажите ваш город.</p><input type="text" placeholder="Город" value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl mb-4" /><button onClick={saveMissingCity} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-xl">Сохранить</button></div></div>
      )
  }

  // 2. Создание аквариума
  if (isCreating) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
                  <h2 className="text-xl font-bold text-white mb-4">Новый аквариум</h2>
                  <div className="space-y-4">
                      <div><label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Название</label><input autoFocus type="text" value={newAqData.name} onChange={e=>setNewAqData({...newAqData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none"/></div>
                      <div><label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Общий объем системы</label>
                          <div className="flex gap-2">
                              <input type="number" value={newAqData.volume} onChange={e=>setNewAqData({...newAqData, volume: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none"/>
                              <select value={newAqData.unit} onChange={e=>setNewAqData({...newAqData, unit: e.target.value})} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 outline-none"><option value="L">L</option><option value="Gal">Gal</option></select>
                          </div>
                      </div>
                      <button onClick={confirmCreateAquarium} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-xl">Создать</button>
                  </div>
                  <button onClick={()=>setIsCreating(false)} className="absolute top-4 right-4 text-slate-500"><X size={20}/></button>
              </div>
          </div>
      )
  }

  // 3. Подтверждение удаления
  if (deleteConfirmationId) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-red-900/50 w-full max-w-sm text-center">
                  <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><Trash2 size={32}/></div>
                  <h2 className="text-xl font-bold text-white mb-2">Удалить аквариум?</h2>
                  <p className="text-slate-400 text-sm mb-6">Это действие нельзя отменить. Все данные тестов и настройки этого аквариума будут удалены.</p>
                  <div className="flex gap-3">
                      <button onClick={()=>setDeleteConfirmationId(null)} className="flex-1 bg-slate-800 text-white py-3 rounded-xl">Отмена</button>
                      <button onClick={confirmDeleteAquarium} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold">Удалить</button>
                  </div>
              </div>
          </div>
      )
  }

  // 4. Редактирование настроек
  if (editingSettingsId) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"><div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
              <h2 className="text-xl font-bold text-white mb-4">Настройки аквариума</h2>
              <div className="space-y-4">
                  <div><label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Название</label><input type="text" value={tempName} onChange={e=>setTempName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none"/></div>
                  <div><label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Общий объем системы</label>
                      <div className="flex gap-2">
                          <input type="number" value={tempVolume} onChange={e=>setTempVolume(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none"/>
                          <select value={tempUnit} onChange={e=>setTempUnit(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 outline-none"><option value="L">L</option><option value="Gal">Gal</option></select>
                      </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                      <button onClick={()=>requestDeleteAquarium(editingSettingsId)} className="flex-1 bg-red-900/30 text-red-400 py-3 rounded-xl border border-red-900/50">Удалить</button>
                      <button onClick={saveSettings} className="flex-1 bg-cyan-600 text-white py-3 rounded-xl font-bold">Сохранить</button>
                  </div>
              </div>
              <button onClick={()=>setEditingSettingsId(null)} className="absolute top-4 right-4 text-slate-500"><X size={20}/></button>
          </div></div>
      )
  }

  // 5. Подмена воды
  if (waterChangeModal) {
      const aq = aquariums.find(a => a.id === waterChangeModal);
      const currentVol = parseFloat(wcAmount || 0);
      const aqVol = parseFloat(aq?.volume || 100);
      let calcVol = currentVol;
      if (wcUnit !== aq.volumeUnit) {
          if (wcUnit === 'Gal' && aq.volumeUnit === 'L') calcVol = currentVol * 3.785;
          if (wcUnit === 'L' && aq.volumeUnit === 'Gal') calcVol = currentVol / 3.785;
      }
      const percent = (calcVol / aqVol) * 100;
      const isDangerous = percent > 10;

      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"><div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
              <h2 className="text-xl font-bold text-white mb-1">Подмена воды</h2>
              <p className="text-xs text-slate-400 mb-4">Объем системы: {aq.volume} {aq.volumeUnit}</p>
              
              <div className="flex gap-2 mb-2">
                  <input autoFocus type="number" placeholder="0" value={wcAmount} onChange={e=>setWcAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none text-xl font-bold"/>
                  <select value={wcUnit} onChange={e=>setWcUnit(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 outline-none font-bold"><option value="L">L</option><option value="Gal">Gal</option></select>
              </div>
              
              {wcAmount > 0 && (
                  <div className={`p-3 rounded-lg text-sm mb-4 flex items-start gap-2 ${isDangerous ? 'bg-red-900/30 text-red-200 border border-red-800' : 'bg-green-900/30 text-green-200 border border-green-800'}`}>
                      {isDangerous ? <AlertTriangle size={16} className="shrink-0 mt-0.5"/> : <CheckCircle size={16} className="shrink-0 mt-0.5"/>}
                      <div>
                          <div className="font-bold">Подмена: {percent.toFixed(1)}%</div>
                          <div className="opacity-80 leading-tight mt-1">{isDangerous ? 'Осторожно! Подмена более 10% может дестабилизировать систему.' : 'Безопасный объем подмены.'}</div>
                      </div>
                  </div>
              )}

              <button onClick={performWaterChange} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-xl">Записать подмену</button>
              <button onClick={()=>setWaterChangeModal(null)} className="w-full text-slate-500 py-3 mt-2">Отмена</button>
          </div></div>
      )
  }

  const Nav = ({icon: I, label, id}) => <button onClick={()=>setActiveTab(id)} className={`flex flex-col items-center w-full py-3 ${activeTab===id?'text-cyan-400':'text-slate-500'}`}><I size={24}/><span className="text-[10px] mt-1">{label}</span></button>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <main className="max-w-md mx-auto min-h-screen relative p-5">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'livestock' && <LivestockView />}
        {activeTab === 'profile' && <ProfileView />}
      </main>
      <nav className="fixed bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-safe z-50">
        <div className="max-w-md mx-auto flex justify-around px-2">
          <Nav icon={Activity} label="Системы" id="dashboard"/>
          <Nav icon={Droplets} label="ICP/Тесты" id="parameters"/>
          <Nav icon={Fish} label="Жители" id="livestock"/>
          <Nav icon={User} label="Профиль" id="profile"/>
        </div>
      </nav>
    </div>
  );
}