import React, { useState, useEffect } from 'react';
import { 
  Droplets, Activity, Fish, Plus, Save, AlertTriangle, 
  CheckCircle, Trash2, User, LogOut, Crown, Mail, MapPin, Lock,
  Edit2, X, ChevronDown
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
  const [aquariums, setAquariums] = useState([]); // Массив аквариумов
  const [selectedAqId, setSelectedAqId] = useState(null); // ID выбранного аквариума (для Тестов/Кораллов)
  const [editingNameId, setEditingNameId] = useState(null); // ID аквариума, имя которого редактируем
  const [tempName, setTempName] = useState('');

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
            
            // --- МИГРАЦИЯ ДАННЫХ (для старых пользователей) ---
            if (!data.aquariums) {
               const defaultAq = {
                 id: 'default_1',
                 name: 'Мой Риф',
                 params: data.currentParams || DEFAULT_PARAMS
               };
               updateDoc(userRef, { aquariums: [defaultAq] });
               setAquariums([defaultAq]);
               setSelectedAqId('default_1');
            } else {
               setAquariums(data.aquariums);
               // Если ничего не выбрано, выбираем первый доступный
               if (!selectedAqId && data.aquariums.length > 0) {
                 setSelectedAqId(data.aquariums[0].id);
               }
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
  }, [selectedAqId]); // selectedAqId в зависимостях, чтобы не сбрасывался при обновлении

  const createGoogleProfile = async (userAuth) => {
    const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
    const newUser = {
      email: userAuth.email,
      uid: userAuth.uid,
      registeredAt: new Date().toISOString(),
      subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
      personalInfo: { fullName: userAuth.displayName || 'Aquarist', city: '' },
      aquariums: [{
        id: Date.now().toString(),
        name: 'Основной Риф',
        params: DEFAULT_PARAMS
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: fullName });
      await sendEmailVerification(userCredential.user);
      alert(`Письмо отправлено на ${email}`);
      
      const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email: email,
        uid: userCredential.user.uid,
        registeredAt: new Date().toISOString(),
        subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
        personalInfo: { fullName, city, dob: '' },
        aquariums: [{ id: Date.now().toString(), name: 'Мой Аквариум', params: DEFAULT_PARAMS }],
        livestock: []
      });
    } catch (error) { alert("Ошибка: " + error.message); }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { alert("Ошибка: " + error.message); }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (error) { alert("Ошибка: " + error.message); }
  };

  const saveMissingCity = async () => {
    if(!city) return;
    await updateDoc(doc(db, "users", user.uid), { "personalInfo.city": city });
    setMissingCityModal(false);
  };

  // --- Управление Аквариумами ---
  const addNewAquarium = async () => {
    if (aquariums.length >= 3) {
      alert("В тестовой версии можно создать не более 3 аквариумов.");
      return;
    }
    const newAq = {
      id: Date.now().toString(),
      name: `Аквариум #${aquariums.length + 1}`,
      params: DEFAULT_PARAMS
    };
    const updatedList = [...aquariums, newAq];
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
  };

  const deleteAquarium = async (id) => {
    if (!confirm("Удалить этот аквариум и все его данные?")) return;
    const updatedList = aquariums.filter(aq => aq.id !== id);
    if (updatedList.length === 0) {
      alert("Нельзя удалить последний аквариум."); 
      return;
    }
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
    if (selectedAqId === id) setSelectedAqId(updatedList[0].id);
  };

  const startEditingName = (aq) => {
    setEditingNameId(aq.id);
    setTempName(aq.name);
  };

  const saveName = async () => {
    const updatedList = aquariums.map(aq => 
      aq.id === editingNameId ? { ...aq, name: tempName } : aq
    );
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
    setEditingNameId(null);
  };

  // --- Сохранение параметров ---
  const saveParamsForAquarium = async (aqId, newParams) => {
    const updatedList = aquariums.map(aq => 
      aq.id === aqId ? { ...aq, params: newParams } : aq
    );
    await updateDoc(doc(db, "users", user.uid), { aquariums: updatedList });
    alert("Данные сохранены!");
  };

  // --- Кораллы ---
  const addCoral = async (name, type) => {
     if (!user || !name) return;
     // Гарантируем, что ID аквариума установлен
     const targetAqId = selectedAqId || (aquariums.length > 0 ? aquariums[0].id : null);
     
     if (!targetAqId) {
         alert("Сначала выберите или создайте аквариум!");
         return;
     }

     const newCoral = { 
         id: Date.now(), 
         name, 
         type, 
         date: new Date().toISOString(), 
         aqId: targetAqId // Жесткая привязка
     };
     await updateDoc(doc(db, "users", user.uid), { livestock: arrayUnion(newCoral) });
  };

  const removeCoral = async (id) => {
     const newLivestock = livestock.filter(l => l.id !== id);
     await updateDoc(doc(db, "users", user.uid), { livestock: newLivestock });
  };

  // --- УЛУЧШЕННЫЕ РЕКОМЕНДАЦИИ ---
  const getRecommendations = (params) => {
    const recs = [];
    Object.keys(params).forEach(key => {
      if (!IDEAL_PARAMS[key]) return;
      const val = parseFloat(params[key]);
      const { min, max, name, unit } = IDEAL_PARAMS[key];
      
      // Формируем текст с диапазоном нормы
      if (val < min) {
          recs.push({ 
              type: 'warning', 
              msg: `${name} низко: ${val}. Норма: ${min} - ${max} ${unit}` 
          });
      } else if (val > max) {
          recs.push({ 
              type: 'alert', 
              msg: `${name} высоко: ${val}. Норма: ${min} - ${max} ${unit}` 
          });
      }
    });
    return recs;
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
        <button onClick={addNewAquarium} className="bg-cyan-600/20 text-cyan-400 p-2 rounded-xl border border-cyan-600/50 hover:bg-cyan-600 hover:text-white transition-colors">
          <Plus size={24} />
        </button>
      </div>

      {aquariums.map((aq) => {
        const recs = getRecommendations(aq.params);
        return (
          <div key={aq.id} className="space-y-3">
            <div className="bg-gradient-to-br from-cyan-900 to-blue-950 p-6 rounded-2xl shadow-lg border border-cyan-800/50 relative group">
              <div className="flex justify-between items-start mb-4">
                {editingNameId === aq.id ? (
                  <div className="flex gap-2 w-full mr-8">
                    <input 
                      autoFocus
                      className="bg-black/20 text-white font-bold text-xl rounded px-2 py-1 w-full outline-none border border-cyan-500/50"
                      value={tempName}
                      onChange={e => setTempName(e.target.value)}
                    />
                    <button onClick={saveName} className="text-green-400"><CheckCircle size={24}/></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white">{aq.name}</h2>
                    <button onClick={() => startEditingName(aq)} className="opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400">
                      <Edit2 size={16} />
                    </button>
                  </div>
                )}
                {aquariums.length > 1 && (
                  <button onClick={() => deleteAquarium(aq.id)} className="text-slate-500 hover:text-red-400">
                    <X size={20} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center">
                  <div className="text-cyan-200 text-[10px] font-bold uppercase">Соленость</div>
                  <div className="text-xl font-mono font-bold text-white">{aq.params.salinity}</div>
                </div>
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center">
                  <div className="text-cyan-200 text-[10px] font-bold uppercase">KH</div>
                  <div className="text-xl font-mono font-bold text-white">{aq.params.kh}</div>
                </div>
                <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm text-center">
                   {recs.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-green-400"><CheckCircle size={24}/></div>
                   ) : (
                     <div className="h-full flex items-center justify-center text-yellow-400 font-bold text-xl">! {recs.length}</div>
                   )}
                </div>
              </div>
            </div>

            <div className="px-2">
              {recs.length === 0 ? (
                <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 text-slate-500 text-xs text-center">
                  В этом аквариуме всё идеально.
                </div>
              ) : (
                <div className="space-y-2">
                  {recs.map((rec, i) => (
                    <div key={i} className={`p-3 rounded-xl text-sm flex gap-2 items-start ${
                      rec.type === 'alert' ? 'bg-red-900/20 border border-red-900/50 text-red-200' : 'bg-yellow-900/20 border border-yellow-900/50 text-yellow-200'
                    }`}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                      <span>{rec.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // 2. PARAMETERS
  const ParametersView = () => {
    const activeAq = aquariums.find(a => a.id === selectedAqId) || aquariums[0];
    const [localParams, setLocalParams] = useState(activeAq ? activeAq.params : DEFAULT_PARAMS);

    useEffect(() => {
      if(activeAq) setLocalParams(activeAq.params);
    }, [activeAq]);

    const handleSave = () => {
      if(activeAq) saveParamsForAquarium(activeAq.id, localParams);
    };

    if (!activeAq) return <div className="text-center mt-10">Создайте аквариум</div>;

    return (
      <div className="pb-24 animate-fadeIn">
        <h2 className="text-2xl font-bold text-white mb-4">Ввод данных ICP/Тестов</h2>
        
        <div className="mb-6 bg-slate-800 p-2 rounded-xl flex items-center relative">
          <div className="absolute left-4 text-slate-400 pointer-events-none"><Fish size={20}/></div>
          <select 
            className="w-full bg-transparent text-white font-bold p-3 pl-10 outline-none appearance-none"
            value={selectedAqId || ''}
            onChange={(e) => setSelectedAqId(e.target.value)}
          >
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <div className="absolute right-4 text-slate-400 pointer-events-none"><ChevronDown size={20}/></div>
        </div>

        <div className="space-y-3">
          {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
            <div key={key} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
              <div>
                <div className="text-slate-300 font-medium">{c.name}</div>
                <div className="text-[10px] text-slate-500">Норма: {c.min}-{c.max} {c.unit}</div>
              </div>
              <div className="relative w-24">
                <input 
                  type="number" step="0.1" 
                  value={localParams[key]} 
                  onChange={e=>setLocalParams({...localParams, [key]: e.target.value})} 
                  className="w-full bg-slate-900 text-white p-2 rounded text-center border border-slate-600 outline-none focus:border-cyan-500" 
                />
              </div>
            </div>
          ))}
          <button onClick={handleSave} className="w-full bg-cyan-600 text-white p-4 rounded-xl font-bold flex justify-center gap-2 mt-4"><Save size={20}/> Сохранить результаты</button>
        </div>
      </div>
    );
  };

  // 3. LIVESTOCK
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('sps');
    
    // Фильтр: показываем кораллы ТОЛЬКО текущего аквариума.
    // Если aqId нет, считаем, что это коралл первого аквариума (для совместимости).
    const filteredLivestock = livestock.filter(l => {
      const itemAqId = l.aqId || (aquariums.length > 0 ? aquariums[0].id : null);
      return itemAqId === selectedAqId;
    });

    return (
      <div className="pb-24 animate-fadeIn">
         <h2 className="text-2xl font-bold text-white mb-4">Жители</h2>
         
         <div className="mb-6 bg-slate-800 p-2 rounded-xl flex items-center relative">
          <div className="absolute left-4 text-slate-400 pointer-events-none"><Fish size={20}/></div>
          <select 
            className="w-full bg-transparent text-white font-bold p-3 pl-10 outline-none appearance-none"
            value={selectedAqId || ''}
            onChange={(e) => setSelectedAqId(e.target.value)}
          >
            {aquariums.map(aq => <option key={aq.id} value={aq.id} className="bg-slate-900">{aq.name}</option>)}
          </select>
          <div className="absolute right-4 text-slate-400 pointer-events-none"><ChevronDown size={20}/></div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-400 text-sm">Всего: {filteredLivestock.length}</span>
          <button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-2 rounded-lg text-white"><Plus size={24}/></button>
        </div>
        
        {isAdding && (
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
             <div className="text-cyan-400 text-xs font-bold mb-2 uppercase">Добавление в: {aquariums.find(a=>a.id===selectedAqId)?.name}</div>
             <input type="text" placeholder="Название (напр. Acropora)" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3" value={name} onChange={e=>setName(e.target.value)}/>
             <div className="grid grid-cols-3 gap-2 mb-4">
               {Object.keys(CORAL_TYPES).map(t => (
                 <button key={t} onClick={()=>setType(t)} className={`p-2 text-xs rounded border ${type===t ? 'bg-cyan-900 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{CORAL_TYPES[t].label}</button>
               ))}
             </div>
             <button onClick={() => { addCoral(name, type); setIsAdding(false); setName(''); }} className="w-full bg-cyan-600 text-white p-3 rounded-lg font-bold">Сохранить</button>
           </div>
        )}

        <div className="space-y-3">
          {filteredLivestock.length === 0 && <div className="text-center text-slate-500 py-10">В этом аквариуме пусто.</div>}
          {filteredLivestock.map(coral => (
            <div key={coral.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-200">{coral.name}</div>
                <div className="text-xs text-slate-400">{CORAL_TYPES[coral.type]?.label} • {coral.date?.split('T')[0]}</div>
              </div>
              <button onClick={() => removeCoral(coral.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={18}/></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 4. PROFILE
  const ProfileView = () => (
    <div className="pb-24 animate-fadeIn space-y-4">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400 font-bold text-xl">
            {userData?.personalInfo?.fullName?.[0] || user.email[0].toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{userData?.personalInfo?.fullName || 'Пользователь'}</h2>
          <p className="text-sm text-slate-400 flex items-center gap-1"><MapPin size={12}/> {userData?.personalInfo?.city || 'Не указан'}</p>
        </div>
      </div>
      
      <div className="bg-amber-900/20 p-4 rounded-xl border border-amber-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
              <Crown className="text-amber-500" size={20}/>
              <div>
                  <div className="text-amber-200 font-bold text-sm">Подписка {userData?.subscription?.name}</div>
                  <div className="text-amber-500/60 text-xs">Активна до {userData?.subscription?.expiresAt?.split('T')[0]}</div>
              </div>
          </div>
      </div>

      <button onClick={() => signOut(auth)} className="w-full py-3 text-red-400 border border-slate-800 rounded-xl mt-4 flex items-center justify-center gap-2">
        <LogOut size={18} /> Выйти
      </button>
    </div>
  );

  // --- LOGIN/REGISTER FORMS ---
  if (!user) {
    if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Загрузка...</div>;
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4"><Fish size={40} className="text-cyan-400" /></div>
        <h1 className="text-3xl font-bold text-white mb-6">MarineKeeper</h1>
        <div className="w-full max-w-sm bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <div className="flex bg-slate-950 p-1 rounded-lg mb-6">
                <button onClick={()=>setAuthMode('login')} className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${authMode==='login' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Вход</button>
                <button onClick={()=>setAuthMode('register')} className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${authMode==='register' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Регистрация</button>
            </div>
            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleRegister} className="space-y-4">
                {authMode === 'register' && (
                    <>
                    <input type="text" placeholder="Ваше Имя" required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 rounded-xl outline-none focus:border-cyan-500" />
                    <div className="relative">
                        <MapPin size={18} className="absolute left-3 top-3.5 text-slate-500" />
                        <input type="text" placeholder="Город (Обязательно)" required value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" />
                    </div>
                    </>
                )}
                <div className="relative"><Mail size={18} className="absolute left-3 top-3.5 text-slate-500" /><input type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" /></div>
                <div className="relative"><Lock size={18} className="absolute left-3 top-3.5 text-slate-500" /><input type="password" placeholder="Пароль" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" /></div>
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all">{authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
            </form>
            <div className="mt-6">
                <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-slate-800"></div><span className="flex-shrink-0 mx-4 text-slate-600 text-xs">ИЛИ ЧЕРЕЗ GOOGLE</span><div className="flex-grow border-t border-slate-800"></div></div>
                <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 hover:bg-slate-100"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />Google</button>
            </div>
        </div>
      </div>
    );
  }

  // Модалка Города
  if (missingCityModal) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
                  <h2 className="text-xl font-bold text-white mb-2">Заполните профиль</h2>
                  <p className="text-slate-400 text-sm mb-4">Укажите ваш город.</p>
                  <input type="text" placeholder="Город" value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl mb-4" />
                  <button onClick={saveMissingCity} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-xl">Сохранить</button>
              </div>
          </div>
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