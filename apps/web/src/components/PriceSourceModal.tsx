import * as Dialog from '@radix-ui/react-dialog';
import { X, ClipboardList, Car } from 'lucide-react';

export type PriceSource = 'model' | 'stock';

interface VehicleModelInfo {
  brand: string;
  model: string;
  variant?: string;
  year: number;
  price: number;
}

interface StockInfo {
  exteriorColor: string;
  vin: string;
  expectedSalePrice?: number;
}

interface PriceSourceModalProps {
  open: boolean;
  onClose: () => void;
  vehicleModel: VehicleModelInfo;
  stock: StockInfo;
  onSelect: (source: PriceSource) => void;
}

export function PriceSourceModal({
  open,
  onClose,
  vehicleModel,
  stock,
  onSelect,
}: PriceSourceModalProps) {
  const modelName = `${vehicleModel.brand} ${vehicleModel.model}${vehicleModel.variant ? ` ${vehicleModel.variant}` : ''} (${vehicleModel.year})`;

  const handleSelect = (source: PriceSource) => {
    onSelect(source);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              เลือกแหล่งข้อมูลราคา
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">
              กรุณาเลือกว่าต้องการใช้ราคาจากแหล่งข้อมูลใด
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vehicle Model Source */}
              <button
                type="button"
                onClick={() => handleSelect('model')}
                className="group flex flex-col rounded-lg border-2 border-gray-200 p-5 text-left transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">
                    ข้อมูลจากรุ่นรถ
                  </span>
                </div>

                <div className="space-y-1.5 text-sm flex-1">
                  <p className="text-gray-600">
                    <span className="text-gray-400">รุ่น:</span>{' '}
                    {modelName}
                  </p>
                  <p className="text-lg font-bold text-gray-900 group-hover:text-blue-700">
                    ฿{vehicleModel.price.toLocaleString()}
                  </p>
                </div>

                <div className="mt-4 w-full rounded-lg bg-blue-50 py-2 text-center text-sm font-medium text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  เลือกราคานี้
                </div>
              </button>

              {/* Stock Source */}
              <button
                type="button"
                onClick={() => handleSelect('stock')}
                className="group flex flex-col rounded-lg border-2 border-gray-200 p-5 text-left transition-all hover:border-green-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <Car className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-green-700">
                    ข้อมูลจาก Stock
                  </span>
                </div>

                <div className="space-y-1.5 text-sm flex-1">
                  <p className="text-gray-600">
                    <span className="text-gray-400">รุ่น:</span>{' '}
                    {modelName}
                  </p>
                  <p className="text-gray-600">
                    <span className="text-gray-400">สี:</span>{' '}
                    {stock.exteriorColor}
                  </p>
                  <p className="text-gray-600">
                    <span className="text-gray-400">VIN:</span>{' '}
                    {stock.vin.length > 12 ? `...${stock.vin.slice(-8)}` : stock.vin}
                  </p>
                  <p className="text-lg font-bold text-gray-900 group-hover:text-green-700">
                    {stock.expectedSalePrice != null
                      ? `฿${stock.expectedSalePrice.toLocaleString()}`
                      : 'ไม่ได้ระบุราคา'}
                  </p>
                </div>

                <div className="mt-4 w-full rounded-lg bg-green-50 py-2 text-center text-sm font-medium text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                  เลือกราคานี้
                </div>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
