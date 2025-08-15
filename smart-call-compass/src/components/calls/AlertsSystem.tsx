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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bell, BellOff, Plus, Users, Settings, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Call } from "./CallsTable";

// Интерфейс для правила оповещения
interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: {
    field: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
    value: string | number;
  }[];
  priority: "high" | "medium" | "low";
  actions: {
    type: "email" | "notification" | "telegram" | "sms";
    recipients?: string[];
    message?: string;
  }[];
}

// Интерфейс для оповещения
interface Alert {
  id: string;
  ruleId: string;
  callId: string;
  timestamp: Date;
  status: "new" | "acknowledged" | "resolved";
  priority: "high" | "medium" | "low";
  message: string;
}

interface AlertsSystemProps {
  calls: Call[];
  title?: string;
  description?: string;
}

const AlertsSystem = ({
  calls,
  title = "Система оповещений",
  description = "Настройка и мониторинг оповещений о важных звонках",
}: AlertsSystemProps) => {
  // Демо данные для правил оповещений
  const [alertRules, setAlertRules] = useState<AlertRule[]>([
    {
      id: "rule1",
      name: "Низкая оценка звонка",
      description: "Оповещение при звонках с оценкой ниже 4",
      enabled: true,
      conditions: [
        {
          field: "score",
          operator: "less_than",
          value: 4,
        },
      ],
      priority: "high",
      actions: [
        {
          type: "notification",
          message: "Обнаружен звонок с низкой оценкой, требуется внимание!",
        },
        {
          type: "email",
          recipients: ["manager@example.com"],
          message: "Обнаружен звонок с низкой оценкой, требуется разбор!",
        },
      ],
    },
    {
      id: "rule2",
      name: "Потеря клиента",
      description: "Клиент с высоким потенциалом не совершил покупку",
      enabled: true,
      conditions: [
        {
          field: "customerPotential.score",
          operator: "greater_than",
          value: 7,
        },
        {
          field: "callResult",
          operator: "equals",
          value: "неуспешный",
        },
      ],
      priority: "high",
      actions: [
        {
          type: "notification",
          message: "Потеря ценного клиента! Требуется повторный контакт.",
        },
      ],
    },
    {
      id: "rule3",
      name: "Проблема с продуктом",
      description: "Клиент упоминает проблему с продуктом или услугой",
      enabled: false,
      conditions: [
        {
          field: "objections",
          operator: "contains",
          value: "проблем",
        },
      ],
      priority: "medium",
      actions: [
        {
          type: "notification",
          message: "Клиент упомянул проблему с продуктом",
        },
        {
          type: "email",
          recipients: ["support@example.com"],
          message: "Клиент упомянул проблему с продуктом, требуется разбирательство",
        },
      ],
    },
  ]);

  // Генерация демо оповещений на основе звонков и правил
  const generateAlerts = (): Alert[] => {
    const alerts: Alert[] = [];
    
    // Проходим по всем звонкам
    calls.forEach((call) => {
      // Для каждого звонка проверяем все правила
      alertRules.forEach((rule) => {
        if (!rule.enabled) return;
        
        // Проверяем соответствие всем условиям правила
        const conditionsMet = rule.conditions.every((condition) => {
          const fieldValue = getNestedValue(call, condition.field);
          
          switch (condition.operator) {
            case "equals":
              return fieldValue === condition.value;
            case "not_equals":
              return fieldValue !== condition.value;
            case "contains":
              // Для массивов или строк проверяем содержание
              if (Array.isArray(fieldValue)) {
                return fieldValue.some(item => 
                  String(item).toLowerCase().includes(String(condition.value).toLowerCase())
                );
              }
              return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase());
            case "greater_than":
              return Number(fieldValue) > Number(condition.value);
            case "less_than":
              return Number(fieldValue) < Number(condition.value);
            default:
              return false;
          }
        });
        
        // Если все условия выполнены, создаем оповещение
        if (conditionsMet) {
          alerts.push({
            id: `alert-${rule.id}-${call.id}`,
            ruleId: rule.id,
            callId: call.id,
            timestamp: new Date(),
            status: "new",
            priority: rule.priority,
            message: rule.actions[0]?.message || `Сработало правило: ${rule.name}`,
          });
        }
      });
    });
    
    return alerts;
  };

  // Получение вложенного значения из объекта по пути, например "customerPotential.score"
  const getNestedValue = (obj: any, path: string) => {
    const keys = path.split('.');
    return keys.reduce((acc, key) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[key];
    }, obj);
  };

  // Состояние для оповещений, генерируемых на основе правил и звонков
  const [alerts, setAlerts] = useState<Alert[]>(generateAlerts());

  // Состояния для диалога создания правила
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AlertRule>>({
    name: "",
    description: "",
    enabled: true,
    conditions: [
      {
        field: "score",
        operator: "less_than",
        value: 5,
      },
    ],
    priority: "medium",
    actions: [
      {
        type: "notification",
        message: "",
      },
    ],
  });

  // Обработчик включения/выключения правила
  const toggleRuleStatus = (ruleId: string) => {
    setAlertRules(
      alertRules.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  // Обработчик изменения статуса оповещения
  const updateAlertStatus = (alertId: string, status: "acknowledged" | "resolved") => {
    setAlerts(
      alerts.map((alert) =>
        alert.id === alertId ? { ...alert, status } : alert
      )
    );
  };

  // Создание нового правила оповещения
  const handleCreateRule = () => {
    const id = `rule${alertRules.length + 1}`;
    setAlertRules([
      ...alertRules,
      {
        id,
        name: newRule.name || "Новое правило",
        description: newRule.description || "",
        enabled: newRule.enabled || true,
        conditions: newRule.conditions || [],
        priority: newRule.priority || "medium",
        actions: newRule.actions || [],
      },
    ]);
    setIsDialogOpen(false);
    setNewRule({
      name: "",
      description: "",
      enabled: true,
      conditions: [
        {
          field: "score",
          operator: "less_than",
          value: 5,
        },
      ],
      priority: "medium",
      actions: [
        {
          type: "notification",
          message: "",
        },
      ],
    });
  };

  // Получение текста для оператора сравнения
  const getOperatorText = (operator: string) => {
    switch (operator) {
      case "equals":
        return "равно";
      case "not_equals":
        return "не равно";
      case "contains":
        return "содержит";
      case "greater_than":
        return "больше чем";
      case "less_than":
        return "меньше чем";
      default:
        return operator;
    }
  };

  // Получение цвета для приоритета
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-amber-100 text-amber-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  // Текст для приоритета
  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "high":
        return "Высокий";
      case "medium":
        return "Средний";
      case "low":
        return "Низкий";
      default:
        return "Неизвестно";
    }
  };

  // Отфильтрованные активные оповещения (новые и подтвержденные)
  const activeAlerts = alerts.filter(
    (alert) => alert.status === "new" || alert.status === "acknowledged"
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-medium">{title}</CardTitle>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Новое правило
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Создание нового правила оповещений</DialogTitle>
                  <DialogDescription>
                    Настройте условия и действия для нового правила оповещений
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Название правила</Label>
                    <Input
                      id="name"
                      value={newRule.name}
                      onChange={(e) =>
                        setNewRule({ ...newRule, name: e.target.value })
                      }
                      placeholder="Название правила"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Описание</Label>
                    <Input
                      id="description"
                      value={newRule.description}
                      onChange={(e) =>
                        setNewRule({ ...newRule, description: e.target.value })
                      }
                      placeholder="Описание правила"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Приоритет</Label>
                    <Select
                      value={newRule.priority}
                      onValueChange={(value) =>
                        setNewRule({
                          ...newRule,
                          priority: value as "high" | "medium" | "low",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите приоритет" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Высокий</SelectItem>
                        <SelectItem value="medium">Средний</SelectItem>
                        <SelectItem value="low">Низкий</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Условия</Label>
                    {newRule.conditions?.map((condition, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Select
                          value={condition.field}
                          onValueChange={(value) => {
                            const newConditions = [...(newRule.conditions || [])];
                            newConditions[index] = {
                              ...newConditions[index],
                              field: value,
                            };
                            setNewRule({ ...newRule, conditions: newConditions });
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Поле" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="score">Оценка звонка</SelectItem>
                            <SelectItem value="callResult">Результат звонка</SelectItem>
                            <SelectItem value="salesReadiness">Готовность к продаже</SelectItem>
                            <SelectItem value="conversionProbability">
                              Вероятность конверсии
                            </SelectItem>
                            <SelectItem value="customerPotential.score">
                              Потенциал клиента
                            </SelectItem>
                            <SelectItem value="objections">Возражения</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => {
                            const newConditions = [...(newRule.conditions || [])];
                            newConditions[index] = {
                              ...newConditions[index],
                              operator: value as any,
                            };
                            setNewRule({ ...newRule, conditions: newConditions });
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Оператор" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Равно</SelectItem>
                            <SelectItem value="not_equals">Не равно</SelectItem>
                            <SelectItem value="contains">Содержит</SelectItem>
                            <SelectItem value="greater_than">Больше чем</SelectItem>
                            <SelectItem value="less_than">Меньше чем</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={condition.value.toString()}
                          onChange={(e) => {
                            const newConditions = [...(newRule.conditions || [])];
                            newConditions[index] = {
                              ...newConditions[index],
                              value: e.target.value,
                            };
                            setNewRule({ ...newRule, conditions: newConditions });
                          }}
                          className="w-[160px]"
                          placeholder="Значение"
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setNewRule({
                          ...newRule,
                          conditions: [
                            ...(newRule.conditions || []),
                            {
                              field: "score",
                              operator: "less_than",
                              value: 5,
                            },
                          ],
                        });
                      }}
                    >
                      Добавить условие
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Сообщение оповещения</Label>
                    <Input
                      value={(newRule.actions && newRule.actions[0]?.message) || ""}
                      onChange={(e) => {
                        const newActions = [...(newRule.actions || [])];
                        if (newActions.length === 0) {
                          newActions.push({
                            type: "notification",
                            message: e.target.value,
                          });
                        } else {
                          newActions[0] = {
                            ...newActions[0],
                            message: e.target.value,
                          };
                        }
                        setNewRule({ ...newRule, actions: newActions });
                      }}
                      placeholder="Текст оповещения"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button onClick={handleCreateRule}>Создать</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Блок активных оповещений */}
          {activeAlerts.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium">Активные оповещения</h3>
                <Badge className="bg-red-100 text-red-800">
                  {activeAlerts.length} активных
                </Badge>
              </div>
              <div className="space-y-3">
                {activeAlerts.map((alert) => {
                  const rule = alertRules.find((r) => r.id === alert.ruleId);
                  const call = calls.find((c) => c.id === alert.callId);
                  
                  return (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between rounded-lg border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(getPriorityColor(alert.priority))}
                          >
                            {getPriorityText(alert.priority)}
                          </Badge>
                          <span className="font-medium">
                            {rule?.name || "Оповещение"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{alert.message}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {alert.timestamp.toLocaleDateString()}{" "}
                            {alert.timestamp.toLocaleTimeString()}
                          </span>
                          <span>•</span>
                          <span>
                            Звонок: {call?.agent || "Оператор"} -{" "}
                            {call?.customer || "Клиент"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {alert.status === "new" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateAlertStatus(alert.id, "acknowledged")
                            }
                          >
                            Принять
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateAlertStatus(alert.id, "resolved")}
                        >
                          Решено
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Нет активных оповещений</h3>
              <p className="text-muted-foreground">
                В данный момент нет оповещений, требующих вашего внимания
              </p>
            </div>
          )}

          {/* Таблица правил оповещений */}
          <div className="space-y-4">
            <h3 className="text-base font-medium">Настроенные правила</h3>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Статус</TableHead>
                    <TableHead>Правило</TableHead>
                    <TableHead className="hidden md:table-cell">Условия</TableHead>
                    <TableHead className="hidden lg:table-cell">Приоритет</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleRuleStatus(rule.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{rule.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {rule.description}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="space-y-1">
                          {rule.conditions.map((condition, index) => (
                            <div key={index} className="text-sm">
                              {condition.field}{" "}
                              <span className="text-muted-foreground">
                                {getOperatorText(condition.operator)}
                              </span>{" "}
                              {condition.value}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn(getPriorityColor(rule.priority))}
                        >
                          {getPriorityText(rule.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost">
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Настройки</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {alertRules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6">
                        Нет настроенных правил оповещения
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Ссылка на документацию */}
          <div className="rounded-lg border bg-blue-50 p-4">
            <div className="flex items-start">
              <div className="mr-4 mt-1">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-blue-800">
                  Настройка уведомлений для команды
                </h3>
                <p className="mt-1 text-sm text-blue-600">
                  Вы можете настроить получение уведомлений на email и в мессенджеры
                  для всей команды в разделе настроек.
                </p>
                <Button
                  variant="link"
                  className="mt-2 h-auto p-0 text-blue-900 hover:text-blue-700"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Открыть настройки команды
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AlertsSystem; 