import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, Award, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Call } from "../calls/CallsTable";

// Интерфейс для статистики по оператору
interface OperatorStat {
  name: string;
  callCount: number;
  successRate: number;
  avgScore: number;
  weaknesses: Array<{
    name: string;
    count: number;
    severity: "high" | "medium" | "low";
  }>;
  strengths: Array<{
    name: string;
    count: number;
    impact: "high" | "medium" | "low";
  }>;
  recommendations: string[];
}

interface RecommendationSection {
  title: string;
  description: string;
  recommendations: string[];
  icon: React.ReactNode;
  priority: "critical" | "high" | "medium" | "low";
}

interface TrainingRecommendationsProps {
  calls: Call[];
  title?: string;
  description?: string;
}

const TrainingRecommendations = ({
  calls,
  title = "Рекомендации по обучению",
  description = "На основе анализа звонков",
}: TrainingRecommendationsProps) => {
  // Функция для анализа данных звонков и формирования рекомендаций
  const analyzeCallsData = () => {
    // Базовая статистика
    const totalCalls = calls.length;
    const successfulCalls = calls.filter(
      (call) => call.callResult === "успешный" || call.status === "успешный"
    ).length;
    const unsuccessfulCalls = calls.filter(
      (call) => call.callResult === "неуспешный" || call.status === "неуспешный"
    ).length;
    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

    // Статистика по операторам
    const operatorStatsMap = new Map<string, OperatorStat>();

    // Сборка возражений и проблем для дальнейшего анализа
    const allObjections: string[] = [];
    const allPainPoints: string[] = [];
    const allRejectionReasons: string[] = [];

    // Сбор данных по операторам
    calls.forEach((call) => {
      const operatorName = call.agent || "Неизвестный оператор";
      const isSuccessful =
        call.callResult === "успешный" || call.status === "успешный";

      // Получаем текущую статистику оператора или создаем новую
      let operatorStat = operatorStatsMap.get(operatorName) || {
        name: operatorName,
        callCount: 0,
        successRate: 0,
        avgScore: 0,
        weaknesses: [],
        strengths: [],
        recommendations: [],
      };

      // Обновляем базовую статистику
      operatorStat.callCount += 1;
      const successCount = isSuccessful ? 1 : 0;
      operatorStat.successRate =
        ((operatorStat.successRate * (operatorStat.callCount - 1)) +
          (successCount * 100)) / operatorStat.callCount;

      // Обновляем среднюю оценку
      if (call.score) {
        operatorStat.avgScore =
          ((operatorStat.avgScore * (operatorStat.callCount - 1)) +
            Number(call.score)) / operatorStat.callCount;
      }

      // Обрабатываем возражения для слабых сторон
      if (call.objections && call.objections.length > 0) {
        call.objections.forEach((objection) => {
          allObjections.push(objection);
          // Ищем эту слабость в уже собранных или добавляем новую
          const weaknessIndex = operatorStat.weaknesses.findIndex(
            (w) => w.name === objection
          );
          if (weaknessIndex >= 0) {
            operatorStat.weaknesses[weaknessIndex].count += 1;
          } else {
            operatorStat.weaknesses.push({
              name: objection,
              count: 1,
              severity: "medium",
            });
          }
        });
      }

      // Обрабатываем проблемные места для слабых сторон
      if (call.painPoints && call.painPoints.length > 0) {
        call.painPoints.forEach((painPoint) => {
          allPainPoints.push(painPoint);
          const weaknessIndex = operatorStat.weaknesses.findIndex(
            (w) => w.name === painPoint
          );
          if (weaknessIndex >= 0) {
            operatorStat.weaknesses[weaknessIndex].count += 1;
          } else {
            operatorStat.weaknesses.push({
              name: painPoint,
              count: 1,
              severity: "medium",
            });
          }
        });
      }

      // Обрабатываем причины отказа для слабых сторон
      if (call.rejectionReasons && call.rejectionReasons.length > 0) {
        call.rejectionReasons.forEach((reason) => {
          allRejectionReasons.push(reason);
          const weaknessIndex = operatorStat.weaknesses.findIndex(
            (w) => w.name === reason
          );
          if (weaknessIndex >= 0) {
            operatorStat.weaknesses[weaknessIndex].count += 1;
          } else {
            operatorStat.weaknesses.push({
              name: reason,
              count: 1,
              severity: "high",
            });
          }
        });
      }

      // Анализируем положительные факторы для сильных сторон (в успешных звонках)
      if (isSuccessful && call.decisionFactors && call.decisionFactors.positive) {
        call.decisionFactors.positive.forEach((factor) => {
          const strengthIndex = operatorStat.strengths.findIndex(
            (s) => s.name === factor
          );
          if (strengthIndex >= 0) {
            operatorStat.strengths[strengthIndex].count += 1;
          } else {
            operatorStat.strengths.push({
              name: factor,
              count: 1,
              impact: "medium",
            });
          }
        });
      }

      // Сохраняем или обновляем статистику оператора
      operatorStatsMap.set(operatorName, operatorStat);
    });

    // Вычисляем слабости и сильные стороны команды на основе агрегированных данных
    const teamWeaknesses = new Map<string, number>();
    const teamStrengths = new Map<string, number>();

    allObjections.forEach((objection) => {
      teamWeaknesses.set(
        objection,
        (teamWeaknesses.get(objection) || 0) + 1
      );
    });

    allPainPoints.forEach((painPoint) => {
      teamWeaknesses.set(
        painPoint,
        (teamWeaknesses.get(painPoint) || 0) + 1
      );
    });

    allRejectionReasons.forEach((reason) => {
      teamWeaknesses.set(
        reason,
        (teamWeaknesses.get(reason) || 0) + 1
      );
    });

    // Формируем общие рекомендации для команды
    const commonRecommendations: RecommendationSection[] = [];

    // Рекомендации по работе с возражениями
    if (teamWeaknesses.size > 0) {
      const sortedWeaknesses = Array.from(teamWeaknesses.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((entry) => entry[0]);

      commonRecommendations.push({
        title: "Работа с возражениями",
        description: 
          `На основе анализа ${totalCalls} звонков выявлены частые возражения, требующие проработки`,
        recommendations: [
          `Разработать скрипты для обработки возражения "${sortedWeaknesses[0] || 'Цена'}"`,
          `Провести тренинг по преодолению возражений типа "${sortedWeaknesses[1] || 'Конкуренты'}"`,
          `Разработать методички по работе с "${sortedWeaknesses[2] || 'Сроки доставки'}"`,
        ],
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        priority: "high",
      });
    }

    // Рекомендации по повышению успешности звонков
    if (successRate < 70) {
      commonRecommendations.push({
        title: "Повышение конверсии",
        description: 
          `Текущая конверсия ${successRate.toFixed(1)}%. Есть потенциал для роста`,
        recommendations: [
          "Провести тренинг по техникам эффективных продаж и закрытию сделок",
          "Разработать новый скрипт продаж с учетом анализа успешных звонков",
          "Увеличить знание продукта через обучение операторов всем преимуществам",
        ],
        icon: <Award className="h-5 w-5 text-indigo-500" />,
        priority: "critical",
      });
    }

    // Общие рекомендации по обучению
    commonRecommendations.push({
      title: "Программа развития навыков",
      description: "Общие рекомендации по развитию команды",
      recommendations: [
        "Внедрить еженедельные разборы наиболее успешных и неуспешных звонков",
        "Разработать индивидуальные планы развития для операторов с низкими показателями",
        "Создать базу знаний с лучшими практиками и скриптами для типичных ситуаций",
      ],
      icon: <GraduationCap className="h-5 w-5 text-emerald-500" />,
      priority: "medium",
    });

    // Преобразуем Map операторов в массив, сортируем по успешности
    const operatorStats = Array.from(operatorStatsMap.values()).sort(
      (a, b) => b.successRate - a.successRate
    );

    // Для каждого оператора вычисляем рекомендации на основе его слабостей
    operatorStats.forEach((operator) => {
      operator.weaknesses.sort((a, b) => b.count - a.count);
      operator.strengths.sort((a, b) => b.count - a.count);

      // Формируем рекомендации для оператора на основе его слабостей
      if (operator.weaknesses.length > 0) {
        operator.recommendations.push(
          `Отработать навыки преодоления возражения "${operator.weaknesses[0]?.name || 'ценовые возражения'}"`
        );
      }

      if (operator.successRate < 50) {
        operator.recommendations.push(
          "Пройти углубленное обучение по технике продаж"
        );
      }

      if (operator.avgScore < 6) {
        operator.recommendations.push(
          "Улучшить общее качество коммуникации с клиентами"
        );
      }

      // Если у оператора мало рекомендаций, добавляем стандартные
      if (operator.recommendations.length < 2) {
        operator.recommendations.push(
          "Продолжать использовать успешные практики и делиться опытом с командой"
        );
      }
    });

    return {
      teamStats: {
        totalCalls,
        successfulCalls,
        unsuccessfulCalls,
        successRate,
      },
      operatorStats,
      commonRecommendations,
    };
  };

  const { teamStats, operatorStats, commonRecommendations } = analyzeCallsData();

  // Функция для отображения приоритета рекомендации
  const renderPriorityBadge = (priority: string) => {
    const classes = {
      critical: "bg-red-100 text-red-800",
      high: "bg-amber-100 text-amber-800",
      medium: "bg-blue-100 text-blue-800",
      low: "bg-green-100 text-green-800",
    };

    return (
      <Badge
        variant="outline"
        className={cn(classes[priority as keyof typeof classes])}
      >
        {priority === "critical" ? "Критичный" : 
          priority === "high" ? "Высокий" : 
          priority === "medium" ? "Средний" : "Низкий"}
      </Badge>
    );
  };

  // Функция для отображения прогресса успешности оператора
  const renderSuccessRate = (rate: number) => {
    const colorClass = 
      rate >= 70 ? "bg-green-500" :
      rate >= 50 ? "bg-amber-500" :
      "bg-red-500";

    return (
      <div className="w-full space-y-1">
        <div className="flex justify-between text-xs">
          <span>{rate.toFixed(1)}% успешных звонков</span>
          <span>
            {rate >= 70 ? "Отлично" : rate >= 50 ? "Хорошо" : "Нуждается в улучшении"}
          </span>
        </div>
        <Progress value={rate} className={cn("h-2", colorClass)} />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {calls.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            Нет данных для анализа и формирования рекомендаций
          </div>
        ) : (
          <>
            {/* Базовая статистика */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
              <div className="rounded-lg border bg-card p-4 text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Всего звонков
                </h3>
                <p className="text-2xl font-bold">{teamStats.totalCalls}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Успешность
                </h3>
                <p className="text-2xl font-bold text-emerald-600">
                  {teamStats.successRate.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Требуют внимания
                </h3>
                <p className="text-2xl font-bold text-amber-600">
                  {teamStats.totalCalls - teamStats.successfulCalls}
                </p>
              </div>
            </div>

            {/* Общие рекомендации для команды */}
            <div className="space-y-4">
              <h3 className="text-base font-medium">Ключевые рекомендации для команды</h3>
              {commonRecommendations.length > 0 ? (
                commonRecommendations.map((rec, index) => (
                  <div 
                    key={index} 
                    className="rounded-lg border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {rec.icon}
                        <h4 className="font-medium">{rec.title}</h4>
                      </div>
                      {renderPriorityBadge(rec.priority)}
                    </div>
                    <p className="text-muted-foreground text-sm">{rec.description}</p>
                    <ul className="space-y-2">
                      {rec.recommendations.map((item, itemIndex) => (
                        <li key={itemIndex} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                          <span className="text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Недостаточно данных для формирования рекомендаций
                </div>
              )}
            </div>

            {/* Рекомендации по операторам */}
            {operatorStats.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-base font-medium">Рекомендации по операторам</h3>
                <Accordion type="multiple" className="space-y-2">
                  {operatorStats.map((operator, index) => (
                    <AccordionItem 
                      key={index} 
                      value={`operator-${index}`}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="py-3">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="font-medium">{operator.name}</div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                operator.avgScore >= 8
                                  ? "bg-green-100 text-green-800"
                                  : operator.avgScore >= 5
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              )}
                            >
                              {operator.avgScore.toFixed(1)}/10
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {operator.callCount} звонков
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 space-y-4">
                        {/* Прогресс успешности */}
                        {renderSuccessRate(operator.successRate)}

                        {/* Рекомендации */}
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">Рекомендации:</h5>
                          <ul className="space-y-2">
                            {operator.recommendations.map((rec, recIndex) => (
                              <li key={recIndex} className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                                <span className="text-sm">{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Слабые и сильные стороны */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <h5 className="text-sm font-medium mb-2">Сложности:</h5>
                            {operator.weaknesses.length > 0 ? (
                              <ul className="space-y-1">
                                {operator.weaknesses
                                  .slice(0, 3)
                                  .map((weakness, wIndex) => (
                                    <li key={wIndex} className="text-sm text-red-600">
                                      {weakness.name}
                                    </li>
                                  ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Не выявлены
                              </p>
                            )}
                          </div>
                          <div>
                            <h5 className="text-sm font-medium mb-2">Сильные стороны:</h5>
                            {operator.strengths.length > 0 ? (
                              <ul className="space-y-1">
                                {operator.strengths
                                  .slice(0, 3)
                                  .map((strength, sIndex) => (
                                    <li key={sIndex} className="text-sm text-green-600">
                                      {strength.name}
                                    </li>
                                  ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Недостаточно данных
                              </p>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TrainingRecommendations; 