import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import type { Call } from "./CallsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, ArrowLeftRight } from "lucide-react";

interface CallsComparisonProps {
  calls: Call[];
  title?: string;
  description?: string;
}

const CallsComparison = ({
  calls,
  title = "Сравнение звонков",
  description,
}: CallsComparisonProps) => {
  const [activeTab, setActiveTab] = useState("table");

  // Подготовка данных для таблицы сравнения
  const prepareMetricsData = () => {
    // Базовые поля для сравнения
    const comparisonFields = [
      { name: "Длительность", key: "duration" },
      { name: "Длительность аудио", key: "audioDuration" },
      { name: "Символов в транскрипции", key: "transcriptLength" },
      { name: "Оценка звонка", key: "score" },
      { name: "Тип звонка", key: "callType" },
      { name: "Результат", key: "callResult" },
      { name: "Готовность к продаже", key: "salesReadiness" },
      { name: "Вероятность конверсии", key: "conversionProbability" },
    ];

    // Поля для радарной диаграммы (только числовые метрики)
    const radarFields = [
      { name: "Оценка", fullName: "Оценка звонка", key: "score", max: 10 },
      { name: "Готовность", fullName: "Готовность к продаже", key: "salesReadiness", max: 10 },
      { name: "Конверсия", fullName: "Вероятность конверсии", key: "conversionProbability", max: 100 },
      { 
        name: "Менеджер", 
        fullName: "Оценка менеджера", 
        key: "managerPerformance", 
        valueKey: "общая_оценка", 
        max: 10 
      },
      { 
        name: "Клиент", 
        fullName: "Потенциал клиента", 
        key: "customerPotential", 
        valueKey: "score", 
        max: 10 
      },
    ];

    // Подготавливаем данные для радарной диаграммы
    const radarData = radarFields.map(field => {
      const dataPoint: any = {
        subject: field.name,
        fullName: field.fullName,
      };

      calls.forEach((call, index) => {
        // Для вложенных полей (like managerPerformance.score)
        if (field.valueKey && call[field.key]) {
          const nestedObj = call[field.key as keyof Call] as any;
          dataPoint[`call${index}`] = nestedObj[field.valueKey] || 0;
        } else {
          // Для обычных полей
          dataPoint[`call${index}`] = call[field.key as keyof Call] || 0;
        }

        // Нормализуем значения для лучшего отображения на радаре
        if (field.key === 'conversionProbability') {
          dataPoint[`call${index}`] = dataPoint[`call${index}`] / 10; // Сводим к шкале 0-10
        }
      });

      return dataPoint;
    });

    return { comparisonFields, radarData };
  };

  const { comparisonFields, radarData } = prepareMetricsData();

  // Функция для отображения значения ячейки с учетом типа данных
  const renderCellValue = (call: Call, fieldKey: string) => {
    const value = call[fieldKey as keyof Call];

    if (fieldKey === "score" || fieldKey === "salesReadiness") {
      return value ? (
        <Badge
          variant="outline"
          className={cn(
            Number(value) >= 8
              ? "bg-green-100 text-green-800"
              : Number(value) >= 5
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          )}
        >
          {value}/10
        </Badge>
      ) : (
        "N/A"
      );
    }

    if (fieldKey === "conversionProbability") {
      return value ? (
        <Badge
          variant="outline"
          className={cn(
            Number(value) >= 70
              ? "bg-green-100 text-green-800"
              : Number(value) >= 40
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          )}
        >
          {value}%
        </Badge>
      ) : (
        "N/A"
      );
    }

    if (fieldKey === "audioDuration") {
      return value ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-blue-600">🎵</span>
          <span className="font-mono text-sm">{value}</span>
        </div>
      ) : (
        "Не определена"
      );
    }

    if (fieldKey === "transcriptLength") {
      return value !== undefined ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-green-600">📝</span>
          <span className="font-mono text-sm">{Number(value).toLocaleString()} симв.</span>
        </div>
      ) : (
        "Не подсчитано"
      );
    }

    if (fieldKey === "callResult") {
      return (
        <Badge
          variant="outline"
          className={cn(
            value === "успешный"
              ? "bg-green-100 text-green-800"
              : value === "неуспешный"
              ? "bg-red-100 text-red-800"
              : "bg-yellow-100 text-yellow-800"
          )}
        >
          {value || "Не определен"}
        </Badge>
      );
    }

    return value || "Не определено";
  };

  // Генерация цветов для звонков на диаграмме
  const colors = ["#22c55e", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6"];

  // Динамическое создание имен звонков для легенды
  const getCallName = (call: Call, index: number) => {
    return call.agent 
      ? `${call.agent} (${call.date || "Нет даты"})`
      : `Звонок ${index + 1}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {calls.length < 2 ? (
          <div className="text-center py-10 text-muted-foreground">
            Для сравнения выберите минимум 2 звонка
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="table">Таблица</TabsTrigger>
              <TabsTrigger value="radar">Радар метрик</TabsTrigger>
            </TabsList>
            
            <TabsContent value="table">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Метрика</TableHead>
                      {calls.map((call, index) => (
                        <TableHead key={index}>
                          {getCallName(call, index)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonFields.map((field, fieldIndex) => (
                      <TableRow key={fieldIndex}>
                        <TableCell className="font-medium">
                          {field.name}
                        </TableCell>
                        {calls.map((call, callIndex) => (
                          <TableCell key={callIndex}>
                            {renderCellValue(call, field.key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                    {/* Дополнительная строка для интересов клиента */}
                    <TableRow>
                      <TableCell className="font-medium">
                        Интересы клиента
                      </TableCell>
                      {calls.map((call, callIndex) => (
                        <TableCell key={callIndex}>
                          {call.clientInterests && call.clientInterests.length > 0 ? (
                            <ul className="list-disc pl-5 text-xs">
                              {call.clientInterests.slice(0, 2).map((interest, i) => (
                                <li key={i}>{interest}</li>
                              ))}
                              {call.clientInterests.length > 2 && (
                                <li>... и еще {call.clientInterests.length - 2}</li>
                              )}
                            </ul>
                          ) : (
                            "Не определены"
                          )}
                        </TableCell>
                      ))}
                    </TableRow>

                    {/* Дополнительная строка для возражений */}
                    <TableRow>
                      <TableCell className="font-medium">
                        Возражения
                      </TableCell>
                      {calls.map((call, callIndex) => (
                        <TableCell key={callIndex}>
                          {call.objections && call.objections.length > 0 ? (
                            <ul className="list-disc pl-5 text-xs">
                              {call.objections.slice(0, 2).map((objection, i) => (
                                <li key={i}>{objection}</li>
                              ))}
                              {call.objections.length > 2 && (
                                <li>... и еще {call.objections.length - 2}</li>
                              )}
                            </ul>
                          ) : (
                            "Не выявлены"
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="radar">
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={90} domain={[0, 10]} />
                    
                    {calls.map((call, index) => (
                      <Radar
                        key={index}
                        name={getCallName(call, index)}
                        dataKey={`call${index}`}
                        stroke={colors[index % colors.length]}
                        fill={colors[index % colors.length]}
                        fillOpacity={0.2}
                      />
                    ))}
                    
                    <Legend />
                    <Tooltip 
                      formatter={(value, name, props) => {
                        const metric = props.payload.fullName;
                        // Особая обработка для конверсии
                        if (metric === "Вероятность конверсии") {
                          return [`${(Number(value) * 10).toFixed(0)}%`, metric];
                        }
                        return [`${value}`, metric];
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

export default CallsComparison; 