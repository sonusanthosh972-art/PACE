/** SVG files are bundled by Metro as plain assets (not components); importing one yields its asset id. */
declare module '*.svg' {
  const asset: number;
  export default asset;
}
