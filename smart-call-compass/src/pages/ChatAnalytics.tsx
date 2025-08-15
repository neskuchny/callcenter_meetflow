import React, { useState, useEffect } from 'react';
import AnalyticsChat from '@/components/analysis/AnalyticsChat';
import { fetchCalls } from '@/lib/api';
import { Call } from '@/components/calls/CallsTable';
import { globalState, EVENTS, CallsUpdatedEvent, DataSourceChangedEvent, AnalysisCompletedEvent } from '@/lib/globalState';
import { Loader2 } from 'lucide-react';

const ChatAnalytics = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboardData(useGlobalState = true) {
      try {
        setIsLoading(true);
        
        let calls: Call[];
        
        // Пробуем загрузить из глобального состояния
        if (useGlobalState) {
          const currentCalls = globalState.getCurrentCalls();
          if (currentCalls.length > 0) {
            console.log('💬 ChatAnalytics: Используем данные из глобального состояния');
            calls = currentCalls;
          } else {
            // Если нет данных в глобальном состоянии, загружаем из API с учетом источника
            const currentSource = globalState.getDataSource();
            calls = await fetchCalls(currentSource);
            console.log(`💬 ChatAnalytics: Загружаем из API с источником ${currentSource}`);
          }
        } else {
          // Загружаем звонки для расчета статистики из API с учетом источника
          const currentSource = globalState.getDataSource();
          calls = await fetchCalls(currentSource);
          console.log(`💬 ChatAnalytics: Принудительная загрузка из API с источником ${currentSource}`);
        }
        
        // Рассчитываем основные метрики для дашборда
        const dashboardMetrics = calculateDashboardMetrics(calls);
        setDashboardData(dashboardMetrics);
      } catch (err) {
        console.error('Ошибка при загрузке данных:', err);
        setError('Не удалось загрузить данные для чата');
      } finally {
        setIsLoading(false);
      }
    }

    // Загружаем данные при монтировании
    loadDashboardData();

    // Добавляем слушатели событий глобального состояния
    const handleCallsUpdated = (event: CallsUpdatedEvent) => {
      console.log('💬 ChatAnalytics: Получено событие обновления звонков');
      const dashboardMetrics = calculateDashboardMetrics(event.detail.calls);
      setDashboardData(dashboardMetrics);
    };

    const handleDataSourceChanged = (event: DataSourceChangedEvent) => {
      console.log(`💬 ChatAnalytics: Источник данных изменен на ${event.detail.source}`);
      const dashboardMetrics = calculateDashboardMetrics(event.detail.calls);
      setDashboardData(dashboardMetrics);
    };

    const handleAnalysisCompleted = (event: AnalysisCompletedEvent) => {
      console.log('💬 ChatAnalytics: Анализ завершен, обновляем данные чата');
      const dashboardMetrics = calculateDashboardMetrics(event.detail.allCalls);
      setDashboardData(dashboardMetrics);
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

  // Функция для расчета метрик дашборда
  const calculateDashboardMetrics = (calls: Call[]) => {
    if (!calls || calls.length === 0) return {};

    // 1. Общее количество звонков
    const totalCalls = calls.length;
    
    // 2. Успешные и неуспешные звонки
    const successfulCalls = calls.filter(call => call.callResult === 'успешный' || call.status === 'успешный').length;
    const unsuccessfulCalls = calls.filter(call => call.callResult === 'неуспешный' || call.status === 'неуспешный').length;
    
    // 3. Расчет процентов
    const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;
    const unsuccessRate = totalCalls > 0 ? Math.round((unsuccessfulCalls / totalCalls) * 100) : 0;
    
    // 4. Расчет средней длительности
    let totalMinutes = 0;
    let totalSeconds = 0;
    let callsWithDuration = 0;
    
    calls.forEach(call => {
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
    
    // 5. Собираем теги для статистики
    const tags: Record<string, number> = {};
    calls.forEach(call => {
      if (call.tags && Array.isArray(call.tags)) {
        call.tags.forEach(tag => {
          if (typeof tag === 'string') {
            tags[tag] = (tags[tag] || 0) + 1;
          }
        });
      }
    });
    
    // Сортируем теги по популярности
    const topTags = Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
    
    // 6. Собираем данные о причинах неуспешных звонков
    const problemReasons: Record<string, number> = {};
    calls.forEach(call => {
      if (call.callResult === 'неуспешный' || call.status === 'неуспешный') {
        if (call.tags && Array.isArray(call.tags)) {
          call.tags.forEach(tag => {
            if (typeof tag === 'string') {
              problemReasons[tag] = (problemReasons[tag] || 0) + 1;
            }
          });
        }
      }
    });
    
    // Сортируем причины по популярности
    const topProblems = Object.entries(problemReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
    
    return {
      totalCalls,
      successfulCalls,
      unsuccessfulCalls, 
      successRate,
      unsuccessRate,
      avgDuration: `${avgMinutes}м ${avgSeconds}с`,
      avgDurationInSeconds: avgTimeInSeconds,
      topTags,
      topProblems
    };
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
        <p className="text-xl mb-2">Ошибка</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Чат с аналитикой</h2>
        <p className="text-muted-foreground">
          Задайте вопросы о звонках, транскрипциях или общей статистике
        </p>
      </div>
      
      <AnalyticsChat dashboardData={dashboardData} />
    </div>
  );
};

export default ChatAnalytics; 