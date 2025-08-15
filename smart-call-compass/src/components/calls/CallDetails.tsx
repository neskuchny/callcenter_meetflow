import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Call } from "./CallsTable";
import { Clock, PhoneCall, Tag, BarChart, AlertCircle, Target, Zap, CalendarClock, User, TrendingUp, ListChecks, Scale } from "lucide-react";

interface CallDetailsProps {
  call: Call;
}

const CallDetails = ({ call }: CallDetailsProps) => {
  // Формируем анализ звонка на основе данных LLM
  const callAnalysis = {
    summary: call.aiSummary || "Анализ не проводился",
    keyPoints: [
      call.keyInsight || "Ключевые выводы отсутствуют"
    ],
    quotes: [],
    improvements: [
      call.recommendation || "Рекомендации отсутствуют"
    ],
    sentiment: {
      overall: call.score && call.score >= 7 ? "положительный" : call.score && call.score >= 5 ? "нейтральный" : "отрицательный",
      client: "не определено",
      agent: "не определено"
    },
    transcript: call.transcription || "Транскрипция отсутствует",
    type: call.callType || "не определен",
    result: call.callResult || "не определен",
    tags: call.tags || [],
    supportingQuote: call.supportingQuote || "",
    qualityMetrics: call.qualityMetrics || {},
    
    // Новые поля расширенной аналитики
    objections: call.objections || [],
    rejectionReasons: call.rejectionReasons || [],
    painPoints: call.painPoints || [],
    customerRequests: call.customerRequests || [],
    managerPerformance: {
      score: call.managerPerformance && 'общая_оценка' in call.managerPerformance ? 
        (call.managerPerformance.общая_оценка || 0) : 
        (call.managerPerformance && 'score' in call.managerPerformance ? call.managerPerformance.score : 0),
      details: call.managerPerformance && 'details' in call.managerPerformance ? 
        call.managerPerformance.details : "Нет данных"
    },
    customerPotential: {
      score: call.customerPotential && 'score' in call.customerPotential ? 
        (call.customerPotential.score || 0) : 0,
      details: call.customerPotential && 'reason' in call.customerPotential ? 
        (call.customerPotential.reason || "Нет данных") : 
        (call.customerPotential && 'details' in call.customerPotential ? call.customerPotential.details : "Нет данных")
    },
    salesReadiness: call.salesReadiness || 0,
    conversionProbability: call.conversionProbability || 0,
    nextSteps: call.nextSteps || "Не определены",
    
    // Новые поля для интересов клиента и факторов принятия решения
    clientInterests: call.clientInterests || [],
    decisionFactors: call.decisionFactors || { positive: [], negative: [] }
  };

  // Проверяем наличие транскрипции
  const hasTranscription = call.transcription && call.transcription !== "-";
  const hasAnalysis = !!call.score;
  const hasAdvancedAnalysis = !!call.salesReadiness || !!call.objections?.length || !!call.customerPotential?.score;
  const hasKeyQuestionAnswers = !!call.keyQuestion1Answer || !!call.keyQuestion2Answer || !!call.keyQuestion3Answer;

  // Форматируем транскрипцию для лучшего отображения
  const formatTranscription = (text: string) => {
    if (!text || text === "-") return "Транскрипция отсутствует";
    
    // Базовое форматирование
    let formatted = text
      .replace(/[\r\n]+/g, "\n\n") // Нормализуем переносы строк
      .trim();
    
    return formatted;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Менеджер</h3>
          <p className="mt-1 text-lg">{call.agent}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Клиент</h3>
          <p className="mt-1 text-lg">{call.customer}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Дата и время</h3>
          <p className="mt-1">{call.date}, {call.time}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Длительность</h3>
          <div className="mt-1 flex items-center">
            <Clock className="mr-1 h-4 w-4 text-muted-foreground" />
            {call.duration}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Тип звонка</h3>
          <Badge
            className={cn(
              "mt-1 px-2 py-0.5",
              "bg-blue-50 text-blue-800 hover:bg-blue-100"
            )}
            variant="outline"
          >
            {callAnalysis.type}
          </Badge>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Результат звонка</h3>
          <Badge
            className={cn(
              "mt-1 px-2 py-0.5",
              callAnalysis.result === "успешный"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : callAnalysis.result === "неуспешный"
                ? "bg-red-100 text-red-800 hover:bg-red-100"
                : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
            )}
            variant="outline"
          >
            {callAnalysis.result}
          </Badge>
        </div>
      </div>
      
      {call.recordUrl && (
        <div className="mt-4">
          <a 
            href={call.recordUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center text-primary hover:underline"
          >
            <PhoneCall className="mr-2 h-4 w-4" />
            Прослушать запись звонка
          </a>
        </div>
      )}

      <Separator />

      <Tabs defaultValue={hasTranscription ? "transcript" : "summary"}>
        <TabsList className="mb-4">
          <TabsTrigger value="summary">Резюме</TabsTrigger>
          <TabsTrigger value="transcript" disabled={!hasTranscription}>Транскрипция</TabsTrigger>
          <TabsTrigger value="analysis" disabled={!hasAnalysis}>Анализ</TabsTrigger>
          <TabsTrigger value="metrics" disabled={!hasAnalysis}>Метрики</TabsTrigger>
          <TabsTrigger value="advanced" disabled={!hasAdvancedAnalysis}>Расширенный анализ</TabsTrigger>
          <TabsTrigger value="key-questions" disabled={!hasKeyQuestionAnswers}>Ключевые вопросы</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Краткое содержание</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{callAnalysis.summary}</p>
              {call.keyInsight && (
                <>
              <h4 className="mt-4 font-medium">Ключевые моменты:</h4>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                {callAnalysis.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
                </>
              )}
              
              {callAnalysis.tags && callAnalysis.tags.length > 0 && (
                <>
                  <h4 className="mt-4 font-medium">Теги:</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {callAnalysis.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
              
              {callAnalysis.supportingQuote && (
                <>
                  <h4 className="mt-4 font-medium">Подтверждающая цитата:</h4>
                  <div className="mt-2 p-3 rounded bg-slate-50 italic text-sm">
                    "{callAnalysis.supportingQuote}"
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transcript">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Полная транскрипция</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm font-sans">{formatTranscription(call.transcription || "")}</pre>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Аналитика разговора</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="font-medium">Оценка:</h4>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between items-center">
                      <span>Общая оценка:</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          call.score && call.score >= 8 
                            ? "bg-green-100 text-green-800" 
                            : call.score && call.score >= 5 
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        )}
                      >
                        {call.score ? `${call.score}/10` : "Нет данных"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Настроение:</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          callAnalysis.sentiment.overall === "положительный"
                            ? "bg-green-100 text-green-800"
                            : callAnalysis.sentiment.overall === "нейтральный"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        )}
                      >
                        {callAnalysis.sentiment.overall}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium">Ключевой вывод:</h4>
                  <div className="mt-2 p-3 rounded bg-slate-50">
                    {call.keyInsight || "Ключевой вывод не определен"}
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <h4 className="font-medium">Рекомендация:</h4>
                <div className="mt-2 p-3 rounded bg-slate-50">
                  {call.recommendation || "Рекомендация не сформирована"}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <BarChart className="h-5 w-5 mr-2 text-primary" />
                <CardTitle className="text-lg">Метрики качества</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {Object.keys(callAnalysis.qualityMetrics).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(callAnalysis.qualityMetrics).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-sm font-medium capitalize">
                          {key.replace(/_/g, ' ')}:
                        </div>
                        <div className="text-sm font-medium">
                          {typeof value === 'number' ? 
                            <Badge 
                              variant="outline" 
                              className={cn(
                                value >= 8 ? "bg-green-100 text-green-800" :
                                value >= 5 ? "bg-yellow-100 text-yellow-800" :
                                "bg-red-100 text-red-800"
                              )}
                            >
                              {value}/10
                            </Badge> : 
                            <span>{value}</span>
                          }
                        </div>
                      </div>
                      {typeof value === 'number' && (
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div 
                            className={cn(
                              "h-2 rounded-full",
                              value >= 8 ? "bg-green-500" :
                              value >= 5 ? "bg-yellow-500" :
                              "bg-red-500"
                            )} 
                            style={{ width: `${Math.min(100, value * 10)}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Метрики качества отсутствуют
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Новая вкладка с расширенной аналитикой */}
        <TabsContent value="advanced">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Левая колонка с оценками и прогрессами */}
            <div className="space-y-4">
              {/* Карточка готовности к продаже */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <Target className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Готовность к продаже</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full border-8 flex items-center justify-center mb-2
                      border-slate-200 relative">
                      <div className="absolute inset-0 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "absolute bottom-0 w-full",
                            callAnalysis.salesReadiness >= 8 ? "bg-green-500" :
                            callAnalysis.salesReadiness >= 5 ? "bg-yellow-500" :
                            "bg-red-500"
                          )}
                          style={{ height: `${(callAnalysis.salesReadiness / 10) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-2xl font-bold z-10">
                        {callAnalysis.salesReadiness}/10
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Оценка готовности клиента к покупке
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Карточка вероятности конверсии */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Вероятность конверсии</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="w-full bg-slate-200 rounded-full h-4 mb-2">
                      <div 
                        className={cn(
                          "h-4 rounded-full",
                          callAnalysis.conversionProbability >= 70 ? "bg-green-500" :
                          callAnalysis.conversionProbability >= 40 ? "bg-yellow-500" :
                          "bg-red-500"
                        )} 
                        style={{ width: `${callAnalysis.conversionProbability}%` }}
                      ></div>
                    </div>
                    <div className="text-xl font-bold">
                      {callAnalysis.conversionProbability}%
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Вероятность успешной конверсии
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Карточка следующих шагов */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <CalendarClock className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Следующие шаги</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="p-3 rounded bg-slate-50">
                    {callAnalysis.nextSteps}
                  </div>
                </CardContent>
              </Card>

              {/* Карточка интересов клиента */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <ListChecks className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Интересы клиента</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {callAnalysis.clientInterests && callAnalysis.clientInterests.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5">
                      {callAnalysis.clientInterests.map((interest, idx) => (
                        <li key={`interest-${idx}`} className="mb-1">{interest}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      Интересы клиента не определены
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Правая колонка с возражениями и прочим */}
            <div className="space-y-4">
              {/* Карточка оценки работы менеджера */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <User className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Работа менеджера</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center mr-3 text-white font-bold",
                      callAnalysis.managerPerformance.score >= 8 ? 'bg-green-500' :
                      callAnalysis.managerPerformance.score >= 5 ? 'bg-yellow-500' :
                      'bg-red-500'
                    )}>
                      {callAnalysis.managerPerformance.score}/10
                    </div>
                    <span>{callAnalysis.managerPerformance.details}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Карточка оценки потенциала клиента */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <Zap className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Потенциал клиента</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center mr-3 text-white font-bold",
                      callAnalysis.customerPotential.score >= 8 ? 'bg-green-500' :
                      callAnalysis.customerPotential.score >= 5 ? 'bg-yellow-500' :
                      'bg-red-500'
                    )}>
                      {callAnalysis.customerPotential.score}/10
                    </div>
                    <span>{callAnalysis.customerPotential.details}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Карточка факторов принятия решения */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <Scale className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Факторы принятия решения</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(callAnalysis.decisionFactors.positive && callAnalysis.decisionFactors.positive.length > 0) && (
                    <div>
                      <h4 className="font-medium text-sm text-green-700">Положительные факторы:</h4>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {callAnalysis.decisionFactors.positive.map((factor, idx) => (
                          <li key={`positive-${idx}`} className="text-green-600">{factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {(callAnalysis.decisionFactors.negative && callAnalysis.decisionFactors.negative.length > 0) && (
                    <div>
                      <h4 className="font-medium text-sm text-red-700">Отрицательные факторы:</h4>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {callAnalysis.decisionFactors.negative.map((factor, idx) => (
                          <li key={`negative-${idx}`} className="text-red-600">{factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {(!callAnalysis.decisionFactors.positive || callAnalysis.decisionFactors.positive.length === 0) && 
                   (!callAnalysis.decisionFactors.negative || callAnalysis.decisionFactors.negative.length === 0) && (
                    <div className="text-center text-muted-foreground py-4">
                      Факторы принятия решения не определены
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Карточка возражений и проблемных мест */}
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 mr-2 text-primary" />
                    <CardTitle className="text-lg">Возражения и проблемы</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {callAnalysis.objections.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm">Возражения клиента:</h4>
                      <ul className="mt-1 mb-3 list-disc pl-5 text-sm">
                        {callAnalysis.objections.map((obj, idx) => (
                          <li key={`obj-${idx}`}>{obj}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  
                  {callAnalysis.rejectionReasons.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm">Причины отказа:</h4>
                      <ul className="mt-1 mb-3 list-disc pl-5 text-sm">
                        {callAnalysis.rejectionReasons.map((reason, idx) => (
                          <li key={`reason-${idx}`}>{reason}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  
                  {callAnalysis.painPoints.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm">Проблемные места:</h4>
                      <ul className="mt-1 mb-3 list-disc pl-5 text-sm">
                        {callAnalysis.painPoints.map((point, idx) => (
                          <li key={`pain-${idx}`}>{point}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  
                  {callAnalysis.customerRequests.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm">Запросы клиента:</h4>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {callAnalysis.customerRequests.map((req, idx) => (
                          <li key={`req-${idx}`}>{req}</li>
                ))}
              </ul>
                    </>
                  )}
                  
                  {callAnalysis.objections.length === 0 && 
                   callAnalysis.rejectionReasons.length === 0 &&
                   callAnalysis.painPoints.length === 0 &&
                   callAnalysis.customerRequests.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      Данные о возражениях и проблемах отсутствуют
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* Добавляем новую вкладку для ключевых вопросов */}
        <TabsContent value="key-questions">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ответы на ключевые вопросы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {call.keyQuestion1Answer && (
                <div>
                  <h4 className="font-medium">Вопрос 1:</h4>
                  <div className="p-3 rounded bg-purple-50 mt-2">
                    <p>{call.keyQuestion1Answer}</p>
                  </div>
                </div>
              )}
              
              {call.keyQuestion2Answer && (
                <div>
                  <h4 className="font-medium">Вопрос 2:</h4>
                  <div className="p-3 rounded bg-green-50 mt-2">
                    <p>{call.keyQuestion2Answer}</p>
                  </div>
                </div>
              )}
              
              {call.keyQuestion3Answer && (
                <div>
                  <h4 className="font-medium">Вопрос 3:</h4>
                  <div className="p-3 rounded bg-blue-50 mt-2">
                    <p>{call.keyQuestion3Answer}</p>
                  </div>
                </div>
              )}
              
              {!call.keyQuestion1Answer && !call.keyQuestion2Answer && !call.keyQuestion3Answer && (
                <div className="text-center text-muted-foreground py-4">
                  Нет ответов на ключевые вопросы для этого звонка
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallDetails;
