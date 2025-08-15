import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart, 
  Pie,
  Legend
} from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { Call } from "@/components/calls/CallsTable";

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

interface CustomFields {
  [key: string]: { label: string; value: string };
}

interface CustomPromptAnalysisProps {
  isLoading?: boolean;
  analysisResults: AnalysisResults;
  analyzedCalls: Call[];
  customFields: CustomFields;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const CustomPromptAnalysis = ({ 
  isLoading = false, 
  analysisResults, 
  analyzedCalls, 
  customFields 
}: CustomPromptAnalysisProps) => {
  // Преобразуем теги в формат для графиков
  const generateTagsForCharts = () => {
    const tagsCount: {[tag: string]: number} = {};
    
    // Собираем все теги из анализа
    Object.values(analysisResults.tags).forEach(tags => {
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            tagsCount[tag] = (tagsCount[tag] || 0) + 1;
          }
        });
      }
    });

    // Собираем теги из звонков напрямую, если они есть
    analyzedCalls.forEach(call => {
      if (call.tags && Array.isArray(call.tags)) {
        call.tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            tagsCount[tag] = (tagsCount[tag] || 0) + 1;
          }
        });
      }
    });

    // Преобразуем в массив для графиков с добавлением цветов
    return Object.entries(tagsCount)
      .map(([name, value], index) => ({
        name,
        value,
        color: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Ограничим количество тегов для графиков
  };

  const tagChartData = generateTagsForCharts();

  // Фильтруем звонки для анализа
  const highScoreCalls = analyzedCalls.filter(call => call.score && call.score >= 8);
  const lowScoreCalls = analyzedCalls.filter(call => call.score && call.score <= 5);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <Loader2 className="h-10 w-10 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Выполняется анализ звонков...</p>
        </div>
      </div>
    );
  }

  // Если нет данных анализа, показываем информационное сообщение
  const noDataView = (
    <div className="text-center py-12">
      <p className="text-muted-foreground">
        Выполните анализ звонков, чтобы увидеть результаты
      </p>
    </div>
  );

  return (
    <div className="space-y-6 mt-4">
      <Tabs defaultValue="overall" className="w-full">
        <TabsList>
          <TabsTrigger value="overall">Общий анализ</TabsTrigger>
          <TabsTrigger value="individual">Анализ по звонкам</TabsTrigger>
          <TabsTrigger value="tags">Теги и распределение</TabsTrigger>
        </TabsList>

        <TabsContent value="overall" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты анализа выбранных звонков</h3>
              {/* Проверка загрузки данных */}
              <div className="text-xs text-gray-500 mb-2">
                Ключевые инсайты: {analysisResults.keyInsights.length}, 
                Успешные факторы: {analysisResults.successFactors.length}, 
                Проблемы: {analysisResults.problems.length}, 
                Рекомендации: {analysisResults.recommendations.length},
                Теги: {Object.keys(analysisResults.tags).length}
              </div>
              {analysisResults.keyInsights.length > 0 || customFields.field1.value ? (
                <>
                  <p className="text-muted-foreground mb-4">
                    {customFields.field1.value || "Выполните анализ для получения результатов"}
                  </p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Ключевые инсайты:</h4>
                  <ul className="space-y-2">
                        {analysisResults.keyInsights.map((insight, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary h-5 w-5 text-xs mr-2 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-sm">{insight}</span>
                      </li>
                    ))}
                        {analysisResults.successFactors.map((factor, idx) => (
                          <li key={`sf-${idx}`} className="flex items-start">
                            <span className="inline-flex items-center justify-center rounded-full bg-green-100 text-green-800 h-5 w-5 text-xs mr-2 mt-0.5">
                              +
                            </span>
                            <span className="text-sm">{factor}</span>
                          </li>
                        ))}
                        {analysisResults.problems.map((problem, idx) => (
                          <li key={`pr-${idx}`} className="flex items-start">
                            <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-800 h-5 w-5 text-xs mr-2 mt-0.5">
                              !
                            </span>
                            <span className="text-sm">{problem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Рекомендации:</h4>
                  <ul className="space-y-2">
                        {analysisResults.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary h-5 w-5 text-xs mr-2 mt-0.5">
                          ✓
                        </span>
                        <span className="text-sm">{rec}</span>
                      </li>
                    ))}
                        {customFields.field3.value && (
                          <li className="flex items-start text-sm mt-4 border-t pt-3">
                            <div>{customFields.field3.value}</div>
                          </li>
                        )}
                  </ul>
                </div>
              </div>
                </>
              ) : noDataView}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="individual" className="mt-4">
          <ScrollArea className="h-[500px] pr-4">
            {analyzedCalls.length > 0 ? (
            <div className="space-y-4">
                {/* Высокие оценки */}
                {highScoreCalls.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-green-700 mb-2">Лучшие звонки</h4>
                    {highScoreCalls.map((call) => (
                      <Card key={call.id} className="border-l-4 mb-3" style={{ borderLeftColor: '#22c55e' }}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-medium">
                                Звонок: {call.agent || "Оператор"} → {call.customer || "Клиент"}
                              </h4>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {call.tags && Array.isArray(call.tags) && call.tags.map((tag, idx) => (
                                  <span key={idx} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-sm font-semibold rounded-full w-8 h-8 flex items-center justify-center bg-green-100 text-green-800">
                              {call.score}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {call.keyInsight || "Нет данных анализа"}
                          </p>
                          {call.recommendation && (
                            <p className="text-sm mt-2 border-t pt-2">
                              <span className="font-medium">Рекомендация:</span> {call.recommendation}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                
                {/* Низкие оценки */}
                {lowScoreCalls.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-700 mb-2">Проблемные звонки</h4>
                    {lowScoreCalls.map((call) => (
                      <Card key={call.id} className="border-l-4 mb-3" style={{ borderLeftColor: '#ef4444' }}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium">
                                Звонок: {call.agent || "Оператор"} → {call.customer || "Клиент"}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                                {call.tags && Array.isArray(call.tags) && call.tags.map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                            <div className="text-sm font-semibold rounded-full w-8 h-8 flex items-center justify-center bg-red-100 text-red-800">
                        {call.score}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                            {call.keyInsight || "Нет данных анализа"}
                          </p>
                          {call.recommendation && (
                            <p className="text-sm mt-2 border-t pt-2">
                              <span className="font-medium">Рекомендация:</span> {call.recommendation}
                    </p>
                          )}
                  </CardContent>
                </Card>
              ))}
            </div>
                )}
                
                {/* Если нет звонков с высокой или низкой оценкой */}
                {highScoreCalls.length === 0 && lowScoreCalls.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Нет звонков с выраженной высокой или низкой оценкой
                  </div>
                )}
              </div>
            ) : noDataView}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {tagChartData.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-4">Распределение тегов</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tagChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={140} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {tagChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-4">Процентное соотношение</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                            data={tagChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                            {tagChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              ) : noDataView}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomPromptAnalysis;
