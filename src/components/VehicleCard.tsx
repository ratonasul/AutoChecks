"use client";

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Vehicle } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { AssistedCheckModal } from '@/components/AssistedCheckModal'
import { AssistedCheckService } from '@/services/check/AssistedCheckService'
import { calculateReminderState } from '@/services/reminders/reminderEngine'
import { scheduleRuntimeExpiryReminders } from '@/services/reminders/runtimeReminderScheduler'
import { theme } from '@/lib/theme'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { canonicalPlate, normalizePlate, normalizeVin, validatePlate, validateVin } from '@/utils/validation'
import { hapticSuccess, hapticTap } from '@/utils/haptics'

interface VehicleCardProps {
  vehicle: Vehicle
  onCheckSave: () => void
}

export function VehicleCard({ vehicle, onCheckSave }: VehicleCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [checkType, setCheckType] = useState<'ITP' | 'RCA' | 'VIGNETTE' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editPlate, setEditPlate] = useState(vehicle.plate)
  const [editVin, setEditVin] = useState(vehicle.vin || '')
  const [editNotes, setEditNotes] = useState(vehicle.notes || '')

  useEffect(() => {
    setEditPlate(vehicle.plate)
    setEditVin(vehicle.vin || '')
    setEditNotes(vehicle.notes || '')
  }, [vehicle])

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

  const handleDelete = async () => {
    if (!vehicle.id) return
    if (!confirm(`Delete vehicle ${vehicle.plate}?`)) return

    const deletedAt = Date.now()
    await db.vehicles.update(vehicle.id, { deletedAt, updatedAt: deletedAt })
    hapticTap()
    toast('Vehicle moved to recycle bin', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.vehicles.update(vehicle.id!, { deletedAt: null, updatedAt: Date.now() })
          hapticSuccess()
        },
      },
    })
    onCheckSave()
  }

  const handleEditSave = async () => {
    if (!vehicle.id) return

    const normalizedPlate = normalizePlate(editPlate)
    const normalizedVin = normalizeVin(editVin)
    const plateError = validatePlate(normalizedPlate)
    if (plateError) {
      toast.error(plateError)
      return
    }
    const vinError = validateVin(normalizedVin)
    if (vinError) {
      toast.error(vinError)
      return
    }

    const vehicles = await db.vehicles.toArray()
    const duplicatePlate = vehicles.some(
      (item) => item.id !== vehicle.id && canonicalPlate(item.plate) === canonicalPlate(normalizedPlate)
    )
    if (duplicatePlate) {
      toast.error('Another vehicle already uses this license plate.')
      return
    }

    if (normalizedVin) {
      const duplicateVin = vehicles.some(
        (item) => item.id !== vehicle.id && normalizeVin(item.vin || '') === normalizedVin
      )
      if (duplicateVin) {
        toast.error('Another vehicle already uses this VIN.')
        return
      }
    }

    await db.vehicles.update(vehicle.id, {
      plate: normalizedPlate,
      vin: normalizedVin || undefined,
      notes: editNotes.trim() || undefined,
      updatedAt: Date.now(),
    })
    setEditOpen(false)
    hapticSuccess()
    toast('Vehicle updated')
    onCheckSave()
  }

  const handleSave = async (result: any) => {
    const service = new AssistedCheckService()
    await service.saveCheckResult(result)

    const notificationIdPrefix = `vehicle-${result.vehicleId}-${String(result.type).toLowerCase()}`
    const scheduledIds = await scheduleRuntimeExpiryReminders({
      expiryMillis: result.expiryMillis,
      notificationIdPrefix,
    })

    if (scheduledIds.length > 0) {
      toast(`${scheduledIds.length} reminder(s) scheduled`)
    }

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
                  <div className="text-xs text-muted-foreground">
                    Last changed: {new Date(vehicle.updatedAt || vehicle.createdAt).toLocaleString()}
                  </div>

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
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-semibold">{status.text}</div>
                              <Button size="sm" variant="outline" onClick={() => handleCheck('ITP')}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
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
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-semibold">{status.text}</div>
                              <Button size="sm" variant="outline" onClick={() => handleCheck('RCA')}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
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
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-semibold">{status.text}</div>
                              <Button size="sm" variant="outline" onClick={() => handleCheck('VIGNETTE')}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })()}
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button size="sm" onClick={() => handleCheck('ITP')} className="w-full min-h-[44px]">
                      <CheckCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check ITP</span>
                    </Button>
                    <Button size="sm" onClick={() => handleCheck('RCA')} className="w-full min-h-[44px]">
                      <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check RCA</span>
                    </Button>
                    <Button size="sm" onClick={() => handleCheck('VIGNETTE')} className="w-full min-h-[44px]">
                      <XCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Check Vignette</span>
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="min-h-[44px]">
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleDelete} className="min-h-[44px]">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">License Plate</label>
              <Input value={editPlate} onChange={(e) => setEditPlate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">VIN</label>
              <Input value={editVin} onChange={(e) => setEditVin(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleEditSave}>
                Save
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
