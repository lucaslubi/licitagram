/**
 * 📊 Daily Healing Report — re-exports from ai-healing.processor.ts
 *
 * The report generation logic is integrated into the main ai-healing processor
 * to avoid two workers competing for the same queue.
 *
 * The daily report is triggered by adding a job named 'daily-report' to the
 * ai-healing queue with a cron schedule (09:00 UTC / 06:00 BRT).
 *
 * This file exists only for documentation — the actual implementation is in
 * ai-healing.processor.ts which routes by job.name.
 */
export { aiHealingWorker } from './ai-healing.processor'
