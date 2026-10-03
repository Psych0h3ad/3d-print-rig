/** Mount the fixed standard assembly, independently of selected viewer Mods. */
export function mountAssemblyDownload(container, machineId, catalog, {baseUrl = document.baseURI} = {}) {
  const entry = (catalog.machines || catalog.defaults || []).find(m => (m.machine_id || m.id) === machineId && m.step_zip);
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
  const notice = document.createElement('p');
  notice.textContent = '標準構成・CAD基準姿勢の組立済みSTEPです。選択中のMod・配色は含みません。';
  container.append(link, details, notice, source);
  return true;
}
