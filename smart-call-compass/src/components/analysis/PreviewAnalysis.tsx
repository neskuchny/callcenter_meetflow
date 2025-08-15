import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle, LightbulbIcon, HelpCircle } from "lucide-react";
import { previewAnalyzeCalls, PreviewAnalysisResult } from "@/lib/api";
import { Call } from "@/components/calls/CallsTable";
import { cn } from "@/lib/utils";

interface PreviewAnalysisProps {
  calls: Call[];
  onAnalyze: (previewResult: PreviewAnalysisResult) => void;
  isLoading?: boolean;
  previewResult?: PreviewAnalysisResult;
}

const PreviewAnalysis = ({ 
  calls,
  onAnalyze,
  isLoading = false,
  previewResult
}: PreviewAnalysisProps) => {
  const [loading, setLoading] = useState(isLoading);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PreviewAnalysisResult | null>(previewResult || null);

  const handlePerformAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await previewAnalyzeCalls(calls);
      
      if (result.error) {
        setError(result.error);
      } else {
        setAnalysisResult(result);
        onAnalyze(result);
      }
    } catch (err) {
      setError("Не удалось выполнить предварительный анализ звонков");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Предварительный анализ звонков</CardTitle>
          <CardDescription>Анализируем первые звонки для понимания контекста</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-xl">Выполняется предварительный анализ...</p>
            <p className="text-muted-foreground mt-2">Это может занять около минуты</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Предварительный анализ звонков</CardTitle>
          <CardDescription>Анализируем первые звонки для понимания контекста</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ошибка анализа</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={handlePerformAnalysis}>
            <RefreshCw className="mr-2 h-4 w-4" /> Повторить анализ
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Предварительный анализ звонков</CardTitle>
        <CardDescription>
          {analysisResult 
            ? "Результаты анализа первых звонков для понимания контекста"
            : "Анализ первых звонков поможет понять общий контекст и цели"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!analysisResult ? (
          <div>
            <p className="mb-4">
              Перед анализом всех звонков система может проанализировать первые звонки (до 5 шт),
              чтобы понять:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-1">
              <li>В чем смысл звонков</li>
              <li>Какие цели у звонков</li>
              <li>Что продается или объясняется</li>
              <li>На каком этапе воронки продаж находятся эти звонки</li>
              <li>Другие важные детали для анализа</li>
            </ul>
            <p className="mb-6">
              Также будут выделены 3 ключевых вопроса для углубленного анализа всех звонков.
            </p>
            <Button onClick={handlePerformAnalysis}>
              Выполнить предварительный анализ
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex items-center mb-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-800 mr-2">
                  Предварительный отчет
                </Badge>
              </div>
              <div className="p-4 bg-slate-50 rounded-md">
                <p className="whitespace-pre-line">{analysisResult.previewReport}</p>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <div className="flex items-center mb-2">
                <LightbulbIcon className="h-4 w-4 mr-2 text-amber-500" />
                <h3 className="font-medium">Рекомендация AI</h3>
              </div>
              <div className="p-4 bg-amber-50 rounded-md">
                <p className="whitespace-pre-line">{analysisResult.llmAdvice}</p>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <div className="flex items-center mb-2">
                <HelpCircle className="h-4 w-4 mr-2 text-primary" />
                <h3 className="font-medium">Ключевые вопросы для анализа</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Эти вопросы будут добавлены в таблицу звонков как отдельные столбцы. 
                Вы можете заполнить ответы на них для каждого звонка.
              </p>
              
              <div className="space-y-4">
                {analysisResult.keyQuestions.map((question, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={cn(
                        "py-1",
                        index === 0 ? "bg-purple-50 text-purple-800" : 
                        index === 1 ? "bg-green-50 text-green-800" : 
                        "bg-blue-50 text-blue-800"
                      )}>
                        Вопрос {index + 1}
                      </Badge>
                    </div>
                                        <p className="mb-2 font-medium">{question}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button onClick={handlePerformAnalysis} variant="outline" className="mr-2">
                <RefreshCw className="mr-2 h-4 w-4" /> Обновить анализ
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PreviewAnalysis; 