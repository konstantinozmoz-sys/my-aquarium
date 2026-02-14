import React, { useState, useEffect } from 'react';
import { 
  Droplets, Activity, Fish, Calculator, Plus, Save, AlertTriangle, 
  CheckCircle, Trash2, User, LogOut, Crown, Mail, MapPin, Lock
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

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Состояния для Auth формы
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [missingCityModal, setMissingCityModal] = useState(false);

  // Данные приложения
  const [currentParams, setCurrentParams] = useState({
    salinity: 35, kh: 8.0, ca: 420, mg: 1350, no3: 5, po4: 0.05, temp: 25.0
  });
  const [livestock, setLivestock] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // --- 1. Логика Авторизации ---
  useEffect(() => {
    if (!auth) { setLoading(false); return; }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Слушаем базу данных
        const userRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (data.currentParams) setCurrentParams(data.currentParams);
            if (data.livestock) setLivestock(data.livestock);
            
            // Проверка: Если нет города (например, вход через Google первый раз), требуем ввести
            if (!data.personalInfo?.city) {
                setMissingCityModal(true);
            } else {
                setMissingCityModal(false);
            }

          } else {
            // Если через Google зашли впервые, профиля в базе нет -> создаем
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
  }, []);

  // Создание профиля для Google входа (без города пока что)
  const createGoogleProfile = async (userAuth) => {
    const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
    const newUser = {
      email: userAuth.email,
      uid: userAuth.uid,
      registeredAt: new Date().toISOString(),
      subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
      personalInfo: { fullName: userAuth.displayName || 'Aquarist', city: '' }, // Город пустой, сработает missingCityModal
      currentParams: currentParams,
      livestock: []
    };
    await setDoc(doc(db, "users", userAuth.uid), newUser);
  };

  // Регистрация через Email/Pass
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!city) { alert("Укажите город!"); return; }
    
    try {
      // 1. Создаем юзера
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUserAuth = userCredential.user;

      // 2. Обновляем имя
      await updateProfile(newUserAuth, { displayName: fullName });

      // 3. Отправляем подтверждение почты
      await sendEmailVerification(newUserAuth);
      alert(`Письмо с подтверждением отправлено на ${email}`);

      // 4. Пишем в базу (Сразу с городом!)
      const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
      const newUserData = {
        email: email,
        uid: newUserAuth.uid,
        registeredAt: new Date().toISOString(),
        subscription: { name: 'PRO Trial', expiresAt: trialDate.toISOString() },
        personalInfo: { fullName: fullName, city: city, dob: '' },
        currentParams: currentParams,
        livestock: []
      };
      await setDoc(doc(db, "users", newUserAuth.uid), newUserData);

    } catch (error) {
      alert("Ошибка регистрации: " + error.message);
    }
  };

  // Вход через Email
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Ошибка входа: " + error.message);
    }
  };

  // Вход через Google
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("Ошибка Google входа: " + error.message);
    }
  };

  // Сохранение недостающего города
  const saveMissingCity = async () => {
      if(!city) return;
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
          "personalInfo.city": city
      });
      setMissingCityModal(false);
  };

  // --- Действия с данными ---
  const saveParameters = async () => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { currentParams: currentParams });
    alert("Параметры сохранены");
  };

  const addCoral = async (name, type) => {
     if (!user || !name) return;
     const newCoral = { 
         id: Date.now(), 
         name, 
         type, 
         date: new Date().toISOString() 
     };
     // Оптимистичное обновление
     setLivestock([...livestock, newCoral]);
     
     // Отправка в базу (в массив livestock)
     const userRef = doc(db, "users", user.uid);
     await updateDoc(userRef, {
       livestock: arrayUnion(newCoral)
     });
  };

  const removeCoral = async (id) => {
     if (!user) return;
     const newLivestock = livestock.filter(l => l.id !== id);
     const userRef = doc(db, "users", user.uid);
     await updateDoc(userRef, { livestock: newLivestock });
  };

  // Анализ
  useEffect(() => {
    const newRecs = [];
    Object.keys(currentParams).forEach(key => {
      if (!IDEAL_PARAMS[key]) return;
      const val = parseFloat(currentParams[key]);
      const { min, max, name } = IDEAL_PARAMS[key];
      if (val < min) newRecs.push({ type: 'warning', msg: `${name}: низко (${val})` });
      else if (val > max) newRecs.push({ type: 'alert', msg: `${name}: высоко (${val})` });
    });
    setRecommendations(newRecs);
  }, [currentParams]);

  // --- ЭКРАН ВХОДА / РЕГИСТРАЦИИ ---
  if (!user) {
    if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Загрузка...</div>;

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4">
          <Fish size={40} className="text-cyan-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-6">MarineKeeper</h1>

        <div className="w-full max-w-sm bg-slate-900 p-6 rounded-2xl border border-slate-800">
            {/* Переключатель */}
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
                
                <div className="relative">
                    <Mail size={18} className="absolute left-3 top-3.5 text-slate-500" />
                    <input type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" />
                </div>
                
                <div className="relative">
                    <Lock size={18} className="absolute left-3 top-3.5 text-slate-500" />
                    <input type="password" placeholder="Пароль" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white p-3 pl-10 rounded-xl outline-none focus:border-cyan-500" />
                </div>

                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all">
                    {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </button>
            </form>

            <div className="mt-6">
                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-800"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-600 text-xs">ИЛИ ЧЕРЕЗ GOOGLE</span>
                    <div className="flex-grow border-t border-slate-800"></div>
                </div>
                <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 hover:bg-slate-100">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />
                    Google
                </button>
            </div>
        </div>
      </div>
    );
  }

  // --- МОДАЛКА ЕСЛИ НЕТ ГОРОДА ---
  if (missingCityModal) {
      return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
                  <h2 className="text-xl font-bold text-white mb-2">Заполните профиль</h2>
                  <p className="text-slate-400 text-sm mb-4">Для продолжения необходимо указать ваш город.</p>
                  <input type="text" placeholder="Город" value={city} onChange={e=>setCity(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl mb-4" />
                  <button onClick={saveMissingCity} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-xl">Сохранить и войти</button>
              </div>
          </div>
      )
  }

  // --- ОСНОВНЫЕ ЭКРАНЫ ---
  const ProfileView = () => (
    <div className="pb-24 animate-fadeIn space-y-4">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400 font-bold text-xl">
            {userData?.personalInfo?.fullName?.[0] || user.email[0].toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{userData?.personalInfo?.fullName || 'Пользователь'}</h2>
          <p className="text-sm text-slate-400 flex items-center gap-1"><MapPin size={12}/> {userData?.personalInfo?.city || 'Не указан'}</p>
          <p className="text-xs text-slate-500 mt-1">{user.emailVerified ? 'Email подтвержден' : 'Email не подтвержден'}</p>
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

  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('sps');

    return (
      <div className="pb-24 animate-fadeIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Мои Кораллы</h2>
          <button onClick={() => setIsAdding(!isAdding)} className="bg-cyan-600 p-2 rounded-lg text-white"><Plus size={24}/></button>
        </div>
        
        {isAdding && (
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
             <h3 className="text-white text-sm font-bold mb-3">Добавление в базу</h3>
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
          {livestock.length === 0 && <div className="text-center text-slate-500 py-10">Пока пусто. Добавьте первый коралл!</div>}
          {livestock.map(coral => (
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

  const DashboardView = () => (
    <div className="space-y-6 animate-fadeIn pb-24">
       <div className="bg-gradient-to-br from-cyan-900 to-blue-900 p-6 rounded-2xl shadow-lg border border-cyan-800/50">
        <h2 className="text-2xl font-bold text-white mb-1">Аквариум {userData?.personalInfo?.fullName?.split(' ')[0]}</h2>
        <div className="flex gap-2 text-cyan-200/70 text-sm mb-4">
           <MapPin size={14} className="mt-0.5" /> {userData?.personalInfo?.city || 'Город не указан'}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm"><div className="text-cyan-200 text-xs font-bold">KH</div><div className="text-2xl font-mono font-bold text-white">{currentParams.kh}</div></div>
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm"><div className="text-cyan-200 text-xs font-bold">Salinity</div><div className="text-2xl font-mono font-bold text-white">{currentParams.salinity}</div></div>
        </div>
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-3">Состояние</h3>
        {recommendations.length === 0 ? <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-green-400 text-sm flex gap-2"><CheckCircle size={16}/> Всё отлично</div> : 
         recommendations.map((rec, i) => <div key={i} className="p-3 mb-2 rounded-xl bg-slate-800 border border-slate-700 text-yellow-200 text-sm flex gap-2"><AlertTriangle size={16}/> {rec.msg}</div>)}
      </div>
    </div>
  );

  const ParametersView = () => (
    <div className="pb-24 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white mb-6">Ввод тестов</h2>
      <div className="space-y-4">
        {Object.entries(IDEAL_PARAMS).map(([key, c]) => (
          <div key={key} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
            <span className="text-slate-300 font-medium">{c.name}</span>
            <input type="number" step="0.1" value={currentParams[key]} onChange={e=>setCurrentParams({...currentParams, [key]: e.target.value})} className="bg-slate-900 text-white p-2 rounded w-24 text-center border border-slate-600" />
          </div>
        ))}
        <button onClick={saveParameters} className="w-full bg-cyan-600 text-white p-4 rounded-xl font-bold flex justify-center gap-2"><Save size={20}/> Сохранить</button>
      </div>
    </div>
  );

  // Навигация
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
          <Nav icon={Activity} label="Риф" id="dashboard"/>
          <Nav icon={Droplets} label="Тесты" id="parameters"/>
          <Nav icon={Fish} label="Кораллы" id="livestock"/>
          <Nav icon={User} label="Профиль" id="profile"/>
        </div>
      </nav>
    </div>
  );
}