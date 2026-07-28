/// <reference types="vite/client" />

// Build timestamp (ISO 8601), frozen in by Vite's `define` at build time.
// See the `define` block in vite.config.ts.
declare const __BUILD_DATE__: string;

// CSS Module type declarations
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}