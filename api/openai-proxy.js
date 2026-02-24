export default async function handler(req, res) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ключ хранится ТОЛЬКО на сервере Vercel (безопасно!)
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ 
      error: 'API ключ не настроен на сервере. Добавьте OPENAI_API_KEY в Environment Variables.' 
    });
  }

  try {
    const { messages, model, max_tokens } = req.body;

    console.log('🔍 Прокси: отправка запроса к OpenAI...');

    // Делаем запрос к OpenAI от имени СЕРВЕРА
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        messages,
        model: model || 'gpt-4o',
        max_tokens: max_tokens || 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ OpenAI Error:', errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'OpenAI API error' 
      });
    }

    const data = await response.json();
    console.log('✅ OpenAI успех!');

    // Возвращаем результат (БЕЗ ключа!)
    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Proxy Error:', error);
    return res.status(500).json({ 
      error: `Ошибка прокси: ${error.message}` 
    });
  }
}

const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimit.get(ip) || [];
  
  // Оставляем только запросы за последний час
  const recentRequests = userRequests.filter(time => now - time < 3600000);
  
  // Максимум 20 запросов в час на IP
  if (recentRequests.length >= 20) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(ip, recentRequests);
  return true;
}
