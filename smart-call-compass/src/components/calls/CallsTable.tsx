import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, ChevronDown, ChevronUp, FileText, Clock, Settings, Columns, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import CallDetails from "./CallDetails";
import { Checkbox } from "@/components/ui/checkbox";

// Добавляем компоненты для изменяемых столбцов
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export interface Call {
  id: string;
  agent: string;
  customer: string;
  date: string;
  time: string;
  duration: string;
  status: "успешный" | "неуспешный" | "требует внимания";
  purpose: string;
  transcription?: string;
  recordUrl?: string;
  tag?: string;
  // Расширенные поля анализа LLM
  aiSummary?: string;
  keyInsight?: string;
  recommendation?: string;
  score?: number;
  callType?: string;
  callResult?: string;
  tags?: string[];
  supportingQuote?: string;
  customResponse?: string; // Ответ на пользовательский запрос
  qualityMetrics?: {
    средняя_длина_реплики_оператора?: number;
    скорость_ответа?: string;
    информативность?: number;
    эмпатия?: number;
    решение_проблемы?: number;
    структура_разговора?: number;
  };
  objections?: string[];
  rejectionReasons?: string[];
  painPoints?: string[];
  customerRequests?: string[];
  managerPerformance?: {
    вежливость?: number;
    знание_продукта?: number;
    скорость_ответа?: number;
    эмпатия?: number;
    решение_проблемы?: number;
    общая_оценка?: number;
    details?: string;
  };
  customerPotential?: {
    score?: number;
    reason?: string;
  };
  salesReadiness?: number;
  conversionProbability?: number;
  nextSteps?: string;
  // Ответы на ключевые вопросы из предварительного анализа
  keyQuestion1Answer?: string;
  keyQuestion2Answer?: string;
  keyQuestion3Answer?: string;
  // Поля для пользовательского анализа
  evaluation?: string;  // Общая оценка звонка (позитивная/нейтральная/негативная) из кастомного анализа
  keyPoints?: string;   // Ключевые моменты разговора из кастомного анализа  
  issues?: string;      // Проблемы или сложности из кастомного анализа
  analysis?: any;       // Полный объект анализа со всеми полями
  // Новые поля
  clientInterests?: string[]; // Интересы клиента (товар, услуга, условия, вопросы)
  decisionFactors?: {
    positive?: string[]; // Что заинтересовало клиента при успешной продаже
    negative?: string[]; // Что не устроило клиента при отказе
  };
  sourceFile?: string; // Источник файла (для локальных записей - имя файла, для облачных - телефон/ID)
  audioDuration?: string; // Длительность аудиофайла в формате "мм:сс"
  transcriptLength?: number; // Количество символов в транскрипции
}

interface CallsTableProps {
  calls: Call[];
  title?: string;
  description?: string;
  selectedCallIds?: string[];
  onCallSelect?: (callId: string, selected: boolean) => void;
  keyQuestions?: string[];
}

// Определяем структуру для столбцов таблицы для более удобного управления
interface TableColumn {
  id: string;
  name: string;
  visible: boolean;
  width: number; // Ширина столбца (в процентах или в пикселях)
  sortable?: boolean;
  render: (call: Call) => React.ReactNode;
}

const CallsTable = ({ 
  calls, 
  title = "Звонки", 
  description,
  selectedCallIds = [],
  onCallSelect,
  keyQuestions = []
}: CallsTableProps) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  
  // Добавляем состояние для управления видимыми столбцами
  const [columns, setColumns] = useState<TableColumn[]>([
    {
      id: "agent",
      name: "Менеджер",
      visible: true,
      width: 150,
      sortable: true,
      render: (call) => call.agent
    },
    {
      id: "sourceFile",
      name: "Источник файла",
      visible: true,
      width: 180,
      sortable: true,
      render: (call) => (
        call.sourceFile ? (
          <div className="max-w-[180px] overflow-hidden text-ellipsis">
            <span className="text-sm" title={call.sourceFile}>{call.sourceFile}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            {call.customer || "Не указан"}
          </span>
        )
      )
    },
    {
      id: "customer",
      name: "Клиент",
      visible: true,
      width: 150,
      sortable: true,
      render: (call) => call.customer
    },
    {
      id: "date",
      name: "Дата",
      visible: true,
      width: 120,
      sortable: true,
      render: (call) => (
        <>
          {call.date} <span className="text-muted-foreground text-xs">{call.time}</span>
        </>
      )
    },
    {
      id: "duration",
      name: "Длительность",
      visible: true,
      width: 120,
      sortable: true,
      render: (call) => (
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {call.duration}
        </div>
      )
    },
    {
      id: "audioDuration",
      name: "Длительность аудио",
      visible: false, // По умолчанию скрыт
      width: 130,
      sortable: true,
      render: (call) => (
        call.audioDuration ? (
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-sm font-mono">{call.audioDuration}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">Не определена</span>
        )
      )
    },
    {
      id: "transcriptLength",
      name: "Символов в транскрипции",
      visible: false, // По умолчанию скрыт
      width: 150,
      sortable: true,
      render: (call) => (
        call.transcriptLength !== undefined ? (
          <div className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-green-500" />
            <span className="text-sm font-mono">
              {call.transcriptLength.toLocaleString()} симв.
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">Не подсчитано</span>
        )
      )
    },
    {
      id: "status",
      name: "Статус",
      visible: true,
      width: 130,
      sortable: true,
      render: (call) => (
        <Badge
          variant="outline"
          className={cn(
            call.status === "успешный"
              ? "bg-green-100 text-green-800 hover:bg-green-100"
              : call.status === "неуспешный"
              ? "bg-red-100 text-red-800 hover:bg-red-100"
              : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
          )}
        >
          {call.status}
        </Badge>
      )
    },
    {
      id: "callType",
      name: "Тип звонка",
      visible: true,
      width: 130,
      sortable: true,
      render: (call) => (
        call.callType ? (
          <Badge variant="outline" className="bg-blue-50 text-blue-800">
            {call.callType}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground italic">не определен</span>
        )
      )
    },
    {
      id: "callResult",
      name: "Результат",
      visible: true,
      width: 130,
      sortable: true,
      render: (call) => (
        call.callResult ? (
          <Badge
            variant="outline"
            className={cn(
              call.callResult === "успешный"
                ? "bg-green-100 text-green-800"
                : call.callResult === "неуспешный"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            )}
          >
            {call.callResult}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground italic">не определен</span>
        )
      )
    },
    {
      id: "transcription",
      name: "Транскрипция",
      visible: true,
      width: 120,
      render: (call) => (
        <Badge
          variant="outline"
          className={cn(
            call.transcription && call.transcription !== "-"
              ? "bg-green-100 text-green-800 hover:bg-green-100"
              : "bg-slate-100 text-slate-800 hover:bg-slate-100"
          )}
        >
          {call.transcription && call.transcription !== "-" ? "Доступна" : "Отсутствует"}
        </Badge>
      )
    },
    {
      id: "score",
      name: "AI-оценка",
      visible: true,
      width: 100,
      render: (call) => (
        call.score ? (
          <span className={cn(
            "px-2 py-1 rounded-full text-xs font-medium",
            call.score >= 8 ? "bg-green-100 text-green-800" : 
            call.score >= 5 ? "bg-yellow-100 text-yellow-800" : 
            "bg-red-100 text-red-800" 
          )}>
            {call.score}/10
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Нет данных</span>
        )
      )
    },
    {
      id: "keyInsight",
      name: "Ключевой вывод",
      visible: true,
      width: 180,
      render: (call) => (
        call.keyInsight ? (
          <div className="max-w-[180px] overflow-hidden text-ellipsis">
            <span className="text-sm line-clamp-2">{call.keyInsight}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">Не анализирован</span>
        )
      )
    },
    {
      id: "salesReadiness",
      name: "Готовность к продаже",
      visible: true,
      width: 150,
      sortable: true,
      render: (call) => (
        call.salesReadiness !== undefined ? (
          <div className="w-full max-w-[120px]">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium">{call.salesReadiness}/10</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div 
                className={cn(
                  "h-2.5 rounded-full",
                  call.salesReadiness >= 7 ? "bg-green-600" :
                  call.salesReadiness >= 4 ? "bg-yellow-400" : "bg-red-600"
                )}
                style={{ width: `${(call.salesReadiness / 10) * 100}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не проанализировано</span>
        )
      )
    },
    {
      id: "conversionProbability",
      name: "Вероятность конверсии",
      visible: false, // По умолчанию скрыт, так как не всегда необходим
      width: 150,
      sortable: true,
      render: (call) => (
        call.conversionProbability !== undefined ? (
          <div className="w-full max-w-[120px]">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium">{call.conversionProbability}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div 
                className={cn(
                  "h-2.5 rounded-full",
                  call.conversionProbability >= 70 ? "bg-green-600" :
                  call.conversionProbability >= 40 ? "bg-yellow-400" : "bg-red-600"
                )}
                style={{ width: `${call.conversionProbability}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не проанализировано</span>
        )
      )
    },
    {
      id: "objections",
      name: "Возражения",
      visible: false, // По умолчанию скрыт
      width: 200,
      render: (call) => (
        call.objections && call.objections.length > 0 ? (
          <div className="max-h-[120px] overflow-y-auto max-w-[200px]">
            <ul className="list-disc list-inside text-xs">
              {call.objections.map((objection, idx) => (
                <li key={idx} className="mb-1">{objection}</li>
              ))}
            </ul>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Нет возражений</span>
        )
      )
    },
    {
      id: "managerPerformance",
      name: "Оценка менеджера",
      visible: true,
      width: 150,
      render: (call) => (
        call.managerPerformance ? (
          <div className="flex items-center">
            <span className={cn(
              "px-2 py-1 rounded-full text-xs font-medium",
              call.managerPerformance.общая_оценка !== undefined && call.managerPerformance.общая_оценка >= 8 ? "bg-green-100 text-green-800" :
              call.managerPerformance.общая_оценка !== undefined && call.managerPerformance.общая_оценка >= 5 ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            )}>
              {call.managerPerformance.общая_оценка !== undefined ? 
                call.managerPerformance.общая_оценка : "N/A"}
            </span>
            <span className="ml-2 text-xs text-gray-500 max-w-[100px] truncate">
              {call.managerPerformance.details}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не проанализировано</span>
        )
      )
    },
    {
      id: "customerPotential",
      name: "Потенциал клиента",
      visible: false, // По умолчанию скрыт
      width: 150,
      render: (call) => (
        call.customerPotential ? (
          <div className="flex items-center">
            <span className={cn(
              "px-2 py-1 rounded-full text-xs font-medium",
              call.customerPotential.score !== undefined && call.customerPotential.score >= 8 ? "bg-green-100 text-green-800" :
              call.customerPotential.score !== undefined && call.customerPotential.score >= 5 ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            )}>
              {call.customerPotential.score !== undefined ? 
                call.customerPotential.score : "N/A"}
            </span>
            <span className="ml-2 text-xs text-gray-500 max-w-[100px] truncate">
              {call.customerPotential.reason}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не проанализировано</span>
        )
      )
    },
    {
      id: "clientInterests",
      name: "Интересы клиента",
      visible: true,
      width: 180,
      render: (call) => (
        call.clientInterests && call.clientInterests.length > 0 ? (
          <div className="max-h-[100px] overflow-y-auto max-w-[180px]">
            <ul className="list-disc list-inside text-xs">
              {call.clientInterests.map((interest, idx) => (
                <li key={idx} className="mb-1">{interest}</li>
              ))}
            </ul>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не определены</span>
        )
      )
    },
    {
      id: "decisionFactors",
      name: "Факторы принятия решения",
      visible: true,
      width: 200,
      render: (call) => (
        call.decisionFactors ? (
          <div className="max-h-[120px] overflow-y-auto max-w-[200px]">
            {call.decisionFactors.positive && call.decisionFactors.positive.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-green-700">Положительные:</span>
                <ul className="list-disc list-inside text-xs">
                  {call.decisionFactors.positive.map((factor, idx) => (
                    <li key={idx} className="mb-1 text-green-600">{factor}</li>
                  ))}
                </ul>
              </div>
            )}
            {call.decisionFactors.negative && call.decisionFactors.negative.length > 0 && (
              <div>
                <span className="text-xs font-medium text-red-700">Отрицательные:</span>
                <ul className="list-disc list-inside text-xs">
                  {call.decisionFactors.negative.map((factor, idx) => (
                    <li key={idx} className="mb-1 text-red-600">{factor}</li>
                  ))}
                </ul>
              </div>
            )}
            {(!call.decisionFactors.positive || call.decisionFactors.positive.length === 0) && 
              (!call.decisionFactors.negative || call.decisionFactors.negative.length === 0) && (
              <span className="text-muted-foreground italic text-xs">Не определены</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не определены</span>
        )
      )
    },
    {
      id: "keyQuestion1Answer",
      name: keyQuestions[0] || "Вопрос 1",
      visible: false, // По умолчанию скрыт
      width: 200,
      render: (call) => (
        call.keyQuestion1Answer ? (
          <div className="max-h-[120px] overflow-y-auto max-w-[200px] whitespace-pre-wrap break-words">
            {call.keyQuestion1Answer}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Нет ответа</span>
        )
      )
    },
    {
      id: "keyQuestion2Answer",
      name: keyQuestions[1] || "Вопрос 2",
      visible: false, // По умолчанию скрыт
      width: 200,
      render: (call) => (
        call.keyQuestion2Answer ? (
          <div className="max-h-[120px] overflow-y-auto max-w-[200px] whitespace-pre-wrap break-words">
            {call.keyQuestion2Answer}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Нет ответа</span>
        )
      )
    },
    {
      id: "keyQuestion3Answer",
      name: keyQuestions[2] || "Вопрос 3",
      visible: false, // По умолчанию скрыт
      width: 200,
      render: (call) => (
        call.keyQuestion3Answer ? (
          <div className="max-h-[120px] overflow-y-auto max-w-[200px] whitespace-pre-wrap break-words">
            {call.keyQuestion3Answer}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Нет ответа</span>
        )
      )
    },
    {
      id: "customResponse",
      name: "Ответ на запрос",
      visible: false, // По умолчанию скрыт
      width: 250,
      render: (call) => (
        call.customResponse ? (
          <div className="max-h-[150px] overflow-y-auto max-w-[250px] whitespace-pre-wrap break-words">
            {typeof call.customResponse === 'string' ? call.customResponse : JSON.stringify(call.customResponse)}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Не проанализировано</span>
        )
      )
    },
    // Добавляем столбец для транскрипций
    {
      id: "fullTranscription",
      name: "Полная транскрипция",
      visible: false, // По умолчанию скрыт
      width: 350,
      render: (call) => (
        call.transcription && call.transcription !== "-" ? (
          <div className="max-h-[300px] overflow-y-auto max-w-[350px] p-2 bg-slate-50 rounded text-sm whitespace-pre-wrap break-words">
            {call.transcription}
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Транскрипция отсутствует</span>
        )
      )
    },
  ]);

  // Функция для изменения видимости столбца
  const toggleColumnVisibility = (columnId: string) => {
    setColumns(columns.map(column => 
      column.id === columnId 
        ? { ...column, visible: !column.visible } 
        : column
    ));
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedCalls = React.useMemo(() => {
    if (!sortColumn) return calls;

    return [...calls].sort((a, b) => {
      const aValue = a[sortColumn as keyof Call];
      const bValue = b[sortColumn as keyof Call];

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [calls, sortColumn, sortDirection]);

  const viewCallDetails = (call: Call) => {
    setSelectedCall(call);
    setOpenDialog(true);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="ml-1 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 h-4 w-4" />
    );
  };

  const isCallSelected = (callId: string) => {
    return selectedCallIds.includes(callId);
  };

  const handleCheckboxChange = (callId: string, checked: boolean) => {
    if (onCallSelect) {
      onCallSelect(callId, checked);
    }
  };

  // Добавляем эффект, который будет отслеживать изменение массива звонков
  // и отправлять событие обновления дашборда
  useEffect(() => {
    // Проверка на наличие проанализированных звонков
    const hasAnalyzedCalls = calls.some(call => 
      call.score !== undefined || 
      call.aiSummary !== undefined || 
      call.keyInsight !== undefined
    );
    
    // Если звонки проанализированы, отправляем событие обновления дашборда
    if (hasAnalyzedCalls && calls.length > 0) {
      console.log("CallsTable: обнаружены проанализированные звонки, отправка события обновления дашборда");
      
      try {
        // Отправляем событие с текущими звонками
        const updateEvent = new CustomEvent('dashboard-update', {
          detail: { calls }
        });
        window.dispatchEvent(updateEvent);
      } catch (e) {
        console.error("Ошибка при отправке события обновления дашборда:", e);
      }
    }
  }, [calls]); // Зависимость от массива звонков

  // Получаем только видимые столбцы
  const visibleColumns = columns.filter(column => column.visible);

  // Функция для экспорта таблицы в CSV
  const exportToCSV = (data: any[], columns: TableColumn[], filename: string) => {
    // Получаем только видимые столбцы
    const visibleColumns = columns.filter(column => column.visible);
    
    // Создаем заголовки CSV
    const headers = visibleColumns.map(column => `"${column.name}"`).join(',');
    
    // Создаем строки данных
    const rows = data.map(item => {
      return visibleColumns.map(column => {
        // Получаем значение для ячейки
        let cellValue = '';
        
        // Обрабатываем разные типы данных
        if (column.id === 'status' || column.id === 'callResult' || column.id === 'callType' || column.id === 'sourceFile' || column.id === 'audioDuration') {
          cellValue = item[column.id] || '';
        } else if (column.id === 'transcriptLength') {
          cellValue = item[column.id] !== undefined ? item[column.id].toString() : '';
        } else if (column.id === 'clientInterests' && Array.isArray(item[column.id])) {
          cellValue = item[column.id].join(', ');
        } else if (column.id === 'decisionFactors' && item[column.id]) {
          const positive = item[column.id].positive ? item[column.id].positive.join(', ') : '';
          const negative = item[column.id].negative ? item[column.id].negative.join(', ') : '';
          cellValue = `Положительные: ${positive}; Отрицательные: ${negative}`;
        } else if (column.id === 'managerPerformance' && item[column.id]) {
          cellValue = item[column.id].общая_оценка ? `Оценка: ${item[column.id].общая_оценка}` : '';
        } else if (column.id === 'fullTranscription') {
          cellValue = item.transcription || '';
        } else {
          cellValue = item[column.id] || '';
        }
        
        // Экранируем кавычки и оборачиваем значение в кавычки
        if (typeof cellValue === 'string') {
          return `"${cellValue.replace(/"/g, '""')}"`;
        }
        return `"${cellValue}"`;
      }).join(',');
    }).join('\n');
    
    // Создаем содержимое CSV-файла
    const csvContent = `${headers}\n${rows}`;
    
    // Создаем Blob с кодировкой UTF-8 и BOM для корректного отображения кириллицы в Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    
    // Создаем URL для скачивания
    const url = URL.createObjectURL(blob);
    
    // Создаем временную ссылку для скачивания
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    
    // Имитируем клик по ссылке
    link.click();
    
    // Удаляем ссылку
    document.body.removeChild(link);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex items-center gap-1 h-8 px-2"
              onClick={() => exportToCSV(sortedCalls, columns, `Звонки_${new Date().toLocaleDateString('ru-RU')}`)}
              title="Скачать таблицу в формате CSV"
            >
              <Download className="h-4 w-4" />
              <span className="text-xs">Скачать CSV</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-1 h-8 px-2">
                  <Columns className="h-4 w-4" />
                  <span className="text-xs">Столбцы</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Видимые столбцы</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.visible}
                    onCheckedChange={() => toggleColumnVisibility(column.id)}
                  >
                    {column.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[700px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {onCallSelect && (
                      <TableHead className="w-[50px]">
                        <span className="sr-only">Выбор</span>
                      </TableHead>
                    )}
                    {visibleColumns.map(column => (
                      <TableHead
                        key={column.id}
                        className={`cursor-pointer ${column.sortable ? 'cursor-pointer' : ''}`}
                        onClick={() => column.sortable && handleSort(column.id)}
                        style={{ 
                          width: column.width,
                          minWidth: column.width,
                          maxWidth: column.width * 1.5
                        }}
                      >
                        <div className="flex items-center">
                          {column.name}
                          {column.sortable && <SortIcon column={column.id} />}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[60px] sticky right-0 bg-background z-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCalls.map((call) => (
                    <TableRow key={call.id}>
                      {onCallSelect && (
                        <TableCell>
                          <Checkbox
                            checked={isCallSelected(call.id)}
                            onCheckedChange={(checked) => handleCheckboxChange(call.id, !!checked)}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.map(column => (
                        <TableCell key={column.id} className="whitespace-normal py-2">
                          <div className="max-h-[150px] overflow-y-auto">
                            {column.render(call)}
                          </div>
                        </TableCell>
                      ))}
                      <TableCell className="sticky right-0 bg-background z-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0"
                            >
                              <span className="sr-only">Открыть меню</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Действия</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => viewCallDetails(call)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Подробности
                            </DropdownMenuItem>
                            {call.recordUrl && (
                              <DropdownMenuItem asChild>
                                <a href={call.recordUrl} target="_blank" rel="noopener noreferrer">
                                  Прослушать запись
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {sortedCalls.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length + (onCallSelect ? 2 : 1)} className="text-center py-6">
                        Звонки не найдены
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-3xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Детали звонка</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-full pr-4">
            {selectedCall && <CallDetails call={selectedCall} />}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CallsTable;
