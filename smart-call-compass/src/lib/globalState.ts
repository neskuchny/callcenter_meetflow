import { Call } from '@/components/calls/CallsTable';

// Глобальное состояние для синхронизации данных между компонентами
export interface GlobalState {
  currentCalls: Call[];
  dataSource: 'all' | 'cloud' | 'local';
  selectedCallIds: string[];
  lastUpdated: Date;
}

// Ключи событий
export const EVENTS = {
  CALLS_UPDATED: 'calls-updated',
  DATA_SOURCE_CHANGED: 'data-source-changed',
  CALLS_SELECTED: 'calls-selected',
  ANALYSIS_COMPLETED: 'analysis-completed'
} as const;

// Интерфейсы для событий
export interface CallsUpdatedEvent extends CustomEvent {
  detail: {
    calls: Call[];
    source: 'all' | 'cloud' | 'local';
    selectedIds?: string[];
  };
}

export interface DataSourceChangedEvent extends CustomEvent {
  detail: {
    source: 'all' | 'cloud' | 'local';
    calls: Call[];
  };
}

export interface CallsSelectedEvent extends CustomEvent {
  detail: {
    selectedIds: string[];
    calls: Call[];
  };
}

export interface AnalysisCompletedEvent extends CustomEvent {
  detail: {
    analyzedCalls: Call[];
    allCalls: Call[];
    source: 'all' | 'cloud' | 'local';
  };
}

// Функции для работы с глобальным состоянием
export class GlobalStateManager {
  private static instance: GlobalStateManager;
  private state: GlobalState = {
    currentCalls: [],
    dataSource: 'all',
    selectedCallIds: [],
    lastUpdated: new Date()
  };

  private constructor() {}

  static getInstance(): GlobalStateManager {
    if (!GlobalStateManager.instance) {
      GlobalStateManager.instance = new GlobalStateManager();
    }
    return GlobalStateManager.instance;
  }

  // Обновление звонков
  updateCalls(calls: Call[], source: 'all' | 'cloud' | 'local') {
    this.state = {
      ...this.state,
      currentCalls: calls,
      dataSource: source,
      lastUpdated: new Date()
    };

    // Отправляем событие обновления
    const event = new CustomEvent(EVENTS.CALLS_UPDATED, {
      detail: {
        calls,
        source,
        selectedIds: this.state.selectedCallIds
      }
    }) as CallsUpdatedEvent;
    
    window.dispatchEvent(event);
    console.log(`🔄 GlobalState: Обновлены звонки (${calls.length} шт., источник: ${source})`);
  }

  // Смена источника данных
  changeDataSource(source: 'all' | 'cloud' | 'local', calls: Call[]) {
    this.state = {
      ...this.state,
      dataSource: source,
      currentCalls: calls,
      selectedCallIds: [], // Сбрасываем выбор при смене источника
      lastUpdated: new Date()
    };

    const event = new CustomEvent(EVENTS.DATA_SOURCE_CHANGED, {
      detail: { source, calls }
    }) as DataSourceChangedEvent;
    
    window.dispatchEvent(event);
    console.log(`📊 GlobalState: Источник данных изменен на ${source} (${calls.length} записей)`);
  }

  // Обновление выбранных звонков
  updateSelection(selectedIds: string[]) {
    this.state = {
      ...this.state,
      selectedCallIds: selectedIds,
      lastUpdated: new Date()
    };

    const event = new CustomEvent(EVENTS.CALLS_SELECTED, {
      detail: {
        selectedIds,
        calls: this.state.currentCalls
      }
    }) as CallsSelectedEvent;
    
    window.dispatchEvent(event);
    console.log(`✅ GlobalState: Обновлен выбор звонков (${selectedIds.length} выбрано)`);
  }

  // Завершение анализа
  completeAnalysis(analyzedCalls: Call[]) {
    // Обновляем текущие звонки с результатами анализа
    const updatedCalls = this.state.currentCalls.map(call => {
      const analyzedCall = analyzedCalls.find(ac => ac.id === call.id);
      return analyzedCall ? { ...call, ...analyzedCall } : call;
    });

    this.state = {
      ...this.state,
      currentCalls: updatedCalls,
      lastUpdated: new Date()
    };

    const event = new CustomEvent(EVENTS.ANALYSIS_COMPLETED, {
      detail: {
        analyzedCalls,
        allCalls: updatedCalls,
        source: this.state.dataSource
      }
    }) as AnalysisCompletedEvent;
    
    window.dispatchEvent(event);
    console.log(`🧠 GlobalState: Анализ завершен (${analyzedCalls.length} проанализировано)`);
  }

  // Получение текущего состояния
  getState(): GlobalState {
    return { ...this.state };
  }

  // Получение текущих звонков
  getCurrentCalls(): Call[] {
    return [...this.state.currentCalls];
  }

  // Получение выбранных звонков
  getSelectedCalls(): Call[] {
    return this.state.currentCalls.filter(call => 
      this.state.selectedCallIds.includes(call.id)
    );
  }

  // Получение источника данных
  getDataSource(): 'all' | 'cloud' | 'local' {
    return this.state.dataSource;
  }
}

// Экспорт единственного экземпляра
export const globalState = GlobalStateManager.getInstance();
