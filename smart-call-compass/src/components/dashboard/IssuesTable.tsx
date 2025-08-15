
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Issue {
  id: number;
  issue: string;
  count: number;
  impact: "high" | "medium" | "low";
}

interface IssuesTableProps {
  data: Issue[];
  title: string;
}

const IssuesTable = ({ data, title }: IssuesTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Проблема</TableHead>
              <TableHead className="text-right">Количество</TableHead>
              <TableHead>Влияние</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.issue}</TableCell>
                <TableCell className="text-right">{row.count}</TableCell>
                <TableCell>
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                      row.impact === "high"
                        ? "bg-red-100 text-red-800"
                        : row.impact === "medium"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {row.impact === "high"
                      ? "Высокое"
                      : row.impact === "medium"
                      ? "Среднее"
                      : "Низкое"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default IssuesTable;
