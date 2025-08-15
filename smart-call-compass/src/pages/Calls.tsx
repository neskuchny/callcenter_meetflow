import React, { useState, useEffect, useRef } from "react";
import CallsTable, { Call } from "@/components/calls/CallsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileText, 
  Search, 
  Upload, 
  ChartBar, 
  Brain, 
  BarChart4, 
  ListTodo, 
  Loader2,
  X,
  Check,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomPromptAnalysis from "@/components/analysis/CustomPromptAnalysis";
import PreviewAnalysis from "@/components/analysis/PreviewAnalysis";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  fetchCalls, 
  analyzeCalls, 
  transcribeCalls, 
  processAllCalls,
  uploadFile,
    importFromFolder,
  customAnalyzeCalls,
  getAnalyzedCalls,
  clearAnalyzedCalls,
  previewAnalyzeCalls,
  PreviewAnalysisResult
} from "@/lib/api";
import { globalState } from "@/lib/globalState";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// Define types for custom fields and analysis results
interface CustomField {
  label: string;
  value: string;
}

interface CustomFields {
  [key: string]: CustomField;
}

interface CallTag {
  [callId: string]: string[];
}

interface AnalysisResults {
  keyInsights: string[];
  successFactors: string[];
  problems: string[];
  recommendations: string[];
  tags: CallTag;
}

// Компонент для отображения аналитического поля
interface CustomFieldProps {
  label: string;
  value: string;
}

const CustomField = ({ label, value }: CustomFieldProps) => {
  return (
    <div className="p-4 border rounded-md">
      <h3 className="text-sm font-medium mb-1">{label}</h3>
      <p className="text-sm text-muted-foreground">{value}</p>
    </div>
  );
};

const Calls = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [customKeyQuestions, setCustomKeyQuestions] = useState<string[]>(["", "", ""]);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("calls");
  
  // Новые состояния для работы с API
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCallIds, setSelectedCallIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<'all' | 'cloud' | 'local'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Состояния для загрузки файла
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    rows?: number;
    transcribe_count?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Состояния для импорта из папки
  const [isFolderImporting, setIsFolderImporting] = useState(false);
  const [folderImportResult, setFolderImportResult] = useState<{
    success: boolean;
    message: string;
    imported?: number;
    transcribed?: number;
    analyzed?: number;
  } | null>(null);
  
  // Properly typed state for LLM-fillable fields
  const [customFields, setCustomFields] = useState<CustomFields>({
    field1: { label: "Ключевые паттерны", value: "" },
    field2: { label: "Факторы успеха", value: "" },
    field3: { label: "Рекомендации", value: "" },
  });
  
  // Properly typed LLM analysis results
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults>({
    keyInsights: [],
    successFactors: [],
    problems: [],
    recommendations: [],
    tags: {}
  });

  const [forceRetranscribe, setForceRetranscribe] = useState(false);

  // Состояние для предварительного анализа
  const [previewResult, setPreviewResult] = useState<PreviewAnalysisResult | null>(null);
  const [isPreviewAnalyzing, setIsPreviewAnalyzing] = useState(false);
  // Состояние для анализа звонков
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);

  const navigate = useNavigate();

  // Загрузка звонков при монтировании компонента
  useEffect(() => {
    loadCalls();
  }, []);

  // Перезагружаем данные при изменении источника данных
  useEffect(() => {
    loadCalls(dataSource);
  }, [dataSource]);

  // Обновляем выбранные звонки в глобальном состоянии
  useEffect(() => {
    if (calls.length > 0) {
      globalState.updateSelection(selectedCallIds);
    }
  }, [selectedCallIds]);

  // Функция загрузки звонков с API
  const loadCalls = async (source?: 'all' | 'cloud' | 'local') => {
    setIsLoading(true);
    const sourceToUse = source || dataSource;
    try {
      // Загружаем звонки из API
      const callsData = await fetchCalls(sourceToUse);
      
      // Загружаем сохраненные результаты анализа
      const analyzedCalls = getAnalyzedCalls();
      
      // Если есть проанализированные звонки, объединяем их с полученными данными
      if (analyzedCalls.length > 0) {
        // Создаем Map для быстрого доступа к анализу по ID
        const analyzedCallsMap = new Map(analyzedCalls.map(call => [call.id, call]));
        
        // Обновляем полученные звонки данными анализа
        const mergedCalls = callsData.map(call => {
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
            };
          }
          return call;
        });
        
        console.log(`Обогащено ${mergedCalls.length} звонков данными анализа из localStorage`);
        setCalls(mergedCalls);
        
        // Обновляем глобальное состояние
        globalState.updateCalls(mergedCalls, sourceToUse);
      } else {
        setCalls(callsData);
        
        // Обновляем глобальное состояние
        globalState.updateCalls(callsData, sourceToUse);
      }
      
      toast({
        title: "Данные загружены",
        description: `Загружено ${callsData.length} звонков`,
      });
    } catch (error) {
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить данные о звонках",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCalls = calls.filter((call) => {
    // Search filter
    if (
      searchQuery &&
      !call.agent?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.customer?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Status filter
    if (statusFilter !== "all" && call.status !== statusFilter) {
      return false;
    }

    // Purpose filter
    if (
      purposeFilter !== "all" &&
      !call.purpose?.toLowerCase().includes(purposeFilter.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  // Функция обработки загрузки файла
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Проверяем формат файла
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (fileExt !== 'xlsx' && fileExt !== 'xls') {
    toast({
          title: "Неверный формат файла",
          description: "Пожалуйста, выберите файл в формате .xlsx или .xls",
          variant: "destructive",
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // Проверяем размер файла (до 10 МБ)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Файл слишком большой",
          description: "Максимальный размер файла - 10 МБ",
          variant: "destructive",
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      setSelectedFile(file);
    }
  };

  // Функция загрузки файла на сервер
  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "Файл не выбран",
        description: "Пожалуйста, выберите Excel-файл для загрузки",
        variant: "destructive",
      });
      return;
    }

    setIsFileUploading(true);
    setUploadProgress(10); // Начальный прогресс

    try {
      // Имитируем прогресс загрузки
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      // Загружаем файл
      const result = await uploadFile(selectedFile);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result.error) {
        setUploadResult({
          success: false,
          message: result.error,
        });
        toast({
          title: "Ошибка загрузки",
          description: result.error,
          variant: "destructive",
        });
      } else {
        setUploadResult({
          success: true,
          message: result.message || result.warning || "Файл успешно загружен",
          rows: result.rows,
          transcribe_count: result.transcribe_count,
        });
        
        toast({
          title: "Файл загружен",
          description: `${result.message || "Файл успешно загружен"} (${result.rows || 0} звонков)`,
        });

        // Перезагружаем данные через небольшую задержку
        setTimeout(() => {
          loadCalls();
        }, 1000);
      }
    } catch (error) {
      setUploadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
      
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить файл: " + (error instanceof Error ? error.message : 'Неизвестная ошибка'),
        variant: "destructive",
      });
    } finally {
      setIsFileUploading(false);
      // Сбрасываем выбранный файл через timeout для лучшего UX
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setSelectedFile(null);
      }, 3000);
    }
  };

  const openFileDialog = () => {
    setIsFileDialogOpen(true);
    setUploadResult(null);
    setUploadProgress(0);
    setSelectedFile(null);
  };

  const handleProcessAll = async () => {
    setIsProcessing(true);
    try {
      const result = await processAllCalls();
      toast({
        title: "Обработка звонков",
        description: result.message,
      });
      // Перезагрузка данных после обработки
      await loadCalls();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось обработать звонки",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Импорт из локальной папки uploads/Записи
  // Функции для смены источника данных
  const handleLoadAllCalls = async () => {
    setDataSource('all');
    await loadCalls('all');
  };

  const handleLoadCloudCalls = async () => {
    setDataSource('cloud');
    await loadCalls('cloud');
  };

  const handleLoadLocalCalls = async () => {
    setDataSource('local');
    await loadCalls('local');
  };

  const handleImportFromFolder = async () => {
    if (isFolderImporting) return;
    setIsFolderImporting(true);
    setFolderImportResult(null);
    try {
      const result = await importFromFolder({
        // По умолчанию сервер возьмёт uploads/Записи
        extensions: ['.wav', '.mp3', '.ogg'],
        limit: 0,
        transcribe: true,
        analyze: false,
      });
      if (result.error) {
        setFolderImportResult({ success: false, message: result.error });
        toast({ title: 'Ошибка импорта', description: result.error, variant: 'destructive' });
      } else {
        setFolderImportResult({
          success: true,
          message: 'Импорт выполнен',
          imported: result.imported,
          transcribed: result.transcribed,
          analyzed: result.analyzed,
        });
        toast({
          title: 'Импорт завершён',
          description: `Импортировано: ${result.imported || 0}`,
        });
        
        // После импорта автоматически переключаемся на локальные записи
        setDataSource('local');
        await loadCalls('local');
        
        toast({
          title: "Переключено на локальные записи",
          description: `Импортировано ${result.imported} файлов, показаны только локальные записи`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      setFolderImportResult({ success: false, message: msg });
      toast({ title: 'Ошибка импорта', description: msg, variant: 'destructive' });
    } finally {
      setIsFolderImporting(false);
    }
  };

  const handleAnalysisSubmit = async () => {
    if (isAnalysisLoading || selectedCallIds.length === 0) return;
    
    // Если нет предварительного анализа и не заданы свои вопросы — делаем превью-анализ
    if (!previewResult && !customKeyQuestions.some(q => q.trim())) {
      setIsPreviewAnalyzing(true);
      try {
        const result = await previewAnalyzeCalls(calls);
        if (result && !result.error) {
          setPreviewResult(result);
          handlePreviewAnalysisResult(result);
        }
      } catch (error) {
        console.error("Ошибка при выполнении предварительного анализа:", error);
      } finally {
        setIsPreviewAnalyzing(false);
      }
    }
    
    setIsAnalysisLoading(true);
    
    try {
      // 1) Определяем и фиксируем ключевые вопросы (если заданы вручную, иначе из превью)
      const effectiveKeyQuestions = customKeyQuestions.some(q => q.trim())
        ? customKeyQuestions.filter(q => q.trim()).slice(0, 3)
        : (previewResult?.keyQuestions || []);
      if (effectiveKeyQuestions.length > 0) {
        setPreviewResult(prev => ({
          previewReport: prev?.previewReport || "",
          llmAdvice: prev?.llmAdvice || "",
          keyQuestions: effectiveKeyQuestions
        }));
      }

      // 2) Запускаем анализ по ключевым вопросам и/или по пользовательскому промпту
      let analyzedAll: Call[] = [];
      if (effectiveKeyQuestions.length > 0) {
        const byQuestions = await analyzeCalls(selectedCallIds, effectiveKeyQuestions);
        analyzedAll = analyzedAll.concat(byQuestions);
      }
      if (analysisPrompt && analysisPrompt.trim()) {
        const byPrompt = await customAnalyzeCalls(selectedCallIds, analysisPrompt.trim());
        analyzedAll = analyzedAll.concat(byPrompt);
      }

      if (analyzedAll.length === 0) {
        throw new Error("Нет результатов анализа");
      }

      // 3) Обновляем состояние звонков результатами анализов (мерджим поля)
      let updatedCalls: Call[] = [];
      setCalls(prevCalls => {
        updatedCalls = prevCalls.map(call => {
          const analyzed = analyzedAll.find(ac => ac.id === call.id);
          if (!analyzed) return call;
          const fieldsToUpdate = [
            'aiSummary', 'keyInsight', 'recommendation', 'score', 'callType', 'callResult',
            'tags', 'supportingQuote', 'customResponse', 'evaluation', 'keyPoints', 'issues',
            'objections', 'rejectionReasons', 'painPoints', 'customerRequests',
            'managerPerformance', 'customerPotential', 'salesReadiness', 'conversionProbability',
            'nextSteps', 'keyQuestion1Answer', 'keyQuestion2Answer', 'keyQuestion3Answer',
            'clientInterests', 'decisionFactors'
          ];
          const updatedCall = { ...call };
          fieldsToUpdate.forEach(field => {
            if ((analyzed as any)[field] !== undefined && (analyzed as any)[field] !== null) {
              (updatedCall as any)[field] = (analyzed as any)[field];
            }
          });
          if (analysisPrompt && analysisPrompt.trim() && !updatedCall.customResponse) {
            updatedCall.customResponse = `Ответ на запрос "${analysisPrompt}": ${
              analyzed.keyInsight || analyzed.evaluation || analyzed.keyPoints || 'Информация недоступна'
            }`;
          }
          if ((analyzed as any).analysis) {
            const analysisObj = (analyzed as any).analysis;
            Object.keys(analysisObj).forEach(key => {
              if ((updatedCall as any)[key] === undefined && analysisObj[key] !== undefined) {
                (updatedCall as any)[key] = analysisObj[key];
              }
            });
          }
          return updatedCall;
        });
        notifyDashboardUpdate(updatedCalls);
        return updatedCalls;
      });

      // 4) Агрегированные метрики и уведомление
      const agg = generateAnalysisResults(analyzedAll as Call[]);
      setAnalysisResults(agg);
      toast({
        title: "Анализ завершен",
        description: `Проанализировано ${analyzedAll.length} результатов`,
        action: (
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-primary text-white px-3 py-1 rounded-md text-xs hover:bg-primary/90"
          >
            Открыть дашборд
          </button>
        ),
      });
      
      // После анализа автоматически переходим на вкладку "Анализ"
      setActiveTab("analysis");
    } catch (error) {
      console.error("Ошибка анализа:", error);
      toast({
        title: "Ошибка анализа",
        description: "Не удалось выполнить анализ звонков",
        variant: "destructive",
      });
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  // Генерация результатов анализа на основе полученных данных
  const generateAnalysisResults = (analyzedCalls: Call[]): AnalysisResults => {
    console.log("Генерация аналитических результатов на основе:", analyzedCalls);
    
    // Подсчитываем статистику по результатам анализа
    const totalCalls = analyzedCalls.length;
    if (totalCalls === 0) return {
      keyInsights: [],
      successFactors: [],
      problems: [],
      recommendations: [],
      tags: {}
    };
    
    // Группируем звонки по типу
    const typeGroups: Record<string, number> = {};
    analyzedCalls.forEach(call => {
      if (call.callType) {
        typeGroups[call.callType] = (typeGroups[call.callType] || 0) + 1;
      }
    });
    
    // Группируем звонки по результату
    const resultGroups: Record<string, number> = {};
    analyzedCalls.forEach(call => {
      if (call.callResult) {
        resultGroups[call.callResult] = (resultGroups[call.callResult] || 0) + 1;
      }
    });
    
    // Собираем расширенную аналитику и печатаем в консоль для отладки
    console.log("Расширенные метрики:");
    // Готовность к продаже
    const salesReadinessTotal = analyzedCalls.reduce((sum, call) => 
      sum + (call.salesReadiness || 0), 0);
    const avgSalesReadiness = salesReadinessTotal / totalCalls;
    console.log(`Средняя готовность к продаже: ${avgSalesReadiness.toFixed(1)}`);
    
    // Вероятность конверсии
    const conversionTotal = analyzedCalls.reduce((sum, call) => 
      sum + (call.conversionProbability || 0), 0);
    const avgConversion = conversionTotal / totalCalls;
    console.log(`Средняя вероятность конверсии: ${avgConversion.toFixed(1)}%`);
    
    // Потенциал клиентов
    const potentialTotal = analyzedCalls.reduce((sum, call) => 
      sum + (call.customerPotential?.score || 0), 0);
    const avgPotential = potentialTotal / totalCalls;
    console.log(`Средний потенциал клиентов: ${avgPotential.toFixed(1)}`);
    
    // Оценка менеджеров
    const managerTotal = analyzedCalls.reduce((sum, call) => 
      sum + (call.managerPerformance?.общая_оценка || 0), 0);
    const avgManager = managerTotal / totalCalls;
    console.log(`Средняя оценка менеджеров: ${avgManager.toFixed(1)}`);
    
    // Возражения
    const allObjections: string[] = [];
    analyzedCalls.forEach(call => {
      if (call.objections && Array.isArray(call.objections)) {
        allObjections.push(...call.objections);
      }
    });
    console.log(`Возражения: ${allObjections.join(', ')}`);
    
    // Ключевые вопросы
    console.log("Ответы на ключевые вопросы:");
    analyzedCalls.forEach(call => {
      console.log(`Звонок ${call.id}:`);
      console.log(`  Вопрос 1: ${call.keyQuestion1Answer || 'Нет ответа'}`);
      console.log(`  Вопрос 2: ${call.keyQuestion2Answer || 'Нет ответа'}`);
      console.log(`  Вопрос 3: ${call.keyQuestion3Answer || 'Нет ответа'}`);
    });
    
    // Формируем метрики для визуализации
    const metricsData: any[] = [];
    
    // Типы звонков
    if (Object.keys(typeGroups).length > 0) {
      metricsData.push({
        title: "Типы звонков",
        type: "pie",
        data: Object.entries(typeGroups).map(([name, value]) => ({
          name,
          value,
          percentage: (value / totalCalls * 100).toFixed(1)
        }))
      });
    }
    
    // Результаты звонков
    if (Object.keys(resultGroups).length > 0) {
      metricsData.push({
        title: "Результаты звонков",
        type: "pie",
        data: Object.entries(resultGroups).map(([name, value]) => ({
          name,
          value,
          percentage: (value / totalCalls * 100).toFixed(1)
        }))
      });
    }
    
    // Средние показатели
    const averageMetrics = [
      { name: "Оценка звонка", value: +(analyzedCalls.reduce((sum, call) => sum + (call.score || 0), 0) / totalCalls).toFixed(1) },
      { name: "Готовность к продаже", value: +avgSalesReadiness.toFixed(1) },
      { name: "Вероятность конверсии", value: +avgConversion.toFixed(1) },
      { name: "Потенциал клиента", value: +avgPotential.toFixed(1) },
      { name: "Оценка менеджера", value: +avgManager.toFixed(1) }
    ];
    
    metricsData.push({
      title: "Средние показатели",
      type: "bar",
      data: averageMetrics
    });
    
    // Возвращаем сформированные данные для анализа
    return {
      keyInsights: analyzedCalls.map(call => call.keyInsight || call.keyPoints).filter(Boolean),
      successFactors: analyzedCalls.filter(call => call.score && call.score >= 7).map(call => call.keyInsight || call.keyPoints || '').filter(Boolean),
      problems: analyzedCalls.filter(call => call.callResult === "неуспешный" || call.status === "неуспешный").map(call => call.aiSummary || '').filter(Boolean),
      recommendations: analyzedCalls.map(call => call.recommendation || (call as any).recommendations).filter(Boolean),
      tags: analyzedCalls.reduce((tags, call) => {
        if (call.tags && Array.isArray(call.tags)) {
          tags[call.id] = tags[call.id] || [];
          call.tags.forEach(tag => {
            if (tag) {
              tags[call.id].push(tag);
            }
          });
        }
        return tags;
      }, {} as CallTag)
    };
  };

  const handleCallSelect = (callId: string, selected: boolean) => {
    if (selected) {
      const newSelectedIds = [...selectedCallIds, callId];
      setSelectedCallIds(newSelectedIds);
      globalState.updateSelection(newSelectedIds);
    } else {
      const newSelectedIds = selectedCallIds.filter(id => id !== callId);
      setSelectedCallIds(newSelectedIds);
      globalState.updateSelection(newSelectedIds);
    }
  };

  const selectAllCalls = (selected: boolean) => {
    let newSelectedIds: string[];
    if (selected) {
      newSelectedIds = filteredCalls.map(call => call.id);
    } else {
      newSelectedIds = [];
    }
    setSelectedCallIds(newSelectedIds);
    globalState.updateSelection(newSelectedIds);
  };

  const handleTranscribe = async () => {
    if (selectedCallIds.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите звонки для транскрибации",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const results = await transcribeCalls(selectedCallIds, forceRetranscribe);
      
      if (results.message) {
        console.log("Информация об обработке:", results.message);
      }
      
      // Обновляем звонки с транскрипциями
      setCalls(prevCalls => 
        prevCalls.map(call => {
          const processed = results.find(r => r.id === call.id);
          if (processed) {
            if (processed.status === "success") {
        return {
          ...call,
                transcription: processed.transcription 
              };
            } else if (processed.status === "existing") {
              // Это звонок с уже существующей транскрипцией
              if (call.transcription !== processed.transcription) {
                return {
                  ...call,
                  transcription: processed.transcription
                };
              }
            }
          }
          return call;
        })
      );

      toast({
        title: "Обработка завершена",
        description: results.message || `Обработано ${results.length} звонков`,
      });
    } catch (error) {
      toast({
        title: "Ошибка транскрибации",
        description: "Не удалось обработать звонки",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderTagDistribution = () => {
    // Проверяем наличие тегов в analysisResults
    if (!analysisResults.tags || Object.keys(analysisResults.tags).length === 0) {
      if (isAnalysisLoading) {
      return (
        <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
            Анализ данных...
          </div>
        );
      }
      return (
        <div className="text-center py-8 text-muted-foreground">
          Выполните анализ звонков, чтобы увидеть распределение тегов
        </div>
      );
    }
    
    // Подсчитываем количество каждого тега
    const tagCounts: {[tag: string]: number} = {};
    Object.values(analysisResults.tags).forEach((tags) => {
      // Убедимся, что tags - это массив
      if (Array.isArray(tags)) {
      tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    // Если после обработки тегов их не оказалось, показываем сообщение
    if (Object.keys(tagCounts).length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Не удалось извлечь теги из анализа. Попробуйте другой запрос.
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(tagCounts).map(([tag, count], index) => (
          <div key={index} className="bg-slate-50 rounded-lg p-3 border">
            <div className="flex justify-between items-center">
              <span className="font-medium">{tag}</span>
              <Badge variant="outline" className="bg-blue-50">
                {count} звонков
              </Badge>
            </div>
            <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full" 
                style={{ width: `${Math.min(100, (Number(count) / Object.values(analysisResults.tags).length * 100))}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // В функции handleAnalysisSubmit добавим вызов для очистки сохраненных результатов
  const handleClearAnalysis = () => {
    try {
      clearAnalyzedCalls();
      // Перезагружаем данные без результатов анализа
      loadCalls();
      toast({
        title: "Анализ очищен",
        description: "Сохраненные результаты анализа были удалены",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось очистить результаты анализа",
        variant: "destructive",
      });
    }
  };

  // Обработчик результатов предварительного анализа
  const handlePreviewAnalysisResult = (result: PreviewAnalysisResult) => {
    setPreviewResult(result);
    
    // Обновляем заголовки колонок ключевых вопросов, если они доступны
    if (result.keyQuestions && result.keyQuestions.length >= 3) {
      // Сохраняем ключевые вопросы для передачи в таблицу
      console.log("Ключевые вопросы для анализа:", result.keyQuestions);
    }
  };
  
  // Функция для добавления ответа на ключевой вопрос к звонку
  const addKeyQuestionAnswer = (callId: string, questionIndex: number, answer: string) => {
    const field = 
      questionIndex === 0 ? "keyQuestion1Answer" : 
      questionIndex === 1 ? "keyQuestion2Answer" : "keyQuestion3Answer";
    
    setCalls(prevCalls => 
      prevCalls.map(call => 
        call.id === callId ? { ...call, [field]: answer } : call
      )
    );
  };

  const handleAnalyze = async () => {
    if (selectedCallIds.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите звонки для анализа",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      // Передаем ключевые вопросы из результатов предварительного анализа
      const results = await analyzeCalls(selectedCallIds, previewResult?.keyQuestions);
      
      // Уведомляем глобальное состояние о завершении анализа
      globalState.completeAnalysis(results);
      
      // Обновляем данные звонков с результатами анализа
      const updatedCalls = calls.map(call => {
        const analyzed = results.find(r => r.id === call.id);
        if (analyzed) {
          return {
            ...call,
            aiSummary: analyzed.aiSummary || call.aiSummary,
            keyInsight: analyzed.keyInsight || call.keyInsight,
            recommendation: analyzed.recommendation || call.recommendation,
            score: analyzed.score || call.score,
            callType: analyzed.callType || call.callType,
            callResult: analyzed.callResult || call.callResult,
            tags: analyzed.tags || call.tags,
            supportingQuote: analyzed.supportingQuote || call.supportingQuote,
            qualityMetrics: analyzed.qualityMetrics || call.qualityMetrics,
            objections: analyzed.objections || call.objections,
            rejectionReasons: analyzed.rejectionReasons || call.rejectionReasons,
            painPoints: analyzed.painPoints || call.painPoints,
            customerRequests: analyzed.customerRequests || call.customerRequests,
            managerPerformance: analyzed.managerPerformance || call.managerPerformance,
            customerPotential: analyzed.customerPotential || call.customerPotential,
            salesReadiness: analyzed.salesReadiness || call.salesReadiness,
            conversionProbability: analyzed.conversionProbability || call.conversionProbability,
            nextSteps: analyzed.nextSteps || call.nextSteps,
            // Добавляем ответы на ключевые вопросы
            keyQuestion1Answer: analyzed.keyQuestion1Answer || call.keyQuestion1Answer,
            keyQuestion2Answer: analyzed.keyQuestion2Answer || call.keyQuestion2Answer,
            keyQuestion3Answer: analyzed.keyQuestion3Answer || call.keyQuestion3Answer,
            // Добавляем пользовательский ответ
            customResponse: `Ответ на предварительный анализ: ${analyzed.keyInsight || "Информация недоступна"}`
          };
        }
        return call;
      });
      
      setCalls(updatedCalls);
      
      // Уведомляем дашборд о новых данных
      notifyDashboardUpdate(updatedCalls);
      
      toast({
        title: "Анализ завершен",
        description: `Проанализировано ${results.length} звонков`,
        action: (
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-primary text-white px-3 py-1 rounded-md text-xs hover:bg-primary/90"
          >
            Открыть дашборд
          </button>
        ),
      });
    } catch (error) {
      toast({
        title: "Ошибка анализа",
        description: "Не удалось выполнить анализ звонков",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Функция для уведомления дашборда об обновлении данных
  const notifyDashboardUpdate = (updatedCalls: Call[]) => {
    console.log("Отправка события обновления дашборда с данными", updatedCalls.length);
    
    // Создаем новое кастомное событие с данными
    const updateEvent = new CustomEvent('dashboard-update', {
      detail: {
        calls: updatedCalls
      }
    });
    
    // Отправляем событие для обновления дашборда
    window.dispatchEvent(updateEvent);
    
    // Показываем уведомление
    toast({
      title: "Дашборд обновлен",
      description: "Статистика дашборда будет обновлена при следующем открытии",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Звонки</h2>
        <p className="text-muted-foreground">
          Просмотр и анализ детальной информации по звонкам
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="calls">Таблица звонков</TabsTrigger>
          <TabsTrigger value="analysis">Анализ звонков</TabsTrigger>
        </TabsList>
        
        <TabsContent value="calls" className="space-y-4">
          <div className="mb-4">
            <p className="text-lg font-semibold">
              Источник: {
                dataSource === 'all' ? '🌐 Все записи' :
                dataSource === 'cloud' ? '☁️ Облачные записи' :
                '📁 Локальные записи'
              } ({calls.length} записей)
            </p>
          </div>
          
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по менеджеру или клиенту..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Статус звонка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="успешный">Успешный</SelectItem>
                  <SelectItem value="неуспешный">Неуспешный</SelectItem>
                  <SelectItem value="требует внимания">Требует внимания</SelectItem>
                </SelectContent>
              </Select>
              <Select value={purposeFilter} onValueChange={setPurposeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Цель звонка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все цели</SelectItem>
                  <SelectItem value="консультация">Консультация</SelectItem>
                  <SelectItem value="оформление заказа">Оформление заказа</SelectItem>
                  <SelectItem value="претензии">Претензии</SelectItem>
                  <SelectItem value="техническая поддержка">Техническая поддержка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={openFileDialog}
                disabled={isFileUploading}
              >
                {isFileUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                <Upload className="h-4 w-4 mr-2" />
                )}
                Загрузить Excel
              </Button>
                            <Button 
                variant="outline" 
                onClick={handleImportFromFolder}
                disabled={isFolderImporting}
                title="Импортировать аудио из локальной папки uploads/Записи"
              >
                {isFolderImporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Импорт из папки
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant={dataSource === 'all' ? 'default' : 'outline'}
                  onClick={handleLoadAllCalls}
                  title="Показать все звонки (облачные + локальные)"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Все звонки
                </Button>
                <Button 
                  variant={dataSource === 'cloud' ? 'default' : 'outline'}
                  onClick={handleLoadCloudCalls}
                  title="Показать только облачные записи (Yandex Cloud)"
                >
                  ☁️ Облачные
                </Button>
                <Button 
                  variant={dataSource === 'local' ? 'default' : 'outline'}
                  onClick={handleLoadLocalCalls}
                  title="Показать только локальные записи"
                >
                  📁 Локальные
                </Button>
              </div>
              <Button 
                variant="outline" 
                onClick={handleProcessAll} 
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                <FileText className="h-4 w-4 mr-2" />
                )}
                Обработать Excel
              </Button>
              <Button 
                variant="outline" 
                                  onClick={() => loadCalls()} 
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ChartBar className="h-4 w-4 mr-2" />
                )}
                Обновить данные
              </Button>
            </div>
            {folderImportResult && (
              <div className={cn(
                "mt-2 text-sm",
                folderImportResult.success ? "text-green-700" : "text-red-700"
              )}>
                {folderImportResult.message}
                {folderImportResult.success && (
                  <span className="ml-2 text-muted-foreground">
                    (импортировано: {folderImportResult.imported || 0}, транскрибировано: {folderImportResult.transcribed || 0}, проанализировано: {folderImportResult.analyzed || 0})
                  </span>
                )}
              </div>
            )}
          </div>
          
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-medium">Обработка звонков</CardTitle>
              <CardDescription>
                Выберите звонки и выполните необходимые действия
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="select-all" 
                    checked={selectedCallIds.length === filteredCalls.length && filteredCalls.length > 0}
                    onCheckedChange={(checked) => selectAllCalls(!!checked)}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium">
                    Выбрать все ({filteredCalls.length})
                  </label>
              </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="force-retranscribe"
                    checked={forceRetranscribe}
                    onCheckedChange={(checked) => setForceRetranscribe(!!checked)}
                  />
                  <label htmlFor="force-retranscribe" className="text-sm font-medium">
                    Принудительная ретранскрибация
                  </label>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleTranscribe}
                    disabled={isProcessing || selectedCallIds.length === 0}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {forceRetranscribe ? "Ретранскрибировать" : "Транскрибировать"}
                  </Button>
                <Button 
                  onClick={handleAnalysisSubmit}
                    disabled={isAnalysisLoading}
                  >
                    {isAnalysisLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Анализировать
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleClearAnalysis}
                  title="Очистить сохраненные результаты анализа"
                >
                  <X className="h-4 w-4 mr-2" />
                  Очистить анализ
                </Button>
                </div>
              </div>
              <div className="mt-4">
                <Textarea 
                  placeholder="Введите запрос для анализа, например: 'Проанализируй эффективность звонков и дай рекомендации по улучшению'"
                  value={analysisPrompt}
                  onChange={(e) => setAnalysisPrompt(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[0,1,2].map((i) => (
                  <Input
                    key={`kq-${i}`}
                    placeholder={`Кастомный вопрос ${i+1} (необязательно)`}
                    value={customKeyQuestions[i] || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomKeyQuestions((prev) => {
                        const copy = [...prev];
                        copy[i] = v;
                        return copy;
                      });
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Добавляем компонент предварительного анализа на вкладку "Таблица звонков" */}
          <PreviewAnalysis 
            calls={calls}
            onAnalyze={handlePreviewAnalysisResult}
            isLoading={isPreviewAnalyzing}
            previewResult={previewResult}
          />

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-lg">Загрузка звонков...</span>
            </div>
          ) : (
          <CallsTable 
              calls={filteredCalls}
              title={`Все звонки (${filteredCalls.length})`}
              selectedCallIds={selectedCallIds}
              onCallSelect={handleCallSelect}
              keyQuestions={(customKeyQuestions.some(q => q.trim()) ? customKeyQuestions.filter(q=>q.trim()).slice(0,3) : (previewResult?.keyQuestions || []))}
            />
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Левая колонка - форма запроса и LLM-заполняемые поля */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Анализ звонков по запросу</CardTitle>
                  <CardDescription>
                    Ответы на пользовательский запрос по анализу выбранных звонков
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="text-sm text-muted-foreground">
                        Выбрано звонков: {selectedCallIds.length}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Brain className="h-4 w-4 text-primary mr-2" />
                    <CardTitle>Заполняемые поля</CardTitle>
                  </div>
                  <CardDescription>
                    Эти поля заполняются на основе вашего запроса к LLM
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(customFields).map(([key, field]) => (
                    <div key={key} className="space-y-2">
                      <div className="font-medium text-sm text-muted-foreground">{field.label}</div>
                      <Textarea 
                        placeholder={`Введите запрос для заполнения поля "${field.label}"`}
                        value={field.value}
                        readOnly
                        className="min-h-[80px] bg-slate-50"
                      />
                    </div>
                  ))}
                </CardContent>
                <CardFooter>
                  <p className="text-xs text-muted-foreground">
                    Для заполнения полей используйте ключевые слова в запросе (например, "паттерны", "факторы успеха", "рекомендации").
                  </p>
                </CardFooter>
              </Card>
            </div>
            
            {/* Правая колонка - результаты анализа и визуализация */}
            <div className="space-y-4">
              <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Результаты анализа</CardTitle>
                  <CardDescription>
                    Анализ выбранных звонков с использованием LLM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedCallIds.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <CustomField
                          label={customFields.field1.label}
                          value={customFields.field1.value}
                        />
                        <CustomField
                          label={customFields.field2.label}
                          value={customFields.field2.value}
                        />
                        <CustomField
                          label={customFields.field3.label}
                          value={customFields.field3.value}
                        />
                    </div>
                      <Button 
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="mr-2"
                      >
                        {isAnalyzing && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Анализировать выбранные звонки
                      </Button>
                      
                      {/* Отображение аналитических метрик */}
                      {analyticsData && analyticsData.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-lg font-semibold mb-4">Аналитические метрики</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {analyticsData.map((metric, idx) => (
                              <Card key={idx} className="overflow-hidden">
                                <CardHeader className="p-4 pb-2">
                                  <CardTitle className="text-md">{metric.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                  {metric.type === 'pie' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                                        {/* Имитация пирожковой диаграммы */}
                                        <div className="w-full h-32 rounded-md flex items-center justify-center bg-slate-50 mb-2">
                                          <div className="grid grid-cols-2 gap-1">
                                            {metric.data.map((item: any, i: number) => (
                                              <div 
                                                key={i} 
                                                className="w-12 h-12 rounded-full" 
                                                style={{ 
                                                  backgroundColor: ['#4688F1', '#E8453C', '#F9BB2D', '#3AA757'][i % 4] 
                                                }}
                                              ></div>
                                            ))}
                      </div>
                                        </div>
                                      </div>
                      <div>
                                        <ul className="space-y-1">
                                          {metric.data.map((item: any, i: number) => (
                                            <li key={i} className="flex items-center text-sm">
                                              <span 
                                                className="w-3 h-3 rounded-full mr-2"
                                                style={{ 
                                                  backgroundColor: ['#4688F1', '#E8453C', '#F9BB2D', '#3AA757'][i % 4] 
                                                }}
                                              ></span>
                                              <span className="flex-1">{item.name}</span>
                                              <span className="text-xs text-gray-500">
                                                {item.value} ({item.percentage}%)
                                              </span>
                                            </li>
                                          ))}
                        </ul>
                      </div>
                    </div>
                                  )}
                                  
                                  {metric.type === 'bar' && (
                                    <div className="space-y-4">
                                      {metric.data.map((item: any, i: number) => (
                                        <div key={i}>
                                          <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm">{item.name}</span>
                                            <span className="text-xs font-medium">{item.value}/10</span>
                                          </div>
                                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div 
                                              className={cn(
                                                "h-2.5 rounded-full",
                                                item.value >= 7 ? "bg-green-600" :
                                                item.value >= 5 ? "bg-yellow-400" : "bg-red-600"
                                              )}
                                              style={{ width: `${(item.value / 10) * 100}%` }}
                                            ></div>
                    </div>
                  </div>
                                      ))}
                                    </div>
                                  )}
                </CardContent>
              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                      
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <span className="text-muted-foreground">
                        Выберите звонки для анализа во вкладке "Звонки"
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Карточка с распределением тегов */}
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <BarChart4 className="h-4 w-4 text-primary mr-2" />
                    <CardTitle>Распределение тегов</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {renderTagDistribution()}
                </CardContent>
              </Card>
            </div>
          </div>
          
          <CustomPromptAnalysis 
            isLoading={isAnalysisLoading}
            analysisResults={analysisResults}
            analyzedCalls={calls.filter(call => selectedCallIds.includes(call.id))}
            customFields={customFields}
          />
        </TabsContent>
      </Tabs>

      {/* Диалог загрузки файла */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Загрузка Excel-файла со звонками</DialogTitle>
            <DialogDescription>
              Загрузите файл в формате .xlsx или .xls с данными о звонках для анализа. 
              Файл должен содержать столбцы "Ссылка на запись" и "Транскрибация".
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={isFileUploading}
              />
                  </div>
            
            {selectedFile && (
              <div className="text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Размер файла: {(selectedFile.size / 1024 / 1024).toFixed(2)} МБ | 
                  Тип: {selectedFile.type || 'Excel (.xlsx/.xls)'}
                </div>
              </div>
            )}
            
            {isFileUploading && (
                  <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Загрузка и обработка файла...</span>
                  <span>{uploadProgress}%</span>
                          </div>
                <Progress value={uploadProgress} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1">
                  {uploadProgress < 50 ? 'Загрузка файла на сервер...' : 
                   uploadProgress < 90 ? 'Обработка данных из файла...' : 
                   'Завершение обработки...'}
                        </div>
                      </div>
                    )}
            
            {uploadResult && (
              <Alert variant={uploadResult.success ? "default" : "destructive"}>
                <div className="flex items-center gap-2">
                  {uploadResult.success ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  <AlertTitle>{uploadResult.success ? "Успешно" : "Ошибка"}</AlertTitle>
                  </div>
                <AlertDescription className="mt-2">
                  {uploadResult.message}
                  {uploadResult.rows && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1">
                        <ChartBar className="h-4 w-4 text-green-500" />
                        <span>Всего звонков в файле: {uploadResult.rows}</span>
            </div>
                      {uploadResult.transcribe_count !== undefined && (
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4 text-amber-500" />
                          <span>Звонков для транскрибации: {uploadResult.transcribe_count}</span>
                        </div>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter className="sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setIsFileDialogOpen(false)}
              disabled={isFileUploading}
            >
              Отмена
            </Button>
            <Button 
              onClick={handleFileUpload} 
              disabled={!selectedFile || isFileUploading}
            >
              {isFileUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Загрузить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calls;
