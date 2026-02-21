"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseExpiryDate } from '@/utils/dateParser';
import { Vehicle } from '@/lib/db';
import { ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface AssistedCheckModalProps {
  vehicle: Vehicle;
  checkType: 'ITP' | 'RCA' | 'VIGNETTE';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (result: any) => void;
}

const urls = {
  ITP: 'https://prog.rarom.ro/rarpol/',
  RCA: 'https://aida.info.ro/polite-rca',
  VIGNETTE: 'https://www.erovinieta.ro/vgncheck/',
};

export function AssistedCheckModal({ vehicle, checkType, open, onOpenChange, onSave }: AssistedCheckModalProps) {
  const [expiryInput, setExpiryInput] = useState('');
  const [note, setNote] = useState('');

  const handleOpenSite = () => {
    window.open(urls[checkType], '_blank');
  };

  const handleCopyPlate = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(vehicle.plate);
      } else {
        const ta = document.createElement('textarea');
        ta.value = vehicle.plate;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success?.('Plate copied') ?? toast('Plate copied');
    } catch (err) {
      toast.error?.('Copy failed') ?? toast('Copy failed');
    }
  };

  const handleCopyVin = () => {
    if (!vehicle.vin) {
      toast.error?.('No VIN available') ?? toast('No VIN available');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(vehicle.vin);
      } else {
        const ta = document.createElement('textarea');
        ta.value = vehicle.vin;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success?.('VIN copied') ?? toast('VIN copied');
    } catch (err) {
      toast.error?.('Copy failed') ?? toast('Copy failed');
    }
  };

  const handleSave = () => {
    const parsed = parseExpiryDate(expiryInput);
    if (!parsed) return; // Invalid date

    const result = {
      vehicleId: vehicle.id!,
      type: checkType,
      status: parsed.expiryMillis > Date.now() ? 'OK' : 'FAIL',
      expiryDateISO: parsed.expiryDateISO,
      expiryMillis: parsed.expiryMillis,
      sourceUrl: urls[checkType],
      checkedAt: Date.now(),
      note: note || 'Assisted manual check',
    };

    onSave(result);
    onOpenChange(false);
    setExpiryInput('');
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Assisted Check - {checkType}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Step 1: Click "Open Website" to visit the official site.<br />
            Step 2: Use "Copy Plate" and paste into the site.<br />
            Step 3: Enter the expiry date below (dd/mm/yyyy).<br />
            Step 4: Click Save.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleOpenSite} className="w-full sm:w-auto">
              <ExternalLink className="mr-2 h-4 w-4" /> Open Website
            </Button>
            <Button variant="outline" onClick={handleCopyPlate} className="w-full sm:w-auto">
              <Copy className="mr-2 h-4 w-4" /> Copy Plate
            </Button>
            {vehicle.vin && (
              <Button variant="outline" onClick={handleCopyVin} className="w-full sm:w-auto">
                <Copy className="mr-2 h-4 w-4" /> Copy VIN
              </Button>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expiry Date (dd/mm/yyyy)</label>
            <Input
              value={expiryInput}
              onChange={(e) => setExpiryInput(e.target.value)}
              placeholder="01/01/2025"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Note (optional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Additional note"
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}