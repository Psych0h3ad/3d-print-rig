import {validateElegooMetadata, validateElegooGLB} from './elegoo-contract.mjs';

export function assertElegooCurrent(signal, isCurrent = () => true) {
  if (signal?.aborted || !isCurrent()) throw new DOMException('Canceled', 'AbortError');
}

// Sequential transfers and a current-job check on both sides of non-abortable
// GLTF parsing. A canceled parse owns and releases its unattached scene.
export async function runElegooLoad(row, {signal, isCurrent, fetchAsset, parse,
  assemble, dispose, onProgress = () => {}}) {
  const current = () => assertElegooCurrent(signal, isCurrent);
  const json = bytes => JSON.parse(new TextDecoder().decode(bytes));
  let parsed, assembly;
  try {
    current();
    const manifest = json(await fetchAsset(row.files['assembly_manifest.json'], {signal}));
    current();
    const profile = json(await fetchAsset(row.files['machine_profile.json'], {signal}));
    current();
    const keys = validateElegooMetadata(row, manifest, profile);
    const bytes = await fetchAsset(row.files['model.glb'], {signal, onProgress: event => {
      current(); onProgress({phase: 'download', ...event});
    }});
    current();
    onProgress({phase: 'assembly'});
    validateElegooGLB(bytes, keys);
    current();
    parsed = await parse(bytes);
    current();
    assembly = assemble(parsed, manifest, profile);
    parsed = null;
    current();
    const result = assembly; assembly = null;
    return result;
  } finally {
    if (assembly) dispose(assembly.root);
    else if (parsed) dispose(parsed.scene);
  }
}

export function createElegooLoadQueue() {
  let serial = 0, controller, pending = Promise.resolve();
  return {
    cancel() { serial++; controller?.abort(); },
    start() {
      controller?.abort(); controller = new AbortController();
      const ticket = ++serial, signal = controller.signal;
      return {signal, current: () => ticket === serial && !signal.aborted};
    },
    run(job, operation) {
      const result = pending.then(() => job.current() ? operation() : false);
      pending = result.catch(() => {}); return result;
    },
  };
}
