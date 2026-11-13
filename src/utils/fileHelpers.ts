import { FileCategory } from '../types';

export function formatFileSize(bytes: number): string {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot + 1).toUpperCase();
}

export function getFileCategory(filename: string, mimeType: string = ''): FileCategory {
  const ext = getFileExtension(filename).toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime === 'application/vnd.google-apps.folder') {
    return 'folder';
  }

  // Images
  if (
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext) ||
    mime.startsWith('image/')
  ) {
    return 'image';
  }

  // Videos
  if (
    ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v'].includes(ext) ||
    mime.startsWith('video/')
  ) {
    return 'video';
  }

  // Audio
  if (
    ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext) ||
    mime.startsWith('audio/')
  ) {
    return 'audio';
  }

  // Hardware / Firmware / Inventions
  if (['hex', 'bin', 'ino', 'gcode', 'stl', 'step', 'stp', 'pcb', 'sch'].includes(ext)) {
    return 'hardware';
  }

  // Code & Data
  if (
    ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'bash', 'sql', 'xml', 'yaml', 'yml', 'env', 'md'].includes(ext) ||
    mime === 'application/vnd.google-apps.script'
  ) {
    return 'code';
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) {
    return 'archive';
  }

  // Documents (including Google Docs / Sheets / Slides / Forms)
  if (
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'csv'].includes(ext) ||
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.includes('vnd.google-apps.')
  ) {
    return 'document';
  }

  return 'other';
}

export function formatDate(timestamp: any): string {
  if (!timestamp) return 'Just now';

  try {
    let date: Date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return 'Recently';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'Recently';
  }
}

export function isPreviewable(filename: string, mimeType: string = ''): boolean {
  const category = getFileCategory(filename, mimeType);
  const ext = getFileExtension(filename).toLowerCase();

  if (category === 'image' || category === 'video' || category === 'audio') return true;
  if (ext === 'pdf') return true;
  if (category === 'code' || ext === 'txt' || ext === 'json' || ext === 'md' || ext === 'csv' || ext === 'xml') return true;

  return false;
}

export async function triggerFileDownload(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.warn('Direct fetch download failed, falling back to window navigation:', error);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
