export default async function handler(req, res) {
  // 1. Настройка CORS заголовков
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 2. Обработка предварительного запроса браузера (Preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Проверка метода запроса
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. Получение секретного ключа из переменных окружения Vercel
    // В панели Vercel (Settings -> Environment Variables) вы должны добавить переменную "gpt"
    const apiKey = process.env.gpt;

    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured on the server.' });
    }

    // 5. Пересылка запроса в OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // 6. Возврат ответа клиенту
    return res.status(response.status).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}