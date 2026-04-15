import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useLocation, useRoute } from "wouter";

interface PaymentVoucherProps {
  amount?: number;
  serviceName?: string;
  onSuccess?: () => void;
}

// Bancos disponibles en Ecuador
const ECUADOR_BANKS = [
  { id: "pichincha", name: "Banco Pichincha", account: "XXXX-XXXX-XXXX-1234" },
  { id: "guayaquil", name: "Banco Guayaquil", account: "XXXX-XXXX-XXXX-5678" },
  { id: "produbanco", name: "Produbanco", account: "XXXX-XXXX-XXXX-9012" },
  { id: "bancoazuay", name: "Banco del Azuay", account: "XXXX-XXXX-XXXX-3456" },
  { id: "bancomunicipal", name: "Banco Municipal", account: "XXXX-XXXX-XXXX-7890" },
];

export function PaymentVoucher({ amount = 0, serviceName = "Servicio", onSuccess }: PaymentVoucherProps) {
  const [selectedBank, setSelectedBank] = useState("");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState("");
  const [voucherTime, setVoucherTime] = useState("");
  const [notes, setNotes] = useState("");
  const [voucherImage, setVoucherImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [, setLocation] = useLocation();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Archivo muy grande",
          description: "El comprobante no puede exceder 5MB",
        });
        return;
      }
      setVoucherImage(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedBank || !voucherNumber || !voucherDate || !voucherTime) {
      toast({
        variant: "destructive",
        title: "Campos requeridos",
        description: "Por favor completa todos los campos del comprobante",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get auth token
      const token = localStorage.getItem("token");
      
      // Send voucher data to backend
      const response = await fetch("/api/payments/voucher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bank: selectedBank,
          voucherNumber,
          date: voucherDate,
          time: voucherTime,
          amount,
          serviceName,
          notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Error al enviar comprobante" }));
        throw new Error(error.message || "Error al enviar comprobante");
      }

      const result = await response.json();
      
      // Show success
      setIsVerified(true);
      toast({
        title: "Comprobante enviado",
        description: "Tu comprobante está siendo verificado. Te notificaremos cuando sea aprobado.",
      });

      if (onSuccess) {
        onSuccess();
      } else {
        setLocation("/dashboard");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Hubo un problema al enviar el comprobante. Intenta de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBankData = ECUADOR_BANKS.find(b => b.id === selectedBank);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card className="border-mango-orange/20 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-mango-orange/10 to-transparent">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-6 w-6 text-mango-orange" />
            Pago por Comprobante de Depósito
          </CardTitle>
          <CardDescription>
            Realiza tu pago mediante depósito o transferencia bancaria
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-6">
          {/* Información del servicio */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{serviceName}</p>
                <p className="text-sm text-muted-foreground">Servicio a pagar</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-mango-green">
                  ${amount.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Instrucciones de pago */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">📋 Instrucciones de Pago:</h4>
            <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
              <li>Selecciona el banco de tu preferencia</li>
              <li>Realiza el depósito o transferencia por el monto indicado</li>
              <li>Guarda el número de comprobante</li>
              <li>Completa los datos del formulario</li>
              <li>(Opcional) Sube una imagen del comprobante</li>
            </ol>
          </div>

          {/* Seleccionar banco */}
          <div className="space-y-2">
            <Label htmlFor="bank">Banco emisor *</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger id="bank">
                <SelectValue placeholder="Selecciona tu banco" />
              </SelectTrigger>
              <SelectContent>
                {ECUADOR_BANKS.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Número de cuenta para depósito */}
          {selectedBankData && (
            <div className="bg-mango-green/10 border border-mango-green/30 p-4 rounded-lg">
              <p className="text-sm font-medium text-mango-green mb-1">
                Número de cuenta {selectedBankData.name}:
              </p>
              <p className="text-xl font-mono tracking-wider">{selectedBankData.account}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Titular: GenFeb | RUC: 0999999999001
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Número de comprobante */}
            <div className="space-y-2">
              <Label htmlFor="voucherNumber">Número de comprobante *</Label>
              <Input
                id="voucherNumber"
                placeholder="Ej: 000123456"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
              />
            </div>

            {/* Fecha y hora */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="voucherDate">Fecha del depósito *</Label>
                <Input
                  id="voucherDate"
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voucherTime">Hora del depósito *</Label>
                <Input
                  id="voucherTime"
                  type="time"
                  value={voucherTime}
                  onChange={(e) => setVoucherTime(e.target.value)}
                />
              </div>
            </div>

            {/* Subir imagen del comprobante */}
            <div className="space-y-2">
              <Label>Comprobante (imagen - opcional)</Label>
              <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="voucherFile"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <label htmlFor="voucherFile" className="cursor-pointer">
                  {voucherImage ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-8 w-8 text-mango-green" />
                      <span className="font-medium">{voucherImage.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Click para subir comprobante
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG o PDF (máx 5MB)
                      </p>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Notas adicionales */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas adicionales (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Alguna observación sobre el pago..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Estado de verificación */}
            {isVerified && (
              <div className="bg-mango-green/10 border border-mango-green/30 p-4 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-mango-green" />
                <div>
                  <p className="font-medium text-mango-green">Comprobante verificado</p>
                  <p className="text-sm text-muted-foreground">
                    Tu pago ha sido confirmado. Puedes continuar usando el servicio.
                  </p>
                </div>
              </div>
            )}

            {/* Botón de envío */}
            <Button
              type="submit"
              className="w-full bg-mango-orange hover:bg-mango-orange/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando comprobante...
                </>
              ) : isVerified ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Pago Confirmado
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Enviar Comprobante
                </>
              )}
            </Button>
          </form>

          {/* Información de contacto para soporte */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>¿Necesitas ayuda? Contáctanos:</p>
            <p className="font-medium">📞 +593 99 123 4567 | 📧 soporte@genfeb.com</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PaymentVoucher;
