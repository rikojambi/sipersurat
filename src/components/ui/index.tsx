import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      default: 'bg-blue-800 text-white hover:bg-blue-700 shadow-sm',
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
      outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      ghost: 'text-slate-600 hover:bg-slate-100',
      danger: 'bg-red-600 text-white hover:bg-red-700'
    },
    size: { default: 'h-10 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-12 px-6 text-base', icon: 'h-9 w-9' }
  },
  defaultVariants: { variant: 'default', size: 'default' }
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) =>
  <input ref={ref} className={cn('flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50', className)} {...props} />
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) =>
  <textarea ref={ref} className={cn('flex min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100', className)} {...props} />
);
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) =>
  <LabelPrimitive.Root ref={ref} className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)} {...props} />
);
Label.displayName = 'Label';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-slate-100 px-5 py-4', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-bold text-slate-900', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-blue-100 text-blue-800',
      success: 'bg-emerald-100 text-emerald-700',
      warning: 'bg-amber-100 text-amber-800',
      danger: 'bg-red-100 text-red-700',
      muted: 'bg-slate-100 text-slate-600'
    }
  },
  defaultVariants: { variant: 'default' }
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm animate-fade-in" />
      <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl animate-fade-in', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup">
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('mb-4 space-y-1 pr-8', className)} {...props} />; }
export const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({ className, ...props }, ref) =>
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-bold text-slate-900', className)} {...props} />
);
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({ className, ...props }, ref) =>
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />
);
DialogDescription.displayName = 'DialogDescription';
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('mt-6 flex flex-wrap justify-end gap-2', className)} {...props} />; }

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({ className, children, ...props }, ref) =>
  <SelectPrimitive.Trigger ref={ref} className={cn('flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-blue-100', className)} {...props}>
    {children}<SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);
SelectTrigger.displayName = 'SelectTrigger';
export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(({ className, children, position = 'popper', ...props }, ref) =>
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content ref={ref} position={position} className={cn('z-[60] max-h-72 min-w-[8rem] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl', className)} {...props}>
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);
SelectContent.displayName = 'SelectContent';
export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({ className, children, ...props }, ref) =>
  <SelectPrimitive.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none focus:bg-blue-50 data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-4 w-4 text-blue-700" /></SelectPrimitive.ItemIndicator></span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);
SelectItem.displayName = 'SelectItem';

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) =>
  <TabsPrimitive.List ref={ref} className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1', className)} {...props} />
);
TabsList.displayName = 'TabsList';
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) =>
  <TabsPrimitive.Trigger ref={ref} className={cn('rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-blue-800 data-[state=active]:shadow-sm', className)} {...props} />
);
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) =>
  <TabsPrimitive.Content ref={ref} className={cn('mt-4', className)} {...props} />
);
TabsContent.displayName = 'TabsContent';

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) =>
  <SwitchPrimitive.Root ref={ref} className={cn('peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-slate-300 transition-colors data-[state=checked]:bg-blue-700', className)} {...props}>
    <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
  </SwitchPrimitive.Root>
);
Switch.displayName = 'Switch';

export interface Column<T> { key: string; label: string; render?: (row: T) => React.ReactNode; className?: string }
export function DataTable<T extends { id: string }>({ columns, rows, searchKeys = [], pageSize = 10, empty = 'Tidak ada data.' }: {
  columns: Column<T>[]; rows: T[]; searchKeys?: string[]; pageSize?: number; empty?: string;
}) {
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => searchKeys.some((k) => String((r as Record<string, unknown>)[k] ?? '').toLowerCase().includes(q)));
  }, [rows, query, searchKeys]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div>
      {searchKeys.length > 0 && (
        <div className="relative mb-3 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Cari data..." className="pl-9" />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{columns.map((c) => <th key={c.key} className={cn('px-3 py-2.5 font-semibold', c.className)}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                {columns.map((c) => <td key={c.key} className={cn('px-3 py-2.5 align-top text-slate-700', c.className)}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '-')}</td>)}
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{filtered.length} data · halaman {current}/{totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Sebelumnya</Button>
          <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Berikutnya</Button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div><Label>{label}</Label>{children}{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
    <p className="font-semibold text-slate-700">{title}</p>
    {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
  </div>;
}
