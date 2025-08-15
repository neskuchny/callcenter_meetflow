import React, { useState, useRef, useEffect, Component, ErrorInfo } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send, Loader2, Trash2, Filter, Calendar as CalendarIcon, X, RefreshCw } from "lucide-react";
import { sendChatMessage, fetchCalls } from "@/lib/api";
import { globalState } from "@/lib/globalState";
import { Call } from "@/components/calls/CallsTable";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

// Константа с URL API
const API_URL = 'http://localhost:5000/api';

// Компонент для отлова ошибок рендеринга
class ErrorBoundary extends Component<{children: React.ReactNode}> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Ошибка в компоненте:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border rounded bg-red-50 text-red-500">
          <h3 className="font-medium">Ошибка при отображении</h3>
          <p className="text-sm">Произошла ошибка при отображении компонента</p>
          <p className="text-xs mt-2 font-mono">{String(this.state.error)}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

// Ключи для localStorage
const STORAGE_KEYS = {
  MESSAGES: 'chat-analytics-messages',
  FILTERS: 'chat-analytics-filters'
};

const ChatAnalytics = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshingTags, setIsRefreshingTags] = useState(false);
  
  // Данные из таблицы
  const [operators, setOperators] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  
  // Простые фильтры без сложных компонентов
  const [filters, setFilters] = useState({
    status: "",
    operator: "",
    date: "",
    duration: "",
    tag: ""
  });
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Загрузка данных из localStorage при монтировании компонента
  useEffect(() => {
    const loadMessagesFromStorage = () => {
      try {
        const savedMessagesJson = localStorage.getItem(STORAGE_KEYS.MESSAGES);
        if (savedMessagesJson) {
          const parsedMessages = JSON.parse(savedMessagesJson);
          // Преобразуем строки дат обратно в объекты Date
          const messagesWithDates = parsedMessages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          setMessages(messagesWithDates);
        } else {
          // Установка сообщения-приветствия, если нет сохраненных сообщений
          setMessages([{
            id: "welcome",
            content: "Привет! Задайте вопрос по аналитике звонков. Вы можете использовать фильтры, нажав на кнопку фильтра.",
            sender: "assistant",
            timestamp: new Date(),
          }]);
        }
        
        // Загрузка фильтров
        const savedFiltersJson = localStorage.getItem(STORAGE_KEYS.FILTERS);
        if (savedFiltersJson) {
          setFilters(JSON.parse(savedFiltersJson));
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных из localStorage:", error);
        // Установка сообщения-приветствия в случае ошибки
        setMessages([{
          id: "welcome",
          content: "Привет! Задайте вопрос по аналитике звонков. Вы можете использовать фильтры, нажав на кнопку фильтра.",
          sender: "assistant",
          timestamp: new Date(),
        }]);
      }
    };
    
    loadMessagesFromStorage();
    
    // Загружаем звонки для фильтров
    async function loadCalls() {
      try {
        setLoadError(null);
        const callsData = await fetchCalls();
        
        if (!callsData || callsData.length === 0) {
          console.warn("Получен пустой массив звонков");
          setCalls([]);
          setCallsLoaded(true);
          return;
        }
        
        setCalls(callsData);
        
        // Извлекаем уникальные значения для фильтров
        const uniqueOperators = new Set<string>();
        const uniqueStatuses = new Set<string>();
        const uniqueTags = new Set<string>();
        
        callsData.forEach(call => {
          // Операторы
          if (call.agent && typeof call.agent === 'string' && call.agent.trim()) {
            uniqueOperators.add(call.agent.trim());
          }
          
          // Статусы
          const status = call.callResult || call.status;
          if (status && typeof status === 'string' && status.trim()) {
            uniqueStatuses.add(status.trim());
          }
          
          // Теги
          if (call.tags && Array.isArray(call.tags)) {
            call.tags.forEach(tag => {
              if (tag && typeof tag === 'string' && tag.trim()) {
                uniqueTags.add(tag.trim());
              }
            });
          } else if (call.tag && typeof call.tag === 'string' && call.tag.trim()) {
            uniqueTags.add(call.tag.trim());
          }
        });
        
        // Преобразуем в массивы и сортируем
        setOperators(Array.from(uniqueOperators).sort());
        setStatuses(Array.from(uniqueStatuses).sort());
        setTags(Array.from(uniqueTags).sort());
        setCallsLoaded(true);
      } catch (err) {
        console.error("Не удалось загрузить данные о звонках:", err);
        setLoadError("Не удалось загрузить данные для фильтров");
        setCallsLoaded(true);
      }
    }
    
    loadCalls();
  }, []);
  
  // Сохранение сообщений в localStorage при их изменении
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    }
  }, [messages]);
  
  // Сохранение фильтров в localStorage при их изменении
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
  }, [filters]);

  // Автопрокрутка при получении новых сообщений
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Сброс фильтров
  const resetFilters = () => {
    setFilters({
      status: "",
      operator: "",
      date: "",
      duration: "",
      tag: ""
    });
  };

  // Обработка изменения фильтров через простые инпуты
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Функция для обновления списка тегов
  const refreshTags = async () => {
    try {
      setIsRefreshingTags(true);
      // Используем константу API_URL
      const response = await fetch(`${API_URL}/refresh-tags`);
      const data = await response.json();
      
      if (data.success && data.tags) {
        // Запоминаем текущий выбранный тег
        const currentTag = filters.tag;
        
        // Обновляем список тегов
        setTags(data.tags);
        
        // Проверяем, существует ли текущий тег в обновленном списке
        if (currentTag && !data.tags.includes(currentTag)) {
          // Если текущий тег больше не существует, сбрасываем фильтр по тегу
          setFilters(prev => ({ ...prev, tag: "" }));
          toast({
            title: "Фильтр по тегу сброшен",
            description: `Выбранный тег "${currentTag}" больше недоступен`,
          });
        }
        
        toast({
          title: "Теги обновлены",
          description: `Найдено ${data.tags.length} уникальных тегов`,
        });
      } else if (data.error) {
        toast({
          title: "Ошибка обновления тегов",
          description: data.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Ошибка при обновлении тегов:", error);
      toast({
        title: "Ошибка обновления тегов",
        description: "Не удалось обновить список тегов. Проверьте соединение с сервером.",
        variant: "destructive"
      });
    } finally {
      setIsRefreshingTags(false);
    }
  };

  // Обновим обработчик отправки сообщения для обработки тегов из ответа API
  const handleSendMessage = async () => {
    if (input.trim() === "" || isSending) return;

    setIsSending(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      // Преобразуем фильтры для API
      const apiFilters = {
        status: filters.status,
        operator: filters.operator,
        date: filters.date,
        duration: filters.duration,
        tags: filters.tag ? [filters.tag] : []
      };

      // Получаем текущий источник данных из глобального состояния
      const currentSource = globalState.getDataSource();
      const response = await sendChatMessage(userMessage.content, apiFilters, currentSource);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.reply,
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Проверяем, есть ли обновленный список тегов в ответе
      if (response.availableTags && Array.isArray(response.availableTags) && response.availableTags.length > 0) {
        // Обновляем список тегов, если он изменился
        if (JSON.stringify(tags.sort()) !== JSON.stringify(response.availableTags.sort())) {
          console.log("Обновляем список тегов из ответа API:", response.availableTags);
          setTags(response.availableTags);
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Ошибка при получении ответа: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };
  
  // Функция для очистки истории чата
  const clearChatHistory = () => {
    // Устанавливаем только приветственное сообщение
    const welcomeMessage: Message = {
      id: "welcome-new",
      content: "История чата очищена. Задайте новый вопрос по аналитике звонков.",
      sender: "assistant",
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  };

  // Форматирование даты
  const formatDate = (date: Date) => {
    try {
      return format(date, 'dd.MM.yyyy');
    } catch (error) {
      console.error("Ошибка форматирования даты:", error);
      return "Неверная дата";
    }
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Чат с аналитикой
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={refreshTags}
              disabled={isRefreshingTags}
              title="Обновить список доступных тегов для фильтрации"
              className={`relative ${isRefreshingTags ? 'animate-pulse' : ''}`}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshingTags ? 'animate-spin' : ''}`} />
              {tags.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                  {tags.length}
                </span>
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              title={showFilters ? "Скрыть фильтры" : "Показать фильтры"}
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearChatHistory}
              title="Очистить историю чата"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Используем ErrorBoundary для отлова ошибок в компоненте фильтров */}
        <ErrorBoundary>
          {showFilters && (
            <div className="mt-3 space-y-3">
              {loadError && (
                <div className="text-xs text-red-500">
                  {loadError}
                </div>
              )}
              
              <div className="flex flex-wrap gap-4">
                {/* Фильтр по статусу - селект с вариантами из данных */}
                <div>
                  <Label htmlFor="status" className="text-xs flex justify-between">
                    <span>Статус</span>
                    {statuses.length > 0 && <span className="text-muted-foreground">{statuses.length}</span>}
                  </Label>
                  <select
                    id="status"
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="w-[160px] h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground"
                  >
                    <option value="">Любой статус ({statuses.length})</option>
                    {statuses.map(status => {
                      // Подсчет звонков с этим статусом
                      const count = calls.filter(call => (call.callResult === status || call.status === status)).length;
                      return (
                        <option key={status} value={status}>
                          {status} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
                
                {/* Фильтр по оператору - селект с вариантами из данных */}
                <div>
                  <Label htmlFor="operator" className="text-xs flex justify-between">
                    <span>Оператор</span>
                    {operators.length > 0 && <span className="text-muted-foreground">{operators.length}</span>}
                  </Label>
                  <select
                    id="operator"
                    name="operator"
                    value={filters.operator}
                    onChange={handleFilterChange}
                    className="w-[160px] h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground"
                  >
                    <option value="">Любой оператор ({operators.length})</option>
                    {operators.map(operator => {
                      // Подсчет звонков этого оператора
                      const count = calls.filter(call => call.agent === operator).length;
                      return (
                        <option key={operator} value={operator}>
                          {operator} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
                
                {/* Фильтр по дате - обычный инпут типа date */}
                <div>
                  <Label htmlFor="date" className="text-xs flex justify-between">
                    <span>Дата звонка</span>
                    {/* Подсчет уникальных дат */}
                    {(() => {
                      const uniqueDates = new Set(calls.map(call => call.date).filter(Boolean));
                      return uniqueDates.size > 0 && <span className="text-muted-foreground">{uniqueDates.size}</span>;
                    })()}
                  </Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={filters.date}
                    onChange={handleFilterChange}
                    className="h-8 w-[160px]"
                  />
                </div>
                
                {/* Фильтр по длительности - обычный селект */}
                <div>
                  <Label htmlFor="duration" className="text-xs">Длительность</Label>
                  <select
                    id="duration"
                    name="duration"
                    value={filters.duration}
                    onChange={handleFilterChange}
                    className="w-[160px] h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground"
                  >
                    <option value="">Любая длительность ({calls.length})</option>
                    <option value="short">
                      Короткие (до 1 мин) ({calls.filter(call => {
                        const match = call.duration?.match(/(\d+)м\s*(\d*)с?/);
                        if (!match) return false;
                        const minutes = parseInt(match[1], 10) || 0;
                        return minutes < 1;
                      }).length})
                    </option>
                    <option value="medium">
                      Средние (1-3 мин) ({calls.filter(call => {
                        const match = call.duration?.match(/(\d+)м\s*(\d*)с?/);
                        if (!match) return false;
                        const minutes = parseInt(match[1], 10) || 0;
                        return minutes >= 1 && minutes <= 3;
                      }).length})
                    </option>
                    <option value="long">
                      Длинные (более 3 мин) ({calls.filter(call => {
                        const match = call.duration?.match(/(\d+)м\s*(\d*)с?/);
                        if (!match) return false;
                        const minutes = parseInt(match[1], 10) || 0;
                        return minutes > 3;
                      }).length})
                    </option>
                  </select>
                </div>
                
                {/* Фильтр по тегу - селект с вариантами из данных */}
                <div>
                  <Label htmlFor="tag" className="text-xs flex justify-between">
                    <span>Тег</span>
                    {tags.length > 0 && <span className="text-muted-foreground">{tags.length}</span>}
                  </Label>
                  <select
                    id="tag"
                    name="tag"
                    value={filters.tag}
                    onChange={handleFilterChange}
                    className="w-[160px] h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground"
                  >
                    <option value="">Любой тег ({tags.length})</option>
                    {tags.map(tag => {
                      // Подсчет звонков с этим тегом
                      const count = calls.filter(call => 
                        call.tags && Array.isArray(call.tags) && call.tags.includes(tag) || 
                        call.tag === tag
                      ).length;
                      return (
                        <option key={tag} value={tag}>
                          {tag} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              
              {/* Количество звонков, соответствующих текущим фильтрам */}
              <div className="mt-2 text-xs text-muted-foreground">
                {(() => {
                  // Подсчет звонков, соответствующих всем текущим фильтрам
                  const filteredCallsCount = calls.filter(call => {
                    // Проверка по статусу
                    if (filters.status && call.callResult !== filters.status && call.status !== filters.status) {
                      return false;
                    }
                    
                    // Проверка по оператору
                    if (filters.operator && call.agent !== filters.operator) {
                      return false;
                    }
                    
                    // Проверка по дате
                    if (filters.date && call.date !== filters.date) {
                      return false;
                    }
                    
                    // Проверка по длительности
                    if (filters.duration) {
                      const match = call.duration?.match(/(\d+)м\s*(\d*)с?/);
                      if (!match) return false;
                      const minutes = parseInt(match[1], 10) || 0;
                      
                      if (filters.duration === 'short' && minutes >= 1) return false;
                      if (filters.duration === 'medium' && (minutes < 1 || minutes > 3)) return false;
                      if (filters.duration === 'long' && minutes <= 3) return false;
                    }
                    
                    // Проверка по тегу
                    if (filters.tag) {
                      const hasTags = call.tags && Array.isArray(call.tags) && call.tags.includes(filters.tag);
                      const hasTag = call.tag === filters.tag;
                      if (!hasTags && !hasTag) return false;
                    }
                    
                    return true;
                  }).length;
                  
                  return <span>Найдено звонков: <strong>{filteredCallsCount}</strong> из {calls.length}</span>;
                })()}
              </div>
              
              {/* Информация о применённых фильтрах */}
              {(filters.status || filters.operator || filters.date || filters.duration || filters.tag) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {filters.status && (
                    <Badge variant="outline" className="text-xs bg-primary/5">
                      Статус: {filters.status}
                    </Badge>
                  )}
                  {filters.operator && (
                    <Badge variant="outline" className="text-xs bg-primary/5">
                      Оператор: {filters.operator}
                    </Badge>
                  )}
                  {filters.date && (
                    <Badge variant="outline" className="text-xs bg-primary/5">
                      Дата: {filters.date}
                    </Badge>
                  )}
                  {filters.duration && (
                    <Badge variant="outline" className="text-xs bg-primary/5">
                      Длительность: {
                        filters.duration === 'short' ? 'до 1 мин' :
                        filters.duration === 'medium' ? '1-3 мин' :
                        filters.duration === 'long' ? 'более 3 мин' : 
                        filters.duration
                      }
                    </Badge>
                  )}
                  {filters.tag && (
                    <Badge variant="outline" className="text-xs bg-primary/5">
                      Тег: {filters.tag}
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Кнопка сброса фильтров */}
              <div className="flex justify-end">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="px-2 h-7"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Сбросить фильтры
                </Button>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </CardHeader>
      <CardContent className="overflow-hidden py-4">
        <ScrollArea className="h-[calc(100%-1rem)]" ref={scrollAreaRef}>
          <div className="flex flex-col gap-4 pr-4 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] shadow-sm ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div
                    className={`text-xs mt-1 text-right ${
                      message.sender === "user"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-center items-center p-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Анализирую...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="pt-3 pb-3 border-t bg-background">
        <div className="flex w-full items-center space-x-2">
          <Textarea
            placeholder="Задайте вопрос по отфильтрованным звонкам..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isSending}
          />
          <Button
            type="submit"
            size="icon"
            onClick={handleSendMessage}
            disabled={input.trim() === "" || isSending}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ChatAnalytics;
