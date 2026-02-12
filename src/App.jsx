import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, Activity, Fish, Calculator, Plus, Save, AlertTriangle, 
  CheckCircle, Trash2, ChevronRight, Info, ArrowLeft, Beaker, Box, 
  Layers, TrendingDown, User, LogOut, Crown, Calendar
} from 'lucide-react';

// --- Подключение Firebase ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  arrayUnion, 
  onSnapshot 
} from "firebase/firestore";

// --- КОНФИГУРАЦИЯ FIREBASE (ВАШИ КЛЮЧИ) ---
const firebaseConfig = {
  apiKey: "AIzaSyAje8rftBvZuC0cFJSh5He4oHsUVT0xZnU",
  authDomain: "marinekeeper.firebaseapp.com",
  projectId: "marinekeeper",
  storageBucket: "marinekeeper.firebasestorage.app",
  messagingSenderId: "3819422761",
  appId: "1:3819422761:web:3f40c57060ea878987c838",
  measurementId: "G-RDWEZCWREF"
};

// Инициализация (безопасная проверка)
let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Ошибка инициализации Firebase:", e);
}

// --- Константы ---
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
  sps: { label: 'SPS (Жесткие)', care: 'Требуют стабильного KH/Ca, сильного света.', target: 'NO3 < 5, PO4 < 0.05' },
  lps: { label: 'LPS (Крупнополипные)', care: 'Умеренный свет/течение.', target: 'Менее требовательны.' },
  soft: { label: 'Мягкие (Soft)', care: 'Прощают ошибки.', target: 'Любят "грязную" воду.' },
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
    'arbitrary': { label: 'Обычный грунт', density: 11.7 },
    'caribsea': { label: 'Арагонит (CaribSea)', density: 13.9 },
    'quartz': { label: 'Кварцевый песок', density: 11.7 },
    'marble': { label: 'Мраморная крошка', density: 22.5 }
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentParams, setCurrentParams] = useState({
    salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
  });
  const [livestock, setLivestock] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // --- Эффект: Авторизация и Загрузка данных ---
  useEffect(() => {
    if (!auth) { setLoading(false); return; }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Подписка на изменения данных пользователя в реальном времени
        const userRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (data.currentParams) setCurrentParams(data.currentParams);
            if (data.livestock) setLivestock(data.livestock);
          } else {
            // Если документ не существует (новый юзер), создаем его
            createUserProfile(currentUser);
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
  }, []);

  // --- Создание профиля при первом входе ---
  const createUserProfile = async (userAuth) => {
    const trialDate = new Date();
    trialDate.setDate(trialDate.getDate() + 30); // +30 дней триал

    const newUser = {
      email: userAuth.email,
      displayName: userAuth.displayName || 'Aquarist',
      photoURL: userAuth.photoURL,
      registeredAt: new Date().toISOString(),
      subscription: {
        level: 'pro_trial',
        name: 'PRO Trial (30 дней)',
        expiresAt: trialDate.toISOString()
      },
      personalInfo: {
        dob: '',
        fullName: userAuth.displayName || ''
      },
      currentParams: { salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.03, temp: 25 },
      livestock: [],
      history: []
    };

    await setDoc(doc(db, "users", userAuth.uid), newUser);
  };

  // --- Логика анализа ---
  useEffect(() => {
    const newRecs = [];
    Object.keys(currentParams).forEach(key => {
      if (!IDEAL_PARAMS[key]) return;
      const val = parseFloat(currentParams[key]);
      const { min, max, name, unit } = IDEAL_PARAMS[key];
      
      if (val < min) newRecs.push({ type: 'warning', msg: `${name} низкий (${val}). Поднимите до ${min}.` });
      else if (val > max) newRecs.push({ type: 'alert', msg: `${name} высокий (${val}). Снизьте до ${max}.` });
    });
    if (currentParams.mg < 1250) newRecs.push({ type: 'info', msg: 'Низкий Mg мешает стабилизировать KH и Ca.' });
    setRecommendations(newRecs);
  }, [currentParams]);

  // --- Функции действий ---
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("Ошибка входа: " + error.message);
    }
  };

  const handleLogout = () => signOut(auth);

  const saveParameters = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const historyEntry = {
        date: new Date().toISOString(),
        params: currentParams
      };
      
      await updateDoc(userRef, {
        currentParams: currentParams,
        history: arrayUnion(historyEntry) // Добавляем в массив истории
      });
      alert("Данные сохранены в облако!");
    } catch (e) {
      alert("Ошибка сохранения: " + e.message);
    }
  };

  const saveProfile = async (info) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { personalInfo: info });
    alert("Профиль обновлен");
  };

  const addCoralToCloud = async (coral) => {
     if (!user) return;
     const userRef = doc(db, "users", user.uid);
     await updateDoc(userRef, {
       livestock: arrayUnion(coral)
     });
  };

  const removeCoralFromCloud = async (coral) => {
     if (!user) return;
     const newLivestock = livestock.filter(l => l.id !== coral.id);
     const userRef = doc(db, "users", user.uid);
     await updateDoc(userRef, { livestock: newLivestock });
  };


  // --- ЭКРАНЫ ---

  // 0. Экран входа
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500 animate-pulse">Загрузка системы...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <Fish size={48} className="text-cyan-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">MarineKeeper</h1>
        <p className="text-slate-400 mb-8">Ваш умный помощник по морскому аквариуму.</p>
        
        <button 
          onClick={handleLogin}
          className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-3 hover:bg-slate-100 transition-all w-full max-w-xs justify-center"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="G" />
          Войти через Google
        </button>
        <p className="text-xs text-slate-500 mt-4">Данные хранятся в защищенном облаке</p>
      </div>
    );
  }

  // 1. Профиль
  const ProfileView = () => {
    const [editMode, setEditMode] = useState(false);
    const [info, setInfo] = useState(userData?.personalInfo || { fullName: '', dob: '' });
    
    // Вычисляем дни до конца подписки
    const daysLeft = userData?.subscription?.expiresAt 
      ? Math.ceil((new Date(userData.subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <div className="pb-24 animate-fadeIn space-y-6">
        {/* Карточка юзера */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center gap-4">
          <img src={user.photoURL} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-cyan-500" />
          <div>
            <h2 className="text-xl font-bold text-white">{userData?.personalInfo?.fullName || user.displayName}</h2>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>

        {/* Подписка */}
        <div className="bg-gradient-to-r from-yellow-900/40 to-amber-900/40 p-6 rounded-2xl border border-yellow-700/50 relative overflow-hidden">
          <Crown className="absolute right-4 top-4 text-yellow-500/20 w-24 h-24 -rotate-12" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="text-yellow-400" size={20} />
              <span className="text-yellow-400 font-bold uppercase text-sm tracking-wider">Ваш статус</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{userData?.subscription?.name}</h3>
            <p className="text-yellow-200/70 text-sm">Осталось дней: {daysLeft}</p>
            <div className="w-full bg-yellow-900/50 h-2 rounded-full mt-3">
              <div className="bg-yellow-400 h-full rounded-full" style={{ width: `${(daysLeft / 30) * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Личные данные */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white">Личные данные</h3>
            <button onClick={() => {
              if (editMode) saveProfile(info);
              setEditMode(!editMode);
            }} className="text-cyan-400 text-sm font-medium">
              {editMode ? 'Сохранить' : 'Изменить'}
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold block mb-1">ФИО</label>
              <input 
                type="text" 
                disabled={!editMode}
                value={info.fullName}
                onChange={(e) => setInfo({...info, fullName: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold block mb-1">Дата Рождения</label>
              <input 
                type="date" 
                disabled={!editMode}
                value={info.dob}
                onChange={(e) => setInfo({...info, dob: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        <button onClick={handleLogout} className="w-full py-4 text-red-400 font-medium flex items-center justify-center gap-2 rounded-xl hover:bg-red-900/10">
          <LogOut size={20} /> Выйти из аккаунта
        </button>
      </div>
    );
  };

  // 2. Тесты (с сохранением)
  const ParametersView = () => (
    <div className="pb-24 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white mb-6">Ввод тестов</h2>
      <div className="space-y-4">
        {Object.entries(IDEAL_PARAMS).map(([key, config]) => (
          <div key={key} className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <label className="text-slate-300 font-medium">{config.name}</label>
              <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                {config.min}-{config.max}
              </span>
            </div>
            <div className="relative">
              <input
                type="number" step="0.1"
                value={currentParams[key] || ''}
                onChange={(e) => setCurrentParams({...currentParams, [key]: e.target.value})}
                className="w-full bg-slate-900 text-white p-3 rounded-lg border border-slate-700 focus:border-cyan-500 outline-none font-mono text-lg"
              />
              <span className="absolute right-3 top-3 text-slate-500 text-sm">{config.unit}</span>
            </div>
          </div>
        ))}
        <button onClick={saveParameters} className="w-full bg-cyan-600 text-white p-4 rounded-xl font-bold text-lg shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <Save size={20} /> Сохранить в облако
        </button>
      </div>
    </div>
  );

  // 3. Дашборд
  const DashboardView = () => (
    <div className="space-y-6 animate-fadeIn pb-24">
      <div className="bg-gradient-to-br from-cyan-900 to-blue-900 p-6 rounded-2xl shadow-lg border border-cyan-800/50">
        <h2 className="text-2xl font-bold text-white mb-1">Аквариум {userData?.personalInfo?.fullName || 'Пользователя'}</h2>
        <p className="text-cyan-200/70 text-sm">PRO Подписка активна</p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
            <div className="text-cyan-200 text-xs uppercase font-bold">KH</div>
            <div className="text-2xl font-mono font-bold text-white">{currentParams.kh}</div>
          </div>
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
            <div className="text-cyan-200 text-xs uppercase font-bold">Salinity</div>
            <div className="text-2xl font-mono font-bold text-white">{currentParams.salinity}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-3 px-1">Анализ</h3>
        {recommendations.length === 0 ? (
          <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-green-400 text-sm flex items-center gap-2">
            <CheckCircle size={16}/> Параметры в норме
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`p-4 rounded-xl border flex gap-3 ${rec.type === 'alert' ? 'bg-red-900/20 border-red-800 text-red-200' : 'bg-yellow-900/20 border-yellow-800 text-yellow-200'}`}>
                <AlertTriangle size={20} className="shrink-0" />
                <p className="text-sm">{rec.msg}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // 4. Кораллы (с облаком)
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('sps');

    const handleAdd = async () => {
      if(!newName) return;
      const newCoral = { id: Date.now(), name: newName, type: newType, date: new Date().toISOString() };
      setLivestock([...livestock, newCoral]); // Оптимистичное обновление
      await addCoralToCloud(newCoral);
      setNewName(''); setIsAdding(false);
    };

    return (
      <div className="pb-24 animate-fadeIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Кораллы</h2>
          <button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-2 rounded-lg text-white"><Plus size={24}/></button>
        </div>
        
        {isAdding && (
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
             <input type="text" placeholder="Название" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3" value={newName} onChange={e=>setNewName(e.target.value)}/>
             <div className="grid grid-cols-3 gap-2 mb-4">
               {Object.keys(CORAL_TYPES).map(t => (
                 <button key={t} onClick={()=>setNewType(t)} className={`p-2 text-xs rounded border ${newType===t ? 'bg-cyan-900 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{CORAL_TYPES[t].label.split(' ')[0]}</button>
               ))}
             </div>
             <button onClick={handleAdd} className="w-full bg-cyan-600 text-white p-3 rounded-lg">Добавить</button>
           </div>
        )}

        <div className="space-y-3">
          {livestock.map(coral => (
            <div key={coral.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-200">{coral.name}</div>
                <div className="text-xs text-slate-400">{CORAL_TYPES[coral.type].label}</div>
              </div>
              <button onClick={() => removeCoralFromCloud(coral)} className="text-slate-600 hover:text-red-400"><Trash2 size={20}/></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Навигация
  const NavItem = ({ icon: Icon, label, id }) => (
    <button onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-3 ${activeTab === id ? 'text-cyan-400' : 'text-slate-500'}`}>
      <Icon size={24} />
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <main className="max-w-md mx-auto min-h-screen relative p-5">
        {activeTab !== 'dashboard' && <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-slate-950 to-transparent pointer-events-none z-10" />}
        
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'livestock' && <LivestockView />}
        {activeTab === 'profile' && <ProfileView />}
        {/* Калькуляторы скрыл для краткости примера, логика та же */}
      </main>

      <nav className="fixed bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-safe z-50">
        <div className="max-w-md mx-auto flex justify-around items-center px-2">
          <NavItem icon={Activity} label="Риф" id="dashboard" />
          <NavItem icon={Droplets} label="Тесты" id="parameters" />
          <NavItem icon={Fish} label="Кораллы" id="livestock" />
          <NavItem icon={User} label="Профиль" id="profile" />
        </div>
      </nav>
    </div>
  );
}