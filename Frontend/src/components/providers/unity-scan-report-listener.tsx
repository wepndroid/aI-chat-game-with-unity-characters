 'use client'
 
 import { apiPost } from '@/lib/api-client'
 import { useEffect } from 'react'
 
 type UnityScanReportMessage = {
   type: 'secretwaifu-webgl:scan-report'
   characterId: string
   report: {
     overall: 'passed' | 'flagged'
     issuesCount?: number
     summary?: string
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     details?: any
   }
 }
 
 const toSafeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
 
 const UnityScanReportListener = () => {
   useEffect(() => {
     const onMessage = (event: MessageEvent) => {
       const payload = event.data as Partial<UnityScanReportMessage> | null
       if (!payload || payload.type !== 'secretwaifu-webgl:scan-report') {
         return
       }
 
       const characterId = toSafeString(payload.characterId)
       const overall = payload.report?.overall
       if (!characterId || (overall !== 'passed' && overall !== 'flagged')) {
         return
       }
 
       const issuesCountRaw = payload.report?.issuesCount
       const issuesCount = typeof issuesCountRaw === 'number' && Number.isFinite(issuesCountRaw) ? Math.max(0, Math.floor(issuesCountRaw)) : 0
       const summaryCandidate = toSafeString(payload.report?.summary)
       const summary =
         summaryCandidate.length > 0
           ? summaryCandidate.slice(0, 240)
           : overall === 'passed'
             ? 'System scans passed'
             : `System flagged ${issuesCount} potential issues`
 
       // Fire-and-forget: admin UI will pick up reports when available.
       void apiPost(`/characters/${encodeURIComponent(characterId)}/system-scan-report`, {
         overall,
         issuesCount,
         summary,
         report: payload.report?.details ?? payload.report ?? null
       }).catch(() => {
         // Best-effort; ignore transient network failures.
       })
     }
 
     window.addEventListener('message', onMessage)
     return () => window.removeEventListener('message', onMessage)
   }, [])
 
   return null
 }
 
 export default UnityScanReportListener
 
