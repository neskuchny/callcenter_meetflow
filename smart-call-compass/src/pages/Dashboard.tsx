import React, { useState, useEffect } from "react";
import StatCard from "@/components/dashboard/StatCard";
import AnalyticsChart from "@/components/dashboard/AnalyticsChart";

import TrainingRecommendations from "@/components/dashboard/TrainingRecommendations";
import IssuesTable from "@/components/dashboard/IssuesTable";
import ChatAnalytics from "@/components/dashboard/ChatAnalytics";
import CallsTable, { Call } from "@/components/calls/CallsTable";
import CallsComparison from "@/components/calls/CallsComparison";
import AlertsSystem from "@/components/calls/AlertsSystem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartBar, CheckCircle, Clock, FileText, Phone, XCircle, Brain, Loader2, Users } from "lucide-react";
import { fetchCalls, getAnalyzedCalls } from "@/lib/api";
import { globalState, EVENTS, CallsUpdatedEvent, DataSourceChangedEvent, AnalysisCompletedEvent } from "@/lib/globalState";
import { TabsContent, TabsList, TabsTrigger, Tabs } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

// Определяем глобальное событие для обновления дашборда
interface DashboardUpdateEvent extends Event {
  detail?: {
    calls?: Call[];
  };
}

const Dashboard = () => {
  const { toast } = useToast();
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCallsForComparison, setSelectedCallsForComparison] = useState<Call[]>([]);
  const [statsData, setStatsData] = useState([
  {
    title: "Всего звонков",
      value: "0",
    icon: <Phone className="h-4 w-4 text-muted-foreground" />,
      trend: { value: 0, isPositive: true },
  },
  {
    title: "Успешных звонков",
      value: "0%",
    icon: <CheckCircle className="h-4 w-4 text-success" />,
      trend: { value: 0, isPositive: true },
  },
  {
    title: "Неуспешных звонков",
      value: "0%",
    icon: <XCircle className="h-4 w-4 text-destructive" />,
      trend: { value: 0, isPositive: false },
  },
  {
    title: "Средняя длительность",
      value: "0м 0с",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      trend: { value: 0, isPositive: true },
    },
  ]);
  const [chartData, setChartData] = useState([
    { name: "Пн", успешные: 0, неуспешные: 0, "требуют внимания": 0 },
    { name: "Вт", успешные: 0, неуспешные: 0, "требуют внимания": 0 },
    { name: "Ср", успешные: 0, неуспешные: 0, "требуют внимания": 0 },
    { name: "Чт", успешные: 0, неуспешные: 0, "требуют внимания": 0 },
    { name: "Пт", успешные: 0, неуспешные: 0, "требуют внимания": 0 },
  ]);
  const [issuesData, setIssuesData] = useState<Array<{ id: number; issue: string; count: number; impact: "high" | "low" | "medium" }>>([
    { id: 1, issue: "Загрузка...", count: 0, impact: "medium" },
  ]);
  const [successData, setSuccessData] = useState<Array<{ id: number; issue: string; count: number; impact: "high" | "low" | "medium" }>>([
    { id: 1, issue: "Загрузка...", count: 0, impact: "medium" },
  ]);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [llmAnalysis, setLlmAnalysis] = useState({
    title: "Общий анализ звонков",
    summary: "Загрузка данных...",
    insights: [
      {
        title: "Загрузка",
        content: "Получение данных с сервера..."
      }
    ]
  });


  
  // Новое состояние для данных эффективности менеджеров
  const [managersData, setManagersData] = useState<Array<{
    name: string;
    успешные: number;
    средняя_оценка: number;
    количество: number;
  }>>([]);
  
  // Новое состояние для данных о влиянии длительности на эффективность
  const [durationData, setDurationData] = useState<Array<{
    name: string;
    количество: number;
    конверсия: number;
    средняя_оценка: number;
  }>>([]);

  // Обработчик выбора звонков для сравнения
  const handleSelectCallForComparison = (call: Call) => {
    // Если звонок уже выбран, удаляем его
    if (selectedCallsForComparison.some(c => c.id === call.id)) {
      setSelectedCallsForComparison(selectedCallsForComparison.filter(c => c.id !== call.id));
    } 
    // Если выбрано меньше 5 звонков, добавляем новый
    else if (selectedCallsForComparison.length < 5) {
      setSelectedCallsForComparison([...selectedCallsForComparison, call]);
    }
  };

  // Функция загрузки и обработки данных звонков
  const loadAndProcessCalls = async (showToasts = false, useGlobalState = true) => {
    try {
      setIsLoading(true);
      
      // Проверяем, можем ли использовать данные из глобального состояния
      if (useGlobalState) {
        const currentCalls = globalState.getCurrentCalls();
        const currentSource = globalState.getDataSource();
        console.log(`📊 Dashboard: Проверяем глобальное состояние - найдено ${currentCalls.length} звонков (источник: ${currentSource})`);
        
        if (currentCalls.length > 0) {
          console.log(`📊 Dashboard: Используем данные из глобального состояния (${currentCalls.length} звонков, источник: ${currentSource})`);
          setCalls(currentCalls);
          processCallsData(currentCalls);
          
          // Автоматически выбираем первые 3 звонка с анализом для сравнения
          const callsForComparison = currentCalls.filter(call => 
            call.keyInsight && call.keyInsight !== '' && 
            call.score !== undefined && call.score > 0
          );
          if (callsForComparison.length >= 2 && selectedCallsForComparison.length === 0) {
            setSelectedCallsForComparison(callsForComparison.slice(0, Math.min(3, callsForComparison.length)));
            console.log(`📊 Dashboard: Автоматически выбрано ${Math.min(3, callsForComparison.length)} звонков для сравнения`);
          }
          
          setIsLoading(false);
          
          if (showToasts) {
            toast({
              title: "Дашборд обновлен",
              description: `Загружено ${currentCalls.length} звонков из текущего состояния (${currentSource})`,
            });
          }
          return;
        } else {
          console.log('📊 Dashboard: Глобальное состояние пустое, загружаем из API');
        }
      }
      
      // Загружаем звонки из API (если нет данных в глобальном состоянии)
      // Используем текущий источник данных из глобального состояния
      const currentSource = globalState.getDataSource();
      let callsData = await fetchCalls(currentSource);
      console.log(`📊 Dashboard: Загружаем из API с источником ${currentSource}`);
      
      // Загружаем сохраненные результаты анализа
      const analyzedCalls = getAnalyzedCalls();
      
      // Если есть проанализированные звонки, объединяем их с полученными данными
      if (analyzedCalls.length > 0) {
        // Создаем Map для быстрого доступа к анализу по ID
        const analyzedCallsMap = new Map(analyzedCalls.map(call => [call.id, call]));
        
        // Обновляем полученные звонки данными анализа
        callsData = callsData.map(call => {
          const analyzedCall = analyzedCallsMap.get(call.id);
          if (analyzedCall) {
            // Если для звонка есть результаты анализа, используем их
            return {
              ...call,
              aiSummary: analyzedCall.aiSummary || call.aiSummary,
              keyInsight: analyzedCall.keyInsight || call.keyInsight,
              recommendation: analyzedCall.recommendation || call.recommendation,
              score: analyzedCall.score || call.score,
              callType: analyzedCall.callType || call.callType,
              callResult: analyzedCall.callResult || call.callResult,
              tags: analyzedCall.tags || call.tags,
              supportingQuote: analyzedCall.supportingQuote || call.supportingQuote,
              objections: analyzedCall.objections || call.objections,
              rejectionReasons: analyzedCall.rejectionReasons || call.rejectionReasons,
              painPoints: analyzedCall.painPoints || call.painPoints,
              customerRequests: analyzedCall.customerRequests || call.customerRequests,
              managerPerformance: analyzedCall.managerPerformance || call.managerPerformance,
              customerPotential: analyzedCall.customerPotential || call.customerPotential,
              salesReadiness: analyzedCall.salesReadiness || call.salesReadiness,
              conversionProbability: analyzedCall.conversionProbability || call.conversionProbability,
              nextSteps: analyzedCall.nextSteps || call.nextSteps,
              keyQuestion1Answer: analyzedCall.keyQuestion1Answer || call.keyQuestion1Answer,
              keyQuestion2Answer: analyzedCall.keyQuestion2Answer || call.keyQuestion2Answer,
              keyQuestion3Answer: analyzedCall.keyQuestion3Answer || call.keyQuestion3Answer,
              clientInterests: analyzedCall.clientInterests || call.clientInterests,
              decisionFactors: analyzedCall.decisionFactors || call.decisionFactors
            };
          }
          return call;
        });
        
        console.log(`Обогащено ${callsData.length} звонков данными анализа из localStorage`);
      }
      
      setCalls(callsData);

      // Автоматически выбираем первые 3 звонка с анализом для сравнения (из API)
      const callsForComparison = callsData.filter(call => 
        call.keyInsight && call.keyInsight !== '' && 
        call.score !== undefined && call.score > 0
      );
      if (callsForComparison.length >= 2 && selectedCallsForComparison.length === 0) {
        setSelectedCallsForComparison(callsForComparison.slice(0, Math.min(3, callsForComparison.length)));
        console.log(`📊 Dashboard: Автоматически выбрано ${Math.min(3, callsForComparison.length)} звонков для сравнения (из API)`);
      }

      // Обработка данных для Dashboard
      processCallsData(callsData);
      
      if (showToasts) {
        toast({
          title: "Дашборд обновлен",
          description: `Загружены актуальные данные ${callsData.length} звонков`
        });
      }
      
    } catch (err) {
      setError("Не удалось загрузить данные о звонках");
      console.error(err);
      
      if (showToasts) {
        toast({
          title: "Ошибка обновления",
          description: "Не удалось обновить данные дашборда",
          variant: "destructive"
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    // Загружаем данные при монтировании
    loadAndProcessCalls();

    // Добавляем слушатели событий глобального состояния
    const handleCallsUpdated = (event: CallsUpdatedEvent) => {
      console.log(`📊 Dashboard: Получено событие обновления звонков (${event.detail.calls.length} записей, источник: ${event.detail.source})`);
      setCalls(event.detail.calls);
      processCallsData(event.detail.calls);
    };

    const handleDataSourceChanged = (event: DataSourceChangedEvent) => {
      console.log(`📊 Dashboard: Источник данных изменен на ${event.detail.source} (${event.detail.calls.length} записей)`);
      setCalls(event.detail.calls);
      processCallsData(event.detail.calls);
    };

    const handleAnalysisCompleted = (event: AnalysisCompletedEvent) => {
      console.log(`📊 Dashboard: Анализ завершен, обновляем дашборд (${event.detail.allCalls.length} звонков)`);
      setCalls(event.detail.allCalls);
      processCallsData(event.detail.allCalls);
      toast({
        title: "Дашборд обновлен",
        description: `Статистика пересчитана с учетом ${event.detail.analyzedCalls.length} проанализированных звонков`,
      });
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
    
    // Добавляем слушатель события для обновления дашборда
    const handleDashboardUpdate = (event: DashboardUpdateEvent) => {
      console.log("Получено событие обновления дашборда", event);
      
      // Если в событии переданы звонки, используем их
      if (event.detail?.calls) {
        console.log("Обновление дашборда с переданными данными", event.detail.calls.length);
        setCalls(event.detail.calls);
        processCallsData(event.detail.calls);
      } else {
        // Иначе используем данные из глобального состояния 
        console.log("Запрос полного обновления дашборда из глобального состояния");
        const currentCalls = globalState.getCurrentCalls();
        if (currentCalls.length > 0) {
          setCalls(currentCalls);
          processCallsData(currentCalls);
        } else {
          loadAndProcessCalls(true, false); // Загружаем из API с учетом источника
        }
      }
    };
  }, []);

  // Обработка данных звонков для компонентов Dashboard
  const processCallsData = (callsData: Call[]) => {
    if (!callsData || callsData.length === 0) return;

    // 1. Обновляем статистику
    const totalCalls = callsData.length;
    const successfulCalls = callsData.filter(call => call.callResult === "успешный" || call.status === "успешный").length;
    const unsuccessfulCalls = callsData.filter(call => call.callResult === "неуспешный" || call.status === "неуспешный").length;
    const attentionCalls = totalCalls - successfulCalls - unsuccessfulCalls;
    
    // Расчет средней длительности
    let totalMinutes = 0;
    let totalSeconds = 0;
    let callsWithDuration = 0;
    
    callsData.forEach(call => {
      if (call.duration) {
        callsWithDuration++;
        const durationMatch = call.duration.match(/(\d+)м\s*(\d*)с?/);
        if (durationMatch) {
          totalMinutes += parseInt(durationMatch[1], 10) || 0;
          totalSeconds += parseInt(durationMatch[2], 10) || 0;
        }
      }
    });
    
    // Преобразуем в общие секунды и затем обратно в минуты и секунды
    const totalTimeInSeconds = totalMinutes * 60 + totalSeconds;
    const avgTimeInSeconds = callsWithDuration > 0 ? Math.floor(totalTimeInSeconds / callsWithDuration) : 0;
    const avgMinutes = Math.floor(avgTimeInSeconds / 60);
    const avgSeconds = avgTimeInSeconds % 60;
    
    const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;
    const unsuccessRate = totalCalls > 0 ? Math.round((unsuccessfulCalls / totalCalls) * 100) : 0;
    
    setStatsData([
      {
        title: "Всего звонков",
        value: totalCalls.toString(),
        icon: <Phone className="h-4 w-4 text-muted-foreground" />,
        trend: { value: totalCalls, isPositive: true },
      },
      {
        title: "Успешных звонков",
        value: `${successRate}%`,
        icon: <CheckCircle className="h-4 w-4 text-success" />,
        trend: { value: successRate, isPositive: true },
      },
      {
        title: "Неуспешных звонков",
        value: `${unsuccessRate}%`,
        icon: <XCircle className="h-4 w-4 text-destructive" />,
        trend: { value: unsuccessRate, isPositive: false },
      },
      {
        title: "Средняя длительность",
        value: `${avgMinutes}м ${avgSeconds}с`,
        icon: <Clock className="h-4 w-4 text-muted-foreground" />,
        trend: { value: avgTimeInSeconds, isPositive: avgTimeInSeconds > 0 },
      },
    ]);

    // 2. Обновляем данные для графика по дням недели
    const callsByDay: Record<string, { successful: number, unsuccessful: number, attention: number }> = {
      "Пн": { successful: 0, unsuccessful: 0, attention: 0 },
      "Вт": { successful: 0, unsuccessful: 0, attention: 0 },
      "Ср": { successful: 0, unsuccessful: 0, attention: 0 },
      "Чт": { successful: 0, unsuccessful: 0, attention: 0 },
      "Пт": { successful: 0, unsuccessful: 0, attention: 0 },
      "Сб": { successful: 0, unsuccessful: 0, attention: 0 },
      "Вс": { successful: 0, unsuccessful: 0, attention: 0 },
    };
    
    callsData.forEach(call => {
      if (!call.date) return;
      
      // Получаем день недели
      const dateParts = call.date.split('.');
      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        const date = new Date(year, month, day);
        
        // Получаем день недели (0 - воскресенье, 1 - понедельник и т.д.)
        const dayOfWeek = date.getDay();
        const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        const dayName = dayNames[dayOfWeek];
        
        // Обновляем счетчики
        if (call.callResult === "успешный" || call.status === "успешный") {
          callsByDay[dayName].successful += 1;
        } else if (call.callResult === "неуспешный" || call.status === "неуспешный") {
          callsByDay[dayName].unsuccessful += 1;
        } else {
          callsByDay[dayName].attention += 1;
        }
      }
    });
    
    // Преобразуем данные для графика
    const newChartData = Object.entries(callsByDay)
      .filter(([day]) => ["Пн", "Вт", "Ср", "Чт", "Пт"].includes(day)) // Только рабочие дни
      .map(([day, data]) => ({
        name: day,
        успешные: data.successful,
        неуспешные: data.unsuccessful,
        "требуют внимания": data.attention
      }));
    
    setChartData(newChartData);

    // 3. Собираем данные для таблицы проблем
    const problemTags: Record<string, number> = {};
    
    callsData.forEach(call => {
      if (call.callResult === "неуспешный" || call.status === "неуспешный") {
        if (call.tags && Array.isArray(call.tags)) {
          call.tags.forEach(tag => {
            if (typeof tag === 'string') {
              problemTags[tag] = (problemTags[tag] || 0) + 1;
            }
          });
        }
      }
    });
    
    // Преобразуем в формат для таблицы и сортируем
    const newIssuesData = Object.entries(problemTags)
      .map(([issue, count], index) => ({
        id: index + 1,
        issue,
        count,
        impact: count > 10 ? "high" : count > 5 ? "medium" : "low"
      } as const))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Только топ-5
    
    setIssuesData(newIssuesData.length > 0 ? newIssuesData : [{ id: 1, issue: "Нет данных", count: 0, impact: "low" as const }]);

    // 4. Собираем данные для таблицы успехов
    const successTags: Record<string, number> = {};
    
    callsData.forEach(call => {
      if (call.callResult === "успешный" || call.status === "успешный") {
        if (call.tags && Array.isArray(call.tags)) {
          call.tags.forEach(tag => {
            if (typeof tag === 'string') {
              successTags[tag] = (successTags[tag] || 0) + 1;
            }
          });
        }
      }
    });
    
    // Преобразуем в формат для таблицы и сортируем
    const newSuccessData = Object.entries(successTags)
      .map(([issue, count], index) => ({
        id: index + 1,
        issue,
        count,
        impact: count > 10 ? "high" : count > 5 ? "medium" : "low"
      } as const))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Только топ-5
    
    setSuccessData(newSuccessData.length > 0 ? newSuccessData : [{ id: 1, issue: "Нет данных", count: 0, impact: "low" as const }]);

    // 5. Последние звонки
    const latestCalls = [...callsData]
      .sort((a, b) => {
        // Сортировка по дате и времени в обратном порядке
        if (!a.date || !b.date) return 0;
        if (a.date > b.date) return -1;
        if (a.date < b.date) return 1;
        if (!a.time || !b.time) return 0;
        if (a.time > b.time) return -1;
        if (a.time < b.time) return 1;
        return 0;
      })
      .slice(0, 5);
    
    setRecentCalls(latestCalls);

    // 6. Анализ LLM на основе доступных данных
    // Собираем ключевые инсайты из анализов звонков
    const keyInsights: string[] = [];
    const recommendations: string[] = [];
    
    callsData.forEach(call => {
      if (call.keyInsight && !keyInsights.includes(call.keyInsight)) {
        keyInsights.push(call.keyInsight);
      }
      if (call.recommendation && !recommendations.includes(call.recommendation)) {
        recommendations.push(call.recommendation);
      }
    });
    
    // Формируем анализ
    setLlmAnalysis({
      title: "Общий анализ звонков",
      summary: `На основе анализа ${totalCalls} звонков выявлены ключевые инсайты и паттерны, которые могут помочь улучшить эффективность работы менеджеров и повысить конверсию.`,
      insights: [
        {
          title: "Эффективность звонков",
          content: `Успешность звонков составляет ${successRate}%. Среди проанализированных звонков ${successfulCalls} были успешными, ${unsuccessfulCalls} неуспешными, и ${attentionCalls} требуют дополнительного внимания.`
        },
        {
          title: "Ключевые инсайты",
          content: keyInsights.length > 0 
            ? keyInsights.slice(0, 2).join(". ") 
            : "Недостаточно данных для формирования инсайтов. Требуется провести анализ большего количества звонков."
        },
        {
          title: "Рекомендации по улучшению",
          content: recommendations.length > 0 
            ? recommendations.slice(0, 2).join(". ") 
            : "Для получения конкретных рекомендаций необходимо проанализировать больше звонков с транскрипциями."
        }
      ]
    });

    // Анализ данных менеджеров (добавленный код)
    const managerStats: Record<string, { 
      total: number, 
      successful: number, 
      average_score: number,
      count_with_score: number
    }> = {};

    // Обрабатываем каждый звонок для статистики менеджеров
    callsData.forEach(call => {
      const manager = call.agent || "Неизвестно";
      
      // Инициализируем данные для менеджера, если их еще нет
      if (!managerStats[manager]) {
        managerStats[manager] = { 
          total: 0, 
          successful: 0, 
          average_score: 0,
          count_with_score: 0 
        };
      }

      // Обновляем счетчики для менеджера
      managerStats[manager].total += 1;
      
      // Подсчитываем успешные звонки
      if (call.callResult === "успешный" || call.status === "успешный") {
        managerStats[manager].successful += 1;
      }
      
      // Собираем данные о средней оценке
      if (call.score) {
        managerStats[manager].average_score += call.score;
        managerStats[manager].count_with_score += 1;
      }
    });

    // Преобразуем собранные данные в формат для графика
    const newManagersData = Object.entries(managerStats)
      .map(([manager, data]) => {
        // Рассчитываем процент успешных звонков и среднюю оценку
        const successRate = data.total > 0 ? (data.successful / data.total) * 100 : 0;
        const avgScore = data.count_with_score > 0 ? data.average_score / data.count_with_score : 0;
        
        return {
          name: manager,
          успешные: Math.round(successRate),
          средняя_оценка: Math.round(avgScore * 10) / 10,
          количество: data.total
        };
      })
      .sort((a, b) => b.успешные - a.успешные)
      .slice(0, 8); // Берем топ-8 менеджеров
    
    setManagersData(newManagersData);

    // Анализ данных для графика влияния длительности на эффективность
    const durationGroups = [
      { name: "0-1 мин", min: 0, max: 1, data: { количество: 0, успешные: 0, средняя_оценка: 0 } },
      { name: "1-3 мин", min: 1, max: 3, data: { количество: 0, успешные: 0, средняя_оценка: 0 } },
      { name: "3-5 мин", min: 3, max: 5, data: { количество: 0, успешные: 0, средняя_оценка: 0 } },
      { name: "5-10 мин", min: 5, max: 10, data: { количество: 0, успешные: 0, средняя_оценка: 0 } },
      { name: ">10 мин", min: 10, max: Number.MAX_SAFE_INTEGER, data: { количество: 0, успешные: 0, средняя_оценка: 0 } }
    ];

    // Обрабатываем каждый звонок для статистики по длительности
    callsData.forEach(call => {
      if (!call.duration) return;

      // Извлекаем длительность звонка в минутах
      let durationMinutes = 0;
      const durationMatch = call.duration.match(/(\d+)м\s*(\d*)с?/);
      if (durationMatch) {
        const minutes = parseInt(durationMatch[1], 10) || 0;
        const seconds = parseInt(durationMatch[2], 10) || 0;
        durationMinutes = minutes + seconds / 60;
      }

      // Находим группу для этой длительности
      const group = durationGroups.find(g => durationMinutes >= g.min && durationMinutes < g.max);
      if (!group) return;

      // Обновляем данные группы
      group.data.количество += 1;
      
      // Учитываем результат звонка
      if (call.callResult === "успешный" || call.status === "успешный") {
        group.data.успешные += 1;
      }

      // Учитываем оценку звонка
      if (call.score) {
        group.data.средняя_оценка += call.score;
      }
    });

    // Преобразуем собранные данные в формат для графика
    const newDurationData = durationGroups.map(group => {
      const totalCalls = group.data.количество;
      const successRate = totalCalls > 0 ? (group.data.успешные / totalCalls) * 100 : 0;
      const avgScore = totalCalls > 0 ? group.data.средняя_оценка / totalCalls : 0;
      
      return {
        name: group.name,
        количество: totalCalls,
        конверсия: Math.round(successRate),
        средняя_оценка: Math.round(avgScore * 10) / 10
      };
    });
    
    setDurationData(newDurationData);
  };

  // Добавляем кнопку обновления данных
  const handleRefreshData = () => {
    // Сначала пробуем использовать глобальное состояние
    const currentCalls = globalState.getCurrentCalls();
    if (currentCalls.length > 0) {
      console.log('📊 Dashboard: Обновление через глобальное состояние');
      setCalls(currentCalls);
      processCallsData(currentCalls);
      toast({
        title: "Дашборд обновлен",
        description: `Загружено ${currentCalls.length} звонков из текущего состояния`,
      });
    } else {
      // Если нет данных в глобальном состоянии, загружаем из API
      console.log('📊 Dashboard: Обновление через API');
      loadAndProcessCalls(true, false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-xl">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 py-10">
        <p className="text-xl mb-2">Ошибка при загрузке данных</p>
        <p>{error}</p>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-2">Нет данных о звонках</p>
        <p className="text-muted-foreground">Загрузите файл со звонками для анализа</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Аналитика звонков</h2>
          <p className="text-muted-foreground">
            Общая статистика и анализ всех звонков
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefreshData} 
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <ChartBar className="h-4 w-4" />
            Обновить данные
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="comparison">Сравнение</TabsTrigger>
          <TabsTrigger value="training">Обучение</TabsTrigger>
          <TabsTrigger value="alerts">Оповещения</TabsTrigger>
        </TabsList>
        
        {/* Вкладка обзора - основной дашборд */}
        <TabsContent value="overview" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsData.map((stat, index) => (
          <StatCard
            key={index}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            trend={stat.trend}
          />
        ))}
      </div>

          {/* Добавляем контейнер для размещения графиков в две колонки */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Компонент эффективности менеджеров */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-medium">Эффективность менеджеров</CardTitle>
                </div>
                <CardDescription>
                  Сравнение успешности звонков по менеджерам
                </CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={managersData}
                    margin={{ top: 10, right: 40, left: 40, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "успешные") return [`${value}%`, "Успешные звонки"];
                        if (name === "средняя_оценка") return [`${value}`, "Средняя оценка"];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="успешные" 
                      fill="#22c55e" 
                      radius={[0, 4, 4, 0]}
                      name="Успешные звонки (%)"
                    />
                    <Bar 
                      dataKey="средняя_оценка" 
                      fill="#3b82f6" 
                      radius={[0, 4, 4, 0]}
                      name="Средняя оценка"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Компонент влияния длительности на эффективность */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-medium">Влияние длительности на эффективность</CardTitle>
                </div>
                <CardDescription>
                  Количество звонков и процент конверсии по длительности
                </CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={durationData}
                    margin={{
                      top: 10,
                      right: 20,
                      left: 10,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="количество"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                      name="Количество звонков"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="конверсия"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                      name="Конверсия (%)"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="средняя_оценка"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      name="Средняя оценка"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

      {/* LLM Analysis Section */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="bg-slate-50 border-b">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">{llmAnalysis.title}</CardTitle>
          </div>
          <CardDescription>
            Автоматический анализ звонков на основе моделей искусственного интеллекта
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <p className="text-muted-foreground">{llmAnalysis.summary}</p>
            <div className="grid gap-4 md:grid-cols-3">
              {llmAnalysis.insights.map((insight, index) => (
                <div key={index} className="rounded-lg border bg-card p-4">
                  <h3 className="font-semibold mb-2">{insight.title}</h3>
                  <p className="text-sm text-muted-foreground">{insight.content}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <AnalyticsChart
          title="Динамика звонков за неделю"
          data={chartData}
        />
        <div className="grid grid-rows-2 gap-4">
          <IssuesTable
            data={issuesData}
            title="Основные проблемы"
          />
          <IssuesTable
            data={successData}
            title="Факторы успеха"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChatAnalytics />
        <CallsTable
          calls={recentCalls}
          title="Недавние звонки"
          description="Последние 5 обработанных звонков"
        />
      </div>
        </TabsContent>
        
        {/* Вкладка сравнения звонков */}
        <TabsContent value="comparison" className="space-y-6">
          <CallsComparison 
            calls={selectedCallsForComparison}
            title="Сравнение выбранных звонков"
            description="Выберите до 5 звонков для детального сравнения"
          />
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Выбор звонков для сравнения</CardTitle>
              <CardDescription>
                Нажмите на звонок, чтобы добавить его в сравнение (максимум 5)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CallsTable
                calls={calls}
                title=""
                onCallSelect={(id, selected) => {
                  const call = calls.find(c => c.id === id);
                  if (call) handleSelectCallForComparison(call);
                }}
                selectedCallIds={selectedCallsForComparison.map(c => c.id)}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Вкладка рекомендаций по обучению */}
        <TabsContent value="training" className="space-y-6">
          <TrainingRecommendations 
            calls={calls}
            title="Рекомендации по обучению операторов"
            description="На основе анализа всех звонков"
          />
        </TabsContent>
        
        {/* Вкладка системы оповещений */}
        <TabsContent value="alerts" className="space-y-6">
          <AlertsSystem
            calls={calls}
            title="Система оповещений о важных звонках"
            description="Настройка правил оповещений и мониторинг критических ситуаций"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;