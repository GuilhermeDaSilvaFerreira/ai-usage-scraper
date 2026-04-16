const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = ((chunk: any, ...args: any[]) => {
  if (typeof chunk === 'string' && chunk.includes('[Nest]')) return true;
  return origStdoutWrite(chunk, ...args);
}) as any;

process.stderr.write = ((chunk: any, ...args: any[]) => {
  if (typeof chunk === 'string' && chunk.includes('[Nest]')) return true;
  return origStderrWrite(chunk, ...args);
}) as any;
