// design-sync bundle entry — re-exports ONLY the scoped shared/ui primitives.
// This is the narrow --entry passed to package-build.mjs so esbuild bundles
// these 14 leaf components (and their sub-parts) instead of synthesizing an
// entry from the whole app (which would drag in yjs/webrtc/main.ts).
// The `@/` alias resolves via tsconfig paths (tsconfigPathsPlugin in bundle.mjs).
export * from '@/shared/ui/button';
export * from '@/shared/ui/dialog';
export * from '@/shared/ui/dropdown-menu';
export * from '@/shared/ui/popover';
export * from '@/shared/ui/select';
export * from '@/shared/ui/checkbox';
export * from '@/shared/ui/input';
export * from '@/shared/ui/tooltip';
export * from '@/shared/ui/scroll-area';
export * from '@/shared/ui/slider';
export * from '@/shared/ui/alert';
export * from '@/shared/ui/sonner';
export * from '@/shared/ui/HudIconButton';
export * from '@/shared/ui/FloatingPanel';
// Re-export sonner's imperative `toast()` so preview cards can fire toasts that
// reach the bundle's own <Toaster> (same sonner instance). Not a component —
// no card is generated for it.
export { toast } from 'sonner';
