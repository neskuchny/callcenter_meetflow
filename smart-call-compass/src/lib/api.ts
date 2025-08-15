import { Call } from '@/components/calls/CallsTable';

// Базовый URL API 
// Настройка для использования реального API
const USE_MOCK_DATA = false;  // Для работы с реальным API
const API_URL = 'http://localhost:5000/api';

// Ключи для localStorage
const STORAGE_KEYS = {
  ANALYZED_CALLS: 'smart-call-compass-analyzed-calls',
};

// Функции для работы с сохраненными результатами анализа
export function saveAnalyzedCalls(calls: Call[]): void {
  try {
    // Проверяем наличие localStorage
    if (typeof window === 'undefined' || !window.localStorage) {
      console.error('localStorage не доступен');
      return;
    }

    // Получаем существующие проанализированные звонки
    const existingCalls = getAnalyzedCalls();
    
    // Создаем Map для быстрого доступа к существующим звонкам по ID
    const existingCallsMap = new Map(existingCalls.map(call => [call.id, call]));
    
    // Обновляем существующие звонки новыми данными
    calls.forEach(call => {
      if (call.id) {
        existingCallsMap.set(call.id, call);
      }
    });
    
    // Преобразуем Map обратно в массив для сохранения
    const mergedCalls = Array.from(existingCallsMap.values());
    
    // Сохраняем объединенные данные в localStorage
    localStorage.setItem(STORAGE_KEYS.ANALYZED_CALLS, JSON.stringify(mergedCalls));
    
    console.log(`Сохранено ${calls.length} проанализированных звонков, всего в хранилище ${mergedCalls.length} звонков`);
    
    // Отправляем событие обновления дашборда
    try {
      const updateEvent = new CustomEvent('dashboard-update', {
        detail: { calls: mergedCalls }
      });
      window.dispatchEvent(updateEvent);
      console.log('Отправлено событие обновления дашборда');
    } catch (e) {
      console.error('Ошибка при отправке события обновления дашборда:', e);
    }
  } catch (error) {
    console.error('Ошибка при сохранении проанализированных звонков:', error);
  }
}

export const getAnalyzedCalls = (): Call[] => {
  try {
    const savedCallsJson = localStorage.getItem(STORAGE_KEYS.ANALYZED_CALLS);
    if (!savedCallsJson) return [];
    
    const savedCalls = JSON.parse(savedCallsJson);
    console.log(`Загружено ${savedCalls.length} проанализированных звонков из localStorage`);
    return savedCalls;
  } catch (error) {
    console.error('Ошибка при загрузке проанализированных звонков:', error);
    return [];
  }
};

// Очистка сохраненных звонков
export const clearAnalyzedCalls = () => {
  localStorage.removeItem(STORAGE_KEYS.ANALYZED_CALLS);
  console.log('Очищены сохраненные проанализированные звонки');
};

// Моковые данные для тестирования
const MOCK_CALLS: Call[] = [
  {
    id: "1",
    agent: "Оператор 1",
    customer: "79123456789",
    date: "01.01.2025",
    time: "10:15",
    duration: "3м 45с",
    status: "успешный",
    purpose: "Консультация по товару",
    transcription: "Клиент: Здравствуйте, меня интересует ваш товар.\nОператор: Здравствуйте, чем могу помочь?",
    recordUrl: "https://example.com/record/1",
    tag: "groq",
    aiSummary: "Клиент заинтересован в товаре, получил консультацию.",
    keyInsight: "Клиент готов к покупке, требуется дополнительная информация",
    recommendation: "Предложить скидку при быстром оформлении заказа",
    score: 8
  },
  {
    id: "2",
    agent: "Оператор 2",
    customer: "79234567890",
    date: "02.01.2025",
    time: "11:30",
    duration: "2м 15с",
    status: "неуспешный",
    purpose: "Возврат товара",
    transcription: "-",
    recordUrl: "https://example.com/record/2",
    aiSummary: "",
    keyInsight: "",
    recommendation: "",
    score: 0
  },
  {
    id: "3",
    agent: "Оператор 3",
    customer: "79345678901",
    date: "03.01.2025",
    time: "14:20",
    duration: "5м 30с",
    status: "требует внимания",
    purpose: "Техническая поддержка",
    transcription: "Клиент: У меня проблема с устройством.\nОператор: Давайте попробуем перезагрузить.",
    recordUrl: "https://example.com/record/3",
    tag: "groq",
    aiSummary: "Клиент обратился с технической проблемой, решение не найдено.",
    keyInsight: "Требуется эскалация запроса на техническую поддержку второго уровня",
    recommendation: "Улучшить скрипт диагностики технических проблем",
    score: 4
  }
];

// Интерфейсы для запросов и ответов
interface ApiResponse<T> {
  calls?: T[];
  message?: string;
  error?: string;
  success?: number;
  failed?: number;
}

interface AnalyzeRequest {
  callIds: string[];
}

interface TranscribeRequest {
  callIds: string[];
  forceRetranscribe?: boolean;
}

interface TranscribeResponse {
  calls: {
    id: string;
    transcription: string;
    status: string;
  }[];
  message?: string;
}

// Получение списка звонков
export async function fetchCalls(source: 'all' | 'cloud' | 'local' = 'all'): Promise<Call[]> {
  if (USE_MOCK_DATA) {
    console.log('Используются тестовые данные вместо API');
    return Promise.resolve(MOCK_CALLS);
  }

  try {
    const url = source === 'all' ? `${API_URL}/calls` : `${API_URL}/calls?source=${source}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: ApiResponse<Call> = await response.json();
    
    // Преобразуем JSON-строки тегов в массивы
    const processedCalls = (data.calls || []).map(call => {
      // Создаем копию звонка, чтобы не изменять оригинал
      const resultCall = {...call} as Call;
      
      // Обработка тегов в формате строки JSON
      if (resultCall.tags && typeof resultCall.tags === 'string') {
        try {
          // Пробуем распарсить JSON-строку
          const parsedTagsData = JSON.parse(resultCall.tags as unknown as string);
          // Устанавливаем значение tags как массив
          resultCall.tags = Array.isArray(parsedTagsData) ? parsedTagsData : [parsedTagsData];
        } catch (e) {
          console.warn(`Не удалось разобрать JSON-теги для звонка ${resultCall.id}: ${e}`);
          // В случае ошибки, преобразуем строку в один тег
          const tagStr = resultCall.tags as unknown as string;
          resultCall.tags = [tagStr];
        }
      }
      
      // Если нет массива тегов, но есть тег, создаем массив tags
      if (!resultCall.tags && resultCall.tag) {
        resultCall.tags = [resultCall.tag];
      }
      
      return resultCall;
    });
    
    return processedCalls;
  } catch (error) {
    console.error('Error fetching calls:', error);
    return [];
  }
}

// Анализ выбранных звонков с помощью LLM
export async function analyzeCalls(callIds: string[], keyQuestions?: string[]): Promise<Call[]> {
  if (USE_MOCK_DATA) {
    // Имитация анализа с тестовыми данными
    const analyzed = MOCK_CALLS.filter(call => callIds.includes(call.id))
      .map(call => {
        if (!call.aiSummary) {
          return {
            ...call,
            aiSummary: "Тестовая сводка звонка после анализа",
            keyInsight: "Главный вывод из анализа тестового звонка",
            recommendation: "Рекомендация для улучшения взаимодействия",
            score: Math.floor(Math.random() * 10) + 1,
            // Добавляем тестовые ответы на ключевые вопросы, если они есть
            ...(keyQuestions && keyQuestions.length >= 1 ? { keyQuestion1Answer: "Тестовый ответ на вопрос 1" } : {}),
            ...(keyQuestions && keyQuestions.length >= 2 ? { keyQuestion2Answer: "Тестовый ответ на вопрос 2" } : {}),
            ...(keyQuestions && keyQuestions.length >= 3 ? { keyQuestion3Answer: "Тестовый ответ на вопрос 3" } : {})
          };
        }
        return call;
      });
    
    // Сохраняем результаты анализа в localStorage
    saveAnalyzedCalls(analyzed);
    
    return Promise.resolve(analyzed);
  }

  try {
    const response = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        callIds,
        keyQuestions: keyQuestions || [] 
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: ApiResponse<Call> = await response.json();
    const analyzedCalls = data.calls || [];
    
    if (analyzedCalls.length > 0) {
      // Получаем существующие проанализированные звонки
      const existingCalls = getAnalyzedCalls();
      
      // Создаем Map для быстрого поиска по ID
      const callsMap = new Map(existingCalls.map(call => [call.id, call]));
      
      // Загружаем все текущие звонки, чтобы получить их полные данные
      const allCalls = await fetchCalls();
      const allCallsMap = new Map(allCalls.map(call => [call.id, call]));
      
      // Добавляем или обновляем звонки, сохраняя все поля исходного звонка
      analyzedCalls.forEach(analyzedCall => {
        // Получаем полную версию звонка из всех загруженных звонков
        const originalCall = allCallsMap.get(analyzedCall.id);
        
        if (originalCall) {
          // Объединяем исходные данные звонка с результатами анализа
          const updatedCall = {
            ...originalCall,  // Сохраняем все поля исходного звонка 
            // Обновляем поля анализа
            aiSummary: analyzedCall.aiSummary || originalCall.aiSummary,
            keyInsight: analyzedCall.keyInsight || originalCall.keyInsight,
            recommendation: analyzedCall.recommendation || originalCall.recommendation,
            score: analyzedCall.score || originalCall.score,
            callType: analyzedCall.callType || originalCall.callType,
            callResult: analyzedCall.callResult || originalCall.callResult,
            status: analyzedCall.status || originalCall.status,
            clientInterests: analyzedCall.clientInterests || originalCall.clientInterests,
            decisionFactors: analyzedCall.decisionFactors || originalCall.decisionFactors,
            tags: analyzedCall.tags || originalCall.tags,
            managerPerformance: analyzedCall.managerPerformance || originalCall.managerPerformance,
            customerPotential: analyzedCall.customerPotential || originalCall.customerPotential,
            objections: analyzedCall.objections || originalCall.objections,
            supportingQuote: analyzedCall.supportingQuote || originalCall.supportingQuote,
            
            // Добавляем ответы на ключевые вопросы, если они есть
            ...(analyzedCall.keyQuestion1Answer ? { keyQuestion1Answer: analyzedCall.keyQuestion1Answer } : {}),
            ...(analyzedCall.keyQuestion2Answer ? { keyQuestion2Answer: analyzedCall.keyQuestion2Answer } : {}),
            ...(analyzedCall.keyQuestion3Answer ? { keyQuestion3Answer: analyzedCall.keyQuestion3Answer } : {})
          };
          
          callsMap.set(analyzedCall.id, updatedCall);
        } else {
          // Если оригинал не найден, просто сохраняем результат анализа
          callsMap.set(analyzedCall.id, analyzedCall);
        }
      });
      
      // Преобразуем Map обратно в массив и сохраняем
      const updatedCalls = Array.from(callsMap.values());
      saveAnalyzedCalls(updatedCalls);
      
      console.log(`Сохранено ${analyzedCalls.length} проанализированных звонков с полными данными`);
    }
    
    return analyzedCalls;
  } catch (error) {
    console.error('Error analyzing calls:', error);
    return [];
  }
}

// Транскрибация выбранных звонков
export async function transcribeCalls(callIds: string[], forceRetranscribe: boolean = false): Promise<{
  id: string;
  transcription: string;
  status: string;
}[] & { message?: string }> {
  if (USE_MOCK_DATA) {
    // Имитация транскрибации с тестовыми данными
    const transcribed = MOCK_CALLS.filter(call => callIds.includes(call.id))
      .map(call => {
        return {
          id: call.id,
          transcription: call.transcription === "-" ? 
            "Это тестовая транскрипция, созданная для демонстрации. Оператор: Здравствуйте! Клиент: Добрый день." : 
            call.transcription,
          status: call.transcription === "-" ? "success" : "existing"
        };
      });
    
    // Имитация сообщения о статусе
    const mockResult = transcribed as typeof transcribed & { message?: string };
    mockResult.message = `Обработано ${transcribed.length} звонков (мок режим)`;
    
    return Promise.resolve(mockResult);
  }

  try {
    const response = await fetch(`${API_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callIds, forceRetranscribe }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: TranscribeResponse = await response.json();
    
    // Создаем объект типа array + дополнительное свойство message
    const result = data.calls as typeof data.calls & { message?: string };
    result.message = data.message;
    
    return result;
  } catch (error) {
    console.error('Error transcribing calls:', error);
    return [];
  }
}

// Обработка всего Excel файла
export async function processAllCalls(): Promise<{
  message: string;
  success?: number;
  failed?: number;
}> {
  if (USE_MOCK_DATA) {
    // Имитация обработки с тестовыми данными
    return Promise.resolve({
      message: 'Успешно обработано 3 тестовых звонка',
      success: 3,
      failed: 0
    });
  }

  try {
    const response = await fetch(`${API_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      message: data.message || 'Обработка завершена',
      success: data.success,
      failed: data.failed,
    };
  } catch (error) {
    console.error('Error processing calls:', error);
    return {
      message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    };
  }
}

// Загрузка файла Excel
export async function uploadFile(file: File): Promise<{
  message?: string;
  warning?: string;
  rows?: number;
  transcribe_count?: number;
  filename?: string;
  error?: string;
}> {
  try {
    console.log(`Начало загрузки файла: ${file.name} (${(file.size / 1024).toFixed(2)} КБ)`);
    
    // Проверяем тип файла
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== 'xlsx' && fileExtension !== 'xls') {
      console.error('Неверный тип файла:', fileExtension);
      return {
        error: `Неверный тип файла. Ожидается .xlsx или .xls, получен .${fileExtension}`,
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    // Добавляем таймаут для запроса (30 секунд)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      // Очищаем таймаут, так как запрос выполнен
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ошибка загрузки файла:', response.status, errorText);
        throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Результат загрузки файла:', result);
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('Запрос превысил время ожидания (30 секунд)');
        return {
          error: 'Время ожидания истекло. Файл слишком большой или сервер перегружен.',
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    return {
      error: error instanceof Error ? error.message : 'Неизвестная ошибка при загрузке файла',
    };
  }
}

// Анализ звонков с пользовательским запросом
export async function customAnalyzeCalls(callIds: string[], prompt: string): Promise<Call[] & { availableTags?: string[] }> {
  if (USE_MOCK_DATA) {
    // Имитация анализа с тестовыми данными
    const analyzed = MOCK_CALLS.filter(call => callIds.includes(call.id))
      .map(call => {
        return {
          ...call,
          aiSummary: `Анализ по запросу: "${prompt}"`,
          keyInsight: "Ключевой вывод по пользовательскому запросу",
          recommendation: "Рекомендация на основе пользовательского запроса",
          score: Math.floor(Math.random() * 10) + 1,
          tags: ["тег1", "тег2", prompt.split(' ')[0]],
          customResponse: `Ответ на запрос '${prompt}': Звонок прошел успешно, клиент получил информацию по запрашиваемому продукту.`
        };
      });
    
    // Сохраняем результаты пользовательского анализа
    saveAnalyzedCalls(analyzed);
    
    // Добавляем доступные теги для моков
    const result = analyzed as typeof analyzed & { availableTags?: string[] };
    result.availableTags = ['консультация', 'продажа', 'техподдержка', 'жалоба', 'тестовый_тег', 'тег1', 'тег2'];
    
    return Promise.resolve(result);
  }

  try {
    const response = await fetch(`${API_URL}/custom-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        callIds,
        prompt
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: {
      result: string; 
      calls: Call[]; 
      availableTags?: string[];
    } = await response.json();
    
    const customAnalyzedCalls = data.calls || [];
    
    // Логируем результаты для отладки
    console.log(`Получены результаты анализа ${customAnalyzedCalls.length} звонков:`, data);
    
    if (customAnalyzedCalls.length > 0) {
      // Проверяем, что в каждом результате есть поле customResponse
      const enhancedCalls = customAnalyzedCalls.map(call => {
        if (!call.customResponse) {
          return {
            ...call,
            customResponse: `Ответ на запрос '${prompt}': ${call.keyInsight || call.keyPoints || 'Информация не получена'}`
          };
        }
        return call;
      });
      
      // Получаем существующие проанализированные звонки
      const existingCalls = getAnalyzedCalls();
      
      // Создаем Map для быстрого доступа по ID
      const callsMap = new Map(existingCalls.map(call => [call.id, call]));

      // Загружаем все текущие звонки, чтобы получить их полные данные
      const allCalls = await fetchCalls();
      const allCallsMap = new Map(allCalls.map(call => [call.id, call]));
      
      // Добавляем или обновляем звонки с пометкой о пользовательском анализе
      enhancedCalls.forEach(analyzedCall => {
        // Получаем полную версию звонка из всех загруженных звонков
        const originalCall = allCallsMap.get(analyzedCall.id);
        
        if (originalCall) {
          // Объединяем исходные данные звонка с результатами анализа
          const updatedCall = {
            ...originalCall, // Сохраняем все поля исходного звонка
            // Обновляем поля анализа
            aiSummary: analyzedCall.aiSummary || originalCall.aiSummary,
            keyInsight: analyzedCall.keyInsight || originalCall.keyInsight,
            recommendation: analyzedCall.recommendation || originalCall.recommendation,
            score: analyzedCall.score || originalCall.score,
            callType: analyzedCall.callType || originalCall.callType,
            callResult: analyzedCall.callResult || originalCall.callResult,
            status: analyzedCall.status || originalCall.status,
            clientInterests: analyzedCall.clientInterests || originalCall.clientInterests,
            decisionFactors: analyzedCall.decisionFactors || originalCall.decisionFactors,
            tags: analyzedCall.tags || originalCall.tags,
            managerPerformance: analyzedCall.managerPerformance || originalCall.managerPerformance,
            customerPotential: analyzedCall.customerPotential || originalCall.customerPotential,
            objections: analyzedCall.objections || originalCall.objections,
            supportingQuote: analyzedCall.supportingQuote || originalCall.supportingQuote,
            customResponse: analyzedCall.customResponse,
            
            // Добавляем метаданные о пользовательском анализе
            _customAnalyzed: true,
            _customPrompt: prompt,
          };
          
          callsMap.set(analyzedCall.id, updatedCall);
        } else {
          // Если оригинал не найден, просто сохраняем результат анализа с метаданными
          const enhancedCall = {
            ...analyzedCall,
            _customAnalyzed: true,
            _customPrompt: prompt,
          };
          callsMap.set(analyzedCall.id, enhancedCall);
        }
      });
      
      // Преобразуем Map обратно в массив и сохраняем
      const updatedCalls = Array.from(callsMap.values());
      saveAnalyzedCalls(updatedCalls);
      
      console.log(`Сохранено ${enhancedCalls.length} проанализированных звонков с полными данными (пользовательский анализ)`);
      
      // Добавляем доступные теги к результату если они есть
      const result = enhancedCalls as typeof enhancedCalls & { availableTags?: string[] };
      if (data.availableTags) {
        result.availableTags = data.availableTags;
      }
      
      return result;
    }
    
    return [];
  } catch (error) {
    console.error('Error analyzing calls with custom prompt:', error);
    return [];
  }
}

// Функция для отправки сообщения в чат и получения ответа
export const sendChatMessage = async (message: string, filters: Record<string, any>, dataSource?: 'all' | 'cloud' | 'local'): Promise<{ reply: string, availableTags?: string[] }> => {
  if (USE_MOCK_DATA) {
    console.log("Chat message (mock):", message, "Filters:", filters);
    // Простая логика для мок-ответа
    const numFiltered = Math.floor(Math.random() * 10) + 1;
    let reply = `Получено сообщение (мок): '${message}' по ${numFiltered} отфильтрованным звонкам.`
    
    // Показываем применённые фильтры
    const activeFilters = [];
    if (filters.status) activeFilters.push(`статус: ${filters.status}`);
    if (filters.operator) activeFilters.push(`оператор: ${filters.operator}`);
    if (filters.date) activeFilters.push(`дата: ${filters.date}`);
    if (filters.duration) {
      const durationMap: Record<string, string> = {
        'short': 'короткие (до 1 мин)',
        'medium': 'средние (1-3 мин)',
        'long': 'длинные (более 3 мин)'
      };
      activeFilters.push(`длительность: ${durationMap[filters.duration] || filters.duration}`);
    }
    if (filters.tags && filters.tags.length) {
      activeFilters.push(`теги: ${filters.tags.join(', ')}`);
    }
    
    if (activeFilters.length) {
      reply += ` Применённые фильтры: ${activeFilters.join('; ')}.`;
    }
    
    if (message.toLowerCase().includes("статистика")) {
      reply += ` Из них ${Math.floor(Math.random() * numFiltered)} успешных (мок).`
    } else if (message.toLowerCase().includes("транскрипция")) {
      reply += ` Первая транскрипция (мок): ...`
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Имитация задержки
    return { 
      reply,
      // Мок-теги для тестирования
      availableTags: ['консультация', 'продажа', 'техподдержка', 'жалоба', 'тестовый_тег']
    };
  }

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        filters,
        dataSource: dataSource || 'all'
      })
    });

    if (!response.ok) {
      throw new Error(`Ошибка API: ${response.statusText}`);
    }

    const data = await response.json();
    // Возвращаем reply и availableTags если они есть в ответе
    return {
      reply: data.reply,
      availableTags: data.availableTags
    };
  } catch (error) {
    console.error("Error sending chat message:", error);
    throw error;
  }
};

// Интерфейс для данных предварительного анализа
export interface PreviewAnalysisResult {
  previewReport: string;
  llmAdvice: string;
  keyQuestions: string[];
  error?: string;
}

// Выполнение предварительного анализа звонков
export async function previewAnalyzeCalls(calls?: Call[]): Promise<PreviewAnalysisResult> {
  if (USE_MOCK_DATA) {
    // Возвращаем моковые данные для тестирования
    return {
      previewReport: "Это тестовые звонки отдела продаж компании, предлагающей программное обеспечение для управления бизнесом. Звонки совершаются менеджерами компании потенциальным клиентам с целью презентации продукта и назначения демонстрации. Продукт представляет собой CRM-систему с модулями аналитики и управления задачами.",
      llmAdvice: "Рекомендуется в первую очередь проанализировать эффективность работы с возражениями клиентов, особенно по цене. Также стоит обратить внимание на процент конверсии звонков в демонстрации и на качество презентации преимуществ продукта.",
      keyQuestions: [
        "Как работают с ценовыми возражениями?",
        "Как часто конвертируют в демонстрацию?",
        "Какие ключевые преимущества упоминаются?"
      ]
    };
  }

  try {
    const response = await fetch(`${API_URL}/preview-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calls ? { calls } : {}),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data as PreviewAnalysisResult;
  } catch (error) {
    console.error('Error performing preview analysis:', error);
    return {
      previewReport: "Не удалось выполнить предварительный анализ.",
      llmAdvice: "Пожалуйста, проверьте наличие транскрипций и повторите попытку позже.",
      keyQuestions: [
        "Что повышает успешность звонка?",
        "Какие возражения встречаются чаще всего?",
        "Как улучшить скрипт разговора?"
      ],
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

// Импорт аудиофайлов из локальной папки
export async function importFromFolder(options: {
  extensions?: string[];
  limit?: number;
  transcribe?: boolean;
  analyze?: boolean;
}): Promise<{
  success: boolean;
  imported: number;
  transcribed: number;
  analyzed: number;
  total_found: number;
  error?: string;
}> {
  if (USE_MOCK_DATA) {
    return {
      success: true,
      imported: 5,
      transcribed: 3,
      analyzed: 2,
      total_found: 10
    };
  }

  try {
    const response = await fetch(`${API_URL}/import-folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error importing from folder:', error);
    return {
      success: false,
      imported: 0,
      transcribed: 0,
      analyzed: 0,
      total_found: 0,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
} 