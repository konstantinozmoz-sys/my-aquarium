import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplets, 
  Activity, 
  Fish, 
  Calculator, 
  Plus, 
  Save, 
  AlertTriangle, 
  CheckCircle, 
  Trash2, 
  ChevronRight,
  Info,
  ArrowLeft,
  Beaker,
  Box,
  Layers,
  Thermometer
} from 'lucide-react';

// --- Константы и Идеальные Параметры ---
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
  sps: { label: 'SPS (Жесткие)', care: 'Требуют стабильного KH/Ca, сильного света и течения.', target: 'Держите NO3 < 5, PO4 < 0.05' },
  lps: { label: 'LPS (Крупнополипные)', care: 'Умеренный свет/течение. Любят подкормку.', target: 'Менее требовательны к NO3/PO4.' },
  soft: { label: 'Мягкие (Soft)', care: 'Прощают ошибки. Умеренный свет.', target: 'Могут жить при повышенных нитратах.' },
};

// Коэффициенты для калькуляторов (из вашего файла)
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
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Состояние: Параметры воды
  const [currentParams, setCurrentParams] = useState({
    salinity: 35,
    kh: 8.5,
    ca: 420,
    mg: 1300,
    no3: 5,
    po4: 0.05,
    temp: 25.5
  });

  // Состояние: Кораллы
  const [livestock, setLivestock] = useState([
    { id: 1, name: 'Acropora Tenuis', type: 'sps', date: '2023-10-01' },
    { id: 2, name: 'Euphyllia Torch', type: 'lps', date: '2023-11-15' }
  ]);

  // Состояние: Уведомления/Рекомендации
  const [recommendations, setRecommendations] = useState([]);

  // Анализ параметров при их изменении
  useEffect(() => {
    const newRecs = [];
    Object.keys(currentParams).forEach(key => {
      const val = parseFloat(currentParams[key]);
      const { min, max, name, unit } = IDEAL_PARAMS[key];
      
      if (val < min) {
        newRecs.push({ type: 'warning', msg: `${name} низкий (${val} ${unit}). Рекомендуется корректировка.` });
      } else if (val > max) {
        newRecs.push({ type: 'alert', msg: `${name} высокий (${val} ${unit}). Проверьте дозировки.` });
      }
    });
    
    // Специфическая логика для морского аквариума
    if (currentParams.mg < 1200 && currentParams.ca < 400) {
      newRecs.push({ type: 'info', msg: 'Низкий Магний мешает стабилизировать Кальций. Сначала поднимите Mg.' });
    }

    setRecommendations(newRecs);
  }, [currentParams]);

  // --- Компоненты навигации ---
  const NavItem = ({ icon: Icon, label, id }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center w-full py-3 transition-colors ${
        activeTab === id ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <Icon size={24} strokeWidth={2} />
      <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
  );

  const getStatusColor = (key, val) => {
    const { min, max } = IDEAL_PARAMS[key];
    if (val < min || val > max) return 'text-red-400';
    return 'text-green-400';
  };

  const handleParamChange = (key, value) => {
    setCurrentParams(prev => ({ ...prev, [key]: value }));
  };

  // --- Экраны ---

  // 1. Дашборд
  const DashboardView = () => (
    <div className="space-y-6 animate-fadeIn pb-24">
      <div className="bg-gradient-to-br from-cyan-900 to-blue-900 p-6 rounded-2xl shadow-lg border border-cyan-800/50">
        <h2 className="text-2xl font-bold text-white mb-2">Мой Риф 300л</h2>
        <p className="text-cyan-200 text-sm flex items-center gap-2">
          <CheckCircle size={16} /> Система стабильна
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
            <div className="text-cyan-200 text-xs uppercase font-bold">KH (Alkalinity)</div>
            <div className={`text-2xl font-mono font-bold ${getStatusColor('kh', currentParams.kh)}`}>
              {currentParams.kh} <span className="text-sm text-white/50">dKH</span>
            </div>
          </div>
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
            <div className="text-cyan-200 text-xs uppercase font-bold">Salinity</div>
            <div className={`text-2xl font-mono font-bold ${getStatusColor('salinity', currentParams.salinity)}`}>
              {currentParams.salinity} <span className="text-sm text-white/50">ppt</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-3 px-1">Анализ и Рекомендации</h3>
        {recommendations.length === 0 ? (
          <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-slate-400 text-center text-sm">
            Все показатели в норме. Отличная работа!
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`p-4 rounded-xl border flex items-start gap-3 ${
                rec.type === 'alert' ? 'bg-red-900/20 border-red-800 text-red-200' : 
                rec.type === 'info' ? 'bg-blue-900/20 border-blue-800 text-blue-200' :
                'bg-yellow-900/20 border-yellow-800 text-yellow-200'
              }`}>
                <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-medium leading-relaxed">{rec.msg}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-3 px-1">Последние добавленные</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {livestock.slice(0,3).map(coral => (
            <div key={coral.id} className="min-w-[140px] bg-slate-800 p-3 rounded-xl border border-slate-700">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center mb-2">
                <Activity size={16} />
              </div>
              <div className="font-medium text-slate-200 text-sm truncate">{coral.name}</div>
              <div className="text-xs text-slate-500 uppercase mt-1">{CORAL_TYPES[coral.type].label.split(' ')[0]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // 2. Тесты
  const ParametersView = () => (
    <div className="pb-24 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white mb-6">Ввод тестов</h2>
      <div className="space-y-4">
        {Object.entries(IDEAL_PARAMS).map(([key, config]) => (
          <div key={key} className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <label className="text-slate-300 font-medium flex items-center gap-2">
                {config.name}
              </label>
              <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                Норма: {config.min} - {config.max} {config.unit}
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={currentParams[key]}
                onChange={(e) => handleParamChange(key, e.target.value)}
                className={`w-full bg-slate-900 text-white p-4 rounded-lg border-2 focus:outline-none transition-colors text-lg font-mono ${
                  currentParams[key] < config.min || currentParams[key] > config.max 
                  ? 'border-yellow-600 focus:border-yellow-500' 
                  : 'border-slate-700 focus:border-cyan-500'
                }`}
              />
              <div className="absolute right-4 top-4 text-slate-500 font-mono pointer-events-none">
                {config.unit}
              </div>
            </div>
          </div>
        ))}
        <button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white p-4 rounded-xl font-bold text-lg shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all active:scale-95">
          <Save size={20} />
          Сохранить в историю
        </button>
      </div>
    </div>
  );

  // 3. Живность
  const LivestockView = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newCoralName, setNewCoralName] = useState('');
    const [newCoralType, setNewCoralType] = useState('sps');

    const addCoral = () => {
      if (!newCoralName) return;
      setLivestock([...livestock, {
        id: Date.now(),
        name: newCoralName,
        type: newCoralType,
        date: new Date().toISOString().split('T')[0]
      }]);
      setNewCoralName('');
      setIsAdding(false);
    };

    return (
      <div className="pb-24 animate-fadeIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Кораллы</h2>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-cyan-600 p-2 rounded-lg text-white hover:bg-cyan-500"
          >
            <Plus size={24} />
          </button>
        </div>

        {isAdding && (
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6 animate-slideDown">
            <h3 className="text-white font-medium mb-3">Добавить нового жителя</h3>
            <input 
              type="text" 
              placeholder="Название (напр. Acropora)" 
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3"
              value={newCoralName}
              onChange={(e) => setNewCoralName(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2 mb-4">
              {Object.keys(CORAL_TYPES).map(type => (
                <button
                  key={type}
                  onClick={() => setNewCoralType(type)}
                  className={`p-2 text-xs rounded-lg border transition-all ${
                    newCoralType === type 
                    ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' 
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {CORAL_TYPES[type].label.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 mb-4 text-xs text-slate-400">
              <strong className="text-slate-300 block mb-1">Потребности:</strong>
              {CORAL_TYPES[newCoralType].care}
            </div>
            <button onClick={addCoral} className="w-full bg-cyan-600 text-white p-3 rounded-lg font-medium">
              Добавить
            </button>
          </div>
        )}

        <div className="space-y-3">
          {livestock.map(coral => (
            <div key={coral.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center group">
              <div>
                <div className="font-bold text-slate-200 text-lg">{coral.name}</div>
                <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${
                    coral.type === 'sps' ? 'bg-purple-400' : 
                    coral.type === 'lps' ? 'bg-green-400' : 'bg-yellow-400'
                  }`}></span>
                  {CORAL_TYPES[coral.type].label}
                </div>
              </div>
              <button 
                onClick={() => setLivestock(livestock.filter(l => l.id !== coral.id))}
                className="text-slate-600 hover:text-red-400 p-2"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 4. Калькуляторы (Расширенный раздел)
  const CalculatorsView = () => {
    const [selectedTool, setSelectedTool] = useState(null);

    // Внутренние компоненты калькуляторов
    const KHCalc = () => {
      const [vol, setVol] = useState(300);
      const [cur, setCur] = useState(7);
      const [tgt, setTgt] = useState(8);
      const [form, setForm] = useState('nahco3');
      
      const result = useMemo(() => {
        if (!vol || !tgt || !cur) return 0;
        const diff = tgt - cur;
        if (diff <= 0) return 0;
        return (diff * vol * CALC_DATA.kh[form].coeff).toFixed(2);
      }, [vol, cur, tgt, form]);

      return (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <label className="label">Тип добавки</label>
            <select value={form} onChange={(e) => setForm(e.target.value)} className="input-field mb-4">
              {Object.entries(CALC_DATA.kh).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Объем (л)</label>
                <input type="number" value={vol} onChange={(e) => setVol(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label">Текущий KH</label>
                <input type="number" value={cur} onChange={(e) => setCur(e.target.value)} className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="label">Целевой KH</label>
                <input type="number" value={tgt} onChange={(e) => setTgt(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>
          <div className="result-card">
            <span className="text-slate-400 text-sm">Добавить реагента:</span>
            <div className="text-3xl font-bold text-cyan-400">{result} г</div>
            <div className="text-xs text-yellow-500 mt-2">⚠️ Не поднимайте KH более чем на 1 dKH в сутки!</div>
          </div>
        </div>
      );
    };

    const CaCalc = () => {
      const [vol, setVol] = useState(300);
      const [cur, setCur] = useState(400);
      const [tgt, setTgt] = useState(430);
      const [form, setForm] = useState('dihydrate');

      const result = useMemo(() => {
        if (!vol || !tgt || !cur) return 0;
        const diff = tgt - cur;
        if (diff <= 0) return 0;
        return (diff * vol * CALC_DATA.ca[form].coeff).toFixed(1);
      }, [vol, cur, tgt, form]);

      return (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
             <label className="label">Форма Кальция</label>
            <select value={form} onChange={(e) => setForm(e.target.value)} className="input-field mb-4">
              {Object.entries(CALC_DATA.ca).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Объем (л)</label><input type="number" value={vol} onChange={(e) => setVol(e.target.value)} className="input-field" /></div>
              <div><label className="label">Текущий Ca</label><input type="number" value={cur} onChange={(e) => setCur(e.target.value)} className="input-field" /></div>
              <div className="col-span-2"><label className="label">Целевой Ca</label><input type="number" value={tgt} onChange={(e) => setTgt(e.target.value)} className="input-field" /></div>
            </div>
          </div>
          <div className="result-card">
            <span className="text-slate-400 text-sm">Добавить реагента:</span>
            <div className="text-3xl font-bold text-cyan-400">{result} г</div>
          </div>
        </div>
      );
    };

    const MgCalc = () => {
       const [vol, setVol] = useState(300);
       const [cur, setCur] = useState(1250);
       const [tgt, setTgt] = useState(1350);
       const [method, setMethod] = useState('chloride'); // Упростим до хлорида для мобильной версии
       
       const result = useMemo(() => {
         // Формула для хлорида магния (MgCl2*6H2O): Increase * Vol * 0.008364
         const diff = tgt - cur;
         if (diff <= 0) return 0;
         return (diff * vol * 0.008364).toFixed(1);
       }, [vol, cur, tgt]);

       return (
         <div className="space-y-4 animate-fadeIn">
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
             <p className="text-xs text-slate-400 mb-4">Расчет для 6-водного хлорида магния (MgCl2•6H2O)</p>
             <div className="grid grid-cols-2 gap-4">
               <div><label className="label">Объем (л)</label><input type="number" value={vol} onChange={(e) => setVol(e.target.value)} className="input-field" /></div>
               <div><label className="label">Текущий Mg</label><input type="number" value={cur} onChange={(e) => setCur(e.target.value)} className="input-field" /></div>
               <div className="col-span-2"><label className="label">Целевой Mg</label><input type="number" value={tgt} onChange={(e) => setTgt(e.target.value)} className="input-field" /></div>
             </div>
           </div>
           <div className="result-card">
             <span className="text-slate-400 text-sm">Добавить MgCl2•6H2O:</span>
             <div className="text-3xl font-bold text-cyan-400">{result} г</div>
           </div>
         </div>
       );
    };

    const BallingCalc = () => {
      const [vol, setVol] = useState(5);
      const [caForm, setCaForm] = useState('dihydrate');
      const [bufForm, setBufForm] = useState('nahco3');

      const results = useMemo(() => {
        return {
          ca: (CALC_DATA.balling.ca[caForm].coeff * vol).toFixed(1),
          buf: (CALC_DATA.balling.buffer[bufForm].coeff * vol).toFixed(1),
          salt: (25.0 * vol).toFixed(1)
        };
      }, [vol, caForm, bufForm]);

      return (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
             <div>
                <label className="label">Объем растворов (л)</label>
                <input type="number" value={vol} onChange={(e) => setVol(e.target.value)} className="input-field" />
             </div>
             <div>
                <label className="label">Форма Кальция</label>
                <select value={caForm} onChange={(e) => setCaForm(e.target.value)} className="input-field">
                  {Object.entries(CALC_DATA.balling.ca).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
             </div>
             <div>
                <label className="label">Форма Буфера</label>
                <select value={bufForm} onChange={(e) => setBufForm(e.target.value)} className="input-field">
                  {Object.entries(CALC_DATA.balling.buffer).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
             </div>
          </div>
          <div className="space-y-2">
            <div className="result-card flex justify-between items-center">
              <span className="text-sm text-slate-300">Канистра 1 (Ca)</span>
              <span className="font-bold text-cyan-400">{results.ca} г</span>
            </div>
            <div className="result-card flex justify-between items-center">
              <span className="text-sm text-slate-300">Канистра 2 (Kh)</span>
              <span className="font-bold text-cyan-400">{results.buf} г</span>
            </div>
             <div className="result-card flex justify-between items-center">
              <span className="text-sm text-slate-300">Канистра 3 (Соль без NaCl)</span>
              <span className="font-bold text-cyan-400">{results.salt} г</span>
            </div>
          </div>
        </div>
      );
    };

    const VolumeCalc = () => {
      const [l, setL] = useState(100);
      const [w, setW] = useState(50);
      const [h, setH] = useState(50);
      const [thick, setThick] = useState(10); // mm
      const [drop, setDrop] = useState(30); // mm water drop

      const vol = useMemo(() => {
        // External Vol
        const extL = l / 10; // cm
        const extW = w / 10;
        const extH = h / 10;
        const extVol = (extL * extW * extH) / 1000 * 1000; // ml -> L (wait, cm*cm*cm = ml. /1000 = L)
        
        // Inner Vol
        const tCm = thick / 10;
        const dropCm = drop / 10;
        const inL = extL - (tCm * 2);
        const inW = extW - (tCm * 2);
        const inH = extH - tCm; // bottom only
        const waterH = inH - dropCm;
        
        return {
          ext: Math.round(extL * extW * extH / 1000),
          water: Math.round(inL * inW * waterH / 1000)
        }
      }, [l, w, h, thick, drop]);

      return (
        <div className="space-y-4 animate-fadeIn">
           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 grid grid-cols-2 gap-4">
              <div><label className="label">Длина (мм)</label><input type="number" value={l} onChange={(e) => setL(e.target.value)} className="input-field" /></div>
              <div><label className="label">Ширина (мм)</label><input type="number" value={w} onChange={(e) => setW(e.target.value)} className="input-field" /></div>
              <div><label className="label">Высота (мм)</label><input type="number" value={h} onChange={(e) => setH(e.target.value)} className="input-field" /></div>
              <div><label className="label">Стекло (мм)</label><input type="number" value={thick} onChange={(e) => setThick(e.target.value)} className="input-field" /></div>
              <div className="col-span-2"><label className="label">Недолив до края (мм)</label><input type="number" value={drop} onChange={(e) => setDrop(e.target.value)} className="input-field" /></div>
           </div>
           <div className="grid grid-cols-2 gap-3">
             <div className="result-card text-center">
               <div className="text-xs text-slate-400">Габариты</div>
               <div className="text-xl font-bold text-white">{vol.ext} л</div>
             </div>
             <div className="result-card text-center border-cyan-500/30 bg-cyan-900/10">
               <div className="text-xs text-cyan-300">Воды</div>
               <div className="text-xl font-bold text-cyan-400">{vol.water} л</div>
             </div>
           </div>
        </div>
      );
    };

    const GravelCalc = () => {
      const [l, setL] = useState(100); // cm
      const [w, setW] = useState(50); // cm
      const [h, setH] = useState(3); // cm thickness
      const [type, setType] = useState('caribsea');

      const result = useMemo(() => {
        // Vol in Liters = cm*cm*cm / 1000
        const volL = (l * w * h) / 1000;
        // Mass = Vol * Density (lbs/gal -> convert to kg/l roughly?)
        // Density in code is lbs/gal. 1 lbs/gal = 0.1198 kg/L.
        // Let's use density relative to water (~1kg/L).
        // Sand usually 1.4-1.6 kg/L.
        // The doc has density: caribsea 13.9 lbs/gal = ~1.66 kg/L
        const densityMap = {
          'arbitrary': 1.4,
          'caribsea': 1.6,
          'quartz': 1.5,
          'marble': 2.6
        };
        const mass = volL * densityMap[type];
        return { vol: volL.toFixed(1), mass: mass.toFixed(1) };
      }, [l, w, h, type]);

      return (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <label className="label">Тип грунта</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
                {Object.entries(CALC_DATA.gravel).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-4">
               <div><label className="label">Длина дна (см)</label><input type="number" value={l} onChange={(e) => setL(e.target.value)} className="input-field" /></div>
               <div><label className="label">Ширина (см)</label><input type="number" value={w} onChange={(e) => setW(e.target.value)} className="input-field" /></div>
               <div className="col-span-2"><label className="label">Толщина слоя (см)</label><input type="number" value={h} onChange={(e) => setH(e.target.value)} className="input-field" /></div>
            </div>
          </div>
          <div className="result-card flex justify-between">
            <div>
              <div className="text-xs text-slate-400">Объем</div>
              <div className="text-xl font-bold text-white">{result.vol} л</div>
            </div>
             <div className="text-right">
              <div className="text-xs text-slate-400">Вес</div>
              <div className="text-xl font-bold text-cyan-400">{result.mass} кг</div>
            </div>
          </div>
        </div>
      );
    }

    // Меню выбора калькулятора
    if (!selectedTool) {
      const tools = [
        { id: 'kh', name: 'Поднятие KH', icon: Activity, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { id: 'ca', name: 'Поднятие Ca', icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { id: 'mg', name: 'Поднятие Mg', icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
        { id: 'balling', name: 'Баллинг Метод', icon: Beaker, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        { id: 'volume', name: 'Объем аквариума', icon: Box, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        { id: 'gravel', name: 'Калькулятор грунта', icon: Layers, color: 'text-amber-600', bg: 'bg-amber-600/10' },
      ];

      return (
        <div className="pb-24 animate-fadeIn">
          <h2 className="text-2xl font-bold text-white mb-6">Инструменты</h2>
          <div className="grid grid-cols-2 gap-3">
            {tools.map(tool => (
              <button 
                key={tool.id}
                onClick={() => setSelectedTool(tool.id)}
                className={`p-4 rounded-xl border border-slate-700/50 ${tool.bg} hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-3 aspect-square`}
              >
                <tool.icon size={32} className={tool.color} />
                <span className="text-sm font-bold text-slate-200 text-center">{tool.name}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Экран конкретного калькулятора
    return (
      <div className="pb-24 animate-fadeIn">
        <button 
          onClick={() => setSelectedTool(null)}
          className="flex items-center gap-2 text-cyan-400 mb-4 font-medium hover:text-cyan-300"
        >
          <ArrowLeft size={20} /> Назад к списку
        </button>
        <h2 className="text-xl font-bold text-white mb-6">
          {selectedTool === 'kh' && 'Калькулятор KH'}
          {selectedTool === 'ca' && 'Калькулятор Кальция'}
          {selectedTool === 'mg' && 'Калькулятор Магния'}
          {selectedTool === 'balling' && 'Метод Баллинга'}
          {selectedTool === 'volume' && 'Расчет Объема'}
          {selectedTool === 'gravel' && 'Расчет Грунта'}
        </h2>
        
        {selectedTool === 'kh' && <KHCalc />}
        {selectedTool === 'ca' && <CaCalc />}
        {selectedTool === 'mg' && <MgCalc />}
        {selectedTool === 'balling' && <BallingCalc />}
        {selectedTool === 'volume' && <VolumeCalc />}
        {selectedTool === 'gravel' && <GravelCalc />}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
      
      {/* Стили для полей ввода (глобальные для компонента) */}
      <style>{`
        .input-field {
          width: 100%;
          background: #0f172a;
          border: 1px solid #334155;
          color: white;
          padding: 12px;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-field:focus {
          border-color: #06b6d4;
        }
        .label {
          display: block;
          font-size: 0.75rem;
          text-transform: uppercase;
          font-weight: 700;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .result-card {
          background: #1e293b;
          border: 1px solid #334155;
          padding: 16px;
          border-radius: 12px;
        }
      `}</style>

      {/* Контентная область с прокруткой */}
      <main className="max-w-md mx-auto min-h-screen relative p-5">
        
        {/* Верхняя шапка */}
        {activeTab !== 'dashboard' && (
          <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-slate-950 to-transparent pointer-events-none z-10" />
        )}

        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'parameters' && <ParametersView />}
        {activeTab === 'livestock' && <LivestockView />}
        {activeTab === 'calculators' && <CalculatorsView />}

      </main>

      {/* Нижняя навигация */}
      <nav className="fixed bottom-0 left-0 w-full bg-slate-900/90 backdrop-blur-md border-t border-slate-800 pb-safe z-50">
        <div className="max-w-md mx-auto flex justify-around items-center px-2">
          <NavItem icon={Activity} label="Мой Риф" id="dashboard" />
          <NavItem icon={Droplets} label="Тесты" id="parameters" />
          <NavItem icon={Fish} label="Кораллы" id="livestock" />
          <NavItem icon={Calculator} label="Тулзы" id="calculators" />
        </div>
      </nav>

    </div>
  );
}