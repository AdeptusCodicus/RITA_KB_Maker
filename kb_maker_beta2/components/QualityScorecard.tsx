'use client';
import React from 'react';
import { QualityReport, QualityCheck } from '../types/kb';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

interface QualityScorecardProps {
  report: QualityReport | null;
  isLoading?: boolean;
}

export default function QualityScorecard({ report, isLoading }: QualityScorecardProps) {
  if (isLoading) {
    return (
      <div className="w-full animate-pulse flex flex-col space-y-4">
        <div className="h-48 bg-slate-200 rounded-xl"></div>
        <div className="h-24 bg-slate-200 rounded-xl"></div>
        <div className="h-24 bg-slate-200 rounded-xl"></div>
      </div>
    );
  }

  if (!report) return null;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const getStrokeColor = (score: number) => {
    if (score >= 75) return 'stroke-green-500';
    if (score >= 50) return 'stroke-yellow-500';
    return 'stroke-red-500';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'pass') return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === 'warn') return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    return <AlertCircle className="w-5 h-5 text-red-500" />;
  };

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (report.overall_score / 100) * circumference;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {!report.passed && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold">Quality Check Failed</h4>
            <p className="text-sm mt-1">This Knowledge Base does not meet the minimum quality standards. Please review the issues below.</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Overall Score</h3>
          <p className="text-sm text-slate-500 mt-1">Based on content structure and formatting</p>
        </div>
        <div className="relative flex items-center justify-center w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              className="text-slate-100 stroke-current"
              strokeWidth="8"
              cx="48"
              cy="48"
              r={radius}
              fill="transparent"
            />
            <circle
              className={`${getStrokeColor(report.overall_score)} transition-all duration-1000 ease-out`}
              strokeWidth="8"
              strokeLinecap="round"
              cx="48"
              cy="48"
              r={radius}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(report.overall_score)}`}>{report.grade}</span>
            <span className="text-xs text-slate-500">{report.overall_score}/100</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.checks.map((check: QualityCheck) => (
          <div key={check.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {getStatusIcon(check.status)}
                <h4 className="font-medium text-slate-800">{check.name}</h4>
              </div>
              <span className="text-sm font-semibold text-slate-600">{check.score}/{check.max}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
              <div 
                className={`h-1.5 rounded-full ${check.status === 'pass' ? 'bg-green-500' : check.status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${(check.score / check.max) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-slate-600">{check.notes}</p>
          </div>
        ))}
      </div>

      {report.suggestions.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <h4 className="font-semibold text-blue-900 mb-3">Suggestions for Improvement</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
            {report.suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
