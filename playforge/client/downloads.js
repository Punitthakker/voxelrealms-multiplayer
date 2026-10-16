// Plain browser downloads: E.Caps.downloads.save({filename, data: Blob}) -> Promise<{status: 'saved'}>.
export const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/octet-stream' });
    const name = String(filename || 'download').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120) || 'download';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { status: 'saved' };
  },
};
