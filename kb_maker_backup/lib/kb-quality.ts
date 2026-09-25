import type { QualityReport, Grade } from '@/types/kb';

/**
 * Parse, validate, and mathematically normalize the quality report from AI evaluation.
 */
export function parseQualityReport(raw: string): QualityReport {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned) as QualityReport;

  if (!Array.isArray(parsed.checks) || parsed.checks.length === 0) {
    throw new Error('Invalid quality report: missing checks array');
  }

  // Calculate overall score mathematically from the individual checks sum
  let totalScore = 0;
  let maxScore = 0;

  for (const check of parsed.checks) {
    if (typeof check.score === 'number' && typeof check.max === 'number' && check.max > 0) {
      totalScore += check.score;
      maxScore += check.max;

      // Ensure status aligns with score ratio
      const ratio = check.score / check.max;
      if (ratio >= 0.8) {
        check.status = 'pass';
      } else if (ratio >= 0.5) {
        check.status = 'warn';
      } else {
        check.status = 'fail';
      }
    }
  }

  const calculatedOverallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  parsed.overall_score = calculatedOverallScore;

  // Determine grade based on mathematical score
  let grade: Grade = 'F';
  if (calculatedOverallScore >= 90) grade = 'A';
  else if (calculatedOverallScore >= 80) grade = 'B';
  else if (calculatedOverallScore >= 70) grade = 'C';
  else if (calculatedOverallScore >= 60) grade = 'D';

  parsed.grade = grade;
  parsed.passed = calculatedOverallScore >= 75;

  return parsed;
}
