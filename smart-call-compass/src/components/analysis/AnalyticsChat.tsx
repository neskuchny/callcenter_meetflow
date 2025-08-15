import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Brain, Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Call } from "@/components/calls/CallsTable";
import { fetchCalls } from "@/lib/api";
import { globalState, EVENTS, CallsUpdatedEvent, DataSourceChangedEvent, AnalysisCompletedEvent } from "@/lib/globalState";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

// Компонент ErrorBoundary для обработки ошибок рендеринга
class ErrorBoundary extends Component<{children: ReactNode, fallback?: ReactNode}> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error in component:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 border rounded bg-red-50 text-red-500">
          <h3 className="font-medium">Не удалось отобразить компонент</h3>
          <p className="text-sm">Произошла ошибка при отображении элемента</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Простой компонент выбора даты как запасной вариант
const SimpleDatePicker = ({ value, onChange }: { value: Date | undefined, onChange: (date: Date | undefined) => void }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm">Выберите дату:</div>
      <input 
        type="date" 
        value={value ? format(value, "yyyy-MM-dd") : ''} 
        onChange={(e) => {
          const date = e.target.value ? new Date(e.target.value) : undefined;
          onChange(date);
        }}
        className="px-3 py-2 border rounded"
      />
    </div>
  );
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface AnalyticsChatProps {
  dashboardData?: any;
}

const AnalyticsChat: React.FC<AnalyticsChatProps> = ({ dashboardData }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Привет! Я аналитический ассистент. Я могу помочь вам проанализировать звонки, ответить на вопросы о транскрипциях и статистике. Что бы вы хотели узнать?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Состояния для фильтров
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [operatorFilter, setOperatorFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [durationFilter, setDurationFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  
  // Уникальные операторы и статусы
  const [uniqueOperators, setUniqueOperators] = useState<string[]>([]);
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>([]);
  const [uniqueTags, setUniqueTags] = useState<string[]>([]);

  // Загрузка звонков при монтировании компонента
  useEffect(() => {
    async function loadCalls(useGlobalState = true) {
      try {
        let callsData: Call[];
        
        // Пробуем загрузить из глобального состояния
        if (useGlobalState) {
          const currentCalls = globalState.getCurrentCalls();
          if (currentCalls.length > 0) {
            console.log('💬 AnalyticsChat: Используем данные из глобального состояния');
            callsData = currentCalls;
          } else {
            // Если нет данных в глобальном состоянии, загружаем из API
            callsData = await fetchCalls();
          }
        } else {
          callsData = await fetchCalls();
        }
        
        setCalls(callsData);
        setFilteredCalls(callsData);
        
        // Извлекаем уникальных операторов и статусы для фильтров
        const operators = Array.from(new Set(callsData.map(call => call.agent || "Неизвестно")));
        const statuses = Array.from(new Set(callsData.map(call => 
          call.callResult ? call.callResult : call.status || "Не определен"
        )));
        
        // Извлекаем уникальные теги из звонков
        const allTags: string[] = [];
        callsData.forEach(call => {
          if (call.tags && Array.isArray(call.tags)) {
            allTags.push(...call.tags);
          } else if (call.tag) {
            allTags.push(call.tag);
          }
        });
        const tags = Array.from(new Set(allTags)).filter(tag => tag && tag !== "");
        
        setUniqueOperators(operators);
        setUniqueStatuses(statuses);
        setUniqueTags(tags);
        setCallsLoaded(true);
      } catch (err) {
        console.error("Не удалось загрузить данные о звонках:", err);
      }
    }

    // Загружаем данные при монтировании
    loadCalls();

    // Добавляем слушатели событий глобального состояния
    const handleCallsUpdated = (event: CallsUpdatedEvent) => {
      console.log('💬 AnalyticsChat: Получено событие обновления звонков');
      const callsData = event.detail.calls;
      setCalls(callsData);
      setFilteredCalls(callsData);
      
      // Обновляем фильтры
      const operators = Array.from(new Set(callsData.map(call => call.agent || "Неизвестно")));
      const statuses = Array.from(new Set(callsData.map(call => 
        call.callResult ? call.callResult : call.status || "Не определен"
      )));
      const tags = Array.from(new Set(callsData.flatMap(call => 
        Array.isArray(call.tags) ? call.tags : []
      )));
      
      setUniqueOperators(operators);
      setUniqueStatuses(statuses);
      setUniqueTags(tags);
    };

    const handleDataSourceChanged = (event: DataSourceChangedEvent) => {
      console.log(`💬 AnalyticsChat: Источник данных изменен на ${event.detail.source}`);
      const callsData = event.detail.calls;
      setCalls(callsData);
      setFilteredCalls(callsData);
      
      // Сбрасываем фильтры при смене источника
      setStatusFilter("");
      setOperatorFilter("");
      setDateFilter(undefined);
      setDurationFilter("");
      setTagFilter("");
    };

    const handleAnalysisCompleted = (event: AnalysisCompletedEvent) => {
      console.log('💬 AnalyticsChat: Анализ завершен, обновляем данные чата');
      const callsData = event.detail.allCalls;
      setCalls(callsData);
      setFilteredCalls(callsData);
    };

    // Регистрируем слушатели
    window.addEventListener(EVENTS.CALLS_UPDATED, handleCallsUpdated as EventListener);
    window.addEventListener(EVENTS.DATA_SOURCE_CHANGED, handleDataSourceChanged as EventListener);
    window.addEventListener(EVENTS.ANALYSIS_COMPLETED, handleAnalysisCompleted as EventListener);

    // Удаляем слушатели при размонтировании
    return () => {
      window.removeEventListener(EVENTS.CALLS_UPDATED, handleCallsUpdated as EventListener);
      window.removeEventListener(EVENTS.DATA_SOURCE_CHANGED, handleDataSourceChanged as EventListener);
      window.removeEventListener(EVENTS.ANALYSIS_COMPLETED, handleAnalysisCompleted as EventListener);
    };
  }, []);

  // Применение фильтров при изменении
  useEffect(() => {
    if (!callsLoaded) return;
    
    try {
      let filtered = [...calls];
      
      // Фильтр по статусу
      if (statusFilter) {
        filtered = filtered.filter(call => {
          const status = call.callResult || call.status || "Не определен";
          return status.toLowerCase() === statusFilter.toLowerCase();
        });
      }
      
      // Фильтр по оператору
      if (operatorFilter) {
        filtered = filtered.filter(call => {
          const operator = call.agent || "Неизвестно";
          return operator.toLowerCase() === operatorFilter.toLowerCase();
        });
      }
      
      // Фильтр по дате с защитой от ошибок форматирования
      if (dateFilter) {
        try {
          const dateString = format(dateFilter, "dd.MM.yyyy");
          filtered = filtered.filter(call => call.date === dateString);
        } catch (err) {
          console.error("Ошибка при фильтрации по дате:", err);
          // Если не удалось отформатировать дату, не применяем фильтр
        }
      }
      
      // Фильтр по длительности звонка
      if (durationFilter) {
        filtered = filtered.filter(call => {
          if (!call.duration) return false;
          
          // Распарсим длительность в формате "Xм Yс" или числовом формате
          let minutes = 0;
          let seconds = 0;
          
          if (typeof call.duration === 'string') {
            const minMatch = call.duration.match(/(\d+)м/);
            const secMatch = call.duration.match(/(\d+)с/);
            
            if (minMatch) minutes = parseInt(minMatch[1], 10);
            if (secMatch) seconds = parseInt(secMatch[1], 10);
          } else if (typeof call.duration === 'number') {
            minutes = Math.floor(call.duration);
            seconds = Math.round((call.duration - minutes) * 60);
          }
          
          // Общая длительность в секундах
          const totalSeconds = minutes * 60 + seconds;
          
          // Применение фильтра в зависимости от выбранного диапазона
          switch (durationFilter) {
            case "short": // Короткие звонки (до 1 минуты)
              return totalSeconds < 60;
            case "medium": // Средние звонки (от 1 до 3 минут)
              return totalSeconds >= 60 && totalSeconds <= 180;
            case "long": // Длинные звонки (больше 3 минут)
              return totalSeconds > 180;
            default:
              return true;
          }
        });
      }
      
      // Фильтр по тегу
      if (tagFilter) {
        filtered = filtered.filter(call => {
          // Проверка на массив тегов
          if (call.tags && Array.isArray(call.tags)) {
            return call.tags.some(tag => 
              tag.toLowerCase() === tagFilter.toLowerCase()
            );
          }
          // Проверка на одиночный тег
          if (call.tag) {
            return call.tag.toLowerCase() === tagFilter.toLowerCase();
          }
          return false;
        });
      }
      
      setFilteredCalls(filtered);
    } catch (error) {
      console.error("Ошибка при применении фильтров:", error);
      // В случае ошибки сохраняем исходный список
      setFilteredCalls(calls);
    }
  }, [statusFilter, operatorFilter, dateFilter, durationFilter, tagFilter, calls, callsLoaded]);

  // Сброс фильтров
  const resetFilters = () => {
    setStatusFilter("");
    setOperatorFilter("");
    setDateFilter(undefined);
    setDurationFilter("");
    setTagFilter("");
  };

  // Прокрутка чата вниз при добавлении новых сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Обработка ввода пользователя
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Отправка сообщения
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Добавляем сообщение пользователя
    const userMessage: ChatMessage = {
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    // Добавляем индикатор загрузки для ассистента
    const loadingMessage: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Определяем, касается ли запрос конкретных звонков или статистики
      const isCallSpecificQuery = 
        inputValue.toLowerCase().includes("звонок") || 
        inputValue.toLowerCase().includes("разговор") || 
        inputValue.toLowerCase().includes("транскрипция");

      let response;
      let analyzedCalls;
      
      // Используем отфильтрованные звонки вместо первых N звонков
      const callsToAnalyze = filteredCalls.length > 0 ? filteredCalls : calls;
      // Берем максимум 5 звонков для анализа или меньше, если их меньше
      const selectedCalls = callsToAnalyze.slice(0, Math.min(5, callsToAnalyze.length));

      if (isCallSpecificQuery && selectedCalls.length > 0) {
        // Берем ID отфильтрованных звонков вместо первых N звонков
        const callIds = selectedCalls.map(call => call.id);
        
        // Отправляем запрос к API для анализа звонков используя fetch вместо axios
        response = await fetch("http://localhost:5000/api/custom-analyze", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callIds,
            prompt: inputValue
          })
        });
        
        const responseData = await response.json();
        analyzedCalls = responseData.calls;
        const overallSummary = responseData.result;
        
        // Формируем ответ на основе результатов анализа
        let assistantResponse = "";

        // Сначала добавляем общую сводку, если она есть
        if (overallSummary) {
          assistantResponse += `${overallSummary}\n\n`;
        }
        
        // Затем добавляем детали по каждому проанализированному звонку
        if (analyzedCalls && analyzedCalls.length > 0) {
          assistantResponse += `Детали по проанализированным звонкам:\n`;
          analyzedCalls.forEach((analyzedCall: any, index: number) => {
            // Пытаемся найти исходный звонок для получения доп. информации, если нужно
            const originalCall = calls.find(c => c.id === analyzedCall.id) || selectedCalls.find(c => c.id === analyzedCall.id);
            const callDetails = originalCall ? 
              `[ID: ${originalCall.id}, ${originalCall.date || "Дата не указана"}, ${originalCall.agent || "Оператор не указан"}, ${originalCall.status || originalCall.callResult || "Статус не указан"}]` : 
              `[ID: ${analyzedCall.id}]`;
            
            // Используем поле 'analysis' для отображения результата
            const analysisContent = typeof analyzedCall.analysis === 'string' ? analyzedCall.analysis : JSON.stringify(analyzedCall.analysis, null, 2);
            assistantResponse += `\n📞 **Звонок ${callDetails}**: \n${analysisContent || "Нет данных по анализу"}\n`;
          });
        } else if (!overallSummary) {
          // Если нет ни общей сводки, ни деталей по звонкам
          assistantResponse = "Не удалось получить детальный анализ по вашему запросу.";
        }

        // Удаляем сообщение с индикатором загрузки
        setMessages((prev) => prev.slice(0, -1));

        // Добавляем ответ ассистента
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: assistantResponse,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Для статистических запросов используем данные дашборда
        let assistantResponse = "";

        if (dashboardData) {
          // Примеры обработки различных типов вопросов о статистике
          if (inputValue.toLowerCase().includes("успешн")) {
            const successRate = dashboardData.successRate || "нет данных";
            assistantResponse = `📊 Процент успешных звонков: ${successRate}%`;
          } else if (inputValue.toLowerCase().includes("длительност")) {
            const avgDuration = dashboardData.avgDuration || "нет данных";
            assistantResponse = `⏱️ Средняя длительность звонков: ${avgDuration}`;
          } else if (inputValue.toLowerCase().includes("общ") && inputValue.toLowerCase().includes("статистик")) {
            assistantResponse = "📈 Общая статистика по звонкам:\n\n";
            
            if (dashboardData.totalCalls) 
              assistantResponse += `- Всего звонков: ${dashboardData.totalCalls}\n`;
            if (dashboardData.successRate) 
              assistantResponse += `- Успешных звонков: ${dashboardData.successRate}%\n`;
            if (dashboardData.unsuccessRate) 
              assistantResponse += `- Неуспешных звонков: ${dashboardData.unsuccessRate}%\n`;
            if (dashboardData.avgDuration) 
              assistantResponse += `- Средняя длительность: ${dashboardData.avgDuration}\n`;
          } else {
            // Для других запросов используем custom-analyze с отфильтрованными звонками
            const callIds = selectedCalls.map(call => call.id);
            
            response = await fetch("http://localhost:5000/api/custom-analyze", {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                callIds,
                prompt: `Проанализируй статистику и ответь на вопрос: ${inputValue}`
              })
            });
            
            const responseData = await response.json();
            analyzedCalls = responseData.calls;
            const summaryFromApi = responseData.result;
            let analysisDetailsFromApi = "";

            if (responseData.calls && responseData.calls.length > 0 && responseData.calls[0].analysis) {
                analysisDetailsFromApi = typeof responseData.calls[0].analysis === 'string' 
                    ? responseData.calls[0].analysis
                    : JSON.stringify(responseData.calls[0].analysis, null, 2);
            } else if (responseData.calls && responseData.calls.length > 0 && responseData.calls[0].customResponse) { // Fallback
                 analysisDetailsFromApi = responseData.calls[0].customResponse;
            }
            
            if (summaryFromApi) {
              assistantResponse = summaryFromApi;
              if(analysisDetailsFromApi && !summaryFromApi.includes(analysisDetailsFromApi.substring(0,50))) {
                 assistantResponse += `\n\nДополнительные детали: \n${analysisDetailsFromApi}`;
              }
            } else if (analysisDetailsFromApi){
              assistantResponse = analysisDetailsFromApi;
            }
            else {
              assistantResponse = "К сожалению, я не могу предоставить достаточно точную информацию по вашему запросу.";
            }
          }
        } else {
          // Если данные дашборда недоступны, используем только API
          const callIds = selectedCalls.map(call => call.id);
          
          response = await fetch("http://localhost:5000/api/custom-analyze", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              callIds,
              prompt: inputValue
            })
          });
          
          const responseData = await response.json();
          analyzedCalls = responseData.calls;
          const summaryFromApi = responseData.result;
          let analysisDetailsFromApi = "";

          if (responseData.calls && responseData.calls.length > 0 && responseData.calls[0].analysis) {
              analysisDetailsFromApi = typeof responseData.calls[0].analysis === 'string' 
                  ? responseData.calls[0].analysis
                  : JSON.stringify(responseData.calls[0].analysis, null, 2);
          } else if (responseData.calls && responseData.calls.length > 0 && responseData.calls[0].customResponse) { // Fallback
               analysisDetailsFromApi = responseData.calls[0].customResponse;
          }
          
          if (summaryFromApi) {
            assistantResponse = summaryFromApi;
            if(analysisDetailsFromApi && !summaryFromApi.includes(analysisDetailsFromApi.substring(0,50))) {
               assistantResponse += `\n\nДополнительные детали: \n${analysisDetailsFromApi}`;
            }
          } else if (analysisDetailsFromApi){
            assistantResponse = analysisDetailsFromApi;
          }
          else {
            assistantResponse = "К сожалению, я не могу предоставить достаточно точную информацию по вашему запросу.";
          }
        }

        // Удаляем сообщение с индикатором загрузки
        setMessages((prev) => prev.slice(0, -1));

        // Добавляем ответ ассистента
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: assistantResponse,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Ошибка при получении ответа:", error);
      
      // Удаляем сообщение с индикатором загрузки
      setMessages((prev) => prev.slice(0, -1));
      
      // Добавляем сообщение об ошибке
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Обработка нажатия Enter для отправки сообщения
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      handleSendMessage();
    }
  };

  // Форматирование сообщения (обработка переносов строк и маркдауна)
  const formatMessage = (message: string) => {
    // Обработка переносов строк
    const withLineBreaks = message.split("\n").map((line, i) => (
      <React.Fragment key={i}>
        {line}
        {i < message.split("\n").length - 1 && <br />}
      </React.Fragment>
    ));

    return withLineBreaks;
  };

  // Генерация временной метки сообщения
  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Обновляем обработчик выбора даты для защиты от некорректных дат
  const handleDateSelect = (date: Date | undefined) => {
    try {
      if (date && isNaN(date.getTime())) {
        console.error("Некорректная дата:", date);
        return; // Игнорируем некорректные даты
      }
      setDateFilter(date);
    } catch (error) {
      console.error("Ошибка при выборе даты:", error);
    }
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Аналитический чат</CardTitle>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {showFilters ? "Скрыть фильтры" : "Показать фильтры"}
          </Button>
        </div>
        
        {/* Панель фильтров */}
        {showFilters && (
          <div className="mt-4 p-3 bg-slate-50 rounded-md flex flex-wrap gap-3 items-center">
            {/* Фильтр по статусу */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Статус звонка</span>
              <ErrorBoundary>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Все статусы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все статусы</SelectItem>
                    {uniqueStatuses.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ErrorBoundary>
            </div>
            
            {/* Фильтр по оператору */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Оператор</span>
              <ErrorBoundary>
                <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Все операторы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все операторы</SelectItem>
                    {uniqueOperators.map((operator) => (
                      <SelectItem key={operator} value={operator}>{operator}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ErrorBoundary>
            </div>
            
            {/* Фильтр по дате - теперь с ErrorBoundary и запасным вариантом */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Дата звонка</span>
              <ErrorBoundary fallback={<SimpleDatePicker value={dateFilter} onChange={handleDateSelect} />}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                      {dateFilter ? (
                        format(dateFilter, "dd.MM.yyyy")
                      ) : (
                        <span className="text-muted-foreground">Выберите дату</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFilter}
                      onSelect={handleDateSelect}
                      disabled={(date) => {
                        // Запрещаем выбор дат в будущем
                        return date > new Date();
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </ErrorBoundary>
            </div>
            
            {/* Фильтр по длительности звонка */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Длительность звонка</span>
              <ErrorBoundary>
                <Select value={durationFilter} onValueChange={setDurationFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Выберите длительность" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Выберите длительность</SelectItem>
                    <SelectItem value="short">До 1 минуты</SelectItem>
                    <SelectItem value="medium">От 1 до 3 минут</SelectItem>
                    <SelectItem value="long">Более 3 минут</SelectItem>
                  </SelectContent>
                </Select>
              </ErrorBoundary>
            </div>
            
            {/* Фильтр по тегу */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Тег</span>
              <ErrorBoundary>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Выберите тег" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Выберите тег</SelectItem>
                    {uniqueTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ErrorBoundary>
            </div>
            
            {/* Кнопки действий */}
            <div className="flex items-end h-full ml-auto">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={resetFilters}
                className="ml-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Сбросить фильтры
              </Button>
            </div>
            
            {/* Информация о количестве отфильтрованных звонков */}
            <div className="w-full mt-2">
              <Badge variant="outline" className="px-2 py-1">
                Найдено звонков: {filteredCalls.length} из {calls.length}
              </Badge>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-4 pt-1 pb-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    {message.role === "assistant" ? (
                      <AvatarImage src="/ai-avatar.png" alt="AI" />
                    ) : (
                      <AvatarImage src="/user-avatar.png" alt="User" />
                    )}
                    <AvatarFallback>
                      {message.role === "assistant" ? "AI" : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div
                      className={`rounded-lg p-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <div className="text-sm">{formatMessage(message.content)}</div>
                      )}
                    </div>
                    <div
                      className={`text-xs text-muted-foreground mt-1 ${
                        message.role === "user" ? "text-right" : ""
                      }`}
                    >
                      {formatTimestamp(message.timestamp)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="flex w-full items-center space-x-2">
          <Input
            placeholder="Введите ваш вопрос..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !callsLoaded}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={isLoading || !inputValue.trim() || !callsLoaded}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default AnalyticsChat; 