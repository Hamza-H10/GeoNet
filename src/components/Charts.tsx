// import React from 'react';
import ApexChart from 'react-apexcharts';
// import React, { Component } from "react";
// import Chart from "react-apexcharts";

// LineChart expects: { data: { labels: string[] | number[], datasets: { label: string, data: number[], borderColor?: string }[] } }
 function LineChart({ data }: { data: { labels: (string|number)[], datasets: { label: string, data: number[], borderColor?: string }[] } }) {
  const series = data.datasets.map(ds => ({ name: ds.label, data: ds.data }));
  const options = {
    chart: { type: "line" as const, toolbar: { show: false } },
    xaxis: { categories: data.labels },
    stroke: { curve: "smooth" as const },
    colors: data.datasets.map(ds => ds.borderColor || '#1976d2'),
    legend: { show: true },
  };
  return <ApexChart type="line" series={series} options={options} height={220} />;
}

// AreaChart expects same input and renders filled areas from baseline 0
 function AreaChart({ data, height = 220, yDecimals = 3 }: { data: { labels: (string|number)[], datasets: { label: string, data: number[], borderColor?: string }[] }, height?: number, yDecimals?: number }) {
  const series = data.datasets.map(ds => ({ name: ds.label, data: ds.data }));
  const options = {
    chart: { type: "area" as const, toolbar: { show: false } },
    xaxis: { categories: data.labels },
    stroke: { curve: "smooth" as const, width: 2 },
    fill: { type: 'gradient' as const, gradient: { opacityFrom: 0.35, opacityTo: 0.05 } },
   yaxis: { labels: { formatter: (val: number) => (Number.isFinite(val) ? val.toFixed(yDecimals) : String(val)) } },
    colors: data.datasets.map(ds => ds.borderColor || '#1976d2'),
    dataLabels: { enabled: false },
    legend: { show: true },
  };
  return <ApexChart type="area" series={series} options={options} height={height} />;
}

// DoughnutChart expects: { data: { labels: string[], datasets: [{ data: number[], backgroundColor?: string[] }] } }
 function DoughnutChart({ data }: { data: { labels: string[], datasets: { data: number[], backgroundColor?: string[] }[] } }) {
  const series = data.datasets[0]?.data || [];
  const options = {
    chart: { type: "donut" as const },
    labels: data.labels,
    colors: data.datasets[0]?.backgroundColor,
    legend: { show: true },
  };
  return <ApexChart type="donut" series={series} options={options} height={220} />;
}

export { LineChart, AreaChart, DoughnutChart };
export default { LineChart, AreaChart, DoughnutChart };