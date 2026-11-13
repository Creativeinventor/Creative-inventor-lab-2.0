import React, { useEffect, useState } from 'react';
import {
  Folder,
  FileCode,
  FileText,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
  Cpu,
  File as FileGeneric,
} from 'lucide-react';
import { resolveDriveThumbnailObjectUrl } from '../firebase/googleDrive';
import { getFileCategory } from '../utils/fileHelpers';

interface DriveThumbnailProps {
  fileName: string;
  mimeType: string;
  isFolder?: boolean;
  thumbnailLink?: string;
  downloadURL?: string;
  driveFileId?: string;
  driveAccountEmail?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export const DriveThumbnail: React.FC<DriveThumbnailProps> = ({
  fileName,
  mimeType,
  isFolder = false,
  thumbnailLink,
  downloadURL,
  driveFileId,
  driveAccountEmail,
  size = 'md',
  onClick,
}) => {
  const category = isFolder ? 'folder' : getFileCategory(fileName, mimeType);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImgFailed(false);

    if (isFolder) {
      setResolvedUrl(null);
      return;
    }

    if (driveFileId && driveAccountEmail && (thumbnailLink || category === 'image')) {
      resolveDriveThumbnailObjectUrl(driveFileId, driveAccountEmail, mimeType, thumbnailLink)
        .then((objUrl) => {
          if (active && objUrl) {
            setResolvedUrl(objUrl);
          }
        })
        .catch(() => {});
    } else {
      setResolvedUrl(null);
    }

    return () => {
      active = false;
    };
  }, [driveFileId, driveAccountEmail, mimeType, thumbnailLink, isFolder, category]);

  const directUrl =
    resolvedUrl ||
    thumbnailLink ||
    (!driveFileId && category === 'image' ? downloadURL : undefined);

  const dimClass =
    size === 'sm'
      ? 'w-9 h-9 rounded-lg'
      : size === 'lg'
      ? 'w-full h-36 rounded-xl'
      : 'w-12 h-12 rounded-xl';

  if (isFolder) {
    return (
      <div
        onClick={onClick}
        className={`${dimClass} bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 ${
          onClick ? 'cursor-pointer hover:bg-amber-500/20 transition' : ''
        }`}
      >
        <Folder
          className={`${
            size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-12 h-12' : 'w-6 h-6'
          } text-amber-400 fill-amber-400/20`}
        />
      </div>
    );
  }

  if (directUrl && !imgFailed) {
    return (
      <div
        onClick={onClick}
        className={`${dimClass} bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative group/img ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <img
          src={directUrl}
          alt={fileName}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-300"
        />
      </div>
    );
  }

  const getBadgeStyle = () => {
    switch (category) {
      case 'image':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'video':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'audio':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
      case 'code':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'hardware':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'archive':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      case 'document':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';

  const renderIcon = () => {
    switch (category) {
      case 'image':
        return <ImageIcon className={`${iconSize} text-emerald-400`} />;
      case 'video':
        return <Video className={`${iconSize} text-indigo-400`} />;
      case 'audio':
        return <Music className={`${iconSize} text-pink-400`} />;
      case 'code':
        return <FileCode className={`${iconSize} text-cyan-400`} />;
      case 'hardware':
        return <Cpu className={`${iconSize} text-amber-400`} />;
      case 'archive':
        return <FileArchive className={`${iconSize} text-violet-400`} />;
      case 'document':
        return <FileText className={`${iconSize} text-blue-400`} />;
      default:
        return <FileGeneric className={`${iconSize} text-slate-400`} />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`${dimClass} border flex items-center justify-center shrink-0 ${getBadgeStyle()} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      {renderIcon()}
    </div>
  );
};
