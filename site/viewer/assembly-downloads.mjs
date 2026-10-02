/** Mount the prepared STEP assembly download for the selected Micron. */
export function mountAssemblyDownload(container, machineId, catalog, {baseUrl = document.baseURI} = {}) {
  const entry = catalog.machines.find(m => m.machine_id === machineId);
  container.replaceChildren();
  if (!entry) return false;
  const link = document.createElement('a');
  link.href = new URL(entry.step_zip.path, baseUrl).href;
  link.download = entry.step_zip.filename;
  link.textContent = `${entry.display_name} Assy STEP をダウンロード`;
  const details = document.createElement('p');
  details.textContent = `${entry.configuration} · ${entry.part_count.toLocaleString('ja-JP')}部品 · ZIP ${Math.ceil(entry.step_zip.bytes/1048576)} MB`;
  const source = document.createElement('a');
  source.href = entry.upstream_url;source.textContent = '元の設計・ライセンス';source.target = '_blank';source.rel = 'noopener';
  container.append(link, details, source);
  return true;
}
