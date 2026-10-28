// QPDF rewrites PDF objects and Flate streams without rendering pages or
// changing any image into JPEG. The original PDF is kept separately in R2.
export async function optimizePdfStructure(source: Uint8Array) {
  const { default: createQpdf } = await import('@neslinesli93/qpdf-wasm');
  const qpdf = await createQpdf({ locateFile: () => '/qpdf.wasm' });
  const fs = qpdf.FS as typeof qpdf.FS & {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  const suffix = crypto.randomUUID();
  const input = `/input-${suffix}.pdf`;
  const output = `/output-${suffix}.pdf`;
  try {
    fs.writeFile(input, source);
    const status = qpdf.callMain([
      '--object-streams=generate',
      '--recompress-flate',
      '--compression-level=9',
      input,
      output,
    ]);
    if (status !== 0) throw new Error('PDF structure optimization failed.');
    return new Uint8Array(fs.readFile(output));
  } finally {
    try { fs.unlink(input); } catch { /* QPDF may have rejected the input. */ }
    try { fs.unlink(output); } catch { /* No output was produced. */ }
  }
}
