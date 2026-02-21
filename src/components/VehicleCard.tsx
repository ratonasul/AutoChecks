"use client";

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Vehicle } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { AssistedCheckModal } from '@/components/AssistedCheckModal'
import { AssistedCheckService } from '@/services/check/AssistedCheckService'
import { calculateReminderState } from '@/services/reminders/reminderEngine'
import { theme } from '@/lib/theme'
import { toast } from 'sonner'

interface VehicleCardProps {
  vehicle: Vehicle
  onCheckSave: () => void
}

export function VehicleCard({ vehicle, onCheckSave }: VehicleCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [checkType, setCheckType] = useState<'ITP' | 'RCA' | 'VIGNETTE' | null>(null)

  const getOverallStatus = () => {
    const itp = calculateReminderState(vehicle.itpExpiryMillis ?? null)
    const rca = calculateReminderState(vehicle.rcaExpiryMillis ?? null)
    const vignette = calculateReminderState(vehicle.vignetteExpiryMillis ?? null)

    // Check if any is expired
    if (itp.daysLeft < 0 || rca.daysLeft < 0 || vignette.daysLeft < 0) {
      return { text: 'Expired', color: theme.status.expired }
    }

    // Check if any is urgent/critical
    if (itp.urgency === 'critical' || rca.urgency === 'critical' || vignette.urgency === 'critical') {
      return { text: 'Soon', color: theme.status.critical }
    }

    // Check if any is warning
    if (itp.urgency === 'warning' || rca.urgency === 'warning' || vignette.urgency === 'warning') {
      return { text: 'Soon', color: theme.status.warning }
    }

    return { text: 'Safe', color: theme.status.safe }
  }

  const getCheckStatus = (expiryMillis: number | null | undefined) => {
    const state = calculateReminderState(expiryMillis ?? null)

    if (!expiryMillis || state.daysLeft === Infinity) {
      return { text: 'Not set', color: theme.status.expired, date: null }
    }

    if (state.daysLeft < 0) {
      return { text: 'Expired', color: theme.status.expired, date: expiryMillis }
    }

    if (state.urgency === 'critical') {
      return { text: 'Urgent', color: theme.status.critical, date: expiryMillis }
    }

    if (state.urgency === 'warning') {
      return { text: 'Soon', color: theme.status.warning, date: expiryMillis }
    }

    return { text: 'Safe', color: theme.status.safe, date: expiryMillis }
  }

  const handleCheck = (type: 'ITP' | 'RCA' | 'VIGNETTE') => {
    setCheckType(type)
    setModalOpen(true)
  }

  const handleSave = async (result: any) => {
    const service = new AssistedCheckService()
    await service.saveCheckResult(result)
    onCheckSave()
    toast('Check saved successfully')
  }

  const overallStatus = getOverallStatus()

  return (
    <>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left flex items-center justify-between gap-2 hover:opacity-80 transition"
          >
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold truncate">{vehicle.plate}</div>
            </div>
            <div className={`inline-flex items-center px-3 py-1 text-sm font-medium border rounded ${overallStatus.color} flex-shrink-0`}>
              {overallStatus.text}
            </div>
            {expanded ? <ChevronUp className="h-5 w-5 flex-shrink-0" /> : <ChevronDown className="h-5 w-5 flex-shrink-0" />}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-4 space-y-4 border-t pt-4">
                  {vehicle.vin && (
                    <div className="text-sm text-slate-500">
                      <span className="font-medium">VIN:</span> {vehicle.vin}
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* ITP */}
                    {(() => {
                      const status = getCheckStatus(vehicle.itpExpiryMillis)
                      return (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ delay: 0.1 }}
                        >
                          <div className={`flex items-start justify-between p-2 rounded border ${status.color}`}>
                            <div className="flex-1">
                              <div className="font-medium text-sm">ITP</div>
                              <div className={`text-xs mt-1 ${status.date ? 'text-slate-600' : 'text-slate-500'}`}>
                                {status.date ? new Date(status.date).toLocaleDateString() : 'Not set'}
                              </div>
                            </div>
                            <div className="text-xs font-semibold">{status.text}</div>
                          </div>
                        </motion.div>
                      )
                    })()}

                    {/* RCA */}
                    {(() => {
                      const status = getCheckStatus(vehicle.rcaExpiryMillis)
                      return (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ delay: 0.15 }}
                        >
                          <div className={`flex items-start justify-between p-2 rounded border ${status.color}`}>
                            <div className="flex-1">
                              <div className="font-medium text-sm">RCA</div>
                              <div className={`text-xs mt-1 ${status.date ? 'text-slate-600' : 'text-slate-500'}`}>
                                {status.date ? new Date(status.date).toLocaleDateString() : 'Not set'}
                              </div>
                            </div>
                            <div className="text-xs font-semibold">{status.text}</div>
                          </div>
                        </motion.div>
                      )
                    })()}

                    {/* VIGNETTE */}
                    {(() => {
                      const status = getCheckStatus(vehicle.vignetteExpiryMillis)
                      return (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ delay: 0.2 }}
                        >
                          <div className={`flex items-start justify-between p-2 rounded border ${status.color}`}>
                            <div className="flex-1">
                              <div className="font-medium text-sm">Vignette</div>
                              <div className={`text-xs mt-1 ${status.date ? 'text-slate-600' : 'text-slate-500'}`}>
                                {status.date ? new Date(status.date).toLocaleDateString() : 'Not set'}
                              </div>
                            </div>
                            <div className="text-xs font-semibold">{status.text}</div>
                          </div>
                        </motion.div>
                      )
                    })()}
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button size="sm" onClick={() => handleCheck('ITP')} className="w-full">
                      <CheckCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check ITP</span>
                    </Button>
                    <Button size="sm" onClick={() => handleCheck('RCA')} className="w-full">
                      <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check RCA</span>
                    </Button>
                    <Button size="sm" onClick={() => handleCheck('VIGNETTE')} className="w-full">
                      <XCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check Vignette</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {checkType && (
        <AssistedCheckModal vehicle={vehicle} checkType={checkType} open={modalOpen} onOpenChange={setModalOpen} onSave={handleSave} />
      )}
    </>
  )
}
